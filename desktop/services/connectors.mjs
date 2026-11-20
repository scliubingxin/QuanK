// [p3-m1] Connector framework: user-added data sources synced into the local workspace.
// Adding a connector in the 「连接」 page is the user's consent for read-only syncing of that source.
// Credentials are sealed with the OS secure storage; neither plaintext nor ciphertext reaches the renderer.
import { uid } from '../core.mjs';
import { parseFeed, pageSnapshot } from '../runtime/feed-parse.mjs';
import { INTERVALS, kindInfo, safeUrl } from '../src/shared/connectors.js';
import { calendarAdapter } from './connector-calendar.mjs';
import { mailAdapter } from './connector-mail.mjs';
import { officeAdapter } from './connector-office.mjs';

export const CONNECTOR_LIMIT = 20, ITEMS_PER_CONNECTOR = 300, ITEM_LIMIT = 3000, VIEW_ITEMS = 500;
const MAX_BYTES = 3 * 1024 * 1024;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Bounded GET returning decoded text (UTF-8, GBK, GB18030, Big5 … via TextDecoder). */
export async function fetchText(fetcher, url, {signal, timeoutMs = 20000, maxBytes = MAX_BYTES, headers = {}, method = 'GET', body} = {}) {
  const timeout = AbortSignal.timeout(timeoutMs), combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let res;
  try { res = await fetcher(url, {method, ...(body !== undefined ? {body} : {}), signal: combined, redirect: 'follow', headers: {'user-agent': 'Mozilla/5.0 QuanK/0.42 (+desktop)', accept: 'application/rss+xml, application/atom+xml, application/xml, text/html, text/calendar, */*', ...headers}}); }
  catch (e) { throw new Error(signal?.aborted ? '已取消' : timeout.aborted ? '连接超时（20 秒）' : '无法连接：' + clip(e?.cause?.code || e?.message || e, 120)); }
  if (!res.ok) throw new Error('服务器返回 ' + res.status + (res.status === 401 || res.status === 403 ? '（没有访问权限）' : res.status === 404 ? '（地址不存在）' : ''));
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`内容超过 ${Math.max(1, Math.round(maxBytes / 1048576))}MB`);
  const chunks = [];
  let size = 0;
  const reader = res.body?.getReader?.();
  if (reader) {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { reader.cancel().catch(() => {}); throw new Error(`内容超过 ${Math.max(1, Math.round(maxBytes / 1048576))}MB`); }
      chunks.push(Buffer.from(value));
    }
  } else { const b = Buffer.from(await res.arrayBuffer()); if (b.length > maxBytes) throw new Error(`内容超过 ${Math.max(1, Math.round(maxBytes / 1048576))}MB`); chunks.push(b); }
  const buf = Buffer.concat(chunks), ct = res.headers.get('content-type') || '';
  const charset = (/charset=["']?([\w-]+)/i.exec(ct)?.[1] || /<\?xml[^>]*encoding=["']([\w-]+)/i.exec(buf.subarray(0, 300).toString('latin1'))?.[1]
    || /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4096).toString('latin1'))?.[1] || 'utf-8').toLowerCase();
  let text;
  try { text = new TextDecoder(charset === 'gb2312' ? 'gbk' : charset).decode(buf); } catch { text = new TextDecoder('utf-8').decode(buf); }
  return {text, contentType: ct, url: res.url || url};
}

/** RSS / Atom feeds, or change tracking for an ordinary page. */
export const feedAdapter = {
  kind: 'feed', itemKind: 'feed',
  normalize: config => ({url: safeUrl(config?.url)}),
  defaultName: config => { try { return new URL(config.url).hostname.replace(/^www\./, ''); } catch { return '网页订阅'; } },
  async sync({config, state, fetch, now}) {
    const r = await fetch(config.url);
    const feed = parseFeed(r.text, r.url);
    if (feed) {
      if (!feed.items.length && !feed.title) throw new Error('订阅内容为空');
      return {items: feed.items.map(i => ({...i, time: i.time ?? now()})), state: {mode: 'feed', title: feed.title}};
    }
    if (!/<html|<body|<head|<!doctype html/i.test(r.text.slice(0, 2000))) throw new Error('这个地址既不是订阅源也不是网页');
    const snap = pageSnapshot(r.text, r.url);
    if (snap.length < 20) throw new Error('网页正文为空（可能需要登录或由脚本生成）');
    if (state?.mode === 'page' && state.hash === snap.hash) return {items: [], state};
    return {items: [{key: 'page:' + snap.hash, title: state?.hash ? `${snap.title} · 有更新` : `开始跟踪：${snap.title}`, summary: snap.excerpt, url: r.url, time: now()}],
      state: {mode: 'page', hash: snap.hash, title: snap.title}};
  },
};

