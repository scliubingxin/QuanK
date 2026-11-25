// [F3] 投研知识库 service (main process).
// M1 search: a local BM25 index over the research library (reports, announcements, notes, linked documents, exports),
//    cached financial summaries and topic news, rebuilt when the library changes; every hit carries its source.
// M2 company graph: Eastmoney F10 profile + top-10 holders (datacenter host, public, read-only), built-in chain map,
//    same-industry pool peers and pledge announcements.
// M3 financial database: Eastmoney F10 main indicators per report period, kept on this Mac (30 periods per stock).
// M4 research topics: keyword topics collecting announcements, library hits and public news; weekly digest documents.
import { createHash } from 'node:crypto';
import { buildIndex, searchIndex, parseFinance, financeSummary, financeTable, financeSvg, quarterly, parseProfile, parseHolders, companyGraph, graphSvg, normalizeTopic, topicMatches, nextDigestAt, topicDigest, FINANCE_COLUMNS, secuCode, TOPIC_LIMIT } from '../src/shared/knowledge.js';

const DC = 'https://datacenter.eastmoney.com/securities/api/data/v1/get';
const UA = {'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 QuankSight', referer: 'https://emweb.securities.eastmoney.com/'};
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const isCode = c => /^\d{6}$/.test(String(c || ''));
const day = t => new Date(t + 8 * 3600e3).toISOString().slice(0, 10);
const sig = x => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);
const dc = (report, columns, code, {size = 30, sort = 'REPORT_DATE', order = '-1'} = {}) => `${DC}?reportName=${report}&columns=${columns}&filter=(SECUCODE%3D%22${encodeURIComponent(secuCode(code))}%22)&pageNumber=1&pageSize=${size}&sortTypes=${order}&sortColumns=${sort}`;

