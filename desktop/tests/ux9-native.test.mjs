import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import office from '../runtime/vendor/office.cjs';
import { generateDocument, normalizeSpec, xlsxImagesFromContent } from '../runtime/documents.mjs';
import { parseRange, validateSheetDrawings, chartXml } from '../runtime/xlsx-drawing.mjs';
import { readTable } from '../runtime/table-read.mjs';
import { executeAppTool, appToolDefinitions, APP_INTENT, appToolContext } from '../services/app-tools.mjs';
import { createWebLookup, publicUrl } from '../services/web-lookup.mjs';
import { guideFor } from '../services/connector-guides.mjs';
import { feedPage } from '../src/ui/feed.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const ROWS = [['月份', '营收', '成本'], ['1月', 120, 80], ['2月', 150, 90], ['3月', 170, {formula: 'B4-40'}]];
const SPEC = {sheets: [{name: '经营', rows: ROWS, charts: [{type: 'column', title: '月度营收', range: 'A1:C4', anchor: 'E2'}, {type: 'pie', title: '营收占比', categories: 'A2:A4', series: [{name: '营收', values: 'B2:B4'}]}, {type: 'line', range: 'A1:B4', dataLabels: true}]},
  {name: "O'Neil 表", rows: [['x', 'y'], [1, 2], [2, 4]], charts: [{type: 'scatter', categories: 'A2:A3', series: [{name: 'B1', values: 'B2:B3'}]}], images: [{imageId: 'img1', anchor: 'D2', width: 120}]}]};
const parse = s => { const d = new office.DOMParser().parseFromString(s, 'application/xml'); assert.equal(d.getElementsByTagName('parsererror').length, 0); return d; };

test('xlsx: native charts and pictures are written as linked DrawingML parts', async () => { // includes a formula cell: recalculation must run before drawings are added
  const r = await generateDocument('xlsx', JSON.stringify(SPEC), {images: {img1: {base64: PNG, width: 1, height: 1}}});
  const files = office.zip.unzipSync(r.bytes), text = n => new TextDecoder().decode(files[n]);
  for (const n of ['xl/charts/chart1.xml', 'xl/charts/chart2.xml', 'xl/charts/chart3.xml', 'xl/charts/chart4.xml', 'xl/drawings/drawing1.xml', 'xl/drawings/drawing2.xml', 'xl/media/image1.png', 'xl/worksheets/_rels/sheet1.xml.rels', 'xl/drawings/_rels/drawing2.xml.rels']) assert.ok(files[n], n);
  for (const n of Object.keys(files).filter(n => n.endsWith('.xml') || n.endsWith('.rels'))) parse(text(n));
  const c1 = text('xl/charts/chart1.xml');
  assert.match(c1, /<c:barChart><c:barDir val="col"\/>/);
  assert.match(c1, /<c:f>'经营'!\$A\$2:\$A\$4<\/c:f>/);
  assert.match(c1, /<c:f>'经营'!\$C\$2:\$C\$4<\/c:f>/);
  assert.match(c1, /<c:f>'经营'!\$B\$1<\/c:f>/, 'series name linked to the header cell');
  assert.match(c1, /<c:pt idx="2"><c:v>170<\/c:v><\/c:pt>/);
  assert.match(c1, /月度营收/);
  assert.match(text('xl/charts/chart2.xml'), /<c:pieChart>[\s\S]*<c:dPt><c:idx val="2"\/>/);
  assert.match(text('xl/charts/chart3.xml'), /<c:lineChart>[\s\S]*<c:showVal val="1"\/>/);
  const c4 = text('xl/charts/chart4.xml');
  assert.match(c4, /<c:scatterChart>[\s\S]*<c:xVal>[\s\S]*'O''Neil 表'!\$A\$2:\$A\$3/);
  assert.match(text('xl/worksheets/sheet1.xml'), /<\/sheetData><drawing r:id="rIdDr1"\/>/);
  assert.match(text('xl/drawings/drawing1.xml'), /<xdr:from><xdr:col>4<\/xdr:col><xdr:colOff>0<\/xdr:colOff><xdr:row>1<\/xdr:row>/);
  assert.match(text('xl/drawings/drawing2.xml'), /<xdr:pic>[\s\S]*r:embed="rId2"[\s\S]*cx="1143000"/);
  const ct = text('[Content_Types].xml');
  assert.match(ct, /Extension="png" ContentType="image\/png"/);
  assert.equal((ct.match(/drawingml\.chart\+xml/g) || []).length, 4);
  assert.equal((ct.match(/officedocument\.drawing\+xml/g) || []).length, 2);
  const back = readTable('xlsx', Buffer.from(r.bytes));
  assert.ok(back && JSON.stringify(back).includes('营收'), 'still readable as a table');
  const plain = office.zip.unzipSync((await generateDocument('xlsx', JSON.stringify({sheets: [{name: 'a', rows: [['x']]}]}))).bytes);
  assert.ok(!Object.keys(plain).some(n => /drawing|chart/.test(n)), 'sheets without charts are unchanged');
});

