import { approvalAge, approvalCard, approvalKind, codingApprovalRequests } from './approval-card.js';
import { backtestDeltas, codingResultStatus, noBacktest } from '../shared/coding-result.js';
import { escape } from './markdown.js';
import { icon } from './icons.js';

const labels = {
  preparing: '准备中', running: '运行中', waiting_permission: '待授权', review: '待合并', no_changes: '无改动',
  merged: '已合并', discarded: '已放弃', failed: '失败', stopped: '已停止',
};
export const codingStatus = status => labels[status] || '未知';
export const codingAgent = agent => agent?.kind === 'builtin' ? '内置' : agent?.name || '—';
export const codingDiffStat = stat => stat ? `${stat.files} 个文件 · +${stat.insertions} / −${stat.deletions}` : '';

// [v1.0.8] Same tones as the Coding task list in 自动化 (.coding-task-status), plus 已合并.
const tone = status => status === 'review' ? 'review' : status === 'merged' ? 'done' : status === 'failed' ? 'failed'
  : ['preparing', 'running', 'waiting_permission'].includes(status) ? 'running' : 'neutral';
const statusPill = status => `<span class="coding-task-status ${tone(status)}" data-coding-status-label>${tone(status) === 'running' ? '<i class="coding-spinner" aria-hidden="true"></i>' : ''}${escape(codingStatus(status))}</span>`;

const STEPS = [['context', '读取上下文', 'book'], ['edit', '修改代码', 'edit'], ['test', '运行测试', 'flask'], ['backtest', '回测对比', 'trend'], ['review', '待合并', 'merge']];
const stateLabel = { done: '已完成', current: '进行中', wait: '等待授权', failed: '未完成', stopped: '已停止', skip: '无改动', todo: '' };

/** Which of the five steps the task has reached, from its status, result and tool calls. */
export function codingSteps(task, status = codingResultStatus(task)) {
  const tools = (task.stream || []).filter(event => event.type === 'tool').map(event => event.text).join('\n');
  const result = task.result;
  let reached = task.status === 'preparing' ? 0 : 1;
  if (result?.tests || /unittest|pytest|运行测试|node --test|npm test/i.test(tools)) reached = 2;
  if (backtestDeltas(result?.backtest).length || /回测|backtest/i.test(tools)) reached = 3;
  if (['review', 'no_changes', 'merged', 'discarded'].includes(status)) reached = 4;
  const end = { merged: 'done', no_changes: 'skip', discarded: 'stopped', failed: 'failed', stopped: 'stopped', waiting_permission: 'wait' }[status] || 'current';
  return STEPS.map(([id, label, glyph], index) => ({ id, label, icon: glyph,
    state: index < reached ? 'done' : index === reached ? end : 'todo' }));
}

function steps(task, status) {
  return `<ol class="ct-steps" aria-label="迭代进度">${codingSteps(task, status).map(step => `<li class="ct-step ${step.state}" data-coding-step="${step.id}" data-state="${step.state}"${step.state === 'current' || step.state === 'wait' ? ' aria-current="step"' : ''}>
<span class="ct-step-icon">${step.state === 'done' ? icon('check') : icon(step.icon)}</span><span class="ct-step-label">${escape(step.label)}</span>${stateLabel[step.state] ? `<small>${stateLabel[step.state]}</small>` : ''}</li>`).join('')}</ol>`;
}

// [v1.0.8] Backtest comparison as a small KPI table; the change column is green when the metric improved.
function comparison(backtest) {
  const rows = backtestDeltas(backtest);
  if (!rows.length) return '<p class="hint">' + noBacktest + '。</p>';
  return `<div class="coding-table ct-kpi-table" data-coding-backtest><table><caption>回测对比</caption><thead><tr><th scope="col">指标</th><th scope="col">修改前</th><th scope="col">修改后</th><th scope="col">变化</th></tr></thead><tbody>
${rows.map(row => `<tr><th scope="row">${escape(row.label)}</th><td>${row.before}</td><td>${row.after}</td><td class="ct-delta ${row.tone}"${row.tone === 'better' ? ' title="改善"' : row.tone === 'worse' ? ' title="变差"' : ''}>${row.delta}</td></tr>`).join('')}</tbody></table></div>`;
}

function diffLines(chunk) {
  return chunk.split('\n').map(line => {
    const kind = /^(\+\+\+|---|diff --git|index )/.test(line) ? 'meta' : line.startsWith('@@') ? 'hunk' : line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'ctx';
    return `<span class="ct-diff-${kind}">${escape(line) || ' '}</span>`;
  }).join('\n');
}

