// [p2-m5] Task center: running/queued view, today's occurrences, recent runs, skip-next and the panel.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../core.mjs';
import {taskCenter, todayOccurrences, skipNext} from '../src/shared/taskcenter.js';
import {taskCenterPanel} from '../src/ui/taskcenter.js';
import {createWorkspaceService} from '../services/workspace.mjs';

const local = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = local(2026, 11, 19, 10, 0), H = 3600e3;

function demo() {
  const s = initialState();
  s.tasks = [
    {id: 'h', mode: 'agent', name: '每3小时', enabled: true, status: 'done', schedule: {kind: 'hourly', every: 3}, nextRun: local(2026, 11, 19, 12, 0), chatId: 'c-h',
      history: [{id: 'r2', at: NOW - H, status: 'failed', error: 'x'}, {id: 'r1', at: NOW - 4 * H, status: 'done', ms: 4200, pending: 1}, {id: 'old', at: NOW - 30 * H, status: 'done'}]},
    {id: 'd', mode: 'agent', name: '早报', enabled: true, status: 'running', schedule: {kind: 'daily', time: '09:00'}, nextRun: local(2026, 11, 20, 9), lastRun: NOW - 60e3, chatId: 'c-d', history: [{id: 'live', at: NOW - 60e3, status: 'running'}]},
    {id: 'o', mode: 'agent', name: '仅一次', enabled: true, status: 'ready', schedule: {kind: 'once', at: NOW - 5 * 60e3}, nextRun: NOW - 5 * 60e3},
    {id: 'p', mode: 'agent', name: '暂停的', enabled: false, status: 'ready', schedule: {kind: 'daily', time: '11:00'}, nextRun: null},
    {id: 'l', name: '旧任务', enabled: true, status: 'ready', nextRun: local(2026, 11, 19, 15, 30)},
  ];
  s.runJobs = [
    {id: 'j1', kind: 'conversation', ownerId: 'chat-x', label: '写周报', status: 'running', createdAt: NOW - 120e3},
    {id: 'j2', kind: 'task', ownerId: 'l', label: '旧任务', status: 'queued', createdAt: NOW - 30e3},
    {id: 'j3', kind: 'conversation', ownerId: 'c-old', label: '已完成', status: 'completed', createdAt: NOW - H},
  ];
  s.chats = [{id: 'c-h', name: 'h', messages: []}];
  return s;
}

test("today's occurrences expand repeating schedules until midnight", () => {
  const occ = todayOccurrences(demo().tasks, NOW);
  assert.deepEqual(occ.map(o => [o.name, new Date(o.at).getHours(), o.overdue, o.first]), [
    ['仅一次', 9, true, true], ['每3小时', 12, false, true], ['每3小时', 15, false, false], ['旧任务', 15, false, true], ['每3小时', 18, false, false], ['每3小时', 21, false, false]]);
  assert.equal(todayOccurrences([{id: 'x', enabled: true, schedule: {kind: 'hourly', every: 1}, nextRun: NOW}], NOW, 5).length, 5, 'bounded');
});

test('task center: running, queued, stats and recent runs', () => {
  const c = taskCenter(demo(), NOW);
  assert.deepEqual(c.running.map(r => [r.label, r.cancel.action]), [['写周报', 'cancelRun'], ['早报', 'cancelTask']]);
  assert.deepEqual(c.queued.map(r => r.id), ['j2']);
  assert.deepEqual(c.recent.map(r => r.id), ['r2', 'r1', 'old'], 'live runs are not "recent"');
  assert.deepEqual(c.stats, {running: 2, queued: 1, today: 6, done24: 1, failed24: 1});
  const s = demo(); s.runJobs.push({id: 'j4', kind: 'conversation', ownerId: 'c-d', label: '早报', status: 'running', createdAt: NOW});
  assert.equal(taskCenter(s, NOW).running.filter(r => r.label === '早报').length, 1, 'agent task already visible through its queue job is not listed twice');
});

test('skip next: repeating, once, legacy and guards', () => {
  const s = demo();
  const h = skipNext(s.tasks[0], NOW);
  assert.equal(h.nextRun, local(2026, 11, 19, 15)); assert.equal(h.history[0].status, 'skipped'); assert.equal(h.history[0].at, local(2026, 11, 19, 12));
  const o = skipNext(s.tasks[2], NOW); assert.equal(o.enabled, false); assert.equal(o.nextRun, null);
  const l = skipNext(s.tasks[4], NOW); assert.equal(l.nextRun, local(2026, 11, 20, 15, 30));
  assert.throws(() => skipNext(s.tasks[1], NOW), /正在执行/);
  assert.throws(() => skipNext(s.tasks[3], NOW), /没有待执行/);
  const late = {enabled: true, status: 'ready', schedule: {kind: 'hourly', every: 1}, nextRun: NOW - 5 * H};
  assert.ok(skipNext(late, NOW).nextRun > NOW, 'never lands in the past');
});

test('workspace skip handler persists', async () => {
  const store = {data: demo(), save: async () => { store.saved = true; }};
  const w = createWorkspaceService({store, active: new Map(), view: () => store.data});
  await w.task({id: 'h', skipNext: true});
  assert.equal(store.data.tasks[0].history[0].status, 'skipped'); assert.equal(store.saved, true);
  await assert.rejects(w.task({id: 'p', skipNext: true}), /没有待执行/);
});

test('task center panel', () => {
  const action = (l, a, id = '', k = '') => `<button data-action="${a}" data-id="${id}" class="${k}">${l}</button>`;
  const html = taskCenterPanel(demo(), {action, date: () => 'D', now: NOW});
  assert.match(html, /<b>2<\/b><small>执行中/); assert.match(html, /<b>6<\/b><small>今天还会运行/);
  assert.match(html, /data-action="cancelRun" data-id="j1"/); assert.match(html, /data-action="cancelTask" data-id="d"/);
  assert.match(html, /09:55<\/span><span class="tc-label">仅一次<\/span><small>已到期/);
  assert.match(html, /data-action="skipTask" data-id="h"/); assert.equal((html.match(/skipTask" data-id="h"/g) || []).length, 1, 'skip only on the next occurrence');
  assert.match(html, /data-action="runTask" data-id="h"/); assert.match(html, /4 秒 · 1 项待确认/);
  assert.match(taskCenterPanel(initialState(), {action, date: () => 'D', now: NOW}), /没有正在执行或排队的任务/);
});
