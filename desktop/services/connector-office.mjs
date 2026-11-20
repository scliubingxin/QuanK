// [p3-m4] Feishu / DingTalk / WeCom connector.
// Read: Feishu group messages via a self-built app (tenant_access_token). DingTalk and WeCom open APIs do not expose group
// chat history to ordinary apps, so their app credentials are only verified. Send: group robot webhooks, confirmed every time.
import { createHmac } from 'node:crypto';

const DAY = 864e5, FS = 'https://open.feishu.cn';
const JSONH = {'content-type': 'application/json; charset=utf-8', accept: 'application/json'};
export const IM_LABEL = {feishu: '飞书', dingtalk: '钉钉', wecom: '企业微信'};
const HOOK = {
  feishu: {host: 'open.feishu.cn', path: /^\/open-apis\/bot\/v2\/hook\/[\w-]{8,}$/},
  dingtalk: {host: 'oapi.dingtalk.com', path: /^\/robot\/send$/, param: 'access_token'},
  wecom: {host: 'qyapi.weixin.qq.com', path: /^\/cgi-bin\/webhook\/send$/, param: 'key'},
};
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const json = r => { try { return JSON.parse(r.text); } catch { throw new Error('服务器返回的内容无法识别'); } };

/** Only the official robot endpoint of the chosen platform is accepted (the webhook is a secret; it must not be redirected elsewhere). */
export function webhookUrl(platform, raw) {
  const rule = HOOK[platform];
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw new Error('群机器人 Webhook 地址格式不正确'); }
  if (!rule || u.protocol !== 'https:' || u.hostname !== rule.host || u.port || u.username || u.password || !rule.path.test(u.pathname) || (rule.param && !u.searchParams.get(rule.param)))
    throw new Error(`这不是${IM_LABEL[platform] || ''}群机器人的 Webhook 地址`);
  return u;
}

export function feishuText(item) {
  let c = {};
  try { c = JSON.parse(item?.body?.content || '{}'); } catch {}
  const t = item?.msg_type;
  if (t === 'text') return String(c.text || '').replace(/<at[^>]*>([^<]*)<\/at>/g, '@$1');
  if (t === 'post') {
    const p = Array.isArray(c.content) ? c : (c.zh_cn || c.en_us || Object.values(c)[0] || {});
    return [p.title, ...(p.content || []).map(line => (line || []).map(e => e.tag === 'at' ? '@' + (e.user_name || '') : e.tag === 'img' ? '[图片]' : (e.text || '')).join(''))].filter(Boolean).join('\n');
  }
  return {image: '[图片]', file: '[文件]', audio: '[语音]', media: '[视频]', sticker: '[表情]', interactive: '[卡片消息]', share_chat: '[群名片]', share_user: '[个人名片]', merge_forward: '[合并转发]', system: '[系统消息]'}[t] || `[${t || '消息'}]`;
}

