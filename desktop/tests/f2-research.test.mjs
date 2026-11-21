// [F2] 投研文档: announcements (M2), research reports (M1), research library (M3), exports (M4), chat tools, UI and feed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { classifyNotice, parseNoticeList, parseNoticeContent, keyPoints, buildStockReport, reportToDocx, reportToPptx, reportToHtml, briefingReport, reviewReport, engineReport, libraryItems, normalizeNote } from '../src/shared/research.js';
import { generateDocument } from '../runtime/documents.mjs';
import { createResearchService } from '../services/research.mjs';
import { researchBox, researchLibraryBox, researchUI } from '../src/ui/research.js';
import { executeAppTool, appToolDefinitions, APP_INTENT } from '../services/app-tools.mjs';
import { buildFeed } from '../src/shared/feed.js';

const item = (id, title, date, column = '其他') => ({art_code: id, codes: [{stock_code: '600438', short_name: '通威股份'}], columns: [{column_name: column}], notice_date: `${date} 00:00:00`, display_time: `${date} 17:47:06:412`, title: `通威股份:${title}`, title_ch: `通威股份:${title}`});
const LIST = (...items) => ({success: 1, data: {list: items, total_hits: items.length}});
const BODY = id => ({data: {art_code: id, notice_content: '证券代码：600438 证券简称：通威股份\n 重要内容提示：\n ● 预计 2026 年度归属于上市公司股东的净利润为 -51 亿元至 -45 亿元，同比由盈转亏。\n ● 回购股份价格：不高于 17.20 元/股（含）\n 本公司董事会及全体董事保证本公告内容不存在任何虚假记载。\n 公司将努力推进，敬请广大投资者注意投资风险。', attach_url: `https://pdf.dfcfw.com/pdf/H2_${id}_1.pdf?1795196925000.pdf`}});
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const bars = n => Array.from({length: n}, (_, i) => { const d = new Date(Date.UTC(2026, 5, 1 + i)); const c = 12 - i * 0.01; return {date: d.toISOString().slice(0, 10), open: c, close: c - 0.02, high: c + 0.1, low: c - 0.1, volume: 1000 + i, amount: 1e7, pct: -0.2}; });
const SIGNAL = {summary: {name: '通威股份', action: 'HOLD', actionText: '暂停定投', score: 34, scoreRaw: 55.3, multiplier: 0, price: 11.11, changePct: -2.46, detail: '行业景气下行且业绩预告仍亏损', advice: '本次不买不卖', reasons: ['理由一'], gates: ['硬顶 34'], factors: [{name: '光伏行业景气', score: 0, max: 3, reason: '近60日-29.2%'}], indicators: [{name: 'RSI', value: 41.2}], backtest: {smartPct: -13.52, blindPct: -40.44, excess: 26.92, winRate: 0, trades: 0, maxDrawdown: 45.37}, probPct: 43.2},
  charts: {curve: [['日期', '智能定投市值', '普通定投市值', '智能定投投入'], ['2026-06-01', 0, 0, 0], ['2026-06-02', 110, 90, 100], ['2026-06-03', 95, 80, 100]], ops: [{date: '2026-06-02', action: 'BUY', price: 11.9, shares: 20, reason: '震荡市定投'}]},
  holding: {shares: 30500, cost: 21.02, value: 338855, pnl: -302255, pnlPct: -47.15}};

