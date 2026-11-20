// [ux6] 「自动化」 page, WorkBuddy style: 定时任务 / 运行记录 tabs, task cards with run · edit · more · switch,
// a run-record table built from every task's history, and a two-column task editor. Pure HTML builders.
import { escape } from './markdown.js';
import { describeSchedule, WEEKDAY_NAMES } from '../shared/schedule.js';

export const LIVE = ['queued', 'running', 'cancelling'];
const KINDS = [['daily', '每天'], ['weekdays', '工作日（周一至周五）'], ['weekly', '每周指定日'], ['hourly', '每隔几小时'], ['once', '仅一次'], ['manual', '仅手动运行']];
const RUN_STATUS = {done: ['成功', 'ok'], failed: ['失败', 'bad'], cancelled: ['已停止', 'muted'], running: ['运行中', 'live'], queued: ['排队中', 'live'], cancelling: ['正在停止', 'live'], skipped: ['已跳过', 'muted'], denied: ['已拒绝', 'bad']};
const pad = n => String(n).padStart(2, '0');
const localInput = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const SVG = {
  play: '<path d="M8 5.5v13l11-6.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  edit: '<path d="m4 20 1-4L16 5l3 3L8 19Zm10-13 3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  more: '<circle cx="6" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18" cy="12" r="1.4" fill="currentColor"/>',
  clock: '<circle cx="12" cy="13" r="7.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 9.5V13l2.5 1.6M5 4.5 3 6.5m16-2 2 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  chat: '<path d="M5 5h14v10H9l-4 4Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  retry: '<path d="M4 12a8 8 0 0 0 13.7 5.6M20 12A8 8 0 0 0 6.3 6.4M4 5v4h4m12 10v-4h-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
};
const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${SVG[k]}</svg>`;
const iconBtn = (k, act, id, title, cls = '') => `<button type="button" class="icon-btn ${cls}" data-action="${act}" data-id="${escape(id)}" title="${title}" aria-label="${title}">${svg(k)}</button>`;

/** 刚刚 / N 分钟前 / 今天 HH:mm / 昨天 HH:mm / N天前 (within a week) / M月D日 */
export function relTime(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return '—';
  const diff = now - ms, d = new Date(ms), day = x => { const t = new Date(x); t.setHours(0, 0, 0, 0); return t.getTime(); };
  if (diff >= 0 && diff < 60e3) return '刚刚';
  if (diff >= 0 && diff < 3600e3) return `${Math.floor(diff / 60e3)}分钟前`;
  const days = Math.round((day(now) - day(ms)) / 864e5);
  if (days === 0) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (days === 1) return `昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (days === -1) return `明天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (days > 1 && days < 7) return `${days}天前`;
  return `${d.getMonth() + 1}月${d.getDate()}日${days < 0 ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : ''}`;
}
export function duration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.max(1, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
  return h ? `${h}h${m}m` : m ? `${m}m${r}s` : `${r}s`;
}

const cadence = t => t.mode === 'agent' ? describeSchedule(t.schedule) : (t.enabled ? '每日执行' : '仅手动运行');
const isManual = t => t.mode === 'agent' && (!t.schedule || t.schedule.kind === 'manual');
export const taskState = t => LIVE.includes(t.status) ? 'running' : t.enabled ? 'active' : 'paused';

export function taskCard(state, t, {now = Date.now()} = {}) {
  const live = LIVE.includes(t.status), st = taskState(t), agent = state.agents?.find(a => a.id === t.agentId);
  const hasChat = t.chatId && state.chats?.some(c => c.id === t.chatId);
  const sw = isManual(t) ? `<span class="task-switch disabled" title="仅手动运行"><i></i></span>`
    : `<button type="button" class="task-switch ${t.enabled ? 'on' : ''}" role="switch" aria-checked="${!!t.enabled}" data-action="toggleTask" data-id="${escape(t.id)}" title="${t.enabled ? '暂停' : '恢复'}" ${live ? 'disabled' : ''}><i></i></button>`;
  const more = `<details class="task-more"><summary class="icon-btn" title="更多" aria-label="更多">${svg('more')}</summary><div class="task-menu">${hasChat ? `<button type="button" data-action="openChat" data-id="${escape(t.chatId)}">打开任务对话</button>` : t.result ? `<button type="button" data-action="taskResult" data-id="${escape(t.id)}">查看结果</button>` : ''}${t.enabled && t.nextRun && !live ? `<button type="button" data-action="skipTask" data-id="${escape(t.id)}">跳过下一次</button>` : ''}<button type="button" data-action="taskRuns" data-id="${escape(t.id)}">运行记录</button>${!live ? `<button type="button" class="danger-text" data-action="deleteTask" data-id="${escape(t.id)}">删除</button>` : ''}</div></details>`;
  const tools = `<div class="task-tools">${live ? iconBtn('stop', 'cancelTask', t.id, '停止', 'danger') : iconBtn('play', 'runTask', t.id, '立即运行')}${!live && t.mode === 'agent' ? iconBtn('edit', 'editTask', t.id, '编辑') : ''}${more}${sw}</div>`;
  const right = live ? `<span class="task-state running"><i class="spin"></i>${t.status === 'queued' ? '排队中' : t.status === 'cancelling' ? '正在停止' : '运行中'}</span>`
    : st === 'active' ? `<span class="task-state active">${t.nextRun ? '下次 ' + escape(relTime(t.nextRun, now)) : '运行中'}</span>` : `<span class="task-state paused">${isManual(t) ? '手动运行' : '已暂停'}</span>`;
  const last = (t.history || [])[0];
  const lastNote = !live && last && last.status !== 'running' ? `<span class="task-last ${escape(RUN_STATUS[last.status]?.[1] || '')}">上次${escape(RUN_STATUS[last.status]?.[0] || last.status)} · ${escape(relTime(last.at, now))}</span>` : '';
  return `<article class="task-card2 ${st}" data-task="${escape(t.id)}"><header><h3 title="${escape(t.name)}">${escape(t.name)}</h3>${tools}</header>
