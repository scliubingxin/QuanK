// [v1.0.7] Office edit window: close card titles are real text, 取消 keeps the window, the caret is dark and
// drawn at once on click.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('window decision cards get their title as the first argument', () => {
  const src = read('src/office/window.js');
  assert.equal((src.match(/decision\(cards, /g) || []).length, 0);
  assert.match(src, /function decision\(title, options, choose\)/);
  assert.match(src, /decision\(payload\?\.card\?\.message \|\| '有未保存修改'/);
});

test('取消 keeps the window and 放弃 cannot hang the close', () => {
  const src = read('main/office-edit-windows.mjs');
  const body = src.slice(src.indexOf('const done = resolve =>'), src.indexOf("decisions.set(token, done)"));
  assert.match(body, /if \(resolve === 'cancel'\) return;/);
  assert.ok(body.indexOf("resolve === 'cancel'") < body.indexOf('safe(w, \'destroy\')'));
  assert.match(body, /Promise\.race\(\[binding\.view\?\.session\?\.reload\(\)/);
});

test('caret: dark, 2px, blinking, drawn on pointer down before the engine answers', () => {
  const src = read('src/office/office-canvas.js');
  assert.match(src, /qk-office-caret/);
  assert.match(src, /#1f2a44/);
  assert.match(src, /caret\.animate\(/);
  assert.match(src, /rect\.w <= 2\*scale\(\)\) continue;/);
  const begin = src.slice(src.indexOf('function beginPointer'), src.indexOf("sheet.addEventListener('pointerdown',beginPointer)"));
  assert.match(begin, /predicted:true/);
  assert.ok(begin.indexOf('input.focus') < begin.indexOf('renderOverlay()'), 'focus before drawing so the caret shows');
});
