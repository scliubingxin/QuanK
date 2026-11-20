import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseNumber, parseDateText, inferColumns, tableFromGrid, normalizeSpec, autoSpec, computeDashboard, filterOptions, filterRows, describeTable, formatValue } from '../src/shared/dashboard.js';
import { readCsv, readXlsx, readTable } from '../runtime/table-read.mjs';
import { generateDocument } from '../runtime/documents.mjs';
import { createDashboardService, connectorTable } from '../services/dashboard.mjs';
import { preparePreviewProtocol } from '../main/preview-protocol.mjs';
import { studioPage, dashboardForm, dashboardPayload, dashboardViewer } from '../src/ui/dashboard.js';

const GRID = [['日期', '区域', '产品', '金额', '数量'],
  ['2026-01-05', '华东', 'A', '1,200', 3], ['2026-01-20', '华北', 'B', 800, 2], ['2026-02-03', '华东', 'B', 500, 1],
  ['2026-02-18', '华南', 'C', 300, 1], ['2026-03-01', '华东', 'A', 2000, 5], ['2026-03-09', '华北', 'A', 700, 2],
  ['2026-03-15', '西南', 'D', 100, 1], ['2026-03-30', '西北', 'E', 50, 1], ['2026-03-31', '东北', 'F', 25, 1], ['2026-03-31', '华中', 'G', 10, 1]];
const table = () => tableFromGrid(GRID);

test('number and date parsing, column inference, bounds', () => {
  assert.equal(parseNumber('1,234.5'), 1234.5);
  assert.equal(parseNumber('¥2,000'), 2000);
  assert.equal(parseNumber('12%'), 0.12);
  assert.equal(parseNumber('(300)'), -300);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber('2026-01-01'), null);
  assert.deepEqual(parseDateText('2026年3月'), {y: 2026, mo: 3, d: 1, h: 0, mi: 0, s: 0});
  assert.equal(parseDateText('2026/13/01'), null);
  const t = table(), cols = inferColumns(t.columns, t.rows);
  assert.deepEqual(cols.map(c => c.type), ['date', 'text', 'text', 'number', 'number']);
  assert.equal(cols[1].distinct, 7);
  assert.throws(() => tableFromGrid([['a', 'b']]), /没有数据行/);
  assert.throws(() => tableFromGrid([[null], ['']]), /空的/);
  assert.deepEqual(tableFromGrid([['x', 'x', ''], [1, 2, 3]]).columns, ['x', 'x_', '列3']);
  const big = tableFromGrid([['a'], ...Array.from({length: 30}, (_, i) => [i])], {maxRows: 10});
  assert.deepEqual([big.rows.length, big.truncated], [10, true]);
  assert.match(describeTable(t, cols), /共 10 行、5 列[\s\S]*金额：数值/);
  assert.ok(!describeTable(t, cols, {samples: false}).includes('例如'));
  assert.equal(formatValue(123456), '12.35 万');
  assert.equal(formatValue(null), '—');
});

test('normalizeSpec keeps only known columns and valid fields', () => {
  const cols = inferColumns(table().columns, table().rows);
  const spec = normalizeSpec('说明：```json\n' + JSON.stringify({title: '销售', kpis: [{label: '销售额', column: '金额', agg: 'sum'}, {label: '幽灵', column: '不存在', agg: 'sum'}, {label: '单数', agg: 'count'}],
    filters: [{column: '区域'}, {column: '金额'}, {column: '日期'}],
    charts: [{type: 'line', title: '趋势', x: '日期', series: [{column: '金额', agg: 'sum'}]}, {type: 'radar', x: '区域'}, {type: 'pie', title: '占比', x: '区域', topN: 50, series: [{column: '金额'}]},
      {type: 'stackedBar', title: '堆叠', x: '区域', series: [{column: '金额'}]}, {type: 'scatter', x: '金额', series: [{column: '数量'}]}, {type: 'table', title: '明细', columns: ['日期', '幽灵', '金额']}]}) + '\n```', cols);
  assert.deepEqual(spec.kpis.map(k => k.label), ['销售额', '单数']);
  assert.deepEqual(spec.filters, [{column: '区域'}, {column: '日期'}]);
  assert.deepEqual(spec.charts.map(c => c.type), ['line', 'pie', 'scatter', 'table']);
  assert.equal(spec.charts[0].timeUnit, 'month');
  assert.equal(spec.charts[1].topN, 8);
  assert.deepEqual(spec.charts[3].columns, ['日期', '金额']);
  assert.equal(normalizeSpec('no json', cols), null);
  assert.equal(normalizeSpec({charts: [{type: 'line', x: '幽灵', series: []}]}, cols), null);
  const auto = autoSpec(cols, '概览');
  assert.ok(auto.charts.some(c => c.type === 'line') && auto.charts.some(c => c.type === 'hbar') && auto.charts.at(-1).type === 'table');
  assert.equal(auto.kpis[0].agg, 'count');
});

