// [p1-m1] Long-term memory: selection, learning, storage limits, workspace handler and conversation integration.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../core.mjs';
import {createModelService} from '../services/models.mjs';
import {createConversationService} from '../services/conversation.mjs';
import {createWorkspaceService} from '../services/workspace.mjs';
import {selectMemories, memoryBlock, parseExtraction, mergeLearned, shouldLearn, isSensitive, similarity, normalizeMemory, memorySettings, MEMORY_LIMIT} from '../services/memory.mjs';
import {memoryPage, memorySources} from '../src/ui/memory.js';

const settle = () => new Promise(r => setTimeout(r, 20));

test('explicit memories are always selected; learned ones only when relevant', () => {
  const mem = [
    {id: 'u1', text: '请用简洁的中文回答', source: 'user', updated: 2},
    {id: 'a1', text: '用户负责 QuankSight 桌面版的 Office 编辑器', source: 'auto', updated: 3},
    {id: 'a2', text: '用户喜欢用深蓝色作为品牌主色', source: 'auto', updated: 4},
  ];
  const ids = q => selectMemories(mem, q).map(m => m.id);
  assert.deepEqual(ids('帮我改一下 Office 编辑器的工具栏'), ['u1', 'a1']);
  assert.deepEqual(ids('今天天气怎么样'), ['u1']);
  assert.ok(ids('品牌主色用什么').includes('a2'));
  assert.equal(memoryBlock([]), '');
  assert.match(memoryBlock(selectMemories(mem, 'x')), /长期记忆[\s\S]*\[偏好\] 请用简洁的中文回答/);
  assert.deepEqual(normalizeMemory({id: 'old', text: ' 旧偏好 '}), {id: 'old', text: '旧偏好', kind: 'preference', source: 'user', chatId: undefined, created: 0, updated: 0, uses: 0, lastUsed: undefined});
  assert.deepEqual(memorySettings({}), {enabled: true, autoLearn: true});
  assert.deepEqual(memorySettings({memory: {autoLearn: false}}), {enabled: true, autoLearn: false});
});

test('learning gate, sensitive filter and extraction parsing', () => {
  assert.equal(shouldLearn('记住：以后报告都用微软雅黑'), true);
  assert.equal(shouldLearn('帮我算一下 3+5'), false);
  assert.equal(shouldLearn('记住我的密码是 abc123'), false);
  assert.equal(isSensitive('手机号 13812345678'), true);
  assert.equal(isSensitive('用户偏好先给结论'), false);
  assert.deepEqual(parseExtraction('好的\n[{"text":"用户希望报告使用微软雅黑","kind":"preference"},{"text":"用户的 API key 是 sk-abcdef123456","kind":"fact"},"短",{"text":"用户在成都工作","kind":"weird"}]'),
    [{text: '用户希望报告使用微软雅黑', kind: 'preference'}, {text: '用户在成都工作', kind: 'preference'}]);
  assert.deepEqual(parseExtraction('没有'), []);
  assert.deepEqual(parseExtraction('[not json'), []);
  assert.ok(similarity('用户希望报告使用微软雅黑字体', '用户希望报告使用微软雅黑') > 0.6);
});

test('merge refreshes near duplicates, never edits user memories and evicts least-used learned ones', () => {
  const mem = [{id: 'u', text: '用户希望报告使用微软雅黑', source: 'user'}, {id: 'a', text: '用户在成都高新区工作', source: 'auto', uses: 0, updated: 1}];
  const r1 = mergeLearned(mem, [{text: '用户希望报告使用微软雅黑字体', kind: 'preference'}, {text: '用户在成都高新区上班工作', kind: 'profile'}, {text: '用户负责通威项目', kind: 'fact'}], {chatId: 'c'});
  assert.equal(r1.added.length, 1); assert.equal(r1.updated.length, 1);
  assert.equal(mem.find(m => m.id === 'u').text, '用户希望报告使用微软雅黑');
  assert.equal(mem.find(m => m.id === 'a').text, '用户在成都高新区上班工作');
  const many = Array.from({length: MEMORY_LIMIT}, (_, i) => ({id: 'm' + i, text: '记忆条目编号' + i + '号内容' + 'abcdefghij'[i % 10].repeat(3), source: 'auto', uses: i === 0 ? 0 : 5, updated: i}));
  many.push({id: 'keep', text: '用户手写的偏好', source: 'user'});
  mergeLearned(many, [{text: '全新的一条用户事实记录', kind: 'fact'}], {});
  assert.equal(many.length, MEMORY_LIMIT);
  assert.ok(!many.some(m => m.id === 'm0'), 'least used learned memory evicted');
  assert.ok(many.some(m => m.id === 'keep'));
});

