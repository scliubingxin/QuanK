import {startLiveOfficeKit, waitForHostState} from '../helpers/office-live-ui.mjs';
// [excel] Live check of the spreadsheet editor operations against a real LibreOfficeKit (Calc).
// Run: WB_TEST_PYTHON=<python3> WB_TEST_OFFICE_DIRECTORY=<LibreOffice program dir> node --test tests/acceptance/office-sheet-live.mjs
// Every check is recorded; the test prints a JSON summary (SHEET-LIVE ...) and fails if any check failed.
import {officeDirectory, officePython} from '../helpers/office-kit-runtime.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import office from '../../runtime/vendor/office.cjs';
import {Store} from '../../core.mjs';
import {generateDocument} from '../../runtime/documents.mjs';
import {createDocumentService} from '../../services/documents.mjs';
import {createOfficeWorkspace} from '../../services/office-workspace.mjs';
import {axisRuns, MAX_COL, MAX_ROW, parseCellCursor} from '../../src/shared/office-sheet.js';

test('real XLSX: sheet info, typing, formulas, formats, borders, rows, freeze, filter, sizes, sheet tabs, dialog guard', {timeout: 120000}, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-sheet-live-')), store = new Store(dir); await store.load();
  const documents = createDocumentService({store});
  const rows = [['名称', '金额', '备注'], ['甲', 600, '保留'], ['乙', 900, '其他'], ['丙', 300, '']];
  const d = (await documents.importFile('Sheet live', 'xlsx', (await generateDocument('xlsx', JSON.stringify({sheets: [{name: 'Budget', rows}, {name: 'Second', rows: [['x']]}]}))).bytes)).document;
  const kit = createOfficeWorkspace({documents, directory: path.join(dir, 'kit'), runtime: async () => ({python: officePython, officeDirectory}), approve: async () => true, driver: o => startLiveOfficeKit({...o, timeoutMs: 120000})});
  const results = [];
  const check = async (name, fn) => { const t = Date.now(); try { const detail = await fn(); results.push({name, ok: true, ms: Date.now() - t, detail: detail ?? ''}); } catch (e) { results.push({name, ok: false, ms: Date.now() - t, error: String(e.message || e).slice(0, 300)}); } };
  const files = () => office.zip.unzipSync(documents.bytes(d.id, documents.read(d.id).revision).bytes);
  const text = (name) => new TextDecoder().decode(files()[name] || new Uint8Array());
  const sheetXml = (n = 1) => text('xl/worksheets/sheet' + n + '.xml');
  const sharedHas = s => text('xl/sharedStrings.xml').includes(s);
  try {
    const id = (await kit.open(d.id, 1)).sessionId;
    const shot = async () => kit.snapshot(id, {width: 800, height: 400, x: 0, y: 0, tileWidth: 12000, tileHeight: 6000});
    const op = (o, p) => kit.operation(id, o, p);
    const goto = ref => op('sheet_goto', {ref});

    await check('snapshot carries sheet info', async () => {
      const s = await shot();
      assert.ok(s.sheet, 'sheet field'); assert.ok(s.sheet.geometry?.columns?.sizes, 'column sizes'); assert.equal(s.sheet.tabs.length, 2);
      assert.ok(axisRuns(s.sheet.geometry.columns, MAX_COL)?.length && axisRuns(s.sheet.geometry.rows, MAX_ROW)?.length, 'geometry parses');
      assert.ok(parseCellCursor(s.sheet.cursor), 'cell cursor ' + s.sheet.cursor);
      return {address: s.sheet.address, cursor: s.sheet.cursor, cols: s.sheet.geometry.columns.sizes.slice(0, 40)};
    });
    await t.test('goto + typing + Enter commits and saves', async () => {
      const revision = documents.read(d.id).revision;
      await goto('D6'); await op('sheet_text', {text: '123'});
      let s = await shot(); assert.equal(s.sheet.editing, true, 'edit mode while typing');
      await op('sheet_key', {key: 'Enter'});
      s = await shot(); assert.equal(s.sheet.editing, false); assert.equal(s.sheet.address, 'D7');
      await waitForHostState(() => documents.read(d.id).revision > revision, 'Calc auto-save after Enter', 3_000);
      assert.match(sheetXml(), /r="D6"[^>]*>(?:<f[^>]*>[^<]*<\/f>)?<v>123<\/v>/);
    });
    await check('typing Chinese text', async () => {
      await goto('E6'); await op('sheet_text', {text: '中文备注'}); await op('sheet_key', {key: 'Tab'});
      assert.ok(sharedHas('中文备注') || sheetXml().includes('中文备注'));
      return (await shot()).sheet.address;
    });
    await check('formula bar input (cell_input) with formula', async () => {
      await goto('F6'); await op('cell_input', {text: '=D6*2', move: 'down'});
      const x = sheetXml(); assert.match(x, /r="F6"[^>]*><f[^>]*>[^<]*D6\*2[^<]*<\/f><v>246<\/v>/);
    });
    await check('blocked formula is refused before the worker', async () => {
      await assert.rejects(op('cell_input', {text: '=WEBSERVICE("http://127.0.0.1/")'}), /公式/);
    });
    await check('typed blocked formula is cancelled on commit', async () => {
      await goto('G6'); await op('sheet_text', {text: '=WEBSERVICE("http://127.0.0.1/")'});
      await assert.rejects(op('sheet_key', {key: 'Enter'}), /公式/);
      const s = await shot(); assert.equal(s.sheet.editing, false); assert.doesNotMatch(sheetXml(), /WEBSERVICE/);
    });
    await check('bold via legacy command reflects in states', async () => {
      await goto('D6'); await op('command', {command: '.uno:Bold'}); const s = await shot(); assert.equal(s.states['.uno:Bold'], 'true');
    });
    const unoCheck = (name, command, args, verify, ref = 'A1:C4') => check(name, async () => { await goto(ref); await op('uno', args ? {command, args} : {command}); return verify ? verify() : undefined; });
    await unoCheck('wrap text', '.uno:WrapText', null, () => assert.match(text('xl/styles.xml'), /wrapText="(?:true|1)"/));
    await unoCheck('horizontal center', '.uno:AlignHorizontalCenter', null, () => assert.match(text('xl/styles.xml'), /horizontal="center"/));
    await unoCheck('vertical middle', '.uno:AlignVCenter', null, () => assert.match(text('xl/styles.xml'), /vertical="center"/));
    await unoCheck('fill color', '.uno:BackgroundColor', {BackgroundColor: 0xFFEB3B}, () => assert.match(text('xl/styles.xml'), /FFFFEB3B/i));
    await unoCheck('font color', '.uno:Color', {Color: 0x1E88E5}, () => assert.match(text('xl/styles.xml'), /FF1E88E5/i));
    await unoCheck('font size', '.uno:FontHeight', {'FontHeight.Height': 14}, () => assert.match(text('xl/styles.xml'), /<sz val="14"/));
    await unoCheck('percent format', '.uno:NumberFormatPercent', null, () => assert.match(text('xl/styles.xml'), /formatCode="[^"]*%/), 'B2:B4');
    await unoCheck('thousands format', '.uno:NumberFormatThousands', null, () => assert.match(text('xl/styles.xml'), /formatCode="[^"]*#,##0/), 'B2:B4');
    await check('border outer dashed blue', async () => { await goto('A1:C4'); await op('sheet_border', {kind: 'outer', color: '#1E88E5', style: 'dashed'}); assert.match(text('xl/styles.xml'), /style="(?:dashed|mediumDashed|dashDot|hair)"/); });
    await check('border all thin black', async () => { await goto('A1:C4'); await op('sheet_border', {kind: 'all', color: '#000000', style: 'solid'}); assert.match(text('xl/styles.xml'), /<left style="thin"/); });
    await check('border none', async () => { await goto('A1:C4'); await op('sheet_border', {kind: 'none'}); return 'ok'; });
    await unoCheck('merge cells', '.uno:ToggleMergeCells', null, () => assert.match(sheetXml(), /<mergeCell ref="H1:I1"\/>/), 'H1:I1');
    await check('insert row above shifts data', async () => { await goto('A1'); await op('uno', {command: '.uno:InsertRowsBefore'}); assert.match(sheetXml(), /r="D7"[^>]*>(?:<f[^>]*>[^<]*<\/f>)?<v>123<\/v>/); });
    await check('insert column / delete column', async () => { await goto('A1'); await op('uno', {command: '.uno:InsertColumnsBefore'}); assert.match(sheetXml(), /r="E7"/); await op('uno', {command: '.uno:DeleteColumns'}); assert.match(sheetXml(), /r="D7"[^>]*>(?:<f[^>]*>[^<]*<\/f>)?<v>123<\/v>/); });
    await check('insert cell shift down', async () => { await goto('C2'); await op('uno', {command: '.uno:InsertCell', args: {Flags: 'V'}}); return 'ok'; });
    await check('freeze first row', async () => { await goto('A1'); await op('uno', {command: '.uno:FreezePanesRow', args: {Index: 1}}); assert.match(sheetXml(), /<pane [^>]*ySplit="1"[^>]*state="frozen"/); const s = await shot(); return s.states['.uno:FreezePanes']; });
    await check('unfreeze', async () => { await op('uno', {command: '.uno:FreezePanesRow', args: {Index: 0}}); await op('uno', {command: '.uno:FreezePanesColumn', args: {Index: 0}}); assert.doesNotMatch(sheetXml(), /state="frozen"/); return (await shot()).states['.uno:FreezePanesRow']; });
    await check('autofilter on header range', async () => { await goto('A2:C5'); await op('uno', {command: '.uno:DataFilterAutoFilter'}); assert.match(sheetXml(), /<autoFilter ref="/); });
    await check('column width via sheet_size', async () => { await op('sheet_size', {axis: 'column', index: 0, size: 3000}); const s = await shot(); assert.ok(axisRuns(s.sheet.geometry.columns, MAX_COL)[0].size >= 2900, s.sheet.geometry.columns.sizes.slice(0, 30)); assert.match(sheetXml(), /<col (?=[^>]*min="1")(?=[^>]*customWidth="(?:true|1)")[^>]*>/); });
    await check('row height via sheet_size', async () => { await op('sheet_size', {axis: 'row', index: 2, size: 900}); const s = await shot(); return s.sheet.geometry.rows.sizes.slice(0, 40); });
    await check('select whole column via goto', async () => { await goto('B1:B1048576'); const s = await shot(); return s.sheet.address; });
    await check('sort ascending (dialog guard)', async () => { await goto('B3:B5'); try { await op('uno', {command: '.uno:SortAscending'}); return 'sorted'; } catch (e) { assert.match(String(e.message), /对话框/); return 'dialog closed: ' + e.message; } });
    await check('snapshot still fine after dialog', async () => { const s = await shot(); assert.equal(s.sheet.dialogs, 0); });
    await check('sheet tab insert', async () => { await op('sheet_tab', {action: 'insert', index: 2, name: '新表'}); const s = await shot(); assert.deepEqual(s.parts, ['Budget', 'Second', '新表']); assert.equal(s.part, 2); });
    await check('sheet tab rename', async () => { await op('sheet_tab', {action: 'rename', index: 1, name: '第二页'}); const s = await shot(); assert.deepEqual(s.parts, ['Budget', '第二页', '新表']); assert.match(text('xl/workbook.xml'), /name="第二页"/); });
    await check('sheet tab move right', async () => { await op('sheet_tab', {action: 'move', index: 0, to: 2}); const s = await shot(); return s.parts; });
    await check('sheet tab copy', async () => { const before = (await shot()).parts.length; await op('sheet_tab', {action: 'copy', index: 0, to: 1}); const s = await shot(); assert.equal(s.parts.length, before + 1); return s.parts; });
    await check('sheet tab color', async () => { await op('sheet_tab', {action: 'color', index: 0, color: '#E53935'}); assert.match(text('xl/worksheets/sheet1.xml') + text('xl/worksheets/sheet2.xml'), /tabColor rgb="FFE53935"/i); });
    await check('sheet tab delete', async () => { const before = (await shot()).parts; await op('sheet_tab', {action: 'delete', index: before.length - 1}); const s = await shot(); assert.equal(s.parts.length, before.length - 1); return s.parts; });
    await check('switch sheet via part', async () => { await op('part', {part: 1}); const s = await shot(); assert.equal(s.part, 1); return s.sheet.address; });
    await check('undo', async () => { await op('command', {command: '.uno:Undo'}); return 'ok'; });
    await check('find (ExecuteSearch)', async () => { await op('part', {part: 0}); await op('uno', {command: '.uno:ExecuteSearch', args: {'SearchItem.SearchString': '乙', 'SearchItem.Backward': false, 'SearchItem.Command': 0}}); return (await shot()).sheet.address; });
    await check('shape insert command accepted', async () => { await op('uno', {command: '.uno:BasicShapes.rectangle'}); await op('sheet_key', {key: 'Escape'}); return 'ok'; });
  } finally {
    console.log('SHEET-LIVE ' + JSON.stringify(results, null, 1));
    await kit.shutdown(); await rm(dir, {recursive: true, force: true, maxRetries: 30, retryDelay: 100});
  }
  const failed = results.filter(r => !r.ok);
  assert.equal(failed.length, 0, failed.map(f => f.name + ': ' + f.error).join('\n'));
});
