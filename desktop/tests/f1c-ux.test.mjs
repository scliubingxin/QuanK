// [F1c] screenshot feedback: logo, composer, avatar, K line, model settings, home stock tile, feed logs, signal popups
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { klineSvg, trendSvg } from '../src/shared/market.js';
import { modelForm, modelLibrary, bindModelForm, MODEL_PROVIDERS, providerOf } from '../src/ui/models.js';
import { visibleFeed, buildFeed } from '../src/shared/feed.js';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const bars = n => Array.from({length: n}, (_, i) => { const c = 100 + Math.sin(i / 5) * 8; return {date: `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + i % 28).padStart(2, '0')}`, open: c - 1, close: c, high: c + 2, low: c - 3, volume: 1000 + i, pct: 0.5}; });

test('K line: inline styles, real pixel width, no stretching, transparent hover columns', () => {
  const svg = klineSvg(bars(150), {w: 1200, last: 120});
  assert.doesNotMatch(svg, /preserveAspectRatio="none"/); assert.match(svg, /width="1200"/);
  assert.equal((svg.match(/class="mk-hit"[^>]*style="fill:transparent;stroke:none"/g) || []).length, 120);
  assert.match(svg, /data-t="[^"]*开 [^"]*收 /); assert.match(svg, /class="mk-cross"/);
  assert.ok(!/<text [^>]*class=/.test(svg), 'text is styled inline');
  assert.match(trendSvg([{price: 10, avg: 10, volume: 1}, {price: 10.2, avg: 10.1, volume: 2}], 10, {w: 900}), /width="900"/);
});

test('model settings: provider → key → model, advanced fields kept, binding fills presets and tests the connection', async () => {
  assert.equal(MODEL_PROVIDERS.length, 10); assert.equal(providerOf('https://api.deepseek.com/'), 'deepseek'); assert.equal(providerOf('https://x.example/v1'), 'custom');
  const html = modelForm({}, true, esc);
  for (const n of ['provider', 'apiKey', 'model', 'baseUrl', 'name', 'kind', 'protocol', 'effort', 'priority', 'maxSteps', 'maxInputChars', 'outputTokens', 'tokenParameter', 'tools', 'vision', 'enabled', 'persistKey']) assert.match(html, new RegExp(`name="${n}"`), n);
  assert.match(html, /name="persistKey" checked/); assert.match(html, /高级设置/); assert.match(html, /测试连接/);
  assert.match(modelForm({name: 'Test', hasKey: true, maxSteps: 24}, true, esc), /name="maxSteps" type="number" value="24"/);
  const lib = new JSDOM(modelLibrary({modelProfiles: [{id: 'm1', name: 'DeepSeek · deepseek-chat', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com', kind: 'balanced', enabled: true, hasKey: true, keySaved: true}]}, esc)).window.document;
  assert.ok(lib.querySelector('.ml-card [data-action="modelEdit"][data-id="m1"]')); assert.match(lib.body.textContent, /密钥已加密保存/); assert.ok(lib.querySelector('[data-action="legacySettings"]'));
  assert.match(modelLibrary({}, esc), /还没有添加模型/);
  const dom = new JSDOM(`<div id="m">${html}</div>`), d = dom.window.document, calls = [];
  bindModelForm(d.getElementById('m'), {test: async p => { calls.push(p); return p.kind === 'models' ? {models: ['qwen-plus', 'qwen-max']} : {ok: true, ms: 321, reply: '好'}; }});
  const prov = d.querySelector('[data-mf-provider]'); prov.value = 'qwen'; prov.dispatchEvent(new dom.window.Event('change'));
  assert.equal(d.querySelector('[name="baseUrl"]').value, 'https://dashscope.aliyuncs.com/compatible-mode/v1'); assert.equal(d.querySelector('[name="protocol"]').value, 'qwen');
  assert.equal(d.querySelector('[name="model"]').value, 'qwen-plus'); assert.match(d.querySelector('[name="name"]').value, /阿里云百炼 · qwen-plus/);
  d.querySelector('[name="apiKey"]').value = 'sk-test'; d.querySelector('[data-mf-test]').click(); await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(calls[0], {baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', apiKey: 'sk-test', kind: 'chat'}); assert.match(d.querySelector('[data-mf-result]').textContent, /连接成功 · 321 ms/);
  d.querySelector('[data-mf-fetch]').click(); await new Promise(r => setTimeout(r, 5)); assert.equal(d.querySelectorAll('#mfModels option').length, 2);
  prov.value = 'custom'; prov.dispatchEvent(new dom.window.Event('change')); assert.equal(d.querySelector('.mf-custom').hidden, false);
});

test('feed: operation logs stay out of 全部 (still under 记录); market alerts are quant items', () => {
  const data = {feed: {seenAt: 0, dismissed: []}, activity: [{id: 'a1', title: '已记录买入', detail: '000876 2000 股', time: 1000}, {id: 'a2', title: '行情提醒', detail: '宁德时代（300750）：涨幅达到 5%', time: 2000}]};
  const all = visibleFeed(data, 'all'); assert.deepEqual(all.map(x => x.kind), ['quant']); assert.equal(all[0].unread, true);
  assert.deepEqual(visibleFeed(data, 'log').map(x => x.title), ['已记录买入']);
  assert.equal(buildFeed(data).find(x => x.title === '行情提醒').actions[0].id, '300750');
});

test('wiring: logo, composer dock, avatar, home tile row, model test IPC, signal popups', async () => {
  const [css, app, main, pre, mk] = await Promise.all(['../src/workbench.css', '../src/app.js', '../main.mjs', '../preload.cjs', '../src/ui/market.js'].map(read));
  for (const s of ['.brand-mark{background:transparent!important', '.qk-hero .composer-dock{background:transparent!important', '.profile .avatar{flex:0 0 34px!important', '.qk-home .hq-name{display:grid!important', '.sig-item{']) assert.ok(css.includes(s), s);
  assert.ok(css.lastIndexOf('[F1c]') > css.lastIndexOf('[F1]'));
  for (const s of ['<div class="avatar">QK</div>', "bindModelForm($('#modal'),{test:x=>invoke('modelTest',x)})", 'function signalPopups()', 'signalPopups();', "actionId === 'mkSignal'", "modal('模型设置'"]) assert.ok(app.includes(s), s);
  assert.match(main, /register\('modelTest'/); assert.match(pre, /'modelProfile','modelTest'/);
  assert.match(mk, /class="mk-hover"/); assert.match(mk, /box\.addEventListener\('mousemove'/);
});
