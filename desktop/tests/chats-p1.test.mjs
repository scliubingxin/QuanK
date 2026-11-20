// [p1-m2] Conversation management: folders, pin, archive, rename, incognito, search and Markdown export.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../core.mjs';
import {createChatService, purgeIncognito, FOLDER_LIMIT} from '../services/chats.mjs';
import {groupChats, searchChats, recentSections, chatMarkdown, messageText} from '../src/ui/chats.js';

function fixture() {
  const store = {data: initialState(), save: async () => {}};
  store.data.chats = [
    {id: 'a', name: '周报草稿', time: 5, messages: [{role: 'user', content: '帮我写本周周报'}, {role: 'assistant', content: '好的，这是通威项目的周报。'}]},
    {id: 'b', name: '预算表', time: 4, messages: [{role: 'user', content: [{type: 'text', text: '看看这张发票图片'}]}]},
    {id: 'c', name: '无痕问题', time: 6, incognito: true, messages: []},
  ];
  const active = new Map();
  return {store, active, svc: createChatService({store, active, view: () => store.data, queued: () => false})};
}

test('chatMeta renames, pins, archives and moves; validation rejects bad input', async () => {
  const {store, svc} = fixture();
  await svc.chatMeta({id: 'a', name: '  新名字  '}); assert.equal(store.data.chats[0].name, '新名字');
  await svc.chatMeta({id: 'a', pinned: true}); assert.equal(store.data.chats[0].pinned, true);
  await svc.chatMeta({id: 'a', archived: true}); assert.equal(store.data.chats[0].archived, true); assert.equal(store.data.chats[0].pinned, undefined, 'archiving unpins');
  await svc.chatMeta({id: 'a', archived: false}); assert.equal(store.data.chats[0].archived, undefined);
  await assert.rejects(svc.chatMeta({id: 'a', folderId: 'nope'}), /文件夹不存在/);
  await svc.chatFolder({name: '项目'}); const fid = store.data.chatFolders[0].id;
  await svc.chatMeta({id: 'a', folderId: fid}); assert.equal(store.data.chats[0].folderId, fid);
  await svc.chatMeta({id: 'a', folderId: null}); assert.equal(store.data.chats[0].folderId, undefined);
  await assert.rejects(svc.chatMeta({id: 'a'}), /无效/);
  await assert.rejects(svc.chatMeta({id: 'a', evil: 1}), /无效/);
  await assert.rejects(svc.chatMeta({id: 'a', pinned: 'yes'}), /无效/);
  await assert.rejects(svc.chatMeta({id: 'zz', name: 'x'}), /不存在/);
  await assert.rejects(svc.chatMeta({id: 'c', pinned: true}), /无痕/);
});

test('folders: create, rename, duplicate names, limit, delete returns chats to recent', async () => {
  const {store, svc} = fixture();
  await svc.chatFolder({name: '甲'});
  await assert.rejects(svc.chatFolder({name: '甲'}), /同名/);
  const id = store.data.chatFolders[0].id;
  await svc.chatFolder({id, name: '乙'}); assert.equal(store.data.chatFolders[0].name, '乙');
  await svc.chatMeta({id: 'b', folderId: id});
  await svc.chatFolder({id, remove: true});
  assert.equal(store.data.chatFolders.length, 0); assert.equal(store.data.chats.find(c => c.id === 'b').folderId, undefined);
  await assert.rejects(svc.chatFolder({id, remove: true}), /不存在/);
  for (let i = 0; i < FOLDER_LIMIT; i++) await svc.chatFolder({name: 'f' + i});
  await assert.rejects(svc.chatFolder({name: 'one more'}), /最多/);
});

test('incognito chats are discarded on leave and on restart, but not while generating', async () => {
  const {store, active, svc} = fixture();
  active.set('c', {});
  await svc.leaveIncognito({id: 'c'}); assert.ok(store.data.chats.some(c => c.id === 'c'), 'kept while running');
  active.delete('c');
  await svc.leaveIncognito({id: 'a'}); assert.ok(store.data.chats.some(c => c.id === 'a'), 'normal chats untouched');
  await svc.leaveIncognito({id: 'c'}); assert.ok(!store.data.chats.some(c => c.id === 'c'));
  const data = {chats: [{id: 'x', incognito: true}, {id: 'y'}]};
  assert.equal(purgeIncognito(data), 1); assert.deepEqual(data.chats.map(c => c.id), ['y']);
});

test('grouping, full-text search and sidebar HTML', () => {
  const chats = [
    {id: 'p', name: '置顶的', pinned: true, time: 1, messages: []},
    {id: 'f', name: '文件夹里的', folderId: 'F', time: 2, messages: []},
    {id: 'r', name: '最近的', time: 3, messages: [{role: 'assistant', content: '这里提到了通威股份的季度营收和利润情况'}]},
    {id: 'z', name: '归档的', archived: true, time: 4, messages: []},
    {id: 'i', name: '无痕', incognito: true, time: 9, messages: []},
  ];
  const g = groupChats(chats, [{id: 'F', name: '项目F'}]);
  assert.deepEqual(g.pinned.map(h => h.chat.id), ['p']);
  assert.deepEqual(g.folders[0].items.map(h => h.chat.id), ['f']);
  assert.deepEqual(g.recent.map(h => h.chat.id), ['r']);
  assert.deepEqual(g.archived.map(h => h.chat.id), ['z']);
  const hit = searchChats(chats, '营收');
  assert.equal(hit.length, 1); assert.equal(hit[0].chat.id, 'r'); assert.match(hit[0].snippet, /营收/);
  assert.equal(searchChats(chats, '营').length, 0, 'single char only matches names');
  assert.equal(messageText({content: [{type: 'text', text: 'a'}, {type: 'image_url'}]}), 'a');
  const html = recentSections({chats, folders: [{id: 'F', name: '项目<F>'}], chatId: 'r', page: 'chat'});
  assert.match(html, /置顶/); assert.match(html, /项目&lt;F&gt;/); assert.match(html, /已归档/); assert.doesNotMatch(html, /无痕/);
  assert.match(html, /class="selected" data-action="openChat" data-id="r"/);
  assert.match(recentSections({chats, query: '营收'}), /recent-snippet/);
  assert.match(recentSections({chats: [], query: 'x'}), /没有找到/);
});

test('Markdown export keeps turns, attachments and skips intermediate fragments', () => {
  const md = chatMarkdown({name: '周报', messages: [
    {role: 'user', content: '写周报', time: 1, documents: [{name: '数据.xlsx'}]},
    {role: 'assistant', content: '半截', intermediate: true},
    {role: 'assistant', content: '## 本周\n完成了 A', time: 2},
  ]}, {agentName: '助手', date: () => 'T'});
  assert.match(md, /^# 周报/); assert.match(md, /## 我\n\*T\*\n\n附件：数据\.xlsx\n\n写周报/); assert.match(md, /## 助手/); assert.doesNotMatch(md, /半截/);
});
