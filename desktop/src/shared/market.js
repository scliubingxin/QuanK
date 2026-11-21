// [F1] Market workstation, shared pure helpers: Eastmoney secids, indicators (MA / EMA / MACD / KDJ), number formatting,
// and server-free SVG charts (candlestick + volume + MACD/KDJ, intraday line, heat tiles). No external libraries.
const fin = v => v !== null && v !== undefined && v !== '' && v !== '-' && Number.isFinite(Number(v));
export const num = (v, d = 2) => fin(v) ? Number(v).toFixed(d) : '—';
export const pct = v => fin(v) ? `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(2)}%` : '—';
export const tone = v => !fin(v) || Number(v) === 0 ? 'flat' : Number(v) > 0 ? 'up' : 'down';
export function bigNum(v) {
  if (!fin(v)) return '—';
  const n = Number(v), a = Math.abs(n);
  return a >= 1e12 ? (n / 1e12).toFixed(2) + '万亿' : a >= 1e8 ? (n / 1e8).toFixed(2) + '亿' : a >= 1e4 ? (n / 1e4).toFixed(1) + '万' : n.toFixed(0);
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/** Eastmoney secid for a 6-digit A-share code: 1 = Shanghai, 0 = Shenzhen / Beijing. */
export function secid(code) {
  const c = String(code || '').replace(/^(sh|sz|bj)/i, '');
  if (!/^\d{6}$/.test(c)) throw new Error('股票代码应为 6 位数字');
  return (/^(5|6|9)/.test(c) ? '1.' : '0.') + c;
}
export const INDICES = [['1.000001', '上证指数'], ['0.399001', '深证成指'], ['0.399006', '创业板指'], ['1.000300', '沪深300'], ['1.000688', '科创50']];
export const PERIODS = {day: [101, '日K'], week: [102, '周K'], month: [103, '月K'], m60: [60, '60分'], m30: [30, '30分'], intraday: [0, '分时']};

// ---------- indicators ----------
export function sma(values, n) {
  const out = []; let s = 0;
  values.forEach((v, i) => { s += v; if (i >= n) s -= values[i - n]; out.push(i >= n - 1 ? s / n : null); });
  return out;
}
export function ema(values, n) {
  const k = 2 / (n + 1), out = [];
  values.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out;
}
/** MACD(12, 26, 9): dif, dea, bar = 2 * (dif - dea). */
export function macd(close, fast = 12, slow = 26, signal = 9) {
  const a = ema(close, fast), b = ema(close, slow), dif = close.map((_, i) => a[i] - b[i]), dea = ema(dif, signal);
  return {dif, dea, bar: dif.map((d, i) => 2 * (d - dea[i]))};
}
/** KDJ(9, 3, 3) with the usual 2/3 smoothing, starting from 50. */
export function kdj(bars, n = 9) {
  const K = [], D = [], J = [];
  let k = 50, d = 50;
  bars.forEach((b, i) => {
    const win = bars.slice(Math.max(0, i - n + 1), i + 1), hi = Math.max(...win.map(x => x.high)), lo = Math.min(...win.map(x => x.low));
    const rsv = hi === lo ? 50 : (b.close - lo) / (hi - lo) * 100;
    k = 2 / 3 * k + rsv / 3; d = 2 / 3 * d + k / 3;
    K.push(k); D.push(d); J.push(3 * k - 2 * d);
  });
  return {k: K, d: D, j: J};
}

// ---------- charts ----------
const UP = '#e5484d', DOWN = '#18a058', MA_COLORS = {5: '#f5a524', 10: '#2f62f5', 20: '#8c7cff', 60: '#14b8a6'};
const path = (pts) => pts.reduce((s, p, i) => p ? s + (s && pts[i - 1] ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1) : s, '');

/**
 * Candlestick chart as an SVG string. bars: [{date, open, close, high, low, volume}], oldest first.
 * opts: {w, h, ma: [5, 10, 20], sub: 'macd' | 'kdj', marks: [{date, type: 'buy'|'sell', text}], last: number of bars}
 * [F1b] presentation is inline (style="…") so app-wide svg rules cannot repaint it; drawn at the real pixel width
 * (no non-uniform stretching), soft dashed grid, date axis, hover strip via data-t on each column.
 */
const FONT = "font-family:-apple-system,'PingFang SC','Helvetica Neue',sans-serif";
const T = (x, y, s, {size = 11, color = '#8a94ad', anchor = 'start', weight = 400} = {}) => `<text x="${x}" y="${y}" style="${FONT};font-size:${size}px;font-weight:${weight};fill:${color};stroke:none;text-anchor:${anchor}">${s}</text>`;
const GRID = (x1, x2, y) => `<line x1="${x1}" x2="${x2}" y1="${y}" y2="${y}" style="stroke:#e9edf5;stroke-width:1;stroke-dasharray:3 4"/>`;
const fmtDate = s => String(s || '').slice(0, 10);
export function klineSvg(all, {w = 960, h = 460, ma = [5, 10, 20, 60], sub = 'macd', marks = [], last = 120} = {}) {
  const bars = (all || []).filter(b => fin(b.open) && fin(b.close) && fin(b.high) && fin(b.low));
  if (bars.length < 2) return '<p class="mk-empty">暂无 K 线数据</p>';
  w = Math.max(360, Math.round(w));
  const closesAll = bars.map(b => b.close), start = Math.max(0, bars.length - last), view = bars.slice(start);
  const maAll = Object.fromEntries(ma.map(n => [n, sma(closesAll, n)]));
  const padL = 10, padR = 62, top = 26, mainH = Math.round(h * 0.56), gap = 26, dateRow = 20, volH = Math.round(h * 0.13), subTop0 = top + mainH + gap + dateRow + volH + gap, subH = h - subTop0 - 26; // [F1e] date row between price and volume
  const cw = (w - padL - padR) / view.length, bw = Math.max(1.2, Math.min(11, cw * 0.62));
  const vals = [...view.map(b => b.high), ...view.map(b => b.low), ...ma.flatMap(n => maAll[n].slice(start).filter(fin))];
  let hi = Math.max(...vals), lo = Math.min(...vals); const padV = (hi - lo || hi * 0.02 || 1) * 0.06; hi += padV; lo -= padV;
  const span = hi - lo || 1, y = v => top + (hi - v) / span * mainH, x = i => padL + cw * i + cw / 2;
  const volMax = Math.max(1, ...view.map(b => b.volume || 0)), vTop = top + mainH + gap + dateRow;
  let s = `<svg class="mk-kline" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="K 线图" style="display:block;max-width:100%;height:auto;stroke:none">`;
  for (let g = 0; g <= 4; g++) { const yy = top + mainH * g / 4; s += GRID(padL, w - padR, yy) + T(w - padR + 8, yy + 4, num(hi - span * g / 4)); }
  s += GRID(padL, w - padR, vTop + volH) + GRID(padL, w - padR, subTop0 + subH / 2);
  // date axis: about 6 labels
  const step = Math.max(1, Math.ceil(view.length / 6));
  for (let i = 0; i < view.length; i += step) s += `<line x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${top + mainH}" style="stroke:#f1f4f9;stroke-width:1"/>` + T(x(i), top + mainH + 16, fmtDate(view[i].date).slice(2), {anchor: 'middle'});
  view.forEach((b, i) => {
    const c = b.close >= b.open ? UP : DOWN, xx = x(i), yo = y(b.open), yc = y(b.close);
    s += `<line x1="${xx}" x2="${xx}" y1="${y(b.high)}" y2="${y(b.low)}" style="stroke:${c};stroke-width:1"/>`;
    s += `<rect x="${(xx - bw / 2).toFixed(1)}" y="${Math.min(yo, yc).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(yc - yo)).toFixed(1)}" rx="1" style="fill:${c};stroke:none"/>`;
    const vh = (b.volume || 0) / volMax * volH;
    s += `<rect x="${(xx - bw / 2).toFixed(1)}" y="${(vTop + volH - vh).toFixed(1)}" width="${bw.toFixed(1)}" height="${vh.toFixed(1)}" rx="1" style="fill:${c};opacity:.45"/>`;
  });
  for (const n of ma) s += `<path d="${path(maAll[n].slice(start).map((v, i) => fin(v) ? [x(i), y(v)] : null))}" style="fill:none;stroke:${MA_COLORS[n] || '#64748b'};stroke-width:1.4;stroke-linejoin:round"/>`;
  const idx = new Map(view.map((b, i) => [fmtDate(b.date), i]));
  for (const m of marks || []) {
    const i = idx.get(fmtDate(m.date)); if (i === undefined) continue;
    const buy = m.type === 'buy', yy = buy ? y(view[i].low) + 13 : y(view[i].high) - 13, c = buy ? UP : DOWN;
    s += `<g class="mk-mark ${buy ? 'buy' : 'sell'}"><circle cx="${x(i)}" cy="${yy}" r="8" style="fill:${c};stroke:#fff;stroke-width:1.5"/>${T(x(i), yy + 3.5, buy ? 'B' : 'S', {size: 9, color: '#fff', anchor: 'middle', weight: 700})}<title>${esc(m.text || (buy ? '买入信号' : '卖出信号'))} ${esc(m.date)}</title></g>`;
  }
  const sTop = subTop0;
  if (sub === 'kdj') {
    const kd = kdj(bars), K = kd.k.slice(start), D = kd.d.slice(start), J = kd.j.slice(start);
    const mx = Math.max(100, ...J), mn = Math.min(0, ...J), sy = v => sTop + (mx - v) / (mx - mn || 1) * subH;
    s += GRID(padL, w - padR, sy(80)) + GRID(padL, w - padR, sy(20)) + T(w - padR + 8, sy(80) + 4, '80') + T(w - padR + 8, sy(20) + 4, '20');
    [[K, '#2f62f5'], [D, '#f5a524'], [J, '#8c7cff']].forEach(([arr, c]) => { s += `<path d="${path(arr.map((v, i) => [x(i), sy(v)]))}" style="fill:none;stroke:${c};stroke-width:1.3"/>`; });
    s += T(padL, sTop - 8, `<tspan style="fill:#4c5a85;font-weight:600">KDJ(9,3,3)</tspan>  <tspan style="fill:#2f62f5">K ${num(K.at(-1))}</tspan>  <tspan style="fill:#f5a524">D ${num(D.at(-1))}</tspan>  <tspan style="fill:#8c7cff">J ${num(J.at(-1))}</tspan>`, {size: 11.5});
  } else {
    const m = macd(closesAll), dif = m.dif.slice(start), dea = m.dea.slice(start), bar = m.bar.slice(start);
    const mx = Math.max(...bar.map(Math.abs), ...dif.map(Math.abs), ...dea.map(Math.abs)) || 1, sy = v => sTop + subH / 2 - v / mx * subH / 2;
    bar.forEach((v, i) => { s += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${Math.min(sy(0), sy(v)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.abs(sy(v) - sy(0)).toFixed(1)}" style="fill:${v >= 0 ? UP : DOWN};opacity:.75"/>`; });
    s += `<path d="${path(dif.map((v, i) => [x(i), sy(v)]))}" style="fill:none;stroke:#2f62f5;stroke-width:1.3"/><path d="${path(dea.map((v, i) => [x(i), sy(v)]))}" style="fill:none;stroke:#f5a524;stroke-width:1.3"/>`;
    s += T(padL, sTop - 8, `<tspan style="fill:#4c5a85;font-weight:600">MACD(12,26,9)</tspan>  <tspan style="fill:#2f62f5">DIF ${num(dif.at(-1), 3)}</tspan>  <tspan style="fill:#f5a524">DEA ${num(dea.at(-1), 3)}</tspan>  <tspan style="fill:${bar.at(-1) >= 0 ? UP : DOWN}">MACD ${num(bar.at(-1), 3)}</tspan>`, {size: 11.5});
  }
  s += T(padL, vTop - 8, `<tspan style="fill:#4c5a85;font-weight:600">成交量</tspan>  ${bigNum(view.at(-1).volume)}`, {size: 11.5});
  s += T(padL, 15, ma.map(n => `<tspan style="fill:${MA_COLORS[n] || '#64748b'}">MA${n} ${num(maAll[n].at(-1))}</tspan>`).join('   '), {size: 11.5});
  // hover columns (filled by mountKlineBoxes): transparent hit areas carrying the bar's numbers
  view.forEach((b, i) => { s += `<rect class="mk-hit" data-i="${i}" data-t="${esc(`${fmtDate(b.date)}　开 ${num(b.open)}　收 ${num(b.close)}　高 ${num(b.high)}　低 ${num(b.low)}${fin(b.pct) ? '　' + pct(b.pct) : ''}　量 ${bigNum(b.volume)}`)}" x="${(padL + cw * i).toFixed(1)}" y="${top}" width="${cw.toFixed(2)}" height="${h - top - 20}" style="fill:transparent;stroke:none"/>`; });
  s += `<line class="mk-cross" x1="0" x2="0" y1="${top}" y2="${h - 20}" style="stroke:#2f62f5;stroke-width:1;stroke-dasharray:3 3;opacity:0"/>`;
  return s + '</svg>';
}

/** Intraday line (price + average price) with volume. points: [{time, price, avg, volume}], preClose. */
export function trendSvg(points, preClose, {w = 960, h = 360} = {}) {
  const p = (points || []).filter(x => fin(x.price));
  if (!p.length) return '<p class="mk-empty">暂无分时数据（非交易日或尚未开盘）</p>';
  w = Math.max(360, Math.round(w));
  const padL = 10, padR = 78, top = 14, mainH = Math.round(h * 0.66), gap = 22, volH = h - top - mainH - gap - 24, total = Math.max(241, p.length);
  const base = fin(preClose) ? Number(preClose) : p[0].price, dev = Math.max(...p.map(x => Math.abs(x.price - base)), ...p.filter(x => fin(x.avg)).map(x => Math.abs(x.avg - base)), base * 0.002) * 1.08;
  const y = v => top + (base + dev - v) / (2 * dev) * mainH, x = i => padL + (w - padL - padR) * i / (total - 1);
  const vm = Math.max(1, ...p.map(x => x.volume || 0)), vTop = top + mainH + gap;
  let s = `<svg class="mk-trend" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="分时图" style="display:block;max-width:100%;height:auto;stroke:none">`;
  [[base + dev, UP], [base + dev / 2, UP], [base, '#94a3b8'], [base - dev / 2, DOWN], [base - dev, DOWN]].forEach(([v, c], k) => { s += (k === 2 ? `<line x1="${padL}" x2="${w - padR}" y1="${y(v)}" y2="${y(v)}" style="stroke:#c7d0e0;stroke-width:1;stroke-dasharray:5 4"/>` : GRID(padL, w - padR, y(v))) + T(w - padR + 8, y(v) + 4, `${num(v)}${k === 2 ? '' : ' ' + pct((v - base) / base * 100)}`, {color: c}); });
  const line = path(p.map((q, i) => [x(i), y(q.price)])), up = p.at(-1).price >= base;
  s += `<defs><linearGradient id="mkTrendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f62f5" stop-opacity=".18"/><stop offset="1" stop-color="#2f62f5" stop-opacity="0"/></linearGradient></defs>`;
  s += `<path d="${line}L${x(p.length - 1).toFixed(1)} ${(top + mainH).toFixed(1)}L${x(0).toFixed(1)} ${(top + mainH).toFixed(1)}Z" style="fill:url(#mkTrendFill)"/><path d="${line}" style="fill:none;stroke:#2f62f5;stroke-width:1.6;stroke-linejoin:round"/>`;
  s += `<path d="${path(p.map((q, i) => fin(q.avg) ? [x(i), y(q.avg)] : null))}" style="fill:none;stroke:#f5a524;stroke-width:1.2"/>`;
  p.forEach((q, i) => { const vh = (q.volume || 0) / vm * volH, c = i && q.price < p[i - 1].price ? DOWN : UP; s += `<rect x="${(x(i) - 0.9).toFixed(1)}" y="${(vTop + volH - vh).toFixed(1)}" width="1.8" height="${vh.toFixed(1)}" style="fill:${c};opacity:.55"/>`; });
  s += T(padL, h - 6, '09:30') + T((w - padR + padL) / 2, h - 6, '11:30 / 13:00', {anchor: 'middle'}) + T(w - padR, h - 6, '15:00', {anchor: 'end'});
  s += T(padL, vTop - 8, `<tspan style="fill:#2f62f5">价格 ${num(p.at(-1).price)}</tspan>  <tspan style="fill:#f5a524">均价 ${num(p.at(-1).avg)}</tspan>  <tspan style="fill:${up ? UP : DOWN}">${pct((p.at(-1).price - base) / base * 100)}</tspan>`, {size: 11.5});
  return s + '</svg>';
}

/** Compact line for index tiles. */
export function miniLine(values, {w = 120, h = 34} = {}) {
  const v = (values || []).filter(fin).map(Number);
  if (v.length < 2) return '';
  const hi = Math.max(...v), lo = Math.min(...v), sp = hi - lo || 1, c = v.at(-1) >= v[0] ? UP : DOWN;
  return `<svg class="mk-mini" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${path(v.map((x, i) => [i / (v.length - 1) * w, 2 + (hi - x) / sp * (h - 4)]))}" fill="none" stroke="${c}" stroke-width="1.5"/></svg>`;
}

/** Heat colour for a % change: red up, green down, grey flat; stronger with size (capped at ±7%). */
export function heatColor(p) {
  if (!fin(p) || Number(p) === 0) return '#eef1f6';
  const a = Math.min(1, Math.abs(Number(p)) / 7), up = Number(p) > 0;
  const mix = (c1, c2) => c1.map((v, i) => Math.round(v + (c2[i] - v) * a));
  const [r, g, b] = mix(up ? [253, 226, 226] : [220, 246, 230], up ? [216, 44, 50] : [16, 140, 76]);
  return `rgb(${r},${g},${b})`;
}

/** Trading session (Asia/Shanghai): 'pre' | 'open' | 'lunch' | 'closed'. Weekends closed; no holiday calendar. */
export function session(now = Date.now()) {
  const d = new Date(now + 8 * 3600e3), day = d.getUTCDay(), m = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (day === 0 || day === 6) return 'closed';
  if (m >= 555 && m < 570) return 'pre';
  if ((m >= 570 && m <= 690) || (m >= 780 && m <= 900)) return 'open';
  if (m > 690 && m < 780) return 'lunch';
  return 'closed';
}
export const SESSION_LABEL = {pre: '集合竞价', open: '交易中', lunch: '午间休市', closed: '已收盘'};
