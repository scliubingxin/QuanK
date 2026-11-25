import { UNO } from '../office/session-types.js';
import { createOfficeControls, officeButton, officeElement } from './office-toolbar.js';
import { officeIcon } from './office-icons.js';

const GAP = 8;
const SCROLL_IDLE_MS = 120;
const DEFAULT_ROW_HEIGHT = 24;

export function createFloatToolbar(session, { sections = {}, viewport } = {}) {
  const element = officeElement('div', 'float');
  element.setAttribute('role', 'toolbar');
  element.setAttribute('aria-label', '选区工具条');
  element.hidden = true;
  const controls = createOfficeControls(session, element);
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const slots = new Map();
  let dismissed = false;
  let composing = false;
  let scrollTimer;

  let resizeObserver;
  let measuredViewport;
  function refresh() {
    const host = viewport ?? element.parentElement;
    if (host !== measuredViewport) {
      resizeObserver?.disconnect();
      measuredViewport = host;
      if (host) resizeObserver?.observe(host);
    }
    const selection = session.selection;
    const cell = session.kind === 'calc' && selection.kind === 'cell';
    const text = selection.kind === 'text' && selection.text;
    for (const [id, { container }] of slots) container.hidden = cell && id !== 'style' && id !== 'ai';
    if (cellStyle) cellStyle.hidden = !cell;
    if (textStyle) textStyle.hidden = cell;
    const rects = cell || text ? selection.rects : [];
    if (!host || !rects.length || dismissed || composing || scrollTimer || session.readOnly) {
      element.hidden = true;
      controls.closeMenus();
      return;
    }
    const bounds = host.getBoundingClientRect();
    const screen = rects.map(rect => session.toScreen(rect));
    const left = Math.min(...screen.map(rect => rect.x));
    const right = Math.max(...screen.map(rect => rect.x + rect.w));
    const top = Math.min(...screen.map(rect => rect.y));
    const bottom = Math.max(...screen.map(rect => rect.y + rect.h));
    if (bottom <= 0 || top >= bounds.height || right <= 0 || left >= bounds.width) {
      element.hidden = true;
      controls.closeMenus();
      return;
    }
    element.hidden = false;
    if (viewport) element.style.maxWidth = bounds.width + 'px';
    const offsetParent = element.offsetParent ?? host;
    const origin = offsetParent.getBoundingClientRect();
    const width = element.offsetWidth;
    const height = element.offsetHeight || 34;
    const rowHeight = cell ? selection.cellLayout?.rowHeight ?? DEFAULT_ROW_HEIGHT : 0;
    const protectedTop = cell ? selection.cellLayout?.protectedTop ?? rowHeight * 2 : 0;
    const gap = GAP + rowHeight;
    const above = top - height - gap;
    const below = cell ? Math.max(bottom, protectedTop) + gap : bottom + gap;
    const x = Math.max(0, Math.min((left + right - width) / 2, bounds.width - width));
    const placeAbove = above >= protectedTop;
    let y = placeAbove ? above : below;
    if (cell && !placeAbove && y + height > bounds.height) {
      // Keep the lower adjacent row clear whenever the viewport has room for it.
      y = Math.max(bottom + GAP, protectedTop + GAP, bounds.height - height);
      if (y + height > bounds.height && top - height - GAP >= protectedTop) y = top - height - GAP;
      if (y + height > bounds.height) {
        element.hidden = true;
        controls.closeMenus();
        return;
      }
    }
    y = Math.max(0,Math.min(y,bounds.height-height));
    element.dataset.placement = y < top ? 'above' : 'below';
    element.style.left = bounds.left - origin.left + x + offsetParent.scrollLeft - offsetParent.clientLeft + 'px';
    element.style.top = bounds.top - origin.top + y + offsetParent.scrollTop - offsetParent.clientTop + 'px';
  }

  function addSection(id, render) {
    const previous = slots.get(id);
    previous?.cleanup?.();
    const container = previous?.container ?? officeElement('div', 'group');
    container.dataset.section = id;
    container.replaceChildren();
    if (!previous) element.append(container);
    const slot = { container, cleanup: render(container, session) };
    slots.set(id, slot);
    refresh();
    return () => {
      if (slots.get(id) !== slot) return;
      slots.delete(id);
      slot.cleanup?.();
      container.remove();
      refresh();
    };
  }

  const textStyle = officeElement('div', 'style-controls');
  const cellStyle = session.kind === 'calc' ? officeElement('div', 'style-controls') : null;
  const size = officeElement('output','font-size');
  size.setAttribute('aria-label','当前字号');
  function refreshSize() {
    size.textContent = String(parseFloat(session.state.get(UNO.FontHeight)?.value) || 12);
  }
  refreshSize();
  textStyle.append(
    ...controls.emphasis(), ...controls.colors(),
    ...[[-1, '减小字号', 'minus'], [1, '增大字号', 'plus']].map(([delta, title, icon]) =>
      [controls.button(UNO.FontHeight, title, icon, {
        args: () => ({ FontHeight: Math.max(1, (Number(session.state.get(UNO.FontHeight)?.value) || 12) + delta) }),
      }), ...(delta < 0 ? [size] : [])]).flat(),
    controls.style(), ...controls.lists(), controls.button(UNO.ResetAttributes, '清除格式', 'clear'),
  );
  cellStyle?.append(...controls.emphasis(), ...controls.colors(true), controls.numberFormat(),
    controls.button(UNO.ResetAttributes, '清除格式', 'clear'));
  addSection('style', container => {
    container.append(textStyle);
    if (cellStyle) container.append(cellStyle);
  });
  addSection('ai', container => {
    const button = officeButton('AI', 'ai', 'AI');
    button.append(officeIcon('chevron'));
    button.disabled = true;
    container.append(button);
  });
  for (const [id, render] of Object.entries(sections)) addSection(id, render);

  function listen(event, callback) {
    const off = session.on(event, callback);
    if (typeof off === 'function') signal.addEventListener('abort', off, { once: true });
  }

  controls.listen();
  let wasReadOnly = session.readOnly;
  listen('state', () => {
    refreshSize();
    if (session.readOnly !== wasReadOnly) {
      wasReadOnly = session.readOnly;
      refresh();
    }
  });
  listen('selection', () => {
    dismissed = false;
    controls.closeMenus();
    refresh();
  });
  if (typeof ResizeObserver === 'function') resizeObserver = new ResizeObserver(refresh);
  measuredViewport = undefined;
  window.addEventListener('resize', refresh, { signal });
  document.addEventListener('scroll', event => {
    if (event.target instanceof Node && element.contains(event.target)) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      scrollTimer = undefined;
      refresh();
    }, SCROLL_IDLE_MS);
    refresh();
  }, { capture: true, signal });
  document.addEventListener('compositionstart', () => {
    composing = true;
    refresh();
  }, { capture: true, signal });
  document.addEventListener('compositionend', () => {
    composing = false;
    refresh();
  }, { capture: true, signal });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || element.hidden) return;
    dismissed = true;
    refresh();
    event.preventDefault();
  }, { signal });
  element.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.altKey || event.metaKey || event.ctrlKey) return;
    const items = [...element.querySelectorAll('button:not([disabled]), select:not([disabled]), [tabindex="0"]')]
      .filter(item => !item.closest('[hidden]'));
    const index = items.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? -1 : 1;
    items[(index + delta + items.length) % items.length].focus();
  }, { signal });

  queueMicrotask(() => { if (!signal.aborted) refresh(); });
  return {
    element, addSection, refresh() {
      controls.refresh();
      refresh();
    },
    destroy() {
      clearTimeout(scrollTimer);
      resizeObserver?.disconnect();
      lifetime.abort();
      controls.destroy();
      for (const { cleanup } of slots.values()) cleanup?.();
      slots.clear();
      element.remove();
    },
  };
}
