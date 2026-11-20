import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { decodeWords, parseAddress, bodySnippet, parseHeaders, encodeHeader, decodeBody } from '../runtime/mime.mjs';
import { imapResponse, fetchMail, quote, imapDate } from '../runtime/imap.mjs';
import { smtpSend, buildMessage } from '../runtime/smtp.mjs';
import { createMailAdapter } from '../services/connector-mail.mjs';
import { createConnectorService } from '../services/connectors.mjs';
import { kindInfo, MAIL_PRESETS } from '../src/shared/connectors.js';
import { connectorForm, connectorsPage, mailComposeForm, mailComposePayload } from '../src/ui/connectors.js';

const enc = s => `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`;
const GBK_ZW = '=D6=D0=CE=C4'; // 中文

test('decodeWords joins split UTF-8 words and decodes GBK Q words', () => {
  const b = Buffer.from('通威发布会');
  const split = `=?UTF-8?B?${b.subarray(0, 4).toString('base64')}?= =?UTF-8?B?${b.subarray(4).toString('base64')}?=`;
  assert.equal(decodeWords(split), '通威发布会');
  assert.equal(decodeWords(`=?gb2312?Q?${GBK_ZW}?= report`), '中文 report');
  assert.equal(decodeWords('Re: =?utf-8?q?hello_world?= ok'), 'Re: hello world ok');
  assert.equal(decodeWords('plain'), 'plain');
});

test('parseAddress handles encoded names, quotes and bare addresses', () => {
  assert.deepEqual(parseAddress(`${enc('张三')} <zhangsan@ex.com>`), {name: '张三', email: 'zhangsan@ex.com'});
  assert.deepEqual(parseAddress('"Li, Si" <lisi@ex.com>'), {name: 'Li, Si', email: 'lisi@ex.com'});
  assert.deepEqual(parseAddress('wang@ex.com'), {name: '', email: 'wang@ex.com'});
});

test('bodySnippet: multipart/alternative QP GBK, nested mixed, html-only base64, truncated base64', () => {
  const alt = `--b1\r\nContent-Type: text/plain; charset=gbk\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nMeeting ${GBK_ZW} 3pm=\r\n soft\r\n> quoted line\r\n--b1\r\nContent-Type: text/html\r\n\r\n<p>html</p>\r\n--b1--\r\n`;
  assert.equal(bodySnippet({'content-type': 'multipart/alternative; boundary="b1"'}, Buffer.from(alt, 'latin1')), 'Meeting 中文 3pm soft');
  const mixed = `--outer\r\nContent-Type: multipart/alternative; boundary=inner\r\n\r\n--inner\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<div>你好<b>世界</b></div>\r\n--inner--\r\n--outer\r\nContent-Type: application/pdf\r\nContent-Disposition: attachment\r\n\r\nJVBERi0=\r\n--outer--`;
  assert.equal(bodySnippet({'content-type': 'multipart/mixed; boundary=outer'}, Buffer.from(mixed)), '你好 世界');
  const html = Buffer.from('<html><body><p>你好，<b>世界</b></p><script>x()</script></body></html>').toString('base64');
  assert.equal(bodySnippet({'content-type': 'text/html; charset=utf-8', 'content-transfer-encoding': 'base64'}, Buffer.from(html)), '你好， 世界');
  const cut = Buffer.from('一二三四五六七八九十').toString('base64').slice(0, 21);
  assert.match(decodeBody(Buffer.from(cut), 'base64', 'text/plain; charset=utf-8'), /^一二三四/);
  assert.ok(!decodeBody(Buffer.from(cut), 'base64', 'text/plain; charset=utf-8').includes('\uFFFD'));
});

