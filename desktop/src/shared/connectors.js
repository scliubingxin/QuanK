// [p3-m1] Connector catalogue shared by the main process (validation) and the renderer (forms, labels).
// Pure data and helpers only: no Node or DOM APIs.
export const INTERVALS = [0, 15, 30, 60, 180, 720, 1440];
export const intervalLabel = m => m === 0 ? '仅手动同步' : m < 60 ? `每 ${m} 分钟` : m === 60 ? '每小时' : m === 1440 ? '每天' : `每 ${m / 60} 小时`;

// [p3-m3] mail providers: [host, port]; port 465 = implicit TLS, 587 = STARTTLS
export const MAIL_PRESETS = {
  qq: {label: 'QQ 邮箱', imap: ['imap.qq.com', 993], smtp: ['smtp.qq.com', 465]},
  '163': {label: '网易 163 邮箱', imap: ['imap.163.com', 993], smtp: ['smtp.163.com', 465]},
  '126': {label: '网易 126 邮箱', imap: ['imap.126.com', 993], smtp: ['smtp.126.com', 465]},
  exmail: {label: '腾讯企业邮箱', imap: ['imap.exmail.qq.com', 993], smtp: ['smtp.exmail.qq.com', 465]},
  aliyun: {label: '阿里企业邮箱', imap: ['imap.qiye.aliyun.com', 993], smtp: ['smtp.qiye.aliyun.com', 465]},
  feishu: {label: '飞书邮箱', imap: ['imap.feishu.cn', 993], smtp: ['smtp.feishu.cn', 465]},
  gmail: {label: 'Gmail', imap: ['imap.gmail.com', 993], smtp: ['smtp.gmail.com', 465]},
  outlook: {label: 'Outlook / Microsoft 365（多数账号已关闭密码登录）', imap: ['outlook.office365.com', 993], smtp: ['smtp.office365.com', 587]},
  custom: {label: '其他（手动填写服务器）'},
};

export const CONNECTOR_KINDS = [
  {kind: 'feed', label: '网页 / RSS 订阅', icon: '📰', available: true,
    description: '订阅 RSS / Atom，或跟踪普通网页的正文变化（公司公告页、行业新闻页）。',
    fields: [{name: 'url', label: '网址', placeholder: 'https://example.com/feed.xml 或要跟踪的网页', required: true}],
    defaultInterval: 60},
  {kind: 'calendar', label: '日历', icon: '📅', available: true,
    description: '订阅链接（.ics / webcal，如 Outlook、Google 日历的发布链接）或 CalDAV 账号（飞书 caldav.feishu.cn、iCloud caldav.icloud.com、企业邮箱等），读取今天起 30 天的日程。',
    fields: [{name: 'mode', label: '方式', type: 'select', options: [['ics', '订阅链接（.ics / webcal）'], ['caldav', 'CalDAV 账号']]},
      {name: 'url', label: '地址', placeholder: 'webcal://… 或 https://caldav.example.com/', required: true},
      {name: 'username', label: 'CalDAV 账号', placeholder: '仅 CalDAV 需要'}],
    secretFields: [{name: 'password', label: '应用专用密码（CalDAV）', placeholder: '仅 CalDAV 需要，建议使用应用专用密码', requiredWhen: {mode: 'caldav'}}],
    defaultInterval: 30},
  {kind: 'mail', label: '邮件', icon: '✉️', available: true,
    description: '只读同步收件箱最近 7 天的邮件（不会改变已读状态）。QQ、163 等请在邮箱设置里开启 IMAP/SMTP 并使用「授权码」；Gmail 用应用专用密码。发邮件每次都要你确认。',
    fields: [{name: 'preset', label: '邮箱类型', type: 'select', options: Object.entries(MAIL_PRESETS).map(([k, p]) => [k, p.label])},
      {name: 'email', label: '邮箱地址', placeholder: 'name@example.com', required: true},
      {name: 'imapHost', label: '收信服务器 IMAP（仅「其他」需要）', placeholder: 'imap.example.com'},
      {name: 'imapPort', label: 'IMAP 端口（仅「其他」）', placeholder: '993'},
      {name: 'smtpHost', label: '发信服务器 SMTP（仅「其他」，可留空）', placeholder: 'smtp.example.com'},
      {name: 'smtpPort', label: 'SMTP 端口（仅「其他」）', placeholder: '465 或 587'}],
    secretFields: [{name: 'password', label: '授权码 / 应用专用密码', placeholder: '不是邮箱登录密码', required: true}],
    defaultInterval: 15},
  {kind: 'office', label: '飞书 / 钉钉 / 企业微信', icon: '💬', available: true,
    description: '飞书：填企业自建应用的 App ID 和 App Secret，读取机器人所在群近 3 天的消息（需开通读取群消息权限并发布应用）。钉钉、企业微信的开放接口不提供群聊记录，填应用凭证只做校验。三个平台都可以填群机器人 Webhook 来发消息，每次发送都要你确认。',
    fields: [{name: 'platform', label: '平台', type: 'select', options: [['feishu', '飞书'], ['dingtalk', '钉钉'], ['wecom', '企业微信']]},
      {name: 'appId', label: 'App ID / AppKey / 企业 ID（可留空）', placeholder: '飞书 cli_…，钉钉 AppKey，企业微信 CorpID'}],
    secretFields: [{name: 'appSecret', label: 'App Secret / 应用 Secret（可留空）', placeholder: '与上面的 App ID 配套'},
      {name: 'webhook', label: '群机器人 Webhook 地址（发消息用，可留空）', placeholder: 'https://open.feishu.cn/open-apis/bot/v2/hook/…'},
      {name: 'signSecret', label: '机器人加签密钥（开启「加签」时填写）', placeholder: '飞书 / 钉钉机器人安全设置里的密钥'}],
    defaultInterval: 15},
];
export const kindInfo = kind => CONNECTOR_KINDS.find(k => k.kind === kind);

