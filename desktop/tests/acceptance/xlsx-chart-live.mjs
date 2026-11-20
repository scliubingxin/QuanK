// [ux9] Live check: an xlsx with native charts and a picture opens in openpyxl (Excel's object model) and in the
// bundled document engine (converted to PDF). Run: WB_TEST_OFFICE_DIRECTORY=<engine program dir> node --test tests/acceptance/xlsx-chart-live.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateDocument } from '../../runtime/documents.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
test('xlsx charts open in openpyxl and the document engine', {timeout: 240000}, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-xlsx-chart-'));
  try {
    const rows = [['月份', '营收', '成本'], ...Array.from({length: 12}, (_, i) => [`${i + 1}月`, 100 + i * 7, 60 + i * 3])];
    const spec = {sheets: [{name: '经营', rows, charts: [{type: 'column', title: '月度营收与成本', range: 'A1:C13'}, {type: 'line', title: '营收趋势', range: 'A1:B13', anchor: 'E20'}, {type: 'pie', title: '一季度营收', categories: 'A2:A4', series: [{name: '营收', values: 'B2:B4'}], anchor: 'N2'}], images: [{imageId: 'i1', anchor: 'N20', width: 80}]}]};
    const r = await generateDocument('xlsx', JSON.stringify(spec), {images: {i1: {base64: PNG, width: 1, height: 1}}});
    const file = path.join(dir, 'charts.xlsx');
    await writeFile(file, r.bytes);
    const py = process.env.WB_TEST_PYTHON_OPENPYXL || 'python3';
    const out = execFileSync(py, ['-c', 'import sys\nfrom openpyxl import load_workbook\nw=load_workbook(sys.argv[1]);s=w["经营"]\nprint(len(s._charts), s["B13"].value)', file], {encoding: 'utf8'}).trim();
    assert.equal(out, '3 177', 'openpyxl sees 3 charts and the data');
    const engine = process.env.WB_TEST_OFFICE_DIRECTORY;
    if (!engine) return;
    execFileSync(path.join(engine, 'soffice'), ['--headless', '--norestore', `-env:UserInstallation=file://${dir}/profile`, '--convert-to', 'pdf', '--outdir', dir, file], {timeout: 180000, stdio: 'ignore'});
    const pdf = (await readdir(dir)).find(n => n.endsWith('.pdf'));
    assert.ok(pdf, 'engine converted the workbook');
    assert.ok((await stat(path.join(dir, pdf))).size > 8000, 'PDF contains the drawn charts');
  } finally { await rm(dir, {recursive: true, force: true, maxRetries: 30, retryDelay: 100}); }
});
