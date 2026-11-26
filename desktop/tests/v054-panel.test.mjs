import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { openTab, closeTab, activeTab, pageTab, stockTab, restoreTabs, clampWidth, panelHead, PANEL_MAX_TABS } from '../src/ui/page-panel.js';

test('panel tabs: open, refocus, cap, close, restore', () => {
  let r = openTab([], pageTab('feed', '动态'));
  r = openTab(r.tabs, stockTab('600438', '通威股份'));
  r = openTab(r.tabs, pageTab('feed', '动态'));
  assert.deepEqual(r.tabs.map(t => t.id), ['page:feed', 'stock:600438'], 'reopening a tab focuses it instead of adding a copy');
  assert.equal(r.active, 'page:feed');
  let tabs = [];
  for (let i = 0; i < PANEL_MAX_TABS + 3; i++) tabs = openTab(tabs, stockTab(String(600000 + i))).tabs;
  assert.equal(tabs.length, PANEL_MAX_TABS); assert.equal(tabs.at(-1).code, String(600000 + PANEL_MAX_TABS + 2)); assert.equal(tabs[0].code, '600003', 'oldest tabs drop first');
  const three = [pageTab('a'), pageTab('b'), pageTab('c')];
  assert.equal(closeTab(three, 'page:b', 'page:b').active, 'page:c', 'right neighbour takes over');
  assert.equal(closeTab(three, 'page:c', 'page:c').active, 'page:b');
  assert.equal(closeTab(three, 'page:a', 'page:c').active, 'page:c', 'closing another tab keeps the active one');
  assert.equal(closeTab([pageTab('a')], 'page:a', 'page:a').active, '');
  assert.equal(activeTab(three, 'nope').id, 'page:c');
  const back = restoreTabs(JSON.stringify({tabs: [stockTab('600519', '贵州茅台'), {kind: 'page', page: 'chat'}, {kind: 'stock', code: 'x'}, pageTab('research', '投研资料'), {kind: 'page', page: '<x>'}], active: 'page:research', wide: 1, width: 500}));
  assert.deepEqual(back.tabs.map(t => t.id), ['stock:600519', 'page:research'], 'chat/home and invalid tabs are dropped');
  assert.equal(back.active, 'page:research'); assert.equal(back.wide, true); assert.equal(back.width, 500);
  assert.deepEqual(restoreTabs('{bad'), {tabs: [], active: '', wide: false, width: 0});
  assert.equal(clampWidth(100, 1440), 380); assert.equal(clampWidth(5000, 1440), 680); assert.equal(clampWidth(0, 1000), 380); assert.equal(clampWidth(0, 1440), 662);
  const head = new JSDOM(panelHead({tabs: [pageTab('feed', '动态'), stockTab('600438', '<b>通威</b>')], active: 'stock:600438'})).window.document;
  assert.equal(head.querySelectorAll('.pp-tab').length, 2); assert.ok(head.querySelector('.pp-tab.selected [data-id="stock:600438"]'));
  assert.equal(head.querySelector('.pp-stock span:not(.pp-dot)').textContent, '<b>通威</b>', 'titles are escaped');
  assert.ok(head.querySelector('[data-action="ppClose"][data-id="page:feed"]') && head.querySelector('[data-action="ppWide"]') && head.querySelector('[data-action="ppCloseAll"]'));
});

const POOL = [{code: '600438', name: '通威股份', last: {action: 'HOLD', score: 34, price: 11.1}}, {code: '600519', name: '贵州茅台', last: {action: 'BUY', score: 72, price: 1468}}];
const detail = code => ({summary: {action: 'HOLD', score: 50, price: 10, reasons: ['r-' + code], gates: [], factors: [], backtest: {}}, charts: null});

