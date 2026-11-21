// [F2] 投研文档 — pure helpers shared by the main-process research service and the UI:
// announcement parsing / classification / key points (M2), the stock research report structure and its Word / PPT / HTML
// renderings (M1), the research library (M3) and the briefing / portfolio-review / engine-report exports (M4).
// Everything here is deterministic: numbers come from the engine, the market service or the announcement text, never a model.
import { actionLabel } from './quant.js';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const fin = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
export const num = (v, d = 2) => fin(v) ? Number(v).toFixed(d) : '—';
export const pct = v => fin(v) ? `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(2)}%` : '—';
export function money(v) {
  if (!fin(v)) return '—';
  const n = Number(v), a = Math.abs(n);
  return a >= 1e8 ? (n / 1e8).toFixed(2) + '亿' : a >= 1e4 ? (n / 1e4).toFixed(2) + '万' : n.toFixed(2);
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const DISCLAIMER = '本报告由 QuanK 在本机根据公开行情、公司公告和你自己的量化策略自动生成，仅供研究参考，不构成任何投资建议。投资有风险，决策请独立判断。';

// ---------- M2: announcements ----------
/** Order matters: the first matching type wins (a rating agency's "三季报亏损的关注公告" is a risk, not a periodic report). */
export const NOTICE_TYPES = [
  ['risk', '风险事项', 'high', /风险提示|立案|调查|行政处罚|处罚决定|警示函|问询函|监管函|关注函|诉讼|仲裁|退市|\*?ST|停牌|违规|冻结|失信|亏损的关注|评级.{0,6}(下调|关注|负面)|债务逾期|无法按期/],
  ['forecast', '业绩预告', 'high', /业绩预告|业绩快报|预亏|预盈|预增|预减|扭亏|业绩.{0,4}(预计|变动)/],
  ['periodic', '定期报告', 'high', /年度报告|年报|半年度报告|半年报|季度报告|季报/],
  ['holder', '股东变动', 'medium', /减持|增持|质押|解除质押|解禁|限售股.{0,4}上市|权益变动|举牌|控股股东.{0,6}(变更|变动)/],
  ['capital', '资本运作', 'medium', /回购|分红|利润分配|派息|送转|权益分派|定增|非公开发行|向特定对象发行|可转债|募集资金|重大资产|重组|收购|出售资产|对外担保|担保/],
  ['ir', '投资者关系', 'low', /投资者关系|调研|业绩说明会|路演|接待/],
  ['governance', '公司治理', 'low', /股东大会|股东会|董事会|监事会|章程|独立董事|聘任|辞职|选举|会议资料|法律意见|决议/],
];
export const NOTICE_LEVEL = {high: '重要', medium: '关注', low: '一般'};

export function classifyNotice(title = '', columns = []) {
  const t = `${title} ${(columns || []).join(' ')}`;
  for (const [type, label, level, re] of NOTICE_TYPES) if (re.test(t)) return {type, label, level};
  return {type: 'other', label: '其他', level: 'low'};
}

/** Eastmoney announcement list (np-anotice-stock …/api/security/ann) -> notices, newest first. */
export function parseNoticeList(json, code = '') {
  if (!json || (json.success !== 1 && json.success !== true) || !Array.isArray(json.data?.list)) throw new Error('公告服务返回异常');
  const out = [];
  for (const x of json.data.list) {
    const id = clip(x?.art_code, 40);
    if (!/^[A-Za-z0-9]+$/.test(id)) continue;
    const c = (x.codes || []).find(c => !code || c.stock_code === code) || (x.codes || [])[0] || {};
    const raw = clip(x.title_ch || x.title, 200), name = clip(c.short_name, 20);
    const title = clip(raw.replace(/^[^:：]{1,20}[:：]/, ''), 160) || raw;
    const columns = (x.columns || []).map(k => clip(k.column_name, 20)).filter(Boolean).slice(0, 4);
    out.push({id, code: clip(c.stock_code || code, 6), name, title, date: String(x.notice_date || '').slice(0, 10), time: clip(x.display_time, 19), columns, ...classifyNotice(title, columns)});
  }
  return out;
}

/** Eastmoney announcement body (np-cnotice-stock …/api/content/ann) -> plain text + the official PDF link. */
export function parseNoticeContent(json) {
  const d = json?.data;
  if (!d || typeof d.notice_content !== 'string') throw new Error('没有取到公告正文');
  const text = d.notice_content.replace(/\r/g, '').replace(/[ \t\u3000]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 60000);
  const url = String(d.attach_url_web || d.attach_url || '');
  return {id: clip(d.art_code, 40), text, pdf: /^https:\/\/pdf\.dfcfw\.com\/pdf\/[\w.?=&-]+$/.test(url) ? url : '', pages: Number(d.page_size) || 1};
}

const BOILER = /保证本公告内容|不存在任何虚假记载|敬请(广大)?投资者|注意投资风险|特此公告|董事会$|^证券代码|^证券简称|^公告编号|法律责任|受.{0,40}委托|（以下简称|进行了(?:主体)?(?:信用)?评级|^[^，。]{0,12}〔\d{4}〕\d+\s*号/; // [F2] rating-agency preambles carry no information
const KEY = /净利润|归母|归属于|扣非|营业收入|营收|毛利|同比|环比|亏损|盈利|预计|减持|增持|回购|分红|派发|每\s*10\s*股|质押|冻结|金额|比例|价格|上限|下限|期限|风险|下降|增长|下滑|立案|处罚|诉讼|违规|摘帽|停牌|股本/;
/** The few sentences an investor reads first: bulleted highlights, then numeric sentences with key financial terms. */
const LIST_MARK = /^(?:[●•■◆□√\-]+|[（(][一二三四五六七八九十\d]{1,3}[）)]|[一二三四五六七八九十]{1,3}[、.．]|\d{1,2}[、.．）)](?!\d))\s*/;
/** Announcement text arrives hard-wrapped: join a line with the next when it does not end a sentence and the next one is
 *  not a new list item. */
