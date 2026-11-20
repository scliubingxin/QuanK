// [p3-m1] Dependency-free RSS 2.0 / RSS 1.0 (RDF) / Atom parser and plain-page snapshot for change tracking.
// Inputs are untrusted remote text: everything is bounded and returned as plain strings.
import { createHash } from 'node:crypto';

const ENT = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', middot: '·', copy: '©', reg: '®'};
export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const cdata = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, x) => x);
/** Visible text of an HTML/XML fragment, whitespace collapsed. */
export function plainText(html, max = 100000) {
  return decodeEntities(cdata(String(html || '').slice(0, 2_000_000))
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/<\/?[a-z][a-z0-9:-]*\b[^<>]*>/gi, ' ') // escaped markup (&lt;p&gt;) inside RSS descriptions
    .replace(/[ \t\f\v\u00a0]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, max);
}
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function tag(block, names) {
  for (const n of names) {
    const m = new RegExp(`<${esc(n)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(n)}>`, 'i').exec(block);
    if (m) return cdata(m[1]).trim();
  }
  return '';
}
function atomLink(block) {
  const links = [...block.matchAll(/<link\b([^>]*?)\/?>/gi)].map(m => m[1]);
  const attr = (a, k) => new RegExp(`\\b${k}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(a)?.[2];
  const pick = links.find(a => !attr(a, 'rel') || attr(a, 'rel') === 'alternate') || links[0];
  return pick ? decodeEntities(attr(pick, 'href') || '') : '';
}
const absolute = (href, base) => { try { const u = base ? new URL(href, base) : new URL(href); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const parseDate = s => { const t = Date.parse(String(s || '').trim()); return Number.isFinite(t) ? t : null; };

/** Returns {title, items:[{key,title,summary,url,time,author}]} or null when the text is not a feed. */
export function parseFeed(text, baseUrl = '') {
  const head = String(text || '').slice(0, 4000);
  const isAtom = /<feed\b[^>]*>/i.test(head) && /<entry\b/i.test(text);
  const isRss = /<rss\b|<rdf:RDF\b/i.test(head) || (/<channel\b/i.test(head) && /<item\b/i.test(text));
  if (!isAtom && !isRss) return null;
  const blocks = [...String(text).matchAll(isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi)].slice(0, 300).map(m => m[0]);
  const channel = isAtom ? String(text).split(/<entry\b/i)[0] : (/<channel\b[\s\S]*?(?:<item\b|<\/channel>)/i.exec(text)?.[0] || '');
  const items = blocks.map(b => {
    const title = plainText(tag(b, ['title']), 300);
    const rawLink = isAtom ? atomLink(b) : (plainText(tag(b, ['link']), 2048) || (/<link\b[^>]*rdf:resource=["']([^"']+)/i.exec(b)?.[1] || ''));
    const url = absolute(decodeEntities(rawLink), baseUrl);
    const guid = plainText(tag(b, ['guid', 'id']), 500);
    const summary = plainText(tag(b, ['description', 'summary', 'content:encoded', 'content']), 600);
    const time = parseDate(tag(b, ['pubDate', 'published', 'updated', 'dc:date']));
    const author = plainText(tag(b, ['author', 'dc:creator']), 80).replace(/\s*\n\s*/g, ' ');
    const key = guid || url || createHash('sha256').update(title + '|' + summary.slice(0, 200)).digest('hex').slice(0, 32);
    return {key, title: title || '（无标题）', summary, url, time, author};
  }).filter(i => i.title || i.url);
  return {title: plainText(tag(channel, ['title']), 200), items};
}

/** Snapshot of an ordinary web page: title, visible-text hash and an excerpt. */
export function pageSnapshot(html, url = '') {
  const title = plainText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html || '')?.[1] || '', 200) || url;
  const main = /<main\b[\s\S]*?<\/main>/i.exec(html || '')?.[0] || /<article\b[\s\S]*?<\/article>/i.exec(html || '')?.[0] || /<body\b[\s\S]*?<\/body>/i.exec(html || '')?.[0] || html || '';
  const text = plainText(main.replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' '));
  // Digits that look like clocks/counters change on every load; ignore them for the change signal.
  const normalised = text.replace(/\d{1,2}:\d{2}(:\d{2})?/g, '').replace(/\s+/g, ' ');
  return {title, hash: createHash('sha256').update(normalised).digest('hex').slice(0, 32), excerpt: text.slice(0, 600), length: text.length};
}
