// QuankSight shell: top bar, tabs, ribbon card, rail, stage, notes, side panel, status bar.
// Talks to the other lanes only through bus.js. office.js is untouched: the shell mirrors/clicks its legacy ids.
import { bus } from './bus.js';
import { hydrateIcons } from './icons/icons.js';
import { TABS, ZOOM_PRESETS, PANEL_TITLES, visibleTabs, percentFromScale, scaleFromPercent, pageLabel, clampNotesHeight, floatToolsVisible } from './shell-logic.js';

const $ = s => document.querySelector(s);
const state = { tab: 'home', view: 'normal', panel: null, notes: true, rail: true, ribbonCollapsed: false, slide: { index: 0, count: 0 }, percent: 100, freeSelect: false };
window.wbShell = { state, TABS };

hydrateIcons();

let toastTimer;
function toast(text) {
  const el = $('#wb-toast');
  if (!text) { el.hidden = true; return; }
  el.textContent = text; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}
// Buttons without a backend yet: another lane may claim them via bus 'menu:action' (set detail.handled = true); otherwise say so.
function action(id, label) {
  const detail = { id, handled: false };
  bus.emit('menu:action', detail);
  if (!detail.handled) toast(label + '：即将支持');
}

/* ---------- legacy mirrors (office.js keeps writing to these ids) ---------- */
const watch = (target, fn, opts) => { if (!target) return; new MutationObserver(fn).observe(target, opts); fn(); };
const all = { childList: true, subtree: true, characterData: true };
watch($('#name'), () => { const t = $('#name').textContent; $('#wb-title').textContent = t; $('#wb-title').title = t; document.title = t + ' · QuankSight'; }, all);
watch($('#status'), () => { const t = $('#status').textContent; const el = $('#wb-save-state'); el.textContent = t; el.classList.toggle('is-dirty', t.includes('尚未保存')); }, all);
let lastAction = '';
watch($('#action-status'), () => { const t = $('#action-status').textContent; if (t && t !== lastAction) toast(t); lastAction = t; updateFloat(); }, all);
watch($('#discard'), () => { const d = $('#discard').disabled; $('#wb-menu-discard').disabled = d; $('#wb-btn-save').classList.toggle('is-clean', d); }, { attributes: true, attributeFilter: ['disabled'] });
watch($('#save'), () => { $('#wb-btn-save').disabled = $('#save').disabled; }, { attributes: true, attributeFilter: ['disabled'] });
$('#error').addEventListener('click', () => { $('#error').hidden = true; });
watch($('#editor'), () => { const f = $('#editor').getAttribute('data-format'); if (f) document.body.setAttribute('data-format', f); }, { attributes: true, attributeFilter: ['data-format'] });

/* ---------- top bar ---------- */
$('#wb-btn-save').addEventListener('click', () => $('#save').click());
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); $('#save').click(); } });
$('#wb-btn-sync').addEventListener('click', () => action('sync', '上传/同步'));
$('#wb-btn-share').addEventListener('click', () => action('share', '分享'));
$('#wb-btn-play').addEventListener('click', () => bus.emit('show:start', { from: 'first' }));
$('#wb-status-play').addEventListener('click', () => bus.emit('show:start', { from: 'current' }));