function rig({quantOn = true, ask = null, rasterize = null, now} = {}) {
  const store = {data: {documents: [], activity: [], quant: {pool: [{code: '600438', name: '通威股份', last: {action: 'HOLD', actionText: '暂停定投', score: 34, multiplier: 0, changePct: -2.46}}]}, briefings: []}, saves: 0, async save() { this.saves++; }};
  let list = LIST(item('AN1', '关于以集中竞价交易方式回购股份方案的公告', '2026-11-20', '回购预案'), item('AN2', '2026年第一次临时股东会会议资料', '2026-11-19', '股东大会资料'));
  const calls = [], alerts = [], imported = [];
  const fetcher = async url => { calls.push(url); const body = /content\/ann/.test(url) ? BODY(new URL(url).searchParams.get('art_code')) : list; return {ok: true, status: 200, text: async () => JSON.stringify(body)}; };
  const documents = {async importFile(name, format, bytes) { const d = {id: 'doc' + (store.data.documents.length + 1), name, format, text: `${name} 正文`}; store.data.documents.push(d); imported.push({name, format, bytes: Buffer.from(bytes)}); return {status: 'succeeded', document: {id: d.id, name, format}}; }};
  const market = {async handle(p) {
    if (p.action === 'resolve') { if (/通威/.test(p.query)) return {code: '600438', name: '通威股份'}; const e = new Error('多只'); e.choices = [{code: '600519', name: '贵州茅台'}, {code: '000568', name: '泸州老窖'}]; throw e; }
    if (p.action === 'kline') return {code: p.code, name: '通威股份', bars: bars(150), quote: {price: 11.11, pct: -2.46, open: 11.3, high: 11.4, low: 11.0, preClose: 11.39, amount: 1.2e9, turnover: 0.8}};
    if (p.action === 'overview') return {indices: [{name: '上证指数', price: 3200, pct: -1.2}], breadth: {up: 800, down: 4200, limitUp: 20, limitDown: 60}, amount: 1.1e12};
    throw new Error('unexpected ' + p.action);
  }};
  const quant = quantOn ? {view: () => ({pool: store.data.quant.pool, reportDefs: [{id: 'daily', title: '算法日报'}], alerts: [{kind: 'change', code: '600438', name: '通威股份', from: 'BUY', to: 'HOLD', toText: '暂停定投', time: Date.UTC(2026, 10, 20, 7)}]}),
    async handle(p) { if (p.action === 'signal') return SIGNAL; if (p.action === 'insight') return {available: true, text: '**结论**：先停一停。'}; if (p.action === 'holdings') return {holdings: [{code: '600438', ...SIGNAL.holding, price: 11.11}]}; if (p.action === 'report') return {title: '算法日报', date: '2026-11-20', summary: '池内 1 只', metrics: [{label: '买点', value: '0'}], md: '# 标题\n- 一条'}; throw new Error('unexpected'); }} : null;
  let t = now ?? Date.UTC(2026, 10, 18, 2, 0); // Wed 10:00 CST
  const svc = createResearchService({store, documents, market, quant, fetcher, ask, rasterize, onAlert: a => alerts.push(a), now: () => t});
  return {svc, store, calls, alerts, imported, setList: l => { list = l; }, advance: ms => { t += ms; }, time: () => t};
}

