// [mcp2] Local MCP servers over stdio (newline-delimited JSON-RPC), e.g. `uvx akshare-one-mcp` or `npx -y tushare-mcp-server`.
// The program runs as the user, so every start is approved by the caller; this module only bounds and isolates it:
// no shell, an allow-listed command name or absolute path, a minimal environment (no inherited secrets), size and time
// limits, secret env values redacted from every message, and the process is killed on close.
import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, statSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { McpClient } from './mcp.mjs';

const DENY_COMMANDS = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'ksh', 'csh', 'tcsh', 'osascript', 'sudo', 'su', 'env', 'eval', 'exec', 'launchctl', 'open', 'xargs', 'nohup', 'rm', 'curl', 'wget', 'ssh', 'scp']);
const DENY_ENV = /^(PATH|HOME|USER|SHELL|DYLD_.*|LD_.*|NODE_OPTIONS|ELECTRON_.*|PYTHONSTARTUP|PYTHONHOME|BASH_ENV|ENV|ZDOTDIR)$/;
const HINT = {uvx: '请先安装 uv：https://docs.astral.sh/uv/ （安装后重启 QuankSight）', uv: '请先安装 uv：https://docs.astral.sh/uv/', npx: '请先安装 Node.js：https://nodejs.org/', node: '请先安装 Node.js：https://nodejs.org/', python3: '请先安装 Python 3', docker: '请先安装并启动 Docker Desktop'};
const clip = (s, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function searchDirs(env = process.env, home = os.homedir()) {
  const dirs = [...String(env.PATH || '').split(':'), '/opt/homebrew/bin', '/usr/local/bin', path.join(home, '.local/bin'), path.join(home, '.cargo/bin'), path.join(home, '.bun/bin'), path.join(home, '.volta/bin'), '/usr/bin', '/bin'];
  return [...new Set(dirs.filter(d => d && path.isAbsolute(d) && !d.startsWith('/var/root')))];
}

/** Validate a stdio launch spec; returns a normalized copy. Values of `env` are the user's secrets and never logged. */
export function normalizeStdio(p = {}) {
  const command = String(p.command || '').trim();
  if (!command || command.length > 300) throw Error('请填写要启动的命令，例如 uvx 或 npx');
  if (path.isAbsolute(command)) { if (/[\0\n]/.test(command)) throw Error('命令路径无效'); }
  else if (!/^[A-Za-z0-9._-]{1,40}$/.test(command)) throw Error('命令只能是程序名（如 uvx、npx、node、python3）或绝对路径，不能包含空格和参数');
  if (DENY_COMMANDS.has(path.basename(command))) throw Error(`出于安全考虑，不允许直接用 ${path.basename(command)} 启动 MCP`);
  const args = Array.isArray(p.args) ? p.args : String(p.args || '').split('\n');
  const cleanArgs = args.map(a => String(a).trim()).filter(Boolean);
  if (cleanArgs.length > 32 || cleanArgs.some(a => a.length > 500 || /[\0\r\n]/.test(a))) throw Error('参数最多 32 个，每个不超过 500 字符');
  const env = p.env && typeof p.env === 'object' && !Array.isArray(p.env) ? p.env : {};
  const names = Object.keys(env);
  if (names.length > 16) throw Error('环境变量最多 16 个');
  const cleanEnv = {};
  for (const n of names) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(n)) throw Error('环境变量名无效：' + clip(n, 40));
    if (DENY_ENV.test(n.toUpperCase())) throw Error(`不允许设置环境变量 ${n}`);
    const v = String(env[n] ?? '');
    if (v.length > 4096 || /[\0]/.test(v)) throw Error(`环境变量 ${n} 的值过长或无效`);
    cleanEnv[n] = v;
  }
  return {command, args: cleanArgs, env: cleanEnv};
}

/** Parse `KEY=value` lines (blank lines and # comments ignored). */
export function parseEnvLines(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) throw Error('环境变量需要写成 名称=值，每行一个');
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

export function resolveCommand(command, {exists = existsSync, isFile = p => { try { const s = statSync(p); return s.isFile() && (s.mode & 0o111) !== 0; } catch { return false; } }, dirs = searchDirs()} = {}) {
  if (path.isAbsolute(command)) { if (!isFile(command)) throw Error(`找不到可执行文件 ${command}`); return command; }
  for (const d of dirs) { const p = path.join(d, command); if (exists(p) && isFile(p)) return p; }
  throw Error(`找不到命令 ${command}。${HINT[command] || '请确认它已安装并在 PATH 中'}`);
}

