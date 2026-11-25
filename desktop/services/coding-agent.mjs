import {shellWords} from '../src/shared/shell-words.js';
import { createBuiltinRunner } from './coding-builtin.mjs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { constants } from 'node:fs';
import { access, open, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const MAX_LINE = 1024 * 1024;
const MAX_OUTPUT = 256 * 1024;
const MIN_PATH = '/usr/bin:/bin';
const messages = {
  not_found: '找不到 Coding 智能体命令',
  no_acp: '代理未能完成 ACP 握手或输出了无效的 ACP 消息',
  auth: '代理鉴权失败，请检查登录或密钥',
  quota: '代理额度用尽或请求受到限流',
  timeout: 'Coding 智能体响应超时',
  crashed: 'Coding 智能体异常退出或请求失败',
  cancelled: 'Coding 会话已取消',
  locked: 'QuankSight 已锁定，请先解锁',
  project: '请选择有效的本地策略项目目录，工作路径必须位于项目内',
};

function failure(kind) {
  return Object.assign(new Error(messages[kind]), { kind });
}

function reportedKind(code, message) {
  if (Number(code) === -32000 || /(?:^|\D)(401|403)(?:\D|$)|auth(?:entication|orization)?[_ -]?(?:required|failed)|unauthorized|invalid.*(?:api[ _-]?key|token)|login required|鉴权|未登录/i.test(message)) return 'auth';
  if (Number(code) === 429 || /(?:^|\D)429(?:\D|$)|quota|rate[_ -]?limit|insufficient[_ -](?:credit|balance)|额度|限流/i.test(message)) return 'quota';
  return null;
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

async function projectPath(root, cwd, value, create = false) {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw failure('project');
  const candidate = path.resolve(cwd, value);
  if (!inside(root, candidate)) throw failure('project');
  let canonical;
  try {
    canonical = await realpath(candidate);
  } catch (error) {
    if (!create || error.code !== 'ENOENT') throw error;
    canonical = path.join(await realpath(path.dirname(candidate)), path.basename(candidate));
  }
  if (!inside(root, canonical)) throw failure('project');
  return canonical;
}

async function workspace(projectDir, cwd) {
  if (!projectDir || !path.isAbsolute(projectDir)) throw failure('project');
  try {
    const base = path.resolve(projectDir);
    const root = await realpath(base);
    const requested = path.resolve(base, cwd || '.');
    const canonical = await projectPath(root, root, inside(base, requested) ? path.resolve(root, path.relative(base, requested)) : requested);
    if (!(await stat(canonical)).isDirectory()) throw failure('project');
    return { root, cwd: canonical };
  } catch {
    throw failure('project');
  }
}

async function executableIn(name, dirs) {
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    try {
      await access(candidate, constants.X_OK);
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {}
  }
  return null;
}

function childProcess(command, args, { cwd, env, stdio }) {
  const detached = process.platform !== 'win32';
  const child = spawn(command, args, { cwd, env, stdio, detached, shell: false, windowsHide: true });
  const exited = new Promise(resolve => {
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
  });
  let stopping;
  function signalGroup(signal) {
    try {
      if (detached && child.pid) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  function groupExists() {
    if (!detached || !child.pid) return child.exitCode === null && child.signalCode === null;
    try { process.kill(-child.pid, 0); return true; }
    catch (error) { return error.code !== 'ESRCH'; }
  }
  function stop() {
    return stopping ??= (async () => {
      const started = Date.now();
      signalGroup('SIGTERM');
      let timer;
      await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 3000); })]);
      clearTimeout(timer);
      // The leader can exit before its descendants.
      if (groupExists()) {
        await new Promise(resolve => { timer = setTimeout(resolve, 3000 - Math.min(3000, Date.now() - started)); });
        signalGroup('SIGKILL');
      }
      await exited;
    })();
  }
  return { child, exited, stop };
}

