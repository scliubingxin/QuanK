import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {resizeDecision} from '../src/office/office-canvas.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = rel => readFileSync(path.join(here, '..', rel.replace(/^desktop\//, '')), 'utf8');
const appSource = src('src/app.js');
const canvasSource = src('src/office/office-canvas.js');

// 用 with(ctx) 执行产品源码里抽出的函数，使 pageWide / resizeFrame 等赋值回写到 ctx。
const runIn = (ctx, code, expression = '') => new Function('ctx', `with (ctx) {\n${code}\n${expression}\n}`)(ctx);
function between(source, from, to) {
  const a = source.indexOf(from);
  assert.ok(a >= 0, `missing marker: ${from}`);
  const b = source.indexOf(to, a);
  assert.ok(b >= 0, `missing marker: ${to}`);
  return source.slice(a, b);
}
function dom(body = '') {
  return new JSDOM(`<!doctype html><html><body><div id="app"><div class="main"></div></div><div id="modal"></div>${body}</body></html>`).window.document;
}
const htmlEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

test('V100 启动读到 wide:true（pptx 页签）后 pageWide 为 false', () => {
  const line = appSource.split('\n').find(l => l.includes("panelUI.restoreTabs(localStorage.getItem('qk.pageTabs'))"));
  assert.ok(line, 'app.js 应恢复 qk.pageTabs');
  assert.match(line, /pageWide = false/, '恢复时不能用持久化的 wide');
  const stored = {tabs:[{kind:'document', format:'pptx', id:'document:b2462ce7'}], active:'document:b2462ce7', wide:true, width:607};
  const ctx = {
    localStorage:{getItem:() => JSON.stringify(stored)},
    panelUI:{restoreTabs:raw => JSON.parse(raw)},
    pageTabs:[], pageTabId:'', pageWide:true, pageWidth:0,
  };
  runIn(ctx, line);
  assert.equal(ctx.pageWide, false);
  assert.equal(ctx.pageTabs[0].format, 'pptx');
  assert.equal(ctx.pageTabId, 'document:b2462ce7');
  assert.equal(ctx.pageWidth, 607);
});

test('V100 savePanel 始终写入 wide:false 且不持久化滚动位置', () => {
  const fn = between(appSource, 'function savePanel() {', '\nfunction recoverMain()');
  const written = {};
  const ctx = {
    localStorage:{setItem:(key, value) => { written[key] = value; }},
    pageTabs:[{id:'doc-1', kind:'document', scroll:88}], pageTabId:'doc-1', pageWide:true, pageWidth:607,
  };
  runIn(ctx, fn, 'savePanel();');
  const parsed = JSON.parse(written['qk.pageTabs']);
  assert.equal(parsed.wide, false);
  assert.equal(parsed.width, 607);
  assert.deepEqual(parsed.tabs, [{id:'doc-1', kind:'document'}]);
});

test('V100 没有页签时 renderPanel 去掉 pp-wide 并移除面板', () => {
  const fn = between(appSource, 'function renderPanel() {', '\n// [v1.0.0] 原 renderPanel');
  const document = dom('<aside id="pagePanel"><div class="pp-body"></div></aside>');
  document.body.classList.add('pp-on', 'pp-wide');
  const ctx = {
    document, state:{locked:false}, panelTab:() => null, clearOfficeNotice(){},
    disposeFilePreview:undefined, pageWide:true, panelHeadHtml:'x', panelBodyKey:'y',
  };
  runIn(ctx, fn, 'renderPanel();');
  assert.equal(ctx.pageWide, false);
  assert.equal(document.body.classList.contains('pp-wide'), false);
  assert.equal(document.body.classList.contains('pp-on'), false);
  assert.equal(document.getElementById('pagePanel'), null);
});

test('V100 页签渲染抛异常时主区域恢复并显示可关闭错误提示', () => {
  const fn = between(appSource, 'function renderPanel() {', '\n// [v1.0.0] 原 renderPanel');
  const document = dom('<aside id="pagePanel"><div class="pp-body"></div></aside>');
  document.body.classList.add('pp-on', 'pp-wide');
  const tab = {id:'doc<&', kind:'document'};
  const errors = [];
  const ctx = {
    document, state:{locked:false}, panelTab:() => tab, clearOfficeNotice(){},
    renderPanelTab(){ throw new Error('canvas exploded'); },
    escape:value => 'ESC:' + String(value), pageWide:true, console:{error:msg => errors.push(String(msg))},
  };
  runIn(ctx, fn, 'renderPanel();');
  assert.equal(ctx.pageWide, false);
  assert.equal(document.body.classList.contains('pp-wide'), false);
  const error = document.querySelector('#pagePanel .pp-error');
  assert.ok(error, '应出现 .pp-error 提示');
  assert.match(error.textContent, /页面加载失败，已恢复主界面/);
  const button = error.querySelector('button[data-action="ppClose"]');
  assert.ok(button, '错误提示里的按钮应走现有 ppClose 动作');
  assert.equal(button.getAttribute('data-id'), 'ESC:' + tab.id, 'tab.id 必须经 escape() 后再写入 HTML');
  assert.equal(errors.length, 1);
});

