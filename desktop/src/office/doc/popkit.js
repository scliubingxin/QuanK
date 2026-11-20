// [docx] Small popup/menu kit for the Word toolbar (reuses the .sb-* popup styles from sheet/sheet.css).
import {sheetIcon} from '../sheet/sheet-icons.js';
import {THEME_COLORS, STANDARD_COLORS, SOON} from '../sheet/sheet-config.js';

export const SEP = '-';
export const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
export const ico = (name, size = 18) => { const s = el('span', 'sb-ico'); s.innerHTML = sheetIcon(name, size); return s; }; // static markup from sheet-icons.js

/** Creates a popup stack. hooks: {enabled(item), checked(item), run(item), resolve(menu), panel(type,item,rect,level,side)} */
export function createPopups(hooks) {
  const pops = [];
  let lastAnchor = null;
  const closeAll = (level = 0) => { while (pops.length > level) pops.pop().remove(); };
  document.addEventListener('pointerdown', e => { if (pops.length && !pops.some(p => p.contains(e.target)) && !e.target.closest?.('[data-open]')) closeAll(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pops.length) { closeAll(); e.stopPropagation(); } }, true);
  window.addEventListener('resize', () => closeAll());
  function popAt(level, rect, cls = '', side = 'below') {
    closeAll(level);
    const p = el('div', 'sb-pop ' + cls); p.setAttribute('role', 'menu'); document.body.append(p); pops.push(p);
    p._place = () => {
      const w = p.offsetWidth, h = p.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
      let x = side === 'right' ? rect.right - 2 : rect.left, y = side === 'right' ? rect.top - 6 : rect.bottom + 4;
      if (side === 'right' && x + w > vw - 4) x = rect.left - w + 2;
      if (side === 'above') y = rect.top - h - 4;
      x = Math.max(4, Math.min(x, vw - w - 4)); y = Math.max(4, Math.min(y, vh - h - 4));
      p.style.left = x + 'px'; p.style.top = y + 'px';
    };
    return p;
  }
  function openMenu(items, rect, level = 0, side = 'below') {
    const p = popAt(level, rect, 'sb-menu', side);
    for (const item of items) {
      if (item === SEP) { p.append(el('hr')); continue; }
      if (item.kind === 'iconrow') {
        const row = el('div', 'sb-iconrow');
        for (const child of item.items) {
          const b = el('button', 'sb-iconcell'); b.type = 'button'; b.title = child.soon ? child.label + '（' + SOON + '）' : child.label;
          b.append(ico(child.icon, 20)); if (child.menu) b.append(ico('chevron', 10));
          if (!hooks.enabled(child)) b.classList.add('is-disabled');
          if (hooks.checked(child)) b.classList.add('is-on');
          b.addEventListener('click', () => { if (child.menu) openMenu(hooks.resolve(child.menu), b.getBoundingClientRect(), level + 1, 'below'); else hooks.run(child); });
          row.append(b);
        }
        p.append(row); continue;
      }
      const b = el('button', 'sb-item' + (item.preview ? ' dc-style-item' : '')); b.type = 'button'; b.setAttribute('role', 'menuitem');
      const sub = !!(item.menu || item.panel), on = sub ? !item.soon && hooks.enabled({...item, menu: undefined, panel: undefined, do: item.do || {ui: 'noop'}}) : hooks.enabled(item);
      b.append(el('span', 'sb-check', hooks.checked(item) ? '✓' : ''));
      if (!item.preview) { if (item.icon) b.append(ico(item.icon, 16)); else b.append(el('span', 'sb-ico sb-ico-empty')); }
      const label = el('span', 'sb-label', item.label);
      if (item.preview) Object.assign(label.style, item.preview);
      b.append(label);
      if (item.hint) b.append(el('span', 'sb-hint', item.hint));
      if (item.soon) b.title = SOON;
      if (sub) b.append(el('span', 'sb-sub', '›'));
      if (!on) { b.classList.add('is-disabled'); b.setAttribute('aria-disabled', 'true'); }
      const openSub = () => {
        if (!on) return;
        const r = b.getBoundingClientRect();
        if (item.panel) hooks.panel(item.panel, item, r, level + 1, 'right'); else openMenu(hooks.resolve(item.menu), r, level + 1, 'right');
      };
      if (sub) { b.addEventListener('pointerenter', openSub); b.addEventListener('click', openSub); }
      else { b.addEventListener('pointerenter', () => closeAll(level + 1)); b.addEventListener('click', () => { if (on) { closeAll(); hooks.run(item); } else if (item.soon) hooks.run(item); }); }
      p.append(b);
    }
    p._place(); return p;
  }
  function colorPanel(item, rect, level, side, pick, recent) {
    const p = popAt(level, rect, 'sb-colors', side);
    const choose = c => { closeAll(); if (c !== 'none' && c !== 'auto') { recent.splice(0, recent.length, ...[c, ...recent.filter(x => x !== c)].slice(0, 10)); } pick(c); };
    const none = el('button', 'sb-color-none', item.none ? '无颜色' : '自动'); none.type = 'button'; none.addEventListener('click', () => choose(item.none ? 'none' : 'auto')); p.append(none);
    const sw = c => { const b = el('button', 'sb-swatch'); b.type = 'button'; b.title = c; b.setAttribute('aria-label', c); b.style.background = c; b.addEventListener('click', () => choose(c)); return b; };
    const grid = el('div', 'sb-color-grid'); for (const row of THEME_COLORS) for (const c of row) grid.append(sw(c));
    p.append(grid, el('div', 'sb-color-title', '标准色'));
    const std = el('div', 'sb-color-grid'); STANDARD_COLORS.forEach(c => std.append(sw(c))); p.append(std, el('div', 'sb-color-title', '最近使用'));
    const rec = el('div', 'sb-color-grid'); for (let i = 0; i < 10; i++) rec.append(recent[i] ? sw(recent[i]) : el('i', 'sb-swatch sb-swatch-empty')); p.append(rec);
    const more = el('label', 'sb-color-more'); const input = el('input'); input.type = 'color'; input.addEventListener('change', () => choose(input.value.toUpperCase()));
    more.append(ico('palette', 16), el('span', '', '更多颜色'), input); p.append(more);
    p._place(); return p;
  }
  function toggle(anchor, open) { if (pops.length && lastAnchor === anchor) { closeAll(); lastAnchor = null; return; } closeAll(); lastAnchor = anchor; open(); }
  return {pops, closeAll, popAt, openMenu, colorPanel, toggle};
}

