// [p2-m1] Scheduled tasks: editor form and task cards. Pure HTML builders.
import { escape } from './markdown.js';
import { describeSchedule, WEEKDAY_NAMES } from '../shared/schedule.js';

const LIVE = ['queued', 'running', 'cancelling'];
const STATUS = {ready: '待执行', done: '已完成', running: '执行中', queued: '排队中', cancelling: '正在停止', failed: '失败', cancelled: '已停止', denied: '已拒绝'};
const KINDS = [['manual', '仅手动运行'], ['once', '仅一次'], ['hourly', '每隔几小时'], ['daily', '每天'], ['weekdays', '工作日（周一至周五）'], ['weekly', '每周指定日']];
const pad = n => String(n).padStart(2, '0');
const localInput = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function taskForm(state, task = null, now = Date.now()) {
  const s = task?.schedule || {kind: 'daily', time: '09:00'};
  const agents = state.agents.map(a => `<option value="${escape(a.id)}" ${a.id === (task?.agentId || 'assistant') ? 'selected' : ''}>${escape(a.name)}</option>`).join('');
  const days = (s.days || [1]).map(Number);
  return `<div class="task-form" data-kind="${escape(s.kind)}">
<label>任务名称<input name="name" maxlength="100" required value="${escape(task?.name || '')}" placeholder="例如：每日行业早报"></label>
<label>要做什么<textarea name="prompt" required placeholder="像对助手说话一样描述任务，例如：整理昨天以来储能行业的重要新闻，列 5 条，每条附来源链接。">${escape(task?.prompt || '')}</textarea></label>
<div class="task-form-row"><label>智能体<select name="agentId">${agents}</select></label><label>执行频率<select name="scheduleKind" data-schedule-kind>${KINDS.map(([v, t]) => `<option value="${v}" ${v === s.kind ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
<div class="task-form-row">
<label class="f-time">时刻<input name="scheduleTime" type="time" value="${escape(s.time || '09:00')}"></label>
<label class="f-every">间隔（小时）<input name="scheduleEvery" type="number" min="1" max="24" value="${escape(String(s.every || 4))}"></label>
<label class="f-at">执行时间<input name="scheduleAt" type="datetime-local" value="${localInput(s.at || now + 3600e3)}"></label>
</div>
<fieldset class="f-days"><legend>每周哪几天</legend>${[1, 2, 3, 4, 5, 6, 0].map(d => `<label class="check"><input type="checkbox" name="scheduleDays" value="${d}" ${days.includes(d) ? 'checked' : ''}>周${WEEKDAY_NAMES[d]}</label>`).join('')}</fieldset>
<label class="check"><input type="checkbox" name="toolsEnabled" ${task?.toolsEnabled ? 'checked' : ''}>允许使用工具（联网、浏览器、文档、本机命令）</label>
<p class="task-form-note">任务在应用运行时按本机时间执行；电脑休眠或应用退出期间错过的，恢复后补执行一次。需要确认的操作会弹出确认框，60 秒无人确认自动取消。每次运行的完整过程保存在任务自己的对话里。</p>
</div>`;
}

/** FormData → payload for the workspace task handler. */
export function taskPayload(f, id) {
  return {...(id ? {id, edit: true} : {}), name: f.get('name'), prompt: f.get('prompt'), agentId: f.get('agentId'), toolsEnabled: f.has('toolsEnabled'),
    schedule: {kind: f.get('scheduleKind'), time: f.get('scheduleTime'), every: Number(f.get('scheduleEvery')), days: f.getAll('scheduleDays').map(Number), at: f.get('scheduleAt')}};
}

function history(t, date) {
  const h = (t.history || []).slice(0, 8);
  if (!h.length) return '';
  return `<div class="task-history" aria-label="最近运行">${h.map(r => `<span class="run-dot ${escape(r.status)}" title="${escape(date(r.at))} · ${escape(STATUS[r.status] || r.status)}${r.error ? ' · ' + escape(r.error) : ''}"></span>`).join('')}<small>最近 ${h.length} 次</small></div>`;
}

export function taskCards(state, {action, date}) {
  return `<div class="cards">${state.tasks.map(t => {
    const live = LIVE.includes(t.status), agent = state.agents.find(a => a.id === t.agentId);
    const cadence = t.mode === 'agent' ? describeSchedule(t.schedule) : (t.enabled ? '每日执行（自创建时刻起）' : '仅手动运行');
    const when = t.enabled && t.nextRun ? ` · 下次 ${date(t.nextRun)}` : t.mode === 'agent' && t.schedule?.kind !== 'manual' ? ' · 已暂停' : '';
    const tags = t.mode === 'agent' ? `<div class="task-tags"><span>${escape(agent?.name || '智能体已删除')}</span>${t.toolsEnabled ? '<span>可用工具</span>' : ''}</div>` : '<div class="task-tags"><span>仅模型</span></div>';
    const toggle = t.mode === 'agent' && t.schedule?.kind === 'manual' ? '' : action(t.enabled ? '暂停定时' : '恢复定时', 'toggleTask', t.id);
    return `<div class="card task-card"><span class="badge ${escape(t.status || 'ready')}">${escape(STATUS[t.status] || t.status || '待执行')}</span><h3>${escape(t.name)}</h3>${tags}<p>${escape(String(t.prompt).slice(0, 160))}</p><div class="meta">${escape(cadence)}${escape(when)}</div>${history(t, date)}${t.error ? `<p class="task-error">${escape(t.error)}</p>` : ''}<div class="actions">${!live ? action('立即运行', 'runTask', t.id, 'primary') : action('停止任务', 'cancelTask', t.id, 'danger')}${t.chatId && state.chats.some(c => c.id === t.chatId) ? action('打开对话', 'openChat', t.chatId) : t.result ? action('查看结果', 'taskResult', t.id) : ''}${!live ? toggle + (t.mode === 'agent' ? action('编辑', 'editTask', t.id) : '') + action('删除', 'deleteTask', t.id) : ''}</div></div>`;
  }).join('')}</div>`;
}
