// [v1.0.7] The font menu offers faces that visibly change Chinese text.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {officeFontMenu} from '../src/shared/office-font-map.js';

const mac = ['PingFang SC', 'Hiragino Sans GB', 'Heiti SC', 'STHeiti', 'Songti SC', 'Kaiti SC', 'STFangsong', 'Arial', 'Helvetica Neue', 'Times New Roman', 'Georgia', 'Menlo'];

test('Chinese faces are offered under Chinese names and map to installed families', () => {
  const menu = officeFontMenu(mac);
  const byLabel = Object.fromEntries(menu.map(c => [c.label, c.family]));
  assert.equal(byLabel['苹方'], 'PingFang SC');
  assert.equal(byLabel['宋体'], 'Songti SC');
  assert.equal(byLabel['楷体'], 'Kaiti SC');
  assert.equal(byLabel['Times New Roman'], 'Times New Roman');
  assert.ok(menu.findIndex(c => c.label === '苹方') < menu.findIndex(c => c.label === 'Arial'), 'Chinese faces come first');
});

test('only installed families are offered, each family once', () => {
  const menu = officeFontMenu(['PingFang SC', 'Arial', 'Liberation Serif']);
  assert.deepEqual(menu.map(c => c.label), ['苹方', 'Arial', 'Times New Roman']);
  assert.equal(menu.find(c => c.label === 'Times New Roman').family, 'Liberation Serif');
  assert.equal(new Set(menu.map(c => c.family)).size, menu.length);
});

test('the toolbar uses the new menu', () => {
  const src = readFileSync(new URL('../src/ui/office-toolbar.js', import.meta.url), 'utf8');
  assert.match(src, /const fontChoices = officeFontMenu\(fonts\);/);
});
