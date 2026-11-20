import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { dashboardCards, fallbackView, mountDashboard } from '../src/ui/dashboard.js';
import { tableFromGrid, normalizeSpec, inferColumns, computeDashboard } from '../src/shared/dashboard.js';
import { documentLibrary } from '../src/ui/documents.js';
import { approvalRulesPanel } from '../src/ui/approvals.js';
import { NAV_LAYOUT, groupOf } from '../src/ui/sidebar.js';
import { createDashboardService } from '../services/dashboard.mjs';
import { preparePreviewProtocol } from '../main/preview-protocol.mjs';

const GRID = [['月份', '区域', '金额'], ['2026-01', '华东', 100], ['2026-02', '华北', 80], ['2026-03', '华东', 120]];
const dash = () => { const table = tableFromGrid(GRID), cols = inferColumns(table.columns, table.rows);
  return {id: 'd1', name: '销售', table, spec: normalizeSpec({title: '<b>销售</b>', kpis: [{label: '合计', column: '金额', agg: 'sum'}], charts: [
    {type: 'line', title: '趋势', x: '月份', timeUnit: 'month', series: [{column: '金额'}]}, {type: 'pie', title: '占比', x: '区域', series: [{column: '金额'}]},
    {type: 'table', title: '明细', columns: ['月份', '区域', '金额']}]}, cols)}; };

test('dashboard cards under a reply: escaped, opens the viewer, survives deletion', () => {
  const state = {dashboards: [{id: 'd1', name: '<img src=x>', rows: 3, spec: {kpis: [{label: '合计'}], charts: [{}, {}]}}]};
  const html = dashboardCards({dashboards: [{id: 'd1', name: 'x'}, {id: 'gone', name: '旧的'}]}, state);
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelectorAll('img').length, 0);
  assert.equal(doc.querySelector('[data-action="dashboardOpen"]').dataset.id, 'd1');
  assert.match(doc.body.textContent, /3 行 · 2 个图表 · 合计/);
  assert.match(doc.querySelector('.dash-chip.gone').textContent, /旧的已删除/);
  assert.equal(dashboardCards({}, state), '');
});

test('fallback view renders KPIs, SVG charts and tables from computed data', () => {
  const d = dash(), {window} = new JSDOM('');
  const box = fallbackView(window.document, computeDashboard(d.table, d.spec), '图表脚本没有运行');
  assert.match(box.querySelector('.viz-fallback-note').textContent, /原因：图表脚本没有运行/);
  assert.equal(box.querySelector('.viz-fb-kpi b').textContent, '300');
  assert.equal(box.querySelectorAll('svg').length, 2);
  assert.equal(box.querySelectorAll('.viz-fb-card > .table-scroll > table > tr').length, 4); // the table chart only, not the charts' own data tables
  assert.equal(box.querySelector('h2').textContent, '<b>销售</b>');
});

