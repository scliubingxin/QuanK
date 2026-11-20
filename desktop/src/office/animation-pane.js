// [lane:pages] Right-hand animation pane: empty state + read-only list of existing OOXML timing effects.
import {ensureContainer, h} from './pages-dom.js';

export const ANIMATION_EMPTY = '请选择需添加动画的对象';
export const ANIMATION_SOON = '即将支持';

export function createAnimationPane({bus, api, root = ensureContainer('wb-side-panel', {parent: 'main'})} = {}) {
  let open = false, part = 0, hasSelection = false, token = 0, host = null, lastList = [];
  function paint(list = []) {
    lastList = list; if (!open) return;
    host ??= h('div', {class: 'wb-anim'}); if (host.parentNode !== root) root.append(host);
    const add = h('button', {type: 'button', class: 'wb-anim-add', disabled: true, title: ANIMATION_SOON}, h('span', {class: 'wb-anim-plus', text: '＋', 'aria-hidden': 'true'}), h('span', {text: hasSelection ? '添加动画（' + ANIMATION_SOON + '）' : ANIMATION_EMPTY}));
    const items = list.length ? h('ol', {class: 'wb-anim-list'}, list.map((a, i) => h('li', {class: 'wb-anim-item'}, h('span', {class: 'wb-anim-no', text: String(i + 1)}), h('span', {class: 'wb-anim-kind', text: a.kind}), h('span', {class: 'wb-anim-target', text: a.target})))) : null;
    host.replaceChildren(h('div', {class: 'wb-anim-head'}, h('b', {text: '动画'}), h('button', {type: 'button', class: 'wb-anim-close', 'aria-label': '关闭动画窗格', text: '×', onclick: () => bus.emit('panel:close', {name: 'animation'})})), add, items, h('p', {class: 'wb-anim-note', text: '编辑动画' + ANIMATION_SOON + '；此处仅列出当前页已有动画。'}));
  }
  async function refresh() {
    if (!open) return; const mine = ++token; paint([]);
    try { const r = await api.invoke('deckInfo', {part}); if (mine === token) paint(r.animations || []); } catch { /* unreadable timing: keep the empty state */ }
  }
  const offs = [
    bus.on('panel:open', d => { if (d?.name !== 'animation') { if (open) { open = false; token++; host?.remove(); } return; } open = true; void refresh(); }),
    bus.on('panel:close', () => { if (!open) return; open = false; token++; host?.remove(); }),
    bus.on('slide:changed', d => { part = d.index; if (open) void refresh(); }),
    bus.on('selection:changed', d => { hasSelection = !!d && !!d.kind && d.kind !== 'none'; if (open) paint(lastList); }),
  ];
  return {refresh, paint, get open() { return open; }, destroy() { offs.forEach(f => f()); host?.remove(); }};
}
