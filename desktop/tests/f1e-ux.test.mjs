// [F1e] screenshot feedback: home tile row, K-line ghost text, AI insight layout, chart axis, factor / indicator cards, feed read
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { insightHtml, parseInsight, inline } from '../src/ui/insight.js';
import { klineSvg } from '../src/shared/market.js';
import { visibleFeed, applyFeedAction, feedUnread } from '../src/shared/feed.js';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const RAW = '## 一句话结论 **中性偏空（暂停本次定投、不清仓）**：行业景气仍在下行，公司业绩续亏。 ## 大模型复核要点 - **技术面：弱势空头排列，无买点**：最新价 11.11 已跌破均线；今日 -2.46%、5 日 -2.11%。 - **基本面：亏损+质量双重恶化**：净利润 -67.59 亿。 ## 算法可能忽略的风险 - **舆情与基本面严重背离风险**：新闻 0.8 偏暖。 - **资金面数据缺失**：主力资金 reason 显示不可用。';

test('insight: inline markdown becomes verdict hero + section cards', () => {
  const secs = parseInsight(RAW);
  assert.deepEqual(secs.map(s => s.title), ['一句话结论', '大模型复核要点', '算法可能忽略的风险']);
  assert.equal(secs[1].items.length, 2); assert.equal(secs[1].items[0].lead, '技术面：弱势空头排列，无买点');
  const doc = new JSDOM(insightHtml(RAW, {name: '通威股份', code: '600438'})).window.document;
  assert.equal(doc.querySelector('.in-hero.in-bear .in-verdict').textContent, '中性偏空（暂停本次定投、不清仓）');
  assert.equal(doc.querySelectorAll('.in-card').length, 2); assert.ok(doc.querySelector('.in-card.in-k-risk'));
  assert.equal(doc.querySelectorAll('.in-card li .in-lead').length, 4);
  assert.match(doc.querySelector('.in-stats').textContent, /2个分析维度4条要点2条风险提示/);
  assert.ok(!doc.body.innerHTML.includes('**') && !doc.body.innerHTML.includes('##'));
  assert.match(inline('今日 -2.46%，昨日 +1.2%'), /in-down">-2\.46%.*in-up">\+1\.2%/);
  assert.ok(!insightHtml('<img src=x onerror=1>').includes('<img'));
});

test('K line: text never inherits the app-wide svg stroke; volume label clear of the date row', () => {
  const bars = Array.from({length: 130}, (_, i) => ({date: `2026-0${1 + Math.floor(i / 28) % 9}-${String(1 + i % 28).padStart(2, '0')}`, open: 10, close: 10 + (i % 3) - 1, high: 12, low: 9, volume: 100 + i}));
  const svg = klineSvg(bars, {w: 1000, h: 460});
  assert.match(svg, /<svg class="mk-kline"[^>]*style="[^"]*stroke:none/);
  for (const t of svg.match(/<text [^>]*>/g)) assert.match(t, /stroke:none/);
  const dateY = Number(/<text x="[\d.]+" y="([\d.]+)"[^>]*text-anchor:middle">\d\d-/.exec(svg)[1]), volY = Number(/<text x="10" y="([\d.]+)"[^>]*>(?:<tspan[^>]*>)成交量/.exec(svg)[1]);
  assert.ok(volY - dateY >= 16, `volume label ${volY} vs date row ${dateY}`);
});

test('feed: opening an item marks just that item read; items that need action stay unread', () => {
  const data = {feed: {seenAt: 0, dismissed: []}, chats: [{id: 'c1', name: 'x'}], activity: [{id: 'a1', title: '行情提醒', detail: 'x（300750）', time: 2000}, {id: 'a2', title: '行情提醒', detail: 'y（600519）', time: 3000}]};
  assert.equal(feedUnread(data), 2);
  data.feed = applyFeedAction(data, {action: 'read', id: 'log:a1'});
  assert.deepEqual(visibleFeed(data, 'unread').map(x => x.id), ['log:a2']); assert.equal(feedUnread(data), 1);
  data.feed = applyFeedAction(data, {action: 'read', id: 'log:a1'}); assert.equal(data.feed.read.length, 1, 'no duplicates');
  assert.throws(() => applyFeedAction(data, {action: 'read', id: ''}), /不存在/);
});

test('wiring: home tile row, insight modal, factor / indicator cards, chart axis room, viz manifest', async () => {
  const [css, app, q, frame, man] = await Promise.all(['../src/workbench.css', '../src/app.js', '../src/ui/quant.js', '../src/viz/frame.js', '../src/viz/VIZ-MANIFEST.json'].map(read));
  assert.ok(css.lastIndexOf('[F1e]') > css.lastIndexOf('[F1d]'));
  for (const s of ['.qk-home .home-quant .hq-grid .hq-stock .hq-name{', '.av svg{stroke:none', '.in-hero{', '.qf-bar{', '.qi-grid{']) assert.ok(css.includes(s), s);
  assert.ok(app.includes("insightHtml(r.text || '', {name: r.name || '', code: id})")); assert.ok(app.includes("closest?.('.feed-row[data-feed].unread')"));
  assert.ok(/class="qf-row/.test(q) && q.includes('class="qi-grid"'));
  assert.match(frame, /bottom: c\.labels\.length > 24 && !horizontal \? 40 : 8/);
  const f = JSON.parse(man).files.find(x => x.name === 'frame.js');
  assert.equal(f.sha256, createHash('sha256').update(frame).digest('hex')); assert.equal(f.bytes, Buffer.byteLength(frame));
});
