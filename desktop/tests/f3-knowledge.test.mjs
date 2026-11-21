// [F3] 投研知识库: search (M1), company graph (M2), financial database (M3), research topics (M4), chat tools, UI, wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { graphLayout, layoutOverlaps, niceTicks, tokens, passages, buildIndex, searchIndex, parseFinance, quarterly, financeSummary, financeTable, financeSvg, secuCode, parseProfile, parseHolders, companyGraph, graphSvg, chainOf, normalizeTopic, topicMatches, nextDigestAt, topicDigest } from '../src/shared/knowledge.js';
import { createKnowledgeService } from '../services/knowledge.mjs';
import { knowledgeBox, knowledgeLibraryBox, knowledgeUI } from '../src/ui/knowledge.js';
import { executeAppTool, appToolDefinitions, APP_INTENT } from '../services/app-tools.mjs';
import { buildStockReport, reportToDocx } from '../src/shared/research.js';
import { generateDocument } from '../runtime/documents.mjs';
import { buildFeed } from '../src/shared/feed.js';

const FIN = {success: true, result: {data: [
  {SECURITY_NAME_ABBR: '通威股份', REPORT_DATE: '2026-09-30 00:00:00', REPORT_TYPE: '三季报', TOTALOPERATEREVE: 58337192459.58, TOTALOPERATEREVETZ: -9.69, PARENTNETPROFIT: -6758741677.87, PARENTNETPROFITTZ: -28.25, KCFJCXSYJLR: -6868223766.86, XSMLL: -0.44, XSJLL: -15.26, ROEJQ: -19.03, ZCFZL: 75.6, EPSJB: -1.5013, BPS: 6.81, MGJYXJJE: 0.4497},
  {SECURITY_NAME_ABBR: '通威股份', REPORT_DATE: '2026-06-30 00:00:00', REPORT_TYPE: '中报', TOTALOPERATEREVE: 34356956077.44, TOTALOPERATEREVETZ: -15.19, PARENTNETPROFIT: -5119294750.54, PARENTNETPROFITTZ: -3.31, XSMLL: -3.07, ROEJQ: -14.1, ZCFZL: 75.24, EPSJB: -1.1371},
  {SECURITY_NAME_ABBR: '通威股份', REPORT_DATE: '2026-03-31 00:00:00', REPORT_TYPE: '一季报', TOTALOPERATEREVE: 12125079698.56, TOTALOPERATEREVETZ: -23.9, PARENTNETPROFIT: -2444414900.75, PARENTNETPROFITTZ: 5.72, XSMLL: -4.03, ROEJQ: -6.49, ZCFZL: 74.23, EPSJB: -0.543},
  {SECURITY_NAME_ABBR: '通威股份', REPORT_DATE: 'bad', TOTALOPERATEREVE: 1}]}};
const PROFILE = {success: true, result: {data: [{SECURITY_NAME_ABBR: '通威股份', ORG_NAME: '通威股份有限公司', EM2016: '电气设备-电源设备-太阳能', INDUSTRYCSRC1: '制造业-电气机械和器材制造业', PROVINCE: '四川', MAIN_BUSINESS: '水产饲料、高纯晶硅、太阳能电池', ACTUAL_HOLDER: '刘汉元', PRESIDENT: '刘舒琪', FOUND_DATE: '1995-12-08 00:00:00'}]}};
const HOLDERS = {success: true, result: {data: [
  {END_DATE: '2026-09-30 00:00:00', HOLDER_NAME: '通威集团有限公司', HOLDER_RANK: 1, HOLD_NUM: 2036534487, HOLD_NUM_RATIO: 45.24},
  {END_DATE: '2026-09-30 00:00:00', HOLDER_NAME: '香港中央结算有限公司', HOLDER_RANK: 3, HOLD_NUM: 91879241, HOLD_NUM_RATIO: 2.04},
  {END_DATE: '2026-06-30 00:00:00', HOLDER_NAME: '旧股东', HOLDER_RANK: 1, HOLD_NUM_RATIO: 40}]}};
