// [p1-m5] Plan card: editable while draft, live step status while running. Pure HTML builder + DOM reader.
// [p1-m6] Research plans show the sub-question outline, source count and the saved report.
import { escape } from './markdown.js';

const STATUS = {pending: ['○', '待执行'], running: ['●', '执行中'], done: ['✓', '已完成'], failed: ['✗', '失败'], skipped: ['–', '已跳过'], cancelled: ['–', '已停止']};
const PLAN_STATUS = {draft: '待确认', running: '执行中', done: '已完成', failed: '未完成', cancelled: '已停止', discarded: '已放弃'};
const REPORT_TITLE = '撰写研究报告';

export function planCard(plan, action) {
  if (!plan || plan.status === 'discarded') return '';
  const research = plan.kind === 'research';
  const done = plan.steps.filter(s => s.status === 'done').length;
  const head = `<div class="plan-head"><b>${research ? '深度研究' : '计划'}</b><span class="plan-status ${escape(plan.status)}">${PLAN_STATUS[plan.status] || ''}</span>${plan.status !== 'draft' ? `<small>${done}/${plan.steps.length} 步完成${research && plan.sources?.length ? ` · ${plan.sources.length} 个来源` : ''}</small>` : ''}</div>`;
  if (plan.status === 'draft') {
    const rows = plan.steps.map((s, i) => research && s.title === REPORT_TITLE && i === plan.steps.length - 1
      ? `<li class="plan-step fixed"><span class="plan-no">${i + 1}</span><div><b>${escape(s.title)}</b><small>${escape(s.detail || '')}（自动追加，完成后保存到成果中心）</small></div></li>`
      : `<li class="plan-step edit" data-plan-step="${i}"><span class="plan-no">${i + 1}</span><div class="plan-fields"><input data-plan-field="title" maxlength="80" value="${escape(s.title)}" aria-label="第 ${i + 1} 步名称"><textarea data-plan-field="detail" maxlength="1000" rows="2" aria-label="第 ${i + 1} 步说明" placeholder="${research ? '检索要点（可选）' : '具体要求（可选）'}">${escape(s.detail || '')}</textarea></div><button type="button" class="plan-remove" data-action="planRemoveStep" data-id="${i}" aria-label="删除第 ${i + 1} 步" ${plan.steps.filter(x => !(research && x.title === REPORT_TITLE)).length <= 1 ? 'disabled' : ''}>×</button></li>`).join('');
    const note = research
      ? '下面是研究大纲：每个子问题会联网检索并阅读网页（打开网页按浏览器权限确认），最后汇总成带引用的报告。确认前可以修改、增删子问题。'
      : `确认前可以修改、增删步骤；开始后会按顺序逐步执行，每一步都使用正常的工具审批。${plan.toolsEnabled ? '' : '当前未开启工具模式，各步只能基于对话作答。'}`;
    return `<section class="plan-card${research ? ' research' : ''}" data-plan="${escape(plan.id)}">${head}<p class="plan-note">${note}</p><ol class="plan-steps">${rows}</ol><div class="actions">${action(research ? '＋ 添加子问题' : '＋ 添加步骤', 'planAddStep')}${action(research ? '开始研究' : '开始执行', 'planRun', '', 'primary')}${action('放弃', 'planDiscard')}</div></section>`;
  }
  const rows = plan.steps.map((s, i) => { const [mark, label] = STATUS[s.status] || STATUS.pending; return `<li class="plan-step ${escape(s.status)}"><span class="plan-mark" aria-label="${label}">${mark}</span><div><b>${i + 1}. ${escape(s.title)}</b>${s.detail ? `<small>${escape(s.detail)}</small>` : ''}${s.error ? `<small class="plan-error">${escape(s.error)}</small>` : ''}</div><span class="plan-step-status">${label}</span></li>`; }).join('');
  const report = plan.report ? `<div class="plan-report"><span>📄 ${escape(plan.report.name)}</span>${action('打开报告', 'documentWordEditor', plan.report.id, 'primary')}${action('在成果中心查看', 'navigateLibrary')}</div>` : '';
  const error = plan.error ? `<p class="plan-error">${escape(plan.error)}</p>` : '';
  return `<section class="plan-card${research ? ' research' : ''}" data-plan="${escape(plan.id)}">${head}<ol class="plan-steps">${rows}</ol>${error}${report}${plan.status === 'running' ? `<div class="actions">${action(research ? '停止研究' : '停止计划', 'planCancel', '', 'danger')}</div>` : ['failed', 'cancelled'].includes(plan.status) ? `<div class="actions">${action('从未完成的步骤继续', 'planResume', '', 'primary')}</div>` : ''}</section>`;
}

/** Read the edited steps back from the draft card (the fixed research report step is re-added by the service). */
export function readPlanSteps(root) {
  return [...root.querySelectorAll('.plan-step.edit')].map(li => ({title: li.querySelector('[data-plan-field="title"]').value, detail: li.querySelector('[data-plan-field="detail"]').value}));
}
