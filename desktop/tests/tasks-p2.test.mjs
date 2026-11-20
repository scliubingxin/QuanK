// [p2-m1] Scheduled tasks: cadence math, validation, agent-mode runs through the conversation pipeline, UI builders.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../core.mjs';
import {normalizeSchedule, nextRunAt, describeSchedule} from '../src/shared/schedule.js';
import {createTaskService} from '../services/tasks.mjs';
import {createWorkspaceService} from '../services/workspace.mjs';
import {taskForm, taskCards, taskPayload} from '../src/ui/tasks.js';

const local = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

test('cadence: next occurrence for every schedule kind, in local time', () => {
  // 2026-11-18 is a Wednesday
  const wed10 = local(2026, 11, 18, 10, 0);
  assert.equal(nextRunAt({kind: 'daily', time: '09:00'}, wed10), local(2026, 11, 19, 9));
  assert.equal(nextRunAt({kind: 'daily', time: '11:30'}, wed10), local(2026, 11, 18, 11, 30));
  assert.equal(nextRunAt({kind: 'weekdays', time: '09:00'}, local(2026, 11, 20, 10)), local(2026, 11, 23, 9), 'Friday after 9 → Monday');
  assert.equal(nextRunAt({kind: 'weekly', time: '08:00', days: [1, 3]}, wed10), local(2026, 11, 23, 8));
  assert.equal(nextRunAt({kind: 'weekly', time: '18:00', days: [3]}, wed10), local(2026, 11, 18, 18));
  assert.equal(nextRunAt({kind: 'hourly', every: 3}, wed10), wed10 + 3 * 3600e3);
  assert.equal(nextRunAt({kind: 'once', at: wed10 + 60e3}, wed10), wed10 + 60e3);
  assert.equal(nextRunAt({kind: 'once', at: wed10 - 1}, wed10), null);
  assert.equal(nextRunAt({kind: 'manual'}, wed10), null);
  assert.equal(nextRunAt(undefined, wed10), local(2026, 11, 19, 10), 'legacy tasks keep the next-day rule');
  assert.equal(nextRunAt({kind: 'daily', time: '10:00'}, wed10), local(2026, 11, 19, 10), 'exactly now is not "next"');
});

test('schedule validation and descriptions', () => {
  assert.deepEqual(normalizeSchedule({kind: 'weekly', time: '09:05', days: ['3', 1, 1, 9]}), {kind: 'weekly', time: '09:05', days: [1, 3]});
  assert.deepEqual(normalizeSchedule({kind: 'hourly', every: '6'}), {kind: 'hourly', every: 6});
  assert.equal(normalizeSchedule({kind: 'once', at: '2026-11-20T09:00'}).at, local(2026, 11, 20, 9));
  for (const bad of [null, [], {kind: 'yearly'}, {kind: 'daily', time: '25:00'}, {kind: 'weekly', time: '09:00', days: []}, {kind: 'hourly', every: 0}, {kind: 'hourly', every: 1.5}, {kind: 'once', at: 'x'}]) assert.throws(() => normalizeSchedule(bad));
  assert.equal(describeSchedule({kind: 'weekly', time: '08:00', days: [1, 3, 5]}), '每周一、三、五 08:00');
  assert.equal(describeSchedule({kind: 'weekdays', time: '09:00'}), '工作日 09:00');
  assert.equal(describeSchedule({kind: 'hourly', every: 2}), '每 2 小时');
  assert.match(describeSchedule({kind: 'once', at: local(2026, 11, 20, 9)}), /仅一次 · 11月20日 09:00/);
  assert.equal(describeSchedule(undefined), '每日执行（自创建时刻起）');
});

function fixture({reply = () => ({content: '早报内容'}), throwRun} = {}) {
  const store = {data: initialState(), save: async () => {}, log: () => {}};
  const runs = [], cancels = [];
  const conversations = {
    run: async p => {
      runs.push(p);
      if (throwRun) throw new Error(throwRun);
      let chat = store.data.chats.find(c => c.id === p.id);
      if (!chat) { chat = {id: p.id, name: p.prompt.slice(0, 36), messages: []}; store.data.chats.unshift(chat); }
      const r = await reply(runs.length, p);
      chat.messages.push({role: 'user', content: p.prompt}, {role: 'assistant', content: r.content, ...(r.error ? {error: true} : {})});
      return {};
    },
    cancel: async id => { cancels.push(id); },
  };
  const active = new Map(), view = () => store.data;
  return {store, runs, cancels, conversations, workspace: createWorkspaceService({store, active, view}), tasks: createTaskService({store, active, view, key: () => '', conversations})};
}

