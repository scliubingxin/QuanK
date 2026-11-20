// [p4-m3] Infographics & posters: a bounded JSON spec (the model may produce it) rendered locally into a self-contained SVG.
// Every text is real text (escaped), no scripts, no foreignObject, no external references. Pure module for main and renderer.
export const TEMPLATES = [['stats', '数据摘要卡'], ['process', '流程'], ['timeline', '时间线'], ['compare', '对比'], ['list', '清单'], ['poster', '海报']];
export const SIZES = {portrait: [1080, 1350, '竖版 4:5'], landscape: [1600, 900, '横版 16:9'], square: [1080, 1080, '方形 1:1']};
export const MAX_ITEMS = {stats: 6, process: 6, timeline: 8, compare: 3, list: 8, poster: 4};
export const DEFAULT_BRAND = {name: '', primary: '#0078CB', accent: '#F59E0B', logo: ''};
const FONT = "-apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif";
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, n);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
export const hexColor = (v, d) => /^#[0-9a-f]{6}$/i.test(String(v || '').trim()) ? String(v).trim().toUpperCase() : d;

export function normalizeBrand(b = {}) {
  const logo = typeof b.logo === 'string' && /^[A-Za-z0-9+/=]+$/.test(b.logo) && b.logo.length <= 2800000 ? b.logo : '';
  return {name: clip(b.name, 40), primary: hexColor(b.primary, DEFAULT_BRAND.primary), accent: hexColor(b.accent, DEFAULT_BRAND.accent), logo};
}

/** JSON text / object -> {template, size, title, subtitle, items[{value,title,text}], footer}. Throws on unusable input. */
export function normalizeInfographic(input) {
  let s = input;
  if (typeof input === 'string') {
    if (input.length > 24000) throw new Error('信息图数据超过 24000 字符');
    const a = input.indexOf('{'), b = input.lastIndexOf('}');
    s = JSON.parse(a >= 0 && b > a ? input.slice(a, b + 1) : input);
  }
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('信息图数据需要 JSON 对象');
  const template = TEMPLATES.some(([t]) => t === s.template) ? s.template : 'list';
  const size = SIZES[s.size] ? s.size : template === 'process' || template === 'compare' ? 'landscape' : 'portrait';
  const title = clip(s.title, 60);
  if (!title) throw new Error('信息图需要标题');
  const items = (Array.isArray(s.items) ? s.items : []).slice(0, 20).map(i => typeof i === 'string' ? {title: i} : i || {})
    .map(i => ({value: clip(i.value, 24), title: clip(i.title, 40), text: clip(i.text ?? i.description, 240)})).filter(i => i.value || i.title || i.text).slice(0, MAX_ITEMS[template]);
  if (!items.length && template !== 'poster') throw new Error('信息图至少需要一项内容');
  return {template, size, title, subtitle: clip(s.subtitle, 120), items, footer: clip(s.footer, 80)};
}

// ---- text layout (estimated widths; CJK = 1em, Latin ~0.56em) -------------------------------------------
const charW = ch => /[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef\u3000-\u303f]/.test(ch) ? 1 : /[A-Z0-9@#%&WM]/.test(ch) ? 0.66 : /[ il.,:;'|!()[\]]/.test(ch) ? 0.3 : 0.56;
export const textWidth = (s, size) => [...String(s)].reduce((w, ch) => w + charW(ch), 0) * size;
/** Greedy wrap by estimated width; breaks between any CJK characters or at spaces; ellipsis on the last line. */
export function wrapText(text, maxWidth, size, maxLines = 3) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    const tokens = para.match(/[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef\u3000-\u303f]|[^\s\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef\u3000-\u303f]+|\s+/g) || [];
    let line = '';
    for (const tok of tokens) {
      if (/^\s+$/.test(tok)) { if (line) line += ' '; continue; }
      if (textWidth(line + tok, size) <= maxWidth) { line += tok; continue; }
      if (line.trim()) out.push(line.trim());
      line = tok;
      while (textWidth(line, size) > maxWidth && line.length > 1) { let k = line.length; while (k > 1 && textWidth(line.slice(0, k), size) > maxWidth) k--; out.push(line.slice(0, k)); line = line.slice(k); }
    }
    if (line.trim()) out.push(line.trim());
  }
  if (out.length > maxLines) {
    const kept = out.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && textWidth(last + '…', size) > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = last + '…';
    return kept;
  }
  return out;
}

