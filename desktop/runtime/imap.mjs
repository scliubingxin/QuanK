// [p3-m3] Read-only IMAP client: LOGIN → ID → EXAMINE INBOX (read-only) → UID SEARCH → UID FETCH with BODY.PEEK.
// Never issues SELECT, STORE, COPY, MOVE, EXPUNGE or APPEND, so syncing cannot change the mailbox (not even \Seen).
import { createHash } from 'node:crypto';
import { Conn, defaultConnect } from './netconn.mjs';
import { parseHeaders, headerText, decodeWords, parseAddress, bodySnippet } from './mime.mjs';

const DAY = 864e5, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const imapDate = ms => { const d = new Date(ms); return `${d.getUTCDate()}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}`; };
const HEADER_FIELDS = 'FROM TO SUBJECT DATE MESSAGE-ID CONTENT-TYPE CONTENT-TRANSFER-ENCODING';

/** One logical response; literals {n} are cut out into `lits` and marked \0L<i>\0 in `line`. */
export function imapResponse(buf) {
  let pos = 0, line = '';
  const lits = [];
  for (;;) {
    const i = buf.indexOf('\r\n', pos);
    if (i < 0) return null;
    const part = buf.subarray(pos, i).toString('utf8'), m = /\{(\d+)\}$/.exec(part);
    if (!m) return {value: {line: line + part, lits}, used: i + 2};
    const n = Number(m[1]);
    if (buf.length < i + 2 + n) return null;
    lits.push(buf.subarray(i + 2, i + 2 + n));
    line += part.slice(0, -m[0].length) + `\u0000L${lits.length - 1}\u0000`;
    pos = i + 2 + n;
  }
}
export function quote(s) {
  const v = String(s ?? '');
  if (/[\r\n\0]/.test(v)) throw new Error('账号或密码包含不支持的字符');
  if (/[^\x20-\x7e]/.test(v)) throw new Error('授权码只能包含英文字母、数字和符号');
  return '"' + v.replace(/[\\"]/g, '\\$&') + '"';
}
function literal(line, lits, re) {
  const m = re.exec(line);
  if (!m) return Buffer.alloc(0);
  return m[1] !== undefined ? lits[Number(m[1])] : Buffer.from((m[2] || '').replace(/\\(.)/g, '$1'), 'utf8');
}
export function parseFetch({line, lits}) {
  const uid = Number(/\bUID (\d+)/.exec(line)?.[1]);
  if (!uid) return null;
  const flags = /\bFLAGS \(([^)]*)\)/.exec(line)?.[1] || '';
  const internal = Date.parse((/INTERNALDATE "([^"]+)"/.exec(line)?.[1] || '').replace(/^(\d{1,2})-(\w{3})-(\d{4})/, '$1 $2 $3'));
  const hBuf = literal(line, lits, /BODY\[HEADER[^\]]*\]\s*(?:\u0000L(\d+)\u0000|"((?:[^"\\]|\\.)*)")/);
  const tBuf = literal(line, lits, /BODY\[TEXT\](?:<\d+>)?\s*(?:\u0000L(\d+)\u0000|"((?:[^"\\]|\\.)*)")/);
  const h = parseHeaders(headerText(hBuf)), from = parseAddress(h.from);
  const date = Date.parse(String(h.date || '').replace(/\s*\([^)]*\)\s*$/, ''));
  const subject = decodeWords(h.subject || '').replace(/\s+/g, ' ').trim();
  const messageId = (/<[^<>\s]+>/.exec(h['message-id'] || '')?.[0] || '').slice(0, 250);
  const time = Number.isFinite(date) ? date : Number.isFinite(internal) ? internal : null;
  return {uid, unread: !/\\Seen/i.test(flags), subject, from, time, messageId,
    key: messageId ? 'mid:' + messageId : 'h:' + createHash('sha256').update(`${h.date}|${h.from}|${h.subject}`).digest('hex').slice(0, 32),
    snippet: bodySnippet(h, tBuf)};
}

export async function fetchMail({host, port = 993, user, pass, days = 7, state = null, limit = 100, connect = defaultConnect, signal, timeoutMs = 20000, now = Date.now}) {
  const conn = new Conn(await connect({host, port, tls: true}), {timeoutMs, signal});
  let n = 0;
  const command = async cmd => {
    const tag = 'W' + (++n);
    conn.write(`${tag} ${cmd}\r\n`);
    const untagged = [];
    for (;;) {
      const r = await conn.read(imapResponse);
      if (r.line.startsWith(tag + ' ')) {
        const status = r.line.slice(tag.length + 1);
        if (!/^OK\b/i.test(status)) throw Object.assign(new Error(status.replace(/^(NO|BAD)\s*/i, '').replace(/^\[[^\]]*\]\s*/, '').slice(0, 200) || status), {imap: status});
        return untagged;
      }
      untagged.push(r);
    }
  };
  try {
    const greeting = await conn.read(imapResponse);
    if (!/^\* (OK|PREAUTH)\b/i.test(greeting.line)) throw new Error('不是 IMAP 服务器：' + greeting.line.slice(0, 80));
    try { await command(`LOGIN ${quote(user)} ${quote(pass)}`); }
    catch (e) { throw new Error(`登录失败：账号或授权码不正确（QQ、163 等需使用邮箱设置里生成的「授权码」，并开启 IMAP 服务）。服务器说：${e.message}`); }
    try { await command('ID ("name" "QuankSight" "version" "0.42" "vendor" "QuankSight")'); } catch {} // 163/126 refuse EXAMINE without ID
    const ex = await command('EXAMINE INBOX');
    const uidvalidity = Number(ex.map(r => /\[UIDVALIDITY (\d+)\]/i.exec(r.line)?.[1]).find(Boolean) || 0);
    const same = state && state.uidvalidity === uidvalidity && state.lastUid > 0;
    const search = await command(same ? `UID SEARCH UID ${state.lastUid + 1}:*` : `UID SEARCH SINCE ${imapDate(now() - days * DAY)}`);
    const floor = same ? state.lastUid : 0;
    const uids = [...new Set(search.filter(r => /^\* SEARCH\b/i.test(r.line)).flatMap(r => r.line.slice(8).trim().split(/\s+/)).map(Number))]
      .filter(u => Number.isInteger(u) && u > floor).sort((a, b) => a - b).slice(-limit);
    const messages = [];
    if (uids.length) {
      const fetched = await command(`UID FETCH ${uids.join(',')} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (${HEADER_FIELDS})] BODY.PEEK[TEXT]<0.4096>)`);
      for (const r of fetched) if (/^\* \d+ FETCH\b/i.test(r.line)) { const m = parseFetch(r); if (m) messages.push(m); }
    }
    try { await command('LOGOUT'); } catch {}
    return {uidvalidity, lastUid: Math.max(floor, ...uids, 0), messages};
  } finally { conn.close(); }
}