test('workspace memory handler: add/edit/remove/clear/settings with validation', async () => {
  const store = {data: initialState(), save: async () => {}};
  const ws = createWorkspaceService({store, active: new Map(), view: () => store.data});
  await ws.memory({text: '请先给结论', kind: 'preference'});
  const id = store.data.memories[0].id;
  assert.equal(store.data.memories[0].source, 'user');
  store.data.memories.push({id: 'auto1', text: '用户负责项目甲', source: 'auto'});
  await ws.memory({id: 'auto1', text: '用户负责项目甲和乙', kind: 'fact'});
  assert.equal(store.data.memories.find(m => m.id === 'auto1').source, 'user', 'edited memory becomes explicit');
  await assert.rejects(ws.memory({id: 'nope', text: 'x'}), /不存在/);
  await assert.rejects(ws.memory({text: 'x', kind: 'evil'}), /类型/);
  await assert.rejects(ws.memory({settings: {enabled: 'yes'}}), /设置/);
  await ws.memory({settings: {autoLearn: false}});
  assert.deepEqual(store.data.settings.memory, {enabled: true, autoLearn: false});
  store.data.memories.push({id: 'auto2', text: '自动', source: 'auto'});
  await ws.memory({clear: 'auto'}); assert.ok(!store.data.memories.some(m => m.id === 'auto2') && store.data.memories.some(m => m.id === id));
  await assert.rejects(ws.memory({clear: 'some'}), /范围/);
  await ws.memory({id, remove: true}); assert.ok(!store.data.memories.some(m => m.id === id));
  await ws.memory({clear: 'all'}); assert.equal(store.data.memories.length, 0);
});

function setup(reply, learn) {
  const store = {data: initialState(), save: async () => {}, log: () => {}};
  const models = createModelService({store, secrets: {}});
  const calls = [];
  const service = createConversationService({store, models, active: new Map(), key: () => '', view: () => store.data, executeTool: async () => ({}),
    request: async (_s, _k, history, _signal, tools, options) => {
      calls.push({history, tools, stream: typeof options?.onDelta === 'function'});
      if (history[0].content.startsWith('你负责为用户维护长期记忆')) return {text: learn};
      return {text: reply};
    }});
  return {store, service, calls};
}

test('conversation injects relevant memories, records them on the reply and learns in the background', async () => {
  const {store, service, calls} = setup('好的，已按微软雅黑处理。', '[{"text":"用户希望报告统一使用微软雅黑","kind":"preference"}]');
  store.data.memories.push({id: 'u1', text: '请用简洁的中文回答'}, {id: 'a1', text: '用户在做 QuankSight 项目', source: 'auto'});
  await service.run({id: 'c1', prompt: '记住：以后报告统一使用微软雅黑'});
  await settle();
  const system = calls[0].history[0].content;
  assert.match(system, /长期记忆/); assert.match(system, /请用简洁的中文回答/); assert.doesNotMatch(system, /QuankSight 项目/);
  const reply = store.data.chats[0].messages.at(-1);
  assert.deepEqual(reply.memories, [{id: 'u1', text: '请用简洁的中文回答'}]);
  assert.equal(store.data.memories.find(m => m.id === 'u1').uses, 1);
  assert.equal(calls.length, 2, 'one extra tool-less learning call');
  assert.equal(calls[1].tools, undefined); assert.equal(calls[1].stream, false);
  const learned = store.data.memories.find(m => m.source === 'auto' && /微软雅黑/.test(m.text));
  assert.ok(learned); assert.equal(learned.chatId, 'c1');
  assert.deepEqual(reply.learned, [{id: learned.id, text: learned.text}]);
});

