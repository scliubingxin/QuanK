// [docx] Pure Word-editor helpers shared by the main side (outline extraction) and the renderer (toolbar state).
// No DOM, no Node APIs: unit tested in tests/office-doc.test.mjs.

/** Chinese font size names (字号) with their point sizes, largest first. */
export const CN_SIZES = Object.freeze([
  ['初号', 42], ['小初', 36], ['一号', 26], ['小一', 24], ['二号', 22], ['小二', 18], ['三号', 16], ['小三', 15],
  ['四号', 14], ['小四', 12], ['五号', 10.5], ['小五', 9], ['六号', 7.5], ['小六', 6.5], ['七号', 5.5], ['八号', 5],
]);
export const NUM_SIZES = Object.freeze([8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]);
/** 10.5 -> '五号', 13 -> '13', '' -> ''. */
export function sizeLabel(pt) {
  const n = Number(pt);
  if (!Number.isFinite(n) || n <= 0) return '';
  const hit = CN_SIZES.find(([, v]) => Math.abs(v - n) < 0.01);
  return hit ? hit[0] : String(Math.round(n * 10) / 10);
}

/** Paragraph styles offered in the style picker: [LibreOffice programmatic name, label, preview css]. */
export const STYLE_CHOICES = Object.freeze([
  ['Standard', '正文', {fontSize: '14px'}],
  ['Title', '标题', {fontSize: '26px', fontWeight: '700'}],
  ['Subtitle', '副标题', {fontSize: '20px', color: '#5f6368'}],
  ['Heading 1', '标题 1', {fontSize: '22px', fontWeight: '700'}],
  ['Heading 2', '标题 2', {fontSize: '19px', fontWeight: '700'}],
  ['Heading 3', '标题 3', {fontSize: '17px', fontWeight: '700'}],
  ['Heading 4', '标题 4', {fontSize: '15.5px', fontWeight: '700'}],
  ['Heading 5', '标题 5', {fontSize: '14.5px', fontWeight: '700'}],
  ['Heading 6', '标题 6', {fontSize: '14px', fontWeight: '700'}],
]);
const STYLE_ALIASES = {'Default Paragraph Style': 'Standard', Normal: 'Standard', 'Text body': 'Standard', 'Body Text': 'Standard'};
/** LOK '.uno:StyleApply' state -> picker label ('' when unknown). */
export function styleLabel(state) {
  const s = String(state || '').trim();
  const name = STYLE_ALIASES[s] || s.replace(/^heading (\d)$/i, 'Heading $1');
  const hit = STYLE_CHOICES.find(([n]) => n === name);
  return hit ? hit[1] : s ? s.slice(0, 20) : '';
}
export function validateStyleName(name) {
  if (!STYLE_CHOICES.some(([n]) => n === name)) throw Error('段落样式不可用');
  return name;
}

/** '.uno:StatePageNumber' = 'Page 1 of 2' / '第 1 页，共 2 页' / 'Page 1 of 2 (Page 1)' -> {page, pages}. */
export function parsePageState(value) {
  const n = String(value || '').match(/\d+/g)?.map(Number) || [];
  return n.length >= 2 && n[0] >= 1 && n[1] >= n[0] ? {page: n[0], pages: n[1]} : null;
}
/** '.uno:StateWordCount' = '144 words, 169 characters' (or a selection variant 'Selected: 3 words, ...; 144 words') -> {words, characters}. */
export function parseWordCount(value) {
  const s = String(value || '');
  const total = s.includes(';') ? s.split(';').pop() : s;
  const n = total.replace(/[,，](?=\d{3}\b)/g, '').match(/\d+/g)?.map(Number) || [];
  return n.length ? {words: n[0], characters: n[1] ?? null} : null;
}
/** getPartPageRectangles '284, 284, 12240, 15840; 284, 16408, 12240, 15840' -> [{x,y,width,height}] (twips). */
export function parsePageRects(text) {
  return String(text || '').split(';').map(r => r.match(/-?\d+/g)?.map(Number) || []).filter(v => v.length === 4 && v[2] > 0 && v[3] > 0).map(([x, y, width, height]) => ({x, y, width, height}));
}
/** 1-based page shown at document y (twips) given page rectangles. */
export function pageAt(rects, y) {
  if (!rects.length) return 1;
  let page = 1;
  rects.forEach((r, i) => { if (y >= r.y - 300) page = i + 1; });
  return page;
}

