import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, pageSnapshot, plainText, decodeEntities } from '../runtime/feed-parse.mjs';
import { createConnectorService, fetchText } from '../services/connectors.mjs';
import { safeUrl, intervalLabel, CONNECTOR_KINDS } from '../src/shared/connectors.js';
import { connectorsPage, connectorForm, connectorPayload, connectorItemsView } from '../src/ui/connectors.js';

const RSS = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>通威新闻</title>
<item><title><![CDATA[通威发布 <b>新品</b>]]></title><link>https://ex.com/a</link><guid>a1</guid><pubDate>Wed, 18 Nov 2026 08:00:00 GMT</pubDate><description>&lt;p&gt;光伏 &amp; 组件&lt;/p&gt;</description></item>
<item><title>第二条</title><link>/b</link><pubDate>Tue, 17 Nov 2026 08:00:00 GMT</pubDate></item></channel></rss>`;
const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title><entry><title>Hello</title><link rel="alternate" href="https://ex.com/h"/><id>tag:1</id><updated>2026-11-18T00:00:00Z</updated><summary>Sum</summary><author><name>Ann</name></author></entry></feed>`;
const PAGE = n => `<!doctype html><html><head><title>公告页</title></head><body><nav>菜单</nav><main><h1>公司公告</h1><p>第 ${n} 期公告内容，这里是比较长的正文文字。</p><p>更新于 10:3${n}</p></main><script>var x=1</script></body></html>`;

const res = (body, {status = 200, type = 'text/xml; charset=utf-8', url = ''} = {}) => { const r = new Response(body, {status, headers: {'content-type': type}}); Object.defineProperty(r, 'url', {value: url}); return r; };
const memStore = () => ({data: {activity: []}, saves: 0, async save() { this.saves++; }, log(t, d) { this.data.activity.unshift({title: t, detail: d}); }});
const codec = {seal: s => 'S:' + Buffer.from(s).toString('base64'), open: c => Buffer.from(c.slice(2), 'base64').toString()};

test('parseFeed reads RSS 2.0 with CDATA, entities, relative links and dates', () => {
  const f = parseFeed(RSS, 'https://ex.com/feed');
  assert.equal(f.title, '通威新闻');
  assert.equal(f.items.length, 2);
  assert.equal(f.items[0].title, '通威发布 新品');
  assert.equal(f.items[0].key, 'a1');
  assert.equal(f.items[0].summary, '光伏 & 组件');
  assert.equal(f.items[1].url, 'https://ex.com/b');
  assert.equal(f.items[0].time, Date.parse('2026-11-18T08:00:00Z'));
});

test('parseFeed reads Atom and RDF; rejects HTML', () => {
  const a = parseFeed(ATOM);
  assert.equal(a.items[0].url, 'https://ex.com/h');
  assert.equal(a.items[0].author, 'Ann');
  assert.equal(a.items[0].key, 'tag:1');
  const rdf = parseFeed('<rdf:RDF><channel><title>R</title></channel><item rdf:about="x"><title>T</title><link>https://r.com/1</link><dc:date>2026-11-01</dc:date></item></rdf:RDF>');
  assert.equal(rdf.items[0].url, 'https://r.com/1');
  assert.equal(parseFeed(PAGE(1)), null);
  assert.equal(parseFeed('<feedback>x</feedback>'), null);
});

test('links with javascript: are dropped and entities decode safely', () => {
  const f = parseFeed('<rss><channel><item><title>x</title><link>javascript:alert(1)</link></item></channel></rss>');
  assert.equal(f.items[0].url, '');
  assert.equal(decodeEntities('&#x4E2D;&#25991;&bogus;&#0;'), '中文&bogus;');
  assert.equal(plainText('<p>a<script>evil()</script>b</p><style>x{}</style>'), 'a b');
});

test('pageSnapshot ignores clock digits and navigation for the change hash', () => {
  const a = pageSnapshot(PAGE(1)), b = pageSnapshot(PAGE(1).replace('10:31', '10:39'));
  assert.equal(a.title, '公告页');
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, pageSnapshot(PAGE(2)).hash);
  assert.ok(!a.excerpt.includes('菜单') && !a.excerpt.includes('var x'));
});

