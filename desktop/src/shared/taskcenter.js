// [p2-m5] Task center: one view over the shared run queue, today's scheduled occurrences and recent task runs.
// Pure helpers shared by the renderer and the workspace handler ("skip next").
import { nextRunAt } from './schedule.js';

const LIVE = ['queued', 'running', 'cancelling'], DAY = 86400e3;
const endOfDay = now => { const d = new Date(now); d.setHours(23, 59, 59, 999); return d.getTime(); };

/** Upcoming occurrences of every enabled task until the end of today (at most `limit` per task). */
export function todayOccurrences(tasks, now = Date.now(), limit = 24) {
  const end = endOfDay(now), out = [];
  for (const t of tasks || []) {
    if (!t.enabled || !t.nextRun) continue;
    let at = t.nextRun, n = 0;
    while (at && at <= end && n < limit) {
      out.push({taskId: t.id, name: t.name, at, overdue: at < now, first: n === 0});
      if (!t.schedule || ['once', 'manual'].includes(t.schedule.kind)) break;
      at = nextRunAt(t.schedule, at); n++;
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export function taskCenter(data, now = Date.now()) {
  const tasks = data.tasks || [], jobs = data.runJobs || [];
  const liveJobs = jobs.filter(j => LIVE.includes(j.status));
  const agentLive = tasks.filter(t => t.mode === 'agent' && LIVE.includes(t.status));
  const running = [...liveJobs.filter(j => j.status !== 'queued').map(j => ({id: j.id, kind: j.kind, label: j.label, status: j.status, since: j.createdAt, cancel: {action: 'cancelRun', id: j.id}})),
    ...agentLive.filter(t => !liveJobs.some(j => j.ownerId === t.chatId)).map(t => ({id: 'task:' + t.id, kind: 'task', label: t.name, status: t.status, since: t.lastRun, cancel: {action: 'cancelTask', id: t.id}}))];
  const queued = liveJobs.filter(j => j.status === 'queued').map(j => ({id: j.id, kind: j.kind, label: j.label, status: j.status, since: j.createdAt, cancel: {action: 'cancelRun', id: j.id}}));
  const recent = tasks.flatMap(t => (t.history || []).filter(r => !LIVE.includes(r.status)).map(r => ({taskId: t.id, name: t.name, chatId: t.chatId, ...r})))
    .sort((a, b) => b.at - a.at).slice(0, 20);
  const day = recent.filter(r => r.at >= now - DAY);
  return {running, queued, today: todayOccurrences(tasks, now), recent,
    stats: {running: running.length, queued: queued.length, today: todayOccurrences(tasks, now).length, done24: day.filter(r => r.status === 'done').length, failed24: day.filter(r => r.status === 'failed').length}};
}

/** Skip the next occurrence: move nextRun one step forward and record it in the run history. */
export function skipNext(task, now = Date.now()) {
  if (!task.enabled || !task.nextRun) throw new Error('该任务没有待执行的定时');
  if (LIVE.includes(task.status)) throw new Error('任务正在执行，请先停止');
  const skipped = task.nextRun;
  if (task.schedule?.kind === 'once') { task.enabled = false; task.nextRun = null; }
  else {
    let next = nextRunAt(task.schedule, skipped);
    while (next !== null && next <= now) next = nextRunAt(task.schedule, next);
    task.nextRun = next;
  }
  task.history = [{id: 'skip-' + skipped, at: skipped, status: 'skipped', trigger: 'schedule'}, ...(task.history || [])].slice(0, 20);
  return task;
}
