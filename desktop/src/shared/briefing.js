// [p2-m4] Daily briefing built only from local data. Pure helpers shared by the main process (scheduling,
// storage) and the renderer (card + settings). An optional model summary is added by services/briefing.mjs.
import { feedCounts } from './feed.js';
import { eventTimeLabel } from './connectors.js'; // [p3-m6]
import { actionLabel } from './quant.js'; // [q3]
export const BRIEFING_SECTIONS = [['attention', '需要你处理'], ['done', '上次简报以来完成'], ['today', '今天的定时任务'], ['calendar', '今日日程'], ['mail', '新邮件'], ['updates', '订阅与群消息'], ['quant', '量化信号'], ['outputs', '新成果'], ['memory', '记忆变化']];
// [p3-m6] sections that only appear when a connector of that kind exists
export const CONNECTOR_SECTIONS = {calendar: ['calendar'], mail: ['mail'], updates: ['feed', 'office']};
export const BRIEFING_KEEP = 14;
const DAY = 86400e3, TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const clip = (s, n = 80) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const pad = n => String(n).padStart(2, '0');
export const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export function briefingSettings(data) {
  const b = data.settings?.briefing || {};
  const sections = Array.isArray(b.sections) ? BRIEFING_SECTIONS.map(s => s[0]).filter(id => b.sections.includes(id)) : BRIEFING_SECTIONS.map(s => s[0]);
  return {enabled: b.enabled === true, time: TIME.test(b.time || '') ? b.time : '08:30', sections, useModel: b.useModel === true};
}

export function normalizeBriefingSettings(p) {
  if (!p || typeof p !== 'object') throw new Error('简报设置无效');
  const time = String(p.time || '');
  if (!TIME.test(time)) throw new Error('请选择生成时刻');
  const ids = BRIEFING_SECTIONS.map(s => s[0]), sections = (Array.isArray(p.sections) ? p.sections : []).filter(x => ids.includes(x));
  if (!sections.length) throw new Error('请至少选择一个板块');
  return {enabled: p.enabled === true, time, sections: [...new Set(sections)], useModel: p.useModel === true};
}

/** The briefing is due when enabled, today's time has passed and none was generated today. */
export function briefingDue(data, now = Date.now()) {
  const s = briefingSettings(data);
  if (!s.enabled) return false;
  const [h, m] = s.time.split(':').map(Number), at = new Date(now); at.setHours(h, m, 0, 0);
  return now >= at.getTime() && (data.briefings?.[0]?.day !== dayKey(now));
}

