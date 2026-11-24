import assert from 'node:assert/strict';
import path from 'node:path';
import { createInterface } from 'node:readline';

const [mode, ...args] = process.argv.slice(2);
const pending = new Map();
let seq = 0, cwd;
const sessionId = 'fixture-session';
const send = value => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\n');
const reverse = (method, params) => new Promise(resolve => {
  const id = 'fixture-' + ++seq;
  pending.set(id, resolve);
  send({ id, method, params: { sessionId, ...params } });
});
const update = value => send({ method: 'session/update', params: { sessionId, update: value } });
const text = value => update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: value } });

async function handle({ id, method, params, ...response }) {
  if (!method) {
    pending.get(id)?.(response);
    pending.delete(id);
    return;
  }
  const ok = result => send({ id, result });
  if (method === 'initialize') {
    if (mode === 'no_acp') { process.stdout.write('not ACP\n'); return; }
    if (mode === 'oversized') { process.stdout.write('x'.repeat(1024 * 1024 + 1)); return; }
    if (mode === 'silent') return;
    if (mode === 'version') { ok({ protocolVersion: 99 }); return; }
    if (mode === 'crashed') process.exit(7);
    assert.equal(params.protocolVersion, 1);
    assert.deepEqual(params.clientCapabilities, { fs: { readTextFile: true, writeTextFile: true }, terminal: true });
    ok({ protocolVersion: 1, agentInfo: { name: 'Fixture', version: '1.0' } });
  } else if (method === 'session/new') {
    assert.deepEqual(params.mcpServers, []);
    cwd = params.cwd;
    assert.equal(process.cwd(), cwd);
    if (mode === 'auth') { send({ id, error: { code: -32000, message: 'authentication required' } }); return; }
    ok({ sessionId });
  } else if (method === 'session/prompt') {
    assert.equal(params.sessionId, sessionId);
    if (mode === 'quota') { send({ id, error: { code: -32603, message: 'quota exceeded' } }); return; }
    if (mode === 'timeout') return;
    if (mode === 'cancel') { process.on('SIGTERM', () => {}); text(String(process.pid)); return; }
    if (mode === 'secret') {
      assert.equal(params.prompt[0].text, '用一句话回复：连接正常');
      assert.equal(process.env.C1_UNRELATED, undefined);
      text('连接正常 ' + process.env.C1_SECRET);
    }
    if (mode === 'updates') {
      assert.deepEqual(args, ['with spaces', '', 'literal $HOME']);
      text('连接');
      text('正常');
      update({ sessionUpdate: 'tool_call', toolCallId: '1', title: 'write', status: 'pending' });
      update({ sessionUpdate: 'tool_call_update', toolCallId: '1', status: 'completed' });
      update({ sessionUpdate: 'plan', entries: [{ content: 'fixture', priority: 'high', status: 'pending' }] });
      const options = [{ optionId: 'yes', name: '允许', kind: 'allow_once' }, { optionId: 'no', name: '拒绝', kind: 'reject_once' }];
      for (const optionId of ['yes', 'no']) {
        const response = await reverse('session/request_permission', { toolCall: { toolCallId: optionId }, options });
        assert.deepEqual(response.result.outcome, { outcome: 'selected', optionId });
      }
    }
    if (mode === 'python') {
      assert.ok(!process.env.PATH.split(path.delimiter).includes(path.join(cwd, 'venv/bin')));
      assert.equal(process.env.VIRTUAL_ENV, undefined);
      const { terminalId } = (await reverse('terminal/create', { cwd, command: 'python3' })).result;
      assert.equal((await reverse('terminal/wait_for_exit', { terminalId })).result.exitCode, 0);
      const { output } = (await reverse('terminal/output', { terminalId })).result;
      assert.deepEqual(output.trim().split('\n'), [path.join(cwd, 'venv'), [path.join(cwd, 'venv/bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].join(path.delimiter)]);
    }
    if (mode === 'paths') {
      for (const target of ['../outside.txt', 'outside-link', 'outside-dir/new.txt', 'hard-link']) {
        for (const method of ['fs/read_text_file', 'fs/write_text_file']) {
          assert.ok((await reverse(method, { path: path.resolve(cwd, target), content: 'changed' })).error, target);
        }
      }
      assert.deepEqual((await reverse('fs/write_text_file', { path: path.join(cwd, 'new.txt'), content: 'first\nsecond\n' })).result, {});
      assert.deepEqual((await reverse('fs/read_text_file', { path: path.join(cwd, 'new.txt'), line: 2, limit: 1 })).result, { content: 'second' });
      assert.ok((await reverse('fs/write_text_file', { path: path.join(cwd, 'refused.txt'), content: 'blocked' })).error);
      assert.ok((await reverse('terminal/create', { cwd: path.dirname(cwd), command: '/bin/echo' })).error);
      assert.ok((await reverse('terminal/create', { cwd, command: '/bin/echo', args: ['denied'] })).error);
      const { terminalId } = (await reverse('terminal/create', { cwd, command: '/bin/echo', args: ['hello'], outputByteLimit: 4 })).result;
      assert.equal((await reverse('terminal/wait_for_exit', { terminalId })).result.exitCode, 0);
      assert.deepEqual((await reverse('terminal/output', { terminalId })).result, { output: 'llo\n', truncated: true, exitStatus: { exitCode: 0, signal: null } });
      assert.deepEqual((await reverse('terminal/kill', { terminalId })).result, {});
      assert.deepEqual((await reverse('terminal/release', { terminalId })).result, {});
      assert.ok((await reverse('terminal/output', { terminalId })).error);
    }
    ok({ stopReason: 'end_turn' });
  }
}

for await (const line of createInterface({ input: process.stdin })) {
  // Reverse responses must be read while a prompt is still pending.
  void handle(JSON.parse(line)).catch(error => { console.error(error); process.exit(8); });
}
