// [v1.0.5] 「前往授权」 on an order approval: the card must be mounted under its row for stored approvals
// too, and the reveal must survive the re-render that paints the order list.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {orderApprovalCards} from '../src/shared/approval-route.js';

const orders = [{id: 'od-demo-a', status: 'draft'}, {id: 'od-demo-b', status: 'draft'}];

test('stored order approvals become cards under their row', () => {
  const requests = [
    {requestId: 'pend-ord', action: '撤销委托单', detail: '撤销 od-demo-a'},
    {requestId: 'pend-id', action: '下单', orderId: 'od-demo-b'},
    {requestId: 'pend-off', action: '使用QuankSight编辑', detail: '字体测试稿.pptx'},
    {requestId: 'done', action: '撤销委托单', detail: '撤销 od-demo-a', decision: 'deny'},
    {requestId: 'gone', action: '撤销委托单', orderId: 'od-expired'},
  ];
  const cards = orderApprovalCards({requests, orders});
  assert.deepEqual(cards.map(c => [c.requestId, c.orderId]), [['pend-ord', 'od-demo-a'], ['pend-id', 'od-demo-b']]);
});

test('local cards keep their place and are not duplicated by the stored copy', () => {
  const local = [{requestId: 'loc-1', orderId: 'od-demo-a', decision: 'allow'}, {requestId: 'loc-2'}];
  const requests = [{requestId: 'loc-1', action: '撤销委托单', orderId: 'od-demo-a', channel: 'local'}];
  const cards = orderApprovalCards({local, requests, orders});
  assert.deepEqual(cards.map(c => c.requestId), ['loc-1']);
});

test('app.js re-mounts order cards and re-applies the reveal after every render', () => {
  const src = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(src, /renderPanel\(\); \/\/ \[v0\.54\]\n\s*mountOrderCards\(\); applyOrderReveal\(\);/);
  assert.match(src, /orderApprovalCards\(\{/);
  const branch = src.slice(src.indexOf("if (route.kind === 'order')"), src.indexOf("if (route.kind === 'coding')"));
  assert.match(branch, /orderReveal = \{/);
  assert.doesNotMatch(branch, /requestAnimationFrame/);
});
