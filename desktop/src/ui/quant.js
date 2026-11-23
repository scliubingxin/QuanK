// [q1] 量化 page: engine status, stock pool cards, stock detail. Field names are generic; the private engine's
// wb-engine.json maps its own response onto them (see src/shared/quant.js).
import { escape } from './markdown.js';
import { actionLabel, actionTone, normalizeWatch, describeWatch, WATCH_INTERVALS, normalizeReportAuto, describeReportAuto, summaryText } from '../shared/quant.js';
import { plazaIcon } from './preset-catalog.js';
import { sparkSvg } from './spark.js'; // [fin2]
import { klineBox, opsMarks } from './market.js'; // [F1]
import { researchBox, researchLibraryBox } from './research.js'; // [F2]
import { knowledgeBox, knowledgeLibraryBox } from './knowledge.js'; // [F3]
import { portfolioBox } from './portfolio.js'; // [F4]

const STATUS = {stopped: ['已停止', ''], starting: ['启动中', 't-blue'], running: ['运行中', 't-green'], error: ['出错', 't-red']};
const f = (v, d = 2) => v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d).replace(/\.00$/, '');
const pct = v => v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${f(v)}%`;
const val = (fm, n) => String((typeof fm?.get === 'function' ? fm.get(n) : fm?.elements?.[n]?.value ?? fm?.[n]?.value) ?? '');
const on = (fm, n) => typeof fm?.get === 'function' ? fm.get(n) !== null : !!(fm?.elements?.[n]?.checked ?? fm?.[n]?.checked);

const remoteLabel = R => { try { const u = new URL(R?.url || ''); if (R?.port) u.port = String(R.port); return u.host + (u.pathname === '/' ? '' : u.pathname); } catch { return R?.url || '尚未填写服务器地址'; } };
function engineCard(q, {action, date}) {
  const [label, tone] = STATUS[q.status] || STATUS.stopped, remote = q.mode === 'remote';
  const btn = q.status === 'running' ? action('停止引擎', 'quantStop') + action('重启', 'quantRestart') : q.status === 'starting' ? '' : action('启动引擎', 'quantStart', '', 'primary');
  return `<div class="card plaza-card quant-engine"><div class="pc-head">${plazaIcon('量化')}<div class="pc-title"><h3>${escape(q.title || (remote ? '远程量化引擎' : '本机量化引擎'))}</h3><small>${remote ? escape(remoteLabel(q.remote)) : q.source ? escape(q.source) : '尚未导入策略项目'}</small></div><span class="pc-tag ${tone}">${label}</span></div>
${q.error ? `<p class="task-error">${escape(q.error)}</p>` : ''}${q.fellBack ? '<p class="q-fallback">远程服务器连不上，本次已切换到本地引擎；恢复后点「重启」重新连接远程引擎。</p>' : ''}
<p class="pc-desc">${remote ? `远程引擎 · HTTPS · 鉴权密钥${q.remote?.hasToken ? '已保存' : '未填写'}${q.remote?.lastRemote ? ' · 上次连接 ' + escape(date(q.remote.lastRemote)) : ''}${q.remote?.fallback !== false ? ' · 离线回退本地' : ''}` : q.installed ? `已同步 ${q.files || 0} 个文件${q.lastSync ? ' · ' + escape(date(q.lastSync)) : ''} · Python：${escape(q.python || q.pythonFound || '未找到')}` : '需要添加微信 findingnoone 获取量化策略和支持。'}</p>
<p class="q-watch"><span class="${normalizeWatch(q.watch).enabled ? 'on' : 'off'}">${escape(describeWatch(q.watch))}</span>${q.lastWatch ? `<span>上次检查 ${escape(date(q.lastWatch))}</span>` : ''}${q.watchError ? `<span class="err">${escape(q.watchError)}</span>` : ''}</p>
<div class="pc-actions">${q.installed || remote ? '' : action('添加微信', 'quantContact', '', 'primary')}${btn}${remote ? action('测试连接', 'quantTestRemote', '', 'secondary') : action(q.installed ? '从源目录同步' : '导入策略项目', 'quantSync', '', 'secondary')}${action('盯盘与提醒', 'quantWatch')}${q.features?.plan ? action('定投计划', 'quantPlan') : ''}${action('设置', 'quantSettings')}${action('日志', 'quantLog')}</div></div>`;
}

// [v45q] company logo (data URL fetched when the stock was added), letter badge otherwise
const LOGO_OK = /^data:image\/(png|jpeg|gif|webp|x-icon);base64,[A-Za-z0-9+\/=]+$/;
export const stockLogo = (src, name) => LOGO_OK.test(src || '') ? `<span class="pc-icon q-logo" aria-hidden="true"><img src="${src}" alt=""></span>` : plazaIcon(name);
function stockCard(s, {action, date, holding, logo = '', live = null}) {
  const l = s.last || {}, tone = actionTone(l.action);
  return `<div class="card plaza-card quant-stock q-${tone}" data-quant="${escape(s.code)}"><div class="pc-head">${stockLogo(logo, s.name || s.code)}<div class="pc-title"><h3>${escape(s.name || s.code)}</h3><small>${escape(s.code)}${l.date ? ' · ' + escape(l.date) : ''}</small></div>${l.action ? `<span class="q-action q-${tone}">${escape(actionLabel(l.action, l.actionText))}</span>` : ''}</div>
