// 中文文本宽高估算与自适应拟合（纯函数，无依赖）。单位：字号 pt，尺寸 英寸。
export const LINE_EM = 1.32; // 微软雅黑单倍行距约 1.32em
const NO_START = new Set('，。、；：！？）》」』】〕”’,.;:!?)]}%'.split(''));
const NO_END = new Set('（《「『【〔“‘([{'.split(''));
export function charEm(ch) {
  const c = ch.codePointAt(0);
  if (c === 32) return 0.3;
  if (c < 128) {
    if (/[0-9]/.test(ch)) return 0.56;
    if (/[A-Z]/.test(ch)) return 0.66;
    if (/[ilI.,;:'!|]/.test(ch)) return 0.3;
    if (/[mwMW@%]/.test(ch)) return 0.88;
    return 0.55;
  }
  if (c >= 0xff61 && c <= 0xff9f) return 0.5;
  if (c >= 0x2018 && c <= 0x201d) return 0.5;
  return 1.0; // CJK、全角标点及其他
}
export function textEm(text, bold = false) {
  let n = 0;
  for (const ch of text) n += charEm(ch);
  return n * (bold ? 1.06 : 1) * 1.03; // 3% 安全余量
}
const ptToIn = (pt) => pt / 72;
/** 按宽度折行。拉丁词作为不可拆单元，行首禁止标点，行尾禁止开括号。 */
export function wrapLines(text, size, widthIn, { bold = false } = {}) {
  const max = widthIn / ptToIn(size);
  const out = [];
  for (const para of String(text).split('\n')) {
    const tokens = para.match(/[A-Za-z0-9][A-Za-z0-9.,%/+\-_@:'’#&]*|\s+|[\s\S]/gu) || [];
    let line = '', w = 0;
    const push = () => { out.push(line.replace(/\s+$/, '')); line = ''; w = 0; };
    for (const tk of tokens) {
      if (/^\s+$/.test(tk)) { if (line) { line += ' '; w += 0.3; } continue; }
      const tw = textEm(tk, bold);
      if (w + tw <= max + 1e-6) { line += tk; w += tw; continue; }
      if (!line) { // 超长单词强制拆
        for (const ch of tk) { const cw = textEm(ch, bold); if (w + cw > max && line) push(); line += ch; w += cw; }
        continue;
      }
      if (tk.length === 1 && NO_START.has(tk)) { line += tk; w += tw; continue; } // 悬挂标点
      const last = line.slice(-1);
      if (NO_END.has(last)) { line = line.slice(0, -1); push(); line = last + tk; w = textEm(line, bold); continue; }
      push(); line = tk; w = tw;
    }
    if (line || para === '') push();
  }
  return out.length ? out : [''];
}
/** paras: [{text,bold,size?}]；返回高度（英寸）与行数。 */
export function measureParas(paras, widthIn, { size, ls = 1.1, gap = 0, indent = 0 } = {}) {
  let h = 0, lines = 0;
  paras.forEach((p, i) => {
    const s = p.size || size, w = Math.max(0.2, widthIn - (p.bullet ? indent : 0));
    const n = wrapLines(p.text, s, w, { bold: !!p.bold }).length;
    lines += n; h += n * ptToIn(s) * LINE_EM * ls + (i ? ptToIn(gap) : 0);
  });
  return { h, lines };
}
/** 依次尝试：缩字（至下限）→ 紧凑行距/段距（精简换行）。返回 {size, ls, gap, ok, h}。 */
export function fitParas(paras, w, h, { max, min, ls = 1.1, gap = 0, indent = 0, step = 0.5 }) {
  for (let s = max; s >= min - 1e-9; s -= step) {
    const m = measureParas(paras, w, { size: s, ls, gap, indent });
    if (m.h <= h + 1e-6) return { size: s, ls, gap, ok: true, h: m.h };
  }
  const cls = Math.min(ls, 1.0), cgap = gap * 0.5;
  const m = measureParas(paras, w, { size: min, ls: cls, gap: cgap, indent });
  return { size: min, ls: cls, gap: cgap, ok: m.h <= h + 1e-6, h: m.h };
}
/** 取所有项都能放下的最大公共字号（保持同页字号一致）。 */
export function commonSize(items, fn, { max, min, step = 0.5 }) {
  for (let s = max; s >= min - 1e-9; s -= step) if (items.every((it) => fn(it, s))) return { size: s, ok: true };
  return { size: min, ok: items.every((it) => fn(it, min)) };
}
/** 在句末标点处近似居中拆分文本；找不到则按字符中点。 */
export function splitText(text) {
  const chars = Array.from(text), mid = chars.length / 2;
  let best = -1;
  chars.forEach((c, i) => { if ('。！？；.!?;\n'.includes(c) && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i; });
  if (best < 0) chars.forEach((c, i) => { if ('，、,： '.includes(c) && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i; });
  const cut = best >= 0 && best < chars.length - 1 ? best + 1 : Math.ceil(mid);
  return [chars.slice(0, cut).join('').trim(), chars.slice(cut).join('').trim()];
}
