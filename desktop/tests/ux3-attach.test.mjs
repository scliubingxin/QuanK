// [ux3] attachments in plan / research mode, and sending an attachment without text
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../core.mjs';
import {createModelService} from '../services/models.mjs';
import {createPlanService, planAttachments} from '../services/plan.mjs';
import {readFile} from 'node:fs/promises';

const until = async f => { for (let i = 0; i < 200 && !f(); i++) await new Promise(r => setTimeout(r, 5)); assert.ok(f(), 'condition not reached'); };
const DOC = {documentId: 'd1', revision: 2, sha256: 'a'.repeat(64), name: 'AI辅助合同评审项目-项目开工会.docx', evil: 'x'};
const FILE = {folderId: 'f1', relative: 'notes/纪要.md', text: 'never forwarded'};

function setup(planText) {
  const store = {data: initialState(), save: async () => {}, log: () => {}};
  const runs = [], requests = [];
  const conversations = {run: async p => { runs.push(p); const chat = store.data.chats.find(c => c.id === p.id); chat.messages.push({role: 'user', content: p.prompt}, {role: 'assistant', content: p.planStep === 2 ? '# 报告\n## 摘要\n- a\n## 参考来源\n[1] x https://a.com' : '完成 https://a.com'}); return {}; }, cancel: async () => {}};
  const documents = {importFile: async (name) => ({document: {id: 'rep', name, revision: 1}})};
  const svc = createPlanService({store, models: createModelService({store, secrets: {}}), key: () => '', view: () => store.data, conversations, documents,
    request: async (_s, _k, messages) => { requests.push(messages); return {text: planText}; }});
  return {store, svc, runs, requests};
}

test('planAttachments keeps only known fields, bounds counts, returns null when empty', () => {
  assert.equal(planAttachments({}), null);
  assert.equal(planAttachments({documents: [{name: 'x'}], files: [{folderId: 'f'}]}), null);
  const a = planAttachments({documents: [DOC], files: [FILE]});
  assert.deepEqual(a, {documents: [{documentId: 'd1', revision: 2, sha256: 'a'.repeat(64), name: DOC.name}], files: [{folderId: 'f1', relative: 'notes/纪要.md'}]});
  assert.equal(planAttachments({files: Array.from({length: 50}, (_, i) => ({folderId: 'f', relative: 'a' + i}))}).files.length, 20);
});

test('plan mode: planner sees attachment names; every step receives the attachments', async () => {
  const {store, svc, runs, requests} = setup('{"steps":[{"title":"读资料"},{"title":"列要点"}]}');
  await svc.planDraft({id: 'c', prompt: '总结一下', documents: [DOC], files: [FILE]});
  assert.match(requests[0][1].content, /用户附加了资料：AI辅助合同评审项目-项目开工会\.docx、纪要\.md/);
  const chat = store.data.chats[0];
  assert.equal(chat.messages[0].documents[0].documentId, 'd1');
  await svc.planRun({id: 'c'});
  await until(() => chat.plan.status === 'done');
  assert.equal(runs.length, 2);
  for (const r of runs) { assert.deepEqual(r.documents.map(d => d.documentId), ['d1']); assert.deepEqual(r.files, [{folderId: 'f1', relative: 'notes/纪要.md'}]); }
  assert.ok(!JSON.stringify(runs).includes('never forwarded'));
});

test('research mode: sub-question steps get the attachments, the report step does not; no attachments means none passed', async () => {
  const {store, svc, runs} = setup('{"steps":[{"title":"背景"},{"title":"现状"}]}');
  await svc.planDraft({id: 'r', prompt: '研究一下', kind: 'research', documents: [DOC]});
  const chat = store.data.chats[0];
  assert.equal(chat.plan.steps.length, 3);
  await svc.planRun({id: 'r'});
  await until(() => ['done', 'failed'].includes(chat.plan.status));
  assert.equal(runs.length, 3);
  assert.ok(runs[0].documents && runs[1].documents);
  assert.equal(runs[2].documents, undefined);
  const plain = setup('{"steps":[{"title":"一"}]}');
  await plain.svc.planDraft({id: 'p', prompt: '做事'});
  assert.equal(plain.store.data.chats[0].plan.attachments, undefined);
  assert.doesNotMatch(plain.requests[0][1].content, /附加了资料/);
  await plain.svc.planRun({id: 'p'});
  await until(() => plain.store.data.chats[0].plan.status === 'done');
  assert.equal(plain.runs[0].documents, undefined);
  assert.equal(plain.runs[0].files, undefined);
});

test('composer: an attachment alone can be sent; plan/research mode forwards and clears attachments', async () => {
  const src = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(src, /!draft\.trim\(\)&&!images\.length&&!files\.length\)\)/);
  assert.match(src, /files\.length\?'请阅读附加的资料/);
  const send = src.slice(src.indexOf('async function sendPlan('), src.indexOf('// [p1-m3] slash commands'));
  assert.match(send, /const attached = \[\.\.\.files\]; files = \[\];/);
  assert.match(send, /documents: attached\.filter\(f => f\.documentId\)/);
  assert.match(send, /files: attached\.filter\(f => !f\.documentId\)/);
  assert.match(send, /files = attached;/);
});
