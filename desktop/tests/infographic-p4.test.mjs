import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { normalizeInfographic, normalizeBrand, renderInfographicSvg, wrapText, textWidth, TEMPLATES, SIZES, MAX_ITEMS, INFOGRAPHIC_INSTRUCTION, INFOGRAPHIC_PROMPT, svgDataUrl } from '../src/shared/infographic.js';
import { createInfographicService, localSpec } from '../services/infographic.mjs';
import { createRich } from '../src/ui/markdown.js';
import { infographicPage, infographicEditForm, infographicEditPayload, infographicPayload, brandForm, brandPayload, mountInfographics } from '../src/ui/infographic.js';
import { STUDIO_TABS } from '../src/ui/dashboard.js';

const SPEC = {template: 'stats', title: '2026 年第三季度经营概览', subtitle: '核心指标同比全部提升', footer: '数据来源：财务部月报',
  items: [{value: '1.2 亿', title: '营收', text: '同比 +18%，连续三个季度增长'}, {value: '320', title: '新客户', text: '其中制造业占 45%'}, {value: '92%', title: '续约率'}]};
const form = o => ({elements: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'boolean' ? {checked: v, value: 'on'} : {value: v}]))});
const parseSvg = svg => { const doc = new JSDOM(svg, {contentType: 'image/svg+xml'}).window.document; assert.equal(doc.getElementsByTagName('parsererror').length, 0, 'well-formed SVG'); return doc; };

test('normalizeInfographic: defaults, clipping, limits and errors', () => {
  const s = normalizeInfographic(JSON.stringify(SPEC));
  assert.equal(s.template, 'stats'); assert.equal(s.size, 'portrait'); assert.equal(s.items.length, 3);
  assert.equal(normalizeInfographic({...SPEC, template: 'nope'}).template, 'list');
  assert.equal(normalizeInfographic({...SPEC, template: 'process'}).size, 'landscape');
  assert.equal(normalizeInfographic({...SPEC, size: 'square'}).size, 'square');
  assert.equal(normalizeInfographic({...SPEC, items: Array.from({length: 12}, (_, i) => ({title: 'x' + i}))}).items.length, MAX_ITEMS.stats);
  assert.equal(normalizeInfographic({...SPEC, title: 'x'.repeat(200)}).title.length, 60);
  assert.deepEqual(normalizeInfographic({title: 'A', items: ['一', '', {}]}).items, [{value: '', title: '一', text: ''}]);
  assert.equal(normalizeInfographic('说明文字 {"title":"T","items":["a"]} 结尾').title, 'T');
  assert.equal(normalizeInfographic({template: 'poster', title: '只有标题'}).items.length, 0);
  assert.throws(() => normalizeInfographic({items: ['a']}), /标题/);
  assert.throws(() => normalizeInfographic({title: 'T'}), /至少需要一项/);
  assert.throws(() => normalizeInfographic('[1]'), /JSON 对象/);
  assert.throws(() => normalizeInfographic('x'.repeat(30000)), /24000/);
});

test('wrapText keeps lines within width and adds an ellipsis', () => {
  const lines = wrapText('信息图把复杂的数据和流程压缩成一页，读者一眼就能看懂重点。Infographics make data readable.', 300, 20, 3);
  assert.ok(lines.length <= 3);
  for (const l of lines) assert.ok(textWidth(l, 20) <= 300 + 0.01, l);
  assert.ok(lines.at(-1).endsWith('…'));
  assert.deepEqual(wrapText('短句', 300, 20), ['短句']);
  assert.deepEqual(wrapText('第一行\n第二行', 300, 20), ['第一行', '第二行']);
  assert.ok(wrapText('x'.repeat(200), 100, 20, 9).every(l => textWidth(l, 20) <= 100.01));
});

