// [v1.0.4] 工作台首页把没有对话归属的审批（含 5 条已拒绝）全堆在 hero 上方，同一个撤销委托单既在
// 卡片里又在输入框上方的「N 项待授权」条里。首页现在只画条，不画卡；已处理记录只留在所属对话里。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { homeApprovalCards, conversationApprovalCards, approvalBar } from '../src/ui/approval-card.js';

const at = 15 * 60;
const HOME = () => [
  {id: 'p1', requestId: 'p1', agent: 'QuankSight', action: '撤销委托单', time: at, source: '自定义卡片', channel: 'local'},
  {id: 'p2', requestId: 'p2', agent: 'QuankSight', action: '使用QuankSight编辑', time: at, source: '成果中心'},
  ...Array.from({length: 5}, (_, i) => ({id: 'r' + i, requestId: 'r' + i, agent: 'QuankSight', action: '撤销委托单',
    time: at, decision: 'rejected', resolvedAt: at, channel: 'local'})),
];
const requests = () => [...HOME(), {id: 'c1', requestId: 'c1', agent: 'QuankSight', action: '读取网页内容', time: at, chatId: 'chat-1', source: '早报'}];
const action = (label, act, id = '') => `<button data-action="${act}" data-id="${id}">${label}</button>`;

test('home renders no approval cards at all', () => {
  assert.deepEqual(homeApprovalCards(HOME()), [], '2 pending + 5 resolved + 1 chat card all stay off home');
  assert.deepEqual(homeApprovalCards([]), []);
  // nothing on home can be painted as a card, so 0 cards and 0 resolved rows
  const cards = homeApprovalCards(HOME()).map(item => `<div class="inline-approval-card">${item.action}</div>`).join('');
  assert.equal(cards, '');
  assert.equal((cards.match(/inline-approval-card/g) || []).length, 0);
  assert.equal((cards.match(/已拒绝|已允许|已确认/g) || []).length, 0);
});

test('the bar above the input still counts the pending ones', () => {
  const html = approvalBar(HOME(), '', action);
  assert.match(html, /2 项待授权/, 'two pending approvals, resolved rows excluded');
  assert.ok(!/已拒绝/.test(html), 'the bar never names resolved records');
  assert.match(html, /前往授权/);
  // and it is the only place home shows them
  assert.equal(homeApprovalCards(HOME()).length, 0);
});

test('a conversation still shows its own approval card', () => {
  const mine = conversationApprovalCards(requests(), 'chat-1');
  assert.deepEqual(mine.map(item => item.id), ['c1']);
  assert.ok(!mine.some(item => !item.chatId), 'approvals from other pages do not leak into a conversation');
  // no chat selected (home, library, automation…) draws none of them
  assert.deepEqual(conversationApprovalCards(requests(), ''), []);
  assert.deepEqual(conversationApprovalCards(requests(), undefined), []);
});

test('app.js sends home and conversation through these two functions only', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /const cards = homeApprovalCards\(approvalRequests\(\)\);/);
  assert.ok(!/approvalRequests\(\)\.filter\(item => !item\.codingTaskId/.test(app), 'the old home filter is gone');
  assert.match(app, /conversationApprovalCards\(approvalRequests\(\), chatId\)/);
  assert.ok(!/approvalRequests\(\)\.filter\(item => chatId \? item\.chatId === chatId/.test(app), 'the old unscoped filter is gone');
});
