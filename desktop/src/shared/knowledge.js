// [F3] 投研知识库 — pure helpers shared by the main-process knowledge service and the UI:
// M1 lexical search over the research library (BM25 on NFKC words + Chinese bigrams, with cited excerpts),
// M2 company / industry-chain graph (profile, top holders, built-in chain map, pool peers, announcement relations),
// M3 financial database (Eastmoney F10 main indicators -> quarterly rows, single-quarter values, trend table),
// M4 research topics (keyword matching across announcements, library and news; weekly digest structure).
// Deterministic: no model calls here; every number comes from a source that is cited.

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const fin = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const num = (v, d = 2) => fin(v) ? Number(v).toFixed(d) : '—';
export const pct = v => fin(v) ? `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(2)}%` : '—';
export function yuan(v) {
  if (!fin(v)) return '—';
  const n = Number(v), a = Math.abs(n);
  return a >= 1e8 ? (n / 1e8).toFixed(2) + '亿' : a >= 1e4 ? (n / 1e4).toFixed(2) + '万' : n.toFixed(2);
}

// ---------- M1: search ----------
const norm = s => String(s || '').normalize('NFKC').toLocaleLowerCase();
/** Query / document tokens: Latin and digit words, Chinese bigrams (single Chinese characters only when alone). */
export function tokens(text) {
  const out = [];
  for (const w of norm(text).match(/[\p{L}\p{N}_.%]+/gu) || []) {
    if (/\p{Script=Han}/u.test(w)) {
      const parts = w.match(/\p{Script=Han}+|[^\p{Script=Han}]+/gu) || [];
      for (const p of parts) {
        if (/\p{Script=Han}/u.test(p)) { const c = Array.from(p); if (c.length === 1) out.push(p); for (let i = 0; i + 1 < c.length; i++) out.push(c[i] + c[i + 1]); }
        else if (p.length > 1 || /\d/.test(p)) out.push(p);
      }
    } else if (w.length > 1 || /\d/.test(w)) out.push(w);
  }
  return out;
}
/** Split a document into ~400-character passages on sentence / line boundaries (60-character overlap). */
export function passages(text, {size = 400, overlap = 60} = {}) {
  const t = String(text || '').replace(/\r/g, '').trim(), out = [];
  for (let start = 0; start < t.length && out.length < 200;) {
    let end = Math.min(t.length, start + size);
    if (end < t.length) { const cut = Math.max(t.lastIndexOf('。', end), t.lastIndexOf('\n', end), t.lastIndexOf('；', end)); if (cut > start + size * 0.5) end = cut + 1; }
    out.push({start, text: t.slice(start, end).trim()});
    if (end >= t.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return out.filter(p => p.text);
}
/**
 * Build a BM25 index. docs: [{id, kind, code, name, title, date, text, url?}]. Passages keep their document so every hit
 * can be cited. Pure data (JSON-serialisable) so the service can persist it.
 */
export function buildIndex(docs, {now = Date.now()} = {}) {
  const items = [], df = {};
  for (const d of (docs || []).slice(0, 3000)) {
    if (!d?.id || !d.text) continue;
    const head = clip([d.title, d.name, d.code].filter(Boolean).join(' '), 200);
    for (const [i, p] of passages(d.text).entries()) {
      const tf = {};
      for (const t of tokens(i === 0 ? `${head} ${p.text}` : p.text)) tf[t] = (tf[t] || 0) + 1;
      const len = Object.values(tf).reduce((a, b) => a + b, 0);
      if (!len) continue;
      for (const t of Object.keys(tf)) df[t] = (df[t] || 0) + 1;
      items.push({doc: d.id, i, len, tf});
    }
  }
  const meta = Object.fromEntries((docs || []).filter(d => d?.id).map(d => [d.id, {id: d.id, kind: d.kind, code: d.code || '', name: clip(d.name, 20), title: clip(d.title, 120), date: clip(d.date, 10), url: d.url || '', text: String(d.text || '').slice(0, 60000)}]));
  return {version: 1, built: now, items, df, n: items.length, avg: items.length ? items.reduce((a, x) => a + x.len, 0) / items.length : 0, docs: meta};
}
/** BM25 search with optional filters; returns at most `limit` hits, one best passage per document first. */
export function searchIndex(index, query, {code = '', kind = '', limit = 8, k1 = 1.4, b = 0.75} = {}) {
  const q = [...new Set(tokens(query))];
  if (!index?.items?.length || !q.length) return {query: clip(query, 200), hits: [], total: 0};
  const phrase = norm(query).replace(/\s+/g, '');
  const scored = [];
  for (const it of index.items) {
    const d = index.docs[it.doc]; if (!d || (code && d.code !== code) || (kind && d.kind !== kind)) continue;
    let s = 0, matched = 0;
    for (const t of q) { const f = it.tf[t]; if (!f) continue; matched++; const idf = Math.log(1 + (index.n - (index.df[t] || 0) + 0.5) / ((index.df[t] || 0) + 0.5)); s += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * it.len / (index.avg || 1))); }
    if (!matched) continue;
    if (q.length > 1 && matched / q.length < 0.34) continue;
    const text = passages(d.text)[it.i]?.text || '';
    if (phrase.length > 1 && norm(text).replace(/\s+/g, '').includes(phrase)) s *= 1.6;
    scored.push({doc: it.doc, i: it.i, score: s, text, coverage: matched / q.length});
  }
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set(), first = [], rest = [];
  for (const h of scored) (seen.has(h.doc) ? rest : (seen.add(h.doc), first)).push(h);
  const hits = [...first, ...rest].slice(0, Math.max(1, Math.min(20, limit))).map((h, n) => {
    const d = index.docs[h.doc];
    return {ref: n + 1, id: d.id, kind: d.kind, code: d.code, name: d.name, title: d.title, date: d.date, url: d.url || undefined, score: Math.round(h.score * 100) / 100, excerpt: highlight(h.text, q)};
  });
  return {query: clip(query, 200), hits, total: scored.length};
}
/** Short excerpt centred on the first matched token. */
function highlight(text, q) {
  const t = String(text || ''), low = norm(t);
  let at = -1; for (const x of q) { const i = low.indexOf(x); if (i >= 0 && (at < 0 || i < at)) at = i; }
  const s = Math.max(0, at - 70), e = Math.min(t.length, s + 220);
  return (s ? '…' : '') + t.slice(s, e).replace(/\s+/g, ' ').trim() + (e < t.length ? '…' : '');
}
export const SEARCH_KINDS = {report: '研报', notice: '公告', note: '笔记', doc: '文档', export: '导出', finance: '财报', news: '资讯'};

