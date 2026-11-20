// [p3-m2] Calendar connector: .ics / webcal subscription or a CalDAV account (read-only).
// Snapshot semantics (`replace`): each sync replaces the connector's events, so edits and deletions show up.
import { expandCalendar } from '../runtime/ical.mjs';
import { caldavEvents } from '../runtime/caldav.mjs';
import { safeUrl } from '../src/shared/connectors.js';

const DAY = 864e5, MAX = 8 * 1024 * 1024;
export const CALENDAR_DAYS = 30;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

export function createCalendarAdapter({tz} = {}) {
  return {
    kind: 'calendar', itemKind: 'event', replace: true,
    secretFields: [{name: 'password', label: '应用专用密码（CalDAV）', requiredWhen: {mode: 'caldav'}}],
    normalize(c) {
      const mode = c?.mode === 'caldav' ? 'caldav' : 'ics', url = safeUrl(c?.url);
      if (mode === 'ics') return {mode, url};
      const username = clip(c?.username, 200);
      if (!username) throw new Error('请填写 CalDAV 账号');
      return {mode, url, username};
    },
    defaultName: c => (host(c.url) ? host(c.url) + ' · ' : '') + (c.mode === 'caldav' ? '日历' : '订阅日历'),
    async sync({config, secret, fetch, now}) {
      const from = now() - DAY, to = now() + CALENDAR_DAYS * DAY;
      let name = '', events;
      if (config.mode === 'caldav') {
        if (!secret?.password) throw new Error('请填写应用专用密码');
        const r = await caldavEvents({request: (u, o) => fetch(u, o), url: config.url, username: config.username, password: secret.password, from, to, tz});
        name = r.name; events = r.events;
      } else {
        const r = await fetch(config.url, {maxBytes: MAX, headers: {accept: 'text/calendar, text/plain, */*'}});
        if (!/BEGIN:VCALENDAR/i.test(r.text.slice(0, 5000))) throw new Error('这个地址不是日历订阅（应为 .ics 或 webcal 链接）');
        const cal = expandCalendar(r.text, {from, to, tz});
        name = cal.name; events = cal.events;
      }
      return {items: events.slice(0, 300).map(e => ({key: e.key, title: e.title, summary: [e.calendar, e.description].filter(Boolean).join(' · '),
        start: e.start, end: e.end, allDay: e.allDay, location: e.location, time: e.start})), state: {title: name}};
    },
  };
}
export const calendarAdapter = createCalendarAdapter();
