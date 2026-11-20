// [p1-m3] Slash commands, context meter and /compact.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../core.mjs';
import {createModelService} from '../services/models.mjs';
import {createConversationService} from '../services/conversation.mjs';
import {historyForPrompt, estimateTokens, contextUsage, compactionTranscript, formatTokens} from '../src/shared/context.js';
import {matchCommands, contextMeter, helpHtml, SLASH_COMMANDS} from '../src/ui/slash.js';

test('commands are filtered by query and by context', () => {
  const ids = (q, o) => matchCommands(q, o).map(c => c.id);
  assert.ok(ids('', {inChat: false}).includes('incognito'));
  assert.ok(!ids('', {inChat: false}).includes('compact'), 'compact needs a conversation');
  assert.ok(ids('', {inChat: true}).includes('compact'));
  assert.ok(!ids('', {inChat: true}).includes('incognito'));
  assert.deepEqual(ids('com', {inChat: true}), ['compact']);
  assert.deepEqual(ids('研究', {inChat: true}), [], 'agent names are not shadowed by commands');
  assert.ok(matchCommands('').every(c => c.type === 'command'));
  assert.match(helpHtml(), /\/compact/); assert.equal(SLASH_COMMANDS.length, new Set(SLASH_COMMANDS.map(c => c.id)).size);
});

test('history replays summary + newer turns after compaction', () => {
  const messages = Array.from({length: 30}, (_, i) => ({role: i % 2 ? 'assistant' : 'user', content: 'm' + i}));
  messages.push({role: 'assistant', content: 'partial', partial: true});
  const plain = historyForPrompt({messages});
  assert.equal(plain.length, 20); assert.equal(plain.at(-1).content, 'm29');
  const compacted = historyForPrompt({messages, compaction: {summary: '摘要内容', upto: 26}});
  assert.equal(compacted[0].role, 'system'); assert.match(compacted[0].content, /摘要内容/);
  assert.deepEqual(compacted.slice(1).map(m => m.content), ['m26', 'm27', 'm28', 'm29']);
  assert.equal(historyForPrompt({messages, compaction: {summary: 's', upto: 999}}).length, 21, 'bad cut falls back to start');
});

test('token estimate, usage levels and meter markup', () => {
  assert.equal(estimateTokens('你好世界'), 4); assert.equal(estimateTokens('abcdefgh'), 2); assert.equal(estimateTokens(''), 0);
  const small = contextUsage({chat: {messages: [{role: 'user', content: 'hi'}]}, draft: '问题'});
  assert.equal(small.level, 'ok'); assert.ok(small.tokens > 1200 && small.tokens < 1300);
  const big = contextUsage({chat: {messages: [{role: 'user', content: '字'.repeat(64000)}]}});
  assert.equal(big.level, 'high'); assert.equal(big.ratio, 1);
  assert.equal(contextUsage({limit: 10000, draft: '字'.repeat(6000)}).level, 'warn');
  assert.equal(formatTokens(12345), '12.3k'); assert.equal(formatTokens(800), '800');
  const html = contextMeter(big); assert.match(html, /context-meter high/); assert.match(html, /aria-valuenow="100"/); assert.match(html, /\/compact/);
  assert.equal(contextMeter(null), '');
});

function setup(summary = '- 用户在写周报\n- 已确定使用表格') {
  const store = {data: initialState(), save: async () => {}, log: () => {}};
  const models = createModelService({store, secrets: {}});
  const calls = [];
  const service = createConversationService({store, models, active: new Map(), key: () => '', view: () => store.data, executeTool: async () => ({}),
    request: async (_s, _k, history, _signal, tools) => { calls.push({history, tools}); return history[0].content.startsWith('请把下面这段对话压缩') ? {text: summary} : {text: '回复' + calls.length}; }});
  return {store, service, calls};
}

test('/compact summarises, then the next request carries the summary instead of old turns', async () => {
  const {store, service, calls} = setup();
  for (const q of ['第一个问题', '第二个问题', '第三个问题']) await service.run({id: 'c', prompt: q});
  await assert.rejects(service.compact({id: 'nope'}), /不存在/);
  await service.compact({id: 'c'});
  const chat = store.data.chats[0];
  assert.equal(chat.compaction.upto, chat.messages.length); assert.match(chat.compaction.summary, /周报/); assert.equal(chat.compaction.count, 1);
  const compactCall = calls.at(-1); assert.equal(compactCall.tools, undefined); assert.match(compactCall.history[1].content, /第一个问题/);
  await service.run({id: 'c', prompt: '继续'});
  const sent = calls.at(-1).history;
  assert.ok(sent.some(m => m.role === 'system' && /周报/.test(m.content)), 'summary sent');
  assert.ok(!sent.some(m => m.content === '第一个问题'), 'old turns not replayed');
  assert.equal(sent.at(-1).content.split('\n')[0], '继续');
  assert.match(compactionTranscript(chat), /更早的摘要/);
});

test('/compact refuses short chats, empty summaries and running chats', async () => {
  let s = setup();
  await s.service.run({id: 'c', prompt: '只有一问'});
  await assert.rejects(s.service.compact({id: 'c'}), /不需要压缩/);
  s = setup('   ');
  for (const q of ['一', '二', '三']) await s.service.run({id: 'c', prompt: q});
  await assert.rejects(s.service.compact({id: 'c'}), /没有返回摘要/);
  assert.equal(s.store.data.chats[0].compaction, undefined);
  const store = {data: initialState(), save: async () => {}, log: () => {}};
  const active = new Map([['c', {}]]);
  store.data.chats.push({id: 'c', name: 'x', messages: [1, 2, 3, 4].map(i => ({role: 'user', content: String(i)}))});
  const svc = createConversationService({store, models: createModelService({store, secrets: {}}), active, key: () => '', view: () => store.data, executeTool: async () => ({}), request: async () => ({text: 's'})});
  await assert.rejects(svc.compact({id: 'c'}), /等待当前回复/);
});
