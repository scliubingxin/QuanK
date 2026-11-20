// [lane:ribbon] Ribbon renderer. Data comes from ribbon-config.js; commands leave through the bus (`command`, `view:set`, ...).
import {bus} from './bus.js';
import {TABS, MASTER_TABS, COLORS, RATIOS, SOON_TIP} from './ribbon-config.js';
import {icon} from './ribbon-icons.js';
import {colorToLong, mapUnoStates} from '../shared/office-uno.js';
import {historyCommandAvailable} from '../shared/office-history.js';

// ---- pure helpers (unit tested) -------------------------------------------------
/** LOK selection type (0 none, 1 text, 2 large text, 3 complex) plus UNO states -> ribbon selection kind. */
export function selectionKind(shot) {
  const t = shot?.selectionType;
  if (t === 1 || t === 2) return 'text';
  if (t === 3 || mapUnoStates(shot?.states).object) return 'object';
  return 'none';
}
export function normalizeKind(kind) {
  return kind === 'text' ? 'text' : ['object', 'shape', 'image', 'table', 'group'].includes(kind) ? 'object' : 'none';
}
/** ctx: {ready, kind, history, mode}. Soon items are never enabled. */
export function enabledFor(item, ctx) {
  if (item.soon) return false;
  switch (item.enabledWhen || 'always') {
    case 'always': return true;
    case 'doc': return !!ctx.ready;
    case 'text': return !!ctx.ready && (ctx.kind === 'text' || ctx.kind === 'object');
    case 'object': return !!ctx.ready && ctx.kind === 'object';
    case 'undo': return !!ctx.ready && historyCommandAvailable(ctx.history, '.uno:Undo');
    case 'redo': return !!ctx.ready && historyCommandAvailable(ctx.history, '.uno:Redo');
    case 'master-off': return ctx.mode !== 'master';
    default: return false;
  }
}
/** Builds the `command` bus payload for an item. `value` is a colour, option, or {columns,rows}. */
export function buildCommand(item, value) {
  const d = {id: item.id};
  if (item.pickImage) return {...d, action: 'pickImage'};
  if (item.uno) d.uno = item.uno;
  if (item.ratio) { const [w, h] = RATIOS[item.ratio]; d.args = {'AttributePageSize.Width': w, 'AttributePageSize.Height': h}; }
  else if (item.argKey) d.args = {[item.argKey]: item.numeric ? Number(value) : value};
  else if (item.colorKey) d.args = {[item.colorKey]: colorToLong(value)};
  else if (item.menuType === 'table-grid' && value) d.args = {Columns: value.columns, Rows: value.rows};
  return d;
}
export function tabByName(name) {
  return TABS.find(t => t.name === name || t.label === name);
}
export function visibleTabs(mode) {
  return TABS.filter(t => mode !== 'master' || MASTER_TABS.includes(t.name));
}

// ---- DOM ----------------------------------------------------------------------
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const svg = (name, size) => { const w = el('span', 'wb-ico-wrap'); w.innerHTML = icon(name, size); return w; }; // icon() output is static markup from ribbon-icons.js