test('safeUrl accepts http(s) and webcal, rejects others and embedded credentials', () => {
  assert.equal(safeUrl(' https://a.com/x '), 'https://a.com/x');
  assert.equal(safeUrl('webcal://c.com/cal.ics'), 'https://c.com/cal.ics');
  for (const bad of ['file:///etc/passwd', 'javascript:1', 'https://u:p@a.com', '', 'nope']) assert.throws(() => safeUrl(bad));
  assert.equal(intervalLabel(0), '仅手动同步');
  assert.equal(intervalLabel(180), '每 3 小时');
});

test('fetchText decodes GBK, enforces size limit and reports HTTP errors', async () => {
  const gbk = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]); // 中文
  const r = await fetchText(async () => res(gbk, {type: 'text/html; charset=gbk'}), 'https://a.com');
  assert.equal(r.text, '中文');
  await assert.rejects(fetchText(async () => res('x'.repeat(200), {}), 'https://a.com', {maxBytes: 100}), /内容超过/);
  await assert.rejects(fetchText(async () => res('no', {status: 404}), 'https://a.com'), /404/);
  await assert.rejects(fetchText(async () => { throw Object.assign(new Error('x'), {cause: {code: 'ENOTFOUND'}}); }, 'https://a.com'), /ENOTFOUND/);
});

test('feed connector: add syncs, dedupes, logs only later additions, removes cleanly', async () => {
  const store = memStore();
  let body = RSS;
  const svc = createConnectorService({store, fetcher: async u => res(body, {url: u}), secrets: codec, now: () => 1000});
  const r = await svc.handle({action: 'add', kind: 'feed', config: {url: 'https://ex.com/feed'}, interval: 60});
  assert.equal(r.added, 2);
  let v = svc.view();
  assert.equal(v.connectors[0].name, 'ex.com');
  assert.equal(v.connectors[0].status, 'ok');
  assert.equal(v.connectors[0].sourceTitle, '通威新闻');
  assert.equal(v.connectorItems.length, 2);
  assert.ok(v.connectorItems.every(i => i.initial));
  assert.equal(store.data.activity.length, 0);
  assert.equal((await svc.handle({action: 'sync', id: r.id})).added, 0);
  body = RSS.replace('<item>', '<item><title>第三条</title><guid>a3</guid></item><item>');
  assert.equal((await svc.handle({action: 'sync', id: r.id})).added, 1);
  assert.equal(store.data.activity[0].detail, 'ex.com：1 条');
  await assert.rejects(svc.handle({action: 'add', kind: 'feed', config: {url: 'https://ex.com/feed'}}), /已经连接/);
  assert.equal(svc.search('第三').length, 1);
  await svc.handle({action: 'remove', id: r.id});
  assert.deepEqual(svc.view(), {connectors: [], connectorItems: []});
});

test('page tracking produces an item only when the content changes', async () => {
  const store = memStore();
  let n = 1;
  const svc = createConnectorService({store, fetcher: async u => res(PAGE(n), {type: 'text/html', url: u}), secrets: codec});
  const {id} = await svc.handle({action: 'add', kind: 'feed', config: {url: 'https://co.com/news'}});
  assert.match(store.data.connectorItems[0].title, /开始跟踪：公告页/);
  assert.equal((await svc.sync(id)).added, 0);
  n = 2;
  assert.equal((await svc.sync(id)).added, 1);
  assert.match(store.data.connectorItems[0].title, /有更新/);
});

test('sync errors are recorded on the connector, not thrown; unavailable kinds are rejected', async () => {
  const store = memStore();
  const svc = createConnectorService({store, fetcher: async () => res('{"a":1}', {type: 'application/json'}), secrets: codec});
  const r = await svc.handle({action: 'add', kind: 'feed', config: {url: 'https://api.com/x'}});
  assert.match(r.error, /既不是订阅源/);
  assert.equal(svc.view().connectors[0].status, 'error');
  await assert.rejects(svc.handle({action: 'add', kind: 'nope', config: {}}), /暂不支持/);
  await assert.rejects(svc.handle({action: 'add', kind: 'feed', config: {url: 'file:///x'}}), /http/);
  await assert.rejects(svc.handle({action: 'add', kind: 'feed', config: {url: 'https://a.com'}, interval: 7}), /频率/);
});

