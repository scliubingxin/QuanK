// [p3-m3] Mail connector: IMAP read-only sync of the inbox, SMTP sending only through the service's per-send confirmation.
import { fetchMail } from '../runtime/imap.mjs';
import { smtpSend } from '../runtime/smtp.mjs';
import { defaultConnect } from '../runtime/netconn.mjs';
import { MAIL_PRESETS } from '../src/shared/connectors.js';

const EMAIL = /^[^\s@<>"(),;:\\]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const HOST = /^(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/;
export const MAIL_DAYS = 7;
const port = (v, d) => { if (v === undefined || v === null || v === '') return d; const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('端口无效'); return n; };
const host = (v, what) => { const h = String(v || '').trim().toLowerCase(); if (!HOST.test(h)) throw new Error(`请填写正确的${what}`); return h; };

export function createMailAdapter({connect = defaultConnect, upgrade} = {}) {
  return {
    kind: 'mail', itemKind: 'mail',
    secretFields: [{name: 'password', label: '授权码 / 应用专用密码', required: true}],
    normalize(c) {
      const preset = MAIL_PRESETS[c?.preset] ? c.preset : 'custom', p = MAIL_PRESETS[preset];
      const email = String(c?.email || '').trim();
      if (!EMAIL.test(email)) throw new Error('请填写正确的邮箱地址');
      if (preset !== 'custom') return {preset, email, imapHost: p.imap[0], imapPort: p.imap[1], smtpHost: p.smtp[0], smtpPort: p.smtp[1]};
      const imapHost = host(c.imapHost, '收信服务器（IMAP）'), smtpHost = c.smtpHost ? host(c.smtpHost, '发信服务器（SMTP）') : '';
      return {preset, email, imapHost, imapPort: port(c.imapPort, 993), smtpHost, smtpPort: port(c.smtpPort, 465)};
    },
    defaultName: c => c.email,
    async sync({config, secret, state, signal, now}) {
      if (!secret?.password) throw new Error('请填写授权码');
      const r = await fetchMail({host: config.imapHost, port: config.imapPort, user: config.email, pass: secret.password, days: MAIL_DAYS, state, connect, signal, now});
      return {items: r.messages.map(m => ({key: m.key, title: m.subject || '（无主题）', summary: m.snippet, author: m.from.name ? `${m.from.name} <${m.from.email}>` : m.from.email,
        time: m.time ?? now(), unread: m.unread})), state: {uidvalidity: r.uidvalidity, lastUid: r.lastUid, title: config.email}};
    },
    prepare(m, config) {
      if (!config.smtpHost) throw new Error('这个邮箱没有配置发信服务器（SMTP）');
      const to = [...new Set(String(m?.to || '').split(/[,;，；\s]+/).map(s => s.trim()).filter(Boolean))];
      if (!to.length) throw new Error('请填写收件人');
      if (to.length > 20) throw new Error('收件人最多 20 个');
      for (const a of to) if (!EMAIL.test(a)) throw new Error('收件人地址不正确：' + a.slice(0, 80));
      const subject = String(m?.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200), text = String(m?.text || '');
      if (text.length > 100000) throw new Error('正文过长');
      if (!subject && !text.trim()) throw new Error('主题和正文不能都为空');
      return {to, subject, text, title: `从 ${config.email} 发送邮件给 ${to.join('、')}？`, detail: `主题：${subject || '（无主题）'}\n\n${text.slice(0, 600)}${text.length > 600 ? '…' : ''}`};
    },
    async send({config, secret, message, signal}) {
      if (!secret?.password) throw new Error('请填写授权码');
      return smtpSend({host: config.smtpHost, port: config.smtpPort, user: config.email, pass: secret.password, from: config.email, to: message.to,
        subject: message.subject, text: message.text, connect, ...(upgrade ? {upgrade} : {}), signal});
    },
  };
}
export const mailAdapter = createMailAdapter();
