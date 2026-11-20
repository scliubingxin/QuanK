// [p2-m6] Agent-side confirmations (MCP, Skill scripts, local vector search) use approval rules and unattended handling.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store, initialState} from '../core.mjs';
import {createApprover} from '../main/approval.mjs';
import {createAgentSession} from '../services/agent-session.mjs';
import {createApprovalRules, mcpConnectScope, mcpToolScope, skillRunScope, skillImportScope, vectorScope, ruleCandidate} from '../services/approval-rules.mjs';
import {approvalRulesPanel} from '../src/ui/approvals.js';

test('agent scopes: exact keys, read-only MCP only, Skill bound to the package hash', () => {
  const server = {name: '检索', url: 'http://localhost:7000/mcp'};
  assert.deepEqual(mcpConnectScope(server), {kind: 'mcp', key: 'connect http://localhost:7000/mcp', label: '连接 MCP 检索（http://localhost:7000/mcp）'});
  assert.equal(mcpToolScope({name: 'search', server, readOnly: true}).key, 'tool http://localhost:7000/mcp search');
  assert.equal(mcpToolScope({name: 'write', server}), null, 'tools without readOnlyHint always ask');
  assert.equal(mcpToolScope({name: 'write', server, readOnly: 'yes'}), null);
  const pkg = {name: '报价', sha256: 'abc'};
  assert.equal(skillRunScope(pkg, 'scripts/run.py').key, 'run abc scripts/run.py');
  assert.notEqual(skillRunScope({...pkg, sha256: 'def'}, 'scripts/run.py').key, skillRunScope(pkg, 'scripts/run.py').key);
  assert.match(skillImportScope(pkg).label, /回收 Skill「报价」/);
  assert.equal(vectorScope('bge-m3').key, 'vector bge-m3');
  for (const x of [mcpConnectScope({}), skillRunScope({}, 'a'), skillImportScope(null), vectorScope('')]) assert.equal(x, null);
});

test('key rules never cross kinds or match the older scope rules', () => {
  const store = {data: initialState(), save: async () => {}};
  const rules = createApprovalRules({store});
  const browser = ruleCandidate('browser_read', {readScope: {url: 'https://a.com/x'}});
  rules.add(browser);
  rules.add(vectorScope('bge-m3'));
  assert.equal(rules.match({kind: 'browser', key: 'connect https://a.com', label: 'x'}, null), null);
  assert.equal(rules.match(vectorScope('other'), null), null);
  assert.ok(rules.match(vectorScope('bge-m3'), null));
  assert.ok(rules.match(browser, null), 'browser rule still matches by origin');
  assert.equal(store.data.approvalRules.find(r => r.kind === 'vector').key, 'vector bge-m3');
  assert.match(approvalRulesPanel(store.data, {action: (l, a, id) => `<b data-action="${a}" data-id="${id}">${l}</b>`, date: () => 'D'}), /本机检索/);
});

test('gate: rule skips the dialog, "always allow" saves a rule, unattended runs defer and throw', async () => {
  const store = {data: initialState(), save: async () => {}};
  const rules = createApprovalRules({store});
  const asked = [];
  let reply = {allowed: true, alwaysAllow: true};
  const gate = rules.gate(async (title, detail, signal, opts) => { asked.push({title, opts}); return reply; }, {chatId: 'c1'});
  assert.equal(gate.gated, true);
  const scope = vectorScope('bge-m3');
  assert.equal(await gate('本机向量检索', 'd', undefined, {ruleScope: scope}), true);
  assert.deepEqual(asked[0].opts, {ruleScope: scope});
  assert.equal(store.data.approvalRules.length, 1);
  assert.equal(await gate('本机向量检索', 'd', undefined, {ruleScope: scope}), true);
  assert.equal(asked.length, 1, 'second time no dialog');
  reply = false;
  assert.equal(await gate('调用 MCP · write', 'd'), false);
  assert.equal(asked[1].opts, undefined, 'no rule scope → plain dialog');
  reply = {allowed: true};
  assert.equal(await gate('x', 'd'), false, 'objects never count as approval unless they are an always-allow answer with a scope');
  rules.unattended.set('c1', 't1');
  await assert.rejects(gate('执行 Skill 脚本', 'd', undefined, {ruleScope: skillRunScope({name: 'S', sha256: 'h'}, 'a.py')}), e => e.code === 'UNATTENDED_DEFERRED' && /待你确认/.test(e.message));
  assert.equal(asked.length, 3, 'unattended never opens a dialog');
  const pending = store.data.pendingApprovals[0];
  assert.equal(pending.taskId, 't1'); assert.equal(pending.tool, 'skill'); assert.equal(pending.candidate.key, 'run h a.py');
  await rules.handle({action: 'allowPending', id: pending.id, onlyTask: true});
  assert.equal(await gate('执行 Skill 脚本', 'd', undefined, {ruleScope: skillRunScope({name: 'S', sha256: 'h'}, 'a.py')}), true, 'task-only rule applies inside that task');
  rules.unattended.clear('c1');
  reply = false;
  assert.equal(await gate('执行 Skill 脚本', 'd', undefined, {ruleScope: skillRunScope({name: 'S', sha256: 'h'}, 'a.py')}), false, 'task-only rule does not apply outside the task');
});

