// [F1e] AI 研判: turn the model's Markdown-ish text (often one long line with inline "##" and "- **") into a
// readable card layout: verdict hero, section cards with icons, bullet rows with bold leads, coloured % changes.
import { escape } from './markdown.js';

const ICONS = {
  verdict: '<path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.8z"/>',
  check: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  risk: '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  action: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  data: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7"/>',
};
const iconFor = t => /结论|总结|判断/.test(t) ? 'verdict' : /复核|要点|分析|技术|基本面/.test(t) ? 'check' : /风险|忽略|警示|注意/.test(t) ? 'risk' : /建议|操作|策略|计划/.test(t) ? 'action' : /数据|指标|资金/.test(t) ? 'data' : 'note';
const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;

/** Inline formatting: escape, **bold**, signed percentages coloured (red up / green down, A-share convention). */
export function inline(s) {
  return escape(String(s || '').trim())
    .replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>').replace(/\*\*/g, '')
    .replace(/(^|[^\w.])([+＋]\d+(?:\.\d+)?%)/g, '$1<span class="in-up">$2</span>')
    .replace(/(^|[^\w.])([-−－]\d+(?:\.\d+)?%)/g, '$1<span class="in-down">$2</span>');
}

/** Split the raw text into [{title, paras: [], items: [{lead, text}]}]. */
export function parseInsight(text) {
  let t = String(text || '').replace(/\r/g, '');
  t = t.replace(/\s*(#{1,4})\s+/g, '\n$1 ').replace(/\s+[-•]\s+(?=\*\*)/g, '\n- ').replace(/(^|\n)\s*[-•*]\s+(?!\*)/g, '$1- ');
  const out = []; let cur = {title: '', paras: [], items: []};
  const push = () => { if (cur.title || cur.paras.length || cur.items.length) out.push(cur); };
  for (const raw of t.split('\n')) {
    const l = raw.trim(); if (!l) continue;
    const h = /^#{1,4}\s+(.*)$/.exec(l);
    if (h) {
      push(); let title = h[1].trim(), rest = '';
      const cut = title.search(/\s|\*\*|[：:]/);
      if (title.length > 14 && cut > 0) { rest = title.slice(cut).replace(/^[\s：:]+/, ''); title = title.slice(0, cut); }
      cur = {title: title.replace(/[*#]/g, ''), paras: rest ? [rest] : [], items: []}; continue;
    }
    const b = /^-\s+(.*)$/.exec(l);
    if (b) { const m = /^\*\*(.+?)\*\*[\s：:，,]*(.*)$/.exec(b[1]); cur.items.push(m ? {lead: m[1].replace(/[：:]$/, ''), text: m[2]} : {lead: '', text: b[1]}); }
    else cur.paras.push(l);
  }
  push();
  return out;
}

const toneOf = s => /空|卖|减仓|清仓|回避|暂停/.test(s) ? 'bear' : /多|买|加仓|增持/.test(s) ? 'bull' : 'flat';

export function insightHtml(text, {name = '', code = ''} = {}) {
  const secs = parseInsight(text);
  if (!secs.length) return '<p class="muted">暂无研判内容。</p>';
  const vi = secs.findIndex(s => /结论/.test(s.title));
  const v = vi >= 0 ? secs.splice(vi, 1)[0] : null;
  let hero = '';
  if (v) {
    const body = [...v.paras, ...v.items.map(i => (i.lead ? i.lead + '：' : '') + i.text)].join(' ');
    const m = /\*\*(.+?)\*\*[\s：:]*/.exec(body), verdict = m ? m[1].replace(/[：:]$/, '') : '', rest = m ? body.replace(m[0], '') : body;
    const tone = toneOf(verdict || rest.slice(0, 20));
    hero = `<section class="in-hero in-${tone}"><div class="in-hero-top"><span class="in-ico">${svg('verdict')}</span><small>${escape(v.title || '结论')}${name ? ` · ${escape(name)}${code ? ' ' + escape(code) : ''}` : ''}</small></div>${verdict ? `<div class="in-verdict">${inline(verdict)}</div>` : ''}<p>${inline(rest)}</p></section>`;
  }
  const risks = secs.filter(s => iconFor(s.title) === 'risk').reduce((n, s) => n + Math.max(1, s.items.length), 0);
  const points = secs.reduce((n, s) => n + s.items.length, 0);
  const stats = `<div class="in-stats"><span><b>${secs.length}</b>个分析维度</span><span><b>${points}</b>条要点</span>${risks ? `<span class="warn"><b>${risks}</b>条风险提示</span>` : ''}</div>`;
  const cards = secs.map(s => { const k = iconFor(s.title); return `<section class="in-card in-k-${k}"><h4><span class="in-ico">${svg(k)}</span>${escape(s.title || '说明')}</h4>${s.paras.map(p => `<p>${inline(p)}</p>`).join('')}${s.items.length ? `<ul>${s.items.map(i => `<li>${i.lead ? `<b class="in-lead">${inline(i.lead)}</b>` : ''}<span>${inline(i.text)}</span></li>`).join('')}</ul>` : ''}</section>`; }).join('');
  return `<div class="in-wrap">${hero}${stats}<div class="in-cards">${cards}</div><p class="in-foot">由大模型基于本机策略数据生成，仅供研究，不构成投资建议。</p></div>`;
}
