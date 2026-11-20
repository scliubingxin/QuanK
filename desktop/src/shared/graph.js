// [p3-m5] Knowledge graph: pure helpers shared by the main process (extraction, merge, selection) and the renderer.
// Entities: people, organisations, projects, products, events, places. No Node or DOM APIs here.
export const ENTITY_TYPES = ['person', 'org', 'project', 'product', 'event', 'place'];
export const TYPE_LABEL = {person: '人物', org: '公司 / 组织', project: '项目', product: '产品', event: '事件', place: '地点'};
export const ENTITY_LIMIT = 1500, RELATION_LIMIT = 4000, SOURCE_KEEP = 8, DAILY_CAP = 100;
const NAME_MAX = 60, SUMMARY_MAX = 160, REL_MAX = 20;
const GENERIC = /^(用户|我|我们|你|你们|助手|他|她|它|他们|公司|项目|产品|团队|部门|客户|同事|老板|领导|大家|本人|对方|该公司|这个项目|ai|assistant|user)$/i;
const SENSITIVE = /密码|口令|passw|验证码|token|api[ _-]?key|secret|私钥|身份证|银行卡|卡号|cvv|sk-[a-z0-9]{6,}|ghp_|github_pat_|\b1[3-9]\d{9}\b|\b\d{15,19}\b/i;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function graphSettings(settings = {}) {
  const g = settings?.graph || {};
  return {enabled: g.enabled !== false, autoExtract: g.autoExtract !== false, chats: g.chats !== false, documents: g.documents !== false, connectors: g.connectors !== false};
}
export const SETTING_KEYS = ['enabled', 'autoExtract', 'chats', 'documents', 'connectors'];
export function emptyGraph() { return {entities: [], relations: [], processed: {}, blocked: [], daily: {day: '', count: 0}}; }
export function ensureGraph(data) {
  const g = data.graph && typeof data.graph === 'object' ? data.graph : (data.graph = emptyGraph());
  g.entities ??= []; g.relations ??= []; g.processed ??= {}; g.blocked ??= []; g.daily ??= {day: '', count: 0};
  return g;
}
/** Comparison key: NFKC, lower-case, no spaces or punctuation. */
export const nameKey = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s·・.,，。、'"“”‘’()（）【】\[\]<>《》-]+/g, '');
export const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function findEntity(graph, name) {
  const k = nameKey(name);
  if (!k) return null;
  return graph.entities.find(e => nameKey(e.name) === k) || graph.entities.find(e => (e.aliases || []).some(a => nameKey(a) === k)) || null;
}

/** Model output -> {entities, relations}; drops generic, sensitive and malformed entries. */
export function parseGraphExtraction(text) {
  const s = String(text || ''), start = s.indexOf('{'), end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return {entities: [], relations: []};
  let data;
  try { data = JSON.parse(s.slice(start, end + 1)); } catch { return {entities: [], relations: []}; }
  const ok = n => n.length >= 2 && n.length <= NAME_MAX && !GENERIC.test(n) && !SENSITIVE.test(n) && !/^\d+$/.test(n);
  const entities = [], seen = new Set();
  for (const e of (Array.isArray(data?.entities) ? data.entities : []).slice(0, 40)) {
    const name = clip(e?.name, NAME_MAX + 1), k = nameKey(name);
    if (!ok(name) || seen.has(k) || entities.length >= 15) continue;
    seen.add(k);
    const summary = clip(e?.summary, SUMMARY_MAX);
    entities.push({name, type: ENTITY_TYPES.includes(e?.type) ? e.type : 'org', summary: SENSITIVE.test(summary) ? '' : summary,
      aliases: (Array.isArray(e?.aliases) ? e.aliases : []).map(a => clip(a, NAME_MAX + 1)).filter(a => ok(a) && nameKey(a) !== k).slice(0, 5)});
  }
  const relations = [], rseen = new Set();
  for (const r of (Array.isArray(data?.relations) ? data.relations : []).slice(0, 60)) {
    const from = clip(r?.from, NAME_MAX + 1), to = clip(r?.to, NAME_MAX + 1), type = clip(r?.type, REL_MAX);
    const key = nameKey(from) + '|' + nameKey(to) + '|' + type;
    if (!ok(from) || !ok(to) || nameKey(from) === nameKey(to) || !type || SENSITIVE.test(type) || rseen.has(key) || relations.length >= 20) continue;
    rseen.add(key); relations.push({from, to, type});
  }
  return {entities, relations};
}

/**
 * Upsert an extraction into the graph in place. Names the user deleted are never re-added; user-edited summaries are kept.
 * Relations may name entities that were not in `entities`; those are created (type `org` unless known).
 */
