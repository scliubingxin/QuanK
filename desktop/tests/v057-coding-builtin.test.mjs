import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createCodingRunner } from '../services/coding-agent.mjs';
import { readCompletion } from '../runtime/model-stream.mjs';

const macSandbox = { skip: process.platform !== 'darwin' && '命令沙箱依赖 macOS sandbox-exec' };

let sequence = 0;
const call = (name, args) => ({ id: String(++sequence), type: 'function', function: { name, arguments: JSON.stringify(args) } });
const allow = info => info.options.find(option => option.kind === 'allow_once').optionId;

async function project(t) {
  const base = await realpath(await mkdtemp(path.join(tmpdir(), 'quank-builtin-')));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'project');
  await mkdir(root);
  return root;
}

function scripted(...steps) {
  return async (_settings, _key, history, signal, tools, options) => {
    assert.equal(tools.length, 7);
    const step = steps.shift();
    if (typeof step === 'function') return step({ history, signal });
    const calls = step ?? [];
    const delta = calls.length ? { tool_calls: calls.map((item, index) => ({ ...item, index })) } : { content: '完成' };
    const packet = (value, finish_reason = null) => 'data: ' + JSON.stringify({ choices: [{ index: 0, delta: value, finish_reason }] }) + '\n\n';
    const sse = packet(delta) + packet({}, calls.length ? 'tool_calls' : 'stop') + 'data: [DONE]\n\n';
    return readCompletion(new Response(sse, { headers: { 'content-type': 'text/event-stream' } }),
      { signal, onDelta: options.onDelta, toolsEnabled: true });
  };
}

function runner(t, root, request, options = {}) {
  const client = createCodingRunner({ kind: 'builtin', projectDir: root, request,
    models: { resolve: () => ({ settings: {}, key: () => 'fake-private-key' }) }, ...options });
  t.after(() => client.close());
  const updates = [], permissions = [], ends = [];
  client.on('update', value => updates.push(value)).on('permission', value => permissions.push(value)).on('end', value => ends.push(value));
  return { client, updates, permissions, ends };
}

const results = updates => updates.filter(item => item.sessionUpdate === 'tool_call_update');

test('流式模型可读、列表、搜索、写入、应用补丁并用策略 Python 跑命令', macSandbox, async t => {
  const root = await project(t);
  await writeFile(path.join(root, 'strategy.py'), 'first\nneedle\n');
  await mkdir(path.join(root, 'venv/bin'), { recursive: true });
  await writeFile(path.join(root, 'venv/pyvenv.cfg'), '');
  const python = path.join(root, 'venv/bin/python3');
  await writeFile(python, '#!/bin/sh\nprintf "%s\\n" "$VIRTUAL_ENV" "$PATH"\ncat strategy.py\n', { mode: 0o700 });
  const diff = 'diff --git a/generated.py b/generated.py\n--- a/generated.py\n+++ b/generated.py\n@@ -1 +1 @@\n-before\n+after\n';
  const audit = [];
  const { client, updates, permissions } = runner(t, root, scripted(
    [call('read_file', { path: 'strategy.py', offset: 2, limit: 1 }), call('list_dir', { path: '.' }),
      call('search', { pattern: 'needle', glob: '*.py' }), call('write_file', { path: 'generated.py', content: 'before\n' }),
      call('apply_patch', { unified_diff: diff }), call('run_command', { command: 'python3', args: [] })],
    ({ history }) => {
      assert.match(history[0].content, /自定义规范/);
      assert.match(history[0].content, /\.quank\/reports/);
      assert.equal(history[1].content, 'private prompt');
      assert.equal(history[3].content, 'needle');
      assert.match(history[4].content, /strategy\.py/);
      assert.match(history[5].content, /strategy\.py:2:needle/);
      const command = JSON.parse(history[8].content);
      assert.equal(command.exitCode, 0, command.output);
      assert.deepEqual(command.output.split('\n').slice(0, 2), [
        path.join(root, 'venv'), [path.dirname(python), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].join(path.delimiter),
      ]);
      return { message: { content: '完成' } };
    },
  ), { onPermission: allow, terminalPython: python, spec: '自定义规范', audit: item => audit.push(item) });
  assert.equal((await client.prompt('private prompt')).stopReason, 'end_turn');
  assert.equal(await readFile(path.join(root, 'generated.py'), 'utf8'), 'after\n');
  assert.equal(results(updates).length, 6);
  assert.ok(results(updates).every(item => item.status === 'completed'));
  assert.deepEqual(permissions.map(info => info.toolCall.title), ['write_file', 'apply_patch', 'run_command']);
  assert.doesNotMatch(JSON.stringify(audit), /private prompt|fake-private-key|before/);
});

