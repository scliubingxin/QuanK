import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGraphExtraction, mergeExtraction, selectEntities, graphBlock, pendingSources, redact, emptyGraph, nameKey, prune, graphSettings, relationsOf } from '../src/shared/graph.js';
import { createGraphService, BACKOFF_MS } from '../services/graph.mjs';
import { graphPage, graphDetail, graphEntityForm, graphEntityPayload, graphMergeForm, graphSources, neighbourhoodSvg } from '../src/ui/graph.js';

let n = 0;
const uid = () => 'e' + (++n);
const X = JSON.stringify({entities: [
  {name: '通威股份', type: 'org', summary: '光伏企业，是用户的客户', aliases: ['通威', '用户']},
  {name: '张三', type: 'person', summary: '通威采购负责人'},
  {name: '用户', type: 'person'}, {name: '公司', type: 'org'}, {name: '13812345678', type: 'person'}, {name: '李四', type: 'alien', summary: '密码是 abc'},
  {name: 'P3 连接器项目', type: 'project'}],
  relations: [{from: '张三', to: '通威股份', type: '任职于'}, {from: '张三', to: '张三', type: '自己'}, {from: '王五', to: 'P3 连接器项目', type: '负责'}, {from: '张三', to: '通威股份', type: '任职于'}]});

test('parseGraphExtraction keeps named entities, drops generic/sensitive/self relations', () => {
  const r = parseGraphExtraction('好的：\n```json\n' + X + '\n```');
  assert.deepEqual(r.entities.map(e => [e.name, e.type]), [['通威股份', 'org'], ['张三', 'person'], ['李四', 'org'], ['P3 连接器项目', 'project']]);
  assert.deepEqual(r.entities[0].aliases, ['通威']);
  assert.equal(r.entities[2].summary, '');
  assert.deepEqual(r.relations, [{from: '张三', to: '通威股份', type: '任职于'}, {from: '王五', to: 'P3 连接器项目', type: '负责'}]);
  assert.deepEqual(parseGraphExtraction('not json'), {entities: [], relations: []});
  assert.equal(nameKey(' 通威 股份（集团）'), '通威股份集团');
});

test('mergeExtraction upserts by name/alias, dedupes relations, respects blocked names and user edits', () => {
  const g = emptyGraph();
  const r1 = mergeExtraction(g, parseGraphExtraction(X), {key: 'chat:1', title: '对话一'}, {now: 1, uid});
  assert.equal(r1.added.length, 5);
  const tw = g.entities.find(e => e.name === '通威股份');
  assert.equal(g.entities.find(e => e.name === '王五').type, 'org');
  assert.equal(g.relations.length, 2);
  const r2 = mergeExtraction(g, {entities: [{name: '通威', type: 'org', summary: '新的描述'}], relations: [{from: '张三', to: '通威', type: '任职于'}]}, {key: 'doc:9', title: '纪要'}, {now: 2, uid});
  assert.equal(r2.added.length, 0);
  assert.equal(tw.mentions, 2);
  assert.equal(tw.summary, '新的描述');
  assert.deepEqual(tw.sources.map(s => s.key), ['doc:9', 'chat:1']);
  assert.equal(g.relations.length, 2);
  assert.equal(g.relations.find(r => r.type === '任职于').mentions, 2);
  tw.userEdited = true; tw.summary = '手写';
  mergeExtraction(g, {entities: [{name: '通威股份', type: 'product', summary: '模型的说法'}]}, {key: 'chat:2', title: 'x'}, {now: 3, uid});
  assert.deepEqual([tw.summary, tw.type], ['手写', 'org']);
  g.blocked = ['赵六'];
  const r3 = mergeExtraction(g, {entities: [{name: '赵六', type: 'person'}], relations: [{from: '赵六', to: '通威股份', type: '合作'}]}, {key: 'chat:3', title: 'y'}, {now: 4, uid});
  assert.equal(r3.added.length, 0);
  assert.ok(!g.entities.some(e => e.name === '赵六'));
});

