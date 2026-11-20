// [p4-m1] Lenient, read-only table reader for dashboards: XLSX (values, shared/inline strings, dates via number formats) and CSV/TSV.
// Never evaluates formulas (uses cached values), never follows external relationships, bounded rows/columns.
import office from './vendor/office.cjs';
import { openPackage } from './documents.mjs';
import { tableFromGrid, LIMITS } from '../src/shared/dashboard.js';

const parse = bytes => new office.DOMParser({onError: () => {}}).parseFromString(new TextDecoder('utf-8').decode(bytes), 'application/xml');
const all = (n, name) => Array.from(n.getElementsByTagNameNS('*', name));
const DATE_BUILTIN = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
const pad = n => String(n).padStart(2, '0');
function serialToText(serial, withTime) {
  const ms = Math.round((serial - 25569) * 864e5), d = new Date(ms);
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return withTime && (d.getUTCHours() || d.getUTCMinutes()) ? `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : day;
}
const colIndex = ref => { const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

export function readXlsx(bytes, {sheet} = {}) {
  const files = openPackage(Buffer.from(bytes));
  const book = files['xl/workbook.xml'] && parse(files['xl/workbook.xml']);
  if (!book) throw new Error('不是有效的 Excel 工作簿');
  const rels = files['xl/_rels/workbook.xml.rels'] ? all(parse(files['xl/_rels/workbook.xml.rels']), 'Relationship') : [];
  const target = new Map(rels.filter(r => (r.getAttribute('TargetMode') || '').toLowerCase() !== 'external').map(r => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const sheets = all(book, 'sheet').map(s => {
    const t = target.get(s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id')) || '';
    const part = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
    return {name: s.getAttribute('name') || '工作表', part};
  }).filter(s => /^xl\/worksheets\/[^/]+\.xml$/.test(s.part) && files[s.part]);
  if (!sheets.length) throw new Error('工作簿里没有可读取的工作表');
  const chosen = sheets.find(s => s.name === sheet) || sheets[0];
  const shared = files['xl/sharedStrings.xml'] ? all(parse(files['xl/sharedStrings.xml']), 'si').map(si => all(si, 't').map(t => t.textContent).join('')) : [];
  const dateStyles = new Set();
  if (files['xl/styles.xml']) {
    const st = parse(files['xl/styles.xml']), custom = new Map(all(st, 'numFmt').map(f => [+f.getAttribute('numFmtId'), f.getAttribute('formatCode') || '']));
    const xfs = all(st, 'cellXfs')[0];
    (xfs ? Array.from(xfs.childNodes).filter(n => n.localName === 'xf') : []).forEach((xf, i) => {
      const id = +xf.getAttribute('numFmtId'), code = (custom.get(id) || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
      if (DATE_BUILTIN.has(id) || (/[ymd]/i.test(code) && !/^[#0.,%\s]+$/.test(code))) dateStyles.add(i);
    });
  }
  const doc = parse(files[chosen.part]), grid = [];
  for (const row of all(doc, 'row')) {
    const ri = (+row.getAttribute('r') || grid.length + 1) - 1;
    if (ri >= LIMITS.rows + 1) break;
    const out = grid[ri] = grid[ri] || [];
    for (const c of Array.from(row.childNodes).filter(n => n.localName === 'c')) {
      const i = colIndex(c.getAttribute('r'));
      if (i < 0 || i >= LIMITS.columns) continue;
      const t = c.getAttribute('t'), v = all(c, 'v')[0]?.textContent;
      let value = null;
      if (t === 's') value = shared[+v] ?? null;
      else if (t === 'inlineStr') value = all(c, 't').map(x => x.textContent).join('');
      else if (t === 'b') value = v === '1';
      else if (t === 'str' || t === 'e') value = v ?? null;
      else if (v !== undefined && v !== '') {
        const n = Number(v);
        value = !Number.isFinite(n) ? v : dateStyles.has(+(c.getAttribute('s') || 0)) && n > 0 && n < 2958466 ? serialToText(n, n % 1 !== 0) : n;
      }
      out[i] = value;
    }
  }
  const dense = Array.from({length: grid.length}, (_, i) => grid[i] || []);
  return {sheets: sheets.map(s => s.name), sheet: chosen.name, ...tableFromGrid(dense)};
}

/** RFC 4180-ish CSV with quotes; delimiter auto-detected among , ; \t |. UTF-8 (BOM) or GB18030. */
export function readCsv(bytes) {
  const b = Buffer.from(bytes);
  if (b.length > 16 * 1024 * 1024) throw new Error('CSV 文件超过 16MB');
  let text;
  try { text = new TextDecoder('utf-8', {fatal: true}).decode(b); } catch { text = new TextDecoder('gb18030').decode(b); }
  text = text.replace(/^\uFEFF/, '');
  const head = text.slice(0, 4000).split(/\r?\n/).slice(0, 5);
  const delim = [',', '\t', ';', '|'].map(d => [d, Math.min(...head.filter(Boolean).map(l => l.split(d).length))]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; if (rows.length > LIMITS.rows + 1) break; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return {sheets: [], sheet: '', ...tableFromGrid(rows.map(r => r.map(v => v.trim())))};
}

export function readTable(format, bytes, opts = {}) {
  const f = String(format || '').toLowerCase();
  if (f === 'xlsx' || f === 'xlsm') return readXlsx(bytes, opts);
  if (f === 'csv' || f === 'tsv' || f === 'txt') return readCsv(bytes);
  throw new Error('仪表盘支持 Excel（.xlsx）和 CSV 文件');
}
