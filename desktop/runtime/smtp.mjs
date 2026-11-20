// [p3-m3] SMTP submission: implicit TLS (465) or mandatory STARTTLS (587). Never authenticates over plaintext.
import { randomUUID } from 'node:crypto';
import { Conn, defaultConnect, defaultUpgrade } from './netconn.mjs';
import { encodeHeader } from './mime.mjs';

const b64 = s => Buffer.from(s, 'utf8').toString('base64');
export function smtpResponse(buf) {
  let pos = 0;
  const lines = [];
  for (;;) {
    const i = buf.indexOf('\r\n', pos);
    if (i < 0) return null;
    const l = buf.subarray(pos, i).toString('utf8');
    pos = i + 2; lines.push(l);
    if (!/^\d{3}-/.test(l)) return {value: {code: Number(l.slice(0, 3)) || 0, text: lines.map(x => x.slice(4)).join('\n')}, used: pos};
  }
}
const ADDR = /^[^\s@<>"(),;:\\]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
export function buildMessage({from, to, subject, text, now = Date.now, id = randomUUID()}) {
  const body = b64(String(text || '').replace(/\r?\n/g, '\r\n')).replace(/.{1,76}/g, '$&\r\n');
  const domain = from.split('@')[1] || 'quank.local';
  return [`From: ${from}`, `To: ${to.join(', ')}`, `Subject: ${encodeHeader(subject)}`, `Date: ${new Date(now()).toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${id}@${domain}>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', 'X-Mailer: QuanK', '', body].join('\r\n');
}

export async function smtpSend({host, port = 465, security = port === 465 ? 'tls' : 'starttls', user, pass, from, to, subject, text,
  connect = defaultConnect, upgrade = defaultUpgrade(host), signal, timeoutMs = 30000, now = Date.now}) {
  for (const a of [from, ...to]) if (!ADDR.test(a)) throw new Error('邮件地址不正确：' + String(a).slice(0, 80));
  if (/[\r\n\0]/.test(user + pass)) throw new Error('账号或密码包含不支持的字符');
  const conn = new Conn(await connect({host, port, tls: security === 'tls'}), {timeoutMs, signal});
  const expect = async (codes, what) => {
    const r = await conn.read(smtpResponse);
    if (!codes.includes(r.code)) throw new Error(r.code === 535 || (what === '登录' && r.code >= 500) ? '登录失败：账号或授权码不正确' : `${what}失败：${r.code} ${r.text.slice(0, 200)}`);
    return r;
  };
  const send = (line, codes, what) => { conn.write(line + '\r\n'); return expect(codes, what); };
  try {
    await expect([220], '连接邮件服务器');
    let ehlo = await send('EHLO quank.local', [250], '握手');
    if (security !== 'tls') {
      if (!/^STARTTLS\b/im.test(ehlo.text)) throw new Error('服务器不支持加密连接，已停止发送');
      await send('STARTTLS', [220], '启用加密');
      conn.upgrade(upgrade);
      ehlo = await send('EHLO quank.local', [250], '握手');
    }
    const auth = (/^AUTH[ =](.*)$/im.exec(ehlo.text)?.[1] || '').toUpperCase();
    if (/\bPLAIN\b/.test(auth)) await send('AUTH PLAIN ' + b64(`\0${user}\0${pass}`), [235], '登录');
    else if (/\bLOGIN\b/.test(auth)) { await send('AUTH LOGIN', [334], '登录'); await send(b64(user), [334], '登录'); await send(b64(pass), [235], '登录'); }
    else throw new Error('服务器不支持密码登录');
    await send(`MAIL FROM:<${from}>`, [250], '设置发件人');
    for (const r of to) await send(`RCPT TO:<${r}>`, [250, 251], '收件人 ' + r);
    await send('DATA', [354], '发送正文');
    const data = buildMessage({from, to, subject, text, now}).replace(/(^|\r\n)\./g, '$1..');
    conn.write(data + '\r\n.\r\n');
    await expect([250], '发送');
    try { conn.write('QUIT\r\n'); await expect([221], '退出'); } catch {}
    return {sent: true};
  } finally { conn.close(); }
}