test('权限拒绝返回失败并继续执行其余工具', async t => {
  const root = await project(t);
  const { client, updates } = runner(t, root, scripted(
    [call('write_file', { path: 'denied', content: 'no' })],
    [call('write_file', { path: 'ok', content: 'yes' })],
  ), { onPermission: info => info.toolCall.rawInput.path === 'ok' ? allow(info) : 'reject_once' });
  await client.prompt('写文件');
  assert.deepEqual(results(updates).map(item => item.status), ['failed', 'completed']);
  await assert.rejects(readFile(path.join(root, 'denied')), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(root, 'ok'), 'utf8'), 'yes');
});

test('拒绝 cwd、相对越界、符号链接、硬链接及命令访问项目外文件', macSandbox, async t => {
  const root = await project(t);
  const outside = path.join(path.dirname(root), 'outside.txt');
  await writeFile(outside, 'outside-secret');
  await symlink(outside, path.join(root, 'escape'));
  await symlink(path.dirname(root), path.join(root, 'escape-dir'));
  const invalid = runner(t, root, scripted(), { cwd: 'escape-dir' }).client;
  await assert.rejects(invalid.start(), { kind: 'project' });
  const { client, updates } = runner(t, root, scripted([
    ...['../outside.txt', 'escape'].map(path => call('read_file', { path })),
    call('write_file', { path: 'escape-dir/outside.txt', content: 'change' }),
    call('list_dir', { path: 'escape-dir' }),
    call('run_command', { command: 'cat', args: [outside] }),
    call('run_command', { command: 'cat', args: ['/System/Volumes/Data' + outside] }),
    call('run_command', { command: 'sh', args: ['-c', 'printf changed > "$1"', 'sh', 'escape'] }),
    call('run_command', { command: 'ln', args: [outside, 'new-hardlink'] }),
  ], async () => {
    await link(outside, path.join(root, 'hard-escape'));
    return { message: { tool_calls: [
      call('read_file', { path: 'hard-escape' }),
      call('run_command', { command: 'cat', args: ['hard-escape'] }),
    ] } };
  }), { onPermission: allow });
  await client.prompt('边界');
  assert.equal(results(updates).length, 10);
  assert.ok(results(updates).every(item => item.status === 'failed'));
  assert.doesNotMatch(JSON.stringify(updates), /outside-secret/);
  assert.equal(await readFile(outside, 'utf8'), 'outside-secret');
});

test('拒绝 git push、remote 及越界参数', async t => {
  const { client, updates, permissions } = runner(t, await project(t), scripted([
    ...['push', 'remote', 'fetch', 'pull', 'config'].map(subcommand => call('git', { subcommand, args: [] })),
    call('git', { subcommand: 'diff', args: ['--no-index', '../outside', 'file'] }),
    call('git', { subcommand: 'checkout', args: ['-b', 'main'] }),
  ]));
  await client.prompt('git');
  assert.equal(permissions.length, 0);
  assert.equal(results(updates).length, 7);
  assert.ok(results(updates).every(item => item.status === 'failed'));
});

test('Git 可建迭代分支和暂存，终端无法修改 Git 元数据', macSandbox, async t => {
  const root = await project(t);
  execFileSync('git', ['init', '-q', root]);
  await writeFile(path.join(root, 'strategy.py'), 'pass\n');
  const config = await readFile(path.join(root, '.git/config'), 'utf8');
  const { client, updates } = runner(t, root, scripted([
    call('git', { subcommand: 'status', args: ['--short'] }),
    call('git', { subcommand: 'checkout', args: ['-b', 'quank/iter-fixture'] }),
    call('git', { subcommand: 'add', args: ['strategy.py'] }),
    call('git', { subcommand: 'diff', args: ['--cached'] }),
    call('run_command', { command: 'sh', args: ['-c', 'echo modified > .git/config'] }),
  ]), { onPermission: allow });
  await client.prompt('git');
  assert.deepEqual(results(updates).map(item => item.status), ['completed', 'completed', 'completed', 'completed', 'failed']);
  assert.equal(await readFile(path.join(root, '.git/HEAD'), 'utf8'), 'ref: refs/heads/quank/iter-fixture\n');
  assert.equal(await readFile(path.join(root, '.git/config'), 'utf8'), config);
});

