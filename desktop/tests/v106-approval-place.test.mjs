// [v1.0.6] A pending approval in a conversation is drawn under the live steps (where the run waits),
// resolved rows stay in place, and the bar above the input does not repeat this conversation's cards.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {conversationContent} from '../src/ui/workspace.js';
import {approvalBar} from '../src/ui/approval-card.js';

const action = (label, id, data = '') => `<button data-action="${id}" data-id="${data}">${label}</button>`;
const base = (status) => ({
  state: {chats: [{id: 'c1', name: '每日行业研报', run: {id: 'r1', status}, messages: [{role: 'user', content: '建个定时任务', runId: 'r1'}]}], documents: []},
  chatId: 'c1', pending: false, previewTabs: [], icon: () => '', composer: () => '<form id="composer"></form>', action,
  date: () => '', taskStatus: () => '', trace: () => '<section class="trace">执行过程</section>',
  executionRecords: () => [{status: 'running'}], executionRow: () => '', rich: s => s,
  approvalCards: '<div class="resolved">已允许一次</div>', pendingApprovalCards: '<div class="pending">需要你的授权</div>',
});

test('while the run is live the pending card follows the execution steps and precedes the wait line', () => {
  const html = conversationContent(base('running'));
  const trace = html.indexOf('class="trace"'), card = html.indexOf('class="pending"'), wait = html.indexOf('run-wait');
  assert.ok(trace >= 0 && card > trace && wait > card, 'trace < pending card < run-wait');
  assert.equal(html.split('class="pending"').length - 1, 1, 'pending card drawn once');
  assert.ok(html.indexOf('class="resolved"') < trace, 'resolved row stays above the steps');
});

test('when the run is not live the pending card is still shown once', () => {
  const html = conversationContent(base('completed'));
  assert.equal(html.split('class="pending"').length - 1, 1);
});

test('the bar does not repeat approvals of the open conversation', () => {
  const requests = [
    {requestId: 'a', chatId: 'c1', agent: 'QuankSight 助手', action: '创建定时任务', time: 1},
    {requestId: 'b', chatId: 'c2', agent: 'QuankSight 助手', action: '读取网页内容', source: '另一个对话', time: 2},
  ];
  const inChat = approvalBar(requests, 'c1', action);
  assert.doesNotMatch(inChat, /创建定时任务/);
  assert.match(inChat, /读取网页内容/);
  assert.equal(approvalBar(requests.slice(0, 1), 'c1', action), '');
  assert.match(approvalBar(requests, '', action), /2 项待授权/);
});

test('app.js passes resolved and pending conversation cards separately', () => {
  const src = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(src, /pendingApprovalCards: own\.filter\(item => !item\.decision\)/);
  assert.match(src, /approvalCards: own\.filter\(item => item\.decision\)/);
});