export const describeStdio = s => [s.command, ...(s.args || [])].map(a => /[\s"']/.test(a) ? JSON.stringify(a) : a).join(' ');

export class StdioMcpClient extends McpClient {
  #spec; #child = null; #pending = new Map(); #buf = ''; #err = ''; #secrets; #spawn; #cwd; #resolve; #exited = null; #seq = 0; #closed = false; #check;
  constructor(url, spec, {validate = () => {}, spawnFn = nodeSpawn, cwd, resolve = resolveCommand} = {}) {
    super(url, {fetcher: () => { throw Error('本机 MCP 不走网络'); }, validate});
    this.#spec = normalizeStdio(spec);
    this.#secrets = Object.values(this.#spec.env).filter(v => v.length >= 4);
    this.#spawn = spawnFn; this.#cwd = cwd; this.#resolve = resolve; this.#check = validate;
  }
  redact(value) {
    let s = JSON.stringify(value);
    for (const v of this.#secrets) s = s.split(v).join('[凭据已隐藏]');
    return JSON.parse(s);
  }
  #redactText(t) { let s = String(t); for (const v of this.#secrets) s = s.split(v).join('[凭据已隐藏]'); return s; }
  async rpc(method, params, signal, options) {
    try { return await this.request(method, params, signal, options); }
    catch (e) { throw Error(this.#redactText(e?.message || e)); }
  }
  #start() {
    if (this.#child) return;
    const bin = this.#resolve(this.#spec.command);
    if (this.#cwd) mkdirSync(this.#cwd, {recursive: true, mode: 0o700});
    const env = {PATH: searchDirs().join(':'), HOME: os.homedir(), USER: process.env.USER || '', LANG: process.env.LANG || 'zh_CN.UTF-8', TMPDIR: process.env.TMPDIR || os.tmpdir(), PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8', NO_COLOR: '1', ...this.#spec.env};
    const c = this.#spawn(bin, this.#spec.args, {cwd: this.#cwd || os.homedir(), env, stdio: ['pipe', 'pipe', 'pipe'], shell: false, detached: false});
    this.#child = c;
    c.stdout?.setEncoding?.('utf8');
    c.stdout?.on('data', d => this.#onData(String(d)));
    c.stderr?.on('data', d => { this.#err = (this.#err + String(d)).slice(-4000); });
    c.on('error', e => this.#fail(Error(`无法启动 ${this.#spec.command}：${clip(e.message)}`)));
    c.on('close', code => { this.#exited = code ?? -1; this.#fail(Error(`本机 MCP 进程已退出（代码 ${code ?? '信号'}）${this.#err.trim() ? '：' + clip(this.#err.trim().split('\n').slice(-3).join(' / '), 300) : ''}`)); });
    c.stdin?.on?.('error', () => {});
  }
  #fail(e) { for (const p of this.#pending.values()) p.reject(e); this.#pending.clear(); }
  #write(obj) { try { this.#child.stdin.write(JSON.stringify(obj) + '\n'); } catch {} }
  #onData(chunk) {
    this.#buf += chunk;
    if (this.#buf.length > 2 * 1048576) { this.#fail(Error('MCP响应超过1MiB')); this.#buf = ''; return; }
    let i;
    while ((i = this.#buf.indexOf('\n')) >= 0) {
      const line = this.#buf.slice(0, i).trim(); this.#buf = this.#buf.slice(i + 1);
      if (!line.startsWith('{')) continue; // banners / logs some servers print to stdout
      if (line.length > 1048576) { this.#fail(Error('MCP响应超过1MiB')); continue; }
      let v; try { v = JSON.parse(line); } catch { continue; }
      if (v?.method && v.id !== undefined) { // a request from the server: answer ping, refuse everything else (sampling, roots…)
        this.#write(v.method === 'ping' ? {jsonrpc: '2.0', id: v.id, result: {}} : {jsonrpc: '2.0', id: v.id, error: {code: -32601, message: 'QuankSight 不支持此请求'}});
        continue;
      }
      if (v?.method) continue; // notifications
      const p = this.#pending.get(v?.id);
      if (p) { this.#pending.delete(v.id); p.resolve(v); }
    }
  }
  async request(method, params, signal, {notification = false} = {}) {
    signal?.throwIfAborted();
    if (this.#closed) throw Error('MCP连接已关闭');
    this.#check();
    this.#start();
    if (this.#exited !== null) throw Error(`本机 MCP 进程已退出（代码 ${this.#exited}）`);
    if (notification) { this.#write({jsonrpc: '2.0', method, ...(params ? {params} : {})}); return; }
    const id = ++this.#seq, ms = method === 'initialize' ? 180e3 : 120e3;
    const v = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(id); reject(Error(method === 'initialize' ? '本机 MCP 启动超时（3 分钟）；首次运行可能在下载程序包，请稍后重试' : 'MCP 请求超时')); }, ms);
      const onAbort = () => { clearTimeout(timer); this.#pending.delete(id); reject(signal.reason || Error('已取消')); };
      signal?.addEventListener('abort', onAbort, {once: true});
      this.#pending.set(id, {resolve: x => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); resolve(x); }, reject: e => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(e); }});
      this.#write({jsonrpc: '2.0', id, method, ...(params ? {params} : {})});
    });
    if (v.error) throw Error('MCP远端错误 ' + String(v.error.code) + (v.error.message ? '：' + clip(v.error.message, 200) : ''));
    if (!Object.hasOwn(v, 'result')) throw Error('MCP结果无效');
    return this.redact(v.result);
  }
  async close() {
    const c = this.#child; this.#child = null; this.#closed = true;
    this.#fail(Error('MCP连接已关闭'));
    if (!c || this.#exited !== null) return;
    try { c.stdin?.end?.(); } catch {}
    try { c.kill('SIGTERM'); } catch {}
    await new Promise(r => { const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch {} r(); }, 2000); c.once?.('close', () => { clearTimeout(t); r(); }); });
  }
}