// ---------- M3: financial database ----------
export const FINANCE_COLUMNS = 'SECUCODE,SECURITY_NAME_ABBR,REPORT_DATE,REPORT_TYPE,TOTALOPERATEREVE,TOTALOPERATEREVETZ,PARENTNETPROFIT,PARENTNETPROFITTZ,KCFJCXSYJLR,XSMLL,XSJLL,ROEJQ,ZCFZL,EPSJB,BPS,MGJYXJJE';
export const secuCode = code => `${code}.${/^(4|8|92)/.test(code) ? 'BJ' : /^(5|6|9)/.test(code) ? 'SH' : 'SZ'}`;
/** datacenter RPT_F10_FINANCE_MAINFINADATA rows -> oldest-first periods (cumulative values as reported). */
export function parseFinance(json) {
  if (!json || json.success !== true || !Array.isArray(json.result?.data)) throw new Error(json?.message ? `财报数据服务返回：${clip(json.message, 60)}` : '没有取到财报数据');
  const rows = [];
  for (const x of json.result.data) {
    const date = String(x.REPORT_DATE || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const v = k => fin(x[k]) ? Number(x[k]) : null;
    rows.push({date, type: clip(x.REPORT_TYPE, 6) || periodLabel(date), name: clip(x.SECURITY_NAME_ABBR, 20), revenue: v('TOTALOPERATEREVE'), revenueYoy: v('TOTALOPERATEREVETZ'), profit: v('PARENTNETPROFIT'), profitYoy: v('PARENTNETPROFITTZ'),
      deducted: v('KCFJCXSYJLR'), grossMargin: v('XSMLL'), netMargin: v('XSJLL'), roe: v('ROEJQ'), debtRatio: v('ZCFZL'), eps: v('EPSJB'), bps: v('BPS'), ocfps: v('MGJYXJJE')});
  }
  if (!rows.length) throw new Error('没有取到财报数据');
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}
export const periodLabel = date => { const m = String(date).slice(5, 7); return {'03': '一季报', '06': '中报', '09': '三季报', '12': '年报'}[m] || '报告期'; };
export const periodShort = date => `${String(date).slice(2, 4)}${{'03': 'Q1', '06': 'H1', '09': 'Q3', '12': 'FY'}[String(date).slice(5, 7)] || ''}`;
/** Single-quarter revenue / profit from cumulative year-to-date values (Q2 = H1 − Q1 …). null when the earlier period is missing. */
export function quarterly(rows) {
  const by = new Map((rows || []).map(r => [r.date, r]));
  const prev = d => { const y = d.slice(0, 4), m = d.slice(5, 7); return {'06': `${y}-03-31`, '09': `${y}-06-30`, '12': `${y}-09-30`}[m]; };
  return (rows || []).map(r => {
    const p = prev(r.date), b = p ? by.get(p) : null, q = k => !fin(r[k]) ? null : String(r.date).slice(5, 7) === '03' ? r[k] : b && fin(b[k]) ? r[k] - b[k] : null;
    return {date: r.date, label: periodShort(r.date).replace(/H1$/, 'Q2').replace(/FY$/, 'Q4'), revenue: q('revenue'), profit: q('profit')};
  });
}
/** Text the model / report can quote: latest period, YoY, margins and a 3-period trend. */
export function financeSummary(rows, {name = ''} = {}) {
  if (!rows?.length) return null;
  const l = rows.at(-1), lines = [];
  lines.push(`${name || l.name || ''}${l.date.slice(0, 4)} 年${l.type}：营业总收入 ${yuan(l.revenue)}（同比 ${pct(l.revenueYoy)}），归母净利润 ${yuan(l.profit)}（同比 ${pct(l.profitYoy)}），扣非净利润 ${yuan(l.deducted)}。`);
  lines.push(`毛利率 ${fin(l.grossMargin) ? num(l.grossMargin) + '%' : '—'}，净利率 ${fin(l.netMargin) ? num(l.netMargin) + '%' : '—'}，加权 ROE ${fin(l.roe) ? num(l.roe) + '%' : '—'}，资产负债率 ${fin(l.debtRatio) ? num(l.debtRatio) + '%' : '—'}，每股经营现金流 ${num(l.ocfps, 3)} 元。`);
  const q = quarterly(rows).slice(-4).filter(x => fin(x.profit));
  if (q.length >= 2) lines.push(`近 ${q.length} 个单季归母净利润：${q.map(x => `${x.label} ${yuan(x.profit)}`).join('，')}。`);
  if (fin(l.profit) && l.profit < 0) lines.push(`处于亏损状态${fin(l.debtRatio) && l.debtRatio > 70 ? '，且资产负债率超过 70%，需关注偿债压力' : ''}。`);
  return {date: l.date, type: l.type, lines};
}
/** Table for the UI and reports: newest first, at most `n` periods. */
export function financeTable(rows, n = 8) {
  const head = ['报告期', '营业总收入', '营收同比', '归母净利润', '净利同比', '毛利率', '净利率', 'ROE', '负债率', 'EPS'];
  return [head, ...(rows || []).slice(-n).reverse().map(r => [`${r.date.slice(0, 4)} ${r.type}`, yuan(r.revenue), pct(r.revenueYoy), yuan(r.profit), pct(r.profitYoy), fin(r.grossMargin) ? num(r.grossMargin) + '%' : '—', fin(r.netMargin) ? num(r.netMargin) + '%' : '—', fin(r.roe) ? num(r.roe) + '%' : '—', fin(r.debtRatio) ? num(r.debtRatio) + '%' : '—', num(r.eps, 3)])];
}
/** Round axis ticks (1 / 2 / 2.5 / 5 × 10ⁿ) covering [lo, hi], always including 0 when it is in range. */
export function niceTicks(lo, hi, n = 5) {
  const raw = (hi - lo) / Math.max(1, n - 1) || 1, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(k => k >= raw) || raw;
  const out = [], end = Math.ceil(hi / step - 1e-9) * step;
  for (let v = Math.floor(lo / step + 1e-9) * step; v <= end + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}
/** Single-quarter bar chart (revenue bars + profit bars) as an inline SVG. */
export function financeSvg(rows, {w = 960, h = 260} = {}) {
  const q = quarterly(rows).slice(-8).filter(x => fin(x.revenue) || fin(x.profit));
  if (q.length < 2) return '<p class="empty-note">财报期数不足，暂时画不出单季趋势。</p>';
  const padL = 60, padR = 16, top = 22, bot = 30, H = h - top - bot, vals = q.flatMap(x => [x.revenue, x.profit]).filter(fin);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals)), lo = ticks[0], hi = ticks.at(-1) > lo ? ticks.at(-1) : lo + 1;
  const Y = v => top + (hi - v) / (hi - lo) * H, cw = (w - padL - padR) / q.length, bw = Math.min(26, cw * 0.32);
  const T = (x, y, s, a = 'middle', c = '#8a94ad') => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" style="font-family:-apple-system,'PingFang SC',sans-serif;font-size:11px;fill:${c};stroke:none;text-anchor:${a}">${s}</text>`;
  let s = `<svg class="kn-fin-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="单季营收与归母净利润" style="display:block;width:100%;height:auto;fill:none;stroke:none">`;
  for (const v of ticks) s += `<line x1="${padL}" x2="${w - padR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" style="stroke:#eef1f6;stroke-dasharray:3 4"/>` + T(padL - 8, Y(v) + 4, v === 0 ? '0' : esc(yuan(v).replace(/\.00(?=[亿万])/, '')), 'end');
  s += `<line x1="${padL}" x2="${w - padR}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" style="stroke:#94a3b8;stroke-width:1.2"/>`;
  q.forEach((x, i) => {
    const cx = padL + cw * i + cw / 2;
    for (const [k, dx, c] of [['revenue', -bw / 2 - 2, '#2f62f5'], ['profit', bw / 2 + 2, '#8c7cff']]) {
      if (!fin(x[k])) continue;
      const y1 = Y(Math.max(0, x[k])), y2 = Y(Math.min(0, x[k])), col = k === 'profit' && x[k] < 0 ? '#18a058' : c;
      s += `<rect x="${(cx + dx - bw / 2).toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, y2 - y1).toFixed(1)}" rx="2" style="fill:${col}"><title>${esc(x.label)} ${k === 'revenue' ? '单季营收' : '单季归母净利润'} ${esc(yuan(x[k]))}</title></rect>`;
    }
    s += T(cx, h - 10, esc(x.label));
  });
  const anyLoss = q.some(x => fin(x.profit) && x.profit < 0), anyGain = q.some(x => fin(x.profit) && x.profit >= 0);
  s += T(padL, 13, `<tspan style="fill:#2f62f5">■ 单季营收</tspan>${anyGain ? '  <tspan style="fill:#8c7cff">■ 单季归母净利润</tspan>' : ''}${anyLoss ? `  <tspan style="fill:#18a058">■ ${anyGain ? '亏损季度' : '单季归母净利润（亏损）'}</tspan>` : ''}`, 'start');
  return s + '</svg>';
}

