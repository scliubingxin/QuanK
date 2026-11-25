import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDeckEngine, DECK_DIR, THEMES, LAYOUTS} from '../runtime/deck-engine.mjs';
import {routeDeckIntent, DECK_THEME_NAMES} from '../services/app-tools.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PY = process.env.WB_TEST_PYTHON || process.env.QUANK_PYTHON || 'python3';
const engine = () => createDeckEngine({python: PY, userData: join(tmpdir(), 'quank-deck-test')});
const readJson = p => readFile(p, 'utf8').then(JSON.parse);

const MOCK = {
  'quote:600438': {name: '通威股份', price: '22.18', changePct: '+1.84', turnover: '18.6亿元', asOf: '2026-11-25 15:00', source: '腾讯行情'},
  'financials:600438:5y': {rows: [['指标', '2021', '2022', '2023', '2024', '2025E'],
    ['营业收入', '880', '1196', '1391', '1560', '1720'], ['归母净利润', '82', '257', '135', '-112', '130'],
    ['毛利率', '27.4%', '34.2%', '20.5%', '18.1%', '19.8%'], ['ROE', '18.2%', '38.7%', '16.4%', '12.1%', '13.0%']], asOf: '2026-11-25', source: '东方财富 F10'},
  'kline:600438:1d:120': {dates: Array.from({length: 120}, (_, i) => 'D' + i),
    series: Array.from({length: 120}, (_, i) => ({open: 20 + i * 0.02, high: 20.5 + i * 0.02, low: 19.6 + i * 0.02, close: 20.2 + i * 0.02})), asOf: '2026-11-25', source: '腾讯行情'},
  'kline:600438:1d:120:dates': {dates: Array.from({length: 120}, (_, i) => 'D' + i), asOf: '2026-11-25'},
  'backtest:pool_a': {rows: [['策略', '年化', '回撤', '夏普'], ['均线趋势', '18.2%', '-21.4%', '0.86'], ['量价共振', '22.7%', '-18.9%', '1.02']], asOf: '2026-11-25', source: 'QuanK 量化引擎'},
};

