import { escape } from './markdown.js';
import { icon } from './icons.js';

const results = {
  allow: '✓ 已允许一次', confirmed: '✓ 已确认', always: '✓ 本任务内已允许', deny: '✕ 已拒绝',
  cancelled: '✕ 已取消', acknowledged: '✓ 已确认记录',
};
const KIND_ICON = { command: 'terminal', file: 'file', network: 'globe', other: 'shield' };
const FRESH_MS = 4000;

/** [v1.0.8] What a request asks for: a command, a file change, network access or something else. */
export function approvalKind(request = {}) {
  const text = [request.kind, request.action, request.summary].filter(Boolean).join(' ');
  if (request.network || /联网|network|fetch/i.test(text)) return 'network';
  if (/命令|终端|terminal|execute|command|python|node |npm |git /i.test(text)) return 'command';
  if (/文件|write|edit|delete|move|写入|删除|移动/i.test(text)) return 'file';
  return 'other';
}

// [v1.0.8] 允许一次 is the solid brand button, 本任务内允许 secondary and 拒绝 an outlined danger button;
// the primary choice sits on the right, as in system dialogs.
const VARIANT = { deny: 'danger', always: 'secondary', allow: 'primary' };
const ORDER = { deny: 0, always: 1, allow: 2 };

function decisionButtons(request, action) {
  const { requestId, highRisk, onceOnly, taskLabel, promptChoices } = request;
  const choices = request.choices || ['deny', 'allow', ...(taskLabel ? ['always'] : [])];
  const label = { deny: '拒绝', allow: highRisk ? '确认' : '允许一次', always: '本任务内允许', ...promptChoices };
  return choices.filter(choice => choice !== 'always' || (!highRisk && !onceOnly))
    .sort((a, b) => (ORDER[a] ?? 1) - (ORDER[b] ?? 1))
    .map(choice => action(escape(label[choice]), 'approvalDecision', requestId + ':' + choice, VARIANT[choice] || 'secondary')).join('');
}

export function approvalCard(request, action, { compact = false, now = Date.now() } = {}) {
  const { requestId, decision, finishedAt, highRisk, network, onceOnly, taskLabel } = request;
  const stamp = finishedAt ? new Date(finishedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
  const title = request.agent + ' 需要你的授权：' + request.action;
  const kind = approvalKind(request);
  const age = approvalAge(request, now);
  const fresh = age !== null ? ' fresh' : '';
  const attr = `data-approval-id="${escape(requestId)}" data-kind="${kind}" tabindex="-1"${decision ? '' : ' data-approval-pending'}${age !== null ? ` style="--qk-age:-${age}ms"` : ''}`;
  if (decision) {
    const result = decision === 'allow' && highRisk ? 'confirmed' : decision;
    return `<div class="inline-approval-result ${result === 'deny' || result === 'cancelled' ? 'denied' : 'allowed'}" ${attr} aria-label="${escape(title)}">${results[result] || results.allow}${stamp ? ' · ' + escape(stamp) : ''}<span class="inline-approval-what">${escape(request.action || '')}</span></div>`;
  }
  if (compact) return `<span class="inline-approval-compact inline-approval-actions" ${attr}>${decisionButtons(request, action)}</span>`;
  const note = network && onceOnly ? '联网授权仅限本次命令' : !highRisk ? taskLabel : '';
  return `<section class="inline-approval-card${fresh}" ${attr} role="group" aria-label="${escape(title)}">
    <header><span class="inline-approval-icon">${icon(KIND_ICON[kind])}</span><h3>${escape(title)}</h3>${network ? '<span class="inline-approval-network">需要联网</span>' : ''}${highRisk ? '<span class="inline-approval-network risk">需确认</span>' : ''}</header>
    <pre class="inline-approval-summary">${escape(request.summary || '')}</pre>
    ${action('展开', 'approvalExpand', requestId)}
    <div class="inline-approval-actions">${decisionButtons(request, action)}</div>
    ${note ? `<small>${escape(note)}</small>` : ''}</section>`;
}

/** [v1.0.8] Milliseconds since a pending request appeared while it is still new (null otherwise). The pulse uses it as a
 *  negative animation delay, so a page that is re-rendered while the request is new does not restart the pulse. */
export function approvalAge(request = {}, now = Date.now()) {
  return !request.decision && Number.isFinite(request.time) && now - request.time >= 0 && now - request.time < FRESH_MS ? Math.round(now - request.time) : null;
}

export function pendingApprovalRequests(requests) {
  return requests.filter(request => !request.decision).sort((a, b) => a.time - b.time);
}

// [v1.0.4] 工作台首发页不再画任何授权卡：待处理的只在输入框上方的「N 项待授权」条里出现，
// 已拒绝/已允许这类已处理记录只在它所属的对话里显示。以前 homeContent 会把没有对话归属的
// 审批（含 5 条已拒绝）全部堆在 hero 上方。这里只决定画哪些卡，不改动任何存储的审批记录。
export function homeApprovalCards() { return []; }

/** Cards drawn inside one conversation: only approvals that belong to that conversation. */
export function conversationApprovalCards(requests, chatId) {
  if (!chatId) return [];
  return (requests || []).filter(request => request.chatId === chatId);
}

export function approvalBar(requests, chatId, action) {
  // [v1.0.6] In a conversation its own pending cards are already on screen under the steps, so the bar
  // only lists approvals that live elsewhere (other chats, Coding tasks, orders, Office).
  const pending = pendingApprovalRequests(requests).filter(request => !chatId || request.chatId !== chatId || request.codingTaskId);
  const first = pending[0];
  if (!first) return '';
  const label = pending.length === 1 ? first.agent + ' 需要你的授权：' + first.action : pending.length + ' 项待授权';
  const sources = [...new Set(pending.map(request => request.source).filter(Boolean))];
  // [v1.0.4] 前往授权 goes to the first pending item; with two or more the bar also offers 查看全部.
  const all = pending.length > 1 ? action('查看全部', 'approvalAll', '') : '';
  return `<div class="inline-approval-bar" data-kind="${approvalKind(first)}"><span class="inline-approval-icon">${icon('shield')}</span><span role="status" title="${escape([label, ...sources].join(' · '))}">${escape(label)}${sources.length ? `<small title="${escape(sources.join('、'))}"> · ${escape(sources.join('、'))}</small>` : ''}</span>${action('前往授权', 'approvalJump', first.requestId, 'primary')}${all}</div>`;
}

export function codingApprovalRequests(task) {
  const prefix = { agent: 'Coding 智能体', codingTaskId: task.id, chatId: task.chatId, source: task.title, channel: 'coding' };
  return [...(task.permissionHistory || []), ...(task.pendingPermission ? [task.pendingPermission] : [])].map(request => ({
    ...prefix, ...request,
    action: request.action || '执行工具操作',
    taskLabel: request.highRisk || request.onceOnly ? undefined : '授权在本 Coding 任务结束时失效。',
  }));
}

export function revealApproval(root, requestId) {
  const card = [...root.querySelectorAll('[data-approval-id]')].find(element => element.dataset.approvalId === requestId);
  if (!card) return false;
  const fold = card.closest('details'); // [v1.0.8] Coding approvals live in a collapsed bar
  if (fold && !fold.open) fold.open = true;
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  card.focus({ preventScroll: true });
  card.classList.remove('inline-approval-highlight');
  void card.offsetWidth;
  card.classList.add('inline-approval-highlight');
  return true;
}