test('every template and size renders a well-formed, self-contained SVG with escaped text', () => {
  const evil = '<script>alert(1)</script>&"\'';
  for (const [template] of TEMPLATES) for (const size of Object.keys(SIZES)) {
    const items = Array.from({length: MAX_ITEMS[template]}, (_, i) => ({value: i === 0 ? evil : String(i * 10) + '%', title: '第' + (i + 1) + '项' + (i === 1 ? evil : ''), text: '说明文字比较长，需要自动换行，并且在空间不足时省略；第二个要点；第三个要点'.repeat(i === 2 ? 4 : 1)}));
    const {svg, width, height} = renderInfographicSvg({template, size, title: '标题 ' + evil, subtitle: '副标题', footer: '页脚', items}, {name: '知行志成', logo: 'iVBORw0KGgo='});
    assert.deepEqual([width, height], SIZES[size].slice(0, 2));
    const doc = parseSvg(svg);
    assert.equal(doc.querySelectorAll('script, foreignObject').length, 0, template + size);
    assert.ok(!/\son[a-z]+=/i.test(svg), 'no event handlers');
    assert.ok([...doc.querySelectorAll('image')].every(i => i.getAttribute('href').startsWith('data:image/png;base64,')));
    assert.ok(!/href="(?!data:image\/png)/.test(svg), 'no external references');
    assert.ok(doc.documentElement.textContent.includes('<script>alert(1)</script>'), 'text is kept as text');
  }
});

test('brand colours, name and logo are applied; invalid values fall back', () => {
  const {svg} = renderInfographicSvg(SPEC, {name: 'ACTWILL', primary: '#123456', accent: '#ff8800'});
  assert.ok(svg.includes('#123456') && svg.includes('#FF8800') && svg.includes('ACTWILL'));
  const b = normalizeBrand({primary: 'red', accent: 'url(x)', logo: 'not base64!', name: 'x'.repeat(99)});
  assert.deepEqual([b.primary, b.accent, b.logo, b.name.length], ['#0078CB', '#F59E0B', '', 40]);
  const plain = renderInfographicSvg(SPEC).svg;
  assert.ok(!plain.includes('<image'));
  assert.match(svgDataUrl('<svg/>'), /^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
});

test('chat rendering: infographic block becomes a figure with actions; bad blocks show a note', () => {
  const {window} = new JSDOM('<body></body>');
  const {rich} = createRich(window);
  const html = rich('如下：\n\n```infographic\n' + JSON.stringify({...SPEC, title: '<img src=x onerror=alert(1)>'}) + '\n```\n\n```infographic\n{"items":["a"]}\n```\n');
  const doc = new JSDOM(html).window.document;
  const fig = doc.querySelector('figure.chat-ig');
  assert.ok(fig);
  assert.equal(doc.querySelectorAll('img,script').length, 0, 'image is mounted later, nothing executable');
  const host = fig.querySelector('.ig-host');
  assert.equal(JSON.parse(host.dataset.ig).title, '<img src=x onerror=alert(1)>');
  assert.deepEqual([...fig.querySelectorAll('button')].map(b => b.dataset.action), ['infographicSave', 'infographicEditChat', 'infographicPng', 'infographicPdf']);
  assert.match(doc.querySelector('.chart-error').textContent, /信息图未渲染：.*标题/);
  const n = mountInfographics(doc, {primary: '#112233'});
  assert.equal(n, 1);
  assert.match(host.querySelector('img').src, /^data:image\/svg\+xml/);
  assert.equal(mountInfographics(doc, {}), 0, 'mounted once');
  assert.match(INFOGRAPHIC_INSTRUCTION, /infographic代码围栏/);
  assert.ok(!INFOGRAPHIC_INSTRUCTION.includes("'"));
  assert.match(INFOGRAPHIC_PROMPT, /不要编造/);
});

test('localSpec structures lines without inventing numbers', () => {
  const s = localSpec('三季度要点\n营收：1.2 亿（同比 +18%）\n新客户：320 家\n团队扩张到两个城市', '', '');
  assert.equal(s.title, '三季度要点'); assert.equal(s.template, 'list');
  assert.deepEqual(s.items.map(i => [i.title, i.value]), [['营收', '1.2 亿'], ['新客户', '320 家'], ['团队扩张到两个城市', '']]);
  assert.equal(s.items[1].text, '');
  assert.equal(localSpec('一句话', 'poster', 'square').template, 'poster');
});

test('service: create via model (forced template), local fallback, save/update/copy/remove, limits', async () => {
  const store = {data: {settings: {model: 'm'}}, saved: 0, save() { this.saved++; }, log() {}};
  const calls = [];
  const request = async (settings, key, messages) => { calls.push(messages); return {text: '```json\n' + JSON.stringify({...SPEC, template: 'list'}) + '\n```'}; };
  const svc = createInfographicService({store, request, now: () => 1000});
  const r = await svc.handle({action: 'create', prompt: '做一张经营概览', template: 'stats', size: 'square'});
  assert.equal(r.designer, 'model');
  const g = store.data.infographics[0];
  assert.deepEqual([g.spec.template, g.spec.size, g.name], ['stats', 'square', SPEC.title]);
  assert.match(calls[0][1].content, /版式必须是 stats/);
  const bad = createInfographicService({store, request: async () => ({text: '不是 JSON'})});
  const r2 = await bad.handle({action: 'create', prompt: '标题\n甲：1\n乙：2'});
  assert.equal(r2.designer, 'local'); assert.match(r2.note, /已按每行一条整理/);
  const nomodel = createInfographicService({store: {data: {}, save() {}}});
  assert.equal((await nomodel.handle({action: 'create', prompt: 'a\nb'})).designer, 'local');
  await assert.rejects(svc.handle({action: 'create', prompt: ' '}), /描述/);
  const s = await svc.handle({action: 'save', spec: SPEC});
  await svc.handle({action: 'update', id: s.id, spec: {...SPEC, title: '改过的标题'}});
  assert.equal(store.data.infographics.find(x => x.id === s.id).name, '改过的标题');
  const c = await svc.handle({action: 'copy', id: s.id});
  assert.match(c.name, /副本$/);
  await svc.handle({action: 'remove', id: c.id});
  await assert.rejects(svc.handle({action: 'remove', id: c.id}), /不存在/);
  await assert.rejects(svc.handle({action: 'save', spec: {items: []}}), /标题/);
  for (let i = 0; i < 120; i++) await svc.handle({action: 'save', spec: SPEC});
  assert.equal(store.data.infographics.length, 100);
  await assert.rejects(svc.handle({action: 'nope'}), /未知操作/);
});

test('service: brand, logo limits, PNG validation and PDF export through injected hooks', async () => {
  const store = {data: {}, save() {}, log() {}}, written = [];
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  let logo = Buffer.from('logo'), svgSeen = '';
  const svc = createInfographicService({store, saveFile: async f => { written.push(f); return true; }, chooseLogo: async () => logo,
    pdfFromSvg: async (svg, w, h) => { svgSeen = svg; assert.deepEqual([w, h], [1080, 1350]); return Buffer.from('%PDF-1.7 test'); }});
  const b = await svc.handle({action: 'brand', brand: {name: '知行志成', primary: '#00AA00', accent: 'bad'}, chooseLogo: true});
  assert.deepEqual(b.brand, {name: '知行志成', primary: '#00AA00', accent: '#F59E0B', logo: 'set'});
  assert.equal(store.data.brand.logo, Buffer.from('logo').toString('base64'));
  logo = Buffer.alloc(3 * 1024 * 1024);
  await assert.rejects(svc.handle({action: 'brand', brand: {}, chooseLogo: true}), /2MB/);
  await svc.handle({action: 'brand', brand: {}, removeLogo: true});
  assert.equal(store.data.brand.logo, ''); assert.equal(store.data.brand.name, '知行志成');
  assert.deepEqual(await svc.handle({action: 'exportPng', name: 'a/b', dataUrl: 'data:image/png;base64,' + png.toString('base64')}), {saved: true});
  assert.equal(written[0].name, 'a_b.png');
  await assert.rejects(svc.handle({action: 'exportPng', dataUrl: 'data:image/png;base64,' + Buffer.from('GIF89a').toString('base64')}), /无效/);
  await assert.rejects(svc.handle({action: 'exportPng', dataUrl: 'data:text/html,<b>'}), /无效/);
  const s = await svc.handle({action: 'save', spec: SPEC});
  assert.deepEqual(await svc.handle({action: 'exportPdf', id: s.id}), {saved: true});
  assert.ok(svgSeen.includes('#00AA00') && written[1].name.endsWith('.pdf') && written[1].format === 'pdf');
  const broken = createInfographicService({store, saveFile: async () => true, pdfFromSvg: async () => Buffer.from('nope')});
  await assert.rejects(broken.handle({action: 'exportPdf', spec: SPEC}), /PDF 生成失败/);
  await assert.rejects(createInfographicService({store}).handle({action: 'exportPdf', spec: SPEC}), /不能导出/);
});

test('page, forms and payloads', () => {
  assert.deepEqual(STUDIO_TABS.map(t => t[0]).slice(0, 2), ['dashboards', 'infographics']);
  const action = (l, a, id = '', c = 'secondary') => `<button class="${c}" data-action="${a}" data-id="${id}">${l}</button>`;
  const heading = (k, t, d, x = '') => `<h1>${t}</h1><p>${d}</p>${x}`, empty = (t, d) => `<div class="empty">${t}${d}</div>`, date = () => '今天';
  const emptyPage = infographicPage({}, {action, heading, empty, date});
  assert.match(emptyPage, /还没有信息图/); assert.match(emptyPage, /infographicNew/); assert.match(emptyPage, /brandEdit/);
  const page = infographicPage({infographics: [{id: 'g1', name: '<b>x</b>', spec: normalizeInfographic(SPEC), updated: 1}], brand: {name: 'ACT'}}, {action, heading, empty, date});
  const doc = new JSDOM(page).window.document;
  assert.equal(doc.querySelector('.ig-card h3').textContent, '<b>x</b>');
  assert.equal(JSON.parse(doc.querySelector('.ig-host').dataset.ig).title, SPEC.title);
  assert.ok(['infographicEdit', 'infographicPngSaved', 'infographicPdfSaved', 'infographicCopy', 'infographicRemove'].every(a => doc.querySelector(`[data-action="${a}"]`)));
  assert.equal(doc.querySelector('[aria-selected="true"]').dataset.id, 'infographics');
  const ef = new JSDOM(`<form>${infographicEditForm(SPEC)}</form>`).window.document.querySelector('form');
  const back = infographicEditPayload(ef);
  assert.deepEqual(back, normalizeInfographic(SPEC), 'edit form round-trips');
  const changed = infographicEditPayload(form({title: '新', subtitle: '', template: 'timeline', size: 'square', footer: '', items: '2024 | 立项 | 说明 | 含竖线\n只有标题\n\n'}));
  assert.deepEqual(changed.items, [{value: '2024', title: '立项', text: '说明 | 含竖线'}, {value: '', title: '只有标题', text: ''}]);
  assert.throws(() => infographicPayload(form({prompt: ' '})), /描述/);
  assert.deepEqual(infographicPayload(form({prompt: '做一张', template: 'poster', size: ''})), {action: 'create', prompt: '做一张', template: 'poster', size: ''});
  assert.match(brandForm({name: 'A', primary: '#112233'}), /value="#112233"/);
  assert.deepEqual(brandPayload(form({name: 'A', primary: '#112233', accent: '#445566', chooseLogo: true})), {action: 'brand', brand: {name: 'A', primary: '#112233', accent: '#445566'}, removeLogo: false, chooseLogo: true});
});

test('wiring: preload channel, main registration, app handlers, sidebar label, system prompt', async () => {
  const read = p => readFile(new URL(p, import.meta.url), 'utf8');
  const [preload, main, app, conv, sidebar] = await Promise.all(['../preload.cjs', '../main.mjs', '../src/app.js', '../services/conversation.mjs', '../src/ui/sidebar.js'].map(read));
  assert.match(preload, /'infographic'/);
  assert.match(main, /register\('infographic'/);
  assert.match(main, /javascript: false/);
  for (const a of ['infographicNew', 'infographicSave', 'infographicPng', 'infographicPdf', 'infographicEdit', 'brandEdit']) assert.ok(app.includes(`'${a}'`), a);
  assert.match(app, /mountInfographics\(document, state\.brand\)/);
  assert.match(conv, /INFOGRAPHIC_INSTRUCTION \+/);
  assert.match(sidebar, /\['studio', 'grid', '创作', '仪表盘、信息图、小应用'\]/); // [p4-m4]
});
