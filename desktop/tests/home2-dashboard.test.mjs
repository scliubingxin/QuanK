import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { homeDashboard, rankCard, appsCard, newsCard, recentCard, heroArt } from '../src/ui/home-dashboard.js';
import { homeContent } from '../src/ui/workspace.js';
import { capabilityPresets } from '../runtime/capability-presets.mjs';

const icon = n => `<svg data-i="${n}"></svg>`;
const action = (l, a, id = '', c = 'secondary') => `<button class="${c}" data-action="${a}" data-id="${id}">${l}</button>`;
const ctx = {icon, action, composer: () => '<div id="composer" class="composer"></div>', date: t => 't' + t, taskStatus: () => '已完成'};
const Q = {status: 'running', installed: true, pool: [
  {code: '600001', name: '示例<b>一</b>', last: {action: 'BUY', score: 70.25, price: 12.5, changePct: 1.2}},
  {code: '600002', name: '示例二', last: {action: 'SELL', score: 20, price: 8, changePct: -2}},
  {code: '600003', name: '示例三', last: {action: 'HOLD', score: 55, price: 3, changePct: 0.5}}, {code: '600004', name: '未算'}],
  holdings: {}, alerts: [{kind: 'change', time: 30, code: '600002', name: '示例二', from: 'HOLD', to: 'SELL'}, {kind: 'report', time: 20, title: '示例日报', ok: true, summary: '共 5 条', reportId: 'day'}]};
const STATE = {settings: {hasKey: true}, quant: Q, chats: [{id: 'c1', name: '<i>研究</i>', time: 5}, {id: 'c2', name: '无痕', incognito: true, time: 6}],
  activity: [{title: '已记录买入', detail: '600001 100 股', time: 25}],
  agents: [{id: 'assistant', name: 'QuanK 助手', description: '日常工作'}, {id: 'fin-risk', name: '风控合规官', description: '组合风险指标、合规审阅与敏感信息脱敏'}, {id: 'fin-research', name: '投研分析师', description: '个股与行业研究、财报点评'}],
  capabilityPresets: capabilityPresets(), skillPackages: []};

test('home: hero holds the headline, composer and finance shortcuts; cards below', () => {
  const doc = new JSDOM(homeDashboard({state: STATE, ...ctx})).window.document;
  const hero = doc.querySelector('.qk-hero');
  assert.ok(hero.querySelector('svg.qk-hero-art')); assert.match(hero.querySelector('.qk-pill').textContent, /QuanK/);
  assert.match(hero.querySelector('h1').textContent, /今天的市场，从哪里开始/);
  assert.ok(hero.querySelector('#composer'), 'composer sits inside the hero');
  assert.deepEqual([...hero.querySelectorAll('[data-action="suggest"]')].map(b => b.dataset.id), ['stock', 'earnings', 'brief', 'portfolio', 'memo']);
  const cards = [...doc.querySelectorAll('.qk-grid > div > section')].map(s => s.className);
  assert.deepEqual(cards, ['qk-card mk-home', 'home-quant', 'qk-card qk-rank', 'qk-card qk-apps', 'qk-card qk-news', 'qk-card qk-recent']); // [F1] market card first
  assert.equal(doc.querySelector('.home-quant .hq-recent'), null, 'recent changes live in the news card, not twice');
  assert.equal(doc.querySelector('.qk-setup'), null);
  const nokey = new JSDOM(homeDashboard({state: {...STATE, settings: {}}, ...ctx})).window.document;
  assert.ok(nokey.querySelector('.qk-hero .qk-setup [data-action="settings"]'));
  const via = new JSDOM(homeContent({state: STATE, ...ctx})).window.document;
  assert.ok(via.querySelector('.home.qk-home .qk-hero'), 'homeContent renders the dashboard');
});

