import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/workbench.css', import.meta.url), 'utf8');
test('v1.0.2 侧栏品牌：英文 QuankSight 在上、中文「量见」在下，logo 54px', () => {
  assert.match(app, /<span class="brand-en">QuankSight<\/span><span class="brand-cn"><b>量见/);
  // [v1.0.3] 中文品牌与标语合并为一行，不再单独一行 <small>
  assert.match(app, /<span class="brand-cn"><b>量见<\/b><i class="brand-dot">·<\/i>量化工作，见机即获<\/span>/);
  assert.doesNotMatch(app, /<small>量化工作，见机即获<\/small>/);
  assert.doesNotMatch(app, /<small>量见 · 量化工作，见机即获<\/small>/);
  assert.match(css, /\.sidebar \.brand-cn\{[^}]*white-space:nowrap/);
  assert.match(css, /\.sidebar \.brand-dot\{margin:0 4px;font-style:normal/);
  assert.match(css, /\.sidebar \.brand-mark\{width:54px!important;height:54px!important/);
});
test('v1.0.3 侧栏加宽到 248、品牌严格两行、版本只进 title', () => {
  assert.match(css, /\.sidebar\{width:248px/);
  assert.match(css, /\.sidebar \.brand\{display:flex;align-items:center;gap:8px;padding:12px 6px 22px\}/);
  assert.match(css, /\.sidebar \.brand-cn\{[^}]*font-size:12px[^}]*white-space:nowrap/);
  // 侧栏里不得再有可见的版本徽标
  assert.doesNotMatch(app, /<span class="brand-ver"/);
  const brand = app.slice(app.indexOf('<div class="brand"'), app.indexOf('<button class="new"'));
  assert.doesNotMatch(brand, /brand-ver/, 'no badge inside the sidebar brand block');
  assert.equal((brand.match(/<small/g) || []).length, 0, 'brand must stay two lines: no <small> tagline');
  assert.match(brand, /<b>量见<\/b><i class="brand-dot">·<\/i>量化工作，见机即获/);
});
test('v1.0.3 工作台胶囊显示新标语', () => {
  const home = readFileSync(new URL('../src/ui/home-dashboard.js', import.meta.url), 'utf8');
  assert.match(home, /QuankSight · 量化工作，见机即获/);
  assert.doesNotMatch(home, /QuankSight · 量化工作，一键搞定/);
});