test('viewer falls back instead of spinning when the frame never answers or reports an error', async () => {
  const mk = () => { const dom = new JSDOM('<div id="h"></div>', {url: 'file:///app/src/index.html'}); return {dom, host: dom.window.document.getElementById('h')}; };
  const a = mk();
  const v = mountDashboard(a.host, dash(), {timeoutMs: 30});
  assert.ok(a.host.querySelector('iframe.viz-frame'));
  assert.match(a.host.querySelector('iframe').src, /^willbuddy-preview:\/\/local\/viz\/index\.html#/);
  await new Promise(r => setTimeout(r, 60));
  assert.equal(v.mode(), 'fallback');
  assert.ok(a.host.querySelector('.viz-fallback') && !a.host.querySelector('iframe'));
  await assert.rejects(v.exportPng(), /简化图表/);
  v.dispose();
  const b = mk(), w = b.dom.window;
  const v2 = mountDashboard(b.host, dash(), {timeoutMs: 5000});
  const frame = b.host.querySelector('iframe'), token = frame.src.split('#')[1];
  w.dispatchEvent(new w.MessageEvent('message', {source: w, data: {token, kind: 'viz-error', message: 'forged'}}));
  assert.equal(v2.mode(), 'frame', 'messages not from the frame are ignored');
  w.dispatchEvent(new w.MessageEvent('message', {source: frame.contentWindow, data: {token, kind: 'viz-error', message: 'echarts init failed'}}));
  assert.equal(v2.mode(), 'fallback');
  assert.match(b.host.textContent, /echarts init failed/);
  v2.dispose();
});

test('viz boot script is served from the protocol with integrity', async () => {
  const dir = new URL('../src/viz/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('VIZ-MANIFEST.json', dir), 'utf8'));
  assert.ok(manifest.files.some(f => f.name === 'boot.js'));
  for (const f of manifest.files) assert.equal(createHash('sha256').update(await readFile(new URL(f.name, dir))).digest('hex'), f.sha256, f.name);
  const html = await readFile(new URL('index.html', dir), 'utf8');
  assert.ok(html.indexOf('boot.js') < html.indexOf('echarts.min.js'));
  const handler = await preparePreviewProtocol(path.join(path.dirname(new URL(import.meta.url).pathname), '../src/preview'));
  assert.equal(handler({url: 'willbuddy-preview://local/viz/boot.js', method: 'GET'}).status, 200);
});

test('a CSV attached from an authorised folder becomes a dashboard', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-ux8-'));
  try {
    await writeFile(path.join(dir, '销售.csv'), '区域,金额\n华东,10\n华北,5\n');
    const store = {data: {settings: {}, documents: [], folders: [{id: 'f', name: 'x', path: dir}]}, async save() {}, log() {}};
    const svc = createDashboardService({store});
    const r = await svc.handle({action: 'create', source: 'granted', folderId: 'f', relative: '销售.csv', prompt: '看区域'});
    const v = svc.view()[0];
    assert.equal(v.id, r.id);
    assert.deepEqual([v.source.kind, v.source.name, v.rows], ['granted', '销售.csv', 2]);
    await assert.rejects(svc.handle({action: 'create', source: 'granted', folderId: 'f', relative: '../etc/passwd'}), /无效文件路径/);
    await assert.rejects(svc.handle({action: 'create', source: 'granted', folderId: 'nope', relative: '销售.csv'}), /授权已撤销/);
  } finally { await rm(dir, {recursive: true, force: true}); }
  const conv = await readFile(new URL('../services/conversation.mjs', import.meta.url), 'utf8');
  assert.match(conv, /\[ux8\] spreadsheet attachments -> dashboard cards/);
  assert.match(conv, /incognito \|\| !appTools\?\.dashboards \? \[\]/);
});

const ui = {action: (l, a, id = '', k = 'secondary') => `<button class="${k}" data-action="${a}" data-id="${id}">${l}</button>`, date: () => '11月19日 17:29'};
test('library cards: compact, escaped, every action still present and reachable', () => {
  const state = {officeNative: true, officeWorkspace: true, documents: [
    {id: 'p', name: '<b>方案</b>.pptx', format: 'pptx', revision: 1, time: 1, size: 3755541, text: 'W QuanK IT 助手需求分析', history: []},
    {id: 'x', name: '数据', format: 'xlsx', revision: 2, time: 1, size: 9563, text: '[xl/worksheets/sheet1.xml]\n区域 金额', history: [{}]},
    {id: 'm', name: '笔记', format: 'md', revision: 1, time: 1, size: 10, text: '# hi', history: []}]};
  const doc = new JSDOM(documentLibrary({state, ...ui})).window.document;
  const cards = [...doc.querySelectorAll('.lib-card')];
  assert.equal(cards.length, 3);
  assert.equal(doc.querySelectorAll('h3 b').length, 0);
  assert.match(cards[0].querySelector('.lib-title small').textContent, /v1 · 11月19日 17:29 · 3\.6 MB/);
  assert.equal(cards[0].querySelector('.lib-icon').textContent, 'PPT');
  const edit = cards[0].querySelector('.lib-main [data-action="documentEditor"]');
  assert.deepEqual([edit.textContent, edit.getAttribute('aria-label')], ['编辑', 'QuanK Office 编辑']);
  assert.ok(cards[0].querySelector('.lib-main [data-action="documentView"]'));
  for (const a of ['documentContinue', 'documentEdit', 'documentExportPdf', 'documentExport', 'documentDelete']) assert.ok(cards[0].querySelector(`.lib-more [data-action="${a}"]`), a);
  assert.ok(cards[1].querySelector('[data-action="dashboardFromDocument"]') && cards[1].querySelector('[data-action="documentHistory"]'));
  assert.ok(!cards[0].querySelector('[data-action="dashboardFromDocument"]'));
  assert.ok(cards[2].querySelector('[data-action="documentConvert"]'));
  assert.equal(cards[1].querySelector('.lib-excerpt').textContent, '区域 金额');
  assert.match(documentLibrary({state: {documents: []}, ...ui}), /还没有文档/);
});

test('rules list: one line each, kind word not repeated, folded after six', () => {
  const rules = Array.from({length: 8}, (_, i) => ({id: 'r' + i, kind: i % 2 ? 'document' : 'browser', label: i % 2 ? '读取文档 通威近期分析' : '网站 https://www.bing.com', uses: i, expires: Date.now() + 864e5, ...(i === 3 ? {taskId: 't'} : {})}));
  const doc = new JSDOM(approvalRulesPanel({approvalRules: rules, tasks: [{id: 't', name: '早报'}]}, ui)).window.document;
  assert.equal(doc.querySelectorAll('.approval-panel > .rule-row').length, 6);
  assert.equal(doc.querySelectorAll('.rule-more .rule-row').length, 2);
  assert.match(doc.querySelector('.rule-more summary').textContent, /显示其余 2 条/);
  const first = doc.querySelector('.rule-row');
  assert.equal(first.querySelector('.rule-kind').textContent, '网站');
  assert.equal(first.querySelector('.rule-target').textContent, 'https://www.bing.com');
  assert.match(doc.querySelectorAll('.rule-row')[3].textContent, /仅限：早报/);
  assert.equal(doc.querySelectorAll('[data-action="removeApprovalRule"]').length, 8);
  assert.match(approvalRulesPanel({approvalRules: []}, ui), /还没有规则/);
});

test('sidebar: 仪表盘 lives under 资料库 and is not a top-level entry', () => {
  assert.ok(!NAV_LAYOUT.some(n => n.id === 'studio'));
  assert.equal(groupOf('studio').title, '资料库');
});
