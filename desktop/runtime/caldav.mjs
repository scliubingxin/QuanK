// [p3-m2] Minimal read-only CalDAV client (RFC 4791 / 6764):
// .well-known → current-user-principal → calendar-home-set → calendars (VEVENT) → calendar-query REPORT with a time range.
import { decodeEntities } from './feed-parse.mjs';
import { expandCalendar } from './ical.mjs';

const XML = {'content-type': 'application/xml; charset=utf-8'};
const NS = 'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"';
const PROP = `<?xml version="1.0" encoding="utf-8"?><d:propfind ${NS}><d:prop><d:current-user-principal/><d:resourcetype/><d:displayname/><c:calendar-home-set/></d:prop></d:propfind>`;
const LIST = `<?xml version="1.0" encoding="utf-8"?><d:propfind ${NS}><d:prop><d:resourcetype/><d:displayname/><c:supported-calendar-component-set/></d:prop></d:propfind>`;
const tagRe = name => new RegExp(`<(?:[\\w-]+:)?${name}(?=[\\s/>])[^>]*?(?:/>|>([\\s\\S]*?)</(?:[\\w-]+:)?${name}\\s*>)`, 'gi');
export const xmlBlocks = (xml, name) => [...String(xml || '').matchAll(tagRe(name))].map(m => m[1] ?? '');
const first = (xml, name) => xmlBlocks(xml, name)[0] ?? '';
const text = s => decodeEntities(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')).trim();
const href = xml => text(first(xml, 'href'));
const isCalendar = xml => /<(?:[\w-]+:)?calendar\s*\/>|<(?:[\w-]+:)?calendar\s*>\s*<\//i.test(first(xml, 'resourcetype'));
const stamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const query = (from, to) => `<?xml version="1.0" encoding="utf-8"?><c:calendar-query ${NS}><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${stamp(from)}" end="${stamp(to)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
function icsOf(block) {
  const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(block);
  return cdata ? cdata[1] : decodeEntities(block);
}

/** request(url, {method, headers, body, maxBytes}) -> {text, url}; throws on non-2xx. */
export async function caldavEvents({request, url, username, password, from, to, tz, maxCalendars = 8}) {
  const auth = {authorization: 'Basic ' + Buffer.from(`${username}:${password || ''}`, 'utf8').toString('base64')};
  const dav = (u, method, depth, body) => request(u, {method, body, maxBytes: 8 * 1024 * 1024, headers: {...XML, ...auth, depth: String(depth), accept: 'application/xml, text/xml, */*'}});
  const abs = (h, base) => new URL(h, base).href;
  let r = null, base = url;
  if (new URL(url).pathname === '/') { try { const wk = abs('/.well-known/caldav', url); r = await dav(wk, 'PROPFIND', 0, PROP); base = r.url || wk; } catch { r = null; } }
  if (!r) { r = await dav(url, 'PROPFIND', 0, PROP); base = r.url || url; }
  let calendars = [];
  if (isCalendar(r.text)) calendars = [{url: base, name: text(first(r.text, 'displayname'))}];
  else {
    let home = href(first(r.text, 'calendar-home-set')), homeBase = base;
    if (!home) {
      const principal = href(first(r.text, 'current-user-principal'));
      if (!principal) throw new Error('没有找到日历账户信息，请确认 CalDAV 地址');
      homeBase = abs(principal, base);
      const pr = await dav(homeBase, 'PROPFIND', 0, PROP);
      homeBase = pr.url || homeBase;
      home = href(first(pr.text, 'calendar-home-set'));
      if (!home) throw new Error('没有找到日历目录');
    }
    const homeUrl = abs(home, homeBase), list = await dav(homeUrl, 'PROPFIND', 1, LIST);
    for (const resp of xmlBlocks(list.text, 'response')) {
      if (!isCalendar(resp)) continue;
      const comps = first(resp, 'supported-calendar-component-set');
      if (comps && !/VEVENT/i.test(comps)) continue;
      calendars.push({url: abs(href(resp), list.url || homeUrl), name: text(first(resp, 'displayname'))});
    }
  }
  if (!calendars.length) throw new Error('这个账户下没有日历');
  const picked = calendars.slice(0, maxCalendars), events = [], names = [];
  let failed = 0, lastError = null;
  for (const cal of picked) {
    try {
      const rep = await dav(cal.url, 'REPORT', 1, query(from, to));
      for (const block of xmlBlocks(rep.text, 'calendar-data')) events.push(...expandCalendar(icsOf(block), {from, to, tz}).events.map(e => ({...e, calendar: cal.name})));
      if (cal.name) names.push(cal.name);
    } catch (e) { failed++; lastError = e; }
  }
  if (failed === picked.length) throw lastError || new Error('读取日历失败');
  const seen = new Set();
  return {name: names.join('、'), calendars: picked.length, failed,
    events: events.filter(e => !seen.has(e.key) && seen.add(e.key)).sort((a, b) => a.start - b.start)};
}
