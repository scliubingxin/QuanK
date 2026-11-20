// [p1-m5] Plan mode: parsing, validation, draft creation and sequential execution through the conversation pipeline.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../core.mjs';
import {createModelService} from '../services/models.mjs';
import {createPlanService, parsePlan, validateSteps, stepPrompt, PLAN_MAX_STEPS} from '../services/plan.mjs';
import {planCard} from '../src/ui/plan.js';

const until = async f => { for (let i = 0; i < 200 && !f(); i++) await new Promise(r => setTimeout(r, 5)); assert.ok(f(), 'condition not reached'); };

test('plan parsing: JSON object, JSON array, numbered fallback, limits', () => {
  assert.deepEqual(parsePlan('好的\n{"steps":[{"title":"收集数据","detail":"读取表格"},{"title":"  画图  "}]}'), [{title: '收集数据', detail: '读取表格'}, {title: '画图', detail: ''}]);
  assert.deepEqual(parsePlan('[{"title":"a"},"b",{"title":""}]'), [{title: 'a', detail: ''}, {title: 'b', detail: ''}]);
  assert.deepEqual(parsePlan('计划如下：\n1. 打开网站\n2、搜索关键词\n- 整理结果\n说明文字'), [{title: '打开网站', detail: ''}, {title: '搜索关键词', detail: ''}, {title: '整理结果', detail: ''}]);
  assert.equal(parsePlan(JSON.stringify({steps: Array.from({length: 30}, (_, i) => ({title: 's' + i}))})).length, PLAN_MAX_STEPS);
  assert.deepEqual(parsePlan('无法规划'), []);
  assert.deepEqual(validateSteps([{title: ' 第一步 ', detail: ''}]), [{title: '第一步', detail: ''}]);
  assert.throws(() => validateSteps([]), /1 到/); assert.throws(() => validateSteps([{title: ''}])); assert.throws(() => validateSteps([null]), /无效/);
  const p = stepPrompt({goal: '写周报', steps: [{title: 'A'}, {title: 'B', detail: '细节'}]}, 1);
  assert.match(p, /第 2\/2 步：B/); assert.match(p, /具体要求：细节/); assert.match(p, /1\. A（已完成）/); assert.match(p, /2\. B（当前）/);
});

function setup({planText = '{"steps":[{"title":"第一步"},{"title":"第二步"},{"title":"第三步"}]}', stepReply = () => ({text: '完成'})} = {}) {
  const store = {data: initialState(), save: async () => {}, log: () => {}};
  const runs = [], cancels = [];
  const conversations = {
    run: async p => { runs.push(p); const chat = store.data.chats.find(c => c.id === p.id); const r = await stepReply(runs.length, p); chat.messages.push({role: 'user', content: p.prompt}, {role: 'assistant', content: r.text, ...(r.error ? {error: true} : {})}); return {}; },
    cancel: async id => { cancels.push(id); },
  };
  const requests = [];
  const svc = createPlanService({store, models: createModelService({store, secrets: {}}), key: () => '', view: () => store.data, conversations,
    request: async (_s, _k, messages, _signal, tools) => { requests.push({messages, tools}); return {text: planText}; }});
  return {store, svc, runs, cancels, requests};
}

test('draft creates the chat and an editable plan without tools; empty plans are refused', async () => {
  const {store, svc, requests} = setup();
  await svc.planDraft({id: 'c', prompt: '整理本周销售数据并做图', toolsEnabled: true, agentId: 'research'});
  assert.equal(requests[0].tools, undefined); assert.match(requests[0].messages[0].content, /任务规划助手/);
  const chat = store.data.chats[0];
  assert.equal(chat.plan.status, 'draft'); assert.equal(chat.plan.steps.length, 3); assert.equal(chat.plan.toolsEnabled, true); assert.equal(chat.plan.agentId, 'research');
  assert.ok(chat.plan.steps.every(s => s.status === 'pending')); assert.equal(chat.messages[0].planDraft, true);
  const bad = setup({planText: '抱歉'});
  await assert.rejects(bad.svc.planDraft({id: 'c', prompt: '目标'}), /没有给出可执行的步骤/);
  assert.equal(bad.store.data.chats.length, 0);
});