<div class="q-nums"><span><b>${f(l.score, 1)}</b>综合分</span><span><b>${l.multiplier == null ? '—' : f(l.multiplier, 1) + '×'}</b>倍率</span><span><b data-live-price="${escape(s.code)}">${f(live?.price ?? l.price)}</b>现价${live ? '<em class="q-live">实时</em>' : ''}</span><span data-live-tone class="${((live?.pct ?? l.changePct) || 0) >= 0 ? 'up' : 'down'}"><b data-live-pct="${escape(s.code)}">${pct(live?.pct ?? l.changePct)}</b>涨跌</span></div>
${sparkSvg(s.spark, {w: 260, h: 42, cls: 'q-spark', id: s.code})}${holdingLine(holding)}
<div class="pc-actions">${action('详情', 'quantOpen', s.code, 'primary')}${action('刷新', 'quantRefresh', s.code)}${action('AI 研判', 'quantInsight', s.code)}${action('移出', 'quantRemove', s.code)}</div>
<small class="q-when">${l.at ? '更新于 ' + escape(date(l.at)) : '尚未计算'}</small></div>`;
}

// [v0.53] 投研资料库、投研知识库、日报与复盘 moved to 资料库 → 投研资料
function researchLink(state, {action}) {
  const n = (state.research?.library || []).length, d = state.dataset?.stats?.total || 0;
  return `<section class="q-box q-research-link"><div class="plaza-section-head"><h2>投研资料</h2><small>研报、公告、笔记、日报复盘和训练数据已移到「资料库 → 投研资料」，按股票分类整理 · ${n} 份资料 · ${d} 条训练数据</small><span class="q-head-tools">${action('打开投研资料', 'rpOpen', '', 'primary')}</span></div></section>`;
}
export function quantPage(state, {action, heading, empty, date, open = '', detail = null, panel = false, section, stockTitle}) {
  const q = state.quant || {status: 'stopped', pool: []};
  if (open) return quantDetail(q, open, detail, {action, date, research: state.research, panel, section, stockTitle});
  const pool = q.pool || [], stats = [[pool.length, '只自选'], [pool.filter(p => ['BUY', 'STRONG_BUY'].includes(p.last?.action)).length, '个买点'], [pool.filter(p => ['SELL', 'STRONG_SELL'].includes(p.last?.action)).length, '个风控提示']];
  const head = heading('', '让策略在本机运行，信号一眼看清。', '档位、综合分与倍率来自你自己的私有策略，在本机计算；也可以直接在对话里问「600519 现在什么信号」「池子里谁是买点」。', action('＋ 添加股票', 'quantAdd', '', 'primary') + action('全部刷新', 'quantRefreshAll'), stats);
  const grid = pool.length ? `<div class="plaza-grid q-pool-grid">${pool.map(s => stockCard(s, {action, date, holding: q.holdings?.[s.code], logo: q.logos?.[s.code], live: state.market?.quotes?.[s.code]})).join('')}</div>`
    : q.status === 'running' ? empty('股票池是空的', '点「添加股票」输入 6 位代码。') : '<p class="empty-note">启动引擎后显示股票池。</p>';
  return `<div class="page quant-page">${head}<div class="plaza-grid quant-top">${engineCard(q, {action, date})}</div><section class="q-pool"><div class="plaza-section-head"><h2>股票池</h2><small>交易时段信号随行情变化；单只计算可能需要几十秒，结果缓存 2 分钟。</small></div>${grid}</section>${holdingsBox(q, {action})}${portfolioBox(state.portfolio, {action})}${researchLink(state, {action})}${alertsBox(q, {action, date})}</div>`;
}

function quantDetail(q, code, d, {action, date, research = null, panel = false, section, stockTitle}) {
  const name = stockTitle || (q.pool || []).find(p => p.code === code)?.name || code;
  const knowledge = knowledgeBox(code, section);
  const bar = `<div class="miniapp-bar">${panel ? '' : action('← 股票池', 'quantClose')}<h2>${escape(name)} <small>${escape(code)}</small></h2><span class="miniapp-tools">${action('重新计算', 'quantRefresh', code)}${action('AI 研判', 'quantInsight', code, 'primary')}</span></div>`;
  if (!d || d.error) {
    const signalView = d?.error ? `<p class="task-error">${escape(d.error)}</p>` : '<p class="empty-note" id="quantLoading">正在计算信号…（首次可能需要半分钟）</p>';
    return `<div class="page quant-page">${bar}${section === 'graph' ? knowledge : ''}${signalView}</div>`;
  }
  const s = d.summary, tone = actionTone(s.action), bt = s.backtest || {};
  const kpi = (label, v, cls = '') => `<div class="q-kpi ${cls}"><small>${label}</small><b>${v}</b></div>`;
  const list = (title, items, cls = '') => items?.length ? `<section class="q-box ${cls}"><h3>${title}</h3><ul class="q-list">${items.map(x => `<li>${escape(String(x).replace(/\*\*/g, ''))}</li>`).join('')}</ul></section>` : ''; // [F1e]
  const factors = s.factors?.length ? `<section class="q-box q-factors"><h3>评分构成</h3><div class="qf-list">${s.factors.map(b => { const sc = Number(b.score), mx = Number(b.max), p = mx > 0 && Number.isFinite(sc) ? Math.max(0, Math.min(100, sc / mx * 100)) : null; return `<div class="qf-row${sc ? '' : ' zero'}"><div class="qf-top"><span class="qf-name">${escape(b.name)}</span><span class="qf-score"><b>${f(b.score, 1)}</b>${b.max ? `<small> / ${escape(String(b.max))}</small>` : ''}</span></div>${p != null ? `<div class="qf-bar"><i style="width:${p.toFixed(1)}%"></i></div>` : ''}${b.reason ? `<p>${escape(String(b.reason).replace(/\*\*/g, ''))}</p>` : ''}</div>`; }).join('')}</div></section>` : ''; // [F1e] cards with progress bars
  const inds = s.indicators?.length ? `<section class="q-box q-inds"><h3>指标</h3><div class="qi-grid">${s.indicators.map(x => `<div class="qi"><small>${escape(x.name)}</small><b class="${typeof x.value === 'number' && /涨跌|%/.test(x.name) ? (x.value >= 0 ? 'up' : 'down') : ''}">${f(x.value)}</b></div>`).join('')}</div></section>` : '';
  const ops = d.charts?.ops?.length ? `<section class="q-box"><h3>回测操作（最近 ${d.charts.ops.length} 次）</h3><div class="table-scroll"><table class="q-table"><thead><tr><th>日期</th><th>操作</th><th>价格</th><th>股数</th><th>金额</th><th>分</th><th>原因</th></tr></thead><tbody>${d.charts.ops.map(o => `<tr><td>${escape(o.date)}</td><td>${escape(o.action)}</td><td>${f(o.price)}</td><td>${f(o.shares, 0)}</td><td>${f(o.amount, 0)}</td><td>${f(o.score, 1)}</td><td>${escape(o.reason)}</td></tr>`).join('')}</tbody></table></div></section>` : '';
  const up = (s.changePct || 0) >= 0 ? 'up' : 'down';
  return `<div class="page quant-page">${bar}${section === 'graph' ? knowledge : ''}
