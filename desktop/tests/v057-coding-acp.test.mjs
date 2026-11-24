import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFile, link, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createCodingRunner, createCodingService, detectAgents } from '../services/coding-agent.mjs';

const fixture = fileURLToPath(new URL('./fixtures/v057-coding-acp.mjs', import.meta.url));
async function makeProject(t) {
  const base = await mkdtemp(path.join(tmpdir(), 'quank-acp-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const projectDir = path.join(base, 'project');
  await mkdir(projectDir);
  return projectDir;
}
function makeRunner(t, projectDir, mode, options) {
  const runner = createCodingRunner({ command: process.execPath, args: [fixture, mode], projectDir, ...options });
  t.after(() => runner.close());
  return runner;
}

test('ACP v1 握手、引号参数、流式文本和计划、权限允许与拒绝、离线提示', async t => {
  const audit = [], updates = [], permissions = [];
  const runner = makeRunner(t, await makeProject(t), 'updates', {
    command: '"' + process.execPath + '"',
    args: '"' + fixture + '" updates "with spaces" "" \'literal $HOME\'',
    offline: () => true, name: 'Fixture',
    onPermission: p => p.toolCall.toolCallId,
    audit: event => audit.push(event),
  });
  runner.on('update', p => updates.push(p)).on('permission', p => permissions.push(p));
  const handshake = await runner.start();
  assert.deepEqual(handshake.agentInfo, { name: 'Fixture', version: '1.0' });
  assert.match(handshake.warning, /离线/);
  assert.equal((await runner.prompt('prompt body')).stopReason, 'end_turn');
  assert.deepEqual(updates.map(p => p.sessionUpdate), ['warning', 'agent_message_chunk', 'agent_message_chunk', 'tool_call', 'tool_call_update', 'plan']);
  assert.equal(permissions.length, 2);
  assert.deepEqual(audit.map(e => e.detail), ['ok_offline', 'allowed', 'denied']);
  assert.doesNotMatch(JSON.stringify(audit), /prompt body/);
});

test('拒绝越界 cwd、读写、符号链接和硬链接，项目内写入与终端逐次授权', async t => {
  const cwd = await makeProject(t);
  const parent = path.dirname(cwd);
  const outside = path.join(parent, 'outside.txt');
  await writeFile(outside, 'unchanged');
  await symlink(outside, path.join(cwd, 'outside-link'));
  await symlink(parent, path.join(cwd, 'outside-dir'));
  await link(outside, path.join(cwd, 'hard-link'));
  for (const badCwd of ['..', 'outside-dir']) {
    const invalid = makeRunner(t, cwd, 'paths', { cwd: badCwd });
    await assert.rejects(invalid.start(), { kind: 'project' });
  }
  const runner = makeRunner(t, cwd, 'paths', {
    onPermission: p => p.kind === 'write' ? p.path.endsWith('/new.txt') : p.args[0] === 'hello',
  });
  await runner.prompt('paths');
  assert.equal(await readFile(outside, 'utf8'), 'unchanged');
  assert.equal(await readFile(path.join(cwd, 'new.txt'), 'utf8'), 'first\nsecond\n');
  await assert.rejects(readFile(path.join(cwd, 'refused.txt')), { code: 'ENOENT' });
});

test('终端优先使用策略 Python 和对应虚拟环境，代理进程环境保持隔离', async t => {
  const cwd = await realpath(await makeProject(t)), bin = path.join(cwd, 'venv/bin');
  await mkdir(bin, {recursive: true});
  await writeFile(path.join(cwd, 'venv/pyvenv.cfg'), 'include-system-site-packages = false\n');
  const python = path.join(bin, 'python3');
  await writeFile(python, '#!/bin/sh\nprintf "%s\\n" "$VIRTUAL_ENV" "$PATH"\n', {mode: 0o700});
  const runner = makeRunner(t, cwd, 'python', {terminalPython: python, onPermission: p => p.command === 'python3'});
  assert.equal((await runner.prompt('python environment')).stopReason, 'end_turn');
});

test('cancel 结束未返回的轮次，对忽略 SIGTERM 的代理升级到 SIGKILL', { timeout: 8000 }, async t => {
  const runner = makeRunner(t, await makeProject(t), 'cancel');
  const update = new Promise(resolve => runner.on('update', resolve));
  const end = new Promise(resolve => runner.on('end', resolve));
  const prompt = assert.rejects(runner.prompt('cancel'), { kind: 'cancelled' });
  const message = await update;
  const pid = Number(message.content.text);
  assert.doesNotThrow(() => process.kill(pid, 0));
  await runner.cancel();
  await prompt;
  assert.equal((await end).kind, 'cancelled');
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

for (const [mode, kind, options] of [
  ['missing', 'not_found', { command: '/missing-quank-coding-test-agent' }],
  ['silent', 'no_acp', { handshakeMs: 250 }],
  ['no_acp', 'no_acp'],
  ['oversized', 'no_acp'],
  ['version', 'no_acp'],
  ['auth', 'auth'],
  ['quota', 'quota'],
  ['timeout', 'timeout', { idleMs: 80 }],
  ['timeout', 'timeout', { totalMs: 700 }],
  ['crashed', 'crashed'],
]) {
  test('分类 ' + mode + ' → ' + kind + (options?.totalMs ? '（总时限）' : ''), async t => {
    const runner = makeRunner(t, await makeProject(t), mode, options);
    await assert.rejects(runner.prompt('fixture'), error => error.kind === kind && !!error.message);
  });
}

test('配置、连接测试、密钥视图与审计、应用锁定', async t => {
  const projectDir = await makeProject(t);
  const store = { data: {}, async save() {} };
  const key = randomBytes(32);
  const audit = [];
  let locked = false;
  const prior = process.env.C1_UNRELATED;
  process.env.C1_UNRELATED = 'parent-only';
  t.after(() => { if (prior === undefined) delete process.env.C1_UNRELATED; else process.env.C1_UNRELATED = prior; });
  const service = createCodingService({
    store, projectDir: () => projectDir, locked: () => locked, audit: e => audit.push(e),
    seal(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      return Buffer.concat([iv, cipher.update(value), cipher.final(), cipher.getAuthTag()]).toString('base64');
    },
    unseal(value) {
      const bytes = Buffer.from(value, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(-16));
      return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString();
    },
  });
  t.after(() => service.close());
  assert.equal(service.view().settings.fallback, 'auto');
  assert.deepEqual(await service.handle({ action: 'settings' }), { fallback: 'auto', allowAssistant: true });
  const secret = 'fixture-secret-42';
  const view = await service.handle({
    action: 'save', name: 'Fixture', command: process.execPath, args: [fixture, 'secret'],
    env: [{ key: 'C1_SECRET', value: secret }],
  });
  const [agent] = view.agents;
  assert.deepEqual(agent.env, [{ key: 'C1_SECRET', hasValue: true }]);
  assert.equal(agent.isDefault, true);
  assert.ok(store.data.coding.agents[0].envSealed.C1_SECRET);
  assert.doesNotMatch(JSON.stringify([store.data, view]), /fixture-secret-42|parent-only/);
  assert.equal(Object.hasOwn(agent, 'envSealed'), false);
  await service.handle({ action: 'save', id: agent.id, env: agent.env });
  const result = await service.handle({ action: 'test', id: agent.id });
  assert.deepEqual({ ...result, ms: 0 }, { ok: true, agentInfo: { name: 'Fixture', version: '1.0' }, reply: '连接正常 [已隐藏]', ms: 0 });
  assert.ok(result.ms >= 0);
  assert.deepEqual(audit.map(e => [e.target, e.action, e.detail]), [['Fixture', 'coding.start', 'ok'], ['Fixture', 'coding.test', 'ok']]);
  assert.deepEqual({...service.view().agents[0].lastTest, at: 0}, {at: 0, ok: true});
  const draftResult = await service.handle({action: 'test', id: agent.id, draft: {args: [fixture, 'auth']}});
  assert.equal(draftResult.kind, 'auth');
  assert.equal(service.view().agents[0].lastTest.ok, true);
  assert.deepEqual(store.data.coding.agents[0].args, [fixture, 'secret']);
  const other = (await service.handle({ action: 'save', name: 'Other', command: '/missing-quank-agent' })).agents[1];
  await service.handle({ action: 'setDefault', id: other.id });
  assert.deepEqual(service.view().agents.map(a => a.isDefault), [false, true]);
  assert.equal((await service.testAgent(other.id)).kind, 'not_found');
  await service.handle({ action: 'remove', id: other.id });
  assert.equal(service.view().agents.length, 1);
  await service.handle({ action: 'settings', fallback: 'builtin', allowAssistant: false });
  assert.deepEqual(service.view().settings, { fallback: 'builtin', allowAssistant: false });
  locked = true;
  for (const action of ['list', 'save', 'remove', 'setDefault', 'test', 'detect', 'settings']) {
    await assert.rejects(service.handle({ action, id: agent.id }), { kind: 'locked' });
  }
  await assert.rejects(service.testAgent(agent.id), { kind: 'locked' });
  assert.equal(typeof createCodingRunner({ kind: 'builtin' }).start, 'function');
});

test('detect 优先列出 WorkBuddy，只返回可执行文件', async t => {
  const bin = await makeProject(t);
  await writeFile(path.join(bin, 'codebuddy'), '#!/bin/sh\n', { mode: 0o700 });
  await writeFile(path.join(bin, 'codebuddy-acp'), '#!/bin/sh\n', { mode: 0o600 });
  await mkdir(path.join(bin, 'gemini'));
  const candidates = await detectAgents({ searchPath: bin, home: bin });
  assert.deepEqual(candidates[0], {
    name: 'WorkBuddy', command: path.join(bin, 'codebuddy'), args: '--acp',
    needsEnv: ['CODEBUDDY_API_KEY', 'CODEBUDDY_INTERNET_ENVIRONMENT'],
  });
  assert.ok(candidates.every(c => c.command !== path.join(bin, 'codebuddy-acp') && c.command !== path.join(bin, 'gemini')));
});

test('preload 提供 coding IPC，main 注册受锁定保护的入口并排除原始配置', async () => {
  const preload = await readFile(new URL('../preload.cjs', import.meta.url), 'utf8');
  let bridge;
  vm.runInNewContext(preload, { require: () => ({
    contextBridge: { exposeInMainWorld(_name, api) { bridge = api; } },
    ipcRenderer: { invoke: (channel, payload) => ({ channel, payload }) },
  }) });
  const payload = { action: 'list' };
  assert.equal(bridge.coding(payload).channel, 'actwill:coding');
  assert.equal(bridge.coding(payload).payload, payload);
  const main = await readFile(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(main, /register\('coding', async p => \(\{ result: await coding.handle\(p\) \}\)\)/);
  assert.match(main, /\{[^{}]*\bcoding:_coding\b[^{}]*\.\.\.publicData\}=store\.data/);
});