<p class="task-prompt">${escape(String(t.prompt || '').slice(0, 300))}</p>
<div class="task-tags">${t.mode === 'agent' ? `<span>${escape(agent?.name || '智能体已删除')}</span>${t.toolsEnabled ? '<span>可用工具</span>' : ''}` : '<span>仅模型</span>'}${lastNote}</div>
${t.error && !live ? `<p class="task-error" title="${escape(t.error)}">${escape(t.error.slice(0, 120))}</p>` : ''}
<footer><span class="task-cadence">${svg('clock')}${escape(cadence(t))}</span>${right}</footer></article>`;
}

/** All runs across tasks, newest first: {taskId, name, chatId, ...run} */
export function runRecords(state, {status = 'all', taskId = 'all', trigger = 'all'} = {}) {
  const out = [];
  for (const t of state.tasks || []) {
    if (taskId !== 'all' && t.id !== taskId) continue;
    const runs = t.history?.length ? t.history : t.lastRun && ['done', 'failed', 'cancelled'].includes(t.status) ? [{id: 'last', at: t.lastRun, status: t.status, error: t.error}] : [];
    for (const r of runs) out.push({taskId: t.id, name: t.name, chatId: t.chatId, mode: t.mode, ...r});
  }
  return out.filter(r => (status === 'all' || (status === 'running' ? LIVE.includes(r.status) : r.status === status)) && (trigger === 'all' || (r.trigger || 'manual') === trigger))
    .sort((a, b) => (b.at || 0) - (a.at || 0));
}

function recordsTab(state, {runStatus, runTask, runTrigger, now, chatExists}) {
  const sel = (id, value, opts) => `<select id="${id}" class="run-filter">${opts.map(([v, l]) => `<option value="${escape(v)}" ${v === value ? 'selected' : ''}>${escape(l)}</option>`).join('')}</select>`;
  const filters = `<div class="run-filters">${sel('runStatus', runStatus, [['all', '全部状态'], ['done', '成功'], ['failed', '失败'], ['running', '运行中'], ['cancelled', '已停止'], ['skipped', '已跳过']])}${sel('runTrigger', runTrigger, [['all', '全部触发方式'], ['schedule', '定时'], ['manual', '手动']])}${sel('runTask', runTask, [['all', '全部任务'], ...(state.tasks || []).map(t => [t.id, t.name])])}</div>`;
  const rows = runRecords(state, {status: runStatus, taskId: runTask, trigger: runTrigger}).slice(0, 300);
  const body = rows.map(r => {
    const [label, cls] = RUN_STATUS[r.status] || [r.status, ''], live = LIVE.includes(r.status);
    const note = r.status === 'done' && r.pending ? `（${r.pending} 项待确认）` : '';
    return `<tr><td class="rr-name" title="${escape(r.name)}">${escape(r.name)}</td><td><span class="rr-status ${cls}" ${r.error ? `title="${escape(r.error)}"` : ''}>${live ? '<i class="spin"></i>' : `<i class="dot"></i>`}${escape(label)}${escape(note)}</span></td>