<div class="q-hero q-${tone}"><div><span class="q-action q-${tone}">${escape(actionLabel(s.action, s.actionText))}</span><p>${escape(s.detail)}</p></div>
<div class="q-kpis">${kpi('综合分', f(s.score, 1) + (s.scoreRaw != null && s.scoreRaw !== s.score ? `<em>调整前 ${f(s.scoreRaw, 1)}</em>` : ''))}${kpi('倍率', s.multiplier == null ? '—' : f(s.multiplier, 1) + '×')}${kpi('现价', `<span data-live-price="${escape(code)}">${f(s.price)}</span>`, up)}${kpi('涨跌', `<span data-live-pct="${escape(code)}">${pct(s.changePct)}</span>`, up)}${kpi('模型概率', s.probPct == null ? '—' : f(s.probPct, 1) + '%')}</div></div>
${s.advice ? `<p class="q-sizing">${escape(s.advice)}</p>` : ''}${holdingDetail(d.holding, code, q, {action})}
<div class="q-kpis q-bt">${kpi('策略收益', pct(bt.smartPct))}${kpi('基准收益', pct(bt.blindPct))}${kpi('超额', pct(bt.excess))}${kpi('胜率', bt.winRate == null ? '—' : f(bt.winRate, 0) + '%')}${kpi('交易次数', f(bt.trades, 0))}${kpi('最大回撤', bt.maxDrawdown == null ? '—' : pct(-Math.abs(bt.maxDrawdown)))}</div>
${klineBox(code, {marks: opsMarks(d.charts?.ops)})}${returnBox(d.charts, bt, s.plan ? `定投频率：${s.plan}` : '')}${section === 'graph' ? '' : knowledge}<div class="q-charts" id="quantCharts" data-code="${escape(code)}"></div>
<div class="q-grid2">${list('信号理由', s.reasons)}${list('约束与风控', s.gates, 'q-gates')}</div>${factors}${inds}${ops}
${researchBox(code, research, {action, date})}
<p class="auto-note">数据由本机私有引擎计算${s.plan ? `（${escape(s.plan)}）` : ''}${s.model ? `，模型 ${escape(s.model)}` : ''}。仅供研究，不构成投资建议。</p></div>`;
}

/** [v46] Backtest curve grid -> return % per day for both plans: (value - invested) / invested. The plain plan uses its own
 *  invested column when the engine reports one, otherwise the smart plan's. Rows without a positive investment are skipped. */
export function backtestReturns(curve) {
  if (!Array.isArray(curve) || curve.length < 2) return {rows: [], labels: {}, ownCostB: false, withCash: false};
  const [h, ...rows] = curve, r = (v, k) => v === null || v === undefined || !(k > 0) ? null : Math.round((v - k) / k * 1e4) / 100;
  // [v47.1] extra columns after 投入 are found by name: "...投入" = the plain plan's own investment, "...现金" = the smart plan's uninvested cash
  const iCash = h.findIndex((x, i) => i > 3 && /现金$/.test(String(x))), iCostB = h.findIndex((x, i) => i > 3 && !/现金$/.test(String(x)));
  const ownCostB = iCostB > 0, withCash = iCash > 0, plus = (v, c) => v === null || v === undefined ? v : v + (Number.isFinite(c) ? c : 0);
  const strip = s => String(s || '').replace(/市值$/, '');
  return {ownCostB, withCash, labels: {a: `${strip(h[1]) || '策略'}收益率`, b: `${strip(h[2]) || '基准'}收益率`, title: `回测：${strip(h[1]) || '策略'} vs ${strip(h[2]) || '基准'}收益率`},
    rows: rows.map(x => ({date: x[0], a: r(withCash ? plus(x[1], x[iCash]) : x[1], x[3]), b: r(x[2], ownCostB ? x[iCostB] : x[3])})).filter(x => x.a !== null || x.b !== null)};
}
/** [v46] Pure-SVG return chart (no chart frame, no row-count header). Presentation is inline: the app-wide
 *  `svg{width:18px;stroke:currentColor}` icon rule must not shrink it or outline the hover columns. */
export function niceTicks(lo, hi, n = 5) {
  const raw = (hi - lo) / Math.max(1, n - 1), mag = 10 ** Math.floor(Math.log10(raw || 1)), step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(k => k >= raw) || raw;
  const out = [], end = Math.ceil(hi / step - 1e-9) * step; for (let v = Math.floor(lo / step + 1e-9) * step; v <= end + step * 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}
export function returnSvg(rows, {w = 960, h = 300, labels = {}} = {}) {
  const pts = (rows || []).filter(x => x && (Number.isFinite(x.a) || Number.isFinite(x.b)));
  if (pts.length < 2) return '<p class="empty-note">回测数据不足，暂时画不出收益率曲线。</p>';
  const padL = 56, padR = 16, top = 14, bot = 28, H = h - top - bot, vals = pts.flatMap(x => [x.a, x.b]).filter(Number.isFinite);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals)), lo = ticks[0], hi = ticks.at(-1) > ticks[0] ? ticks.at(-1) : ticks[0] + 1;
  const X = i => padL + (w - padL - padR) * i / (pts.length - 1), Y = v => top + (hi - v) / (hi - lo) * H;
  const line = k => pts.reduce((s, p, i) => Number.isFinite(p[k]) ? s + (s && Number.isFinite(pts[i - 1]?.[k]) ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p[k]).toFixed(1) : s, '');
  const TX = (x, y, t, a = 'end', c = '#8a94ad', wt = 400) => `<text x="${x}" y="${y}" style="font-family:-apple-system,'PingFang SC',sans-serif;font-size:11px;font-weight:${wt};fill:${c};stroke:none;text-anchor:${a}">${t}</text>`;
  const fmt = v => `${v > 0 ? '+' : ''}${Number.isInteger(v) ? v : v.toFixed(1)}%`;
  let s = `<svg class="q-return-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escape(labels.title || '回测收益率')}" style="display:block;width:100%;height:auto;max-height:340px;fill:none;stroke:none;overflow:visible">`;
  for (const v of ticks) {
    const zero = Math.abs(v) < 1e-9;
    s += `<line x1="${padL}" x2="${w - padR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" style="stroke:${zero ? '#94a3b8' : '#eef1f6'};stroke-width:${zero ? 1.2 : 1};${zero ? '' : 'stroke-dasharray:3 4'}"/>` + TX(padL - 8, Y(v) + 4, zero ? '0%' : fmt(v), 'end', zero ? '#475569' : '#8a94ad', zero ? 600 : 400);
  }
  const step = Math.max(1, Math.ceil(pts.length / 7));
  for (let i = 0; i < pts.length; i += step) s += TX(X(i), h - 8, escape(String(pts[i].date).slice(0, 10)), 'middle');
  s += `<path d="${line('b')}" style="fill:none;stroke:#94a3b8;stroke-width:1.6;stroke-linejoin:round"/><path d="${line('a')}" style="fill:none;stroke:#2f62f5;stroke-width:2;stroke-linejoin:round"/>`;
  const cw = (w - padL - padR) / pts.length;
  pts.forEach((p, i) => { s += `<rect x="${(X(i) - cw / 2).toFixed(1)}" y="${top}" width="${cw.toFixed(2)}" height="${H}" style="fill:#fff;fill-opacity:0;stroke:none"><title>${escape(String(p.date))} ${escape(labels.a || '策略')} ${pct(p.a)} ${escape(labels.b || '基准')} ${pct(p.b)}</title></rect>`; });
  return s + '</svg>';
}
function returnBox(charts, bt = {}, plan = '') {
  const r = backtestReturns(charts?.curve);
  if (!r.rows.length) return '';
  const last = r.rows.at(-1), cls = v => (v || 0) >= 0 ? 'up' : 'down';
  // [v47.1] an engine curve without cash holds only the shares' market value: its last point then disagrees with the
  // backtest summary (which counts the unspent reserve). Say so instead of showing a misleading number silently.
  const off = !r.withCash && Number.isFinite(Number(bt?.smartPct)) && Number.isFinite(last.a) && Math.abs(last.a - Number(bt.smartPct)) > 1;
  return `<section class="q-box q-return"><div class="q-return-head"><h3>${escape(r.labels.title)}</h3>${plan ? `<small class="q-return-plan">${escape(plan)}</small>` : ''}<span class="q-legend"><i class="a"></i>${escape(r.labels.a)} <b class="${cls(off ? Number(bt.smartPct) : last.a)}">${pct(off ? Number(bt.smartPct) : last.a)}</b><i class="b"></i>${escape(r.labels.b)} <b class="${cls(last.b)}">${pct(last.b)}</b></span></div>${returnSvg(r.rows, {labels: r.labels})}${off ? `<p class="q-return-note warn">正在运行的引擎是旧版策略代码，回测曲线没有包含未投出的现金，只反映持仓市值（曲线终点 ${pct(last.a)}）；上方收益率已按期末总资产计算（${pct(Number(bt.smartPct))}）。<button type="button" class="link" data-action="quantSyncRestart">同步策略代码并重启引擎</button>后曲线会改为含现金口径。</p>` : ''}${r.ownCostB ? '' : '<p class="q-return-note">引擎未提供普通定投的累计投入，普通定投收益率按同期智能定投投入计算。</p>'}</section>`;
}

/** Dashboard objects for mountDashboard(). [v46] The price / score block was removed and the backtest curve is drawn
 *  inline as a return-% SVG (returnBox), so nothing is mounted in a chart frame any more. Kept for callers. */
export function quantDashboards(code, charts) {
  return [];
}
export function quantAddForm() {
  return `<label>公司名称或股票代码<input name="code" required maxlength="40" placeholder="例如 宁德时代、茅台 或 600519"></label><p class="muted">输入公司名称会自动联网查找代码、名称和公司标志；也可以直接在对话里说「添加宁德时代」。</p>`;
}
export const quantAddPayload = fm => ({action: 'addStock', code: val(fm, 'code').trim(), name: val(fm, 'name').trim()});
export function quantSettingsForm(q) {
  const R = q.remote || {}, remote = q.mode === 'remote';
  // [v0.55] 引擎来源：本地策略项目（子进程）或云端服务（HTTPS + 鉴权密钥）
  return `<fieldset class="q-mode"><legend>引擎来源</legend>