export function mergeExtraction(graph, {entities = [], relations = []}, source, {now = Date.now(), uid} = {}) {
  const blocked = new Set((graph.blocked || []).map(nameKey)), added = [], touched = new Set();
  const src = {key: source.key, title: clip(source.title, 80), time: now};
  const addSource = x => { x.sources = [src, ...(x.sources || []).filter(s => s.key !== src.key)].slice(0, SOURCE_KEEP); };
  const upsert = (e, fromRelation = false) => {
    if (blocked.has(nameKey(e.name)) || (e.aliases || []).some(a => blocked.has(nameKey(a)))) return null;
    let x = findEntity(graph, e.name);
    for (const a of e.aliases || []) if (!x) x = findEntity(graph, a);
    if (!x) {
      x = {id: uid(), name: e.name, type: e.type || 'org', aliases: [], summary: '', mentions: 0, created: now, updated: now, sources: []};
      graph.entities.push(x); added.push(x);
    }
    if (!touched.has(x.id)) { x.mentions = (x.mentions || 0) + 1; touched.add(x.id); addSource(x); x.updated = now; }
    if (!fromRelation) {
      if (e.summary && !x.userEdited) x.summary = e.summary;
      if (!x.userEdited && e.type && (x.type === 'org' || x.mentions <= 1)) x.type = e.type;
      for (const a of [e.name, ...(e.aliases || [])]) if (nameKey(a) !== nameKey(x.name) && !x.aliases.some(b => nameKey(b) === nameKey(a)) && x.aliases.length < 8) x.aliases.push(a);
    }
    return x;
  };
  for (const e of entities) upsert(e);
  let relAdded = 0;
  for (const r of relations) {
    const a = findEntity(graph, r.from) || upsert({name: r.from}, true), b = findEntity(graph, r.to) || upsert({name: r.to}, true);
    if (!a || !b || a === b) continue;
    let rel = graph.relations.find(x => x.from === a.id && x.to === b.id && x.type === r.type);
    if (!rel) { rel = {id: uid(), from: a.id, to: b.id, type: r.type, mentions: 0, created: now}; graph.relations.push(rel); relAdded++; }
    rel.mentions++; rel.updated = now; rel.sources = [src.key, ...(rel.sources || []).filter(k => k !== src.key)].slice(0, 5);
  }
  prune(graph);
  return {added: added.filter(e => graph.entities.includes(e)), touched: touched.size, relations: relAdded};
}
export function prune(graph, {entityLimit = ENTITY_LIMIT, relationLimit = RELATION_LIMIT} = {}) {
  if (graph.entities.length > entityLimit) {
    const order = graph.entities.filter(e => !e.userEdited).sort((a, b) => (a.mentions || 0) - (b.mentions || 0) || (a.updated || 0) - (b.updated || 0));
    const drop = new Set(order.slice(0, graph.entities.length - entityLimit).map(e => e.id));
    graph.entities = graph.entities.filter(e => !drop.has(e.id));
  }
  const ids = new Set(graph.entities.map(e => e.id));
  graph.relations = graph.relations.filter(r => ids.has(r.from) && ids.has(r.to));
  if (graph.relations.length > relationLimit)
    graph.relations = graph.relations.sort((a, b) => (b.mentions || 0) - (a.mentions || 0) || (b.updated || 0) - (a.updated || 0)).slice(0, relationLimit);
}

/** Entities named in the query (name or alias of at least 2 characters), longest name first. */
export function selectEntities(graph, query, {limit = 8} = {}) {
  if (!graph?.entities?.length) return [];
  const q = nameKey(query);
  if (!q) return [];
  const hits = [];
  for (const e of graph.entities) {
    const names = [e.name, ...(e.aliases || [])].map(nameKey).filter(k => k.length >= 2);
    const m = names.filter(k => q.includes(k)).sort((a, b) => b.length - a.length)[0];
    if (m) hits.push({e, len: m.length});
  }
  return hits.sort((a, b) => b.len - a.len || (b.e.mentions || 0) - (a.e.mentions || 0)).slice(0, limit).map(h => h.e);
}
export function relationsOf(graph, id) {
  const byId = new Map(graph.entities.map(e => [e.id, e]));
  return graph.relations.filter(r => r.from === id || r.to === id).map(r => ({...r, fromName: byId.get(r.from)?.name || '?', toName: byId.get(r.to)?.name || '?', other: byId.get(r.from === id ? r.to : r.from)}))
    .sort((a, b) => (b.mentions || 0) - (a.mentions || 0));
}
export function graphBlock(selected, graph, {budget = 2500} = {}) {
  if (!selected?.length) return '';
  const lines = [];
  let size = 0;
  for (const e of selected) {
    const rels = relationsOf(graph, e.id).slice(0, 6).map(r => `${r.fromName} ${r.type} ${r.toName}`);
    const line = `- ${e.name}（${TYPE_LABEL[e.type] || '实体'}）${e.aliases?.length ? '，又称' + e.aliases.slice(0, 3).join('、') : ''}${e.summary ? '：' + e.summary : ''}${rels.length ? '。关系：' + rels.join('；') : ''}`;
    if (size + line.length > budget) break;
    lines.push(line); size += line.length;
  }
  return lines.length ? '\n知识图谱中与本轮相关的实体（从过往对话、文档和已连接的数据整理，可能不完整或过时；与用户本轮所说冲突时以本轮为准；不要逐条复述）：\n' + lines.join('\n') : '';
}