test('补丁预检拒绝只读快照和越界路径，避免先写入同批合法变更', macSandbox, async t => {
  const root = await project(t);
  await mkdir(path.join(root, '.quank/context'), { recursive: true });
  const snapshot = path.join(root, '.quank/context/input');
  await writeFile(snapshot, 'before\n');
  const addition = 'diff --git a/new b/new\n--- /dev/null\n+++ b/new\n@@ -0,0 +1 @@\n+ok\n';
  const patch = target => addition + `diff --git a/${target} b/${target}\n--- a/${target}\n+++ b/${target}\n@@ -1 +1 @@\n-before\n+after\n`;
  const { client, updates } = runner(t, root, scripted([
    call('apply_patch', { unified_diff: patch('.quank/context/input') }),
    call('apply_patch', { unified_diff: patch('../outside') }),
    call('run_command', { command: 'mv', args: ['.quank', 'moved'] }),
  ]), { onPermission: allow });
  await client.prompt('patch');
  assert.deepEqual(results(updates).map(item => item.status), ['failed', 'failed', 'failed']);
  assert.equal(await readFile(snapshot, 'utf8'), 'before\n');
  await assert.rejects(readFile(path.join(root, 'new')), { code: 'ENOENT' });
});

test('命令输出限制为 256 KB，截断后保留退出状态', macSandbox, async t => {
  const root = await project(t);
  const { client, updates } = runner(t, root, scripted([
    call('run_command', { command: 'head', args: ['-c', '300000', '/dev/zero'] }),
  ]), { onPermission: allow });
  await client.prompt('output');
  const text = results(updates)[0].content[0].content.text;
  assert.ok(Buffer.byteLength(text) <= 256 * 1024);
  const result = JSON.parse(text);
  assert.equal(result.exitCode, 0);
  assert.equal(result.truncated, true);
});

test('.venv 内的硬链接可读且不可写，其他命令照常运行', macSandbox, async t => {
  const root = await project(t);
  const dependency = path.join(path.dirname(root), 'dependency');
  await writeFile(dependency, 'original');
  await mkdir(path.join(root, '.venv'));
  await link(dependency, path.join(root, '.venv', 'dependency'));

  const { client, updates } = runner(t, root, scripted([
    call('run_command', { command: 'sh', args: ['-c', 'printf changed > .venv/dependency'] }),
    call('run_command', { command: 'ln', args: ['.venv/dependency', 'linked-dependency'] }),
    call('run_command', { command: 'cat', args: ['.venv/dependency'] }),
  ]), { onPermission: allow });
  await client.prompt('检查虚拟环境依赖');

  const [write, relink, read] = results(updates).map(item => JSON.parse(item.content[0].content.text));
  assert.notEqual(write.exitCode, 0);
  assert.notEqual(relink.exitCode, 0);
  assert.equal(read.exitCode, 0, read.output);
  assert.equal(read.output, 'original');
  assert.equal(await readFile(dependency, 'utf8'), 'original');
});

test('HOME 和 TMPDIR 在 .quank 下可写，Git 状态保持干净', macSandbox, async t => {
  const root = await project(t);
  execFileSync('git', ['init', '-q', root]);
  await writeFile(path.join(root, '.git', 'info', 'exclude'), '.quank/\n');

  const { client, updates } = runner(t, root, scripted([
    call('run_command', { command: 'sh', args: ['-ec',
      'printf "%s\\n" "$HOME" "$TMPDIR"; echo cache > "$HOME/.cache"; echo temporary > "$TMPDIR/file"'] }),
    call('git', { subcommand: 'status', args: ['--short'] }),
  ]), { onPermission: allow });
  await client.prompt('检查运行目录');

  const [command, status] = results(updates).map(item => JSON.parse(item.content[0].content.text));
  const home = path.join(root, '.quank', 'home');
  const tmp = path.join(root, '.quank', 'tmp');
  assert.equal(command.exitCode, 0, command.output);
  assert.equal(command.output, home + '\n' + tmp + '\n');
  assert.equal(await readFile(path.join(home, '.cache'), 'utf8'), 'cache\n');
  assert.equal(await readFile(path.join(tmp, 'file'), 'utf8'), 'temporary\n');
  assert.equal(status.exitCode, 0, status.output);
  assert.equal(status.output, '');
});