test('computeDashboard aggregates real data: time buckets, top-N with 其他, stacked groups, KPIs, filters', () => {
  const t = table(), cols = inferColumns(t.columns, t.rows);
  const spec = normalizeSpec({title: 'T', kpis: [{label: '销售额', column: '金额', agg: 'sum'}, {label: '均价', column: '金额', agg: 'avg'}, {label: '单数', agg: 'count'}, {label: '区域数', column: '区域', agg: 'distinct'}],
    filters: [{column: '区域'}, {column: '日期'}],
    charts: [{type: 'line', title: '月度', x: '日期', timeUnit: 'month', series: [{column: '金额', agg: 'sum', label: '金额'}, {column: '数量', agg: 'sum'}]},
      {type: 'pie', title: '区域占比', x: '区域', topN: 4, series: [{column: '金额'}]},
      {type: 'stackedBar', title: '区域×产品', x: '区域', groupBy: '产品', series: [{column: '金额'}]},
      {type: 'hbar', title: '排名', x: '产品', topN: 3, series: [{column: '金额'}]},
      {type: 'table', title: '汇总', x: '区域', series: [{column: '金额'}]}]}, cols);
  const v = computeDashboard(t, spec);
  assert.deepEqual(v.kpis.map(k => k.value), [5685, 568.5, 10, 7]);
  assert.equal(v.kpis[0].display, '5,685');
  const [line, pie, stack, hbar, tbl] = v.charts;
  assert.deepEqual(line.labels, ['2026-01', '2026-02', '2026-03']);
  assert.deepEqual(line.series[0].values, [2000, 800, 2885]);
  assert.deepEqual(line.series[1].values, [5, 2, 11]);
  assert.deepEqual(pie.labels, ['华东', '华北', '华南', '其他']);
  assert.deepEqual(pie.series[0].values, [3700, 1500, 300, 185]);
  assert.equal(stack.type, 'stackedBar');
  assert.equal(stack.series.find(s => s.name === 'A').values[stack.labels.indexOf('华东')], 3200);
  assert.deepEqual(hbar.labels, ['C', 'B', 'A']);
  assert.deepEqual(tbl.rows[0], ['华东', '3,700']);
  const f = computeDashboard(t, spec, {区域: ['华东'], 日期: {from: '2026-02-01', to: '2026-03-31'}});
  assert.deepEqual([f.rows, f.totalRows, f.kpis[0].value], [2, 10, 2500]);
  assert.equal(filterRows(t, {区域: []}).length, 10);
  const opts = filterOptions(t, spec, cols);
  assert.deepEqual(opts[0].values[0], {value: '华东', count: 3});
  assert.deepEqual([opts[1].min, opts[1].max], ['2026-01-05', '2026-03-31']);
  const week = computeDashboard(t, {charts: [{type: 'bar', title: 'w', x: '日期', timeUnit: 'week', series: [{agg: 'count', column: null, label: 'n'}]}], kpis: []});
  assert.equal(week.charts[0].labels[0], '2026-01-05周');
  const sc = computeDashboard(t, {charts: [{type: 'scatter', title: 's', x: '金额', series: [{column: '数量'}]}], kpis: []});
  assert.deepEqual(sc.charts[0].points[0], [1200, 3]);
});

test('readCsv: quotes, embedded newlines, semicolons, GBK; readTable rejects unknown formats', () => {
  const r = readCsv(Buffer.from('\uFEFF名称,金额,备注\n"A, Inc",1200,"多行\n备注"\nB,"1,500",\n'));
  assert.deepEqual(r.columns, ['名称', '金额', '备注']);
  assert.deepEqual(r.rows, [['A, Inc', '1200', '多行\n备注'], ['B', '1,500', null]]);
  assert.deepEqual(readCsv(Buffer.from('a;b\n1;2\n')).rows, [['1', '2']]);
  const gbk = Buffer.concat([Buffer.from([0xc7, 0xf8, 0xd3, 0xf2]), Buffer.from(',x\n'), Buffer.from([0xbb, 0xaa, 0xb6, 0xab]), Buffer.from(',1\n')]);
  assert.deepEqual(readCsv(gbk).columns, ['区域', 'x']);
  assert.deepEqual(readCsv(gbk).rows[0], ['华东', '1']);
  assert.throws(() => readTable('pdf', Buffer.alloc(1)), /Excel/);
});

