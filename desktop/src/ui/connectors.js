// [p3-m1] 「连接」 page: connector cards, add / edit form, synced items. Pure HTML builders.
import { escape } from './markdown.js';
import { CONNECTOR_KINDS, INTERVALS, intervalLabel, kindInfo, eventTimeLabel, upcomingEvents } from '../shared/connectors.js';

const STATUS = {new: ['待同步', ''], syncing: ['同步中', 'running'], ok: ['正常', 'done'], error: ['出错', 'failed']};

export function connectorsPage(state, {action, date, heading, empty}) {
  const list = state.connectors || [], items = state.connectorItems || [];
  const cards = list.map(c => {
    const info = kindInfo(c.kind) || {label: c.kind, icon: '🔗'}, [label, cls] = STATUS[c.status] || STATUS.new;
    const latest = c.kind === 'calendar' ? upcomingEvents(items.filter(i => i.connectorId === c.id), {days: 30})[0] : items.find(i => i.connectorId === c.id); // [p3-m2] next event
    const when = c.lastSync ? `上次同步 ${date(c.lastSync)}` : '尚未同步';
    return `<div class="card connector-card" data-connector="${escape(c.id)}"><div class="connector-head"><span class="connector-icon" aria-hidden="true">${info.icon}</span><div><h3>${escape(c.name)}</h3><small>${escape(info.label)}${c.sourceTitle ? ' · ' + escape(c.sourceTitle) : ''}</small></div><span class="badge ${cls}">${label}</span></div>
<div class="meta">${escape(when)} · ${c.count || 0} 条 · ${escape(intervalLabel(c.interval || 0))}${c.added ? ` · 本次新增 ${c.added} 条` : ''}</div>
${c.error ? `<p class="task-error">${escape(c.error)}</p>` : latest ? `<p class="connector-latest">${escape((Number.isFinite(latest.start) ? eventTimeLabel(latest) + ' · ' : '') + latest.title)}</p>` : ''}
<div class="actions">${c.status === 'syncing' ? '' : action('立即同步', 'connectorSync', c.id, 'primary')}${c.count ? action('查看内容', 'connectorItems', c.id) : ''}${c.kind === 'mail' ? action('写邮件', 'connectorCompose', c.id) : c.kind === 'office' && c.hasSecret ? action('发消息', 'connectorMessage', c.id) : ''}${action('编辑', 'connectorEdit', c.id)}${action('断开', 'connectorRemove', c.id)}</div></div>`;
  }).join('');
  const kinds = `<div class="connector-kinds">${CONNECTOR_KINDS.map(k => `<button type="button" class="connector-kind ${k.available ? '' : 'soon'}" data-action="${k.available ? 'connectorAdd' : 'connectorSoon'}" data-id="${k.kind}"><span aria-hidden="true">${k.icon}</span><b>${escape(k.label)}</b><small>${escape(k.description)}</small>${k.available ? '' : '<em>即将支持</em>'}</button>`).join('')}</div>`;
  return `<div class="page">${heading('CONNECTIONS', '把外部信息接进来。', '网页订阅、日历、邮件和办公平台的内容会同步到本机，用于对话、每日简报和定时任务。只读同步由你在这里添加即视为同意；发邮件、发消息等写操作每次都会单独确认。凭据用系统安全存储加密保存。', action('＋ 添加连接', 'connectorAdd', 'feed', 'primary'))}${kinds}${list.length ? `<div class="cards">${cards}</div>` : empty('还没有连接', '从添加一个网页或 RSS 订阅开始，比如公司公告页或行业新闻。')}</div>`;
}