const withWatermark = spec => ({...spec, watermark: '示例数据（测试 fixture）'});
function slidesOf(bytes) {
  return Number(execFileSync(PY, ['-c',
    'from pptx import Presentation\nimport sys,io\nprint(len(Presentation(io.BytesIO(sys.stdin.buffer.read())).slides._sldIdLst))'],
    {input: bytes, encoding: 'utf8'}).trim());
}
function pptxText(bytes) {
  return execFileSync(PY, ['-c',
    'import sys,zipfile,io\nz=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))\nprint(" ".join(z.read(n).decode("utf8","ignore") for n in z.namelist() if n.endswith(".xml")))'],
    {input: bytes, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
}
const BRAND = new RegExp('\\x4c\\x4f\\x4e\\x47\\x69|\\u9686\\u57fa|\\x48\\x69-\\x4d\\x4f|\\x58\\x31\\x30|\\u5546\\u5bc6|\\x74\\x72\\x6f\\x6e-\\x6f\\x6e\\x65-\\x61\\x67\\x65\\x6e\\x74|\\x45\\x36\\x30\\x30\\x31\\x32', 'i');

test('D59 1/2：spec 校验与三主题生成、python-pptx 重新打开页数正确', async () => {
  const eng = engine();
  const bad = await eng.check({theme: 'research', slides: [{layout: 'nope'}]});
  assert.equal(bad.ok, false);
  for (const [theme, file, count] of [['research', 'research_demo.json', 10], ['report', 'report_demo.json', 14], ['product', 'product_demo.json', 11]]) {
    const spec = withWatermark(await readJson(join(DECK_DIR, 'examples', file)));
    const checked = await eng.check(spec);
    assert.equal(checked.ok, true, JSON.stringify(checked));
    const r = await eng.build({spec, dataMap: theme === 'research' ? MOCK : null, theme, sourceAsOf: '2026-11-25 15:00'});
    assert.equal(r.ok, true);
    assert.equal(r.slides, count);
    assert.equal(slidesOf(r.bytes), count);
    assert.equal(BRAND.test(pptxText(r.bytes)), false, `${theme} pptx 含第三方品牌字样`);
  }
});

test('D59 3：源码与示例品牌清理为 0 命中，二进制素材仅 QuanK logo', async () => {
  const {readdirSync, readFileSync, statSync} = await import('node:fs');
  const walk = d => readdirSync(d).flatMap(n => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : (/\.(py|json|md)$/.test(n) ? [p] : []);
  });
  const files = walk(DECK_DIR).filter(p => !p.includes('__pycache__'));
  let hits = 0;
  for (const f of files) if (BRAND.test(readFileSync(f, 'utf8'))) hits++;
  assert.equal(hits, 0);
  const assets = await readdir(join(DECK_DIR, 'assets'));
  assert.deepEqual(assets.filter(n => !n.startsWith('.')).sort(), ['quank_logo.png', 'quank_logo_white.png']);
});

test('D59 4：数据绑定与缺失数据 — + warnings', async () => {
  const spec = withWatermark(await readJson(join(DECK_DIR, 'examples', 'research_demo.json')));
  const r = await engine().build({spec, dataMap: MOCK, sourceAsOf: '2026-11-25 15:00'});
  assert.equal(r.slides, 10);
  const text = pptxText(r.bytes);
  assert.ok(text.includes('通威股份'));
  assert.ok(text.includes('22.18'));
  assert.ok(text.includes('数据来源：腾讯行情 · 截至 2026-11-25 15:00'));
  assert.ok(text.includes('数据来源：东方财富 F10'));
  assert.ok(text.includes('示例数据（测试 fixture）'));
  const missing = await engine().build({spec, dataMap: {'quote:600438': null}, sourceAsOf: '2026-11-25 15:00'});
  assert.equal(missing.slides, 10);
  assert.ok(missing.warnings.some(w => /数据不可用|—/.test(w)), JSON.stringify(missing.warnings));
  assert.ok(pptxText(missing.bytes).includes('—'));
});

test('D59 5：research 免责声明页固定存在且在最后一页', async () => {
  const spec = withWatermark(await readJson(join(DECK_DIR, 'examples', 'research_demo.json')));
  spec.slides = spec.slides.filter(s => s.layout !== 'disclaimer');
  const r = await engine().build({spec, dataMap: MOCK});
  assert.equal(r.slides, 10);
  assert.equal(r.layouts.at(-1), 'research:disclaimer');
  assert.ok(r.warnings.some(w => /免责声明/.test(w)));
  const text = pptxText(r.bytes);
  assert.ok(text.includes('免责声明'));
  assert.ok(text.includes('不构成投资建议'));
});

test('D59 6：金额隐藏开启时持仓金额脱敏', async () => {
  const spec = withWatermark(await readJson(join(DECK_DIR, 'examples', 'research_demo.json')));
  const data = {...MOCK, 'quote:600438': {...MOCK['quote:600438'], holdingAmount: '1,280万元'}};
  const r = await engine().build({spec, dataMap: data, maskAmounts: true, sourceAsOf: '2026-11-25 15:00'});
  assert.equal(r.slides, 10);
  const text = pptxText(r.bytes);
  assert.ok(!text.includes('1,280万元'));
});

test('D59 7：30 条路由样例，创建走 deck，修改现有文档/编码不走 deck', () => {
  const create = [
    '做一份通威股份的投研 PPT', '做一份通威股份（600438）近期并购案的投研 PPT，10 页左右',
    '把这周复盘做成汇报胶片', '把通威并购案分析做成 PPT', '给我出一份隆基……不对，通威的投研幻灯片',
    '帮我生成一份光伏行业研究报告 PPT', '把今天量化信号整理成演示文稿', '生成一份投研 PPT',
    '用 research 主题做一份通威股份的 PPT', '帮我做一份组合复盘汇报胶片',
    '把这个研究主题做成幻灯片', '把分析结果做成 PPT', '出一份投研报告幻灯片',
    '做一份 600438 的估值分析 PPT', '把近期公告整理成汇报 PPT', '帮我制作一个股票池信号 PPT',
    '把并购案时间线做成 PPT', '把公司概况做成投研胶片', '生成光伏板块复盘 PPT',
    '把日报做成汇报幻灯片', '麻烦出一份研报 PPT', '做一份财务摘要演示文稿',
    '把通威的财务数据做成 PPT', '生成量化策略回测 PPT', '把研究结论做成投研演示',
    '帮我做一个复盘 PPT', '请生成一份个股研究胶片', '做一份财报解读 PPT',
    '把这份分析做成幻灯片', '帮我生成 QQ……光伏行业投研 PPT',
  ];
  const notDeck = [
    '把第 3 页收益表改成柱状图', '修改刚才那页的标题', '把 PPT 第 2 页这段文字删掉',
    '在现有文档里插入一页', '编辑这个幻灯片', '把这个 Excel 表格的 A1 改成 100',
    '帮我写一段 Python 代码', '用 React 重构这个组件', '修一下 main.mjs 的 bug',
    '在 Word 文档里替换「旧结论」',
  ];
  assert.equal(create.length, 30);
  for (const p of create) assert.equal(routeDeckIntent(p), true, `应命中 deck：${p}`);
  for (const p of notDeck) assert.equal(routeDeckIntent(p), false, `不应命中 deck：${p}`);
  assert.equal(routeDeckIntent('做一份通威股份的投研 PPT', {officeTool: true}), false);
});

test('D59 8：加密模式临时文件仅写 userData/tmp 且生成后清除', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quank-deck-enc-'));
  try {
    const eng = createDeckEngine({python: PY, userData: dir, encrypted: () => true});
    const spec = withWatermark(await readJson(join(DECK_DIR, 'examples', 'research_demo.json')));
    const r = await eng.build({spec, dataMap: MOCK});
    assert.equal(r.tempMode, 'userData');
    assert.equal(r.slides, 10);
    const tmp = join(dir, 'deck', 'tmp');
    const left = await readdir(tmp).catch(() => []);
    assert.deepEqual(left, []);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('D59 9：app_deck_themes 工具与主题/版式目录', async () => {
  assert.deepEqual(THEMES, ['research', 'report', 'product']);
  assert.deepEqual(DECK_THEME_NAMES, ['research', 'report', 'product']);
  assert.equal(LAYOUTS.research.length, 10);
  assert.ok(LAYOUTS.research.includes('disclaimer'));
});


test('D59 10：预测列无来源整列 —、负数颜色可配、来源为空告警', async () => {
  const spec = withWatermark(await readJson(join(DECK_DIR, 'examples', 'research_demo.json')));
  const fin = spec.slides.find(x => x.layout === 'financials');
  fin.title = '财务摘要（近 5 年 + 预测）';
  fin.negativeColor = 'green';
  const data = {...MOCK, 'financials:600438:5y': {...MOCK['financials:600438:5y'], source: undefined}};
  const r = await engine().build({spec, dataMap: data, sourceAsOf: '2026-11-25 15:00'});
  const text = pptxText(r.bytes);
  assert.ok(r.warnings.some(w => /预测列无来源/.test(w)), JSON.stringify(r.warnings));
  assert.ok(text.includes('（近 5 年）'));
  assert.ok(text.includes('-112'));
  assert.ok(text.includes('0E9F6E'));
  assert.ok(r.warnings.some(w => /预测列无来源/.test(w)));
  const noSrc = await engine().build({spec: withWatermark({theme: 'research', slides: [
    {layout: 'summary', title: '核心观点', points: ['要点']}, {layout: 'disclaimer'}]}), sourceAsOf: '2026-11-25'});
  assert.ok(!pptxText(noSrc.bytes).includes('数据来源：'));
});


test('D59 11：财务页三张独立原生图结构（Quick v1.0.0 断言）', async () => {
  const spec = withWatermark(await readJson(join(DECK_DIR, 'examples', 'research_demo.json')));
  const r = await engine().build({spec, dataMap: MOCK, sourceAsOf: '2026-11-25 15:00'});
  const py = `import sys,io,zipfile
from pptx import Presentation
from pptx.enum.chart import XL_CHART_TYPE
prs=Presentation(io.BytesIO(sys.stdin.buffer.read()))
slide=prs.slides[3]
charts=[sh.chart for sh in slide.shapes if sh.has_chart]
assert len(charts)==3
profit=charts[1]
assert profit.chart_type==XL_CHART_TYPE.COLUMN_STACKED
loss=profit.plots[0].series[1]
assert min(v for v in loss.values)<0
xml=profit._chartSpace.xml
assert '<c:dPt>' not in xml
assert 'tickLblPos val="low"' in xml
rects=[(sh.left,sh.top,sh.width,sh.height) for sh in slide.shapes if sh.has_chart]
for a in range(3):
    for b in range(a+1,3):
        ra,rb=rects[a],rects[b]
        assert ra[0]+ra[2]<=rb[0] or rb[0]+rb[2]<=ra[0]
print('OK')`;
  const out = execFileSync(PY, ['-c', py], {input: r.bytes, encoding:'utf8'}).trim();
  assert.equal(out, 'OK');
});