async function app() {
  const { loadUI } = await import('./helpers/load-ui.mjs');
  const dom = new JSDOM('<!doctype html><body><div id="app"></div><dialog id="modal"></dialog><div id="toast"></div></body>', {url: 'file:///app/src/index.html', runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
  w.HTMLDialogElement.prototype.close ??= function () { this.open = false; };
  const s = {schema: 1, chats: [{id: 'c1', name: '打开我的自选', messages: [{role: 'user', content: '打开我的自选'}], createdAt: 1, updatedAt: 1}], folders: [], memories: [], tasks: [], artifacts: [], activity: [], executions: [], commandJobs: [], runJobs: [],
    settings: {model: 'deepseek-chat', name: '测试'}, agents: [{id: 'assistant', name: 'QuankSight 助手'}], documents: [], connectors: [], connectorItems: [], dashboards: [], browsers: [], desktop: {platform: 'darwin'},
    quant: {status: 'running', pool: POOL, holdings: {}}};
  const calls = [], hooks = {};
  w.actwill = new Proxy({}, {get: (_, k) => {
    if (['onStream', 'onRuntime', 'onOpenChat', 'onOpenPage'].includes(k)) return cb => { hooks[k] = cb; return () => {}; };
    if (k === 'quant') return async p => { calls.push(p); return {result: p.action === 'signal' ? detail(p.code) : {}, state: structuredClone(s)}; };
    return async () => structuredClone(s);
  }});
  await loadUI(w);
  const settle = (ms = 40) => new Promise(r => setTimeout(r, ms));
  await settle();
  return {w, doc: w.document, calls, hooks, settle};
}

test('chat-opened pages and stock details open as right-hand tabs; results are kept', async () => {
  const {w, doc, calls, hooks, settle} = await app();
  try {
  doc.querySelector('[data-action="openChat"][data-id="c1"], .recent [data-id="c1"]')?.click(); await settle();
  const title = () => doc.querySelector('.topbar-title').textContent;
  const before = title();
  hooks.onOpenPage({page: 'quant'}); await settle();
  assert.equal(title(), before, 'the conversation stays in the main area');
  assert.ok(doc.body.classList.contains('pp-on'));
  assert.deepEqual([...doc.querySelectorAll('#pagePanel .pp-tab')].map(t => t.title.trim()), ['量化']);
  assert.ok(doc.querySelector('#pagePanel .pp-body .q-pool-grid'), 'the pool shows in the panel');
  doc.querySelector('#pagePanel [data-action="quantOpen"][data-id="600438"]').click(); await settle();
  doc.querySelector('#pagePanel [data-action="ppSelect"][data-id="page:quant"]').click(); await settle();
  doc.querySelector('#pagePanel [data-action="quantOpen"][data-id="600519"]').click(); await settle();
  assert.deepEqual([...doc.querySelectorAll('#pagePanel .pp-tab button[role="tab"]')].map(b => b.dataset.id), ['page:quant', 'stock:600438', 'stock:600519'], 'one tab per stock');
  assert.match(doc.querySelector('#pagePanel .pp-body').textContent, /r-600519/);
  assert.equal(doc.querySelector('#pagePanel [data-action="quantClose"]'), null, 'no 「← 股票池」 in a tab');
  doc.querySelector('#pagePanel [data-action="ppSelect"][data-id="stock:600438"]').click(); await settle();
  assert.match(doc.querySelector('#pagePanel .pp-body').textContent, /r-600438/);
  assert.deepEqual(calls.filter(c => c.action === 'signal').map(c => c.code), ['600438', '600519'], 'switching back does not recompute');
  doc.querySelector('#pagePanel [data-action="quantRefresh"][data-id="600438"]').click(); await settle();
  assert.equal(calls.filter(c => c.action === 'signal').length, 3, '重新计算 still recomputes');
  hooks.onOpenPage({page: 'quant', code: '600519'}); await settle();
  assert.equal(doc.querySelector('#pagePanel .pp-tab.selected button').dataset.id, 'stock:600519');
  assert.equal(calls.filter(c => c.action === 'signal').length, 3, 'opening a stock from the chat reuses its tab');
  hooks.onOpenPage({page: 'feed'}); await settle();
  assert.equal(title(), before); assert.equal(doc.querySelector('#pagePanel .pp-tab.selected button').dataset.id, 'page:feed');
  doc.querySelector('#pagePanel [data-action="ppWide"]').click(); await settle();
  assert.ok(doc.body.classList.contains('pp-wide'));
  doc.querySelector('#pagePanel [data-action="ppClose"][data-id="page:feed"]').click(); await settle();
  assert.equal(doc.querySelectorAll('#pagePanel .pp-tab').length, 3);
  doc.querySelector('#pagePanel [data-action="ppCloseAll"]').click(); await settle();
  assert.equal(doc.getElementById('pagePanel'), null); assert.ok(!doc.body.classList.contains('pp-on'));
  } finally { w.close(); }
});

test('the sidebar focuses an existing tab instead of duplicating the page in the main area', async () => {
  const {w, doc, hooks, settle} = await app();
  try {
  hooks.onOpenPage({page: 'feed'}); await settle();
  const title = doc.querySelector('.topbar-title').textContent.trim();
  doc.querySelector('.sidebar [data-page="feed"]').click(); await settle();
  assert.equal(doc.querySelector('.topbar-title').textContent.trim(), title, 'the main area stays put');
  assert.equal(doc.querySelector('#pagePanel .pp-tab.selected button').dataset.id, 'page:feed');
  assert.doesNotMatch(doc.querySelector('#pagePanel .pp-body').textContent, /正在左侧主区域显示/);
  doc.querySelector('.sidebar [data-page="quant"], .sidebar [data-page="tasks"]').click(); await settle();
  assert.ok(doc.querySelector('#pagePanel .pp-body .feed-page, #pagePanel .pp-body .page'), 'the tab still shows its page');
  } finally { w.close(); }
});
