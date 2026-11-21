// [F1] Market data service: indices, gainers / losers, sector heat map, limit-up/down counts, quotes, K lines,
// intraday trends (Eastmoney public quote API, no key, read-only), plus watchlist live quotes and price alerts (M3).
import { resolveStock } from './stock-lookup.mjs';
import { INDICES, PERIODS, secid, session, sma, macd, kdj, quoteFromBars } from '../src/shared/market.js';

const H = 'https://push2.eastmoney.com/api/qt/', HIS = 'https://push2his.eastmoney.com/api/qt/', EX = 'https://push2ex.eastmoney.com/';
const FS_A = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048';
const UA = {'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 QuanK', referer: 'https://quote.eastmoney.com/'};
const POOL_UT = '7eea3edcaed734bea9cbfc24409ed989';
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
/** '-' / '' / null -> null; numbers stay numbers. */
export const val = v => v === null || v === undefined || v === '' || v === '-' || !Number.isFinite(Number(v)) ? null : Number(v);
const r2 = v => v === null ? null : Math.round(v * 100) / 100;
const cstDate = (now, sep = '') => new Date(now + 8 * 3600e3).toISOString().slice(0, 10).replace(/-/g, sep);
const isBJ = c => /^(4|8|92)/.test(String(c || ''));
export function limitPct(code, name = '') {
  const c = String(code || '');
  if (/ST/i.test(name)) return 5;
  if (isBJ(c)) return 30;
  return /^(30|68)/.test(c) ? 20 : 10;
}

// ---------- parsers (exported for tests) ----------
export function listOf(json) {
  if (!json || json.rc !== 0) throw new Error(`行情服务返回异常（rc=${json?.rc ?? '?'}）`);
  return Array.isArray(json.data?.diff) ? json.data.diff : [];
}
export const parseQuote = x => ({code: clip(x.f12, 12), market: val(x.f13), name: clip(x.f14, 30), price: val(x.f2), pct: val(x.f3), change: val(x.f4), volume: val(x.f5), amount: val(x.f6),
  turnover: val(x.f8), high: val(x.f15), low: val(x.f16), open: val(x.f17), preClose: val(x.f18), up: val(x.f104), down: val(x.f105), flat: val(x.f106)});
/** stock/get (fltt=2) single-security quote -> the same shape as parseQuote. Used when ulist.np is throttled. */
export const parseStockGet = d => d ? {code: clip(d.f57, 12), market: val(d.f107), name: clip(d.f58, 30), price: val(d.f43), pct: val(d.f170), change: val(d.f169), volume: val(d.f47), amount: val(d.f48),
  turnover: val(d.f168), high: val(d.f44), low: val(d.f45), open: val(d.f46), preClose: val(d.f60), up: val(d.f113), down: val(d.f114), flat: val(d.f115)} : null;
export const parseSector = x => ({code: clip(x.f12, 12), name: clip(x.f14, 30), price: val(x.f2), pct: val(x.f3), amount: val(x.f6), up: val(x.f104), down: val(x.f105),
  leader: x.f128 ? {name: clip(x.f128, 20), code: clip(x.f140, 12), pct: r2(val(x.f136))} : null});
/** klines rows "date,open,close,high,low,volume,amount[,amplitude,pct,change,turnover]" -> bars (column count varies). */
export function parseKlines(json) {
  if (!json || json.rc !== 0 || !json.data) throw new Error('没有取到 K 线数据');
  const d = json.data, bars = [];
  for (const row of d.klines || []) {
    const c = String(row).split(',');
    if (c.length < 6) continue;
    const b = {date: c[0], open: val(c[1]), close: val(c[2]), high: val(c[3]), low: val(c[4]), volume: val(c[5]), amount: val(c[6])};
    if (c.length >= 11) Object.assign(b, {amp: val(c[7]), pct: val(c[8]), change: val(c[9]), turnover: val(c[10])});
    if (b.open !== null && b.close !== null && b.high !== null && b.low !== null) bars.push(b);
  }
  for (let i = 0; i < bars.length; i++) if (bars[i].pct === undefined || bars[i].pct === null) bars[i].pct = i ? r2((bars[i].close / bars[i - 1].close - 1) * 100) : (val(d.preKPrice) ? r2((bars[i].close / val(d.preKPrice) - 1) * 100) : null);
  return {code: clip(d.code, 12), name: clip(d.name, 30), preKPrice: val(d.preKPrice), bars};
}
/** trends rows "time,open,close,high,low,volume,amount,avg" -> points; price = close column. */
export function parseTrends(json) {
  if (!json || json.rc !== 0 || !json.data) throw new Error('没有取到分时数据');
  const d = json.data, points = [];
  for (const row of d.trends || []) {
    const c = String(row).split(',');
    const p = {time: c[0], price: val(c[2]), volume: val(c[5]), amount: val(c[6]), avg: val(c[7])};
    if (p.price !== null) points.push(p);
  }
  return {code: clip(d.code, 12), name: clip(d.name, 30), preClose: val(d.preClose), points};
}
/** Limit-up / limit-down pools: total and the trading day the API actually answered for (it falls back on weekends). */
export const parsePool = json => ({total: val(json?.data?.tc) ?? 0, date: String(json?.data?.qdate || '')});

