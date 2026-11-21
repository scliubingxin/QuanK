// [fin1] 工作台首页的量化面板：自选信号、持仓、最近变化，一屏看全；详细操作仍在量化页（点击股票直接进入详情）。
import { escape } from './markdown.js';
import { sparkSvg, poolTrend } from './spark.js'; // [fin2]
import { actionLabel, actionTone } from '../shared/quant.js';

const fin = v => v != null && Number.isFinite(Number(v));
const num = (v, d = 2) => fin(v) ? Number(v).toFixed(d) : '—';
const pct = v => fin(v) ? `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(2)}%` : '—';
const money = v => fin(v) ? Number(v).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '—';
const BUY = ['BUY', 'STRONG_BUY'], SELL = ['SELL', 'STRONG_SELL'];
const STATUS = {running: ['运行中', 'on'], starting: ['启动中', 'on'], error: ['出错', 'err'], stopped: ['已停止', 'off']};

export function homeQuantSummary(q = {}) {
  const pool = q.pool || [], held = Object.values(q.holdings || {}).filter(h => h && h.shares > 0);
  const every = k => held.length > 0 && held.every(h => fin(h[k]));
  return {
    stocks: pool.length,
    buy: pool.filter(p => BUY.includes(p.last?.action)).length,
    sell: pool.filter(p => SELL.includes(p.last?.action)).length,
    held: held.length,
    value: every('value') ? held.reduce((n, h) => n + h.value, 0) : null,
    pnl: every('pnl') ? held.reduce((n, h) => n + h.pnl, 0) : null,
  };
}

function recent(q, date) {
  const list = (q.alerts || []).filter(a => a && (a.kind === 'change' || a.kind === 'report' || a.kind === 'digest')).slice(0, 3);
  if (!list.length) return '';
  return `<ul class="hq-recent">${list.map(a => {
    if (a.kind === 'report') return `<li><time>${escape(date(a.time))}</time><b>${escape(a.title || '报告')}</b><span>${escape(a.ok ? a.summary || '已生成' : '生成失败')}</span>${a.reportId ? `<button data-action="quantReport" data-id="${escape(a.reportId)}">查看</button>` : ''}</li>`;
    if (a.kind === 'digest') return `<li><time>${escape(date(a.time))}</time><b>盘前简报</b><span>${a.counts?.total || 0} 只 · ${a.counts?.buy || 0} 个买点 · ${a.counts?.sell || 0} 个风控提示</span></li>`;
    return `<li><time>${escape(date(a.time))}</time><b>${escape(a.name || a.code)}</b><span>${escape(actionLabel(a.from))} → <em class="hq-${actionTone(a.to)}">${escape(actionLabel(a.to, a.toText))}</em></span><button data-action="quantOpen" data-id="${escape(a.code)}">详情</button></li>`;
  }).join('')}</ul>`;
}

export function homeQuant(state, {action, icon, date = t => String(t), showRecent = true}) {
  const q = state?.quant;
  if (!q || (!q.installed && !(q.pool || []).length))
    return `<section class="home-quant hq-empty"><div class="hq-head"><h2>${icon('trend')}量化工作台</h2></div><p>添加微信 findingnoone 获取量化策略和接入支持；接入后，自选股的信号、持仓和每日报告会显示在这里。</p>${action('接入策略', 'quantContact', '', 'primary')}</section>`;
  const s = homeQuantSummary(q), [label, tone] = STATUS[q.status] || STATUS.stopped;
  const stats = [[s.stocks, '只自选'], [s.buy, '个买点'], [s.sell, '个风控提示'], ...(s.held ? [[money(s.value), '持仓市值'], [money(s.pnl), '浮动盈亏', (s.pnl || 0) >= 0 ? 'up' : 'down']] : [])];
  const tiles = (q.pool || []).slice(0, 8).map(p => {
    const l = p.last || {}, t = actionTone(l.action), h = q.holdings?.[p.code], lq = state?.market?.quotes?.[p.code]; // [F1] live quote
    return `<button class="hq-stock hq-${t}" data-action="quantOpen" data-id="${escape(p.code)}"><span class="hq-name">${/^data:image\/(png|jpeg|gif|webp|x-icon);base64,[A-Za-z0-9+\/=]+$/.test(q.logos?.[p.code] || '') ? `<img class="hq-logo" src="${q.logos[p.code]}" alt="">` : ''}<b>${escape(p.name || p.code)}</b><small>${escape(p.code)}</small></span>${l.action ? `<span class="hq-act hq-${t}">${escape(actionLabel(l.action, l.actionText))}</span>` : '<span class="hq-act">未计算</span>'}${sparkSvg(p.spark, {id: p.code})}<span class="hq-nums"><span><b>${num(l.score, 1)}</b>综合分</span><span><b>${num(lq?.price ?? l.price)}</b>现价</span><span class="${((lq?.pct ?? l.changePct) || 0) >= 0 ? 'up' : 'down'}"><b>${pct(lq?.pct ?? l.changePct)}</b>涨跌</span></span>${h?.shares > 0 ? `<small class="hq-hold">持仓 ${Number(h.shares).toLocaleString('en-US')} 股</small>` : ''}</button>`;
  }).join('');
  const more = (q.pool || []).length > 8 ? `<button class="hq-more" data-action="quantHome">还有 ${(q.pool || []).length - 8} 只 →</button>` : '';
  const main = q.status === 'running' ? action('全部刷新', 'quantRefreshAll') : q.status === 'starting' ? '' : action('启动引擎', 'quantStart', '', 'primary');
  return `<section class="home-quant"><div class="hq-head"><h2>${icon('trend')}量化工作台</h2><span class="hq-status ${tone}">${label}</span><span class="hq-tools">${main}${action('＋ 添加股票', 'quantAdd')}${action('打开量化', 'quantHome')}</span></div>
<div class="hq-stats">${stats.map(([n, l, c]) => `<span class="${c || ''}"><b>${escape(String(n))}</b>${l}</span>`).join('')}</div>
${tiles ? `<div class="hq-grid">${tiles}${more}</div>` : '<p class="quiet-empty">股票池还是空的，点「添加股票」开始。</p>'}${showRecent ? recent(q, date) : ''}
<p class="hq-note">信号来自你本机的私有策略，仅供研究，不构成投资建议；QuanK 不会替你下单。</p></section>`;
}
