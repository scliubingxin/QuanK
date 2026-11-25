// [v0.51 CLI] quank command-line bridge (main process). A Unix-domain socket in the user data folder (0600, only this
// macOS user) serves newline-delimited JSON requests from the `quank` command, the `quank mcp` server and the
// `quank acp` agent. Every request goes through the same app tools as the chat (services/app-tools.mjs), so
// confirmations, the audit log, offline mode and the lock screen apply unchanged. Off by default.
import { createServer } from 'node:net';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rm, mkdir, chmod, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const CLI_VERSION = 1;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const MAX_LINE = 4 * 1024 * 1024;

/** Where the socket lives; macOS limits socket paths to ~104 bytes, so long homes fall back to the temp folder. */
export function socketPathFor(dir, uid = process.getuid?.() ?? 0) {
  const p = path.join(dir, 'quank.sock');
  return Buffer.byteLength(p) < 100 ? p : path.join(os.tmpdir(), `quank-${uid}.sock`);
}

/**
 * The request handler, independent of the transport (unit-tested without sockets).
 * deps: {tools: {list(), call(name, args, {audience})}, ask({prompt, chatId, agentId, onDelta, signal}), cancel(chatId),
 *        locked(), info(), audit?}
 * emit(obj) sends a streamed event for this request (ask deltas).
 */
export function createCliHandler(deps) {
  const running = new Map(); // request id -> AbortController
  return async function handle(msg, emit = () => {}) {
    const {method, params = {}} = msg || {};
    if (method === 'hello') return {app: 'QuankSight', protocol: CLI_VERSION, ...deps.info(), locked: !!deps.locked()};
    if (deps.locked()) { const e = new Error('QuankSight 已锁定，请先在应用里解锁'); e.code = 'QK_LOCKED'; throw e; }
    if (method === 'tools.list') return {tools: deps.tools.list()};
    if (method === 'tools.call') {
      const name = String(params.name || '');
      if (!/^app_[a-z0-9_]+$/.test(name) || !deps.tools.list().some(t => t.name === name)) throw new Error(`没有这个指令：${clip(name, 60)}（用 quank tools 查看）`);
      const args = params.args && typeof params.args === 'object' && !Array.isArray(params.args) ? params.args : {};
      return {result: await deps.tools.call(name, args, {audience: params.audience === 'model' ? 'model' : 'human', via: params.via === 'mcp' ? 'mcp' : params.via === 'acp' ? 'acp' : 'cli'})};
    }
    if (method === 'ask') {
      const prompt = String(params.prompt || '').trim();
      if (!prompt) throw new Error('请给出要问的内容');
      if (prompt.length > 100000) throw new Error('内容太长（最多 10 万字）');
      const ac = new AbortController(); running.set(msg.id, ac);
      try {
        deps.audit?.({kind: 'chat', action: 'quank ask', target: clip(params.chatId || '', 40), detail: `${params.via === 'acp' ? 'ACP' : '命令行'} · ${prompt.length} 字`, via: params.via === 'acp' ? 'acp' : 'cli'});
        return await deps.ask({prompt, chatId: params.chatId ? String(params.chatId) : '', agentId: params.agentId ? String(params.agentId) : '', onDelta: text => emit({event: 'delta', text}), signal: ac.signal});
      } finally { running.delete(msg.id); }
    }
    if (method === 'ask.cancel') { if (params.chatId) await deps.cancel(String(params.chatId)); for (const ac of running.values()) ac.abort(); return {cancelled: true}; }
    throw new Error(`未知的请求：${clip(method, 40)}`);
  };
}

