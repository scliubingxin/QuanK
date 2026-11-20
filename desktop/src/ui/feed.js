// [p2-m3] Feed page: filters, unread markers and one-click actions. Pure HTML builder.
// [v45k] Home-style layout: gradient hero with counters, briefing card, then a card with filter chips and
// day-grouped rows (coloured letter badges like the agent cards).
import { escape } from './markdown.js';
import { visibleFeed, FEED_FILTERS, feedState } from '../shared/feed.js';

const KIND = {approval: ['确', '#f59e0b', '#f97316', '待确认'], task: ['任', '#2f62f5', '#5b8def', '定时任务'], research: ['研', '#7b6cf6', '#a78bfa', '研究'],
  plan: ['划', '#0ea5e9', '#38bdf8', '计划'], chat: ['话', '#4f46e5', '#7b6cf6', '对话'], connector: ['连', '#0d9488', '#2dd4bf', '连接'],
  quant: ['量', '#e11d48', '#fb7185', '量化'], log: ['记', '#94a3b8', '#cbd5e1', '记录']};
// [ux9] details come from Markdown replies: show them as plain text
export const plainDetail = s => String(s ?? '').replace(/```[\s\S]*?(```|$)/g, ' ').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*`>~]+/g, '').replace(/\s+/g, ' ').trim();
const dayOf = t => { const d = new Date(t || 0); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
function dayLabel(day, now = Date.now()) {
  const today = dayOf(now), d = new Date(day);
  return day === today ? '今天' : day === today - 864e5 ? '昨天' : `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function feedPage(state, {action, date, heading, empty, filter = 'all', now = Date.now()}) {
  const all = visibleFeed(state, 'all'), items = filter === 'all' ? all : visibleFeed(state, filter);
  const count = f => f === 'all' ? all.length : visibleFeed(state, f).length;
  const unread = count('unread'), needs = count('action'), today = all.filter(x => dayOf(x.time) === dayOf(now)).length;
  const tabs = `<div class="feed-filters" role="tablist">${FEED_FILTERS.map(([id, label]) => `<button type="button" role="tab" aria-selected="${id === filter}" class="${id === filter ? 'chosen' : ''}" data-action="feedFilter" data-id="${id}">${label}${['unread', 'action'].includes(id) && count(id) ? ` <small>${count(id)}</small>` : ''}</button>`).join('')}</div>`;
  const row = x => {
    const [ch, a, b, label] = KIND[x.kind] || KIND.log;
    return `<div class="feed-row fk-${escape(x.kind)} fs-${escape(x.status)}${x.unread ? ' unread' : ''}" data-feed="${escape(x.id)}"><span class="feed-icon fd-badge" aria-hidden="true" style="background:linear-gradient(135deg,${a},${b})">${ch}</span><div class="feed-body"><b>${escape(x.title)}</b>${x.detail ? `<small>${escape(plainDetail(x.detail))}</small>` : ''}<span class="meta"><em class="fd-kind">${label}</em>${escape(date(x.time))}</span></div><div class="actions">${x.actions.map(a => action(escape(a.label), a.action, a.id, a.kind || 'secondary')).join('')}${x.kind !== 'log' && x.kind !== 'approval' ? action('移除', 'feedDismiss', x.id) : ''}</div></div>`;
  };
  let lastDay = null, rows = '';
  for (const x of items) {
    const d = dayOf(x.time);
    if (d !== lastDay) { const n = items.filter(y => dayOf(y.time) === d).length; rows += `<h3 class="fd-day">${dayLabel(d, now)}<small>${n}</small></h3>`; lastDay = d; }
    rows += row(x);
  }
  const hidden = feedState(state).dismissed.length;
  const tools = action('全部标为已读', 'feedSeen') + (hidden ? action(`恢复已移除（${hidden}）`, 'feedRestore') : '') + action('刷新', 'refresh');
  const desc = `定时任务、待你确认的操作、研究报告、量化信号和后台对话都汇总在这里。${needs ? `当前有 ${needs} 项需要处理。` : unread ? `有 ${unread} 条新动态。` : ''}`;
  const stat = (n, l, cls = '') => `<div class="fd-stat ${cls}"><b>${n}</b><small>${l}</small></div>`;
  const hero = `<section class="fd-hero"><div class="fd-hero-text"><span class="qk-pill">动态 · 每一步都有迹可循</span><h1>每一步，都有迹可循。</h1><p class="subtitle">${desc}</p><div class="fd-tools">${tools}</div></div><div class="fd-stats">${stat(needs, '项待处理', needs ? 'warn' : '')}${stat(unread, '条未读')}${stat(today, '今日动态')}</div></section>`;
  const list = rows || empty(filter === 'all' ? '工作空间已准备好' : '这里暂时没有内容', filter === 'all' ? '运行一个定时任务、做一次深度研究，结果会出现在这里。' : '换一个筛选看看。');
  return `<div class="page feed-page">${hero}<!--briefing--><section class="qk-card fd-card"><div class="qk-card-head"><h2>全部动态<small>${all.length} 条</small></h2></div>${tabs}<div class="feed-list">${list}</div></section></div>`;
}
