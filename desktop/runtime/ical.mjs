// [p3-m2] iCalendar (RFC 5545) parser and recurrence expansion. Dependency-free; input is untrusted and bounded.
// Times are computed as "wall clock in a zone" -> UTC with Intl, so DST and TZID are honoured.
const DAY = 864e5;
const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const WIN_TZ = {
  'China Standard Time': 'Asia/Shanghai', 'Taipei Standard Time': 'Asia/Taipei', 'Tokyo Standard Time': 'Asia/Tokyo', 'Korea Standard Time': 'Asia/Seoul',
  'Singapore Standard Time': 'Asia/Singapore', 'India Standard Time': 'Asia/Kolkata', 'SE Asia Standard Time': 'Asia/Bangkok',
  'Pacific Standard Time': 'America/Los_Angeles', 'Mountain Standard Time': 'America/Denver', 'Central Standard Time': 'America/Chicago', 'Eastern Standard Time': 'America/New_York',
  'GMT Standard Time': 'Europe/London', 'W. Europe Standard Time': 'Europe/Berlin', 'Romance Standard Time': 'Europe/Paris', 'Russian Standard Time': 'Europe/Moscow',
  'AUS Eastern Standard Time': 'Australia/Sydney', 'UTC': 'UTC', 'Coordinated Universal Time': 'UTC',
};
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const unescapeText = s => String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

export function validTz(tz) { try { new Intl.DateTimeFormat('en-US', {timeZone: tz}); return true; } catch { return false; } }
export function resolveTz(tzid, fallback = 'UTC') {
  if (!tzid) return fallback;
  const t = String(tzid).replace(/^"|"$/g, '').trim();
  if (/^(UTC|GMT|Z)$/i.test(t)) return 'UTC';
  if (WIN_TZ[t]) return WIN_TZ[t];
  if (validTz(t)) return t;
  const m = /([A-Za-z]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?)$/.exec(t); // e.g. /mozilla.org/20070129_1/Asia/Shanghai
  return m && validTz(m[1]) ? m[1] : fallback;
}
const formatters = new Map();
function offsetAt(tz, ms) {
  if (tz === 'UTC') return 0;
  let f = formatters.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'}); formatters.set(tz, f); }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
/** Wall-clock time in `tz` -> UTC milliseconds. */
export function zonedToUtc(y, mo, d, h = 0, mi = 0, s = 0, tz = 'UTC') {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s), off = offsetAt(tz, guess);
  let t = guess - off;
  const off2 = offsetAt(tz, t);
  if (off2 !== off) t = guess - off2;
  return t;
}

function parseLine(line) {
  let q = false, i = 0;
  for (; i < line.length; i++) { const c = line[i]; if (c === '"') q = !q; else if (c === ':' && !q) break; }
  if (i >= line.length) return null;
  const parts = line.slice(0, i).split(';'), params = {};
  for (const p of parts.slice(1)) { const j = p.indexOf('='); if (j > 0) params[p.slice(0, j).toUpperCase()] = p.slice(j + 1).replace(/^"|"$/g, ''); }
  return {name: parts[0].toUpperCase(), params, value: line.slice(i + 1)};
}

/** {name, events:[{props:{NAME:[{params,value}]}}]} — properties of nested VALARM etc. are ignored. */
export function parseICS(text) {
  const lines = String(text || '').slice(0, 20_000_000).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out = {name: '', events: []}, stack = [];
  let ev = null;
  for (const raw of lines) {
    if (!raw) continue;
    const p = parseLine(raw);
    if (!p) continue;
    if (p.name === 'BEGIN') { const v = p.value.trim().toUpperCase(); stack.push(v); if (v === 'VEVENT' && !ev) ev = {props: {}}; continue; }
    if (p.name === 'END') {
      const v = p.value.trim().toUpperCase(); stack.pop();
      if (v === 'VEVENT' && ev) { out.events.push(ev); ev = null; if (out.events.length >= 5000) break; }
      continue;
    }
    const top = stack[stack.length - 1];
    if (ev && top === 'VEVENT') (ev.props[p.name] ??= []).push(p);
    else if (!ev && top === 'VCALENDAR' && p.name === 'X-WR-CALNAME') out.name = clip(unescapeText(p.value), 200);
  }
  return out;
}

