// [lane:pages] Speaker notes editor bound to #wb-notes. Reads/writes go through the worker so the draft stays one document.
import {MAX_NOTES} from '../shared/office-pages.js';
import {ensureContainer, h} from './pages-dom.js';

export const NOTES_PLACEHOLDER = '单击此处添加备注';

export function createNotes({bus, api, root = ensureContainer('wb-notes', {parent: '#editor', before: '#parts'}), debounceMs = 800} = {}) {
  const area = root.querySelector('textarea') || h('textarea', {class: 'wb-notes-input', placeholder: NOTES_PLACEHOLDER, 'aria-label': '演讲者备注', maxlength: MAX_NOTES, rows: 3});
  if (!area.isConnected) root.append(area);
  area.placeholder = NOTES_PLACEHOLDER;
  let notes = [], index = 0, loaded = null, timer = null, writing = Promise.resolve(), loadToken = 0, dirtyPart = null;

  async function load(part = index) {
    const token = ++loadToken;
    try { const r = await api.invoke('notesGet'); if (token !== loadToken) return; notes = r.notes || []; } catch { notes = []; if (token !== loadToken) return; }
    show(part);
  }
  function show(part) {
    index = part; loaded = notes[part] ?? ''; if (dirtyPart === null) area.value = loaded; area.disabled = false;
  }
  /** Writes pending text for the page it was typed on (not the page currently displayed). */
  function flush() {
    clearTimeout(timer); timer = null;
    if (dirtyPart === null) return writing;
    const part = dirtyPart, text = area.value; dirtyPart = null;
    if ((notes[part] ?? '') === text) return writing;
    writing = writing.then(async () => {
      try { await api.invoke('notesSet', {part, text}); notes[part] = text; if (part === index) loaded = text; bus.emit('notes:saved', {part}); }
      catch (e) { bus.emit('pages:error', {message: '备注保存失败：' + String(e.message || e)}); }
    });
    return writing;
  }
  area.addEventListener('input', () => { if (dirtyPart === null) dirtyPart = index; clearTimeout(timer); timer = setTimeout(flush, debounceMs); });
  area.addEventListener('blur', () => { void flush(); });
  area.addEventListener('keydown', e => e.stopPropagation()); // typing must not reach canvas/rail shortcuts

  const offs = [
    bus.on('slide:changed', d => { void flush(); index = d.index; if (notes.length) show(d.index); else void load(d.index); }),
    bus.on('pages:before-change', d => { d?.wait?.push(flush()); }),
    bus.on('slides:changed', () => { void flush().then(() => load(index)); }),
    bus.on('view:set', d => { if (d?.mode === 'notes') area.focus(); }),
  ];
  return {load, flush, area, show, destroy() { offs.forEach(f => f()); clearTimeout(timer); }, get state() { return {index, loaded, pending: dirtyPart}; }};
}
