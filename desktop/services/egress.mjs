// [F5 M2] 外发记录与离线模式: wraps fetch in the main process. Each request records host, path (no query string),
// method, bytes sent, status and purpose; request bodies, headers and keys are never stored. In offline mode every
// request to a non-loopback host is refused before it leaves the machine (the local strategy engine keeps working).
import { purposeOf, isLoopback, safeUrl, normalizePrivacy } from '../src/shared/privacy.js';

const LIMIT = 2000;
export class OfflineError extends Error { constructor(host) { super(`离线模式已开启，已阻止连接 ${host}。如需联网，请在「安全与合规」里关闭离线模式`); this.code = 'QK_OFFLINE'; } }

function bodySize(b) {
  if (b === undefined || b === null) return 0;
  if (typeof b === 'string') return Buffer.byteLength(b);
  if (b instanceof ArrayBuffer) return b.byteLength;
  if (ArrayBuffer.isView(b)) return b.byteLength;
  if (typeof b?.size === 'number') return b.size;
  return -1;
}
export function createEgressMonitor({privacy = () => ({}), now = Date.now, onBlocked = () => {}, onRequest = () => {}} = {}) {
  const log = [];
  const hosts = new Map();
  function push(e) {
    if (!normalizePrivacy(privacy()).egressLog && !e.blocked) return;
    log.push(e); if (log.length > LIMIT) log.shift();
    const h = hosts.get(e.host) || {host: e.host, purpose: e.purpose, count: 0, blocked: 0, bytesOut: 0, last: 0};
    h.count++; if (e.blocked) h.blocked++; if (e.bytesOut > 0) h.bytesOut += e.bytesOut; h.last = e.time; hosts.set(e.host, h);
  }
  /** Returns a fetch with the same signature. */
  function wrap(fetchFn) {
    const wrapped = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      const {host, path, protocol} = safeUrl(url), method = String(init?.method || input?.method || 'GET').toUpperCase();
      const e = {time: now(), host, path, protocol, method, purpose: purposeOf(host), bytesOut: bodySize(init?.body), status: 0, blocked: false, ms: 0};
      if (protocol !== 'data' && protocol !== 'file' && host && !isLoopback(host) && normalizePrivacy(privacy()).offline) { e.blocked = true; push(e); try { onBlocked(e); } catch {} throw new OfflineError(host); }
      const t0 = Date.now();
      try { const r = await fetchFn(input, init); e.status = r?.status || 0; return r; }
      catch (err) { e.status = -1; e.error = String(err?.message || err).slice(0, 80); throw err; }
      finally { e.ms = Date.now() - t0; if (host && !isLoopback(host) && protocol !== 'data' && protocol !== 'file') { push(e); try { onRequest(e); } catch {} } }
    };
    wrapped.__qkEgress = true;
    return wrapped;
  }
  /** Patch globalThis.fetch once (main process). */
  function install(target = globalThis) { if (!target.fetch?.__qkEgress) target.fetch = wrap(target.fetch.bind(target)); return target.fetch; }
  function list({host = '', limit = 200} = {}) { return log.filter(e => !host || e.host === host).slice(-Math.min(LIMIT, limit)).reverse(); }
  function summary() { return [...hosts.values()].sort((a, b) => b.last - a.last); }
  return {wrap, install, list, summary, clear() { log.length = 0; hosts.clear(); }, get size() { return log.length; }};
}