test('xlsx chart validation: ranges, counts, types and images', () => {
  const bad = (sheet, re) => assert.throws(() => normalizeSpec('xlsx', JSON.stringify({sheets: [{name: 's', rows: ROWS, ...sheet}]})), re);
  bad({charts: [{type: 'radar', range: 'A1:C4'}]}, /图表类型/);
  bad({charts: [{range: 'A1:A4'}]}, /至少两列两行/);
  bad({charts: [{range: 'Sheet2!A1:C4'}]}, /本工作表/);
  bad({charts: [{categories: 'A2:A4', series: [{values: 'B2:C4'}]}]}, /一行或一列/);
  bad({charts: [{categories: 'A2:A3', series: [{values: 'B2:B4'}]}]}, /数量不一致/);
  bad({charts: [{range: 'A1:A1'}]}, /至少两列两行/);
  bad({charts: [{range: 'ZZZZ1:B2'}]}, /地址无效/);
  bad({charts: Array.from({length: 9}, () => ({range: 'A1:B4'}))}, /最多 8 张/);
  bad({charts: [{range: 'A1:B4', cols: 99}]}, /3–40/);
  bad({charts: [{range: 'D1:E4'}]}, /没有数字/);
  bad({images: [{imageId: '../x'}]}, /imageId/);
  bad({images: [{imageId: 'a', width: 5}]}, /40–1600/);
  assert.deepEqual(parseRange('$B$2:A9'), {c1: 0, r1: 1, c2: 1, r2: 8});
  assert.deepEqual(xlsxImagesFromContent(JSON.stringify(SPEC)), ['img1']);
  assert.throws(() => validateSheetDrawings({name: 's', rows: ROWS, images: [{imageId: 'zz'}]}, {imageIds: new Set(['img1'])}), /本轮/);
  const xml = chartXml(validateSheetDrawings({name: 's<x>', rows: [['<b>', 1], ['&', 2]], charts: [{type: 'bar', title: '<script>', categories: 'A1:A2', series: [{name: '"q"', values: 'B1:B2'}]}]}).charts[0], [['<b>', 1], ['&', 2]]);
  assert.ok(!xml.includes('<script>') && xml.includes('&lt;script&gt;') && xml.includes('&lt;b&gt;') && xml.includes('&amp;'));
  assert.match(xml, /<c:barDir val="bar"\/>[\s\S]*<c:orientation val="maxMin"\/>/);
});