<label class="check"><input type="radio" name="mode" value="local" ${remote ? '' : 'checked'}> 本地引擎：在本机运行策略项目（离线可用）</label>
<label class="check"><input type="radio" name="mode" value="remote" ${remote ? 'checked' : ''}> 远程引擎：读取云端服务器的信号</label></fieldset>
<div class="q-remote-fields">
<label>服务器地址<input name="remoteUrl" value="${escape(R.url || '')}" placeholder="https://quant.example.com" autocomplete="off" spellcheck="false"></label>
<label>端口（可选，默认 443）<input name="remotePort" type="number" min="1" max="65535" value="${escape(R.port ?? '')}" placeholder="443"></label>
<label>鉴权密钥（Token）<input name="remoteToken" type="password" autocomplete="new-password" placeholder="${R.hasToken ? '已保存，留空不修改' : '服务端签发的访问密钥'}"></label>
${R.hasToken ? '<label class="check"><input type="checkbox" name="clearToken"> 清除已保存的密钥</label>' : ''}
<details class="q-remote-login"><summary>服务端仍要求账号登录（可选）</summary>
<label>用户名<input name="remoteUser" value="${escape(R.user || '')}" autocomplete="off"></label>
<label>密码<input name="remotePass" type="password" autocomplete="new-password" placeholder="${R.hasPass ? '已保存，留空不修改' : ''}"></label></details>
<label class="check"><input type="checkbox" name="remoteFallback" ${R.fallback !== false ? 'checked' : ''}> 连不上服务器时自动切换到本地引擎（需已导入策略项目）</label>
<p class="hint">只接受 HTTPS 地址，并校验服务器证书、拒绝跳转，防止信号和账号被中间人篡改。每次请求都在 Authorization 请求头里带上 Bearer 密钥；密钥和密码用系统钥匙串加密保存在本机，不写入任何配置文件，也不会显示在界面或对话里。服务器需要提供 /wb-engine.json 描述文件（与本地策略项目相同）。</p>
</div>
<label>Python 解释器（需装好引擎声明的依赖包）<input name="python" value="${escape(q.python || '')}" placeholder="${escape(q.pythonFound || '自动查找')}"></label>
<label>AI 研判<select name="ai"><option value="willbuddy" ${q.ai !== 'none' ? 'selected' : ''}>使用 QuanK 当前配置的模型</option><option value="none" ${q.ai === 'none' ? 'selected' : ''}>关闭（只用算法结论）</option></select></label>
<label class="check"><input type="checkbox" name="autoStart" ${q.autoStart !== false ? 'checked' : ''}> 需要时自动启动引擎</label>
<label class="check"><input type="checkbox" name="importHoldings" ${q.importHoldings ? 'checked' : ''}> 首次启动时从源项目导入持仓等设置（之后由本机引擎维护）</label>
<p class="hint">源目录：${escape(q.source || '尚未选择')}。同步时复制项目文件，但不复制数据库、密钥类配置、日志以及 wb-engine.json 里列出的文件。模型密钥会写入本机引擎目录的配置文件（仅你本人可读）。</p>`;
}
export const quantSettingsPayload = fm => {
  const mode = typeof fm?.get === 'function' ? fm.get('mode') : (fm?.elements?.mode?.value ?? [...(fm?.querySelectorAll?.('input[name="mode"]') || [])].find(x => x.checked)?.value);
  const port = val(fm, 'remotePort').trim();
  const base = {action: 'settings', python: val(fm, 'python'), ai: val(fm, 'ai') || 'willbuddy', autoStart: on(fm, 'autoStart'), importHoldings: on(fm, 'importHoldings')};
  if (mode === null || mode === undefined) return base; // no engine-source field in this form: leave mode and remote settings unchanged
  return {...base,
    mode: mode === 'remote' ? 'remote' : 'local', remoteUrl: val(fm, 'remoteUrl').trim(), remotePort: port === '' ? '' : Number(port), remoteToken: val(fm, 'remoteToken'), clearToken: on(fm, 'clearToken'),
    remoteUser: val(fm, 'remoteUser').trim(), remotePass: val(fm, 'remotePass'), remoteFallback: on(fm, 'remoteFallback')};
};

/** [q3] 盯盘与提醒 settings form (field names match quantWatchPayload). */
export function quantWatchForm(q) {
  const w = normalizeWatch(q?.watch);
  return `<label class="check"><input type="checkbox" name="enabled" ${w.enabled ? 'checked' : ''}> 开启盯盘：交易时段按频率重新计算股票池，档位变化写入「动态」</label>
