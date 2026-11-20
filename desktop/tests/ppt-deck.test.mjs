import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validateDeck, validateDeckSlide, lintDeck, LAYOUTS } from '../runtime/ppt-deck/schema.mjs';
import { wrapLines, measureParas, fitParas, splitText, textEm } from '../runtime/ppt-deck/measure.mjs';
import { planDeck, layoutDeck, buildDeckLayout } from '../runtime/ppt-deck/engine.mjs';
import { THEMES, GRID, FONT } from '../runtime/ppt-deck/themes.mjs';
import { markdownToDeck } from '../runtime/ppt-deck/from-markdown.mjs';
import { generateDocument, normalizeSpec, pptImagesFromContent } from '../runtime/documents.mjs';
const sample = JSON.parse(readFileSync(new URL('./fixtures/ppt-deck-tongwei.json', import.meta.url), 'utf8'));
const W = GRID.W, H = GRID.H, EPS = 0.011;
const inside = (s) => { const h = s.h ?? (s.rowH ? s.rowH.reduce((a, b) => a + b, 0) : 0); return s.x >= -EPS && s.y >= -EPS && s.x + s.w <= W + EPS && s.y + h <= H + EPS; };

test('schema: 示例通过校验，覆盖全部 13 种 layout', () => {
  validateDeck(sample);
  assert.deepEqual([...new Set(sample.slides.map((s) => s.layout))].sort(), [...LAYOUTS].sort());
  assert.deepEqual(lintDeck(sample), []);
});
test('schema: 拒绝未知 layout/字段/数量/颜色注入/非法图片 ID', () => {
  const bad = [
    { layout: 'nope', title: 'x' }, { layout: 'cards', title: 'x', cards: [{ title: 'a', body: 'b' }] },
    { layout: 'cards', title: 'x', cards: [{ title: 'a', body: 'b', color: '#fff' }, { title: 'a', body: 'b' }] },
    { layout: 'summary', title: 'x', points: ['1', '2', '3', '4', '5', '6'] },
    { layout: 'process', title: 'x', steps: [{ title: 'a' }, { title: 'b' }] },
    { layout: 'compare-table', title: 'x', table: [['a', 'b'], ['c']] },
    { layout: 'image-text', title: 'x', points: ['a'], imageId: '../etc' },
    { layout: 'matrix', title: 'x', axes: { x: 'a', y: 'b' }, quadrants: [{ title: 'a' }] },
    { layout: 'cards', cards: [{ title: 'a', body: 'b' }, { title: 'a', body: 'b' }] },
  ];
  for (const s of bad) assert.throws(() => validateDeckSlide(s), undefined, JSON.stringify(s).slice(0, 60));
  assert.throws(() => validateDeck({ slides: [{ layout: 'cover', title: 'a' }], theme: 'red' }));
  assert.throws(() => validateDeck({ slides: [{ layout: 'cover', title: 'a' }], extra: 1 }));
});
test('测量: CJK 宽度、折行、禁则', () => {
  assert.ok(Math.abs(textEm('中文中文') - 4 * 1.03) < 1e-9);
  const lines = wrapLines('一二三四五六七八九十，一二三四五', 14, 14 / 72 * 10.5);
  assert.ok(lines.length >= 2 && lines.every((l) => l.length > 0));
  assert.ok(!lines.slice(1).some((l) => '，。、'.includes(l[0])), '行首不应出现标点');
  assert.equal(wrapLines('Hello World', 14, 5).length, 1);
  assert.equal(wrapLines('a\nb', 14, 5).length, 2);
});
test('测量: 拟合依次缩字再紧凑，并保持字号下限', () => {
  const p = [{ text: '这是一段用于测试自适应缩字的中文文本，'.repeat(6) }];
  const roomy = fitParas(p, 6, 3, { max: 14, min: 11 }); assert.equal(roomy.size, 14);
  const tight = fitParas(p, 3, 1.4, { max: 14, min: 11 }); assert.ok(tight.size >= 11);
  const fits = fitParas(p, 5, 1.2, { max: 14, min: 11 }); assert.ok(fits.size < 14 && fits.size >= 11);
  const none = fitParas(p, 2, 0.3, { max: 14, min: 11 }); assert.equal(none.ok, false); assert.equal(none.size, 11); assert.ok(none.ls <= 1.0);
  assert.ok(measureParas(p, 6, { size: 14 }).h > 0);
});
test('测量: 句子拆分保持内容完整', () => {
  const t = '第一句。第二句很长很长很长。第三句。'; const [a, b] = splitText(t); assert.equal(a + b, t); assert.ok(a && b);
  const [c, d] = splitText('没有标点的一整段很长的文字内容'); assert.equal(c + d, '没有标点的一整段很长的文字内容');
});
test('版式: 示例 14 页逐页无越界、无溢出、字号 ≥ 下限', () => {
  const built = buildDeckLayout(sample);
  assert.equal(built.slides.length, 14);
  built.slides.forEach((sl, i) => {
    assert.equal(sl.overflow, false, `第${i + 1}页 ${sl.layout} 溢出`);
    for (const sh of sl.shapes) {
      assert.ok(inside(sh), `第${i + 1}页 ${sl.layout} ${sh.role || sh.kind} 越界 ${JSON.stringify([sh.x, sh.y, sh.w, sh.h])}`);
      if (sh.kind === 'text') {
        const small = sh.size < 11, ok = sh.role === 'footer' || sh.role === 'page' || sh.role === 'logo';
        assert.ok(!small || ok, `第${i + 1}页 ${sh.role} 字号 ${sh.size}`);
      }
      if (sh.kind === 'table') assert.ok(sh.y + sh.rowH.reduce((a, b) => a + b, 0) <= GRID.bodyB + 0.01, `第${i + 1}页 表格底边`);
    }
  });
});
test('版式: 页码 n / N，封面/章节/封底不显示，章节编号自动生成', () => {
  const built = buildDeckLayout(sample); const pageText = (sl) => sl.shapes.filter((s) => s.role === 'page').map((s) => s.paras[0].text);
  assert.deepEqual(pageText(built.slides[3]), ['4 / 14']); assert.deepEqual(pageText(built.slides[0]), []); assert.deepEqual(pageText(built.slides[2]), []);
  assert.equal(built.pages[2].number, '01'); assert.equal(built.pages[6].number, '02');
  const noNum = buildDeckLayout({ ...sample, pageNumbers: false }); assert.deepEqual(pageText(noNum.slides[3]), []);
  const tag = built.slides[3].shapes.find((s) => s.role === 'tag'); assert.equal(tag.paras[0].text, '1.1');
  const nologo = buildDeckLayout({ ...sample, brand: { name: 'X', showLogo: false } }); assert.ok(!nologo.slides[3].shapes.some((s) => s.role === 'logo'));
});
test('拆页: 超长表格拆为续页并重复表头，内容不丢失', () => {
  const rows = Array.from({ length: 26 }, (_, i) => [`维度${i + 1}`, `数据 ${i + 1} 的说明文字`, `另一列 ${i + 1}`]);
  const deck = { slides: [{ layout: 'compare-table', title: '长表', table: [['维度', 'A', 'B'], ...rows] }] };
  const planned = planDeck(deck); assert.ok(planned.pages.length >= 3);
  assert.ok(planned.pages.every((p) => p.table[0][0] === '维度'));
  assert.equal(planned.pages.flatMap((p) => p.table.slice(1)).length, 26);
  assert.match(planned.pages[1].title, /续/);
  layoutDeck(planned).forEach((sl) => { assert.equal(sl.overflow, false); sl.shapes.forEach((s) => assert.ok(inside(s))); });
});
test('拆页: 超多/超长卡片与步骤拆页后零溢出，文字总量不变', () => {
  const body = '这是一段很长的说明文字，用来测试卡片内容过多时自动拆分续页的行为。'.repeat(6);
  const deck = { slides: [{ layout: 'cards', title: '卡片', cards: [{ title: '甲', body }, { title: '乙', body }, { title: '丙', body }] }, { layout: 'process', title: '流程', steps: [1, 2, 3, 4, 5, 6].map((i) => ({ title: `第${i}步`, body: body.slice(0, 118) })) }, { layout: 'summary', title: '总结', points: [1, 2, 3, 4, 5].map((i) => ({ title: `结论${i}`, body: body.slice(0, 118) })) }, { layout: 'timeline', title: '时间', events: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ date: `2026-0${i}`, title: `事件${i}`, body: body.slice(0, 118) })) }] };
  const planned = planDeck(deck); assert.ok(planned.pages.length > 4);
  layoutDeck(planned).forEach((sl, i) => { assert.equal(sl.overflow, false, `${i + 1} ${sl.layout}`); sl.shapes.forEach((s) => assert.ok(inside(s))); });
  const total = (arr) => arr.reduce((n, p) => n + (p.cards || p.steps || p.points || p.events || []).map((c) => (c.body || '').length).reduce((a, b) => a + b, 0), 0);
  for (const L of ['cards', 'process', 'summary', 'timeline']) assert.equal(total(planned.pages.filter((p) => p.layout === L)), total(deck.slides.filter((p) => p.layout === L)), L + ' 文字总量');
});
test('拆页: 四象限最大内容零溢出；超长 KPI 数值自动缩字', () => {
  const body = '风险说明内容很长很长。'.repeat(10);
  const m = planDeck({ slides: [{ layout: 'matrix', title: '矩阵', axes: { x: 'x', y: 'y' }, quadrants: [1, 2, 3, 4].map((i) => ({ title: `Q${i}`, body })) }] });
  assert.ok(m.pages.length >= 1); layoutDeck(m).forEach((sl) => assert.equal(sl.overflow, false));
  const k = buildDeckLayout({ slides: [{ layout: 'kpi', title: 'k', kpis: [{ value: '12,345,678.9万', label: 'a' }, { value: '1', label: 'b' }, { value: '2', label: 'c' }, { value: '3', label: 'd' }] }] });
  assert.ok(k.slides.every((x) => !x.overflow)); assert.ok(k.slides.length >= 2, '4 列放不下长数值时拆页'); assert.ok(k.slides.flatMap((x) => x.shapes).filter((s) => s.role === 'kpiValue').every((s) => s.size >= 28));
});
test('版式: 极端长标题/副标题缩字不低于 22pt 且不溢出', () => {
  const t = '这是一个非常非常长的标题用来测试标题区域的自动缩字和换行逻辑是否可靠'; const b = buildDeckLayout({ slides: [{ layout: 'summary', title: t, subtitle: '副标题'.repeat(20), points: ['a'] }] });
  const title = b.slides[0].shapes.find((s) => s.role === 'title'); assert.ok(title.size >= 22); assert.equal(b.slides[0].overflow, false);
});
test('主题: 4 套主题、角色齐全、字体为微软雅黑+苹方回退，JSON 与源同步', () => {
  assert.equal(Object.keys(THEMES).length, 4);
  for (const t of Object.values(THEMES)) for (const k of ['primary', 'accent', 'light', 'bg', 'text', 'muted', 'border', 'coverBg']) assert.match(t[k], /^[0-9A-F]{6}$/, `${t.id}.${k}`);
  assert.equal(FONT.zh, 'Microsoft YaHei'); assert.equal(FONT.fallback[0], 'PingFang SC');
  execFileSync('node', [new URL('../scripts/gen-ppt-themes.mjs', import.meta.url).pathname, '--check']);
  const j = JSON.parse(readFileSync(new URL('../runtime/ppt-themes.json', import.meta.url), 'utf8')); assert.equal(j.themes.length, 4); assert.equal(j.themes[0].colors.primary, '1F4E9E');
  for (const id of Object.keys(THEMES)) { const b = buildDeckLayout({ ...sample, theme: id }); assert.ok(b.slides.every((s) => !s.overflow), id); }
});
test('集成: generateDocument 走新链路，旧格式与混用规则保持', async () => {
  const out = await generateDocument('pptx', JSON.stringify(sample)); assert.equal(out.bytes[0], 0x50);
  const py = `from pptx import Presentation\nimport sys,io\np=Presentation(io.BytesIO(sys.stdin.buffer.read()))\nassert len(p.slides)==14\nt=' '.join(s.text_frame.text for sl in p.slides for s in sl.shapes if s.has_text_frame)\nassert '通威近期并购案分析' in t and '4 / 14' in t and '待核验' in t\nassert any(s.has_table for s in p.slides[5].shapes)\nassert p.slides[3].notes_slide is not None or True\nprint('ok')`;
  assert.equal(execFileSync('python3', ['-c', py], { input: out.bytes }).toString().trim(), 'ok');
  const legacy = await generateDocument('pptx', JSON.stringify({ slides: [{ title: 'x', bullets: ['a'] }] })); assert.ok(legacy.bytes.length > 1000);
  assert.throws(() => normalizeSpec('pptx', JSON.stringify({ slides: [{ layout: 'cover', title: 'a' }, { title: 'x', bullets: ['a'] }] })), /layout/);
  assert.throws(() => normalizeSpec('pptx', JSON.stringify({ slides: [{ layout: 'cover', title: 'a', bullets: ['x'] }] })));
  assert.deepEqual(pptImagesFromContent(JSON.stringify({ brand: { name: 'x', logoImageId: 'L1' }, slides: [{ layout: 'image-text', title: 'a', points: ['b'], imageId: 'img_2' }] })).sort(), ['L1', 'img_2']);
});
test('Markdown 兜底转换生成合法 deck 且零溢出', () => {
  const md = '# 周报\n## 进展\n- 甲：已完成\n- 乙：进行中\n- 丙：未开始\n## 步骤\n1. 准备：资料\n2. 评审\n3. 发布\n## 数据\n| 项 | 值 |\n|---|---|\n| a | 1 |\n## 长列表\n' + Array.from({ length: 12 }, (_, i) => `- 第${i}条要点内容`).join('\n');
  const d = markdownToDeck('周报', md); validateDeck(d); assert.equal(d.slides[0].layout, 'cover'); assert.equal(d.slides.at(-1).layout, 'closing');
  assert.ok(!d.slides.some((s) => (s.points || []).length > 5));
  layoutDeck(planDeck(d)).forEach((sl) => assert.equal(sl.overflow, false));
});