test('no learning call for ordinary prompts, when disabled, or in incognito chats', async () => {
  let s = setup('答案', '[{"text":"用户x","kind":"fact"}]');
  await s.service.run({id: 'c', prompt: '3 加 5 等于几'}); await settle();
  assert.equal(s.calls.length, 1);

  s = setup('好', '[{"text":"用户希望以后都用表格展示数据","kind":"preference"}]');
  s.store.data.settings.memory = {enabled: true, autoLearn: false};
  await s.service.run({id: 'c', prompt: '记住以后都用表格'}); await settle();
  assert.equal(s.calls.length, 1); assert.equal(s.store.data.memories.length, 0);

  s = setup('好', '[{"text":"用户希望以后都用表格展示数据","kind":"preference"}]');
  s.store.data.memories.push({id: 'u1', text: '请用简洁的中文回答'});
  await s.service.run({id: 'c', prompt: '记住以后都用表格', incognito: true}); await settle();
  assert.equal(s.calls.length, 1);
  assert.doesNotMatch(s.calls[0].history[0].content, /简洁/);
  assert.equal(s.store.data.chats[0].incognito, true);
  assert.equal(s.store.data.chats[0].messages.at(-1).memories, undefined);

  s = setup('好', 'x');
  s.store.data.settings.memory = {enabled: false, autoLearn: true};
  s.store.data.memories.push({id: 'u1', text: '请用简洁的中文回答'});
  await s.service.run({id: 'c', prompt: '记住以后都用表格'}); await settle();
  assert.equal(s.calls.length, 1); assert.doesNotMatch(s.calls[0].history[0].content, /简洁/);
});

test('learning failures never affect the saved reply', async () => {
  const store = {data: initialState(), save: async () => {}, log: () => {}};
  const models = createModelService({store, secrets: {}});
  let n = 0;
  const service = createConversationService({store, models, active: new Map(), key: () => '', view: () => store.data, executeTool: async () => ({}),
    request: async () => { if (++n === 2) throw Error('boom'); return {text: '主回复'}; }});
  await service.run({id: 'c', prompt: '记住以后用中文'}); await settle();
  assert.equal(store.data.chats[0].messages.at(-1).content, '主回复');
  assert.equal(store.data.chats[0].messages.at(-1).error, undefined);
});

test('memory views render settings, filters and per-reply sources', () => {
  const action = (l, a, id = '') => `<button data-action="${a}" data-id="${id}">${l}</button>`;
  const icon = () => '', date = () => 'd', heading = (k, t, d, b) => `<h1>${t}</h1>${b}`, empty = t => `<p>${t}</p>`;
  const state = {settings: {memory: {autoLearn: false}}, chats: [{id: 'c1'}], memories: [{id: 'a', text: '自动<b>', source: 'auto', chatId: 'c1', uses: 2}, {id: 'u', text: '手动'}]};
  const html = memoryPage({state, action, icon, date, heading, empty});
  assert.match(html, /data-id="autoLearn" aria-pressed="false"/);
  assert.match(html, /data-id="enabled" aria-pressed="true"/);
  assert.match(html, /自动&lt;b&gt;/); assert.match(html, /参考 2 次/); assert.match(html, /openMemoryChat/);
  assert.doesNotMatch(memoryPage({state, action, icon, date, heading, empty, filter: 'user'}), /自动&lt;b/);
  assert.equal(memorySources({}, action), '');
  const src = memorySources({memories: [{id: 'u', text: '手动'}], learned: [{id: 'n', text: '新'}]}, action);
  assert.match(src, /参考了 1 条记忆/); assert.match(src, /已记住：新/); assert.match(src, /forgetLearned/);
});
