// [p2-m3] Activity feed: aggregation, unread/dismiss state, filters and page markup.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../core.mjs';
import {buildFeed, visibleFeed, feedUnread, applyFeedAction, DISMISS_LIMIT} from '../src/shared/feed.js';
import {feedPage} from '../src/ui/feed.js';
import {createWorkspaceService} from '../services/workspace.mjs';

function demo() {
  const s = initialState();
  s.chats = [
    {id: 'c-task', name: '早报', messages: [], taskId: 't1'},
    {id: 'c-r', name: '储能', time: 50, messages: [], plan: {id: 'p-r', kind: 'research', goal: '储能市场', status: 'done', finished: 300, sources: ['a', 'b'], report: {id: 'doc1', name: 'R'}, steps: [{status: 'done'}, {status: 'done'}]}},
    {id: 'c-p', name: '入职', messages: [], plan: {id: 'p-p', goal: '入职清单', status: 'failed', finished: 250, steps: [{status: 'done'}, {status: 'failed'}]}},
    {id: 'c-draft', name: '草稿', messages: [], plan: {id: 'p-d', goal: 'x', status: 'draft', steps: []}},
    {id: 'c-bg', name: '后台对话', finishedAt: 200, messages: [{role: 'assistant', content: '整理好了'}]},
    {id: 'c-inc', name: '无痕', incognito: true, finishedAt: 400, messages: []},
  ];
  s.tasks = [
    {id: 't1', mode: 'agent', name: '早报', chatId: 'c-task', status: 'failed', error: '网络错误', history: [{id: 'r2', at: 500, status: 'failed', error: '网络错误'}, {id: 'r1', at: 100, ms: 10, status: 'done', pending: 2}]},
    {id: 't2', name: '旧任务', status: 'done', lastRun: 150, result: '旧结果'},
    {id: 't3', mode: 'agent', name: '运行中', status: 'running', history: [{id: 'r', at: 600, status: 'running'}]},
  ];
  s.pendingApprovals = [{id: 'a1', time: 450, chatId: 'c-task', taskId: 't1', tool: 'browser_read', title: '读取网页内容', detail: 'd', candidate: {label: '网站 https://a.com'}}];
  s.activity = [{id: 'l1', title: '已授权文件夹', detail: '项目资料', time: 120}, {id: 'l2', title: '任务已完成', detail: '早报', time: 121}];
  return s;
}

test('feed aggregates tasks, approvals, research, plans, background chats and the log', () => {
  const items = buildFeed(demo());
  const ids = items.map(x => x.id);
  assert.deepEqual(ids, ['task:t1:r2', 'approval:a1', 'plan:p-r', 'plan:p-p', 'chat:c-bg:200', 'task:t2:last', 'log:l1', 'task:t1:r1'], 'newest first; drafts, running runs, incognito chats and structured log lines are skipped');
  const failed = items[0];
  assert.equal(failed.title, '任务失败：早报'); assert.equal(failed.needsAction, true);
  assert.deepEqual(failed.actions.map(a => a.action), ['openChat', 'runTask']);
  assert.equal(items.find(x => x.id === 'task:t1:r1').detail, '完成，有 2 项操作等你确认');
  assert.equal(items.find(x => x.id === 'task:t1:r1').time, 110);
  assert.equal(items.find(x => x.id === 'task:t1:r1').actions.some(a => a.action === 'runTask'), false, 'only the latest failure offers a retry');
  const approval = items.find(x => x.kind === 'approval');
  assert.deepEqual(approval.actions.map(a => a.action), ['allowPending', 'openChat', 'dismissPending']); assert.match(approval.detail, /早报 · 网站/);
  const research = items.find(x => x.id === 'plan:p-r');
  assert.equal(research.title, '深度研究完成：储能市场'); assert.match(research.detail, /2 个来源 · 报告已存入成果中心/);
  assert.equal(research.actions[0].action, 'documentWordEditor'); assert.equal(research.actions[0].id, 'doc1');
  assert.equal(items.find(x => x.id === 'plan:p-p').title, '计划未完成：入职清单');
  assert.deepEqual(items.find(x => x.id === 'task:t2:last').actions.map(a => a.action), ['taskResult']);
});

