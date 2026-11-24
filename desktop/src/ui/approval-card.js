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

export function approvalBar(requests, chatId, action) {
  const pending = pendingApprovalRequests(requests);
  const first = pending[0];
  if (!first) return '';
  const label = pending.length === 1 ? first.agent + ' 需要你的授权：' + first.action : pending.length + ' 项待授权';
  const sources = [...new Set(pending.filter(request => !chatId || request.chatId !== chatId || request.codingTaskId).map(request => request.source).filter(Boolean))];
  return `<div class="inline-approval-bar"><span role="status" title="${escape([label, ...sources].join(' · '))}">${escape(label)}${sources.length ? `<small title="${escape(sources.join('、'))}"> · ${escape(sources.join('、'))}</small>` : ''}</span>${action('前往授权', 'approvalJump', first.requestId)}</div>`;
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
