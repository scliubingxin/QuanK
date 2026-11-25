import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, symlink, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOpsAdapter, createMockEngine, createExistingOfficeEngine, validateOfficeOps, PREVIEW_TTL_MS, UNDO_TTL_MS} from '../services/office-ops.mjs';
import {createOfficeTools, createOfficeQuantReader, officeApproval, officeApprovalCard, createOfficeApprovalBridge, officeResultCard, routeOfficeIntent} from '../services/office-tools.mjs';
import {createInlineApprovals} from '../main/inline-approval.mjs';
import {approvalCard} from '../src/ui/approval-card.js';
import {generateDocument} from '../runtime/documents.mjs';
import {createDocumentService} from '../services/documents.mjs';

const stamp = '2026-11-24T08:00:00.000Z';
const initial = {
  writer: {format: 'docx', paragraphs: [{id: 'heading', text: '季度收益', style: {heading: 1}}, {id: 'p2', text: '旧结论'}]},
  slides: {format: 'pptx', slides: [{id: 's3', title: '收益表', shapes: [{id: 'title', text: '收益表'}]}],
    tables: [{id: 't3', label: '收益对照表', after: {slide: 's3'}, rows: [['旧代码', '旧名称'], ['100000', '旧名称']], header: true}],
    charts: [{id: 'c3', after: {slide: 's3'}, chart: {type: 'bar', title: '收益', categories: ['旧'], series: [{name: '旧', values: [3]}]}}]},
  calc: {format: 'xlsx', sheets: [{id: 'data', name: '数据', cells: {A1: {value: 20, style: {bold: true}}}}]},
};
const replace = {op: 'replace_text', target: {paragraph: 'p2'}, text: '新结论'};
const setCell = {op: 'set_cell', sheet: 'data', cell: 'A1'};
const chart = {type: 'line', categories: ['Nov'], series: [{name: '回测', values: [12]}]};
const createAdapter = () => createOpsAdapter(createMockEngine(initial));

test('8.2 操作 schema、目标校验、结果与回滚', async () => {
  const adapter = createAdapter();
  const ops = [replace, {op: 'set_style', target: {find: '季度'}, style: {color: '#0000FF'}},
    {op: 'insert_paragraph', after: {paragraph: 'p2'}, text: '风险提示'},
    {op: 'insert_table', after: {paragraph: 'p2'}, rows: [[1, 2]], header: true},
    {op: 'insert_chart', after: {paragraph: 'p2'}, chart}];
  const plan = await adapter.preview('writer', ops);
  await assert.rejects(adapter.apply(plan.previewToken), /确认/);
  assert.equal((await adapter.read('writer', {paragraph: 'p2'})).text, '旧结论');
  const result = await adapter.apply(plan.previewToken, {confirmed: true});
  assert.deepEqual(result.items, plan.items);
  assert.equal(result.kind, 'revision');
  assert.equal(result.changes, 5);
  assert.equal((await adapter.find('writer', '季度'))[0].style.color, '#0000FF');
  assert.equal((await adapter.read('writer', {paragraph: 'p2'})).text, '新结论');
  assert.equal((await adapter.outline('writer')).tables.length, 1);
  assert.equal((await adapter.apply(plan.previewToken, {confirmed: true})).status, 'invalid_preview');
  await adapter.rollback(result.undoToken);
  assert.equal((await adapter.read('writer', {paragraph: 'p2'})).text, '旧结论');
  assert.equal((await adapter.outline('writer')).tables.length, 0);
});

test('拒绝错误操作、文本超限、目标缺失和维度不匹配', async () => {
  const bad = [
    {op: 'run_macro'}, {...replace, extra: true}, {...replace, text: 'a'.repeat(10001)},
    {...replace, target: {paragraph: 'p2', find: '旧'}}, {...setCell, formula: '=A1', value: 2},
    {op: 'insert_table', after: null, rows: [[1], [2, 3]]},
    {op: 'insert_chart', after: null, chart: {...chart, categories: ['Nov', 'Dec']}},
  ];
  for (const entry of bad) assert.throws(() => validateOfficeOps([entry]));
  const adapter = createAdapter();
  await assert.rejects(adapter.preview('writer', [{...replace, target: {paragraph: 'bad'}}]), /不存在/);
  await assert.rejects(adapter.preview('slides', [{op: 'update_table', target: {table: 't3'}, rows: [[1, 2], [3]]}]), /行列数/);
  assert.equal((await adapter.outline('slides')).revision, 1);
});

