// [F1d] Hand-drawn SVG avatars: agents (illustrated characters), skills and MCP connectors (illustrated glyphs),
// Office-style document icons and per-kind feed message icons. Pure strings, no external assets, palette from the
// QuanK reference (royal blue #2F62F5, cobalt #0B2BA6→#183FF5, violet #8C7CFF→#B38CFF).
const hash = s => [...String(s || '')].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7);
const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const BG = [['#2F62F5', '#8C7CFF'], ['#0B2BA6', '#2F62F5'], ['#4A7CFC', '#B38CFF'], ['#1236F0', '#5B8DEF'], ['#6A5CF0', '#B38CFF'], ['#3D5AFE', '#7B6CF6']];
const SOFT = [['#E8EEFF', '#D9D2FF'], ['#E3F0FF', '#CFE0FF'], ['#EEE9FF', '#DCD3FF'], ['#E6F4FF', '#D6E6FF'], ['#FFF0E6', '#FFE0CC'], ['#E8F7EF', '#CFEFDD']];
const SKIN = ['#F6D3B8', '#EFC29E', '#F3CBA8', '#E8B48C'];
const HAIR = ['#1F2937', '#3B2A20', '#4B3427', '#111827', '#5A3E2B'];

const wrap = (cls, inner, label, key, [a, b]) => {
  const id = 'avg' + key;
  return `<span class="av ${cls}" role="img" aria-label="${esc(label)}"><svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="48" height="48" rx="13" fill="url(#${id})"/>${inner}</svg></span>`;
};

