import { escape } from './markdown.js';

const results = {
  allow: '✓ 已允许一次', confirmed: '✓ 已确认', always: '✓ 本任务内已允许', deny: '✕ 已拒绝',
  cancelled: '✕ 已取消', acknowledged: '✓ 已确认记录',
};

export function approvalCard(request, action) {
  const { requestId, decision, finishedAt, highRisk, network, onceOnly, taskLabel, promptChoices } = request;
  const stamp = finishedAt ? new Date(finishedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
  const title = request.agent + ' 需要你的授权：' + request.action;
  const attr = `data-approval-id="${escape(requestId)}" tabindex="-1"`;
  if (decision) {
    const result = decision === 'allow' && highRisk ? 'confirmed' : decision;
    return `<div class="inline-approval-result" ${attr} aria-label="${escape(title)}">${results[result] || results.allow}${stamp ? ' · ' + escape(stamp) : ''}</div>`;
  }
  const choices = request.choices || ['deny', 'allow', ...(taskLabel ? ['always'] : [])];
  const label = { deny: '拒绝', allow: highRisk ? '确认' : '允许一次', always: '本任务内允许', ...promptChoices };
  const buttons = choices.filter(choice => choice !== 'always' || (!highRisk && !onceOnly)).map(choice =>
    action(escape(label[choice]), 'approvalDecision', requestId + ':' + choice, choice === 'always' ? 'primary' : 'secondary')).join('');
  const note = network && onceOnly ? '联网授权仅限本次命令' : !highRisk ? taskLabel : '';
  return `<section class="inline-approval-card" ${attr} aria-label="${escape(title)}">
    <header><h3>${escape(title)}</h3>${network ? '<span class="inline-approval-network">需要联网</span>' : ''}</header>
    <pre class="inline-approval-summary">${escape(request.summary || '')}</pre>
    ${action('展开', 'approvalExpand', requestId)}
    <div class="inline-approval-actions">${buttons}</div>
    ${note ? `<small>${escape(note)}</small>` : ''}</section>`;
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
  return `<div class="inline-approval-bar"><span role="status" title="${escape([label, ...sources].join(' · '))}">${escape(label)}${sources.length ? `<small title="${escape(sources.join('、'))}"> · ${escape(sources.join('、'))}</small>` : ''}</span>${action('前往授权', 'approvalJump', first.requestId)}${all}</div>`;
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
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  card.focus({ preventScroll: true });
  card.classList.remove('inline-approval-highlight');
  void card.offsetWidth;
  card.classList.add('inline-approval-highlight');
  return true;
}
