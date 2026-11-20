import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { homeQuant, homeQuantSummary } from '../src/ui/home-quant.js';
import { homeContent } from '../src/ui/workspace.js';
import { NAV_LAYOUT, sidebarNav } from '../src/ui/sidebar.js';
import { capabilityPresets, presetSkill } from '../runtime/capability-presets.mjs';
import { parseSkillPackage } from '../runtime/skill-package.mjs';
import { skillsPage, mcpPage } from '../src/ui/capability-library.js';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const icon = n => `<svg data-i="${n}"></svg>`;
const action = (l, a, id = '', c = 'secondary') => `<button class="${c}" data-action="${a}" data-id="${id}">${l}</button>`;
const Q = {status: 'running', installed: true, pool: [
  {code: '600001', name: '示例<b>一</b>', last: {action: 'BUY', score: 70.25, price: 12.5, changePct: 1.234}},
  {code: '600002', name: '示例二', last: {action: 'SELL', score: 20, price: 8, changePct: -2}},
  {code: '600003', name: '示例三'}],
  holdings: {'600001': {shares: 1000, value: 12500, pnl: 500}, '600002': {shares: 0}},
  alerts: [{kind: 'change', time: 3, code: '600002', name: '示例二', from: 'HOLD', to: 'SELL'}, {kind: 'report', time: 2, title: '示例日报', ok: true, summary: '共 5 条', reportId: 'day'}]};

test('home quant panel: summary, tiles open the stock, recent changes, disclaimer', () => {
  assert.deepEqual(homeQuantSummary(Q), {stocks: 3, buy: 1, sell: 1, held: 1, value: 12500, pnl: 500});
  const doc = new JSDOM(homeQuant({quant: Q}, {action, icon, date: t => 't' + t})).window.document;
  const tiles = [...doc.querySelectorAll('.hq-stock')];
  assert.deepEqual(tiles.map(t => [t.dataset.action, t.dataset.id]), [['quantOpen', '600001'], ['quantOpen', '600002'], ['quantOpen', '600003']]);
  assert.equal(tiles[0].querySelector('.hq-name b').textContent, '示例<b>一</b>', 'names are escaped');
  assert.match(tiles[0].textContent, /70\.3.*12\.50.*\+1\.23%.*持仓 1,000 股/s); assert.match(tiles[2].textContent, /未计算/);
  assert.ok(tiles[0].classList.contains('hq-buy') && tiles[1].classList.contains('hq-sell'));
  assert.deepEqual([...doc.querySelectorAll('.hq-stats b')].map(b => b.textContent), ['3', '1', '1', '12,500.00', '500.00']);
  assert.ok(doc.querySelector('[data-action="quantRefreshAll"]') && doc.querySelector('[data-action="quantAdd"]') && doc.querySelector('[data-action="quantHome"]'));
  assert.equal(doc.querySelector('[data-action="quantStart"]'), null);
  const rec = [...doc.querySelectorAll('.hq-recent li')];
  assert.equal(rec.length, 2); assert.match(rec[0].textContent, /示例二/); assert.ok(rec[1].querySelector('[data-action="quantReport"][data-id="day"]'));
  assert.match(doc.querySelector('.hq-note').textContent, /不构成投资建议/);
  const stopped = new JSDOM(homeQuant({quant: {...Q, status: 'stopped'}}, {action, icon})).window.document;
  assert.ok(stopped.querySelector('[data-action="quantStart"]')); assert.match(stopped.querySelector('.hq-status').textContent, /已停止/);
  const many = {...Q, pool: Array.from({length: 11}, (_, i) => ({code: String(600100 + i), name: 'S' + i}))};
  const m = new JSDOM(homeQuant({quant: many}, {action, icon})).window.document;
  assert.equal(m.querySelectorAll('.hq-stock').length, 8); assert.match(m.querySelector('.hq-more').textContent, /还有 3 只/);
  const empty = new JSDOM(homeQuant({quant: {status: 'stopped', pool: []}}, {action, icon})).window.document;
  assert.ok(empty.querySelector('.hq-empty [data-action="quantContact"]')); // [v45e] strategy access via WeChat
  assert.ok(new JSDOM(homeQuant({}, {action, icon})).window.document.querySelector('.hq-empty'));
});

test('workspace home: finance headline, finance suggestions, quant panel above recent tasks', () => {
  const state = {settings: {hasKey: true}, chats: [], quant: Q};
  const html = homeContent({state, icon, action, composer: () => '<div id="composer"></div>', date: String, taskStatus: () => ''});
  const doc = new JSDOM(html).window.document;
  assert.match(doc.querySelector('h1').textContent, /今天的市场/);
  assert.deepEqual([...doc.querySelectorAll('[data-action="suggest"]')].map(b => b.dataset.id), ['stock', 'earnings', 'brief', 'portfolio', 'memo']);
  assert.ok(doc.querySelector('.qk-hero .suggestions') && doc.querySelector('.qk-grid .home-quant') && doc.querySelector('.qk-grid .qk-recent'), '[home2] hero + card grid');
});

test('sidebar: 量化 lives on the 工作台, which stays highlighted on the quant page', () => {
  assert.equal(NAV_LAYOUT.some(n => n.id === 'quant'), false);
  const doc = new JSDOM(sidebarNav({page: 'quant', icon})).window.document;
  assert.ok(doc.querySelector('[data-page="home"]').classList.contains('active'));
});

test('capability plaza: finance skills first, valid packages, finance hero copy, finance MCP', () => {
  const c = capabilityPresets(), fin = c.skills.filter(s => s.id.startsWith('fin-'));
  assert.equal(fin.length, 11); assert.ok(c.skills.slice(0, 11).every(s => s.id.startsWith('fin-')), 'finance skills come first');
  assert.deepEqual([...new Set(fin.map(s => s.category))], ['投研分析', '财务建模', '资讯跟踪', '风控合规', '量化交易']);
  for (const s of fin) { const p = presetSkill(s.id); const parsed = parseSkillPackage(p.filename, p.bytes); assert.ok(parsed.files.some(f => f.path === 'SKILL.md')); }
  assert.equal(c.mcp[0].id, 'fiscal-ai'); assert.equal(c.mcp[0].auth, 'bearer'); assert.equal(c.mcp[0].category, '金融数据');
  assert.equal(c.mcp.find(m => m.id === 'tavily').category, '资讯检索');
  const sk = new JSDOM(skillsPage({capabilityPresets: c, skillPackages: []})).window.document;
  assert.match(sk.querySelector('.plaza-hero h1').textContent, /金融工作的常用方法/);
  assert.equal(sk.querySelector('[data-preset-chip]:nth-child(2)').textContent, '投研分析');
  const mc = new JSDOM(mcpPage({capabilityPresets: c, mcpConnections: []})).window.document;
  assert.match(mc.querySelector('.plaza-hero h1').textContent, /接入金融数据与资讯/);
  assert.match(mc.querySelector('[data-preset-search]').getAttribute('placeholder'), /财报/);
});

test('wiring: finance agents seeded once, suggestions map to them', async () => {
  const main = await read('../main.mjs'), app = await read('../src/app.js');
  assert.match(main, /financeAgentsSeeded/); for (const id of ['fin-research', 'fin-modeler', 'fin-quant', 'fin-risk']) assert.ok(main.includes(`id: '${id}'`), id);
  assert.match(app, /const FIN_SUGGEST = \{/);
});
