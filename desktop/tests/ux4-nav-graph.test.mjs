import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { sidebarNav, NAV_LAYOUT, navPages, groupOf } from '../src/ui/sidebar.js';
import { graphData, createLayout, contextGraphPage, contextHeader, graphSettingsForm, graphSidePanel, mountGraphCanvas, radius } from '../src/ui/graph-view.js';
import { emptyGraph, mergeExtraction, parseGraphExtraction } from '../src/shared/graph.js';

const icon = n => `<svg data-i="${n}"></svg>`;

test('sidebar: four top-level entries and three grouped flyouts cover every page exactly once', () => {
  const pages = navPages();
  assert.deepEqual([...pages].sort(), ['agents', 'connectors', 'context', 'feed', 'files', 'graph', 'home', 'library', 'security', 'studio', 'tasks', 'tools'].sort()); // [fin1] 量化 moved onto the 工作台; [F5] 安全与合规
  assert.equal(new Set(pages).size, pages.length);
  assert.equal(NAV_LAYOUT.filter(n => !n.items).length, 3); // [ux8] 仪表盘 moved into 资料库; [fin1] 量化 on the 工作台
  assert.equal(groupOf('connectors').title, '智能体·连接·工具');
  assert.equal(groupOf('home'), null);
  const dom = new JSDOM(sidebarNav({page: 'connectors', icon, unread: 3})).window.document;
  for (const p of pages) assert.ok(dom.querySelector(`[data-page="${p}"]`), p);
  assert.equal(dom.querySelector('.nav-badge').textContent, '3');
  const active = dom.querySelector('.nav-group.active');
  assert.equal(active.dataset.group, 'capabilities');
  assert.equal(active.querySelector('.nav-sub').textContent, '连接');
  assert.equal(active.querySelector('.nav-group-head').dataset.page, 'connectors');
  assert.ok(active.querySelector('.nav-flyout-item.active[data-page="connectors"]'));
  const idle = new JSDOM(sidebarNav({page: 'home', icon})).window.document;
  assert.equal(idle.querySelector('[data-group="context"] .nav-group-head').dataset.page, 'graph');
  assert.equal(idle.querySelectorAll('.nav-group.active').length, 0);
  assert.equal(idle.querySelector('.nav-badge'), null);
  assert.equal(idle.querySelector('details.more-nav'), null);
});

const X = JSON.stringify({entities: [
  {name: '通威股份', type: 'org', summary: '光伏企业'}, {name: '张三', type: 'person'}, {name: '李四', type: 'person'},
  {name: 'TNC 3.0', type: 'product'}, {name: '丽豪清能', type: 'org'}, {name: '孤立公司', type: 'org'}],
  relations: [{from: '张三', to: '通威股份', type: '任职于'}, {from: '李四', to: '通威股份', type: '任职于'}, {from: '通威股份', to: 'TNC 3.0', type: '量产'}, {from: '通威股份', to: '丽豪清能', type: '收购'}]});
let n = 0;
const graph = () => { const g = emptyGraph(); n = 0; mergeExtraction(g, parseGraphExtraction(X), {key: 'chat:1', title: 't'}, {now: 1, uid: () => 'e' + (++n)}); return g; };
const id = (g, name) => g.entities.find(e => e.name === name).id;

test('graphData: type filter, search keeps neighbours, focus, limit by degree', () => {
  const g = graph();
  const all = graphData(g);
  assert.equal(all.nodes.length, 6);
  assert.equal(all.edges.length, 4);
  assert.equal(all.nodes[0].name, '通威股份');
  assert.equal(all.nodes[0].degree, 4);
  assert.deepEqual(graphData(g, {type: 'person'}).nodes.map(d => d.name).sort(), ['张三', '李四']);
  assert.equal(graphData(g, {type: 'person'}).edges.length, 0);
  const s = graphData(g, {query: '张三'});
  assert.deepEqual(s.nodes.map(d => [d.name, d.match]).sort(), [['张三', true], ['通威股份', false]]);
  assert.equal(s.matches, 1);
  assert.equal(graphData(g, {query: '没有这个'}).matches, 0);
  const f = graphData(g, {focus: id(g, 'TNC 3.0')});
  assert.deepEqual(f.nodes.map(d => d.name), ['TNC 3.0', '通威股份']);
  const lim = graphData(g, {limit: 2});
  assert.deepEqual([lim.shown, lim.truncated, lim.total], [2, true, 6]);
  assert.deepEqual(graphData(null).nodes, []);
});

test('createLayout: deterministic start, settles without NaN, linked nodes end closer, cached positions do not move', () => {
  const g = graph(), data = graphData(g);
  const a = createLayout(data, {}), b = createLayout(data, {});
  assert.deepEqual(a.nodes.map(d => [d.x, d.y]), b.nodes.map(d => [d.x, d.y]));
  const cache = {};
  const L = createLayout(data, cache);
  assert.equal(L.alpha, 1);
  const steps = L.settle(400);
  assert.ok(steps > 50 && steps <= 400);
  assert.ok(L.nodes.every(d => Number.isFinite(d.x) && Number.isFinite(d.y)));
  const at = name => L.nodes.find(d => d.name === name), dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  assert.ok(dist(at('张三'), at('通威股份')) < dist(at('孤立公司'), at('通威股份')));
  assert.equal(cache.pos.size, 6);
  const again = createLayout(data, cache);
  assert.equal(again.alpha, 0);
  assert.equal(again.step(), false);
  assert.deepEqual(again.nodes.map(d => [d.x, d.y]), L.nodes.map(d => [d.x, d.y]));
  assert.ok(radius({degree: 0}) >= 3 && radius({degree: 400}) <= 10);
  const big = {nodes: Array.from({length: 600}, (_, i) => ({id: 'n' + i, name: 'n' + i, type: 'org', degree: 1})), edges: Array.from({length: 599}, (_, i) => ({from: 'n' + i, to: 'n' + (i + 1)}))};
  const t0 = Date.now(); createLayout(big, {}).settle(180);
  assert.ok(Date.now() - t0 < 4000, 'large graphs settle quickly');
});

