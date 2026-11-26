import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDeckEngine} from '../runtime/deck-engine.mjs';
import {collectDeckData, enrichDeckSpec, deckPct, deckShanghai, deckAmount} from '../services/app-tools.mjs';

// v1.0.2 deck engine fixes: signals page binding, drawdown sign, trade count wording,
// placeholder-only tables, valuation without peers, bullet marker alignment.
const PY = process.env.WB_TEST_PYTHON || process.env.QUANK_PYTHON || 'python3';
const engine = () => createDeckEngine({python: PY, userData: join(tmpdir(), 'quank-deck-v102')});
const pptxText = bytes => execFileSync(PY, ['-c',
  'import sys,zipfile,io\nz=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))\nprint(" ".join(z.read(n).decode("utf8","ignore") for n in sorted(z.namelist()) if n.endswith(".xml")))'],
  {input: bytes, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
// Per slide: [[kind, x, y, w, h, text]] in inches.
const shapesOf = bytes => JSON.parse(execFileSync(PY, ['-c', [
  'import sys,io,json', 'from pptx import Presentation', 'p=Presentation(io.BytesIO(sys.stdin.buffer.read()))', 'E=914400.0', 'out=[]',
  'for s in p.slides:',
  '  rows=[]',
  '  for sh in s.shapes:',
  '    t=sh.text_frame.text if sh.has_text_frame else ""',
  '    k=str(sh.auto_shape_type) if sh.shape_type==1 else str(sh.shape_type)',
  '    rows.append([k,(sh.left or 0)/E,(sh.top or 0)/E,(sh.width or 0)/E,(sh.height or 0)/E,t])',
  '  out.append(rows)',
  'print(json.dumps(out,ensure_ascii=False))'].join('\n')], {input: bytes, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024}));

const SIGNAL = {at: Date.parse('2026-11-26T07:00:00Z'), summary: {name: '通威股份', action: 'HOLD', actionText: '持有观望', score: 61.2,
  detail: '🚫 趋势未确认，等待放量并观察行业景气与业绩预告是否出现拐点', backtest: {smartPct: 12.346, blindPct: -8.1, excess: 20.44, maxDrawdown: 45.25, trades: 0, winRate: 0}}};
const quant = {calls: 0, async handle(a) { if (a.action === 'signal') { this.calls++; return SIGNAL; } return {pool: []}; }};

test('v1.0.2 deckPct：回撤显示为负值、两位小数、正数带 +', () => {
  assert.equal(deckPct(45.25, {loss: true}), '-45.25%');
  assert.equal(deckPct(-3, {loss: true}), '-3.00%');
  assert.equal(deckPct(12.346), '+12.35%');
  assert.equal(deckPct(null), '—');
  assert.equal(deckPct(55, {sign: false}), '55.00%');
});

test('v1.0.2 enrichDeckSpec：量化信号页绑定本股票的信号和回测', () => {
  const spec = enrichDeckSpec({title: 't', slides: [{layout: 'cover', code: '600438'}, {layout: 'signals'}]});
  assert.deepEqual(spec.slides[1].signals, {$data: 'signals:600438'});
  assert.deepEqual(spec.slides[1].backtest, {$data: 'backtest:600438'});
});

test('v1.0.2 collectDeckData：最大回撤为负、交易次数 0 有说明、同日只算一次', async () => {
  const src = {slides: [{layout: 'signals', signals: {$data: 'signals:600438'}, backtest: {$data: 'backtest:600438'}}]};
  const {map} = await collectDeckData(src, {quant}, Date.parse('2026-11-26T08:00:00Z'));
  const rows = map['backtest:600438'].rows;
  assert.deepEqual(rows[0], ['指标', '智能定投（本机策略）', '普通定投（对照）']);
  const get = k => rows.find(r => r[0] === k);
  assert.equal(get('最大回撤')[1], '-45.25%');
  assert.equal(get('累计收益')[1], '+12.35%');
  assert.equal(get('累计收益')[2], '-8.10%');
  assert.equal(get('完成交易（卖出）')[1], '0（期内无卖出）');
  assert.equal(get('胜率'), undefined, '无卖出时不显示胜率');
  const sig = map['signals:600438'].signals[0];
  assert.equal(sig.value, '持有观望');
  assert.match(sig.note, /综合分 61\.2/);
  assert.doesNotMatch(sig.note, /🚫/);
  assert.ok(sig.note.length <= 34);
  assert.equal(map['signals:600438'].asOf, '2026-11-26 15:00', '截至时间为北京时间');
  assert.equal(quant.calls, 1, '信号按交易日缓存');
});

const H9 = {theme: 'research', title: '通威股份近期并购案投研', watermark: '示例数据（测试 fixture）', slides: [
  {layout: 'cover', title: '通威股份近期并购案投研', stockName: '通威股份', code: '600438'},
  {layout: 'valuation', title: '估值分位与可比公司', percentiles: [{name: 'PE(TTM)', value: null, current: null, note: '当前盈利为负，PE 不适用'},
    {name: 'PB(LF)', value: null, current: 1.62, note: '当前值'}, {name: 'PE 历史分位', value: null, note: '历史分位未提供'}]},
  {layout: 'signals', title: 'QuankSight 量化信号与回测', signals: {$data: 'signals:600438'}, backtest: {$data: 'backtest:600438'}},
  {layout: 'catalysts_risks', title: '催化剂与风险', catalysts: ['并购交易条款落地并披露细节', '硅料价格企稳回升', '海外产能爬坡超预期'],
    risks: ['交易审批与整合进度不及预期', '标的资产业绩承诺无法实现', '行业价格继续下行压制盈利']},
  {layout: 'event', title: '并购案时间线与交易结构', events: [{date: 'T-30', title: '停牌筹划'}, {date: 'T-7', title: '董事会预案'}, {date: 'T', title: '签署交易协议'}],
    structure: [['项目', '内容', '状态'], ['交易方式', '待披露', '—'], ['交易对价', '待披露', '—']]},
  {layout: 'disclaimer'},
]};

test('v1.0.2 渲染：信号卡、回测负回撤、占位表格改说明、无可比公司改估值说明', async () => {
  const {map} = await collectDeckData(H9, {quant}, Date.parse('2026-11-26T08:00:00Z'));
  const r = await engine().build({spec: structuredClone(H9), dataMap: map, theme: 'research', sourceAsOf: '2026-11-26 15:00'});
  assert.equal(r.ok, true);
  const text = pptxText(r.bytes);
  assert.match(text, /持有观望/, '信号卡已渲染');
  assert.match(text, /-45\.25%/);
  assert.match(text, /0（期内无卖出）/);
  assert.doesNotMatch(text, /待披露/, '只有占位的交易结构表不再渲染成表格');
  assert.match(text, /条款尚未披露/);
  assert.match(text, /估值说明/);
  assert.match(text, /可比公司：本次未取得/);
  const slides = shapesOf(r.bytes);
  // signals page: the first card starts right under the title (no empty band)
  const sig = slides[2];
  const card = sig.find(s => s[5] === '持有观望');
  assert.ok(card && card[2] < 1.9, '信号卡位于页面上部');
});

test('v1.0.2 要点行：方块标记与文字垂直居中对齐', async () => {
  const r = await engine().build({spec: structuredClone(H9), dataMap: {}, theme: 'research', sourceAsOf: '2026-11-26 15:00'});
  const page = shapesOf(r.bytes)[3];
  const markers = page.filter(s => /RECTANGLE/.test(s[0]) && Math.abs(s[3] - 0.09) < 0.01 && Math.abs(s[4] - 0.09) < 0.01);
  assert.equal(markers.length, 6);
  for (const m of markers) {
    const cy = m[2] + m[4] / 2;
    const txt = page.find(s => s[5] && s[1] > m[1] && s[1] - m[1] < 0.5 && Math.abs((s[2] + s[4] / 2) - cy) < 0.03);
    assert.ok(txt, `标记 (${m[1].toFixed(2)},${m[2].toFixed(2)}) 旁有居中对齐的文字`);
  }
});

test('v1.0.2 deckAmount / deckShanghai', () => {
  assert.equal(deckAmount(130328791), '1.3亿元');
  assert.equal(deckAmount(56000), '5.6万元');
  assert.equal(deckAmount('18.6亿元'), '18.6亿元');
  assert.equal(deckShanghai(Date.parse('2026-11-26T04:22:00Z')), '2026-11-26 12:22');
});

test('v1.0.2 核心观点：行情 KPI 大字只显示现价，涨跌幅和成交额放到注释行', async () => {
  const spec = {theme: 'research', title: 't', slides: [{layout: 'cover', code: '600438'},
    {layout: 'summary', title: '核心观点', points: ['a'], kpis: [{value: {$data: 'quote:600438'}, label: '最新行情', note: '腾讯行情'}]}]};
  const map = {'quote:600438': {name: '通威股份', price: 11.18, changePct: -0.97, turnover: '1.3亿元', asOf: '2026-11-26 12:05', source: '腾讯行情'}};
  const r = await engine().build({spec, dataMap: map, theme: 'research', sourceAsOf: '2026-11-26 15:00'});
  const page = shapesOf(r.bytes)[1];
  assert.ok(page.some(s => s[5] === '11.18'), '现价单独成行');
  assert.ok(page.some(s => /涨跌幅 -0\.97% · 成交额 1\.3亿元 · 腾讯行情/.test(s[5])));
  assert.ok(!page.some(s => /^现价 11\.18，/.test(s[5])));
});

test('v1.0.2 事件页：无交易条款时日期标签不压到面板标题', async () => {
  const {map} = await collectDeckData(H9, {quant}, Date.parse('2026-11-26T08:00:00Z'));
  const r = await engine().build({spec: structuredClone(H9), dataMap: map, theme: 'research', sourceAsOf: '2026-11-26 15:00'});
  const page = shapesOf(r.bytes)[4];
  const header = page.find(s => s[5] === '事件时间线');
  for (const d of ['T-30', 'T-7', 'T']) {
    const lab = page.find(s => s[5] === d);
    assert.ok(lab && lab[2] >= header[2] + header[4] + 0.02, `${d} 位于标题栏下方`);
  }
});