test('prune keeps user-edited entities and drops dangling relations', () => {
  const g = emptyGraph();
  for (let i = 0; i < 6; i++) g.entities.push({id: 'x' + i, name: 'N' + i, mentions: i, updated: i, userEdited: i === 0});
  g.relations.push({id: 'r', from: 'x0', to: 'x1', type: 't'}, {id: 's', from: 'x4', to: 'x5', type: 't'});
  prune(g, {entityLimit: 3});
  assert.deepEqual(g.entities.map(e => e.id), ['x0', 'x4', 'x5']);
  assert.deepEqual(g.relations.map(r => r.id), ['s']);
});

test('selectEntities matches names and aliases in the query; graphBlock includes relations within budget', () => {
  const g = emptyGraph();
  mergeExtraction(g, parseGraphExtraction(X), {key: 'chat:1', title: 't'}, {now: 1, uid});
  assert.deepEqual(selectEntities(g, '帮我给通威写封邮件，抄送张三').map(e => e.name), ['通威股份', '张三']);
  assert.deepEqual(selectEntities(g, '今天天气'), []);
  assert.deepEqual(selectEntities(null, '通威'), []);
  const block = graphBlock(selectEntities(g, '通威'), g);
  assert.match(block, /通威股份（公司 \/ 组织），又称通威：光伏企业，是用户的客户。关系：张三 任职于 通威股份/);
  assert.equal(graphBlock([], g), '');
  assert.ok(graphBlock(g.entities, g, {budget: 60}).split('\n').length <= 3);
  assert.equal(graphSettings({}).enabled, true);
  assert.equal(graphSettings({graph: {chats: false}}).chats, false);
});

test('redact hides keys, tokens, phone numbers and passwords', () => {
  const s = redact('key sk-abcdef123456 phone 13812345678 card 6222020200112233445 密码：hunter2 ghp_abcdefghijklmn ok');
  assert.ok(!/sk-abc|13812345678|6222020|hunter2|ghp_/.test(s));
  assert.match(s, /ok$/);
});

const chat = (id, extra = {}) => ({id, name: '对话' + id, finishedAt: 100, messages: [{role: 'user', content: '通威的张三'}, {role: 'assistant', content: '好的'}], ...extra});
test('pendingSources: incognito/unfinished chats skipped, versions compared, connector batches since last run', () => {
  const data = {settings: {}, graph: emptyGraph(),
    chats: [chat('a'), chat('b', {incognito: true}), chat('c', {finishedAt: undefined}), chat('d', {finishedAt: 200, messages: [{role: 'assistant', content: 'x', streaming: true}]})],
    documents: [{id: 'd1', name: '纪要.docx', revision: 2, text: '会议纪要：通威股份与我方讨论了二期合作方案。'}, {id: 'd2', name: '空', revision: 1, text: '短'}],
    connectors: [{id: 'm', name: '邮箱'}], connectorItems: [{connectorId: 'm', title: '报价单', author: '张三 <z@tw.com>', summary: '附件', fetchedAt: 50}, {connectorId: 'm', title: '旧邮件', fetchedAt: 10}]};
  let p = pendingSources(data);
  assert.deepEqual(p.map(s => s.key), ['chat:a', 'doc:d1', 'conn:m']);
  assert.match(p[0].text, /^用户：通威的张三\n助手：好的/);
  assert.match(p[2].text, /报价单（张三 <z@tw\.com>）：附件/);
  data.graph.processed = {'chat:a': 100, 'doc:d1': 2, 'conn:m': 10};
  p = pendingSources(data);
  assert.deepEqual(p.map(s => s.key), ['conn:m']);
  assert.ok(!p[0].text.includes('旧邮件'));
  data.documents[0].revision = 3;
  assert.deepEqual(pendingSources(data, {settings: {...graphSettings({}), connectors: false}}).map(s => s.key), ['doc:d1']);
});