test('硬链接扫描超限后切换为只读并记录一次审计', { ...macSandbox, timeout: 15000 }, async t => {
  const root = await project(t);
  execFileSync(process.execPath, ['-e', `
    const { writeFileSync } = require('node:fs');
    const { join } = require('node:path');
    for (let index = 0; index <= 20000; index++) {
      writeFileSync(join(process.argv[1], String(index)), '');
    }
  `, root], { timeout: 10000 });

  const audit = [];
  const { client, updates } = runner(t, root, scripted(
    [call('run_command', { command: 'sh', args: ['-c', 'echo changed > forbidden'] })],
    [call('run_command', { command: 'ls', args: ['0'] })],
  ), { onPermission: allow, audit: item => audit.push(item) });
  await client.prompt('检查扫描上限');

  const [write, read] = results(updates).map(item => JSON.parse(item.content[0].content.text));
  assert.equal(write.readOnly, true);
  assert.notEqual(write.exitCode, 0);
  await assert.rejects(readFile(path.join(root, 'forbidden')), { code: 'ENOENT' });
  assert.equal(read.readOnly, true);
  assert.equal(read.exitCode, 0, read.output);
  assert.equal(read.output.trim(), '0');
  assert.deepEqual(audit.filter(item => item.action === 'coding.command.link_scan').map(item => item.detail), ['limit_readonly']);
});