const REDACT = [/sk-[A-Za-z0-9_-]{6,}/g, /gh[pousr]_[A-Za-z0-9]{10,}/g, /github_pat_[A-Za-z0-9_]{10,}/g, /\b1[3-9]\d{9}\b/g, /\b\d{15,19}\b/g, /(密码|口令|验证码|授权码|password|passcode)\s*[:：是为]?\s*\S+/gi];
export const redact = text => REDACT.reduce((s, re) => s.replace(re, '[已隐藏]'), String(text || ''));

/** Sources that changed since they were last processed. Chats first (newest), then documents, then connector batches. */
export function pendingSources(data, {settings = graphSettings(data?.settings), maxChars = 12000} = {}) {
  const g = data?.graph || emptyGraph(), done = g.processed || {}, out = [];
  if (settings.chats) {
    for (const c of [...(data?.chats || [])].sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))) {
      const msgs = (c.messages || []).filter(m => (m.role === 'user' || m.role === 'assistant') && !m.intermediate && !m.streaming && typeof m.content === 'string' && m.content.trim());
      if (c.incognito || !c.finishedAt || !msgs.length || msgs.some(m => m.streaming)) continue;
      const key = 'chat:' + c.id, version = c.finishedAt;
      if ((done[key] || 0) >= version) continue;
      let text = '';
      for (const m of msgs.slice(-12)) text += `${m.role === 'user' ? '用户' : '助手'}：${m.content.slice(0, 1500)}\n`;
      out.push({key, kind: 'chat', title: c.name || '对话', version, text: text.slice(-maxChars)});
    }
  }
  if (settings.documents) {
    for (const d of data?.documents || []) {
      const key = 'doc:' + d.id, version = Number(d.revision) || d.time || 1;
      if ((done[key] || 0) >= version || typeof d.text !== 'string' || d.text.trim().length < 20) continue;
      out.push({key, kind: 'document', title: d.name || '文档', version, text: d.text.slice(0, maxChars)});
    }
  }
  if (settings.connectors) {
    for (const c of data?.connectors || []) {
      const key = 'conn:' + c.id, since = done[key] || 0;
      const items = (data?.connectorItems || []).filter(i => i.connectorId === c.id && (i.fetchedAt || 0) > since).slice(0, 40);
      if (!items.length) continue;
      const version = Math.max(...items.map(i => i.fetchedAt || 0));
      const text = items.map(i => `- ${i.title}${i.author ? `（${i.author}）` : ''}${i.location ? ` @${i.location}` : ''}${i.summary ? '：' + i.summary : ''}`).join('\n').slice(0, maxChars);
      out.push({key, kind: 'connector', title: c.name || '连接', version, text});
    }
  }
  return out;
}

export const GRAPH_PROMPT = '你负责为用户维护工作知识图谱。从给定内容中提取明确出现的具名实体及它们之间的关系，用于以后的对话。' +
  '实体类型 type 只能是 person（人物）/ org（公司、机构、部门）/ project（项目）/ product（产品、系统）/ event（会议、活动、事件）/ place（地点）。' +
  '只要具体名称（如「通威股份」「张三」「P3 连接器项目」），不要泛称（用户、客户、公司、团队）、不要抽象概念、不要用户本人。' +
  'summary 用一句不超过 60 字的中文，只写内容里能确认的事实；aliases 写内容里出现的简称或别名。' +
  '关系 type 用 2-6 个字的中文动词短语（如 任职于、负责、合作、客户是、参与、属于、竞争、供应），from 和 to 必须是实体名称。' +
  '不要记录密码、密钥、验证码、证件号、手机号等敏感信息。已知实体请沿用已知名称。没有可提取的就返回空数组。' +
  '只输出 JSON，例如 {"entities":[{"name":"通威股份","type":"org","summary":"光伏企业，用户的客户","aliases":["通威"]}],"relations":[{"from":"张三","to":"通威股份","type":"任职于"}]}，实体最多 15 个、关系最多 20 条。';