test('workspace: create, edit and toggle agent tasks with validation', async () => {
  const f = fixture();
  await f.workspace.task({name: '早报', prompt: '整理新闻', agentId: 'research', toolsEnabled: true, schedule: {kind: 'daily', time: '09:00'}});
  const t = f.store.data.tasks[0];
  assert.equal(t.mode, 'agent'); assert.equal(t.agentId, 'research'); assert.equal(t.toolsEnabled, true); assert.equal(t.enabled, true);
  assert.ok(t.nextRun > Date.now()); assert.equal(new Date(t.nextRun).getHours(), 9);
  await f.workspace.task({id: t.id, edit: true, name: '周报', prompt: '写周报', agentId: 'writer', schedule: {kind: 'manual'}});
  assert.equal(t.name, '周报'); assert.equal(t.agentId, 'writer'); assert.equal(t.enabled, false); assert.equal(t.nextRun, null); assert.equal(t.toolsEnabled, false);
  await assert.rejects(f.workspace.task({id: t.id, enabled: true}), /仅手动运行/);
  await f.workspace.task({id: t.id, edit: true, name: '周报', prompt: '写周报', agentId: 'writer', schedule: {kind: 'weekly', time: '17:00', days: [5]}});
  assert.equal(new Date(t.nextRun).getDay(), 5);
  await f.workspace.task({id: t.id, enabled: false}); assert.equal(t.nextRun, null);
  await assert.rejects(f.workspace.task({name: 'x', prompt: 'y', agentId: 'nobody', schedule: {kind: 'manual'}}), /智能体不存在/);
  await assert.rejects(f.workspace.task({name: 'x', prompt: 'y', schedule: {kind: 'once', at: Date.now() - 1000}}), /已过去/);
  await f.workspace.task({name: '旧式', prompt: '提示', enabled: true});
  assert.equal(f.store.data.tasks[0].mode, undefined, 'legacy payload keeps the legacy model-only task');
});

test('agent task runs as a turn of its own conversation and records history', async () => {
  const f = fixture();
  await f.workspace.task({name: '早报', prompt: '整理新闻', agentId: 'research', toolsEnabled: true, schedule: {kind: 'manual'}});
  const t = f.store.data.tasks[0];
  await f.tasks.run(t.id);
  assert.equal(f.runs.length, 1);
  assert.deepEqual({agentId: f.runs[0].agentId, toolsEnabled: f.runs[0].toolsEnabled, prompt: f.runs[0].prompt}, {agentId: 'research', toolsEnabled: true, prompt: '整理新闻'});
  const chat = f.store.data.chats.find(c => c.id === t.chatId);
  assert.equal(chat.name, '早报'); assert.equal(chat.taskId, t.id);
  assert.equal(t.status, 'done'); assert.equal(t.result, '早报内容'); assert.equal(t.history[0].status, 'done'); assert.equal(t.history[0].trigger, 'manual');
  assert.equal(f.store.data.artifacts[0].chatId, t.chatId);
  await f.tasks.run(t.id);
  assert.equal(f.runs[1].id, t.chatId, 'later runs continue the same conversation');
  assert.equal(t.history.length, 2);
});

test('scheduled run: due check, next occurrence, once disables itself; failures are recorded', async () => {
  const f = fixture({reply: n => n === 2 ? {content: '模型请求失败', error: true} : {content: 'ok'}});
  await f.workspace.task({name: '一次', prompt: 'p', schedule: {kind: 'once', at: Date.now() + 60e3}});
  const once = f.store.data.tasks[0];
  await assert.rejects(f.tasks.run(once.id, {scheduledFor: once.nextRun}), /尚未到期/);
  once.nextRun = once.schedule.at = Date.now() - 10;
  await f.tasks.run(once.id, {scheduledFor: once.nextRun});
  assert.equal(once.enabled, false); assert.equal(once.nextRun, null); assert.equal(once.history[0].trigger, 'schedule');
  await f.workspace.task({name: '每小时', prompt: 'p', schedule: {kind: 'hourly', every: 2}});
  const hourly = f.store.data.tasks[0]; hourly.nextRun = Date.now() - 10;
  const before = Date.now();
  await f.tasks.run(hourly.id, {scheduledFor: hourly.nextRun});
  assert.equal(hourly.status, 'failed'); assert.match(hourly.error, /模型请求失败/); assert.equal(hourly.history[0].status, 'failed');
  assert.ok(hourly.nextRun >= before + 2 * 3600e3 - 1000, 'next run computed from now, no catch-up burst');
});