const mix = (hex, t) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255, f = c => Math.round(c + (255 - c) * t).toString(16).padStart(2, '0'); return '#' + f(r) + f(g) + f(b); };
function txt(x, y, s, {size = 24, weight = 400, fill = '#1F2937', anchor = 'start', lines, lh = 1.4} = {}) {
  const ls = lines || [s];
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" font-family="${FONT}">${ls.map((l, i) => `<tspan x="${x}" dy="${i ? size * lh : 0}">${esc(l)}</tspan>`).join('')}</text>`;
}
const rect = (x, y, w, h, fill, r = 16, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${extra}/>`;

/** Render the whole infographic. Returns {svg, width, height}. */
export function renderInfographicSvg(specInput, brandInput = {}) {
  const spec = normalizeInfographic(specInput), brand = normalizeBrand(brandInput);
  const [W, H] = SIZES[spec.size], P = Math.round(W * 0.07), C = brand.primary, A = brand.accent, light = mix(C, 0.9), soft = mix(C, 0.96);
  const parts = [], wide = spec.size === 'landscape', poster = spec.template === 'poster';
  let y = P;
  // header
  if (!poster) {
    let bx = P;
    if (brand.logo) { parts.push(`<image x="${P}" y="${y - 6}" height="44" width="132" preserveAspectRatio="xMinYMid meet" href="data:image/png;base64,${brand.logo}"/>`); bx += 148; }
    if (brand.name) parts.push(txt(bx, y + 26, brand.name, {size: 22, weight: 600, fill: C}));
    parts.push(rect(W - P - 64, y + 10, 64, 8, A, 4));
    y += brand.logo || brand.name ? 84 : 24;
    const tl = wrapText(spec.title, W - 2 * P, wide ? 56 : 62, 2);
    parts.push(txt(P, y + (wide ? 56 : 62), '', {size: wide ? 56 : 62, weight: 700, fill: '#111827', lines: tl, lh: 1.25}));
    y += (wide ? 56 : 62) * (1 + 1.25 * (tl.length - 1)) + 24;
    if (spec.subtitle) { const sl = wrapText(spec.subtitle, W - 2 * P, 28, 2); parts.push(txt(P, y + 28, '', {size: 28, fill: '#6B7280', lines: sl})); y += 28 * (1 + 1.4 * (sl.length - 1)) + 20; }
    y += 24;
  }
  const footerH = spec.footer || brand.name ? 90 : 40, bottom = H - P - footerH, bodyH = bottom - y, items = spec.items, n = items.length;
  const T = spec.template;
  if (T === 'stats') {
    const cols = n <= 2 ? n : n === 4 ? 2 : wide ? Math.min(n, 3) : n <= 3 ? 1 : 2, rows = Math.ceil(n / cols), g = 28;
    const cw = (W - 2 * P - g * (cols - 1)) / cols, ch = Math.min(320, (bodyH - g * (rows - 1)) / rows);
    items.forEach((it, i) => {
      const x = P + (i % cols) * (cw + g), yy = y + Math.floor(i / cols) * (ch + g), vs = Math.min(96, ch * 0.34, (cw - 64) / Math.max(1, textWidth(it.value || '—', 1)));
      parts.push(rect(x, yy, cw, ch, soft, 22), rect(x, yy, 10, ch, C, 5));
      parts.push(txt(x + 40, yy + 30 + vs, it.value || '—', {size: vs, weight: 800, fill: C}));
      if (it.title) parts.push(txt(x + 40, yy + 30 + vs + 46, it.title, {size: 28, weight: 600}));
      if (it.text) parts.push(txt(x + 40, yy + 30 + vs + 90, '', {size: 22, fill: '#4B5563', lines: wrapText(it.text, cw - 80, 22, Math.max(1, Math.floor((ch - vs - 130) / 31)))}));
    });
  } else if (T === 'process') {
    if (wide) {
      const g = 24, cw = (W - 2 * P - g * (n - 1)) / n, cy = y + 50;
      parts.push(`<line x1="${P + cw / 2}" y1="${cy}" x2="${W - P - cw / 2}" y2="${cy}" stroke="${light}" stroke-width="8"/>`);
      items.forEach((it, i) => {
        const cx = P + i * (cw + g) + cw / 2;
        parts.push(`<circle cx="${cx}" cy="${cy}" r="44" fill="${i === n - 1 ? A : C}"/>`, txt(cx, cy + 15, it.value || String(i + 1), {size: it.value && textWidth(it.value, 1) > 2 ? 24 : 40, weight: 700, fill: '#fff', anchor: 'middle'}));
        parts.push(rect(cx - cw / 2, cy + 80, cw, bodyH - 140, soft, 20));
        if (it.title) parts.push(txt(cx, cy + 136, '', {size: 30, weight: 700, anchor: 'middle', lines: wrapText(it.title, cw - 40, 30, 2)}));
        if (it.text) parts.push(txt(cx, cy + 226, '', {size: 22, fill: '#4B5563', anchor: 'middle', lines: wrapText(it.text, cw - 48, 22, Math.max(2, Math.floor((bodyH - 300) / 31)))}));
      });
    } else {
      const rowH = bodyH / n;
      items.forEach((it, i) => {
        const yy = y + i * rowH, cy = yy + Math.min(44, rowH / 2);
        if (i < n - 1) parts.push(`<line x1="${P + 44}" y1="${cy + 44}" x2="${P + 44}" y2="${cy + rowH - 44}" stroke="${light}" stroke-width="6"/>`);
        parts.push(`<circle cx="${P + 44}" cy="${cy}" r="40" fill="${i === n - 1 ? A : C}"/>`, txt(P + 44, cy + 14, it.value || String(i + 1), {size: 36, weight: 700, fill: '#fff', anchor: 'middle'}));
        if (it.title) parts.push(txt(P + 120, cy + 10, it.title, {size: 32, weight: 700}));
        if (it.text) parts.push(txt(P + 120, cy + 54, '', {size: 23, fill: '#4B5563', lines: wrapText(it.text, W - 2 * P - 120, 23, Math.max(1, Math.floor((rowH - 80) / 32)))}));
      });
    }
  } else if (T === 'timeline') {
    const rowH = bodyH / n, lx = P + (wide ? 220 : 170);
    parts.push(`<line x1="${lx}" y1="${y + 10}" x2="${lx}" y2="${bottom - 10}" stroke="${light}" stroke-width="6"/>`);
    items.forEach((it, i) => {
      const yy = y + i * rowH + 30;
      parts.push(`<circle cx="${lx}" cy="${yy}" r="16" fill="${i === n - 1 ? A : C}" stroke="#fff" stroke-width="5"/>`);
      if (it.value) parts.push(txt(lx - 36, yy + 10, '', {size: 26, weight: 700, fill: C, anchor: 'end', lines: wrapText(it.value, lx - P - 40, 26, 2)}));
      if (it.title) parts.push(txt(lx + 40, yy + 10, it.title, {size: 30, weight: 700}));
      if (it.text) parts.push(txt(lx + 40, yy + 52, '', {size: 22, fill: '#4B5563', lines: wrapText(it.text, W - P - lx - 40, 22, Math.max(1, Math.floor((rowH - 70) / 31)))}));
    });
  } else if (T === 'compare') {
    const g = 28, cw = (W - 2 * P - g * (n - 1)) / n, colors = [C, A, mix(C, 0.35)];
    items.forEach((it, i) => {
      const x = P + i * (cw + g);
      parts.push(rect(x, y, cw, bodyH, '#FFFFFF', 22, ` stroke="${mix(colors[i], 0.7)}" stroke-width="3"`), rect(x, y, cw, 110, colors[i], 22), `<rect x="${x}" y="${y + 80}" width="${cw}" height="30" fill="${colors[i]}"/>`);
      parts.push(txt(x + cw / 2, y + 52, it.title || it.value || `方案 ${i + 1}`, {size: 34, weight: 700, fill: '#fff', anchor: 'middle'}));
      if (it.value && it.title) parts.push(txt(x + cw / 2, y + 92, it.value, {size: 22, fill: '#fff', anchor: 'middle'}));
      let yy = y + 160;
      for (const point of String(it.text || '').split(/\n|；|;/).map(p => p.trim()).filter(Boolean).slice(0, 8)) {
        const ls = wrapText(point, cw - 96, 24, 3);
        if (yy + ls.length * 34 > y + bodyH - 20) break;
        parts.push(`<circle cx="${x + 44}" cy="${yy - 8}" r="7" fill="${colors[i]}"/>`, txt(x + 64, yy, '', {size: 24, fill: '#374151', lines: ls}));
        yy += ls.length * 34 + 22;
      }
    });
  } else if (T === 'list') {
    const rowH = bodyH / n;
    items.forEach((it, i) => {
      const yy = y + i * rowH;
      parts.push(rect(P, yy, W - 2 * P, rowH - 18, i % 2 ? '#FFFFFF' : soft, 18));
      parts.push(rect(P + 28, yy + (rowH - 18) / 2 - 30, 60, 60, C, 14), txt(P + 58, yy + (rowH - 18) / 2 + 12, it.value || String(i + 1).padStart(2, '0'), {size: it.value && textWidth(it.value, 1) > 2.5 ? 20 : 30, weight: 700, fill: '#fff', anchor: 'middle'}));
      const textX = P + 116, tw = W - 2 * P - 140, mid = yy + (rowH - 18) / 2;
      const tl = it.text ? wrapText(it.text, tw, 22, Math.max(1, Math.floor((rowH - 80) / 30))) : [];
      if (it.title) parts.push(txt(textX, mid - (tl.length ? 6 + tl.length * 13 : -10), it.title, {size: 30, weight: 700}));
      if (tl.length) parts.push(txt(textX, mid + 30 - tl.length * 13 + (it.title ? 10 : -20), '', {size: 22, fill: '#4B5563', lines: tl}));
    });
  } else {
    // poster: full-bleed brand band, centered title, highlight chips
    parts.push(rect(0, 0, W, H * 0.58, C, 0), `<circle cx="${W * 0.88}" cy="${H * 0.12}" r="${W * 0.22}" fill="${mix(C, 0.15)}"/>`, `<circle cx="${W * 0.08}" cy="${H * 0.5}" r="${W * 0.12}" fill="${A}" opacity="0.9"/>`);
    let py = P + 20;
    if (brand.logo) { parts.push(rect(P - 12, py - 16, 180, 72, '#FFFFFF', 14), `<image x="${P}" y="${py - 6}" height="52" width="156" preserveAspectRatio="xMinYMid meet" href="data:image/png;base64,${brand.logo}"/>`); py += 80; }
    else if (brand.name) { parts.push(txt(P, py + 26, brand.name, {size: 26, weight: 700, fill: '#fff'})); py += 60; }
    const ts = wide ? 84 : 92, tl = wrapText(spec.title, W - 2 * P, ts, 3);
    const ty = H * 0.58 / 2 - (tl.length - 1) * ts * 0.6 + (py - P) / 2;
    parts.push(txt(W / 2, ty, '', {size: ts, weight: 800, fill: '#fff', anchor: 'middle', lines: tl, lh: 1.2}));
    if (spec.subtitle) parts.push(txt(W / 2, ty + ts * 1.2 * (tl.length - 1) + 74, '', {size: 32, fill: mix(C, 0.8), anchor: 'middle', lines: wrapText(spec.subtitle, W - 2 * P, 32, 2)}));
    if (n) {
      const g = 24, cw = (W - 2 * P - g * (n - 1)) / n, cy = H * 0.58 - 70, chH = Math.min(260, bottom - cy - 30);
      items.forEach((it, i) => {
        const x = P + i * (cw + g);
        parts.push(rect(x, cy, cw, chH, '#FFFFFF', 22, ` filter="url(#sh)"`));
        if (it.value) parts.push(txt(x + cw / 2, cy + 82, it.value, {size: Math.min(64, (cw - 30) / Math.max(1, textWidth(it.value, 1))), weight: 800, fill: C, anchor: 'middle'}));
        if (it.title) parts.push(txt(x + cw / 2, cy + (it.value ? 132 : 70), '', {size: 26, weight: 600, anchor: 'middle', lines: wrapText(it.title, cw - 30, 26, 2)}));
        if (it.text) parts.push(txt(x + cw / 2, cy + (it.value ? 176 : 120), '', {size: 20, fill: '#6B7280', anchor: 'middle', lines: wrapText(it.text, cw - 30, 20, Math.max(1, Math.floor((chH - 190) / 28)))}));
      });
    }
  }
  // footer
  const fy = H - P;
  if (spec.footer) parts.push(poster ? rect(P, fy - 70, W - 2 * P, 70, A, 35) + txt(W / 2, fy - 24, spec.footer, {size: 28, weight: 700, fill: '#fff', anchor: 'middle'})
    : txt(P, fy - 10, wrapText(spec.footer, W - 2 * P - 260, 22, 1)[0] || '', {size: 22, fill: '#6B7280'}));
  if (brand.name && !poster) parts.push(txt(W - P, fy - 10, brand.name, {size: 22, weight: 600, fill: C, anchor: 'end'}));
  if (!poster) parts.push(`<rect x="${P}" y="${fy - 52}" width="${W - 2 * P}" height="2" fill="#EEF0F3"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0F172A" flood-opacity="0.12"/></filter></defs><rect width="${W}" height="${H}" fill="#FFFFFF"/>${parts.join('')}</svg>`;
  return {svg, width: W, height: H};
}
export const svgDataUrl = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