const menu = $('#wb-more-menu'), zoomMenu = $('#wb-zoom-menu');
function setMenu(el, btn, open) { el.hidden = !open; btn.setAttribute('aria-expanded', String(open)); }
function closeMenus() { setMenu(menu, $('#wb-btn-more'), false); setMenu(zoomMenu, $('#wb-zoom-label'), false); }
$('#wb-btn-more').addEventListener('click', e => { e.stopPropagation(); const open = menu.hidden; closeMenus(); setMenu(menu, $('#wb-btn-more'), open); if (open) menu.querySelector('button:not(:disabled)')?.focus(); });
menu.addEventListener('click', e => {
  const b = e.target.closest('button[data-action]'); if (!b || b.disabled) return;
  closeMenus();
  const id = b.dataset.action;
  if (id === 'discard') $('#discard').click();
  else action(id, b.textContent.trim());
});
document.addEventListener('click', e => { if (!e.target.closest('#wb-more-menu,#wb-zoom-menu,#wb-zoom-label')) closeMenus(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
window.addEventListener('blur', closeMenus);

/* ---------- AI + side panel ---------- */
const panelEl = $('#wb-side-panel');
function openPanel(name) {
  if (!name) return;
  const body = $('#wb-panel-body');
  let sec = [...body.children].find(s => s.dataset.panel === name);
  if (!sec) { sec = document.createElement('section'); sec.dataset.panel = name; body.append(sec); }
  state.panel = name;
  for (const s of body.children) s.hidden = s !== sec;
  $('#wb-panel-title').textContent = PANEL_TITLES[name] || name;
  panelEl.hidden = false;
  const ai = name === 'ai';
  $('#wb-btn-ai').setAttribute('aria-expanded', String(ai));
  $('#toggle-ai').setAttribute('aria-expanded', String(ai));
  if (ai) $('#prompt').focus();
  bus.emit('panel:opened', { name, el: sec });
}
function closePanel() {
  const was = state.panel;
  state.panel = null; panelEl.hidden = true;
  $('#ai').hidden = true;
  $('#wb-btn-ai').setAttribute('aria-expanded', 'false');
  $('#toggle-ai').setAttribute('aria-expanded', 'false');
  if (was) bus.emit('panel:closed', { name: was });
}
bus.on('panel:open', d => openPanel(d?.name));
bus.on('panel:close', closePanel);
$('#wb-panel-close').addEventListener('click', () => bus.emit('panel:close'));
$('#wb-btn-ai').addEventListener('click', () => state.panel === 'ai' ? bus.emit('panel:close') : bus.emit('panel:open', { name: 'ai' }));
// office.js shows/hides #ai directly (e.g. "AI 编辑选区"); follow it.
new MutationObserver(() => { const hidden = $('#ai').hidden; if (!hidden && state.panel !== 'ai') openPanel('ai'); else if (hidden && state.panel === 'ai') closePanel(); }).observe($('#ai'), { attributes: true, attributeFilter: ['hidden'] });

/* ---------- tabs + ribbon ---------- */
const tabList = $('#wb-tab-list');
function renderTabs() {
  tabList.replaceChildren(...visibleTabs(state.view).map(t => {
    const b = document.createElement('button');
    b.className = 'wb-tab'; b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.tab = t.name; b.textContent = t.label;
    b.setAttribute('aria-selected', String(t.name === state.tab));
    b.addEventListener('click', () => { if (state.ribbonCollapsed) setRibbonCollapsed(false); bus.emit('ribbon:tab', { name: t.name, label: t.label }); });
    return b;
  }));
}
// Other lanes may also emit ribbon:tab to switch tabs.
bus.on('ribbon:tab', d => {
  if (!d?.name || !TABS.some(t => t.name === d.name)) return;
  state.tab = d.name;
  for (const b of tabList.children) b.setAttribute('aria-selected', String(b.dataset.tab === d.name));
});
function setRibbonCollapsed(c) {
  state.ribbonCollapsed = c;
  $('#wb-ribbon-card').classList.toggle('is-collapsed', c);
  $('#wb-ribbon-expand').hidden = !c;
  $('#wb-ribbon-collapse').setAttribute('aria-expanded', String(!c));
  bus.emit('ribbon:collapse', { collapsed: c });
}
$('#wb-ribbon-collapse').addEventListener('click', () => setRibbonCollapsed(true));
$('#wb-ribbon-expand').addEventListener('click', () => setRibbonCollapsed(false));
$('#wb-ribbon-search').addEventListener('click', () => action('ribbon-search', '搜索功能'));
renderTabs();

/* ---------- view modes ---------- */
function applyView(mode) {
  if (!['normal', 'master', 'notes'].includes(mode)) return;
  state.view = mode === 'master' ? 'master' : 'normal';
  document.body.dataset.view = state.view;
  $('#wb-master-bar').hidden = state.view !== 'master';
  if (mode === 'notes') setNotes(true);
  if (state.view === 'master' && !visibleTabs('master').some(t => t.name === state.tab)) state.tab = 'view';
  renderTabs();
  $('#wb-view-normal').classList.toggle('is-active', state.view === 'master');
  $('#wb-view-notes').disabled = state.view === 'master';
}
bus.on('view:set', d => { applyView(d?.mode); if (d?.mode === 'master' && d.name) $('#wb-master-name').textContent = d.name; });
$('#wb-master-close').addEventListener('click', () => bus.emit('view:set', { mode: 'normal' }));
$('#wb-view-normal').addEventListener('click', () => bus.emit('view:set', { mode: 'normal' }));
function setNotes(on) {
  state.notes = on;
  $('#wb-notes').classList.toggle('is-off', !on); $('#wb-notes-resizer').classList.toggle('is-off', !on);
  $('#wb-view-notes').classList.toggle('is-active', on); $('#wb-view-notes').setAttribute('aria-pressed', String(on));
}
bus.on('view:toggle', d => { if (d?.name === 'notes') setNotes(!state.notes); });
$('#wb-view-notes').addEventListener('click', () => bus.emit('view:toggle', { name: 'notes' }));
$('#wb-outline-toggle').addEventListener('click', () => {
  state.rail = !state.rail; $('#wb-rail').classList.toggle('is-collapsed', !state.rail); $('#wb-outline-toggle').setAttribute('aria-pressed', String(state.rail));
  bus.emit('outline:toggle', { open: state.rail });
});
$('#wb-add-page').addEventListener('click', () => bus.emit('slide:add', {}));

/* ---------- free select ---------- */
$('#wb-free-select').addEventListener('click', () => {
  state.freeSelect = !state.freeSelect;
  $('#wb-free-select').setAttribute('aria-checked', String(state.freeSelect));
  bus.emit('freeselect:toggle', { on: state.freeSelect });
});

/* ---------- notes resize ---------- */
{
  const notes = $('#wb-notes'), bar = $('#wb-notes-resizer');
  const setH = h => { const v = clampNotesHeight(h, $('#wb-center').clientHeight); notes.style.setProperty('height', v + 'px'); bus.emit('notes:resize', { height: v }); };
  let drag = null;
  bar.addEventListener('pointerdown', e => { drag = { y: e.clientY, h: notes.offsetHeight }; bar.setPointerCapture(e.pointerId); bar.classList.add('is-dragging'); e.preventDefault(); });
  bar.addEventListener('pointermove', e => { if (drag) setH(drag.h + drag.y - e.clientY); });
  const end = () => { drag = null; bar.classList.remove('is-dragging'); };
  bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
  bar.addEventListener('keydown', e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); setH(notes.offsetHeight + (e.key === 'ArrowUp' ? 16 : -16)); } });
}