function parseDT(p, defTz) {
  if (!p) return null;
  const v = String(p.value || '').trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m || p.params?.VALUE === 'DATE') {
    m = m || /^(\d{4})(\d{2})(\d{2})/.exec(v);
    return m ? {allDay: true, y: +m[1], mo: +m[2], d: +m[3], h: 0, mi: 0, s: 0, tz: defTz} : null;
  }
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i.exec(v);
  if (!m) return null;
  return {allDay: false, y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +(m[6] || 0), tz: m[7] ? 'UTC' : resolveTz(p.params?.TZID, defTz)};
}
const utcOf = dt => zonedToUtc(dt.y, dt.mo, dt.d, dt.h, dt.mi, dt.s, dt.tz);
function dtList(props, defTz) {
  const out = [];
  for (const p of props || []) for (const v of String(p.value).split(',')) { const dt = parseDT({value: v, params: p.params}, defTz); if (dt) out.push(dt); }
  return out;
}
export function parseDuration(s) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(String(s || '').trim());
  if (!m) return null;
  const ms = (+(m[2] || 0)) * 7 * DAY + (+(m[3] || 0)) * DAY + (+(m[4] || 0)) * 36e5 + (+(m[5] || 0)) * 6e4 + (+(m[6] || 0)) * 1e3;
  return m[1] === '-' ? -ms : ms;
}
export function parseRRule(v) {
  const r = {};
  for (const part of String(v || '').split(';')) { const [k, val] = part.split('='); if (k && val !== undefined) r[k.trim().toUpperCase()] = val.trim().toUpperCase(); }
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(r.FREQ)) return null;
  const nums = s => s ? s.split(',').map(Number).filter(Number.isInteger) : null;
  return {
    freq: r.FREQ, interval: Math.max(1, Math.min(1000, parseInt(r.INTERVAL || '1', 10) || 1)),
    count: r.COUNT ? Math.max(1, parseInt(r.COUNT, 10) || 1) : null, until: r.UNTIL || null,
    byday: r.BYDAY ? r.BYDAY.split(',').map(x => /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x)).filter(Boolean).map(m => ({n: m[1] ? parseInt(m[1], 10) : 0, wd: WD.indexOf(m[2])})) : null,
    bymonthday: nums(r.BYMONTHDAY)?.filter(n => n !== 0 && Math.abs(n) <= 31) || null,
    bymonth: nums(r.BYMONTH)?.filter(n => n >= 1 && n <= 12) || null,
  };
}

// Calendar arithmetic on "naive" day numbers (days since epoch, no zone).
const dayOf = (y, mo, d) => Math.round(Date.UTC(y, mo - 1, d) / DAY);
const partsOf = n => { const x = new Date(n * DAY); return {y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate(), wd: x.getUTCDay()}; };
const daysIn = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
function monthDays(y, mo, rule, startDay) {
  const dim = daysIn(y, mo);
  let days = [];
  if (rule.byday) {
    for (const {n, wd} of rule.byday) {
      const all = [];
      for (let d = 1; d <= dim; d++) if (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() === wd) all.push(d);
      if (n === 0) days.push(...all); else { const pick = n > 0 ? all[n - 1] : all[all.length + n]; if (pick) days.push(pick); }
    }
    if (rule.bymonthday) { const md = new Set(rule.bymonthday.map(x => x > 0 ? x : dim + x + 1)); days = days.filter(d => md.has(d)); }
  } else if (rule.bymonthday) days = rule.bymonthday.map(x => x > 0 ? x : dim + x + 1).filter(d => d >= 1 && d <= dim);
  else if (startDay <= dim) days = [startDay];
  return [...new Set(days)].sort((a, b) => a - b).map(d => dayOf(y, mo, d));
}
/** One period (day / week / month / year) at a time: {periodStart, days[]} in order. */
function periodDays(startDay, rule, k) {
  const s = partsOf(startDay), I = rule.interval;
  let periodStart, days = [];
  if (rule.freq === 'DAILY') {
    periodStart = startDay + k * I; days = [periodStart];
    if (rule.byday) { const set = new Set(rule.byday.map(b => b.wd)); days = days.filter(d => set.has(partsOf(d).wd)); }
  } else if (rule.freq === 'WEEKLY') {
    periodStart = startDay - ((s.wd + 6) % 7) + k * I * 7;
    const wds = rule.byday ? rule.byday.map(b => b.wd) : [s.wd];
    days = [...new Set(wds)].map(wd => periodStart + ((wd + 6) % 7)).sort((a, b) => a - b);
  } else if (rule.freq === 'MONTHLY') {
    const mi = (s.y * 12 + s.mo - 1) + k * I, y = Math.floor(mi / 12), mo = mi % 12 + 1;
    periodStart = dayOf(y, mo, 1); days = monthDays(y, mo, rule, s.d);
  } else {
    const y = s.y + k * I;
    periodStart = dayOf(y, 1, 1);
    for (const mo of rule.bymonth || [s.mo]) days.push(...monthDays(y, mo, rule, s.d));
    days.sort((a, b) => a - b);
  }
  if (rule.bymonth && rule.freq !== 'YEARLY') days = days.filter(d => rule.bymonth.includes(partsOf(d).mo));
  return {periodStart, days: days.filter(d => d >= startDay)};
}

