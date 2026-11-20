// [lane:pages] Left thumbnail rail: lazy thumbnails, LRU cache, slide add/duplicate/delete/move.
import {LruCache, railKeyTarget, masterRows} from '../shared/office-pages.js';
import {ensureContainer, h} from './pages-dom.js';

export function createSlideRail({bus, api, root = ensureContainer('wb-rail', {parent: 'main', before: '#editor'}), thumbWidth = 240, cacheSize = 64} = {}) {
  let count = 0, current = 0, names = [], mode = 'normal', structure = 0, lastSequence = null, refreshTimer = null, menu = null, drag = null;
  const cache = new LruCache(cacheSize), versions = new Map(), inflight = new Map(), queue = [];
  let running = false;
  const list = ensureChild('wb-rail-list', 'div'), add = root.querySelector('.wb-rail-add') || h('button', {class: 'wb-rail-add', type: 'button', text: '添加页面', 'aria-label': '添加页面'});
  if (!add.isConnected) root.prepend(add);
  list.tabIndex = 0; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', '幻灯片缩略图');
  function ensureChild(id, tag) { let el = root.querySelector('#' + id) || document.getElementById(id); if (!el) { el = h(tag, {id}); root.append(el); } return el; }

  const keyFor = part => [structure, mode, part, versions.get(part) || 0].join(':');
  const rows = () => mode === 'master' ? masterRows(names) : Array.from({length: count}, (_, part) => ({kind: 'slide', part, label: String(part + 1)}));

  function render() {
    closeMenu();
    const frag = document.createDocumentFragment();
    rows().forEach((row, position) => {
      const img = h('img', {class: 'wb-rail-thumb', alt: '', draggable: false});
      const cached = cache.get(keyFor(row.part)); if (cached) img.src = cached;
      const item = h('div', {class: 'wb-rail-item ' + row.kind + (row.part === current && row.kind !== 'master' ? ' current' : '') + (row.kind === 'master' && mode === 'master' ? ' master' : ''), role: 'option', 'data-index': row.part, 'data-kind': row.kind, 'aria-selected': row.part === current && row.kind !== 'master' ? 'true' : 'false', draggable: mode === 'normal' ? 'true' : false},
        h('span', {class: 'wb-rail-no', text: row.kind === 'layout' ? '' : (row.kind === 'master' ? '1' : row.label)}), h('div', {class: 'wb-rail-frame'}, img), row.kind === 'layout' ? h('span', {class: 'wb-rail-label', text: row.label}) : null);
      item.dataset.position = position; item._img = img; item._part = row.part; frag.append(item);
    });
    list.replaceChildren(frag); observe();
  }

  let observer = null;
  function observe() {
    observer?.disconnect();
    if (typeof IntersectionObserver === 'undefined') { for (const item of list.children) want(item._part, item._img); return; }
    observer = new IntersectionObserver(entries => { for (const e of entries) if (e.isIntersecting) want(e.target._part, e.target._img); }, {root: list.closest('#wb-rail') || list, rootMargin: '200px 0px'});
    for (const item of list.children) observer.observe(item);
  }

  function want(part, img) {
    const key = keyFor(part), hit = cache.get(key);
    if (hit) { img.src = hit; return; }
    if (!inflight.has(key)) { inflight.set(key, [img]); queue.push({key, part}); void pump(); }
    else inflight.get(key).push(img);
  }
  async function pump() {
    if (running) return; running = true;
    try {
      while (queue.length) {
        const job = queue.shift();
        // Items scrolled away or invalidated while waiting are skipped; they re-enter through the observer.
        const waiting = (inflight.get(job.key) || []).filter(img => img.isConnected);
        if (!waiting.length || job.key !== keyFor(job.part)) { inflight.delete(job.key); continue; }
        try {
          const r = await api.invoke('thumbnail', {part: job.part, width: thumbWidth});
          const url = 'data:image/png;base64,' + r.png; cache.set(job.key, url);
          for (const img of inflight.get(job.key) || []) img.src = url;
        } catch { /* leave placeholder; retried on next render */ }
        inflight.delete(job.key);
      }
    } finally { running = false; }
  }

  function select(index, {emit = true} = {}) {
    if (!(index >= 0 && index < (mode === 'master' ? names.length : count))) return;
    if (emit) bus.emit('slide:goto', {index}); else { current = index; render(); }
  }
  function markCurrent() {
    for (const item of list.children) { const on = item._part === current && item.dataset.kind !== 'master'; item.classList.toggle('current', on); item.setAttribute('aria-selected', String(on)); if (on) item.scrollIntoView?.({block: 'nearest'}); }
  }

  async function act(action, part, to) {
    try {
      const wait = []; bus.emit('pages:before-change', {wait}); await Promise.all(wait); // pending notes are written against the old numbering first
      const r = await api.invoke('slideAction', to === undefined ? {action, part} : {action, part, to});
      structure++; cache.clear(); versions.clear();
      current = typeof r.part === 'number' ? r.part : current; count = r.count ?? count;
      bus.emit('slides:changed', {count}); bus.emit('doc:refresh', {}); render();
      bus.emit('slide:changed', {index: current, count});
      return r;
    } catch (e) { bus.emit('pages:error', {message: String(e.message || e)}); return null; }
  }

  function closeMenu() { menu?.remove(); menu = null; }
  function openMenu(x, y, part) {
    closeMenu(); if (mode !== 'normal') return;
    const item = (label, action, enabled = true) => h('button', {type: 'button', role: 'menuitem', class: 'wb-menu-item', disabled: !enabled, text: label, onclick: () => { closeMenu(); action(); }});
    menu = h('div', {class: 'wb-rail-menu', role: 'menu'},
      item('新建页面', () => act('insert', part)), item('复制页面', () => act('duplicate', part)), item('删除页面', () => act('delete', part), count > 1),
      item('上移', () => act('move', part, part - 1), part > 0), item('下移', () => act('move', part, part + 1), part < count - 1));
    menu.style.left = x + 'px'; menu.style.top = y + 'px'; document.body.append(menu);
  }

  list.addEventListener('click', e => { const item = e.target.closest?.('.wb-rail-item'); if (item) { list.focus({preventScroll: true}); select(item._part); } });
  list.addEventListener('contextmenu', e => { const item = e.target.closest?.('.wb-rail-item'); if (!item || mode !== 'normal') return; e.preventDefault(); if (item._part !== current) select(item._part); openMenu(e.clientX, e.clientY, item._part); });
  list.addEventListener('keydown', e => {
    if (mode !== 'normal' && mode !== 'master') return;
    const target = railKeyTarget(e.key, current, mode === 'master' ? names.length : count);
    if (target !== null) { e.preventDefault(); select(target); }
    else if (e.key === 'Escape') closeMenu();
  });
  list.addEventListener('dragstart', e => { const item = e.target.closest?.('.wb-rail-item'); if (!item || mode !== 'normal') return e.preventDefault?.(); drag = item._part; e.dataTransfer?.setData('text/plain', String(drag)); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; });
  list.addEventListener('dragover', e => { if (drag === null) return; e.preventDefault(); const item = e.target.closest?.('.wb-rail-item'); for (const i of list.children) i.classList.toggle('drop', i === item && i._part !== drag); });
  list.addEventListener('dragend', () => { drag = null; for (const i of list.children) i.classList.remove('drop'); });
  list.addEventListener('drop', e => { const item = e.target.closest?.('.wb-rail-item'); e.preventDefault(); const from = drag; drag = null; for (const i of list.children) i.classList.remove('drop'); if (item && from !== null && item._part !== from) void act('move', from, item._part); });
  add.addEventListener('click', () => { if (mode === 'normal') void act('insert', current); });
  document.addEventListener('pointerdown', e => { if (menu && !menu.contains(e.target)) closeMenu(); });

  const offs = [
    bus.on('doc:drawn', d => {
      const before = names.join('\n'); names = d.names || names; current = d.part;
      const edited = lastSequence !== null && d.sequence !== lastSequence; lastSequence = d.sequence;
      if (d.count !== count || (mode === 'master' && before !== names.join('\n'))) { count = d.count; structure++; cache.clear(); render(); return; }
      markCurrent();
      // Incremental refresh: only the displayed slide is re-rendered after an edit, debounced.
      if (edited && mode === 'normal') { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => invalidate(d.part), 600); }
    }),
    bus.on('slide:changed', d => { current = d.index; markCurrent(); }),
    bus.on('view:set', async d => {
      if (d?.mode === 'master' && mode !== 'master') {
        try { const r = await api.invoke('viewMode', {mode: 'master'}); mode = 'master'; structure++; cache.clear(); count = r.count; current = r.part; bus.emit('doc:refresh', {});
          const info = await api.invoke('deckInfo', {part: 0}).catch(() => null); const name = info?.masters?.[0]?.name || '';
          names = names.length === r.count ? names : Array.from({length: r.count}, () => ''); render(); bus.emit('master:info', {name, layouts: info?.masters?.[0]?.layouts || [], readonly: false});
        } catch (e) { mode = 'master'; names = names.length ? names : []; bus.emit('master:info', {name: '', readonly: true, message: '当前内核不支持母版编辑，仅只读展示：' + String(e.message || e)}); render(); }
      } else if (d?.mode === 'normal' && mode === 'master') {
        mode = 'normal'; structure++; cache.clear();
        try { const r = await api.invoke('viewMode', {mode: 'normal'}); count = r.count; current = r.part; } catch { /* keep last known */ }
        render(); bus.emit('doc:refresh', {}); bus.emit('master:info', {name: null});
      }
    }),
  ];

  function invalidate(part) { versions.set(part, (versions.get(part) || 0) + 1); const item = [...list.children].find(i => i._part === part && i.dataset.kind !== 'master'); if (item) want(part, item._img); }
  return {get state() { return {count, current, mode, cached: cache.size}; }, cache, render, invalidate, select, act, openMenu, closeMenu, destroy() { offs.forEach(f => f()); observer?.disconnect(); }, _list: list, _add: add};
}