/* ---------- zoom ---------- */
// Until the render lane owns zoom (it sets window.wbZoomOwner = true) the shell drives the legacy office.js controls.
const legacyZoom = () => !window.wbZoomOwner;
function legacySetPercent(percent) {
  const scale = scaleFromPercent(percent), select = $('#zoom'); if (scale === null) return;
  let o = [...select.options].find(x => Number(x.value) === scale);
  if (!o) { o = document.createElement('option'); o.value = String(scale); o.textContent = percentFromScale(scale) + '%'; select.append(o); }
  select.value = String(scale); select.dispatchEvent(new Event('change'));
}
bus.on('zoom:in', () => { if (legacyZoom()) $('#zoom-in').click(); });
bus.on('zoom:out', () => { if (legacyZoom()) $('#zoom-out').click(); });
bus.on('zoom:fit', () => { if (legacyZoom()) $('#zoom-fit').click(); });
bus.on('zoom:set', d => { if (legacyZoom() && d) legacySetPercent(d.percent); });
bus.on('zoom:changed', d => { if (d && Number.isFinite(Number(d.percent))) { state.percent = Math.round(Number(d.percent)); $('#wb-zoom-label').textContent = state.percent + '%'; } });
{
  let last = null; // legacy office.js has no zoom event; read its <select> instead
  setInterval(() => { if (!legacyZoom()) return; const p = percentFromScale(Number($('#zoom').value)); if (p !== last) { last = p; bus.emit('zoom:changed', { percent: p }); } }, 250);
}
$('#wb-zoom-in').addEventListener('click', () => bus.emit('zoom:in'));
$('#wb-zoom-out').addEventListener('click', () => bus.emit('zoom:out'));
$('#wb-fit').addEventListener('click', () => bus.emit('zoom:fit'));
zoomMenu.replaceChildren(...[...ZOOM_PRESETS.map(p => ({ label: p + '%', p })), { label: '适应窗口', p: 'fit' }].map(x => {
  const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'option'); b.textContent = x.label;
  b.addEventListener('click', () => { closeMenus(); x.p === 'fit' ? bus.emit('zoom:fit') : bus.emit('zoom:set', { percent: x.p }); });
  return b;
}));
$('#wb-zoom-label').addEventListener('click', e => {
  e.stopPropagation(); const open = zoomMenu.hidden; closeMenus(); setMenu(zoomMenu, $('#wb-zoom-label'), open);
  for (const b of zoomMenu.children) b.classList.toggle('is-current', b.textContent === state.percent + '%');
});

