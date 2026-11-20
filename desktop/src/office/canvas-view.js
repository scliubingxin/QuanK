// [lane:render] Canvas viewport: percent zoom, fit-to-window, DPR-aware bitmaps, tiles, double buffering, coordinates.
import {bus} from './bus.js';
import {
  clampPercent, stepPercent, fitPercent, layoutOfficeView, planSnapshotTiles, canvasPointToDocument,
  documentRectToBitmap, anchoredPan, ZOOM_MIN, ZOOM_MAX, PAGE_MARGIN, TWIPS_PER_PX
} from '../shared/office-zoom.js';
import {parseCellCursor, parseRect} from '../shared/office-sheet.js'; // [excel]
import {detectFontSubstitutions} from '../shared/office-font-map.js';

const numbers = text => String(text || '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
function rectFrom(text) {
  const raw = String(text || '').trim();
  if (raw.startsWith('{')) { try { return rectFrom(JSON.parse(raw).rectangle); } catch { return null; } }
  const [x, y, width, height] = numbers(raw);
  return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0 ? {x, y, width, height} : null;
}

export function createCanvasView({api, canvas, viewport, getFormat = () => undefined, schedule = () => {}}) {
  const st = {mode: 'fit', percent: 100, panX: 0, panY: 0, page: null, layout: null, shot: null, fontsAsked: false, lastZoom: '', lastSelection: ''};
  const dpr = () => (Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? Math.min(window.devicePixelRatio, 4) : 1);
  const viewSize = () => ({width: viewport?.clientWidth > 0 ? viewport.clientWidth : 900, height: viewport?.clientHeight > 0 ? viewport.clientHeight : 700});
  // [excel] Spreadsheets have no page: no margin, top-left anchored, and the scrollable area grows with the pan (infinite grid).
  const isSheet = () => getFormat() === 'xlsx';
  const marginFor = () => (isSheet() ? 0 : PAGE_MARGIN);
  function pageFor(size, percent = st.percent) {
    if (!st.page || !isSheet()) return st.page;
    const z = (percent || 100) / 100, v = size || viewSize();
    return {width: Math.max(st.page.width, (st.panX + 2 * v.width) * TWIPS_PER_PX / z), height: Math.max(st.page.height, (st.panY + 2 * v.height) * TWIPS_PER_PX / z)};
  }
  const imageOf = async png => { const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode(); return img; };

  async function ensurePage() {
    if (st.page) return;
    const probe = await api.invoke('snapshot', {width: 200, height: 200, x: 0, y: 0, scale: 15, fonts: true});
    st.fontsAsked = true;
    const w = probe?.documentWidth, h = probe?.documentHeight;
    st.page = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? {width: w, height: h} : {width: 19200, height: 10800};
    st.mode = getFormat() === 'pptx' ? 'fit' : 'percent';
    st.percent = 100;
    reportFonts(probe?.fonts);
  }
  function reportFonts(fonts) {
    if (!fonts) return;
    try { for (const row of detectFontSubstitutions(fonts.used, fonts.installed)) bus.emit('font:substituted', row); } catch (error) { console.error('[font]', error); }
  }
  function emitZoom() {
    const label = Math.round(st.percent) + '%', key = label + ':' + st.mode;
    const el = document.querySelector('#wb-zoom-label');
    if (el) el.textContent = label;
    if (key !== st.lastZoom) { st.lastZoom = key; bus.emit('zoom:changed', {percent: Math.round(st.percent * 10) / 10, mode: st.mode}); }
  }
  function emitSelection(s) {
    const type = s.selectionType, kind = s.cells ? 'cell' : type === 3 ? 'object' : type === 1 || type === 2 ? 'text' : 'none';
    const detail = {kind, hasText: Boolean(s.selection), hasObject: type === 3, selectionType: type, length: s.selection?.length || 0, text: String(s.selection || '').slice(0, 500), part: s.part};
    const key = JSON.stringify(detail);
    if (key !== st.lastSelection) { st.lastSelection = key; bus.emit('selection:changed', detail); }
  }

  // Fetch all tiles first, then swap the canvas in one synchronous step: the old frame stays visible until then.
  async function render() {
    await ensurePage();
    const size = viewSize();
    if (st.mode === 'fit') {
      const fit = fitPercent({pageWidth: st.page.width, pageHeight: st.page.height, viewWidth: size.width, viewHeight: size.height, mode: getFormat() === 'pptx' ? 'page' : 'width'});
      if (fit !== null) { st.percent = fit; st.panX = 0; st.panY = 0; }
    }
    const page = pageFor(size);
    const layout = layoutOfficeView({pageWidth: page.width, pageHeight: page.height, viewWidth: size.width, viewHeight: size.height, percent: st.percent, panX: st.panX, panY: st.panY, dpr: dpr(), margin: marginFor()});
    if (!layout) throw Error('无法计算画布布局');
    st.panX = layout.panX; st.panY = layout.panY;
    const tiles = planSnapshotTiles(layout), parts = [];
    let shot;
    for (const t of tiles) {
      const req = {width: t.width, height: t.height, x: t.x, y: t.y, tileWidth: t.tileWidth, tileHeight: t.tileHeight};
      if (!st.fontsAsked) { req.fonts = true; st.fontsAsked = true; }
      const s = await api.invoke('snapshot', req);
      reportFonts(s?.fonts);
      parts.push({tile: t, image: await imageOf(s.png)});
      shot = s;
    }
    canvas.width = layout.width; canvas.height = layout.height;
    if (canvas.style) {
      Object.assign(canvas.style, {left: layout.cssLeft + 'px', top: layout.cssTop + 'px', width: layout.cssWidth + 'px', height: layout.cssHeight + 'px'});
    }
    const ctx = canvas.getContext('2d');
    for (const p of parts) ctx.drawImage(p.image, p.tile.sx, p.tile.sy);
    if (isSheet()) sheetOverlay(ctx, shot, layout); else overlay(ctx, shot, layout);
    if (Number.isFinite(shot?.documentWidth) && Number.isFinite(shot?.documentHeight) && shot.documentWidth > 0 && shot.documentHeight > 0) st.page = {width: shot.documentWidth, height: shot.documentHeight};
    st.layout = layout; st.shot = shot;
    emitZoom(); emitSelection(shot);
    return {...shot, layout};
  }

  function overlay(ctx, s, layout) {
    ctx.fillStyle = 'rgba(0,120,203,.16)';
    for (const raw of String(s.events?.['2'] || '').split(';')) {
      const r = rectFrom(raw), b = r && documentRectToBitmap(r, layout);
      if (b) ctx.fillRect(b.x, b.y, b.width, b.height);
    }
    const line = Math.max(1, Math.round(layout.dpr));
    if (s.selectionType === 1 && !s.selection) {
      const c = rectFrom(s.events?.['1']), b = c && documentRectToBitmap(c, layout);
      if (b) { ctx.fillStyle = '#1b2733'; ctx.fillRect(b.x, b.y, Math.max(line, 1.5 * layout.dpr), b.height); }
    }
    if (s.selectionType === 3) {
      const r = rectFrom(s.events?.['6']), b = r && documentRectToBitmap(r, layout);
      if (b) { ctx.fillStyle = '#0078cb'; const t = 2 * line; ctx.fillRect(b.x, b.y, b.width, t); ctx.fillRect(b.x, b.y + b.height - t, b.width, t); ctx.fillRect(b.x, b.y, t, b.height); ctx.fillRect(b.x + b.width - t, b.y, t, b.height); }
    }
  }

  // [excel] Calc selection: translucent area with a border, plus the active cell frame and fill handle.
  function sheetOverlay(ctx, s, layout) {
    const line = Math.max(1, Math.round(layout.dpr)), blue = '#1a73e8';
    const area = parseRect(s.events?.['42']) || parseRect(s.events?.['2']), a = area && documentRectToBitmap(area, layout);
    const cur = parseCellCursor(s.sheet?.cursor ?? s.events?.['17']), c = cur && documentRectToBitmap(cur, layout);
    if (a && (!c || a.width > c.width + line || a.height > c.height + line)) {
      ctx.fillStyle = 'rgba(26,115,232,.10)'; ctx.fillRect(a.x, a.y, a.width, a.height);
      ctx.strokeStyle = blue; ctx.lineWidth = line; ctx.strokeRect(a.x + line / 2, a.y + line / 2, a.width - line, a.height - line);
    }
    if (c) {
      const t = 2 * line; ctx.strokeStyle = blue; ctx.lineWidth = t; ctx.strokeRect(c.x + t / 2, c.y + t / 2, c.width - t, c.height - t);
      const box = a && (a.width > c.width + line || a.height > c.height + line) ? a : c, h = 6 * line;
      ctx.fillStyle = '#fff'; ctx.fillRect(box.x + box.width - h / 2 - line, box.y + box.height - h / 2 - line, h + 2 * line, h + 2 * line);
      ctx.fillStyle = blue; ctx.fillRect(box.x + box.width - h / 2, box.y + box.height - h / 2, h, h);
    }
    if (s.sheet?.editing) { // text caret while typing in a cell
      const k = parseRect(s.events?.['1']), b = k && documentRectToBitmap({...k, width: Math.max(1, k.width)}, layout);
      if (b) { ctx.fillStyle = '#1b2733'; ctx.fillRect(b.x, b.y, Math.max(line, 1.5 * layout.dpr), b.height); }
    }
  }

  function point(e, opts) {
    if (!st.layout || !canvas.getBoundingClientRect) return null;
    return canvasPointToDocument(e, canvas.getBoundingClientRect(), st.layout, opts);
  }
  function anchorOf(client) {
    const rect = viewport?.getBoundingClientRect?.(), size = viewSize();
    if (!client || !rect || !Number.isFinite(client.clientX)) return {x: size.width / 2, y: size.height / 2};
    return {x: client.clientX - rect.left, y: client.clientY - rect.top};
  }
  function setPercent(percent, client) {
    const next = clampPercent(percent);
    if (next === null || !st.page) return;
    const size = viewSize(), a = anchorOf(client);
    const page = pageFor(size);
    const pan = anchoredPan({pageWidth: page.width, pageHeight: page.height, viewWidth: size.width, viewHeight: size.height, oldPercent: st.percent, newPercent: next, panX: st.panX, panY: st.panY, anchorX: a.x, anchorY: a.y, margin: marginFor()});
    st.mode = 'percent'; st.percent = next; st.panX = Math.max(0, pan.panX); st.panY = Math.max(0, pan.panY);
    schedule();
  }
  function fit() { st.mode = 'fit'; st.panX = 0; st.panY = 0; schedule(); }
  function step(direction, client) { const next = stepPercent(st.percent, direction); if (next !== null) setPercent(next, client); }
  function panBy(dx, dy) {
    const l = st.layout; if (!l) return;
    st.panX = Math.max(0, Math.min(l.maxPanX, st.panX + dx)); st.panY = Math.max(0, Math.min(l.maxPanY, st.panY + dy));
    if (st.mode === 'fit' && (l.maxPanX || l.maxPanY)) st.mode = 'percent';
    schedule();
  }
  function resetPan() { st.panX = 0; st.panY = 0; }
  function panTo(y) { if (!st.layout) return; st.panY = Math.max(0, Math.min(st.layout.maxPanY, y)); schedule(); }

  bus.on('zoom:in', () => step(1));
  bus.on('zoom:out', () => step(-1));
  bus.on('zoom:fit', fit);
  bus.on('zoom:set', d => setPercent(Number(d?.percent)));

  viewport?.addEventListener?.('wheel', e => {
    if (!st.layout) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { // pinch gestures arrive as ctrl+wheel
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const next = Math.round(st.percent * Math.exp(-e.deltaY * unit * 0.01) * 10) / 10;
      setPercent(next === st.percent ? st.percent + Math.sign(-e.deltaY) * 0.1 : next, e);
      return;
    }
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewSize().height : 1;
    panBy((e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit, (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit);
  }, {passive: false});
  window.addEventListener?.('keydown', e => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    if (e.key === '+' || e.key === '=') step(1); else if (e.key === '-' || e.key === '_') step(-1); else if (e.key === '0') fit(); else return;
    e.preventDefault();
  });
  window.addEventListener?.('resize', schedule);
  if (typeof ResizeObserver !== 'undefined' && viewport && typeof viewport === 'object' && viewport.nodeType === 1) new ResizeObserver(schedule).observe(viewport);

  // Minimal status-bar controls for branches where the shell lane has not created #wb-statusbar yet.
  function ensureZoomControls() {
    if (typeof document === 'undefined' || document.querySelector('#wb-zoom-label') || !viewport?.append || !document.createElement) return;
    const bar = document.createElement('div'); bar.id = 'wb-zoom-lite'; bar.setAttribute?.('aria-label', '缩放');
    const make = (id, text, title, event) => { const b = document.createElement('button'); b.id = id; b.textContent = text; b.title = title; b.addEventListener?.('click', () => bus.emit(event)); return b; };
    const label = document.createElement('button'); label.id = 'wb-zoom-label'; label.textContent = '100%'; label.title = '适应窗口 (⌘0)'; label.addEventListener?.('click', () => bus.emit('zoom:fit'));
    bar.append(make('wb-zoom-out', '−', '缩小 (⌘−)', 'zoom:out'), label, make('wb-zoom-in', '＋', '放大 (⌘+)', 'zoom:in'));
    viewport.append(bar);
  }
  ensureZoomControls();

  // [excel] scroll so a document rectangle (twips) is visible; used by the sheet UI for keyboard navigation.
  function reveal(rect) {
    const l = st.layout; if (!l || !rect) return false;
    const z = st.percent / 100, x = rect.x / TWIPS_PER_PX * z, y = rect.y / TWIPS_PER_PX * z, w = rect.width / TWIPS_PER_PX * z, h = rect.height / TWIPS_PER_PX * z, v = viewSize();
    let px = st.panX, py = st.panY;
    if (x < px) px = x; else if (x + w > px + v.width) px = x + w - v.width;
    if (y < py) py = y; else if (y + h > py + v.height) py = y + h - v.height;
    px = Math.max(0, Math.round(px)); py = Math.max(0, Math.round(py));
    if (px === st.panX && py === st.panY) return false;
    st.panX = px; st.panY = py; if (st.mode === 'fit') st.mode = 'percent'; schedule(); return true;
  }
  return {render, point, setPercent, fit, step, panBy, panTo, resetPan, reveal, get state() { return {...st}; }, get layout() { return st.layout; }, ZOOM_MIN, ZOOM_MAX};
}
