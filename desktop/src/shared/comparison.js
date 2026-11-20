// [p4-m2] Structured comparison: every option evaluated on the same dimensions; numbers keep their units and sources;
// qualitative judgments are kept apart; anything not found says 「未找到」. Pure module shared by renderer and main process.
export const COMPARE_LIMITS = {options: 8, dimensions: 20, value: 300, json: 24000};
export const MISSING = '未找到';
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const key = s => clip(s, 80).toLowerCase();

export function safeHttpUrl(v) {
  const s = String(v ?? '').trim();
  if (!s || s.length > 2048 || /[\u0000-\u0020]/.test(s)) return '';
  try { const u = new URL(s); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}

/** JSON text or object -> {title, options[], dimensions[{name, unit, kind}], cells{opt:{dim:{value,unit,source,sourceTitle,note}}}, summary}. Throws on unusable input. */
export function normalizeComparison(input) {
  let s = input;
  if (typeof input === 'string') {
    if (input.length > COMPARE_LIMITS.json) throw new Error(`对比数据超过 ${COMPARE_LIMITS.json} 字符`);
    s = JSON.parse(input);
  }
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('对比数据需要 JSON 对象');
  const options = [...new Map((Array.isArray(s.options) ? s.options : []).map(o => clip(typeof o === 'string' ? o : o?.name, 60)).filter(Boolean).map(o => [key(o), o])).values()];
  if (options.length < 2 || options.length > COMPARE_LIMITS.options) throw new Error(`对比需要 2 到 ${COMPARE_LIMITS.options} 个选项`);
  const dimensions = [], dimByName = new Map();
  for (const raw of Array.isArray(s.dimensions) ? s.dimensions : []) {
    const d = typeof raw === 'string' ? {name: raw} : raw, name = clip(d?.name, 40);
    if (!name) continue;
    const unit = clip(d?.unit, 20), kind = d?.kind === 'judgment' || d?.kind === 'qualitative' ? 'judgment' : 'metric';
    const prev = dimByName.get(key(name));
    if (prev) { if (!prev.unit && unit) prev.unit = unit; if (kind === 'judgment') prev.kind = 'judgment'; }
    else { const entry = {name, unit, kind}; dimByName.set(key(name), entry); dimensions.push(entry); }
  }
  if (!dimensions.length || dimensions.length > COMPARE_LIMITS.dimensions) throw new Error(`对比需要 1 到 ${COMPARE_LIMITS.dimensions} 个维度`);
  const opt = new Map(options.map(o => [key(o), o])), dim = new Map(dimensions.map(d => [key(d.name), d.name]));
  const cells = Object.fromEntries(options.map(o => [o, {}]));
  for (const c of Array.isArray(s.cells) ? s.cells.slice(0, 400) : []) {
    const o = opt.get(key(c?.option)), d = dim.get(key(c?.dimension));
    if (!o || !d) continue;
    const value = clip(c.value, COMPARE_LIMITS.value);
    if (!value || /^(未找到|未知|n\/?a|无数据|-|—)$/i.test(value)) continue;
    const source = safeHttpUrl(c.source || c.url);
    cells[o][d] = {value, ...(clip(c.unit, 20) ? {unit: clip(c.unit, 20)} : {}), ...(source ? {source, sourceTitle: clip(c.sourceTitle, 80)} : {}), ...(clip(c.note, 120) ? {note: clip(c.note, 120)} : {})};
  }
  return {title: clip(s.title, 80) || options.join(' vs '), options, dimensions, cells, summary: clip(s.summary, 400)};
}

/** Numbered distinct sources in reading order: [{n, url, title}], plus lookup url -> n. */
export function comparisonSources(spec) {
  const list = [], index = new Map();
  for (const d of spec.dimensions) for (const o of spec.options) {
    const c = spec.cells[o]?.[d.name];
    if (c?.source && !index.has(c.source)) { index.set(c.source, list.length + 1); list.push({n: list.length + 1, url: c.source, title: c.sourceTitle || new URL(c.source).hostname}); }
  }
  return {list, index};
}
export function cellText(c, d, index) {
  if (!c) return MISSING;
  const numeric = /^[-+]?\d[\d,.]*$/.test(String(c.value).trim());
  const unit = c.unit || (numeric && d.kind === 'metric' && d.unit && !String(c.value).includes(d.unit) ? d.unit : '');
  return `${c.value}${unit ? ' ' + unit : ''}${c.source ? ` [${index.get(c.source)}]` : ''}${c.note ? `（${c.note}）` : ''}`;
}
/** Metric dimensions first, judgment dimensions after (their own block). */
export const orderedDimensions = spec => [...spec.dimensions.filter(d => d.kind === 'metric'), ...spec.dimensions.filter(d => d.kind === 'judgment')];
export function coverage(spec) {
  const total = spec.options.length * spec.dimensions.length;
  let found = 0, sourced = 0;
  for (const o of spec.options) for (const d of spec.dimensions) { const c = spec.cells[o]?.[d.name]; if (c) { found++; if (c.source) sourced++; } }
  return {total, found, missing: total - found, sourced};
}
const dimLabel = d => d.name + (d.unit ? `（${d.unit}）` : '') + (d.kind === 'judgment' ? ' · 定性' : '');

export function comparisonMatrix(spec) {
  const {index, list} = comparisonSources(spec);
  return {header: ['维度', ...spec.options], rows: orderedDimensions(spec).map(d => [dimLabel(d), ...spec.options.map(o => cellText(spec.cells[o]?.[d.name], d, index))]), sources: list};
}
/** Spec for runtime/documents.mjs generateDocument('xlsx'). */
export function comparisonXlsx(spec) {
  const m = comparisonMatrix(spec);
  const sheets = [{name: '对比', rows: [[spec.title], ...(spec.summary ? [[spec.summary]] : []), [], m.header, ...m.rows]}];
  sheets.push({name: '来源', rows: [['编号', '标题', '网址'], ...(m.sources.length ? m.sources.map(s => [s.n, s.title, s.url]) : [['', '没有可引用的来源', '']])]});
  return {sheets};
}
/** Spec for generateDocument('docx'). */
export function comparisonDocx(spec) {
  const m = comparisonMatrix(spec), c = coverage(spec);
  return {title: spec.title, blocks: [
    ...(spec.summary ? [{type: 'paragraph', text: spec.summary}] : []),
    {type: 'paragraph', text: `共 ${spec.options.length} 个选项、${spec.dimensions.length} 个维度；${c.found} 项有数据（${c.sourced} 项附来源），${c.missing} 项未找到。`},
    {type: 'table', rows: [m.header, ...m.rows]},
    {type: 'heading', text: '来源'},
    ...(m.sources.length ? m.sources.map(s => ({type: 'paragraph', text: `[${s.n}] ${s.title} ${s.url}`})) : [{type: 'paragraph', text: '没有可引用的来源。'}]),
  ]};
}

export const COMPARISON_INSTRUCTION = '对比两个或多个选项时（如「A、B、C 哪个好」「A 和 B 对比」），先用完整comparison代码围栏输出对比表JSON：' +
  '{"title":"标题","options":["A","B"],"dimensions":[{"name":"价格","unit":"元/月","kind":"metric"},{"name":"上手难度","kind":"judgment"}],' +
  '"cells":[{"option":"A","dimension":"价格","value":"99","source":"https://实际来源网址","sourceTitle":"来源标题"}],"summary":"一句话结论"}；' +
  '所有选项使用同样的维度；数值保留单位，source 只填实际查到或资料里出现的网址；查不到的格子直接省略（会显示为「未找到」），不要编造；kind 为 judgment 的维度是定性判断。之后再用文字说明结论和取舍。';