test('announcements: classification, parsing, body and key points', () => {
  assert.equal(classifyNotice('联合资信关于通威股份2026年三季报业绩亏损的关注公告').type, 'risk');
  assert.equal(classifyNotice('2025年年度业绩预告').type, 'forecast');
  assert.equal(classifyNotice('2026年第三季度报告').type, 'periodic');
  assert.equal(classifyNotice('关于控股股东股份质押的公告').type, 'holder');
  assert.equal(classifyNotice('关于以集中竞价交易方式回购股份方案的公告').level, 'medium');
  assert.equal(classifyNotice('第九届董事会第十六次会议决议公告').type, 'governance');
  assert.equal(classifyNotice('关于获得政府补助的公告').type, 'other');
  const l = parseNoticeList(LIST(item('AN1', '关于以集中竞价交易方式回购股份方案的公告', '2026-11-20'), {art_code: '../x', title: 'bad'}), '600438');
  assert.equal(l.length, 1); assert.deepEqual([l[0].id, l[0].date, l[0].title, l[0].name, l[0].label], ['AN1', '2026-11-20', '关于以集中竞价交易方式回购股份方案的公告', '通威股份', '资本运作']);
  assert.throws(() => parseNoticeList({success: 0}), /公告服务/);
  const b = parseNoticeContent(BODY('AN1'));
  assert.match(b.pdf, /^https:\/\/pdf\.dfcfw\.com\//); assert.equal(parseNoticeContent({data: {art_code: 'A', notice_content: 'x', attach_url: 'javascript:alert(1)'}}).pdf, '');
  const pts = keyPoints(b.text);
  assert.match(pts[0], /净利润为 -51 亿元/); assert.ok(pts.some(p => /17\.20/.test(p))); assert.ok(!pts.some(p => /虚假记载|投资风险/.test(p)), 'boilerplate dropped');
  const wrapped = keyPoints('一、本次股份质押基本情况：\n 累计质押 811,460,000 股，合计占本公司总股本的 18.02%，占其所持\n本公司股份总数的 36.5%。\n 前三季度公司实现营业总收入583.37亿元，同比下降9.69%。\n 2026年三季报业绩亏损的关注公告，净利润同比下降 44%');
  assert.ok(!wrapped.some(p => /基本情况：$/.test(p)), 'empty heading dropped');
  assert.ok(wrapped.some(p => /占其所持本公司股份总数的 36\.5%/.test(p)), 'wrapped line joined');
  assert.ok(wrapped.some(p => p.startsWith('2026年三季报')), 'a leading year is kept');
  const rating = keyPoints('联合〔2026〕9262 号\n受通威股份有限公司（以下简称“公司”）委托，联合资信评估股份有限公司对公司及其发行的相关债项进行了信用评级。\n 公司 2026 年前三季度归属于母公司所有者的净利润为 -38.52 亿元，同比亏损扩大。');
  assert.equal(rating.length, 1, 'rating preamble dropped'); assert.match(rating[0], /净利润为 -38\.52 亿元/);
});

test('report structure and its Word / PPT / HTML renderings are valid documents', async () => {
  const spec = buildStockReport({code: '600438', name: '通威股份', date: '2026-11-21', quote: {price: 11.11, pct: -2.46}, bars: bars(150), signal: SIGNAL.summary, returns: {a: -5, b: -20}, holding: SIGNAL.holding,
    notices: [{id: 'AN1', date: '2026-11-20', label: '风险事项', type: 'risk', level: 'high', title: '亏损的关注公告', points: ['预计亏损']}], insight: '**结论**：先停一停。'});
  assert.equal(spec.title, '通威股份（600438）个股研究报告');
  assert.deepEqual(spec.sections.map(s => s.id), ['core', 'market', 'signal', 'backtest', 'holding', 'notices', 'insight', 'risk']);
  assert.match(spec.sections[0].paragraphs[0], /暂停定投.*综合分 34\.0.*调整前 55\.3/);
  assert.ok(spec.sections.find(s => s.id === 'risk').bullets.some(b => /浮亏已达 -47\.15%/.test(b)));
  assert.ok(spec.sections.find(s => s.id === 'backtest').paragraphs[0].includes('-5.00%'));
  const docx = await generateDocument('docx', reportToDocx(spec, {charts: ['图 1']}));
  assert.equal(docx.bytes.subarray(0, 2).toString(), 'PK'); assert.match(docx.text, /个股研究报告/); assert.match(docx.text, /附图/);
  const pptx = await generateDocument('pptx', reportToPptx(spec));
  assert.equal(pptx.bytes.subarray(0, 2).toString(), 'PK');
  const html = reportToHtml(spec, {charts: {kline: '<svg id="k"></svg>'}});
  assert.match(html, /<svg id="k">/); assert.doesNotMatch(reportToHtml({...spec, title: '<script>x</script>'}), /<script>x/);
  const bare = buildStockReport({code: '600438', notices: []});
  assert.deepEqual(bare.gaps, ['量化信号', '行情', '公告']);
  assert.ok(bare.sections.at(-1).bullets.some(x => /行情接口暂时不可用/.test(x)));
  assert.equal((reportToHtml(bare).match(/本机量化引擎未运行/g) || []).length, 1, 'conclusion not repeated');
  assert.equal((await generateDocument('docx', reportToDocx(bare))).bytes.subarray(0, 2).toString(), 'PK');
});

test('exports: briefing, portfolio review and engine report', async () => {
  assert.throws(() => briefingReport(null), /简报/);
  const b = briefingReport({day: '2026-11-21', summary: '今天先处理两件事', sections: [{id: 'todo', title: '待处理', items: [{text: '确认任务'}]}, {id: 'none', title: '空', items: []}]});
  assert.deepEqual(b.sections.map(s => s.title), ['概述', '待处理']);
  const r = reviewReport({date: '2026-11-21', overview: {indices: [{name: '上证', price: 3200, pct: -1}], breadth: {up: 1, down: 2}, amount: 1e12}, pool: [{code: '600438', name: '通威股份', last: {action: 'STRONG_SELL', score: 20}}], holdings: [{code: '600438', shares: 100, cost: 20, price: 11, value: 1100, pnl: -900, pnlPct: -45}], notices: [{date: '2026-11-20', code: '600438', name: '通威股份', label: '风险事项', type: 'risk', level: 'high', title: 'x'}]});
  assert.deepEqual(r.sections.map(s => s.id), ['market', 'holdings', 'signals', 'notices', 'risk']);
  assert.ok(r.sections.at(-1).bullets.length >= 3);
  assert.equal((await generateDocument('docx', reportToDocx(r))).bytes.subarray(0, 2).toString(), 'PK');
  const e = engineReport({title: '算法日报', date: '2026-11-20', metrics: [{label: 'a', value: '1'}], md: '# 标题\n|---|\n- 一条'});
  assert.deepEqual(e.sections.find(s => s.id === 'body').paragraphs, ['标题', '• 一条']);
});

test('service: notices, notice reading with and without a model, scan alerts once and seeds silently', async () => {
  const x = rig({ask: async (sys, user) => { assert.match(sys, /只依据给出的公告原文/); assert.match(user, /回购/); return '- 回购 10–20 亿元 - 价格上限 17.20 元'; }});
  const n = await x.svc.handle({action: 'notices', code: '600438'});
  assert.equal(n.notices.length, 2); assert.equal(n.name, '通威股份');
  assert.ok(x.store.data.research.seeded['600438'], 'viewing notices seeds them');
  const r1 = await x.svc.handle({action: 'notice', id: 'AN1'});
  assert.match(r1.summary, /回购 10–20 亿元\n- 价格上限/); assert.ok(r1.points.length >= 2); assert.match(r1.pdf, /AN1/);
  const r2 = await x.svc.handle({action: 'notice', id: 'AN1'});
  assert.equal(r2.summary, r1.summary, 'summary cached');
  await assert.rejects(x.svc.handle({action: 'notice', id: '../etc'}), /编号无效/);
  const y = rig();
  assert.match((await y.svc.handle({action: 'notice', id: 'AN1'})).aiError, /未配置模型/);
  // scan: first tick seeds (no alerts), a new important notice alerts once
  assert.equal((await y.svc.tick()).hits, 0); assert.equal(y.alerts.length, 0);
  y.setList(LIST(item('AN9', '2026年年度业绩预告', '2026-11-18'), item('AN8', '关于获得政府补助的公告', '2026-11-18'), item('AN1', '关于以集中竞价交易方式回购股份方案的公告', '2026-11-17')));
  assert.equal(await y.svc.tick(), undefined, 'not again before the interval');
  y.advance(31 * 60e3);
  assert.equal((await y.svc.tick()).hits, 1);
  assert.equal(y.alerts.length, 1); assert.match(y.alerts[0].title, /业绩预告/);
  assert.equal(y.store.data.activity[0].title, '公告提醒'); assert.match(y.store.data.activity[0].detail, /通威股份（600438）业绩预告：2026年年度业绩预告 —— 预计/);
  assert.equal(y.store.data.research.library.filter(i => i.kind === 'notice').length, 1);
  y.advance(31 * 60e3); await y.svc.tick();
  assert.equal(y.alerts.length, 1, 'no duplicate alert');
  const feed = buildFeed(y.store.data).find(i => /业绩预告/.test(i.title));
  assert.ok(feed); assert.deepEqual(feed.actions, [{label: '查看公告', action: 'researchNotices', id: '600438'}]);
  // weekend: no scan
  const z = rig({now: Date.UTC(2026, 10, 21, 2, 0)}); assert.equal(await z.svc.tick(), undefined); assert.equal(z.calls.length, 0);
  await y.svc.handle({action: 'watch', enabled: false, interval: 60});
  assert.equal(y.svc.view().watch.enabled, false); await assert.rejects(y.svc.handle({action: 'watch', interval: 7}), /15/);
});

test('service: report in Word (with chart images), PPT and HTML; archived in the library; degrades without the engine', async () => {
  const x = rig({rasterize: async (svg, o) => { assert.match(svg, /^<svg/); assert.ok(o.width > 0); return PNG; }});
  const r = await x.svc.handle({action: 'report', query: '通威股份', format: 'docx'});
  assert.match(x.imported[0].bytes.toString('latin1'), /PK/); // [v47.1] report returns come from the engine summary below
  assert.deepEqual(r.document, {id: 'doc1', name: '通威股份（600438）个股研究报告 2026-11-18', format: 'docx'});
  const docx = x.imported[0].bytes;
  assert.equal(docx.subarray(0, 2).toString(), 'PK'); assert.ok(docx.includes(Buffer.from('word/media/willbuddy-image-2.png')), 'K-line and return charts embedded');
  assert.deepEqual(r.warnings, []); assert.ok(r.sections.includes('AI 研判'));
  { const html = (await x.svc.handle({action: 'report', code: '600438', format: 'html', ai: false}), x.imported.at(-1).bytes.toString()); assert.match(html, /智能定投收益率 -13\.52%|收益率 -13\.52%/, 'summary smartPct, not the cash-less curve'); x.imported.pop(); x.store.data.documents.pop(); x.store.data.research.library.shift(); }
  const lib = x.svc.view().library; assert.equal(lib[0].kind, 'report'); assert.equal(lib[0].documentId, 'doc1'); assert.equal(lib[0].code, '600438');
  const h = await x.svc.handle({action: 'report', code: '600438', format: 'html', ai: false});
  const html = x.imported[1].bytes.toString(); assert.match(html, /<svg class="mk-kline"/); assert.match(html, /q-return-svg/); assert.ok(!h.sections.includes('AI 研判'));
  await x.svc.handle({action: 'report', code: '600438', format: 'pptx'});
  assert.equal(x.imported[2].bytes.subarray(0, 2).toString(), 'PK');
  await assert.rejects(x.svc.handle({action: 'report', query: '老窖'}), e => e.choices?.length === 2);
  const y = rig({quantOn: false});
  const g = await y.svc.handle({action: 'report', code: '600438'});
  assert.deepEqual(g.gaps, ['量化信号']); assert.equal(y.imported[0].bytes.subarray(0, 2).toString(), 'PK');
});

test('service: library notes, links, read, search, remove; exports', async () => {
  const x = rig();
  await assert.rejects(x.svc.handle({action: 'note', text: '我的 api_key 是 sk-abcdefgh'}), /敏感/);
  const n = await x.svc.handle({action: 'note', query: '通威', title: '电话会', text: '管理层称四季度开工率维持 50%'});
  assert.equal(n.item.code, '600438');
  assert.equal((await x.svc.handle({action: 'read', id: n.item.id})).text, '管理层称四季度开工率维持 50%');
  x.store.data.documents.push({id: 'ext', name: '行业周报', format: 'docx', text: '硅料价格周报'});
  const l = await x.svc.handle({action: 'link', documentId: 'ext', code: '600438'});
  assert.match((await x.svc.handle({action: 'read', id: l.item.id})).text, /硅料/);
  await assert.rejects(x.svc.handle({action: 'link', documentId: 'nope'}), /没有这份文档/);
  assert.equal((await x.svc.handle({action: 'library', code: '600438'})).items.length, 2);
  assert.equal((await x.svc.handle({action: 'library', query: '开工率'})).items[0].id, n.item.id);
  assert.ok(!('text' in (await x.svc.handle({action: 'library'})).items[0]), 'list does not carry full note text');
  await x.svc.handle({action: 'saveNotice', id: 'AN1'});
  assert.equal((await x.svc.handle({action: 'library', kind: 'notice'})).items.length, 1);
  await x.svc.handle({action: 'remove', id: n.item.id});
  await assert.rejects(x.svc.handle({action: 'read', id: n.item.id}), /资料不存在/);
  x.store.data.documents.splice(x.store.data.documents.findIndex(d => d.id === 'ext'), 1);
  assert.equal((await x.svc.handle({action: 'read', id: l.item.id})).missing, true);
  const rv = await x.svc.handle({action: 'export', kind: 'review', format: 'docx'});
  assert.match(rv.document.name, /组合复盘/); assert.ok(rv.sections.includes('持仓') && rv.sections.includes('近期信号变化'));
  const er = await x.svc.handle({action: 'export', kind: 'quant_report'}); assert.match(er.document.name, /算法日报/);
  await assert.rejects(x.svc.handle({action: 'export', kind: 'briefing'}), /还没有生成过简报/);
  x.store.data.briefings = [{day: '2026-11-18', summary: '先处理审批', sections: []}];
  assert.match((await x.svc.handle({action: 'export', kind: 'briefing', format: 'html'})).document.name, /每日简报/);
  assert.equal(x.svc.view().library.filter(i => i.kind === 'export').length, 3);
  assert.equal(libraryItems([{time: 1, title: 'a'}, {time: 2, title: 'b'}])[0].title, 'b');
  assert.throws(() => normalizeNote({text: 'x'}), /太短/);
});

test('chat tools: every research action is reachable from the chat', async () => {
  const names = appToolDefinitions().map(d => d.function.name);
  for (const n of ['app_research_report', 'app_research_notices', 'app_research_notice_read', 'app_research_library', 'app_research_read', 'app_research_note_add', 'app_research_link_document', 'app_research_remove', 'app_research_export', 'app_research_watch']) assert.ok(names.includes(n), n);
  for (const q of ['给通威股份出一份研报', '通威最近有什么公告', '帮我导出组合复盘', '记个笔记', '看看资料库']) assert.ok(APP_INTENT.test(q), q);
  const x = rig(), opened = [], market = {handle: p => x.svc && p.action === 'resolve' ? Promise.resolve({code: '600438', name: '通威股份'}) : Promise.reject(new Error('x'))};
  const deps = {research: x.svc, market, openDocument: id => opened.push(id), notify() {}};
  let answer = true; const ask = async () => answer;
  const run = (name, args) => executeAppTool(name, args, {store: x.store, deps, ask});
  const rep = await run('app_research_report', {query: '通威股份', format: 'docx'});
  assert.equal(rep.status, 'succeeded'); assert.deepEqual(opened, ['doc1']); assert.equal(rep.opened, true);
  const ns = await run('app_research_notices', {query: '通威股份'}); assert.equal(ns.notices[0].type, '资本运作');
  assert.ok((await run('app_research_notice_read', {id: 'AN1'})).notice.points.length);
  const note = await run('app_research_note_add', {query: '通威', text: '跟踪硅料价格'});
  assert.equal((await run('app_research_library', {query: '通威'})).items.length, 2);
  assert.match((await run('app_research_read', {id: note.item.id})).text, /硅料/);
  answer = false; assert.equal((await run('app_research_remove', {id: note.item.id})).status, 'denied');
  answer = true; assert.equal((await run('app_research_remove', {id: note.item.id})).status, 'succeeded');
  assert.match((await run('app_research_export', {kind: 'review'})).document.name, /组合复盘/);
  answer = false; assert.equal((await run('app_research_watch', {enabled: false})).status, 'denied'); assert.notEqual(x.svc.view().watch.enabled, false);
  answer = true; assert.match((await run('app_research_watch', {interval: 60})).watch, /60 分钟/);
});

test('UI: 投研资料 box, library box and forms', () => {
  const action = (label, a, id = '', cls = '') => `<button type="button" class="${cls}" data-action="${a}" data-id="${id}">${label}</button>`, date = t => `T${t}`;
  const research = {notices: {'600438': {at: 5, list: [{id: 'AN1', date: '2026-11-20', label: '风险事项', level: 'high', title: '<b>亏损</b>', points: ['预计亏损 45 亿']}]}}, library: [{id: 'r1', kind: 'report', code: '600438', name: '通威股份', title: '通威研报', time: 9, documentId: 'd1', format: 'docx'}, {id: 'r2', kind: 'note', code: '000001', title: '别的', time: 8}], watch: {enabled: true, interval: 30}};
  const d = new JSDOM(researchBox('600438', research, {action, date})).window.document;
  assert.equal(d.querySelector('.rs-tag.rs-high').textContent, '风险事项'); assert.equal(d.querySelector('.rs-title').textContent, '<b>亏损</b>');
  assert.ok(d.querySelector('[data-action="researchReport"][data-id="600438"]')); assert.ok(d.querySelector('[data-action="researchNotice"][data-id="AN1"]'));
  assert.equal(d.querySelectorAll('[data-action="researchOpen"]').length, 1, 'only this stock'); assert.match(d.querySelector('.rs-point').textContent, /45 亿/);
  const e = new JSDOM(researchBox('600519', {}, {action, date})).window.document; assert.equal(e.querySelectorAll('.empty-note').length, 2);
  const lb = new JSDOM(researchLibraryBox(research, {action, date})).window.document;
  assert.equal(lb.querySelectorAll('.rs-row').length, 2); assert.ok(lb.querySelector('[data-action="researchExport"][data-id="review"]')); assert.match(lb.body.textContent, /每 30 分钟/);
  const fd = o => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
  assert.deepEqual(researchUI.reportPayload(fd({format: 'pptx', ai: 'on'}), '600438'), {action: 'report', code: '600438', format: 'pptx', ai: true});
  assert.deepEqual(researchUI.reportPayload(fd({format: 'exe'}), '600438'), {action: 'report', code: '600438', format: 'docx', ai: false});
  assert.deepEqual(researchUI.notePayload(fd({title: ' t ', text: ' x y '}), ''), {action: 'note', title: 't', text: 'x y'});
  assert.deepEqual(researchUI.exportPayload(fd({kind: 'quant_report', format: 'html', reportId: 'daily'})), {action: 'export', kind: 'quant_report', format: 'html', id: 'daily'});
  assert.deepEqual(researchUI.watchPayload(fd({enabled: 'on', interval: '60'})), {action: 'watch', enabled: true, interval: 60});
  const nd = new JSDOM(researchUI.noticeDetail({id: 'AN1', title: 't', summary: '- 要点', points: ['p'], text: '<script>', pdf: 'https://pdf.dfcfw.com/pdf/x.pdf'})).window.document;
  assert.equal(nd.querySelector('.rs-text').textContent, '<script>'); assert.ok(nd.querySelector('[data-action="researchSaveNotice"][data-id="AN1"]')); assert.ok(nd.querySelector('a[href^="https://pdf.dfcfw.com/"]'));
});