// 用 mock 的 ResizeObserver/RAF 驱动产品源码里的 onResize，无需真实 Office 引擎。
function resizeHarness(initialZoom = 1.65) {
  const frames = [];
  const ctx = {
    port:{clientWidth:1320, clientHeight:720, style:{}},
    zoom:initialZoom, zoomMode:'width', stopped:false, resizeFrame:0, lastSize:'', prevSize:'',
    fit:1.65, resets:0, overlays:0, schedules:0, frames,
    fitZoom(){ return this.fit; },
    reset(){ this.resets++; this.zoom = this.fit; },
    renderOverlay(){ this.overlays++; }, schedule(){ this.schedules++; },
    requestAnimationFrame(cb){ frames.push(cb); return frames.length; },
    cancelAnimationFrame(){}, resizeDecision,
  };
  const code = between(canvasSource, '    function onResize(entries = []) {', '\n    function setZoom(mode,value) {');
  const onResize = runIn(ctx, code, 'return onResize;');
  return {
    ctx,
    fire(width, height = 720){ onResize([{contentRect:{width, height}}]); },
    flush(){ const pending = frames.splice(0); for (const cb of pending) cb(); },
  };
}

test('V100 滚动条振荡 A→B→A 时 ResizeObserver reset 次数 ≤ 1', () => {
  const h = resizeHarness(1.65);
  h.fire(1320); h.flush();
  h.ctx.fit = 1.632;
  const h2 = resizeHarness(1.65);
  h2.fire(1320); h2.flush();   // A：稳定尺寸
  h2.ctx.fit = 1.632;
  h2.fire(1305); h2.flush();   // B：滚动条出现，唯一一次 reset
  assert.equal(h2.ctx.resets, 1);
  h2.ctx.fit = 1.65;
  h2.fire(1320); h2.flush();   // A：滚动条消失，识别为振荡
  h2.fire(1305); h2.flush();
  h2.fire(1320); h2.flush();
  assert.ok(h2.ctx.resets <= 1, `振荡后 reset 次数应 ≤1，实际 ${h2.ctx.resets}`);
  assert.match(canvasSource, /scrollbarGutter = 'stable'/, '应从源头消除滚动条振荡');
  assert.match(canvasSource, /new ResizeObserver\(onResize\)/, '回调必须走 onResize');
  assert.ok(h.ctx.overlays > 0, '尺寸未变时应继续绘制 overlay');
});

test('V100 同一尺寸重复回调不会触发 reset', () => {
  const h = resizeHarness(1);
  h.ctx.fit = 2; // 若误判为尺寸变化会立刻 reset
  h.fire(1320); h.flush();
  const first = h.ctx.resets;
  h.fire(1320); h.flush();
  h.fire(1320); h.flush();
  assert.equal(h.ctx.resets, first, '同一尺寸不应再次 reset');
  assert.equal(h.ctx.frames.length, 0, '重复尺寸不应再排 rAF');
  assert.equal(resizeDecision({size:'1320x720', lastSize:'1320x720', fit:2, zoom:1, mode:'width', clientWidth:1320}), 'schedule');
});

test('V100 内置 Python 子进程的 env 都包含 PYTHONDONTWRITEBYTECODE', () => {
  const sites = [
    ['desktop/main.mjs', /runner = spawn\([^\n]*PYTHONDONTWRITEBYTECODE: '1'/],
    ['desktop/runtime/local-onnx-embedding.mjs', /spawn\(python,[^\n]*PYTHONDONTWRITEBYTECODE:'1'/],
    ['desktop/runtime/office-fonts.mjs', /exec\(bin, args, \{env:[^\n]*PYTHONDONTWRITEBYTECODE: '1'/],
    ['desktop/runtime/office-kit.mjs', /spawn\(bin,args,\{cwd:directory,env:[^\n]*PYTHONDONTWRITEBYTECODE:'1'/],
    ['desktop/runtime/office-lok-worker.mjs', /spawn\(bin, args, \{env:[^\n]*PYTHONDONTWRITEBYTECODE:'1'/],
    ['desktop/runtime/office-preview-pool.mjs', /spawn\(bin,args,\{cwd:dir,env:[^\n]*PYTHONDONTWRITEBYTECODE:'1'/],
    ['desktop/services/quant-engine.mjs', /spawnFn\(python, [^\n]*PYTHONDONTWRITEBYTECODE: '1'/],
    ['desktop/services/quant-engine.mjs', /spawn\(py, \[ad\.engine\.entry\][^\n]*PYTHONDONTWRITEBYTECODE: '1'/],
    ['desktop/runtime/command.mjs', /env\.PYTHONDONTWRITEBYTECODE\s*=/],
  ];
  for (const [file, pattern] of sites) assert.match(src(file), pattern, `${file} 的 Python env 缺少 PYTHONDONTWRITEBYTECODE`);
  assert.match(src('desktop/runtime/command.mjs'), /PYTHONDONTWRITEBYTECODE.*\|\|'1'/, '默认应写入 1');
});