/** Small modal-ish form popup: fields [{key,label,type,value,options}] -> onSubmit(values). */
export function formPopup(pk, rect, title, fields, onSubmit, {submit = '确定'} = {}) {
  const p = pk.popAt(0, rect, 'sb-dialog dc-form');
  p.append(el('div', 'sb-dialog-title', title));
  const inputs = {};
  for (const f of fields) {
    const row = el('label', 'dc-form-row'); row.append(el('span', 'dc-form-label', f.label));
    let input;
    if (f.type === 'select') { input = el('select', 'sb-dialog-input'); for (const [v, t] of f.options) { const o = el('option', '', t); o.value = v; input.append(o); } input.value = f.value ?? f.options[0][0]; }
    else if (f.type === 'textarea') { input = el('textarea', 'sb-dialog-input dc-form-area'); input.value = f.value ?? ''; input.maxLength = f.max ?? 2000; }
    else { input = el('input', 'sb-dialog-input'); input.type = f.type || 'text'; input.value = f.value ?? ''; if (f.max) input.maxLength = f.max; if (f.placeholder) input.placeholder = f.placeholder; }
    inputs[f.key] = input; row.append(input); p.append(row);
  }
  const ok = el('button', 'sb-dialog-ok', submit); ok.type = 'button';
  const done = () => { const v = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value])); pk.closeAll(); onSubmit(v); };
  ok.addEventListener('click', done);
  p.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); done(); } e.stopPropagation(); });
  p.append(ok); p._place(); Object.values(inputs)[0]?.focus();
  return p;
}