/* ---------- illustrated characters ---------- */
function hairShape(style, c) {
  if (style === 'bun') return `<circle cx="24" cy="10.5" r="4.2" fill="${c}"/><path d="M13.6 21.5c0-7 4.6-10.6 10.4-10.6s10.4 3.6 10.4 10.6c-2.4-3.2-6-4.6-10.4-4.6s-8 1.4-10.4 4.6z" fill="${c}"/>`;
  if (style === 'long') return `<path d="M12.8 30c-.8-11 3.4-18.4 11.2-18.4S36 19 35.2 30c-1.6-1.4-2.4-4-2.6-7.6-3-3.4-5.6-4.8-8.6-4.8s-5.6 1.4-8.6 4.8c-.2 3.6-1 6.2-2.6 7.6z" fill="${c}"/>`;
  if (style === 'side') return `<path d="M13.4 22c-.4-7 4-11.2 10.8-11.2 6.4 0 10.6 3.8 10.4 10.4-2.2-2.6-6.8-4.4-12.6-4.2-3.2.1-6 1.8-8.6 5z" fill="${c}"/>`;
  if (style === 'curly') return `<g fill="${c}"><circle cx="16" cy="17" r="4"/><circle cx="20.5" cy="13.2" r="4.2"/><circle cx="26.5" cy="12.8" r="4.2"/><circle cx="31.6" cy="16.6" r="4"/><circle cx="14.6" cy="21.4" r="2.6"/><circle cx="33.4" cy="21.2" r="2.6"/></g>`;
  return `<path d="M14 21.2c0-6.2 4.4-10 10-10s10 3.8 10 10c-1.4-2.6-3.4-3.8-5.2-3.8-1.2 1.4-4 2.2-8.4 1.4-2.6-.4-4.6.4-6.4 2.4z" fill="${c}"/>`;
}
function character({skin, hair, style = 'short', shirt = '#FFFFFF', collar = '#2F62F5', glasses = false, tie = '', headset = false, prop = ''}) {
  return `<path d="M8.5 48c.8-8.6 7-13.4 15.5-13.4S38.7 39.4 39.5 48z" fill="${shirt}"/>`
    + `<path d="M19.6 35.4 24 40l4.4-4.6c-1.4-.6-2.8-.8-4.4-.8s-3 .2-4.4.8z" fill="${collar}" opacity=".9"/>`
    + (tie ? `<path d="M23 39.6h2l1 6.4-2 2-2-2z" fill="${tie}"/>` : '')
    + `<rect x="21.4" y="29.4" width="5.2" height="6" rx="2.4" fill="${skin}"/>`
    + (style === 'long' ? hairShape(style, hair) : '')
    + `<ellipse cx="24" cy="22.6" rx="9.2" ry="9.8" fill="${skin}"/>`
    + `<circle cx="14.9" cy="23.4" r="1.6" fill="${skin}"/><circle cx="33.1" cy="23.4" r="1.6" fill="${skin}"/>`
    + (style === 'long' ? `<path d="M15 21.4c1.6-4 5-6 9-6s7.4 2 9 6c-3-1.6-6-2.4-9-2.4s-6 .8-9 2.4z" fill="${hair}"/>` : hairShape(style, hair))
    + `<circle cx="20.4" cy="23.6" r="1.15" fill="#1F2937"/><circle cx="27.6" cy="23.6" r="1.15" fill="#1F2937"/>`
    + `<path d="M21.6 27.6c1.4 1.2 3.4 1.2 4.8 0" stroke="#B4533C" stroke-width="1.1" fill="none" stroke-linecap="round"/>`
    + `<circle cx="18.4" cy="26.4" r="1.3" fill="#F59E9E" opacity=".45"/><circle cx="29.6" cy="26.4" r="1.3" fill="#F59E9E" opacity=".45"/>`
    + (glasses ? `<g stroke="#1F2937" stroke-width="1" fill="#FFFFFF" fill-opacity=".25"><rect x="17.3" y="21.4" width="5.6" height="4.4" rx="1.6"/><rect x="25.1" y="21.4" width="5.6" height="4.4" rx="1.6"/><path d="M22.9 23.2h2.2" fill="none"/></g>` : '')
    + (headset ? `<path d="M14.6 23c0-6 4.2-10 9.4-10s9.4 4 9.4 10" stroke="#0B2BA6" stroke-width="1.6" fill="none"/><rect x="12.6" y="21.6" width="3.4" height="5.6" rx="1.6" fill="#0B2BA6"/><rect x="32" y="21.6" width="3.4" height="5.6" rx="1.6" fill="#0B2BA6"/><path d="M15 27.4c0 3 2.4 4.4 5.4 4.4" stroke="#0B2BA6" stroke-width="1.1" fill="none"/>` : '')
    + (prop ? `<g transform="translate(30 30)"><circle cx="8" cy="8" r="8.4" fill="#FFFFFF"/><g transform="translate(1.6 1.6) scale(.8)">${prop}</g></g>` : '');
}
// small props drawn in a 16x16 box
const PROP = {
  magnifier: '<circle cx="6.6" cy="6.6" r="4.4" stroke="#2F62F5" stroke-width="2" fill="#E8EEFF"/><path d="m10 10 4 4" stroke="#2F62F5" stroke-width="2.2" stroke-linecap="round"/>',
  pen: '<path d="M3 13l1-3.6 7-7 2.6 2.6-7 7z" fill="#8C7CFF"/><path d="M11 2.4l2.6 2.6" stroke="#0B2BA6" stroke-width="1.6"/><path d="M3 13l1-3.6 2.6 2.6z" fill="#FDE68A"/>',
  chart: '<path d="M2 14h12" stroke="#94A3B8" stroke-width="1.2"/><rect x="3" y="8" width="2.4" height="5" rx=".6" fill="#8C7CFF"/><rect x="6.8" y="5" width="2.4" height="8" rx=".6" fill="#2F62F5"/><rect x="10.6" y="2" width="2.4" height="11" rx=".6" fill="#0B2BA6"/>',
  grid: '<rect x="1.6" y="2" width="12.8" height="12" rx="2" fill="#E8F7EF" stroke="#107C41" stroke-width="1.2"/><path d="M1.6 6h12.8M1.6 10h12.8M6 2v12M10.2 2v12" stroke="#107C41" stroke-width=".9"/>',
  candles: '<path d="M4 2v12M8 4v10M12 1.6v10" stroke="#64748B" stroke-width="1"/><rect x="2.6" y="5" width="2.8" height="6" rx=".6" fill="#E5484D"/><rect x="6.6" y="7" width="2.8" height="4.4" rx=".6" fill="#18A058"/><rect x="10.6" y="3" width="2.8" height="6" rx=".6" fill="#E5484D"/>',
  shield: '<path d="M8 1.4 14 3.6v4.2c0 3.6-2.6 6-6 7-3.4-1-6-3.4-6-7V3.6z" fill="#2F62F5"/><path d="m5.2 8 2 2 3.8-4" stroke="#FFFFFF" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
};
function robot() {
  return `<path d="M24 6.6v4" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/><circle cx="24" cy="6" r="2" fill="#FDE68A"/>`
    + `<rect x="11" y="11" width="26" height="21" rx="9" fill="#FFFFFF"/>`
    + `<rect x="14.4" y="15.6" width="19.2" height="11" rx="5.5" fill="#0B2BA6"/>`
    + `<ellipse cx="20" cy="21" rx="2" ry="2.4" fill="#7DD3FC"/><ellipse cx="28" cy="21" rx="2" ry="2.4" fill="#7DD3FC"/>`
    + `<path d="M21.4 24.6c1.6 1 3.6 1 5.2 0" stroke="#7DD3FC" stroke-width="1.1" fill="none" stroke-linecap="round"/>`
    + `<rect x="8.4" y="18" width="3" height="7" rx="1.5" fill="#FFFFFF" opacity=".85"/><rect x="36.6" y="18" width="3" height="7" rx="1.5" fill="#FFFFFF" opacity=".85"/>`
    + `<path d="M12.4 48c.6-7.4 5.4-12 11.6-12s11 4.6 11.6 12z" fill="#FFFFFF" opacity=".95"/>`
    + `<path d="M19 44.6c1.6-2.6 3.2-3.4 5-3.4s3.4.8 5 3.4" stroke="#2F62F5" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M27.4 41.2l2 1.2-.4 2.2" stroke="#E5484D" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}
const BUILTIN = {
  assistant: [0, () => robot()],
  research: [2, () => character({skin: SKIN[0], hair: HAIR[1], style: 'short', glasses: true, shirt: '#EEF2FF', collar: '#6A5CF0', prop: PROP.magnifier})],
  writer: [4, () => character({skin: SKIN[2], hair: HAIR[3], style: 'bun', shirt: '#F5F3FF', collar: '#8C7CFF', prop: PROP.pen})],
  'fin-research': [1, () => character({skin: SKIN[1], hair: HAIR[0], style: 'side', shirt: '#FFFFFF', collar: '#0B2BA6', tie: '#2F62F5', prop: PROP.chart})],
  'fin-modeler': [3, () => character({skin: SKIN[0], hair: HAIR[2], style: 'long', glasses: true, shirt: '#ECFDF5', collar: '#107C41', prop: PROP.grid})],
  'fin-quant': [5, () => character({skin: SKIN[3], hair: HAIR[3], style: 'curly', headset: true, shirt: '#EEF2FF', collar: '#3D5AFE', prop: PROP.candles})],
  'fin-risk': [1, () => character({skin: SKIN[2], hair: HAIR[4], style: 'short', glasses: true, shirt: '#1E3A8A', collar: '#FFFFFF', tie: '#E5484D', prop: PROP.shield})],
};
/** Agent avatar: built-ins get their own drawn character, custom agents a stable generated one. */
export function agentAvatar(a = {}, cls = 'pc-icon') {
  const b = BUILTIN[a.id];
  if (b) return wrap(cls + ' av-agent', b[1](), a.name || '智能体', 'a' + a.id.replace(/\W/g, ''), BG[b[0]]);
  const h = hash(a.id || a.name), styles = ['short', 'side', 'bun', 'long', 'curly'];
  const look = {skin: SKIN[h % SKIN.length], hair: HAIR[(h >> 3) % HAIR.length], style: styles[(h >> 5) % styles.length], glasses: (h >> 8) % 3 === 0, shirt: ['#FFFFFF', '#EEF2FF', '#F5F3FF', '#E0F2FE'][(h >> 10) % 4], collar: BG[(h >> 12) % BG.length][0]};
  return wrap(cls + ' av-agent', character(look), a.name || '智能体', 'u' + (h % 6), BG[(h >> 2) % BG.length]);
}

/* ---------- glyph tiles (skills, MCP, feed) ---------- */
const G = {
  research: '<rect x="11" y="10" width="20" height="26" rx="3" fill="#FFFFFF"/><path d="M15 17h12M15 21h12M15 25h7" stroke="#C7D2FE" stroke-width="2" stroke-linecap="round"/><circle cx="29" cy="29" r="6.4" fill="#E8EEFF" stroke="#0B2BA6" stroke-width="2.4"/><path d="m33.6 33.6 4.6 4.6" stroke="#0B2BA6" stroke-width="3" stroke-linecap="round"/>',
  model: '<rect x="9" y="11" width="30" height="26" rx="4" fill="#FFFFFF"/><rect x="9" y="11" width="30" height="7" rx="4" fill="#C7F0D8"/><path d="M9 25h30M9 31h30M19 18v19M29 18v19" stroke="#A7D9BC" stroke-width="1.4"/><path d="M12 34l6-5 5 2 7-8 6 3" stroke="#107C41" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  news: '<rect x="9" y="11" width="26" height="26" rx="4" fill="#FFFFFF"/><path d="M35 17h3.4v16a4 4 0 0 1-4 4H33" fill="#DDE6FF"/><rect x="13" y="15" width="10" height="8" rx="1.6" fill="#8C7CFF"/><path d="M26 16h5M26 20h5M13 27h18M13 31h14" stroke="#C7D2FE" stroke-width="2" stroke-linecap="round"/>',
  shield: '<path d="M24 8.6 37 13.4v9.2c0 8-5.6 13.4-13 15.6-7.4-2.2-13-7.6-13-15.6v-9.2z" fill="#FFFFFF"/><path d="M24 12.6 33.4 16v6.6c0 5.8-4 9.8-9.4 11.4-5.4-1.6-9.4-5.6-9.4-11.4V16z" fill="#DDE6FF"/><path d="m18.6 23.4 4 4 7.2-7.6" stroke="#0B2BA6" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  candles: '<path d="M14 9v30M24 12v27M34 7v26" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" opacity=".9"/><rect x="10.4" y="15" width="7.2" height="15" rx="1.6" fill="#FF6B6B"/><rect x="20.4" y="20" width="7.2" height="12" rx="1.6" fill="#34D399"/><rect x="30.4" y="11" width="7.2" height="16" rx="1.6" fill="#FF6B6B"/>',
  doc: '<path d="M13 9h15l8 8v20a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3z" fill="#FFFFFF"/><path d="M28 9v6a2 2 0 0 0 2 2h6" fill="#DDE6FF"/><path d="M15 22h15M15 27h15M15 32h9" stroke="#C7D2FE" stroke-width="2" stroke-linecap="round"/>',
  slides: '<rect x="8" y="11" width="32" height="21" rx="3" fill="#FFFFFF"/><path d="M24 32v5M18 39h12" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round"/><path d="M13 27l5-6 4 3 6-7" stroke="#F97316" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="33" cy="17" r="3" fill="#FDBA74"/>',
  meeting: '<rect x="8" y="12" width="22" height="16" rx="5" fill="#FFFFFF"/><path d="M13 28l-2 5 7-5" fill="#FFFFFF"/><path d="M13 18h12M13 22h8" stroke="#C7D2FE" stroke-width="2" stroke-linecap="round"/><rect x="22" y="22" width="18" height="15" rx="4" fill="#DDE6FF"/><path d="m26 29.6 2.4 2.4 5-5" stroke="#0B2BA6" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  book: '<path d="M10 13c4-2 9-2 14 1v23c-5-3-10-3-14-1z" fill="#FFFFFF"/><path d="M38 13c-4-2-9-2-14 1v23c5-3 10-3 14-1z" fill="#DDE6FF"/><path d="M14 19h6M14 24h6M28 19h6M28 24h6" stroke="#A5B4FC" stroke-width="1.6" stroke-linecap="round"/>',
  sheet: '<rect x="10" y="10" width="28" height="28" rx="4" fill="#FFFFFF"/><path d="M10 18h28M10 26h28M19 10v28" stroke="#C7D2FE" stroke-width="1.4"/><rect x="22" y="29" width="4" height="6" rx="1" fill="#8C7CFF"/><rect x="28" y="24" width="4" height="11" rx="1" fill="#2F62F5"/><rect x="34" y="20" width="2.4" height="15" rx="1" fill="#0B2BA6"/>',
  bolt: '<path d="M27 7 13 27h10l-3 14 15-21H25z" fill="#FFFFFF"/><path d="M27 7 13 27h10" fill="#FDE68A" opacity=".55"/>',
  code: '<rect x="8" y="10" width="32" height="28" rx="4" fill="#FFFFFF"/><rect x="8" y="10" width="32" height="6" rx="3" fill="#DDE6FF"/><circle cx="12" cy="13" r="1" fill="#F87171"/><circle cx="15.4" cy="13" r="1" fill="#FBBF24"/><path d="m18 23-4 4 4 4M30 23l4 4-4 4M26 21l-4 12" stroke="#2F62F5" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  puzzle: '<path d="M12 14h7a3 3 0 1 1 6 0h7v7a3 3 0 1 0 0 6v7H25a3 3 0 1 0-6 0h-7v-7a3 3 0 1 1 0-6z" fill="#FFFFFF"/>',
  plug: '<path d="M19 9v7M29 9v7" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/><path d="M14 16h20v6a10 10 0 0 1-20 0z" fill="#FFFFFF"/><path d="M24 32v8" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round"/><circle cx="24" cy="22.6" r="2.6" fill="#8C7CFF"/>',
  cloud: '<path d="M16 34h17a7 7 0 0 0 .6-14 9 9 0 0 0-17.2 2.4A6 6 0 0 0 16 34z" fill="#FFFFFF"/><path d="M18 28l4 3 8-7" stroke="#2F62F5" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  globe: '<circle cx="24" cy="24" r="13" fill="#FFFFFF"/><path d="M11 24h26M24 11c-4.6 4-4.6 22 0 26M24 11c4.6 4 4.6 22 0 26" stroke="#A5B4FC" stroke-width="1.6" fill="none"/><circle cx="31" cy="31" r="5" fill="#E8EEFF" stroke="#0B2BA6" stroke-width="2"/><path d="m34.6 34.6 3.4 3.4" stroke="#0B2BA6" stroke-width="2.4" stroke-linecap="round"/>',
  spider: '<circle cx="24" cy="25" r="7" fill="#FFFFFF"/><circle cx="24" cy="16" r="4" fill="#FFFFFF"/><path d="M17 21l-7-4M17 25H9M17 29l-7 4M31 21l7-4M31 25h8M31 29l7 4" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>',
  branch: '<circle cx="16" cy="13" r="4" fill="#FFFFFF"/><circle cx="16" cy="35" r="4" fill="#FFFFFF"/><circle cx="32" cy="19" r="4" fill="#FFFFFF"/><path d="M16 17v14M32 23c0 6-7 6-14 9" stroke="#FFFFFF" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
  chat: '<path d="M11 13h26a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H22l-7 6v-6h-4a3 3 0 0 1-3-3V16a3 3 0 0 1 3-3z" fill="#FFFFFF"/><circle cx="17" cy="23" r="2" fill="#6A5CF0"/><circle cx="24" cy="23" r="2" fill="#6A5CF0"/><circle cx="31" cy="23" r="2" fill="#6A5CF0"/>',
  clock: '<circle cx="24" cy="25" r="13" fill="#FFFFFF"/><path d="M24 18v8l5 3" stroke="#2F62F5" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 10l-4 4M34 10l4 4" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round"/>',
  checklist: '<rect x="11" y="9" width="26" height="30" rx="4" fill="#FFFFFF"/><rect x="18" y="7" width="12" height="5" rx="2" fill="#BAE6FD"/><path d="m15 19 2 2 3.4-3.6M15 27l2 2 3.4-3.6" stroke="#0EA5E9" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 20h9M24 28h9M15 34h18" stroke="#C7D2FE" stroke-width="2" stroke-linecap="round"/>',
  ask: '<path d="M24 8.6 37 13.4v9.2c0 8-5.6 13.4-13 15.6-7.4-2.2-13-7.6-13-15.6v-9.2z" fill="#FFFFFF"/><path d="M20.4 19.6a3.8 3.8 0 1 1 5.4 3.4c-1.2.6-1.8 1.4-1.8 2.6v.8" stroke="#F97316" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="24" cy="31" r="1.6" fill="#F97316"/>',
  log: '<rect x="11" y="9" width="24" height="30" rx="4" fill="#FFFFFF"/><path d="M16 17h14M16 22h14M16 27h8" stroke="#CBD5E1" stroke-width="2" stroke-linecap="round"/><path d="m27 37 2-6 8-8 4 4-8 8z" fill="#94A3B8"/><path d="m35 25 4 4" stroke="#64748B" stroke-width="1.6"/>',
};
const SKILL_CAT = {'投研分析': ['research', 0], '财务建模': ['model', 5], '资讯跟踪': ['news', 2], '风控合规': ['shield', 1], '量化交易': ['candles', 3], '办公协同': ['doc', 4], '数据分析': ['sheet', 2], '效率工具': ['bolt', 4], '通用开发': ['code', 1]};
const SKILL_ID = {'fin-morning-brief': ['news', 3], 'fin-valuation': ['model', 1], 'wb-presentation-outline': ['slides', 4], 'wb-meeting-actions': ['meeting', 2], 'wb-knowledge-handbook': ['book', 0], 'wb-sheet-analysis': ['sheet', 5], 'fin-portfolio-review': ['candles', 1]};
const SOFT_BG = {5: ['#22A06B', '#6EE7B7']};
/** Skill avatar by preset id, else category, else keywords in the name. */
export function skillAvatar(s = {}, cls = 'pc-icon') {
  const name = s.title || s.name || '';
  const kw = /PPT|演示|汇报/.test(name) ? ['slides', 4] : /Excel|表格|数据/.test(name) ? ['sheet', 2] : /研究|调研/.test(name) ? ['research', 0] : /合规|风控|审/.test(name) ? ['shield', 1] : /量化|回测|策略/.test(name) ? ['candles', 3] : /文档|Word|报告/.test(name) ? ['doc', 4] : /代码|开发|测试/.test(name) ? ['code', 1] : null;
  const [g, c] = SKILL_ID[s.id] || SKILL_CAT[s.category] || kw || ['puzzle', hash(name) % BG.length];
  return wrap(cls + ' av-skill', G[g], name || '技能', 's' + g + c, SOFT_BG[c] || BG[c]);
}
const MCP_ID = {
  'fiscal-ai': ['mono', ['#0F766E', '#34D399'], 'F'], 'alpha-vantage': ['mono', ['#6D28D9', '#A78BFA'], 'α'], 'twelve-data': ['mono', ['#1D4ED8', '#60A5FA'], '12'],
  'akshare-one': ['mono', ['#B91C1C', '#F87171'], 'AK'], tushare: ['mono', ['#C2410C', '#FDBA74'], 'TS'], tavily: ['globe', ['#0EA5E9', '#6366F1']], exa: ['mono', ['#111827', '#4B5563'], 'E'],
  apify: ['spider', ['#15803D', '#4ADE80']], 'microsoft-learn': ['book', ['#0369A1', '#38BDF8']], 'aws-knowledge': ['cloud', ['#C2410C', '#FB923C']], deepwiki: ['book', ['#4338CA', '#818CF8']],
  context7: ['mono', ['#0F172A', '#334155'], 'C7'], github: ['branch', ['#111827', '#374151']],
};
const MCP_CAT = {'金融数据': 'candles', '资讯检索': 'globe', '舆情采集': 'spider', '通用开发': 'code'};
/** MCP connector avatar: known presets get their own tile; others a plug in a stable colour. */
export function mcpAvatar(c = {}, cls = 'pc-icon') {
  const name = c.title || c.name || '', slug = name.toLowerCase().replace(/[\s.]+/g, '-');
  // [F1d] the gradient id comes from the matched preset key, so name- and id-matched tiles share one id per preset
  const id = MCP_ID[c.id] ? c.id : MCP_ID[c.presetId] ? c.presetId : (Object.keys(MCP_ID).find(k => slug.startsWith(k)) || c.id || c.presetId || '');
  const key = MCP_ID[id];
  if (key && key[0] === 'mono') {
    const t = key[2], fs = t.length > 1 ? 15 : 20;
    return wrap(cls + ' av-mcp', `<rect x="9" y="9" width="30" height="30" rx="9" fill="#FFFFFF" opacity=".16"/><text x="24" y="${24 + fs * 0.36}" text-anchor="middle" style="font:800 ${fs}px -apple-system,'Helvetica Neue',sans-serif;fill:#FFFFFF">${esc(t)}</text>`, name || '连接器', 'm' + id.replace(/\W/g, ''), key[1]);
  }
  if (key) return wrap(cls + ' av-mcp', G[key[0]], name || '连接器', 'm' + id.replace(/\W/g, ''), key[1]);
  const g = MCP_CAT[c.category] || 'plug', h = hash(name || c.url);
  return wrap(cls + ' av-mcp', G[g], name || '连接器', 'mx' + g + (h % 6), BG[h % BG.length]);
}

/** Feed message icon per kind (keeps the fd-badge class used by the feed layout). */
const FEED = {chat: ['chat', ['#4F46E5', '#8C7CFF']], task: ['clock', ['#2F62F5', '#5B8DEF']], research: ['research', ['#6A5CF0', '#B38CFF']], plan: ['checklist', ['#0284C7', '#38BDF8']],
  connector: ['plug', ['#0D9488', '#2DD4BF']], quant: ['candles', ['#1E3A8A', '#3D5AFE']], approval: ['ask', ['#F59E0B', '#F97316']], log: ['log', ['#CBD5E1', '#E2E8F0']]};
export function feedAvatar(kind, cls = 'feed-icon fd-badge') {
  const [g, bg] = FEED[kind] || FEED.log;
  return wrap(cls + ' av-feed', G[g], '', 'f' + (FEED[kind] ? kind : 'log'), bg);
}

/** Office-style file icon: page with folded corner and a coloured letter tile (W / X / P / PDF …). */
const DOC = {docx: ['#185ABD', '#2B7CD3', 'W', 'DOC'], doc: ['#185ABD', '#2B7CD3', 'W', 'DOC'], xlsx: ['#107C41', '#21A366', 'X', 'XLS'], xls: ['#107C41', '#21A366', 'X', 'XLS'], csv: ['#107C41', '#21A366', 'X', 'CSV'],
  pptx: ['#C43E1C', '#ED6C47', 'P', 'PPT'], ppt: ['#C43E1C', '#ED6C47', 'P', 'PPT'], pdf: ['#B30B00', '#E5252A', 'PDF', 'PDF'], md: ['#475569', '#64748B', 'MD', 'MD'], txt: ['#475569', '#64748B', 'TXT', 'TXT'], html: ['#B45309', '#F59E0B', '</>', 'HTML']};
export function docIcon(format, cls = 'lib-icon') {
  const f = String(format || '').toLowerCase(), [a, b, letter, kind] = DOC[f] || ['#475569', '#64748B', (f || 'F').slice(0, 3).toUpperCase(), (f || 'FILE').toUpperCase()];
  const fs = letter.length > 2 ? 8.6 : letter.length > 1 ? 10.5 : 15;
  return `<span class="av ${cls} av-doc" data-kind="${esc(kind)}" role="img" aria-label="${esc(kind)} 文件"><svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">`
    + `<path d="M14 4h19l11 11v27a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" fill="#FFFFFF" stroke="#D5DBE6" stroke-width="1.2"/>`
    + `<path d="M33 4v8a3 3 0 0 0 3 3h8" fill="#EEF1F6" stroke="#D5DBE6" stroke-width="1.2" stroke-linejoin="round"/>`
    + `<path d="M24 22h14M24 27h14M24 32h14M24 37h10" stroke="${b}" stroke-width="1.8" stroke-linecap="round" opacity=".45"/>`
    + `<rect x="3" y="17" width="22" height="22" rx="4" fill="${a}"/><rect x="3" y="17" width="22" height="11" rx="4" fill="${b}" opacity=".35"/>`
    + `<text x="14" y="${28 + fs * 0.36}" text-anchor="middle" style="font:800 ${fs}px 'Segoe UI',-apple-system,'Helvetica Neue',sans-serif;fill:#FFFFFF">${esc(letter)}</text></svg></span>`;
}