test('只允许仓库已有的七个本地函数', async () => {
  const adapter = createAdapter();
  for (const formula of ['=WEBSERVICE("http://test")', '=HYPERLINK("file:")', '=SUM([foo]A1)', '=XLSM!A1',
    '=cmd|foo', '=MACRO()', '=INDIRECT("A1")', '=SUM(A1)EVIL', '=Unknown(A1)']) {
    assert.throws(() => validateOfficeOps([{...setCell, formula}]), formula);
  }
  for (const formula of ['=SUM(B1:B2)', '=IF(B1>0,ROUND(B1,2),MAX(0,B2))', '=AVERAGE(B1,COUNT(B2),MIN(B3,0))']) {
    validateOfficeOps([{...setCell, formula}]);
  }
  const plan = await adapter.preview('calc', [{...setCell, formula: '=SUM(B1:B2)'}]);
  const result = await adapter.apply(plan.previewToken, {confirmed: true});
  assert.equal(result.kind, 'changeset');
  assert.deepEqual(await adapter.read('calc', {sheet: 'data', from: 'A1', to: 'B2'}),
    {A1: {formula: '=SUM(B1:B2)', style: {bold: true}}});
  await adapter.rollback(result.undoToken);
  assert.deepEqual(await adapter.read('calc', {sheet: 'data', cell: 'A1'}), {value: 20, style: {bold: true}});
});

test('幻灯片与文本框结构修改可回滚，旧预览和旧回执失效', async () => {
  const adapter = createAdapter();
  const ops = [{op: 'set_shape_text', slide: 's3', shape: 'title', text: '新内容'},
    {op: 'add_slide', layout: 'title-content', title: '结论', bullets: ['风险提示']}];
  const stale = await adapter.preview('slides', ops);
  const plan = await adapter.preview('slides', ops);
  const result = await adapter.apply(plan.previewToken, {confirmed: true});
  assert.equal(result.kind, 'changeset');
  assert.equal((await adapter.outline('slides')).slides.length, 2);
  assert.equal((await adapter.apply(stale.previewToken, {confirmed: true})).status, 'conflict');
  await adapter.rollback(result.undoToken);
  assert.equal((await adapter.rollback(result.undoToken)).status, 'invalid_undo');
  assert.equal((await adapter.read('slides', {slide: 's3', shape: 'title'})).text, '收益表');
});

test('真实 A57 卡片普通修改支持任务授权，三类高风险只展示拒绝和确认', async () => {
  const adapter = createAdapter();
  for (const [docId, ops, highRisk] of [
    ['writer', [replace], false],
    ['writer', [{op: 'replace_document', text: '替换整篇'}], true],
    ['slides', [{op: 'delete', target: {slide: 's3'}}], true],
    ['calc', [{op: 'delete', target: {sheet: 'data'}}], true],
    ['calc', Array.from({length: 21}, (_, i) => ({...setCell, cell: 'B' + (i + 1), value: i})) , true],
  ]) {
    const plan = await adapter.preview(docId, ops);
    const {action, summary, options} = officeApproval(plan, {label: '报告', reason: '更新', chatId: 'chat'});
    const approvals = createInlineApprovals();
    const pending = approvals.request(action, summary, undefined, options);
    const [request] = approvals.list();
    assert.equal(request.highRisk, highRisk);
    assert.deepEqual(request.choices, highRisk ? ['deny', 'allow'] : ['deny', 'allow', 'always']);
    const html = approvalCard(request, (label, key, id) => `<button data-action="${key}" data-id="${id}">${label}</button>`);
    assert.match(html, /QuankSight 助手 需要你的授权：修改文档/);
    assert.match(html, highRisk ? /确认/ : /允许一次/);
    if (highRisk) assert.doesNotMatch(html, /always|本任务内允许/);
    else assert.match(html, /本任务内允许/);
    assert.equal(approvals.finish(request.requestId, 'deny'), true);
    assert.equal(await pending, 'deny');
  }
});

