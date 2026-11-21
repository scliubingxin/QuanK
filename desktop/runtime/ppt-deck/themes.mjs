// 主题：配色角色 + 字体。ppt-themes.json 由 scripts/gen-ppt-themes.mjs 从这里导出，供 ribbon「美化」使用。
export const FONT = { zh: 'Microsoft YaHei', fallback: ['PingFang SC', 'Noto Sans CJK SC', 'Arial'] };
const base = (id, name, c) => ({ id, name, font: FONT, ...c });
export const THEMES = {
  'business-blue': base('business-blue', '商务蓝', {
    dark: false, primary: '1F4E9E', accent: '2F80ED', light: 'EAF1FB', bg: 'FFFFFF', coverBg: '14336B',
    text: '1F2937', muted: '6B7280', border: 'D6E0F0', onPrimary: 'FFFFFF', onCoverMuted: 'BBD0F0',
    series: ['1F4E9E', '2F80ED', 'D9482B', 'E8820C'], preview: ['1F4E9E', '2F80ED', 'EAF1FB', '1F2937'],
  }),
  'tech-dark': base('tech-dark', '科技深色', {
    dark: true, primary: '22D3EE', accent: '818CF8', light: '16213A', bg: '0B1220', coverBg: '070C18',
    text: 'E5E7EB', muted: '94A3B8', border: '263454', onPrimary: '06202A', onCoverMuted: '94A3B8',
    series: ['22D3EE', '818CF8', 'F472B6', 'FBBF24'], preview: ['0B1220', '22D3EE', '16213A', 'E5E7EB'],
  }),
  'minimal-gray': base('minimal-gray', '简约灰', {
    dark: false, primary: '374151', accent: '0F766E', light: 'F3F4F6', bg: 'FFFFFF', coverBg: '1F2937',
    text: '111827', muted: '6B7280', border: 'E5E7EB', onPrimary: 'FFFFFF', onCoverMuted: 'D1D5DB',
    series: ['374151', '0F766E', 'B45309', '6B7280'], preview: ['374151', '0F766E', 'F3F4F6', '111827'],
  }),
  'warm-orange': base('warm-orange', '暖色', {
    dark: false, primary: 'C2410C', accent: 'EA580C', light: 'FFF1E3', bg: 'FFFBF6', coverBg: '7C2D12',
    text: '3B2A22', muted: '8A7466', border: 'F2DCC8', onPrimary: 'FFFFFF', onCoverMuted: 'FED7AA',
    series: ['C2410C', 'D97706', '0F766E', '7C2D12'], preview: ['C2410C', 'EA580C', 'FFF1E3', '3B2A22'],
  }),
  quank: base('quank', 'QuanK 品牌', { // [F1g] QuanK palette: royal blue, cobalt headings, blue-violet accent
    dark: false, primary: '2F62F5', accent: '8C7CFF', light: 'EEF2FF', bg: 'FFFFFF', coverBg: '0B2BA6',
    text: '14213D', muted: '6B7591', border: 'DCE3F5', onPrimary: 'FFFFFF', onCoverMuted: 'C7D2FE',
    series: ['2F62F5', '8C7CFF', '0B2BA6', 'E4A854'], preview: ['0B2BA6', '2F62F5', '8C7CFF', '14213D'],
  }),
};
export const DEFAULT_THEME = 'quank';
export const themeNames = () => Object.keys(THEMES);
export const getTheme = (id) => THEMES[id] || THEMES[DEFAULT_THEME];
// 排版常量（单位：英寸 / pt）
export const GRID = {
  W: 13.333, H: 7.5, mx: 0.6, safe: 0.4,
  tagY: 0.44, tagSize: 0.56, titleY: 0.3, titleH: 0.84, subY: 1.14, subH: 0.44, ruleY: 1.66,
  bodyY: 1.9, bodyB: 6.8, footY: 7.04, footH: 0.22, logoW: 2.4, logoH: 0.5, gap: 0.24,
};
export const TYPE = {
  title: [28, 24], subtitle: [14, 12], body: [14, 11], cardTitle: [16, 12], small: [11, 11], footer: 9,
  coverTitle: [44, 32], sectionTitle: [40, 30], kpi: [44, 28], ls: 1.1, lsCompact: 1.0,
};
export const CARD = { radius: 0.1, pad: 0.22, lineW: 0.75 };
