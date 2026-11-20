// [v45e] Strategy access via WeChat: home button opens a QR dialog; engine card uses plain words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { homeQuant } from '../src/ui/home-quant.js';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const action = (label, id, extra = '', cls = '') => `<button data-action="${id}" class="${cls}">${label}</button>`;
const icon = () => '';

test('home quant panel without a strategy offers the WeChat contact', () => {
  const doc = new JSDOM(homeQuant({quant: {status: 'stopped', pool: []}}, {action, icon})).window.document;
  const b = doc.querySelector('.hq-empty [data-action="quantContact"]');
  assert.ok(b); assert.equal(b.textContent, '接入策略');
  assert.match(doc.querySelector('.hq-empty p').textContent, /findingnoone/);
});

test('engine card says it in plain words and the dialog shows the QR code', async () => {
  const q = await read('../src/ui/quant.js'), app = await read('../src/app.js'), css = await read('../src/workbench.css');
  assert.ok(q.includes("'需要添加微信 findingnoone 获取量化策略和支持。'"));
  assert.ok(!q.includes('根目录需要 wb-engine.json 描述文件'));
  assert.match(q, /action\('添加微信', 'quantContact'/);
  assert.match(app, /actionId === 'quantContact'/); assert.match(app, /assets\/wechat-qr\.jpg/); assert.match(app, /quantCopyWx/);
  assert.match(css, /\.q-contact img\{/);
  assert.ok((await stat(new URL('../src/assets/wechat-qr.jpg', import.meta.url))).size > 20000);
});
