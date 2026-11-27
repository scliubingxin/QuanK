// [v1.0.4] 半自动委托 row buttons handed their confirmation to the conversation-only card list,
// so the card was never drawn on the automation page and the buttons looked dead.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { orderRow } from '../src/ui/trade.js';
import { mountOrderApprovals, revealOrderApproval } from '../src/ui/order-approval.js';

const setup = () => {
  const dom = new JSDOM('<ul id="app"><li class="td-row" data-order="o-1">下单（打开券商）撤销</li></ul>');
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, Node: dom.window.Node });
  return dom.window.document.getElementById('app');
};
const card = (requestId, orderId) => ({ requestId, orderId, action: '下单', summary: '买入 贵州茅台' });
const render = c => `<div class="inline-approval-card" data-approval-id="${c.requestId}">${c.action}</div>`;

test('the action buttons live on the row and it carries the order id', () => {
  const html = orderRow({ id: 'o-9', side: 'buy', status: 'draft', mode: 'real', name: '贵州茅台', code: '600519', shares: 100, price: 1500, amount: 150000 });
  assert.match(html, /^<li class="td-row td-buy td-draft" data-order="o-9">/, 'the row is addressable by order id');
  assert.match(html, /data-action="tdConfirm" data-id="o-9"/);
  assert.match(html, /data-action="tdCancel" data-id="o-9"/);
  // 「待确认」 is a status pill, not a control
  assert.match(html, /<span class="sec-pill warn">[^<]*<\/span>/);
  assert.ok(!/<button[^>]*data-action="[^"]*"[^>]*>待确认/.test(html), 'the status is never a button');
});

test('the confirmation card is mounted under its own order row', () => {
  const root = setup();
  const mounted = mountOrderApprovals(root, [card('r1', 'o-1')], render);
  assert.deepEqual(mounted, ['r1']);
  const holder = root.querySelector('.td-approval-row');
  assert.ok(holder, 'a holder row exists');
  assert.equal(holder.previousElementSibling.dataset.order, 'o-1', 'it sits right after the order row');
  assert.ok(holder.querySelector('[data-approval-id="r1"]'), 'the card is inside it');
});

test('a second click does not stack a duplicate card', () => {
  const root = setup();
  mountOrderApprovals(root, [card('r1', 'o-1')], render);
  mountOrderApprovals(root, [card('r1', 'o-1')], render);
  assert.equal(root.querySelectorAll('.td-approval-row').length, 1);
  // An existing card is revealed instead of ignored.
  assert.equal(revealOrderApproval(root, 'r1'), true);
  assert.equal(revealOrderApproval(root, 'missing'), false);
});

test('cards without a matching order row stay off the order list', () => {
  const root = setup();
  assert.deepEqual(mountOrderApprovals(root, [card('r2', 'o-other')], render), []);
  assert.deepEqual(mountOrderApprovals(root, [{ requestId: 'r3' }], render), [], 'no orderId, no mount');
  assert.equal(root.querySelectorAll('.td-approval-row').length, 0);
});

test('a bare list without rows is left untouched', () => {
  assert.deepEqual(mountOrderApprovals(null, [card('r4', 'o-1')], render), []);
});