/* ---------- slides: page indicator, fallback rail ---------- */
const partsEl = $('#parts'), railList = $('#wb-rail-list');
function updateIndicator() { $('#wb-page-indicator').textContent = pageLabel(state.slide.index, state.slide.count); }
function renderFallbackRail(names) {
  const foreign = [...railList.children].some(c => !c.hasAttribute('data-wb-fallback'));
  if (foreign) { for (const c of [...railList.children]) if (c.hasAttribute('data-wb-fallback')) c.remove(); return; } // pages lane owns the list
  railList.replaceChildren(...names.map((name, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-wb-fallback', '');
    b.className = 'wb-rail-item' + (i === state.slide.index ? ' is-active' : '');
    b.innerHTML = '<b></b><span></span>'; b.firstChild.textContent = String(i + 1); b.lastChild.textContent = name || '第' + (i + 1) + '页';
    b.addEventListener('click', () => bus.emit('slide:goto', { index: i }));
    return b;
  }));
}
function syncParts() {
  const btns = [...partsEl.querySelectorAll('button')];
  const count = btns.length, active = Math.max(0, btns.findIndex(b => b.classList.contains('active')));
  if (!count) return;
  const countChanged = count !== state.slide.count, idxChanged = active !== state.slide.index;
  state.slide = { index: active, count };
  updateIndicator();
  renderFallbackRail(btns.map(b => b.textContent));
  if (countChanged) bus.emit('slides:changed', { count });
  if (countChanged || idxChanged) bus.emit('slide:changed', { index: active, count });
}
new MutationObserver(syncParts).observe(partsEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
bus.on('slide:changed', d => {
  if (!d) return; state.slide = { index: d.index, count: d.count }; updateIndicator();
  [...railList.children].forEach((c, i) => { if (c.hasAttribute('data-wb-fallback')) c.classList.toggle('is-active', i === d.index); });
});
bus.on('slide:goto', d => { const b = partsEl.querySelectorAll('button')[d?.index]; if (b && !b.classList.contains('active')) b.click(); });

/* ---------- floating selection tools (edit selection / AI edit / write-in) ---------- */
function updateFloat() {
  const f = $('#wb-float');
  const show = floatToolsVisible({ selection: $('#selection').textContent, draft: $('#edit-text').value, manual: !$('#cancel-selection').hidden });
  if (f.hidden === show) f.hidden = !show;
}
for (const id of ['#selection', '#cancel-selection', '#insert']) watch($(id), updateFloat, { ...all, attributes: true, attributeFilter: ['hidden'] });
$('#edit-text').addEventListener('input', updateFloat);
// office.js fills #edit-text with setRangeText (no input event) for canvas typing, so poll cheaply.
setInterval(updateFloat, 400);

/* ---------- boot ---------- */
setNotes(true);
syncParts(); // office.js may already have drawn before this module ran
updateIndicator();
$('#wb-zoom-label').textContent = '100%';
const announceTab = () => setTimeout(() => bus.emit('ribbon:tab', { name: state.tab, label: '开始' }), 0);
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', announceTab); else announceTab();