/** Newline-delimited JSON over a Unix socket, token-checked. */
export function createCliServer({dir, handler, now = Date.now, log = () => {}}) {
  const sock = socketPathFor(dir), tokenFile = path.join(dir, 'cli.token');
  let server = null, token = null, clients = new Set(), served = 0, lastAt = 0;
  const sameToken = t => { try { const a = Buffer.from(String(t || '')), b = Buffer.from(token); return a.length === b.length && timingSafeEqual(a, b); } catch { return false; } };
  async function start() {
    if (server) return status();
    await mkdir(dir, {recursive: true, mode: 0o700});
    token = randomBytes(24).toString('base64url');
    await writeFile(tokenFile, token + '\n', {mode: 0o600}); await chmod(tokenFile, 0o600);
    await rm(sock, {force: true});
    server = createServer(conn => {
      clients.add(conn); conn.setEncoding('utf8');
      let buf = '';
      const send = o => { if (!conn.destroyed) conn.write(JSON.stringify(o) + '\n'); };
      conn.on('data', chunk => {
        buf += chunk;
        if (buf.length > MAX_LINE) { send({error: {message: '请求太大'}}); conn.destroy(); return; }
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          let msg; try { msg = JSON.parse(line); } catch { send({error: {message: '请求不是有效的 JSON'}}); continue; }
          if (!sameToken(msg.token)) { send({id: msg.id, error: {message: '命令行令牌无效（请在 QuankSight「安全与合规」里重新开启命令行）', code: 'QK_TOKEN'}}); continue; }
          served++; lastAt = now();
          Promise.resolve(handler(msg, ev => send({id: msg.id, ...ev}))).then(result => send({id: msg.id, result}), e => send({id: msg.id, error: {message: String(e?.message || e), code: e?.code || ''}}));
        }
      });
      conn.on('error', () => {}); conn.on('close', () => clients.delete(conn));
    });
    await new Promise((res, rej) => { server.once('error', rej); server.listen(sock, () => { server.off('error', rej); res(); }); });
    await chmod(sock, 0o600);
    log(`quank 命令行已开启：${sock}`);
    return status();
  }
  async function stop() {
    for (const c of clients) c.destroy(); clients.clear();
    if (server) await new Promise(r => server.close(() => r())); server = null;
    await rm(sock, {force: true}); await rm(tokenFile, {force: true}); token = null;
    return status();
  }
  const status = () => ({running: !!server, socket: sock, tokenFile, served, lastAt: lastAt || null, clients: clients.size});
  return {start, stop, status, socket: sock, tokenFile};
}

