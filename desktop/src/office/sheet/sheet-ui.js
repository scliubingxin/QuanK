// [excel] Spreadsheet editor UI (xlsx): single-row toolbar, name box + formula bar, row/column headers,
// sheet tabs, selection statistics, context menu, keyboard/IME input and the floating "AI 编辑" button.
// Talks to the document only through window.wbOfficeHost (serialized operations) and bus.js events.
import {bus} from '../bus.js';
import {sheetIcon, shapeGlyph} from './sheet-icons.js';
import {
  TOOLBAR, SEP, SOON, MAIN_MENU, MORE_MENU, FREEZE_MENU, NUMBER_FORMATS, BORDER_GRID, BORDER_STYLE_LIST, THEME_COLORS, STANDARD_COLORS,
  SHAPES, ROWCOL_MENU, DELETE_MENU, mapSheetStates, HALIGN_ICON, VALIGN_ICON, numberFormatLabel, menuContext
} from './sheet-config.js';
import {
  MAX_COL, MAX_ROW, colName, cellRef, normalizeRef, columnRange, rowRange, parseAddress, parseCellCursor, axisRuns, visibleSpans,
  spanStart, spanSize, sheetKeyEvent, sheetTypedChar, selectionStats, parseStateTableCell, formatStat, sheetNameValid, nextSheetName, formulaAllowed
} from '../../shared/office-sheet.js';
import {historyCommandAvailable} from '../../shared/office-history.js';

const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const ico = (name, size = 18) => { const s = el('span', 'sb-ico'); s.innerHTML = sheetIcon(name, size); return s; }; // static markup from sheet-icons.js
const HEAD_H = 24, MIN_ROWHEAD = 40;

