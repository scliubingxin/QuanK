// [v1.0.8] Keep the reader's place when a right-hand panel page is rebuilt from HTML.
// The Coding task page is re-rendered with innerHTML on every new piece of output, which throws away the
// nodes the browser would use for scroll anchoring. Before the rebuild we remember the first visible fold
// (or that the view was following the bottom) and put it back afterwards.
export const CODING_ANCHORS = '[data-coding-fold]:not(.coding-approval-bar)';
const FOLLOW_BOTTOM = 48;

export function captureScroll(el, selector = CODING_ANCHORS) {
  if (!el) return null;
  const top = el.scrollTop;
  if (top <= 0) return {top: 0};
  if (el.scrollHeight - top - el.clientHeight < FOLLOW_BOTTOM) return {bottom: true};
  const box = el.getBoundingClientRect();
  for (const item of el.querySelectorAll(selector)) {
    const r = item.getBoundingClientRect();
    if (!r.height) continue;
    if (r.bottom > box.top + 1) return {key: item.dataset.codingFold, offset: r.top - box.top, top};
  }
  return {top};
}

export function restoreScroll(el, keep, selector = CODING_ANCHORS) {
  if (!el || !keep) return;
  if (keep.bottom) { el.scrollTop = el.scrollHeight; return; }
  const item = keep.key ? [...el.querySelectorAll(selector)].find(node => node.dataset.codingFold === keep.key) : null;
  if (item) {
    const shift = item.getBoundingClientRect().top - el.getBoundingClientRect().top - keep.offset;
    if (Math.abs(shift) >= 1) el.scrollTop += shift;
    return;
  }
  el.scrollTop = keep.top || 0;
}
