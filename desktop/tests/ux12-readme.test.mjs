import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');

test('page heroes no longer reserve a 420px height (column flex basis)', async () => {
  const css = await read('../src/workbench.css');
  assert.match(css, /\.page-title\.page-hero>div:first-child\{flex:0 0 auto;width:100%\}/);
  assert.ok(css.lastIndexOf('[ux12]') > css.lastIndexOf('[ux11]'), 'loaded after the ux11 hero rules');
});

test('README uses the new introduction and the regenerated screenshots', async () => {
  const md = await read('../../README.md');
  for (const s of ['## 核心能力', '### 量化工作台：在本机运行你的策略', '### 深度研究与创作', '### 金融智能体与投研技能', '**v0.45**', '**v0.44**'])
    assert.ok(md.includes(s), s);
  for (const img of ['app-quant.png', 'app-quant-detail.png', 'app-skills.png', 'app-infographic.png', 'app-miniapps.png', 'app-agents.png', 'app-tasks.png'])
    assert.ok(md.includes(`docs/images/${img}`), img);
  assert.equal(md.split('## 核心能力').length, 2, 'one capability section'); // [v45]
  assert.ok(md.indexOf('## 下载与安装') < md.indexOf('## 核心能力') && md.indexOf('## 核心能力') < md.indexOf('## 更新记录'));
  const shots = await read('../scripts/readme-screenshots-app.mjs');
  const banned = new RegExp([['stock', 'widget'].join('-'), ['WorkBuddy', '2026-09'].join('/'), ['ind', 'gate'].join('_'), ['ml', 'meta'].join('_'), ['cost', 'harvest'].join('_'), '闸门前', '600438'].join('|'), 'i');
  for (const [n, t] of [['README', md], ['screenshot script', shots]]) assert.equal(banned.exec(t), null, n);
  for (const n of ['app-quant.png', 'app-quant-detail.png', 'app-skills.png', 'app-mcp.png', 'app-agents.png', 'app-infographic.png', 'app-miniapps.png']) assert.ok(shots.includes(`'${n}'`), n);
});

test('topbar names the quant page', async () => {
  const app = await read('../src/app.js');
  assert.match(app, /\['quant', 'trend', '量化'\]/);
  assert.match(app, /\['tools', 'activity', '浏览器与权限'\]/);
});
