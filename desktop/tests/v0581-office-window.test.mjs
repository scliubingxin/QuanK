import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile,mkdtemp,mkdir,writeFile,chmod,symlink,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {filePreviewPanel} from '../src/ui/office-preview.js';
import {officeResultCard} from '../src/ui/office-cards.js';
import {resizeDecision} from '../src/office/office-canvas.js';
import {createOfficeEditWindows} from '../main/office-edit-windows.mjs';
import {runtimeRoot,bundledExecutable} from '../runtime/bundled-runtime.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = file => readFile(path.join(here,'..',file),'utf8');
const action = (label,name,id='',kind='secondary') => `<button data-action="${name}" data-id="${id}" class="${kind}">${label}</button>`;
const doc = {id:'doc-1',name:'季度研报',format:'pptx',revision:3};

test('F581 页签是只读预览：不挂载画布，编辑按钮在右上角，菜单无独立窗口项', async () => {
  const html = filePreviewPanel(doc,{action,icon:()=>'',native:true,inTab:true});
  assert.match(html,/data-action="documentOfficeWindow" data-id="doc-1" class="file-window-edit"/);
  assert.match(html,/✎/);
  assert.match(html,/正在独立窗口中编辑/);
  assert.match(html,/data-office-editing[^>]*hidden/);
  assert.doesNotMatch(html,/data-office-edit-status/);
  const menu = html.match(/<details class="file-menu">[\s\S]*?<\/details>/)[0];
  for (const label of ['下载','版本历史','在成果中心查看']) assert.match(menu,new RegExp(label));
  assert.doesNotMatch(menu,/在独立窗口打开/);
  const panel = await src('src/ui/page-panel.js');
  assert.doesNotMatch(panel,/mountPanelOffice|attachView|createOfficeToolbar|createFloatToolbar/);
  const app = await src('src/app.js');
  assert.doesNotMatch(app,/mountPanelOffice|attachOfficeTab/);
  assert.match(app,/页签是只读预览|read-only preview/);
});

test('F581 编辑按钮走独立窗口，同一文档只开一个窗口且不弹授权', async () => {
  const handlers = new Map(), created = [], events = [], approvals = [];
  const viewSession = Object.assign(new EventEmitter(), {
    kind:'impress', readOnly:false, state:new Map(), selection:{kind:'none',rects:[]},
    on(event,fn){ EventEmitter.prototype.on.call(this,event,fn); return () => this.off(event,fn); },
    save:async()=>({ok:true}), reload:async()=>({ok:true}), toScreen:r=>r,
    resolveConflict:async()=>({ok:true}), resolveRecovery:async()=>({ok:true}),
  });
  const view = {session:viewSession, request:async()=>({}), metadata:{width:960,height:540}, close:async()=>{}, controller:undefined};
  let opened = 0;
  class Window extends EventEmitter {
    constructor(options){ super(); this.options=options; this.webContents=Object.assign(new EventEmitter(),{
      id:created.length+1, mainFrame:{url:pathToFileURL(path.resolve('desktop-fixture/src/office/window.html')).href+'?doc=doc-1',postMessage(){}},
      setWindowOpenHandler(){}, send(){},
    }); created.push(this); }
    isDestroyed(){return false;} isMinimized(){return false;} restore(){} show(){this.shown=(this.shown||0)+1;} focus(){this.focused=(this.focused||0)+1;}
    isVisible(){return true;} setTitle(t){this.title=t;} async loadURL(u){this.webContents.mainFrame.url=u;} destroy(){this.emit('closed');}
  }
  const savedPorts = [];
  class Channel {
    constructor(){ this.port1={on(){},close(){},postMessage(m){savedPorts.push(m);},start(){}}; this.port2={close(){}}; }
  }
  const manager = createOfficeEditWindows({
    BrowserWindow:Window, ipcMain:{handle:(name,fn)=>handlers.set(name,fn)}, MessageChannelMain:Channel, here:path.resolve('desktop-fixture'),
    sessions:async()=>({open:async input=>{opened++;assert.equal(input.mode,'edit');return view;},closeView:async()=>{}}),
    documents:{bytes:()=>({bytes:Buffer.alloc(2*1024*1024)})},
    canOpen:()=>true, onEvent:(id,type,detail)=>events.push({id,type,detail}),
  });
  const first = await manager.open('doc-1',3);
  assert.equal(first.status,'opened');
  assert.equal(created.length,1);
  const attach = handlers.get('willbuddy-office-window:attach');
  const event = {sender:created[0].webContents, senderFrame:created[0].webContents.mainFrame};
  const attached = await attach(event,{token:'00000000-0000-4000-8000-000000000000'});
  assert.equal(attached.status,'ready');
  assert.equal(opened,1);
  assert.equal(approvals.length,0); // no approve() channel is used at all
  const second = await manager.open('doc-1',3);
  assert.equal(second.existing,true);
  assert.equal(created.length,1);
  assert.equal(created[0].focused,2);
  viewSession.emit('saved',{revision:4});
  assert.ok(events.some(e=>e.type==='saved'));
  viewSession.emit('dirty',{});
  assert.ok(events.some(e=>e.type==='dirty'));
  await assert.rejects(attach({sender:{id:999,mainFrame:{url:'file:///fake'}},senderFrame:{url:'file:///fake'}},{token:'00000000-0000-4000-8000-000000000000'}),/不可信/);
  await manager.close();
});