const memStore = data => ({data: {settings: {}, chats: [], documents: [], ...data}, saves: 0, async save() { this.saves++; }, log(t, d) { (this.logs ??= []).push([t, d]); }});

test('service: tick throttles, extraction sends redacted text, marks processed, backs off on errors', async () => {
  let t = 1000, calls = [], fail = false;
  const store = memStore({chats: [chat('a', {messages: [{role: 'user', content: '通威张三 电话 13812345678'}, {role: 'assistant', content: '收到'}]})]});
  const request = async (settings, key, messages) => { calls.push(messages); if (fail) throw new Error('请先设置模型 ID'); return {text: X}; };
  const svc = createGraphService({store, request, now: () => t});
  const r = await svc.tick();
  assert.deepEqual([r.done, r.added], [1, 5]);
  assert.equal(calls.length, 1);
  assert.match(calls[0][0].content, /知识图谱/);
  assert.ok(!calls[0][1].content.includes('13812345678'));
  assert.equal(store.data.graph.processed['chat:a'], 100);
  assert.equal(svc.view().status.pending, 0);
  assert.match(store.logs[0][1], /通威股份/);
  assert.equal(await svc.tick(), null);
  store.data.chats.push(chat('b', {finishedAt: 300}));
  t += 25000; fail = true;
  const e = await svc.tick();
  assert.match(e.error, /请先设置模型/);
  assert.equal(svc.view().status.pending, 1);
  t += 60000; fail = false;
  assert.equal(await svc.tick(), null);
  t += BACKOFF_MS;
  assert.equal((await svc.tick()).done, 1);
  assert.match(calls.at(-1)[0].content, /已知实体：.*通威股份/);
  store.data.settings.graph = {autoExtract: false};
  store.data.chats.push(chat('c', {finishedAt: 400}));
  t += BACKOFF_MS;
  assert.equal(await svc.tick(), null);
  assert.equal((await svc.handle({action: 'extract'})).done, 1);
});

test('service: edit, merge, remove (blocked), relation removal, settings validation, clear', async () => {
  const store = memStore({});
  const svc = createGraphService({store, request: async () => ({text: X}), now: () => 5});
  store.data.chats.push(chat('a'));
  await svc.handle({action: 'extract'});
  const g = () => store.data.graph, by = name => g().entities.find(e => e.name === name);
  await assert.rejects(svc.handle({action: 'edit', id: by('张三').id, name: '通威', type: 'person'}), /已经有名为「通威股份」/);
  await svc.handle({action: 'edit', id: by('张三').id, name: '张三丰', type: 'person', aliases: '老张，张总、张三丰', summary: '采购总监'});
  assert.deepEqual([by('张三丰').aliases, by('张三丰').userEdited], [['老张', '张总'], true]);
  await assert.rejects(svc.handle({action: 'edit', id: by('张三丰').id, name: 'x', type: 'person'}), /至少 2 个字/);
  await svc.handle({action: 'merge', id: by('王五').id, into: by('张三丰').id});
  assert.ok(!by('王五') && by('张三丰').aliases.includes('王五'));
  assert.deepEqual(relationsOf(g(), by('张三丰').id).map(r => `${r.fromName} ${r.type} ${r.toName}`).sort(), ['张三丰 任职于 通威股份', '张三丰 负责 P3 连接器项目']);
  await svc.handle({action: 'removeRelation', id: g().relations.find(r => r.type === '负责').id});
  await assert.rejects(svc.handle({action: 'removeRelation', id: 'nope'}), /不存在/);
  await svc.handle({action: 'remove', id: by('通威股份').id});
  assert.ok(g().blocked.includes('通威股份') && g().blocked.includes('通威'));
  assert.equal(g().relations.length, 0);
  store.data.chats[0].finishedAt = 999;
  await svc.handle({action: 'extract'});
  assert.ok(!by('通威股份'));
  await assert.rejects(svc.handle({action: 'settings', settings: {enabled: 'yes'}}), /设置无效/);
  await assert.rejects(svc.handle({action: 'settings', settings: {evil: true}}), /设置无效/);
  await svc.handle({action: 'settings', settings: {enabled: false}});
  assert.equal(svc.view().settings.enabled, false);
  await svc.handle({action: 'clear'});
  assert.deepEqual([g().entities.length, g().blocked.length, g().processed['chat:a']], [0, 0, 999]);
  await svc.handle({action: 'clear', reprocess: true});
  assert.deepEqual(g().processed, {});
  await assert.rejects(svc.handle({action: 'nope'}), /未知操作/);
});

