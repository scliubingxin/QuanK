// [lane:pages] Pure helpers shared by the Electron main process and the office renderer.
export const SLIDE_ACTIONS = Object.freeze(['insert', 'duplicate', 'delete', 'move']);
export const MAX_SLIDES = 1000; // [ux7] was 100
export const MAX_NOTES = 8000;
export const THUMB_MIN = 48;
export const THUMB_MAX = 1920;

const isIndex = n => Number.isInteger(n) && n >= 0 && n < MAX_SLIDES;

/** Validate a slide action request and return the exact object the worker accepts. Throws on anything else. */
export function normalizeSlideAction(p, count = MAX_SLIDES) {
  if (!p || typeof p !== 'object') throw Error('页面操作无效');
  const allowed = p.action === 'move' ? ['action', 'part', 'to'] : ['action', 'part'];
  if (Object.keys(p).some(k => !['op', ...allowed].includes(k))) throw Error('页面操作包含不允许的参数');
  if (!SLIDE_ACTIONS.includes(p.action)) throw Error('不支持的页面操作');
  if (!isIndex(p.part) || p.part >= count) throw Error('页码超出范围');
  if (p.action === 'delete' && count <= 1) throw Error('不能删除唯一的一页');
  if (['insert', 'duplicate'].includes(p.action) && count >= MAX_SLIDES) throw Error('最多支持 ' + MAX_SLIDES + ' 页');
  if (p.action === 'move') {
    if (!isIndex(p.to) || p.to >= count || p.to === p.part) throw Error('移动目标无效');
    return {action: 'move', part: p.part, to: p.to};
  }
  return {action: p.action, part: p.part};
}

export function normalizeThumbnail(p, count = MAX_SLIDES) {
  if (!p || typeof p !== 'object' || Object.keys(p).some(k => !['op', 'part', 'width'].includes(k))) throw Error('缩略图参数无效');
  if (!isIndex(p.part) || p.part >= count) throw Error('页码超出范围');
  const width = p.width === undefined ? 240 : p.width;
  if (!Number.isInteger(width) || width < THUMB_MIN || width > THUMB_MAX) throw Error('缩略图尺寸无效');
  return {part: p.part, width};
}

export function normalizeNotesWrite(p, count = MAX_SLIDES) {
  if (!p || typeof p !== 'object' || Object.keys(p).some(k => !['op', 'part', 'text'].includes(k))) throw Error('备注参数无效');
  if (!isIndex(p.part) || p.part >= count) throw Error('页码超出范围');
  if (typeof p.text !== 'string' || p.text.length > MAX_NOTES || p.text.includes('\0')) throw Error('备注超过 ' + MAX_NOTES + ' 字');
  return {part: p.part, text: p.text};
}

/** Small LRU keyed by string. `get` refreshes recency; `set` evicts the oldest entry beyond `limit`. */
export class LruCache {
  constructor(limit = 64) {
    if (!Number.isInteger(limit) || limit < 1) throw Error('缓存上限无效');
    this.limit = limit; this.map = new Map();
  }
  get size() { return this.map.size; }
  has(key) { return this.map.has(key); }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key); this.map.delete(key); this.map.set(key, value); return value;
  }
  set(key, value) {
    this.map.delete(key); this.map.set(key, value);
    while (this.map.size > this.limit) this.map.delete(this.map.keys().next().value);
    return this;
  }
  delete(key) { return this.map.delete(key); }
  clear() { this.map.clear(); }
  keys() { return [...this.map.keys()]; }
}

/** Index of the slide to select after a keyboard key; null when the key is not a paging key. */
export function railKeyTarget(key, index, count) {
  const step = {ArrowUp: -1, PageUp: -1, ArrowDown: 1, PageDown: 1}[key];
  if (step === undefined || !(count > 0)) return null;
  if (key === 'Home') return 0;
  return Math.max(0, Math.min(count - 1, index + step));
}

/** Where a slide ends up after `from` is moved to `to` (for local bookkeeping of cached thumbnails). */
export function reorderIndices(count, from, to) {
  const order = Array.from({length: count}, (_, i) => i), [item] = order.splice(from, 1);
  order.splice(to, 0, item); return order;
}

/**
 * Slideshow paging state machine. Pages 0..count-1 plus a terminal "end" screen at index === count.
 * Events: next, prev, first, last, click (same as next), exit. Once exited the state is final.
 */
export function createSlideshowState(count, start = 0) {
  if (!Number.isInteger(count) || count < 1) throw Error('没有可放映的页面');
  let index = Number.isInteger(start) ? Math.max(0, Math.min(count - 1, start)) : 0, active = true;
  const view = () => ({index, count, active, ended: index >= count});
  return {
    get state() { return view(); },
    dispatch(event) {
      if (!active) return view();
      if (event === 'next' || event === 'click') {
        if (index >= count) active = false; else index++;
      } else if (event === 'prev') index = Math.max(0, index - 1);
      else if (event === 'first') index = 0;
      else if (event === 'last') index = count - 1;
      else if (event === 'exit') active = false;
      return view();
    },
  };
}

export function slideshowKeyEvent(key) {
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'].includes(key)) return 'next';
  if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'].includes(key)) return 'prev';
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  if (key === 'Escape') return 'exit';
  return null;
}

/** Master view rows: one master header followed by indented layouts (matches the reference screenshot). */
export function masterRows(names = []) {
  return [{kind: 'master', part: 0, label: '母版'}, ...names.map((name, part) => ({kind: 'layout', part, label: name || '版式 ' + (part + 1)}))];
}
