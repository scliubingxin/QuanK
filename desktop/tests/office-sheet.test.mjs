// [excel] Pure spreadsheet helpers: references, LOK payload parsing, geometry, statistics, formula policy, validation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  colName, colIndex, cellRef, normalizeRef, validateGotoRef, columnRange, rowRange, parseAddress, parseCellCursor, parseRect,
  parseRuns, axisRuns, visibleSpans, spanStart, spanSize, parseDisplayNumber, selectionStats, parseStateTableCell,
  formulaAllowed, isFormulaLike, validateCellInput, sheetKeyEvent, sheetTypedChar, validateSheetKey, validateSheetText,
  sheetNameValid, nextSheetName, validateBorder, validateSheetTab, validateSheetSize, MAX_COL, MAX_ROW
} from '../src/shared/office-sheet.js';

test('column names and references round-trip up to XFD1048576', () => {
  assert.equal(colName(0), 'A'); assert.equal(colName(25), 'Z'); assert.equal(colName(26), 'AA'); assert.equal(colName(MAX_COL - 1), 'XFD');
  assert.equal(colName(MAX_COL), ''); assert.equal(colName(-1), '');
  for (const n of [0, 1, 25, 26, 51, 52, 701, 702, 16383]) assert.equal(colIndex(colName(n)), n);
  assert.equal(colIndex('XFE'), -1); assert.equal(colIndex('a'), -1);
  assert.equal(cellRef(1, 3), 'B4');
});
test('name box input is normalised to a GoToCell reference', () => {
  assert.equal(normalizeRef(' b3 '), 'B3');
  assert.equal(normalizeRef('$A$1:c4'), 'A1:C4');
  assert.equal(normalizeRef('C4:A1'), 'A1:C4');
  assert.equal(normalizeRef('c:e'), 'C1:E' + MAX_ROW);
  assert.equal(normalizeRef('5:3'), 'A3:XFD5');
  for (const bad of ['', 'A0', 'XFE1', 'A1048577', 'Sheet1!A1', '=A1', 'A1:B', '1A']) assert.equal(normalizeRef(bad), null, bad);
  assert.equal(validateGotoRef('A1:C4'), 'A1:C4');
  assert.throws(() => validateGotoRef('C4:A1')); assert.throws(() => validateGotoRef('a1')); assert.throws(() => validateGotoRef('A1;B2'));
  assert.equal(columnRange(2), 'C1:C1048576'); assert.equal(columnRange(4, 2), 'C1:E1048576'); assert.equal(rowRange(0, 2), 'A1:XFD3');
  assert.deepEqual(parseAddress('B4'), {c1: 1, r1: 3, c2: 1, r2: 3});
  assert.deepEqual(parseAddress('A7:C8'), {c1: 0, r1: 6, c2: 2, r2: 7});
  assert.equal(parseAddress('nonsense'), null);
});
test('LibreOfficeKit Calc payloads (cell cursor, selection area)', () => {
  assert.deepEqual(parseCellCursor('960, 900, 959, 299, 1, 3'), {x: 960, y: 900, width: 959, height: 299, col: 1, row: 3});
  assert.equal(parseCellCursor('EMPTY'), null);
  assert.deepEqual(parseCellCursor('0, 0, 10, 10'), {x: 0, y: 0, width: 10, height: 10, col: null, row: null});
  assert.deepEqual(parseRect('0, 1800, 2880, 600'), {x: 0, y: 1800, width: 2880, height: 600});
  assert.equal(parseRect('EMPTY'), null);
});
test('sheet geometry run-length data -> visible header spans', () => {
  // Real ".uno:SheetGeometryData" output: uniform 963-twip columns, 300-twip rows.
  const cols = axisRuns({sizes: '963:16383 ', hidden: '0:16383 ', filtered: '0:16383 '}, MAX_COL);
  assert.deepEqual(cols, [{start: 0, end: 16383, size: 963}]);
  const spans = visibleSpans(cols, 2000, 3000);
  assert.deepEqual(spans.map(s => s.index), [2, 3, 4, 5]);
  assert.equal(spans[0].start, 2 * 963);
  // Custom widths, a hidden column and filtered rows.
  const mixed = axisRuns({sizes: '2000:0 963:4 1500:16383', hidden: '0:2 1:3 0:16383', filtered: '0:16383'}, MAX_COL);
  assert.equal(spanSize(mixed, 0), 2000); assert.equal(spanSize(mixed, 3), 0); assert.equal(spanSize(mixed, 4), 963); assert.equal(spanSize(mixed, 5), 1500);
  assert.equal(spanStart(mixed, 4), 2000 + 2 * 963);
  assert.deepEqual(visibleSpans(mixed, 0, 6000).map(s => s.index), [0, 1, 2, 4, 5]);
  const rows = axisRuns({sizes: '300:1048575', hidden: '0:9 1:11 0:1048575', filtered: '0:1048575'}, MAX_ROW);
  assert.deepEqual(visibleSpans(rows, 2700, 900).map(s => s.index), [9, 12, 13]);
  assert.deepEqual(parseRuns('bad 5:2 7:1 9:4', 10), [{value: 5, end: 2}, {value: 9, end: 4}]);
  assert.equal(axisRuns(null, 10), null);
});
test('status bar statistics from the displayed selection', () => {
  assert.equal(parseDisplayNumber('1,234.50'), 1234.5); assert.equal(parseDisplayNumber('12%'), 0.12); assert.equal(parseDisplayNumber('¥5.00'), 5);
  assert.equal(parseDisplayNumber('(3)'), -3); assert.equal(parseDisplayNumber('2026年2月'), null); assert.equal(parseDisplayNumber(''), null);
  assert.deepEqual(selectionStats('42\t2\t3\n0.5\t0.25\t1234.5\n'), {count: 6, numeric: 6, sum: 1282.25, average: 1282.25 / 6});
  assert.deepEqual(selectionStats('a\t\t1\n'), {count: 2, numeric: 1, sum: 1, average: 1});
  assert.equal(selectionStats('42'), null); assert.equal(selectionStats('1\t2', {single: true}), null);
  assert.deepEqual(parseStateTableCell('Average: 213.708333333333; Sum: 1282.25'), {average: 213.708333333333, sum: 1282.25});
  assert.deepEqual(parseStateTableCell('平均值：2；求和：6'.replace('；', ';')), {average: 2, sum: 6});
});
test('formula policy blocks network/external data while allowing ordinary text and formulas', () => {
  for (const ok of ['hello', 'https://example.com', '=SUM(A1:B2)', "='Sheet 2'.A1*2", '=VLOOKUP(A1,B:C,2,0)', '-5', '+86 123', '=IF(A1>0,"是","否")']) assert.ok(formulaAllowed(ok), ok);
  for (const bad of ['=WEBSERVICE("http://x")', '=filterxml(A1,"//a")', "='file:///etc/passwd'#$Sheet1.A1", '=[Book2.xlsx]Sheet1!A1', '=HYPERLINK("http://x")', '=INFO("system")', '@WEBSERVICE("x")', '=DDE("a","b","c")', '=INDIRECT("A1")', '=A1&"http://x"']) assert.equal(formulaAllowed(bad), false, bad);
  assert.ok(isFormulaLike('=1')); assert.ok(!isFormulaLike('-5')); assert.ok(isFormulaLike('-A1'));
  assert.deepEqual(validateCellInput({text: '=SUM(A1)', move: 'down'}), {text: '=SUM(A1)', move: 'down'});
  assert.throws(() => validateCellInput({text: '=WEBSERVICE("x")'}), /公式/);
  assert.throws(() => validateCellInput({text: 'a', move: 'diagonal'}));
  assert.throws(() => validateCellInput({text: 'a\0'}));
});
test('keyboard mapping and validation', () => {
  assert.deepEqual(sheetKeyEvent({key: 'Enter', shiftKey: true}), {key: 'Enter', shift: true, control: false, alt: false});
  assert.deepEqual(sheetKeyEvent({key: 'ArrowDown', metaKey: true}), {key: 'ArrowDown', shift: false, control: true, alt: false});
  assert.equal(sheetKeyEvent({key: 'a'}), null); assert.equal(sheetKeyEvent({key: 'Enter', isComposing: true}), null); assert.equal(sheetKeyEvent({key: 'Process', keyCode: 229}), null);
  assert.equal(sheetTypedChar({key: 'a'}), 'a'); assert.equal(sheetTypedChar({key: '中'}), '中'); assert.equal(sheetTypedChar({key: ' '}), ' ');
  assert.equal(sheetTypedChar({key: 'a', metaKey: true}), null); assert.equal(sheetTypedChar({key: 'Enter'}), null); assert.equal(sheetTypedChar({key: '😀'}), null);
  assert.deepEqual(validateSheetKey({key: 'Delete'}), {key: 'Delete', shift: false, control: false, alt: false});
  assert.throws(() => validateSheetKey({key: 'F12'})); assert.throws(() => validateSheetKey({key: 'Tab', shift: 'yes'})); assert.throws(() => validateSheetKey({key: 'Tab', code: 1}));
  assert.equal(validateSheetText('abc中文'), 'abc中文');
  assert.throws(() => validateSheetText('')); assert.throws(() => validateSheetText('a\n')); assert.throws(() => validateSheetText('x'.repeat(201))); assert.throws(() => validateSheetText('😀'));
});
test('sheet tab, border and size validation', () => {
  assert.ok(sheetNameValid('核心结论')); assert.ok(!sheetNameValid('a/b')); assert.ok(!sheetNameValid('x'.repeat(32))); assert.ok(!sheetNameValid("'x")); assert.ok(!sheetNameValid('A', ['A']));
  assert.equal(nextSheetName(['工作表1', 'Sheet2']), '工作表3');
  assert.deepEqual(validateSheetTab({action: 'insert', index: 2, name: '新表'}), {action: 'insert', index: 2, name: '新表'});
  assert.deepEqual(validateSheetTab({action: 'move', index: 0, to: 3}), {action: 'move', index: 0, to: 3});
  assert.deepEqual(validateSheetTab({action: 'color', index: 0, color: 'none'}), {action: 'color', index: 0, color: 'none'});
  for (const bad of [{action: 'hide', index: 0}, {action: 'rename', index: 0, name: 'a:b'}, {action: 'move', index: 0}, {action: 'delete', index: -1}, {action: 'color', index: 0, color: 'red'}]) assert.throws(() => validateSheetTab(bad), JSON.stringify(bad));
  assert.deepEqual(validateBorder({kind: 'outer'}), {kind: 'outer', color: '#000000', style: 'solid'});
  assert.throws(() => validateBorder({kind: 'diagonal'})); assert.throws(() => validateBorder({kind: 'all', color: 'blue'})); assert.throws(() => validateBorder({kind: 'all', style: 'wavy'}));
  assert.deepEqual(validateSheetSize({axis: 'column', index: 3, size: 1500}), {axis: 'column', index: 3, size: 1500});
  assert.throws(() => validateSheetSize({axis: 'column', index: MAX_COL, size: 1500})); assert.throws(() => validateSheetSize({axis: 'row', index: 0, size: 5}));
});
