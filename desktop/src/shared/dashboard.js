// [p4-m1] Dashboards: column inference, a bounded JSON spec the model may produce, and local aggregation.
// Numbers shown in a dashboard are always computed here from the real table, never taken from the model.
// Pure module (no Node or DOM APIs): used by the main process (create / export) and the renderer (filters).
export const CHART_TYPES = ['line', 'bar', 'stackedBar', 'hbar', 'pie', 'scatter', 'table'];
export const AGGS = ['sum', 'avg', 'count', 'min', 'max', 'distinct'];
export const TIME_UNITS = ['day', 'week', 'month', 'quarter', 'year'];
export const LIMITS = {rows: 20000, columns: 60, charts: 8, kpis: 6, filters: 4, series: 5, categories: 50, tableRows: 200};
const AGG_LABEL = {sum: '合计', avg: '平均', count: '计数', min: '最小', max: '最大', distinct: '去重计数'};
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

const DATE_RE = /^(\d{4})[-/.年](\d{1,2})(?:[-/.月](?:(\d{1,2})日?)?)?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
/** Text -> {y,m,d,h,mi,s} or null. Accepts 2026-11-19, 2026/11/19 08:30, 2026年11月, 2026.11. */
export function parseDateText(v) {
  const m = DATE_RE.exec(String(v ?? '').trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = m[3] ? +m[3] : 1;
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return {y, mo, d, h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0)};
}
const pad = n => String(n).padStart(2, '0');
export const dateKey = p => `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
/** "1,234.5" "¥1,234" "12%" "(300)" -> number; otherwise null. */
export function parseNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean' || v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s || s.length > 40) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  const pct = /%$/.test(s);
  s = s.replace(/^[¥$€£￥]|元$|万元$/g, '').replace(/%$/, '').replace(/,(?=\d{3}(\D|$))/g, '').trim();
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s) * (pct ? 0.01 : 1) * (neg ? -1 : 1);
  return Number.isFinite(n) ? n : null;
}

/** [{name, type: number|date|text, filled, distinct, sample[]}] */
export function inferColumns(columns, rows) {
  return columns.map((name, i) => {
    let num = 0, date = 0, filled = 0;
    const seen = new Set(), sample = [];
    for (const r of rows) {
      const v = r[i];
      if (v === null || v === undefined || v === '') continue;
      filled++;
      if (seen.size < 2000) seen.add(String(v));
      if (sample.length < 5 && !sample.includes(String(v))) sample.push(clip(v, 40));
      if (parseNumber(v) !== null) num++;
      else if (parseDateText(v)) date++;
    }
    const type = filled && date / filled >= 0.8 ? 'date' : filled && num / filled >= 0.9 ? 'number' : 'text';
    return {name, type, filled, distinct: seen.size, sample};
  });
}

/** Header row detection + bounds: grid (array of arrays) -> {columns, rows, truncated}. */
export function tableFromGrid(grid, {maxRows = LIMITS.rows, maxColumns = LIMITS.columns} = {}) {
  let rows = (grid || []).filter(r => Array.isArray(r) && r.some(v => v !== null && v !== undefined && String(v).trim() !== ''));
  if (!rows.length) throw new Error('表格是空的');
  { // [ux10] report-style sheets: skip title lines above the header and long one-cell note rows below the data
    const filled = r => r.filter(v => v !== null && v !== undefined && String(v).trim() !== '').length;
    if (Math.max(...rows.slice(0, 200).map(filled)) >= 3) {
      let k = 0; while (k < 5 && rows.length - k > 2 && filled(rows[k]) <= 1) k++;
      rows = rows.slice(k).filter((r, i) => i === 0 || !(filled(r) === 1 && String(r.find(v => v !== null && v !== undefined && String(v).trim() !== '')).length > 20));
    }
  }
  const width = Math.min(maxColumns, Math.max(...rows.slice(0, 200).map(r => r.length)));
  const head = rows[0].slice(0, width), used = new Set();
  const columns = Array.from({length: width}, (_, i) => {
    let n = clip(head[i], 40) || `列${i + 1}`;
    while (used.has(n)) n += '_';
    used.add(n);
    return n;
  });
  const body = rows.slice(1, maxRows + 1).map(r => Array.from({length: width}, (_, i) => r[i] === undefined || r[i] === '' ? null : r[i]));
  if (!body.length) throw new Error('表格只有表头，没有数据行');
  return {columns, rows: body, truncated: rows.length - 1 > maxRows || rows.some(r => r.length > maxColumns)};
}

/** Short description for the model: column names, types, distinct counts and a few sample values. No full rows. */
export function describeTable(table, cols = inferColumns(table.columns, table.rows), {samples = true} = {}) {
  const typeName = {number: '数值', date: '日期', text: '文本'};
  return `共 ${table.rows.length} 行、${cols.length} 列${table.truncated ? '（已截取前 ' + table.rows.length + ' 行）' : ''}。\n` +
    cols.map(c => `- ${c.name}：${typeName[c.type]}，${c.distinct} 个不同值${samples && c.sample.length ? '，例如 ' + c.sample.slice(0, 3).join(' / ') : ''}`).join('\n');
}

export const DASHBOARD_PROMPT = '你是数据可视化设计助手。根据表格的列信息和用户的要求，设计一页仪表盘。你看不到全部数据，也不要编造任何数字——' +
  '所有数值都由程序按你给出的列和聚合方式从真实数据计算。只能使用给出的列名（必须一字不差）。' +
  '图表 type 可选：line（趋势，x 用日期列并给 timeUnit）、bar（分类对比）、stackedBar（分类+分组堆叠，需 groupBy）、hbar（横向排名，配 topN）、pie（占比，类别不超过 8 个，配 topN）、scatter（两个数值列的关系，x 和 series[0].column 都是数值列）、table（明细或汇总表，columns 列出要显示的列）。' +
  'agg 可选 sum/avg/count/min/max/distinct；count 可以不填 column。timeUnit 可选 day/week/month/quarter/year。filters 列出适合筛选的文本或日期列（最多 4 个）。kpis 是顶部指标卡（最多 6 个）。图表最多 8 个，先放最重要的。' +
  '只输出 JSON，例如：{"title":"2026 年销售概览","description":"一句话说明","kpis":[{"label":"销售额","column":"金额","agg":"sum"},{"label":"订单数","agg":"count"}],' +
  '"filters":[{"column":"区域"}],"charts":[{"type":"line","title":"月度销售额","x":"日期","timeUnit":"month","series":[{"column":"金额","agg":"sum","label":"销售额"}]},' +
  '{"type":"hbar","title":"产品销售额排名","x":"产品","topN":10,"series":[{"column":"金额","agg":"sum"}]}]}';

function pickColumn(name, cols, types) {
  const c = cols.find(c => c.name === name) || cols.find(c => c.name.trim().toLowerCase() === String(name || '').trim().toLowerCase());
  return c && (!types || types.includes(c.type)) ? c.name : null;
}
function series(list, cols, {needColumn = true} = {}) {
  const out = [];
  for (const s of Array.isArray(list) ? list.slice(0, LIMITS.series) : []) {
    const agg = AGGS.includes(s?.agg) ? s.agg : 'sum';
    const column = s?.column ? pickColumn(s.column, cols, agg === 'count' || agg === 'distinct' ? null : ['number']) : null;
    if (!column && (needColumn && agg !== 'count')) continue;
    out.push({column, agg, label: clip(s?.label, 30) || (column ? `${column}${agg === 'sum' ? '' : '（' + AGG_LABEL[agg] + '）'}` : '数量')});
  }
  return out;
}

/** Model output (or any object) -> validated spec; unknown columns and fields are dropped. */
export function normalizeSpec(raw, cols, fallbackTitle = '仪表盘') {
  let s = raw;
  if (typeof raw === 'string') {
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    try { s = a >= 0 && b > a ? JSON.parse(raw.slice(a, b + 1)) : null; } catch { s = null; }
  }
  if (!s || typeof s !== 'object') return null;
  const kpis = [];
  for (const k of Array.isArray(s.kpis) ? s.kpis.slice(0, LIMITS.kpis * 2) : []) {
    if (kpis.length >= LIMITS.kpis) break;
    const [one] = series([{column: k?.column, agg: k?.agg, label: k?.label}], cols);
    if (one) kpis.push(one);
  }
  const filters = [];
  for (const f of Array.isArray(s.filters) ? s.filters : []) {
    const column = pickColumn(f?.column ?? f, cols, ['text', 'date']);
    const info = column && cols.find(k => k.name === column); // [ux10] only short categorical text makes a usable filter
    if (info?.type === 'text' && (info.distinct < 2 || info.distinct > 60 || info.sample.some(v => String(v).length > 24))) continue;
    if (column && !filters.some(x => x.column === column) && filters.length < LIMITS.filters) filters.push({column});
  }
  const charts = [];
  for (const c of Array.isArray(s.charts) ? s.charts.slice(0, LIMITS.charts * 2) : []) {
    if (charts.length >= LIMITS.charts || !CHART_TYPES.includes(c?.type)) continue;
    const title = clip(c.title, 60) || '图表';
    if (c.type === 'table') {
      const columns = (Array.isArray(c.columns) ? c.columns : []).map(n => pickColumn(n, cols)).filter(Boolean).slice(0, 12);
      const x = c.x ? pickColumn(c.x, cols, ['text', 'date']) : null, ser = x ? series(c.series, cols) : [];
      if (x && ser.length) charts.push({type: 'table', title, x, series: ser, ...(TIME_UNITS.includes(c.timeUnit) ? {timeUnit: c.timeUnit} : {}), topN: Math.min(LIMITS.tableRows, Math.max(1, +c.topN || 50))});
      else if (columns.length) charts.push({type: 'table', title, columns, topN: Math.min(LIMITS.tableRows, Math.max(1, +c.topN || 50))});
      continue;
    }
    if (c.type === 'scatter') {
      const x = pickColumn(c.x, cols, ['number']), y = pickColumn(c.series?.[0]?.column ?? c.y, cols, ['number']);
      if (x && y && x !== y) charts.push({type: 'scatter', title, x, series: [{column: y, agg: 'sum', label: y}]});
      continue;
    }
    const x = pickColumn(c.x, cols, ['text', 'date']);
    const ser = series(c.series, cols);
    if (!x || !ser.length) continue;
    const isDate = cols.find(k => k.name === x).type === 'date';
    const groupBy = c.type === 'stackedBar' || (c.groupBy && ['line', 'bar'].includes(c.type)) ? pickColumn(c.groupBy, cols, ['text']) : null;
    if (c.type === 'stackedBar' && !groupBy) continue;
    charts.push({type: c.type, title, x, series: groupBy ? ser.slice(0, 1) : ser,
      ...(isDate ? {timeUnit: TIME_UNITS.includes(c.timeUnit) ? c.timeUnit : 'month'} : {}),
      ...(groupBy && groupBy !== x ? {groupBy} : {}),
      ...(['hbar', 'pie', 'bar', 'stackedBar'].includes(c.type) && !isDate ? {topN: Math.min(c.type === 'pie' ? 8 : LIMITS.categories, Math.max(1, +c.topN || (c.type === 'pie' ? 8 : 15)))} : {})});
  }
  if (!charts.length && !kpis.length) return null;
  return {title: clip(s.title, 60) || fallbackTitle, description: clip(s.description, 200), kpis, filters, charts};
}

/** Heuristic spec used when no model is configured or the model's answer is unusable. */
export function autoSpec(cols, title = '数据概览') {
  const nums = cols.filter(c => c.type === 'number'), dates = cols.filter(c => c.type === 'date');
  const cats = cols.filter(c => c.type === 'text' && c.distinct >= 2 && c.distinct <= 200).sort((a, b) => a.distinct - b.distinct);
  const kpis = [{label: '记录数', column: null, agg: 'count'}, ...nums.slice(0, 3).map(n => ({label: n.name, column: n.name, agg: 'sum'}))];
  const charts = [];
  if (dates[0] && nums[0]) charts.push({type: 'line', title: `${nums[0].name}趋势`, x: dates[0].name, timeUnit: 'month', series: nums.slice(0, 2).map(n => ({column: n.name, agg: 'sum'}))});
  if (cats[0]) charts.push({type: 'hbar', title: `按${cats[0].name}${nums[0] ? '的' + nums[0].name : '计数'}`, x: cats[0].name, topN: 15, series: [nums[0] ? {column: nums[0].name, agg: 'sum'} : {agg: 'count'}]});
  if (cats.find(c => c.distinct <= 8)) { const c = cats.find(c => c.distinct <= 8); charts.push({type: 'pie', title: `${c.name}占比`, x: c.name, topN: 8, series: [nums[0] ? {column: nums[0].name, agg: 'sum'} : {agg: 'count'}]}); }
  if (nums.length >= 2 && charts.length < 3) charts.push({type: 'scatter', title: `${nums[0].name} 与 ${nums[1].name}`, x: nums[0].name, series: [{column: nums[1].name}]});
  charts.push({type: 'table', title: '明细', columns: cols.slice(0, 8).map(c => c.name), topN: 50});
  return normalizeSpec({title, kpis, filters: [...cats.slice(0, 2), ...dates.slice(0, 1)].map(c => ({column: c.name})), charts}, cols, title);
}

// ---- aggregation ---------------------------------------------------------------------------
function timeBucket(v, unit) {
  const p = parseDateText(v);
  if (!p) return null;
  if (unit === 'year') return `${p.y}`;
  if (unit === 'quarter') return `${p.y}-Q${Math.ceil(p.mo / 3)}`;
  if (unit === 'month') return `${p.y}-${pad(p.mo)}`;
  if (unit === 'week') { const t = Date.UTC(p.y, p.mo - 1, p.d), wd = (new Date(t).getUTCDay() + 6) % 7, m = new Date(t - wd * 864e5); return `${m.getUTCFullYear()}-${pad(m.getUTCMonth() + 1)}-${pad(m.getUTCDate())}周`; }
  return dateKey(p);
}
function reducer(agg) {
  if (agg === 'count') return {add(s) { s.n++; }, init: () => ({n: 0}), out: s => s.n};
  if (agg === 'distinct') return {add(s, v) { if (v !== null && v !== undefined && v !== '') s.set.add(String(v)); }, init: () => ({set: new Set()}), out: s => s.set.size};
  return {
    init: () => ({sum: 0, n: 0, min: Infinity, max: -Infinity}),
    add(s, v) { const n = parseNumber(v); if (n === null) return; s.sum += n; s.n++; if (n < s.min) s.min = n; if (n > s.max) s.max = n; },
    out: s => !s.n ? null : agg === 'avg' ? s.sum / s.n : agg === 'min' ? s.min : agg === 'max' ? s.max : s.sum,
  };
}
const round = v => v === null ? null : Math.round(v * 1e6) / 1e6;
export function formatValue(v) {
  if (v === null || v === undefined) return '—';
  const a = Math.abs(v);
  if (a >= 1e8) return (v / 1e8).toFixed(2).replace(/\.?0+$/, '') + ' 亿';
  if (a >= 1e4) return (v / 1e4).toFixed(2).replace(/\.?0+$/, '') + ' 万';
  return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', {maximumFractionDigits: 2});
}

export function filterRows(table, filters = {}) {
  const idx = Object.entries(filters || {}).filter(([, v]) => Array.isArray(v) ? v.length : v && typeof v === 'object' ? v.from || v.to : false)
    .map(([k, v]) => [table.columns.indexOf(k), v]).filter(([i]) => i >= 0);
  if (!idx.length) return table.rows;
  return table.rows.filter(r => idx.every(([i, v]) => {
    if (Array.isArray(v)) return v.includes(String(r[i] ?? ''));
    const p = parseDateText(r[i]); if (!p) return false;
    const k = dateKey(p);
    return (!v.from || k >= v.from) && (!v.to || k <= v.to);
  }));
}
/** Choices for each filter: text -> top values with counts; date -> min/max. */
export function filterOptions(table, spec, cols = inferColumns(table.columns, table.rows)) {
  return (spec.filters || []).map(f => {
    const i = table.columns.indexOf(f.column), c = cols[i];
    if (c?.type === 'date') {
      let min = null, max = null;
      for (const r of table.rows) { const p = parseDateText(r[i]); if (!p) continue; const k = dateKey(p); if (!min || k < min) min = k; if (!max || k > max) max = k; }
      return {column: f.column, type: 'date', min, max};
    }
    const counts = new Map();
    for (const r of table.rows) { const v = String(r[i] ?? ''); if (v) counts.set(v, (counts.get(v) || 0) + 1); }
    return {column: f.column, type: 'text', values: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 100).map(([value, count]) => ({value, count}))};
  });
}

function grouped(rows, xi, unit, groups, sers, colIdx) {
  // groups: null or column index; result Map key -> Map group -> states[]
  const out = new Map();
  for (const r of rows) {
    const key = unit ? timeBucket(r[xi], unit) : (r[xi] === null || r[xi] === undefined || r[xi] === '' ? '（空）' : String(r[xi]));
    if (key === null) continue;
    const g = groups === null ? '' : String(r[groups] ?? '（空）');
    if (!out.has(key)) out.set(key, new Map());
    const m = out.get(key);
    if (!m.has(g)) m.set(g, sers.map(s => s.r.init()));
    const st = m.get(g);
    sers.forEach((s, j) => s.r.add(st[j], s.col === null ? null : r[colIdx[j]]));
  }
  return out;
}

/** Spec + table (+ filters) -> render-ready view: {title, description, rows, kpis[], charts[]}. */
export function computeDashboard(table, spec, filters = {}) {
  const rows = filterRows(table, filters), ci = n => table.columns.indexOf(n);
  const kpis = (spec.kpis || []).map(k => {
    const r = reducer(k.agg), s = r.init(), i = k.column ? ci(k.column) : -1;
    for (const row of rows) r.add(s, i >= 0 ? row[i] : null);
    const value = round(r.out(s));
    return {label: k.label, value, display: formatValue(value), agg: k.agg};
  });
  const charts = (spec.charts || []).map(c => {
    if (c.type === 'table' && c.columns) {
      const idx = c.columns.map(ci);
      return {type: 'table', title: c.title, columns: c.columns, rows: rows.slice(0, c.topN || 50).map(r => idx.map(i => r[i] ?? '')), total: rows.length};
    }
    if (c.type === 'scatter') {
      const xi = ci(c.x), yi = ci(c.series[0].column), points = [];
      for (const r of rows) { const x = parseNumber(r[xi]), y = parseNumber(r[yi]); if (x !== null && y !== null) points.push([x, y]); if (points.length >= 5000) break; }
      return {type: 'scatter', title: c.title, xName: c.x, yName: c.series[0].column, points};
    }
    const xi = ci(c.x), gi = c.groupBy ? ci(c.groupBy) : null;
    const sers = c.series.map(s => ({...s, r: reducer(s.agg), col: s.column})), colIdx = sers.map(s => s.column ? ci(s.column) : -1);
    const g = grouped(rows, xi, c.timeUnit || null, gi, sers, colIdx);
    let labels = [...g.keys()];
    const total = k => { let t = 0; for (const st of g.get(k).values()) t += sers[0].r.out(st[0]) || 0; return t; };
    if (c.timeUnit) labels.sort();
    else { labels.sort((a, b) => total(b) - total(a)); if (c.topN && labels.length > c.topN) {
      const keep = labels.slice(0, c.topN - (c.type === 'pie' ? 1 : 0)), rest = labels.slice(keep.length);
      if (c.type === 'pie' && rest.length) { const other = rest.reduce((t, k) => t + total(k), 0); labels = keep; const view = {type: 'pie', title: c.title, labels: [...keep, '其他'], series: [{name: sers[0].label, values: [...keep.map(k => round(total(k))), round(other)]}]}; return view; }
      labels = keep;
    } }
    if (c.type === 'hbar') labels.reverse();
    if (gi !== null) {
      const groupsAll = new Map();
      for (const m of g.values()) for (const [k, st] of m) groupsAll.set(k, (groupsAll.get(k) || 0) + (sers[0].r.out(st[0]) || 0));
      const names = [...groupsAll].sort((a, b) => b[1] - a[1]).slice(0, LIMITS.series * 2).map(([k]) => k);
      return {type: c.type === 'stackedBar' ? 'stackedBar' : c.type, title: c.title, labels, xName: c.x,
        series: names.map(n => ({name: n, values: labels.map(l => { const st = g.get(l).get(n); return st ? round(sers[0].r.out(st[0])) : null; })}))};
    }
    if (c.type === 'table') return {type: 'table', title: c.title, columns: [c.x, ...sers.map(s => s.label)], rows: labels.slice(0, c.topN || 50).map(l => [l, ...sers.map((s, j) => formatValue(round(s.r.out(g.get(l).get('')[j]))))]), total: labels.length};
    return {type: c.type, title: c.title, labels, xName: c.x,
      series: sers.map((s, j) => ({name: s.label, values: labels.map(l => round(s.r.out(g.get(l).get('')[j])))}))};
  });
  return {title: spec.title, description: spec.description || '', rows: rows.length, totalRows: table.rows.length, kpis, charts};
}