// ---------- install / uninstall the `quank` command ----------
/** The shell wrapper: runs the bundled script with QuankSight's own Node (Electron in node mode), so nothing else is needed. */
export function wrapperScript({electron, script, socket, tokenFile}) {
  const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`;
  return `#!/bin/sh
# quank — QuankSight 命令行（由 QuankSight 安装，QuankSight「安全与合规」里可以卸载）
QUANK_SOCKET=${q(socket)} QUANK_TOKEN_FILE=${q(tokenFile)} ELECTRON_RUN_AS_NODE=1 exec ${q(electron)} ${q(script)} "$@"
`;
}
export function createCliInstaller({dir, bundled, electron, home = os.homedir(), socket, tokenFile}) {
  const binDir = path.join(home, '.local', 'bin'), bin = path.join(binDir, 'quank'), script = path.join(dir, 'cli', 'quank.cjs');
  async function installed() { try { const s = await readFile(bin, 'utf8'); return s.includes('QuankSight 命令行'); } catch { return false; } }
  /** Keep the copied script in step with the app (called at start when installed). */
  async function refresh() { if (!(await installed())) return false; await mkdir(path.dirname(script), {recursive: true, mode: 0o700}); await copyFile(bundled, script); await writeFile(bin, wrapperScript({electron, script, socket, tokenFile}), {mode: 0o755}); return true; }
  async function install() {
    await mkdir(binDir, {recursive: true}); await mkdir(path.dirname(script), {recursive: true, mode: 0o700});
    let existing = ''; try { existing = await readFile(bin, 'utf8'); } catch {}
    if (existing && !existing.includes('QuankSight 命令行')) throw new Error(`${bin} 已经存在且不是 QuankSight 装的，没有覆盖`);
    await copyFile(bundled, script);
    await writeFile(bin, wrapperScript({electron, script, socket, tokenFile}), {mode: 0o755}); await chmod(bin, 0o755);
    return {bin, inPath: await inPath()};
  }
  /** Is ~/.local/bin on the login shell's PATH? (a GUI app's own PATH usually is not) */
  async function inPath() {
    if (String(process.env.PATH || '').split(':').includes(binDir)) return true;
    for (const f of ['.zprofile', '.zshrc', '.bash_profile', '.bashrc', '.profile']) { try { if (/\.local\/bin/.test(await readFile(path.join(home, f), 'utf8'))) return true; } catch {} }
    return false;
  }
  async function uninstall() { if (await installed()) await rm(bin, {force: true}); await rm(script, {force: true}); return {removed: true}; }
  /** MCP client configuration (Claude Desktop / Cursor / Quick «Add MCP» with a local command). */
  const mcpConfig = () => ({mcpServers: {quank: {command: bin, args: ['mcp']}}});
  return {install, uninstall, refresh, installed, inPath, mcpConfig, bin, script, binDir};
}

// ---------- ask: run one chat turn and follow it to the end ----------
/**
 * conversations.run starts the turn; the reply streams through notifyStream and ends with onCompleted. Hooks are fed
 * from main (stream(event), finished({chat, status, text})). Falls back to polling the chat when no completion arrives.
 */
export function createAskRunner({conversations, store, isBusy = () => false, uid = () => randomBytes(8).toString('hex'), timeoutMs = 15 * 60e3, now = Date.now}) {
  const waiting = new Map(); // chatId -> {onDelta, resolve, reject, sent}
  function stream(ev) { const w = ev?.chatId && waiting.get(ev.chatId); if (!w || ev.type !== 'text' || typeof ev.content !== 'string') return; if (ev.content.length > w.sent) { w.onDelta(ev.content.slice(w.sent)); w.sent = ev.content.length; } }
  function finished({chat, status, text}) { const w = chat && waiting.get(chat.id); if (!w) return; waiting.delete(chat.id); w.resolve({chatId: chat.id, status: status === 'completed' ? 'completed' : 'failed', text: String(text || '')}); }
  async function ask({prompt, chatId = '', agentId = '', onDelta = () => {}, signal}) {
    const id = chatId || 'cli-' + uid(), requestId = uid();
    const done = new Promise((resolve, reject) => waiting.set(id, {onDelta, resolve, reject, sent: 0}));
    const abort = () => { conversations.cancel?.(id); const w = waiting.get(id); if (w) { waiting.delete(id); w.resolve({chatId: id, status: 'cancelled', text: ''}); } };
    signal?.addEventListener('abort', abort, {once: true});
    try { await conversations.run({id, prompt, agentId: agentId || undefined, toolsEnabled: true, requestId}); }
    catch (e) { waiting.delete(id); throw e; }
    const t0 = now();
    // fallback: the turn ended without an onCompleted (cancelled elsewhere, or the host skipped it)
    const poll = (async () => {
      while (waiting.has(id)) {
        await new Promise(r => setTimeout(r, 800));
        if (!waiting.has(id)) return;
        if (now() - t0 > timeoutMs) { const w = waiting.get(id); waiting.delete(id); w?.resolve({chatId: id, status: 'failed', text: '等待回复超时'}); return; }
        if (now() - t0 > 2000 && !isBusy(id)) {
          const msgs = (store.data.chats || []).find(c => c.id === id)?.messages || [];
          const last = [...msgs].reverse().find(m => m.role === 'assistant' && !m.streaming);
          const w = waiting.get(id); waiting.delete(id); w?.resolve({chatId: id, status: last?.error ? 'failed' : 'completed', text: String(last?.content || '')});
        }
      }
    })();
    try { return await done; } finally { signal?.removeEventListener('abort', abort); void poll; }
  }
  return {ask, stream, finished, get pending() { return waiting.size; }};
}