async function feishuToken(fetch, appId, appSecret) {
  let r;
  try { r = json(await fetch(FS + '/open-apis/auth/v3/tenant_access_token/internal', {method: 'POST', headers: JSONH, body: JSON.stringify({app_id: appId, app_secret: appSecret})})); }
  catch (e) { throw new Error('飞书应用凭证校验失败：' + e.message); }
  if (r.code !== 0 || !r.tenant_access_token) throw new Error('飞书应用凭证无效：' + clip(r.msg || r.code, 160));
  return r.tenant_access_token;
}
async function feishuSync({fetch, appId, appSecret, state, now}) {
  const token = await feishuToken(fetch, appId, appSecret);
  const api = async path => {
    const r = json(await fetch(FS + path, {headers: {authorization: 'Bearer ' + token, accept: 'application/json'}}));
    if (r.code !== 0) throw new Error(`飞书接口返回错误 ${r.code}：${clip(r.msg, 160)}` + (r.code === 99991672 || r.code === 99991679 ? '（请在开放平台为应用开通读取群消息的权限并发布版本）' : ''));
    return r.data || {};
  };
  const chats = ((await api('/open-apis/im/v1/chats?page_size=50')).items || []).slice(0, 20);
  if (!chats.length) return {items: [], state: {since: state?.since || 0, title: '飞书 · 机器人还没有加入任何群'}};
  const since = Math.max((state?.since || 0) - 60e3, now() - 3 * DAY), items = [], errors = [];
  let latest = state?.since || 0;
  for (const chat of chats) {
    try {
      const d = await api(`/open-apis/im/v1/messages?container_id_type=chat&container_id=${encodeURIComponent(chat.chat_id)}&start_time=${Math.floor(since / 1000)}&sort_type=ByCreateTimeDesc&page_size=50`);
      for (const m of d.items || []) {
        if (m.deleted || !m.message_id) continue;
        const time = Number(m.create_time), text = feishuText(m), name = clip(chat.name, 40) || '群聊';
        if (Number.isFinite(time)) latest = Math.max(latest, time);
        items.push({key: 'fs:' + m.message_id, title: `${name}：${clip(text, 60) || '（空消息）'}`, summary: clip(text, 600), author: name, time: Number.isFinite(time) ? time : now()});
      }
    } catch (e) { errors.push(e); }
  }
  if (errors.length === chats.length) throw errors[0];
  return {items, state: {since: latest, title: `飞书 · ${chats.length} 个群${errors.length ? `（${errors.length} 个群读取失败）` : ''}`}};
}
async function verifyDingtalk(fetch, appKey, appSecret) {
  let r;
  try { r = json(await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {method: 'POST', headers: JSONH, body: JSON.stringify({appKey, appSecret})})); }
  catch (e) { throw new Error('钉钉应用凭证无效：' + e.message); }
  if (!r.accessToken) throw new Error('钉钉应用凭证无效：' + clip(r.message || r.code, 160));
}
async function verifyWecom(fetch, corpId, secret) {
  const r = json(await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`));
  if (r.errcode !== 0) throw new Error(`企业微信应用凭证无效（${r.errcode}）：${clip(r.errmsg, 160)}` + (r.errcode === 60020 ? '。需要在企业微信后台把本机出口 IP 加入应用的「企业可信 IP」' : ''));
}

export function createOfficeAdapter() {
  return {
    kind: 'office', itemKind: 'message',
    secretFields: [{name: 'appSecret', label: 'App Secret'}, {name: 'webhook', label: '群机器人 Webhook'}, {name: 'signSecret', label: '加签密钥'}],
    normalize(c) {
      const platform = String(c?.platform || 'feishu');
      if (!IM_LABEL[platform]) throw new Error('请选择平台');
      const appId = String(c?.appId || '').trim();
      if (appId.length > 200 || !/^[\w.-]*$/.test(appId)) throw new Error('App ID 格式不正确');
      return {platform, appId};
    },
    defaultName: c => IM_LABEL[c.platform] + (c.appId ? ' · 应用' : ' · 群机器人'),
    async sync({config, secret, state, fetch, now}) {
      const s = secret || {}, {platform, appId} = config;
      if (s.webhook) webhookUrl(platform, s.webhook);
      if (s.appSecret && !appId) throw new Error('填写了 Secret，还需要填写 App ID');
      const canRead = !!(appId && s.appSecret);
      if (!canRead && !s.webhook) throw new Error('请至少填写应用凭证（App ID + Secret）或群机器人 Webhook');
      const send = s.webhook ? ' · 可发送群消息' : '';
      if (!canRead) return {items: [], state: {title: '仅发送群消息'}};
      if (platform === 'feishu') { const r = await feishuSync({fetch, appId, appSecret: s.appSecret, state, now}); r.state.title += send; return r; }
      if (platform === 'dingtalk') await verifyDingtalk(fetch, appId, s.appSecret); else await verifyWecom(fetch, appId, s.appSecret);
      return {items: [], state: {title: '应用凭证有效（开放接口不提供群聊记录）' + send}};
    },
    prepare(m, config, sealedKeys = []) {
      const text = String(m?.text || '').trim(), label = IM_LABEL[config.platform];
      if (!sealedKeys.includes('webhook')) throw new Error('这个连接没有配置群机器人 Webhook，不能发消息');
      if (!text) throw new Error('请填写消息内容');
      if (text.length > 4000) throw new Error('消息最多 4000 字');
      return {text, title: `发送到${label}群机器人？`, detail: text.slice(0, 600) + (text.length > 600 ? '…' : ''), logTitle: '已发送群消息', logDetail: `${label}：${clip(text, 60)}`};
    },
    async send({config, secret, message, fetch, now}) {
      const {platform} = config, label = IM_LABEL[platform];
      if (!secret?.webhook) throw new Error('还没有填写群机器人 Webhook');
      const u = webhookUrl(platform, secret.webhook), ts = now(), text = message.text;
      let body = platform === 'feishu' ? {msg_type: 'text', content: {text}} : {msgtype: 'text', text: {content: text}};
      if (secret.signSecret && platform === 'feishu') {
        const t = Math.floor(ts / 1000);
        body = {timestamp: String(t), sign: createHmac('sha256', `${t}\n${secret.signSecret}`).update('').digest('base64'), ...body};
      }
      if (secret.signSecret && platform === 'dingtalk') {
        u.searchParams.set('timestamp', String(ts));
        u.searchParams.set('sign', createHmac('sha256', secret.signSecret).update(`${ts}\n${secret.signSecret}`).digest('base64'));
      }
      const r = json(await fetch(u.href, {method: 'POST', headers: JSONH, body: JSON.stringify(body)}));
      const code = platform === 'feishu' ? (r.code ?? r.StatusCode) : r.errcode;
      if (code !== 0) throw new Error(`${label}机器人拒绝了消息（${code}）：${clip(r.msg || r.errmsg || r.StatusMessage, 160)}`
        + (platform === 'dingtalk' && code === 310000 ? '。请检查机器人的关键词或加签设置' : platform === 'feishu' && code === 19021 ? '。加签校验失败，请检查加签密钥' : ''));
      return {sent: true};
    },
  };
}
export const officeAdapter = createOfficeAdapter();
