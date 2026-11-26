// Fixes exposed by the website dialog screenshots: library .slice crash, duplicate page tabs, English signal labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { actionLabel, actionTone } from '../src/shared/quant.js';
import { quantPage } from '../src/ui/quant.js';

const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const action = (label, id, extra = '', cls = '') => `<button data-action="${id}" data-id="${escape(extra)}" class="${cls}">${label}</button>`;
const date = t => new Date(t || Date.now()).toISOString().slice(0, 10);
const empty = (title) => `<p class="empty-note">${title}</p>`;
const heading = (kicker, title) => `<h1>${title}</h1>`;

test('C: buy/sell signal labels are always Chinese, including lowercase engine codes', () => {
  assert.equal(actionLabel('buy'), '买入');
  assert.equal(actionLabel('BUY'), '买入');
  assert.equal(actionLabel('strong_buy'), '强烈买入');
  assert.equal(actionLabel('strong-buy'), '强烈买入');
  assert.equal(actionLabel('sell'), '卖出');
  assert.equal(actionLabel('STRONG_SELL'), '急跌风控');
  assert.equal(actionLabel('hold'), '持有');
  assert.equal(actionLabel('buy', '分批买入'), '分批买入', 'an explicit Chinese action text still wins');
  assert.equal(actionLabel(''), '—');
  assert.equal(actionTone('buy'), 'buy');
  const html = quantPage({quant: {status: 'running', pool: [{code: '002594', name: '比亚迪', last: {action: 'buy', score: 70, multiplier: 1.5, price: 100, changePct: 1}}]}}, {action, heading, empty, date});
  assert.match(html, />买入</);
  assert.doesNotMatch(html, />buy</);
});

async function app(patch = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="app"></div><dialog id="modal"></dialog><div id="toast"></div></body>', {url: 'file:///app/src/index.html', runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
  w.HTMLDialogElement.prototype.close ??= function () { this.open = false; };
  const s = {chats: [{id: 'c1', name: '演示对话', messages: [{role: 'user', content: '查看我的股票池'}], time: 1}], folders: [], memories: [], tasks: [], artifacts: [], activity: [], executions: [], commandJobs: [], runJobs: [],
    settings: {model: 'demo', name: '演示工作空间'}, agents: [{id: 'assistant', name: '助手'}], documents: [], connectors: [], connectorItems: [], dashboards: [], browsers: [], desktop: {platform: 'darwin'}, ...patch};
  const hooks = {};
  w.actwill = new Proxy({}, {get: (_, k) => {
    if (['onStream', 'onRuntime', 'onOpenChat', 'onOpenPage'].includes(k)) return cb => { hooks[k] = cb; return () => {}; };
    return async () => structuredClone(s);
  }});
  const {loadUI} = await import('./helpers/load-ui.mjs');
  await loadUI(w);
  const settle = (ms = 40) => new Promise(r => setTimeout(r, ms));
  await settle();
  return {w, doc: w.document, hooks, settle};
}

test('A: 成果中心 shows an empty state when an artifact/document has no text', async () => {
  const {w, doc, hooks, settle} = await app({
    artifacts: [{id: 'af1', name: '自动保存的成果', time: Date.now()}],
    documents: [{id: 'doc1', name: '演示文档', format: 'docx', revision: 1, time: Date.now()}],
  });
  try {
    hooks.onOpenPage({page: 'library'}); await settle();
    const body = doc.querySelector('#pagePanel .pp-body');
    assert.ok(body, 'the library tab renders');
    assert.match(body.textContent, /成果中心/);
    assert.doesNotMatch(body.textContent, /页面加载失败|slice/);
    assert.match(body.textContent, /空文档/);
    assert.match(body.textContent, /空成果/);
  } finally { w.close(); }
});

test('B: a page open on one side is focused there, never duplicated with a "正在左侧主区域显示" tab', async () => {
  const {w, doc, hooks, settle} = await app();
  try {
    hooks.onOpenPage({page: 'feed'}); await settle();
    const ids = () => [...doc.querySelectorAll('#pagePanel .pp-tab button[role="tab"]')].map(b => b.dataset.id);
    assert.deepEqual(ids(), ['page:feed']);
    const mainTitle = () => doc.querySelector('.topbar-title')?.textContent.trim();
    const before = mainTitle();
    doc.querySelector('.sidebar [data-page="feed"]').click(); await settle();
    assert.equal(mainTitle(), before, 'sidebar focuses the existing tab instead of opening the page in the main area');
    assert.equal(doc.querySelector('#pagePanel .pp-tab.selected button').dataset.id, 'page:feed');
    assert.doesNotMatch(doc.querySelector('#pagePanel .pp-body').textContent, /正在左侧主区域显示/);
    doc.querySelector('.sidebar [data-page="library"]').click(); await settle();
    assert.notEqual(mainTitle(), before, 'a page with no tab still navigates the main area');
    hooks.onOpenPage({page: 'library'}); await settle();
    assert.deepEqual(ids(), ['page:feed'], 'chat-opening a page already in the main area creates no duplicate tab');
    assert.doesNotMatch(doc.querySelector('#pagePanel .pp-body').textContent, /正在左侧主区域显示/);
  } finally { w.close(); }
});