test('document_create description teaches the model to add native charts', async () => {
  const agent = await readFile(new URL('../runtime/agent.mjs', import.meta.url), 'utf8');
  assert.match(agent, /charts:\[\{type:"column"/);
  assert.match(agent, /不要只给数据/);
  const svc = await readFile(new URL('../services/documents.mjs', import.meta.url), 'utf8');
  assert.match(svc, /args\.format==='xlsx' \? xlsxImagesFromContent\(args\.content\)/);
});

function setup({answer = true} = {}) {
  const store = {data: {connectors: []}, save() {}, log() {}}, asks = [], forms = [], added = [];
  const deps = {notify() {}, openConnectorForm: p => forms.push(p), connectors: {handle: async p => { added.push(p); return {id: 'c1', added: 5}; }},
    web: {search: async q => [{title: '钉钉自定义机器人', url: 'https://open.dingtalk.com/x', snippet: q}], read: async u => ({url: u, title: 't', text: '步骤…'})}};
  const run = (name, args) => executeAppTool(name, args, {store, deps, ask: async (t, d) => { asks.push({t, d}); return answer; }});
  return {run, asks, forms, added};
}

test('app_connector_add: keyless sources are added after confirmation; credential sources open a prefilled form', async () => {
  const f = setup();
  const r = await f.run('app_connector_add', {kind: 'feed', name: '公司公告', config: {url: 'https://example.com/feed.xml'}, interval: 60});
  assert.deepEqual(r, {status: 'succeeded', id: 'c1', added: 5});
  assert.match(f.asks[0].t, /添加连接/); assert.match(f.asks[0].d, /https:\/\/example\.com\/feed\.xml/);
  assert.deepEqual(f.added[0], {action: 'add', kind: 'feed', name: '公司公告', config: {url: 'https://example.com/feed.xml'}, interval: 60});
  const d = await f.run('app_connector_add', {kind: 'office', config: {platform: 'dingtalk', appId: 'ding123', appSecret: 'TOPSECRET'}});
  assert.equal(d.status, 'needs_user');
  assert.deepEqual(f.forms[0], {kind: 'office', config: {platform: 'dingtalk', appId: 'ding123'}, name: ''});
  assert.ok(!JSON.stringify(f.forms).includes('TOPSECRET') && !JSON.stringify(d).includes('TOPSECRET'), 'secrets never pass through');
  assert.match(d.message, /本人在表单里填写/); assert.equal(d.guide.title, '钉钉'); assert.match(d.note, /已忽略/);
  const m = await f.run('app_connector_add', {kind: 'mail', config: {preset: 'qq', email: 'a@qq.com'}});
  assert.equal(m.status, 'needs_user'); assert.match(m.message, /授权码/);
  const ics = await f.run('app_connector_add', {kind: 'calendar', config: {mode: 'ics', url: 'webcal://x.example.com/a.ics'}});
  assert.equal(ics.status, 'succeeded');
  await assert.rejects(f.run('app_connector_add', {kind: 'feed', config: {url: 'ftp://x'}}), /http/);
  await assert.rejects(f.run('app_connector_add', {kind: 'nope'}), /连接类型/);
  const no = setup({answer: false});
  assert.equal((await no.run('app_connector_add', {kind: 'feed', config: {url: 'https://a.example.com/'}})).status, 'denied');
  assert.equal(no.added.length, 0);
  const g = await f.run('app_connector_guide', {kind: 'office', platform: 'feishu'});
  assert.equal(g.guide.title, '飞书'); assert.ok(g.fields.some(x => /App ID/.test(x)));
  assert.equal(guideFor('calendar', {mode: 'caldav'}).title, 'CalDAV 日历账号');
});

test('app_web_search / app_web_read and the web lookup service', async () => {
  const f = setup();
  const s = await f.run('app_web_search', {query: '钉钉 自定义机器人 加签'});
  assert.equal(s.status, 'succeeded'); assert.equal(s.results[0].url, 'https://open.dingtalk.com/x');
  assert.equal((await f.run('app_web_read', {url: 'https://open.dingtalk.com/x'})).text, '步骤…');
  const rss = '<?xml version="1.0"?><rss version="2.0"><channel><title>Bing</title><item><title>飞书 &amp; 机器人</title><link>https://open.feishu.cn/doc</link><description>添加自定义机器人</description></item><item><title>bad</title><link>javascript:1</link></item></channel></rss>';
  const seen = [];
  const fetcher = async (url) => { seen.push(url); return new Response(url.includes('bing') ? rss : '<html><head><title>文档</title></head><body><nav>x</nav><p>第一步</p><script>evil()</script></body></html>', {headers: {'content-type': url.includes('bing') ? 'application/rss+xml' : 'text/html; charset=utf-8'}}); };
  const web = createWebLookup({fetcher});
  const results = await web.search('飞书 机器人');
  assert.deepEqual(results, [{title: '飞书 & 机器人', url: 'https://open.feishu.cn/doc', snippet: '添加自定义机器人'}]);
  assert.match(seen[0], /format=rss&.*q=%E9%A3%9E/);
  const page = await web.read('https://open.feishu.cn/doc');
  assert.equal(page.title, '文档'); assert.match(page.text, /第一步/); assert.ok(!page.text.includes('evil'));
  for (const u of ['http://localhost:3000', 'http://127.0.0.1/', 'http://192.168.1.2/', 'http://10.0.0.1', 'http://172.20.1.1', 'http://[::1]/', 'http://printer.local/', 'http://intranet/']) assert.throws(() => publicUrl(u), /公网/, u);
  assert.equal(publicUrl('https://open.dingtalk.com/document/'), 'https://open.dingtalk.com/document/');
  await assert.rejects(web.search(' '), /搜索词/);
});

test('app tool definitions, intent and context cover connectors and web lookup', () => {
  const names = appToolDefinitions().map(d => d.function.name);
  for (const n of ['app_connector_add', 'app_connector_guide', 'app_web_search', 'app_web_read']) assert.ok(names.includes(n), n);
  assert.ok(appToolDefinitions().every(d => d.function.parameters.additionalProperties === false));
  for (const s of ['帮我连一下我的钉钉', '接入飞书', '添加一个 RSS 订阅', '帮我绑定 QQ 邮箱', '联网搜索一下钉钉机器人的文档']) assert.ok(APP_INTENT.test(s), s);
  for (const s of ['通威股份最新的股价是多少', '帮我写一封邮件', '解释一下光伏产业链']) assert.ok(!APP_INTENT.test(s), s);
  assert.match(appToolContext(), /app_connector_add/); assert.match(appToolContext(), /不要说没有添加连接的能力/);
});

test('feed rows use prefixed classes (no clash with .chat / .primary layout) and plain-text details', () => {
  const action = (l, a, id = '', c = 'secondary') => `<button class="${c}" data-action="${a}" data-id="${id}">${l}</button>`;
  const state = {chats: [{id: 'c1', name: '帮我连一下我的钉钉', unread: true, finishedAt: Date.now(), messages: [{role: 'assistant', content: '## 结论\n**目前**没有 `app_connector_list` 之外的 - 工具'}]}]};
  const html = feedPage(state, {action, date: () => '今天', heading: (k, t, d, x) => `<h1>${t}</h1>${x}`, empty: t => t});
  const doc = new JSDOM(html).window.document;
  for (const row of doc.querySelectorAll('.feed-row')) for (const c of row.classList) assert.ok(['feed-row', 'unread'].includes(c) || /^f[ks]-/.test(c), c);
  for (const s of doc.querySelectorAll('.feed-body small')) assert.ok(!/[#*`]/.test(s.textContent), s.textContent);
});

test('wiring: main deps, renderer prefill and labels', async () => {
  const read = p => readFile(new URL(p, import.meta.url), 'utf8');
  const [main, app, css] = await Promise.all(['../main.mjs', '../src/app.js', '../src/workbench.css'].map(read));
  assert.match(main, /openConnectorForm: p =>/); assert.match(main, /web: createWebLookup\(\)/);
  assert.match(app, /actionId === 'connectorPrefill'/); assert.match(app, /handle\('connectorPrefill'/);
  assert.match(app, /app_web_search: '联网搜索'/);
  assert.match(css, /\.feed-row\.fk-log/);
});