test('daily cap stops automatic runs but not manual ones', async () => {
  let t = 1;
  const store = memStore({chats: Array.from({length: 3}, (_, i) => chat('c' + i, {finishedAt: 10 + i}))});
  const svc = createGraphService({store, request: async () => ({text: '{"entities":[]}'}), now: () => t});
  store.data.graph = {...emptyGraph(), daily: {day: new Date(1).toISOString().slice(0, 10).replace(/^(\d+)-(\d+)-(\d+)$/, (m, y, mo, d) => `${y}-${mo}-${d}`), count: 100}};
  const { dayKey } = await import('../src/shared/graph.js');
  store.data.graph.daily.day = dayKey(t);
  const r = await svc.tick();
  assert.equal(r.done, 0);
  assert.match(r.error, /今天已自动整理 100 次/);
  assert.equal((await svc.handle({action: 'extract', max: 2})).done, 2);
});

test('UI: page escapes, filters, detail svg, forms and reply sources', () => {
  const g = emptyGraph();
  mergeExtraction(g, parseGraphExtraction(X), {key: 'chat:1', title: '<b>对话</b>'}, {now: 1, uid});
  g.entities[0].summary = '<img src=x onerror=1>';
  const state = {graph: {entities: g.entities, relations: g.relations, settings: graphSettings({}), status: {pending: 2, today: 1, cap: 100, lastError: '<i>x</i>'}}};
  const ui = {action: (l, a, id = '') => `<button data-action="${a}" data-id="${id}">${l}</button>`, date: () => 'd', heading: (k, t, d, b) => `<h1>${t}</h1>${b}`, empty: t => t};
  const html = graphPage(state, ui);
  assert.ok(!html.includes('<img src=x') && !html.includes('<i>x</i>'));
  assert.match(html, /5 个实体 · 2 条关系 · 待整理 2 项/);
  assert.match(html, /张三 <b>任职于<\/b> 通威股份/);
  assert.ok(!graphPage(state, {...ui, type: 'person'}).includes('<h3>通威股份</h3>'));
  assert.ok(graphPage(state, {...ui, query: '采购'}).includes('<h3>张三</h3>'));
  assert.match(graphPage({graph: {entities: [], relations: [], settings: {}, status: {}}}, ui), /图谱还是空的/);
  const tw = g.entities.find(e => e.name === '通威股份');
  const detail = graphDetail(state, tw.id, ui);
  assert.match(detail, /<svg class="graph-svg"/);
  assert.match(detail, /graphRemoveRelation/);
  assert.match(detail, /对话 · &lt;b&gt;对话&lt;\/b&gt;/);
  assert.equal(neighbourhoodSvg(g, 'missing'), '');
  assert.match(graphEntityForm(tw), /<option value="org" selected>/);
  const f = new FormData();
  for (const [k, v] of [['name', 'N'], ['type', 'person'], ['aliases', 'a，b'], ['summary', 's']]) f.set(k, v);
  assert.deepEqual(graphEntityPayload(f, 'i'), {action: 'edit', id: 'i', name: 'N', type: 'person', aliases: 'a，b', summary: 's'});
  assert.ok(!graphMergeForm(state, tw.id).includes(`value="${tw.id}"`));
  assert.equal(graphSources({}, ui.action), '');
  assert.match(graphSources({entities: [{id: 'z', name: '<通威>', type: 'org'}]}, ui.action), /参考了知识图谱中的 1 个实体[\s\S]*&lt;通威&gt;/);
});
