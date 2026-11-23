// [v45k] 动态页首页风格、智能记忆改名、股票池排布、信息图卡片、README 智能记忆章节
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { feedPage } from '../src/ui/feed.js';
import { NAV_LAYOUT } from '../src/ui/sidebar.js';
import { contextHeader } from '../src/ui/graph-view.js';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const action = (label, id, x = '', cls = '') => `<button data-action="${id}" data-id="${x}" class="${cls}">${label}</button>`;
const H = 3600e3, NOW = new Date(2026, 10, 20, 15, 0).getTime();

test('feed page: hero with counters, briefing slot, day-grouped rows with badges', () => {
  const state = {feed: {seenAt: 0, dismissed: []}, tasks: [{id: 't1', name: '巡检', status: 'failed', error: '授权已撤销', lastRun: NOW - H, history: [{id: 'h', at: NOW - H, status: 'failed', error: '授权已撤销'}]}],
    activity: [{id: 'a1', title: '行情提醒', detail: '宁德时代（300750）：涨幅达到 5%', time: NOW - 26 * H}, {id: 'a2', title: '已授权文件夹', detail: '项目资料', time: NOW - 27 * H}]}; // [F1c] operation logs no longer show under 全部
  const html = feedPage(state, {action, date: () => '时间', heading: () => '', empty: t => t, now: NOW});
  const doc = new JSDOM(html).window.document;
  assert.ok(doc.querySelector('.feed-page .fd-hero h1')); assert.equal(doc.querySelectorAll('.fd-stat').length, 3);
  assert.ok(html.includes('<!--briefing-->'));
  assert.ok(doc.querySelector('.fd-card .feed-filters'));
  const days = [...doc.querySelectorAll('.fd-day')].map(d => d.firstChild.textContent);
  assert.deepEqual(days, ['今天', '昨天']);
  for (const r of doc.querySelectorAll('.feed-row')) assert.ok(r.querySelector('.fd-badge') && r.querySelector('.fd-kind'));
});

test('智能记忆: sidebar group, header and tabs renamed', async () => {
  const g = NAV_LAYOUT.find(n => n.group === 'context');
  assert.equal(g.title, '智能记忆');
  assert.deepEqual(g.items.map(i => i[2]), ['知识图谱', '记忆库']);
  const doc = new JSDOM(contextHeader({}, {tab: 'graph', date: String})).window.document;
  assert.equal(doc.querySelector('.ctx-head h1').textContent, '智能记忆');
  assert.deepEqual([...doc.querySelectorAll('.ctx-tab')].map(b => b.textContent), ['知识图谱', '记忆库']);
  const app = await read('../src/app.js');
  assert.ok(app.includes(".replace('<!--briefing-->', briefingCard(state, {action}))"));
});

test('layout CSS: feed, stock pool grid, infographic cards', async () => {
  const css = await read('../src/workbench.css'), q = await read('../src/ui/quant.js');
  for (const s of ['.fd-hero{', '.quant-page .plaza-grid.q-pool-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important', '.ig-card .ig-thumb{aspect-ratio:4/3!important']) assert.ok(css.includes(s), s);
  assert.ok(q.includes('<section class="q-pool">') && q.includes('plaza-grid q-pool-grid'));
});

test('README links to release history and demo uses a neutral brand', async () => {
  const md = await read('../../README.md'), demo = await read('../scripts/demo-state.mjs'), fin = await read('../scripts/demo-finance.mjs');
  assert.match(md, /\[发布记录\]\(docs\/releases\/README\.md\)/);
  assert.doesNotMatch(md, /^## 更新记录|^- \*\*v\d+/m);
  assert.ok(!demo.includes('知行志成') && !fin.includes('知行志成'));
  assert.match(fin, /mergeExtraction/);
});