function fixtures(overrides = {}) {
  const adapter = createAdapter();
  const cards = [], opened = [], locations = [];
  const tools = createOfficeTools({
    adapter, documents: {list: () => Object.entries(initial).map(([id, item]) => ({id, name: id, format: item.format}))},
    requestApproval: async () => 'allow',
    postResult: async card => cards.push(card), openDocument: async (id, context) => { opened.push(id); if (context.target) locations.push(context.target); }, ...overrides,
  });
  const execute = (name, args, chatId = 'owner') => tools.execute('app_office_' + name, args, {chatId});
  return {adapter, tools, execute, cards, opened, locations};
}

test('工具注册、授权拒绝、结果卡操作及对话绑定', async () => {
  const f = fixtures();
  const definitions = new Map();
  f.tools.register((d, handler) => definitions.set(d.function.name, handler));
  assert.equal(definitions.size, 5);
  const denied = fixtures({requestApproval: async () => 'deny'});
  const args = {docId: 'writer', ops: [replace], reason: '调整结论'};
  assert.deepEqual(await denied.execute('edit', args), {status: 'denied'});
  assert.equal((await denied.adapter.outline('writer')).revision, 1);
  const edit = await definitions.get('app_office_edit')(args, {chatId: 'owner'});
  assert.equal(edit.changes, 1);
  const [card] = f.cards;
  assert.deepEqual(card.items, [{title: '替换文字 第 2 段'}]);
  const html = officeResultCard(card, renderAction);
  assert.match(html, /已修改 1 处/);
  assert.match(html, /officeRollback/);
  await assert.rejects(f.tools.resultAction(card, 'officeRollback', {chatId: 'other'}), /对话/);
  await f.tools.resultAction(card, 'officeOpen', {chatId: 'owner'});
  assert.deepEqual(f.opened, ['writer']);
  await f.tools.resultAction(card, 'officeLocate', {chatId: 'owner', index: 0});
  assert.deepEqual(f.locations, [{kind: 'paragraph', id: 'p2'}]);
  await f.tools.resultAction(card, 'officeRollback', {chatId: 'owner'});
  assert.equal((await f.adapter.read('writer', {paragraph: 'p2'})).text, '旧结论');
});

