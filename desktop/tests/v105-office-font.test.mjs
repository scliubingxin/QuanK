// [v1.0.4] Changing the font killed the editor: the toolbar sent the property name as plain
// "CharFontName", LibreOfficeKit threw inside postUnoCommand and the worker process died with it.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createMockSession } from '../src/office/mock-session.js';
import { UNO } from '../src/office/session-types.js';
import { createOfficeToolbar } from '../src/ui/office-toolbar.js';
import { CJK_FALLBACK, documentFontFamily, officeFontChoices } from '../src/shared/office-font-map.js';
import { validateUno } from '../src/shared/office-uno.js';
import { nativeWorker } from '../runtime/office-lok-native.mjs';

let dom, host, dispose;

beforeEach(() => {
  dom = new JSDOM('<main></main>');
  host = dom.window.document.querySelector('main');
  host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 840, height: 600 });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, Node: dom.window.Node,
    AbortController: dom.window.AbortController, CustomEvent: dom.window.CustomEvent,
    getComputedStyle: () => ({ getPropertyValue: () => '3' }),
    ResizeObserver: class { observe() {} disconnect() {} },
  });
  dispose = [];
});

afterEach(() => {
  for (const controller of dispose) controller.destroy();
  dom.window.close();
});

function mount(controller) {
  dispose.push(controller);
  host.append(controller.element);
  controller.refresh?.();
  return controller.element;
}

const FONTS = ['PingFang SC', 'Songti SC', 'Heiti SC', 'Kaiti SC', 'Arial', 'Times New Roman', 'Helvetica Neue'];

test('the font control sends the qualified CharFontName.FamilyName property', async () => {
  const session = createMockSession({ toScreen: rect => rect });
  session.setSelection({ kind: 'text', text: '选区', rects: [{ x: 80, y: 100, w: 180, h: 20 }] });
  const root = mount(createOfficeToolbar(session, 'impress', { fonts: FONTS }));
  const select = root.querySelector('select[aria-label="字体"]');
  const option = [...select.options].find(item => item.textContent === '宋体');
  assert.ok(option, '宋体 is offered when the engine has Songti SC');
  select.value = option.value;
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
  await Promise.resolve();
  const call = session.calls.at(-1);
  assert.deepEqual(call, { command: UNO.CharFontName, args: { 'CharFontName.FamilyName': 'Songti SC' } });
  assert.deepEqual(Object.keys(call.args), ['CharFontName.FamilyName']);
  assert.deepEqual(validateUno('.uno:CharFontName', call.args).args,
    { 'CharFontName.FamilyName': { type: 'string', value: 'Songti SC' } });
});

test('no source file sends the bare CharFontName property any more', async () => {
  const files = ['../src/ui/office-toolbar.js', '../src/ui/office-float-toolbar.js', '../src/office/doc/doc-ui.js',
    '../src/office/sheet/sheet-ui.js', '../src/office/office-canvas.js', '../src/office/ribbon-config.js'];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.ok(!/['"]CharFontName['"]\s*:/.test(source), file + ' still sends the bare CharFontName property');
  }
});

test('the worker turns a malformed argument name into invalid_input instead of a crash', () => {
  const guard = nativeWorker.slice(nativeWorker.indexOf('UNO_ARGS'), nativeWorker.indexOf('def run(p):'));
  assert.match(guard, /'.uno:CharFontName': \{'CharFontName\.FamilyName'\}/);
  assert.match(guard, /'.uno:FontHeight': \{'FontHeight\.Height'\}/);
  assert.match(nativeWorker, /reason='invalid_input'/);
  assert.match(nativeWorker.slice(nativeWorker.indexOf("elif op == 'uno':")),
    /if properties is not None and any\(key not in properties/);
  const branch = nativeWorker.slice(nativeWorker.indexOf("elif op == 'uno':"));
  assert.ok(branch.indexOf("reason='invalid_input'") < branch.indexOf("d.call('postUnoCommand'"),
    'the guard runs before the command is dispatched to LibreOfficeKit');
});

test('Chinese font names map to the installed macOS families', () => {
  assert.equal(documentFontFamily('宋体', FONTS), 'Songti SC');
  assert.equal(documentFontFamily('微软雅黑', FONTS), 'PingFang SC');
  assert.equal(documentFontFamily('黑体', FONTS), 'Heiti SC');
  assert.equal(documentFontFamily('Arial', FONTS), 'Arial');
  assert.equal(documentFontFamily('Times New Roman', FONTS), 'Times New Roman');
  assert.equal(documentFontFamily('Calibri', FONTS), null);
  assert.equal(documentFontFamily('Noto Sans CJK SC', FONTS), null);
  assert.equal(documentFontFamily('宋体', ['PingFang SC']), CJK_FALLBACK);
  assert.equal(documentFontFamily('宋体', []), 'Songti SC');
  assert.deepEqual(officeFontChoices(['Arial', 'Calibri', '宋体'], FONTS).map(choice => [choice.label, choice.family]),
    [['Arial', 'Arial'], ['宋体', 'Songti SC']]);
});

test('the font list comes from the families the engine reports', () => {
  const listed = (fonts) => {
    const root = mount(createOfficeToolbar(createMockSession({ toScreen: rect => rect }), 'impress', { fonts }));
    return [...root.querySelector('select[aria-label="字体"]').options].filter(item => !item.hidden).map(item => item.textContent);
  };
  assert.deepEqual(listed(FONTS), ['Arial', 'Times New Roman', '宋体', '微软雅黑']);
  assert.deepEqual(listed([]), ['Arial', 'Calibri', 'Times New Roman', 'Noto Sans CJK SC', '宋体', '微软雅黑'],
    'an engine that reports nothing must not leave the user with an empty list');
});
