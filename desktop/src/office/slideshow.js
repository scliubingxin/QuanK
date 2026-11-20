// [lane:pages] Full-screen slideshow overlay driven by the pure state machine in shared/office-pages.js.
import {createSlideshowState, slideshowKeyEvent} from '../shared/office-pages.js';
import {h} from './pages-dom.js';

export function createSlideshow({bus, api, width = 1600, getCount, getCurrent} = {}) {
  let overlay = null, show = null, img = null, message = null, token = 0, cleanup = null;
  const pages = new Map();
  async function fetchPage(part) {
    if (pages.has(part)) return pages.get(part);
    const p = api.invoke('thumbnail', {part, width}).then(r => 'data:image/png;base64,' + r.png);
    pages.set(part, p); p.catch(() => pages.delete(part));
    if (pages.size > 6) pages.delete(pages.keys().next().value);
    return p;
  }
  async function paint() {
    const {index, count, ended, active} = show.state; if (!active) return;
    const mine = ++token;
    if (ended) { img.hidden = true; message.hidden = false; message.textContent = '放映结束，单击退出'; return; }
    message.hidden = true;
    try {
      const url = await fetchPage(index); if (mine !== token) return;
      img.src = url; img.hidden = false;
      if (index + 1 < count) void fetchPage(index + 1).catch(() => {});
    } catch (e) { if (mine === token) { img.hidden = true; message.hidden = false; message.textContent = '页面渲染失败：' + String(e.message || e); } }
  }
  function step(event) {
    if (!show) return;
    const s = show.dispatch(event);
    if (!s.active) return stop(); void paint();
  }
  async function start(from = 'first') {
    if (show) return;
    const count = getCount?.() ?? 0; if (!(count > 0)) { bus.emit('pages:error', {message: '没有可放映的页面'}); return; }
    show = createSlideshowState(count, from === 'current' ? (getCurrent?.() ?? 0) : 0); pages.clear();
    img = h('img', {class: 'wb-show-slide', alt: '', draggable: false}); message = h('div', {class: 'wb-show-end', hidden: true});
    overlay = h('div', {class: 'wb-show', role: 'dialog', 'aria-label': '幻灯片放映', tabindex: '-1'}, img, message);
    document.body.append(overlay);
    const key = e => { const ev = slideshowKeyEvent(e.key); if (ev) { e.preventDefault(); e.stopPropagation(); step(ev); } };
    const click = () => step('click');
    document.addEventListener('keydown', key, true); overlay.addEventListener('click', click);
    const fs = () => { if (show && typeof document !== 'undefined' && !document.fullscreenElement && overlay?.dataset.entered) step('exit'); };
    document.addEventListener('fullscreenchange', fs);
    cleanup = () => { document.removeEventListener('keydown', key, true); document.removeEventListener('fullscreenchange', fs); };
    overlay.focus();
    try { await overlay.requestFullscreen?.(); overlay.dataset.entered = '1'; } catch { overlay.dataset.entered = ''; } // falls back to a page-covering overlay
    await paint();
  }
  function stop() {
    if (!show) return;
    show = null; token++; cleanup?.(); cleanup = null;
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    overlay?.remove(); overlay = null; pages.clear(); bus.emit('show:end', {});
  }
  const offs = [bus.on('show:start', d => { void start(d?.from === 'current' ? 'current' : 'first'); })];
  return {start, stop, step, get active() { return !!show; }, get state() { return show?.state ?? null; }, destroy() { stop(); offs.forEach(f => f()); }};
}