export function createKnowledgeService({store, research = null, market = null, web = null, fetcher = globalThis.fetch, notify = () => {}, onAlert = () => {}, now = Date.now, timeoutMs = 12000} = {}) {
  const cache = new Map();
  let index = null, indexSig = '', digestBusy = false;
  const st = () => {
    const k = (store.data.knowledge ??= {});
    k.finance ??= {}; k.profiles ??= {}; k.topics ??= []; k.news ??= {};
    return k;
  };
  async function getJson(url, ttl) {
    const hit = cache.get(url);
    if (hit && now() - hit.at < ttl) return hit.data;
    const r = await fetcher(url, {headers: UA, signal: AbortSignal.timeout(timeoutMs)});
    if (!r.ok) throw new Error(`数据服务暂时不可用（HTTP ${r.status}）`);
    let data; try { data = JSON.parse(await r.text()); } catch { throw new Error('数据服务返回了无法识别的内容'); }
    cache.set(url, {at: now(), data}); if (cache.size > 200) cache.delete(cache.keys().next().value);
    return data;
  }
  const pool = () => (store.data.quant?.pool || []).filter(p => isCode(p.code));
  const nameOf = code => pool().find(p => p.code === code)?.name || st().finance[code]?.name || st().profiles[code]?.profile?.name || '';
  async function resolve(p = {}) {
    const raw = String(p.code || p.query || '').trim();
    if (isCode(raw)) return {code: raw, name: nameOf(raw)};
    if (!raw) throw new Error('请提供公司名称或 6 位股票代码');
    if (!market) throw new Error('当前环境不能按名称查找股票，请给出 6 位代码');
    const r = await market.handle({action: 'resolve', query: raw});
    if (!isCode(r?.code)) throw new Error('没有找到这只股票');
    return {code: r.code, name: clip(r.name, 20) || nameOf(r.code)};
  }

  // ---------- M3 ----------
  async function finance(code, {fresh = false} = {}) {
    if (!isCode(code)) throw new Error('股票代码应为 6 位数字');
    const k = st(), hit = k.finance[code];
    if (!fresh && hit && now() - hit.at < 12 * 3600e3) return hit;
    const rows = parseFinance(await getJson(dc('RPT_F10_FINANCE_MAINFINADATA', FINANCE_COLUMNS, code, {size: 30}), fresh ? 0 : 3600e3));
    k.finance[code] = {at: now(), code, name: rows.at(-1).name || nameOf(code), rows: rows.slice(-30)};
    const codes = Object.keys(k.finance); if (codes.length > 80) for (const c of codes.sort((a, b) => k.finance[a].at - k.finance[b].at).slice(0, codes.length - 80)) delete k.finance[c];
    await store.save?.(); notify();
    return k.finance[code];
  }
  const financeView = f => ({code: f.code, name: f.name, at: f.at, summary: financeSummary(f.rows, {name: f.name}), table: financeTable(f.rows, 8), quarters: quarterly(f.rows).slice(-8), latest: f.rows.at(-1), svg: financeSvg(f.rows)});
  /** For research reports: {table, lines, svg}. */
  async function forReport(code) { const f = await finance(code); const s = financeSummary(f.rows, {name: f.name}); return {table: financeTable(f.rows, 6), lines: s?.lines || [], svg: financeSvg(f.rows)}; }

  // ---------- M2 ----------
  async function profile(code, {fresh = false} = {}) {
    const k = st(), hit = k.profiles[code];
    if (!fresh && hit && now() - hit.at < 7 * 86400e3) return hit;
    const [pf, hd] = await Promise.allSettled([
      getJson(dc('RPT_F10_BASIC_ORGINFO', 'SECUCODE,SECURITY_NAME_ABBR,ORG_NAME,EM2016,INDUSTRYCSRC1,PROVINCE,MAIN_BUSINESS,ACTUAL_HOLDER,PRESIDENT,FOUND_DATE', code, {size: 1, sort: 'SECUCODE', order: '1'}), 86400e3).then(parseProfile),
      getJson(dc('RPT_F10_EH_HOLDERS', 'SECUCODE,END_DATE,HOLDER_NAME,HOLDER_RANK,HOLD_NUM,HOLD_NUM_RATIO', code, {size: 10, sort: 'END_DATE,HOLDER_RANK', order: '-1,1'}), 86400e3).then(parseHolders)]);
    if (pf.status === 'rejected' && hd.status === 'rejected') { if (hit) return hit; throw pf.reason; }
    k.profiles[code] = {at: now(), profile: pf.status === 'fulfilled' ? pf.value : hit?.profile || null, holders: hd.status === 'fulfilled' ? hd.value : hit?.holders || null};
    const codes = Object.keys(k.profiles); if (codes.length > 80) for (const c of codes.sort((a, b) => k.profiles[a].at - k.profiles[b].at).slice(0, codes.length - 80)) delete k.profiles[c];
    await store.save?.(); notify();
    return k.profiles[code];
  }
  async function graph(code, {fresh = false} = {}) {
    const p = await profile(code, {fresh}), k = st();
    // peers: other pool stocks whose profile is known (fetch missing ones, at most 6, quietly)
    const others = pool().filter(x => x.code !== code).slice(0, 20);
    for (const x of others.filter(x => !k.profiles[x.code]).slice(0, 6)) { try { await profile(x.code); } catch {} }
    const peers = others.map(x => ({code: x.code, name: x.name, industry: k.profiles[x.code]?.profile?.industry || ''})).filter(x => x.industry);
    const notices = store.data.research?.notices?.[code]?.list || [];
    const g = companyGraph({code, profile: p.profile, holders: p.holders, peers, notices});
    return {...g, profile: p.profile, holders: p.holders, svg: graphSvg(g)};
  }

  // ---------- M1 ----------
  function corpus() {
    const r = store.data.research || {}, docs = [], docText = id => String((store.data.documents || []).find(d => d.id === id)?.text || '');
    for (const it of r.library || []) {
      let text = '';
      if (it.kind === 'note') text = it.text || it.summary || '';
      else if (it.kind === 'notice') text = [it.title, (r.notices?.[it.code]?.list || []).find(n => n.id === it.noticeId)?.points?.join('\n'), r.summaries?.[it.noticeId], it.summary].filter(Boolean).join('\n');
      else if (it.documentId) text = docText(it.documentId) || it.summary || '';
      if (text.trim()) docs.push({id: it.id, kind: it.kind, code: it.code, name: it.name, title: it.title, date: it.date || day(it.time || now()), text, documentId: it.documentId, noticeId: it.noticeId});
    }
    // announcements seen in the notice lists (titles + key points) that were not saved to the library
    const saved = new Set((r.library || []).map(x => x.noticeId).filter(Boolean));
    for (const [code, v] of Object.entries(r.notices || {})) for (const n of (v.list || []).slice(0, 20)) if (!saved.has(n.id)) docs.push({id: 'n:' + n.id, kind: 'notice', code, name: n.name, title: n.title, date: n.date, text: [n.title, n.label, ...(n.points || []), r.summaries?.[n.id] || ''].filter(Boolean).join('\n'), noticeId: n.id});
    for (const f of Object.values(st().finance)) { const s = financeSummary(f.rows, {name: f.name}); if (s) docs.push({id: 'f:' + f.code, kind: 'finance', code: f.code, name: f.name, title: `${f.name} 财务摘要（${s.date.slice(0, 4)} ${s.type}）`, date: s.date, text: s.lines.join('\n')}); }
    for (const [tid, list] of Object.entries(st().news)) for (const n of (list || []).slice(0, 40)) docs.push({id: 'w:' + sig(n.url), kind: 'news', code: '', name: '', title: n.title, date: n.date || '', text: `${n.title}\n${n.snippet || ''}`, url: n.url, topic: tid});
    return docs;
  }
  function ensureIndex() {
    const docs = corpus(), s = sig(docs.map(d => [d.id, d.text.length, d.title]));
    if (!index || s !== indexSig) { index = buildIndex(docs, {now: now()}); indexSig = s; for (const d of docs) if (index.docs[d.id]) Object.assign(index.docs[d.id], {documentId: d.documentId, noticeId: d.noticeId}); }
    return index;
  }
  function search(p = {}) {
    const q = String(p.query || '').trim();
    if (q.length < 2 || q.length > 200) throw new Error('检索词需要 2–200 个字');
    const ix = ensureIndex(), r = searchIndex(ix, q, {code: isCode(p.code) ? p.code : '', kind: p.kind || '', limit: Math.min(12, Number(p.limit) || 8)});
    return {...r, hits: r.hits.map(h => ({...h, documentId: ix.docs[h.id]?.documentId, noticeId: ix.docs[h.id]?.noticeId})), indexed: {documents: Object.keys(ix.docs).length, passages: ix.n}};
  }

  // ---------- M4 ----------
  const findTopic = id => { const t = st().topics.find(x => x.id === id); if (!t) throw new Error('主题不存在，请先查看主题列表'); return t; };
  async function collect(t, {since = 0, news = true} = {}) {
    const items = [], sinceDay = since ? day(since) : '';
    const codes = t.codes.length ? t.codes : pool().map(p => p.code).slice(0, 30);
    if (research) for (const c of t.codes.slice(0, 10)) { try { await research.handle({action: 'notices', code: c}); } catch {} }
    for (const c of codes) for (const n of (store.data.research?.notices?.[c]?.list || [])) {
      if (sinceDay && n.date < sinceDay) continue;
      const m = topicMatches(t, `${n.title} ${(n.points || []).join(' ')}`);
      if (m.length || t.codes.includes(c) && n.level !== 'low') items.push({kind: 'notice', date: n.date, code: c, name: n.name || nameOf(c), title: n.title, excerpt: (n.points || [])[0] || '', matched: m, noticeId: n.id});
    }
    if (news && web) {
      const list = [];
      for (const k of t.keywords.slice(0, 3)) { try { for (const x of await web.search(`${k} ${t.name}`.slice(0, 60), {limit: 6})) if (!list.some(y => y.url === x.url)) list.push({title: x.title, url: x.url, snippet: x.snippet, date: day(now())}); } catch {} }
      if (list.length) st().news[t.id] = [...list, ...(st().news[t.id] || []).filter(o => !list.some(x => x.url === o.url))].slice(0, 60);
      for (const n of list) items.push({kind: 'news', date: n.date, title: n.title, excerpt: n.snippet, url: n.url, matched: topicMatches(t, `${n.title} ${n.snippet}`)});
    }
    const seen = new Set(items.map(x => x.noticeId).filter(Boolean));
    for (const k of t.keywords.slice(0, 6)) { try { for (const h of search({query: k, limit: 6}).hits) if (h.kind !== 'news' && !(h.kind === 'notice' && seen.has(h.noticeId))) { if (h.noticeId) seen.add(h.noticeId); if (!items.some(x => x.libId === h.id)) items.push({kind: h.kind, date: h.date, code: h.code, name: h.name, title: h.title, excerpt: h.excerpt, matched: [k], libId: h.id}); } } catch {} }
    items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return items.slice(0, 60);
  }
  async function digest(id, {format = 'docx', auto = false} = {}) {
    const t = findTopic(id), since = t.lastDigest || now() - 7 * 86400e3, items = await collect(t, {since});
    const spec = topicDigest(t, items, {date: day(now()), since: day(since)});
    if (!research) throw new Error('当前环境不能生成文档');
    const {document: doc} = await research.handle({action: 'render', spec, format});
    await research.handle({action: 'archive', kind: 'export', title: spec.title, summary: spec.summary, documentId: doc.id, format, tags: ['主题周报', t.name]});
    t.lastDigest = now(); t.nextAt = t.enabled ? nextDigestAt(t, now()) : null; t.lastCount = items.length; delete t.error;
    if (auto) { store.data.activity = [{id: 'kn-' + now().toString(36), title: '主题周报', detail: clip(`${t.name}：本期 ${items.length} 条相关动态，已保存到成果中心`, 200), time: now()}, ...(store.data.activity || [])].slice(0, 500); try { onAlert({title: `主题周报 · ${t.name}`, detail: `本期 ${items.length} 条相关动态`, documentId: doc.id}); } catch {} }
    await store.save?.(); notify();
    return {document: doc, count: items.length, sections: spec.sections.map(s => s.title)};
  }

  function view() {
    const k = st();
    return {topics: k.topics.map(t => ({...t})), finance: Object.fromEntries(Object.entries(k.finance).map(([c, f]) => [c, {at: f.at, name: f.name, latest: f.rows.at(-1)}])),
      profiles: Object.fromEntries(Object.entries(k.profiles).map(([c, p]) => [c, {at: p.at, industry: p.profile?.industry || '', controller: p.profile?.controller || ''}])), indexed: index ? {documents: Object.keys(index.docs).length, passages: index.n, built: index.built} : null};
  }
  return {
    view, forReport,
    async tick() {
      if (digestBusy) return;
      const due = st().topics.find(t => t.enabled && t.nextAt && t.nextAt <= now());
      if (!due) return;
      digestBusy = true;
      try { await digest(due.id, {auto: true}); } catch (e) { due.nextAt = now() + 3600e3; due.error = clip(e?.message || e, 160); await store.save?.(); } finally { digestBusy = false; }
    },
    async handle(p = {}) {
      const a = p.action;
      if (a === 'view') return view();
      if (a === 'search') return search(p);
      if (a === 'finance') { const {code} = await resolve(p); return financeView(await finance(code, {fresh: p.fresh === true})); }
      if (a === 'compare') {
        const list = Array.isArray(p.codes) ? p.codes : String(p.codes || p.query || '').split(/[,，、;；\s]+/).filter(Boolean);
        if (list.length < 2) throw new Error('请给出至少两只股票');
        const out = [];
        for (const q of list.slice(0, 6)) { const {code} = await resolve({query: q}); const f = await finance(code); out.push({code, name: f.name, latest: f.rows.at(-1)}); }
        return {items: out};
      }
      if (a === 'profile' || a === 'graph') { const {code} = await resolve(p); return a === 'graph' ? graph(code, {fresh: p.fresh === true}) : profile(code, {fresh: p.fresh === true}); }
      if (a === 'topics') return {topics: st().topics};
      if (a === 'topicSave') {
        const k = st(), t0 = p.id ? findTopic(p.id) : null, t = normalizeTopic(p);
        if (!t0 && k.topics.length >= TOPIC_LIMIT) throw new Error(`主题最多 ${TOPIC_LIMIT} 个`);
        const next = {...(t0 || {id: 'tp-' + now().toString(36) + Math.random().toString(36).slice(2, 6), created: now()}), ...t};
        next.nextAt = next.enabled ? nextDigestAt(next, now()) : null;
        k.topics = t0 ? k.topics.map(x => x.id === t0.id ? next : x) : [next, ...k.topics];
        await store.save?.(); notify(); return {topic: next};
      }
      if (a === 'topicRemove') { const t = findTopic(p.id), k = st(); k.topics = k.topics.filter(x => x.id !== t.id); delete k.news[t.id]; await store.save?.(); notify(); return {removed: t.id}; }
      if (a === 'topicCollect') { const t = findTopic(p.id); return {topic: t, items: await collect(t, {news: p.news !== false})}; }
      if (a === 'topicDigest') return digest(p.id, {format: ['docx', 'pptx', 'html'].includes(p.format) ? p.format : 'docx'});
      throw new Error('未知的知识库操作');
    },
  };
}
