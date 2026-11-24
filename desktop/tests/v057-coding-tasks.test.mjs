import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { Store } from '../core.mjs';
import { createCodingRunner, createCodingService } from '../services/coding-agent.mjs';
import { codingSpec, createCodingTasks } from '../services/coding-tasks.mjs';
import { createCodingContext, clearCodingContext } from '../services/coding-context.mjs';
import { forbiddenCodingPermission, parseCodingReport } from '../runtime/coding-git.mjs';

const fixture = fileURLToPath(new URL('./fixtures/v057-coding-acp.mjs', import.meta.url));
const exec = promisify(execFile);
const report = '## 迭代报告\n\n```json\n' + JSON.stringify({
  tests: { ok: true, summary: '8 项通过' },
  backtest: {
    before: { returnPct: 1, maxDrawdownPct: 5, winRatePct: 49, trades: 80, hitRates: { BUY: 48 } },
    after: { returnPct: 2, maxDrawdownPct: 4, winRatePct: 52, trades: 83, hitRates: { BUY: 55 } },
  },
}) + '\n```\n';
const checkInterval = 10;
async function until(api, id, predicate) {
  for (let i = 0; i < 500; i++) {
    const task = api.get(id);
    if (typeof predicate === 'function' ? predicate(task) : task.status === predicate) return task;
    if (['failed', 'stopped'].includes(task.status)) assert.fail(JSON.stringify(task.error));
    await delay(checkInterval);
  }
  assert.fail('任务等待超时：' + JSON.stringify(api.get(id)));
}
async function setup(t, { repository = true, mode = 'updates', fallback = 'auto', agents = true, factory } = {}) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'quank-task-')));
  const project = path.join(root, 'strategy');
  await mkdir(project);
  await writeFile(path.join(project, 'strategy.txt'), 'baseline\n');
  const git = async (...args) => (await exec('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null',
    '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', ...args], { cwd: project })).stdout;
  if (repository) {
    await git('init', '-b', 'main');
    await git('add', '.');
    await git('commit', '-m', 'baseline');
  }
  const store = new Store(path.join(root, 'data'));
  await store.load();
  store.data.quant = { mode: 'local', source: project, pool: [{ code: '600000', shares: 400 }], holdings: { '600000': { shares: 400, pnl: 99, weight: 0.2 } } };
  store.data.security = { privacy: { maskAmounts: true } };
  store.data.memories = [{ text: '量化策略偏好 ATR 止损' }, { text: '会议使用中文' }];
  const calls = [], runners = [], changes = [], informs = [], audits = [];
  const quant = {
    view: () => store.data.quant,
    sync: async opts => { calls.push('sync'); assert.equal(opts.source, project); },
    handle: async ({ action }) => { calls.push(action); return { results: [] }; },
  };
  const coding = createCodingService({ store, projectDir: () => project, seal: String, unseal: String });
  if (agents) await coding.handle({ action: 'save', name: 'C1 假代理', command: process.execPath,
    args: [fixture, mode, 'with spaces', '', 'literal $HOME'] });
  await coding.handle({ action: 'settings', fallback });
  const deps = {
    store, coding, quant,
    research: { view: () => ({ library: [
      { id: 'research', kind: 'doc', code: '600000', title: '测试研报' },
      { id: 'notice', kind: 'notice', code: '600000', summary: '公告要点' },
      { id: 'daily', kind: 'quant', title: '日报' },
    ] }), handle: async ({ id }) => id === 'daily' ? { text: '盘后复盘', metrics: [{ name: '收益', value: 8 }] } : { code: '600000', text: '投研正文' } },
    dataset: { load: async () => [{ date: '2026-10-01', code: '600000', action: 'BUY',
      label: { ret1: 1, ret5: 2, ret10: 3, ret20: 4, complete: true, outcome: 'right' } }] },
    notify: task => informs.push(task), audit: event => audits.push(event),
    runnerFactory: (kind, opts) => {
      calls.push(kind);
      const runner = factory ? factory(kind, opts) : createCodingRunner({ ...opts, kind });
      runners.push(runner);
      return runner;
    },
  };
  const api = createCodingTasks(deps).on('change', task => changes.push(task));
  t.after(async () => {
    await Promise.allSettled(runners.map(runner => runner.close()));
    await delay(50);
    await store.pending.catch(() => {});
    await clearCodingContext(project).catch(() => {});
    await rm(root, { recursive: true, force: true });
  });
  return { api, deps, store, project, git, calls, changes, informs, audits };
}
const start = api => api.start({ request: '优化示例策略', source: 'ui' });
async function answer(api, id, decision) {
  const task = await until(api, id, 'waiting_permission');
  await api.respondPermission(id, task.pendingPermission.requestId, decision);
  return task.pendingPermission;
}

