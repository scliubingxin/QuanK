import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { presetCatalog, bindPresetFilters } from '../src/ui/preset-catalog.js';
import { skillsPage, mcpPage, iconColor, iconText } from '../src/ui/capability-library.js';
import { capabilityPresets } from '../runtime/capability-presets.mjs';
import { tableFromGrid, inferColumns, normalizeSpec } from '../src/shared/dashboard.js';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');

test('skill plaza: hero search, live counts, category chips, my skills above the catalogue', () => {
  const state = {capabilityPresets: capabilityPresets(), skillPackages: [{id: 's1', name: 'my-<b>skill</b>', description: '整理周报', enabled: true, files: [{}], bytes: 2048}]};
  const doc = new JSDOM(skillsPage(state)).window.document;
  bindPresetFilters(doc);
  assert.match(doc.querySelector('.plaza-hero h1').textContent, /金融工作的常用方法/);
  assert.equal(doc.querySelector('input').getAttribute('aria-label'), '搜索预置技能', 'the hero search is the first input');
  assert.deepEqual([...doc.querySelectorAll('.plaza-stats b')].map(b => b.textContent), ['32', '1', '1']);
  const mine = doc.querySelector('.mine-card');
  assert.equal(mine.querySelector('h3').textContent, 'my-<b>skill</b>');
  assert.ok(doc.querySelector('[data-action="uploadSkill"]') && doc.querySelector('[data-action="toggleSkill"][data-id="s1"]'));
  assert.equal(doc.querySelectorAll('.preset-card').length, 32);
  const chips = [...doc.querySelectorAll('[data-preset-chip]')];
  assert.equal(chips[0].textContent, '全部');
  const office = chips.find(c => c.dataset.presetChip && doc.querySelector(`.preset-card[data-preset-kind="${c.dataset.presetChip}"]`));
  office.dispatchEvent(new doc.defaultView.Event('click'));
  const visible = [...doc.querySelectorAll('.preset-card')].filter(c => !c.hidden);
  assert.ok(visible.length > 0 && visible.every(c => c.dataset.presetKind === office.dataset.presetChip));
  assert.ok(office.classList.contains('on') && !chips[0].classList.contains('on'));
  assert.equal(mine.hidden, false, 'category chips do not hide my own skills');
  const s = doc.querySelector('[data-preset-search]'); s.value = '周报'; s.dispatchEvent(new doc.defaultView.Event('input'));
  assert.equal(mine.hidden, false);
  s.value = 'zzzz-none'; s.dispatchEvent(new doc.defaultView.Event('input'));
  assert.equal(mine.hidden, true); assert.equal(doc.querySelector('[data-preset-empty]').hidden, false);
  for (const card of doc.querySelectorAll('.preset-card')) assert.ok(card.querySelector('.pc-icon') && card.querySelector('.pc-tags') && card.querySelector('.pc-foot'));
  assert.ok(doc.querySelector('[data-action="addPresetSkill"]').textContent === '添加技能');
});