// ---------- M2: company / industry-chain graph ----------
/** Built-in chain map keyed by words of the Eastmoney 2016 industry (EM2016, "一级-二级-三级"). Kept short and generic. */
export const CHAIN_MAP = [
  [/太阳能|光伏/, {up: ['多晶硅', '硅片', '光伏玻璃', '银浆'], down: ['光伏组件', '逆变器', '光伏电站', '储能']}],
  [/锂电|动力电池|储能电池|(?<!太阳能)电池(?!片)/, {up: ['锂矿', '正极材料', '负极材料', '电解液', '隔膜'], down: ['新能源汽车', '储能系统', '消费电子']}], // 「太阳能电池」is solar, not lithium
  [/半导体|芯片|集成电路/, {up: ['硅片', '光刻胶', '半导体设备', 'EDA'], down: ['消费电子', '汽车电子', '通信设备', '数据中心']}],
  [/白酒|饮料|酒/, {up: ['粮食', '包装材料'], down: ['经销商', '商超', '电商']}],
  [/汽车整车|乘用车|汽车/, {up: ['汽车零部件', '钢铁', '动力电池', '芯片'], down: ['经销商', '出行服务']}],
  [/银行/, {up: ['居民存款', '同业资金'], down: ['企业贷款', '个人贷款', '财富管理']}],
  [/证券|券商/, {up: ['资本市场'], down: ['经纪业务', '投行业务', '资管业务']}],
  [/医药|生物|化学制药|中药/, {up: ['原料药', '医药中间体'], down: ['医院', '药店', '医保']}],
  [/煤炭/, {up: ['矿山设备'], down: ['火电', '钢铁', '化工']}],
  [/钢铁/, {up: ['铁矿石', '焦煤'], down: ['基建', '房地产', '汽车', '机械']}],
  [/家电|白色家电/, {up: ['钢材', '铜', '塑料', '压缩机'], down: ['零售渠道', '房地产后周期']}],
  [/房地产/, {up: ['土地', '建材', '建筑施工'], down: ['物业管理', '家居家电']}],
  [/饲料|养殖|农业/, {up: ['玉米', '豆粕', '鱼粉'], down: ['养殖户', '肉制品加工']}],
];
export function chainOf(industry = '', business = '') {
  const t = `${industry} ${business}`, out = {up: new Set(), down: new Set()};
  for (const [re, c] of CHAIN_MAP) if (re.test(t)) { c.up.forEach(x => out.up.add(x)); c.down.forEach(x => out.down.add(x)); }
  return {up: [...out.up].slice(0, 6), down: [...out.down].slice(0, 6)};
}
/** datacenter RPT_F10_BASIC_ORGINFO -> profile. */
export function parseProfile(json) {
  const x = json?.success === true ? json.result?.data?.[0] : null;
  if (!x) throw new Error('没有取到公司资料');
  return {name: clip(x.SECURITY_NAME_ABBR, 20), fullName: clip(x.ORG_NAME, 60), industry: clip(x.EM2016, 60), csrc: clip(x.INDUSTRYCSRC1, 60), province: clip(x.PROVINCE, 10), business: clip(x.MAIN_BUSINESS, 600), controller: clip(x.ACTUAL_HOLDER, 40), president: clip(x.PRESIDENT, 20), founded: String(x.FOUND_DATE || '').slice(0, 10)};
}
/** datacenter RPT_F10_EH_HOLDERS -> latest-period top holders. */
export function parseHolders(json) {
  const list = json?.success === true ? json.result?.data : null;
  if (!Array.isArray(list)) throw new Error('没有取到股东数据');
  const date = String(list[0]?.END_DATE || '').slice(0, 10);
  return {date, holders: list.filter(x => String(x.END_DATE || '').slice(0, 10) === date).slice(0, 10).map(x => ({rank: Number(x.HOLDER_RANK) || 0, name: clip(x.HOLDER_NAME, 80), shares: fin(x.HOLD_NUM) ? Number(x.HOLD_NUM) : null, ratio: fin(x.HOLD_NUM_RATIO) ? Number(x.HOLD_NUM_RATIO) : null}))};
}
const shortHolder = n => clip(String(n).replace(/(股份)?有限(责任)?公司/g, '').replace(/^香港中央结算$/, '香港中央结算（北向资金）').replace(/-.*$/, ''), 24);
/**
 * Graph for one stock: nodes {id, label, kind: company|industry|chain-up|chain-down|holder|person|peer}, edges {from, to, label}.
 * peers: other pool stocks [{code, name, industry}]; notices: classified announcements (pledge / buyback add edges).
 */