test('F581 窗口保存后页签刷新、编辑提示条可点击聚焦', async () => {
  const app = await src('src/app.js');
  assert.match(app,/onOfficeWindow\?\.\(/);
  assert.match(app,/event\.type === 'saved'/);
  assert.match(app,/update\('state'\)/);
  assert.match(app,/editingWindows\.has\(banner\.dataset\.id\)/);
  assert.match(app,/officeWindowFocus/);
  const preview = await src('src/ui/office-preview.js');
  assert.match(preview,/panel\.addEventListener\('office-locate'/);
  assert.match(preview,/command:'jump'/);
});

test('F581 O4 结果卡提供预览定位与编辑两个按钮', () => {
  const card = officeResultCard({title:'已修改 1 处',undoToken:'undo-1',expiresAt:Date.now()+86400000,
    items:[{title:'第 2 段'}],revision:2},action);
  assert.match(card,/预览定位/);
  assert.match(card,/data-action="officeEditWindow"/);
  assert.doesNotMatch(card,/在右侧打开并定位/);
  const appSource = 'officeEditWindow';
  assert.equal(appSource,'officeEditWindow');
});

test('F581 展开/还原 10 次不触发缩放抖动或白屏', () => {
  // The v0.58.0 bug: ResizeObserver -> fitZoom -> reset() -> layout() changed
  // scrollbars -> ResizeObserver again, synchronously, starving the renderer.
  // The fix coalesces into one rAF and ignores epsilon-sized changes.
  const started = performance.now();
  let lastSize = '', zoom = 1, resets = 0;
  for (let i=0;i<10;i++) {
    const width = i%2===0 ? 460 : 1320;
    const size = width+'x'+720;
    const fit = width*15/12000; // writer 'width' fit
    const decision = resizeDecision({size,lastSize,fit,zoom,mode:'width',clientWidth:width});
    if (decision==='reset') { resets++; zoom = fit; }
    lastSize = size;
    // a scrollbar changes clientWidth by 15px but the fitted zoom by < 0.001 after settling
    const settled = resizeDecision({size:(width-15)+'x'+720,lastSize:size,fit:zoom+0.0004,zoom,mode:'width',clientWidth:width-15});
    assert.equal(settled,'schedule');
  }
  assert.equal(resets,10);
  assert.ok(performance.now()-started < 200, '10 次展开/还原决策应远小于 200ms');
  const source = readFileSyncCanvas();
  assert.match(source,/new ResizeObserver\(onResize\)/);
  assert.match(source,/requestAnimationFrame\(\(\) =>/);
  assert.match(source,/resizeDecision\(\{size/);
});

function readFileSyncCanvas() {
  return readFileSync(path.join(here,'..','src/office/office-canvas.js'),'utf8');
}

test('F581 runtimeRoot 与 bundledExecutable 都规范化符号链接运行时根目录', async t => {
  const base = await mkdtemp(path.join(await realpath(tmpdir()), 'f581-runtime-'));
  t.after(() => rm(base, {recursive:true, force:true}));
  const real = path.join(base, 'real');
  await mkdir(path.join(real, 'python/bin'), {recursive:true});
  await mkdir(path.join(real, 'WillBuddyEngine/Contents/MacOS'), {recursive:true});
  await writeFile(path.join(real, 'RUNTIMES.json'), JSON.stringify({schema:1, architecture:'arm64'}));
  const python = path.join(real, 'python/bin/python3.12');
  const office = path.join(real, 'WillBuddyEngine/Contents/MacOS/soffice');
  for (const file of [python, office]) { await writeFile(file, 'fixture'); await chmod(file, 0o755); }
  const link = path.join(base, 'link');
  await symlink(real, link, 'dir');
  const previous = {defaultApp:process.defaultApp, env:process.env.QUANK_DEV_OFFICE_RUNTIME};
  process.defaultApp = true;
  process.env.QUANK_DEV_OFFICE_RUNTIME = link;
  try {
    assert.equal(runtimeRoot(), await realpath(real));
    assert.equal(await bundledExecutable('python'), await realpath(python));
    assert.equal(await bundledExecutable('office'), await realpath(office));
  } finally {
    process.defaultApp = previous.defaultApp;
    if (previous.env === undefined) delete process.env.QUANK_DEV_OFFICE_RUNTIME;
    else process.env.QUANK_DEV_OFFICE_RUNTIME = previous.env;
  }
});


test('V100-3 createOfficeEditWindows 必须注入 MessageChannelMain（无全局 mock）', () => {
  assert.throws(() => createOfficeEditWindows({BrowserWindow:class{}, ipcMain:{}, here:'x', sessions:async()=>({}), documents:{}}),
    /MessageChannelMain is required/);
  assert.equal(globalThis.MessageChannelMain, undefined, '测试不得依赖全局 MessageChannelMain');
});
