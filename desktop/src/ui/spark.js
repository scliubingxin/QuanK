// [fin2] Tiny inline-SVG trend lines (no chart library): per-stock sparkline and a pool-average trend.
const fin = v => typeof v === 'number' && Number.isFinite(v);
const sid = s => 'sp' + String(s || '').replace(/[^\w]/g, '').slice(0, 24);

/** Sparkline for a price series. A-share colours: red when the last value is at or above the first, green below. */
export function sparkSvg(values, {w = 200, h = 40, cls = 'hq-spark', id = 'x'} = {}) {
  const xs = (Array.isArray(values) ? values : []).filter(fin);
  if (xs.length < 5) return '';
  const lo = Math.min(...xs), hi = Math.max(...xs), span = hi - lo || 1;
  const d = xs.map((x, i) => `${i ? 'L' : 'M'}${(i / (xs.length - 1) * w).toFixed(1)} ${(h - 3 - (x - lo) / span * (h - 6)).toFixed(1)}`).join('');
  const up = xs[xs.length - 1] >= xs[0], c = up ? '#ef4444' : '#10b981', gid = sid(cls + id);
  return `<svg class="${cls} ${up ? 'up' : 'down'}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".24"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs><path d="${d}L${w} ${h}L0 ${h}Z" fill="url(#${gid})" stroke="none"/><path d="${d}" fill="none" stroke="${c}" stroke-width="1.7" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

/** Average percentage move of several price series, aligned on their latest point. Returns {series, pct, days, count}. */
export function poolTrend(seriesList) {
  const list = (Array.isArray(seriesList) ? seriesList : []).map(v => (Array.isArray(v) ? v : []).filter(x => fin(x) && x > 0)).filter(v => v.length >= 5);
  if (!list.length) return null;
  const n = Math.min(...list.map(v => v.length));
  const series = Array.from({length: n}, (_, i) => list.reduce((s, v) => { const a = v.slice(-n); return s + (a[i] / a[0] - 1) * 100; }, 0) / list.length);
  return {series: series.map(x => Math.round(x * 100) / 100), pct: Math.round(series[n - 1] * 100) / 100, days: n, count: list.length};
}