const ui = {action: (l, a, id = '', k = 'secondary') => `<button class="${k}" data-action="${a}" data-id="${id}">${l}</button>`, date: () => '11月19日 16:01'};
test('context page: header tabs, toolbar, legend, side panel, list view, empty state, escaping', () => {
  const g = graph();
  g.entities[0].name = '<img src=x onerror=1>';
  const state = {graph: {...g, settings: {}, status: {lastRun: 1, pending: 2}}};
  const html = contextGraphPage(state, {...ui, selected: id(g, '张三')});
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelector('.ctx-head h1').textContent, '智能记忆');
  assert.deepEqual([...doc.querySelectorAll('.ctx-tab')].map(b => [b.dataset.page, b.classList.contains('chosen')]), [['graph', true], ['context', false]]);
  assert.match(doc.querySelector('.ctx-updated').textContent, /上次整理 11月19日 16:01 · 待整理 2 项/);
  assert.ok(doc.querySelector('#graphCanvas') && doc.querySelector('#graphQuery'));
  assert.deepEqual([...doc.querySelectorAll('.legend-row')].map(r => r.textContent), ['公司 / 组织3', '人物2', '产品1']);
  assert.ok(!doc.querySelector('#graphSide').hidden);
  assert.match(doc.querySelector('#graphSide header b').textContent, /张三/);
  assert.equal(doc.querySelector('#graphSide .graph-svg'), null);
  assert.equal(doc.querySelectorAll('img').length, 0);
  const list = new JSDOM(contextGraphPage(state, {...ui, mode: 'list', type: 'person'})).window.document;
  assert.deepEqual([...list.querySelectorAll('.graph-list tbody tr .link-btn')].map(b => b.textContent).sort(), ['张三', '李四']);
  assert.equal(list.querySelectorAll('img').length, 0);
  const focused = contextGraphPage(state, {...ui, focus: id(g, 'TNC 3.0')});
  assert.match(focused, /聚焦：TNC 3\.0/);
  assert.match(contextGraphPage({graph: {entities: [], relations: [], status: {pending: 1}}}, ui), /图谱还是空的[\s\S]*graphExtract/);
  assert.match(contextGraphPage(state, {...ui, query: 'zzz'}), /没有找到匹配的实体/);
  assert.match(contextHeader(state, {tab: 'context', date: ui.date}), /ctx-tab chosen" aria-selected="true" data-page="context"/);
  assert.equal(graphSidePanel(state, 'missing', ui), '');
  const form = new JSDOM(graphSettingsForm({graph: {...g, settings: {chats: false}, status: {today: 3}}})).window.document;
  assert.equal(form.querySelectorAll('[data-action="graphSettingToggle"]').length, 5);
  assert.equal(form.querySelector('[data-id="chats"]').getAttribute('aria-pressed'), 'false');
  assert.ok(form.querySelector('[data-action="graphClear"]'));
});

test('canvas mount degrades gracefully without a 2D canvas', () => {
  const {window} = new JSDOM('<div id="h"></div>');
  const h = window.document.getElementById('h');
  const m = mountGraphCanvas(h, graphData(graph()), {});
  assert.match(h.textContent, /切换到「列表」/);
  m.select('x'); m.fit(); m.dispose();
});

test('app: sidebar groups render, 智能记忆 tabs switch between graph and memory', async () => {
  const { loadUI } = await import('./helpers/load-ui.mjs');
  const dom = new JSDOM('<!doctype html><body><div id="app"></div><dialog id="modal"></dialog><div id="toast"></div></body>', {url: 'file:///app/src/index.html', runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
  w.HTMLDialogElement.prototype.close ??= function () { this.open = false; };
  const g = graph();
  const s = {schema: 1, chats: [], folders: [], memories: [{id: 'm1', text: '喜欢简洁的回答', kind: 'preference', source: 'user'}], tasks: [], artifacts: [], activity: [], executions: [], commandJobs: [], runJobs: [],
    settings: {baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', name: '测试'}, agents: [], documents: [], connectors: [], connectorItems: [], dashboards: [],
    graph: {...g, settings: {}, status: {}}, browsers: [], desktop: {platform: 'darwin'}};
  w.actwill = new Proxy({}, {get: (_, k) => k === 'onStream' || k === 'onRuntime' || k === 'onOpenChat' || k === 'onOpenPage' ? () => () => {} : async () => structuredClone(s)});
  await loadUI(w);
  const settle = () => new Promise(r => setTimeout(r, 30));
  await settle();
  const doc = w.document;
  assert.ok(doc.querySelector('.sidebar .nav-group[data-group="context"]'));
  assert.equal(doc.querySelector('details.more-nav'), null);
  doc.querySelector('.sidebar [data-page="graph"]').click(); await settle();
  assert.equal(doc.querySelector('.ctx-head h1')?.textContent, '智能记忆');
  assert.ok(doc.querySelector('.sidebar .nav-group.active[data-group="context"]'));
  assert.ok(doc.querySelector('#graphCanvas'));
  doc.querySelector('.ctx-tab[data-page="context"]').click(); await settle();
  assert.match(doc.body.textContent, /喜欢简洁的回答/);
  assert.equal(doc.querySelector('.ctx-tab.chosen')?.dataset.page, 'context');
  dom.window.close();
});