const copyButton = key => `<button type="button" class="ct-copy" data-action="codingCopy" data-id="${escape(key)}" title="复制" aria-label="复制">${icon('copy')}</button>`;

function diffFiles(diff) {
  return diff.split(/(?=^diff --git )/m).filter(Boolean).map((chunk, i) => {
    const name = chunk.split('\n').find(line => line.startsWith('+++ b/'))?.slice(6)
      || chunk.split('\n')[0].replace(/^diff --git /, '') || '补丁';
    const added = (chunk.match(/^\+(?!\+\+)/gm) || []).length, removed = (chunk.match(/^-(?!--)/gm) || []).length;
    return `<details class="ct-block ct-file" data-coding-fold="diff-${i}" data-coding-file="${escape(name)}"><summary>${icon('file')}<span class="ct-block-title">${escape(name)}</span><small class="ct-diffstat"><b class="add">+${added}</b> <b class="del">−${removed}</b></small></summary>
<div class="ct-code">${copyButton('diff-' + i)}<pre class="ct-diff">${diffLines(chunk)}</pre></div></details>`;
  }).join('');
}

const TOOL_STATUS = { pending: '等待', in_progress: '进行中', completed: '完成', failed: '失败' };

/** Tool calls arrive as one event per status change; consecutive events for the same call become one block. */
function streamBlocks(stream) {
  const blocks = [];
  for (const event of stream || []) {
    const previous = blocks.at(-1);
    if (event.type === 'text' && previous?.type === 'text') { previous.text += event.text; continue; }
    if (event.type === 'tool') {
      const match = /^([\s\S]*?)(?: · (pending|in_progress|completed|failed))?$/.exec(event.text || '');
      const title = (match?.[1] || event.text || '').trim(), state = match?.[2] || '';
      if (previous?.type === 'tool' && previous.title === title) { previous.state = state || previous.state; previous.text += '\n' + event.text; continue; }
      blocks.push({ ...event, title, state });
      continue;
    }
    blocks.push({ ...event });
  }
  return blocks;
}

function streamView(stream, { date, markdown }) {
  return streamBlocks(stream).map((item, index) => {
    const key = `stream-${index}-${item.at}`;
    if (item.type === 'text') {
      return `<section class="ct-msg" data-coding-fold="${key}" data-coding-output="text"><div class="ct-msg-head">${icon('agent')}<span>代理输出</span><time>${escape(date(item.at))}</time></div>
<div class="ct-msg-body markdown">${markdown(item.text)}</div></section>`;
    }
    if (item.type === 'permission') {
      return `<div class="ct-event ct-event-permission" data-coding-fold="${key}" data-coding-output="permission">${icon('shield')}<span>授权请求：${escape(item.text)}</span><time>${escape(date(item.at))}</time></div>`;
    }
    if (item.type === 'plan') {
      const entries = String(item.text || '').split('\n').filter(Boolean).map(line => {
        const [state, ...rest] = line.split(' · ');
        return `<li class="${escape(state)}">${escape(rest.join(' · ') || state)}</li>`;
      }).join('');
      return `<details class="ct-block ct-plan" data-coding-fold="${key}" data-coding-output="plan" open><summary>${icon('grid')}<span class="ct-block-title">计划</span><time>${escape(date(item.at))}</time></summary><ol class="ct-plan-list">${entries}</ol></details>`;
    }
    const glyph = item.type === 'error' ? 'alert' : /命令|python|node|npm|git |bash|sh /i.test(item.title || item.text) ? 'terminal' : 'settings';
    const state = item.type === 'error' ? 'failed' : item.state;
    const title = item.type === 'error' ? '错误' : item.title || '工具调用';
    return `<details class="ct-block ct-tool${state ? ' ' + escape(state) : ''}" data-coding-fold="${key}" data-coding-output="${item.type === 'error' ? 'error' : 'tool'}"${state ? ` data-state="${escape(state)}"` : ''}><summary>${icon(glyph)}<span class="ct-block-title">${escape(title)}</span>${state ? `<span class="ct-tool-state">${escape(TOOL_STATUS[state] || state)}</span>` : ''}<time>${escape(date(item.at))}</time></summary>
<div class="ct-code">${copyButton(key)}<pre>${escape(item.text)}</pre></div></details>`;
  }).join('');
}