/** http(s) only, no credentials in the URL. Returns the normalised href or throws a Chinese message. */
export function safeUrl(value) {
  let s = typeof value === 'string' ? value.trim() : '';
  if (/^webcal:\/\//i.test(s)) s = 'https://' + s.slice(9);
  if (!s || s.length > 2048) throw new Error('请填写网址');
  let u;
  try { u = new URL(s); } catch { throw new Error('网址格式不正确'); }
  if (!['https:', 'http:'].includes(u.protocol)) throw new Error('只支持 http 或 https 网址');
  if (u.username || u.password) throw new Error('网址里不能包含账号密码');
  return u.href;
}

// [p3-m2] calendar helpers (local time)
const pad = n => String(n).padStart(2, '0');
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const midnight = ms => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
function dayLabel(ms, now) {
  const diff = Math.round((midnight(ms) - midnight(now)) / 864e5), d = new Date(ms);
  return diff === 0 ? '今天' : diff === 1 ? '明天' : diff === -1 ? '昨天' : `${d.getMonth() + 1}月${d.getDate()}日 周${'日一二三四五六'[d.getDay()]}`;
}
export function eventTimeLabel(e, now = Date.now()) {
  const s = new Date(e.start), end = new Date(Number.isFinite(e.end) ? e.end : e.start);
  if (e.allDay) {
    const last = Math.max(e.start, end.getTime() - 1);
    return dayLabel(e.start, now) + (midnight(last) !== midnight(e.start) ? ' – ' + dayLabel(last, now) : '') + ' 全天';
  }
  return `${dayLabel(e.start, now)} ${hm(s)}–${midnight(end.getTime()) === midnight(e.start) ? hm(end) : dayLabel(end.getTime(), now) + ' ' + hm(end)}`;
}
/** Events not yet finished that start before local midnight `days` days from today, earliest first. */
export function upcomingEvents(items, {now = Date.now(), days = 1} = {}) {
  const limit = midnight(now) + days * 864e5;
  return (items || []).filter(i => Number.isFinite(i.start) && (Number.isFinite(i.end) ? i.end : i.start) > now && i.start < limit).sort((a, b) => a.start - b.start);
}
