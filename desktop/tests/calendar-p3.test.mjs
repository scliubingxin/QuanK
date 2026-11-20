import test from 'node:test';
import assert from 'node:assert/strict';
import { expandCalendar, zonedToUtc, resolveTz, parseRRule, parseDuration, parseICS } from '../runtime/ical.mjs';
import { caldavEvents, xmlBlocks } from '../runtime/caldav.mjs';
import { createCalendarAdapter } from '../services/connector-calendar.mjs';
import { createConnectorService, feedAdapter } from '../services/connectors.mjs';
import { eventTimeLabel, upcomingEvents, kindInfo } from '../src/shared/connectors.js';
import { connectorForm, connectorItemsView, connectorsPage, connectorPayload } from '../src/ui/connectors.js';

const S = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h - 8, mi); // Asia/Shanghai wall clock -> UTC
const TZ = 'Asia/Shanghai';
const ics = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:工作日历', 'BEGIN:VTIMEZONE', 'TZID:Asia/Shanghai', 'END:VTIMEZONE', ...events.flat(), 'END:VCALENDAR'].join('\r\n');
const ev = props => ['BEGIN:VEVENT', ...props, 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'DESCRIPTION:提醒', 'END:VALARM', 'END:VEVENT'];
const W = {from: S(2026, 11, 1), to: S(2027, 2, 28), tz: TZ};
const starts = r => r.events.map(e => e.start);

test('zonedToUtc honours zones and DST; resolveTz maps Windows and Mozilla ids', () => {
  assert.equal(zonedToUtc(2026, 11, 19, 9, 0, 0, TZ), Date.UTC(2026, 10, 19, 1));
  assert.equal(zonedToUtc(2026, 3, 9, 9, 0, 0, 'America/New_York'), Date.UTC(2026, 2, 9, 13));
  assert.equal(zonedToUtc(2026, 3, 6, 9, 0, 0, 'America/New_York'), Date.UTC(2026, 2, 6, 14));
  assert.equal(resolveTz('China Standard Time'), TZ);
  assert.equal(resolveTz('/mozilla.org/20070129_1/Asia/Shanghai'), TZ);
  assert.equal(resolveTz('Nowhere/Fake', 'UTC'), 'UTC');
  assert.equal(parseDuration('PT1H30M'), 5400e3);
  assert.equal(parseDuration('P1W'), 7 * 864e5);
  assert.equal(parseRRule('FREQ=SECONDLY'), null);
});

test('parseICS unfolds lines, unescapes text and ignores VALARM properties', () => {
  const text = ics(ev(['UID:a', 'DTSTART;TZID=Asia/Shanghai:20261120T100000', 'DTEND;TZID=Asia/Shanghai:20261120T110000', 'SUMMARY:很长的', ' 标题\\, 含逗号', 'DESCRIPTION:第一行\\n第二行', 'LOCATION:3楼\\;会议室']));
  assert.equal(parseICS(text).name, '工作日历');
  const [e] = expandCalendar(text, W).events;
  assert.equal(e.title, '很长的标题, 含逗号');
  assert.equal(e.description, '第一行 第二行');
  assert.equal(e.location, '3楼;会议室');
  assert.equal(e.start, S(2026, 11, 20, 10));
  assert.equal(e.end, S(2026, 11, 20, 11));
});

test('all-day, UTC, DURATION, Windows TZID, cancelled events', () => {
  const r = expandCalendar(ics(
    ev(['UID:d', 'DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261122', 'SUMMARY:出差']),
    ev(['UID:u', 'DTSTART:20261120T020000Z', 'DURATION:PT30M', 'SUMMARY:电话']),
    ev(['UID:w', 'DTSTART;TZID="China Standard Time":20261121T150000', 'SUMMARY:Windows']),
    ev(['UID:x', 'DTSTART;TZID=Asia/Shanghai:20261121T090000', 'STATUS:CANCELLED', 'SUMMARY:取消']),
  ), W);
  const by = Object.fromEntries(r.events.map(e => [e.uid, e]));
  assert.deepEqual([by.d.start, by.d.end, by.d.allDay], [S(2026, 11, 20), S(2026, 11, 22), true]);
  assert.deepEqual([by.u.start, by.u.end], [Date.UTC(2026, 10, 20, 2), Date.UTC(2026, 10, 20, 2, 30)]);
  assert.equal(by.w.start, S(2026, 11, 21, 15));
  assert.equal(by.x, undefined);
});