const paragraphs = text => String(text || '').split(/\n{2,}/).map(part => `<p>${escape(part).replace(/\n/g, '<br>')}</p>`).join('');
const KIND_ICON = { command: 'terminal', file: 'file', network: 'globe' };

// [v1.0.8] Permission requests sit in one sticky line above the page instead of full cards that push the output
// down. While a request waits the line is amber and carries that request's buttons inline; clicking the line opens
// every card (including decided ones) as an overlay. 前往授权 opens it too.
function approvalStrip(approvals, action) {
  if (!approvals.length) return '';
  const pending = approvals.filter(request => !request.decision);
  const done = approvals.filter(request => request.decision);
  const first = pending[0];
  const label = first ? '需要你的授权 · ' + (first.action || '执行工具操作') + (pending.length > 1 ? ` 等 ${pending.length} 项` : '')
    : `授权记录 ${done.length} 条`;
  const kind = first ? approvalKind(first) : '';
  const age = first ? approvalAge(first) : null;
  return `<details class="coding-approval-bar" data-coding-fold="approvals" data-coding-approvals${first ? ` data-pending data-kind="${kind}"` : ''}${age !== null ? ` data-fresh style="--qk-age:-${age}ms"` : ''}>
<summary>${icon(first ? KIND_ICON[kind] || 'shield' : 'shield')}<span class="coding-approval-label" title="${escape(label)}">${escape(label)}</span>${first ? approvalCard(first, action, { compact: true }) : '<small>查看</small>'}</summary>
<div class="coding-approval-list">${[...pending, ...done].map(request => approvalCard(request, action)).join('')}</div></details>`;
}

export function codingTaskPage(task, { action, date, approvals = task ? codingApprovalRequests(task) : [], markdown = paragraphs }) {
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
    + (discardable ? action('放弃', 'codingTaskDiscard', id, 'danger') : '')
    + (stoppable ? action('停止', 'codingTaskStop', id) : '');
  const stream = streamView(task.stream, { date, markdown });
  return `<article class="coding-task-page" data-coding-task="${escape(id)}" data-coding-status="${escape(status)}">
<header class="ct-head" data-coding-head><div class="ct-title"><h2>${escape(task.title)}</h2>${statusPill(status)}</div>
<p class="ct-meta"><span>${icon('agent')}${escape(codingAgent(task.agent))}</span>${task.branch ? `<span>${icon('branch')}<code>${escape(task.branch)}</code></span>` : ''}<span>${icon('clock')}${escape(date(task.updatedAt))}</span></p>
${task.fallbackReason ? `<p class="hint">${escape(task.fallbackReason)}</p>` : ''}</header>
${approvalStrip(approvals, action)}
${steps(task, status)}
${task.error ? `<p class="coding-failure ct-alert" role="alert">${icon('alert')}${escape(task.error.message)}</p>` : ''}
<details class="ct-block ct-request" data-coding-fold="request"><summary>${icon('chat')}<span class="ct-block-title">原始需求</span></summary><div class="ct-request-body">${paragraphs(task.request)}</div></details>
${result ? `<section class="coding-result ct-card" data-coding-result><h3>迭代结果</h3>
<p class="ct-chips"><span class="ct-chip">${icon('file')}${escape(codingDiffStat(result.diffStat))}</span>${result.tests ? `<span class="ct-chip ${result.tests.ok ? 'coding-success' : 'coding-failure'}">${icon(result.tests.ok ? 'check' : 'alert')}<strong>${result.tests.ok ? '测试通过' : '测试失败'}</strong> · ${escape(result.tests.summary)}</span>` : '<span class="ct-chip hint">报告中没有测试结果</span>'}</p>
${comparison(result.backtest)}
${result.recoveryNote ? `<p class="hint">${escape(result.recoveryNote)}</p>` : ''}
${result.mergeNote ? `<p class="hint">${escape(result.mergeNote)}</p>` : ''}
${result.reportPath ? `<p class="ct-report">${action(escape('.quank/reports/' + id + '.md'), 'codingTaskReport', id)}</p>` : ''}
${result.diff ? `<h4>文件改动</h4>${diffFiles(result.diff)}` : ''}</section>` : ''}
<section class="ct-stream" data-coding-stream><h3>运行输出</h3>${stream || '<p class="hint">等待代理输出。</p>'}</section>
${buttons ? `<footer class="toolbar coding-task-actions ct-actions" data-coding-actions>${buttons}</footer>` : ''}
</article>`;
}
