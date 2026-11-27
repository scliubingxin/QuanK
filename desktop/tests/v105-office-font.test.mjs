// [v1.0.4] Changing the font killed the editor: the toolbar sent the property name as plain
// "CharFontName", LibreOfficeKit threw inside postUnoCommand and the worker process died with it.
// This test is static: it reads sources and exercises the pure mapping helpers, no engine is started.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { CJK_FALLBACK, SERIF_CJK, documentFontFamily, officeFontChoices } from '../src/shared/office-font-map.js';
import { validateUno } from '../src/shared/office-uno.js';
import { nativeWorker } from '../runtime/office-lok-native.mjs';

const read = file => readFile(new URL(file, import.meta.url), 'utf8');
// The families the slimmed engine really reports on this machine (407 families, PingFang directory only).
const ENGINE = ['PingFang SC', 'Songti SC', 'Heiti SC', 'Kaiti SC', 'STFangsong', 'Arial', 'Times New Roman', 'Helvetica Neue'];

test('the toolbar sends the qualified CharFontName.FamilyName argument', async () => {
  const toolbar = await read('../src/ui/office-toolbar.js');
  assert.match(toolbar, /controls\.values\(UNO\.CharFontName, '字体', null, 'CharFontName\.FamilyName',/);
  const choice = officeFontChoices(['宋体', '微软雅黑'], ENGINE)[0];
  assert.deepEqual(validateUno('.uno:CharFontName', { 'CharFontName.FamilyName': choice.family }).args,
    { 'CharFontName.FamilyName': { type: 'string', value: choice.family } });
});

test('no source file sends the bare CharFontName property any more', async () => {
  for (const file of ['../src/ui/office-toolbar.js', '../src/ui/office-float-toolbar.js',
    '../src/office/doc/doc-ui.js', '../src/office/sheet/sheet-ui.js', '../src/office/office-canvas.js',
    '../src/office/ribbon-config.js', '../src/shared/office-uno.js']) {
    const source = await read(file);
    assert.ok(!/['"]CharFontName['"]\s*:/.test(source), file + ' still sends the bare CharFontName property');
  }
});

test('the worker rejects a malformed argument name instead of aborting the process', () => {
  const guard = nativeWorker.slice(nativeWorker.indexOf('UNO_ARGS'), nativeWorker.indexOf('def run(p):'));
  assert.match(guard, /'\.uno:CharFontName': \{'CharFontName\.FamilyName'\}/);
  assert.match(guard, /'\.uno:FontHeight': \{'FontHeight\.Height'\}/);
  assert.match(guard, /'\.uno:Color': \{'Color'\}/);
  assert.match(nativeWorker, /reason='invalid_input'/);
  const branch = nativeWorker.slice(nativeWorker.indexOf("elif op == 'uno':"));
  assert.ok(branch.indexOf("reason='invalid_input'") < branch.indexOf("d.call('postUnoCommand'"),
    'the guard runs before the command reaches LibreOfficeKit');
});

test('Chinese font names map to families the engine has', () => {
  assert.equal(documentFontFamily('微软雅黑', ENGINE), 'PingFang SC');
  assert.equal(documentFontFamily('黑体', ENGINE), 'Heiti SC');
  assert.equal(documentFontFamily('楷体', ENGINE), 'Kaiti SC');
  assert.equal(documentFontFamily('仿宋', ENGINE), 'STFangsong');
  assert.equal(documentFontFamily('Arial', ENGINE), 'Arial');
  assert.equal(documentFontFamily('Times New Roman', ENGINE), 'Times New Roman');
  // A serif request never falls back to a sans family, and Latin fonts that are absent are dropped.
  assert.equal(documentFontFamily('宋体', ['PingFang SC']), null);
  assert.equal(documentFontFamily('Calibri', ENGINE), null);
  assert.equal(documentFontFamily('Noto Sans CJK SC', ENGINE), null);
});

test('宋体 is hidden until a serif CJK family is installed', () => {
  assert.deepEqual(SERIF_CJK, ['Noto Serif CJK SC', 'Noto Serif CJK', 'Noto Serif SC']);
  // This engine has no serif CJK family, so the option disappears instead of silently doing nothing.
  assert.equal(documentFontFamily('宋体', ENGINE), null);
  assert.equal(documentFontFamily('宋体', []), null);
  // Where one is installed, 宋体 maps to it rather than to a sans face.
  assert.equal(documentFontFamily('宋体', ['Noto Serif CJK SC', ...ENGINE]), 'Noto Serif CJK SC');
});

test('the offered list contains only fonts the engine can apply', () => {
  const choices = officeFontChoices(['Arial', 'Calibri', 'Times New Roman', 'Noto Sans CJK SC', '宋体', '微软雅黑'], ENGINE);
  assert.deepEqual(choices.map(choice => [choice.label, choice.family]),
    [['Arial', 'Arial'], ['Times New Roman', 'Times New Roman'], ['微软雅黑', 'PingFang SC']]);
  for (const choice of choices) {
    assert.ok(ENGINE.includes(choice.family) || choice.family === CJK_FALLBACK, choice.family + ' is not installed');
    assert.ok(!/^宋体$/.test(choice.label) || choice.family.startsWith('Noto Serif'), '宋体 needs a serif family');
  }
});
