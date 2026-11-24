import { approvalCard, codingApprovalRequests } from './approval-card.js';
import { backtestRows, codingResultStatus, noBacktest } from '../shared/coding-result.js';
import { escape } from './markdown.js';

const labels = {
  preparing: '准备中', running: '运行中', waiting_permission: '待授权', review: '待合并', no_changes: '无改动',
  merged: '已合并', discarded: '已放弃', failed: '失败', stopped: '已停止',
};
const streamLabels = { text: '代理输出', tool: '工具调用', plan: '计划', permission: '授权请求', error: '错误' };
export const codingStatus = status => labels[status] || '未知';
export const codingAgent = agent => agent?.kind === 'builtin' ? '内置' : agent?.name || '—';
export const codingDiffStat = stat => stat ? `${stat.files} 个文件 · +${stat.insertions} / −${stat.deletions}` : '';

function comparison(backtest) {
  const rows = backtestRows(backtest ?? {});
  if (!rows.length) return '<p class="hint">' + noBacktest + '。</p>';
  return `<div class="coding-table"><table><caption>回测对比</caption><thead><tr><th scope="col">指标</th><th scope="col">修改前</th><th scope="col">修改后</th></tr></thead><tbody>
${rows.map(([name, before, after]) => `<tr><th scope="row">${escape(name)}</th><td>${before}</td><td>${after}</td></tr>`).join('')}</tbody></table></div>`;
}

function diffFiles(diff) {
  return diff.split(/(?=^diff --git )/m).filter(Boolean).map((chunk, i) => {
    const name = chunk.split('\n').find(line => line.startsWith('+++ b/'))?.slice(6)
      || chunk.split('\n')[0].replace(/^diff --git /, '') || '补丁';
    return `<details data-coding-fold="diff-${i}"><summary>${escape(name)}</summary><pre>${escape(chunk)}</pre></details>`;
  }).join('');
}

export function codingTaskPage(task, { action, date, approvals = task ? codingApprovalRequests(task) : [] }) {
  if (!task) return '<div class="pp-same"><p>找不到 Coding 任务。</p></div>';
  const { id, result } = task;
  const status = codingResultStatus(task);
  const noChanges = status === 'no_changes';
  const reviewing = status === 'review';
  const stoppable = ['preparing', 'running', 'waiting_permission'].includes(task.status);
  const discardable = task.branch && ['review', 'no_changes', 'failed', 'stopped'].includes(status) && task.error?.kind !== 'merge_sync';
  const mergeLabel = task.strategyProject === false ? '合并' : '合并并重启引擎';
  const buttons = (noChanges ? `<button type="button" class="secondary" disabled>${mergeLabel}</button>`
    : reviewing ? action(mergeLabel, 'codingTaskMerge', id, 'primary') : '')
    + ((reviewing || noChanges) && !['merge', 'merge_sync'].includes(task.error?.kind) ? action('继续修改', 'codingTaskFollowup', id) : '')
    + (discardable ? action('放弃', 'codingTaskDiscard', id) : '')
    + (stoppable ? action('停止', 'codingTaskStop', id) : '');
  const blocks = [];
  for (const event of task.stream || []) {
    const previous = blocks.at(-1);
    if (previous?.type === 'text' && event.type === 'text') previous.text += event.text;
    else blocks.push({ ...event });
  }
  const stream = blocks.map((item, index) => item.type === 'text'
    ? `<details open data-coding-fold="stream-${index}-${item.at}"><summary>代理输出</summary><pre class="coding-output">${escape(item.text)}</pre></details>`
    : `<details data-coding-fold="stream-${index}-${item.at}"><summary>${escape(streamLabels[item.type] || '输出')} · ${escape(date(item.at))}</summary><pre>${escape(item.text)}</pre></details>`).join('');
  return `<article class="coding-task-page">
<header><h2>${escape(task.title)}</h2><p>${escape(codingStatus(status))} · ${escape(codingAgent(task.agent))} · ${escape(date(task.updatedAt))}</p>
${task.fallbackReason ? `<p class="hint">${escape(task.fallbackReason)}</p>` : ''}
${task.branch ? `<code>${escape(task.branch)}</code>` : ''}</header>
<details data-coding-fold="request"><summary>原始需求</summary><pre>${escape(task.request)}</pre></details>
${task.error ? `<p class="coding-failure" role="alert">${escape(task.error.message)}</p>` : ''}
${approvals.map(request => approvalCard(request, action)).join('')}
${buttons ? `<div class="toolbar coding-task-actions">${buttons}</div>` : ''}
${result ? `<section class="coding-result"><h3>迭代结果</h3><p>${escape(codingDiffStat(result.diffStat))}</p>
${result.tests ? `<p class="${result.tests.ok ? 'coding-success' : 'coding-failure'}"><strong>${result.tests.ok ? '✓ 测试通过' : '✕ 测试失败'}</strong> · ${escape(result.tests.summary)}</p>` : '<p class="hint">报告中没有测试结果。</p>'}
${comparison(result.backtest)}
${result.recoveryNote ? `<p class="hint">${escape(result.recoveryNote)}</p>` : ''}
${result.mergeNote ? `<p class="hint">${escape(result.mergeNote)}</p>` : ''}
${result.reportPath ? `<p class="hint">${action(escape('.quank/reports/' + id + '.md'), 'codingTaskReport', id)}</p>` : ''}
${result.diff ? `<h4>文件改动</h4>${diffFiles(result.diff)}` : ''}</section>` : ''}
<section><h3>运行输出</h3>${stream || '<p class="hint">等待代理输出。</p>'}</section>
</article>`;
}