export function companyGraph({code, profile = null, holders = null, peers = [], notices = []} = {}) {
  const nodes = [], edges = [], add = (id, label, kind, extra = {}) => { if (!nodes.some(n => n.id === id)) nodes.push({id, label: clip(label, 30), kind, ...extra}); return id; };
  const me = add(`c:${code}`, profile?.name || code, 'company', {code});
  if (profile?.industry) {
    const parts = profile.industry.split('-').filter(Boolean), leaf = parts.at(-1);
    edges.push({from: me, to: add(`i:${leaf}`, leaf, 'industry', {path: profile.industry}), label: '所属行业'});
    const ch = chainOf(profile.industry, profile.business);
    ch.up.forEach(x => edges.push({from: add(`u:${x}`, x, 'chain-up'), to: me, label: '上游'}));
    ch.down.forEach(x => edges.push({from: me, to: add(`d:${x}`, x, 'chain-down'), label: '下游'}));
  }
  if (profile?.controller) edges.push({from: add(`p:${profile.controller}`, profile.controller, 'person'), to: me, label: '实际控制人'});
  for (const h of (holders?.holders || []).slice(0, 6)) {
    const label = shortHolder(h.name);
    edges.push({from: add(`h:${label}`, label, 'holder', {ratio: h.ratio}), to: me, label: `${h.rank === 1 ? '第一大股东' : '股东'} ${fin(h.ratio) ? num(h.ratio) + '%' : ''}`.trim()});
  }
  const leaf = profile?.industry?.split('-').filter(Boolean).at(-1);
  for (const p of (peers || []).filter(p => p.code !== code && p.industry && leaf && p.industry.split('-').at(-1) === leaf).slice(0, 6))
    edges.push({from: me, to: add(`c:${p.code}`, p.name || p.code, 'peer', {code: p.code}), label: '同行业'});
  for (const n of (notices || []).filter(n => /质押/.test(n.title)).slice(0, 1)) {
    const top = (holders?.holders || [])[0]; if (top) edges.push({from: `h:${shortHolder(top.name)}`, to: me, label: `质押公告 ${n.date}`, notice: n.id});
  }
  return {code, nodes: nodes.slice(0, 40), edges: edges.slice(0, 60), asOf: holders?.date || ''};
}
const nodeLabel = n => { const c = Array.from(n.label || ''); return n.kind !== 'company' && c.length > 11 ? c.slice(0, 10).join('') + '…' : n.label; };
const nodeSize = n => { const big = n.kind === 'company'; return [16 + Array.from(nodeLabel(n)).length * (big ? 15 : 12.5), big ? 34 : 26]; };
/**
 * Node boxes for graphSvg: radial start (company centre; upstream left, downstream right, holders top-left, peers
 * bottom-right), then a deterministic separation pass so no two boxes overlap (6 px gap) and all stay on the canvas.
 * Returns Map(id -> {x, y, w, h}) with x / y the box centre.
 */