export function mountRibbon({host = typeof window !== 'undefined' ? window.wbOfficeHost : null} = {}) {
  let root = document.getElementById('wb-ribbon');
  if (!root) {
    root = el('div'); root.id = 'wb-ribbon';
    (document.querySelector('main') || document.body).before(root);
  }
  root.classList.add('wb-ribbon');
  let tabsBar = document.getElementById('wb-tabs'), ownTabs = false;
  if (!tabsBar) { tabsBar = el('div'); tabsBar.id = 'wb-tabs'; tabsBar.className = 'wb-tabs-temp'; root.before(tabsBar); ownTabs = true; }
  else if (!tabsBar.children.length) ownTabs = true;

  const ctx = {ready: !host, kind: 'none', history: null, mode: 'normal'};
  const registry = new Map(); // id -> {el, item, apply}
  const external = new Map(); // id -> {enabled, checked, value} from `command:state`
  const toggles = {ruler: false, guides: false, grid: false, snap: false, notes: false};
  const lastColor = new Map();
  let tab = 'home', collapsed = false;
  const pop = el('div', 'wb-pop'); pop.hidden = true; document.body.append(pop);
  let popAnchor = null;
  const closePop = () => { pop.hidden = true; pop.replaceChildren(); popAnchor = null; };
  document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !popAnchor?.contains(e.target)) closePop(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
  window.addEventListener('resize', closePop);

  function run(item, value) {
    closePop();
    if (!isEnabled(item)) return;
    if (item.type === 'checkbox') {
      const key = item.toggleName; if (key) toggles[key] = !toggles[key];
      else item._checked = !item._checked;
      if (item.event) bus.emit(item.event.type, {...item.event.detail, checked: key ? toggles[key] : item._checked});
      refresh(); return;
    }
    if (item.event) { bus.emit(item.event.type, item.event.detail); return; }
    if (item.colorKey && value) lastColor.set(item.id, value);
    bus.emit('command', buildCommand(item, value ?? (item.colorKey ? (lastColor.get(item.id) || item.defaultColor) : undefined)));
    refresh();
  }
  function isEnabled(item) {
    if (item.soon || external.get(item.id)?.enabled === false) return false;
    return enabledFor(item, ctx);
  }
  function decorate(node, item) {
    node.dataset.id = item.id;
    node.title = item.soon ? item.label + '（' + SOON_TIP + '）' : item.label;
    node.setAttribute('aria-label', item.label);
  }

  function menuList(item, anchor) {
    pop.replaceChildren();
    pop.className = 'wb-pop wb-menu';
    for (const child of item.menu) {
      const b = el('button', 'wb-menu-item'); b.type = 'button'; b.dataset.id = child.id;
      if (child.icon) b.append(svg(child.icon, 16));
      b.append(el('span', 'wb-menu-label', child.label));
      const on = isEnabled(child);
      b.setAttribute('aria-disabled', String(!on));
      if (!on) { b.classList.add('wb-disabled'); b.title = child.soon ? SOON_TIP : child.label; }
      b.addEventListener('click', () => { if (on) run(child); });
      pop.append(b);
    }
    place(anchor);
  }
  function menuColor(item, anchor) {
    pop.replaceChildren(); pop.className = 'wb-pop wb-colors';
    for (const c of COLORS) {
      const b = el('button', 'wb-color'); b.type = 'button'; b.style.background = c; b.title = c; b.setAttribute('aria-label', c);
      b.addEventListener('click', () => run(item, c)); pop.append(b);
    }
    place(anchor);
  }
  function menuTable(item, anchor) {
    pop.replaceChildren(); pop.className = 'wb-pop wb-tablegrid';
    const label = el('div', 'wb-grid-label', '插入表格'); const grid = el('div', 'wb-grid'); const cells = [];
    for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) {
      const b = el('button', 'wb-cell'); b.type = 'button'; b.dataset.r = r; b.dataset.c = c; b.setAttribute('aria-label', r + '行' + c + '列');
      b.addEventListener('pointerenter', () => hl(r, c)); b.addEventListener('focus', () => hl(r, c));
      b.addEventListener('click', () => run(item, {rows: r, columns: c}));
      cells.push(b); grid.append(b);
    }
    function hl(r, c) { label.textContent = c + ' × ' + r + ' 表格'; for (const x of cells) x.classList.toggle('on', +x.dataset.r <= r && +x.dataset.c <= c); }
    pop.append(label, grid); place(anchor);
  }
  function menuOptions(item, anchor) {
    pop.replaceChildren(); pop.className = 'wb-pop wb-menu wb-options';
    for (const o of item.options) {
      const b = el('button', 'wb-menu-item', String(o)); b.type = 'button';
      if (item.argKey === 'CharFontName.FamilyName') b.style.fontFamily = '"' + String(o).replace(/["\\]/g, '') + '"';
      b.addEventListener('click', () => run(item, o)); pop.append(b);
    }
    place(anchor);
  }
  function place(anchor) {
    pop.hidden = false; popAnchor = anchor;
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.left = Math.max(4, Math.min(r.left, window.innerWidth - w - 4)) + 'px';
    pop.style.top = (r.bottom + 2) + 'px';
  }
  function openMenu(item, anchor) {
    if (!pop.hidden && popAnchor === anchor) { closePop(); return; }
    if (!isEnabled(item)) return;
    if (item.type === 'select') return menuOptions(item, anchor);
    if (item.menuType === 'color') return menuColor(item, anchor);
    if (item.menuType === 'table-grid') return menuTable(item, anchor);
    if (item.menu) return menuList(item, anchor);
  }

  function renderButton(item) {
    const size = item.size || 'sm', lgSize = size === 'lg';
    const wrap = el('div', 'wb-item wb-' + size + ' wb-type-' + item.type + (item.danger ? ' wb-danger' : ''));
    const hasMenu = !!(item.menu || item.menuType) && item.type !== 'select';
    const mk = () => {
      const b = el('button', 'wb-btn'); b.type = 'button'; decorate(b, item);
      const top = el('span', 'wb-btn-top');
      if (item.icon) top.append(svg(item.icon, lgSize ? 26 : 18));
      if (item.colorKey) { const bar = el('span', 'wb-colorbar'); bar.style.background = item.defaultColor; bar.dataset.bar = item.id; top.classList.add('wb-has-bar'); top.append(bar); }
      b.append(top);
      if (lgSize || size === 'inline') b.append(el('span', 'wb-label', item.label));
      return b;
    };
    let main = mk();
    if (item.type === 'split') {
      main.addEventListener('click', () => run(item));
      const arrow = el('button', 'wb-btn wb-arrow'); arrow.type = 'button'; arrow.append(svg('chevron', 10)); decorate(arrow, {...item, label: item.label + '：更多选项'});
      arrow.addEventListener('click', () => openMenu(item, wrap));
      wrap.append(main, arrow); registry.set(item.id, {el: wrap, item, parts: [main, arrow]});
    } else if (item.type === 'dropdown') {
      const top = main.querySelector('.wb-btn-top'); top.append(svg('chevron', 10)); main.classList.add('wb-dd');
      main.addEventListener('click', () => openMenu(item, main)); wrap.append(main); registry.set(item.id, {el: wrap, item, parts: [main]});
    } else {
      main.addEventListener('click', () => run(item)); wrap.append(main); registry.set(item.id, {el: wrap, item, parts: [main]});
    }
    return wrap;
  }
  function renderSelect(item) {
    const wrap = el('div', 'wb-item wb-select'); wrap.style.width = (item.width || 80) + 'px';
    const b = el('button', 'wb-btn wb-selectbtn'); b.type = 'button'; decorate(b, item);
    const v = el('span', 'wb-selvalue', item.placeholder || ''); v.dataset.placeholder = item.placeholder || '';
    b.append(v, svg('chevron', 10)); b.addEventListener('click', () => openMenu(item, wrap));
    wrap.append(b); registry.set(item.id, {el: wrap, item, parts: [b], value: v}); return wrap;
  }
  function renderCheckbox(item) {
    const wrap = el('div', 'wb-item wb-check');
    const b = el('button', 'wb-btn wb-checkbtn'); b.type = 'button'; b.setAttribute('role', 'checkbox'); decorate(b, item);
    b.append(el('span', 'wb-box'), el('span', 'wb-label', item.label)); b.addEventListener('click', () => run(item));
    wrap.append(b); registry.set(item.id, {el: wrap, item, parts: [b]}); return wrap;
  }
  function renderNumber(item) {
    const wrap = el('div', 'wb-item wb-number');
    const head = el('div', 'wb-numhead'); head.append(svg(item.icon, 16), el('span', 'wb-label', item.label));
    const inp = el('input', 'wb-numinput'); inp.type = 'text'; inp.inputMode = 'decimal'; inp.value = item.value + (item.unit || ''); inp.disabled = true; inp.setAttribute('aria-label', item.label);
    wrap.append(head, inp); decorate(wrap, item); registry.set(item.id, {el: wrap, item, parts: [inp]}); return wrap;
  }
  function renderGallery(item) {
    const wrap = el('div', 'wb-gallery'); wrap.dataset.id = item.id;
    for (const child of item.items) {
      const b = el('button', 'wb-btn wb-gal'); b.type = 'button'; decorate(b, child);
      const top = el('span', 'wb-btn-top'); top.append(svg(child.icon, 26)); b.append(top, el('span', 'wb-label', child.label));
      b.addEventListener('click', () => { if (isEnabled(child)) { if (item.selected !== undefined) item.selected = child.id; run(child); } });
      registry.set(child.id, {el: b, item: child, parts: [b], gallery: item}); wrap.append(b);
    }
    return wrap;
  }
  function renderSwatch(item) {
    const wrap = el('div', 'wb-palettes'); decorate(wrap, item);
    item.palettes.forEach((p, n) => {
      const g = el('button', 'wb-palette'); g.type = 'button'; g.setAttribute('aria-label', '配色方案 ' + (n + 1)); g.title = SOON_TIP;
      for (const c of p) { const s = el('i'); s.style.background = c; g.append(s); }
      g.setAttribute('aria-disabled', 'true'); wrap.append(g);
    });
    registry.set(item.id, {el: wrap, item, parts: []}); return wrap;
  }
  function renderItem(item) {
    switch (item.type) {
      case 'select': return renderSelect(item);
      case 'checkbox': return renderCheckbox(item);
      case 'number': return renderNumber(item);
      case 'gallery': return renderGallery(item);
      case 'swatch': return renderSwatch(item);
      default: return renderButton(item);
    }
  }
  function renderRibbon() {
    registry.clear(); closePop(); root.replaceChildren(); root.classList.toggle('wb-collapsed', collapsed);
    const t = tabByName(tab) || TABS[0];
    const strip = el('div', 'wb-groups'); strip.setAttribute('role', 'toolbar'); strip.setAttribute('aria-label', t.label + '功能区');
    for (const g of t.groups) {
      if (g.masterOnly && ctx.mode !== 'master') continue;
      const ge = el('div', 'wb-group wb-group-' + g.id); if (g.vlabel) ge.append(el('span', 'wb-vlabel', g.vlabel));
      for (const block of g.items) {
        if (block.rows) { const box = el('div', 'wb-rows'); for (const r of block.rows) { const row = el('div', 'wb-row'); r.forEach(i => row.append(renderItem(i))); box.append(row); } ge.append(box); }
        else ge.append(renderItem(block));
      }
      strip.append(ge);
    }
    const tools = el('div', 'wb-tools');
    const search = el('button', 'wb-btn wb-tool'); search.type = 'button'; search.append(svg('search', 18)); search.title = '搜索（' + SOON_TIP + '）'; search.setAttribute('aria-label', '搜索'); search.setAttribute('aria-disabled', 'true'); search.classList.add('wb-disabled');
    const fold = el('button', 'wb-btn wb-tool'); fold.type = 'button'; fold.append(svg('chevron', 18)); fold.title = collapsed ? '展开功能区' : '收起功能区'; fold.setAttribute('aria-label', fold.title);
    fold.addEventListener('click', () => { collapsed = !collapsed; renderRibbon(); });
    tools.append(search, fold);
    root.append(strip, tools); refresh();
  }
  function renderTabs() {
    if (!ownTabs) { bus.emit('ribbon:tabs', {visible: visibleTabs(ctx.mode).map(t => t.name)}); return; }
    tabsBar.replaceChildren(); tabsBar.setAttribute('role', 'tablist');
    for (const t of visibleTabs(ctx.mode)) {
      const b = el('button', 'wb-tab', t.label); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.tab = t.name;
      b.setAttribute('aria-selected', String(t.name === tab)); b.classList.toggle('active', t.name === tab);
      b.addEventListener('click', () => bus.emit('ribbon:tab', {name: t.name})); tabsBar.append(b);
    }
  }
  function refresh() {
    for (const {el: node, item, parts, value} of registry.values()) {
      const on = isEnabled(item), ex = external.get(item.id) || {};
      node.classList.toggle('wb-disabled', !on);
      for (const p of parts) { p.setAttribute('aria-disabled', String(!on)); p.classList.toggle('wb-disabled', !on); }
      let pressed = ex.checked === true;
      if (item.type === 'checkbox') pressed = item.toggleName ? toggles[item.toggleName] : !!item._checked;
      if (item.modeKey) pressed = ctx.mode === item.modeKey;
      if (item.type === 'checkbox') parts[0]?.setAttribute('aria-checked', String(pressed));
      else if (parts[0]) parts[0].setAttribute('aria-pressed', String(pressed));
      node.classList.toggle('wb-on', pressed);
      if (item.type === 'select' && value) { const v = ex.value; value.textContent = v ? String(v) : value.dataset.placeholder; value.classList.toggle('wb-ph', !v); }
    }
    for (const {el: node, item, gallery} of registry.values()) if (gallery) node.classList.toggle('wb-selected', gallery.selected === item.id);
    for (const [id, c] of lastColor) { const bar = root.querySelector('[data-bar="' + id + '"]'); if (bar) bar.style.background = c; }
  }
  function setTab(name) {
    const t = tabByName(name); if (!t || !visibleTabs(ctx.mode).includes(t)) return;
    tab = t.name; closePop(); renderTabs(); renderRibbon();
  }
  function applyShot(shot) {
    if (!shot) return;
    ctx.ready = true; ctx.kind = selectionKind(shot); ctx.history = shot.history ?? null;
    const hidden = !!shot.format && shot.format !== 'pptx'; root.hidden = hidden; if (ownTabs) tabsBar.hidden = hidden;
    refresh();
  }

  bus.on('ribbon:tab', d => setTab(d?.name));
  bus.on('selection:changed', d => { ctx.kind = normalizeKind(d?.kind); refresh(); });
  bus.on('office:shot', applyShot);
  bus.on('command:state', d => { if (!d?.id) return; external.set(d.id, {...external.get(d.id), ...d}); refresh(); });
  bus.on('view:set', d => {
    if (!['normal', 'master', 'notes'].includes(d?.mode)) return;
    const prev = ctx.mode; ctx.mode = d.mode === 'master' ? 'master' : 'normal';
    if (ctx.mode === 'master') { tab = 'view'; }
    else if (prev === 'master' && !visibleTabs('normal').some(t => t.name === tab)) tab = 'home';
    renderTabs(); renderRibbon();
  });
  renderTabs(); renderRibbon();
  if (host?.shot?.()) applyShot(host.shot());
  return {setTab, refresh, get tab() { return tab; }, get mode() { return ctx.mode; }, ctx, registry, root};
}

if (typeof document !== 'undefined') {
  const start = () => { window.wbRibbon = mountRibbon(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}