test('ranking: by composite score and by change, CSS tabs, clicks open the stock', () => {
  const doc = new JSDOM(rankCard(Q, {action})).window.document;
  const score = [...doc.querySelectorAll('.qk-pane-score li')], change = [...doc.querySelectorAll('.qk-pane-change li')];
  assert.deepEqual(score.map(l => l.querySelector('button').dataset.id), ['600001', '600003', '600002'], 'stocks without a result are left out');
  assert.equal(score[0].querySelector('.qk-rank-name').textContent, '示例<b>一</b>');
  assert.equal(score[0].querySelector('b').textContent, '70.3'); assert.ok(score[0].querySelector('.qk-rank-no').classList.contains('top'));
  assert.equal(score[0].querySelector('i').style.width, '100%');
  assert.deepEqual(change.map(l => l.querySelector('b').textContent), ['+1.20%', '+0.50%', '-2.00%']);
  assert.ok(change[2].querySelector('b').classList.contains('qk-down'));
  assert.ok(doc.querySelector('#qk-rank-score[checked]') && doc.querySelector('label[for="qk-rank-change"]'));
  assert.ok(new JSDOM(rankCard({pool: []}, {action})).window.document.querySelector('[data-action="quantAdd"]'));
});

test('apps: finance agents first, finance skills tab adds presets', () => {
  const doc = new JSDOM(appsCard(STATE, {action})).window.document;
  const agents = [...doc.querySelectorAll('.qk-pane-agents .qk-app')];
  assert.deepEqual(agents.map(a => a.dataset.id), ['fin-research', 'fin-risk', 'assistant']);
  assert.ok(agents.every(a => a.dataset.action === 'useAgent'));
  assert.deepEqual([...agents[1].querySelectorAll('.qk-chips em')].map(e => e.textContent), ['# 组合风险指标', '# 合规审阅与敏感信']);
  const skills = [...doc.querySelectorAll('.qk-pane-skills .qk-app')];
  assert.equal(skills.length, 8); assert.ok(skills.every(s => s.dataset.action === 'addPresetSkill' && s.dataset.id.startsWith('fin-')));
  const sha = capabilityPresets().skills.find(s => s.id === skills[0].dataset.id).sha256;
  const done = new JSDOM(appsCard({...STATE, skillPackages: [{sha256: sha}]}, {action})).window.document.querySelector('.qk-pane-skills .qk-app');
  assert.equal(done.dataset.page, 'agents'); assert.match(done.textContent, /已添加/);
});

test('news and recent: merged and newest first, incognito chats hidden, links', () => {
  const doc = new JSDOM(newsCard(STATE, {date: t => 't' + t})).window.document;
  const rows = [...doc.querySelectorAll('.qk-list li button')];
  assert.deepEqual(rows.map(r => r.querySelector('.qk-tag').textContent), ['信号', '动态', '日报']);
  assert.deepEqual([rows[0].dataset.action, rows[0].dataset.id], ['quantOpen', '600002']); assert.equal(rows[2].dataset.id, 'day');
  assert.match(rows[1].textContent, /已记录买入：600001 100 股/);
  assert.ok(doc.querySelector('[data-page="feed"].qk-more'));
  assert.match(new JSDOM(newsCard({}, {date: String})).window.document.body.textContent, /会出现在这里/);
  const r = new JSDOM(recentCard(STATE, {icon, date: t => 't' + t, taskStatus: () => '已完成'})).window.document;
  const items = [...r.querySelectorAll('[data-action="openChat"]')];
  assert.deepEqual(items.map(i => i.dataset.id), ['c1']); assert.match(items[0].textContent, /<i>研究<\/i>已完成/);
});

test('hero art is inline SVG only; styles present', async () => {
  const svg = heroArt();
  assert.ok(!/href=|<image|url\(http/.test(svg), 'no external assets');
  const css = await readFile(new URL('../src/workbench.css', import.meta.url), 'utf8');
  for (const k of ['.home.qk-home{', '.qk-hero{', '#qk-rank-score:checked~.qk-pane-score', '.qk-grid{']) assert.ok(css.includes(k), k);
});
