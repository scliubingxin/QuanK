// [p3-m3] MIME helpers: RFC 2047 encoded words, headers, addresses, a best-effort plain-text snippet from a (possibly truncated) body.
import { plainText } from './feed-parse.mjs';

export function charsetOf(name) {
  const c = String(name || 'utf-8').trim().toLowerCase().replace(/^"|"$/g, '');
  return c === 'gb2312' || c === 'x-gbk' || c === 'cp936' ? 'gbk' : c === 'utf8' ? 'utf-8' : c === 'us-ascii' || c === 'ascii' ? 'utf-8' : c;
}
export function decodeBytes(buf, charset = 'utf-8') {
  try { return new TextDecoder(charsetOf(charset)).decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}
function qBytes(s, underscore) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '=' && /^[0-9a-f]{2}$/i.test(s.slice(i + 1, i + 3))) { out.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
    else if (ch === '_' && underscore) out.push(32);
    else out.push(s.charCodeAt(i) & 0xff);
  }
  return Buffer.from(out);
}
/** Decodes =?charset?B|Q?...?= words; adjacent words of the same charset are joined at the byte level. */
export function decodeWords(s) {
  const re = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g, out = [];
  let last = 0, m, run = null;
  const flush = () => { if (run) { out.push(decodeBytes(Buffer.concat(run.parts), run.cs)); run = null; } };
  while ((m = re.exec(s))) {
    const between = s.slice(last, m.index);
    if (!run || !/^\s*$/.test(between)) { flush(); if (between) out.push(between); }
    const cs = charsetOf(m[1].split('*')[0]);
    const bytes = /b/i.test(m[2]) ? Buffer.from(m[3], 'base64') : qBytes(m[3], true);
    if (run && run.cs === cs) run.parts.push(bytes); else { flush(); run = {cs, parts: [bytes]}; }
    last = re.lastIndex;
  }
  flush();
  out.push(s.slice(last));
  return out.join('');
}
/** Header block (string) -> {lower-case name: value}; first occurrence wins. */
export function parseHeaders(text) {
  const h = {};
  for (const line of String(text || '').replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) { const k = line.slice(0, i).trim().toLowerCase(); if (!(k in h)) h[k] = line.slice(i + 1).trim(); }
  }
  return h;
}
/** Raw header bytes: UTF-8 when valid, otherwise GB18030 (common for unencoded Chinese headers). */
export function headerText(buf) {
  try { return new TextDecoder('utf-8', {fatal: true}).decode(buf); } catch { return new TextDecoder('gb18030').decode(buf); }
}
export function parseAddress(value) {
  const s = decodeWords(String(value || '')).trim();
  const m = /^(.*?)<([^<>\s]+@[^<>\s]+)>/.exec(s);
  if (m) return {name: m[1].trim().replace(/^"(.*)"$/, '$1').replace(/\\(.)/g, '$1').trim(), email: m[2].trim()};
  const e = /[^\s<>"(),;]+@[^\s<>"(),;]+/.exec(s);
  return {name: '', email: e ? e[0] : s.slice(0, 120)};
}
const param = (ct, name) => new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(String(ct || ''))?.slice(1).find(Boolean) || '';
export function decodeBody(buf, cte, contentType) {
  const enc = String(cte || '').trim().toLowerCase();
  let bytes = buf;
  if (enc === 'base64') { let s = buf.toString('latin1').replace(/[^A-Za-z0-9+/]/g, ''); if (s.length % 4 === 1) s = s.slice(0, -1); bytes = Buffer.from(s, 'base64'); } // unpadded / truncated input is fine; a lone trailing char is not
  else if (enc === 'quoted-printable') bytes = qBytes(buf.toString('latin1').replace(/=\r?\n/g, ''), false);
  return decodeBytes(bytes, param(contentType, 'charset') || 'utf-8').replace(/\uFFFD+$/, '');
}
function partText(contentType, cte, buf, depth = 0) {
  const ct = String(contentType || 'text/plain').toLowerCase();
  if (ct.startsWith('multipart/')) {
    const boundary = param(contentType, 'boundary');
    if (!boundary || depth > 3) return '';
    let html = '';
    for (let p of buf.toString('latin1').split('--' + boundary).slice(1)) {
      if (p.startsWith('--')) break;
      p = p.replace(/^[^\r\n]*\r?\n/, '');
      const sep = /\r?\n\r?\n/.exec(p), head = sep ? p.slice(0, sep.index) : p, body = sep ? p.slice(sep.index + sep[0].length) : '';
      const h = parseHeaders(head), pct = h['content-type'] || 'text/plain', bytes = Buffer.from(body, 'latin1');
      if (/^multipart\//i.test(pct)) { const t = partText(pct, h['content-transfer-encoding'], bytes, depth + 1); if (t) return t; continue; }
      if (/attachment/i.test(h['content-disposition'] || '')) continue;
      if (/^text\/plain/i.test(pct)) { const t = decodeBody(bytes, h['content-transfer-encoding'], pct).trim(); if (t) return t; }
      else if (/^text\/html/i.test(pct) && !html) html = plainText(decodeBody(bytes, h['content-transfer-encoding'], pct));
    }
    return html;
  }
  if (ct.startsWith('text/html')) return plainText(decodeBody(buf, cte, contentType));
  if (ct.startsWith('text/')) return decodeBody(buf, cte, contentType);
  return '';
}
/** Readable snippet: quoted replies and signatures dropped, whitespace collapsed. */
export function bodySnippet(headers, body, max = 300) {
  const text = partText(headers['content-type'], headers['content-transfer-encoding'], Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''), 'utf8'));
  return text.split(/\r?\n/).filter(l => !/^\s*>/.test(l)).join('\n').split(/\n-- ?\n/)[0].replace(/\s+/g, ' ').trim().slice(0, max);
}
/** RFC 2047 header value, folded into ≤45-byte UTF-8 words. ASCII passes through. CR/LF never survive. */
export function encodeHeader(s) {
  const v = String(s || '').replace(/[\r\n]+/g, ' ');
  if (/^[\x20-\x7e]*$/.test(v)) return v;
  const words = [];
  let cur = '';
  for (const ch of v) { if (Buffer.byteLength(cur + ch) > 45) { words.push(cur); cur = ''; } cur += ch; }
  if (cur) words.push(cur);
  return words.map(w => `=?UTF-8?B?${Buffer.from(w).toString('base64')}?=`).join('\r\n ');
}