test('C1 ACP 端到端，流式输出、授权、同会话追问、结果和合并后引擎操作', async t => {
  const { api, project, git, calls, changes, informs, audits } = await setup(t);
  const { id } = await api.start({ request: '优化示例策略', source: 'chat', chatId: 'chat-42' });
  const first = await until(api, id, 'waiting_permission');
  assert.equal(first.pendingPermission.kind, 'session');
  assert.deepEqual(new Set(first.stream.map(event => event.type)), new Set(['text', 'tool', 'plan', 'permission']));
  await writeFile(path.join(project, 'strategy.txt'), 'improved\n');
  await writeFile(path.join(project, '.quank', 'reports', id + '.md'), report);
  await answer(api, id, 'allow');
  await answer(api, id, 'deny');
  const review = await until(api, id, 'review');
  assert.equal(review.result.diffStat.files, 2);
  assert.match(review.result.diff, /\+improved/);
  assert.equal(review.result.tests.ok, true);
  assert.equal(review.result.backtest.after.hitRates.BUY, 55);
  assert.match(review.branch, /^quank\/iter-\d{8}-1$/);
  await assert.rejects(lstat(path.join(project, '.quank', 'context')), { code: 'ENOENT' });
  await api.followup(id, '复核回测口径');
  await answer(api, id, 'allow');
  await answer(api, id, 'deny');
  await until(api, id, 'review');
  assert.equal((await api.merge(id)).status, 'merged');
  assert.deepEqual(calls, ['acp', 'sync', 'restart', 'refreshAll']);
  assert.equal((await git('branch', '--show-current')).trim(), 'main');
  assert.equal((await git('rev-list', '--parents', '-n', '1', 'HEAD')).trim().split(' ').length, 3);
  assert.equal(await api.reportFile(id), review.result.reportPath);
  assert.equal(await readFile(review.result.reportPath, 'utf8'), report);
  assert.equal(await git('ls-files', '--', '.quank/'), '');
  assert.ok(informs.some(task => task.status === 'review' && task.chatId === 'chat-42'));
  assert.ok(changes.every(task => task.chatId === 'chat-42'));
  assert.ok(audits.some(a => a.action === 'coding.tasks.merge' && a.detail === 'ok'));
  assert.doesNotMatch(JSON.stringify(audits), /优化示例策略|复核回测口径/);
});

test('放弃迭代恢复原分支并删除迭代分支，保留报告', async t => {
  const { api, project, git } = await setup(t, { mode: 'basic' });
  const { id } = await start(api);
  const review = await until(api, id, 'review');
  const reportPath = path.join(project, '.quank', 'reports', id + '.md');
  await writeFile(reportPath, report);
  assert.equal((await api.discard(id)).status, 'discarded');
  assert.equal((await git('branch', '--show-current')).trim(), 'main');
  assert.equal(await git('branch', '--list', review.branch), '');
  assert.equal(await readFile(reportPath, 'utf8'), report);
});

test('脏工作区需授权，拒绝保留原改动，放弃时恢复已授权的暂存', async t => {
  const { api, project, git } = await setup(t, { mode: 'basic' });
  await writeFile(path.join(project, 'strategy.txt'), 'user edit\n');
  const first = await start(api);
  assert.match((await answer(api, first.id, 'deny')).summary, /工作区.*暂存/);
  await until(api, first.id, task => task.status === 'stopped');
  assert.equal(await readFile(path.join(project, 'strategy.txt'), 'utf8'), 'user edit\n');
  assert.equal((await git('branch', '--show-current')).trim(), 'main');
  const second = await start(api);
  await answer(api, second.id, 'allow');
  await until(api, second.id, 'review');
  await api.discard(second.id);
  assert.match(await git('diff'), /\+user edit/);
  assert.equal(await git('diff', '--cached'), '');
  assert.equal(await git('stash', 'list'), '');
});