<td title="${escape(new Date(r.at || 0).toLocaleString('zh-CN'))}">${escape(relTime(r.at, now))}</td><td>${live ? '—' : escape(duration(r.ms))}</td><td>${(r.trigger || 'manual') === 'schedule' ? '定时' : '手动'}</td>
<td class="rr-actions">${r.chatId && chatExists(r.chatId) && r.status !== 'skipped' ? iconBtn('chat', 'openChat', r.chatId, '查看对话') : ''}${r.status === 'failed' && !LIVE.includes((state.tasks || []).find(t => t.id === r.taskId)?.status) ? iconBtn('retry', 'runTask', r.taskId, '重新运行') : ''}</td></tr>`;
  }).join('');
  return filters + (rows.length ? `<div class="run-table"><table><thead><tr><th>任务名称</th><th>状态</th><th>运行时间</th><th>耗时</th><th>触发</th><th>操作</th></tr></thead><tbody>${body}</tbody></table></div>`
    : '<p class="empty-note run-empty">没有符合条件的运行记录。</p>');
}

export function automationPage(state, {action, empty, tab = 'tasks', filter = 'all', runStatus = 'all', runTask = 'all', runTrigger = 'all', now = Date.now(), banner = '', extra = ''}) {
  const tasks = state.tasks || [], chatExists = id => (state.chats || []).some(c => c.id === id);
  const n = {all: tasks.length, active: tasks.filter(t => taskState(t) !== 'paused').length, paused: tasks.filter(t => taskState(t) === 'paused').length};
  const tabs = `<div class="auto-tabs" role="tablist">${[['tasks', '定时任务'], ['runs', '运行记录']].map(([id, l]) => `<button type="button" role="tab" class="${tab === id ? 'chosen' : ''}" aria-selected="${tab === id}" data-action="taskTab" data-id="${id}">${l}</button>`).join('')}</div>`;
  const hero = `<div class="page-title page-hero"><div><h1>让重复的工作，<em>按时自动完成</em></h1><p>到点由智能体自动执行一次对话，结果进入「动态」；也可以直接在对话里说「每天 8 点帮我汇总未读邮件」。</p><div class="plaza-stats"><span><b>${n.all}</b>个定时任务</span><span><b>${n.active}</b>个进行中</span><span><b>${n.paused}</b>个已暂停</span></div></div></div>`; // [ux11]
  const head = `<div class="auto-head">${tabs}<div class="auto-tools">${iconBtn('refresh', 'refresh', '', '刷新')}${action('＋ 新建', 'newTask', '', 'primary')}</div></div>`;
  if (tab === 'runs') return `<div class="page auto-page">${hero}${head}${banner}${recordsTab(state, {runStatus, runTask, runTrigger, now, chatExists})}${extra}</div>`;
  const chips = `<div class="auto-filters">${[['all', '全部'], ['active', '进行中'], ['paused', '已暂停']].map(([id, l]) => `<button type="button" class="${filter === id ? 'chosen' : ''}" data-action="taskFilter" data-id="${id}">${l} (${n[id]})</button>`).join('')}</div>`;
  const shown = tasks.filter(t => filter === 'all' || (filter === 'paused' ? taskState(t) === 'paused' : taskState(t) !== 'paused'));
  const cards = shown.length ? `<div class="task-grid">${shown.map(t => taskCard(state, t, {now})).join('')}</div>`
    : tasks.length ? '<p class="empty-note">这个分类下没有任务。</p>'
    : empty('还没有定时任务', '点「新建」，或直接在对话里说「每天 8 点帮我汇总未读邮件」「每小时看一下通威的股价」。', action('新建任务', 'newTask', '', 'primary'));
  return `<div class="page auto-page">${hero}${head}${banner}${chips}${cards}<p class="auto-note">任务在应用运行时按本机时间执行；电脑休眠或应用退出期间错过的，恢复后补执行一次。每次运行的完整过程保存在任务自己的对话里。</p></div>`;
}

/** Two-column editor: left = what to do, right = state + cadence. Field names match taskPayload(). */
export function taskEditor(state, task = null, now = Date.now()) {
  const s = task?.schedule || {kind: 'daily', time: '09:00'};
  const agents = (state.agents || []).map(a => `<option value="${escape(a.id)}" ${a.id === (task?.agentId || 'assistant') ? 'selected' : ''}>${escape(a.name)}</option>`).join('');
  const days = (s.days || [1]).map(Number), live = task && LIVE.includes(task.status);
  const status = !task ? '' : `<div class="te-status ${taskState(task)}"><div><b>${live ? '运行中' : task.enabled ? '进行中' : isManual(task) ? '仅手动运行' : '已暂停'}</b><small>${live ? '正在执行，结束后可修改' : task.enabled && task.nextRun ? '下次 ' + escape(relTime(task.nextRun, now)) : task.enabled ? '' : isManual(task) ? '只在点击运行时执行' : '任务已暂停执行'}</small></div>${!live && !isManual(task) ? `<button type="button" class="secondary" data-action="taskEditorToggle" data-id="${escape(task.id)}">${task.enabled ? '暂停' : '恢复'}</button>` : ''}</div>`;
  const footer = task ? `<div class="te-extra"><button type="button" class="danger" data-action="deleteTask" data-id="${escape(task.id)}">删除</button><button type="button" class="secondary" data-action="taskEditorRun" data-id="${escape(task.id)}" ${live ? 'disabled' : ''}>立即运行</button></div>` : '';
  return `<div class="task-form task-editor" data-kind="${escape(s.kind)}"><div class="te-main">