export function mountSheet({host, api}) {
  const st = {
    shot: null, ui: mapSheetStates({}), geo: {key: '', cols: null, rows: null}, colSpans: [], rowSpans: [], rowHeadW: MIN_ROWHEAD,
    colors: {'font-color': '#E53935', fill: '#FFEB3B'}, recent: [], border: {kind: 'all', color: '#000000', style: 'solid'},
    tabColors: new Map(), tabsKey: '', revealNext: false, typed: '', typedTimer: 0, lastCopy: '', anchor: null, collapsed: false, overflow: [],
  };
  const say = text => { const s = $('#action-status'); if (s) { s.textContent = ''; s.textContent = text; } };
  const perform = (op, p = {}) => host.perform(op, p);
  const uno = (command, args) => perform('uno', args ? {command, args} : {command});

  /* ---------------------------------------------------------------- DOM */
  document.body.classList.add('wb-sheet');
  const card = $('#wb-ribbon-card');
  const bar = el('div', 'sb-bar'); bar.id = 'wb-sheetbar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', '表格工具栏');
  const strip = el('div', 'sb-strip'), tools = el('div', 'sb-tools');
  bar.append(strip, tools); card.prepend(bar);

  const fbar = el('div', 'sb-formula'); fbar.id = 'wb-formula-row';
  const nameBox = el('input', 'sb-namebox'); nameBox.id = 'wb-namebox'; nameBox.setAttribute('aria-label', '名称框'); nameBox.spellcheck = false; nameBox.value = 'A1';
  const fx = el('span', 'sb-fx'); fx.append(ico('fx', 20));
  const formula = el('input', 'sb-formula-input'); formula.id = 'wb-formula'; formula.setAttribute('aria-label', '编辑栏'); formula.spellcheck = false;
  fbar.append(nameBox, el('i', 'sb-vsep'), fx, formula); card.after(fbar);

  const stage = $('#wb-stage'), shell = $('#viewport-shell');
  const frame = el('div', 'sb-frame'); frame.id = 'wb-sheet-frame';
  const corner = el('div', 'sb-corner'); corner.title = '全选';
  const colHead = el('canvas', 'sb-colhead'), rowHead = el('canvas', 'sb-rowhead');
  const guide = el('div', 'sb-guide'); guide.hidden = true;
  const aiBtn = el('button', 'sb-ai'); aiBtn.type = 'button'; aiBtn.append(ico('edit', 16), el('span', '', 'AI 编辑')); aiBtn.hidden = true;
  const ime = el('textarea', 'sb-ime'); ime.setAttribute('aria-label', '单元格输入'); ime.autocapitalize = 'off'; ime.spellcheck = false;
  shell.before(frame); frame.append(corner, colHead, rowHead, shell, guide, aiBtn, ime);

  const status = $('#wb-statusbar');
  const tabsWrap = el('div', 'sb-tabs'); tabsWrap.id = 'wb-sheet-tabs';
  const addTab = el('button', 'sb-tabbtn'); addTab.type = 'button'; addTab.title = '新建工作表'; addTab.append(ico('plus', 18));
  const listTab = el('button', 'sb-tabbtn'); listTab.type = 'button'; listTab.title = '工作表列表'; listTab.append(ico('layers', 18));
  const tabScroll = el('div', 'sb-tabscroll');
  const tabPrev = el('button', 'sb-tabbtn sb-tabnav'); tabPrev.type = 'button'; tabPrev.title = '向左滚动'; tabPrev.textContent = '◀';
  const tabNext = el('button', 'sb-tabbtn sb-tabnav'); tabNext.type = 'button'; tabNext.title = '向右滚动'; tabNext.textContent = '▶';
  tabsWrap.append(addTab, listTab, tabScroll, tabPrev, tabNext);
  status.prepend(tabsWrap);
  const stats = el('div', 'sb-stats'); stats.id = 'wb-sheet-stats';
  $('#wb-fit')?.before(stats);
  const editBadge = el('span', 'sb-editing', '● 编辑中，未保存'); editBadge.hidden = true; $('#wb-save-state')?.after(editBadge);

  /* ---------------------------------------------------------------- popups */
  const pops = [];
  function closeAll(level = 0) { while (pops.length > level) pops.pop().remove(); }
  document.addEventListener('pointerdown', e => { if (pops.length && !pops.some(p => p.contains(e.target)) && !e.target.closest?.('.sb-bar [data-open],.sb-tabs [data-open]')) closeAll(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pops.length) { closeAll(); e.stopPropagation(); } }, true);
  window.addEventListener('resize', () => { closeAll(); layoutToolbar(); });
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
  function menuContextNow() {
    const cur = parseCellCursor(st.shot?.sheet?.cursor) || {col: 0, row: 0}, a = parseAddress(st.shot?.sheet?.address) || {c1: cur.col ?? 0, c2: cur.col ?? 0, r1: cur.row ?? 0, r2: cur.row ?? 0};
    return menuContext({col: cur.col ?? 0, row: cur.row ?? 0, c1: a.c1, c2: a.c2, r1: a.r1, r2: a.r2, frozen: st.ui.frozen});
  }
  function resolveMenu(m) {
    const ctx = menuContextNow();
    if (m === 'main') return MAIN_MENU(ctx);
    if (m === 'more') return [...overflowItems(), ...MORE_MENU(ctx)];
    if (m === 'freeze') return FREEZE_MENU(ctx);
    return typeof m === 'function' ? m(ctx) : m || [];
  }
  function enabled(item) {
    if (item.soon) return false;
    if (item.enabled === false) return false;
    if (item.when === 'undo') return historyCommandAvailable(st.shot?.history, '.uno:Undo');
    if (item.when === 'redo') return historyCommandAvailable(st.shot?.history, '.uno:Redo');
    if (item.when === 'merged') return st.ui.merged;
    return !!st.shot;
  }
  function checked(item) {
    if (item.check) return st.ui[item.check[0]] === item.check[1];
    return item.state ? st.ui[item.state] === true : false;
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
          if (!enabled(child)) b.classList.add('is-disabled');
          b.addEventListener('click', () => { if (child.menu) openMenu(resolveMenu(child.menu), b.getBoundingClientRect(), level + 1, 'below'); else run(child); });
          row.append(b);
        }
        p.append(row); continue;
      }
      const b = el('button', 'sb-item'); b.type = 'button'; b.setAttribute('role', 'menuitem');
      const on = enabled(item) || (!item.soon && (item.menu || item.panel) && !!st.shot);
      b.append(el('span', 'sb-check', (item.checkedNow ?? checked(item)) ? '✓' : ''));
      if (item.icon) b.append(ico(item.icon, 16)); else b.append(el('span', 'sb-ico sb-ico-empty'));
      b.append(el('span', 'sb-label', item.label));
      if (item.hint) b.append(el('span', 'sb-hint', item.hint));
      if (item.soon) b.title = SOON;
      if (item.menu || item.panel) b.append(el('span', 'sb-sub', '›'));
      if (!on) { b.classList.add('is-disabled'); b.setAttribute('aria-disabled', 'true'); }
      const openSub = () => {
        if (!on) return;
        const r = b.getBoundingClientRect();
        if (item.panel) openPanel(item.panel, item, r, level + 1, 'right');
        else openMenu(resolveMenu(item.menu), r, level + 1, 'right');
      };
      if (item.menu || item.panel) { b.addEventListener('pointerenter', openSub); b.addEventListener('click', openSub); }
      else { b.addEventListener('pointerenter', () => closeAll(level + 1)); b.addEventListener('click', () => { if (on) run(item); else if (item.soon) say(item.label + '：' + SOON); }); }
      p.append(b);
    }
    p._place();
    return p;
  }
  function openPanel(type, item, rect, level = 0, side = 'below') {
    if (type === 'shapes') return shapesPanel(rect, level, side);
    if (type === 'color') return colorPanel(item, rect, level, side);
    if (type === 'border') return borderPanel(rect, level, side);
    if (type === 'numfmt') return numfmtPanel(rect, level, side);
    if (type === 'options') return optionsPanel(item, rect, level, side);
  }
  function colorPanel(item, rect, level, side, onPick) {
    const p = popAt(level, rect, 'sb-colors', side);
    const pick = c => { closeAll(); if (c !== 'none' && c !== 'auto') { st.recent = [c, ...st.recent.filter(x => x !== c)].slice(0, 10); st.colors[item.id] = c; paintBars(); } (onPick || applyColor)(item, c); };
    if (item.none || item.auto || onPick) {
      const none = el('button', 'sb-color-none', item.none ? '无颜色' : '自动'); none.type = 'button';
      none.addEventListener('click', () => pick(item.none ? 'none' : 'auto')); p.append(none);
    }
    const grid = el('div', 'sb-color-grid');
    for (const row of THEME_COLORS) for (const c of row) grid.append(swatch(c, pick));
    p.append(grid, el('div', 'sb-color-title', '标准色'));
    const std = el('div', 'sb-color-grid'); STANDARD_COLORS.forEach(c => std.append(swatch(c, pick))); p.append(std);
    p.append(el('div', 'sb-color-title', '最近使用'));
    const rec = el('div', 'sb-color-grid'); for (let i = 0; i < 10; i++) { const c = st.recent[i]; rec.append(c ? swatch(c, pick) : el('i', 'sb-swatch sb-swatch-empty')); } p.append(rec);
    const more = el('label', 'sb-color-more'); const input = el('input'); input.type = 'color'; input.value = st.colors[item.id] || '#000000';
    input.addEventListener('change', () => pick(input.value.toUpperCase())); more.append(ico('palette', 16), el('span', '', '更多颜色'), input); p.append(more);
    p._place(); return p;
  }
  function swatch(c, pick) { const b = el('button', 'sb-swatch'); b.type = 'button'; b.title = c; b.setAttribute('aria-label', c); b.style.background = c; b.addEventListener('click', () => pick(c)); return b; }
  function applyColor(item, c) {
    const value = c === 'none' || c === 'auto' ? -1 : parseInt(c.slice(1), 16);
    uno(item.command, {[item.argKey]: value});
  }
  function borderPanel(rect, level, side) {
    const p = popAt(level, rect, 'sb-borders', side);
    const grid = el('div', 'sb-border-grid');
    for (const [icon, kind, label] of BORDER_GRID) {
      const b = el('button', 'sb-border-cell' + (st.border.kind === kind ? ' is-on' : '')); b.type = 'button'; b.title = label; b.append(ico(icon, 20));
      b.addEventListener('click', () => { st.border.kind = kind; closeAll(); applyBorder(); paintBorderIcon(); }); grid.append(b);
    }
    p.append(grid, el('hr'));
    const colorRow = el('button', 'sb-item'); colorRow.type = 'button'; colorRow.append(el('span', 'sb-check'), ico('pen-color', 16), el('span', 'sb-label', '边框颜色'), el('span', 'sb-sub', '›'));
    const bar = el('i', 'sb-mini-bar'); bar.style.background = st.border.color; colorRow.querySelector('.sb-label').append(bar);
    colorRow.addEventListener('pointerenter', () => colorPanel({id: 'border-color', auto: true}, colorRow.getBoundingClientRect(), level + 1, 'right', (_i, c) => { st.border.color = c === 'auto' ? '#000000' : c; }));
    const styleRow = el('button', 'sb-item'); styleRow.type = 'button'; styleRow.append(el('span', 'sb-check'), ico('line-style', 16), el('span', 'sb-label', '边框样式'), el('span', 'sb-sub', '›'));
    styleRow.addEventListener('pointerenter', () => {
      const q = popAt(level + 1, styleRow.getBoundingClientRect(), 'sb-menu', 'right');
      for (const [key, label] of BORDER_STYLE_LIST) {
        const b = el('button', 'sb-item'); b.type = 'button'; b.append(el('span', 'sb-check', st.border.style === key ? '✓' : ''), el('span', 'sb-line sb-line-' + key), el('span', 'sb-label', label));
        b.addEventListener('click', () => { st.border.style = key; closeAll(); }); q.append(b);
      }
      q._place();
    });
    const moreRow = el('button', 'sb-item is-disabled'); moreRow.type = 'button'; moreRow.title = SOON; moreRow.append(el('span', 'sb-check'), el('span', 'sb-ico sb-ico-empty'), el('span', 'sb-label', '更多边框设置'));
    moreRow.addEventListener('pointerenter', () => closeAll(level + 1));
    p.append(colorRow, styleRow, moreRow); p._place(); return p;
  }
  function applyBorder() { perform('sheet_border', {...st.border}); }
  function numfmtPanel(rect, level, side) {
    const p = popAt(level, rect, 'sb-menu sb-numfmt', side);
    for (const f of NUMBER_FORMATS) {
      if (f === SEP) { p.append(el('hr')); continue; }
      const b = el('button', 'sb-item' + (f.soon ? ' is-disabled' : '')); b.type = 'button';
      b.append(el('span', 'sb-check', f.state && st.ui.numfmt === f.state ? '✓' : ''), el('span', 'sb-label', f.label), el('span', 'sb-hint', f.sample || ''));
      if (f.soon) b.title = SOON;
      b.addEventListener('click', () => { if (f.soon) { say(f.label + '：' + SOON); return; } closeAll(); uno(f.command); });
      p.append(b);
    }
    p._place(); return p;
  }
  function optionsPanel(item, rect, level, side) {
    const p = popAt(level, rect, 'sb-menu sb-options', side);
    for (const o of item.options) {
      const b = el('button', 'sb-item'); b.type = 'button'; const cur = item.state === 'font' ? st.ui.font : st.ui.size;
      b.append(el('span', 'sb-check', String(o) === String(cur) ? '✓' : ''), el('span', 'sb-label', String(o)));
      if (item.id === 'font-name' && o !== '默认字体') b.querySelector('.sb-label').style.fontFamily = '"' + String(o).replace(/["\\]/g, '') + '"';
      b.addEventListener('click', () => { closeAll(); applyOption(item, o); }); p.append(b);
    }
    p._place(); return p;
  }
  function applyOption(item, o) {
    if (item.id === 'font-name') uno('.uno:CharFontName', {'CharFontName.FamilyName': o === '默认字体' ? 'Calibri' : String(o)});
    else uno('.uno:FontHeight', {'FontHeight.Height': Number(o)});
  }
  function shapesPanel(rect, level, side) {
    const p = popAt(level, rect, 'sb-shapes', side);
    for (const g of SHAPES) {
      p.append(el('div', 'sb-shape-title', g.group));
      const grid = el('div', 'sb-shape-grid');
      for (const [glyph, command, label] of g.items) {
        const b = el('button', 'sb-shape'); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.innerHTML = shapeGlyph(glyph); // static markup
        b.addEventListener('click', () => { closeAll(); uno(command); say('在表格中拖动鼠标绘制' + label); }); grid.append(b);
      }
      p.append(grid);
    }
    p._place(); return p;
  }

  /* ---------------------------------------------------------------- actions */
  async function run(item) {
    closeAll();
    if (item.soon) { say(item.label + '：' + SOON); return; }
    const d = item.do; if (!d) return;
    if (d.uno) return uno(d.uno, d.args);
    if (d.legacy) return perform('command', {command: d.legacy});
    if (d.op) { const {op, ...rest} = d; return perform(op, rest); }
    if (d.fn) return insertFunction(d.fn);
    if (d.ui === 'pickImage') return pickImage();
    if (d.ui === 'zoom') return bus.emit('zoom:set', {percent: d.percent});
    if (d.ui === 'size') return sizeDialog(d.axis);
    if (d.ui === 'freezeHere') return freezeHere();
    if (d.ui === 'freeze') return freeze(d.rows, d.cols);
    if (d.ui === 'part') return perform('part', {part: d.part});
    if (['cut', 'copy', 'paste', 'ai'].includes(d.ui)) return ctxUi(d.ui);
  }
  function insertFunction(name) {
    const text = (st.shot?.sheet?.editing && /^=/.test(st.shot?.sheet?.formula || '') ? '' : '=') + name + '(';
    focusGrid(); typeText(text);
  }
  function pickImage() {
    return host.serial(async () => { const r = await api.invoke('pickImage'); if (r?.status === 'cancelled') return; host.status(r); await host.draw(); });
  }
  async function freeze(rows, cols) { await uno('.uno:FreezePanesRow', {Index: rows}); await uno('.uno:FreezePanesColumn', {Index: cols}); }
  async function freezeHere() {
    const cur = parseCellCursor(st.shot?.sheet?.cursor);
    if (!cur || cur.col === null) return;
    await freeze(Math.min(MAX_ROW - 1, cur.row + 1), Math.min(MAX_COL - 1, cur.col + 1));
  }
  function sizeDialog(axis) {
    const cur = parseCellCursor(st.shot?.sheet?.cursor); if (!cur || cur.col === null) return;
    const g = geometry(), index = axis === 'column' ? cur.col : cur.row, runs = axis === 'column' ? g?.cols : g?.rows;
    const px = Math.round((spanSize(runs, index) || (axis === 'column' ? 1280 : 255)) / 15);
    const r = (axis === 'column' ? colHead : rowHead).getBoundingClientRect();
    const p = popAt(0, {left: r.left + 40, right: r.left + 40, top: r.top, bottom: r.top + 30}, 'sb-dialog');
    const input = el('input', 'sb-dialog-input'); input.type = 'number'; input.min = '2'; input.max = '2000'; input.value = String(px);
    const ok = el('button', 'sb-dialog-ok', '确定'); ok.type = 'button';
    const apply = () => { const v = Math.round(Number(input.value)); closeAll(); if (v >= 2 && v <= 2000) perform('sheet_size', {axis, index, size: v * 15}); };
    ok.addEventListener('click', apply); input.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); });
    p.append(el('div', 'sb-dialog-title', (axis === 'column' ? '列宽（' + colName(index) + ' 列）' : '行高（第 ' + (index + 1) + ' 行）') + '，单位：像素'), input, ok);
    p._place(); input.select(); input.focus();
  }

  /* ---------------------------------------------------------------- toolbar */
  const nodes = [];
  function renderToolbar() {
    strip.replaceChildren(); nodes.length = 0;
    for (const item of TOOLBAR) {
      if (item === SEP) { const s = el('i', 'sb-sep'); strip.append(s); nodes.push({sep: true, node: s}); continue; }
      const node = renderTool(item); strip.append(node); nodes.push({item, node});
    }
    tools.replaceChildren();
    const find = el('button', 'sb-btn'); find.type = 'button'; find.title = '查找 (⌘F)'; find.append(ico('search', 18)); find.dataset.open = '1';
    find.addEventListener('click', () => findPanel(find));
    const fold = el('button', 'sb-btn sb-fold'); fold.type = 'button'; fold.title = '收起工具栏'; fold.append(ico('chevron', 18));
    fold.addEventListener('click', () => { st.collapsed = !st.collapsed; document.body.classList.toggle('sb-collapsed', st.collapsed); fold.title = st.collapsed ? '展开工具栏' : '收起工具栏'; });
    tools.append(find, fold);
    refreshToolbar(); requestAnimationFrame(layoutToolbar);
  }
  function renderTool(item) {
    const wrap = el('div', 'sb-tool sb-kind-' + item.kind); wrap.dataset.id = item.id; wrap.dataset.prio = String(item.prio ?? 1);
    const btn = (cls = '') => { const b = el('button', 'sb-btn ' + cls); b.type = 'button'; b.title = item.soon ? item.label + '（' + SOON + '）' : item.label; b.setAttribute('aria-label', item.label); return b; };
    if (item.kind === 'select' || item.kind === 'numfmt') {
      const b = btn('sb-select'); b.dataset.open = '1'; b.style.width = item.width + 'px';
      const v = el('span', 'sb-selvalue', item.placeholder || '常规'); b.append(v, ico('chevron', 10)); wrap._value = v;
      b.addEventListener('click', () => toggle(b, () => item.kind === 'numfmt' ? numfmtPanel(b.getBoundingClientRect(), 0) : optionsPanel(item, b.getBoundingClientRect(), 0)));
      wrap.append(b); return wrap;
    }
    if (item.kind === 'color' || item.kind === 'border' || item.kind === 'split') {
      const main = btn('sb-main'); main.append(ico(item.icon, 18));
      if (item.kind === 'color') { const barEl = el('i', 'sb-colorbar'); barEl.dataset.bar = item.id; main.append(barEl); }
      const arrow = btn('sb-arrow'); arrow.dataset.open = '1'; arrow.title = item.label + '：更多选项'; arrow.append(ico('chevron', 10));
      main.addEventListener('click', () => {
        if (item.kind === 'color') applyColor(item, st.colors[item.id] || item.initial);
        else if (item.kind === 'border') applyBorder();
        else run(item);
      });
      arrow.addEventListener('click', () => toggle(arrow, () => {
        const r = wrap.getBoundingClientRect();
        return item.kind === 'color' ? colorPanel(item, r, 0) : item.kind === 'border' ? borderPanel(r, 0) : openMenu(resolveMenu(item.menu), r, 0);
      }));
      wrap.append(main, arrow); wrap._main = main; return wrap;
    }
    if (item.kind === 'menu') {
      const b = btn('sb-dd'); b.dataset.open = '1'; b.append(ico(item.icon, 18));
      if (item.showLabel) b.append(el('span', 'sb-btnlabel', item.label));
      if (item.id !== 'more') b.append(ico('chevron', 10));
      b.addEventListener('click', () => toggle(b, () => item.panel ? openPanel(item.panel, item, b.getBoundingClientRect(), 0) : openMenu(resolveMenu(item.menu), b.getBoundingClientRect(), 0)));
      wrap.append(b); wrap._main = b; return wrap;
    }
    const b = btn(); b.append(ico(item.icon, 18)); b.addEventListener('click', () => run(item)); wrap.append(b); wrap._main = b; return wrap;
  }
  let lastAnchor = null;
  function toggle(anchor, open) { if (pops.length && lastAnchor === anchor) { closeAll(); lastAnchor = null; return; } closeAll(); lastAnchor = anchor; open(); }
  function paintBars() { for (const b of bar.querySelectorAll('[data-bar]')) b.style.background = st.colors[b.dataset.bar] || '#000'; }
  function paintBorderIcon() {
    const n = nodes.find(x => x.item?.id === 'border'); if (!n) return;
    const icon = BORDER_GRID.find(b => b[1] === st.border.kind)?.[0] || 'border-all';
    n.node._main.replaceChildren(ico(icon, 18));
  }
  function refreshToolbar() {
    const ui = st.ui;
    for (const {item, node} of nodes) {
      if (!item) continue;
      const on = enabled(item) || item.kind === 'menu' && !!st.shot;
      node.classList.toggle('is-disabled', !on);
      for (const b of node.querySelectorAll('button')) b.disabled = !on && !item.soon ? true : false;
      node.classList.toggle('is-on', !!(item.state && ui[item.state] === true));
      if (item.id === 'font-name' && node._value) node._value.textContent = ui.font || '默认字体';
      if (item.id === 'font-size' && node._value) node._value.textContent = ui.size || '10';
      if (item.id === 'numfmt' && node._value) node._value.textContent = numberFormatLabel(ui.numfmt);
      if (item.id === 'halign') node._main.replaceChildren(ico(HALIGN_ICON[ui.halign] || 'align-left', 18), ico('chevron', 10));
      if (item.id === 'valign') node._main.replaceChildren(ico(VALIGN_ICON[ui.valign] || 'valign-bottom', 18), ico('chevron', 10));
    }
    paintBars();
  }
  function layoutToolbar() {
    if (!strip.isConnected) return;
    for (const n of nodes) n.node.hidden = false;
    st.overflow = [];
    const prios = [3, 2, 1];
    for (const p of prios) {
      if (strip.scrollWidth <= strip.clientWidth + 1) break;
      const cands = nodes.filter(n => n.item && Number(n.node.dataset.prio) === p).reverse();
      for (const n of cands) { if (strip.scrollWidth <= strip.clientWidth + 1) break; n.node.hidden = true; st.overflow.unshift(n.item); }
    }
    // separators next to hidden runs
    nodes.forEach((n, i) => { if (n.sep) { const prev = nodes.slice(0, i).reverse().find(x => !x.sep), next = nodes.slice(i + 1).find(x => !x.sep); n.node.hidden = !prev || !next || prev.node.hidden || next.node.hidden; } });
  }
  function overflowItems() {
    if (!st.overflow.length) return [];
    const out = st.overflow.map(item => {
      if (item.kind === 'color') return {id: 'of-' + item.id, label: item.label, icon: item.icon, panel: 'color', ...pick(item)};
      if (item.kind === 'border') return {id: 'of-border', label: item.label, icon: item.icon, panel: 'border'};
      if (item.kind === 'numfmt') return {id: 'of-numfmt', label: item.label, icon: 'percent', panel: 'numfmt'};
      if (item.kind === 'select') return {...item, id: 'of-' + item.id, icon: 'text-fn', panel: 'options'};
      if (item.kind === 'split') return {id: 'of-' + item.id, label: item.label, icon: item.icon, menu: [{...item, kind: 'button', menu: undefined}, SEP, ...resolveMenu(item.menu)]};
      if (item.kind === 'menu') return {...item, id: 'of-' + item.id};
      return item;
    });
    return [...out, SEP];
  }
  const pick = item => ({command: item.command, argKey: item.argKey, none: item.none, initial: item.initial, id: item.id});

  function findPanel(anchor) {
    toggle(anchor, () => {
      const p = popAt(0, anchor.getBoundingClientRect(), 'sb-find');
      const input = el('input', 'sb-find-input'); input.placeholder = '查找内容'; input.maxLength = 200;
      const go = backward => { const t = input.value; if (!t) return; st.revealNext = true; uno('.uno:ExecuteSearch', {'SearchItem.SearchString': t, 'SearchItem.Backward': backward, 'SearchItem.Command': 0}); };
      const prev = el('button', 'sb-find-btn', '上一个'), next = el('button', 'sb-find-btn', '下一个'); prev.type = next.type = 'button';
      prev.addEventListener('click', () => go(true)); next.addEventListener('click', () => go(false));
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey); } });
      p.append(input, prev, next); p._place(); p.style.left = Math.max(4, anchor.getBoundingClientRect().right - p.offsetWidth) + 'px'; input.focus();
    });
  }

  /* ---------------------------------------------------------------- headers */
  function geometry() {
    const g = st.shot?.sheet?.geometry; if (!g) return null;
    const key = [g.columns?.sizes, g.columns?.hidden, g.columns?.filtered, g.rows?.sizes, g.rows?.hidden, g.rows?.filtered].join('|');
    if (key !== st.geo.key) st.geo = {key, cols: axisRuns(g.columns, MAX_COL), rows: axisRuns(g.rows, MAX_ROW)};
    return st.geo;
  }
  function selectionBox() {
    const a = parseAddress(st.shot?.sheet?.address);
    if (a) return a;
    const c = parseCellCursor(st.shot?.sheet?.cursor);
    return c && c.col !== null ? {c1: c.col, c2: c.col, r1: c.row, r2: c.row} : null;
  }
  function drawHeaders() {
    const l = st.shot?.layout, g = geometry();
    const dpr = Math.min(4, window.devicePixelRatio || 1);
    if (!l || !g?.cols || !g?.rows) return;
    const kx = l.cssWidth / l.tileWidth, ky = l.cssHeight / l.tileHeight;
    st.colSpans = visibleSpans(g.cols, l.x, l.tileWidth).map(s => ({...s, a: l.cssLeft + (s.start - l.x) * kx, b: l.cssLeft + (s.start + s.size - l.x) * kx}));
    st.rowSpans = visibleSpans(g.rows, l.y, l.tileHeight).map(s => ({...s, a: l.cssTop + (s.start - l.y) * ky, b: l.cssTop + (s.start + s.size - l.y) * ky}));
    const lastRow = st.rowSpans.length ? st.rowSpans[st.rowSpans.length - 1].index + 1 : 1;
    const w = Math.max(MIN_ROWHEAD, String(lastRow).length * 8 + 18);
    if (w !== st.rowHeadW) { st.rowHeadW = w; frame.style.setProperty('--sb-rowhead', w + 'px'); }
    const sel = selectionBox();
    const fullCols = sel && sel.r1 === 0 && sel.r2 >= MAX_ROW - 1, fullRows = sel && sel.c1 === 0 && sel.c2 >= MAX_COL - 1;
    paintHead(colHead, st.colSpans, 'x', dpr, s => sel && s.index >= sel.c1 && s.index <= sel.c2, fullCols, s => colName(s.index));
    paintHead(rowHead, st.rowSpans, 'y', dpr, s => sel && s.index >= sel.r1 && s.index <= sel.r2, fullRows, s => String(s.index + 1));
  }
  function paintHead(canvas, spans, axis, dpr, isSel, full, label) {
    const W = Math.max(1, canvas.clientWidth), H = Math.max(1, canvas.clientHeight);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#f8f9fa'; c.fillRect(0, 0, W, H);
    c.font = '12px -apple-system,"PingFang SC",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const s of spans) {
      const a = s.a, b = s.b, on = isSel(s);
      if (on) { c.fillStyle = full ? '#d2e3fc' : '#e8f0fe'; axis === 'x' ? c.fillRect(a, 0, b - a, H) : c.fillRect(0, a, W, b - a); }
      c.fillStyle = on ? '#1a73e8' : '#5f6368';
      if (b - a > 10) axis === 'x' ? c.fillText(label(s), (a + b) / 2, H / 2 + 0.5) : c.fillText(label(s), W / 2, (a + b) / 2 + 0.5);
      c.fillStyle = '#dadce0'; axis === 'x' ? c.fillRect(Math.round(b) - 0.5, 0, 1, H) : c.fillRect(0, Math.round(b) - 0.5, W, 1);
      if (on) { c.fillStyle = '#1a73e8'; axis === 'x' ? c.fillRect(a, H - 2, b - a, 2) : c.fillRect(W - 2, a, 2, b - a); }
    }
    c.fillStyle = '#dadce0'; axis === 'x' ? c.fillRect(0, H - 1, W, 1) : c.fillRect(W - 1, 0, 1, H);
  }
  function hitHeader(axis, e) {
    const r = (axis === 'x' ? colHead : rowHead).getBoundingClientRect(), v = axis === 'x' ? e.clientX - r.left : e.clientY - r.top;
    const spans = axis === 'x' ? st.colSpans : st.rowSpans;
    for (const s of spans) if (Math.abs(v - s.b) <= 4 && s.b - s.a > 6) return {edge: s, v};
    const s = spans.find(x => v >= x.a && v < x.b); return {span: s, v};
  }
  function wireHeader(axis) {
    const canvas = axis === 'x' ? colHead : rowHead;
    let drag = null;
    canvas.addEventListener('pointermove', e => {
      if (drag?.resize) {
        const r = canvas.getBoundingClientRect(), v = axis === 'x' ? e.clientX - r.left : e.clientY - r.top;
        drag.to = Math.max(drag.edge.a + 2, v); placeGuide(axis, drag.to); return;
      }
      if (drag?.select) { const h = hitHeader(axis, e); if (h.span && h.span.index !== drag.last) { drag.last = h.span.index; selectAxis(axis, drag.anchor, h.span.index); } return; }
      const h = hitHeader(axis, e); canvas.style.cursor = h.edge ? (axis === 'x' ? 'col-resize' : 'row-resize') : (axis === 'x' ? 's-resize' : 'e-resize');
    });
    canvas.addEventListener('pointerdown', e => {
      if (!st.shot || e.button !== 0) return;
      const h = hitHeader(axis, e); canvas.setPointerCapture?.(e.pointerId); e.preventDefault();
      if (h.edge) { drag = {resize: true, edge: h.edge, to: h.edge.b}; placeGuide(axis, h.edge.b); return; }
      if (!h.span) return;
      const anchor = e.shiftKey && st.anchor?.axis === axis ? st.anchor.index : h.span.index;
      if (!e.shiftKey) st.anchor = {axis, index: h.span.index};
      drag = {select: true, anchor, last: h.span.index};
      selectAxis(axis, anchor, h.span.index);
    });
    const end = () => {
      const l = st.shot?.layout;
      if (drag?.resize && l) {
        guide.hidden = true;
        const k = axis === 'x' ? l.cssWidth / l.tileWidth : l.cssHeight / l.tileHeight;
        const size = Math.round((drag.to - drag.edge.a) / k);
        if (Math.abs(drag.to - drag.edge.b) >= 1) perform('sheet_size', {axis: axis === 'x' ? 'column' : 'row', index: drag.edge.index, size: Math.max(30, Math.min(30000, size))});
      }
      drag = null; focusGrid();
    };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', () => { guide.hidden = true; drag = null; });
  }
  function placeGuide(axis, v) {
    guide.hidden = false; guide.classList.toggle('is-row', axis === 'y');
    if (axis === 'x') { guide.style.left = (st.rowHeadW + v) + 'px'; guide.style.top = '0'; } else { guide.style.top = (HEAD_H + v) + 'px'; guide.style.left = '0'; }
  }
  let selecting = Promise.resolve();
  function selectAxis(axis, a, b) {
    const ref = axis === 'x' ? columnRange(a, b) : rowRange(a, b);
    selecting = selecting.then(() => perform('sheet_goto', {ref})).catch(() => {});
  }
  corner.addEventListener('click', () => { perform('sheet_goto', {ref: 'A1:' + colName(MAX_COL - 1) + MAX_ROW}); focusGrid(); });

  /* ---------------------------------------------------------------- formula bar */
  nameBox.addEventListener('focus', () => nameBox.select());
  nameBox.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const ref = normalizeRef(nameBox.value); if (!ref) { say('请输入有效的单元格地址，例如 B3、A1:C10、C:C 或 3:5'); return; } st.revealNext = true; perform('sheet_goto', {ref}); focusGrid(); }
    else if (e.key === 'Escape') { nameBox.value = st.shot?.sheet?.address || 'A1'; focusGrid(); }
  });
  nameBox.addEventListener('blur', () => { nameBox.value = st.shot?.sheet?.address || nameBox.value; });
  let formulaDirty = false;
  formula.addEventListener('input', () => { formulaDirty = true; });
  formula.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const text = formula.value;
      if (!formulaAllowed(text)) { say('公式包含不允许的函数或外部引用（如 WEBSERVICE、INDIRECT、外部文件链接）'); return; }
      formulaDirty = false; st.revealNext = true;
      perform('cell_input', {text, move: e.key === 'Tab' ? (e.shiftKey ? 'left' : 'right') : (e.shiftKey ? 'up' : 'down')}).then(focusGrid);
    } else if (e.key === 'Escape') { formulaDirty = false; formula.value = st.shot?.sheet?.formula || ''; focusGrid(); }
  });
  formula.addEventListener('blur', () => { if (!formulaDirty) formula.value = st.shot?.sheet?.formula || ''; });

  /* ---------------------------------------------------------------- keyboard + IME */
  const canvas = $('#document');
  function focusGrid() { if (document.activeElement !== ime) ime.focus({preventScroll: true}); }
  canvas.addEventListener('focus', () => setTimeout(focusGrid, 0));
  function typeText(text) {
    st.typed += text;
    if (st.typedTimer) return;
    st.typedTimer = setTimeout(() => {
      const all = st.typed; st.typed = ''; st.typedTimer = 0;
      for (let i = 0; i < all.length; i += 200) perform('sheet_text', {text: all.slice(i, i + 200)});
    }, 0);
  }
  function selectAll() { perform('sheet_goto', {ref: 'A1:' + colName(MAX_COL - 1) + MAX_ROW}); }
  ime.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && !e.altKey) {
      if (k === 'z') { e.preventDefault(); perform('command', {command: e.shiftKey ? '.uno:Redo' : '.uno:Undo'}); return; }
      if (k === 'y') { e.preventDefault(); perform('command', {command: '.uno:Redo'}); return; }
      if (k === 'b' || k === 'i' || k === 'u') { e.preventDefault(); perform('command', {command: {b: '.uno:Bold', i: '.uno:Italic', u: '.uno:Underline'}[k]}); return; }
      if (k === 'a') { e.preventDefault(); selectAll(); return; }
      if (k === 'f') { e.preventDefault(); findPanel(tools.firstChild); return; }
      if (['c', 'x', 'v', 's', '=', '-', '+', '0'].includes(k)) return; // clipboard events / shell / zoom handlers
    }
    const nav = sheetKeyEvent(e);
    if (nav) { e.preventDefault(); flushTypedNow(); st.revealNext = true; perform('sheet_key', nav); return; }
    const ch = sheetTypedChar(e);
    if (ch) { e.preventDefault(); typeText(ch); }
  });
  function flushTypedNow() { if (st.typedTimer) { clearTimeout(st.typedTimer); const all = st.typed; st.typed = ''; st.typedTimer = 0; for (let i = 0; i < all.length; i += 200) perform('sheet_text', {text: all.slice(i, i + 200)}); } }
  ime.addEventListener('compositionend', e => { const t = e.data || ime.value; ime.value = ''; if (t) typeText(t); });
  ime.addEventListener('input', e => { if (!e.isComposing && ime.value && !e.inputType?.startsWith('insertComposition')) { const t = ime.value; ime.value = ''; typeText(t); } });
  ime.addEventListener('copy', e => { const t = st.shot?.selection || ''; e.preventDefault(); e.clipboardData?.setData('text/plain', t); st.lastCopy = t; uno('.uno:Copy'); });
  ime.addEventListener('cut', e => { const t = st.shot?.selection || ''; e.preventDefault(); e.clipboardData?.setData('text/plain', t); st.lastCopy = t; uno('.uno:Cut'); });
  ime.addEventListener('paste', e => { e.preventDefault(); pasteText(e.clipboardData?.getData('text/plain') || ''); });
  function pasteText(text) {
    if (!text || text === st.lastCopy) { uno('.uno:Paste'); return; }
    if (text.length > 4000) { say('粘贴内容超过4000字，请分批粘贴'); return; }
    perform('paste', {text: text.replace(/\r\n/g, '\n').replace(/\n$/, '')});
  }
  async function clipboardCopy(cut) {
    const t = st.shot?.selection || ''; st.lastCopy = t;
    try { await navigator.clipboard?.writeText(t); } catch {}
    uno(cut ? '.uno:Cut' : '.uno:Copy');
  }
  async function clipboardPaste() {
    let t = '';
    try { t = await navigator.clipboard?.readText?.() || ''; } catch {}
    pasteText(t);
  }
  // Save: commit an in-cell edit first so the saved file contains it.
  const commitEdit = () => { if (st.shot?.sheet?.editing) { flushTypedNow(); perform('sheet_key', {key: 'Enter'}); } };
  $('#wb-btn-save')?.addEventListener('click', commitEdit, true);
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') commitEdit(); }, true);

  /* ---------------------------------------------------------------- context menu */
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 2) return;
    // Right-click inside the current selection keeps it (office.js would otherwise move the cursor).
    const p = host.view?.point(e), sel = selectionBox(), g = geometry();
    if (!p || !sel || !g) return;
    const x0 = spanStart(g.cols, sel.c1), x1 = spanStart(g.cols, sel.c2 + 1), y0 = spanStart(g.rows, sel.r1), y1 = spanStart(g.rows, sel.r2 + 1);
    if (p.x >= x0 && p.x < x1 && p.y >= y0 && p.y < y1) e.stopImmediatePropagation();
  }, true);
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault(); if (!st.shot) return;
    const r = {left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY};
    const items = [
      {id: 'ctx-cut', label: '剪切', icon: 'cut', hint: '⌘X', do: {ui: 'cut'}}, {id: 'ctx-copy', label: '复制', icon: 'copy', hint: '⌘C', do: {ui: 'copy'}},
      {id: 'ctx-paste', label: '粘贴', icon: 'paste', hint: '⌘V', do: {ui: 'paste'}},
      SEP, ...ROWCOL_MENU.slice(0, 5), SEP, ...DELETE_MENU.slice(0, 2), SEP,
      {id: 'ctx-clear', label: '清除内容', icon: 'clear', hint: 'Delete', do: {op: 'sheet_key', key: 'Delete'}},
      {id: 'ctx-clear-format', label: '清除格式', icon: 'eraser', do: {uno: '.uno:ResetAttributes'}},
      {id: 'ctx-numfmt', label: '设置单元格格式', icon: 'percent', panel: 'numfmt'},
      SEP, {id: 'ctx-ai', label: 'AI 编辑', icon: 'edit', do: {ui: 'ai'}},
    ];
    openMenu(items, r, 0, 'below');
  });
  function ctxUi(name) {
    if (name === 'cut') clipboardCopy(true); else if (name === 'copy') clipboardCopy(false); else if (name === 'paste') clipboardPaste(); else if (name === 'ai') openAI();
    focusGrid();
  }
  function openAI() { $('#selection-ai')?.click(); }
  aiBtn.addEventListener('click', openAI);

  /* ---------------------------------------------------------------- sheet tabs */
  function renderTabs() {
    const s = st.shot; if (!s) return;
    const names = s.parts || [], tabs = s.sheet?.tabs || [], key = JSON.stringify([names, s.part, tabs.map(t => t.visible), [...st.tabColors]]);
    if (key === st.tabsKey) return; st.tabsKey = key;
    tabScroll.replaceChildren(...names.map((name, i) => {
      if (tabs[i] && tabs[i].visible === false) return el('span', 'sb-tab-hidden');
      const t = el('div', 'sb-tab' + (i === s.part ? ' is-active' : '')); t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', String(i === s.part));
      const label = el('button', 'sb-tab-name', name || '工作表' + (i + 1)); label.type = 'button';
      const arrow = el('button', 'sb-tab-arrow'); arrow.type = 'button'; arrow.title = '工作表操作'; arrow.dataset.open = '1'; arrow.append(ico('chevron', 10));
      const color = st.tabColors.get(name); if (color) { const u = el('i', 'sb-tab-color'); u.style.background = color; t.append(u); }
      label.addEventListener('click', () => { if (i !== s.part) perform('part', {part: i}).then(focusGrid); });
      label.addEventListener('dblclick', () => renameTab(t, i, name));
      arrow.addEventListener('click', () => toggle(arrow, () => tabMenu(arrow, i, name)));
      t.append(label, arrow); return t;
    }));
    requestAnimationFrame(() => { tabScroll.querySelector('.is-active')?.scrollIntoView({block: 'nearest', inline: 'nearest'}); syncTabNav(); });
  }
  function syncTabNav() { const over = tabScroll.scrollWidth > tabScroll.clientWidth + 1; tabPrev.hidden = tabNext.hidden = !over; }
  tabPrev.addEventListener('click', () => { tabScroll.scrollBy({left: -160, behavior: 'smooth'}); });
  tabNext.addEventListener('click', () => { tabScroll.scrollBy({left: 160, behavior: 'smooth'}); });
  window.addEventListener('resize', syncTabNav);
  addTab.addEventListener('click', () => { const names = st.shot?.parts || []; perform('sheet_tab', {action: 'insert', index: names.length, name: nextSheetName(names)}); });
  listTab.dataset.open = '1';
  listTab.addEventListener('click', () => toggle(listTab, () => {
    const names = st.shot?.parts || [];
    openMenu(names.map((n, i) => ({id: 'sheet-' + i, label: n || '工作表' + (i + 1), icon: null, checkedNow: i === st.shot?.part, do: {ui: 'part', part: i}})), listTab.getBoundingClientRect(), 0, 'above');
  }));
  function confirmSheetDelete(i, name) {
    $('#wb-sheet-approval')?.remove();
    const row = el('div', 'sb-approval'); row.id = 'wb-sheet-approval';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', '删除工作表确认');
    const names = JSON.stringify(st.shot?.parts);
    const deny = el('button', '', '拒绝'), allow = el('button', '', '确认');
    const settle = async accepted => {
      if (allow.disabled) return;
      const current = names === JSON.stringify(st.shot?.parts);
      for (const button of [deny, allow]) button.disabled = true;
      row.textContent = accepted && current ? '✓ 已确认' : accepted ? '✕ 工作表已变化，请重新确认' : '✕ 已拒绝';
      if (accepted && current) await perform('sheet_tab', {action: 'delete', index: i});
    };
    deny.type = allow.type = 'button';
    deny.onclick = () => settle(false);
    allow.onclick = () => settle(true);
    row.append(el('span', '', 'QuankSight 需要你的授权：删除工作表「' + name + '」'), deny, allow);
    fbar.after(row);
    deny.focus();
  }
  function tabMenu(anchor, i, name) {
    const names = st.shot?.parts || [], n = names.length;
    const items = [
      {id: 'tab-insert', label: '插入工作表', icon: 'plus', act: () => perform('sheet_tab', {action: 'insert', index: i + 1, name: nextSheetName(names)})},
      {id: 'tab-rename', label: '重命名', icon: 'text-box', act: () => renameTab(anchor.closest('.sb-tab'), i, name)},
      {id: 'tab-copy', label: '创建副本', icon: 'copy', act: () => perform('sheet_tab', {action: 'copy', index: i, to: i + 1})},
      {id: 'tab-delete', label: '删除', icon: 'trash', disabled: n <= 1, act: () => confirmSheetDelete(i, name)},
      SEP,
      {id: 'tab-left', label: '左移', icon: null, disabled: i === 0, act: () => perform('sheet_tab', {action: 'move', index: i, to: i - 1})},
      {id: 'tab-right', label: '右移', icon: null, disabled: i >= n - 1, act: () => perform('sheet_tab', {action: 'move', index: i, to: i + 2})},
      SEP,
      {id: 'tab-color', label: '标签颜色', icon: 'palette', color: true},
    ];
    const p = popAt(0, anchor.getBoundingClientRect(), 'sb-menu', 'above');
    for (const it of items) {
      if (it === SEP) { p.append(el('hr')); continue; }
      const b = el('button', 'sb-item' + (it.disabled ? ' is-disabled' : '')); b.type = 'button';
      b.append(el('span', 'sb-check'), it.icon ? ico(it.icon, 16) : el('span', 'sb-ico sb-ico-empty'), el('span', 'sb-label', it.label));
      if (it.color) {
        b.append(el('span', 'sb-sub', '›'));
        b.addEventListener('pointerenter', () => colorPanel({id: 'tab-color', none: true}, b.getBoundingClientRect(), 1, 'right', (_x, c) => {
          perform('sheet_tab', {action: 'color', index: i, color: c === 'none' ? 'none' : c}).then(() => { if (c === 'none') st.tabColors.delete(name); else st.tabColors.set(name, c); st.tabsKey = ''; renderTabs(); });
        }));
      } else {
        b.addEventListener('pointerenter', () => closeAll(1));
        b.addEventListener('click', () => { if (it.disabled) return; closeAll(); it.act(); });
      }
      p.append(b);
    }
    p._place();
  }
  function renameTab(tab, i, name) {
    if (!tab) return;
    const input = el('input', 'sb-tab-input'); input.value = name; input.maxLength = 31;
    const label = tab.querySelector('.sb-tab-name'); label.hidden = true; tab.prepend(input); input.select(); input.focus();
    let done = false;
    const finish = ok => {
      if (done) return; done = true;
      const v = input.value.trim(); input.remove(); label.hidden = false;
      if (!ok || !v || v === name) return;
      const others = (st.shot?.parts || []).filter((_, j) => j !== i);
      if (!sheetNameValid(v, others)) { say('工作表名称无效或重复（1-31字，不能含 []*?:/\\）'); return; }
      const color = st.tabColors.get(name);
      perform('sheet_tab', {action: 'rename', index: i, name: v}).then(() => { if (color) { st.tabColors.delete(name); st.tabColors.set(v, color); } });
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); e.stopPropagation(); });
    input.addEventListener('blur', () => finish(true));
  }

  /* ---------------------------------------------------------------- per-shot sync */
  function onShot(s) {
    if (!s || host.info?.()?.format !== 'xlsx') return;
    st.shot = s; st.ui = mapSheetStates(s.states);
    const sh = s.sheet || {};
    if (document.activeElement !== nameBox) nameBox.value = sh.address || nameBox.value || 'A1';
    if (document.activeElement !== formula || !formulaDirty) { formula.value = sh.formula || ''; formulaDirty = false; }
    editBadge.hidden = !sh.editing;
    refreshToolbar(); drawHeaders(); renderTabs(); placeFloat(); updateStats();
    if (st.revealNext) {
      st.revealNext = false;
      const c = parseCellCursor(sh.cursor);
      if (c) host.view?.reveal?.(c);
    }
  }
  function placeFloat() {
    const s = st.shot, l = s?.layout, c = parseCellCursor(s?.sheet?.cursor);
    const ok = l && c && !s.sheet?.editing && !pops.length;
    if (!ok) { aiBtn.hidden = true; } else {
      const kx = l.cssWidth / l.tileWidth, ky = l.cssHeight / l.tileHeight;
      const x = l.cssLeft + (c.x - l.x) * kx, y = l.cssTop + (c.y + c.height - l.y) * ky;
      const inside = x >= 0 && y >= 0 && x < l.cssWidth - 40 && y < l.cssHeight - 30;
      aiBtn.hidden = !inside;
      aiBtn.style.left = (st.rowHeadW + x + 4) + 'px'; aiBtn.style.top = (HEAD_H + y + 6) + 'px';
    }
    if (l && c) {
      const kx = l.cssWidth / l.tileWidth, ky = l.cssHeight / l.tileHeight;
      ime.style.left = (st.rowHeadW + l.cssLeft + (c.x - l.x) * kx) + 'px'; ime.style.top = (HEAD_H + l.cssTop + (c.y - l.y) * ky) + 'px';
      ime.style.height = Math.max(16, c.height * ky) + 'px';
    }
  }
  function updateStats() {
    const s = st.shot, a = parseAddress(s?.sheet?.address);
    const multi = a && (a.c1 !== a.c2 || a.r1 !== a.r2);
    let r = multi ? selectionStats(s.selection || '') : null;
    if (multi && (s.selection || '').length >= 11990) { const t = parseStateTableCell(s.states?.['.uno:StateTableCell']); r = {sum: t.sum, average: t.average, count: t.count}; }
    if (!r || (!r.count && r.sum === undefined)) { stats.replaceChildren(); return; }
    const parts = [];
    if (Number.isFinite(r.sum) && r.numeric !== 0) parts.push(['求和', formatStat(r.sum)]);
    if (Number.isFinite(r.average)) parts.push(['平均值', formatStat(r.average)]);
    if (Number.isFinite(r.count)) parts.push(['计数', String(r.count)]);
    stats.replaceChildren(...parts.map(([k, v]) => { const x = el('span', 'sb-stat'); x.append(el('span', 'sb-stat-k', k + '：'), el('b', '', v)); return x; }));
  }

  wireHeader('x'); wireHeader('y');
  renderToolbar();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { layoutToolbar(); drawHeaders(); syncTabNav(); }).observe(card);
  bus.on('office:shot', onShot);
  if (host.shot?.()) onShot(host.shot());
  setTimeout(focusGrid, 0);
  return {state: st, onShot, drawHeaders, layoutToolbar};
}

/* ---------------------------------------------------------------- boot */
if (typeof window !== 'undefined' && window.willbuddyOffice) {
  let mounted = false;
  const tryMount = () => {
    const host = window.wbOfficeHost;
    if (mounted || !host || host.info?.()?.format !== 'xlsx') return;
    mounted = true; document.body.setAttribute('data-format', 'xlsx');
    window.wbSheet = mountSheet({host, api: window.willbuddyOffice});
  };
  const start = () => { tryMount(); bus.on('office:shot', tryMount); };
  if (window.wbOfficeHost) start(); else window.addEventListener('wb-office-host', start, {once: true});
}
