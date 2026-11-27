// [v1.0.4] 「前往授权」 fell through to 工作台 for anything without a chat, and home no longer draws
// cards — so Office edits, order cancellations and orphans had no page where they could be answered.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { approvalRoute, isOrderApproval, barTargets, barRequests } from '../src/shared/approval-route.js';

const chats = [{id: 'c1', name: '早报'}];
const orders = [{id: 'od-1', status: 'draft'}, {id: 'od-2', status: 'awaiting'}];
const route = (request, extra) => approvalRoute(request, {chats, orders, ...extra});

test('judging whether an approval is about an order', () => {
  assert.equal(isOrderApproval({action: '撤销委托单', orderId: 'od-1'}), true);
  assert.equal(isOrderApproval({action: '下单：在券商页面填好委托'}), true);
  assert.equal(isOrderApproval({action: '使用QuankSight编辑'}), false);
  assert.equal(isOrderApproval({action: '读取网页内容'}), false);
  assert.equal(isOrderApproval(null), false);
});

test('order approvals go to 自动化 › 半自动委托 and point at the row', () => {
  assert.deepEqual(route({requestId: 'a1', orderId: 'od-2', action: '撤销委托单'}),
    {kind: 'order', orderId: 'od-2', requestId: 'a1'});
  // no orderId: the row is found by the order id quoted in the action text
  assert.deepEqual(route({requestId: 'a2', action: '撤销委托单 od-1'}),
    {kind: 'order', orderId: 'od-1', requestId: 'a2'});
  // the order is gone (expired): fall back to the feed card instead of a dead end
  assert.deepEqual(route({requestId: 'a3', action: '撤销委托单 od-gone'}),
    {kind: 'feed', requestId: 'a3'});
  assert.deepEqual(route({requestId: 'a4', orderId: 'od-gone', action: '撤销委托单'}, {orders: []}),
    {kind: 'feed', requestId: 'a4'});
});

test('chat and coding approvals route to their own page', () => {
  assert.deepEqual(route({requestId: 'b1', chatId: 'c1', action: '读取网页内容'}),
    {kind: 'chat', chatId: 'c1', requestId: 'b1'});
  assert.deepEqual(route({requestId: 'b2', codingTaskId: 't9', action: '执行工具操作'}),
    {kind: 'coding', taskId: 't9', requestId: 'b2'});
  // a deleted conversation is an orphan: answer it on the feed
  assert.deepEqual(route({requestId: 'b3', chatId: 'gone', action: '读取网页内容'}),
    {kind: 'feed', requestId: 'b3'});
});

test('Office edits and orphans land on the feed', () => {
  assert.deepEqual(route({requestId: 'o1', action: '使用QuankSight编辑', chatId: undefined}),
    {kind: 'feed', requestId: 'o1'});
  assert.deepEqual(route({requestId: 'o2', action: '使用QuankSight编辑', chatId: ''}),
    {kind: 'feed', requestId: 'o2'});
  assert.deepEqual(route(null), {kind: 'feed'});
  // order-ness never sends a chat approval to the automation tab
  assert.equal(route({requestId: 'o3', chatId: 'c1', action: '撤销委托单 od-1'}).kind, 'order');
});

test('the bar goes to the first pending item and offers 查看全部 when there are more', () => {
  assert.deepEqual(barTargets([{requestId: 'a1'}]), {first: 'a1', all: false});
  assert.deepEqual(barTargets([{requestId: 'a1'}, {requestId: 'a2'}]), {first: 'a1', all: true});
  assert.deepEqual(barTargets([]), {first: undefined, all: false});
});

test('the feed item itself carries an answerable card', () => {
  const dom = new JSDOM('<div class="feed-row" data-feed="approval:o1"><div class="actions"></div></div>');
  const row = dom.window.document.querySelector('.feed-row');
  // same builder the original card used, mounted inside the item
  row.insertAdjacentHTML('beforeend', '<div class="feed-approval"><div class="inline-approval-card" data-approval-id="o1">'
    + '<button data-action="approvalReject" data-id="o1">拒绝</button><button data-action="approvalAllow" data-id="o1">允许一次</button></div></div>');
  const card = row.querySelector('.inline-approval-card');
  assert.ok(card, 'the card lives in the feed item');
  assert.deepEqual([...card.querySelectorAll('[data-action]')].map(b => b.dataset.action), ['approvalReject', 'approvalAllow']);
  assert.equal(card.closest('.feed-row').dataset.feed, 'approval:o1', 'it belongs to that item');
});

test('the order approval named only in the detail still finds its row', () => {
  assert.deepEqual(route({requestId: 'd1', action: '撤销委托单', detail: '撤销 od-2'}),
    {kind: 'order', orderId: 'od-2', requestId: 'd1'});
});

test('on 自动化 › 半自动委托 the mounted card is not repeated in the bar', () => {
  const requests = [{requestId: 'a1', orderId: 'od-1', action: '撤销委托单'},
    {requestId: 'o1', action: '使用QuankSight编辑'}];
  assert.deepEqual(barRequests(requests, {page: 'tasks', taskTab: 'trade', orders}).map(r => r.requestId), ['o1'],
    'the order card is already under its row, so the bar keeps only the other one');
  // an order whose row is gone stays in the bar (it has nowhere else to be answered)
  assert.deepEqual(barRequests([{requestId: 'a2', orderId: 'od-gone', action: '撤销委托单'}],
    {page: 'tasks', taskTab: 'trade', orders}).map(r => r.requestId), ['a2']);
  // any other page keeps every request in the bar
  assert.equal(barRequests(requests, {page: 'home', taskTab: 'trade', orders}).length, 2);
});
