// [p2-m1] Schedule cadence: pure helpers shared by the task service, the workspace handler and the UI.
// All times are the Mac's local wall clock. A missed run (sleep / app closed) fires once on resume, then the
// next occurrence is computed from "now", so a long absence never produces a burst of catch-up runs.
// Shared by main-process services and the renderer, so it must not import Node-only modules.
const nextDaily = (now = new Date()) => { const next = new Date(now); next.setDate(next.getDate() + 1); return next.getTime(); };

export const SCHEDULE_KINDS = ['manual', 'once', 'hourly', 'daily', 'weekdays', 'weekly'];
export const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Validate user input → canonical schedule object (throws with a Chinese message). */
export function normalizeSchedule(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('定时设置无效');
  const kind = s.kind;
  if (!SCHEDULE_KINDS.includes(kind)) throw new Error('未知的执行频率');
  if (kind === 'manual') return {kind};
  if (kind === 'hourly') {
    const every = Number(s.every);
    if (!Number.isInteger(every) || every < 1 || every > 24) throw new Error('间隔需为 1 到 24 小时');
    return {kind, every};
  }
  if (kind === 'once') {
    const at = typeof s.at === 'string' ? new Date(s.at).getTime() : Number(s.at);
    if (!Number.isFinite(at)) throw new Error('请选择执行时间');
    return {kind, at};
  }
  const time = String(s.time || '');
  if (!TIME.test(time)) throw new Error('请选择执行时刻');
  if (kind === 'weekly') {
    const days = [...new Set((Array.isArray(s.days) ? s.days : []).map(Number))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort();
    if (!days.length) throw new Error('请至少选择一天');
    return {kind, time, days};
  }
  return {kind, time};
}

const at = (base, time) => { const [h, m] = time.split(':').map(Number); const d = new Date(base); d.setHours(h, m, 0, 0); return d; };

/** Next run in ms after `now`, or null when the schedule will not fire again. Missing schedule = legacy daily. */
export function nextRunAt(schedule, now = Date.now()) {
  if (!schedule) return nextDaily(new Date(now));
  const {kind} = schedule;
  if (kind === 'manual') return null;
  if (kind === 'once') return schedule.at > now ? schedule.at : null;
  if (kind === 'hourly') return now + schedule.every * 3600e3;
  const allowed = kind === 'weekdays' ? [1, 2, 3, 4, 5] : kind === 'weekly' ? schedule.days : [0, 1, 2, 3, 4, 5, 6];
  for (let i = 0; i <= 7; i++) {
    const d = at(now, schedule.time); d.setDate(d.getDate() + i);
    if (d.getTime() > now && allowed.includes(d.getDay())) return d.getTime();
  }
  return null;
}

const pad = n => String(n).padStart(2, '0');
export function describeSchedule(schedule) {
  if (!schedule) return '每日执行（自创建时刻起）';
  switch (schedule.kind) {
    case 'manual': return '仅手动运行';
    case 'once': { const d = new Date(schedule.at); return `仅一次 · ${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
    case 'hourly': return `每 ${schedule.every} 小时`;
    case 'daily': return `每天 ${schedule.time}`;
    case 'weekdays': return `工作日 ${schedule.time}`;
    case 'weekly': return `每周${schedule.days.map(d => WEEKDAY_NAMES[d]).join('、')} ${schedule.time}`;
    default: return '';
  }
}

/** Form fields (FormData-like getter) → schedule input for normalizeSchedule. */
export function scheduleFromForm(get, getAll) {
  const kind = get('scheduleKind') || 'manual';
  return {kind, time: get('scheduleTime') || '09:00', every: get('scheduleEvery') || 1, days: (getAll?.('scheduleDays') || []), at: get('scheduleAt') || ''};
}