/** Structured briefing: {day, time, since, sections:[{id,title,items:[{text,action?,id?}]}], counts}. */
export function buildBriefing(data, now = Date.now(), {sections} = {}) {
  const wanted = sections || briefingSettings(data).sections;
  const since = Math.max(data.briefings?.[0]?.time || 0, now - DAY);
  const chats = (data.chats || []).filter(c => !c.incognito), tasks = data.tasks || [];
  const out = {};
  out.attention = [
    // [v1.0.4] 需要你处理 comes from the live feed, not from the last snapshot: pending approvals,
    // 待确认的委托单 and failed runs are all here, and the count matches what the hero shows.
    ...feedCounts(data).items.map(x => {
      const acts = x.actions || [];
      const pick = (x.kind === 'task' && acts.find(a => a.action === 'runTask')) || acts[0] || {};
      return {key: x.kind + '|' + x.title, text: clip(x.detail ? `${x.title} · ${x.detail}` : x.title, 90),
        action: pick.action || 'gotoPending', id: pick.id,
        label: pick.action === 'tradeHome' ? '查看委托单' : pick.action === 'runTask' ? '重新运行' : '前往授权'};
    }).filter((item, index, list) => list.findIndex(other => other.key === item.key) === index)
      .slice(0, 5).map(({key, ...item}) => item),
    ...chats.filter(c => c.plan && c.plan.status === 'failed' && (c.plan.finished || 0) >= since).map(c => ({text: `${c.plan.kind === 'research' ? '研究' : '计划'}未完成：${clip(c.plan.goal, 50)}`, action: 'openChat', id: c.id, label: '打开'})),
  ];
  out.attentionCount = feedCounts(data).pending;
  out.done = [
    ...tasks.flatMap(t => (t.history || []).filter(r => r.status === 'done' && r.at >= since).slice(0, 3).map(r => ({at: r.at, text: `任务完成：${clip(t.name, 40)}`, action: t.chatId ? 'openChat' : undefined, id: t.chatId, label: '查看'}))),
    ...chats.filter(c => c.plan?.status === 'done' && (c.plan.finished || 0) >= since).map(c => ({at: c.plan.finished, text: `${c.plan.kind === 'research' ? '深度研究' : '计划'}完成：${clip(c.plan.goal, 50)}${c.plan.sources?.length ? `（${c.plan.sources.length} 个来源）` : ''}`, action: c.plan.report ? 'documentWordEditor' : 'openChat', id: c.plan.report?.id || c.id, label: c.plan.report ? '打开报告' : '打开'})),
    ...chats.filter(c => !c.taskId && !c.plan && (c.finishedAt || 0) >= since).map(c => ({at: c.finishedAt, text: `对话完成：${clip(c.name, 50)}`, action: 'openChat', id: c.id, label: '打开'})),
  ].sort((a, b) => b.at - a.at).slice(0, 12).map(({at, ...x}) => x);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  out.today = tasks.filter(t => t.enabled && t.nextRun && t.nextRun <= end.getTime()).sort((a, b) => a.nextRun - b.nextRun)
    .map(t => { const d = new Date(t.nextRun); return {text: `${pad(d.getHours())}:${pad(d.getMinutes())} ${clip(t.name, 50)}${t.nextRun < now ? '（已到期，等待执行）' : ''}`}; });
  out.outputs = [
    ...(data.documents || []).filter(d => (d.time || 0) >= since).map(d => ({at: d.time, text: `文档：${clip(d.name, 60)}`, action: 'documentWordEditor', id: d.id, label: '打开'})),
    ...(data.artifacts || []).filter(a => (a.time || 0) >= since).map(a => ({at: a.time, text: `成果：${clip(a.name, 60)}`, action: 'viewArtifact', id: a.id, label: '查看'})),
  ].sort((a, b) => b.at - a.at).slice(0, 10).map(({at, ...x}) => x);
  const mem = (data.memories || []).filter(m => (m.created || 0) >= since);
  out.memory = mem.slice(0, 6).map(m => ({text: `${m.source === 'auto' ? '自动学到' : '你添加了'}：${clip(m.text, 70)}`}));
  // [p3-m6] connector data: today's events, new mail (unread first), subscription / group-message updates
  const conns = new Map((data.connectors || []).map(c => [c.id, c])), citems = (data.connectorItems || []).filter(i => conns.has(i.connectorId));
  out.calendar = citems.filter(i => i.kind === 'event' && Number.isFinite(i.start) && i.start <= end.getTime() && (Number.isFinite(i.end) ? i.end : i.start) > now)
    .sort((a, b) => a.start - b.start).slice(0, 12).map(i => ({text: `${eventTimeLabel(i, now).replace(/^今天 /, '')} ${clip(i.title, 50)}${i.location ? ' · ' + clip(i.location, 30) : ''}`}));
  const fresh = i => !i.initial && (i.fetchedAt || 0) >= since;
  out.mail = citems.filter(i => i.kind === 'mail' && fresh(i)).sort((a, b) => (b.unread === true) - (a.unread === true) || b.time - a.time).slice(0, 8)
    .map(i => ({text: `${i.unread ? '未读 · ' : ''}${clip(String(i.author || '').replace(/\s*<[^>]*>$/, ''), 24) || '未知发件人'}：${clip(i.title, 60)}`, action: 'connectorItems', id: i.connectorId, label: '查看'}));
  out.updates = citems.filter(i => (i.kind === 'feed' || i.kind === 'message') && fresh(i)).sort((a, b) => b.time - a.time).slice(0, 8)
    .map(i => ({text: `${clip(conns.get(i.connectorId)?.name, 20)}：${clip(i.title, 60)}`, action: 'connectorItems', id: i.connectorId, label: '查看'}));
  // [q3] quant: changes since the last briefing first, then where each stock in the pool stands
  out.quant = [
    ...(data.quant?.alerts || []).filter(a => a.kind === 'report' && a.time >= since).slice(0, 3).map(a => ({text: `${clip(a.title, 20)}：${clip(a.ok ? a.summary : '生成失败', 100)}${(a.warnings || []).length ? ' · ⚠ ' + clip(a.warnings[0], 60) : ''}`, action: 'quantReport', id: a.reportId, label: '查看'})), // [q5]
    ...(data.quant?.alerts || []).filter(a => a.kind === 'change' && a.time >= since).slice(0, 8).map(a => ({text: `信号变化 · ${clip(a.name || a.code, 20)}：${actionLabel(a.from)} → ${actionLabel(a.to, a.toText)}`, action: 'quantOpen', id: a.code, label: '详情'})),
    ...(data.quant?.pool || []).filter(p => p.last).slice(0, 12).map(p => ({text: `${clip(p.name || p.code, 20)}：${actionLabel(p.last.action, p.last.actionText)} · 综合分 ${p.last.score ?? '—'}${p.last.multiplier != null ? ` · ${p.last.multiplier}×` : ''}`, action: 'quantOpen', id: p.code, label: '详情'})),
  ];
  const result = BRIEFING_SECTIONS.filter(([id]) => wanted.includes(id) && (!CONNECTOR_SECTIONS[id] || (data.connectors || []).some(c => CONNECTOR_SECTIONS[id].includes(c.kind))) && (id !== 'quant' || (data.quant?.pool || []).length > 0)).map(([id, title]) => ({id, title, items: out[id]}));
  return {day: dayKey(now), time: now, since, sections: result, counts: Object.fromEntries(result.map(s => [s.id, s.items.length]))};
}

/** Plain text for the optional model summary (bounded). */
export function briefingText(b) {
  return b.sections.map(s => `【${s.title}】\n${s.items.length ? s.items.map(i => '- ' + i.text).join('\n') : '- 无'}`).join('\n\n').slice(0, 6000);
}
