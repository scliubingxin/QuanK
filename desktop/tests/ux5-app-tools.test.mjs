import test from 'node:test';
import assert from 'node:assert/strict';
import { appToolDefinitions, APP_TOOL_NAMES, APP_INTENT, executeAppTool, appToolContext } from '../services/app-tools.mjs';
import { createAgentSession } from '../services/agent-session.mjs';
import { createWorkspaceService } from '../services/workspace.mjs';
import { initialState } from '../core.mjs';

const memStore = () => { const data = initialState(); data.agents ??= []; if (!data.agents.some(a => a.id === 'assistant')) data.agents.push({id: 'assistant', name: 'QuankSight 助手', prompt: 'p', tools: []}); return {data, saves: 0, async save() { this.saves++; }, log(t, d) { (this.logs ??= []).push([t, d]); }}; };
function setup({answer = true} = {}) {
  const store = memStore(), asks = [], runs = [], opened = [];
  const workspace = createWorkspaceService({store, active: new Map(), view: () => store.data});
  const deps = {workspace, notify() {}, runTask: async (id, o) => runs.push([id, o]), openPage: p => opened.push(p),
    connectors: {sync: async id => ({added: 3})}, dashboards: {handle: async p => ({id: 'dash1', ...p})}, briefing: {generate: async () => ({summary: 's', sections: [{title: '今日日程', items: [{text: '10:00 评审'}]}]})}};
  const ask = async (title, detail) => { asks.push({title, detail}); return typeof answer === 'function' ? answer(title) : answer; };
  const run = (name, args = {}, extra = {}) => executeAppTool(name, args, {store, deps, ask, chatId: 'c1', ...extra});
  return {store, deps, asks, runs, opened, run};
}

test('definitions: every tool has a unique name and strict schema; incognito drops memory and graph', () => {
  const all = appToolDefinitions(), names = all.map(d => d.function.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes('app_task_create') && names.includes('app_memory_add'));
  assert.ok(all.every(d => d.function.parameters.additionalProperties === false));
  const inc = appToolDefinitions({incognito: true}).map(d => d.function.name);
  assert.ok(!inc.includes('app_memory_add') && !inc.includes('app_graph_search') && inc.includes('app_task_create'));
  assert.equal(APP_TOOL_NAMES.size, names.length);
  assert.match(appToolContext(new Date(2026, 10, 19, 16, 58).getTime()), /当前本机时间：2026-11-19 16:58（周四）/);
  assert.match(appToolContext(), /不要说没有定时任务工具/);
});

test('APP_INTENT recognises app requests and ignores ordinary questions', () => {
  for (const s of ['创建个定时任务 每小时看一下通威的股价', '每天 8 点帮我汇总未读邮件', '工作日 9 点提醒我写日报', '暂停那个股价任务', '同步一下邮件', '生成今天的简报', '记住我喜欢简洁回答', '打开知识图谱页面'])
    assert.ok(APP_INTENT.test(s), s);
  for (const s of ['通威股份最新的股价是多少', '帮我写一封邮件', '解释一下光伏产业链']) assert.ok(!APP_INTENT.test(s), s);
});

test('create: validated, confirmed, saved as an agent task with next run; refusal saves nothing', async () => {
  const f = setup();
  const r = await f.run('app_task_create', {name: '通威股价', prompt: '查一下通威股份（600438）的最新股价和涨跌幅，简要汇报', schedule: {kind: 'hourly', every: 1}, toolsEnabled: true});
  assert.equal(r.status, 'succeeded');
  assert.equal(f.asks[0].title, '创建定时任务？');
  assert.match(f.asks[0].detail, /频率：每 1 小时[\s\S]*允许使用工具[\s\S]*600438/);
  const t = f.store.data.tasks[0];
  assert.deepEqual([t.name, t.mode, t.enabled, t.toolsEnabled, t.schedule], ['通威股价', 'agent', true, true, {kind: 'hourly', every: 1}]);
  assert.ok(t.nextRun > Date.now());
  assert.equal(r.task.id, t.id);
  assert.equal(r.task.schedule, '每 1 小时');
  const no = setup({answer: false});
  assert.equal((await no.run('app_task_create', {name: 'x', prompt: 'y', schedule: {kind: 'daily', time: '08:00'}})).status, 'denied');
  assert.equal(no.store.data.tasks.length, 0);
  await assert.rejects(f.run('app_task_create', {name: 'x', prompt: 'y', schedule: {kind: 'daily', time: '25:00'}}), /执行时刻/);
  await assert.rejects(f.run('app_task_create', {name: 'x', prompt: 'y', schedule: {kind: 'once', at: '2020-01-01T08:00'}}), /已过去/);
  await assert.rejects(f.run('app_task_create', {name: '', prompt: 'y', schedule: {kind: 'manual'}}), /名称/);
  assert.equal(f.asks.length, 1, 'invalid requests never reach the confirmation dialog');
  const ghost = await f.run('app_task_create', {name: 'g', prompt: 'p', schedule: {kind: 'manual'}, agentId: 'nope'});
  assert.equal(f.store.data.tasks[0].agentId, 'assistant');
  assert.equal(ghost.task.enabled, false);
});