<label>检查频率<select name="interval">${WATCH_INTERVALS.map(n => `<option value="${n}" ${n === w.interval ? 'selected' : ''}>每 ${n} 分钟重算信号</option>`).join('')}</select></label>
<label class="check"><input type="checkbox" name="premarket" ${w.premarket ? 'checked' : ''}> 工作日开盘前生成一份盘前量化简报</label>
<label>盘前简报时间<input type="time" name="premarketTime" min="06:00" max="09:29" value="${escape(w.premarketTime)}"></label>
<label class="check"><input type="checkbox" name="notify" ${w.notify ? 'checked' : ''}> 信号变化和盘前简报发系统通知</label>
<p class="hint">交易时段指工作日 09:30–11:30、13:00–15:00（不识别法定节假日，休市日行情不变不会产生提醒）。需要 QuanK 保持运行。<b>价格是实时的</b>：交易时段行情页、股票池和个股详情每秒刷新价格，价格提醒每 3 秒检查一次。策略信号要跑完整的模型（每只股票几秒到几十秒，引擎还会缓存 2 分钟），所以最快每 1 分钟重算一次；股票越多耗时越长。</p>`;
}
export const quantWatchPayload = fm => ({action: 'watch', enabled: on(fm, 'enabled'), interval: Number(val(fm, 'interval')) || 15, premarket: on(fm, 'premarket'), premarketTime: val(fm, 'premarketTime') || '09:15', notify: on(fm, 'notify')});
function alertsBox(q, {action, date}) {
  const list = (q.alerts || []).filter(a => a.kind === 'change').slice(0, 8);
  if (!list.length) return '';
  return `<section class="q-alerts"><div class="plaza-section-head"><h2>最近信号变化</h2><small>盯盘发现的档位变化，也会出现在「动态」里。</small></div><ul>${list.map(a => `<li><time>${escape(date(a.time))}</time><b>${escape(a.name || a.code)}</b><span>${escape(actionLabel(a.from))}</span><span class="q-arrow">→</span><span class="q-action q-${actionTone(a.to)}">${escape(actionLabel(a.to, a.toText))}</span><span class="grow">${escape([a.score != null ? `综合分 ${a.score}` : '', a.reason].filter(Boolean).join(' · '))}</span>${action('详情', 'quantOpen', a.code)}</li>`).join('')}</ul></section>`;
}

// [q4] holdings & investment plan
const n0 = v => v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', {maximumFractionDigits: 0});
const money = v => v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const tone = v => (v || 0) >= 0 ? 'up' : 'down';
/** [v46] Compact money for KPI cards: >= 10 万 shown in 万 / 亿 with 2 decimals so large amounts never overflow the card. */
export function moneyShort(v, sign = false) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  const n = Number(v), a = Math.abs(n), sg = sign && n > 0 ? '+' : '';
  return sg + (a >= 1e8 ? (n / 1e8).toFixed(2) + '亿' : a >= 1e5 ? (n / 1e4).toFixed(2) + '万' : money(n));
}
function holdingLine(h) {
  if (!h || !h.shares) return h && !h.error ? '<p class="q-hold">未持仓</p>' : '';
  return `<p class="q-hold">持仓 ${n0(h.shares)} 股 · 成本 ${f(h.cost)}${h.pnlPct != null ? ` · <span class="${tone(h.pnlPct)}">${pct(h.pnlPct)}</span>` : ''}</p>`;
}
function holdingsBox(q, {action}) {
  if (!q.features?.holdings) return '';
  const H = q.holdings || {}, rows = (q.pool || []).map(p => ({p, h: H[p.code]})).filter(x => x.h);
  const tot = holdingTotalsUi(rows.map(x => x.h));
  const tools = action('刷新持仓', 'quantHoldings') + (q.features.record ? action('记录买卖', 'quantTrade', '', 'primary') : '');
  const body = rows.length ? `<div class="table-scroll"><table class="q-table q-hold-table"><thead><tr><th>股票</th><th>持仓（股）</th><th>成本</th><th>现价</th><th>市值</th><th>浮动盈亏</th><th></th></tr></thead><tbody>${rows.map(({p, h}) => `<tr><td><b>${escape(p.name || p.code)}</b> <small>${escape(p.code)}</small></td><td>${n0(h.shares)}</td><td>${f(h.cost)}</td><td>${f(h.price)}</td><td>${money(h.value)}</td><td class="${tone(h.pnl)}">${money(h.pnl)}${h.pnlPct != null ? ` <small>${pct(h.pnlPct)}</small>` : ''}</td><td>${action('详情', 'quantOpen', p.code)}</td></tr>`).join('')}</tbody>${tot.stocks ? `<tfoot><tr><th>合计 ${tot.stocks} 只</th><td></td><td></td><td></td><td>${money(tot.value)}</td><td class="${tone(tot.pnl)}">${money(tot.pnl)}</td><td></td></tr></tfoot>` : ''}</table></div>`
    : '<p class="empty-note">点「刷新持仓」从本机引擎读取各股票的持仓。</p>';
  return `<section class="q-box q-holdings"><div class="plaza-section-head"><h2>持仓与定投</h2><small>${q.plan?.label ? `定投计划：${escape(q.plan.label)} · ` : ''}只记录你在券商的实际成交，QuanK 不会替你下单。</small><span class="q-head-tools">${tools}</span></div>${body}</section>`;
}
function holdingTotalsUi(list) {
  const ok = list.filter(h => h && h.shares > 0), every = k => ok.length && ok.every(h => h[k] != null);
  return {stocks: ok.length, value: every('value') ? ok.reduce((n, h) => n + h.value, 0) : null, pnl: every('pnl') ? ok.reduce((n, h) => n + h.pnl, 0) : null};
}
function holdingDetail(h, code, q, {action}) {
  if (!h) return '';
  const kpi = (label, v, cls = '') => `<div class="q-kpi ${cls}"><small>${label}</small><b>${v}</b></div>`;
  const btns = q?.features?.record ? action('记录买入', 'quantTrade', `${code}:buy`, 'primary') + action('记录卖出', 'quantTrade', `${code}:sell`) : '';
  const log = h.log?.length ? `<div class="table-scroll"><table class="q-table"><thead><tr><th>日期</th><th>方向</th><th>价格</th><th>股数</th><th>金额</th><th>备注</th></tr></thead><tbody>${h.log.map(e => `<tr><td>${escape(e.date)} <small>${escape(e.time)}</small></td><td class="${e.side === 'buy' ? 'up' : 'down'}">${e.side === 'buy' ? '买入' : '卖出'}</td><td>${f(e.price)}</td><td>${n0(e.shares)}</td><td>${money(e.amount)}</td><td>${escape(e.note)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty-note">还没有记录过成交。</p>';
  return `<section class="q-box q-holding"><div class="plaza-section-head"><h2>我的持仓</h2><small>${h.budget != null ? `单次计划 ${n0(h.budget)} 股 · ` : ''}已记录 ${n0(h.trades)} 笔成交</small><span class="q-head-tools">${btns}</span></div>
<div class="q-kpis q-hold-kpis">${kpi('持仓股数', n0(h.shares))}${kpi('成本价', f(h.cost))}${kpi('市值', moneyShort(h.value))}${kpi('浮动盈亏', moneyShort(h.pnl, true) + (h.pnlPct != null ? `<em>${pct(h.pnlPct)}</em>` : ''), tone(h.pnl))}${kpi('可用资金', h.cash == null ? '—' : h.cash < 0 ? '—' + `<em>已投入超出引擎预算 ${moneyShort(-h.cash)}</em>` : moneyShort(h.cash))}</div>${log}</section>`;
}
export function quantTradeForm(q, {code = '', side = 'buy', price = null, today = ''} = {}) {
  const lot = q?.features?.lot || 1;
  return `<label>股票<select name="code" required>${(q?.pool || []).map(p => `<option value="${escape(p.code)}" ${p.code === code ? 'selected' : ''}>${escape(p.name || p.code)} ${escape(p.code)}</option>`).join('')}</select></label>
<div class="form-row"><label>方向<select name="side"><option value="buy" ${side === 'buy' ? 'selected' : ''}>买入</option><option value="sell" ${side === 'sell' ? 'selected' : ''}>卖出</option></select></label><label>成交日期<input name="date" type="date" value="${escape(today)}"></label></div>
<div class="form-row"><label>成交价<input name="price" type="number" step="0.001" min="0" required value="${price ?? ''}"></label><label>股数（${lot} 的整数倍）<input name="shares" type="number" step="${lot}" min="${lot}" required></label></div>
<label>备注（可留空）<input name="note" maxlength="60"></label>
<p class="hint">只记录你在券商实际成交的买卖，用来更新本机引擎里的持仓、成本和后续仓位建议；QuanK 不会替你下单。</p>`;
}
export const quantTradePayload = fm => ({action: 'record', code: val(fm, 'code'), side: val(fm, 'side') === 'sell' ? 'sell' : 'buy', price: Number(val(fm, 'price')), shares: Number(val(fm, 'shares')), date: val(fm, 'date'), note: val(fm, 'note').trim()});
export function quantPlanForm(q) {
  const opts = q?.planOptions || [], cur = q?.plan || {};
  return `<p class="hint">当前：${escape(cur.label || '未读取')}${cur.maxMultiplier != null ? ` · 最高 ${cur.maxMultiplier} 倍` : ''}</p>
<div class="form-row"><label>周期<select name="type">${opts.map(o => `<option value="${escape(o.type)}" ${o.type === cur.type ? 'selected' : ''}>${escape(o.label)}（${o.min}–${o.max} 次）</option>`).join('')}</select></label><label>次数<input name="times" type="number" min="1" max="100" required value="${cur.times ?? 1}"></label></div>
<p class="hint">修改后，所有股票的信号和仓位建议会按新的定投节奏重新计算。</p>`;
}
export const quantPlanPayload = fm => ({action: 'planSet', type: val(fm, 'type'), times: Number(val(fm, 'times'))});

// [q5] 日报与复盘
export function reportsBox(q, {action, date}) {
  const defs = q.reportDefs || [];
  if (!defs.length) return '';
  const cards = defs.map(d => {
    const r = q.reports?.[d.id], warn = r?.warnings?.length;
    const tag = r ? `<span class="pc-tag ${r.ok ? (warn ? 't-orange' : 't-green') : 't-red'}">${r.ok ? (warn ? '有告警' : '已生成') : '失败'}</span>` : '';
    return `<div class="card plaza-card q-report"><div class="pc-head">${plazaIcon(d.title)}<div class="pc-title"><h3>${escape(d.title)}</h3><small>${r ? `${escape(date(r.at))}${r.date ? ' · ' + escape(r.date) : ''}` : '尚未生成'}${d.schedule === 'daily' ? ' · 每日' : ' · 手动'}</small></div>${tag}</div>
${r?.metrics?.length ? `<div class="q-metrics">${r.metrics.map(m => `<span><b>${escape(m.value)}</b>${escape(m.label)}</span>`).join('')}</div>` : ''}
<p class="pc-desc">${escape(r ? (r.ok ? summaryText(r.summary) || '报告已生成本机快照，点「查看」阅读完整正文与指标。' : r.error || '生成失败') : '点「生成」在本机运行引擎自带的分析脚本。')}</p>
${(r?.warnings || []).map(w => `<p class="task-error">${escape(w)}</p>`).join('')}
<div class="pc-actions">${action(r ? '重新生成' : '生成', 'quantReportRun', d.id, 'primary')}${r?.ok ? action('查看', 'quantReport', d.id) : ''}</div></div>`;
  }).join('');
  return `<section class="q-reports"><div class="plaza-section-head"><h2>日报与复盘</h2><small>${escape(describeReportAuto(q.reportAuto))} · 报告由引擎自带的分析脚本在本机生成。</small><span class="q-head-tools">${action('自动生成', 'quantReportAuto')}</span></div><div class="plaza-grid">${cards}</div></section>`;
}
/** Report header for the viewer modal (metrics, warnings, suggestions). The markdown body is rendered by the caller. */
export function quantReportDetail(r) {
  if (!r) return '';
  const LV = {high: 't-red', medium: 't-orange', low: 't-blue'};
  return `<p class="hint">${escape(r.title || '')}${r.date ? ' · ' + escape(r.date) : ''} · 生成用时 ${r.ms ? Math.round(r.ms / 1000) + ' 秒' : '—'}</p>
${r.metrics?.length ? `<div class="q-metrics">${r.metrics.map(m => `<span><b>${escape(m.value)}</b>${escape(m.label)}</span>`).join('')}</div>` : ''}
${r.summary ? `<p class="q-report-summary">${escape(summaryText(r.summary))}</p>` : ''}${(r.warnings || []).map(w => `<p class="task-error">${escape(w)}</p>`).join('')}
${r.items?.length ? `<ul class="q-report-items">${r.items.map(x => `<li><span class="pc-tag ${LV[x.level] || ''}">${escape(x.level || '建议')}</span><b>${escape(x.title)}</b>${x.detail ? `<small>${escape(x.detail)}</small>` : ''}</li>`).join('')}</ul>` : ''}`;
}
export function quantReportAutoForm(q) {
  const a = normalizeReportAuto(q?.reportAuto), daily = (q?.reportDefs || []).filter(d => d.schedule === 'daily').map(d => d.title);
  return `<label class="check"><input type="checkbox" name="enabled" ${a.enabled ? 'checked' : ''}> 工作日收盘后自动生成${daily.length ? `（${escape(daily.join('、'))}）` : ''}</label>
<label>生成时间<input type="time" name="time" min="15:00" max="23:59" value="${escape(a.time)}"></label>
<p class="hint">需要 QuanK 保持运行。生成结果进入「动态」和每日简报；有告警时发系统通知（沿用「盯盘与提醒」里的通知开关）。</p>`;
}
export const quantReportAutoPayload = fm => ({action: 'reportAuto', enabled: on(fm, 'enabled'), time: val(fm, 'time') || '18:00'});
