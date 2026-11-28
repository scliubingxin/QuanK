// [v1.0.8] The Coding task page keeps the reading position when it is re-rendered, and permission requests
// sit in one sticky line instead of being inserted above the output.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {codingTaskPage} from '../src/ui/coding-task.js';
import {revealApproval} from '../src/ui/approval-card.js';
import {captureScroll, restoreScroll, CODING_ANCHORS} from '../src/ui/panel-scroll.js';

const action = (label, act, id = '', cls = '') => `<button type="button" data-action="${act}" data-id="${id}" class="${cls}">${label}</button>`;
const date = () => '10:00';
const VIEW = 400;

function makeTask(entries, pending = false) {
  const stream = [];
  for (let i = 0; i < entries; i++) stream.push({type: i % 2 ? 'tool' : 'text', text: '输出 ' + i, at: 1000 + i});
  return {id: 't1', title: '波动率过滤', status: pending ? 'waiting_permission' : 'running', request: '加一个波动率过滤', branch: 'quank/iter-20261128-a',
    agent: {name: '演示 Coding 智能体'}, updatedAt: 1, stream,
    ...(pending ? {pendingPermission: {requestId: 'req-1', action: '运行测试', summary: 'python -m unittest', time: 5}} : {})};
}

// A tiny block layout: each counted box gets a fixed height and boxes stack in document order.
function heightOf(el) {
  if (el.matches('details.coding-approval-bar')) return 36; // the list opens as an overlay
  if (el.matches('header')) return 60;
  if (el.matches('details')) return el.open ? 80 : 36;
  if (el.matches('h3, h4')) return 24;
  if (el.matches('.toolbar')) return 32;
  if (el.matches('.coding-table')) return 120;
  return 20;
}
function layout(container) {
  const boxes = new Map();
  let y = 0;
  const walk = parent => {
    for (const child of parent.children) {
      if (child.matches('article, section')) { walk(child); continue; }
      const h = heightOf(child);
      boxes.set(child, [y, h]);
      y += h;
    }
  };
  walk(container);
  return {boxes, total: y};
}
function mount() {
  const dom = new JSDOM('<div class="pp-body"></div>');
  const {window} = dom;
  const el = window.document.querySelector('.pp-body');
  let scrollTop = 0;
  Object.defineProperty(el, 'clientHeight', {get: () => VIEW});
  Object.defineProperty(el, 'scrollHeight', {get: () => Math.max(VIEW, layout(el).total)});
  Object.defineProperty(el, 'scrollTop', {get: () => scrollTop, set: v => { scrollTop = Math.max(0, Math.min(v, el.scrollHeight - VIEW)); }});
  window.Element.prototype.getBoundingClientRect = function () {
    if (this === el) return {top: 0, bottom: VIEW, height: VIEW, left: 0, right: 600, width: 600};
    const {boxes} = layout(el);
    let node = this;
    while (node && !boxes.has(node)) node = node.parentElement;
    if (!node) return {top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0};
    const [y, h] = boxes.get(node);
    return {top: y - scrollTop, bottom: y + h - scrollTop, height: h, left: 0, right: 600, width: 600};
  };
  return {el, window};
}
function render(el, task) {
  const keep = captureScroll(el);
  el.innerHTML = codingTaskPage(task, {action, date});
  restoreScroll(el, keep);
}
function firstVisible(el) {
  return [...el.querySelectorAll(CODING_ANCHORS)].find(node => node.dataset.codingFold.startsWith('stream-') && node.getBoundingClientRect().bottom > 1);
}
const topOf = (el, key) => [...el.querySelectorAll('[data-coding-fold]')].find(node => node.dataset.codingFold === key).getBoundingClientRect().top;

test('appending output keeps the first visible output in place', () => {
  const {el} = mount();
  el.innerHTML = codingTaskPage(makeTask(30), {action, date});
  el.scrollTop = 500;
  const anchor = firstVisible(el), key = anchor.dataset.codingFold, before = anchor.getBoundingClientRect().top;
  render(el, makeTask(31));
  assert.ok(Math.abs(topOf(el, key) - before) <= 2);
});

test('a new permission request does not push the output the user is reading', () => {
  const {el} = mount();
  el.innerHTML = codingTaskPage(makeTask(30), {action, date});
  el.scrollTop = 500;
  const anchor = firstVisible(el), key = anchor.dataset.codingFold, before = anchor.getBoundingClientRect().top;
  // Without keeping the position the bar above would shift the content by its height.
  el.innerHTML = codingTaskPage(makeTask(30, true), {action, date});
  assert.ok(Math.abs(topOf(el, key) - before) > 2, 'the fixture must really move without the fix');
  el.innerHTML = codingTaskPage(makeTask(30), {action, date});
  el.scrollTop = 500;
  render(el, makeTask(30, true));
  assert.ok(Math.abs(topOf(el, key) - before) <= 2);
  assert.ok(el.querySelector('details.coding-approval-bar[data-pending]'), 'pending request shows as the sticky bar');
});

test('a view that follows the bottom keeps following new output', () => {
  const {el} = mount();
  el.innerHTML = codingTaskPage(makeTask(30), {action, date});
  el.scrollTop = el.scrollHeight;
  render(el, makeTask(32));
  assert.equal(el.scrollTop, el.scrollHeight - VIEW);
});

test('at the very top the page stays at the top', () => {
  const {el} = mount();
  el.innerHTML = codingTaskPage(makeTask(30), {action, date});
  render(el, makeTask(30, true));
  assert.equal(el.scrollTop, 0);
});

test('permission requests are one collapsed line and 前往授权 opens it', () => {
  const html = codingTaskPage(makeTask(4, true), {action, date});
  const doc = new JSDOM(html).window.document;
  const bar = doc.querySelector('details.coding-approval-bar');
  assert.ok(bar && !bar.open);
  assert.match(bar.querySelector('summary').textContent, /需要你的授权：运行测试/);
  assert.equal(doc.querySelectorAll('.coding-task-page > .inline-approval-card').length, 0, 'no full cards above the content');
  const card = bar.querySelector('[data-approval-id="req-1"]');
  card.scrollIntoView = () => {};
  assert.equal(revealApproval(doc, 'req-1'), true);
  assert.equal(bar.open, true);
  const none = new JSDOM(codingTaskPage(makeTask(4), {action, date})).window.document;
  assert.equal(none.querySelector('.coding-approval-bar'), null);
});

test('the side panel uses the saved position on same-tab refresh', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /const keep = same && tab\.kind === 'coding-task' \? captureScroll\(el\) : null;/);
  assert.match(app, /if \(!same\) el\.scrollTop = tab\.scroll \|\| 0; else if \(keep\) restoreScroll\(el, keep\);/);
  const css = readFileSync(new URL('../src/workbench.css', import.meta.url), 'utf8');
  assert.match(css, /details\.coding-approval-bar \{ position:sticky; top:0;/);
  assert.match(css, /\.coding-approval-list \{ position:absolute;/);
});
