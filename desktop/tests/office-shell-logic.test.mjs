import test from 'node:test';
import assert from 'node:assert/strict';
import { TABS, visibleTabs, percentFromScale, scaleFromPercent, pageLabel, clampNotesHeight, floatToolsVisible } from '../src/office/shell-logic.js';
import { icon, iconNames } from '../src/office/icons/icons.js';

test('tabs follow the target screenshots', () => {
  assert.deepEqual(TABS.map(t => t.label), ['开始', '插入', '美化', '切换', '动画', '放映', '视图']);
  assert.deepEqual(visibleTabs('master').map(t => t.label), ['开始', '插入', '切换', '视图']);
  assert.equal(visibleTabs('normal').length, 7);
});
test('zoom percent and legacy scale convert both ways', () => {
  assert.equal(percentFromScale(15), 100); assert.equal(percentFromScale(20), 75); assert.equal(percentFromScale(10), 150);
  assert.equal(scaleFromPercent(100), 15); assert.equal(scaleFromPercent(75), 20); assert.equal(scaleFromPercent(50), 30);
  assert.equal(scaleFromPercent(200), 8); assert.equal(scaleFromPercent(400), null); assert.equal(scaleFromPercent('x'), null);
  assert.equal(percentFromScale(0), 100);
});
test('page label is 1-based and clamped', () => {
  assert.equal(pageLabel(9, 31), '第 10 页/共 31 页'); assert.equal(pageLabel(0, 0), '第 0 页/共 0 页'); assert.equal(pageLabel(99, 5), '第 5 页/共 5 页');
});
test('notes height is clamped', () => {
  assert.equal(clampNotesHeight(10, 800), 56); assert.equal(clampNotesHeight(900, 800), 480); assert.equal(clampNotesHeight(200, 800), 200); assert.equal(clampNotesHeight(NaN, 800), 56);
});
test('floating selection tools show only with a selection, draft or manual edit', () => {
  assert.equal(floatToolsVisible({ selection: '点击或拖选正文；也可先全选' }), false);
  assert.equal(floatToolsVisible({ selection: '当前选区：abc' }), true);
  assert.equal(floatToolsVisible({ draft: 'x' }), true); assert.equal(floatToolsVisible({ manual: true }), true);
});
test('icons are inline 1.5px line svgs', () => {
  assert.ok(iconNames.length > 20);
  for (const n of iconNames) { const s = icon(n); assert.match(s, /^<svg [^>]*stroke-width="1.5"/); assert.ok(!/https?:/.test(s)); }
  assert.equal(icon('nope'), '');
});