export function createCodingRunner({
  kind = 'acp', command, args = '', name = '', env = {}, projectDir, cwd,
  terminalPython = '', onPermission, audit = () => {}, locked = () => false, offline = () => false,
  handshakeMs = 30_000, idleMs = 600_000, totalMs = 1_800_000, ...builtinOptions
} = {}) {
  if (kind === 'builtin') return createBuiltinRunner({
    ...builtinOptions, projectDir, cwd, terminalPython, onPermission, audit, locked, offline, totalMs, ...(name ? { name } : {}),
  });
  if (kind !== 'acp') throw new Error('未知 Coding 模式');

  const events = new EventEmitter();
  const pending = new Map(), terminals = new Map(), terminations = new Set(), permissions = new Set();
  async function terminalEnvironment() {
    const bin = path.isAbsolute(terminalPython) ? path.dirname(terminalPython) : '';
    const prefix = bin ? path.dirname(bin) : '';
    const env = { PATH: [...new Set([bin, '/opt/homebrew/bin', '/usr/local/bin', ...MIN_PATH.split(':')].filter(Boolean))].join(path.delimiter) };
    if (prefix && await access(path.join(prefix, 'pyvenv.cfg')).then(() => true, () => false)) env.VIRTUAL_ENV = prefix;
    else if (process.env.VIRTUAL_ENV && (!prefix || process.env.VIRTUAL_ENV === prefix)) env.VIRTUAL_ENV = process.env.VIRTUAL_ENV;
    if (prefix && await access(path.join(prefix, 'conda-meta')).then(() => true, () => false)) env.CONDA_PREFIX = prefix;
    else if (process.env.CONDA_PREFIX && (!prefix || process.env.CONDA_PREFIX === prefix)) env.CONDA_PREFIX = process.env.CONDA_PREFIX;
    return env;
  }
  let processHandle, startPromise, stopPromise, ended, sessionId, root, workingDir;
  const permissionRequests = new Set();
  let phase = 'initialize', id = 0, bytes = 0, chunks = [], stderr = '', turn, lifetime;

  function record(action, result) {
    return Promise.resolve().then(() => audit({ kind: 'approval', action, target: name, detail: result, via: 'app' })).catch(() => {});
  }
  function ensureOpen() {
    if (locked()) throw failure('locked');
    if (ended) throw ended;
  }
  function send(message) {
    if (!processHandle || processHandle.child.stdin.destroyed) return;
    const line = JSON.stringify({ jsonrpc: '2.0', ...message });
    if (Buffer.byteLength(line) > MAX_LINE) throw new Error('ACP 消息超过长度上限');
    processHandle.child.stdin.write(line + '\n');
  }
  function request(method, params) {
    ensureOpen();
    const requestId = ++id;
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      try { send({ id: requestId, method, params }); }
      catch (error) { pending.delete(requestId); reject(error); }
    });
  }
  function reap(handle) {
    const promise = handle.stop();
    terminations.add(promise);
    promise.then(() => terminations.delete(promise), () => terminations.delete(promise));
    return promise;
  }
  function stop(error) {
    if (stopPromise) return stopPromise;
    ended = error;
    clearTimeout(lifetime);
    clearTimeout(turn?.timer);
    for (const requestId of permissionRequests) send({ id: requestId, result: { outcome: { outcome: 'cancelled' } } });
    permissionRequests.clear();
    for (const cancel of permissions) cancel();
    for (const item of pending.values()) item.reject(error);
    pending.clear();
    const handles = [...terminals.values()];
    if (processHandle) handles.push(processHandle);
    terminals.clear();
    stopPromise = Promise.allSettled([...terminations, ...handles.map(reap)]).then(() => {
      events.emit('end', { kind: error.kind, message: error.message });
    });
    return stopPromise;
  }
  function activity() {
    if (!turn) return;
    clearTimeout(turn.timer);
    turn.timer = setTimeout(() => stop(failure('timeout')), idleMs);
  }
  async function permission(info) {
    let result, cancel;
    try {
      ensureOpen();
      const cancelled = new Promise(resolve => { cancel = () => resolve(undefined); });
      permissions.add(cancel);
      events.emit('permission', info);
      result = await Promise.race([cancelled, onPermission?.(info)]);
      ensureOpen();
      if (info.kind === 'session') {
        const option = info.options.find(o => o.optionId === result);
        await record('coding.permission', option?.kind?.startsWith('allow_') ? 'allowed' : 'denied');
        return option?.optionId;
      }
      await record('coding.permission', result === true ? 'allowed' : 'denied');
      return result === true;
    } catch {
      await record('coding.permission', 'denied');
      return undefined;
    } finally {
      permissions.delete(cancel);
    }
  }
  async function reverse(method, p) {
    ensureOpen();
    if (!sessionId || p?.sessionId !== sessionId) throw Object.assign(new Error('ACP 会话无效'), { rpcCode: -32602 });
    if (method === 'session/request_permission') {
      const optionId = await permission({ ...p, kind: 'session', options: Array.isArray(p.options) ? p.options : [] });
      return { outcome: optionId === undefined ? { outcome: 'cancelled' } : { outcome: 'selected', optionId } };
    }
    if (method === 'fs/read_text_file' || method === 'fs/write_text_file') {
      const writing = method === 'fs/write_text_file';
      let file;
      try { file = await projectPath(root, workingDir, p.path, writing); }
      catch (error) {
        if (writing) await record('coding.permission', 'denied');
        throw error;
      }
      if (writing) {
        if (typeof p.content !== 'string') throw new Error('无效的 ACP 文件内容');
        if (!await permission({ kind: 'write', path: file, sessionId })) throw new Error('写入未获授权');
        ensureOpen();
        if (file !== await projectPath(root, workingDir, p.path, true)) throw failure('project');
      }
      const flags = constants.O_NOFOLLOW | constants.O_NONBLOCK | (writing ? constants.O_WRONLY | constants.O_CREAT : constants.O_RDONLY);
      const fd = await open(file, flags, 0o600);
      try {
        ensureOpen();
        const info = await fd.stat();
        const verified = await projectPath(root, workingDir, p.path);
        const current = await stat(verified);
        ensureOpen();
        if (file !== verified || info.dev !== current.dev || info.ino !== current.ino) throw failure('project');
        if (!info.isFile() || info.nlink !== 1) throw new Error('ACP 仅支持项目内的普通文件');
        if (writing) {
          await fd.truncate();
          await fd.writeFile(p.content, 'utf8');
          return {};
        }
        if (info.size > MAX_LINE) throw new Error('ACP 文件超过长度上限');
        const buffer = Buffer.alloc(info.size);
        let offset = 0;
        while (offset < buffer.length) {
          const { bytesRead } = await fd.read(buffer, offset, buffer.length - offset, offset);
          if (!bytesRead) break;
          offset += bytesRead;
        }
        const content = buffer.subarray(0, offset).toString('utf8');
        const line = p.line ?? 1, limit = p.limit;
        if (!Number.isSafeInteger(line) || line < 1 || (limit != null && (!Number.isSafeInteger(limit) || limit < 0))) throw new Error('无效的 ACP 行范围');
        return { content: line === 1 && limit == null ? content : content.split('\n').slice(line - 1, limit == null ? undefined : line - 1 + limit).join('\n') };
      } finally {
        await fd.close();
      }
    }
    if (method === 'terminal/create') {
      let terminalCwd;
      try { terminalCwd = await projectPath(root, workingDir, p.cwd ?? workingDir); }
      catch (error) { await record('coding.permission', 'denied'); throw error; }
      const terminalArgs = p.args ?? [];
      if (typeof p.command !== 'string' || !p.command || !Array.isArray(terminalArgs) || terminalArgs.some(arg => typeof arg !== 'string')) throw new Error('无效的终端命令');
      const entries = p.env ?? [];
      if (!Array.isArray(entries) || entries.some(entry => !/^[A-Za-z_][A-Za-z_0-9]*$/.test(entry?.name) || typeof entry.value !== 'string')) throw new Error('无效的终端环境变量');
      const env = { HOME: homedir(), ...Object.fromEntries(entries.map(({ name, value }) => [name, value])), ...await terminalEnvironment() };
      const effectiveEntries = Object.entries(env).map(([name, value]) => ({ name, value }));
      if (!await permission({ kind: 'terminal', command: p.command, args: terminalArgs, cwd: terminalCwd, env: effectiveEntries, sessionId })) throw new Error('终端命令未获授权');
      ensureOpen();
      if (terminalCwd !== await projectPath(root, workingDir, p.cwd ?? workingDir)) throw failure('project');
      ensureOpen();
      const handle = childProcess(p.command, terminalArgs, { cwd: terminalCwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
      const terminalId = randomUUID();
      let output = Buffer.alloc(0), truncated = false, exitStatus = null;
      const outputLimit = Number.isSafeInteger(p.outputByteLimit) && p.outputByteLimit >= 0 ? Math.min(p.outputByteLimit, MAX_OUTPUT) : MAX_OUTPUT;
      function append(chunk) {
        output = Buffer.concat([output, chunk]);
        if (output.length > outputLimit) {
          let start = output.length - outputLimit;
          while ((output[start] & 0xc0) === 0x80) start++;
          output = output.subarray(start);
          truncated = true;
        }
        activity();
      }
      handle.child.stdout.on('data', append);
      handle.child.stderr.on('data', append);
      const spawned = new Promise((resolve, reject) => {
        handle.child.once('spawn', resolve);
        handle.child.once('error', reject);
      });
      const status = handle.exited.then(({ exitCode, signal }) => (exitStatus = { exitCode, signal }));
      terminals.set(terminalId, { ...handle, output: () => ({ output: output.toString('utf8'), truncated, ...(exitStatus ? { exitStatus } : {}) }), status });
      try { await spawned; ensureOpen(); }
      catch (error) { terminals.delete(terminalId); await reap(handle); throw error; }
      return { terminalId };
    }
    if (['terminal/output', 'terminal/wait_for_exit', 'terminal/kill', 'terminal/release'].includes(method)) {
      const terminal = terminals.get(p.terminalId);
      if (!terminal) throw Object.assign(new Error('ACP 终端不存在'), { rpcCode: -32602 });
      if (method === 'terminal/output') return terminal.output();
      if (method === 'terminal/wait_for_exit') return terminal.status;
      if (method === 'terminal/release') terminals.delete(p.terminalId);
      await reap(terminal);
      return {};
    }
    throw Object.assign(new Error('不支持的 ACP 方法'), { rpcCode: -32601 });
  }
  function dispatch(line) {
    if (ended) return;
    let rpc;
    try {
      rpc = JSON.parse(line);
      if (rpc?.jsonrpc !== '2.0' || (typeof rpc.method !== 'string' && (!Object.hasOwn(rpc, 'id') || Object.hasOwn(rpc, 'result') === Object.hasOwn(rpc, 'error')))) throw new Error();
    } catch {
      void stop(failure(phase === 'initialize' ? 'no_acp' : 'crashed'));
      return;
    }
    if (locked()) { void stop(failure('locked')); return; }
    if (typeof rpc.method === 'string') {
      if (Object.hasOwn(rpc, 'id')) {
        if (rpc.params?.sessionId === sessionId) activity();
        const asksPermission = rpc.method === 'session/request_permission';
        if (asksPermission) permissionRequests.add(rpc.id);
        const reply = payload => {
          if (asksPermission && !permissionRequests.delete(rpc.id)) return;
          if (!ended) send({ id: rpc.id, ...payload });
        };
        void reverse(rpc.method, rpc.params).then(
          result => reply({ result }),
          error => reply({ error: { code: error.rpcCode || -32603, message: messages[error.kind] || 'ACP 客户端拒绝或执行失败' } }),
        ).catch(() => {
          try { send({ id: rpc.id, error: { code: -32603, message: 'ACP 响应超过长度上限' } }); }
          catch { void stop(failure('crashed')); }
        });
      } else if (rpc.method === 'session/update' && sessionId && rpc.params?.sessionId === sessionId && typeof rpc.params.update?.sessionUpdate === 'string') {
        activity();
        events.emit('update', rpc.params.update);
      }
      return;
    }
    const item = pending.get(rpc.id);
    if (!item) return;
    pending.delete(rpc.id);
    if (Object.hasOwn(rpc, 'error')) {
      const error = rpc.error;
      item.reject(failure(reportedKind(error?.code, String(error?.message || '') + ' ' + JSON.stringify(error?.data ?? '')) || (phase === 'initialize' ? 'no_acp' : 'crashed')));
    } else item.resolve(rpc.result);
  }
  function receive(chunk) {
    let start = 0;
    while (!ended && start < chunk.length) {
      const newline = chunk.indexOf(10, start);
      const end = newline < 0 ? chunk.length : newline;
      bytes += end - start;
      if (bytes > MAX_LINE) { void stop(failure(phase === 'initialize' ? 'no_acp' : 'crashed')); return; }
      chunks.push(chunk.subarray(start, end));
      if (newline < 0) return;
      const line = Buffer.concat(chunks, bytes).toString('utf8').trim();
      bytes = 0;
      chunks = [];
      if (line) dispatch(line);
      start = end + 1;
    }
  }
  async function startSession() {
    const timer = setTimeout(() => stop(failure(phase === 'initialize' ? 'no_acp' : 'timeout')), handshakeMs);
    lifetime = setTimeout(() => stop(failure('timeout')), totalMs);
    try {
      ensureOpen();
      ({ root, cwd: workingDir } = await workspace(projectDir, cwd));
      ensureOpen();
      const raw = String(command ?? '');
      const invocation = path.isAbsolute(raw) && !/["']/.test(raw) && await access(raw, constants.X_OK).then(() => true, () => false) ? [raw] : shellWords(raw);
      const [executable, ...leadingArgs] = invocation;
      if (!executable) throw failure('not_found');
      const argv = [...leadingArgs, ...(Array.isArray(args) ? args : shellWords(args))];
      ensureOpen();
      const home = homedir();
      const standardDirs = [...MIN_PATH.split(':'), ...agentDirs(home)];
      const searchDirs = [...new Set([...(env.PATH ?? process.env.PATH ?? '').split(path.delimiter), ...standardDirs].filter(dir => path.isAbsolute(dir)))];
      const resolved = executable.includes('/') ? path.resolve(workingDir, executable) : await executableIn(executable, searchDirs);
      if (!resolved) throw failure('not_found');
      ensureOpen();
      const minimalPath = [...new Set([...standardDirs, path.dirname(resolved)])].join(path.delimiter);
      processHandle = childProcess(resolved, argv, { cwd: workingDir, env: { PATH: minimalPath, HOME: home, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
      const { child, exited } = processHandle;
      child.stdin.on('error', () => {}); // close supplies the process status
      child.on('error', error => stop(failure(error.code === 'ENOENT' ? 'not_found' : 'crashed')));
      child.stdout.on('data', receive);
      child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8192); });
      void exited.then(({ exitCode }) => {
        if (!ended) void stop(failure(reportedKind(null, stderr) || (phase === 'initialize' && (bytes || exitCode === 0) ? 'no_acp' : 'crashed')));
      });
      const result = await request('initialize', {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
        clientInfo: { name: 'quank', title: 'QuankSight', version: '1.0.0' },
      });
      if (result?.protocolVersion !== 1) throw failure('no_acp');
      phase = 'session';
      const session = await request('session/new', { cwd: workingDir, mcpServers: [] });
      if (typeof session?.sessionId !== 'string' || !session.sessionId) throw failure('crashed');
      ensureOpen();
      sessionId = session.sessionId;
      const warning = offline() ? 'QuankSight 已开启离线模式，本机代理仍可启动，联网能力由代理自身决定。' : '';
      await record('coding.start', warning ? 'ok_offline' : 'ok');
      if (warning) events.emit('update', { sessionUpdate: 'warning', message: warning });
      return { sessionId, agentInfo: result.agentInfo ?? null, ...(warning ? { warning } : {}) };
    } catch (error) {
      const safe = ended || (error.kind ? error : failure('crashed'));
      await record('coding.start', safe.kind);
      await stop(safe);
      throw safe;
    } finally {
      clearTimeout(timer);
    }
  }
  const runner = {
    start() {
      if (ended) return Promise.reject(ended);
      return startPromise ??= startSession();
    },
    async prompt(text) {
      ensureOpen();
      await runner.start();
      ensureOpen();
      if (turn) throw new Error('已有 ACP 对话正在运行');
      if (typeof text !== 'string') throw new Error('ACP 提示必须是文本');
      turn = {};
      activity();
      try { return await request('session/prompt', { sessionId, prompt: [{ type: 'text', text }] }); }
      finally { clearTimeout(turn.timer); turn = null; }
    },
    cancel() {
      if (!ended && sessionId) send({ method: 'session/cancel', params: { sessionId } });
      return stop(failure('cancelled'));
    },
    close() { return runner.cancel(); },
    on(event, listener) { events.on(event, listener); return runner; },
  };
  return runner;
}

const codeBuddyEnv = ['CODEBUDDY_API_KEY', 'CODEBUDDY_INTERNET_ENVIRONMENT'];
const presets = [
  ['WorkBuddy', 'codebuddy', '--acp', codeBuddyEnv],
  ['WorkBuddy (codebuddy-acp)', 'codebuddy-acp', '', codeBuddyEnv],
  ['Codex', 'codex-acp', '', []],
  ['Claude Code', 'claude-agent-acp', '', []],
  ['Claude Code', 'claude-code-acp', '', []],
  ['Kiro', 'kiro-cli', 'acp', []],
  ['Gemini CLI', 'gemini', '--experimental-acp', []],
  ['DeepSeek', 'deepseek-acp-adapter', 'serve', ['DEEPSEEK_API_KEY']],
];

function agentDirs(home) {
  return ['/opt/homebrew/bin', '/usr/local/bin', ...['.local/bin', '.cargo/bin', '.npm-global/bin'].map(dir => path.join(home, dir))];
}

export async function detectAgents({ searchPath = process.env.PATH || '', home = homedir() } = {}) {
  const dirs = [...new Set([...searchPath.split(path.delimiter), ...agentDirs(home)].filter(dir => path.isAbsolute(dir)))];
  const candidates = await Promise.all(presets.map(async ([name, binary, args, needsEnv]) => {
    const command = await executableIn(binary, dirs);
    return command ? { name, command, args, needsEnv: [...needsEnv] } : null;
  }));
  return candidates.filter(Boolean);
}

const defaults = { fallback: 'auto', allowAssistant: true };
const fallbacks = ['auto', 'external', 'builtin'];

export function createCodingService({ store, projectDir, terminalPython = () => '', seal, unseal, audit, locked = () => false, offline, runnerOptions = {} }) {
  const active = new Set();
  const tests = new Map();
  let queue = Promise.resolve(), closing = false;
  function requireUnlocked() {
    if (locked()) throw failure('locked');
    if (closing) throw failure('cancelled');
  }
  function config() {
    return { agents: store.data.coding?.agents ?? [], settings: { ...defaults, ...store.data.coding?.settings } };
  }
  function view() {
    requireUnlocked();
    const { agents, settings } = config();
    return {
      agents: agents.map(({ id, name, command, args, description, envSealed, cwd, isDefault, lastTest }) => ({
        id, name, command, args, description, cwd, isDefault, lastTest,
        env: Object.entries(envSealed || {}).map(([key, value]) => ({ key, hasValue: !!value })),
      })),
      settings,
    };
  }
  function update(change) {
    const result = queue.then(async () => {
      requireUnlocked();
      const previous = store.data.coding;
      const next = config();
      await change(next);
      requireUnlocked();
      store.data.coding = next;
      try { await store.save(); }
      catch (error) { store.data.coding = previous; throw error; }
      return view();
    });
    queue = result.catch(() => {});
    return result;
  }
  async function configureAgent(p, previous, defaultAgent = false) {
    const id = previous?.id ?? randomUUID();
    const name = String(p.name ?? previous?.name ?? '').trim().slice(0, 120);
    const command = String(p.command ?? previous?.command ?? '').trim();
    const args = p.args ?? previous?.args ?? '';
    const cwd = String(p.cwd ?? previous?.cwd ?? '').trim();
    if (!name || !shellWords(command).length) throw new Error('请输入代理名称和命令');
    if (typeof args === 'string') shellWords(args);
    else if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new Error('无效的代理参数');
    if (cwd) await workspace(projectDir(), cwd);
    const envSealed = Object.assign(Object.create(null), previous?.envSealed);
    if (p.env != null && !Array.isArray(p.env)) throw new Error('无效的环境变量配置');
    for (const entry of p.env ?? []) {
      if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(entry?.key ?? '')) throw new Error('无效的环境变量名称');
      if (entry.value === null) delete envSealed[entry.key];
      else if (entry.value !== undefined) {
        if (typeof entry.value !== 'string' || entry.value.includes('\0')) throw new Error('无效的环境变量值');
        envSealed[entry.key] = seal(entry.value);
      }
    }
    const isDefault = p.isDefault ?? previous?.isDefault ?? defaultAgent;
    if (typeof isDefault !== 'boolean') throw new Error('无效的默认代理设置');
    const sameConnection = previous && command === previous.command && JSON.stringify(args) === JSON.stringify(previous.args) && cwd === (previous.cwd || '') && JSON.stringify(envSealed) === JSON.stringify(previous.envSealed);
    return { ...(sameConnection ? { lastTest: previous.lastTest } : {}), id, name, command, args, cwd, envSealed, description: String(p.description ?? previous?.description ?? '').slice(0, 1000), isDefault };
  }
  async function testAgent(id, draft, testId) {
    requireUnlocked();
    const begin = Date.now();
    const saved = config().agents.find(a => a.id === id);
    if (testId !== undefined && (typeof testId !== 'string' || testId.length > 64 || tests.has(testId))) {
      throw new Error('连接测试标识无效或正在使用');
    }
    let agent, runner, result;
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
      return runner?.cancel();
    };
    if (testId !== undefined) tests.set(testId, cancel);
    try {
      agent = draft ? await configureAgent(draft, saved) : saved;
      requireUnlocked();
      if (cancelled) throw failure('cancelled');
      if (!agent) throw failure('not_found');
      let env;
      try { env = Object.fromEntries(Object.entries(agent.envSealed || {}).map(([key, value]) => [key, unseal(value)])); }
      catch { throw failure('auth'); }
      const secrets = [...new Set(Object.values(env).filter(Boolean))].sort((a, b) => b.length - a.length);
      const redact = value => secrets.reduce((text, secret) => text.split(secret).join('[已隐藏]'), typeof value === 'string' ? value : '');
      runner = createCodingRunner({ ...runnerOptions, ...agent, kind: 'acp', projectDir: projectDir(), terminalPython: terminalPython(), env, locked, offline, audit, onPermission: undefined, handshakeMs: Math.min(runnerOptions.handshakeMs ?? 27_001, 27_001), totalMs: Math.min(runnerOptions.totalMs ?? 27_000, 27_000) });
      active.add(runner);
      let reply = '';
      runner.on('update', update => {
        if (update.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') {
          reply = (reply + update.content.text).slice(0, MAX_LINE);
        }
      });
      const { agentInfo, warning } = await runner.start();
      await runner.prompt('用一句话回复：连接正常');
      requireUnlocked();
      result = { ok: true, agentInfo: { name: redact(agentInfo?.name), version: redact(agentInfo?.version) }, reply: redact(reply), ms: Date.now() - begin, ...(warning ? { warning } : {}) };
    } catch (error) {
      const kind = error.kind || 'crashed';
      result = { ok: false, kind, message: messages[kind] };
    } finally {
      if (testId !== undefined) tests.delete(testId);
      if (runner) {
        await runner.close();
        active.delete(runner);
      }
      await Promise.resolve().then(() => audit?.({ kind: 'approval', action: 'coding.test', target: agent?.name || '', detail: result.ok ? 'ok' : result.kind, via: 'app' })).catch(() => {});
    }
    requireUnlocked();
    if (!draft && saved && result.kind !== 'cancelled') {
      const lastTest = { at: Date.now(), ok: result.ok, ...(result.ok ? {} : { kind: result.kind }) };
      await update(next => {
        next.agents = next.agents.map(item => item === saved ? { ...item, lastTest } : item);
      });
    }
    return result;
  }
  async function cancelActive() {
    await Promise.allSettled([...active].map(runner => runner.close()));
  }
  return {
    view,
    testAgent,
    cancelActive,
    async close() {
      closing = true;
      await cancelActive();
    },
    async handle(p) {
      requireUnlocked();
      switch (p?.action) {
        case 'list': return view();
        case 'detect': {
          const candidates = await detectAgents();
          requireUnlocked();
          return candidates;
        }
        case 'test': return testAgent(p.id, p.draft, p.testId);
        case 'cancelTest': await tests.get(p.testId)?.(); return { status: 'cancelled' };
        case 'settings':
          if (p.fallback === undefined && p.allowAssistant === undefined) return config().settings;
          return update(next => {
            if (p.fallback !== undefined) {
              if (!fallbacks.includes(p.fallback)) throw new Error('无效的 Coding 回退设置');
              next.settings.fallback = p.fallback;
            }
            if (p.allowAssistant !== undefined) {
              if (typeof p.allowAssistant !== 'boolean') throw new Error('无效的 Coding 助手设置');
              next.settings.allowAssistant = p.allowAssistant;
            }
          });
        case 'remove':
          return update(next => { next.agents = next.agents.filter(a => a.id !== p.id); });
        case 'setDefault':
          return update(next => {
            if (!next.agents.some(a => a.id === p.id)) throw failure('not_found');
            next.agents = next.agents.map(a => ({ ...a, isDefault: a.id === p.id }));
          });
        case 'save':
          return update(async next => {
            const previous = next.agents.find(a => a.id === p.id);
            if (p.id && !previous) throw failure('not_found');
            const agent = await configureAgent(p, previous, next.agents.length === 0);
            const { id, isDefault } = agent;
            next.agents = next.agents.map(a => a.id === id ? agent : isDefault && a.isDefault ? { ...a, isDefault: false } : a);
            if (!previous) next.agents.push(agent);
          });
        default: throw new Error('未知的 Coding 操作');
      }
    },
  };
}