// ---- outline from the saved DOCX (main side) ----
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
/** styles.xml -> Map(styleId -> outline level 0..8 or 'title'). */
export function headingStyles(stylesXml) {
  const map = new Map();
  for (const m of String(stylesXml || '').matchAll(/<w:style\b[^>]*w:type="paragraph"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    const id = m[0].match(/w:styleId="([^"]+)"/)?.[1]; if (!id) continue;
    const name = (m[1].match(/<w:name w:val="([^"]+)"/)?.[1] || '').toLowerCase();
    const lvl = m[1].match(/<w:outlineLvl w:val="(\d)"/)?.[1];
    if (name === 'title') map.set(id, 'title');
    else if (/^heading [1-9]$/.test(name)) map.set(id, +name.slice(-1) - 1);
    else if (lvl !== undefined) map.set(id, +lvl);
  }
  return map;
}
/** document.xml + styles map -> [{level (1-9, 0 = title), text, occurrence}] ; occurrence counts identical texts before it. */
export function docxOutline(documentXml, stylesXml, {limit = 500} = {}) {
  const styles = headingStyles(stylesXml), out = [], seen = new Map();
  const body = String(documentXml || '');
  for (const p of body.matchAll(/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g)) {
    const inner = p[1] || '';
    const sid = inner.match(/<w:pStyle w:val="([^"]+)"/)?.[1];
    const direct = inner.match(/<w:pPr>[\s\S]*?<w:outlineLvl w:val="(\d)"/)?.[1];
    let level = sid !== undefined && styles.has(sid) ? styles.get(sid) : direct !== undefined ? +direct : undefined;
    if (level === undefined || level === 9) continue;
    const text = decode([...inner.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(t => t[1]).join('')).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const occurrence = seen.get(text) || 0; seen.set(text, occurrence + 1);
    out.push({level: level === 'title' ? 0 : level + 1, text: text.slice(0, 200), occurrence});
    if (out.length >= limit) break;
  }
  return out;
}

// ---- validation for the dialogs that end up as UNO arguments ----
export function validateLink({text, url}) {
  const u = String(url || '').trim();
  if (!/^(https?:\/\/|mailto:)[^\s"<>]{1,990}$/i.test(u)) throw Error('请输入以 http(s):// 或 mailto: 开头的链接');
  const t = String(text || '').trim() || u;
  if (t.length > 200 || /[\u0000-\u001f]/.test(t)) throw Error('链接文字过长或含控制字符');
  return {text: t, url: u};
}
export function validateBookmarkName(name) {
  const n = String(name || '').trim();
  if (!/^[\p{L}\p{N}_-]{1,60}$/u.test(n)) throw Error('书签名称仅支持字母、数字、下划线和连字符（1-60 字）');
  return n;
}
export function validateComment(text) {
  const t = String(text || '').replace(/\r?\n/g, ' ').trim();
  if (!t || t.length > 2000 || /[\u0000-\u001f]/.test(t)) throw Error('批注内容为空或过长');
  return t;
}
export const SYMBOLS = Object.freeze(['，', '。', '、', '；', '：', '？', '！', '“', '”', '‘', '’', '（', '）', '《', '》', '【', '】', '—', '…', '·',
  '±', '×', '÷', '≈', '≠', '≤', '≥', '∞', '√', '∑', '°', '℃', '‰', '%', '¥', '$', '€', '£', '©', '®', '™', '§', '№',
  '→', '←', '↑', '↓', '↔', '⇒', '★', '☆', '●', '○', '■', '□', '▲', '△', '◆', '◇', '✓', '✗', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']);