test('cancel, conversation errors, deleted agents and restart recovery', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const f = fixture({reply: async () => { await gate; return {content: 'late'}; }});
  await f.workspace.task({name: '长任务', prompt: 'p', schedule: {kind: 'manual'}});
  const t = f.store.data.tasks[0];
  const running = f.tasks.run(t.id);
  await new Promise(r => setTimeout(r, 5));
  assert.equal(t.status, 'running'); assert.ok(f.tasks.isRunning(t.id));
  await assert.rejects(f.tasks.run(t.id), /正在执行/);
  await assert.rejects(f.workspace.task({id: t.id, remove: false, enabled: true}), /先停止/);
  await f.tasks.cancel(t.id); assert.deepEqual(f.cancels, [t.chatId]);
  release(); await running;
  assert.equal(f.tasks.isRunning(t.id), false);
  const g = fixture({throwRun: '请求正在执行或排队，请先停止'});
  await g.workspace.task({name: 'x', prompt: 'p', schedule: {kind: 'manual'}});
  await g.tasks.run(g.store.data.tasks[0].id);
  assert.equal(g.store.data.tasks[0].status, 'failed'); assert.match(g.store.data.tasks[0].error, /请先停止/);
  g.store.data.tasks[0].agentId = 'gone';
  await assert.rejects(g.tasks.run(g.store.data.tasks[0].id), /智能体已删除/);
  const h = fixture();
  h.store.data.tasks = [{id: 'r', mode: 'agent', name: 'n', prompt: 'p', agentId: 'assistant', status: 'running'}];
  createTaskService({store: h.store, active: new Map(), view: () => h.store.data, key: () => '', conversations: h.conversations});
  assert.equal(h.store.data.tasks[0].status, 'failed'); assert.match(h.store.data.tasks[0].error, /中断/);
});

test('task UI: form defaults, payload parsing and cards', () => {
  const s = initialState();
  const form = taskForm(s);
  assert.match(form, /data-kind="daily"/); assert.match(form, /name="scheduleKind"/); assert.match(form, /研究分析师/);
  const edit = taskForm(s, {name: 'A<b>', prompt: 'p', agentId: 'writer', toolsEnabled: true, schedule: {kind: 'weekly', time: '08:00', days: [2]}});
  assert.match(edit, /value="A&lt;b&gt;"/); assert.match(edit, /value="writer" selected/); assert.match(edit, /value="2" checked/); assert.match(edit, /name="toolsEnabled" checked/);
  const data = new Map([['name', 'n'], ['prompt', 'p'], ['agentId', 'research'], ['scheduleKind', 'weekly'], ['scheduleTime', '07:30'], ['scheduleEvery', '4'], ['scheduleAt', ''], ['toolsEnabled', 'on']]);
  const f = {get: k => data.get(k) ?? null, has: k => data.has(k), getAll: k => k === 'scheduleDays' ? ['1', '5'] : []};
  assert.deepEqual(taskPayload(f, 't1'), {id: 't1', edit: true, name: 'n', prompt: 'p', agentId: 'research', toolsEnabled: true, schedule: {kind: 'weekly', time: '07:30', every: 4, days: [1, 5], at: ''}});
  const action = (l, a, id = '') => `<button data-action="${a}" data-id="${id}">${l}</button>`;
  s.chats = [{id: 'c1', name: 'x', messages: []}];
  s.tasks = [
    {id: 'a', mode: 'agent', name: '早报', prompt: 'p', agentId: 'research', toolsEnabled: true, enabled: true, nextRun: Date.now() + 1, schedule: {kind: 'daily', time: '09:00'}, chatId: 'c1', status: 'done', history: [{at: 1, status: 'done'}, {at: 2, status: 'failed', error: 'e'}]},
    {id: 'b', name: '旧任务', prompt: 'p', enabled: false, status: 'ready', result: 'r'},
  ];
  const html = taskCards(s, {action, date: () => 'D'});
  assert.match(html, /每天 09:00 · 下次 D/); assert.match(html, /研究分析师/); assert.match(html, /可用工具/);
  assert.match(html, /data-action="openChat" data-id="c1"/); assert.match(html, /editTask/); assert.match(html, /run-dot failed/);
  assert.match(html, /仅模型/); assert.match(html, /taskResult/);
});
