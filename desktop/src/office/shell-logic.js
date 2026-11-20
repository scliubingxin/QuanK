// Pure helpers for the Office shell (unit-tested in tests/office-shell-logic.test.mjs).
export const TABS = [
  { name: 'home', label: '开始' }, { name: 'insert', label: '插入' }, { name: 'beautify', label: '美化' },
  { name: 'transition', label: '切换' }, { name: 'animation', label: '动画' }, { name: 'slideshow', label: '放映' },
  { name: 'view', label: '视图' },
];
const MASTER_TABS = ['home', 'insert', 'transition', 'view'];
export const ZOOM_PRESETS = [50, 75, 100, 150, 200];
export const PANEL_TITLES = { ai: 'AI 对话', animation: '动画' };
export function visibleTabs(mode) { return mode === 'master' ? TABS.filter(t => MASTER_TABS.includes(t.name)) : TABS.slice(); }
// Legacy office.js viewport scale: 15 => 100%, smaller scale => larger zoom.
export function percentFromScale(scale) { return Number.isFinite(scale) && scale > 0 ? Math.round(1500 / scale) : 100; }
export function scaleFromPercent(percent) {
  const scale = Math.round(1500 / Number(percent));
  return Number.isFinite(scale) && scale >= 8 && scale <= 30 ? scale : null;
}
export function pageLabel(index, count) {
  const n = Math.max(0, Math.trunc(Number(count)) || 0);
  const i = n ? Math.min(n, Math.max(1, Math.trunc(Number(index)) + 1 || 1)) : 0;
  return `第 ${i} 页/共 ${n} 页`;
}
export function clampNotesHeight(height, available, { min = 56, maxRatio = 0.6 } = {}) {
  const max = Math.max(min, Math.floor((Number(available) || 0) * maxRatio));
  const h = Number(height);
  return Math.round(Math.min(max, Math.max(min, Number.isFinite(h) ? h : min)));
}
export function floatToolsVisible({ selection = '', draft = '', manual = false } = {}) {
  return manual || Boolean(draft) || String(selection).startsWith('当前选区');
}