test('imapResponse reassembles literals across chunks', () => {
  const full = Buffer.from('* 1 FETCH (UID 5 BODY[TEXT]<0> {5}\r\nab\r\nc)\r\nW1 OK\r\n');
  const firstLen = full.indexOf('W1 OK');
  for (let cut = 1; cut < firstLen; cut++) assert.equal(imapResponse(full.subarray(0, cut)), null, 'cut ' + cut);
  const r = imapResponse(full);
  assert.equal(r.value.lits[0].toString(), 'ab\r\nc');
  assert.equal(r.value.line, '* 1 FETCH (UID 5 BODY[TEXT]<0> \u0000L0\u0000)');
  assert.equal(imapResponse(full.subarray(r.used)).value.line, 'W1 OK');
  assert.equal(quote('a"b\\c'), '"a\\"b\\\\c"');
  assert.throws(() => quote('密码'), /只能包含/);
  assert.throws(() => quote('a\r\nb'), /不支持/);
  assert.equal(imapDate(Date.UTC(2026, 10, 5, 12)), '5-Nov-2026');
});

const HDR = 'FROM TO SUBJECT DATE MESSAGE-ID CONTENT-TYPE CONTENT-TRANSFER-ENCODING';
function imapServer({messages, uidvalidity = () => 7, user = 'me@ex.com', pass = 'co"de1'}) {
  const log = [];
  const srv = net.createServer(sock => {
    let buf = '';
    sock.write('* OK fake IMAP ready\r\n');
    sock.on('error', () => {});
    sock.on('data', d => { buf += d.toString('utf8'); let i; while ((i = buf.indexOf('\r\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2); handle(line); } });
    function out(b) { for (let i = 0; i < b.length; i += 37) sock.write(b.subarray(i, i + 37)); }
    function handle(line) {
      log.push(line);
      const sp = line.indexOf(' '), tag = line.slice(0, sp), cmd = line.slice(sp + 1), up = cmd.toUpperCase();
      if (up.startsWith('LOGIN ')) return sock.write(cmd === `LOGIN "${user}" "${pass.replace(/[\\"]/g, '\\$&')}"` ? `${tag} OK LOGIN done\r\n` : `${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`);
      if (up.startsWith('ID ')) return sock.write(`* ID NIL\r\n${tag} OK ID done\r\n`);
      if (up === 'EXAMINE INBOX') return sock.write(`* ${messages.length} EXISTS\r\n* OK [UIDVALIDITY ${uidvalidity()}] UIDs valid\r\n${tag} OK [READ-ONLY] EXAMINE done\r\n`);
      if (up.startsWith('UID SEARCH UID ')) {
        const from = Number(/UID (\d+):\*/.exec(cmd)[1]);
        let ids = messages.filter(m => m.uid >= from).map(m => m.uid);
        if (!ids.length && messages.length) ids = [messages.at(-1).uid];
        return sock.write(`* SEARCH ${ids.join(' ')}\r\n${tag} OK SEARCH done\r\n`);
      }
      if (up.startsWith('UID SEARCH SINCE ')) return sock.write(`* SEARCH ${messages.map(m => m.uid).join(' ')}\r\n${tag} OK SEARCH done\r\n`);
      if (up.startsWith('UID FETCH ')) {
        const ids = /UID FETCH ([\d,]+)/.exec(cmd)[1].split(',').map(Number), parts = [];
        messages.filter(m => ids.includes(m.uid)).forEach((m, k) => {
          const h = Buffer.isBuffer(m.header) ? m.header : Buffer.from(m.header), t = Buffer.from(m.text || '', 'latin1');
          parts.push(Buffer.from(`* 1 EXISTS\r\n* ${k + 1} FETCH (UID ${m.uid} FLAGS (${m.seen ? '\\Seen' : ''}) INTERNALDATE "19-Nov-2026 09:00:00 +0800" BODY[HEADER.FIELDS (${HDR})] {${h.length}}\r\n`), h,
            Buffer.from(` BODY[TEXT]<0> {${t.length}}\r\n`), t, Buffer.from(')\r\n'));
        });
        parts.push(Buffer.from(`${tag} OK FETCH done\r\n`));
        return out(Buffer.concat(parts));
      }
      if (up === 'LOGOUT') { sock.write(`* BYE bye\r\n${tag} OK LOGOUT\r\n`); return sock.end(); }
      sock.write(`${tag} BAD unknown\r\n`);
    }
  });
  return new Promise(res => srv.listen(0, '127.0.0.1', () => res({srv, log, port: srv.address().port})));
}
const M1 = {uid: 101, header: `From: ${enc('张三')} <zhangsan@ex.com>\r\nTo: me@ex.com\r\nSubject: =?UTF-8?B?${Buffer.from('通威发布会').subarray(0, 4).toString('base64')}?=\r\n =?UTF-8?B?${Buffer.from('通威发布会').subarray(4).toString('base64')}?=\r\nDate: Wed, 18 Nov 2026 10:00:00 +0800 (CST)\r\nMessage-ID: <m1@ex.com>\r\nContent-Type: multipart/alternative; boundary="b1"\r\n\r\n`,
  text: `--b1\r\nContent-Type: text/plain; charset=gbk\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nMeeting ${GBK_ZW} 3pm\r\n--b1--\r\n`};
const M2 = {uid: 102, seen: true, header: Buffer.concat([Buffer.from('From: "Li Si" <lisi@ex.com>\r\nSubject: '), Buffer.from([0xd6, 0xd0, 0xce, 0xc4]), Buffer.from(' raw gbk\r\nDate: Thu, 19 Nov 2026 08:00:00 +0800\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')]),
  text: Buffer.from('<p>你好</p>').toString('base64')};
const M3 = {uid: 103, header: 'From: a@ex.com\r\nSubject: third\r\nMessage-ID: <m3@ex.com>\r\nDate: Thu, 19 Nov 2026 09:30:00 +0800\r\n\r\n', text: 'hello'};
const local = ({port}) => net.connect({host: '127.0.0.1', port});
const NOW = Date.UTC(2026, 10, 19, 4);

test('fetchMail: read-only commands, first sync by date, incremental by UID, UIDVALIDITY reset', async () => {
  let uv = 7;
  const messages = [M1, M2];
  const {srv, log, port} = await imapServer({messages, uidvalidity: () => uv});
  try {
    const base = {host: '127.0.0.1', port, user: 'me@ex.com', pass: 'co"de1', connect: local, now: () => NOW};
    const r1 = await fetchMail(base);
    assert.deepEqual([r1.uidvalidity, r1.lastUid, r1.messages.length], [7, 102, 2]);
    const [a, b] = r1.messages;
    assert.deepEqual([a.subject, a.from, a.unread, a.snippet, a.key, a.time], ['通威发布会', {name: '张三', email: 'zhangsan@ex.com'}, true, 'Meeting 中文 3pm', 'mid:<m1@ex.com>', Date.parse('2026-11-18T02:00:00Z')]);
    assert.deepEqual([b.subject, b.unread, b.snippet], ['中文 raw gbk', false, '你好']);
    assert.match(b.key, /^h:[0-9a-f]{32}$/);
    assert.ok(log.some(l => /UID SEARCH SINCE 12-Nov-2026$/.test(l)));
    const fetchCmd = log.find(l => / UID FETCH /.test(l));
    assert.match(fetchCmd, /UID FETCH 101,102 \(UID FLAGS INTERNALDATE BODY\.PEEK\[HEADER\.FIELDS/);
    assert.match(fetchCmd, /BODY\.PEEK\[TEXT\]<0\.4096>/);
    messages.push(M3);
    const r2 = await fetchMail({...base, state: r1});
    assert.deepEqual([r2.lastUid, r2.messages.map(m => m.uid)], [103, [103]]);
    assert.ok(log.some(l => / UID SEARCH UID 103:\*$/.test(l)));
    const fetches = log.filter(l => / UID FETCH /.test(l)).length;
    const r3 = await fetchMail({...base, state: r2});
    assert.deepEqual([r3.lastUid, r3.messages.length], [103, 0]);
    assert.equal(log.filter(l => / UID FETCH /.test(l)).length, fetches);
    uv = 8;
    const r4 = await fetchMail({...base, state: r3});
    assert.deepEqual([r4.uidvalidity, r4.messages.length], [8, 3]);
    assert.deepEqual(r4.messages.map(m => m.key).slice(0, 2), r1.messages.map(m => m.key));
    assert.ok(log.every(l => /^W\d+ (LOGIN|ID|EXAMINE INBOX|UID SEARCH|UID FETCH|LOGOUT)\b/.test(l)), log.join('\n'));
  } finally { srv.close(); }
});

test('fetchMail: wrong code gives a helpful error; non-IMAP greeting rejected', async () => {
  const {srv, port} = await imapServer({messages: []});
  try { await assert.rejects(fetchMail({host: '127.0.0.1', port, user: 'me@ex.com', pass: 'nope', connect: local}), /授权码.*Invalid credentials/); }
  finally { srv.close(); }
  const bad = net.createServer(s => { s.on('error', () => {}); s.write('220 smtp here\r\n'); });
  await new Promise(r => bad.listen(0, '127.0.0.1', r));
  try { await assert.rejects(fetchMail({host: '127.0.0.1', port: bad.address().port, user: 'a', pass: 'b', connect: local}), /不是 IMAP/); }
  finally { bad.close(); }
});

function smtpServer({starttls = false, auth = 'PLAIN LOGIN', pass = 'pw'} = {}) {
  const st = {log: [], data: null};
  const srv = net.createServer(sock => {
    let buf = '', inData = false, body = '', secured = false;
    sock.on('error', () => {});
    sock.write('220 fake ESMTP\r\n');
    sock.on('data', d => {
      buf += d.toString('latin1');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) { if (line === '.') { inData = false; st.data = body; sock.write('250 queued\r\n'); } else body += line + '\r\n'; continue; }
        st.log.push(line);
        const up = line.toUpperCase();
        if (up.startsWith('EHLO')) sock.write(`250-fake\r\n${starttls && !secured ? '250-STARTTLS\r\n' : ''}${(!starttls || secured) && auth ? `250-AUTH ${auth}\r\n` : ''}250 8BITMIME\r\n`);
        else if (up === 'STARTTLS') { secured = true; sock.write('220 ready\r\n'); }
        else if (up.startsWith('AUTH PLAIN ')) sock.write(Buffer.from(line.slice(11), 'base64').toString() === `\0me@ex.com\0${pass}` ? '235 ok\r\n' : '535 bad\r\n');
        else if (up.startsWith('MAIL FROM') || up.startsWith('RCPT TO')) sock.write('250 ok\r\n');
        else if (up === 'DATA') { inData = true; body = ''; sock.write('354 go\r\n'); }
        else if (up === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('500 what\r\n');
      }
    });
  });
  return new Promise(res => srv.listen(0, '127.0.0.1', () => res({srv, st, port: srv.address().port})));
}
const parseMsg = raw => { const i = raw.indexOf('\r\n\r\n'); return {h: parseHeaders(raw.slice(0, i)), body: Buffer.from(raw.slice(i + 4).replace(/\r\n/g, ''), 'base64').toString('utf8')}; };

test('smtpSend over implicit TLS: AUTH PLAIN, encoded subject, base64 body', async () => {
  const {srv, st, port} = await smtpServer();
  try {
    const subject = '关于通威新品发布会的安排（请各位准时参加，会后有交流环节）';
    await smtpSend({host: '127.0.0.1', port, security: 'tls', user: 'me@ex.com', pass: 'pw', from: 'me@ex.com', to: ['a@ex.com', 'b@ex.com'], subject, text: 'line1\n.hidden\nend', connect: local});
    assert.deepEqual(st.log.filter(l => /^(MAIL|RCPT)/.test(l)), ['MAIL FROM:<me@ex.com>', 'RCPT TO:<a@ex.com>', 'RCPT TO:<b@ex.com>']);
    const m = parseMsg(st.data);
    assert.equal(decodeWords(m.h.subject), subject);
    assert.equal(m.h.to, 'a@ex.com, b@ex.com');
    assert.equal(m.body, 'line1\r\n.hidden\r\nend');
    assert.ok(st.data.split('\r\n').every(l => l.length <= 998));
  } finally { srv.close(); }
});

test('smtpSend: STARTTLS is mandatory without implicit TLS; bad code reports login failure', async () => {
  const a = await smtpServer({starttls: true});
  try {
    let upgraded = 0;
    await smtpSend({host: '127.0.0.1', port: a.port, user: 'me@ex.com', pass: 'pw', from: 'me@ex.com', to: ['a@ex.com'], subject: 'hi', text: 'x', connect: local, upgrade: s => { upgraded++; return s; }});
    assert.equal(upgraded, 1);
    assert.deepEqual(a.st.log.slice(0, 3), ['EHLO quank.local', 'STARTTLS', 'EHLO quank.local']);
  } finally { a.srv.close(); }
  const b = await smtpServer({starttls: false});
  try {
    await assert.rejects(smtpSend({host: '127.0.0.1', port: b.port, user: 'me@ex.com', pass: 'pw', from: 'me@ex.com', to: ['a@ex.com'], subject: 'hi', text: 'x', connect: local}), /不支持加密连接/);
    assert.ok(!b.st.log.some(l => l.startsWith('AUTH')));
    await assert.rejects(smtpSend({host: '127.0.0.1', port: b.port, security: 'tls', user: 'me@ex.com', pass: 'wrong', from: 'me@ex.com', to: ['a@ex.com'], subject: 'hi', text: 'x', connect: local}), /登录失败/);
    await assert.rejects(smtpSend({host: '127.0.0.1', port: b.port, security: 'tls', user: 'me@ex.com', pass: 'pw', from: 'me@ex.com', to: ['a@ex.com>\r\nRCPT TO:<x@evil.com'], subject: 'hi', text: 'x', connect: local}), /地址不正确/);
  } finally { b.srv.close(); }
  assert.equal(encodeHeader('a\r\nBcc: x@evil.com'), 'a Bcc: x@evil.com');
  assert.match(buildMessage({from: 'me@ex.com', to: ['a@ex.com'], subject: 'x\r\nBcc: y@evil.com', text: '', now: () => 0}), /^Subject: x Bcc: y@evil\.com\r$/m);
});

const memStore = () => ({data: {activity: []}, async save() {}, log(t, d) { this.data.activity.unshift({title: t, detail: d}); }});
const codec = {seal: s => 'S:' + Buffer.from(s).toString('base64'), open: c => Buffer.from(c.slice(2), 'base64').toString()};

test('mail connector: presets, sync with unread flags, password sealed, sends only after confirmation', async () => {
  assert.equal(kindInfo('mail').available, true);
  const qq = createMailAdapter().normalize({preset: 'qq', email: 'me@qq.com', imapHost: 'evil.com'});
  assert.deepEqual(qq, {preset: 'qq', email: 'me@qq.com', imapHost: 'imap.qq.com', imapPort: 993, smtpHost: 'smtp.qq.com', smtpPort: 465});
  assert.throws(() => createMailAdapter().normalize({preset: 'custom', email: 'me@ex.com', imapHost: 'bad host!'}), /收信服务器/);
  assert.throws(() => createMailAdapter().normalize({preset: 'custom', email: 'nope', imapHost: 'imap.ex.com'}), /邮箱地址/);
  assert.ok(MAIL_PRESETS.exmail && MAIL_PRESETS.custom);
  const imap = await imapServer({messages: [M1, M2], pass: 'pw'}), smtp = await smtpServer({starttls: true});
  try {
    const asks = [];
    let answer = false;
    const store = memStore();
    const svc = createConnectorService({store, adapters: [createMailAdapter({connect: local, upgrade: s => s})], secrets: codec, now: () => NOW,
      confirm: async q => { asks.push(q); return answer; }});
    const config = {preset: 'custom', email: 'me@ex.com', imapHost: '127.0.0.1', imapPort: String(imap.port), smtpHost: '127.0.0.1', smtpPort: String(smtp.port)};
    await assert.rejects(svc.handle({action: 'add', kind: 'mail', config}), /请填写授权码/);
    const {id, added} = await svc.handle({action: 'add', kind: 'mail', config, secrets: {password: 'pw'}});
    assert.equal(added, 2);
    const v = svc.view();
    assert.equal(v.connectors[0].name, 'me@ex.com');
    assert.ok(!JSON.stringify(v).includes('S:') && !JSON.stringify(v).includes('"pw"'));
    const items = store.data.connectorItems;
    assert.deepEqual(items.map(i => [i.title, i.author, i.unread === true, i.kind]), [['中文 raw gbk', 'Li Si <lisi@ex.com>', false, 'mail'], ['通威发布会', '张三 <zhangsan@ex.com>', true, 'mail']]);
    assert.equal(store.data.connectors[0].state.lastUid, 102);
    const msg = {to: 'a@ex.com；b@ex.com', subject: '周报\r\nBcc: x@evil.com', text: '内容'};
    await assert.rejects(svc.handle({action: 'send', id, message: {to: 'not-an-address'}}), /收件人地址不正确/);
    assert.deepEqual(await svc.handle({action: 'send', id, message: msg}), {sent: false, cancelled: true});
    assert.equal(asks.length, 1);
    assert.match(asks[0].title, /从 me@ex\.com 发送邮件给 a@ex\.com、b@ex\.com/);
    assert.equal(smtp.st.log.length, 0);
    answer = true;
    assert.deepEqual(await svc.handle({action: 'send', id, message: msg}), {sent: true});
    assert.equal(decodeWords(parseMsg(smtp.st.data).h.subject), '周报 Bcc: x@evil.com');
    assert.ok(!/^Bcc:/im.test(smtp.st.data));
    assert.match(store.data.activity[0].title, /已发送邮件/);
    const noConfirm = createConnectorService({store, adapters: [createMailAdapter({connect: local})], secrets: codec});
    assert.deepEqual(await noConfirm.handle({action: 'send', id, message: msg}), {sent: false, cancelled: true});
  } finally { imap.srv.close(); smtp.srv.close(); }
});

test('mail UI: preset select, compose form and payload, compose action on mail cards only', () => {
  const form = connectorForm({}, null, 'mail');
  assert.match(form, /<select name="cfg_preset">[\s\S]*QQ 邮箱/);
  assert.match(form, /name="cfg_email"[^>]*required/);
  assert.match(form, /type="password" name="sec_password"[^>]*required/);
  const edit = connectorForm({}, {kind: 'mail', config: {preset: 'qq', email: 'me@qq.com', imapPort: 993}, hasSecret: true});
  assert.match(edit, /value="993"/);
  assert.ok(!/name="sec_password"[^>]*required/.test(edit));
  const ui = {action: (l, a, id = '') => `<button data-action="${a}" data-id="${id}">${l}</button>`, date: () => 'd', heading: (k, t) => `<h1>${t}</h1>`, empty: t => t};
  const html = connectorsPage({connectors: [{id: 'm', kind: 'mail', name: 'me', status: 'ok', interval: 15, config: {email: 'me@ex.com'}}, {id: 'f', kind: 'feed', name: 'f', status: 'ok', interval: 60}], connectorItems: []}, ui);
  assert.equal((html.match(/connectorCompose/g) || []).length, 1);
  assert.match(mailComposeForm({config: {email: '<x>@ex.com'}}), /&lt;x&gt;@ex\.com/);
  const f = new FormData();
  f.set('to', 'a@ex.com'); f.set('subject', 'S'); f.set('text', 'T');
  assert.deepEqual(mailComposePayload(f, 'm'), {action: 'send', id: 'm', message: {to: 'a@ex.com', subject: 'S', text: 'T'}});
});