const PROFILE2 = {success: true, result: {data: [{SECURITY_NAME_ABBR: '隆基绿能', EM2016: '电气设备-电源设备-太阳能', ACTUAL_HOLDER: '李振国'}]}};

test('M1 tokens, passages, BM25 index and cited search', () => {
  assert.deepEqual(tokens('硅料价格'), ['硅料', '料价', '价格']);
  assert.ok(tokens('ROE 是 19.03%').includes('19.03%'));
  const ps = passages('第一句。'.repeat(150)); assert.ok(ps.length > 1 && ps.every(p => p.text.length <= 400));
  const ix = buildIndex([
    {id: 'a', kind: 'note', code: '600438', name: '通威股份', title: '电话会纪要', date: '2026-11-20', text: '管理层称硅料价格已经见底，四季度开工率维持 50%。'},
    {id: 'b', kind: 'notice', code: '600438', name: '通威股份', title: '关于控股股东股份质押的公告', date: '2026-11-19', text: '通威集团累计质押 8.11 亿股，占其所持股份的 39.85%。'},
    {id: 'c', kind: 'report', code: '600519', name: '贵州茅台', title: '茅台研报', date: '2026-11-18', text: '白酒批价企稳，渠道库存正常。'},
    {id: 'd', kind: 'note', text: ''}]);
  assert.equal(Object.keys(ix.docs).length, 4); assert.equal(ix.n, 3);
  const r = searchIndex(ix, '硅料价格');
  assert.equal(r.hits[0].id, 'a'); assert.equal(r.hits[0].ref, 1); assert.match(r.hits[0].excerpt, /硅料价格/);
  assert.equal(searchIndex(ix, '质押').hits[0].kind, 'notice');
  assert.equal(searchIndex(ix, '白酒', {code: '600438'}).hits.length, 0, 'stock filter');
  assert.equal(searchIndex(ix, '价格', {kind: 'report'}).hits.length, 0, 'kind filter');
  assert.equal(searchIndex(ix, '量子计算').hits.length, 0);
  assert.equal(searchIndex(buildIndex([]), '任何').hits.length, 0);
});