function unwrap(text) {
  const out = [];
  for (const raw of String(text || '').split(/\n/)) {
    const l = raw.trim(); if (!l) continue;
    const prev = out.at(-1);
    if (prev && !/[。；;：:！？!?）)]$/.test(prev) && !LIST_MARK.test(l) && !/^[●•■◆]/.test(l) && prev.length + l.length < 400) out[out.length - 1] = prev + l;
    else out.push(l);
  }
  return out;
}
export function keyPoints(text, {max = 6} = {}) {
  const lines = unwrap(text), seen = new Set(), out = [];
  const add = s => { s = s.replace(LIST_MARK, '').replace(/\s+/g, ' ').trim(); if (s.length < 8 || s.length > 220 || /[：:]$/.test(s) || BOILER.test(s) || seen.has(s)) return; seen.add(s); out.push(s); };
  for (const l of lines) if (/^[●•■◆]/.test(l) && KEY.test(l)) add(l);
  if (out.length < max) for (const l of lines) for (const s of l.split(/(?<=[。；;])/)) if (out.length < max * 2 && KEY.test(s) && /\d/.test(s)) add(s);
  return out.slice(0, max);
}
export const NOTICE_PROMPT = '你是证券公告解读助手。只依据给出的公告原文，用中文写 3–5 条要点（每条不超过 60 字），先写对股价和持仓影响最大的事实（金额、比例、时间、是否亏损、是否减持等），最后一条写需要留意的风险。不要编造原文没有的数字，不给买卖建议。每条以「- 」开头，不要标题。';

// ---------- M1: stock research report ----------
function barChange(bars, n) {
  const b = (bars || []).filter(x => fin(x?.close));
  if (b.length < 2) return null;
  const last = b.at(-1).close, base = b[Math.max(0, b.length - 1 - n)].close;
  return base ? (last / base - 1) * 100 : null;
}
function rangeHiLo(bars, n) {
  const b = (bars || []).slice(-n).filter(x => fin(x?.high) && fin(x?.low));
  return b.length ? {hi: Math.max(...b.map(x => x.high)), lo: Math.min(...b.map(x => x.low))} : null;
}
function sma(bars, n) {
  const b = (bars || []).filter(x => fin(x?.close)).slice(-n);
  return b.length === n ? b.reduce((s, x) => s + x.close, 0) / n : null;
}

