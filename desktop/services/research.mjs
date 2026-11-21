// [F2] 投研文档 service (main process): company announcements (Eastmoney public announcement API, read-only), announcement
// key points and optional AI reading (M2), one-click stock research reports in Word / PowerPoint / HTML saved to 成果中心 (M1),
// the per-stock research library (M3) and briefing / portfolio-review / engine-report exports (M4).
// Numbers in reports come from the quant engine, the market service and announcement text; the model is only used to
// summarise an announcement or write the AI 研判 paragraph, and every report is still produced when no model is configured.
import { generateDocument } from '../runtime/documents.mjs';
import { appendWordImage } from '../runtime/word-image.mjs';
import { klineSvg } from '../src/shared/market.js';
import { opsMarks } from '../src/ui/market.js';
import { backtestReturns, returnSvg } from '../src/ui/quant.js';
import { parseNoticeList, parseNoticeContent, keyPoints, NOTICE_PROMPT, buildStockReport, reportToDocx, reportToPptx, reportToHtml, briefingReport, reviewReport, engineReport, normalizeNote, libraryItems, LIBRARY_LIMIT } from '../src/shared/research.js';

const LIST = 'https://np-anotice-stock.eastmoney.com/api/security/ann', BODY = 'https://np-cnotice-stock.eastmoney.com/api/content/ann';
const UA = {'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 QuanK', referer: 'https://data.eastmoney.com/'};
export const REPORT_FORMATS = ['docx', 'pptx', 'html'];
export const EXPORT_KINDS = {briefing: '每日简报', review: '组合复盘', quant_report: '量化引擎报告'};
export const WATCH_INTERVALS = [15, 30, 60, 120];
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const isCode = c => /^\d{6}$/.test(String(c || ''));
const cst = t => new Date(t + 8 * 3600e3);
const today = t => cst(t).toISOString().slice(0, 10);
const localTime = t => Number.isFinite(t) ? cst(t).toISOString().slice(5, 16).replace('T', ' ') : '';

