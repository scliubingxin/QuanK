// [v1.0.4] 「全部标为已读」 left the hero at 16 项待处理 / 16 条未读 and the briefing at 无, because the
// three numbers were computed in three places: the hero counted needsAction as unread, the toast counted
// only feed items (never orders), and the briefing read a stale snapshot.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { feedCounts, feedUnread, visibleFeed, applyFeedAction } from '../src/shared/feed.js';
import { buildBriefing } from '../src/shared/briefing.js';
import { feedPage } from '../src/ui/feed.js';
import { briefingCard } from '../src/ui/briefing.js';

const now = Date.now();
const ORDERS = [
  {id: 'o1', status: 'draft', mode: 'real', side: 'buy', name: '贵州茅台', code: '600519', shares: 100, price: 1500, created: now - 1000},
  {id: 'o2', status: 'awaiting', mode: 'real', side: 'sell', name: '宁德时代', code: '300750', shares: 200, price: 180, created: now - 2000},
  {id: 'o3', status: 'filled', mode: 'paper', side: 'buy', name: '已成交', code: '600000', shares: 100, price: 10, created: now - 3000},
];
const state = () => ({
  trade: {orders: ORDERS, settings: {mode: 'real'}},
  approvalFeed: [{requestId: 'a1', action: '撤销委托单', time: now - 500, source: 'QuankSight'}],
  tasks: [{id: 't1', name: '收盘复盘', status: 'failed', history: [{at: now - 800, status: 'failed', error: '超时', ms: 0}]}],
  chats: [], feed: {}, documents: [], artifacts: [], connectors: [], connectorItems: [], quant: {},
});
const strip = html => html.replace(/<[^>]+>/g, ' ');

test('pending counts approvals, orders waiting for you and failed tasks', () => {
  const s = state();
  const counts = feedCounts(s);
  assert.equal(counts.pending, 4, '1 approval + 2 orders (draft/awaiting) + 1 failed task');
  assert.deepEqual(counts.items.filter(x => x.kind === 'order').map(x => x.id), ['order:o1', 'order:o2']);
  assert.ok(!counts.items.some(x => x.id === 'order:o3'), 'a filled order is not pending');
  assert.equal(counts.items.find(x => x.kind === 'order').actions[0].action, 'tradeHome');
  assert.equal(counts.items.find(x => x.kind === 'order').actions[0].label, '查看委托单');
});

test('the hero, the sidebar badge and the toast read the same numbers', () => {
  const s = state();
  const counts = feedCounts(s);
  const html = feedPage(s, {action: (label, act, id) => `<button data-action="${act}">${label}</button>`, date: () => '', heading: () => '', empty: '', filter: 'important'});
  const hero = html.slice(0, html.indexOf('fd-card'));
  const pending = Number(hero.match(/(\d+)\D{0,40}项待处理/)[1]);
  const unread = Number(hero.match(/(\d+)\D{0,40}条未读/)[1]);
  assert.equal(pending, counts.pending, 'hero 项待处理 equals feedCounts().pending');
  assert.equal(unread, counts.unread, 'hero 条未读 equals feedCounts().unread');
  // the sidebar badge is feedUnread(approvalFeedState())
  assert.equal(feedUnread(s), counts.unread);
  // 需要处理 is the pending number too
  assert.match(html, new RegExp('需要处理[\\s\\S]{0,60}?' + counts.pending + '|' + counts.pending + '[^\\d]{0,20}需要处理'));
  // and every row in that filter is one of the pending items
  assert.equal(visibleFeed(s, 'action').length, counts.pending);
});

test('marking all as read zeroes unread but keeps what still needs action', () => {
  const s = state();
  assert.ok(feedCounts(s).unread > 0, 'there is something unread to begin with');
  s.feed = applyFeedAction(s, {action: 'seen', at: now});
  const after = feedCounts(s);
  assert.equal(after.unread, 0, '未读 is 0 after 全部标为已读');
  assert.equal(feedUnread(s), 0, 'the sidebar badge disappears');
  assert.equal(after.pending, 4, 'what needs handling is still listed');
  assert.deepEqual(visibleFeed(s, 'unread'), []);
});

test('the briefing 需要你处理 section is live, not the stale snapshot', () => {
  const s = {...state(), briefings: [{time: now - 6 * 864e5, sections: [{id: 'attention', title: '需要你处理', items: []},
    {id: 'done', title: '上次简报以来完成', items: [{text: '任务完成：收盘复盘'}]}]}]};
  const live = feedCounts(s).items.slice(0, 5);
  assert.ok(live.length >= 3, 'the live feed has pending items');
  const card = briefingCard(s, {action: () => ''});
  const attention = card.slice(card.indexOf('briefing-section attention'), card.indexOf('briefing-section done'));
  assert.ok(!/empty-note/.test(attention), 'the attention section is not 无');
  assert.match(attention, /待确认委托单/, 'pending orders are listed');
  const built = buildBriefing(s).sections.find(sec => sec.id === 'attention').items;
  assert.equal(built.find(x => x.action === 'tradeHome').label, '查看委托单', 'orders get their own action label');
  assert.equal(built.find(x => x.action === 'approvalJump').label, '前往授权', 'approvals link to their approval');
  assert.ok(built.some(x => x.action === 'tradeHome' && /委托单/.test(x.text)), 'orders route to 自动化 › 半自动委托');
  assert.ok(!/任务完成：收盘复盘/.test(attention), 'other columns still come from the snapshot');
  assert.match(card, /任务完成：收盘复盘/, 'the snapshot的 done column is kept');
  assert.ok(built.length > 0 && built.length <= 5, 'the section lists up to five live pending items');
  assert.ok(built.length > 0, 'the attention section is never empty while items are pending');
  assert.ok(!strip(attention).includes('无'));
});
