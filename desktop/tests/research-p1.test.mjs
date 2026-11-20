// [p1-m6] Deep research: sub-question outline, tool-enabled evidence steps, cited report saved as DOCX.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../core.mjs';
import {createModelService} from '../services/models.mjs';
import {createPlanService, collectSources, reportSpec, stepPrompt, REPORT_STEP} from '../services/plan.mjs';
import {planCard, readPlanSteps} from '../src/ui/plan.js';

const until = async f => { for (let i = 0; i < 300 && !f(); i++) await new Promise(r => setTimeout(r, 5)); assert.ok(f(), 'condition not reached'); };
const REPORT = '# 储能市场研究\n## 摘要\n- 2025 年装机 **100GW** [1]\n## 对比\n| 方案 | 成本 |\n|---|---|\n| 锂电 | 低 |\n| 钠电 |\n## 参考来源\n[1] 能源局 https://www.nea.gov.cn/a.html';

test('report markdown becomes Word blocks; sources are de-duplicated', () => {
  const s = reportSpec(REPORT, '课题');
  assert.equal(s.title, '储能市场研究');
  assert.deepEqual(s.blocks[0], {type: 'heading', text: '摘要'});
  assert.deepEqual(s.blocks[1], {type: 'paragraph', text: '• 2025 年装机 100GW [1]'});
  const table = s.blocks.find(b => b.type === 'table');
  assert.deepEqual(table.rows, [['方案', '成本'], ['锂电', '低'], ['钠电', '']]);
  assert.equal(reportSpec('只有正文', '课题X').title, '课题X');
  assert.deepEqual(reportSpec('', 't').blocks, []);
  assert.deepEqual(collectSources(['见 https://a.com/x. 以及 https://a.com/x', '来源：标题 | https://b.org/p?q=1，另 http://c.cn）']), ['https://a.com/x', 'https://b.org/p?q=1', 'http://c.cn']);
});