test('拒绝越权 docId、别的对话的页签和软链接，确认后重新核对页签', async () => {
  const root = await mkdtemp(join(tmpdir(), 'o4-scope-'));
  try {
    await writeFile(join(root, 'test.docx'), 'mock');
    await symlink(join(root, 'test.docx'), join(root, 'alias.docx'));
    let relative = 'test.docx', instanceId = 'preview-1';
    const f = fixtures({
      documents: {list: () => []}, folders: () => [{id: 'folder', path: root}],
      currentTab: chatId => chatId === 'owner' ? {docId: 'writer', folderId: 'folder', relative, format: 'docx', instanceId} : null,
      requestApproval: async () => { instanceId = 'preview-2'; return 'allow'; },
    });
    for (const id of ['../writer', 'file:///test.docx', 'missing', '..']) await assert.rejects(f.execute('outline', {docId: id}));
    await assert.rejects(f.execute('outline', {docId: 'writer'}, 'other'), /页签/);
    assert.equal((await f.execute('outline', {docId: 'writer'})).kind, 'writer');
    await assert.rejects(f.execute('edit', {docId: 'writer', reason: '修改', ops: [replace]}), /授权范围/);
    assert.equal((await f.adapter.outline('writer')).revision, 1);
    relative = 'alias.docx';
    await assert.rejects(f.execute('outline', {docId: 'writer'}), /符号链接/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('量化刷新只读股票池、行情和回测，时间戳随表格或图表保存并可撤回', async () => {
  const calls = [];
  const readQuant = createOfficeQuantReader({
    store: {data: {quant: {pool: [{code: '600438', name: '通威股份'}]}}},
    market: {handle: async req => { calls.push(req); return {sourceAsOf: '2026-11-24T07:00:00.000Z', sourceTiming: 'close', quotes: [{code: '600438', name: '通威股份', price: 22, pct: 3}]}; }},
    quant: {handle: async req => { calls.push(req); return {sourceAsOf: '2026-11-24T07:00:00.000Z', summary: {name: '通威股份', backtest: {smartPct: 12, blindPct: 3}}}; }},
    now: () => Date.parse(stamp),
  });
  const f = fixtures({readQuant});
  await f.execute('refresh_quant', {docId: 'slides', target: {table: 't3'}, source: {kind: 'pool'}});
  const table = await f.adapter.read('slides', {table: 't3'});
  assert.deepEqual(table.footnote, {source: 'QuankSight 股票池', sourceAsOf: null, fetchedAt: stamp});
  assert.deepEqual(table.rows[1], ['600438', '通威股份']);
  for (const kind of ['quotes', 'backtest']) {
    await f.execute('refresh_quant', {docId: 'slides', target: {chart: 'c3'}, source: {kind, codes: ['600438']}});
    const result = await f.adapter.read('slides', {chart: 'c3'});
    assert.equal(result.footnote.sourceAsOf, '2026-11-24T07:00:00.000Z');
    assert.equal(result.footnote.fetchedAt, stamp);
    assert.equal(result.chart.series[0].values[0], kind === 'quotes' ? 22 : 12);
  }
  await f.tools.resultAction(f.cards.at(-1), 'officeRollback', {chatId: 'owner'});
  assert.equal((await f.adapter.read('slides', {chart: 'c3'})).chart.series[0].values[0], 22);
  assert.deepEqual(calls, [{action: 'quotes', codes: ['600438']}, {action: 'signal', code: '600438'}]);
});

test('现有成果中心适配器使用真实 XLSX 校验、存版本与回滚', async () => {
  const documents = createDocumentService({store: {data: {documents: []}, async save() {}}});
  const source = await generateDocument('xlsx', JSON.stringify({sheets: [{name: '数据', rows: [[5]]}]}));
  const {document} = await documents.importFile('收益表', 'xlsx', source.bytes);
  const adapter = createOpsAdapter(await createExistingOfficeEngine(documents));
  const {id} = document;
  const target = {sheet: '1', cell: 'A1'};
  assert.equal((await adapter.read(id, target)).value, 5);
  const plan = await adapter.preview(id, [{op: 'set_cell', ...target, value: 15}]);
  assert.equal(documents.read(id).revision, 1);
  const result = await adapter.apply(plan.previewToken, {confirmed: true});
  assert.equal((await adapter.read(id, target)).value, 15);
  const formulaPlan = await adapter.preview(id, [{op: 'set_cell', ...target, cell: 'B1', formula: '=SUM(A1,5)'}]);
  const formulaResult = await adapter.apply(formulaPlan.previewToken, {confirmed: true});
  assert.equal((await adapter.read(id, {sheet: '1', cell: 'B1'})).calculated, 20);
  await adapter.rollback(formulaResult.undoToken);
  assert.equal(await adapter.read(id, {sheet: '1', cell: 'B1'}), null);
  assert.equal((await adapter.rollback(result.undoToken)).status, 'version_history');
});

test('现有适配器撤回可以直接恢复前版字节', async () => {
  const documents = createDocumentService({store: {data: {documents: []}, async save() {}}});
  const source = await generateDocument('xlsx', JSON.stringify({sheets: [{name: '数据', rows: [[5]]}]}));
  const {document} = await documents.importFile('收益表', 'xlsx', source.bytes);
  const adapter = createOpsAdapter(await createExistingOfficeEngine(documents));
  const {id} = document;
  const plan = await adapter.preview(id, [{op: 'set_cell', sheet: '1', cell: 'A1', value: 15}]);
  const result = await adapter.apply(plan.previewToken, {confirmed: true});
  await adapter.rollback(result.undoToken);
  assert.deepEqual(documents.bytes(id, documents.read(id).revision).bytes, source.bytes);
});

test('路由可从成果中心文件名定位文档，并优先使用显式文档', async () => {
  const {tools} = fixtures({
    documents: {list: () => [{id: 'writer', name: '收益报告', format: 'docx'}, {id: 'slides', name: '收益报告', format: 'pptx'}]},
  });
  assert.deepEqual(await tools.route('给收益报告.docx 加结论段'),
    {docId: 'writer', tool: 'app_office_edit'});
  assert.equal(await tools.route('给收益报告加结论段'), null);
  assert.deepEqual(await tools.route('给这份报告加结论段', {specifiedDocId: 'slides'}),
    {docId: 'slides', tool: 'app_office_edit'});
});

const renderAction = (label, action, id, style) => `<button class="${style}" data-action="${action}" data-id="${id}">${label}</button>`;

test('v4 授权预览使用用户目标名称、可折叠差异表及自然插入文案', async () => {
  const adapter = createAdapter();
  const plan = await adapter.preview('slides', [
    {op: 'update_table', target: {kind: 'table', index: 1}, rows: [['代码', '名称'], ['600438', '通威股份'], ['000001', '平安银行']]},
    {op: 'set_shape_text', target: {kind: 'shape', id: 's3/title'}, text: '新标题'},
  ]);
  const card = officeApproval(plan, {label: '11 月收益报告.docx', reason: '调整收益'});
  assert.equal(card.summary.split('\n')[0], '11 月收益报告.docx · 2 处修改');
  assert.doesNotMatch(card.summary, /[{}]|t3|s3|p2/);
  assert.match(card.summary, /表 1（收益对照表）/);
  assert.match(card.summary, /第 1 张幻灯片 · 标题框/);
  const html = officeApprovalCard({requestId: 'test', action: card.action, summary: card.summary, ...card.options}, renderAction, card.details);
  assert.match(html, /<table/);
  assert.match(html, /<del>旧代码<\/del>/);
  assert.match(html, /尺寸从 2 行 × 2 列 变为 3 行 × 2 列/);
  assert.match(html, /class="primary"[^>]*>允许一次/);
  const insertion = await adapter.preview('writer', [{op: 'insert_paragraph', after: {kind: 'paragraph', index: 2}, text: '结论：收益提升'}]);
  assert.match(officeApproval(insertion, {label: '报告'}).summary, /在第 2 段后插入：结论：收益提升/);
  const before = await adapter.preview('writer', [{op: 'insert_paragraph', before: {kind: 'paragraph', id: 'p2'}, text: '新段落'}]);
  await adapter.apply(before.previewToken, {confirmed: true});
  assert.equal((await adapter.read('writer', {kind: 'paragraph', index: 2})).text, '新段落');
});

test('A57 桥接保留原授权决策并将丰富预览绑定到请求 ID', async () => {
  const approvals = createInlineApprovals();
  let changed = 0;
  const bridge = createOfficeApprovalBridge(approvals, {changed: () => changed++});
  const plan = await createAdapter().preview('writer', [replace]);
  const card = officeApproval(plan, {label: '报告', chatId: 'chat'});
  const pending = bridge.request(card.action, card.summary, undefined, {...card.options, officePreview: card.details});
  const [request] = bridge.list();
  assert.equal(changed, 1);
  assert.deepEqual(request.officePreview, card.details);
  assert.match(officeApprovalCard(request, renderAction), /修改预览/);
  approvals.finish(request.requestId, 'always');
  assert.equal(await pending, 'always');
  assert.equal(bridge.list()[0].officePreview, undefined);
});

test('自动保存保留同一个文档修改的撤回凭证', async () => {
  const engine = createMockEngine(initial);
  const adapter = createOpsAdapter(engine);
  const plan = await adapter.preview('writer', [replace]);
  const {undoToken} = await adapter.apply(plan.previewToken, {confirmed: true});
  engine.saveAuto('writer');
  assert.equal((await adapter.rollback(undoToken)).status, 'succeeded');
  assert.equal((await adapter.read('writer', {paragraph: 'p2'})).text, '旧结论');
});

test('预览十分钟过期、一次性消费且替换版本时返回冲突', async () => {
  let now = 0;
  const engine = createMockEngine(initial);
  const adapter = createOpsAdapter(engine, {now: () => now});
  const expired = await adapter.preview('writer', [replace]);
  now += PREVIEW_TTL_MS;
  assert.equal((await adapter.apply(expired.previewToken, {confirmed: true})).status, 'expired');
  assert.equal((await adapter.apply(expired.previewToken, {confirmed: true})).status, 'invalid_preview');
  const conflict = await adapter.preview('writer', [replace]);
  engine.saveManual('writer');
  assert.match((await adapter.apply(conflict.previewToken, {confirmed: true})).message, /重新预览/);
  assert.equal((await adapter.read('writer', {kind: 'paragraph', index: 2})).text, '旧结论');
});

test('撤回过期或存在手动版本时回退版本历史', async () => {
  for (const manual of [true, false]) {
    let now = 0;
    const engine = createMockEngine(initial);
    const adapter = createOpsAdapter(engine, {now: () => now});
    const opened = [];
    const f = fixtures({adapter, openVersionHistory: (...args) => opened.push(args)});
    await f.execute('edit', {docId: 'writer', ops: [replace], reason: '调整结论'});
    if (manual) engine.saveManual('writer');
    else now += UNDO_TTL_MS;
    const result = await f.tools.resultAction(f.cards[0], 'officeRollback', {chatId: 'owner'});
    assert.equal(result.status, 'version_history');
    assert.equal(result.reason, manual ? 'version_changed' : 'expired');
    assert.deepEqual(opened, [['writer', {chatId: 'owner', revision: 1}]]);
    assert.equal((await adapter.read('writer', {paragraph: 'p2'})).text, '新结论');
  }
});

test('真实 XLSX 的撤回凭证跨适配器重建持久化', async () => {
  const root = await mkdtemp(join(tmpdir(), 'o4-undo-'));
  try {
    const documents = createDocumentService({store: {data: {documents: []}, async save() {}}});
    const source = await generateDocument('xlsx', JSON.stringify({sheets: [{name: '数据', rows: [[5]]}]}));
    const {document: {id}} = await documents.importFile('收益表', 'xlsx', source.bytes);
    const setup = async () => createOpsAdapter(await createExistingOfficeEngine(documents, {undoDirectory: root}));
    const first = await setup();
    const plan = await first.preview(id, [{op: 'set_cell', target: {kind: 'cell', id: '1/A1'}, value: 15}]);
    const {undoToken} = await first.apply(plan.previewToken, {confirmed: true});
    const second = await setup();
    assert.equal((await second.rollback(undoToken)).status, 'succeeded');
    assert.equal((await second.read(id, {kind: 'cell', id: '1/A1'})).value, 5);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('update_chart 需目标、维度与合法类型，并在预览后可撤回', async () => {
  const adapter = createAdapter();
  const entry = {op: 'update_chart', target: {kind: 'chart', id: 'c3'}, chart};
  for (const invalid of [
    {...entry, target: {kind: 'table', id: 't3'}},
    {...entry, chart: {...chart, type: 'scatter'}},
    {...entry, chart: {...chart, series: [{name: '收益', values: [1, 2]}]}},
    {...entry, chart: {...chart, type: 'pie', series: [...chart.series, {name: '基准', values: [2]}]}},
  ]) assert.throws(() => validateOfficeOps([invalid]));
  await assert.rejects(adapter.preview('slides', [{...entry, target: {kind: 'chart', id: 'missing'}}]), /不存在/);
  const plan = await adapter.preview('slides', [entry]);
  const {undoToken} = await adapter.apply(plan.previewToken, {confirmed: true});
  assert.deepEqual((await adapter.read('slides', entry.target)).chart, chart);
  await adapter.rollback(undoToken);
  assert.equal((await adapter.read('slides', entry.target)).chart.title, '收益');
});

const routeSamples = [
  ['把第 3 页收益表更新到今天', 'refresh_quant'], ['给这份报告加一个结论段', 'edit'],
  ['把所有标题改成蓝色', 'edit'], ['更新这张图表的回测收益', 'refresh_quant'],
  ['刷新表格里的股票池', 'refresh_quant'], ['把文档第 2 段改短一点', 'edit'],
  ['删除第 3 张幻灯片', 'edit'], ['删除工作表「旧账」', 'edit'],
  ['给 A2 单元格设置公式', 'edit'], ['插入一张表格', 'edit'],
  ['更改文本框的对齐方式', 'edit'], ['读取工作表 A1:B5', 'read'],
  ['查看第 3 页', 'read'], ['读取第一段', 'read'],
  ['显示这份文档的目录', 'outline'], ['请列出工作表', 'outline'],
  ['查看文档大纲', 'outline'], ['定位文档里出现的「成本」', 'find'],
  ['查找表格中的「通威股份」', 'find'], ['Refresh the returns chart', 'refresh_quant'],
  ['Add a paragraph to the report', 'edit'], ['Show the document outline', 'outline'],
  ['解释这段代码', null], ['写个脚本更新报告', null],
  ['修复计算函数', null], ['改回测参数再跑一次', null],
  ['打开成果中心', null], ['运行去年全年的回测', null],
  ['查看我的股票池', null], ['你好', null],
];
for (const [prompt, route] of routeSamples) test('路由 · ' + prompt, () => {
  assert.equal(routeOfficeIntent(prompt, {currentDocId: 'writer'})?.tool ?? null, route ? 'app_office_' + route : null);
  assert.equal(routeOfficeIntent(prompt), null);
  if (route) assert.equal(routeOfficeIntent(prompt, {currentDocId: 'writer', specifiedDocId: 'calc'}).docId, 'calc');
});