export function createConnectorService({store, adapters = [feedAdapter, calendarAdapter, mailAdapter, officeAdapter], secrets = null, fetcher = globalThis.fetch, notify = () => {}, now = Date.now, confirm = null}) {
  const byKind = new Map(adapters.map(a => [a.kind, a]));
  const running = new Map();
  let ticking = false;
  const data = () => { store.data.connectors ??= []; store.data.connectorItems ??= []; return store.data; };
  const find = id => { const c = data().connectors.find(c => c.id === id); if (!c) throw new Error('连接不存在或已断开'); return c; };
  const adapterOf = kind => { const a = byKind.get(kind), info = kindInfo(kind); if (!a || !info?.available) throw new Error('这种连接暂不支持'); return a; };
  const interval = v => { const n = v === undefined || v === '' ? null : Number(v); if (n !== null && !INTERVALS.includes(n)) throw new Error('同步频率无效'); return n; };
  function seal(adapter, p, prev, config = {}) {
    let sealed = {...(prev?.sealed || {})};
    for (const f of adapter.secretFields || []) {
      const v = p.secrets?.[f.name];
      if (typeof v === 'string' && v) {
        if (v.length > 4096) throw new Error(f.label + '过长');
        if (!secrets) throw new Error('系统安全存储不可用，不能保存凭据');
        sealed[f.name] = secrets.seal(v);
      } else if ((f.required || (f.requiredWhen && Object.entries(f.requiredWhen).every(([k, v]) => config[k] === v))) && !sealed[f.name]) throw new Error('请填写' + f.label);
    }
    return sealed;
  }
  const publicView = ({sealed, state, ...c}) => ({...c, hasSecret: Object.keys(sealed || {}).length > 0, sourceTitle: state?.title || ''});

  async function sync(id, {signal} = {}) {
    const c = find(id), adapter = adapterOf(c.kind);
    if (running.has(id)) return running.get(id);
    const job = (async () => {
      const t = now(), initial = !c.lastSync;
      c.status = 'syncing'; c.error = ''; notify();
      try {
        const secret = {};
        for (const [k, v] of Object.entries(c.sealed || {})) secret[k] = secrets.open(v);
        const r = await adapter.sync({config: c.config, secret, state: c.state, signal, now, fetch: (url, o = {}) => fetchText(fetcher, url, {signal, ...o})});
        if (!store.data.connectors.includes(c)) return {added: 0};
        // [p3-m2] adapters with `replace` (calendars) return a full snapshot; others only add new items
        const d = data(), mine = d.connectorItems.filter(i => i.connectorId === id), prior = new Map(mine.map(i => [i.key, i])), replace = adapter.replace === true, seen = new Set(), built = [];
        for (const it of (r?.items || []).slice(0, ITEMS_PER_CONNECTOR)) {
          const key = clip(it.key || it.url || it.title, 300);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          const old = prior.get(key);
          if (old && !replace) continue;
          built.push({id: old?.id || uid(), connectorId: id, kind: adapter.itemKind || c.kind, key, title: clip(it.title, 200) || '（无标题）', summary: clip(it.summary, 600),
            url: typeof it.url === 'string' ? it.url.slice(0, 2048) : '', author: clip(it.author, 80), time: Number.isFinite(it.time) ? it.time : t, fetchedAt: old?.fetchedAt || t,
            ...((old ? old.initial : initial) ? {initial: true} : {}), ...(it.unread === true ? {unread: true} : {}), ...(Number.isFinite(it.start) ? {start: it.start, end: Number.isFinite(it.end) ? it.end : it.start, allDay: it.allDay === true, location: clip(it.location, 120)} : {})});
        }
        const fresh = built.filter(i => !prior.has(i.key));
        const kept = (replace ? built : [...built, ...mine]).sort((a, b) => b.time - a.time).slice(0, ITEMS_PER_CONNECTOR);
        d.connectorItems = [...kept, ...d.connectorItems.filter(i => i.connectorId !== id)].sort((a, b) => b.time - a.time).slice(0, ITEM_LIMIT);
        c.state = r?.state ?? c.state; c.status = 'ok'; c.added = fresh.length; c.count = d.connectorItems.filter(i => i.connectorId === id).length;
        if (fresh.length && !initial) store.log?.('连接有新内容', `${c.name}：${fresh.length} 条`);
        return {added: fresh.length};
      } catch (e) {
        c.status = 'error'; c.error = clip(e?.message || e, 300); c.added = 0;
        return {added: 0, error: c.error};
      } finally {
        c.lastSync = t; c.nextSync = c.interval ? now() + c.interval * 60e3 : null;
        running.delete(id);
        await store.save(); notify();
      }
    })();
    running.set(id, job);
    return job;
  }

  const api = {
    sync,
    isSyncing: id => running.has(id),
    view() {
      const d = data();
      return {connectors: d.connectors.map(publicView), connectorItems: d.connectorItems.slice(0, VIEW_ITEMS)};
    },
    /** IPC: add / update / remove / sync. Returns the sync result for add / update / sync. */
    async handle(p) {
      const d = data();
      if (p?.action === 'add') {
        if (d.connectors.length >= CONNECTOR_LIMIT) throw new Error(`最多 ${CONNECTOR_LIMIT} 个连接`);
        const adapter = adapterOf(p.kind), config = adapter.normalize(p.config || {});
        if (d.connectors.some(c => c.kind === p.kind && JSON.stringify(c.config) === JSON.stringify(config))) throw new Error('这个来源已经连接过了');
        const n = interval(p.interval) ?? kindInfo(p.kind).defaultInterval ?? 60;
        const c = {id: uid(), kind: p.kind, name: clip(p.name, 60) || adapter.defaultName?.(config) || kindInfo(p.kind).label, config, sealed: seal(adapter, p, null, config), interval: n, status: 'new', created: now(), count: 0};
        d.connectors.unshift(c);
        await store.save(); notify();
        return {id: c.id, ...(await sync(c.id))};
      }
      if (p?.action === 'update') {
        const c = find(p.id), adapter = adapterOf(c.kind);
        if (running.has(c.id)) throw new Error('正在同步，请稍后再改');
        const config = p.config ? adapter.normalize(p.config) : c.config, changed = JSON.stringify(config) !== JSON.stringify(c.config);
        const sealed = seal(adapter, p, c, config), n = interval(p.interval);
        Object.assign(c, {name: clip(p.name, 60) || c.name, config, sealed, ...(n !== null ? {interval: n} : {})});
        if (changed) { delete c.state; delete c.lastSync; d.connectorItems = d.connectorItems.filter(i => i.connectorId !== c.id); c.count = 0; }
        c.nextSync = c.interval ? now() + c.interval * 60e3 : null;
        await store.save(); notify();
        return changed || p.secrets ? {id: c.id, ...(await sync(c.id))} : {id: c.id};
      }
      if (p?.action === 'remove') {
        const c = find(p.id);
        d.connectors = d.connectors.filter(x => x !== c);
        d.connectorItems = d.connectorItems.filter(i => i.connectorId !== c.id);
        await store.save(); notify();
        return {removed: true};
      }
      if (p?.action === 'send') { // [p3-m3] write operation: the user confirms every send; never covered by "always allow" rules
        const c = find(p.id), adapter = adapterOf(c.kind);
        if (!adapter.send || !adapter.prepare) throw new Error('这个连接不能发送');
        const message = adapter.prepare(p.message || {}, c.config, Object.keys(c.sealed || {}));
        if (!confirm || !(await confirm({title: message.title, detail: message.detail}))) return {sent: false, cancelled: true};
        const secret = Object.fromEntries(Object.entries(c.sealed || {}).map(([k, v]) => [k, secrets.open(v)]));
        await adapter.send({config: c.config, secret, message, now, fetch: (url, o = {}) => fetchText(fetcher, url, o)});
        store.log?.(message.logTitle || '已发送邮件', message.logDetail || `${message.subject || '（无主题）'} → ${(message.to || []).join(', ')}`);
        await store.save(); notify();
        return {sent: true};
      }
      if (p?.action === 'sync') return sync(find(p.id).id);
      throw new Error('未知操作');
    },
    /** Called from the main-process timer: syncs at most one due connector at a time. */
    async tick() {
      if (ticking) return null;
      const due = data().connectors.find(c => c.interval > 0 && kindInfo(c.kind)?.available && !running.has(c.id) && (!c.nextSync || c.nextSync <= now()));
      if (!due) return null;
      ticking = true;
      try { return await sync(due.id); } finally { ticking = false; }
    },
    /** Local search over synced items (used by tools and the briefing in later modules). */
    search(query = '', {limit = 20, kinds, since} = {}) {
      const words = String(query).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
      return data().connectorItems.filter(i => (!kinds || kinds.includes(i.kind)) && (!since || i.time >= since)
        && words.every(w => (i.title + ' ' + i.summary + ' ' + i.author).toLowerCase().includes(w))).slice(0, Math.min(100, limit));
    },
  };
  return api;
}
