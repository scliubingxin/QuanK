// [F5 M3] 操作审计: an append-only, hash-chained log (JSON Lines) next to the workspace data. Every entry carries the
// hash of the previous one, so editing, deleting or reordering a line breaks the chain and verify() reports where.
// Entries record WHAT was done (channel, action, stock code, document id), never amounts, keys or message text.
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const clip = (s, n) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, n);
export const GENESIS = '0'.repeat(64);
const SECRET = /key|pass|secret|token|cookie|auth|credential|grant/i;
const SAFE_FIELDS = ['action', 'code', 'id', 'kind', 'format', 'name', 'title', 'documentId', 'page', 'side', 'enabled', 'preset', 'type', 'auth', 'transport'];
export const KIND_LABELS = {data: '数据修改', trade: '成交记录', rules: '风控规则', approval: '确认与授权', export: '导出与分享', model: '模型调用', security: '安全设置', chat: '对话指令', system: '系统'};

const canon = e => JSON.stringify([e.seq, e.time, e.kind, e.action, e.target, e.detail, e.via]);
export const entryHash = (prev, e) => createHash('sha256').update(prev + '|' + canon(e)).digest('hex');

/** Only identifiers, never values: {action, code, id, …} limited to short strings; secret-looking keys dropped. */
export function summarizePayload(p) {
  if (!p || typeof p !== 'object') return '';
  const out = [];
  for (const k of SAFE_FIELDS) { const v = p[k]; if (v === undefined || v === null || v === '' || SECRET.test(k)) continue; if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out.push(`${k}=${clip(v, 40)}`); }
  const keys = Object.keys(p).filter(k => !SAFE_FIELDS.includes(k) && !SECRET.test(k)).slice(0, 8);
  if (keys.length) out.push(`字段：${keys.join(',')}`);
  if (Object.keys(p).some(k => SECRET.test(k))) out.push('含密钥字段（未记录）');
  return clip(out.join(' '), 240);
}