test('unread, filters and dismiss/seen/restore state', () => {
  const s = demo();
  assert.equal(feedUnread(s), 7, 'logs never count as unread');
  s.feed = applyFeedAction(s, {action: 'seen'}, 1000);
  assert.deepEqual(visibleFeed(s, 'unread').map(x => x.id), ['task:t1:r2', 'approval:a1'], 'items that need action stay unread');
  assert.deepEqual(visibleFeed(s, 'action').map(x => x.id), ['task:t1:r2', 'approval:a1']);
  assert.deepEqual(visibleFeed(s, 'research').map(x => x.kind), ['research', 'plan']);
  assert.deepEqual(visibleFeed(s, 'log').map(x => x.id), ['log:l1']);
  s.feed = applyFeedAction(s, {action: 'dismiss', id: 'plan:p-p'});
  assert.ok(!visibleFeed(s).some(x => x.id === 'plan:p-p'));
  s.feed = applyFeedAction(s, {action: 'dismiss', id: 'plan:p-p'});
  assert.equal(s.feed.dismissed.length, 1, 'no duplicates');
  s.feed = applyFeedAction(s, {action: 'seen', at: 10}, 2000);
  assert.equal(s.feed.seenAt, 1000, 'seen never moves backwards');
  s.feed = applyFeedAction(s, {action: 'restore'}); assert.equal(s.feed.dismissed.length, 0);
  for (let i = 0; i < DISMISS_LIMIT + 5; i++) s.feed = applyFeedAction(s, {action: 'dismiss', id: 'x' + i});
  assert.equal(s.feed.dismissed.length, DISMISS_LIMIT);
  assert.throws(() => applyFeedAction(s, {action: 'dismiss', id: ''}), /不存在/);
  assert.throws(() => applyFeedAction(s, {action: 'boom'}), /未知操作/);
});

test('workspace feed handler persists state', async () => {
  const store = {data: demo(), save: async () => { store.saved = (store.saved || 0) + 1; }};
  const w = createWorkspaceService({store, active: new Map(), view: () => store.data});
  await w.feed({action: 'seen', at: 999});
  await w.feed({action: 'dismiss', id: 'log:l1'});
  assert.deepEqual(store.data.feed, {seenAt: 999, dismissed: ['log:l1']}); assert.equal(store.saved, 2);
  await assert.rejects(w.feed({action: 'nope'}), /未知操作/);
});

test('feed page markup', () => {
  const action = (l, a, id = '', k = '') => `<button data-action="${a}" data-id="${id}" class="${k}">${l}</button>`;
  const ctx = {action, date: () => 'D', heading: (a, b, c, d) => `<h1>${b}</h1><p>${c}</p>${d}`, empty: (a, b) => `<div class="empty">${a}${b}</div>`};
  const s = demo();
  const html = feedPage(s, {...ctx});
  assert.match(html, /当前有 2 项需要处理/); assert.match(html, /需要处理 <small>2/);
  assert.match(html, /class="feed-row fk-task fs-failed unread"/); // [ux9] prefixed classes assert.match(html, /data-action="runTask" data-id="t1"/);
  assert.match(html, /data-action="feedDismiss" data-id="plan:p-r"/); assert.doesNotMatch(html, /feedDismiss" data-id="approval/);
  s.feed = {seenAt: 0, dismissed: ['plan:p-r']};
  assert.match(feedPage(s, ctx), /恢复已移除（1）/);
  assert.match(feedPage(s, {...ctx, filter: 'research'}), /计划未完成/);
  assert.match(feedPage(initialState(), ctx), /工作空间已准备好/);
});
