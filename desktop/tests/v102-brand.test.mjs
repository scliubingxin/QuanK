import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/workbench.css', import.meta.url), 'utf8');
// 首行标记：版本号作为 sup 嵌在 .brand-en 内；appVersion 为空时不渲染
const BRAND_EN = '<span class="brand-en">QuankSight${appVersion ? `<sup class="brand-ver">v${escape(appVersion)}</sup>` : \'\'}</span>';
test('v1.0.2 侧栏品牌：英文 QuankSight 在上、中文「量见」在下，logo 54px', () => {
  assert.match(app, /<span class="brand-en">QuankSight[\s\S]{0,90}?<\/span><span class="brand-cn"><b>量见/);
  // [v1.0.3] 中文品牌与标语合并为一行，不再单独一行 <small>
  assert.match(app, /<span class="brand-cn"><b>量见<\/b><i class="brand-dot">·<\/i>量化工作，见机即获<\/span>/);
  assert.doesNotMatch(app, /<small>量化工作，见机即获<\/small>/);
  assert.doesNotMatch(app, /<small>量见 · 量化工作，见机即获<\/small>/);
  assert.match(css, /\.sidebar \.brand-cn\{[^}]*white-space:nowrap/);
  assert.match(css, /\.sidebar \.brand-dot\{margin:0 4px;font-style:normal/);
  assert.match(css, /\.sidebar \.brand-mark\{width:54px!important;height:54px!important/);
});
test('v1.0.3 侧栏加宽到 248、品牌严格两行，版本号在首行且 title 保留', () => {
  assert.match(css, /\.sidebar\{width:248px/);
  assert.match(css, /\.sidebar \.brand\{display:flex;align-items:center;gap:8px;padding:12px 6px 22px\}/);
  assert.match(css, /\.sidebar \.brand-cn\{[^}]*font-size:12px[^}]*white-space:nowrap/);
  // [v1.0.5] 版本号回到首行（.brand-en 内的小字 sup），但仍不是独立一行
  assert.ok(app.includes(BRAND_EN), 'brand-en carries the version sup');
  const brand = app.slice(app.indexOf('<div class="brand"'), app.indexOf('<button class="new"'));
  assert.match(brand, /<sup class="brand-ver">/, 'version lives inside the brand-en line');
  assert.doesNotMatch(brand, /<span class="brand-ver">/, 'no standalone badge element');
  assert.equal((brand.match(/<small/g) || []).length, 0, 'brand must stay two lines: no <small> tagline');
  assert.match(brand, /<b>量见<\/b><i class="brand-dot">·<\/i>量化工作，见机即获/);
});
test('v1.0.3 工作台胶囊显示新标语', () => {
  const home = readFileSync(new URL('../src/ui/home-dashboard.js', import.meta.url), 'utf8');
  assert.match(home, /QuankSight · 量化工作，见机即获/);
  assert.doesNotMatch(home, /QuankSight · 量化工作，一键搞定/);
});
test('v1.0.5 收起态品牌：logo 28px 居中，压过展开态 54px 的 !important 规则', () => {
  // 收起态必须用更高特异性的选择器（0,3,0）覆盖 `.sidebar .brand-mark{…!important}`（0,2,0）
  assert.match(css, /\.sidebar-collapsed \.sidebar \.brand-mark\{width:28px!important;height:28px!important\}/);
  assert.match(css, /\.sidebar-collapsed \.sidebar \.brand\{padding:10px 0 17px;gap:0;justify-content:center\}/);
  // 展开态 54px 规则保留 !important、内容原样
  assert.match(css, /\.sidebar \.brand-mark\{width:54px!important;height:54px!important;flex:none\}/);
  // 覆盖规则必须排在 54px 规则之后，否则同权重下会被压回 54px
  assert.ok(
    css.indexOf('.sidebar-collapsed .sidebar .brand-mark{width:28px') > css.indexOf('.sidebar .brand-mark{width:54px!important'),
    'collapsed override must come after the 54px rule'
  );
  // 文字在收起态隐藏且不占位（沿用既有规则）
  assert.match(css, /\.sidebar-collapsed \.brand>div,[^{]*\{display:none\}/);
  // 收起态 logo 宽度不大于 + 按钮宽度（实测 51px）减去 8px 的上限
  const width = css.match(/\.sidebar-collapsed \.sidebar \.brand-mark\{width:(\d+)px!important/);
  assert.ok(width, 'collapsed logo width rule missing');
  assert.equal(Number(width[1]), 28, 'collapsed logo is 28px');
  assert.ok(Number(width[1]) <= 51 - 8, `logo ${width[1]}px must not exceed + button width 51px − 8px`);
  // ≤980px 自动收起（媒体查询路径）同样 28px，且下内边距与 + 按钮外边距对齐
  assert.match(css, /@media\(max-width:980px\)\{\s*\.sidebar \.brand\{padding:10px 7px 17px!important\}\s*\.sidebar \.brand \.brand-mark\{width:28px!important;height:28px!important\}/);
});

test('v1.0.5 展开态首行显示版本号：与 QuankSight 同一行，品牌仍是两行', () => {
  assert.ok(app.includes(BRAND_EN), 'brand-en carries the version sup');
  const brand = app.slice(app.indexOf('<div class="brand"'), app.indexOf('<button class="new"'));
  const en = brand.indexOf('<span class="brand-en">'), ver = brand.indexOf('<sup class="brand-ver">'), cn = brand.indexOf('<span class="brand-cn">');
  // 版本号在 .brand-en 内、.brand-cn 之前：属于首行，不另起一行
  assert.ok(en >= 0 && ver > en && cn > ver, 'version must sit inside .brand-en, before .brand-cn');
  assert.equal((brand.match(/<sup/g) || []).length, 1, 'exactly one version element');
  // 两行结构：首行 .brand-en（锁定不换行）+ 次行 .brand-cn，没有第三行的载体
  assert.equal((brand.match(/<small/g) || []).length, 0, 'no <small> line');
  assert.equal((brand.match(/<br/g) || []).length, 0, 'no hard line break');
  assert.match(css, /\.sidebar \.brand-en\{font-size:20px;[^}]*white-space:nowrap\}/);
  // 样式：10px / 600 / #8c95b5 / margin-left 4px / 无字间距 / 无底色胶囊
  assert.match(css, /\.sidebar \.brand-ver\{font-size:10px;font-weight:600;color:#8c95b5;margin-left:4px;letter-spacing:0;/);
  // 收起态（.sidebar-collapsed 与 ≤980 自动收起）隐藏版本号；窄窗口放不下时也隐藏
  assert.match(css, /\.sidebar-collapsed \.brand>div,[^{]*\{display:none\}/);
  assert.match(css, /\.sidebar \.brand-ver\{display:none\}/);
  // title 与设置页底部版本号保留
  assert.match(app, /title="QuankSight v\$\{escape\(appVersion\)\}"/);
  assert.match(app, /<p class="settings-version">版本 v\$\{escape\(appVersion\)\}<\/p>/);
});