test('放弃后逐字节恢复已修改、未跟踪和删除的文件，以及原索引和权限', async t => {
  const { api, project, git } = await setup(t, { mode: 'basic' });
  const tracked = path.join(project, 'strategy.txt');
  const deleted = path.join(project, 'delete.txt');
  const untracked = path.join(project, 'private.dat');
  await writeFile(deleted, 'tracked\n');
  await git('add', 'delete.txt');
  await git('commit', '-m', 'track deleted fixture');
  await writeFile(tracked, 'staged\n');
  await git('add', 'strategy.txt');
  const bytes = Buffer.from([0, 13, 10, 255]);
  await writeFile(tracked, bytes);
  await chmod(tracked, 0o640);
  const large = Buffer.alloc(17 * 1024 * 1024, bytes);
  await writeFile(untracked, large, { mode: 0o751 });
  await unlink(deleted);
  const status = await git('status', '--short');
  const { id } = await start(api);
  await answer(api, id, 'allow');
  const review = await until(api, id, 'review');
  await api.discard(id);
  assert.equal((await git('branch', '--show-current')).trim(), 'main');
  assert.equal(await git('branch', '--list', review.branch), '');
  assert.equal(await git('status', '--short'), status);
  assert.equal(await git('show', ':strategy.txt'), 'staged\n');
  assert.deepEqual(await readFile(tracked), bytes);
  assert.deepEqual(await readFile(untracked), large);
  assert.equal((await lstat(tracked)).mode & 0o777, 0o640);
  assert.equal((await lstat(untracked)).mode & 0o777, 0o751);
  await assert.rejects(lstat(deleted), { code: 'ENOENT' });
});

test('原分支变化导致恢复失败时保留迭代分支并报告', async t => {
  const { api, project, git } = await setup(t, { mode: 'basic' });
  await writeFile(path.join(project, 'strategy.txt'), 'user edit\n');
  const { id } = await start(api);
  await answer(api, id, 'allow');
  const { branch } = await until(api, id, 'review');
  await git('branch', '-f', 'main', 'HEAD');
  await assert.rejects(api.discard(id), /改动保留在 quank\/iter-/);
  assert.match(await git('branch', '--list', branch), /quank\/iter-/);
  assert.equal(api.get(id).status, 'failed');
  assert.match(api.get(id).result.recoveryNote, /改动保留在 quank\/iter-/);
  assert.match(await readFile(api.get(id).result.reportPath, 'utf8'), /改动保留在 quank\/iter-/);
});

test('仅外部模式对未接入和不可用代理统一报告 external_unavailable', async t => {
  const empty = await setup(t, { fallback: 'external', agents: false });
  await assert.rejects(start(empty.api), { kind: 'external_unavailable' });
  const broken = await setup(t, { fallback: 'external', mode: 'auth' });
  const { id } = await start(broken.api);
  const task = await until(broken.api, id, 'failed');
  assert.equal(task.error.kind, 'external_unavailable');
  assert.deepEqual(broken.calls, ['acp']);
});

test('已授权的其他代码项目可合并，跳过策略同步和引擎操作', async t => {
  const { api, store, project, calls, git } = await setup(t, { mode: 'basic' });
  store.data.quant.source = path.join(project, 'other-strategy');
  const input = { request: '优化示例策略', source: 'chat', project };
  assert.equal(api.supportsProject, true);
  await assert.rejects(api.start(input), { kind: 'project_not_granted' });
  store.data.codeProjects = [{ id: 'fixture' }];
  store.data.folders = [{ id: 'project:fixture', path: project }];
  const { id } = await api.start(input);
  await until(api, id, 'review');
  const merged = await api.merge(id);
  assert.equal(merged.status, 'merged');
  assert.match(merged.result.mergeNote, /跳过.*同步.*重启/);
  assert.deepEqual(calls, ['acp']);
  assert.equal((await git('branch', '--show-current')).trim(), 'main');
});

test('非 Git 项目可取消，也可授权初始化并创建初始提交', async t => {
  const { api, project, git } = await setup(t, { repository: false, mode: 'basic' });
  const first = await start(api);
  assert.match((await answer(api, first.id, 'deny')).summary, /初始化/);
  await until(api, first.id, task => task.status === 'stopped');
  await assert.rejects(lstat(path.join(project, '.git')), { code: 'ENOENT' });
  const second = await start(api);
  await answer(api, second.id, 'allow');
  await until(api, second.id, 'no_changes');
  assert.match(await git('log', '-1', '--format=%s'), /初始化策略项目/);
});

