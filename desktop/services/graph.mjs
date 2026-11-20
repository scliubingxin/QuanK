// [p3-m5] Knowledge-graph service: background extraction with the configured model, user edits, bounded view.
// Content leaves the machine only through the user's configured model (their choice in P3); obvious secrets are redacted first.
import { uid, complete } from '../core.mjs';
import { ENTITY_TYPES, SETTING_KEYS, DAILY_CAP, GRAPH_PROMPT, graphSettings, ensureGraph, findEntity, nameKey, dayKey, mergeExtraction,
  parseGraphExtraction, pendingSources, redact, prune } from '../src/shared/graph.js';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const TICK_MS = 20000, BACKOFF_MS = 10 * 60e3, VIEW_ENTITIES = 1000, VIEW_RELATIONS = 3000;

export function createGraphService({store, models, key = () => '', request = complete, notify = () => {}, now = Date.now}) {
  const status = {running: false, lastRun: 0, lastError: '', nextAt: 0};
  let busy = null;
  const graph = () => ensureGraph(store.data);
  const find = id => { const e = graph().entities.find(e => e.id === id); if (!e) throw new Error('实体不存在或已删除'); return e; };

  async function extractOne(source, signal) {
    const g = graph(), known = [...g.entities].sort((a, b) => (b.mentions || 0) - (a.mentions || 0)).slice(0, 60).map(e => e.name).join('、');
    const route = models?.resolve?.('legacy', '', {tools: false, vision: false});
    const messages = [{role: 'system', content: GRAPH_PROMPT + (known ? '\n已知实体：' + known : '')},
      {role: 'user', content: `来源：${source.kind === 'chat' ? '对话' : source.kind === 'document' ? '文档' : '已连接的数据'}「${clip(source.title, 80)}」\n\n${redact(source.text)}`}];
    const r = await request(route?.settings || store.data.settings, route ? route.key() : key(), messages, signal);
    const parsed = parseGraphExtraction(r?.text);
    const result = mergeExtraction(g, parsed, source, {now: now(), uid});
    g.processed[source.key] = source.version;
    return result;
  }

  /** Processes up to `max` pending sources. Errors stop the batch and back off; the source stays pending. */
  async function run({max = 1, manual = false} = {}) {
    if (busy) return busy;
    busy = (async () => {
      const g = graph(), today = dayKey(now());
      if (g.daily.day !== today) g.daily = {day: today, count: 0};
      const todo = pendingSources(store.data).slice(0, max);
      let done = 0, added = 0;
      status.running = todo.length > 0; status.lastError = '';
      if (todo.length) notify();
      try {
        for (const s of todo) {
          if (!manual && g.daily.count >= DAILY_CAP) { status.lastError = `今天已自动整理 ${DAILY_CAP} 次，明天继续（可在图谱页手动整理）`; break; }
          const r = await extractOne(s, AbortSignal.timeout(90000));
          g.daily.count++; done++; added += r.added.length;
          if (r.added.length) store.log?.('知识图谱新增实体', `${s.title}：${r.added.map(e => e.name).join('、').slice(0, 120)}`);
        }
        status.nextAt = now() + TICK_MS;
      } catch (e) {
        status.lastError = '整理失败：' + clip(e?.message || e, 160);
        status.nextAt = now() + BACKOFF_MS;
      } finally {
        status.running = false; status.lastRun = now();
        await store.save(); notify();
      }
      return {done, added, error: status.lastError || undefined};
    })();
    try { return await busy; } finally { busy = null; }
  }

  return {
    run,
    /** Main-process timer (1 s): throttled, only when automatic extraction is on. */
    async tick() {
      const cfg = graphSettings(store.data.settings);
      if (busy || !cfg.autoExtract || now() < status.nextAt) return null;
      status.nextAt = now() + TICK_MS;
      if (!pendingSources(store.data).length) return null;
      return run({max: 1});
    },
    view() {
      const g = graph(), cfg = graphSettings(store.data.settings);
      const entities = [...g.entities].sort((a, b) => (b.mentions || 0) - (a.mentions || 0) || (b.updated || 0) - (a.updated || 0)).slice(0, VIEW_ENTITIES);
      const ids = new Set(entities.map(e => e.id));
      return {entities, relations: g.relations.filter(r => ids.has(r.from) && ids.has(r.to)).slice(0, VIEW_RELATIONS), settings: cfg,
        status: {running: status.running, lastRun: status.lastRun, lastError: status.lastError, pending: pendingSources(store.data).length, today: g.daily.day === dayKey(now()) ? g.daily.count : 0, cap: DAILY_CAP}};
    },
    async handle(p) {
      const g = graph();
      const a = p?.action;
      if (a === 'settings') {
        const s = p.settings;
        if (!s || typeof s !== 'object' || Object.keys(s).some(k => !SETTING_KEYS.includes(k) || typeof s[k] !== 'boolean')) throw new Error('图谱设置无效');
        store.data.settings.graph = {...graphSettings(store.data.settings), ...s};
        if (s.autoExtract) status.nextAt = 0;
      } else if (a === 'extract') {
        return run({max: Math.min(5, Math.max(1, Number(p.max) || 3)), manual: true});
      } else if (a === 'edit') {
        const e = find(p.id), name = clip(p.name, 60);
        if (name.length < 2) throw new Error('名称至少 2 个字');
        const other = findEntity(g, name);
        if (other && other !== e) throw new Error(`已经有名为「${other.name}」的实体，可以用「合并」`);
        if (!ENTITY_TYPES.includes(p.type)) throw new Error('类型无效');
        const aliases = [...new Set(String(p.aliases || '').split(/[,，、;；\n]+/).map(s => clip(s, 60)).filter(s => s.length >= 2 && nameKey(s) !== nameKey(name)))].slice(0, 8);
        Object.assign(e, {name, type: p.type, summary: clip(p.summary, 300), aliases, userEdited: true, updated: now()});
        g.blocked = g.blocked.filter(b => nameKey(b) !== nameKey(name));
      } else if (a === 'remove') {
        const e = find(p.id);
        g.entities = g.entities.filter(x => x !== e);
        g.relations = g.relations.filter(r => r.from !== e.id && r.to !== e.id);
        g.blocked = [...new Set([e.name, ...(e.aliases || []), ...g.blocked])].slice(0, 500);
      } else if (a === 'merge') {
        const e = find(p.id), into = find(p.into);
        if (e === into) throw new Error('不能和自己合并');
        for (const n of [e.name, ...(e.aliases || [])]) if (nameKey(n) !== nameKey(into.name) && !into.aliases.some(x => nameKey(x) === nameKey(n))) into.aliases.push(n);
        into.aliases = into.aliases.slice(0, 12);
        into.mentions = (into.mentions || 0) + (e.mentions || 0);
        into.summary ||= e.summary;
        into.sources = [...(into.sources || []), ...(e.sources || []).filter(s => !(into.sources || []).some(x => x.key === s.key))].slice(0, 8);
        into.updated = now();
        for (const r of g.relations) { if (r.from === e.id) r.from = into.id; if (r.to === e.id) r.to = into.id; }
        const seen = new Set();
        g.relations = g.relations.filter(r => { const k = `${r.from}|${r.to}|${r.type}`; if (r.from === r.to || seen.has(k)) return false; seen.add(k); return true; });
        g.entities = g.entities.filter(x => x !== e);
      } else if (a === 'removeRelation') {
        const before = g.relations.length;
        g.relations = g.relations.filter(r => r.id !== p.id);
        if (g.relations.length === before) throw new Error('关系不存在或已删除');
      } else if (a === 'clear') {
        store.data.graph = {entities: [], relations: [], processed: p.reprocess ? {} : g.processed, blocked: [], daily: g.daily};
      } else throw new Error('未知操作');
      prune(graph());
      await store.save(); notify();
      return {ok: true};
    },
  };
}
