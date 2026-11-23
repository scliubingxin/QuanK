// [v0.54.1] 右侧页签排版修复：容器查询、无 [object Object]、回复不暴露工具名。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { sanitizeDisplay } from '../src/ui/markdown.js';
import { summaryText } from '../src/shared/quant.js';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');

test('页签内容区与主区域使用 container-type: inline-size + 容器查询，不依赖窗口 media query', async () => {
  const css = await read('../src/workbench.css');
  assert.match(css, /\.pp-body,\.workspace\{container-type:inline-size;container-name:qkzone\}/);
  assert.match(css, /@container qkzone \(max-width:760px\)/);
  assert.match(css, /@container qkzone \(max-width:600px\)/);
  assert.match(css, /@container qkcard \(max-width:360px\)/);
  assert.match(css, /grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,300px\),1fr\)\)/);
  // 引擎卡占满宽度、不按窗口宽度留半边空白
  assert.match(css, /\.plaza-grid\.quant-top,\.pp-body \.plaza-grid\.quant-top\{grid-template-columns:minmax\(0,1fr\)!important\}/);
  // 窄卡片：数字两列不重叠、按钮两列整齐
  assert.match(css, /@container qkcard \(max-width:360px\)\{[\s\S]*\.quant-page \.quant-stock \.q-nums\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@container qkcard \(max-width:360px\)\{[\s\S]*\.quant-page \.quant-stock \.pc-actions\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  // 投研圆角搜索框、页签横向滚动
  assert.match(css, /\.rp-search\{display:flex;align-items:center[^}]*border-radius:999px/);
  assert.match(css, /\.pp-tabs\{[^}]*overscroll-behavior-x:contain/);
  // 市场行情指数卡：主区域变窄按容器 auto-fit，数字不截断
  assert.match(css, /@container qkzone \(max-width:1100px\)\{[\s\S]*\.mk-idx-row\{grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,180px\),1fr\)\)\}/);
  assert.match(css, /@container qkzone \(max-width:620px\)\{[\s\S]*\.mk-idx b\{font-size:17px\}/);

  // MCP 卡片名称两行不截断、分类标签不折行
  assert.match(css, /\.preset-card \.pc-title h3\{white-space:normal/);
  assert.match(css, /\.plaza-chip\{white-space:nowrap\}/);
});

test('任何地方都不出现 [object Object]：escape / rich / summaryText 三层防护', async () => {
  const md = await read('../src/ui/markdown.js', 'utf8');
  assert.match(md, /if \(raw === "\[object Object\]"\) return "";/);
  assert.ok(md.includes("out = out.replace(/\\[object Object\\]/g, \"\")"), "rich sanitizer removes [object Object]");
  assert.equal(sanitizeDisplay('结果 [object Object] 结束'), '结果  结束');
  assert.equal(sanitizeDisplay('分数正常'), '分数正常');
  assert.equal(summaryText('[object Object]'), '');
  assert.equal(summaryText({ summary: '[object Object]', text: '信号结果：买入' }), '信号结果：买入');
  assert.equal(summaryText({ n: 3, rate: 0.42 }), 'n：3 · rate：0.42');
});

test('对话回复不暴露内部工具名 (app_xxx / （app_xxx）)', () => {
  assert.equal(sanitizeDisplay('立即生成今日简报 (app_briefing_generate)，把内容汇总进来'), '立即生成今日简报 ，把内容汇总进来');
  assert.equal(sanitizeDisplay('已保存（app_memory_add）完成'), '已保存完成');
  assert.equal(sanitizeDisplay('查看量化引擎 app_quant_status'), '查看量化引擎 app_quant_status'); // 无括号的普通文字不动
  assert.equal(sanitizeDisplay('调用 connector_search 检索'), '调用 connector_search 检索');
  const conv = readFile(new URL('../services/conversation.mjs', import.meta.url), 'utf8');
  conv.then(c => assert.match(c, /不要暴露内部工具名/));
});

test('布局在 600/800/1000/1400px 容器宽度下均有 auto-fit 网格兜底', async () => {
  const css = await read('../src/workbench.css');
  // auto-fit + min(100%,300px) 在 600 单列、800 两列、1000 三列、1400 四列自然切换
  assert.ok(/minmax\(min\(100%,300px\),1fr\)/.test(css), 'auto-fit grid present');
  // 原固定 3 列规则被后面的 auto-fit !important 覆盖（同一选择器、后出现）
  const fixedIdx = css.indexOf('.quant-page .plaza-grid.q-pool-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important');
  const autoIdx = css.indexOf('.quant-page .plaza-grid.q-pool-grid,.quant-page .q-reports .plaza-grid,');
  assert.ok(autoIdx > fixedIdx, 'auto-fit rule appears after the fixed 3-column rule so it wins');
  const dom = new JSDOM('<div class="page quant-page"><div class="plaza-grid q-pool-grid"></div></div>');
  assert.ok(dom.window.document.querySelector('.plaza-grid.q-pool-grid'), 'pool grid markup renders');
});

test('工作台首页按主区域容器宽度自适应：窄时去插画、标题不超过两行、底栏与快捷按钮不重叠', async () => {
  const css = await read('../src/workbench.css');
  const i = css.indexOf('[v0.54.1-c]');
  assert.ok(i > 0, 'home container block present');
  const block = css.slice(i);
  assert.match(block, /@container qkzone \(max-width:1000px\)\{[\s\S]*\.qk-hero-art\{display:none\}/);
  assert.match(block, /\.qk-hero h1\{font-size:clamp\(22px,4\.4cqi,32px\)/);
  assert.match(block, /\.qk-hero \.suggestions\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(118px,1fr\)\)/);
  assert.match(block, /\.composer-bar\{display:flex;flex-wrap:wrap/);
  assert.match(block, /\[data-composer-trigger="model"\] span:first-child\{max-width:none/);
  // 宽主区域（≥1000px）沿用原样式：原 hero 规则未被改写
  assert.match(css, /\.qk-hero h1\{font-family:inherit;font-size:36px/);
  assert.match(css, /\.qk-hero-art\{position:absolute;right:-10px;top:-6px;width:min\(46%,560px\)/);
});