test('快照来源、脱敏、只读、Git 忽略和清理，默认规范可编辑与恢复', async t => {
  const { api, project, git, deps, store } = await setup(t);
  const before = '# 原有规则\r\nkeep-me\r\n';
  await writeFile(path.join(project, '.gitignore'), before);
  await git('add', '.gitignore');
  await git('commit', '-m', '原有规则');
  const { id } = await start(api);
  await until(api, id, 'waiting_permission');
  const context = path.join(project, '.quank', 'context');
  const holding = JSON.parse(await readFile(path.join(context, 'holdings.json'), 'utf8'))['600000'];
  assert.deepEqual(holding, { shares: '***', pnl: '***', weight: 0.2 });
  assert.match(await readFile(path.join(context, 'pool.json'), 'utf8'), /"shares": "\*\*\*"/);
  assert.equal((await lstat(path.join(context, 'pool.json'))).mode & 0o777, 0o444);
  assert.equal((await lstat(path.join(context, 'research'))).mode & 0o777, 0o555);
  assert.match(await readFile(path.join(context, 'research/600000/research-0.md'), 'utf8'), /投研正文/);
  assert.match(await readFile(path.join(context, 'research/600000/notice-1.md'), 'utf8'), /公告要点/);
  assert.match(await readFile(path.join(context, 'reports/daily-2.md'), 'utf8'), /盘后复盘/);
  assert.match(await readFile(path.join(context, 'reports/daily-2.json'), 'utf8'), /收益/);
  assert.match(await readFile(path.join(context, 'dataset/quank_dataset.jsonl'), 'utf8'), /"ret20":4/);
  assert.match(await readFile(path.join(context, 'dataset/hit-rates.json'), 'utf8'), /"BUY"/);
  const memories = await readFile(path.join(context, 'memory.md'), 'utf8');
  assert.match(memories, /ATR/);
  assert.doesNotMatch(memories, /会议/);
  assert.equal(await readFile(path.join(project, '.gitignore'), 'utf8'), before + '.quank/\r\n');
  assert.ok(store.data.coding.tasks[0].snapshotBytes > 0);
  assert.equal((await api.stop(id)).status, 'stopped');
  await assert.rejects(lstat(context), { code: 'ENOENT' });

  const defaults = await codingSpec(store.dir, 'get');
  assert.match(defaults, /wb-engine\.json/);
  await codingSpec(store.dir, 'save', '# 用户规范');
  assert.equal(await codingSpec(store.dir, 'get'), '# 用户规范');
  assert.equal(await codingSpec(store.dir, 'reset'), defaults);

  store.data.security.privacy.maskAmounts = false;
  await createCodingContext(project, deps);
  assert.match(await readFile(path.join(context, 'pool.json'), 'utf8'), /"shares": 400/);
});

test('快照超过 20 MB 时优先保留最新资料', async t => {
  const { project, deps } = await setup(t);
  const library = Array.from({ length: 1400 }, (_, i) => ({ id: String(i), date: new Date(i * 86400000).toISOString(), text: 'x'.repeat(16000) }));
  const size = await createCodingContext(project, { ...deps, research: { view: () => ({ library }) } });
  assert.ok(size <= 20 * 1024 * 1024);
  const dir = path.join(project, '.quank', 'context', 'research', 'general');
  assert.ok(await lstat(path.join(dir, '1399-1399.md')));
  await assert.rejects(lstat(path.join(dir, '0-0.md')), { code: 'ENOENT' });
});

test('报告解析忽略无关或非法 JSON，返回所约定的指标', () => {
  assert.deepEqual(parseCodingReport('无报告'), {});
  const parsed = parseCodingReport('```json\n坏格式\n```\n' + report);
  assert.equal(parsed.tests.summary, '8 项通过');
  assert.equal(parsed.backtest.before.maxDrawdownPct, 5);
  assert.equal(parsed.backtest.after.trades, 83);
});

test('重启恢复 running 和 waiting_permission 为 stopped', async t => {
  const { store, deps, project } = await setup(t);
  store.data.coding.tasks = ['running', 'waiting_permission'].map((status, index) => ({
    project, task: { id: String(index), status, stream: [], pendingPermission: { requestId: 'old' } },
  }));
  await store.save();
  const restarted = new Store(store.dir);
  await restarted.load();
  const restored = createCodingTasks({ ...deps, store: restarted });
  for (const task of restored.list()) {
    assert.equal(task.status, 'stopped');
    assert.match(task.error.message, /重启/);
    assert.equal(task.pendingPermission, undefined);
  }
  await delay(30);
  await restarted.pending;
});

test('ACP 鉴权和额度失败时回退，没有模型时记录 failed', async t => {
  for (const mode of ['auth', 'quota']) {
    const { api, calls } = await setup(t, { mode });
    const { id } = await start(api);
    const task = await until(api, id, task => task.status === 'failed');
    assert.equal(task.agent.kind, 'builtin');
    assert.match(task.fallbackReason, /C1 假代理/);
    assert.match(task.error.message, /模型/);
    assert.deepEqual(calls, ['acp', 'builtin']);
  }
});