/**
 * Events overlapping [from, to), recurrences expanded (RRULE, RDATE, EXDATE, RECURRENCE-ID overrides, STATUS:CANCELLED).
 * Returns {name, events:[{key, uid, title, start, end, allDay, location, description, recurring}]} sorted by start.
 */
export function expandCalendar(text, {from = Date.now() - DAY, to = Date.now() + 30 * DAY, tz, limit = 500} = {}) {
  const cal = parseICS(text), defTz = resolveTz(tz || Intl.DateTimeFormat().resolvedOptions().timeZone, 'UTC');
  const one = (P, k) => P[k]?.[0], overrides = new Map(), evs = [], out = [];
  for (const e of cal.events) {
    const P = e.props, start = parseDT(one(P, 'DTSTART'), defTz);
    if (!start) continue;
    const startUtc = utcOf(start), end = parseDT(one(P, 'DTEND'), defTz);
    let endUtc;
    if (end) endUtc = utcOf(end);
    else { const du = parseDuration(one(P, 'DURATION')?.value); endUtc = du !== null ? startUtc + du : start.allDay ? utcOf({...start, d: start.d + 1}) : startUtc; }
    const summary = unescapeText(one(P, 'SUMMARY')?.value || '');
    const uid = clip(unescapeText(one(P, 'UID')?.value || ''), 300) || `nouid:${startUtc}:${clip(summary, 40)}`;
    const rid = parseDT(one(P, 'RECURRENCE-ID'), defTz);
    const ev = {uid, start, startUtc, dur: Math.max(0, endUtc - startUtc), title: clip(summary, 200) || '（无标题）',
      location: clip(unescapeText(one(P, 'LOCATION')?.value || ''), 120), description: clip(unescapeText(one(P, 'DESCRIPTION')?.value || ''), 300),
      cancelled: /CANCELLED/i.test(one(P, 'STATUS')?.value || ''), rrule: one(P, 'RRULE') ? parseRRule(one(P, 'RRULE').value) : null,
      exdates: dtList(P.EXDATE, defTz), rdates: dtList(P.RDATE, defTz), rid};
    if (rid) { if (!overrides.has(uid)) overrides.set(uid, new Set()); overrides.get(uid).add(utcOf(rid)); }
    evs.push(ev);
  }
  const push = (ev, s) => {
    const e = s + ev.dur;
    if (s < to && Math.max(e, s + 1) > from) out.push({key: `${ev.uid}@${s}`, uid: ev.uid, title: ev.title, start: s, end: e, allDay: ev.start.allDay, location: ev.location, description: ev.description, recurring: !!(ev.rrule || ev.rid)});
  };
  let budget = 300000;
  for (const ev of evs) {
    if (out.length >= limit * 2 || budget <= 0) break;
    if (ev.cancelled) continue;
    if (ev.rid || !ev.rrule) { push(ev, ev.startUtc); continue; }
    const r = ev.rrule, ex = new Set(ev.exdates.map(utcOf)), skip = overrides.get(ev.uid) || new Set();
    let until = null;
    if (r.until) { const u = parseDT({value: r.until, params: {}}, ev.start.tz); if (u) until = u.allDay ? utcOf({...u, d: u.d + 1}) - 1 : utcOf(u); }
    if (until !== null && until < from) continue;
    const startDay = dayOf(ev.start.y, ev.start.mo, ev.start.d), lastDay = Math.floor(to / DAY) + 2, firstDay = Math.floor((from - ev.dur) / DAY) - 2;
    let count = 0, mine = 0, stop = false;
    for (let k = 0; !stop && budget > 0; k++, budget--) {
      const {periodStart, days} = periodDays(startDay, r, k);
      if (periodStart > lastDay) break;
      for (const d of days) {
        if (d < firstDay) { if (r.count && ++count > r.count) { stop = true; break; } continue; } // before the window: count only
        const p = partsOf(d), s = zonedToUtc(p.y, p.mo, p.d, ev.start.h, ev.start.mi, ev.start.s, ev.start.tz);
        if (until !== null && s > until) { stop = true; break; }
        if (r.count && ++count > r.count) { stop = true; break; }
        if (s >= to) { stop = true; break; }
        if (!ex.has(s) && !skip.has(s)) { push(ev, s); if (++mine >= limit) { stop = true; break; } }
      }
    }
    for (const rd of ev.rdates) { const s = utcOf(rd); if (!ex.has(s) && !skip.has(s)) push(ev, s); }
  }
  const seen = new Set();
  const events = out.filter(e => !seen.has(e.key) && seen.add(e.key)).sort((a, b) => a.start - b.start || a.end - b.end).slice(0, limit);
  return {name: cal.name, events};
}
