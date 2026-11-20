// [p1-m4] Background completion: unread flag, completion hook, chatSeen, recap banner and sidebar dot.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../core.mjs';
import {createModelService} from '../services/models.mjs';
import {createConversationService} from '../services/conversation.mjs';
import {createChatService} from '../services/chats.mjs';
import {recentSections} from '../src/ui/chats.js';
import {conversationContent} from '../src/ui/workspace.js';

function setup(request) {
  const store = {data: initialState(), save: async () => {}, log: () => {}};
  const done = [];
  const service = createConversationService({store, models: createModelService({store, secrets: {}}), active: new Map(), key: () => '', view: () => store.data, executeTool: async () => ({}),
    request, onCompleted: e => done.push(e)});
  return {store, service, done};
}

test('completed and failed runs mark the chat unread and call the completion hook once', async () => {
  let s = setup(async () => ({text: '周报已完成'}));
  await s.service.run({id: 'c', prompt: '写周报'});
  const chat = s.store.data.chats[0];
  assert.equal(chat.unread, true); assert.ok(chat.finishedAt > 0);
  assert.equal(s.done.length, 1); assert.equal(s.done[0].status, 'completed'); assert.equal(s.done[0].text, '周报已完成'); assert.equal(s.done[0].chat, chat);

  s = setup(async () => { throw Error('模型不可用'); });
  await s.service.run({id: 'c', prompt: '写周报'});
  assert.equal(s.store.data.chats[0].unread, true);
  assert.equal(s.done.length, 1); assert.equal(s.done[0].status, 'failed'); assert.match(s.done[0].text, /模型不可用/);
});

test('a throwing completion hook never breaks the reply', async () => {
  const store = {data: initialState(), save: async () => {}, log: () => {}};
  const service = createConversationService({store, models: createModelService({store, secrets: {}}), active: new Map(), key: () => '', view: () => store.data, executeTool: async () => ({}),
    request: async () => ({text: '好'}), onCompleted: () => { throw Error('notification failed'); }});
  await service.run({id: 'c', prompt: '你好'});
  assert.equal(store.data.chats[0].messages.at(-1).content, '好');
});

test('chatSeen clears the flag; unknown or already-seen chats are no-ops', async () => {
  const store = {data: initialState(), save: async () => {}};
  store.data.chats = [{id: 'a', name: 'A', unread: true, messages: []}, {id: 'b', name: 'B', messages: []}];
  const svc = createChatService({store, active: new Map(), view: () => store.data});
  await svc.chatSeen({id: 'a'}); assert.equal(store.data.chats[0].unread, undefined);
  await svc.chatSeen({id: 'b'}); await svc.chatSeen({id: 'zz'}); await svc.chatSeen({});
});

test('sidebar shows an unread dot except for the open chat; recap banner renders once for its chat', () => {
  const chats = [{id: 'a', name: '后台任务', unread: true, time: 2, messages: []}, {id: 'b', name: '当前', unread: true, time: 1, messages: []}];
  const html = recentSections({chats, chatId: 'b', page: 'chat'});
  assert.equal((html.match(/unread-dot/g) || []).length, 1);
  const action = (l, a) => `<button data-action="${a}">${l}</button>`;
  const base = {state: {chats: [{id: 'a', name: 'x', messages: [{role: 'assistant', content: '结果'}]}], executions: []}, chatId: 'a', pending: false, previewTabs: [], icon: () => '', composer: () => '', action, date: () => 'D', taskStatus: () => '已完成', trace: () => '', executionRecords: () => [], executionRow: () => '', rich: s => s};
  const withRecap = conversationContent({...base, recap: {id: 'a', status: 'completed', finishedAt: 1, seconds: '12', tools: 3, preview: '结果<b>'}});
  assert.match(withRecap, /离开期间已完成/); assert.match(withRecap, /用时 12s/); assert.match(withRecap, /执行了 3 步/); assert.match(withRecap, /结果&lt;b&gt;/); assert.match(withRecap, /recapJump/);
  assert.doesNotMatch(conversationContent({...base, recap: {id: 'other', status: 'completed'}}), /recap-banner/);
  assert.doesNotMatch(conversationContent(base), /recap-banner/);
  assert.match(conversationContent({...base, recap: {id: 'a', status: 'failed'}}), /未完成/);
});