test('WEEKLY BYDAY with COUNT', () => {
  const r = expandCalendar(ics(ev(['UID:w1', 'SUMMARY:周会', 'DTSTART;TZID=Asia/Shanghai:20261116T090000', 'DTEND;TZID=Asia/Shanghai:20261116T100000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=5'])), W);
  assert.deepEqual(starts(r), [16, 18, 20, 23, 25].map(d => S(2026, 11, d, 9)));
  assert.ok(r.events.every(e => e.end - e.start === 36e5 && e.recurring));
});

test('EXDATE removes and RECURRENCE-ID overrides an occurrence', () => {
  const r = expandCalendar(ics(
    ev(['UID:s', 'SUMMARY:站会', 'DTSTART;TZID=Asia/Shanghai:20261116T090000', 'DURATION:PT15M', 'RRULE:FREQ=DAILY;COUNT=4', 'EXDATE;TZID=Asia/Shanghai:20261117T090000']),
    ev(['UID:s', 'SUMMARY:改期', 'RECURRENCE-ID;TZID=Asia/Shanghai:20261118T090000', 'DTSTART;TZID=Asia/Shanghai:20261118T140000', 'DURATION:PT15M']),
  ), W);
  assert.deepEqual(r.events.map(e => [e.title, e.start]), [['站会', S(2026, 11, 16, 9)], ['改期', S(2026, 11, 18, 14)], ['站会', S(2026, 11, 19, 9)]]);
});

test('MONTHLY last Friday, MONTHLY on the 31st, DAILY interval with UNTIL, YEARLY all-day', () => {
  const last = expandCalendar(ics(ev(['UID:m', 'DTSTART;TZID=Asia/Shanghai:20261127T150000', 'RRULE:FREQ=MONTHLY;BYDAY=-1FR'])), W);
  assert.deepEqual(starts(last), [S(2026, 11, 27, 15), S(2026, 12, 25, 15), S(2027, 1, 29, 15), S(2027, 2, 26, 15)]);
  const d31 = expandCalendar(ics(ev(['UID:t', 'DTSTART;TZID=Asia/Shanghai:20261031T080000', 'RRULE:FREQ=MONTHLY;COUNT=3'])), {...W, from: S(2026, 10, 1)});
  assert.deepEqual(starts(d31), [S(2026, 10, 31, 8), S(2026, 12, 31, 8), S(2027, 1, 31, 8)]);
  const every2 = expandCalendar(ics(ev(['UID:i', 'DTSTART;TZID=Asia/Shanghai:20261116T090000', 'RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261121T000000Z'])), W);
  assert.deepEqual(starts(every2), [16, 18, 20].map(d => S(2026, 11, d, 9)));
  const bday = expandCalendar(ics(ev(['UID:b', 'DTSTART;VALUE=DATE:20200315', 'RRULE:FREQ=YEARLY', 'SUMMARY:生日'])), {from: S(2026, 1, 1), to: S(2028, 1, 1), tz: TZ});
  assert.deepEqual(starts(bday), [S(2026, 3, 15), S(2027, 3, 15)]);
  assert.ok(bday.events.every(e => e.allDay));
});

test('a long-running daily series only yields the window, quickly', () => {
  const t0 = Date.now();
  const r = expandCalendar(ics(ev(['UID:old', 'DTSTART;TZID=Asia/Shanghai:20000101T090000', 'RRULE:FREQ=DAILY'])), {from: S(2026, 11, 19), to: S(2026, 11, 22), tz: TZ});
  assert.deepEqual(starts(r), [19, 20, 21].map(d => S(2026, 11, d, 9)));
  assert.ok(Date.now() - t0 < 2000);
  const many = expandCalendar(ics(ev(['UID:n', 'DTSTART;TZID=Asia/Shanghai:20261101T000000', 'RRULE:FREQ=DAILY'])), {from: S(2026, 11, 1), to: S(2030, 1, 1), tz: TZ, limit: 50});
  assert.equal(many.events.length, 50);
});