test('readXlsx reads a generated workbook (shared strings, numbers, sheets)', async () => {
  const {bytes} = await generateDocument('xlsx', JSON.stringify({sheets: [{name: '销售', rows: [['区域', '金额'], ['华东', 1200], ['华北', 800.5]]}, {name: '其他', rows: [['k'], ['v']]}]}));
  const r = readXlsx(bytes);
  assert.deepEqual([r.sheets, r.sheet, r.columns], [['销售', '其他'], '销售', ['区域', '金额']]);
  assert.deepEqual(r.rows, [['华东', 1200], ['华北', 800.5]]);
  assert.deepEqual(readXlsx(bytes, {sheet: '其他'}).rows, [['v']]);
  assert.throws(() => readXlsx(Buffer.from('not a zip')));
});

const memStore = data => ({data: {settings: {model: 'm'}, documents: [], ...data}, async save() {}, log(t, d) { (this.logs ??= []).push([t, d]); }});

test('service: model designs the layout from column info only; bad answers fall back; no model → auto', async () => {
  const {bytes} = await generateDocument('xlsx', JSON.stringify({sheets: [{name: 'S', rows: GRID.map(r => r.map(v => typeof v === 'string' && /^[\d,]+$/.test(v) ? Number(v.replace(/,/g, '')) : v))}]}));
  const store = memStore({documents: [{id: 'd1', name: '销售.xlsx', format: 'xlsx', revision: 3, base64: Buffer.from(bytes).toString('base64')}]});
  const asked = [];
  let answer = JSON.stringify({title: '销售概览', kpis: [{label: '销售额', column: '金额', agg: 'sum'}], charts: [{type: 'bar', title: '区域', x: '区域', series: [{column: '金额'}]}]});
  const svc = createDashboardService({store, request: async (s, k, m) => { asked.push(m); return {text: answer}; }, now: () => 5});
  const r = await svc.handle({action: 'create', source: 'document', documentId: 'd1', prompt: '看区域', sendSamples: false});
  assert.equal(r.designer, 'model');
  const prompt = asked[0][1].content;
  assert.match(prompt, /金额：数值/);
  assert.ok(!prompt.includes('例如') && !prompt.includes('1200') && !prompt.includes('华东'), 'no sample values or rows were sent');
  const v = svc.view()[0];
  assert.deepEqual([v.name, v.rows, v.designer, v.source.revision, v.source.sheet, 'table' in v], ['销售概览', 10, 'model', 3, 'S', false]);
  const full = svc.get(r.id);
  assert.equal(full.table.rows.length, 10);
  assert.deepEqual(computeDashboard(full.table, full.spec).kpis[0].value, 5685);
  answer = '{"charts":[{"type":"line","x":"不存在"}]}';
  const r2 = await svc.handle({action: 'redesign', id: r.id, prompt: '换一种'});
  assert.match(r2.note, /无法使用/);
  assert.equal(svc.get(r.id).designer, 'auto');
  const noModel = createDashboardService({store: memStore({settings: {}, documents: store.data.documents}), request: async () => { throw Error('should not call'); }});
  assert.match((await noModel.handle({action: 'create', source: 'document', documentId: 'd1'})).note, /未配置模型/);
  const failing = createDashboardService({store: memStore({documents: store.data.documents}), request: async () => { throw Error('401'); }});
  assert.match((await failing.handle({action: 'create', source: 'document', documentId: 'd1'})).note, /模型设计失败（401）/);
  await assert.rejects(svc.handle({action: 'create', source: 'document', documentId: 'nope'}), /不存在/);
  await svc.handle({action: 'rename', id: r.id, name: '新名字'});
  assert.equal(svc.view()[0].name, '新名字');
  await svc.handle({action: 'remove', id: r.id});
  assert.equal(svc.view().length, 0);
});

