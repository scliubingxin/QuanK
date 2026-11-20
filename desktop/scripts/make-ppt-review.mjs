// 用同一份内容分别走旧链路（title+bullets）与新链路（layout 结构化）生成 old.pptx / new.pptx。
// 用法: node scripts/make-ppt-review.mjs [outDir]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { generateDocument } from '../runtime/documents.mjs';
const out = process.argv[2] || '../_review';
mkdirSync(out, { recursive: true });
const deck = JSON.parse(readFileSync(new URL('../tests/fixtures/ppt-deck-tongwei.json', import.meta.url), 'utf8'));
// 旧链路：模型原先输出的形态——每页标题 + 一串 bullet
const flat = (s) => {
  const t = [];
  for (const k of ['subtitle', 'meta', 'takeaway', 'caption', 'contact']) if (s[k]) t.push(s[k]);
  (s.items || []).forEach((x) => t.push(`${x.title}：${x.desc || ''}`));
  (s.cards || []).forEach((x) => t.push(`${x.title}：${x.body}`));
  (s.points || []).forEach((x) => t.push(typeof x === 'string' ? x : `${x.title}：${x.body}`));
  (s.table || []).forEach((r) => t.push(r.join('｜')));
  (s.steps || []).forEach((x, i) => t.push(`${i + 1}. ${x.title}：${x.body || ''}`));
  (s.events || []).forEach((x) => t.push(`${x.date} ${x.title}：${x.body || ''}`));
  (s.kpis || []).forEach((x) => t.push(`${x.value} ${x.label}：${x.note || ''}`));
  (s.layers || []).forEach((x) => t.push(`${x.name}：${x.items.join('、')}`));
  (s.quadrants || []).forEach((x) => t.push(`${x.title}：${x.body || ''}`));
  return t;
};
const old = { slides: deck.slides.map((s) => ({ title: s.title, bullets: flat(s).slice(0, 12), notes: s.notes })) };
const o = await generateDocument('pptx', JSON.stringify(old));
const n = await generateDocument('pptx', JSON.stringify(deck));
writeFileSync(`${out}/old.pptx`, o.bytes); writeFileSync(`${out}/new.pptx`, n.bytes);
console.log('old', o.bytes.length, 'new', n.bytes.length);
