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
 * opts: {w, h, ma: [5, 10, 20], sub: 'macd' | 'kdj' | 'vol', marks: [{date, type: 'buy'|'sell', text}], last: number of bars}
 */
export function klineSvg(all, {w = 960, h = 460, ma = [5, 10, 20, 60], sub = 'macd', marks = [], last = 120} = {}) {
  const bars = (all || []).filter(b => fin(b.open) && fin(b.close) && fin(b.high) && fin(b.low));
  if (bars.length < 2) return '<p class="mk-empty">暂无 K 线数据</p>';
  const closesAll = bars.map(b => b.close), start = Math.max(0, bars.length - last), view = bars.slice(start);
  const maAll = Object.fromEntries(ma.map(n => [n, sma(closesAll, n)]));
  const padL = 8, padR = 64, top = 24, mainH = Math.round(h * 0.58), gap = 18, volH = Math.round(h * 0.14), subH = h - top - mainH - gap * 2 - volH - 22;
  const cw = (w - padL - padR) / view.length, bw = Math.max(1, Math.min(14, cw * 0.66));
  const hi = Math.max(...view.map(b => b.high), ...ma.flatMap(n => maAll[n].slice(start).filter(fin))), lo = Math.min(...view.map(b => b.low), ...ma.flatMap(n => maAll[n].slice(start).filter(fin)));
  const span = hi - lo || 1, y = v => top + (hi - v) / span * mainH, x = i => padL + cw * i + cw / 2;
  const volMax = Math.max(1, ...view.map(b => b.volume || 0)), vTop = top + mainH + gap;
  let s = `<svg class="mk-kline" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="none" role="img" aria-label="K 线图">`;
  for (let g = 0; g <= 4; g++) { const yy = top + mainH * g / 4, v = hi - span * g / 4; s += `<line x1="${padL}" x2="${w - padR}" y1="${yy}" y2="${yy}" class="mk-grid"/><text x="${w - padR + 6}" y="${yy + 4}" class="mk-axis">${num(v)}</text>`; }
  view.forEach((b, i) => {
    const c = b.close >= b.open ? UP : DOWN, xx = x(i), yo = y(b.open), yc = y(b.close);
    s += `<line x1="${xx}" x2="${xx}" y1="${y(b.high)}" y2="${y(b.low)}" stroke="${c}" stroke-width="1"/>`;
    s += `<rect x="${xx - bw / 2}" y="${Math.min(yo, yc)}" width="${bw}" height="${Math.max(1, Math.abs(yc - yo))}" fill="${b.close >= b.open ? '#fff' : c}" stroke="${c}"/>`;
    const vh = (b.volume || 0) / volMax * volH;
    s += `<rect x="${xx - bw / 2}" y="${vTop + volH - vh}" width="${bw}" height="${vh}" fill="${c}" opacity=".55"/>`;
    s += `<rect class="mk-hit" x="${xx - cw / 2}" y="${top}" width="${cw}" height="${h - top}"><title>${esc(b.date)}  开 ${num(b.open)} 收 ${num(b.close)} 高 ${num(b.high)} 低 ${num(b.low)}${fin(b.pct) ? '  ' + pct(b.pct) : ''}  量 ${bigNum(b.volume)}</title></rect>`;
  });
  for (const n of ma) s += `<path d="${path(maAll[n].slice(start).map((v, i) => fin(v) ? [x(i), y(v)] : null))}" fill="none" stroke="${MA_COLORS[n] || '#64748b'}" stroke-width="1.3"/>`;
  const idx = new Map(view.map((b, i) => [String(b.date).slice(0, 10), i]));
  for (const m of marks || []) {
    const i = idx.get(String(m.date).slice(0, 10)); if (i === undefined) continue;
    const buy = m.type === 'buy', yy = buy ? y(view[i].low) + 14 : y(view[i].high) - 14;
    s += `<g class="mk-mark ${buy ? 'buy' : 'sell'}"><circle cx="${x(i)}" cy="${yy}" r="7"/><text x="${x(i)}" y="${yy + 4}">${buy ? 'B' : 'S'}</text><title>${esc(m.text || (buy ? '买入信号' : '卖出信号'))} ${esc(m.date)}</title></g>`;
  }
  const sTop = vTop + volH + gap, closes = view.map(b => b.close);
  if (sub === 'kdj') {
    const kd = kdj(bars), K = kd.k.slice(start), D = kd.d.slice(start), J = kd.j.slice(start);
    const mx = Math.max(100, ...J), mn = Math.min(0, ...J), sy = v => sTop + (mx - v) / (mx - mn || 1) * subH;
    s += `<line x1="${padL}" x2="${w - padR}" y1="${sy(80)}" y2="${sy(80)}" class="mk-grid"/><line x1="${padL}" x2="${w - padR}" y1="${sy(20)}" y2="${sy(20)}" class="mk-grid"/>`;
    [[K, '#2f62f5'], [D, '#f5a524'], [J, '#8c7cff']].forEach(([arr, c]) => { s += `<path d="${path(arr.map((v, i) => [x(i), sy(v)]))}" fill="none" stroke="${c}" stroke-width="1.2"/>`; });
    s += `<text x="${padL}" y="${sTop - 4}" class="mk-legend">KDJ(9,3,3)  K ${num(K.at(-1))}  D ${num(D.at(-1))}  J ${num(J.at(-1))}</text>`;
  } else {
    const m = macd(closesAll), dif = m.dif.slice(start), dea = m.dea.slice(start), bar = m.bar.slice(start);
    const mx = Math.max(...bar.map(Math.abs), ...dif.map(Math.abs), ...dea.map(Math.abs)) || 1, sy = v => sTop + subH / 2 - v / mx * subH / 2;
    bar.forEach((v, i) => { s += `<rect x="${x(i) - bw / 2}" y="${Math.min(sy(0), sy(v))}" width="${bw}" height="${Math.abs(sy(v) - sy(0))}" fill="${v >= 0 ? UP : DOWN}" opacity=".8"/>`; });
    s += `<path d="${path(dif.map((v, i) => [x(i), sy(v)]))}" fill="none" stroke="#2f62f5" stroke-width="1.2"/><path d="${path(dea.map((v, i) => [x(i), sy(v)]))}" fill="none" stroke="#f5a524" stroke-width="1.2"/>`;
    s += `<text x="${padL}" y="${sTop - 4}" class="mk-legend">MACD(12,26,9)  DIF ${num(dif.at(-1), 3)}  DEA ${num(dea.at(-1), 3)}  MACD ${num(bar.at(-1), 3)}</text>`;
  }
  s += `<text x="${padL}" y="${vTop - 4}" class="mk-legend">成交量 ${bigNum(view.at(-1).volume)}</text>`;
  const lastBar = view.at(-1);
  s += `<text x="${padL}" y="14" class="mk-legend">${ma.map(n => `<tspan fill="${MA_COLORS[n] || '#64748b'}">MA${n} ${num(maAll[n].at(-1))}</tspan>`).join('  ')}</text>`;
  s += `<text x="${padL}" y="${h - 4}" class="mk-axis">${esc(view[0].date)}</text><text x="${w - padR}" y="${h - 4}" text-anchor="end" class="mk-axis">${esc(lastBar.date)}</text>`;
  return s + '</svg>';
}

