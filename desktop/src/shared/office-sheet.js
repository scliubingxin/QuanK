// [excel] Pure spreadsheet helpers shared by the Electron main side (validation) and the renderer (UI).
// No DOM, no Node APIs: unit tested in tests/office-sheet.test.mjs.
export const MAX_COL = 16384, MAX_ROW = 1048576;
export const TWIPS_PER_PX = 15;

// ---- keys ------------------------------------------------------------------------
/** Keys forwarded to the native Calc view (include/vcl/keycodes.hxx codes live in worker.py). */
export const SHEET_KEYS = Object.freeze(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'F2']);
/** KeyboardEvent -> sheet_key payload, or null when the key is not a native navigation/edit key. */
export function sheetKeyEvent(e) {
  if (!e || e.isComposing || e.keyCode === 229) return null;
  const key = e.key === 'Return' ? 'Enter' : e.key;
  if (!SHEET_KEYS.includes(key)) return null;
  return {key, shift: !!e.shiftKey, control: !!(e.ctrlKey || e.metaKey), alt: !!e.altKey};
}
/** Printable single character typed without command modifiers, else null. */
export function sheetTypedChar(e) {
  if (!e || e.isComposing || e.keyCode === 229 || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (typeof e.key !== 'string' || [...e.key].length !== 1) return null;
  const c = e.key.codePointAt(0);
  return c >= 32 && c !== 127 && c <= 0xFFFF ? e.key : null;
}
export function validateSheetKey(p = {}) {
  const extra = Object.keys(p).filter(k => !['key', 'shift', 'control', 'alt', 'op'].includes(k));
  if (extra.length || !SHEET_KEYS.includes(p.key) || ['shift', 'control', 'alt'].some(k => p[k] !== undefined && typeof p[k] !== 'boolean')) throw Error('表格按键无效');
  return {key: p.key, shift: !!p.shift, control: !!p.control, alt: !!p.alt};
}
export function validateSheetText(text) {
  if (typeof text !== 'string' || !text.length || text.length > 200) throw Error('输入文字超限');
  for (const ch of text) { const c = ch.codePointAt(0); if (c < 32 || c > 0xFFFF) throw Error('输入包含不支持的字符'); }
  return text;
}

// ---- formula policy (mirrors worker.py formula_ok) -------------------------------
const FORMULA_DENY = /\b(?:WEBSERVICE|FILTERXML|INDIRECT|DDE|INFO|CALL|REGISTER(?:\.ID)?|EXEC|SHELL|RTD|HYPERLINK|IMPORTXML|IMPORTDATA|IMPORTHTML|IMPORTRANGE|IMAGE)\s*\(/i;
const FORMULA_EXTERNAL = /(?:file:|https?:|ftp:|:\/\/|\[|'\s*#)/i;
export function isFormulaLike(text) { return typeof text === 'string' && /^\s*(?:[=+@]|-\s*[A-Za-z(])/.test(text); }
/** Plain text is always fine; formulas may not fetch external data or reference other files. */
export function formulaAllowed(text) {
  if (typeof text !== 'string') return false;
  if (!isFormulaLike(text)) return true;
  return text.length <= 8192 && !FORMULA_DENY.test(text) && !FORMULA_EXTERNAL.test(text);
}
export function validateCellInput(p = {}) {
  const {text, move = 'none'} = p;
  if (typeof text !== 'string' || text.length > 8192 || text.includes('\0')) throw Error('单元格内容超限');
  if (!['none', 'down', 'right', 'up', 'left'].includes(move)) throw Error('移动方向无效');
  if (!formulaAllowed(text)) throw Error('公式包含不允许的函数或外部引用');
  return {text, move};
}

// ---- references ------------------------------------------------------------------
export function colName(index) { // 0-based -> 'A'
  if (!Number.isInteger(index) || index < 0 || index >= MAX_COL) return '';
  let n = index + 1, s = '';
  while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
export function colIndex(name) { // 'A' -> 0
  if (typeof name !== 'string' || !/^[A-Z]{1,3}$/.test(name)) return -1;
  const n = [...name].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
  return n < MAX_COL ? n : -1;
}
export function cellRef(col, row) { return colName(col) + (row + 1); }
/** Normalises user input for the name box: 'b3', 'A1:c4', 'C:C', '3:5', '$A$1' -> GoToCell reference or null. */
export function normalizeRef(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().toUpperCase().replace(/\$/g, '');
  let m = s.match(/^([A-Z]{1,3})([1-9][0-9]{0,6})(?::([A-Z]{1,3})([1-9][0-9]{0,6}))?$/);
  if (m) {
    const c1 = colIndex(m[1]), r1 = +m[2], c2 = colIndex(m[3] || m[1]), r2 = +(m[4] || m[2]);
    if (c1 < 0 || c2 < 0 || r1 > MAX_ROW || r2 > MAX_ROW) return null;
    const a = colName(Math.min(c1, c2)) + Math.min(r1, r2), b = colName(Math.max(c1, c2)) + Math.max(r1, r2);
    return m[3] ? a + ':' + b : a;
  }
  m = s.match(/^([A-Z]{1,3}):([A-Z]{1,3})$/);
  if (m) { const a = colIndex(m[1]), b = colIndex(m[2]); if (a < 0 || b < 0) return null; return colName(Math.min(a, b)) + '1:' + colName(Math.max(a, b)) + MAX_ROW; }
  m = s.match(/^([1-9][0-9]{0,6}):([1-9][0-9]{0,6})$/);
  if (m) { const a = +m[1], b = +m[2]; if (a > MAX_ROW || b > MAX_ROW) return null; return 'A' + Math.min(a, b) + ':' + colName(MAX_COL - 1) + Math.max(a, b); }
  return null;
}
export function validateGotoRef(ref) {
  if (typeof ref !== 'string' || !/^[A-Z]{1,3}[1-9][0-9]{0,6}(?::[A-Z]{1,3}[1-9][0-9]{0,6})?$/.test(ref) || normalizeRef(ref) !== ref) throw Error('单元格引用无效');
  return ref;
}
export function columnRange(a, b = a) { return colName(Math.min(a, b)) + '1:' + colName(Math.max(a, b)) + MAX_ROW; }
export function rowRange(a, b = a) { return 'A' + (Math.min(a, b) + 1) + ':' + colName(MAX_COL - 1) + (Math.max(a, b) + 1); }
/** 'B4' / 'A7:C8' -> {c1,r1,c2,r2} (0-based) or null. */
export function parseAddress(addr) {
  const m = String(addr || '').trim().match(/^\$?([A-Z]{1,3})\$?([0-9]{1,7})(?::\$?([A-Z]{1,3})\$?([0-9]{1,7}))?$/);
  if (!m) return null;
  const c1 = colIndex(m[1]), r1 = +m[2] - 1, c2 = colIndex(m[3] || m[1]), r2 = +(m[4] || m[2]) - 1;
  if (c1 < 0 || c2 < 0 || r1 < 0 || r2 < 0) return null;
  return {c1: Math.min(c1, c2), r1: Math.min(r1, r2), c2: Math.max(c1, c2), r2: Math.max(r1, r2)};
}

// ---- LibreOfficeKit payloads -----------------------------------------------------
const nums = text => String(text || '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
/** LOK_CALLBACK_CELL_CURSOR "x, y, w, h, col, row" (twips) -> object, 'EMPTY' -> null. */
export function parseCellCursor(payload) {
  const v = nums(payload);
  if (v.length < 4 || !(v[2] > 0) || !(v[3] > 0)) return null;
  return {x: v[0], y: v[1], width: v[2], height: v[3], col: v.length >= 6 ? v[4] : null, row: v.length >= 6 ? v[5] : null};
}
export function parseRect(payload) {
  const v = nums(payload);
  return v.length >= 4 && v[2] > 0 && v[3] > 0 ? {x: v[0], y: v[1], width: v[2], height: v[3]} : null;
}
/** ".uno:SheetGeometryData" run-length "size:lastIndex size:lastIndex" -> [{value,end}] (end inclusive). */
export function parseRuns(text, max) {
  const runs = [];
  for (const part of String(text || '').trim().split(/\s+/)) {
    const m = part.match(/^(\d+):(\d+)$/); if (!m) continue;
    const value = +m[1], end = Math.min(+m[2], max - 1);
    if (runs.length && end <= runs[runs.length - 1].end) continue;
    runs.push({value, end});
    if (end >= max - 1) break;
  }
  return runs;
}
/** Effective sizes (twips) per run: hidden/filtered rows and columns have size 0. */
export function axisRuns(axis, max) {
  if (!axis) return null;
  const sizes = parseRuns(axis.sizes, max); if (!sizes.length) return null;
  const hidden = parseRuns(axis.hidden, max), filtered = parseRuns(axis.filtered, max);
  const cuts = [...new Set([...sizes, ...hidden, ...filtered].map(r => r.end))].sort((a, b) => a - b);
  const at = (runs, i) => { for (const r of runs) if (i <= r.end) return r.value; return 0; };
  const out = [];
  let start = 0;
  for (const end of cuts) {
    if (end < start) continue;
    const size = at(hidden, end) || at(filtered, end) ? 0 : at(sizes, end);
    if (out.length && out[out.length - 1].size === size) out[out.length - 1].end = end; else out.push({start, end, size});
    start = end + 1;
  }
  return out;
}
/** Headers intersecting [from, from+length) twips: [{index, start, size}] with start in twips. */
export function visibleSpans(runs, from, length, limit = 400) {
  const out = [];
  if (!runs) return out;
  let pos = 0;
  const to = from + length;
  for (const r of runs) {
    const count = r.end - r.start + 1, span = count * r.size;
    if (r.size === 0) continue;
    if (pos + span <= from) { pos += span; continue; }
    let i = Math.max(0, Math.floor((from - pos) / r.size));
    for (; i < count && out.length < limit; i++) {
      const s = pos + i * r.size;
      if (s >= to) return out;
      out.push({index: r.start + i, start: s, size: r.size});
    }
    pos += span;
    if (pos >= to || out.length >= limit) break;
  }
  return out;
}
/** Twips offset where header `index` starts. */
export function spanStart(runs, index) {
  let pos = 0;
  for (const r of runs || []) {
    if (index <= r.end) return pos + Math.max(0, index - r.start) * r.size;
    pos += (r.end - r.start + 1) * r.size;
  }
  return pos;
}
export function spanSize(runs, index) {
  for (const r of runs || []) if (index <= r.end && index >= r.start) return r.size;
  return 0;
}

// ---- status bar statistics --------------------------------------------------------
/** Displayed numbers such as "1,234.50", "12%", "¥5.00", "(3)" -> number or null. */
export function parseDisplayNumber(text) {
  let s = String(text ?? '').trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  const pct = s.endsWith('%');
  s = s.replace(/%$/, '').replace(/^[¥￥$€£]|^HK\$|^US\$/, '').replace(/[,\s]/g, '');
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(s)) return null;
  let n = Number(s); if (!Number.isFinite(n)) return null;
  if (pct) n /= 100; if (neg) n = -n;
  return n;
}
/** TSV selection text -> {count, numeric, sum, average} or null for an empty/single-cell selection. */
export function selectionStats(text, {single = false} = {}) {
  if (typeof text !== 'string' || single) return null;
  const rows = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  if (rows.length === 1 && !rows[0].includes('\t')) return null;
  let count = 0, numeric = 0, sum = 0;
  for (const row of rows) for (const cell of row.split('\t')) {
    if (cell.trim() === '') continue;
    count++;
    const n = parseDisplayNumber(cell);
    if (n !== null) { numeric++; sum += n; }
  }
  return {count, numeric, sum, average: numeric ? sum / numeric : null};
}
/** Calc STATE_CHANGED ".uno:StateTableCell" = "Average: 2; Sum: 6" (locale dependent) -> {sum, average}. */
export function parseStateTableCell(value) {
  const out = {};
  for (const part of String(value || '').split(';')) {
    const m = part.match(/^\s*([^:：]+)[:：]\s*(.+)$/); if (!m) continue;
    const n = parseDisplayNumber(m[2]); if (n === null) continue;
    const k = m[1].trim().toLowerCase();
    if (/sum|求和|合计/.test(k)) out.sum = n; else if (/average|平均/.test(k)) out.average = n; else if (/count|计数/.test(k)) out.count = n;
  }
  return out;
}
export function formatStat(n) {
  if (!Number.isFinite(n)) return '';
  const r = Math.round(n * 1e6) / 1e6;
  return r.toLocaleString('zh-CN', {maximumFractionDigits: 6});
}

// ---- sheet names ----------------------------------------------------------------
export function sheetNameValid(name, existing = []) {
  return typeof name === 'string' && name.length > 0 && name.length <= 31 && !/[[\]*?:/\\\u0000-\u001f]/.test(name) && !/^'|'$/.test(name) && !existing.includes(name);
}
export function nextSheetName(existing = []) {
  for (let i = existing.length + 1; i < existing.length + 200; i++) { const n = '工作表' + i; if (!existing.includes(n)) return n; }
  return '工作表' + Date.now();
}
export const BORDER_KINDS = Object.freeze(['all', 'outer', 'inner', 'none', 'top', 'bottom', 'left', 'right', 'horizontal', 'vertical', 'thick-outer']);
export const BORDER_STYLES = Object.freeze(['solid', 'dotted', 'dashed', 'double']);
export function validateBorder(p = {}) {
  if (!BORDER_KINDS.includes(p.kind)) throw Error('边框类型无效');
  const color = p.color ?? '#000000', style = p.style ?? 'solid';
  if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color) || !BORDER_STYLES.includes(style)) throw Error('边框样式无效');
  return {kind: p.kind, color, style};
}
export function validateSheetTab(p = {}, partCount = 100) {
  const actions = ['insert', 'rename', 'delete', 'move', 'copy', 'color'];
  if (!actions.includes(p.action) || !Number.isInteger(p.index) || p.index < 0 || p.index > Math.min(99, partCount)) throw Error('工作表操作无效');
  const out = {action: p.action, index: p.index};
  if (p.action === 'insert' || p.action === 'rename') { if (!sheetNameValid(p.name)) throw Error('工作表名称无效（1-31字，不能含 []*?:/\\）'); out.name = p.name; }
  if (p.action === 'move' || p.action === 'copy') { if (!Number.isInteger(p.to) || p.to < 0 || p.to > 100) throw Error('目标位置无效'); out.to = p.to; }
  if (p.action === 'color') { if (typeof p.color !== 'string' || !/^(#[0-9A-Fa-f]{6}|none)$/.test(p.color)) throw Error('标签颜色无效'); out.color = p.color; }
  return out;
}
export function validateSheetSize(p = {}) {
  if (!['column', 'row'].includes(p.axis) || !Number.isInteger(p.index) || p.index < 0 || p.index >= (p.axis === 'column' ? MAX_COL : MAX_ROW) || !Number.isInteger(p.size) || p.size < 30 || p.size > 30000) throw Error('行高列宽无效');
  return {axis: p.axis, index: p.index, size: p.size};
}