const xres = (body, url = '', status = 207) => { const r = new Response(body, {status, headers: {'content-type': 'application/xml; charset=utf-8'}}); Object.defineProperty(r, 'url', {value: url}); return r; };
const escXml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const DAV_ICS = ics(ev(['UID:dav1', 'SUMMARY:A&B 评审', 'DTSTART;TZID=Asia/Shanghai:20261118T100000', 'DTEND;TZID=Asia/Shanghai:20261118T110000', 'LOCATION:线上']));
function davServer(calls) {
  return async (url, init) => {
    calls.push({url, method: init.method, depth: init.headers.depth, auth: init.headers.authorization, body: String(init.body || '')});
    if (url === 'https://dav.ex.com/.well-known/caldav') return xres('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/principals/u1/</d:href></d:current-user-principal><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response></d:multistatus>', url);
    if (url === 'https://dav.ex.com/principals/u1/') return xres('<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><response><href>/principals/u1/</href><propstat><prop><C:calendar-home-set><href>/cal/u1/</href></C:calendar-home-set></prop></propstat></response></multistatus>', url);
    if (url === 'https://dav.ex.com/cal/u1/' && init.method === 'PROPFIND') return xres('<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/cal/u1/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response><d:response><d:href>/cal/u1/work/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype><d:displayname>工作</d:displayname><cal:supported-calendar-component-set><cal:comp name="VEVENT"/></cal:supported-calendar-component-set></d:prop></d:propstat></d:response><d:response><d:href>/cal/u1/todo/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype><d:displayname>待办</d:displayname><cal:supported-calendar-component-set><cal:comp name="VTODO"/></cal:supported-calendar-component-set></d:prop></d:propstat></d:response></d:multistatus>', url);
    if (url === 'https://dav.ex.com/cal/u1/work/' && init.method === 'REPORT') return xres(`<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/cal/u1/work/a.ics</d:href><d:propstat><d:prop><cal:calendar-data>${escXml(DAV_ICS)}</cal:calendar-data></d:prop></d:propstat></d:response></d:multistatus>`, url);
    return xres('not found', url, 404);
  };
}

test('xmlBlocks handles prefixes, self-closing tags and does not confuse calendar with calendar-data', () => {
  assert.deepEqual(xmlBlocks('<d:href>a</d:href><href>b</href>', 'href'), ['a', 'b']);
  assert.deepEqual(xmlBlocks('<c:calendar/><c:calendar-data>x</c:calendar-data>', 'calendar'), ['']);
  assert.deepEqual(xmlBlocks('<c:calendar-data>x</c:calendar-data>', 'calendar-data'), ['x']);
});

test('CalDAV discovery: well-known → principal → home → VEVENT calendars → REPORT', async () => {
  const calls = [];
  const fetcher = davServer(calls);
  const request = async (u, o) => { const r = await fetcher(u, {...o}); if (!r.ok) throw new Error('服务器返回 ' + r.status); return {text: await r.text(), url: r.url}; };
  const r = await caldavEvents({request, url: 'https://dav.ex.com/', username: 'u1', password: 'pw', from: S(2026, 11, 15), to: S(2026, 12, 15), tz: TZ});
  assert.deepEqual(calls.map(c => [c.method, c.url.replace('https://dav.ex.com', ''), c.depth]), [['PROPFIND', '/.well-known/caldav', '0'], ['PROPFIND', '/principals/u1/', '0'], ['PROPFIND', '/cal/u1/', '1'], ['REPORT', '/cal/u1/work/', '1']]);
  assert.ok(calls.every(c => c.auth === 'Basic ' + Buffer.from('u1:pw').toString('base64')));
  assert.match(calls[3].body, /time-range start="20261114T160000Z" end="20261214T160000Z"/);
  assert.equal(r.name, '工作');
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].title, 'A&B 评审');
  assert.equal(r.events[0].calendar, '工作');
});

const memStore = () => ({data: {activity: []}, async save() {}, log(t, d) { this.data.activity.unshift({title: t, detail: d}); }});
const codec = {seal: s => 'S:' + Buffer.from(s).toString('base64'), open: c => Buffer.from(c.slice(2), 'base64').toString()};
const NOW = S(2026, 11, 16);

test('calendar connector (.ics): replace semantics keep ids, apply edits and deletions', async () => {
  let body = ics(ev(['UID:r1', 'SUMMARY:评审', 'DTSTART;TZID=Asia/Shanghai:20261118T100000', 'DURATION:PT1H']), ev(['UID:r2', 'SUMMARY:培训', 'DTSTART;TZID=Asia/Shanghai:20261119T140000']));
  const fetcher = async u => { const r = new Response(body, {headers: {'content-type': 'text/calendar; charset=utf-8'}}); Object.defineProperty(r, 'url', {value: u}); return r; };
  const store = memStore();
  const svc = createConnectorService({store, adapters: [feedAdapter, createCalendarAdapter({tz: TZ})], fetcher, secrets: codec, now: () => NOW});
  assert.equal(kindInfo('calendar').available, true);
  const {id, added} = await svc.handle({action: 'add', kind: 'calendar', config: {url: 'webcal://cal.ex.com/a.ics'}});
  assert.equal(added, 2);
  const c = svc.view().connectors[0];
  assert.deepEqual(c.config, {mode: 'ics', url: 'https://cal.ex.com/a.ics'});
  assert.equal(c.sourceTitle, '工作日历');
  const before = store.data.connectorItems.find(i => i.title === '评审');
  assert.equal(before.start, S(2026, 11, 18, 10));
  assert.equal(before.kind, 'event');
  body = body.replace('SUMMARY:评审', 'SUMMARY:评审（改）').replace(/BEGIN:VEVENT\r\nUID:r2[\s\S]*?END:VEVENT\r\n/, '');
  assert.equal((await svc.sync(id)).added, 0);
  assert.equal(store.data.connectorItems.length, 1);
  assert.equal(store.data.connectorItems[0].title, '评审（改）');
  assert.equal(store.data.connectorItems[0].id, before.id);
  body = 'not a calendar';
  assert.match((await svc.sync(id)).error, /不是日历订阅/);
  assert.equal(store.data.connectorItems.length, 1);
});

