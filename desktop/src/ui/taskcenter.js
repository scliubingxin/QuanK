// [p2-m5] Task center section at the top of the automation page. Pure HTML builder.
import { escape } from './markdown.js';
import { taskCenter } from '../shared/taskcenter.js';

const STATUS = {running: '执行中', cancelling: '正在停止', queued: '排队中', done: '完成', failed: '失败', cancelled: '已停止', skipped: '已跳过'};
const pad = n => String(n).padStart(2, '0');
const hm = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function taskCenterPanel(state, {action, date, now = Date.now()}) {
  const c = taskCenter(state, now), s = c.stats;
  const stat = (n, label, cls = '') => `<div class="tc-stat ${cls}"><b>${n}</b><small>${label}</small></div>`;
  const live = [...c.running, ...c.queued].map(x => `<li><span class="tc-dot ${escape(x.status)}"></span><span class="tc-label">${escape(x.label || '')}</span><small>${escape(STATUS[x.status] || x.status)}${x.since ? ' · ' + escape(date(x.since)) : ''}</small>${action('停止', x.cancel.action, x.cancel.id, 'danger')}</li>`).join('');
  const today = c.today.map(x => `<li class="${x.overdue ? 'overdue' : ''}"><span class="tc-time">${hm(x.at)}</span><span class="tc-label">${escape(x.name)}</span>${x.overdue ? '<small>已到期，等待执行</small>' : ''}${x.first && !x.overdue ? action('跳过这次', 'skipTask', x.taskId) : ''}</li>`).join('');
  const recent = c.recent.slice(0, 8).map(r => `<li><span class="tc-dot ${escape(r.status)}"></span><span class="tc-label">${escape(r.name)}</span><small>${escape(STATUS[r.status] || r.status)} · ${escape(date(r.at))}${r.ms ? ` · ${Math.max(1, Math.round(r.ms / 1000))} 秒` : ''}${r.pending ? ` · ${r.pending} 项待确认` : ''}</small>${r.chatId && state.chats?.some(ch => ch.id === r.chatId) && r.status !== 'skipped' ? action('查看', 'openChat', r.chatId) : ''}${r.status === 'failed' ? action('重试', 'runTask', r.taskId, 'primary') : ''}</li>`).join('');
  return `<section class="task-center"><div class="tc-stats">${stat(s.running, '执行中', s.running ? 'live' : '')}${stat(s.queued, '排队')}${stat(s.today, '今天还会运行')}${stat(s.done24, '24 小时完成')}${stat(s.failed24, '24 小时失败', s.failed24 ? 'bad' : '')}</div><div class="tc-cols"><div><h3>正在进行</h3>${live ? `<ul>${live}</ul>` : '<p class="empty-note">没有正在执行或排队的任务。</p>'}</div><div><h3>今天的安排</h3>${today ? `<ul>${today}</ul>` : '<p class="empty-note">今天没有定时任务。</p>'}</div><div><h3>最近运行</h3>${recent ? `<ul>${recent}</ul>` : '<p class="empty-note">还没有运行记录。</p>'}</div></div></section>`;
}
