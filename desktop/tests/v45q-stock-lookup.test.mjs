// [v45q] 对话里「添加宁德时代」：联网查代码、名称和公司标志后加入股票池
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createStockLookup, resolveStock, iconCandidates, websiteFrom, sniffImage, exchangeOf } from '../services/stock-lookup.mjs';
import { executeAppTool, appToolDefinitions, appToolContext } from '../services/app-tools.mjs';
import { quantPage, quantAddForm } from '../src/ui/quant.js';
import { QUANT_INTENT } from '../src/shared/quant.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(120, 7)]);
const res = (body, {status = 200, type = 'application/json', url = ''} = {}) => {
  const b = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return {ok: status < 400, status, url, headers: {get: k => k.toLowerCase() === 'content-type' ? type : k.toLowerCase() === 'content-length' ? String(b.length) : null}, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length)};
};
const SUGGEST = {QuotationCodeTable: {Data: [
  {Code: '300750', Name: '宁德时代', PinYin: 'NDSD', Classify: 'AStock', SecurityTypeName: '深A'},
  {Code: '03750', Name: '宁德时代', PinYin: 'NDSD', Classify: 'HK', SecurityTypeName: '港股'}]}};
function fake(routes) {
  const calls = [];
  const fetcher = async (url) => { calls.push(url); for (const [re, fn] of routes) if (re.test(url)) return fn(url); return res('nf', {status: 404}); };
  return {fetcher, calls};
}

test('find + resolve: name -> single A-share, code passthrough, HK-only error, choices', async () => {
  const f = fake([[/suggest.*input=%E5%AE%81/, () => res(SUGGEST)],
    [/suggest.*input=%E8%8C%85/, () => res({QuotationCodeTable: {Data: [{Code: '600519', Name: '贵州茅台', PinYin: 'GZMT', Classify: 'AStock', SecurityTypeName: '沪A'}, {Code: '600199', Name: '金种子酒', PinYin: 'JZZJ', Classify: 'AStock', SecurityTypeName: '沪A'}]}})],
    [/suggest.*input=00700/, () => res({QuotationCodeTable: {Data: [{Code: '00700', Name: '腾讯控股', Classify: 'HK', SecurityTypeName: '港股'}]}})],
    [/suggest.*input=600519/, () => res({QuotationCodeTable: {Data: [{Code: '600519', Name: '贵州茅台', PinYin: 'GZMT', Classify: 'AStock', SecurityTypeName: '沪A'}]}})]]);
  const lk = createStockLookup({fetcher: f.fetcher});
  assert.deepEqual(await resolveStock(lk, '宁德时代'), {code: '300750', name: '宁德时代', board: '深A'});
  assert.deepEqual(await resolveStock(lk, 'SH600519'), {code: '600519', name: '贵州茅台', board: '沪A'});
  assert.match((await resolveStock(lk, '00700')).error, /只支持沪深北 A 股.*腾讯控股/);
  const ch = await resolveStock(lk, '茅'); assert.deepEqual(ch.choices.map(c => c.code), ['600519', '600199']);
  assert.match((await resolveStock(lk, '')).error, /请提供/);
  const off = createStockLookup({fetcher: async () => { throw new Error('offline'); }});
  assert.deepEqual(await resolveStock(off, '300750'), {code: '300750', name: '', board: ''});
  assert.match((await resolveStock(off, '宁德')).error, /暂时无法联网/);
});

test('logo: F10 website -> homepage icon link -> sniffed image data URL; failures give empty string', async () => {
  assert.equal(exchangeOf('600519'), 'SH'); assert.equal(exchangeOf('300750'), 'SZ'); assert.equal(exchangeOf('830799'), 'BJ');
  assert.equal(websiteFrom({jbzl: [{ORG_WEB: 'www.catl.com'}]}), 'http://www.catl.com');
  assert.deepEqual(iconCandidates('<link rel="icon" href="/s.svg"><link rel="shortcut icon" href="/f.png" sizes="32x32"><link rel="apple-touch-icon" href="t.png">', 'https://a.cn/x/'),
    ['https://a.cn/x/t.png', 'https://a.cn/f.png', 'https://a.cn/favicon.ico']);
  assert.equal(sniffImage(PNG), 'image/png'); assert.equal(sniffImage(Buffer.from('<svg>'.padEnd(64, ' '))), '');
  const f = fake([[/CompanySurvey.*SZ300750/, () => res({jbzl: [{ORG_WEB: 'www.catl.com'}]})],
    [/^http:\/\/www\.catl\.com\/?$/, u => res('<html><head><link rel="apple-touch-icon" href="/logo.png"></head></html>', {type: 'text/html', url: 'https://www.catl.com/'})],
    [/catl\.com\/logo\.png/, () => res(PNG, {type: 'image/png'})]]);
  const lk = createStockLookup({fetcher: f.fetcher});
  assert.match(await lk.logo('300750'), /^data:image\/png;base64,/);
  assert.equal(await createStockLookup({fetcher: fake([[/CompanySurvey/, () => res({jbzl: [{ORG_WEB: 'http://10.0.0.1'}]})]]).fetcher}).logo('300750'), '');
  assert.equal(await createStockLookup({fetcher: fake([[/CompanySurvey/, () => res({jbzl: [{ORG_WEB: 'x.cn'}]})], [/x\.cn/, () => res('<html>not an image</html>', {type: 'image/png'})]]).fetcher}).logo('000001'), '');
  assert.equal(await lk.logo('abc'), '');
});

