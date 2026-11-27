// [p2-m3] Activity feed: one stream built from local state (scheduled task runs, items waiting for the user,
// research reports, plans, background conversations and the activity log). Pure functions shared by the
// renderer (to draw the feed) and the main process (unread badge). Read/dismiss state lives in data.feed.
import { actionLabel } from './quant.js'; // [q3]
export const FEED_LIMIT = 200, DISMISS_LIMIT = 500;
export const FEED_FILTERS = [['important', '需要关注'], ['all', '全部'], ['unread', '未读'], ['action', '需要处理'], ['tasks', '定时任务'], ['research', '研究与计划'], ['connectors', '连接'], ['quant', '量化'], ['log', '记录']];

// [v0.52.1] Only what the user has to look at counts as unread (sidebar badge) and is shown by default: approvals,
// scheduled-task runs, buy / sell signal changes, order drafts waiting for the user, stop-loss alerts and the user's own
// price alerts. Finished conversations, research / plan results, connector updates, digests, reports, notices and
// automatic market moves stay under 「全部」 without a badge.
const TRADE_ACTIONS = /^(BUY|STRONG_BUY|SELL|STRONG_SELL)$/i;
export function isImportant(x) {
  if (!x) return false;
  if (x.kind === 'approval' || x.kind === 'task' || x.needsAction) return true;
  return x.kind === 'quant' && x.important === true;
}
const clip = (s, n = 160) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Every feed item: {id, kind, group, title, detail, time, status, needsAction, actions:[{label, action, id, kind}]} */
export function buildFeed(data) {
  const items = [], covered = new Set();
  const chatExists = id => !!id && (data.chats || []).some(c => c.id === id && !c.incognito);
  const open = id => chatExists(id) ? [{label: '打开对话', action: 'openChat', id}] : [];

  for (const x of data.approvalFeed || []) {
    if (data.chats?.some(chat => chat.id === x.chatId && chat.incognito)) continue;
    items.push({ id: 'approval:' + x.requestId, kind: 'approval', group: 'action', title: '待确认授权：' + clip(x.action, 60),
      detail: clip(x.source || x.agent), time: x.time, status: 'pending', needsAction: true,
      actions: [{ label: '前往授权', action: 'approvalJump', id: x.requestId }] });
  }
  // [v1.0.4] 委托单等你确认的项，以前只在自动化页里存在，动态的「需要处理」看不到它们。
  for (const o of data.trade?.orders || []) {
    if (o.status !== 'draft' && o.status !== 'awaiting') continue;
    items.push({id: 'order:' + o.id, kind: 'order', group: 'action',
      title: (o.status === 'draft' ? '待确认委托单：' : '待提交委托单：') + clip(`${o.name || ''} ${o.code || ''}`, 60),
      detail: clip(`${o.side === 'buy' ? '买入' : '卖出'} ${o.shares} 股 · 限价 ${o.price}`, 120),
      time: Number(o.created || o.time) || 0, status: 'pending', needsAction: true,
      actions: [{label: '查看委托单', action: 'tradeHome', id: o.id}]});
  }
  for (const x of data.approvalFeed ? [] : data.pendingApprovals || []) {
    const task = (data.tasks || []).find(t => t.id === x.taskId);
    items.push({id: 'approval:' + x.id, kind: 'approval', group: 'action', title: '待你确认：' + clip(x.title, 60), detail: clip((task ? task.name + ' · ' : '') + (x.candidate?.label || x.detail)), time: x.time, status: 'pending', needsAction: true,
      actions: [...(x.candidate ? [{label: '总是允许', action: 'allowPending', id: x.id, kind: 'primary'}] : []), ...open(x.chatId), {label: '忽略', action: 'dismissPending', id: x.id}]});
  }
  for (const t of data.tasks || []) {
    const runs = t.history?.length ? t.history : t.lastRun && ['done', 'failed', 'cancelled'].includes(t.status) ? [{id: 'last', at: t.lastRun, status: t.status, error: t.error}] : [];
    runs.forEach((r, i) => {
      if (!['done', 'failed', 'cancelled'].includes(r.status)) return;
      const failed = r.status !== 'done', latest = i === 0;
      items.push({id: `task:${t.id}:${r.id}`, kind: 'task', group: 'tasks', title: `${failed ? (r.status === 'cancelled' ? '任务已停止' : '任务失败') : '任务完成'}：${clip(t.name, 60)}`,
        detail: failed ? clip(r.error || t.error || '') : r.pending ? `完成，有 ${r.pending} 项操作等你确认` : clip(latest && t.result ? t.result : '', 120),
        time: r.at + (r.ms || 0), status: r.status, needsAction: failed && latest && r.status === 'failed',
        actions: [...open(t.chatId), ...(!t.chatId && t.result && latest ? [{label: '查看结果', action: 'taskResult', id: t.id}] : []), ...(failed && latest && !['queued', 'running', 'cancelling'].includes(t.status) ? [{label: '重新运行', action: 'runTask', id: t.id, kind: 'primary'}] : [])]});
    });
    // [v1.0.4] A task that is failed but whose history has no failed run still needs you: the old
    // briefing listed it from tasks.status, so the feed must list it too, otherwise it disappears.
    if (t.status === 'failed' && !items.some(x => x.kind === 'task' && x.needsAction && x.title.includes(clip(t.name, 60))))
      items.push({id: `task:${t.id}:status`, kind: 'task', group: 'tasks', title: `任务失败：${clip(t.name, 60)}`,
        detail: clip(t.error || ''), time: Number(t.lastRun) || 0, status: 'failed', needsAction: true,
        actions: [{label: '重新运行', action: 'runTask', id: t.id, kind: 'primary'}]});
    if (t.chatId) covered.add(t.chatId);
  }
  for (const c of data.chats || []) {
    if (c.incognito) continue;
    const p = c.plan;
    if (p && ['done', 'failed', 'cancelled'].includes(p.status)) {
      const research = p.kind === 'research', done = p.status === 'done';
      items.push({id: 'plan:' + p.id, kind: research ? 'research' : 'plan', group: 'research',
        title: `${research ? '深度研究' : '计划'}${done ? '完成' : p.status === 'cancelled' ? '已停止' : '未完成'}：${clip(p.goal, 60)}`,
        detail: research && done ? `${(p.steps || []).length} 步 · ${p.sources?.length || 0} 个来源${p.report ? ' · 报告已存入成果中心' : ''}` : clip(p.error || `${(p.steps || []).filter(s => s.status === 'done').length}/${(p.steps || []).length} 步完成`),
        time: p.finished || c.time || 0, status: p.status, needsAction: false,
        actions: [...(p.report ? [{label: '打开报告', action: 'documentWordEditor', id: p.report.id, kind: 'primary'}] : []), {label: '打开对话', action: 'openChat', id: c.id}]});
      covered.add(c.id);
    }
    if (c.finishedAt && !covered.has(c.id) && !c.taskId) {
      const last = [...(c.messages || [])].reverse().find(m => m.role === 'assistant');
      items.push({id: `chat:${c.id}:${c.finishedAt}`, kind: 'chat', group: 'tasks', title: (last?.error ? '对话未完成：' : '后台对话完成：') + clip(c.name, 60), detail: clip(last?.content, 120), time: c.finishedAt, status: last?.error ? 'failed' : 'done', needsAction: false, actions: open(c.id)});
    }
  }
  // [p3-m6] one row per connector sync that brought new items (the first sync is not news)
  const conns = new Map((data.connectors || []).map(c => [c.id, c])), batches = new Map();
  for (const i of data.connectorItems || []) {
    if (i.initial || !conns.has(i.connectorId) || !Number.isFinite(i.fetchedAt)) continue;
    const k = i.connectorId + ':' + i.fetchedAt;
    if (!batches.has(k)) batches.set(k, []);
    batches.get(k).push(i);
  }
  const NOUN = {mail: '封新邮件', event: '个日程变化', feed: '条订阅更新', message: '条群消息'};
  for (const [k, list] of batches) {
    const c = conns.get(list[0].connectorId);
    items.push({id: 'conn:' + k, kind: 'connector', group: 'connectors', title: `${clip(c.name, 40)}：${list.length} ${NOUN[list[0].kind] || '条新内容'}`,
      detail: clip(list.slice(0, 3).map(i => i.title).join('；'), 160), time: list[0].fetchedAt, status: 'info', needsAction: false,
      actions: [{label: '查看', action: 'connectorItems', id: c.id}]});
  }
  // [q3] quant: signal changes found while watching, and pre-market digests
  for (const a of data.quant?.alerts || []) {
    if (!a || !Number.isFinite(a.time)) continue;
    if (a.kind === 'report') { // [q5]
      items.push({id: 'quant:' + a.id, kind: 'quant', group: 'quant', title: a.ok ? `${clip(a.title, 20)}：${clip(a.summary, 80)}` : `${clip(a.title, 20)}生成失败`,
        detail: clip([...(a.warnings || []), a.ok ? '' : a.summary].filter(Boolean).join('；'), 200), time: a.time, status: !a.ok || (a.warnings || []).length ? 'failed' : 'info', needsAction: false, actions: [{label: '查看', action: 'quantReport', id: a.reportId}]});
      continue;
    }
    if (a.kind === 'digest') items.push({id: 'quant:' + a.id, kind: 'quant', group: 'quant', title: `盘前量化简报：${a.counts?.total || 0} 只，${a.counts?.buy || 0} 个买点，${a.counts?.sell || 0} 个风控提示`,
      detail: clip((a.items || []).slice(0, 4).map(x => `${x.name || x.code} ${actionLabel(x.action, x.actionText)}`).join('；')), time: a.time, status: a.counts?.failed ? 'failed' : 'info', needsAction: false, actions: [{label: '打开量化', action: 'quantHome', id: ''}]});
    else items.push({id: 'quant:' + a.id, kind: 'quant', group: 'quant', title: `${clip(a.name || a.code, 20)}：${actionLabel(a.from)} → ${actionLabel(a.to, a.toText)}`,
      detail: clip([a.score != null ? `综合分 ${a.score}` : '', a.multiplier != null ? `倍率 ${a.multiplier}×` : '', a.price != null ? `现价 ${a.price}` : '', a.reason].filter(Boolean).join(' · ')),
      time: a.time, status: 'info', needsAction: false, important: TRADE_ACTIONS.test(String(a.to || '')), actions: [{label: '查看详情', action: 'quantOpen', id: a.code}]});
  }
  const structured = /^(任务已完成|任务未完成|已完成对话|对话达到轮数上限|连接有新内容)$/;
  for (const a of data.activity || []) {
    if (structured.test(a.title)) continue;
    if (a.title === '主题周报') { items.push({id: 'log:' + a.id, kind: 'quant', group: 'quant', title: clip(a.detail, 80) || '主题周报', detail: clip(a.detail), time: a.time, status: 'info', needsAction: false, actions: [{label: '查看投研资料库', action: 'quantHome', id: ''}]}); continue; } // [F3]
    if (a.title === '委托单') { items.push({id: 'log:' + a.id, kind: 'quant', group: 'quant', title: clip(a.detail, 80) || '委托单', detail: clip(a.detail), time: a.time, status: /待你确认|等你点击提交/.test(a.detail || '') ? 'attention' : 'info', needsAction: /待你确认|等你点击提交/.test(a.detail || ''), actions: [{label: '查看委托单', action: 'tradeHome', id: ''}]}); continue; } // [v0.52] [v0.52.2] under 自动化
    if (a.title === '风控提醒') { const code = a.code || (/（(\d{6})）/.exec(a.detail || '') || [])[1]; items.push({id: 'log:' + a.id, kind: 'quant', group: 'quant', title: clip(a.detail, 80) || '风控提醒', detail: clip(a.detail), time: a.time, status: 'info', needsAction: false, important: true, actions: code ? [{label: '查看详情', action: 'quantOpen', id: code}] : [{label: '打开量化', action: 'quantHome', id: ''}]}); continue; } // [F4]
    if (a.title === '公告提醒') { const code = a.code || (/（(\d{6})）/.exec(a.detail || '') || [])[1]; items.push({id: 'log:' + a.id, kind: 'quant', group: 'quant', title: clip(a.detail, 80) || '公告提醒', detail: clip(a.detail), time: a.time, status: 'info', needsAction: false, actions: code ? [{label: '查看公告', action: 'researchNotices', id: code}] : []}); continue; } // [F2]
    if (/^(行情提醒|自选股涨停|自选股跌停|自选股异动)$/.test(a.title)) { const code = a.code || (/（(\d{6})）/.exec(a.detail || '') || [])[1]; items.push({id: 'log:' + a.id, kind: 'quant', group: 'quant', title: clip(a.title, 80), detail: clip(a.detail), time: a.time, status: 'info', needsAction: false, important: a.title === '行情提醒', actions: code ? [{label: '查看行情', action: 'mkStock', id: code}] : []}); continue; } // [F1c]
    items.push({id: 'log:' + a.id, kind: 'log', group: 'log', title: clip(a.title, 80), detail: clip(a.detail), time: a.time, status: 'info', needsAction: false, actions: []});
  }
  return items.filter(x => Number.isFinite(x.time)).map(x => ({...x, important: isImportant(x)})).sort((a, b) => b.time - a.time).slice(0, FEED_LIMIT);
}

