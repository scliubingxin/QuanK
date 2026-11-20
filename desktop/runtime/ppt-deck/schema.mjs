// 结构化幻灯片 schema：每页 layout + 槽位。校验在信任边界（模型输出）上严格，文本长度超限给 lint 警告而非拒绝（引擎保证不溢出）。
import { themeNames, DEFAULT_THEME } from './themes.mjs';
export const LAYOUTS = ['cover', 'toc', 'section', 'cards', 'image-text', 'compare-table', 'process', 'timeline', 'kpi', 'architecture', 'matrix', 'summary', 'closing'];
const SLOTS = {
  cover: ['title', 'subtitle', 'meta'],
  toc: ['title', 'subtitle', 'items'],
  section: ['number', 'title', 'subtitle'],
  cards: ['title', 'subtitle', 'section', 'cards', 'takeaway'],
  'image-text': ['title', 'subtitle', 'section', 'points', 'imageId', 'caption'],
  'compare-table': ['title', 'subtitle', 'section', 'table', 'highlightCol', 'takeaway'],
  process: ['title', 'subtitle', 'section', 'steps', 'takeaway'],
  timeline: ['title', 'subtitle', 'section', 'events', 'takeaway'],
  kpi: ['title', 'subtitle', 'section', 'kpis', 'points'],
  architecture: ['title', 'subtitle', 'section', 'layers', 'takeaway'],
  matrix: ['title', 'subtitle', 'section', 'axes', 'quadrants', 'takeaway'],
  summary: ['title', 'subtitle', 'section', 'points', 'takeaway'],
  closing: ['title', 'subtitle', 'contact'],
};
const COMMON = ['layout', 'notes'];
export const LIMITS = { slides: 50, pointsMax: 5, pointChars: 30, title: 60, subtitle: 90 };
const bad = (m) => { throw Error(m); };
const str = (v, max, what) => { if (typeof v !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) bad(`${what}须为文本`); if (v.length > max) bad(`${what}最多${max}字`); return v; };
const opt = (o, k, max, what) => { if (o[k] !== undefined) str(o[k], max, what); };
const arr = (v, min, max, what) => { if (!Array.isArray(v) || v.length < min || v.length > max) bad(`${what}需${min}到${max}项`); return v; };
const obj = (v, keys, what) => { if (!v || typeof v !== 'object' || Array.isArray(v)) bad(`${what}格式无效`); for (const k of Object.keys(v)) if (!keys.includes(k)) bad(`${what}含未知字段 ${k}`); return v; };
export function validateDeckSlide(s, index = 0) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) bad(`第${index + 1}页格式无效`);
  if (!LAYOUTS.includes(s.layout)) bad(`第${index + 1}页 layout 无效，可选：${LAYOUTS.join('/')}`);
  const p = `第${index + 1}页(${s.layout})`;
  for (const k of Object.keys(s)) if (!COMMON.includes(k) && !SLOTS[s.layout].includes(k)) bad(`${p}含未知字段 ${k}`);
  opt(s, 'title', LIMITS.title, `${p}标题`); opt(s, 'subtitle', LIMITS.subtitle, `${p}副标题`); opt(s, 'notes', 2000, `${p}备注`);
  opt(s, 'section', 12, `${p}章节编号`); opt(s, 'takeaway', 120, `${p}结论条`); opt(s, 'meta', 80, `${p}元信息`); opt(s, 'contact', 120, `${p}联系信息`); opt(s, 'caption', 60, `${p}图注`); opt(s, 'number', 8, `${p}章节号`);
  if (!s.title && s.layout !== 'closing') bad(`${p}缺少 title`);
  const L = s.layout;
  const pts = (v, what) => arr(v, 1, LIMITS.pointsMax, what).forEach((x) => str(x, 200, `${what}条目`));
  if (L === 'toc') arr(s.items, 2, 8, `${p}目录项`).forEach((x) => { obj(x, ['title', 'desc'], '目录项'); str(x.title, 40, '目录标题'); opt(x, 'desc', 80, '目录说明'); });
  if (L === 'cards') arr(s.cards, 2, 4, `${p}卡片`).forEach((c) => { obj(c, ['title', 'body'], '卡片'); str(c.title, 40, '卡片标题'); str(c.body, 200, '卡片正文'); });
  if (L === 'image-text') { pts(s.points, `${p}要点`); if (s.imageId !== undefined && !/^[A-Za-z0-9_-]{1,100}$/.test(s.imageId)) bad('图片必须使用本轮附加的图片ID'); }
  if (L === 'compare-table') {
    const rows = arr(s.table, 2, 40, `${p}表格行`); let cols;
    rows.forEach((r) => { arr(r, 2, 5, `${p}表格列(含行标题列，数据列2–4)`); if (cols !== undefined && cols !== r.length) bad('表格各行列数需一致'); cols = r.length; r.forEach((c) => str(c, 120, '单元格')); });
    if (s.highlightCol !== undefined && (!Number.isInteger(s.highlightCol) || s.highlightCol < 1 || s.highlightCol >= cols)) bad('highlightCol 须为数据列序号');
  }
  if (L === 'process') arr(s.steps, 3, 6, `${p}步骤`).forEach((c) => { obj(c, ['title', 'body'], '步骤'); str(c.title, 30, '步骤标题'); opt(c, 'body', 120, '步骤说明'); });
  if (L === 'timeline') arr(s.events, 3, 8, `${p}事件`).forEach((c) => { obj(c, ['date', 'title', 'body'], '事件'); str(c.date, 24, '日期'); str(c.title, 40, '事件标题'); opt(c, 'body', 120, '事件说明'); });
  if (L === 'kpi') { arr(s.kpis, 2, 4, `${p}指标`).forEach((c) => { obj(c, ['value', 'label', 'note'], '指标'); str(c.value, 14, '指标数值'); str(c.label, 30, '指标名'); opt(c, 'note', 80, '指标注释'); }); if (s.points !== undefined) arr(s.points, 1, 3, `${p}解读`).forEach((x) => str(x, 200, '解读')); }
  if (L === 'architecture') arr(s.layers, 2, 5, `${p}层级`).forEach((c) => { obj(c, ['name', 'items'], '层级'); str(c.name, 20, '层名'); arr(c.items, 1, 8, '层内模块').forEach((x) => str(x, 40, '模块')); });
  if (L === 'matrix') { obj(s.axes, ['x', 'y'], '坐标轴'); str(s.axes.x, 20, 'X轴'); str(s.axes.y, 20, 'Y轴'); arr(s.quadrants, 4, 4, `${p}象限`).forEach((c) => { obj(c, ['title', 'body'], '象限'); str(c.title, 30, '象限标题'); opt(c, 'body', 120, '象限说明'); }); }
  if (L === 'summary') { arr(s.points, 1, LIMITS.pointsMax, `${p}结论`).forEach((x) => { if (typeof x === 'string') str(x, 200, '结论'); else { obj(x, ['title', 'body'], '结论'); str(x.title, 40, '结论标题'); opt(x, 'body', 120, '结论说明'); } }); }
  return s;
}
export function validateDeck(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) bad('演示文稿格式无效');
  for (const k of Object.keys(spec)) if (!['slides', 'theme', 'brand', 'title', 'pageNumbers'].includes(k)) bad(`未知字段 ${k}`);
  if (spec.theme !== undefined && !themeNames().includes(spec.theme)) bad(`theme 可选：${themeNames().join('/')}`);
  if (spec.brand !== undefined) { obj(spec.brand, ['name', 'logoImageId', 'showLogo'], 'brand'); opt(spec.brand, 'name', 30, '品牌名'); if (spec.brand.logoImageId !== undefined && !/^[A-Za-z0-9_-]{1,100}$/.test(spec.brand.logoImageId)) bad('logo 须使用本轮附加图片ID'); }
  arr(spec.slides, 1, LIMITS.slides, '幻灯片').forEach(validateDeckSlide);
  return { theme: DEFAULT_THEME, pageNumbers: true, ...spec };
}
export const isDeckSpec = (spec) => Array.isArray(spec?.slides) && spec.slides.some((s) => s && s.layout !== undefined);
/** 质量 lint（不阻断）：要点条数/字数、wall-of-text、缺待核验标注等。 */
export function lintDeck(spec) {
  const w = [];
  spec.slides.forEach((s, i) => {
    const at = `第${i + 1}页`;
    const lists = [['points', s.points?.map((x) => (typeof x === 'string' ? x : `${x.title}${x.body || ''}`))], ['cards', s.cards?.map((c) => c.body)], ['steps', s.steps?.map((c) => c.body || '')], ['events', s.events?.map((c) => c.body || '')]];
    for (const [k, v] of lists) v?.forEach((t) => { if ((t || '').length > LIMITS.pointChars * 4) w.push(`${at} ${k} 单条超过${LIMITS.pointChars * 4}字，建议精简`); });
    s.points?.forEach((x) => { const t = typeof x === 'string' ? x : x.title; if (t.length > LIMITS.pointChars) w.push(`${at} 要点超过${LIMITS.pointChars}字：${t.slice(0, 12)}…`); });
  });
  if (!spec.slides.some((s) => s.layout === 'cover')) w.push('缺少封面页');
  return w;
}