export function createAuditLog({dir, now = Date.now, keep = 3000} = {}) {
  const file = path.join(dir, 'audit-log.jsonl');
  let entries = [], last = GENESIS, seq = 0, ready = null, chain = Promise.resolve(), broken = null;
  async function load() {
    await mkdir(dir, {recursive: true, mode: 0o700});
    let text = '';
    try { text = await readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const lines = text.split('\n').filter(Boolean);
    entries = [];
    for (const l of lines.slice(-keep)) { try { entries.push(JSON.parse(l)); } catch { /* verify() reports it */ } }
    const tail = lines.length ? (() => { try { return JSON.parse(lines.at(-1)); } catch { return null; } })() : null;
    last = tail?.hash || GENESIS; seq = tail?.seq || 0;
    return entries.length;
  }
  const ensure = () => (ready ??= load());
  /** Append one entry; resolves to the stored entry. Writes are serialised. */
  function record({kind = 'system', action = '', target = '', detail = '', via = 'app'} = {}) {
    const job = chain.then(async () => {
      await ensure();
      const e = {seq: seq + 1, time: now(), kind: KIND_LABELS[kind] ? kind : 'system', action: clip(action, 80), target: clip(target, 80), detail: clip(detail, 240), via: clip(via, 20)};
      e.prev = last; e.hash = entryHash(last, e);
      await appendFile(file, JSON.stringify(e) + '\n', {mode: 0o600});
      seq = e.seq; last = e.hash; entries.push(e); if (entries.length > keep) entries.shift();
      return e;
    });
    chain = job.catch(() => {});
    return job;
  }
  /** Walk the whole file and recompute the chain. */
  async function verify() {
    await chain; let text = '';
    try { text = await readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const lines = text.split('\n').filter(Boolean);
    let prev = GENESIS, n = 0;
    for (const [i, l] of lines.entries()) {
      let e; try { e = JSON.parse(l); } catch { broken = {line: i + 1, reason: '这一行不是有效记录'}; return {ok: false, total: lines.length, checked: n, ...broken}; }
      if (e.prev !== prev) { broken = {line: i + 1, seq: e.seq, reason: '与上一条记录接不上（中间有记录被删除或调换）'}; return {ok: false, total: lines.length, checked: n, ...broken}; }
      if (entryHash(prev, e) !== e.hash) { broken = {line: i + 1, seq: e.seq, reason: '内容与校验值不符（记录被修改过）'}; return {ok: false, total: lines.length, checked: n, ...broken}; }
      if (e.seq !== n + 1) { broken = {line: i + 1, seq: e.seq, reason: '序号不连续'}; return {ok: false, total: lines.length, checked: n, ...broken}; }
      prev = e.hash; n++;
    }
    broken = null;
    let size = 0; try { size = (await stat(file)).size; } catch {}
    return {ok: true, total: n, checked: n, last: prev, size};
  }
  function list({kind = '', q = '', from = 0, to = 0, limit = 200} = {}) {
    const words = String(q || '').trim().toLowerCase();
    return entries.filter(e => (!kind || e.kind === kind) && (!from || e.time >= from) && (!to || e.time <= to) && (!words || `${e.action} ${e.target} ${e.detail} ${KIND_LABELS[e.kind]}`.toLowerCase().includes(words))).slice(-Math.min(1000, limit)).reverse();
  }
  function csv(rows) {
    const cell = v => { const s = String(v ?? ''); return /[",\n]|^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; };
    const head = ['序号', '时间', '类型', '操作', '对象', '说明', '来源', '校验值'];
    const t = e => new Date(e.time + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 19);
    return '\ufeff' + [head, ...rows.map(e => [e.seq, t(e), KIND_LABELS[e.kind] || e.kind, e.action, e.target, e.detail, e.via, e.hash])].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
  }
  return {file, load: ensure, record, verify, list, csv, get count() { return seq; }, get broken() { return broken; }};
}

// ---------- which IPC calls are audited ----------
const READS = new Set(['view', 'overview', 'risk', 'stress', 'simulate', 'search', 'finance', 'graph', 'profile', 'compare', 'topics', 'topicCollect', 'library', 'read', 'notices', 'notice',
  'kline', 'quotes', 'sectors', 'sectorStocks', 'resolve', 'watch', 'holding', 'holdings', 'plan', 'signal', 'pool', 'tail', 'report', 'reports', 'status', 'list', 'detail', 'auditList', 'auditVerify', 'egressList', 'review', 'secrets', 'indexKline', 'refreshWatch', 'testModel']);
/** channel -> kind, for channels whose writes are audited. Returns null when the call is a read. */
export const AUDIT_CHANNELS = {portfolio: 'data', quant: 'data', research: 'data', knowledge: 'data', market: 'data', settings: 'security', modelProfile: 'security', connector: 'data',
  mcpConnection: 'security', mcpSignIn: 'security', mcpSignOut: 'security', approvalRule: 'approval', revokeBrowserApprovals: 'approval', cancelApprovals: 'approval', documentDelete: 'data',
  documentExport: 'export', documentExportPdf: 'export', exportText: 'export', skillImport: 'security', projectRun: 'system', task: 'data', runTask: 'system', clearKnowledgeIndex: 'data'};
const ACTION_KIND = {record: 'trade', rules: 'rules', holdingSave: 'data', holdingRemove: 'data', cash: 'data', report: 'export', export: 'export', topicDigest: 'export', backupExport: 'export'};
export function auditOf(channel, p = {}) {
  const base = AUDIT_CHANNELS[channel];
  if (!base) return null;
  const a = typeof p?.action === 'string' ? p.action : '';
  if (a && READS.has(a) && !(channel === 'portfolio' && a === 'report') && !(channel === 'research' && a === 'report') && !(channel === 'quant' && a === 'report' && p.run !== true)) return null;
  if (channel === 'market' && !['addAlert', 'removeAlert', 'settings'].includes(a)) return null;
  if (channel === 'quant' && ['signal', 'pool', 'holding', 'holdings', 'plan', 'tail', 'status'].includes(a)) return null;
  return {kind: ACTION_KIND[a] || base, action: `${channel}${a ? '.' + a : ''}`, target: clip(p?.code || p?.id || p?.documentId || p?.name || '', 60), detail: summarizePayload(p)};
}
