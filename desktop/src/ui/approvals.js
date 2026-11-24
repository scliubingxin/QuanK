// [p2-m2] Approval rules and items waiting for the user (from unattended scheduled runs). Pure HTML builders.
import { escape } from './markdown.js';

const KIND = {browser: '网站', cli: '命令', document: '文档', skill: 'Skill', mcp: 'MCP', vector: '本机检索'};

export function pendingApprovalsPanel(state, {action, date}) {
  const items = state.pendingApprovals || [];
  if (!items.length) return '';
  const taskName = id => state.tasks?.find(t => t.id === id)?.name;
  return `<section class="approval-panel pending" id="pending-approvals"><div class="approval-head"><h2>待你确认 <small>${items.length}</small></h2>${action('全部忽略', 'dismissPending')}</div><p class="description">定时任务在无人值守时遇到需要确认的操作，没有执行，记在这里。可以「总是允许」同类操作（下次自动执行），或忽略。点击、填写、修改和删除类操作每次都需要你在场确认，不能设为总是允许。</p>${items.map(x => `<div class="approval-row"><div><b>${escape(x.title)}</b>${taskName(x.taskId) ? `<span class="approval-task">${escape(taskName(x.taskId))}</span>` : ''}<small>${escape(x.candidate?.label || x.detail.split('\n')[0] || '')}</small><small class="meta">${escape(date(x.time))}</small></div><div class="actions">${x.chatId && state.chats?.some(c => c.id === x.chatId) ? action('查看对话', 'openChat', x.chatId) : ''}${x.candidate ? action('总是允许', 'allowPending', x.id, 'primary') + (x.taskId ? action('仅此任务允许', 'allowPendingTask', x.id) : '') : ''}${action('忽略', 'dismissPending', x.id)}</div></div>`).join('')}</section>`;
}

export function approvalRulesPanel(state, {action, date}) {
  // [ux8] one compact line per rule; first 6 shown, the rest folded
  const now = Date.now(), rules = (state.approvalRules || []).filter(r => !r.expires || r.expires > now);
  const taskName = id => state.tasks?.find(t => t.id === id)?.name;
  const target = r => String(r.label || '').replace(/^(网站|读取文档|运行命令|命令|文档|连接 ?MCP|MCP ?工具|Skill|本机检索)\s+/, '');
  const row = r => `<div class="rule-row"><span class="rule-kind k-${escape(r.kind)}">${KIND[r.kind] || escape(r.kind)}</span><span class="rule-target" title="${escape(r.label)}">${escape(target(r))}${r.taskId ? `<span class="approval-task">仅限：${escape(taskName(r.taskId) || '已删除的任务')}</span>` : ''}</span><span class="rule-meta">已使用 ${r.uses || 0} 次${r.lastUsed ? ' · 最近 ' + escape(date(r.lastUsed)) : ''} · ${r.expires ? escape(date(r.expires)) + ' 到期' : '长期有效'}</span><button type="button" class="link-danger" data-action="removeApprovalRule" data-id="${escape(r.id)}">撤销</button></div>`;
  const head = `<div class="approval-head"><h2>总是允许的规则 <small>${rules.length}</small></h2>${rules.length ? action('全部撤销', 'clearApprovalRules', '', 'danger') : ''}</div><p class="description short">只覆盖低风险、可重复的只读操作（打开和读取指定网站、固定参数的只读命令、读取指定文档、只读的 MCP / Skill、本机检索）。命中规则会直接执行，每次都写入执行记录。</p>`;
  if (!rules.length) return `<section class="approval-panel rules">${head}<p class="empty-note">当前没有已保存的审批规则。</p></section>`;
  return `<section class="approval-panel rules">${head}${rules.slice(0, 6).map(row).join('')}${rules.length > 6 ? `<details class="rule-more"><summary>显示其余 ${rules.length - 6} 条</summary>${rules.slice(6).map(row).join('')}</details>` : ''}</section>`;
}

/** Small banner for the tasks page when scheduled runs left work for the user. */
export function pendingBanner(state, action) {
  const n = (state.pendingApprovals || []).length;
  return n ? `<div class="banner warn">定时任务有 ${n} 项操作在等你确认，本次没有执行。${action('去处理', 'gotoPending')}</div>` : '';
}
