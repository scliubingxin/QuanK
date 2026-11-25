import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { automationPage, taskEditor, taskCard, runRecords, relTime, duration, taskState } from '../src/ui/automation.js';
import { taskPayload } from '../src/ui/tasks.js';

const NOW = new Date(2026, 10, 19, 17, 0).getTime();
const H = 3600e3;
const ui = {action: (l, a, id = '', k = 'secondary') => `<button class="${k}" data-action="${a}" data-id="${id}">${l}</button>`, empty: (t, d, b = '') => `<div class="empty">${t}${d}${b}</div>`};
const state = () => ({
  agents: [{id: 'assistant', name: 'QuankSight 助手'}, {id: 'research', name: '研究分析师'}],
  chats: [{id: 'c1', messages: []}],
  tasks: [
    {id: 'a', mode: 'agent', name: '量化算法每日迭代部署', prompt: '每个工作日早盘前执行…', agentId: 'research', toolsEnabled: true, enabled: true, nextRun: NOW + 16 * H, status: 'done', chatId: 'c1',
      schedule: {kind: 'weekdays', time: '09:15'}, history: [{id: 'r3', at: NOW - 13 * 60e3, status: 'running', trigger: 'schedule'}, {id: 'r2', at: NOW - 24 * H, status: 'done', ms: 31 * 60e3 + 15e3, trigger: 'schedule'}, {id: 'r1', at: NOW - 2 * 24 * H, status: 'failed', ms: 58 * 60e3, error: '执行中断', trigger: 'manual'}]},
    {id: 'b', mode: 'agent', name: '<b>生成昨日 AI 重点资讯</b>', prompt: '请帮我汇总', agentId: 'assistant', enabled: false, status: 'ready', schedule: {kind: 'daily', time: '09:00'}, history: []},
    {id: 'c', mode: 'agent', name: '手动整理', prompt: 'p', agentId: 'assistant', enabled: false, status: 'running', schedule: {kind: 'manual'}, history: []},
  ],
});

test('relTime and duration read like WorkBuddy', () => {
  assert.equal(relTime(NOW - 20e3, NOW), '刚刚');
  assert.equal(relTime(NOW - 13 * 60e3, NOW), '13分钟前');
  assert.equal(relTime(NOW - 3 * H, NOW), '今天 14:00');
  assert.equal(relTime(NOW - 24 * H, NOW), '昨天 17:00');
  assert.equal(relTime(NOW + 16 * H, NOW), '明天 09:00');
  assert.equal(relTime(NOW - 3 * 24 * H, NOW), '3天前');
  assert.equal(relTime(new Date(2026, 10, 3, 9).getTime(), NOW), '11月3日');
  assert.equal(relTime(undefined, NOW), '—');
  assert.equal(duration(31 * 60e3 + 15e3), '31m15s');
  assert.equal(duration(7000), '7s');
  assert.equal(duration(2 * H + 5 * 60e3), '2h5m');
  assert.equal(duration(undefined), '—');
});

test('task cards: run / edit / more / switch, states, escaping', () => {
  const s = state();
  const doc = new JSDOM(automationPage(s, {...ui, now: NOW})).window.document;
  const cards = [...doc.querySelectorAll('.task-card2')];
  assert.equal(cards.length, 3);
  const [a, b, c] = cards;
  assert.ok(a.querySelector('[data-action="runTask"]') && a.querySelector('[data-action="editTask"]'));
  assert.equal(a.querySelector('.task-switch').getAttribute('aria-checked'), 'true');
  assert.match(a.querySelector('footer').textContent, /工作日 09:15[\s\S]*下次 明天 09:00/);
  assert.ok(a.querySelector('[data-action="openChat"][data-id="c1"]'));
  assert.ok(a.querySelector('[data-action="skipTask"]') && a.querySelector('[data-action="taskRuns"]') && a.querySelector('[data-action="deleteTask"]'));
  assert.match(a.querySelector('.task-tags').textContent, /研究分析师可用工具/);
  assert.equal(b.querySelector('h3').textContent, '<b>生成昨日 AI 重点资讯</b>');
  assert.equal(doc.querySelectorAll('h3 b').length, 0);
  assert.ok(b.classList.contains('paused'));
  assert.match(b.querySelector('footer').textContent, /已暂停/);
  assert.ok(c.querySelector('[data-action="cancelTask"]') && !c.querySelector('[data-action="editTask"]') && !c.querySelector('[data-action="deleteTask"]'));
  assert.match(c.querySelector('footer').textContent, /运行中/);
  assert.ok(c.querySelector('.task-switch.disabled'));
  assert.deepEqual([...doc.querySelectorAll('.auto-filters button')].map(x => x.textContent), ['全部 (3)', '进行中 (2)', '已暂停 (1)']);
  assert.deepEqual([taskState(s.tasks[0]), taskState(s.tasks[1]), taskState(s.tasks[2])], ['active', 'paused', 'running']);
  const paused = new JSDOM(automationPage(s, {...ui, now: NOW, filter: 'paused'})).window.document;
  assert.equal(paused.querySelectorAll('.task-card2').length, 1);
  assert.match(automationPage({...s, tasks: []}, {...ui, now: NOW}), /还没有定时任务[\s\S]*每小时看一下通威的股价/);
  assert.match(taskCard(s, {...s.tasks[0], history: [{at: NOW - 60e3, status: 'failed'}], status: 'failed', error: '没有得到回复'}, {now: NOW}), /上次失败 · 1分钟前[\s\S]*没有得到回复/);
});