export function createMarketService({store, fetcher = globalThis.fetch, lookup = null, now = Date.now, notify = () => {}, onAlert = () => {}, timeoutMs = 10000} = {}) {
  const cache = new Map(), inflight = new Map();
  const st = () => {
    const m = (store.data.market ??= {});
    m.alerts ??= []; m.quotes ??= {}; m.fired ??= {}; m.settings ??= {moves: true, movePct: 5, limits: true};
    return m;
  };
  let overview = null, lastTick = 0, tickBusy = false, wantedAt = 0, ovBusy = false;
  async function getJson(url, ttl) {
    const hit = cache.get(url);
    if (hit && now() - hit.at < ttl) return hit.data;
    if (inflight.has(url)) return inflight.get(url);
    const p = (async () => {
      const r = await fetcher(url, {headers: UA, signal: AbortSignal.timeout(timeoutMs)});
      if (!r.ok) throw new Error(`行情服务暂时不可用（HTTP ${r.status}）`);
      let data; try { data = JSON.parse(await r.text()); } catch { throw new Error('行情服务返回了无法识别的内容'); }
      cache.set(url, {at: now(), data});
      if (cache.size > 300) cache.delete(cache.keys().next().value);
      return data;
    })().finally(() => inflight.delete(url));
    inflight.set(url, p);
    return p;
  }
  const ttlFor = (s = session(now())) => s === 'open' ? 8e3 : s === 'pre' || s === 'lunch' ? 60e3 : 600e3;
  const clist = (fs, {po = 1, pz = 20, fields}) => `${H}clist/get?pn=1&pz=${pz}&po=${po}&np=1&fltt=2&invt=2&fid=f3&fs=${fs}&fields=${fields}`;
  const SECTOR_FIELDS = 'f12,f14,f2,f3,f4,f6,f104,f105,f128,f136,f140';

  async function quotes(codes, ttl = ttlFor()) {
    const ids = [...new Set((codes || []).map(c => { try { return secid(c); } catch { return null; } }).filter(Boolean))].slice(0, 80);
    if (!ids.length) return [];
    return multi(ids, 'f12,f13,f14,f2,f3,f4,f5,f6,f8,f15,f16,f17,f18', ttl);
  }
  /** Several securities at once (ulist.np). When that endpoint is throttled (empty reply / 502), fall back to one
   *  stock/get per security (served by the delayed-quote host via redirect), at most 4 in flight. */
  async function multi(ids, fields, ttl) {
    try { return listOf(await getJson(`${H}ulist.np/get?fltt=2&invt=2&fields=${fields}&secids=${ids.join(',')}`, ttl)).map(parseQuote); }
    catch (e) {
      const out = [], queue = [...ids];
      await Promise.all(Array.from({length: Math.min(4, queue.length)}, async () => {
        while (queue.length) {
          const id = queue.shift();
          try { const q = parseStockGet((await getJson(`${H}stock/get?fltt=2&invt=2&secid=${id}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60,f107,f113,f114,f115,f168,f169,f170`, ttl))?.data); if (q?.code) out.push({...q, market: q.market ?? Number(id[0])}); } catch {}
        }
      }));
      if (!out.length) throw e;
      return ids.map(id => out.find(q => `${q.market}.${q.code}` === id || id.endsWith('.' + q.code))).filter(Boolean);
    }
  }
  async function sectors(kind = 'industry', {order = 'up', limit = 100} = {}) {
    const j = await getJson(clist(`m:90+t:${kind === 'concept' ? 3 : 2}`, {po: order === 'down' ? 0 : 1, pz: Math.min(100, Math.max(5, limit)), fields: SECTOR_FIELDS}), ttlFor());
    return listOf(j).map(parseSector);
  }
  async function movers(order) {
    const j = await getJson(clist(FS_A, {po: order === 'down' ? 0 : 1, pz: 30, fields: 'f12,f13,f14,f2,f3,f4,f6,f8'}), ttlFor());
    return listOf(j).map(parseQuote).filter(q => !isBJ(q.code) && q.price !== null).slice(0, 10);
  }
  async function indexMini(id) {
    try {
      const t = parseTrends(await getJson(`${HIS}stock/trends2/get?secid=${id}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ndays=1&iscr=0`, session(now()) === 'open' ? 60e3 : 1800e3));
      return t.points.filter((_, i) => i % 5 === 0 || i === t.points.length - 1).map(p => p.price);
    } catch { return []; }
  }
  async function pools() {
    const day = cstDate(now()), q = (kind, sort) => getJson(`${EX}getTopic${kind}Pool?ut=${POOL_UT}&dpt=wz.ztzt&Pageindex=0&pagesize=1&sort=${sort}&date=${day}`, ttlFor()).then(parsePool).catch(() => ({total: null, date: ''}));
    const [zt, dt] = await Promise.all([q('ZT', 'fbt:asc'), q('DT', 'fund:asc')]);
    return {limitUp: zt.total, limitDown: dt.total, date: zt.date || dt.date};
  }
  async function getOverview() {
    const s = session(now());
    // each part may fail on its own (rate limits, flaky hosts): show whatever arrived instead of failing the whole card
    const parts = await Promise.allSettled([
      multi(INDICES.map(i => i[0]), 'f12,f13,f14,f2,f3,f4,f5,f6,f15,f16,f17,f18,f104,f105,f106', ttlFor()),
      movers('up'), movers('down'), sectors('industry', {limit: 100}), sectors('concept', {limit: 60}), pools()]);
    const got = (i, d) => parts[i].status === 'fulfilled' ? parts[i].value : d;
    // pools() never rejects (it reports null counts instead), so 'nothing arrived' = the five fetches failed and no pool count
    const poolEmpty = parts[5].status !== 'fulfilled' || (parts[5].value?.limitUp == null && parts[5].value?.limitDown == null);
    if (parts.slice(0, 5).every(p => p.status === 'rejected') && poolEmpty) { if (overview) return {...overview, stale: true}; throw parts[0].reason; }
    const prev = overview || {};
    const [idx, up, down, ind, con, pl] = [got(0, []), got(1, prev.gainers || []), got(2, prev.losers || []), got(3, prev.industry || []), got(4, prev.concept || []), got(5, {limitUp: prev.breadth?.limitUp ?? null, limitDown: prev.breadth?.limitDown ?? null, date: ''})];
    const minis = await Promise.all(INDICES.map(([id]) => indexMini(id)));
    const indices = INDICES.map(([id, label], i) => { const q = idx.find(x => `${x.market}.${x.code}` === id) || (prev.indices || []).find(x => x.secid === id) || {}; return {...q, secid: id, name: q.name || label, mini: minis[i]?.length ? minis[i] : (q.mini || [])}; });
    const sh = indices[0] || {}, sz = indices[1] || {};
    const breadth = {up: (sh.up ?? 0) + (sz.up ?? 0) || null, down: (sh.down ?? 0) + (sz.down ?? 0) || null, flat: (sh.flat ?? 0) + (sz.flat ?? 0) || null, limitUp: pl.limitUp, limitDown: pl.limitDown};
    overview = {partial: parts.some(p => p.status === 'rejected'), at: now(), session: s, date: pl.date ? `${pl.date.slice(0, 4)}-${pl.date.slice(4, 6)}-${pl.date.slice(6, 8)}` : cstDate(now(), '-'), indices, breadth,
      gainers: up, losers: down, industry: ind, concept: con, amount: indices.slice(0, 2).reduce((a, x) => a + (x.amount || 0), 0) || null};
    return overview;
  }
  /** [v46] Live quote for one stock. ulist.np can answer with '-' for every field (throttled / after hours) without
   *  failing, which left the K-line header empty: then ask stock/get directly. */
  async function liveQuote(code) {
    const [q] = await quotes([code], 8e3).catch(() => [null]);
    if (q && q.price !== null && q.price !== undefined) return q;
    try {
      const s = parseStockGet((await getJson(`${H}stock/get?fltt=2&invt=2&secid=${secid(code)}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60,f107,f113,f114,f115,f168,f169,f170`, 8e3))?.data);
      if (s && s.price !== null) return {...(q || {}), ...s};
    } catch {}
    return q || null;
  }
  /** [v46] Header numbers from the last daily bars when no live price arrived (marked fromBars + asOf). */
  async function quoteOrBars(q, code, bars) {
    if (q && q.price !== null && q.price !== undefined) return q;
    let day = bars;
    if (!day) { try { day = parseKlines(await getJson(`${HIS}stock/kline/get?secid=${secid(code)}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&end=20500101&lmt=2`, 600e3)).bars; } catch { day = []; } }
    const fb = quoteFromBars(day);
    return fb ? {...(q || {}), ...fb, code: q?.code || code} : q;
  }
  async function kline(code, period = 'day', count = 320) {
    const id = secid(code), P = PERIODS[period] || PERIODS.day, q = await liveQuote(code);
    if (period === 'intraday') {
      const t = parseTrends(await getJson(`${HIS}stock/trends2/get?secid=${id}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ndays=1&iscr=0`, session(now()) === 'open' ? 10e3 : 600e3));
      return {code: t.code || code, name: t.name || q?.name || '', period, preClose: t.preClose ?? q?.preClose ?? null, points: t.points, quote: q};
    }
    const k = parseKlines(await getJson(`${HIS}stock/kline/get?secid=${id}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${P[0]}&fqt=1&end=20500101&lmt=${Math.min(800, Math.max(30, count))}`, session(now()) === 'open' ? 30e3 : 600e3));
    return {code: k.code || code, name: k.name || q?.name || '', period, bars: k.bars, quote: await quoteOrBars(q, code, period === 'day' ? k.bars : null)};
  }
  /** Numbers the chat model can quote: last bar, moving averages, MACD, KDJ, range highs / lows, last bars. */
  function klineSummary(k) {
    if (k.period === 'intraday') {
      const p = k.points, last = p.at(-1) || {};
      return {code: k.code, name: k.name, period: '分时', preClose: k.preClose, last: last.price ?? null, time: last.time ?? null, high: p.length ? Math.max(...p.map(x => x.price)) : null, low: p.length ? Math.min(...p.map(x => x.price)) : null, points: p.length};
    }
    const b = k.bars, close = b.map(x => x.close), last = b.at(-1) || {}, ma = n => r2(sma(close, n).at(-1)), m = macd(close), j = kdj(b), recent = b.slice(-20);
    return {code: k.code, name: k.name, period: PERIODS[k.period]?.[1] || k.period, bars: b.length, last: {date: last.date, open: last.open, close: last.close, high: last.high, low: last.low, pct: last.pct, volume: last.volume},
      ma: {ma5: ma(5), ma10: ma(10), ma20: ma(20), ma60: ma(60)}, macd: {dif: r2(m.dif.at(-1)), dea: r2(m.dea.at(-1)), bar: r2(m.bar.at(-1))}, kdj: {k: r2(j.k.at(-1)), d: r2(j.d.at(-1)), j: r2(j.j.at(-1))},
      high20: recent.length ? Math.max(...recent.map(x => x.high)) : null, low20: recent.length ? Math.min(...recent.map(x => x.low)) : null, recent: b.slice(-5).map(x => ({date: x.date, close: x.close, pct: x.pct}))};
  }
  async function resolve(query) {
    const q = String(query || '').trim(), m = /^(?:sh|sz|bj)?(\d{6})$/i.exec(q);
    if (m) return {code: m[1], name: ''};
    if (!lookup) throw new Error('请提供 6 位股票代码');
    const r = await resolveStock(lookup, q);
    if (r.error) throw new Error(r.error);
    if (r.choices) { const e = new Error(`找到多只股票：${r.choices.map(c => `${c.name}（${c.code}）`).join('、')}，请说明是哪一只`); e.choices = r.choices; throw e; }
    return {code: r.code, name: r.name};
  }
  async function sectorStocks(ref, limit = 20) {
    let code = String(ref || '').trim();
    if (!/^BK\d{3,5}$/i.test(code)) {
      const all = [...(overview?.industry || []), ...(overview?.concept || [])];
      let hit = all.find(s => s.name === code) || all.find(s => s.name.includes(code) || code.includes(s.name));
      if (!hit) { const [i, c] = await Promise.all([sectors('industry', {limit: 100}), sectors('concept', {limit: 100})]); hit = [...i, ...c].find(s => s.name === code) || [...i, ...c].find(s => s.name.includes(code) || code.includes(s.name)); }
      if (!hit) throw new Error(`没有找到「${clip(ref, 20)}」板块（目前按涨幅前 100 的行业与概念板块查找），请换个名称`);
      code = hit.code;
    }
    const j = await getJson(clist(`b:${code.toUpperCase()}`, {po: 1, pz: Math.min(50, Math.max(5, limit)), fields: 'f12,f13,f14,f2,f3,f4,f6,f8'}), ttlFor());
    const all = [...(overview?.industry || []), ...(overview?.concept || [])];
    return {sector: {code: code.toUpperCase(), name: all.find(s => s.code === code.toUpperCase())?.name || ''}, stocks: listOf(j).map(parseQuote)};
  }

  // ---------- M3: watchlist live quotes + alerts ----------
  const ALERT_KINDS = {above: '价格涨到', below: '价格跌到', up: '涨幅达到', down: '跌幅达到'};
  const describe = a => `${a.name || a.code} ${ALERT_KINDS[a.kind]} ${a.kind === 'up' || a.kind === 'down' ? a.value + '%' : a.value}`;
  function addAlert({code, name = '', kind, value}) {
    if (!ALERT_KINDS[kind]) throw new Error('提醒类型应为 above / below / up / down');
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0 || v > 1e6) throw new Error('请给出有效的价格或涨跌幅');
    const m = st();
    if (m.alerts.length >= 100) throw new Error('提醒最多 100 条，请先删掉一些');
    const a = {id: 'al-' + now().toString(36) + Math.random().toString(36).slice(2, 6), code: String(code), name: clip(name, 20), kind, value: Math.round(v * 1000) / 1000, created: now()};
    m.alerts.push(a);
    return {...a, text: describe(a)};
  }
  function emit(title, detail, extra) {
    const s = store.data;
    s.activity = [{id: 'mk-' + now().toString(36) + Math.random().toString(36).slice(2, 5), title, detail, code: extra?.code, time: now()}, ...(s.activity || [])].slice(0, 500);
    try { onAlert({title, detail, ...extra}); } catch {}
  }
  function check(q) {
    const m = st(), day = cstDate(now()), once = key => { if (m.fired[key] === day) return false; m.fired[key] = day; return true; };
    let hits = 0;
    for (const a of m.alerts.filter(a => a.code === q.code)) {
      const ok = a.kind === 'above' ? q.price >= a.value : a.kind === 'below' ? q.price <= a.value : a.kind === 'up' ? q.pct >= a.value : q.pct <= -a.value;
      if (q.price !== null && q.pct !== null && ok && once(a.id)) { hits++; emit('行情提醒', `${q.name || a.name || a.code}：${describe(a).replace(/^\S+ /, '')}，现价 ${q.price}（${q.pct > 0 ? '+' : ''}${q.pct}%）`, {code: q.code, kind: 'alert'}); }
    }
    const pool = new Set((store.data.quant?.pool || []).map(p => p.code));
    if (pool.has(q.code) && q.pct !== null) {
      const lim = limitPct(q.code, q.name);
      const dir = q.pct > 0 ? 'u' : 'd', atLimit = m.settings.limits && Math.abs(q.pct) >= lim - 0.1;
      // one event per stock, direction and day: a limit move suppresses the plain 「异动」 alert for the same move
      if (atLimit) { if (once(`limit:${q.code}:${dir}`)) { once(`move:${q.code}:${dir}`); hits++; emit(q.pct > 0 ? '自选股涨停' : '自选股跌停', `${q.name || q.code}（${q.code}）${q.pct > 0 ? '涨停' : '跌停'}，现价 ${q.price}（${q.pct > 0 ? '+' : ''}${q.pct}%）`, {code: q.code, kind: 'limit'}); } }
      else if (m.settings.moves && Math.abs(q.pct) >= m.settings.movePct && once(`move:${q.code}:${dir}`)) { hits++; emit('自选股异动', `${q.name || q.code}（${q.code}）今日${q.pct > 0 ? '大涨' : '大跌'} ${q.pct > 0 ? '+' : ''}${q.pct}%，现价 ${q.price}`, {code: q.code, kind: 'move'}); }
    }
    return hits;
  }
  async function refreshWatch({force = false} = {}) {
    const m = st(), codes = [...new Set([...(store.data.quant?.pool || []).map(p => p.code), ...m.alerts.map(a => a.code)])].filter(c => /^\d{6}$/.test(c));
    if (!codes.length) return {quotes: 0, hits: 0};
    const list = await quotes(codes, force ? 0 : 8e3);
    let hits = 0;
    for (const q of list) {
      if (q.price === null) continue;
      m.quotes[q.code] = {price: q.price, pct: q.pct, change: q.change, name: q.name, high: q.high, low: q.low, at: now()};
      if (session(now()) === 'open') hits += check(q);
    }
    for (const k of Object.keys(m.fired)) if (m.fired[k] !== cstDate(now())) delete m.fired[k];
    await store.save?.(); notify();
    return {quotes: list.length, hits};
  }

  return {
    async tick() {
      const s = session(now());
      // the home / 行情 page pings 'watch' while visible: keep its overview fresh (10 s while trading, 60 s in breaks)
      const every = s === 'open' ? 10e3 : s === 'pre' || s === 'lunch' ? 60e3 : 0;
      if (every && wantedAt && now() - wantedAt < 45e3 && !ovBusy && (!overview || now() - overview.at >= every)) {
        ovBusy = true;
        getOverview().then(() => notify()).catch(() => {}).finally(() => { ovBusy = false; });
      }
      if ((s !== 'open' && s !== 'pre') || tickBusy || now() - lastTick < 15e3) return;
      tickBusy = true; lastTick = now();
      try { await refreshWatch(); } catch {} finally { tickBusy = false; }
    },
    view() {
      const m = st();
      return {quotes: m.quotes, alerts: m.alerts.map(a => ({...a, text: describe(a)})), settings: m.settings, overview, session: session(now())};
    },
    async handle(p = {}) {
      const a = p.action;
      if (a === 'overview') { wantedAt = now(); return getOverview(); }
      if (a === 'watch') { wantedAt = now(); return {watching: true, session: session(now())}; }
      if (a === 'sectors') return {kind: p.kind === 'concept' ? 'concept' : 'industry', sectors: await sectors(p.kind, {order: p.order, limit: p.limit || 20})};
      if (a === 'sectorStocks') return sectorStocks(p.sector || p.code, p.limit);
      if (a === 'quotes') return {quotes: await quotes((p.codes || []).map(String))};
      if (a === 'kline') { const k = await kline(String(p.code || ''), p.period || 'day', p.count || 320); return p.summary ? klineSummary(k) : k; }
      if (a === 'resolve') return resolve(p.query);
      if (a === 'refreshWatch') return refreshWatch({force: true});
      if (a === 'addAlert') { const r = addAlert(p); await store.save?.(); notify(); return r; }
      if (a === 'removeAlert') { const m = st(), n = m.alerts.length; m.alerts = m.alerts.filter(x => x.id !== p.id); await store.save?.(); notify(); return {removed: n - m.alerts.length}; }
      if (a === 'settings') { const m = st(); if (typeof p.moves === 'boolean') m.settings.moves = p.moves; if (typeof p.limits === 'boolean') m.settings.limits = p.limits; if (Number(p.movePct) >= 1 && Number(p.movePct) <= 20) m.settings.movePct = Number(p.movePct); await store.save?.(); notify(); return m.settings; }
      throw new Error('未知的行情操作');
    },
    _summary: klineSummary,
  };
}