test('service: file source uses the system dialog only; connectors source; exports', async () => {
  const csv = Buffer.from('区域,金额\n华东,10\n华北,5\n');
  let chosen = {path: '/tmp/x/销售.csv'}, reads = [], saved = [];
  const store = memStore({settings: {}, connectors: [{id: 'm', name: '邮箱'}], connectorItems: [{connectorId: 'm', kind: 'mail', title: '报价', author: '张三 <z@x.com>', time: Date.UTC(2026, 10, 19), unread: true}]});
  const svc = createDashboardService({store, chooseFile: async () => chosen, readFile: async p => { reads.push(p); return csv; },
    saveFile: async f => { saved.push(f); return true; }, standaloneHtml: async view => `<html>${JSON.stringify(view)}</html>`});
  const r = await svc.handle({action: 'create', source: 'file', path: '/etc/passwd'});
  assert.deepEqual(reads, ['/tmp/x/销售.csv']);
  assert.equal(svc.view()[0].source.name, '销售.csv');
  chosen = null;
  assert.deepEqual(await svc.handle({action: 'create', source: 'file'}), {cancelled: true});
  const c = await svc.handle({action: 'create', source: 'connectors'});
  assert.deepEqual(svc.get(c.id).table.columns, ['来源', '类型', '标题', '发件人或作者', '时间', '状态']);
  assert.deepEqual(svc.get(c.id).table.rows[0].slice(0, 4), ['邮箱', '邮件', '报价', '张三']);
  assert.throws(() => connectorTable({connectors: [], connectorItems: []}), /还没有/);
  await assert.rejects(svc.handle({action: 'export', id: r.id, format: 'png', dataUrl: 'javascript:1'}), /图片数据无效/);
  assert.deepEqual(await svc.handle({action: 'export', id: r.id, format: 'png', dataUrl: 'data:image/png;base64,iVBORw0KGgo='}), {saved: true});
  assert.equal(saved[0].name, '销售.png');
  assert.deepEqual([...saved[0].bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  await svc.handle({action: 'export', id: r.id, format: 'html', filters: {区域: ['华东']}});
  assert.match(saved[1].bytes.toString(), /"rows":1/);
  await assert.rejects(svc.handle({action: 'export', id: r.id, format: 'exe'}), /格式无效/);
  await assert.rejects(svc.handle({action: 'nope'}), /未知操作/);
});

test('viz frame is served from the preview protocol with integrity, script-src self and no network', async () => {
  const dir = new URL('../src/viz/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('VIZ-MANIFEST.json', dir), 'utf8'));
  for (const f of manifest.files) {
    const b = await readFile(new URL(f.name, dir));
    assert.equal(createHash('sha256').update(b).digest('hex'), f.sha256, f.name);
  }
  const handler = await preparePreviewProtocol(path.join(path.dirname(new URL(import.meta.url).pathname), '../src/preview'));
  for (const name of ['index.html', 'frame.js', 'echarts.min.js']) {
    const res = handler({url: 'willbuddy-preview://local/viz/' + name, method: 'GET'});
    assert.equal(res.status, 200, name);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /connect-src 'none'/);
    assert.ok(!/unsafe-eval|unsafe-inline'; img/.test(csp.split('style-src')[0]));
  }
  assert.equal(handler({url: 'willbuddy-preview://local/viz/other.js', method: 'GET'}).status, 404);
  const frame = await readFile(new URL('frame.js', dir), 'utf8');
  assert.ok(!/fetch\(|XMLHttpRequest|localStorage|eval\(|new Function/.test(frame));
});

test('UI builders escape names and round-trip the form', () => {
  const ui = {action: (l, a, id = '') => `<button data-action="${a}" data-id="${id}">${l}</button>`, date: () => 'd', heading: (k, t, d, b) => `<h1>${t}</h1>${b}`, empty: t => t};
  const html = studioPage({dashboards: [{id: 'x', name: '<img src=x>', designer: 'model', source: {kind: 'file', name: '<b>a.csv</b>'}, rows: 3, spec: {kpis: [], charts: [{}]}, updated: 1}]}, ui);
  assert.ok(!html.includes('<img src=x>') && !html.includes('<b>a.csv'));
  assert.match(html, /dashboardOpen/);
  assert.match(studioPage({}, ui), /还没有仪表盘/);
  const form = dashboardForm({documents: [{id: 'd', name: 'a.xlsx', format: 'xlsx'}, {id: 'w', name: 'b.docx', format: 'docx'}]}, {documentId: 'd'});
  assert.match(form, /<option value="d" selected>/);
  assert.ok(!form.includes('b.docx'));
  assert.match(form, /value="connectors"[^>]*disabled/);
  const f = new FormData();
  for (const [k, v] of [['source', 'document'], ['documentId', 'd'], ['sheet', ''], ['prompt', '看趋势']]) f.set(k, v);
  assert.deepEqual(dashboardPayload(f), {action: 'create', source: 'document', documentId: 'd', sheet: undefined, prompt: '看趋势', sendSamples: false});
  assert.match(dashboardViewer('x'), /class="viz-host" data-dashboard-id="x"/);
});