test('run records: merged across tasks, newest first, filters, actions', () => {
  const s = state();
  assert.deepEqual(runRecords(s).map(r => r.id), ['r3', 'r2', 'r1']);
  assert.deepEqual(runRecords(s, {status: 'failed'}).map(r => r.id), ['r1']);
  assert.deepEqual(runRecords(s, {status: 'running'}).map(r => r.id), ['r3']);
  assert.deepEqual(runRecords(s, {trigger: 'manual'}).map(r => r.id), ['r1']);
  assert.deepEqual(runRecords(s, {taskId: 'b'}), []);
  const doc = new JSDOM(automationPage(s, {...ui, now: NOW, tab: 'runs', extra: '<div id="legacy"></div>'})).window.document;
  const rows = [...doc.querySelectorAll('.run-table tbody tr')].map(tr => [...tr.cells].slice(0, 5).map(td => td.textContent.trim()));
  assert.deepEqual(rows, [['量化算法每日迭代部署', '运行中', '13分钟前', '—', '定时'], ['量化算法每日迭代部署', '成功', '昨天 17:00', '31m15s', '定时'], ['量化算法每日迭代部署', '失败', '2天前', '58m0s', '手动']]);
  const last = doc.querySelectorAll('.run-table tbody tr')[2];
  assert.ok(last.querySelector('[data-action="runTask"][data-id="a"]') && last.querySelector('[data-action="openChat"]'));
  assert.equal(doc.querySelector('.auto-tabs .chosen').dataset.id, 'runs');
  assert.deepEqual([...doc.querySelectorAll('#runTask option')].map(o => o.value), ['all', 'a', 'b', 'c']);
  assert.ok(doc.querySelector('#legacy'));
  assert.match(automationPage(s, {...ui, now: NOW, tab: 'runs', runStatus: 'skipped'}), /没有符合条件的运行记录/);
});

test('editor: two columns, cadence fields, status block, payload round-trip', () => {
  const s = state();
  const doc = new JSDOM(`<form>${taskEditor(s, s.tasks[0], NOW)}</form>`).window.document;
  const root = doc.querySelector('.task-editor');
  assert.equal(root.dataset.kind, 'weekdays');
  assert.ok(root.classList.contains('task-form'));
  assert.ok(root.querySelector('.te-main [name="prompt"]') && root.querySelector('.te-side [data-schedule-kind]'));
  assert.match(root.querySelector('.te-status').textContent, /进行中[\s\S]*下次 明天 09:00[\s\S]*暂停/);
  assert.ok(root.querySelector('[data-action="taskEditorToggle"]') && root.querySelector('[data-action="taskEditorRun"]') && root.querySelector('[data-action="deleteTask"]'));
  assert.equal(root.querySelector('[name="agentId"]').value, 'research');
  const f = new (new JSDOM('').window.FormData)(doc.querySelector('form'));
  const p = taskPayload(f, 'a');
  assert.deepEqual([p.id, p.edit, p.name, p.agentId, p.toolsEnabled, p.schedule.kind, p.schedule.time], ['a', true, '量化算法每日迭代部署', 'research', true, 'weekdays', '09:15']);
  const fresh = new JSDOM(taskEditor(s, null, NOW)).window.document;
  assert.equal(fresh.querySelector('.te-status'), null);
  assert.equal(fresh.querySelector('.te-extra'), null);
  assert.equal(fresh.querySelector('.task-editor').dataset.kind, 'daily');
  const manual = new JSDOM(taskEditor(s, s.tasks[2], NOW)).window.document;
  assert.match(manual.querySelector('.te-status').textContent, /运行中/);
  assert.ok(manual.querySelector('[data-action="taskEditorRun"]').disabled);
});

test('app: automation page renders, tabs and filters switch, editor opens', async () => {
  const { loadUI } = await import('./helpers/load-ui.mjs');
  const dom = new JSDOM('<!doctype html><body><div id="app"></div><dialog id="modal"></dialog><div id="toast"></div></body>', {url: 'file:///app/src/index.html', runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
  w.HTMLDialogElement.prototype.close ??= function () { this.open = false; };
  const s = {schema: 1, chats: [], folders: [], memories: [], tasks: state().tasks, artifacts: [], activity: [], executions: [], commandJobs: [], runJobs: [],
    settings: {baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', name: '测试'}, agents: state().agents, documents: [], connectors: [], connectorItems: [], dashboards: [], browsers: [], desktop: {platform: 'darwin'}};
  w.actwill = new Proxy({}, {get: (_, k) => ['onStream', 'onRuntime', 'onOpenChat', 'onOpenPage'].includes(k) ? () => () => {} : async () => structuredClone(s)});
  await loadUI(w);
  const settle = () => new Promise(r => setTimeout(r, 30)), doc = w.document;
  await settle();
  doc.querySelector('.sidebar [data-page="tasks"]').click(); await settle();
  assert.equal(doc.querySelectorAll('.task-card2').length, 3);
  doc.querySelector('[data-action="taskFilter"][data-id="paused"]').click(); await settle();
  assert.equal(doc.querySelectorAll('.task-card2').length, 1);
  doc.querySelector('[data-action="taskTab"][data-id="runs"]').click(); await settle();
  assert.ok(doc.querySelector('.run-table'));
  const sel = doc.querySelector('#runStatus'); sel.value = 'failed'; sel.dispatchEvent(new w.Event('change', {bubbles: true})); await settle();
  assert.equal(doc.querySelectorAll('.run-table tbody tr').length, 1);
  doc.querySelector('[data-action="taskTab"][data-id="tasks"]').click(); await settle();
  doc.querySelector('[data-action="taskFilter"][data-id="all"]').click(); await settle();
  doc.querySelector('[data-action="newTask"]').click(); await settle();
  assert.ok(doc.querySelector('#modal .task-editor'));
  assert.ok(doc.querySelector('#modal').classList.contains('task-modal'));
  dom.window.close();
});