test('回环连接默认禁止，单次授权可用且不会延续到下一条命令', { ...macSandbox, timeout: 10000 }, async t => {
  const root = await project(t);
  let requests = 0;
  const server = createServer((_, response) => {
    requests++;
    response.end('loopback-ok');
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = String(server.address().port);
  const defaultConnection = { command: 'nc', args: ['-z', '-w', '1', '127.0.0.1', port] };
  const approvedConnection = { command: 'curl', args: ['-fsS', '--max-time', '2', 'http://127.0.0.1:' + port] };
  const { client, updates, permissions } = runner(t, root, scripted(
    [call('run_command', defaultConnection), call('run_command', approvedConnection), call('run_command', defaultConnection)],
  ), { onPermission: allow });
  await client.prompt('检查单次联网授权');

  const [before, approved, after] = results(updates).map(item => JSON.parse(item.content[0].content.text));
  assert.notEqual(before.exitCode, 0);
  assert.equal(approved.exitCode, 0, approved.output);
  assert.equal(approved.output, 'loopback-ok');
  assert.notEqual(after.exitCode, 0);
  assert.equal(requests, 1);
  assert.deepEqual(permissions.map(info => info.toolCall.requiresNetwork), [undefined, true, undefined]);
  assert.match(permissions[1].toolCall.title, /需要联网/);
  assert.deepEqual(permissions[1].options.map(option => option.kind), ['allow_once', 'reject_once']);
});

test('第 41 轮工具不执行，end 汇报前 40 轮', async t => {
  const step = () => [call('list_dir', { path: '.' })];
  const { client, updates, ends } = runner(t, await project(t), scripted(...Array.from({ length: 41 }, step)));
  await assert.rejects(client.prompt('limit'), { kind: 'limit' });
  assert.equal(results(updates).length, 40);
  assert.equal(ends[0].kind, 'limit');
  assert.match(ends[0].message, /40 轮/);
});

test('任务时限中止模型流并发出 limit', { timeout: 4000 }, async t => {
  let requestSignal;
  const { client, ends } = runner(t, await project(t), scripted(({ signal }) => {
    requestSignal = signal;
    return delay(2000, null, { signal });
  }), { totalMs: 100 });
  await assert.rejects(client.prompt('timeout'), { kind: 'limit' });
  assert.equal(requestSignal.aborted, true);
  assert.equal(ends[0].kind, 'limit');
});

test('cancel 终止正在运行的命令和同组子进程', { ...macSandbox, timeout: 8000 }, async t => {
  const root = await project(t);
  const { client, ends } = runner(t, root, scripted([
    call('run_command', { command: 'sh', args: ['-c', 'sleep 60 & child=$!; printf "%s %s\\n" "$$" "$child" > pids; wait'] }),
  ]), { onPermission: allow });
  const prompt = assert.rejects(client.prompt('cancel'), { kind: 'cancelled' });
  const file = path.join(root, 'pids');
  let pids;
  for (let i = 0; i < 50 && !pids; i++) {
    pids = await readFile(file, 'utf8').then(text => text.trim().split(' ').map(Number), () => null);
    if (!pids) await delay(30);
  }
  assert.equal(pids?.length, 2);
  for (const pid of pids) assert.doesNotThrow(() => process.kill(pid, 0));
  await client.cancel();
  await prompt;
  assert.equal(ends[0].kind, 'cancelled');
  for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

function assertUpdateShape(updates) {
  const message = updates.find(item => item.sessionUpdate === 'agent_message_chunk');
  assert.equal(message.content.type, 'text');
  assert.equal(typeof message.content.text, 'string');
  const tool = updates.find(item => item.sessionUpdate === 'tool_call');
  assert.equal(typeof tool.toolCallId, 'string');
  assert.equal(typeof tool.title, 'string');
  assert.equal(tool.status, 'pending');
  const progress = results(updates).find(item => item.toolCallId === tool.toolCallId);
  assert.equal(progress.status, 'completed');
  const plan = updates.find(item => item.sessionUpdate === 'plan');
  assert.ok(plan.entries.length > 0);
  for (const entry of plan.entries) {
    assert.equal(typeof entry.content, 'string');
    assert.match(entry.priority, /^(high|medium|low)$/);
    assert.match(entry.status, /^(pending|in_progress|completed)$/);
  }
}

test('ACP 假代理和 builtin 通过同一组 session/update 断言', async t => {
  const root = await project(t);
  const fixture = fileURLToPath(new URL('./fixtures/v057-coding-acp.mjs', import.meta.url));
  const acp = createCodingRunner({ projectDir: root, command: process.execPath,
    args: [fixture, 'updates', 'with spaces', '', 'literal $HOME'], onPermission: info => info.toolCall.toolCallId });
  t.after(() => acp.close());
  const acpUpdates = [];
  acp.on('update', update => acpUpdates.push(update));
  await acp.prompt('ACP');
  assertUpdateShape(acpUpdates);
  const { client, updates } = runner(t, root, scripted([call('write_file', { path: 'report', content: 'ok' })]), { onPermission: allow });
  await client.prompt('builtin');
  assertUpdateShape(updates);
});

test('启动锁定及权限等待期间锁定均拒绝', async t => {
  const root = await project(t);
  let locked = true, requests = 0;
  const blocked = runner(t, root, () => { requests++; }, { locked: () => locked });
  await assert.rejects(blocked.client.start(), { kind: 'locked' });
  assert.equal(requests, 0);
  locked = false;
  const { client } = runner(t, root, scripted([call('write_file', { path: 'locked.txt', content: 'no' })]), {
    locked: () => locked,
    onPermission(info) { locked = true; return allow(info); },
  });
  await assert.rejects(client.prompt('lock'), { kind: 'locked' });
  await assert.rejects(readFile(path.join(root, 'locked.txt')), { code: 'ENOENT' });
});

test('指定模型和默认对话模型走同一解析入口，不支持工具时明确失败', async t => {
  const root = await project(t);
  for (const model of [undefined, 'profile:coding']) {
    const { client } = runner(t, root, () => assert.fail('不应请求模型'), {
      model, modelChoice: 'profile:chat', models: { resolve(choice, effort, requirements) {
        assert.equal(choice, model ?? 'profile:chat');
        assert.deepEqual(requirements, { tools: true, vision: false });
        return { settings: {}, supportsTools: false };
      } },
    });
    await assert.rejects(client.start(), { kind: 'unsupported_tools', message: /function calling/ });
  }
  const { client } = runner(t, root, async () => { throw new Error('模型可能不接受 tools 参数'); });
  await assert.rejects(client.prompt('tools'), { kind: 'unsupported_tools', message: /function calling/ });
});