<label>名称<input name="name" maxlength="100" required value="${escape(task?.name || '')}" placeholder="例如：每日行业早报"></label>
<label>提示词<textarea name="prompt" required rows="9" placeholder="像对助手说话一样描述任务，例如：整理昨天以来储能行业的重要新闻，列 5 条，每条附来源链接。">${escape(task?.prompt || '')}</textarea></label>
<div class="task-form-row"><label>智能体<select name="agentId">${agents}</select></label></div>
<label class="check"><input type="checkbox" name="toolsEnabled" ${task?.toolsEnabled ? 'checked' : ''}>允许使用工具（联网、浏览器、文档、本机命令）</label>
</div><div class="te-side">${status}
<label>执行频率<select name="scheduleKind" data-schedule-kind>${KINDS.map(([v, t]) => `<option value="${v}" ${v === s.kind ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
<label class="f-time">时间<input name="scheduleTime" type="time" value="${escape(s.time || '09:00')}"></label>
<label class="f-every">间隔（小时）<input name="scheduleEvery" type="number" min="1" max="24" value="${escape(String(s.every || 4))}"></label>
<label class="f-at">执行时间<input name="scheduleAt" type="datetime-local" value="${localInput(s.at || now + 3600e3)}"></label>
<fieldset class="f-days"><legend>每周哪几天</legend>${[1, 2, 3, 4, 5, 6, 0].map(d => `<label class="check"><input type="checkbox" name="scheduleDays" value="${d}" ${days.includes(d) ? 'checked' : ''}>${WEEKDAY_NAMES[d]}</label>`).join('')}</fieldset>
<p class="task-form-note">按本机时间执行；需要确认的操作在定时运行时会记入「待你确认」。</p></div>${footer}</div>`;
}