export function connectorForm(state, connector = null, kind = 'feed') {
  const info = kindInfo(connector?.kind || kind);
  const fields = (info.fields || []).map(f => f.type === 'select' // [p3-m2]
    ? `<label>${escape(f.label)}<select name="cfg_${escape(f.name)}">${f.options.map(([v, l]) => `<option value="${escape(v)}" ${(connector?.config?.[f.name] || f.options[0][0]) === v ? 'selected' : ''}>${escape(l)}</option>`).join('')}</select></label>`
    : `<label>${escape(f.label)}<input name="cfg_${escape(f.name)}" value="${escape(String(connector?.config?.[f.name] ?? ''))}" placeholder="${escape(f.placeholder || '')}" ${f.required ? 'required' : ''} autocomplete="off" spellcheck="false"></label>`).join('');
  const secrets = (info.secretFields || []).map(f => `<label>${escape(f.label)}<input type="password" name="sec_${escape(f.name)}" placeholder="${connector?.hasSecret ? '已保存，留空则不修改' : escape(f.placeholder || '')}" ${f.required && !connector?.hasSecret ? 'required' : ''} autocomplete="off"></label>`).join('');
  const current = connector?.interval ?? info.defaultInterval ?? 60;
  return `<div class="task-form connector-form"><input type="hidden" name="kind" value="${escape(info.kind)}"><p class="task-form-note">${escape(info.description)}</p>${fields}${secrets}
<div class="task-form-row"><label>名称<input name="name" maxlength="60" value="${escape(connector?.name || '')}" placeholder="可留空，自动取网站名"></label><label>同步频率<select name="interval">${INTERVALS.map(m => `<option value="${m}" ${m === current ? 'selected' : ''}>${intervalLabel(m)}</option>`).join('')}</select></label></div>
<p class="task-form-note">应用运行时按频率自动同步；内容只保存在本机。</p></div>`;
}

export function connectorPayload(f, id) {
  const config = {}, secrets = {};
  for (const [k, v] of f.entries()) {
    if (k.startsWith('cfg_')) config[k.slice(4)] = String(v);
    if (k.startsWith('sec_') && v) secrets[k.slice(4)] = String(v);
  }
  return {...(id ? {action: 'update', id} : {action: 'add', kind: f.get('kind')}), name: f.get('name') || '', interval: Number(f.get('interval')), config, ...(Object.keys(secrets).length ? {secrets} : {})};
}

export function connectorItemsView(state, id, {action, date}) {
  const mine = (state.connectorItems || []).filter(i => i.connectorId === id);
  const items = (mine.some(i => Number.isFinite(i.start)) ? upcomingEvents(mine, {days: 400}) : mine).slice(0, 100); // [p3-m2] events: upcoming, earliest first
  if (!items.length) return '<p class="empty-note">还没有同步到内容。</p>';
  return `<div class="connector-items">${items.map(i => `<article class="connector-item"><div><b>${escape(i.title)}</b><small>${escape(Number.isFinite(i.start) ? eventTimeLabel(i) + (i.location ? ' · ' + i.location : '') : date(i.time))}${i.author ? ' · ' + escape(i.author) : ''}</small>${i.summary ? `<p>${escape(i.summary)}</p>` : ''}</div>${i.url ? action('打开', 'connectorOpen', i.url) : ''}</article>`).join('')}</div>`;
}

// [p3-m3] compose (sending is confirmed again in a system dialog)
export function mailComposeForm(connector) {
  return `<div class="task-form"><p class="task-form-note">从 ${escape(connector?.config?.email || connector?.name || '')} 发送。点「发送」后会再弹一次系统确认。</p>
<label>收件人<input name="to" required placeholder="多个地址用逗号或分号分隔" autocomplete="off" spellcheck="false"></label>
<label>主题<input name="subject" maxlength="200"></label><label>正文<textarea name="text" rows="10"></textarea></label></div>`;
}
export function mailComposePayload(f, id) {
  return {action: 'send', id, message: {to: String(f.get('to') || ''), subject: String(f.get('subject') || ''), text: String(f.get('text') || '')}};
}

// [p3-m4] group robot message
const IM_NAMES = {feishu: '飞书', dingtalk: '钉钉', wecom: '企业微信'};
export function officeMessageForm(connector) {
  return `<div class="task-form"><p class="task-form-note">通过${IM_NAMES[connector?.config?.platform] || ''}群机器人「${escape(connector?.name || '')}」发送纯文本消息。点「发送」后会再弹一次系统确认。</p>
<label>消息内容<textarea name="text" rows="8" maxlength="4000" required></textarea></label></div>`;
}
export function officeMessagePayload(f, id) { return {action: 'send', id, message: {text: String(f.get('text') || '')}}; }
