// [p4-m2] Trusted DOM for a ```comparison block inside a chat reply. Built with textContent only; links are http(s) only.
import { normalizeComparison, comparisonSources, cellText, orderedDimensions, coverage, MISSING } from '../shared/comparison.js';

export function comparisonFigure(doc, spec) {
  const make = (tag, text, cls) => { const e = doc.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const {list, index} = comparisonSources(spec), cov = coverage(spec);
  const fig = make('figure', undefined, 'chat-compare');
  fig.append(make('figcaption', spec.title));
  if (spec.summary) fig.append(make('p', spec.summary, 'compare-summary'));
  const table = make('table'), head = make('tr');
  head.append(make('th', '维度'), ...spec.options.map(o => make('th', o)));
  const thead = make('thead'); thead.append(head); table.append(thead);
  const body = make('tbody');
  let judged = false;
  for (const d of orderedDimensions(spec)) {
    if (d.kind === 'judgment' && !judged) { judged = true; const r = make('tr', undefined, 'compare-group'); const th = make('th', '定性判断'); th.colSpan = spec.options.length + 1; r.append(th); body.append(r); }
    const row = make('tr');
    row.append(make('th', d.name + (d.unit ? `（${d.unit}）` : '')));
    for (const o of spec.options) {
      const c = spec.cells[o]?.[d.name], td = make('td', undefined, c ? '' : 'compare-missing');
      if (!c) td.textContent = MISSING;
      else {
        td.textContent = cellText({...c, source: undefined}, d, index);
        if (c.source) { const sup = make('sup'), a = make('a', `[${index.get(c.source)}]`, 'rendered-link'); a.href = c.source; a.rel = 'noopener noreferrer'; a.title = c.sourceTitle || c.source; sup.append(a); td.append(' ', sup); }
      }
      row.append(td);
    }
    body.append(row);
  }
  table.append(body);
  const wrap = make('div', undefined, 'table-scroll'); wrap.append(table); fig.append(wrap);
  fig.append(make('p', `${cov.found}/${cov.total} 项有数据，其中 ${cov.sourced} 项附来源${cov.missing ? `；${cov.missing} 项未找到` : ''}`, 'compare-meta'));
  if (list.length) {
    const ol = make('ol', undefined, 'compare-sources');
    for (const s of list) { const li = make('li'), a = make('a', s.title, 'rendered-link'); a.href = s.url; a.rel = 'noopener noreferrer'; li.append(a); ol.append(li); }
    const det = make('details'); det.append(make('summary', `来源（${list.length}）`), ol); fig.append(det);
  }
  const bar = make('div', undefined, 'compare-actions'), payload = JSON.stringify(spec);
  for (const [label, format] of [['存为 Excel', 'xlsx'], ['存为 Word', 'docx']]) {
    const b = make('button', label, 'secondary'); b.type = 'button'; b.dataset.action = 'comparisonExport'; b.dataset.id = JSON.stringify({format, spec: JSON.parse(payload)}); bar.append(b);
  }
  fig.append(bar);
  return fig;
}

/** Replace every comparison code block in a sanitized fragment. At most 4 per message. */
export function renderComparisons(fragment, doc) {
  let n = 0;
  for (const code of fragment.querySelectorAll('pre > code[title="willbuddy-comparison"]')) {
    try {
      if (++n > 4) throw new Error('本条消息最多展示 4 张对比表');
      code.parentElement.replaceWith(comparisonFigure(doc, normalizeComparison(code.textContent)));
    } catch (e) {
      const note = doc.createElement('p'); note.className = 'chart-error'; note.textContent = '对比表未渲染：' + e.message; code.parentElement.after(note);
    }
  }
}
