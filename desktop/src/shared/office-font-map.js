// [lane:render] Font substitution table for the private LibreOffice worker on macOS.
// Used both to write fontconfig aliases (runtime/office-fonts.mjs) and to report substitutions to the UI.
const SANS_CJK = ['PingFang SC', 'Hiragino Sans GB', 'STHeiti'];
const SANS_LATIN = ['Helvetica Neue', 'Helvetica', 'Arial'];
export const FONT_SUBSTITUTIONS = Object.freeze([
  {from: ['微软雅黑', 'Microsoft YaHei', 'Microsoft YaHei UI', '微软雅黑 Light', 'Microsoft YaHei Light'], to: SANS_CJK},
  {from: ['等线', '等线 Light', 'DengXian', 'DengXian Light'], to: SANS_CJK},
  {from: ['黑体', 'SimHei'], to: ['Heiti SC', 'PingFang SC', 'STHeiti']},
  {from: ['宋体', '新宋体', 'SimSun', 'NSimSun'], to: ['Songti SC', 'STSong', 'PingFang SC']},
  {from: ['楷体', '楷体_GB2312', 'KaiTi', 'KaiTi_GB2312'], to: ['Kaiti SC', 'STKaiti', 'PingFang SC']},
  {from: ['仿宋', '仿宋_GB2312', 'FangSong', 'FangSong_GB2312'], to: ['STFangsong', 'Songti SC', 'PingFang SC']},
  {from: ['Calibri', 'Calibri Light', 'Arial', 'Arial Narrow', 'Segoe UI', 'Tahoma', 'Verdana', 'Microsoft Sans Serif'], to: SANS_LATIN},
  {from: ['Times New Roman', 'Cambria'], to: ['Times New Roman', 'Times', 'Songti SC']},
  {from: ['Consolas', 'Courier New'], to: ['Menlo', 'Monaco', 'Courier']}
]);
const norm = name => String(name || '').trim().toLowerCase();
const index = new Map();
for (const row of FONT_SUBSTITUTIONS) for (const name of row.from) index.set(norm(name), row.to);

// The editors offer Chinese names; the private engine renders the macOS families behind them.
export const CJK_FALLBACK = 'PingFang SC';

/** Family to send for a document font name, or null when the engine has no such font. */
export function documentFontFamily(name, installed) {
  const label = String(name || '').trim();
  if (!label) return null;
  const candidates = index.get(norm(label)), have = new Set((installed || []).map(norm));
  const cjk = /[^\x00-\x7f]/.test(label);
  if (!have.size) return cjk && candidates ? candidates[0] : label; // engine list unknown: send a family LOK can alias
  if (have.has(norm(label))) return label;
  if (!cjk || !candidates) return null; // a font the engine does not have is not offered
  return candidates.find(family => have.has(norm(family))) || CJK_FALLBACK;
}

/** Select options {name, family, label} for the document fonts this engine can render. */
export function officeFontChoices(names, installed) {
  return names.map(name => {
    const family = documentFontFamily(name, installed);
    return family && {name: String(name), family, label: String(name)};
  }).filter(Boolean);
}

// used / installed: arrays of family names. A font is reported only when it is missing and a replacement exists.
export function detectFontSubstitutions(used, installed) {
  const have = new Set((installed || []).map(norm));
  const seen = new Set(), out = [];
  for (const name of used || []) {
    const key = norm(name);
    if (!key || seen.has(key) || have.has(key) || !index.has(key)) continue;
    seen.add(key);
    const targets = index.get(key);
    out.push({from: String(name).trim(), to: targets.find(t => have.has(norm(t))) || targets[0]});
  }
  return out;
}
