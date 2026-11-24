import { approvalRisk } from './inline-approval.mjs';

export function createApprover({ approvals, context = () => ({}) }) {
  let taskGrants = new WeakMap();
  async function approve(title, detail, signal, scope = {}) {
    const { browserScope, documentReadScope, ruleScope } = scope;
    if (browserScope?.origin.length > 200) throw Error('网站地址过长，无法安全确认');
    if (String(detail).length > 1000 || String(detail).split('\n').length > 20)
        throw Error('确认信息过长，已阻止操作。请缩短参数或拆分修改批次');
    signal?.throwIfAborted();
    const key = ruleScope && JSON.stringify(ruleScope);
    if (!scope.highRisk && !approvalRisk(title) && key && signal && taskGrants.get(signal)?.has(key)) return true;
    const taskLabel = browserScope ? `本任务内适用于 ${browserScope.origin}。` : documentReadScope
        ? '本任务内仅适用于此文档的当前版本。' : key && signal ? '仅在当前任务内对相同操作有效。' : undefined;
    const decision = await approvals.request(title, detail, signal, {
        ...context(), ...scope, taskLabel, network: scope.network || !!browserScope || /联网|网站/.test(title),
    });
    if (decision !== 'always') return decision === 'allow';
    if (browserScope) return { allowed: true, browserTask: true };
    if (documentReadScope) return { allowed: true, documentTask: true };
    if (!taskGrants.has(signal)) taskGrants.set(signal, new Set());
    taskGrants.get(signal).add(key);
    return true;
  }
  approve.cancelAll = () => { taskGrants = new WeakMap(); approvals.cancelAll(); };
  return approve;
}
