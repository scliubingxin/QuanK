// 自适应排版引擎：校验 → 逐页版式 → 溢出则拆页（零溢出保证）→ 页码 → 渲染到 PptxGenJS。
import { validateDeck } from './schema.mjs';
import { getTheme, FONT, GRID } from './themes.mjs';
import { layoutSlide } from './layouts.mjs';
import { brandImages } from './quank-logo.mjs'; // [F1g]
import { splitText } from './measure.mjs';

const half = (a) => { const m = Math.ceil(a.length / 2); return [a.slice(0, m), a.slice(m)]; };
const splitItemText = (it, key) => {
  if (typeof it === 'string') { const [a, b] = splitText(it); return a && b ? [a, b] : null; }
  const text = it[key]; if (!text || text.length < 2) return null; const [a, b] = splitText(text); return a && b ? [{ ...it, [key]: a }, { ...it, title: it.title, [key]: b }] : null;
};
// 每个版式的拆分器：返回 [前半, 后半] 两个 slide，或 null
const LIST = { toc: 'items', cards: 'cards', process: 'steps', timeline: 'events', kpi: 'kpis', summary: 'points', 'image-text': 'points', architecture: 'layers' };
const BODY_KEY = { cards: 'body', process: 'body', timeline: 'body', summary: 'body' };
function splitSlide(s) {
  const L = s.layout;
  if (L === 'compare-table') {
    const [head, ...rows] = s.table;
    if (rows.length >= 2) { const [a, b] = half(rows); return [{ ...s, table: [head, ...a], takeaway: undefined }, { ...s, table: [head, ...b] }]; }
    if (rows.length === 1) { // 单行过高：按最长单元格拆文本
      const r = rows[0], k = r.reduce((bi, c, i) => (c.length > r[bi].length ? i : bi), 0), parts = splitText(r[k]);
      if (parts[0] && parts[1]) { const ra = r.slice(), rb = r.map((c, i) => (i === 0 ? c : '')); ra[k] = parts[0]; rb[k] = parts[1]; return [{ ...s, table: [head, ra], takeaway: undefined }, { ...s, table: [head, rb] }]; }
    }
    return null;
  }
  if (L === 'matrix') {
    const q = s.quadrants, base = { layout: 'cards', title: s.title, subtitle: s.subtitle, section: s.section };
    return [{ ...base, cards: q.slice(0, 2).map((x) => ({ title: x.title, body: x.body || x.title })) }, { ...base, cards: q.slice(2).map((x) => ({ title: x.title, body: x.body || x.title })), takeaway: s.takeaway, notes: s.notes }];
  }
  const key = LIST[L]; if (!key) return null;
  const items = s[key];
  if (L === 'architecture' && items.length === 1) { const [a, b] = half(items[0].items); return a.length && b.length ? [{ ...s, layers: [{ ...items[0], items: a }], takeaway: undefined }, { ...s, layers: [{ ...items[0], items: b }] }] : null; }
  if (items.length >= 2) {
    const [a, b] = half(items);
    if (L === 'image-text') return [{ ...s, points: a, takeaway: undefined }, { layout: 'summary', title: s.title, subtitle: s.subtitle, section: s.section, points: b, notes: s.notes }];
    const first = { ...s, [key]: a, takeaway: undefined }, second = { ...s, [key]: b };
    if (L === 'kpi') { delete second.points; }
    return [first, second];
  }
  const sp = splitItemText(items[0], BODY_KEY[L]); // 单项过长：拆文本
  if (sp) return [{ ...s, [key]: [sp[0]], takeaway: undefined }, { ...s, [key]: [sp[1]] }];
  return null;
}
const label = (s, i) => (i === 0 ? s : { ...s, title: `${s.title}${i === 1 ? '（续）' : `（续${i}）`}` });
function plan(s, ctx, depth = 0) {
  const r = layoutSlide(s, ctx);
  if (!r.overflow) return [s];
  const parts = depth < 6 ? splitSlide(s) : null;
  if (!parts) { s._overflow = true; return [s]; }
  const out = [...plan(parts[0], ctx, depth + 1), ...plan(parts[1], ctx, depth + 1)];
  return out;
}
const SECTIONS = new Set(['section']);
/** 把校验后的 deck 展开为最终页列表（含拆页、章节编号、续页标题）。 */
export function planDeck(input, { images } = {}) {
  const spec = validateDeck(input), theme = getTheme(spec.theme);
  const brand = { name: 'QuankSight', showLogo: true, ...(spec.brand || {}) };
  { const bi = brandImages(spec, images); images = bi.images; if (bi.markImageId) brand.markImageId = bi.markImageId; } // [F1g]
  const ctx = { theme, brand, images, page: 1, total: 1, pageNumbers: spec.pageNumbers !== false };
  let secNo = 0; const pages = [];
  for (const raw of spec.slides) {
    const s = { ...raw };
    if (SECTIONS.has(s.layout)) { secNo += 1; s.number = s.number || String(secNo).padStart(2, '0'); }
    const parts = plan(s, ctx);
    parts.forEach((p, i) => { const q = label(p, i); if (i > 0) delete q.notes; pages.push(q); });
  }
  return { pages, spec, theme, brand, pageNumbers: ctx.pageNumbers, images };
}
const NO_NUM = new Set(['cover', 'section', 'closing']);
/** 对最终页做版式，得到每页 shapes（带页码）。 */
export function layoutDeck(planned) {
  const total = planned.pages.length;
  return planned.pages.map((s, i) => {
    const ctx = { theme: planned.theme, brand: planned.brand, images: planned.images, page: i + 1, total, pageNumbers: planned.pageNumbers && !NO_NUM.has(s.layout) };
    const r = layoutSlide(s, ctx);
    return { layout: s.layout, title: s.title, notes: s.notes, overflow: r.overflow, shapes: r.shapes };
  });
}
export function buildDeckLayout(input, opts) { const planned = planDeck(input, opts); return { ...planned, slides: layoutDeck(planned) }; }

