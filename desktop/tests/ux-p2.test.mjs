// [p2-ux] Feedback fixes: per-run timeout for tool turns, resuming plans/research, step dividers and the rounded icon.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initialState} from '../core.mjs';
import {createRunQueue, requestFingerprint} from '../runtime/run-queue.mjs';
import {createModelService} from '../services/models.mjs';
import {createPlanService, REPORT_STEP} from '../services/plan.mjs';
import {planCard} from '../src/ui/plan.js';

const spec = (id, extra = {}) => ({id, kind: 'conversation', ownerId: id, label: 't', fingerprint: requestFingerprint({id}), ...extra});
const hold = (signal, ms) => new Promise((resolve, reject) => { const t = setTimeout(() => resolve({status: 'completed'}), ms); signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, {once: true}); });
const until = async f => { for (let i = 0; i < 400 && !f(); i++) await new Promise(r => setTimeout(r, 5)); assert.ok(f(), 'condition not reached'); };

test('a run may ask for a longer timeout than the queue default, bounded at 30 minutes', async () => {
  const store = {data: initialState(), save: async () => {}}, queue = createRunQueue({store, active: new Map(), timeoutMs: 30});
  const short = await queue.submit(spec('short'), c => hold(c.signal, 120));
  assert.equal(short.status, 'cancelled', 'default timeout still applies');
  const long = await queue.submit(spec('long', {timeoutMs: 2000}), c => hold(c.signal, 120));
  assert.equal(long.status, 'completed');
  const bogus = await queue.submit(spec('bogus', {timeoutMs: -5}), c => hold(c.signal, 120));
  assert.equal(bogus.status, 'cancelled', 'invalid values fall back to the default');
  queue.stop();
});

function setup(stepReply) {
  const store = {data: initialState(), save: async () => {}, log: () => {}};
  const runs = [];
  const conversations = {
    run: async p => { runs.push(p); const chat = store.data.chats.find(c => c.id === p.id); const r = stepReply(runs.length, p);
      chat.messages.push({role: 'user', content: p.prompt, planStep: p.planStep}, {role: 'assistant', content: r.text, ...(r.error ? {error: true} : {})}); },
    cancel: async () => {},
  };
  const documents = {importFile: async (name) => ({document: {id: 'doc', name, revision: 1}})};
  const svc = createPlanService({store, models: createModelService({store, secrets: {}}), key: () => '', view: () => store.data, conversations, documents,
    request: async () => ({text: '{"steps":[{"title":"子问题甲"},{"title":"子问题乙"}]}'})});
  return {store, svc, runs};
}

test('a failed research resumes from the first unfinished step and keeps earlier sources', async () => {
  let failSecond = true;
  const {store, svc, runs} = setup((n, p) => /深度研究最后一步/.test(p.prompt) ? {text: '# 报告\n## 摘要\n- 结论 [1]\n## 参考来源\n[1] https://a.com/x'}
    : p.planStep === 1 && failSecond ? {text: '请求已停止或超时。', error: true} : {text: `### 来源\n- 页 | https://s${p.planStep}.com/a`});
  await svc.planDraft({id: 'r', prompt: '课题', kind: 'research'});
  await svc.planRun({id: 'r'});
  const plan = store.data.chats[0].plan;
  await until(() => plan.status !== 'running');
  assert.equal(plan.status, 'failed'); assert.deepEqual(plan.steps.map(s => s.status), ['done', 'failed', 'skipped']);
  await assert.rejects(svc.planRun({id: 'r'}), /没有待执行/, 'plain run of a failed plan is refused');
  failSecond = false;
  await svc.planRun({id: 'r', resume: true, steps: [{title: '被忽略'}]});
  await until(() => plan.status !== 'running');
  assert.equal(plan.status, 'done');
  assert.deepEqual(plan.steps.map(s => s.title), ['子问题甲', '子问题乙', REPORT_STEP.title], 'resume ignores edited steps');
  assert.deepEqual(runs.map(r => r.planStep), [0, 1, 1, 2], 'the completed first step is not run again');
  assert.deepEqual(plan.sources, ['https://s0.com/a', 'https://s1.com/a', 'https://a.com/x']);
  assert.equal(plan.report.id, 'doc');
});

test('plan card offers resume for failed or stopped plans only', () => {
  const action = (l, a) => `<button data-action="${a}">${l}</button>`;
  const steps = [{title: 'A', status: 'done'}, {title: 'B', status: 'failed'}];
  assert.match(planCard({id: 'p', status: 'failed', steps}, action), /planResume/);
  assert.match(planCard({id: 'p', status: 'cancelled', steps}, action), /从未完成的步骤继续/);
  assert.doesNotMatch(planCard({id: 'p', status: 'done', steps}, action), /planResume/);
  assert.doesNotMatch(planCard({id: 'p', status: 'running', steps}, action), /planResume/);
});

test('app icon follows the macOS rounded-tile layout (transparent corners, opaque center)', async () => {
  const png = await readFile(new URL('../assets/icon-1024.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1024); assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(png[25], 6, 'RGBA so corners can be transparent');
});
