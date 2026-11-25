// [F1f] composer: agent avatar pill, 计划/研究/无痕 beside the composer, pickers not clipped, drag & drop / paste
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { compactComposer } from '../src/ui/composer.js';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const base = {state: {agents: [{id: 'assistant', name: 'QuankSight 助手'}, {id: 'fin-research', name: '投研分析师'}]}, agentId: 'fin-research', files: [], images: [], sendImages: false, live: false, toolsEnabled: true, icon: n => `<svg data-i="${n}"></svg>`, escape: esc, modelName: 'deepseek-chat', modelMarkup: ''};

test('composer shows the selected agent avatar and the mode chips', () => {
  const doc = new JSDOM(compactComposer({...base, modes: {show: true, plan: true, research: false, incognito: false, incognitoAllowed: true}})).window.document;
  const pill = doc.querySelector('.composer-agent-pill'); assert.ok(pill.querySelector('.av.composer-agent-av.av-agent svg')); assert.equal(pill.querySelector('select#agent').value, 'fin-research');
  const modes = [...doc.querySelectorAll('.composer-modes .composer-mode')];
  assert.deepEqual(modes.map(b => b.dataset.action), ['togglePlan', 'toggleResearch', 'toggleIncognito']);
  assert.deepEqual(modes.map(b => b.classList.contains('chosen')), [true, false, false]);
  assert.equal(new JSDOM(compactComposer({...base, modes: {show: true, incognitoAllowed: false}})).window.document.querySelectorAll('.composer-mode').length, 2, 'no 无痕 inside an existing chat');
  assert.equal(new JSDOM(compactComposer(base)).window.document.querySelector('.composer-modes'), null, 'hidden while a reply is running');
});

test('wiring: topbar no longer carries the modes; drag & drop and paste reach a bounded IPC', async () => {
  const [app, main, pre, css] = await Promise.all(['../src/app.js', '../main.mjs', '../preload.cjs', '../src/workbench.css'].map(read));
  assert.doesNotMatch(app, /class="topbar-action[^"]*" data-action="togglePlan"/); assert.doesNotMatch(app, /class="topbar-action[^"]*" data-action="toggleIncognito"/);
  assert.match(app, /modes:\{show:\['home','chat'\]\.includes\(page\)&&!chatLive\(\)/);
  for (const s of ["document.addEventListener('drop'", "document.addEventListener('paste'", "invoke('chatDropImport'", "agentId = e.target.value; render();"]) assert.ok(app.includes(s), s);
  assert.match(pre, /'chatAttachmentImport','chatDropImport'/);
  assert.match(main, /register\('chatDropImport'/); assert.match(main, /const importAttachment=async\(source,range\)=>/); assert.match(main, /return importAttachment\(result\.filePaths\[0\],range\);/);
  assert.match(main, /bytes\.length > 32 \* 1024 \* 1024/); assert.match(main, /图片仅支持 PNG \/ JPEG/);
  assert.ok(css.includes('.qk-hero .compact-composer{overflow:visible!important;backdrop-filter:none!important'));
  assert.ok(css.lastIndexOf('[F1f]') > css.lastIndexOf('[F1e]'));
});