const T_DOC = TEMPLATES.map(([t, l]) => `${t}（${l}）`).join(' / ');
export const INFOGRAPHIC_INSTRUCTION = '用户要信息图、海报、流程图、时间线、数据摘要卡或一页图文总结时，用完整infographic代码围栏输出JSON：' +
  '{"template":"stats","size":"portrait","title":"标题","subtitle":"副标题","items":[{"value":"35%","title":"指标名","text":"一句说明"}],"footer":"数据来源或口号"}；' +
  `template 可选 ${T_DOC}；size 可选 portrait / landscape / square；stats 最多 6 项、process 最多 6 步、timeline 最多 8 个节点（value 写时间）、compare 2–3 列（text 用分号分隔要点）、list 最多 8 条、poster 最多 4 个亮点；` +
  '数字只能来自用户资料或工具查到的结果，不要编造；文字要短。之后再用一两句话说明。';
export const INFOGRAPHIC_PROMPT = '你是信息图设计助手。根据用户的要求设计一页信息图，只输出 JSON，不要解释。格式：' +
  '{"template":"stats|process|timeline|compare|list|poster","size":"portrait|landscape|square","title":"不超过 20 字","subtitle":"不超过 40 字","items":[{"value":"短数值或序号","title":"不超过 12 字","text":"不超过 60 字"}],"footer":"不超过 30 字"}。' +
  '按内容选最合适的 template；数字只用用户给出的，不要编造；没有给出的数字就不要写 value。';