test('secrets are sealed, never exposed in view, and opened only for the adapter', async () => {
  const store = memStore();
  let seen;
  const adapter = {kind: 'feed', secretFields: [{name: 'password', label: '密码', required: true}], normalize: c => ({url: safeUrl(c.url)}),
    async sync({secret}) { seen = secret.password; return {items: [{key: 'k', title: 't'}]}; }};
  const svc = createConnectorService({store, adapters: [adapter], fetcher: async () => res(''), secrets: codec});
  await assert.rejects(svc.handle({action: 'add', kind: 'feed', config: {url: 'https://a.com'}}), /请填写密码/);
  const {id} = await svc.handle({action: 'add', kind: 'feed', config: {url: 'https://a.com'}, secrets: {password: 'p@ss'}});
  assert.equal(seen, 'p@ss');
  assert.ok(store.data.connectors[0].sealed.password.startsWith('S:'));
  const json = JSON.stringify(svc.view());
  assert.ok(!json.includes('p@ss') && !json.includes('S:') && !json.includes('sealed'));
  assert.equal(svc.view().connectors[0].hasSecret, true);
  await svc.handle({action: 'update', id, name: '新名字'});
  assert.equal(store.data.connectors[0].sealed.password, codec.seal('p@ss'));
});

test('tick syncs only due connectors with an interval, one at a time', async () => {
  const store = memStore();
  let t = 0, calls = 0;
  const svc = createConnectorService({store, fetcher: async () => { calls++; return res(RSS); }, secrets: codec, now: () => t});
  await svc.handle({action: 'add', kind: 'feed', config: {url: 'https://a.com/f'}, interval: 15});
  await svc.handle({action: 'add', kind: 'feed', config: {url: 'https://b.com/f'}, interval: 0});
  assert.equal(calls, 2);
  assert.equal(await svc.tick(), null);
  t = 15 * 60e3 + 1;
  assert.ok(await svc.tick());
  assert.equal(calls, 3);
  assert.equal(await svc.tick(), null);
});

test('update with a new URL clears old items; per-connector cap holds', async () => {
  const store = memStore();
  const many = '<rss><channel>' + Array.from({length: 400}, (_, i) => `<item><title>t${i}</title><guid>g${i}</guid></item>`).join('') + '</channel></rss>';
  const svc = createConnectorService({store, fetcher: async u => res(u.includes('many') ? many : RSS), secrets: codec});
  const {id} = await svc.handle({action: 'add', kind: 'feed', config: {url: 'https://a.com/many'}});
  assert.equal(store.data.connectorItems.length, 300);
  const r = await svc.handle({action: 'update', id, config: {url: 'https://a.com/rss'}});
  assert.equal(r.added, 2);
  assert.equal(store.data.connectorItems.length, 2);
});

test('UI builders escape remote content and round-trip the form', () => {
  const state = {connectors: [{id: 'c1', kind: 'feed', name: '<img src=x>', status: 'error', error: '<b>bad</b>', count: 1, interval: 60, config: {url: 'https://a.com'}}],
    connectorItems: [{id: 'i', connectorId: 'c1', title: '<script>x</script>', summary: 's', url: 'https://a.com/1', time: 1}]};
  const ui = {action: (l, a, id = '') => `<button data-action="${a}" data-id="${id}">${l}</button>`, date: () => 'd', heading: (k, t) => `<h1>${t}</h1>`, empty: t => t};
  const html = connectorsPage(state, ui);
  assert.ok(!html.includes('<img src=x>') && !html.includes('<b>bad</b>'));
  assert.equal(CONNECTOR_KINDS.filter(k => k.available).length, 4);
  assert.ok(!html.includes('connectorSoon'));
  assert.ok(!connectorItemsView(state, 'c1', ui).includes('<script>'));
  assert.match(connectorForm(state, null, 'feed'), /name="cfg_url"/);
  const f = new FormData();
  f.set('kind', 'feed'); f.set('name', 'N'); f.set('interval', '15'); f.set('cfg_url', 'https://a.com'); f.set('sec_password', '');
  assert.deepEqual(connectorPayload(f), {action: 'add', kind: 'feed', name: 'N', interval: 15, config: {url: 'https://a.com'}});
  assert.deepEqual(connectorPayload(f, 'c1').action, 'update');
});