async function mcpFixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-agent-rules-'));
  const store = new Store(dir); await store.load();
  const agent = {id: 'a', name: 'a', prompt: 'p', tools: [], mcp: [{name: 'local', url: 'http://localhost:1234/mcp'}]};
  store.data.agents.push(agent);
  const calls = [];
  const clientFactory = () => ({
    discover: async () => [
      {name: 'search', description: '查询', inputSchema: {type: 'object', properties: {}, additionalProperties: false}, annotations: {readOnlyHint: true}},
      {name: 'write', description: '写入', inputSchema: {type: 'object', properties: {}, additionalProperties: false}},
    ],
    call: async name => { calls.push(name); return {content: [{type: 'text', text: 'ok ' + name}]}; },
    close: async () => {},
  });
  const shown = [];
  let reply = 1;
  const native = createApprover({getWindow: () => ({}), focus: () => {}, dialog: {showMessageBox: (_w, o) => { shown.push(o); return Promise.resolve({response: typeof reply === 'function' ? reply(o) : reply}); }}});
  const rules = createApprovalRules({store});
  const session = (chatId = 'c1') => createAgentSession({agent: structuredClone(agent), store, clientFactory, chatId, runId: 'r-' + chatId, approve: rules.gate(native, {chatId})});
  return {dir, store, rules, shown, calls, session, setReply: r => { reply = r; }};
}

test('MCP through a real native approver: connect and read-only tools can be always-allowed, writes always ask', async () => {
  const f = await mcpFixture();
  try {
    f.setReply(o => o.buttons.length === 3 ? 2 : 1);
    const s1 = await f.session('c1');
    assert.deepEqual(f.shown[0].buttons, ['取消', '允许这一次', '总是允许']);
    assert.match(f.shown[0].detail, /总是允许」会保存规则：连接 MCP local/);
    assert.ok(f.store.data.approvalRules.some(r => r.key === 'connect http://localhost:1234/mcp'));
    await s1.execute('mcp_0_search', {});
    assert.deepEqual(f.shown[1].buttons, ['取消', '允许这一次', '总是允许'], 'read-only tool offers a rule');
    await s1.execute('mcp_0_write', {});
    assert.deepEqual(f.shown[2].buttons, ['取消', '允许这一次'], 'non read-only tool never offers a rule');
    assert.deepEqual(f.calls, ['search', 'write']);
    await s1.close?.();
    const s2 = await f.session('c2');
    await s2.execute('mcp_0_search', {});
    assert.equal(f.shown.length, 3, 'connect and read-only call now run by rule');
    await s2.close?.();
  } finally { await rm(f.dir, {recursive: true, force: true}); }
});

test('MCP in an unattended run: ruled operations run, the rest are recorded and not executed', async () => {
  const f = await mcpFixture();
  try {
    f.rules.add(mcpConnectScope({name: 'local', url: 'http://localhost:1234/mcp'}));
    f.rules.unattended.set('sched', 'task-1');
    const s = await f.session('sched');
    assert.equal(f.shown.length, 0, 'connect allowed by rule');
    await assert.rejects(s.execute('mcp_0_write', {}), /待你确认/);
    await assert.rejects(s.execute('mcp_0_search', {}), /待你确认/);
    assert.equal(f.shown.length, 0); assert.deepEqual(f.calls, []);
    const [readItem, writeItem] = f.store.data.pendingApprovals;
    assert.equal(readItem.candidate.key, 'tool http://localhost:1234/mcp search');
    assert.equal(writeItem.candidate, undefined, 'writes can never be always-allowed');
    assert.equal(writeItem.taskId, 'task-1');
    await s.close?.();
  } finally { await rm(f.dir, {recursive: true, force: true}); }
});

test('a plain approver keeps the original three-argument call', async () => {
  const f = await mcpFixture();
  try {
    const seen = [];
    const s = await createAgentSession({agent: structuredClone(f.store.data.agents.at(-1)), store: f.store, clientFactory: () => ({discover: async () => [], close: async () => {}}), chatId: 'x', approve: async (...args) => { seen.push(args.length); return true; }});
    assert.deepEqual(seen, [3]);
    await s.close?.();
  } finally { await rm(f.dir, {recursive: true, force: true}); }
});
