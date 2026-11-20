// [p4-m3] Trusted DOM for a ```infographic block inside a chat reply. The image itself is mounted after render
// (the sanitizer strips src attributes), from the spec kept in data-ig. At most 3 per message.
import { normalizeInfographic, TEMPLATES } from '../shared/infographic.js';

export function infographicFigure(doc, spec, {saved = false} = {}) {
  const make = (tag, text, cls) => { const e = doc.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const fig = make('figure', undefined, 'chat-ig');
  const host = make('div', undefined, 'ig-host'); host.dataset.ig = JSON.stringify(spec); host.setAttribute('role', 'img'); host.setAttribute('aria-label', spec.title);
  fig.append(host);
  const label = TEMPLATES.find(([t]) => t === spec.template)?.[1] || '';
  fig.append(make('figcaption', `${label} · ${spec.title}`));
  const bar = make('div', undefined, 'compare-actions');
  const payload = JSON.stringify(spec);
  for (const [text, action] of [[saved ? '已保存' : '存到创作', 'infographicSave'], ['编辑', 'infographicEditChat'], ['下载 PNG', 'infographicPng'], ['导出 PDF', 'infographicPdf']]) {
    const b = make('button', text, 'secondary'); b.type = 'button'; b.dataset.action = action; b.dataset.id = payload; bar.append(b);
  }
  fig.append(bar);
  return fig;
}

export function renderInfographicBlocks(fragment, doc) {
  let n = 0;
  for (const code of fragment.querySelectorAll('pre > code[title="willbuddy-infographic"]')) {
    try {
      if (++n > 3) throw new Error('本条消息最多展示 3 张信息图');
      code.parentElement.replaceWith(infographicFigure(doc, normalizeInfographic(code.textContent)));
    } catch (e) {
      const note = doc.createElement('p'); note.className = 'chart-error'; note.textContent = '信息图未渲染：' + e.message; code.parentElement.after(note);
    }
  }
}