const col = (c) => String(c).replace('#', '');
/** 渲染到 PptxGenJS 实例。PptxGenCtor 由调用方传入（桌面端为 vendor 版本，Web 端为 npm 版本）。 */
export function renderDeck(PptxGenCtor, input, { images, title } = {}) {
  const built = buildDeckLayout(input, { images }), deck = new PptxGenCtor();
  deck.layout = 'LAYOUT_WIDE'; deck.author = 'QuankSight'; deck.lang = 'zh-CN'; deck.title = title || built.spec.title || ''; deck.company = built.brand.name;
  deck.theme = { headFontFace: FONT.zh, bodyFontFace: FONT.zh };
  for (const sl of built.slides) {
    const slide = deck.addSlide(); slide.background = { color: col(built.theme.bg) };
    for (const sh of sl.shapes) drawShape(slide, sh, built.images); // [F1g] includes the built-in mark
    if (sl.notes) slide.addNotes(sl.notes);
  }
  return { deck, built };
}
function drawShape(slide, sh, images) {
  if (sh.kind === 'shape') {
    if (sh.role === 'bg') { slide.background = { color: col(sh.fill) }; return; }
    const o = { x: sh.x, y: sh.y, w: sh.w, h: sh.h, fill: { color: col(sh.fill) }, line: sh.line ? { color: col(sh.line), width: sh.lineW ?? 0.75, ...(sh.dash ? { dashType: sh.dash } : {}) } : { type: 'none' } };
    if (sh.radius) o.rectRadius = sh.radius;
    slide.addShape(sh.shape, o); return;
  }
  if (sh.kind === 'image') { const img = images?.[sh.imageId]; if (!img) return; slide.addImage({ data: 'data:image/png;base64,' + img.base64, x: sh.x, y: sh.y, w: sh.w, h: sh.h }); return; }
  if (sh.kind === 'table') {
    const rows = sh.rows.map((r) => r.map((c) => ({ text: c.text, options: { bold: c.bold, fontSize: c.size, fontFace: FONT.zh, color: col(c.color), fill: { color: col(c.fill) }, align: c.align, valign: 'middle', margin: [sh.padY * 72, sh.padX * 72, sh.padY * 72, sh.padX * 72], border: Array(4).fill({ type: 'solid', pt: 2.5, color: col(sh.border) }) } })));
    slide.addTable(rows, { x: sh.x, y: sh.y, w: sh.w, colW: sh.colW, rowH: sh.rowH, autoPage: false }); return;
  }
  const runs = sh.paras.map((p, i) => ({ text: p.text, options: { fontSize: p.size || sh.size, bold: !!p.bold, color: col(p.color), fontFace: FONT.zh, breakLine: i < sh.paras.length - 1, ...(p.bullet ? { bullet: { indent: Math.round(sh.indent * 72) } } : {}), ...(i < sh.paras.length - 1 && sh.gap ? { paraSpaceAfter: sh.gap } : {}) } }));
  slide.addText(runs, { x: sh.x, y: sh.y, w: sh.w, h: sh.h, margin: 0, align: sh.align, valign: sh.valign, lineSpacingMultiple: sh.ls, fit: 'none', wrap: true, fontFace: FONT.zh, lang: 'zh-CN' });
}
export const SLIDE = { W: GRID.W, H: GRID.H };
