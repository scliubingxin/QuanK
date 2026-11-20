import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { normalizeComparison, comparisonMatrix, comparisonXlsx, comparisonDocx, coverage, safeHttpUrl, COMPARISON_INSTRUCTION } from '../src/shared/comparison.js';
import { createComparisonService } from '../services/comparison.mjs';
import { createRich } from '../src/ui/markdown.js';
import { generateDocument } from '../runtime/documents.mjs';
import { readXlsx } from '../runtime/table-read.mjs';

const SPEC = {title: '项目管理工具对比', options: ['飞书项目', 'Jira', 'Teambition', 'Jira'],
  dimensions: [{name: '价格', unit: '元/人/月', kind: 'metric'}, {name: '免费人数', kind: 'metric'}, {name: '上手难度', kind: 'judgment'}, {name: '价格'}],
  cells: [{option: '飞书项目', dimension: '价格', value: '30', source: 'https://www.feishu.cn/pricing', sourceTitle: '飞书定价'},
    {option: 'Jira', dimension: '价格', value: '7.75', unit: '美元/人/月', source: 'https://www.atlassian.com/software/jira/pricing'},
    {option: 'jira', dimension: '免费人数', value: '10', source: 'javascript:alert(1)'},
    {option: 'Teambition', dimension: '价格', value: '未找到'},
    {option: '飞书项目', dimension: '上手难度', value: '低', note: '中文界面'},
    {option: '不存在', dimension: '价格', value: '1'}, {option: 'Jira', dimension: '不存在', value: '1'}],
  summary: '国内团队优先考虑飞书项目。'};

test('normalizeComparison: dedupes, drops unknown cells, placeholders and unsafe links', () => {
  const s = normalizeComparison(JSON.stringify(SPEC));
  assert.deepEqual(s.options, ['飞书项目', 'Jira', 'Teambition']);
  assert.deepEqual(s.dimensions.map(d => [d.name, d.kind]), [['价格', 'metric'], ['免费人数', 'metric'], ['上手难度', 'judgment']]);
  assert.equal(s.cells.Jira['免费人数'].value, '10');
  assert.equal(s.cells.Jira['免费人数'].source, undefined);
  assert.equal(s.cells.Teambition['价格'], undefined);
  assert.equal(Object.keys(s.cells.Jira).length, 2);
  assert.deepEqual(coverage(s), {total: 9, found: 4, missing: 5, sourced: 2});
  assert.throws(() => normalizeComparison({options: ['A'], dimensions: ['x']}), /2 到 8/);
  assert.throws(() => normalizeComparison({options: ['A', 'B'], dimensions: []}), /1 到 20/);
  assert.throws(() => normalizeComparison('[1]'), /JSON 对象/);
  assert.throws(() => normalizeComparison('x'.repeat(30000)), /24000/);
  assert.equal(safeHttpUrl('https://u:p@a.com'), '');
  assert.equal(safeHttpUrl(' https://a.com/x '), 'https://a.com/x');
  assert.match(COMPARISON_INSTRUCTION, /comparison代码围栏/);
  assert.ok(!COMPARISON_INSTRUCTION.includes("'"), 'instruction is embedded in a single-quoted string');
});

test('matrix: metric rows first, judgment last, units, footnotes, 未找到', () => {
  const m = comparisonMatrix(normalizeComparison(SPEC));
  assert.deepEqual(m.header, ['维度', '飞书项目', 'Jira', 'Teambition']);
  assert.deepEqual(m.rows[0], ['价格（元/人/月）', '30 元/人/月 [1]', '7.75 美元/人/月 [2]', '未找到']);
  assert.deepEqual(m.rows[1], ['免费人数', '未找到', '10', '未找到']);
  assert.deepEqual(m.rows[2], ['上手难度 · 定性', '低（中文界面）', '未找到', '未找到']);
  assert.deepEqual(m.sources.map(s => [s.n, s.title]), [[1, '飞书定价'], [2, 'www.atlassian.com']]);
});

test('exports produce real XLSX and DOCX packages', async () => {
  const s = normalizeComparison(SPEC);
  const x = await generateDocument('xlsx', JSON.stringify(comparisonXlsx(s)));
  const read = readXlsx(x.bytes);
  assert.deepEqual(read.sheets, ['对比', '来源']);
  const src = readXlsx(x.bytes, {sheet: '来源'});
  assert.deepEqual(src.rows[0], [1, '飞书定价', 'https://www.feishu.cn/pricing']);
  const d = await generateDocument('docx', JSON.stringify(comparisonDocx(s)));
  assert.ok(d.bytes.length > 1000);
  const docx = comparisonDocx(s);
  assert.match(docx.blocks[1].text, /4 项有数据（2 项附来源），5 项未找到/);
});

test('service saves into the document library and re-validates the spec', async () => {
  const imported = [];
  const svc = createComparisonService({documents: {importFile: async (name, format, bytes) => { imported.push({name, format, size: bytes.length}); return {document: {id: 'doc1', name}}; }}, store: {log() {}}});
  const r = await svc.handle({action: 'export', format: 'xlsx', spec: SPEC});
  assert.deepEqual(r, {id: 'doc1', name: '对比-项目管理工具对比', format: 'xlsx'});
  assert.equal(imported[0].format, 'xlsx');
  await assert.rejects(svc.handle({action: 'export', format: 'exe', spec: SPEC}), /格式无效/);
  await assert.rejects(svc.handle({action: 'export', format: 'docx', spec: {options: ['x']}}), /2 到 8/);
  await assert.rejects(svc.handle({action: 'nope'}), /未知操作/);
});

test('chat rendering: comparison block becomes a safe table with export buttons', () => {
  const {window} = new JSDOM('<body></body>');
  const {rich} = createRich(window);
  const evil = {...SPEC, title: '<img src=x onerror=alert(1)>', options: ['<b>A</b>', 'B'], cells: [{option: '<b>A</b>', dimension: '价格', value: '<script>x</script>', source: 'https://a.com'}]};
  const html = rich('结论如下：\n\n```comparison\n' + JSON.stringify(evil) + '\n```\n\n后续说明');
  const doc = new JSDOM(html).window.document;
  const fig = doc.querySelector('figure.chat-compare');
  assert.ok(fig);
  assert.equal(doc.querySelectorAll('img,script').length, 0);
  assert.equal(fig.querySelector('figcaption').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(fig.querySelector('tbody td').textContent.trim(), '<script>x</script> [1]');
  assert.equal(fig.querySelector('sup a').getAttribute('href'), 'https://a.com/');
  assert.equal(fig.querySelectorAll('td.compare-missing').length, 5);
  const buttons = [...fig.querySelectorAll('button[data-action="comparisonExport"]')];
  assert.deepEqual(buttons.map(b => JSON.parse(b.dataset.id).format), ['xlsx', 'docx']);
  assert.equal(JSON.parse(buttons[0].dataset.id).spec.options[0], '<b>A</b>');
  assert.match(html, /后续说明/);
  const bad = rich('```comparison\n{"options":["only"]}\n```');
  assert.match(bad, /对比表未渲染：对比需要 2 到 8 个选项/);
  const unfinished = rich('```comparison\n{"options":["A"');
  assert.ok(!unfinished.includes('chat-compare') && !unfinished.includes('对比表未渲染'), 'a still-streaming block is left as code');
});