export function feedState(data) { const f = data.feed || {}; return {seenAt: Number(f.seenAt) || 0, dismissed: Array.isArray(f.dismissed) ? f.dismissed : [], read: Array.isArray(f.read) ? f.read : []}; } // [F1e] per-item read

/** Visible items for a filter, with `unread` set. Only important items count as unread. */
export function visibleFeed(data, filter = 'all') {
  const {seenAt, dismissed, read} = feedState(data), hidden = new Set(dismissed), opened = new Set(read);
  // [v1.0.4] 已读只由 seenAt / 单条已读决定；需要处理的项仍留在「需要处理」，但不再算未读，
  // so 全部标为已读 really zeroes the badge and the hero instead of leaving them at the old number.
  return buildFeed(data).filter(x => !hidden.has(x.id)).map(x => ({...x, unread: x.important && x.time > seenAt && !opened.has(x.id)}))
    .filter(x => (filter === 'all' && x.kind !== 'log') || (filter === 'important' ? x.important : filter === 'unread' ? x.unread : filter === 'action' ? x.needsAction : x.group === filter));
}

export const feedUnread = data => visibleFeed(data, 'unread').length;

// A caller may hold only part of the workspace (a briefing fixture, a partially synced state);
// the feed treats every missing list as empty instead of throwing.
// approvalFeed is deliberately absent: buildFeed treats a present but empty approvalFeed as
// "approvals already flattened", so filling it in here would hide data.pendingApprovals.
const FEED_LISTS = ['chats', 'tasks', 'documents', 'artifacts', 'connectors', 'connectorItems', 'quant', 'signals', 'pendingApprovals', 'resolvedApprovals'];
export function feedData(data) {
  const out = {...(data || {})};
  for (const key of FEED_LISTS) if (!Array.isArray(out[key])) out[key] = [];
  if (!out.feed || typeof out.feed !== 'object') out.feed = {};
  if (out.trade && !Array.isArray(out.trade.orders)) out.trade = {...out.trade, orders: []};
  return out;
}