/**
 * Report structure (format independent). input: {code, name, date, quote, bars, signal (engine summary), returns ({a, b} last
 * backtest return %), holding, notices, insight (AI text), period}. Missing parts are skipped and listed in `gaps`.
 */
export function buildStockReport({code, name = '', date = '', quote = null, bars = [], signal = null, returns = null, holding = null, notices = [], insight = ''} = {}) {
  const title = `${name || code}（${code}）个股研究报告`, sections = [], gaps = [];
  const s = signal || null, q = quote || {};
  // core view
  const core = [];
  if (s) {
    core.push(`策略档位：${actionLabel(s.action, s.actionText)}；综合分 ${num(s.score, 1)}${fin(s.scoreRaw) && s.scoreRaw !== s.score ? `（风控调整前 ${num(s.scoreRaw, 1)}）` : ''}；定投倍率 ${s.multiplier == null ? '—' : num(s.multiplier, 1) + '×'}${fin(s.probPct) ? `；模型上涨概率 ${num(s.probPct, 1)}%` : ''}。`);
    if (s.detail) core.push(clip(String(s.detail).replace(/\*\*/g, ''), 600));
    if (s.advice) core.push(`仓位建议：${clip(s.advice, 300)}`);
  } else { core.push('本机量化引擎未运行或未返回信号，本报告不含档位、评分和回测，只汇总能取到的行情、公告与持仓信息。'); gaps.push('量化信号'); }
  sections.push({id: 'core', title: '核心结论', paragraphs: core});
  // market
  if (fin(q.price) || bars.length) {
    const rows = [['现价', num(q.price)], ['涨跌幅', pct(q.pct)], ['今开', num(q.open)], ['最高', num(q.high)], ['最低', num(q.low)], ['昨收', num(q.preClose)], ['成交额', money(q.amount)], ['换手率', fin(q.turnover) ? num(q.turnover) + '%' : '—']];
    const p = [];
    if (q.fromBars && q.asOf) p.push(`实时报价暂不可用，以上为 ${q.asOf} 收盘数据。`);
    const ch = [[20, '近 20 日'], [60, '近 60 日'], [120, '近 120 日']].map(([n, l]) => { const c = barChange(bars, n); return c == null ? '' : `${l} ${pct(c)}`; }).filter(Boolean);
    if (ch.length) p.push(`区间表现：${ch.join('，')}。`);
    const r = rangeHiLo(bars, 120), m20 = sma(bars, 20), m60 = sma(bars, 60), last = bars.filter(x => fin(x?.close)).at(-1)?.close;
    if (r) p.push(`近 120 日最高 ${num(r.hi)}、最低 ${num(r.lo)}${last ? `，现价位于区间 ${num((last - r.lo) / ((r.hi - r.lo) || 1) * 100, 0)}% 分位` : ''}。`);
    if (last && m20 && m60) p.push(`均线：MA20 ${num(m20)}、MA60 ${num(m60)}；现价${last >= m20 ? '站上' : '跌破'} MA20、${last >= m60 ? '站上' : '跌破'} MA60${last < m20 && last < m60 ? '，短中期均处弱势' : last >= m20 && last >= m60 ? '，短中期趋势偏强' : ''}。`);
    sections.push({id: 'market', title: '行情概况', table: [['指标', '数值'], ...rows], paragraphs: p, chart: bars.length ? 'kline' : ''});
  } else gaps.push('行情');
  // signal detail
  if (s) {
    const table = (s.factors || []).length ? [['评分因子', '得分', '满分', '说明'], ...s.factors.slice(0, 20).map(f => [clip(f.name, 30), num(f.score, 1), f.max == null ? '—' : String(f.max), clip(String(f.reason || '').replace(/\*\*/g, ''), 300)])] : null;
    sections.push({id: 'signal', title: '量化信号与风控', bullets: [...(s.reasons || []).map(x => '理由：' + clip(x, 300)), ...(s.gates || []).map(x => '风控：' + clip(x, 300))].slice(0, 16), ...(table ? {table} : {}),
      paragraphs: (s.indicators || []).length ? ['指标：' + s.indicators.slice(0, 12).map(i => `${clip(i.name, 16)} ${num(i.value)}`).join('；') + '。'] : []});
    const bt = s.backtest || {};
    if (Object.values(bt).some(fin) || returns) {
      const p = [];
      if (returns && (fin(returns.a) || fin(returns.b))) p.push(`按累计投入计算，回测期末智能定投收益率 ${pct(returns.a)}，普通定投 ${pct(returns.b)}${fin(returns.a) && fin(returns.b) ? `，差 ${num(returns.a - returns.b)} 个百分点` : ''}。`);
      p.push('回测基于历史数据，不代表未来表现；最大回撤反映的是这套规则历史上最难熬的一段。');
      sections.push({id: 'backtest', title: '回测表现', table: [['策略收益', '基准收益', '超额', '胜率', '交易次数', '最大回撤'], [pct(bt.smartPct), pct(bt.blindPct), pct(bt.excess), fin(bt.winRate) ? num(bt.winRate, 0) + '%' : '—', fin(bt.trades) ? String(bt.trades) : '—', pct(bt.maxDrawdown)]], paragraphs: p, chart: returns ? 'returns' : ''});
    }
  }
  // holding
  if (holding && fin(holding.shares) && holding.shares > 0) {
    sections.push({id: 'holding', title: '我的持仓', table: [['持仓股数', '成本价', '市值', '浮动盈亏', '盈亏比例'], [String(holding.shares), num(holding.cost), money(holding.value), money(holding.pnl), pct(holding.pnlPct)]],
      paragraphs: fin(holding.pnlPct) && holding.pnlPct <= -10 ? [`当前浮亏 ${pct(holding.pnlPct)}，建议对照策略档位与风控条件确认是否需要暂停加仓或分批减仓。`] : []});
  }
  // notices
  const ns = (notices || []).slice(0, 12);
  if (ns.length) {
    const important = ns.filter(n => n.level === 'high' || n.level === 'medium').slice(0, 5);
    sections.push({id: 'notices', title: '近期公告', table: [['日期', '类型', '标题'], ...ns.map(n => [n.date, n.label, clip(n.title, 120)])],
      bullets: important.flatMap(n => (n.points || []).slice(0, 2).map(p => `${n.label}｜${clip(n.title, 40)}：${clip(p, 160)}`)).slice(0, 10)});
  } else gaps.push('公告');
  if (insight) sections.push({id: 'insight', title: 'AI 研判', paragraphs: String(insight).split(/\n+/).map(x => clip(x.replace(/^[#>*\-\s]+/, '').replace(/\*\*/g, ''), 800)).filter(Boolean).slice(0, 12)});
  // risks
  const risks = [];
  if (s && /SELL|PAUSE|HOLD/i.test(String(s.action || '')) && /暂停|减仓|卖|风控/.test(String(actionLabel(s.action, s.actionText)))) risks.push(`策略当前为「${actionLabel(s.action, s.actionText)}」，风控条件已触发。`);
  for (const n of ns.filter(n => n.type === 'risk').slice(0, 3)) risks.push(`${n.date} 风险类公告：${clip(n.title, 80)}`);
  if (holding && fin(holding.pnlPct) && holding.pnlPct <= -20) risks.push(`持仓浮亏已达 ${pct(holding.pnlPct)}。`);
  risks.push('行情来自公开接口，可能有延迟；公告要点为自动摘录，请以交易所披露的原文为准。');
  sections.push({id: 'risk', title: '风险提示', bullets: risks});
  if (gaps.includes('行情')) risks.splice(risks.length - 1, 0, '行情接口暂时不可用，本报告未包含实时报价、区间表现与 K 线。');
  const summary = clip(core[0] || '', 160);
  return {kind: 'stock', title, subtitle: `${date || ''} · QuanK 投研报告`, date, code, name, sections, summary, gaps, disclaimer: DISCLAIMER};
}

// ---------- renderings ----------
const cellText = v => clip(v, 2000);
/** Word content for runtime generateDocument('docx', …): title + heading / paragraph / table blocks. Charts are appended as images. */
export function reportToDocx(spec, {charts = []} = {}) {
  const blocks = [];
  const push = b => { if (blocks.length < 196) blocks.push(b); };
  if (spec.subtitle) push({type: 'paragraph', text: clip(spec.subtitle, 300)});
  for (const sec of spec.sections || []) {
    push({type: 'heading', text: clip(sec.title, 200)});
    for (const p of sec.paragraphs || []) push({type: 'paragraph', text: clip(p, 9000)});
    for (const b of sec.bullets || []) push({type: 'paragraph', text: '• ' + clip(b, 2000)});
    if (sec.table?.length) push({type: 'table', rows: sec.table.slice(0, 100).map(r => r.slice(0, 20).map(cellText))});
  }
  push({type: 'paragraph', text: clip(spec.disclaimer || DISCLAIMER, 2000)});
  if (charts.length) { push({type: 'heading', text: '附图'}); push({type: 'paragraph', text: charts.map(c => clip(c, 120)).join('；') + '。'}); } // the chart images are appended right after this
  return JSON.stringify({title: clip(spec.title, 200), blocks});
}

/** PowerPoint content (classic slides: title + bullets / one table / cards). */
export function reportToPptx(spec) {
  const slides = [{title: clip(spec.title, 200), bullets: [clip(spec.subtitle, 300), clip(spec.summary || '', 900)].filter(Boolean)}];
  for (const sec of spec.sections || []) {
    const bullets = [...(sec.paragraphs || []), ...(sec.bullets || [])].map(x => clip(x, 300)).filter(Boolean);
    if (bullets.length) for (let i = 0; i < bullets.length && slides.length < 46; i += 6) slides.push({title: clip(sec.title + (i ? '（续）' : ''), 200), bullets: bullets.slice(i, i + 6)});
    if (sec.table?.length > 1 && slides.length < 48) {
      const cols = Math.min(5, sec.table[0].length), rows = sec.table.slice(0, 8).map(r => r.slice(0, cols).map(c => clip(c, 110) || '—'));
      slides.push({title: clip(sec.title + ' · 数据', 200), table: rows});
    }
  }
  slides.push({title: '声明', bullets: [clip(spec.disclaimer || DISCLAIMER, 900)]});
  return JSON.stringify({slides: slides.slice(0, 50)});
}

/** Standalone HTML (inline CSS, QuanK colours). charts: {kline: '<svg…>', returns: '<svg…>'} generated locally. */
export function reportToHtml(spec, {charts = {}} = {}) {
  const table = t => `<table><thead><tr>${t[0].map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.slice(1).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const body = (spec.sections || []).map(sec => `<section><h2>${esc(sec.title)}</h2>${(sec.paragraphs || []).map(p => `<p>${esc(p)}</p>`).join('')}${sec.bullets?.length ? `<ul>${sec.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}${sec.chart && charts[sec.chart] ? `<figure class="chart">${charts[sec.chart]}</figure>` : ''}${sec.table?.length ? table(sec.table) : ''}</section>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(spec.title)}</title><style>
body{margin:0;background:#f5f7fc;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#1f2a44}
main{max-width:980px;margin:0 auto;padding:32px 28px 48px}
header{padding:26px 28px;border-radius:18px;background:linear-gradient(135deg,#0B2BA6,#2F62F5 60%,#8C7CFF);color:#fff}
header h1{margin:0 0 6px;font-size:26px}header p{margin:0;opacity:.9;font-size:13.5px}
section{margin-top:18px;padding:18px 22px;border-radius:16px;background:#fff;border:1px solid #e6ecf6}
h2{margin:0 0 10px;font-size:17px;color:#0B2BA6}p,li{font-size:14px;line-height:1.75}ul{padding-left:20px;margin:6px 0}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}th,td{border-bottom:1px solid #eef1f6;padding:7px 8px;text-align:left;vertical-align:top}th{background:#f3f6ff;color:#4c5a85}
figure.chart{margin:10px 0 0;padding:6px;border:1px solid #eef1f6;border-radius:12px;overflow:hidden}figure.chart svg{width:100%;height:auto}
footer{margin-top:18px;font-size:12px;color:#8a94ad;line-height:1.7}
</style></head><body><main><header><h1>${esc(spec.title)}</h1><p>${esc(spec.subtitle || '')}</p></header>${body}<footer>${esc(spec.disclaimer || DISCLAIMER)}</footer></main></body></html>`;
}

// ---------- M4: exports ----------
/** Daily briefing (store.data.briefings[0]) -> report structure. */
export function briefingReport(b) {
  if (!b) throw new Error('还没有生成过简报，请先生成今日简报');
  const sections = [];
  if (b.summary) sections.push({id: 'summary', title: '概述', paragraphs: [clip(b.summary, 2000)]});
  for (const s of b.sections || []) if (s.items?.length) sections.push({id: clip(s.id || s.title, 30), title: clip(s.title, 60), bullets: s.items.slice(0, 30).map(i => clip(i.text || i.title || '', 400)).filter(Boolean)});
  if (!sections.length) sections.push({id: 'empty', title: '今日简报', paragraphs: ['今天没有需要汇报的事项。']});
  const date = clip(b.day || '', 10);
  return {kind: 'briefing', title: `QuanK 每日简报 · ${date}`, subtitle: date, date, sections, summary: clip(b.summary || '', 160), gaps: [], disclaimer: '本简报由 QuanK 根据本机工作空间自动整理。'};
}

/** Portfolio review: market overview, holdings, signal distribution, recent signal changes and notices. */
export function reviewReport({date = '', overview = null, pool = [], holdings = [], alerts = [], notices = []} = {}) {
  const sections = [];
  if (overview?.indices?.length) {
    const b = overview.breadth || {};
    sections.push({id: 'market', title: '市场概况', table: [['指数', '点位', '涨跌幅'], ...overview.indices.slice(0, 6).map(i => [clip(i.name, 12), num(i.price), pct(i.pct)])],
      paragraphs: [`两市成交 ${money(overview.amount)}；上涨 ${b.up ?? '—'} 家、下跌 ${b.down ?? '—'} 家；涨停 ${b.limitUp ?? '—'}、跌停 ${b.limitDown ?? '—'}。`]});
  }
  const held = (holdings || []).filter(h => h && fin(h.shares) && h.shares > 0), nameOf = c => (pool.find(p => p.code === c)?.name) || c;
  if (held.length) {
    const tv = held.reduce((s, h) => s + (fin(h.value) ? h.value : 0), 0), tp = held.reduce((s, h) => s + (fin(h.pnl) ? h.pnl : 0), 0);
    sections.push({id: 'holdings', title: '持仓', table: [['股票', '股数', '成本', '现价', '市值', '浮动盈亏', '盈亏比例'], ...held.map(h => [`${nameOf(h.code)} ${h.code}`, String(h.shares), num(h.cost), num(h.price), money(h.value), money(h.pnl), pct(h.pnlPct)]), ['合计', '', '', '', money(tv), money(tp), '']],
      paragraphs: held.filter(h => fin(h.pnlPct) && h.pnlPct <= -10).map(h => `${nameOf(h.code)} 浮亏 ${pct(h.pnlPct)}，请对照策略档位确认是否需要暂停加仓。`)});
  }
  if (pool.length) {
    const rows = pool.map(p => [`${p.name || p.code} ${p.code}`, p.last?.action ? actionLabel(p.last.action, p.last.actionText) : '未计算', num(p.last?.score, 1), p.last?.multiplier == null ? '—' : num(p.last.multiplier, 1) + '×', pct(p.last?.changePct)]);
    const count = k => pool.filter(p => k.test(String(p.last?.action || ''))).length;
    sections.push({id: 'signals', title: '股票池信号', table: [['股票', '档位', '综合分', '倍率', '涨跌'], ...rows], paragraphs: [`共 ${pool.length} 只：买点 ${count(/BUY/)} 个，风控提示 ${count(/SELL/)} 个，其余观望或正常定投。`]});
  }
  const ch = (alerts || []).filter(a => a.kind === 'change').slice(0, 15);
  if (ch.length) sections.push({id: 'changes', title: '近期信号变化', bullets: ch.map(a => `${a.timeText || ''} ${a.name || a.code}：${actionLabel(a.from)} → ${actionLabel(a.to, a.toText)}${a.reason ? '（' + clip(a.reason, 80) + '）' : ''}`.trim())});
  const imp = (notices || []).filter(n => n.level !== 'low').slice(0, 15);
  if (imp.length) sections.push({id: 'notices', title: '自选股重要公告', table: [['日期', '股票', '类型', '标题'], ...imp.map(n => [n.date, n.name || n.code, n.label, clip(n.title, 100)])]});
  const risks = [...held.filter(h => fin(h.pnlPct) && h.pnlPct <= -20).map(h => `${nameOf(h.code)} 浮亏 ${pct(h.pnlPct)}`), ...pool.filter(p => /SELL/.test(String(p.last?.action || ''))).map(p => `${p.name || p.code} 处于「${actionLabel(p.last.action, p.last.actionText)}」`), ...imp.filter(n => n.type === 'risk').slice(0, 5).map(n => `${n.name || n.code} 风险公告：${clip(n.title, 60)}`)];
  sections.push({id: 'risk', title: '风险提示', bullets: risks.length ? risks : ['暂未发现需要特别留意的持仓或公告风险。']});
  if (sections.length === 1) sections.unshift({id: 'empty', title: '组合复盘', paragraphs: ['还没有股票池、持仓或行情数据。启动量化引擎并添加股票后再导出。']});
  return {kind: 'review', title: `QuanK 组合复盘 · ${date}`, subtitle: date, date, sections, summary: sections.find(s => s.id === 'signals')?.paragraphs?.[0] || '', gaps: [], disclaimer: DISCLAIMER};
}

/** Engine analysis report ({title, date, summary, metrics, warnings, items, md}) -> report structure. */
export function engineReport(r) {
  if (!r) throw new Error('报告不存在');
  const sections = [];
  if (r.summary) sections.push({id: 'summary', title: '概述', paragraphs: [clip(r.summary, 2000)]});
  if (r.metrics?.length) sections.push({id: 'metrics', title: '关键指标', table: [['指标', '数值'], ...r.metrics.slice(0, 40).map(m => [clip(m.label, 40), clip(m.value, 60)])]});
  if (r.warnings?.length) sections.push({id: 'warnings', title: '告警', bullets: r.warnings.slice(0, 20).map(w => clip(w, 300))});
  if (r.items?.length) sections.push({id: 'items', title: '建议', bullets: r.items.slice(0, 30).map(i => `${NOTICE_LEVEL[i.level] || clip(i.level, 6) || '建议'}｜${clip(i.title, 80)}${i.detail ? '：' + clip(i.detail, 200) : ''}`)});
  if (r.md) {
    const paras = String(r.md).split(/\n+/).map(l => l.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '').replace(/^[-*]\s+/, '• ').trim()).filter(l => l && !/^\|?\s*-{3,}/.test(l)).slice(0, 120);
    if (paras.length) sections.push({id: 'body', title: '正文', paragraphs: paras.map(p => clip(p, 1500))});
  }
  const date = clip(r.date || '', 10);
  return {kind: 'engine', title: `${clip(r.title || '量化报告', 60)}${date ? ' · ' + date : ''}`, subtitle: date, date, sections: sections.length ? sections : [{id: 'empty', title: '报告', paragraphs: ['报告没有内容。']}], summary: clip(r.summary || '', 160), gaps: [], disclaimer: DISCLAIMER};
}

// ---------- M3: research library ----------
export const LIBRARY_KINDS = {report: '研报', notice: '公告', note: '笔记', doc: '文档', export: '导出'};
export const LIBRARY_LIMIT = 500;
export function normalizeNote({title = '', text = ''} = {}) {
  const t = String(text || '').trim();
  if (t.length < 2) throw new Error('笔记内容太短');
  if (t.length > 8000) throw new Error('笔记最多 8000 字');
  if (/密码|口令|passw|验证码|api[ _-]?key|secret|私钥|sk-[a-z0-9]{6,}/i.test(t)) throw new Error('不保存密码、密钥等敏感信息');
  return {title: clip(title, 60) || clip(t, 30), text: t};
}
/** Filter + sort the library (newest first). query matches title, summary, tags, stock name / code and note text. */
export function libraryItems(list, {code = '', kind = '', query = '', limit = 50} = {}) {
  const q = String(query || '').trim().toLowerCase(), terms = q ? q.split(/\s+/) : [];
  return (list || []).filter(x => (!code || x.code === code) && (!kind || x.kind === kind) && (!terms.length || terms.every(t => [x.title, x.summary, x.name, x.code, x.text, ...(x.tags || [])].join(' ').toLowerCase().includes(t))))
    .sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, Math.max(1, Math.min(200, limit)));
}