test('chat tool: 「添加宁德时代」 resolves the name, confirms with name + code, then adds', async () => {
  const seen = [], asked = [];
  const quant = {view: () => ({status: 'running', pool: []}), handle: async p => {
    seen.push(p);
    if (p.action === 'resolveStock') return p.query === '茅' ? {choices: [{code: '600519', name: '贵州茅台'}, {code: '600199', name: '金种子酒'}]} : p.query === '腾讯' ? {error: 'QuankSight 股票池目前只支持沪深北 A 股'} : {code: '300750', name: '宁德时代', board: '深A'};
    if (p.action === 'findStock') return {candidates: [{code: '300750', name: '宁德时代'}]};
    return {pool: [{code: p.code, name: p.name}], logo: true};
  }};
  const run = (name, args, answer = true) => executeAppTool(name, args, {store: {data: {}}, deps: {quant, notify() {}}, ask: async t => { asked.push(t); return answer; }});
  const r = await run('app_quant_pool_add', {query: '宁德时代'});
  assert.equal(r.status, 'succeeded'); assert.deepEqual(r.added, {code: '300750', name: '宁德时代'}); assert.equal(r.logo, true);
  assert.equal(asked.at(-1), '把 宁德时代（300750）加入量化股票池？');
  assert.deepEqual(seen.at(-1), {action: 'addStock', code: '300750', name: '宁德时代'});
  const c = await run('app_quant_pool_add', {query: '茅'}); assert.equal(c.status, 'needs_choice'); assert.equal(c.candidates.length, 2);
  assert.equal((await run('app_quant_pool_add', {query: '腾讯'})).status, 'failed');
  assert.equal((await run('app_quant_pool_add', {name: '宁德时代'})).status, 'succeeded');
  assert.equal((await run('app_quant_find_stock', {query: '宁德'})).candidates[0].code, '300750');
  const defs = appToolDefinitions(), add = defs.find(d => d.function.name === 'app_quant_pool_add').function;
  assert.ok(add.parameters.properties.query); assert.deepEqual(add.parameters.required || [], []);
  assert.ok(defs.some(d => d.function.name === 'app_quant_find_stock'));
  assert.match(appToolContext(), /query 里/);
  for (const s of ['添加宁德时代', '把贵州茅台加到自选', '关注一下比亚迪']) assert.ok(QUANT_INTENT.test(s), s);
});

test('UI: stock cards show the company logo; add form takes a name or a code', async () => {
  const logo = 'data:image/png;base64,' + PNG.toString('base64');
  const html = quantPage({quant: {status: 'running', installed: true, pool: [{code: '300750', name: '宁德时代', last: {action: 'HOLD'}}, {code: '600519', name: '贵州茅台'}], logos: {'300750': logo, '600519': 'javascript:alert(1)'}}},
    {action: (l, id, x = '') => `<button data-action="${id}" data-id="${x}">${l}</button>`, heading: () => '', empty: t => t, date: String});
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelector('[data-quant="300750"] .q-logo img').getAttribute('src'), logo);
  assert.equal(doc.querySelector('[data-quant="600519"] .q-logo'), null);
  assert.match(quantAddForm(), /公司名称/);
  const [main, engine, css, hq] = await Promise.all(['../main.mjs', '../services/quant-engine.mjs', '../src/workbench.css', '../src/ui/home-quant.js'].map(p => readFile(new URL(p, import.meta.url), 'utf8')));
  assert.match(main, /lookup: createStockLookup\(\)/); assert.match(engine, /a === 'resolveStock'/); assert.match(engine, /logos: s\.logos \|\| \{\}/);
  assert.ok(css.includes('.q-logo img{')); assert.match(hq, /hq-logo/);
});