test('M3 financial parsing, single quarters, summary, table, chart', () => {
  assert.deepEqual(['600438', '000001', '830799', '920001'].map(secuCode), ['600438.SH', '000001.SZ', '830799.BJ', '920001.BJ']);
  const rows = parseFinance(FIN);
  assert.deepEqual(rows.map(r => r.date), ['2026-03-31', '2026-06-30', '2026-09-30'], 'oldest first, bad dates dropped');
  assert.throws(() => parseFinance({success: false, message: '返回字段不存在'}), /财报数据服务返回/);
  const q = quarterly(rows);
  assert.deepEqual(q.map(x => x.label), ['26Q1', '26Q2', '26Q3']);
  assert.equal(Math.round(q[2].profit / 1e6), Math.round((-6758741677.87 + 5119294750.54) / 1e6), 'Q3 = 9M − H1');
  assert.equal(q[0].profit, rows[0].profit, 'Q1 is cumulative = single');
  const s = financeSummary(rows, {name: '通威股份'});
  assert.match(s.lines[0], /2026 年三季报：营业总收入 583\.37亿（同比 -9\.69%），归母净利润 -67\.59亿/);
  assert.ok(s.lines.some(l => /资产负债率超过 70%/.test(l)));
  const t = financeTable(rows); assert.deepEqual(t[0].slice(0, 4), ['报告期', '营业总收入', '营收同比', '归母净利润']); assert.equal(t[1][0], '2026 三季报');
  const svg = financeSvg(rows); assert.match(svg, /^<svg class="kn-fin-svg"/); assert.match(svg, /style="display:block;width:100%/); assert.match(svg, /#18a058/, 'loss bars are green');
  assert.match(svg, /单季归母净利润（亏损）/, 'all quarters lost money: legend says so'); assert.doesNotMatch(svg, /#8c7cff">■/, 'no legend entry for bars that are not drawn');
  assert.match(financeSvg(rows.slice(0, 1)), /期数不足/);
  assert.deepEqual(niceTicks(-42.83e8, 245.75e8), [-100e8, 0, 100e8, 200e8, 300e8], 'round ticks with 0, covering the range');
  assert.deepEqual(niceTicks(0, 1e9), [0, 2.5e8, 5e8, 7.5e8, 1e9]);
  assert.match(svg, />0</); assert.doesNotMatch(svg, /245\.75亿/);
});

test('M2 profile, holders, chain map and graph', () => {
  const p = parseProfile(PROFILE); assert.deepEqual([p.name, p.industry, p.controller, p.founded], ['通威股份', '电气设备-电源设备-太阳能', '刘汉元', '1995-12-08']);
  const h = parseHolders(HOLDERS); assert.equal(h.date, '2026-09-30'); assert.equal(h.holders.length, 2, 'only the latest period');
  assert.ok(chainOf(p.industry).up.includes('多晶硅'));
  assert.ok(chainOf('', '水产饲料').up.includes('豆粕'), 'business text also matches');
  assert.ok(!chainOf(p.industry, '高纯晶硅、太阳能电池等产品').up.includes('锂矿'), '太阳能电池 is not a lithium battery');
  assert.ok(chainOf('电气设备-电池-锂电池').up.includes('锂矿'));
  const g = companyGraph({code: '600438', profile: p, holders: h, peers: [{code: '601012', name: '隆基绿能', industry: '电气设备-电源设备-太阳能'}, {code: '600519', name: '贵州茅台', industry: '食品饮料-白酒'}], notices: [{id: 'AN1', title: '关于控股股东股份质押的公告', date: '2026-11-19'}]});
  const kinds = new Set(g.nodes.map(n => n.kind));
  for (const k of ['company', 'industry', 'chain-up', 'chain-down', 'holder', 'person', 'peer']) assert.ok(kinds.has(k), k);
  assert.ok(g.nodes.some(n => n.label === '香港中央结算（北向资金）'));
  assert.ok(!g.nodes.some(n => n.label === '贵州茅台'), 'other industries are not peers');
  assert.ok(g.edges.some(e => /质押公告 2026-11-19/.test(e.label)));
  assert.equal(layoutOverlaps(graphLayout(g)).length, 0, 'no overlapping boxes');
  { const many = companyGraph({code: '000001', profile: {name: '测试', industry: '电气设备-电池-锂电池', controller: '某'.repeat(14)}, holders: {date: 'd', holders: Array.from({length: 6}, (_, i) => ({rank: i + 1, name: '某某某某某某某某有限公司' + i, ratio: 1}))}, peers: Array.from({length: 6}, (_, i) => ({code: '00000' + (i + 2), name: '同行' + i, industry: '电气设备-电池-锂电池'}))}); const b = graphLayout(many); assert.equal(layoutOverlaps(b).length, 0, 'crowded graph: no overlaps'); assert.ok([...b.values()].every(x => x.x - x.w / 2 >= 0 && x.x + x.w / 2 <= 960 && x.y - x.h / 2 >= 0 && x.y + x.h / 2 <= 400), 'inside the canvas'); }
  const svg = graphSvg(g); assert.match(svg, /kn-graph-svg/); assert.doesNotMatch(graphSvg(companyGraph({code: '600519', profile: {name: '贵州茅台', industry: '食品饮料-饮料-白酒', controller: '贵州省人民政府国有资产监督管理委员会'}})), />贵州省人民政府国有资产监督管理委员会<\/text>/, 'visible labels are shortened (the <title> tooltip keeps the full name)'); assert.match(svg, /data-action="quantOpen" data-id="601012"/);
  assert.doesNotMatch(graphSvg(companyGraph({code: '600438', profile: {...p, name: '<b>x</b>'}})), /<b>x/);
});

test('M4 topics: validation, matching, schedule, digest', async () => {
  assert.throws(() => normalizeTopic({name: 'x', keywords: 'a'}), /至少 2 个字/);
  assert.throws(() => normalizeTopic({name: '光伏', keywords: 'a b'}), /关键词/);
  const t = normalizeTopic({name: '光伏产能出清', keywords: '产能，减产 硅料价格，产能', codes: '600438, abc, 601012', weekday: 9, time: '25:00'});
  assert.deepEqual([t.keywords, t.codes, t.weekday, t.time], [['产能', '减产', '硅料价格'], ['600438', '601012'], 1, '08:30']);
  assert.deepEqual(topicMatches(t, '多家企业宣布减产，硅料价格回升'), ['减产', '硅料价格']);
  const sat = Date.UTC(2026, 10, 21, 12), next = nextDigestAt(t, sat);
  assert.equal(new Date(next + 8 * 3600e3).toISOString().slice(0, 16), '2026-11-23T08:30', 'next Monday 08:30 CST');
  assert.equal(nextDigestAt({...t, weekday: 6, time: '08:30'}, sat), nextDigestAt({...t, weekday: 6, time: '08:30'}, sat), 'deterministic');
  assert.ok(nextDigestAt({...t, weekday: 6, time: '08:30'}, sat) > sat + 6 * 86400e3, 'already passed today: next week');
  const d = topicDigest(t, [{kind: 'notice', date: '2026-11-20', name: '通威股份', title: '减产公告', matched: ['减产'], excerpt: '减产 30%'}, {kind: 'news', date: '2026-11-21', title: '硅料价格周报', url: 'https://x.test/a', matched: ['硅料价格']}, {kind: 'note', date: '2026-11-19', title: '我的笔记', matched: ['产能']}], {date: '2026-11-23', since: '2026-11-16'});
  assert.deepEqual(d.sections.map(s => s.id), ['scope', 'notices', 'news', 'library', 'note']);
  assert.equal((await generateDocument('docx', reportToDocx(d))).bytes.subarray(0, 2).toString(), 'PK');
  assert.deepEqual(topicDigest(t, []).sections.map(s => s.id), ['scope', 'empty', 'note']);
});

function rig({now} = {}) {
  let t = now ?? Date.UTC(2026, 10, 21, 12);
  const store = {data: {documents: [{id: 'd1', name: '通威研报', format: 'docx', text: '通威股份研报：硅料价格下跌，公司处于亏损。'}], activity: [], quant: {pool: [{code: '600438', name: '通威股份'}, {code: '601012', name: '隆基绿能'}]},
    research: {library: [{id: 'r1', kind: 'report', code: '600438', name: '通威股份', title: '通威股份（600438）个股研究报告', documentId: 'd1', time: t}, {id: 'r2', kind: 'note', code: '600438', name: '通威股份', title: '电话会', text: '管理层称四季度减产，开工率维持 50%。', time: t}],
      notices: {'600438': {at: t, list: [{id: 'AN1', code: '600438', name: '通威股份', title: '关于控股股东股份质押的公告', date: '2026-11-19', label: '风险事项', level: 'high', points: ['累计质押 8.11 亿股']}]}}, summaries: {}}}, saves: 0, async save() { this.saves++; }};
  const calls = [], rendered = [], archived = [], alerts = [];
  const fetcher = async url => { calls.push(url); const u = decodeURIComponent(url), body = /FINANCE_MAINFINADATA/.test(u) ? FIN : /BASIC_ORGINFO/.test(u) ? (/601012/.test(u) ? PROFILE2 : PROFILE) : /EH_HOLDERS/.test(u) ? HOLDERS : {success: false}; return {ok: true, status: 200, text: async () => JSON.stringify(body)}; };
  const research = {async handle(p) { if (p.action === 'render') { rendered.push(p); return {document: {id: 'doc' + rendered.length, name: p.spec.title, format: p.format}}; } if (p.action === 'archive') { archived.push(p); return {item: {id: 'x'}}; } if (p.action === 'notices') return {notices: []}; throw new Error('unexpected ' + p.action); }};
  const market = {async handle(p) { if (p.action === 'resolve') { if (/通威/.test(p.query)) return {code: '600438', name: '通威股份'}; if (/隆基/.test(p.query)) return {code: '601012', name: '隆基绿能'}; const e = new Error('多只'); e.choices = [{code: '1'}, {code: '2'}]; throw e; } throw new Error('x'); }};
  const web = {async search(q) { return [{title: `${q} 最新进展`, url: 'https://news.test/' + encodeURIComponent(q), snippet: '多家硅料企业宣布减产'}]; }};
  const svc = createKnowledgeService({store, research, market, web, fetcher, onAlert: a => alerts.push(a), now: () => t});
  return {svc, store, calls, rendered, archived, alerts, advance: ms => { t += ms; }, time: () => t};
}

test('service: finance cache, report hook, compare, graph with peers', async () => {
  const x = rig();
  const f = await x.svc.handle({action: 'finance', query: '通威股份'});
  assert.equal(f.code, '600438'); assert.equal(f.table.length, 4); assert.match(f.svg, /kn-fin-svg/); assert.match(f.summary.lines[0], /三季报/);
  assert.match(x.calls[0], /SECUCODE%3D%22600438\.SH%22/);
  await x.svc.handle({action: 'finance', code: '600438'}); assert.equal(x.calls.filter(u => /FINANCE/.test(u)).length, 1, 'cached 12 h');
  x.advance(13 * 3600e3); await x.svc.handle({action: 'finance', code: '600438'}); assert.equal(x.calls.filter(u => /FINANCE/.test(u)).length, 2);
  const rep = await x.svc.forReport('600438'); assert.ok(rep.table.length > 1 && rep.lines.length && /<svg/.test(rep.svg));
  const c = await x.svc.handle({action: 'compare', codes: '通威,隆基'}); assert.deepEqual(c.items.map(i => i.code), ['600438', '601012']);
  await assert.rejects(x.svc.handle({action: 'compare', codes: '通威'}), /至少两只/);
  const g = await x.svc.handle({action: 'graph', code: '600438'});
  assert.ok(g.nodes.some(n => n.kind === 'peer' && n.code === '601012'), 'pool peer in the same industry');
  assert.ok(g.edges.some(e => /质押公告/.test(e.label))); assert.match(g.svg, /kn-graph-svg/);
  assert.equal(x.svc.view().profiles['600438'].controller, '刘汉元');
  await assert.rejects(x.svc.handle({action: 'finance', query: '老窖'}), e => e.choices?.length === 2);
});

test('service: search covers library, notices, finance; topics collect and digest on schedule', async () => {
  const x = rig();
  let r = await x.svc.handle({action: 'search', query: '质押'});
  assert.equal(r.hits[0].noticeId, 'AN1');
  r = await x.svc.handle({action: 'search', query: '硅料价格'}); assert.equal(r.hits[0].documentId, 'd1', 'report text indexed through 成果中心');
  r = await x.svc.handle({action: 'search', query: '开工率'}); assert.equal(r.hits[0].kind, 'note');
  await x.svc.handle({action: 'finance', code: '600438'});
  r = await x.svc.handle({action: 'search', query: '资产负债率'}); assert.equal(r.hits[0].kind, 'finance', 'index refreshed after finance');
  await assert.rejects(x.svc.handle({action: 'search', query: 'x'}), /2–200/);
  const tp = await x.svc.handle({action: 'topicSave', name: '光伏产能出清', keywords: '减产，质押', codes: '600438', weekday: 1, time: '08:30'});
  assert.ok(tp.topic.nextAt > x.time());
  const col = await x.svc.handle({action: 'topicCollect', id: tp.topic.id});
  const kinds = new Set(col.items.map(i => i.kind)); for (const k of ['notice', 'news', 'note']) assert.ok(kinds.has(k), k);
  r = await x.svc.handle({action: 'search', query: '最新进展'}); assert.equal(r.hits[0].kind, 'news', 'topic news indexed');
  assert.equal(await x.svc.tick(), undefined); assert.equal(x.rendered.length, 0, 'not due yet');
  x.advance(tp.topic.nextAt - x.time() + 1000); await x.svc.tick();
  assert.equal(x.rendered.length, 1); assert.match(x.rendered[0].spec.title, /研究主题周报：光伏产能出清/);
  assert.deepEqual(x.archived[0].tags, ['主题周报', '光伏产能出清']);
  assert.equal(x.alerts.length, 1); assert.equal(x.store.data.activity[0].title, '主题周报');
  assert.ok(x.svc.view().topics[0].nextAt > x.time(), 'rescheduled a week later');
  assert.ok(buildFeed(x.store.data).some(i => /光伏产能出清：本期/.test(i.title)));
  const d = await x.svc.handle({action: 'topicDigest', id: tp.topic.id, format: 'html'}); assert.equal(d.document.format, 'html');
  await x.svc.handle({action: 'topicRemove', id: tp.topic.id}); assert.equal(x.svc.view().topics.length, 0);
  await assert.rejects(x.svc.handle({action: 'topicCollect', id: tp.topic.id}), /主题不存在/);
});

test('research report gets a 财务数据 section', async () => {
  const spec = buildStockReport({code: '600438', name: '通威股份', finance: {table: financeTable(parseFinance(FIN), 6), lines: ['一句摘要'], chart: true}, notices: []});
  const s = spec.sections.find(x => x.id === 'finance'); assert.ok(s); assert.equal(s.chart, 'finance'); assert.deepEqual(s.paragraphs, ['一句摘要']);
  assert.equal(buildStockReport({code: '600438'}).sections.some(x => x.id === 'finance'), false);
});

test('chat tools reach every knowledge action', async () => {
  const names = appToolDefinitions().map(d => d.function.name);
  for (const n of ['app_kb_search', 'app_kb_finance', 'app_kb_compare', 'app_kb_graph', 'app_kb_topics', 'app_kb_topic_save', 'app_kb_topic_remove', 'app_kb_topic_digest']) assert.ok(names.includes(n), n);
  for (const q of ['通威的营收怎么样', '通威的前十大股东', '光伏产业链上下游', '帮我建个研究主题', '在我的资料里检索质押']) assert.ok(APP_INTENT.test(q), q);
  for (const q of ['解释一下光伏产业链', '什么是知识库']) assert.ok(!APP_INTENT.test(q), q);
  const x = rig(), opened = [], market = {handle: async p => p.action === 'resolve' ? {code: '600438', name: '通威股份'} : null};
  let answer = true;
  const run = (n, a) => executeAppTool(n, a, {store: x.store, deps: {knowledge: x.svc, market, openDocument: id => opened.push(id), notify() {}}, ask: async () => answer});
  const s = await run('app_kb_search', {query: '质押', stock: '通威'}); assert.equal(s.hits[0].ref, 1); assert.match(s.note, /\[ref\]/);
  assert.equal((await run('app_kb_finance', {query: '通威'})).code, '600438');
  assert.ok((await run('app_kb_graph', {query: '通威'})).relations.some(r => /实际控制人/.test(r)));
  assert.equal((await run('app_kb_compare', {queries: '600438,601012'})).items.length, 2);
  answer = false; assert.equal((await run('app_kb_topic_save', {name: '光伏', keywords: '减产'})).status, 'denied'); assert.equal(x.svc.view().topics.length, 0);
  answer = true; const t = await run('app_kb_topic_save', {name: '光伏', keywords: '减产'}); assert.ok(t.topic.id);
  assert.equal((await run('app_kb_topics', {})).topics.length, 1);
  assert.ok((await run('app_kb_topic_digest', {id: t.topic.id})).items.length >= 1);
  const rep = await run('app_kb_topic_digest', {id: t.topic.id, report: true}); assert.equal(rep.opened, true); assert.deepEqual(opened, [rep.document.id]);
  answer = false; assert.equal((await run('app_kb_topic_remove', {id: t.topic.id})).status, 'denied');
  answer = true; assert.equal((await run('app_kb_topic_remove', {id: t.topic.id})).status, 'succeeded');
});

test('UI: stock box mounts finance then graph; library box; forms', async () => {
  const dom = new JSDOM(`<div id="r">${knowledgeBox('600438')}${knowledgeLibraryBox({topics: [{id: 't1', name: '<光伏>', keywords: ['减产'], codes: [], enabled: true, weekday: 1, time: '08:30'}], indexed: {documents: 5}}, {action: (l, a, id = '') => `<button data-action="${a}" data-id="${id}">${l}</button>`})}</div>`), doc = dom.window.document, calls = [];
  const x = rig(); const f = await x.svc.handle({action: 'finance', code: '600438'}), g = await x.svc.handle({action: 'graph', code: '600438'});
  knowledgeUI.mountKnowledge(doc, async p => { calls.push(p.action); return {result: p.action === 'finance' ? f : g}; });
  await new Promise(r => setTimeout(r, 10));
  assert.ok(doc.querySelector('.kn-fin-svg')); assert.ok(doc.querySelector('.kn-table')); assert.equal(calls[0], 'finance');
  doc.querySelector('[data-kn="graph"]').click(); await new Promise(r => setTimeout(r, 10));
  assert.ok(doc.querySelector('.kn-graph-svg')); assert.match(doc.querySelector('.kn-dl').textContent, /刘汉元/);
  assert.equal(doc.querySelector('.kn-topic b').textContent, '<光伏>'); assert.ok(doc.querySelector('[data-action="knTopicDigest"][data-id="t1"]')); assert.match(doc.body.textContent, /已索引 5 份资料/);
  const bad = new JSDOM(`<div>${knowledgeBox('600438')}</div>`).window.document;
  knowledgeUI.mountKnowledge(bad, async () => { throw new Error("Error invoking remote method 'knowledge': TypeError: fetch failed"); }); await new Promise(r => setTimeout(r, 10));
  assert.equal(bad.querySelector('.task-error').textContent, '数据服务暂时连不上，请检查网络后点「刷新」');
  const fd = o => { const x = new FormData(); for (const [k, v] of Object.entries(o)) x.append(k, v); return x; };
  assert.deepEqual(knowledgeUI.topicPayload(fd({name: ' 光伏 ', keywords: '减产', codes: '', weekday: '3', time: '09:00', enabled: 'on'}), 't1'), {action: 'topicSave', id: 't1', name: '光伏', keywords: '减产', codes: '', weekday: 3, time: '09:00', enabled: true});
  const res = new JSDOM(knowledgeUI.searchResultsHtml({query: 'q', total: 1, hits: [{ref: 1, kind: 'notice', title: '<t>', excerpt: '<e>', noticeId: 'AN1'}]}, {action: (l, a, id) => `<button data-action="${a}" data-id="${id}">${l}</button>`})).window.document;
  assert.equal(res.querySelector('b').textContent, '<t>'); assert.ok(res.querySelector('[data-action="researchNotice"][data-id="AN1"]'));
  assert.match(knowledgeUI.searchResultsHtml({query: '无', hits: []}, {action: () => ''}), /没有找到/);
});

test('wiring: main, app, quant page, test loader', async () => {
  const main = await readFile(new URL('../main.mjs', import.meta.url), 'utf8'), app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8'), quant = await readFile(new URL('../src/ui/quant.js', import.meta.url), 'utf8');
  for (const s of ["createKnowledgeService({ store, research, market, web: appDeps.web", "register('knowledge'", 'knowledge?.tick()', 'get knowledge() { return knowledge; }', 'knowledge:_knowledge,portfolio:_portfolio,security:_security,quant:_quant,...publicData', 'knowledge.forReport(code)']) assert.ok(main.includes(s), s);
  for (const s of ["/^kn[A-Z]/.test(actionId)", "knowledgeUI.mountKnowledge(document"]) assert.ok(app.includes(s), s);
  for (const s of ['${knowledgeBox(code)}', 'knowledgeLibraryBox(state.knowledge']) assert.ok(quant.includes(s), s);
});