test('Git push 和远端修改在已允许终端的任务中仍被拒绝', async t => {
  const decisions = [];
  const { api, git } = await setup(t, {
    fallback: 'builtin',
    factory: (_kind, { onPermission }) => {
      const events = new EventEmitter();
      return {
        on(event, listener) { events.on(event, listener); return this; },
        async start() {},
        async close() {},
        async prompt() {
          for (const info of [
            { command: 'git', args: ['status'] },
            { command: '/usr/bin/git', args: ['push', 'origin', 'HEAD'] },
            { command: 'git', args: ['remote', 'set-url', 'origin', 'https://example.invalid'] },
            { command: '/bin/sh', args: ['-c', 'git -C . push origin HEAD'] },
            { command: 'git', args: ['diff'] },
          ]) decisions.push(await onPermission({ kind: 'terminal', ...info }));
        },
      };
    },
  });
  const { id } = await start(api);
  await answer(api, id, 'always');
  await until(api, id, 'review');
  assert.deepEqual(decisions, [true, false, false, false, true]);
  assert.equal(await git('remote'), '');
  assert.ok(forbiddenCodingPermission({ kind: 'session', toolCall: { rawInput: { command: 'git push' } } }));
});

test('空差异不可合并，仍可追问或放弃，全量计划只保留最后一条', async t => {
  let rounds = 0, directory;
  const {api, project, git, calls} = await setup(t, {
    fallback: 'builtin',
    factory: () => {
      const runner = new EventEmitter();
      runner.start = runner.close = async () => {};
      runner.prompt = async () => {
        for (const status of ['pending', 'completed']) runner.emit('update', {
          sessionUpdate: 'plan', entries: [{status, content: '验证 ATR'}],
        });
        if (++rounds === 2) await writeFile(path.join(directory, 'atr.txt'), 'new');
      };
      return runner;
    },
  });
  directory = project;
  await writeFile(path.join(project, '.gitignore'), '.quank/\n');
  await git('add', '.gitignore');
  await git('commit', '-m', 'ignore local reports');
  const {id} = await start(api);
  const empty = await until(api, id, 'no_changes');
  assert.equal(empty.result.diffStat.files, 0);
  assert.deepEqual(empty.stream.filter(event => event.type === 'plan').map(event => event.text), ['completed · 验证 ATR']);
  await assert.rejects(api.merge(id), /没有修改任何文件/);
  assert.deepEqual(calls, ['builtin']);
  await api.followup(id, '修改文件');
  assert.equal((await until(api, id, 'review')).result.diffStat.files, 1);
  await api.discard(id);
  const next = await start(api);
  await until(api, next.id, 'no_changes');
  assert.equal((await api.discard(next.id)).status, 'discarded');
});

test('流保留最近 400 条，diff 以 UTF-8 字节计不超过 200 KB', async t => {
  const { api, project } = await setup(t, {
    fallback: 'builtin',
    factory: () => {
      const events = new EventEmitter();
      return {
        on(event, listener) { events.on(event, listener); return this; },
        async start() {},
        async close() {},
        async prompt() {
          for (let i = 0; i < 405; i++) events.emit('update', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: String(i) } });
          await writeFile(path.join(project, 'large.txt'), '量化\n'.repeat(50000));
        },
      };
    },
  });
  const { id } = await start(api);
  const review = await until(api, id, 'review');
  assert.equal(review.stream.length, 400);
  assert.equal(review.stream[0].text, '5');
  assert.ok(Buffer.byteLength(review.result.diff) <= 200 * 1024);
  assert.match(review.result.diff, /已截断/);
  assert.doesNotMatch(review.result.diff, /�/);
});

test('分片流式文本不会暴露代理环境变量值', async t => {
  const { api, store } = await setup(t, {
    fallback: 'builtin',
    factory: (_kind, { redactWith }) => {
      const events = new EventEmitter();
      redactWith(['fixture-secret-for-test']);
      return {
        on(event, listener) { events.on(event, listener); return this; },
        async start() {},
        async close() {},
        async prompt() {
          for (const text of ['输出 fixture-sec', 'ret-for-test 完成']) {
            events.emit('update', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });
          }
        },
      };
    },
  });
  const { id } = await start(api);
  const review = await until(api, id, 'review');
  assert.equal(review.stream.map(event => event.text).join(''), '输出 [已隐藏] 完成');
  assert.doesNotMatch(JSON.stringify(store.data.coding.tasks), /fixture-sec/);
});