test('research prompts: evidence steps use the browser tools, the last step writes the cited report', () => {
  const plan = {kind: 'research', goal: '储能', steps: [{title: '市场规模', detail: '装机量'}, {title: '技术路线'}, REPORT_STEP]};
  const p0 = stepPrompt(plan, 0);
  assert.match(p0, /子问题：市场规模/); assert.match(p0, /检索要点：装机量/); assert.match(p0, /browser_open/); assert.match(p0, /### 来源/);
  const last = stepPrompt(plan, 2);
  assert.match(last, /撰写研究报告/); assert.match(last, /## 参考来源/); assert.match(last, /不要再检索/);
});

function setup({planText = '{"steps":[{"title":"市场规模","detail":"装机量"},{"title":"技术路线"},{"title":"撰写总结报告"}]}', importFile, withDocs = true} = {}) {
  const store = {data: initialState(), save: async () => {}, log: () => {}};
  const runs = [], imports = [];
  const conversations = {
    run: async p => { runs.push(p); const chat = store.data.chats.find(c => c.id === p.id); const last = /深度研究最后一步/.test(p.prompt);
      chat.messages.push({role: 'user', content: p.prompt}, {role: 'assistant', content: last ? REPORT : `### 发现\n- 要点${runs.length}\n### 来源\n- 页 | https://s${runs.length}.com/a`}); return {status: 'completed'}; },
    cancel: async () => {},
  };
  const documents = {importFile: importFile || (async (name, format, bytes) => { imports.push({name, format, bytes}); return {document: {id: 'doc1', name, revision: 1}}; })};
  const requests = [];
  const svc = createPlanService({store, models: createModelService({store, secrets: {}}), key: () => '', view: () => store.data, conversations, ...(withDocs ? {documents} : {}),
    request: async (_s, _k, messages) => { requests.push(messages); return {text: planText}; }});
  return {store, svc, runs, imports, requests};
}

test('research draft: research prompt, tools forced on, model report step replaced by the fixed one', async () => {
  const {store, svc, requests} = setup();
  await svc.planDraft({id: 'r', prompt: '研究国内储能市场', kind: 'research', toolsEnabled: false});
  assert.match(requests[0][0].content, /研究规划助手/);
  const plan = store.data.chats[0].plan;
  assert.equal(plan.kind, 'research'); assert.equal(plan.toolsEnabled, true);
  assert.deepEqual(plan.steps.map(s => s.title), ['市场规模', '技术路线', '撰写研究报告']);
  await assert.rejects(setup({withDocs: false}).svc.planDraft({id: 'x', prompt: '课题', kind: 'research'}), /无法保存研究报告/);
  await assert.rejects(setup({planText: '{"steps":[{"title":"撰写报告"}]}'}).svc.planDraft({id: 'y', prompt: '课题', kind: 'research'}), /没有给出可执行的步骤/);
});

test('research run gathers sources, writes the report and saves it as DOCX; edited outlines keep the report step last', async () => {
  const {store, svc, runs, imports} = setup();
  await svc.planDraft({id: 'r', prompt: '研究国内储能市场', kind: 'research'});
  await svc.planRun({id: 'r', steps: [{title: '政策环境'}, {title: '撰写研究报告'}, {title: '市场规模'}]});
  const plan = store.data.chats[0].plan;
  await until(() => plan.status !== 'running');
  assert.equal(plan.status, 'done');
  assert.deepEqual(plan.steps.map(s => s.title), ['政策环境', '市场规模', '撰写研究报告']);
  assert.equal(runs.length, 3); assert.ok(runs.every(r => r.toolsEnabled === true)); assert.match(runs[2].prompt, /撰写研究报告/);
  assert.equal(imports.length, 1); assert.equal(imports[0].format, 'docx'); assert.equal(imports[0].name, '研究报告-储能市场研究');
  assert.equal(Buffer.from(imports[0].bytes).subarray(0, 2).toString(), 'PK');
  assert.deepEqual(plan.report, {id: 'doc1', name: '研究报告-储能市场研究', revision: 1});
  assert.deepEqual(store.data.chats[0].messages.at(-1).researchReport, plan.report);
  assert.deepEqual(plan.sources, ['https://s1.com/a', 'https://s2.com/a', 'https://www.nea.gov.cn/a.html']);
});

test('a failing report save marks the research unfinished with a reason', async () => {
  const {store, svc} = setup({importFile: async () => { throw new Error('磁盘已满'); }});
  await svc.planDraft({id: 'r', prompt: '课题', kind: 'research'});
  await svc.planRun({id: 'r'});
  const plan = store.data.chats[0].plan;
  await until(() => plan.status !== 'running');
  assert.equal(plan.status, 'failed'); assert.match(plan.error, /报告保存失败：磁盘已满/); assert.equal(plan.report, undefined);
});

test('research card: fixed report step in the draft, report actions when done', () => {
  const action = (l, a, id = '') => `<button data-action="${a}" data-id="${id}">${l}</button>`;
  const draft = planCard({id: 'p', kind: 'research', status: 'draft', steps: [{title: '甲', status: 'pending'}, {...REPORT_STEP, status: 'pending'}]}, action);
  assert.match(draft, /深度研究/); assert.match(draft, /开始研究/); assert.match(draft, /自动追加/);
  assert.equal((draft.match(/class="plan-step edit"/g) || []).length, 1);
  assert.match(draft, /planRemoveStep[^>]*disabled/);
  const done = planCard({id: 'p', kind: 'research', status: 'done', sources: ['a', 'b'], report: {id: 'd1', name: '研究报告-X'}, steps: [{title: '甲', status: 'done'}, {...REPORT_STEP, status: 'done'}]}, action);
  assert.match(done, /2 个来源/); assert.match(done, /研究报告-X/); assert.match(done, /data-action="documentWordEditor" data-id="d1"/);
  const root = {querySelectorAll: () => [{querySelector: s => ({value: s.includes('title') ? ' 乙 ' : ''})}]};
  assert.deepEqual(readPlanSteps(root), [{title: ' 乙 ', detail: ''}]);
});
