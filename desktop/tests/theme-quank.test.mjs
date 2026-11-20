import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { rankCard, heroArt, homeDashboard } from '../src/ui/home-dashboard.js';
import { iconColor } from '../src/ui/preset-catalog.js';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const action = (l, a, id = '') => `<button data-action="${a}" data-id="${id}">${l}</button>`;
// [theme2] palette taken from the user's reference design: cobalt navy, royal blue, periwinkle / violet accents
const OLD = ['#0078cb', '#0b5394', '#1eaeea', '#1677c9', '#08467e', '#e9f5fc'];
const PALETTE = /^#(2F62F5|4A7CFC|7B6CF6|1236F0|0B2BA6|5B8DEF|6A5CF0|3D5AFE|8C7CFF|2B6CF0)$/;

test('reference palette: stylesheets and home views no longer use the previous blues', async () => {
  for (const f of ['../src/styles.css', '../src/workbench.css', '../src/ui/home-dashboard.js', '../src/ui/home-quant.js', '../src/ui/preset-catalog.js']) {
    const t = (await read(f)).toLowerCase();
    for (const c of OLD) assert.ok(!t.includes(c), `${f} still uses ${c}`);
  }
  const css = await read('../src/workbench.css');
  for (const k of ['--qk-deep:#2f62f5', '--qk-navy:#0b2ba6', '--qk-sky:#8c7cff', '.sidebar{background:linear-gradient', '.nav button.active,.nav-group-head.active{', '.new{background:var(--qk-grad)!important'])
    assert.ok(css.includes(k), k);
  for (const name of ['投研分析师', '财报', 'AKShare', 'X', '风控合规官']) assert.match(iconColor(name), PALETTE);
});

test('hero art and app icons use the new logo (cobalt Q, blue-to-violet curve)', async () => {
  const svg = heroArt();
  assert.match(svg, /id="qkq"/); assert.match(svg, /id="qkc"/);
  assert.match(svg, /stroke="url\(#qkq\)" stroke-width="74"/); assert.match(svg, /stroke="url\(#qkr\)" stroke-width="38"/); assert.match(svg, /fill="#dc2626"/); // [red] rising-red arrow
  const logo = await read('../../public/favicon.svg');
  assert.match(logo, /#0b2ba6/); assert.match(logo, /#b38cff/);
  for (const f of ['../assets/app.icns', '../assets/icon-1024.png', '../src/assets/logo.png']) assert.ok((await stat(new URL(f, import.meta.url))).size > 5000, f);
});

test('ranking card ends with a signal distribution and the watch status', () => {
  const q = {pool: [{code: '1', name: 'A', last: {action: 'BUY', score: 70}}, {code: '2', name: 'B', last: {action: 'HOLD', score: 50}}, {code: '3', name: 'C', last: {action: 'HOLD', score: 40}}, {code: '4', name: 'D', last: {action: 'SELL', score: 10}}],
    watch: {enabled: true, interval: 5, notify: true, premarket: true, premarketTime: '09:15'}, lastWatch: 123};
  const doc = new JSDOM(rankCard(q, {action, date: t => 't' + t})).window.document;
  assert.deepEqual([...doc.querySelectorAll('.qk-dist i')].map(i => [i.className, i.style.width]), [['d-buy', '25%'], ['d-hold', '50%'], ['d-sell', '25%']]);
  assert.deepEqual([...doc.querySelectorAll('.qk-dist-legend b')].map(b => b.textContent), ['1', '2', '1']);
  assert.match(doc.querySelector('.qk-rank-watch').textContent, /5 分钟.*上次检查 t123/s);
  const home = new JSDOM(homeDashboard({state: {settings: {hasKey: true}, quant: q, chats: [], agents: []}, icon: () => '', composer: () => '', action, date: t => 'd' + t, taskStatus: () => ''})).window.document;
  assert.match(home.querySelector('.qk-rank-watch').textContent, /上次检查 d123/);
});