test('run executes edited steps in order through the conversation pipeline', async () => {
  const {store, svc, runs} = setup();
  await svc.planDraft({id: 'c', prompt: '目标', toolsEnabled: true});
  await svc.planRun({id: 'c', steps: [{title: '甲', detail: '先做甲'}, {title: '乙'}]});
  const plan = store.data.chats[0].plan;
  await until(() => plan.status !== 'running');
  assert.equal(plan.status, 'done'); assert.deepEqual(plan.steps.map(s => s.status), ['done', 'done']);
  assert.equal(runs.length, 2); assert.match(runs[0].prompt, /第 1\/2 步：甲/); assert.match(runs[1].prompt, /第 2\/2 步：乙/);
  assert.equal(runs[0].toolsEnabled, true); assert.equal(runs[1].planStep, 1);
  await assert.rejects(svc.planRun({id: 'c'}), /没有待执行/);
});

test('a failed step stops the plan and skips the rest', async () => {
  const {store, svc, runs} = setup({stepReply: n => n === 2 ? {text: '请求失败', error: true} : {text: 'ok'}});
  await svc.planDraft({id: 'c', prompt: '目标'});
  await svc.planRun({id: 'c'});
  const plan = store.data.chats[0].plan;
  await until(() => plan.status !== 'running');
  assert.equal(plan.status, 'failed'); assert.deepEqual(plan.steps.map(s => s.status), ['done', 'failed', 'skipped']); assert.equal(runs.length, 2);
});

test('cancel stops after the current step; discard and validation', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const {store, svc, runs, cancels} = setup({stepReply: async n => { if (n === 1) await gate; return {text: 'ok'}; }});
  await svc.planDraft({id: 'c', prompt: '目标'});
  await svc.planRun({id: 'c'});
  await until(() => runs.length === 1);
  await svc.planCancel({id: 'c'}); release();
  const plan = store.data.chats[0].plan;
  await until(() => plan.status !== 'running');
  assert.equal(plan.status, 'cancelled'); assert.deepEqual(cancels, ['c']); assert.equal(runs.length, 1);
  assert.deepEqual(plan.steps.map(s => s.status), ['cancelled', 'skipped', 'skipped']);
  const s2 = setup();
  await s2.svc.planDraft({id: 'd', prompt: '目标'});
  await assert.rejects(s2.svc.planRun({id: 'd', steps: []}), /1 到/);
  assert.equal(s2.store.data.chats[0].plan.status, 'draft');
  await s2.svc.planDiscard({id: 'd'}); assert.equal(s2.store.data.chats[0].plan.status, 'discarded');
  await assert.rejects(s2.svc.planRun({id: 'zz'}), /不存在/);
});

test('plan card renders draft editor and running progress', () => {
  const action = (l, a, id = '') => `<button data-action="${a}" data-id="${id}">${l}</button>`;
  const draft = planCard({id: 'p', status: 'draft', toolsEnabled: false, steps: [{title: '甲<b>', detail: 'd', status: 'pending'}]}, action);
  assert.match(draft, /待确认/); assert.match(draft, /value="甲&lt;b&gt;"/); assert.match(draft, /planRun/); assert.match(draft, /未开启工具模式/); assert.match(draft, /disabled/);
  const running = planCard({id: 'p', status: 'running', steps: [{title: 'A', status: 'done'}, {title: 'B', status: 'running'}, {title: 'C', status: 'pending'}]}, action);
  assert.match(running, /1\/3 步完成/); assert.match(running, /planCancel/); assert.match(running, /执行中/);
  assert.equal(planCard({status: 'discarded', steps: []}, action), ''); assert.equal(planCard(null, action), '');
});