test('calendar connector (CalDAV): password required only for CalDAV and never exposed', async () => {
  const calls = [], store = memStore();
  const svc = createConnectorService({store, adapters: [feedAdapter, createCalendarAdapter({tz: TZ})], fetcher: davServer(calls), secrets: codec, now: () => NOW});
  await assert.rejects(svc.handle({action: 'add', kind: 'calendar', config: {mode: 'caldav', url: 'https://dav.ex.com/', username: 'u1'}}), /请填写应用专用密码/);
  await assert.rejects(svc.handle({action: 'add', kind: 'calendar', config: {mode: 'caldav', url: 'https://dav.ex.com/'}, secrets: {password: 'pw'}}), /CalDAV 账号/);
  const r = await svc.handle({action: 'add', kind: 'calendar', config: {mode: 'caldav', url: 'https://dav.ex.com/', username: 'u1'}, secrets: {password: 'pw'}});
  assert.equal(r.added, 1);
  const json = JSON.stringify(svc.view());
  assert.ok(!json.includes('pw"') && !json.includes('S:'));
  assert.equal(svc.view().connectors[0].hasSecret, true);
});

test('eventTimeLabel and upcomingEvents use local days', () => {
  const now = new Date(2026, 10, 19, 8).getTime();
  const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();
  assert.equal(eventTimeLabel({start: at(19, 9), end: at(19, 10, 30)}, now), '今天 09:00–10:30');
  assert.equal(eventTimeLabel({start: at(20, 0), end: at(21, 0), allDay: true}, now), '明天 全天');
  assert.match(eventTimeLabel({start: at(23, 0), end: at(25, 0), allDay: true}, now), /^11月23日 周一 – 11月24日 周二 全天$/);
  const items = [{start: at(19, 7), end: at(19, 7, 30)}, {start: at(20, 9), end: at(20, 10)}, {start: at(19, 9), end: at(19, 10)}, {title: 'feed', time: 1}];
  assert.deepEqual(upcomingEvents(items, {now, days: 1}).map(e => e.start), [at(19, 9)]);
  assert.deepEqual(upcomingEvents(items, {now, days: 2}).map(e => e.start), [at(19, 9), at(20, 9)]);
});

test('calendar UI: mode select, CalDAV fields, upcoming items ascending', () => {
  const form = connectorForm({}, null, 'calendar');
  assert.match(form, /<select name="cfg_mode">/);
  assert.match(form, /name="cfg_username"/);
  assert.match(form, /type="password" name="sec_password"/);
  assert.ok(!/name="sec_password"[^>]*required/.test(form));
  const f = new FormData();
  for (const [k, v] of [['kind', 'calendar'], ['name', ''], ['interval', '30'], ['cfg_mode', 'caldav'], ['cfg_url', 'https://dav.ex.com/'], ['cfg_username', 'u1'], ['sec_password', 'pw']]) f.set(k, v);
  assert.deepEqual(connectorPayload(f), {action: 'add', kind: 'calendar', name: '', interval: 30, config: {mode: 'caldav', url: 'https://dav.ex.com/', username: 'u1'}, secrets: {password: 'pw'}});
  const soon = Date.now() + 36e5, later = Date.now() + 3 * 864e5;
  const state = {connectors: [{id: 'c', kind: 'calendar', name: '日历', status: 'ok', count: 2, interval: 30}],
    connectorItems: [{id: '2', connectorId: 'c', title: '后面的会', start: later, end: later + 36e5, time: later}, {id: '1', connectorId: 'c', title: '<b>先开的会</b>', start: soon, end: soon + 36e5, time: soon, location: '3楼'}]};
  const ui = {action: (l, a, id = '') => `<button data-action="${a}" data-id="${id}">${l}</button>`, date: () => 'd', heading: (k, t) => `<h1>${t}</h1>`, empty: t => t};
  const list = connectorItemsView(state, 'c', ui);
  assert.ok(list.indexOf('先开的会') < list.indexOf('后面的会'));
  assert.ok(!list.includes('<b>先开') && list.includes('3楼'));
  assert.match(connectorsPage(state, ui), /connector-latest">[^<]*先开的会/);
});
