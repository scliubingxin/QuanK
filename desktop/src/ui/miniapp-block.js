// [p4-m4] ```miniapp blocks inside chat replies (kept apart from miniapp.js so markdown.js has no import cycle).
import { normalizeAppHtml } from '../shared/miniapp.js';

/** ```miniapp blocks in a sanitized reply fragment become a card; the code travels in data-html. At most 2 per message. */
export function renderMiniAppBlocks(fragment, doc) {
  let n = 0;
  for (const code of fragment.querySelectorAll('pre > code[title="willbuddy-miniapp"]')) {
    try {
      if (++n > 2) throw new Error('本条消息最多展示 2 个小应用');
      const {html, title} = normalizeAppHtml(code.textContent);
      const make = (tag, text, cls) => { const e = doc.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
      const fig = make('figure', undefined, 'chat-miniapp');
      const head = make('div', undefined, 'chat-miniapp-head');
      head.append(make('span', '▣', 'chat-miniapp-icon'), make('b', title || '小应用'), make('small', `单文件小应用 · ${Math.max(1, Math.round(html.length / 1024))} KB · 在隔离环境运行，不联网`));
      fig.append(head);
      const bar = make('div', undefined, 'compare-actions');
      for (const [label, act, cls] of [['保存并打开', 'miniappSaveOpen', 'primary'], ['查看代码', 'miniappCode', 'secondary']]) {
        const b = make('button', label, cls); b.type = 'button'; b.dataset.action = act; b.dataset.id = JSON.stringify({html, title}); bar.append(b);
      }
      fig.append(bar);
      code.parentElement.replaceWith(fig);
    } catch (e) {
      const p = doc.createElement('p'); p.className = 'chart-error'; p.textContent = '小应用未渲染：' + e.message; code.parentElement.after(p);
    }
  }
}