test('MCP plaza: connection cards keep the tested-tools status and actions; templates never claim connected', () => {
  const state = {capabilityPresets: capabilityPresets(), mcpConnections: [{id: 'm1', name: 'Context7', url: 'https://mcp.context7.com/mcp', enabled: true, auth: 'bearer', hasToken: true, lastTest: {status: 'succeeded', tools: [{name: 'q', description: 'd'}]}}]};
  const html = mcpPage(state, new Set());
  const doc = new JSDOM(html).window.document;
  assert.match(doc.querySelector('.plaza-hero h1').textContent, /接入金融数据与资讯/);
  assert.match(doc.querySelector('.mine-card').textContent, /上次发现 1 项工具/);
  assert.deepEqual([...doc.querySelectorAll('.plaza-stats b')].map(b => b.textContent), ['13', '1', '1']);
  assert.ok(['editMcp', 'testMcp', 'removeMcp'].every(a => doc.querySelector(`[data-action="${a}"][data-id="m1"]`)));
  assert.equal(doc.querySelectorAll('.preset-card').length, 13);
  assert.ok(html.includes('未配置、未测试') && !html.includes('已连接'));
  assert.equal(doc.querySelector('input').getAttribute('aria-label'), '搜索预置MCP');
  const busy = new JSDOM(mcpPage(state, new Set(['m1']))).window.document;
  assert.ok(busy.querySelector('[data-action="cancelMcpTest"]') && busy.querySelector('[data-action="testMcp"]').disabled);
  const empty = new JSDOM(mcpPage({}, new Set())).window.document;
  assert.match(empty.body.textContent, /还没有连接器/); assert.ok(empty.querySelector('[data-action="newMcp"]'));
  assert.equal(iconText('willbuddy-office-report'), 'O'); assert.equal(iconText('知行PPT'), '知');
  assert.match(iconColor('a'), /^#[0-9A-F]{6}$/i); assert.equal(iconColor('a'), iconColor('a'));
  assert.ok(!presetCatalog('skills', {capabilityPresets: {skills: [{id: 'x', title: '<img src=x onerror=1>', description: '', category: 'c', sha256: 's', fileCount: 1, source: 's'}], checkedDate: ''}}).includes('<img'));
});

test('dashboard tables: a merged title row above the header and long note rows are skipped', () => {
  const grid = [['隆基大模型IT赋能平台 · 智能体使用分析与迁移评估'], ['指标', '数值', '单位', '说明'], ['智能体总数', 120, '个', '平台实测'], ['知识库总数', 202, '个', ''], ['文档总数', 18804, '个', ''],
    ['4. 单个智能体工作量＝配置重建（简单 1 / 中等 2.5 / 复杂 5 人天）＋能力对接（知识库 +1、MCP/HTTP +1）']];
  const t = tableFromGrid(grid);
  assert.deepEqual(t.columns, ['指标', '数值', '单位', '说明']);
  assert.equal(t.rows.length, 3);
  assert.deepEqual(tableFromGrid([['x', 'x', ''], [1, 2, 3]]).columns, ['x', 'x_', '列3'], 'ordinary headers unchanged');
  assert.deepEqual(tableFromGrid([['标题'], ['a'], ['b']]).columns, ['标题'], 'single-column sheets keep their first row');
  const cols = inferColumns(t.columns, t.rows);
  const spec = normalizeSpec({title: 'x', filters: [{column: '说明'}, {column: '单位'}, {column: '指标'}], charts: [{type: 'table', title: 't', columns: ['指标']}]}, cols, 'x');
  assert.deepEqual(spec.filters.map(f => f.column), ['单位', '指标'].filter(c => cols.find(k => k.name === c).distinct >= 2), 'filters only on short categorical columns');
  const long = inferColumns(['备注'], Array.from({length: 5}, (_, i) => ['这是一段很长的说明文字，用来解释口径和计算方法，不适合作为筛选条件' + i]));
  assert.deepEqual(normalizeSpec({title: 'x', filters: [{column: '备注'}], charts: [{type: 'table', title: 't', columns: ['备注']}]}, long, 'x').filters, []);
});

test('chart frame: shown before charts are created, resized after layout, single-choice filters; manifest in sync', async () => {
  const frame = await read('../src/viz/frame.js');
  const i = frame.indexOf('app.hidden = false'), j = frame.indexOf('window.echarts.init(');
  assert.ok(i > 0 && j > 0 && i < j, 'the container must be visible when ECharts measures it');
  assert.match(frame, /requestAnimationFrame\(\(\) => charts\.forEach\(c => c\.resize\(\)\)\)/);
  assert.match(frame, /ResizeObserver/);
  assert.ok(!frame.includes("el('select', {multiple: ''})"));
  assert.match(frame, /全部（/);
  assert.ok(!/fetch\(|XMLHttpRequest|localStorage|eval\(|new Function/.test(frame));
  const man = JSON.parse(await read('../src/viz/VIZ-MANIFEST.json'));
  for (const e of man.files) { const b = await readFile(new URL('../src/viz/' + e.name, import.meta.url)); assert.equal(createHash('sha256').update(b).digest('hex'), e.sha256, e.name); }
});

test('feed and plaza CSS: the feed list cannot grow wider than the page', async () => {
  const css = await read('../src/workbench.css');
  assert.match(css, /\.feed-list\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(css, /\.plaza-grid\{display:grid/);
  assert.match(css, /\.plaza-search input\{[^}]*border-radius:10px/);
});
