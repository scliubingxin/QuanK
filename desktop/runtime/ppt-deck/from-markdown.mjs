// Markdown/纯文本 → 结构化 deck（Web 端「导出 PPT」与无模型兜底使用）。启发式选版式，不输出 bullet 墙。
const clean = (v) => v.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '').trim();
const cut = (v, n) => (Array.from(v).length > n ? Array.from(v).slice(0, n - 1).join('') + '…' : v);
const chunk = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
export function markdownToDeck(name, text, { theme = 'quank', brand } = {}) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const groups = []; let cur = { title: '', blocks: [] }, docTitle = '', para = [], bullets = [], numbered = [], table = [];
  const flush = () => {
    if (para.length) cur.blocks.push({ t: 'p', v: para.slice() }); if (bullets.length) cur.blocks.push({ t: 'b', v: bullets.slice() });
    if (numbered.length) cur.blocks.push({ t: 'n', v: numbered.slice() }); if (table.length) cur.blocks.push({ t: 't', v: table.slice() });
    para = []; bullets = []; numbered = []; table = [];
  };
  for (const raw of lines) {
    const h = raw.match(/^(#{1,3})\s+(.*)$/);
    if (h) { flush(); const t = clean(h[2]); if (h[1] === '#' && !docTitle && !groups.length && !cur.blocks.length) { docTitle = t; continue; } if (cur.title || cur.blocks.length) groups.push(cur); cur = { title: t, blocks: [] }; continue; }
    const line = raw.trim(); if (!line) { flush(); continue; }
    if (/^\|.*\|$/.test(line)) { if (/^[|\s:-]+$/.test(line)) continue; table.push(line.slice(1, -1).split('|').map((c) => clean(c))); continue; }
    const b = line.match(/^[-*+•]\s+(.*)$/), n = line.match(/^\d+[.)、]\s*(.*)$/);
    if (b) { bullets.push(clean(b[1])); } else if (n) { numbered.push(clean(n[1])); } else { para.push(clean(line)); }
  }
  flush(); if (cur.title || cur.blocks.length) groups.push(cur);
  const slides = [{ layout: 'cover', title: cut(docTitle || name, 60), meta: '由 QuanK 生成 · 内容可继续编辑' }];
  if (groups.length >= 4) slides.push({ layout: 'toc', title: '目录', items: groups.slice(0, 8).map((g) => ({ title: cut(g.title || '内容', 40) })) });
  groups.slice(0, 40).forEach((g, gi) => {
    const sec = `${gi + 1}`; let idx = 0;
    const title = cut(g.title || '内容摘要', 60);
    const mk = (extra) => ({ title: idx++ ? cut(`${title}（续）`, 60) : title, section: `${sec}.${idx}`, ...extra });
    for (const blk of g.blocks) {
      if (blk.t === 't' && blk.v.length >= 2) { const cols = Math.min(5, Math.max(...blk.v.map((r) => r.length))); if (cols >= 2) { const rows = blk.v.map((r) => Array.from({ length: cols }, (_, i) => cut(r[i] || '—', 120))); slides.push({ layout: 'compare-table', ...mk({ table: rows }) }); } }
      else if (blk.t === 'n' && blk.v.length >= 3 && blk.v.length <= 6) slides.push({ layout: 'process', ...mk({ steps: blk.v.map((v) => { const [a, b] = v.split(/[：:]/); return b ? { title: cut(a, 30), body: cut(b.trim(), 120) } : { title: cut(v, 30) }; }) }) });
      else {
        const items = blk.v.map((v) => cut(v, 200));
        if (blk.t === 'b' && items.length >= 2 && items.length <= 4) slides.push({ layout: 'cards', ...mk({ cards: items.map((v) => { const m = v.split(/[：:]/); return m.length > 1 && m[0].length <= 16 ? { title: m[0], body: m.slice(1).join('：').trim() } : { title: cut(v, 14), body: v }; }) }) });
        else for (const part of chunk(items, 5)) slides.push({ layout: 'summary', ...mk({ points: part.map((v) => { const m = v.split(/[：:]/); return m.length > 1 && m[0].length <= 16 ? { title: m[0], body: cut(m.slice(1).join('：').trim(), 120) } : v; }) }) });
      }
    }
  });
  if (slides.length === 1) slides.push({ layout: 'summary', title: '内容摘要', points: ['暂无正文内容'] });
  slides.push({ layout: 'closing', title: '谢谢', subtitle: '内容可编辑，可继续补充和调整' });
  return { theme, ...(brand ? { brand } : {}), slides: slides.slice(0, 50) };
}
