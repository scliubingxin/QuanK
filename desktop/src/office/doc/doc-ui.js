// [docx] Word editor UI: single-row toolbar (Tencent Docs / WPS style), menus 插入/页面/引用/视图, style/font/字号 pickers,
// direct typing with IME, clipboard, context menu, outline panel, page/word status. Talks only through window.wbOfficeHost.
import {bus} from '../bus.js';
import {shapeGlyph} from '../sheet/sheet-icons.js';
import {SHAPES, SOON} from '../sheet/sheet-config.js';
import {sheetKeyEvent, sheetTypedChar} from '../../shared/office-sheet.js';
import {historyCommandAvailable} from '../../shared/office-history.js';
import {parsePageState, parseWordCount, parsePageRects, pageAt, validateBookmarkName, validateComment, SYMBOLS} from '../../shared/office-doc.js';
import {TOOLBAR, MAIN_MENU, ALIGN_ICON, mapDocStates} from './doc-config.js';
import {SEP, el, ico, createPopups, formPopup} from './popkit.js';

const $ = s => document.querySelector(s);

export function mountDoc({host, api}) {
  const st = {shot: null, ui: mapDocStates({}), colors: {'font-color': '#E53935', highlight: '#FFEB3B'}, recent: [], outline: false, outlineItems: [], outlineRev: -1,
    typed: '', typedTimer: 0, lastCopy: '', revealNext: false, collapsed: false, overflow: []};
  const say = text => { const s = $('#action-status'); if (s) { s.textContent = ''; s.textContent = text; } };
  const perform = (op, p = {}) => host.perform(op, p);
  const uno = (command, args) => perform('uno', args ? {command, args} : {command});

  /* ------------------------------------------------------------ DOM */
  document.body.classList.add('wb-doc');
  const card = $('#wb-ribbon-card');
  const bar = el('div', 'sb-bar'); bar.id = 'wb-docbar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', '文档工具栏');
  const strip = el('div', 'sb-strip'), tools = el('div', 'sb-tools'); bar.append(strip, tools); card.prepend(bar);
  const main = $('#wb-main');
  const outline = el('aside', 'dc-outline'); outline.id = 'wb-doc-outline'; outline.hidden = true; outline.setAttribute('aria-label', '大纲');
  const outlineHead = el('div', 'dc-outline-head'); outlineHead.append(el('b', '', '大纲'));
  const outlineClose = el('button', 'sb-btn'); outlineClose.type = 'button'; outlineClose.title = '关闭大纲'; outlineClose.append(ico('close', 16)); outlineHead.append(outlineClose);
  const outlineList = el('div', 'dc-outline-list'); outline.append(outlineHead, outlineList); main.prepend(outline);
  const outlineTab = el('button', 'dc-outline-tab', '大纲'); outlineTab.type = 'button'; outlineTab.title = '显示大纲'; $('#wb-stage').append(outlineTab);
  const status = $('#wb-statusbar');
  const left = el('div', 'dc-status-left');
  const olBtn = el('button', 'sb-btn'); olBtn.type = 'button'; olBtn.title = '大纲'; olBtn.append(ico('text-to-cols', 18));
  const pageLbl = el('span', 'dc-page', '第 1 页 / 共 1 页'), wordLbl = el('span', 'dc-words', '');
  left.append(olBtn, pageLbl, wordLbl); status.prepend(left);
  const ime = el('textarea', 'sb-ime dc-ime'); ime.setAttribute('aria-label', '文档输入'); ime.autocapitalize = 'off'; ime.spellcheck = false; $('#wb-stage').append(ime);

  /* ------------------------------------------------------------ popups */
  const enabled = item => {
    if (item.soon || item.enabled === false) return false;
    if (item.when === 'undo') return historyCommandAvailable(st.shot?.history, '.uno:Undo');
    if (item.when === 'redo') return historyCommandAvailable(st.shot?.history, '.uno:Redo');
    return !!st.shot;
  };
  const checked = item => {
    if (item.check) { const [k, v] = item.check; return (k === 'outline' ? st.outline : st.ui[k]) === v; }
    return item.state ? st.ui[item.state] === true : false;
  };
  const pk = createPopups({enabled, checked, run: item => run(item), resolve: m => (typeof m === 'function' ? m() : m) || [], panel: (t, item, r, level, side) => openPanel(t, item, r, level, side)});

  function openPanel(type, item, rect, level = 0, side = 'below') {
    if (type === 'shapes') {
      const p = pk.popAt(level, rect, 'sb-shapes', side);
      for (const g of SHAPES) {
        p.append(el('div', 'sb-shape-title', g.group)); const grid = el('div', 'sb-shape-grid');
        for (const [glyph, command, label] of g.items) { const b = el('button', 'sb-shape'); b.type = 'button'; b.title = label; b.innerHTML = shapeGlyph(glyph); b.addEventListener('click', () => { pk.closeAll(); uno(command); say('在文档中拖动鼠标绘制' + label); }); grid.append(b); }
        p.append(grid);
      }
      p._place(); return p;
    }
    if (type === 'table') {
      const p = pk.popAt(level, rect, 'wb-pop wb-tablegrid dc-tablegrid', side);
      const label = el('div', 'wb-grid-label', '插入表格'), grid = el('div', 'wb-grid'), cells = [];
      for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) {
        const b = el('button', 'wb-cell'); b.type = 'button'; b.dataset.r = r; b.dataset.c = c;
        b.addEventListener('pointerenter', () => { label.textContent = c + ' × ' + r + ' 表格'; for (const x of cells) x.classList.toggle('on', +x.dataset.r <= r && +x.dataset.c <= c); });
        b.addEventListener('click', () => { pk.closeAll(); uno('.uno:InsertTable', {Columns: c, Rows: r}); });
        cells.push(b); grid.append(b);
      }
      p.append(label, grid); p._place(); return p;
    }
    if (type === 'symbols') {
      const p = pk.popAt(level, rect, 'dc-symbols', side); const grid = el('div', 'dc-symbol-grid');
      for (const ch of SYMBOLS) { const b = el('button', 'dc-symbol', ch); b.type = 'button'; b.addEventListener('click', () => { pk.closeAll(); focusDoc(); perform('sheet_text', {text: ch}); }); grid.append(b); }
      p.append(grid); p._place(); return p;
    }
    if (type === 'color') return colorFor(item, rect, level, side);
  }
  const colorFor = (item, rect, level, side) => pk.colorPanel(item, rect, level, side, c => { if (c !== 'none' && c !== 'auto') { st.colors[item.id] = c; paintBars(); } applyColor(item, c); }, st.recent);
  function applyColor(item, c) { uno(item.command, {[item.argKey]: c === 'none' || c === 'auto' ? -1 : parseInt(c.slice(1), 16)}); }

  /* ------------------------------------------------------------ actions */
  function run(item) {
    if (item.soon) { say(item.label + '：' + SOON); return; }
    const d = item.do; if (!d) return;
    if (d.uno) return uno(d.uno, d.args);
    if (d.legacy) return perform('command', {command: d.legacy});
    if (d.op) { const {op, ...rest} = d; return perform(op, rest); }
    const ui = d.ui;
    if (ui === 'pickImage') return host.serial(async () => { const r = await api.invoke('pickImage'); if (r?.status === 'cancelled') return; host.status(r); await host.draw(); });
    if (ui === 'zoom') return bus.emit('zoom:set', {percent: d.percent});
    if (ui === 'outline') return setOutline(!st.outline);
    if (ui === 'fullscreen') return document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.().catch(() => say('当前窗口不支持全屏'));
    if (ui === 'layout') { if (st.ui.web !== d.web) return uno('.uno:BrowseView'); return; }
    if (ui === 'bookmark') return dialog('插入书签', [{key: 'name', label: '书签名称', max: 60, placeholder: '例如 第一章'}], v => uno('.uno:InsertBookmark', {Bookmark: validateBookmarkName(v.name)}));
    if (ui === 'comment') return dialog('插入批注', [{key: 'text', label: '批注内容', type: 'textarea', max: 2000}], v => uno('.uno:InsertAnnotation', {Text: validateComment(v.text)}));
    if (ui === 'paragraph') return paragraphPanel();
    if (['cut', 'copy', 'paste', 'ai'].includes(ui)) return ctxUi(ui);
  }
  const anchorRect = () => { const r = bar.getBoundingClientRect(); const x = r.left + r.width / 2 - 160; return {left: x, right: x, top: r.bottom, bottom: r.bottom + 4}; };
  function dialog(title, fields, submit) {
    formPopup(pk, anchorRect(), title, fields, v => { try { const r = submit(v); r?.catch?.(e => say(String(e.message || e))); } catch (e) { say(String(e.message || e)); } focusDoc(); });
  }
  function paragraphPanel() {
    const p = pk.popAt(0, anchorRect(), 'sb-dialog dc-form dc-para');
    p.append(el('div', 'sb-dialog-title', '段落'));
    const row = (label, buttons) => { const r = el('div', 'dc-form-row'); r.append(el('span', 'dc-form-label', label)); const g = el('div', 'dc-seg'); for (const [text, cmd, on] of buttons) { const b = el('button', 'dc-seg-btn' + (on ? ' is-on' : ''), text); b.type = 'button'; b.addEventListener('click', () => { uno(cmd); for (const x of g.children) x.classList.toggle('is-on', x === b && !/增加|减少/.test(text)); }); g.append(b); } r.append(g); p.append(r); };
    const u = st.ui;
    row('对齐方式', [['左对齐', '.uno:LeftPara', u.align === 'left'], ['居中', '.uno:CenterPara', u.align === 'center'], ['右对齐', '.uno:RightPara', u.align === 'right'], ['两端对齐', '.uno:JustifyPara', u.align === 'justify']]);
    row('缩进', [['减少缩进', '.uno:DecrementIndent'], ['增加缩进', '.uno:IncrementIndent']]);
    row('行距', [['1.0 倍', '.uno:SpacePara1', u.spacing === '1'], ['1.5 倍', '.uno:SpacePara15', u.spacing === '1.5'], ['2.0 倍', '.uno:SpacePara2', u.spacing === '2']]);
    row('段落间距', [['增加', '.uno:ParaspaceIncrease'], ['减少', '.uno:ParaspaceDecrease']]);
    p.append(el('div', 'dc-note', '精确的缩进/间距数值设置即将支持'));
    const ok = el('button', 'sb-dialog-ok', '完成'); ok.type = 'button'; ok.addEventListener('click', () => { pk.closeAll(); focusDoc(); }); p.append(ok);
    p._place();
  }

  /* ------------------------------------------------------------ toolbar */
  const nodes = [];
  function renderToolbar() {
    strip.replaceChildren(); nodes.length = 0;
    for (const item of TOOLBAR) {
      if (item === SEP) { const s = el('i', 'sb-sep'); strip.append(s); nodes.push({sep: true, node: s}); continue; }
      const node = renderTool(item); strip.append(node); nodes.push({item, node});
    }
    tools.replaceChildren();
    const find = el('button', 'sb-btn'); find.type = 'button'; find.title = '查找 (⌘F)'; find.dataset.open = '1'; find.append(ico('search', 18)); find.addEventListener('click', () => findPanel(find));
    const fold = el('button', 'sb-btn sb-fold'); fold.type = 'button'; fold.title = '收起工具栏'; fold.append(ico('chevron', 18));
    fold.addEventListener('click', () => { st.collapsed = !st.collapsed; document.body.classList.toggle('sb-collapsed', st.collapsed); });
    tools.append(find, fold); refreshToolbar(); requestAnimationFrame(layoutToolbar);
  }
  function renderTool(item) {
    const wrap = el('div', 'sb-tool sb-kind-' + item.kind); wrap.dataset.id = item.id; wrap.dataset.prio = String(item.prio ?? 1);
    const btn = (cls = '') => { const b = el('button', 'sb-btn ' + cls); b.type = 'button'; b.title = item.soon ? item.label + '（' + SOON + '）' : item.label; b.setAttribute('aria-label', item.label); return b; };
    if (item.kind === 'select') {
      const b = btn('sb-select'); b.dataset.open = '1'; b.style.width = item.width + 'px';
      const v = el('span', 'sb-selvalue', item.placeholder); b.append(v, ico('chevron', 10)); wrap._value = v;
      b.addEventListener('click', () => pk.toggle(b, () => selectMenu(item, b.getBoundingClientRect())));
      wrap.append(b); return wrap;
    }
    if (item.kind === 'color' || item.kind === 'split') {
      const mainB = btn('sb-main'); mainB.append(ico(item.icon, 18));
      if (item.kind === 'color') { const c = el('i', 'sb-colorbar'); c.dataset.bar = item.id; mainB.append(c); }
      const arrow = btn('sb-arrow'); arrow.dataset.open = '1'; arrow.title = item.label + '：更多选项'; arrow.append(ico('chevron', 10));
      mainB.addEventListener('click', () => item.kind === 'color' ? applyColor(item, st.colors[item.id] || item.initial) : run(item));
      arrow.addEventListener('click', () => pk.toggle(arrow, () => item.kind === 'color' ? colorFor(item, wrap.getBoundingClientRect(), 0, 'below') : pk.openMenu(item.menu, wrap.getBoundingClientRect(), 0)));
      wrap.append(mainB, arrow); wrap._main = mainB; return wrap;
    }
    if (item.kind === 'menu') {
      const b = btn('sb-dd'); b.dataset.open = '1'; b.append(ico(item.icon, 18));
      if (item.showLabel) b.append(el('span', 'sb-btnlabel', item.text || item.label));
      if (item.id !== 'more-text') b.append(ico('chevron', 10));
      b.addEventListener('click', () => pk.toggle(b, () => pk.openMenu(item.menu, b.getBoundingClientRect(), 0)));
      wrap.append(b); wrap._main = b; return wrap;
    }
    const b = btn(); b.append(ico(item.icon, 18)); if (item.showLabel) b.append(el('span', 'sb-btnlabel', item.label));
    b.addEventListener('click', () => run(item)); wrap.append(b); wrap._main = b; return wrap;
  }
  function selectMenu(item, rect) {
    if (item.menu) return pk.openMenu(item.menu, rect, 0);
    const p = pk.popAt(0, rect, 'sb-menu sb-options' + (item.id === 'font-name' ? ' dc-fonts' : ''));
    for (const o of item.options) {
      const label = typeof o === 'object' ? o.label : o, value = typeof o === 'object' ? o.pt : o;
      const cur = item.id === 'font-name' ? st.ui.font : st.ui.size;
      const b = el('button', 'sb-item'); b.type = 'button';
      b.append(el('span', 'sb-check', String(value) === String(cur) ? '✓' : ''), el('span', 'sb-label', label));
      if (item.id === 'font-name') b.querySelector('.sb-label').style.fontFamily = '"' + String(o).replace(/["\\]/g, '') + '"';
      b.addEventListener('click', () => { pk.closeAll(); item.id === 'font-name' ? uno('.uno:CharFontName', {'CharFontName.FamilyName': String(value)}) : uno('.uno:FontHeight', {'FontHeight.Height': Number(value)}); focusDoc(); });
      p.append(b);
    }
    p._place(); return p;
  }
  function paintBars() { for (const b of bar.querySelectorAll('[data-bar]')) b.style.background = st.colors[b.dataset.bar] || '#000'; }
  function refreshToolbar() {
    for (const {item, node} of nodes) {
      if (!item) continue;
      const on = enabled(item) || (item.kind === 'menu' && !!st.shot);
      node.classList.toggle('is-disabled', !on && !item.soon); node.classList.toggle('is-soon', !!item.soon);
      for (const b of node.querySelectorAll('button')) b.disabled = !on && !item.soon;
      node.classList.toggle('is-on', !!(item.state && st.ui[item.state] === true));
      if (node._value) node._value.textContent = st.ui[item.state] || item.placeholder;
      if (item.id === 'align') node._main.replaceChildren(ico(ALIGN_ICON[st.ui.align] || 'align-left', 18), ico('chevron', 10));
    }
    paintBars();
  }
  function layoutToolbar() {
    if (!strip.isConnected) return;
    for (const n of nodes) n.node.hidden = false;
    for (const p of [3, 2, 1]) {
      if (strip.scrollWidth <= strip.clientWidth + 1) break;
      for (const n of nodes.filter(x => x.item && Number(x.node.dataset.prio) === p).reverse()) { if (strip.scrollWidth <= strip.clientWidth + 1) break; n.node.hidden = true; }
    }
    nodes.forEach((n, i) => { if (n.sep) { const prev = nodes.slice(0, i).reverse().find(x => !x.sep), next = nodes.slice(i + 1).find(x => !x.sep); n.node.hidden = !prev || !next || prev.node.hidden || next.node.hidden; } });
  }
  function findPanel(anchor) {
    pk.toggle(anchor, () => {
      const p = pk.popAt(0, anchor.getBoundingClientRect(), 'sb-find');
      const input = el('input', 'sb-find-input'); input.placeholder = '查找内容'; input.maxLength = 200;
      const go = backward => { const t = input.value; if (!t) return; st.revealNext = true; uno('.uno:ExecuteSearch', {'SearchItem.SearchString': t, 'SearchItem.Backward': backward, 'SearchItem.Command': 0}); };
      const prev = el('button', 'sb-find-btn', '上一个'), next = el('button', 'sb-find-btn', '下一个'); prev.type = next.type = 'button';
      prev.addEventListener('click', () => go(true)); next.addEventListener('click', () => go(false));
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey); } e.stopPropagation(); });
      p.append(input, prev, next); p._place(); p.style.left = Math.max(4, anchor.getBoundingClientRect().right - p.offsetWidth) + 'px'; input.focus();
    });
  }

  /* ------------------------------------------------------------ outline */
  function setOutline(on) {
    st.outline = on; outline.hidden = !on; outlineTab.hidden = on; olBtn.classList.toggle('is-on', on);
    if (on) loadOutline(true);
    window.dispatchEvent(new Event('resize'));
  }
  async function loadOutline(force = false) {
    const rev = host.info?.()?.revision ?? 0;
    if (!st.outline || (!force && rev === st.outlineRev)) return;
    st.outlineRev = rev;
    try { st.outlineItems = (await api.invoke('docOutline'))?.items || []; } catch (e) { st.outlineItems = []; }
    outlineList.replaceChildren(...(st.outlineItems.length ? st.outlineItems.map(h => {
      const b = el('button', 'dc-outline-item dc-lv' + Math.min(h.level, 6), h.text); b.type = 'button'; b.title = h.text;
      b.addEventListener('click', () => gotoHeading(h)); return b;
    }) : [el('p', 'dc-outline-empty', '文档中没有标题。为段落设置「标题 1 / 标题 2」等样式后会显示在这里。')]));
  }
  async function gotoHeading(h) {
    await perform('sheet_key', {key: 'Home', control: true});
    for (let i = 0; i <= h.occurrence; i++) { st.revealNext = true; await uno('.uno:ExecuteSearch', {'SearchItem.SearchString': h.text.slice(0, 200), 'SearchItem.Backward': false, 'SearchItem.Command': 0}); }
    focusDoc();
  }
  outlineClose.addEventListener('click', () => setOutline(false));
  outlineTab.addEventListener('click', () => setOutline(true));
  olBtn.addEventListener('click', () => setOutline(!st.outline));

  /* ------------------------------------------------------------ keyboard, IME, clipboard */
  const canvas = $('#document');
  function focusDoc() { if (document.activeElement !== ime) ime.focus({preventScroll: true}); }
  canvas.addEventListener('focus', () => setTimeout(focusDoc, 0));
  function flushTyped() { if (!st.typed) return; const all = st.typed; st.typed = ''; clearTimeout(st.typedTimer); st.typedTimer = 0; for (let i = 0; i < all.length; i += 200) perform('sheet_text', {text: all.slice(i, i + 200)}); }
  function typeText(text) { st.typed += text; if (!st.typedTimer) st.typedTimer = setTimeout(flushTyped, 0); }
  ime.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && !e.altKey) {
      if (k === 'z') { e.preventDefault(); flushTyped(); perform('command', {command: e.shiftKey ? '.uno:Redo' : '.uno:Undo'}); return; }
      if (k === 'y') { e.preventDefault(); perform('command', {command: '.uno:Redo'}); return; }
      if (k === 'b' || k === 'i' || k === 'u') { e.preventDefault(); flushTyped(); perform('command', {command: {b: '.uno:Bold', i: '.uno:Italic', u: '.uno:Underline'}[k]}); return; }
      if (k === 'a') { e.preventDefault(); perform('command', {command: '.uno:SelectAll'}); return; }
      if (k === 'f') { e.preventDefault(); findPanel(tools.firstChild); return; }
      if (['c', 'x', 'v', 's', '=', '-', '+', '0'].includes(k)) return;
    }
    if (mod && e.altKey && k === 'm') { e.preventDefault(); run({do: {ui: 'comment'}}); return; }
    const nav = sheetKeyEvent(e);
    if (nav) { e.preventDefault(); flushTyped(); st.revealNext = true; perform('sheet_key', nav); return; }
    const ch = sheetTypedChar(e);
    if (ch) { e.preventDefault(); typeText(ch); }
  });
  ime.addEventListener('compositionend', e => { const t = e.data || ime.value; ime.value = ''; if (t) typeText(t); });
  ime.addEventListener('input', e => { if (!e.isComposing && ime.value && !e.inputType?.startsWith('insertComposition')) { const t = ime.value; ime.value = ''; typeText(t); } });
  ime.addEventListener('copy', e => { e.preventDefault(); const t = st.shot?.selection || ''; e.clipboardData?.setData('text/plain', t); st.lastCopy = t; uno('.uno:Copy'); });
  ime.addEventListener('cut', e => { e.preventDefault(); const t = st.shot?.selection || ''; e.clipboardData?.setData('text/plain', t); st.lastCopy = t; uno('.uno:Cut'); });
  ime.addEventListener('paste', e => { e.preventDefault(); pasteText(e.clipboardData?.getData('text/plain') || ''); });
  function pasteText(text) {
    if (!text || text === st.lastCopy) { uno('.uno:Paste'); return; }
    if (text.length > 4000) { say('粘贴内容超过4000字，请分批粘贴'); return; }
    perform('paste', {text: text.replace(/\r\n/g, '\n')});
  }
  async function ctxUi(name) {
    const t = st.shot?.selection || '';
    if (name === 'copy' || name === 'cut') { st.lastCopy = t; try { await navigator.clipboard?.writeText(t); } catch {} uno(name === 'cut' ? '.uno:Cut' : '.uno:Copy'); }
    else if (name === 'paste') { let s = ''; try { s = await navigator.clipboard?.readText?.() || ''; } catch {} pasteText(s); }
    else if (name === 'ai') $('#selection-ai')?.click();
    focusDoc();
  }
  const commitTyping = () => flushTyped();
  $('#wb-btn-save')?.addEventListener('click', commitTyping, true);
  canvas.addEventListener('pointerdown', e => { flushTyped(); if (e.button === 2) e.stopImmediatePropagation(); }, true); // right click keeps the selection
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault(); if (!st.shot) return;
    const r = {left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY};
    pk.openMenu([
      {id: 'ctx-cut', label: '剪切', icon: 'cut', hint: '⌘X', do: {ui: 'cut'}}, {id: 'ctx-copy', label: '复制', icon: 'copy', hint: '⌘C', do: {ui: 'copy'}}, {id: 'ctx-paste', label: '粘贴', icon: 'paste', hint: '⌘V', do: {ui: 'paste'}},
      SEP, {id: 'ctx-clear', label: '清除格式', icon: 'eraser', do: {uno: '.uno:ResetAttributes'}}, {id: 'ctx-para', label: '段落设置', icon: 'text-to-cols', do: {ui: 'paragraph'}},
      SEP, {id: 'ctx-comment', label: '插入批注', icon: 'edit', do: {ui: 'comment'}},
      SEP, {id: 'ctx-ai', label: 'AI 编辑', icon: 'edit', do: {ui: 'ai'}},
    ], r, 0, 'below');
  });

  /* ------------------------------------------------------------ per-shot sync */
  function onShot(s) {
    if (!s || host.info?.()?.format !== 'docx') return;
    st.shot = s; st.ui = mapDocStates(s.states);
    refreshToolbar(); placeIme(); updateStatus(); loadOutline();
    if (st.revealNext) { st.revealNext = false; const c = cursorRect(); if (c) host.view?.reveal?.(c); }
  }
  function cursorRect() {
    const v = String(st.shot?.events?.['1'] || '').match(/-?\d+/g)?.map(Number);
    return v && v.length >= 4 ? {x: v[0], y: v[1], width: Math.max(1, v[2]), height: Math.max(1, v[3])} : null;
  }
  function placeIme() {
    const l = st.shot?.layout, c = cursorRect(); if (!l || !c) return;
    const cr = canvas.getBoundingClientRect(), sr = $('#wb-stage').getBoundingClientRect();
    const kx = cr.width / l.tileWidth, ky = cr.height / l.tileHeight;
    ime.style.left = (cr.left - sr.left + (c.x - l.x) * kx) + 'px'; ime.style.top = (cr.top - sr.top + (c.y - l.y) * ky) + 'px'; ime.style.height = Math.max(16, c.height * ky) + 'px';
  }
  function updateStatus() {
    const s = st.shot, rects = parsePageRects(s.doc?.pageRects), c = cursorRect();
    const ps = parsePageState(s.states?.['.uno:StatePageNumber']);
    const pages = ps?.pages || rects.length || s.parts?.length || 1, page = ps?.page || (c ? pageAt(rects, c.y) : 1);
    pageLbl.textContent = '第 ' + Math.min(page, pages) + ' 页 / 共 ' + pages + ' 页';
    const wc = parseWordCount(s.states?.['.uno:StateWordCount']);
    wordLbl.textContent = wc ? wc.words + ' 个字' : '';
  }

  renderToolbar();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => layoutToolbar()).observe(card);
  window.addEventListener('resize', layoutToolbar);
  bus.on('office:shot', onShot);
  if (host.shot?.()) onShot(host.shot());
  setTimeout(focusDoc, 0);
  return {state: st, onShot, setOutline};
}

if (typeof window !== 'undefined' && window.willbuddyOffice) {
  let mounted = false;
  const tryMount = () => {
    const host = window.wbOfficeHost;
    if (mounted || !host || host.info?.()?.format !== 'docx') return;
    mounted = true; document.body.setAttribute('data-format', 'docx');
    window.wbDoc = mountDoc({host, api: window.willbuddyOffice});
  };
  const start = () => { tryMount(); bus.on('office:shot', tryMount); };
  if (window.wbOfficeHost) start(); else window.addEventListener('wb-office-host', start, {once: true});
}