test('list / update (pause, resume, edit) / run / delete', async () => {
  const f = setup();
  await f.run('app_task_create', {name: '日报', prompt: '写日报', schedule: {kind: 'weekdays', time: '18:00'}});
  const id = f.store.data.tasks[0].id;
  const list = await f.run('app_task_list');
  assert.deepEqual([list.total, list.tasks[0].schedule, list.tasks[0].enabled], [1, '工作日 18:00', true]);
  await f.run('app_task_update', {id, enabled: false});
  assert.equal(f.store.data.tasks[0].enabled, false);
  assert.match(f.asks.at(-1).detail, /暂停执行/);
  await f.run('app_task_update', {id, enabled: true});
  assert.equal(f.store.data.tasks[0].enabled, true);
  await f.run('app_task_update', {id, schedule: {kind: 'daily', time: '09:30'}, name: '早报'});
  const t = f.store.data.tasks[0];
  assert.deepEqual([t.name, t.schedule, t.prompt, t.enabled], ['早报', {kind: 'daily', time: '09:30'}, '写日报', true]);
  assert.match(f.asks.at(-1).detail, /名称：日报 → 早报[\s\S]*频率：工作日 18:00 → 每天 09:30/);
  await assert.rejects(f.run('app_task_update', {id}), /没有要修改/);
  await assert.rejects(f.run('app_task_update', {id: 'nope', enabled: true}), /app_task_list/);
  await f.run('app_task_run', {id});
  assert.equal(f.runs[0][0], id);
  f.store.data.tasks[0].chatId = 'c1';
  await assert.rejects(f.run('app_task_run', {id}), /自己的运行/);
  await f.run('app_task_delete', {id});
  assert.equal(f.store.data.tasks.length, 0);
});

test('connectors, dashboards, briefing, pages, memory and graph', async () => {
  const f = setup();
  f.store.data.connectors = [{id: 'm', name: '邮箱', kind: 'mail', status: 'ok', count: 5, lastSync: Date.now()}];
  assert.equal((await f.run('app_connector_list')).connectors[0].items, 5);
  assert.deepEqual(await f.run('app_connector_sync', {id: 'm'}), {status: 'succeeded', added: 3});
  await assert.rejects(f.run('app_connector_sync', {id: 'x'}), /不存在/);
  f.store.data.documents = [{id: 'd', format: 'xlsx', name: 'a'}, {id: 'w', format: 'docx', name: 'b'}];
  assert.equal((await f.run('app_dashboard_create', {documentId: 'd', prompt: '看趋势'})).dashboardId, 'dash1');
  await assert.rejects(f.run('app_dashboard_create', {documentId: 'w'}), /Excel/);
  assert.deepEqual((await f.run('app_briefing_generate')).sections, [{title: '今日日程', items: ['10:00 评审']}]);
  await f.run('app_open_page', {page: 'tasks'});
  assert.deepEqual(f.opened, ['tasks']);
  await assert.rejects(f.run('app_open_page', {page: 'evil'}), /不存在/);
  await f.run('app_memory_add', {text: '用户喜欢先给结论', kind: 'preference'});
  assert.equal(f.store.data.memories[0].text, '用户喜欢先给结论');
  await assert.rejects(f.run('app_memory_add', {text: '我的密码是 123456'}), /敏感/);
  f.store.data.graph = {entities: [{id: 'e1', name: '通威股份', type: 'org', aliases: ['通威'], summary: '光伏'}, {id: 'e2', name: '张三', type: 'person'}], relations: [{id: 'r', from: 'e2', to: 'e1', type: '任职于'}]};
  const g = await f.run('app_graph_search', {query: '通威'});
  assert.deepEqual(g.entities[0].relations, ['张三 任职于 通威股份']);
  await assert.rejects(f.run('nope'), /未知/);
  assert.equal(f.asks.length, 0, 'read-only and local actions do not ask');
});

test('agent session: app tools offered with tools on, alone in appOnly mode, memory hidden in incognito; unattended gate defers', async () => {
  const f = setup();
  const agent = f.store.data.agents.find(a => a.id === 'assistant');
  f.store.data.chats = [{id: 'c1', messages: []}, {id: 'inc', incognito: true, messages: []}];
  const mk = (extra = {}) => createAgentSession({agent, store: f.store, chatId: 'c1', runId: 'r', executeTool: async () => ({status: 'denied'}), appTools: f.deps, approve: async () => true, ...extra});
  const s = await mk();
  try {
    const names = s.definitions.map(d => d.function.name);
    assert.ok(names.includes('app_task_create'));
    assert.match(s.context, /应用内操作/);
    const r = await s.execute('app_task_create', {name: '股价', prompt: '查股价', schedule: {kind: 'hourly', every: 2}});
    assert.equal(r.status, 'succeeded');
    const row = f.store.data.executions.find(x => x.tool === 'app_task_create');
    assert.deepEqual([row.status, row.args.name], ['succeeded', '股价']);
  } finally { await s.close(); }
  const only = await mk({appOnly: true});
  try { assert.ok(only.definitions.every(d => d.function.name.startsWith('app_'))); } finally { await only.close(); }
  const inc = await mk({chatId: 'inc'});
  try { assert.ok(!inc.definitions.some(d => d.function.name === 'app_memory_add')); } finally { await inc.close(); }
  const none = await createAgentSession({agent, store: f.store, chatId: 'c1', runId: 'r', executeTool: async () => {}});
  try { assert.ok(!none.definitions.some(d => d.function.name.startsWith('app_'))); } finally { await none.close(); }
  const deferring = async () => { const e = new Error('定时任务无人值守：该操作需要用户确认'); e.code = 'UNATTENDED_DEFERRED'; throw e; };
  deferring.gated = true;
  const un = await mk({approve: deferring});
  try {
    const before = f.store.data.tasks.length;
    await assert.rejects(un.execute('app_task_delete', {id: f.store.data.tasks[0].id}), /无人值守/);
    assert.equal(f.store.data.tasks.length, before);
  } finally { await un.close(); }
});