export function graphLayout(g, {w = 960, h = 420} = {}) {
  const cx = w / 2, cy = h / 2 - 8, R = Math.min(w * 0.36, h * 0.42), box = new Map();
  const groups = {'chain-up': [196, 256], 'chain-down': [-40, 40], holder: [104, 176], person: [72, 72], industry: [270, 270], peer: [290, 340]};
  const put = (n, x, y) => { const [bw, bh] = nodeSize(n); box.set(n.id, {x, y, w: bw, h: bh, fixed: n.kind === 'company'}); };
  put(g.nodes[0], cx, cy);
  for (const [kind, [a0, a1]] of Object.entries(groups)) {
    const list = g.nodes.filter(n => n.kind === kind);
    list.forEach((n, i) => { const a = (list.length === 1 ? (a0 + a1) / 2 : a0 + (a1 - a0) * i / (list.length - 1)) * Math.PI / 180, r = kind === 'industry' ? R * 0.62 : kind === 'holder' && i % 2 ? R * 0.66 : R; put(n, cx + Math.cos(a) * r * 1.35, cy - Math.sin(a) * r); });
  }
  const all = [...box.values()], GAP = 6, minX = 6, maxX = w - 6, minY = 6, maxY = h - 30;
  const clamp = b => { b.x = Math.min(maxX - b.w / 2, Math.max(minX + b.w / 2, b.x)); b.y = Math.min(maxY - b.h / 2, Math.max(minY + b.h / 2, b.y)); };
  all.forEach(clamp);
  for (let round = 0; round < 400; round++) {
    let moved = false;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j], ox = (a.w + b.w) / 2 + GAP - Math.abs(a.x - b.x), oy = (a.h + b.h) / 2 + GAP - Math.abs(a.y - b.y);
      if (ox <= 0 || oy <= 0) continue;
      moved = true;
      // push along the axis that needs the smaller move; ties go vertical (labels are wide)
      const vertical = oy <= ox, d = (vertical ? oy : ox) + 0.5, sx = a.x <= b.x ? -1 : 1, sy = a.y <= b.y ? -1 : 1;
      const share = a.fixed ? [0, 1] : b.fixed ? [1, 0] : [0.5, 0.5];
      if (vertical) { a.y += sy * d * share[0]; b.y -= sy * d * share[1]; } else { a.x += sx * d * share[0]; b.x -= sx * d * share[1]; }
      clamp(a); clamp(b);
    }
    if (!moved) break;
  }
  return box;
}
/** Overlapping node pairs in a layout (for tests and the screenshot check). */
export function layoutOverlaps(box) {
  const all = [...box.entries()], out = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { const [ia, a] = all[i], [ib, b] = all[j]; if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2) out.push([ia, ib]); }
  return out;
}
/** Radial SVG of companyGraph (layout from graphLayout, so boxes never overlap). */
export function graphSvg(g, {w = 960, h = 420} = {}) {
  if (!g?.nodes?.length || g.nodes.length < 2) return '<p class="empty-note">还没有关系数据。</p>';
  const box = graphLayout(g, {w, h});
  const COLOR = {company: '#2f62f5', industry: '#0b2ba6', 'chain-up': '#8c7cff', 'chain-down': '#14b8a6', holder: '#f59e0b', person: '#e5484d', peer: '#64748b'};
  let s = `<svg class="kn-graph-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="公司关系图" style="display:block;width:100%;height:auto;fill:none;stroke:none">`;
  for (const e of g.edges) { const a = box.get(e.from), b = box.get(e.to); if (!a || !b) continue; s += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" style="stroke:#d6ddeb;stroke-width:1.2"><title>${esc(e.label)}</title></line>`; }
  for (const n of g.nodes) {
    const b = box.get(n.id); if (!b) continue;
    const c = COLOR[n.kind] || '#64748b', big = n.kind === 'company';
    s += `<g class="kn-node kn-${n.kind}"${n.code && n.kind === 'peer' ? ` data-action="quantOpen" data-id="${esc(n.code)}" style="cursor:pointer"` : ''}><rect x="${(b.x - b.w / 2).toFixed(1)}" y="${(b.y - b.h / 2).toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h}" rx="${big ? 10 : 8}" style="fill:${big ? c : '#fff'};stroke:${c};stroke-width:1.4"/><text x="${b.x.toFixed(1)}" y="${(b.y + (big ? 5 : 4)).toFixed(1)}" style="font-family:-apple-system,'PingFang SC',sans-serif;font-size:${big ? 14 : 12}px;font-weight:${big ? 700 : 500};fill:${big ? '#fff' : '#14213d'};text-anchor:middle;stroke:none">${esc(nodeLabel(n))}</text><title>${esc(n.label)}${n.ratio != null ? ' ' + num(n.ratio) + '%' : ''}</title></g>`;
  }
  const legend = [['上游', 'chain-up'], ['下游', 'chain-down'], ['股东', 'holder'], ['实际控制人', 'person'], ['行业', 'industry'], ['同行业自选股', 'peer']];
  s += legend.map(([l, k], i) => `<g><rect x="${12 + i * 112}" y="${h - 20}" width="10" height="10" rx="2" style="fill:${COLOR[k]}"/><text x="${26 + i * 112}" y="${h - 11}" style="font-family:-apple-system,'PingFang SC',sans-serif;font-size:11px;fill:#5b6787;stroke:none">${l}</text></g>`).join('');
  return s + '</svg>';
}

// ---------- M4: research topics ----------
export const TOPIC_LIMIT = 20;
export function normalizeTopic({name = '', keywords = [], codes = [], weekday = 1, time = '08:30', enabled = true} = {}) {
  const n = clip(name, 30);
  if (n.length < 2) throw new Error('主题名称至少 2 个字');
  const kw = [...new Set((Array.isArray(keywords) ? keywords : String(keywords).split(/[,，、;；\s]+/)).map(k => clip(k, 20)).filter(k => k.length >= 2))].slice(0, 12);
  if (!kw.length) throw new Error('请至少填一个关键词（2 个字以上）');
  const cs = [...new Set((Array.isArray(codes) ? codes : String(codes).split(/[,，、;；\s]+/)).map(c => String(c).trim()).filter(c => /^\d{6}$/.test(c)))].slice(0, 20);
  const wd = Number(weekday), t = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(time)) ? String(time) : '08:30';
  return {name: n, keywords: kw, codes: cs, weekday: wd >= 0 && wd <= 6 ? wd : 1, time: t, enabled: enabled !== false};
}
export const topicMatches = (topic, text) => (topic?.keywords || []).filter(k => norm(text).includes(norm(k)));
/** Next weekly digest time (local wall clock of the given offset, default CST). */
export function nextDigestAt(topic, now = Date.now(), offsetH = 8) {
  const [hh, mm] = String(topic?.time || '08:30').split(':').map(Number), local = new Date(now + offsetH * 3600e3);
  let t = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hh, mm) - offsetH * 3600e3;
  const add = ((Number(topic?.weekday ?? 1) - local.getUTCDay()) + 7) % 7;
  t += add * 86400e3;
  if (t <= now) t += 7 * 86400e3;
  return t;
}
/** Digest structure (format independent) from collected items [{kind, date, title, code, name, excerpt, url, matched}]. */
export function topicDigest(topic, items, {date = '', since = ''} = {}) {
  const by = k => items.filter(x => x.kind === k);
  const row = x => `${x.date || ''} ${x.name ? x.name + '｜' : ''}${x.title}${x.matched?.length ? `（${x.matched.join('、')}）` : ''}`.trim();
  const sections = [{id: 'scope', title: '追踪范围', paragraphs: [`关键词：${topic.keywords.join('、')}${topic.codes.length ? `；关联股票：${topic.codes.join('、')}` : ''}${since ? `；统计区间：${since} 至 ${date}` : ''}。`, `本期共收集 ${items.length} 条：公告 ${by('notice').length}、资讯 ${by('news').length}、资料库 ${items.length - by('notice').length - by('news').length}。`]}];
  if (by('notice').length) sections.push({id: 'notices', title: '相关公告', bullets: by('notice').slice(0, 20).map(x => row(x) + (x.excerpt ? ` —— ${clip(x.excerpt, 120)}` : ''))});
  if (by('news').length) sections.push({id: 'news', title: '相关资讯', bullets: by('news').slice(0, 15).map(x => row(x) + (x.url ? ` ${x.url}` : ''))});
  const lib = items.filter(x => !['notice', 'news'].includes(x.kind));
  if (lib.length) sections.push({id: 'library', title: '资料库中的相关内容', bullets: lib.slice(0, 15).map(x => `${SEARCH_KINDS[x.kind] || x.kind}｜${row(x)}${x.excerpt ? ` —— ${clip(x.excerpt, 120)}` : ''}`)});
  if (!items.length) sections.push({id: 'empty', title: '本期动态', paragraphs: ['本期没有发现与关键词相关的新公告、资讯或资料。']});
  sections.push({id: 'note', title: '说明', bullets: ['资讯来自公开搜索结果，未经核实；公告以交易所披露原文为准。', '本周报按关键词自动汇集，不代表对主题的判断。']});
  return {kind: 'topic', title: `研究主题周报：${topic.name} · ${date}`, subtitle: date, date, sections, summary: `${topic.name}：本期 ${items.length} 条相关动态。`, gaps: [], disclaimer: '本周报由 QuankSight 在本机按关键词自动汇集，仅供研究参考，不构成投资建议。'};
}