/** [v1.0.4] The only place the feed numbers come from: hero, sidebar badge, toast and 需要处理 all read this. */
export function feedCounts(source) {
  const data = feedData(source);
  const all = visibleFeed(data, 'all'), pending = visibleFeed(data, 'action');
  return {unread: all.filter(x => x.unread).length, pending: pending.length, items: pending};
}

/** Apply a feed mutation (pure; returns the new data.feed). */
export function applyFeedAction(data, p, now = Date.now()) {
  const f = feedState(data);
  if (p?.action === 'seen') return {...f, seenAt: Math.max(f.seenAt, Number(p.at) || now)};
  if (p?.action === 'dismiss') {
    if (typeof p.id !== 'string' || !p.id || p.id.length > 300) throw new Error('动态不存在');
    return {...f, dismissed: [p.id, ...f.dismissed.filter(x => x !== p.id)].slice(0, DISMISS_LIMIT)};
  }
  if (p?.action === 'read') { // [F1e]
    if (typeof p.id !== 'string' || !p.id || p.id.length > 300) throw new Error('动态不存在');
    return {...f, read: [p.id, ...f.read.filter(x => x !== p.id)].slice(0, DISMISS_LIMIT)};
  }
  if (p?.action === 'restore') return {...f, dismissed: []};
  throw new Error('未知操作');
}
