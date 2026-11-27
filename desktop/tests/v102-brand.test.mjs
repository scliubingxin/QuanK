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
test('v1.0.4 收起态品牌：logo 36px 居中，压过 54px 的 !important 规则', () => {
  // 收起态必须用更高特异性的选择器（0,3,0）覆盖 `.sidebar .brand-mark{…!important}`（0,2,0）
  assert.match(css, /\.sidebar-collapsed \.sidebar \.brand-mark\{width:36px!important;height:36px!important\}/);
  assert.match(css, /\.sidebar-collapsed \.sidebar \.brand\{padding:10px 0 17px;gap:0;justify-content:center\}/);
  // 展开态 54px 规则保留 !important、内容原样
  assert.match(css, /\.sidebar \.brand-mark\{width:54px!important;height:54px!important;flex:none\}/);
  // 覆盖规则必须排在 54px 规则之后，否则同权重下会被压回 54px
  assert.ok(
    css.indexOf('.sidebar-collapsed .sidebar .brand-mark{width:36px') > css.indexOf('.sidebar .brand-mark{width:54px!important'),
    'collapsed override must come after the 54px rule'
  );
  // 文字在收起态隐藏且不占位（沿用既有规则）
  assert.match(css, /\.sidebar-collapsed \.brand>div,[^{]*\{display:none\}/);
  // 收起态 logo 宽度不大于 + 按钮宽度（实测 51px）减去 8px 的上限
  const width = css.match(/\.sidebar-collapsed \.sidebar \.brand-mark\{width:(\d+)px!important/);
  assert.ok(width, 'collapsed logo width rule missing');
  assert.ok(Number(width[1]) <= 51 - 8, `logo ${width[1]}px must not exceed + button width 51px − 8px`);
});