export function createResearchService({store, documents, market = null, quant = null, fetcher = globalThis.fetch, ask = null, rasterize = null, notify = () => {}, onAlert = () => {}, now = Date.now, timeoutMs = 12000} = {}) {
  const cache = new Map(), bodies = new Map();
  let scanBusy = false;
  const st = () => {
    const r = (store.data.research ??= {});
    r.library ??= []; r.notices ??= {}; r.seen ??= []; r.seeded ??= {}; r.summaries ??= {};
    const w = r.watch || {};
    r.watch = {enabled: w.enabled !== false, interval: WATCH_INTERVALS.includes(w.interval) ? w.interval : 30, lastScan: Number(w.lastScan) || 0};
    return r;
  };
  async function getJson(url, ttl) {
    const hit = cache.get(url);
    if (hit && now() - hit.at < ttl) return hit.data;
    const r = await fetcher(url, {headers: UA, signal: AbortSignal.timeout(timeoutMs)});
    if (!r.ok) throw new Error(`公告服务暂时不可用（HTTP ${r.status}）`);
    let data; try { data = JSON.parse(await r.text()); } catch { throw new Error('公告服务返回了无法识别的内容'); }
    cache.set(url, {at: now(), data});
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return data;
  }
  const poolName = code => (store.data.quant?.pool || []).find(p => p.code === code)?.name || '';
  /** {code} or {query: 公司名称} -> {code, name}. Several matches throw the market service's error (with .choices). */
  async function resolve(p = {}) {
    const raw = String(p.code || p.query || '').trim();
    if (isCode(raw)) return {code: raw, name: clip(p.name, 20) || poolName(raw)};
    if (!raw) throw new Error('请提供公司名称或 6 位股票代码');
    if (!market) throw new Error('当前环境不能按名称查找股票，请给出 6 位代码');
    const r = await market.handle({action: 'resolve', query: raw});
    if (!isCode(r?.code)) throw new Error('没有找到这只股票');
    return {code: r.code, name: clip(r.name, 20) || poolName(r.code)};
  }

  // ---------- M2: announcements ----------
  function findNotice(id) {
    for (const v of Object.values(st().notices)) { const n = (v.list || []).find(x => x.id === id); if (n) return n; }
    return null;
  }
  async function notices(code, {fresh = false, limit = 20} = {}) {
    if (!isCode(code)) throw new Error('股票代码应为 6 位数字');
    const size = Math.min(50, Math.max(5, Number(limit) || 20));
    const list = parseNoticeList(await getJson(`${LIST}?sr=-1&page_size=${size}&page_index=1&ann_type=A&client_source=web&stock_list=${code}&f_node=0&s_node=0`, fresh ? 0 : 10 * 60e3), code);
    const r = st(), keep = new Map((r.notices[code]?.list || []).filter(n => n.points).map(n => [n.id, n.points]));
    r.notices[code] = {at: now(), list: list.slice(0, 30).map(n => keep.has(n.id) ? {...n, points: keep.get(n.id)} : n)};
    const codes = Object.keys(r.notices);
    if (codes.length > 60) for (const c of codes.sort((a, b) => r.notices[a].at - r.notices[b].at).slice(0, codes.length - 60)) delete r.notices[c];
    return r.notices[code].list;
  }
  async function notice(id, {ai = true} = {}) {
    id = String(id || '');
    if (!/^[A-Za-z0-9]{2,40}$/.test(id)) throw new Error('公告编号无效');
    let b = bodies.get(id);
    if (!b) {
      b = parseNoticeContent(await getJson(`${BODY}?art_code=${id}&client_source=web&page_index=1`, 3600e3));
      bodies.set(id, b); if (bodies.size > 40) bodies.delete(bodies.keys().next().value);
    }
    const r = st(), meta = findNotice(id) || {id, title: '', date: '', label: '公告', level: 'low', type: 'other'};
    const points = keyPoints(b.text, {max: 6});
    if (meta.code) { const entry = (r.notices[meta.code]?.list || []).find(n => n.id === id); if (entry) entry.points = points.slice(0, 4); }
    let summary = r.summaries[id] || '', aiError = '';
    if (ai && !summary && ask && b.text.length > 40) {
      try {
        summary = clip(await ask(NOTICE_PROMPT, `公告标题：${meta.title || '（未知）'}\n公告日期：${meta.date || '（未知）'}\n\n${b.text.slice(0, 12000)}`), 1500).replace(/ - /g, '\n- ');
        if (summary) { r.summaries[id] = summary; const keys = Object.keys(r.summaries); if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete r.summaries[k]; }
      } catch (e) { aiError = 'AI 解读暂不可用：' + clip(e?.message || e, 100); }
    } else if (ai && !ask) aiError = '未配置模型，只显示自动摘录的要点';
    await store.save?.(); notify();
    return {...meta, text: b.text.slice(0, 20000), truncated: b.text.length > 20000, points, summary, ...(aiError ? {aiError} : {}), pdf: b.pdf};
  }
  function emit(n, points) {
    const s = store.data, code = n.code;
    s.activity = [{id: 'rs-' + now().toString(36) + Math.random().toString(36).slice(2, 5), title: '公告提醒', detail: clip(`${n.name || poolName(code) || code}（${code}）${n.label}：${n.title}${points[0] ? ' —— ' + points[0] : ''}`, 400), code, time: now()}, ...(s.activity || [])].slice(0, 500);
    try { onAlert({title: `${n.label} · ${n.name || poolName(code) || code}`, detail: clip(n.title, 120), code, noticeId: n.id}); } catch {}
  }
  /** New important / notable announcements of one pool stock -> 动态 + system notification + library. The first scan of
   *  a stock only remembers what is already there (no flood of old announcements). */
  async function scanOne(code) {
    const r = st(), list = await notices(code, {fresh: true, limit: 20}), seen = new Set(r.seen);
    const fresh = list.filter(n => !seen.has(n.id));
    r.seen = [...fresh.map(n => n.id), ...r.seen].slice(0, 3000);
    if (!r.seeded[code]) { r.seeded[code] = now(); return 0; }
    let hits = 0;
    for (const n of fresh.filter(n => n.level !== 'low').slice(0, 5)) {
      const age = n.date ? now() - Date.parse(n.date + 'T00:00:00+08:00') : 0;
      if (age > 4 * 86400e3) continue;
      let points = [];
      try { points = (await notice(n.id, {ai: false})).points.slice(0, 3); } catch {}
      emit(n, points);
      addItem({kind: 'notice', code, name: n.name || poolName(code), title: n.title, summary: points[0] || n.label, noticeId: n.id, date: n.date, tags: [n.label]});
      hits++;
    }
    return hits;
  }

  // ---------- M3: library ----------
  function addItem(x) {
    const r = st(), it = {id: 'rs-' + now().toString(36) + Math.random().toString(36).slice(2, 6), time: now(), kind: x.kind, code: isCode(x.code) ? x.code : '', name: clip(x.name, 20), title: clip(x.title, 120), summary: clip(x.summary, 300),
      ...(x.documentId ? {documentId: String(x.documentId), format: x.format} : {}), ...(x.noticeId ? {noticeId: x.noticeId, date: x.date || ''} : {}), ...(x.text ? {text: x.text} : {}), tags: (x.tags || []).map(t => clip(t, 20)).filter(Boolean).slice(0, 6)};
    r.library = [it, ...r.library.filter(y => !(x.noticeId && y.noticeId === x.noticeId) && !(x.documentId && y.documentId === x.documentId && y.code === it.code))].slice(0, LIBRARY_LIMIT);
    return it;
  }
  const findItem = id => { const it = st().library.find(x => x.id === id); if (!it) throw new Error('资料不存在，请先查看资料库列表'); return it; };
  const docRecord = id => (store.data.documents || []).find(d => d.id === id);
  async function read(id) {
    const it = findItem(String(id || ''));
    if (it.kind === 'note') return {...it};
    if (it.kind === 'notice') { const n = await notice(it.noticeId, {ai: false}); return {...it, text: n.text.slice(0, 12000), points: n.points, summary: n.summary || it.summary, pdf: n.pdf}; }
    const d = it.documentId && docRecord(it.documentId);
    if (!d) return {...it, missing: true, text: '', note: '对应的文档已从成果中心删除'};
    return {...it, documentName: `${d.name}.${d.format}`, text: String(d.text || '').slice(0, 12000), truncated: String(d.text || '').length > 12000};
  }

  // ---------- M1 / M4: documents ----------
  const CHART_NAMES = {kline: '图 1：日 K 线与回测买卖点（红 B 买入 / 绿 S 卖出）', returns: '图 2：回测收益率，智能定投 vs 普通定投'};
  async function render(spec, format, svgs = {}) {
    let bytes;
    if (format === 'html') bytes = Buffer.from(reportToHtml(spec, {charts: svgs}), 'utf8');
    else if (format === 'pptx') bytes = (await generateDocument('pptx', reportToPptx(spec))).bytes;
    else {
      const pngs = [];
      if (rasterize) for (const [k, svg] of Object.entries(svgs)) { try { const png = await rasterize(svg, {width: 960, height: k === 'kline' ? 460 : 300}); if (png?.length >= 24) pngs.push([CHART_NAMES[k] || k, Buffer.from(png)]); } catch {} }
      bytes = (await generateDocument('docx', reportToDocx(spec, {charts: pngs.map(x => x[0])}))).bytes;
      for (const [, png] of pngs) { try { bytes = appendWordImage(bytes, png).bytes; } catch {} }
    }
    const name = clip(`${spec.title}${spec.date && !spec.title.includes(spec.date) ? ' ' + spec.date : ''}`.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' '), 90);
    const r = await documents.importFile(name, format, Buffer.from(bytes));
    const d = r?.document || r;
    return {id: d.id, name: d.name, format};
  }
  const settle = async f => { try { return await f(); } catch (e) { return {__error: clip(e?.message || e, 140)}; } };
  const ok = x => x && !x.__error ? x : null;
  async function report(p = {}) {
    const {code, name: n0} = await resolve(p), format = REPORT_FORMATS.includes(p.format) ? p.format : 'docx';
    const [sig, k, ns] = await Promise.all([
      quant ? settle(() => quant.handle({action: 'signal', code})) : null,
      market ? settle(() => market.handle({action: 'kline', code, period: 'day', count: 320})) : null,
      settle(() => notices(code))]);
    const signal = ok(sig), list = Array.isArray(ns) ? ns : [];
    let kl = ok(k);
    if (!kl && market) { const q = await settle(() => market.handle({action: 'quotes', codes: [code]})); const quote = ok(q)?.quotes?.[0]; if (quote && quote.price != null) kl = {name: quote.name, quote, bars: []}; } // [F2] K lines down: still show the live quote
    for (const n of list.filter(x => x.level !== 'low' && !x.points).slice(0, 3)) { try { n.points = (await notice(n.id, {ai: false})).points.slice(0, 4); } catch {} }
    let insight = '';
    if (p.ai !== false && quant && signal) { const r = await settle(() => quant.handle({action: 'insight', code})); if (ok(r) && r.available !== false && r.text) insight = String(r.text); }
    const name = n0 || signal?.summary?.name || kl?.name || list[0]?.name || code;
    const rt = signal?.charts?.curve ? backtestReturns(signal.charts.curve) : null;
    const spec = buildStockReport({code, name, date: today(now()), quote: kl?.quote || null, bars: kl?.bars || [], signal: signal?.summary || null, returns: rt?.rows?.at(-1) || null, holding: signal?.holding || null, notices: list, insight});
    const svgs = {};
    if (kl?.bars?.length > 1) svgs.kline = klineSvg(kl.bars, {w: 960, h: 460, last: 120, marks: opsMarks(signal?.charts?.ops)});
    if (rt?.rows?.length > 1) svgs.returns = returnSvg(rt.rows, {labels: rt.labels, w: 960, h: 300});
    const doc = await render(spec, format, svgs);
    const item = addItem({kind: 'report', code, name, title: spec.title, summary: spec.summary, documentId: doc.id, format, tags: [format === 'docx' ? 'Word' : format === 'pptx' ? 'PPT' : '网页']});
    await store.save?.(); notify();
    return {document: doc, item, summary: spec.summary, sections: spec.sections.map(s => s.title), gaps: spec.gaps,
      warnings: [sig?.__error && '量化信号：' + sig.__error, k?.__error && '行情：' + k.__error, ns?.__error && '公告：' + ns.__error].filter(Boolean)};
  }
  async function exportDoc(p = {}) {
    const kind = String(p.kind || ''), format = REPORT_FORMATS.includes(p.format) ? p.format : 'docx';
    let spec;
    if (kind === 'briefing') spec = briefingReport((store.data.briefings || [])[0]);
    else if (kind === 'quant_report') {
      if (!quant) throw new Error('当前环境没有量化引擎');
      const id = String(p.id || '') || (quant.view?.().reportDefs || [])[0]?.id;
      if (!id) throw new Error('量化引擎没有可导出的报告');
      spec = engineReport(await quant.handle({action: 'report', id}));
    } else if (kind === 'review') {
      const [ov, hs] = await Promise.all([market ? settle(() => market.handle({action: 'overview'})) : null, quant ? settle(() => quant.handle({action: 'holdings'})) : null]);
      const qv = quant?.view?.() || store.data.quant || {}, pool = qv.pool || [];
      const holdings = ok(hs)?.holdings || Object.entries(qv.holdings || {}).map(([code, h]) => ({code, ...h}));
      const all = Object.values(st().notices).flatMap(v => v.list || []).filter(n => pool.some(x => x.code === n.code)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      spec = reviewReport({date: today(now()), overview: ok(ov), pool, holdings: holdings.filter(h => !h.error), alerts: (qv.alerts || []).map(a => ({...a, timeText: localTime(a.time)})), notices: all});
    } else throw new Error('导出类型应为 briefing（每日简报）/ review（组合复盘）/ quant_report（量化引擎报告）');
    const doc = await render(spec, format, {});
    const item = addItem({kind: 'export', title: spec.title, summary: spec.summary, documentId: doc.id, format, tags: [EXPORT_KINDS[kind]]});
    await store.save?.(); notify();
    return {document: doc, item, sections: spec.sections.map(s => s.title)};
  }

  function view() {
    const r = st();
    return {library: r.library.slice(0, 300).map(({text, ...x}) => text ? {...x, preview: clip(text, 160)} : x),
      notices: Object.fromEntries(Object.entries(r.notices).map(([c, v]) => [c, {at: v.at, list: (v.list || []).slice(0, 20)}])), watch: r.watch};
  }
  return {
    view,
    /** Main-process timer: during 07:00–23:00 on weekdays, every `interval` minutes, check the pool's announcements. */
    async tick() {
      const r = st(), w = r.watch, t = now(), d = cst(t), day = d.getUTCDay(), h = d.getUTCHours();
      if (!w.enabled || scanBusy || day === 0 || day === 6 || h < 7 || h >= 23 || t - w.lastScan < w.interval * 60e3) return;
      const pool = (store.data.quant?.pool || []).map(p => p.code).filter(isCode).slice(0, 30);
      if (!pool.length) return;
      scanBusy = true; r.watch.lastScan = t;
      let hits = 0;
      try { for (const code of pool) { try { hits += await scanOne(code); } catch {} } await store.save?.(); notify(); } finally { scanBusy = false; }
      return {checked: pool.length, hits};
    },
    async handle(p = {}) {
      const a = p.action;
      if (a === 'view') return view();
      if (a === 'notices') {
        const {code, name} = await resolve(p), list = await notices(code, {fresh: p.fresh === true, limit: p.limit});
        if (!st().seeded[code]) { const r = st(); r.seen = [...list.map(n => n.id), ...r.seen].slice(0, 3000); r.seeded[code] = now(); }
        await store.save?.(); notify();
        return {code, name: name || list[0]?.name || '', notices: list};
      }
      if (a === 'notice') return notice(p.id, {ai: p.ai !== false});
      if (a === 'saveNotice') {
        const n = await notice(p.id, {ai: false});
        const it = addItem({kind: 'notice', code: n.code, name: n.name, title: n.title || '公告', summary: n.summary ? clip(n.summary, 300) : n.points[0] || n.label, noticeId: n.id, date: n.date, tags: [n.label]});
        await store.save?.(); notify(); return {item: it};
      }
      if (a === 'report') return report(p);
      if (a === 'export') return exportDoc(p);
      if (a === 'library') {
        const items = libraryItems(st().library, {code: isCode(p.code) ? p.code : '', kind: p.kind, query: p.query, limit: p.limit || 50});
        return {items: items.map(({text, ...x}) => text ? {...x, preview: clip(text, 200)} : x), total: st().library.length};
      }
      if (a === 'read') return read(p.id);
      if (a === 'note') {
        const note = normalizeNote(p), who = p.code || p.query ? await resolve(p) : {code: '', name: ''};
        const it = addItem({kind: 'note', code: who.code, name: who.name, title: note.title, summary: clip(note.text, 300), text: note.text, tags: p.tags || []});
        await store.save?.(); notify(); return {item: it};
      }
      if (a === 'link') {
        const d = docRecord(String(p.documentId || ''));
        if (!d) throw new Error('成果中心里没有这份文档');
        const who = p.code || p.query ? await resolve(p) : {code: '', name: ''};
        const it = addItem({kind: 'doc', code: who.code, name: who.name, title: `${d.name}.${d.format}`, summary: clip(d.text, 300), documentId: d.id, format: d.format, tags: p.tags || []});
        await store.save?.(); notify(); return {item: it};
      }
      if (a === 'remove') {
        const it = findItem(String(p.id || '')), r = st();
        r.library = r.library.filter(x => x.id !== it.id);
        await store.save?.(); notify(); return {removed: it.id};
      }
      if (a === 'watch') {
        const r = st();
        if (typeof p.enabled === 'boolean') r.watch.enabled = p.enabled;
        if (p.interval !== undefined) { if (!WATCH_INTERVALS.includes(Number(p.interval))) throw new Error('检查间隔可选 15 / 30 / 60 / 120 分钟'); r.watch.interval = Number(p.interval); }
        await store.save?.(); notify();
        return {watch: r.watch, text: describeNoticeWatch(r.watch)};
      }
      throw new Error('未知的投研操作');
    },
  };
}
export const describeNoticeWatch = w => w?.enabled === false ? '公告提醒已关闭' : `工作日 7:00–23:00 每 ${w?.interval || 30} 分钟检查股票池公告，重要公告进入「动态」并发系统通知`;