/** Intraday line (price + average price) with volume. points: [{time, price, avg, volume}], preClose. */
export function trendSvg(points, preClose, {w = 960, h = 360} = {}) {
  const p = (points || []).filter(x => fin(x.price));
  if (!p.length) return '<p class="mk-empty">暂无分时数据（非交易日或尚未开盘）</p>';
  const padL = 8, padR = 70, top = 12, mainH = Math.round(h * 0.66), gap = 16, volH = h - top - mainH - gap - 22, total = Math.max(241, p.length);
  const base = fin(preClose) ? Number(preClose) : p[0].price, dev = Math.max(...p.map(x => Math.abs(x.price - base)), ...p.filter(x => fin(x.avg)).map(x => Math.abs(x.avg - base)), base * 0.002);
  const y = v => top + (base + dev - v) / (2 * dev) * mainH, x = i => padL + (w - padL - padR) * i / (total - 1);
  const vm = Math.max(1, ...p.map(x => x.volume || 0)), vTop = top + mainH + gap;
  let s = `<svg class="mk-trend" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="none" role="img" aria-label="分时图">`;
  [[base + dev, UP], [base, '#94a3b8'], [base - dev, DOWN]].forEach(([v, c], k) => { s += `<line x1="${padL}" x2="${w - padR}" y1="${y(v)}" y2="${y(v)}" class="mk-grid${k === 1 ? ' mid' : ''}"/><text x="${w - padR + 6}" y="${y(v) + 4}" class="mk-axis" fill="${c}">${num(v)} ${k === 1 ? '' : pct((v - base) / base * 100)}</text>`; });
  const line = path(p.map((q, i) => [x(i), y(q.price)]));
  s += `<path d="${line}L${x(p.length - 1).toFixed(1)} ${y(base).toFixed(1)}L${x(0).toFixed(1)} ${y(base).toFixed(1)}Z" fill="#2f62f5" opacity=".08"/><path d="${line}" fill="none" stroke="#2f62f5" stroke-width="1.4"/>`;
  s += `<path d="${path(p.map((q, i) => fin(q.avg) ? [x(i), y(q.avg)] : null))}" fill="none" stroke="#f5a524" stroke-width="1.1"/>`;
  p.forEach((q, i) => { const vh = (q.volume || 0) / vm * volH, c = i && q.price < p[i - 1].price ? DOWN : UP; s += `<rect x="${x(i) - 0.8}" y="${vTop + volH - vh}" width="1.6" height="${vh}" fill="${c}" opacity=".6"/>`; });
  s += `<text x="${padL}" y="${h - 4}" class="mk-axis">09:30</text><text x="${(w - padR + padL) / 2}" y="${h - 4}" text-anchor="middle" class="mk-axis">11:30/13:00</text><text x="${w - padR}" y="${h - 4}" text-anchor="end" class="mk-axis">15:00</text>`;
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
