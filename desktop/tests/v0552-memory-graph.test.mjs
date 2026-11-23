import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {memoryPage} from '../src/ui/memory.js';
import {graphPage} from '../src/ui/graph.js';
import {contextGraphPage, mountGraphCanvas} from '../src/ui/graph-view.js';

const graph = {entities: [{id: 'hub', name: '通威股份', type: 'org'}, {id: 'leaf', name: '爱旭股份', type: 'org'}], relations: []};
const options = {action: () => '', date: String, heading: () => '', icon: () => '', empty: () => ''};

test('记忆库和旧图谱筛选使用带图标的统一搜索框，窄容器下占满一行', async () => {
  const memory = memoryPage({...options, state: {memories: [{text: '通威 <测试>'}]}, query: '<测试>'});
  const legacy = graphPage({graph}, {...options, query: '通威'});
  for (const [markup, value] of [[memory, '<测试>'], [legacy, '通威']]) {
    const {document} = new JSDOM(markup).window;
    assert.ok(document.querySelector('.memory-tools > .chip'));
    const search = document.querySelector('.memory-tools > .graph-search');
    assert.ok(search.querySelector('svg'));
    assert.equal(search.querySelector('input[type=search]').value, value);
  }
  const css = await readFile(new URL('../src/workbench.css', import.meta.url), 'utf8');
  assert.match(css, /@container qkzone \(max-width:560px\)\{\s*\.memory-tools \.graph-search\{flex:1 1 100%/);
});

test('适应窗口图标和图谱切换同组，默认折叠图例在画布之外', () => {
  const {document} = new JSDOM(contextGraphPage({graph}, options)).window;
  const controls = document.querySelector('.graph-controls');
  const fit = controls.querySelector('[data-action=graphFit]');
  assert.ok(controls.querySelector('.seg'));
  assert.equal(fit.title, '适应窗口');
  assert.equal(fit.getAttribute('aria-label'), fit.title);
  assert.ok(fit.querySelector('svg'));
  const legend = controls.querySelector('details');
  assert.equal(legend.open, false);
  assert.equal(legend.querySelector('summary').textContent, '图例');
  assert.ok(legend.querySelector('[data-action=graphType]'));
  assert.equal(legend.closest('.graph-stage'), null);
});

test('画布初次和调整尺寸时适应窗口，重叠标签优先显示连接较多的节点', () => {
  const {window} = new JSDOM('<div id="host"></div>');
  const host = window.document.getElementById('host');
  let width = 800, tick, resize, labels = [];
  Object.defineProperties(host, {clientWidth: {get: () => width}, clientHeight: {value: 500}});
  const noop = () => {};
  window.requestAnimationFrame = callback => { tick = callback; return 1; };
  window.cancelAnimationFrame = noop;
  window.ResizeObserver = class { constructor(callback) { resize = callback; } observe() {} disconnect() {} };
  window.CanvasRenderingContext2D = function () {};
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({
    measureText: () => ({width: 48}),
    fillText: text => labels.push(text),
  }, {get: (obj, key) => obj[key] ?? noop});
  const cache = {pos: new Map([['hub', {x: 0, y: 0}], ['leaf', {x: 8, y: 0}], ['other', {x: 300, y: 0}]])};
  const mount = mountGraphCanvas(host, {
    nodes: [{id: 'leaf', name: '爱旭股份', degree: 1}, {id: 'hub', name: '通威股份', degree: 4}, {id: 'other', name: '其他', degree: 1}],
    edges: [{from: 'leaf', to: 'hub'}, {from: 'other', to: 'hub'}],
  }, {cache});
  try {
    tick();
    assert.ok(labels.includes('通威股份'));
    assert.ok(!labels.includes('爱旭股份'));
    const view = cache.view;
    assert.equal(view.w, 800);
    host.firstChild.dispatchEvent(new window.MouseEvent('pointermove', {clientX: width / 2 + view.x + 8 * view.k, clientY: 250}));
    labels = [];
    tick();
    assert.deepEqual(labels, ['爱旭股份']);
    const previous = view.k;
    width = 400;
    resize();
    tick();
    assert.equal(view.w, 400);
    assert.ok(view.k < previous);
    assert.equal(host.firstChild.style.width, '400px');
  } finally {
    mount.dispose();
    window.close();
  }
});
