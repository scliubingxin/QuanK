#!/usr/bin/env node
/**
 * F581 real-window self test (single run, no retry loop).
 * Run from desktop/:
 *   node_modules/electron/dist/Electron.app/Contents/MacOS/Electron /tmp/f581-app
 * where /tmp/f581-app/package.json has main = <this file> (so Electron reports
 * defaultApp=true and QUANK_DEV_OFFICE_RUNTIME is honoured).
 *
 * Never touches /Applications/QuanK.app. QUANK_SELFTEST=1 suppresses native
 * error dialogs in the product. All failures go to TRACE and the report JSON.
 * This file lives under scripts/ only and is not in the packaged build.files.
 */
import {app, BrowserWindow} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir, writeFile} from 'node:fs/promises';
import {appendFileSync, writeFileSync, readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const P = '/Users/liubingxin/.quickwork/profiles/enterprise-2bac1a6dc2b0-ap-northeast-1/chat_agent_files/SYSTEM/agent_files/quank/preview/v0581';
const DATA = '/tmp/f581-selftest-home';
const RUNTIME = process.env.QUANK_DEV_OFFICE_RUNTIME || '/private/tmp/f581-runtimes';
const TRACE = '/tmp/f581-selftest-trace.log';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const trace = line => appendFileSync(TRACE, line + '\n');
const report = {startedAt:Date.now(), timings:{}, samples:{}, errors:[]};
process.on('uncaughtException', error => { report.errors.push('uncaught: '+error.message); trace('UNCAUGHT '+error.message); });
process.on('unhandledRejection', error => { report.errors.push('rejection: '+(error?.message||error)); trace('REJECTION '+(error?.message||error)); });
const mark = (name, ms) => { report.timings[name] = ms; trace('TIMING '+name+' '+ms); };

async function js(win, expression) {
  if (!win || typeof win.isDestroyed === 'function' && win.isDestroyed()) return null;
  try { return await win.webContents.executeJavaScript(expression); }
  catch (error) { report.errors.push('js: '+error.message); return null; }
}
async function until(label, fn, tries = 400, interval = 250) {
  for (let i = 0; i < tries; i++) {
    let value;
    try { value = await fn(); } catch (error) { report.errors.push(label+': '+error.message); }
    if (value) return value;
    await sleep(interval);
  }
  throw Error(label+' 超时');
}
const findWindow = fragment => BrowserWindow.getAllWindows().find(w =>
  typeof w.isDestroyed === 'function' && !w.isDestroyed() &&
  new RegExp(fragment).test(w.webContents.getURL?.() || '')) || null;
function nonWhiteRatio(bitmap) {
  if (!bitmap || bitmap.length < 4) return 0;
  let nonWhite = 0, count = 0;
  for (let i = 0; i + 2 < bitmap.length; i += 64) { count++; if (bitmap[i] < 244 || bitmap[i+1] < 244 || bitmap[i+2] < 244) nonWhite++; }
  return count ? nonWhite/count : 0;
}
async function capture(win, name) {
  const cap = await win.webContents.capturePage();
  await writeFile(path.join(P, name+'.png'), cap.toPNG());
  let ratio = 0;
  try { ratio = nonWhiteRatio(await cap.toBitmap()); } catch (error) { report.errors.push('bitmap: '+error.message); }
  report.samples[name] = {nonWhiteRatio:Math.round(ratio*1000)/1000};
  return ratio;
}
function cleanup() {
  let listing = '';
  try { listing = execFileSync('/bin/ps', ['-axo','pid=,command='], {encoding:'utf8'}); } catch {}
  const patterns = ['/tmp/f581-selftest', '/private/tmp/f581-runtimes'];
  // Never signal our own ancestor shells (they carry the same env on the
  // command line); walk the process tree upwards and exclude all of them.
  const skip = new Set([process.pid]);
  for (let parent = process.ppid; parent > 1; ) {
    skip.add(parent);
    let next;
    try { next = Number(execFileSync('/bin/ps', ['-o','ppid=','-p',String(parent)], {encoding:'utf8'}).trim()); } catch { break; }
    if (!next || next === parent || skip.has(next)) break;
    parent = next;
  }
  const pids = [];
  for (const line of listing.split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!m || skip.has(Number(m[1]))) continue;
    if (patterns.some(p => m[2].includes(p)) && !m[2].includes('/bin/ps -axo')) pids.push(Number(m[1]));
  }
  for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} }
  if (pids.length) {
    execFileSync('/bin/sleep', ['1']);
    for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  }
  trace('CLEANED '+pids.length+' child processes');
}

let mainWindow, editWindow, documents;
async function seed() {
  const [{Store}, {generateDocument}, {createDocumentService}] = await Promise.all([
    import('../core.mjs'), import('../runtime/documents.mjs'), import('../services/documents.mjs'),
  ]);
  const store = new Store(DATA); await store.load();
  documents = createDocumentService({store});
  const slides = [];
  for (let i = 0; i < 50; i++) slides.push({layout:'summary', title:'Slide '+(i+1), points:['收益 A '+i, '收益 B '+i]});
  const deck = await generateDocument('pptx', JSON.stringify({title:'F581 real window deck', slides}));
  const docx = (await generateDocument('docx', JSON.stringify({title:'F581', blocks:[
    {type:'paragraph', text:'第一段：真实窗口自测。'}, {type:'paragraph', text:'第二段：加粗与自动保存校验。'},
  ]}))).bytes;
  await writeFile('/tmp/f581-selftest-deck.pptx', deck.bytes);
  await writeFile('/tmp/f581-selftest-doc.docx', docx);
  const a = await documents.importFile('F581 实时演示','pptx', deck.bytes);
  const b = await documents.importFile('F581 实时文档','docx', docx);
  await store.save();
  report.samples.documents = {deck:a.document.id, deckRevision:a.document.revision,
    word:b.document.id, wordRevision:b.document.revision, deckSlides:50};
  trace('SEEDED');
}

async function run() {
  try {
    mainWindow = await until('主窗口', () => findWindow('index\\.html'));
    await until('主窗口 DOM', () => js(mainWindow, `document.readyState==='complete' && !!window.actwill && !!document.querySelector('#app')`));
    trace('APP READY');
    const {deck, word} = report.samples.documents;
    async function openTab(id, name, format) {
      const t = Date.now();
      // Use the product's own library card → documentView action instead of
      // injecting tabs into localStorage (main blocks renderer navigation).
      await js(mainWindow, `document.querySelector('[data-page="library"]')?.click(), true`);
      const selector = `[data-action="documentView"][data-id=${JSON.stringify(id)}]`;
      await until('成果中心卡片', () => js(mainWindow, `!!document.querySelector(${JSON.stringify(selector)})`));
      await js(mainWindow, `document.querySelector(${JSON.stringify(selector)})?.click(), true`);
      await until('页签预览', () => js(mainWindow, `!!document.querySelector('#pagePanel [data-action="documentOfficeWindow"]')`));
      return Date.now()-t;
    }
    mark('docxPreviewOpenMs', await openTab(word, 'F581 实时文档', 'docx'));
    await capture(mainWindow, 'real-docx-preview');
    mark('pptxPreviewOpenMs', await openTab(deck, 'F581 实时演示', 'pptx'));
    await capture(mainWindow, 'real-tab-preview');
    report.samples.tab = await js(mainWindow, `({revision:document.querySelector('.file-preview-host')?.dataset.revision, zoom:document.querySelector('[data-preview-zoom]')?.textContent})`);

    const t0 = Date.now();
    await js(mainWindow, `document.querySelector('[data-action="documentOfficeWindow"]')?.click(), true`);
    editWindow = await until('编辑窗口', () => findWindow('window\\.html'), 200, 100);
    await new Promise(resolve => { if (typeof editWindow.isVisible === 'function' && editWindow.isVisible()) return resolve(); editWindow.once('ready-to-show', resolve); setTimeout(resolve, 30000); });
    mark('clickToShowMs', Date.now()-t0);
    await until('可编辑', async () => {
      const ok = await js(editWindow, `document.querySelector('#qk-loading')?.hidden===true && !!document.querySelector('.quank-office-canvas')`);
      if (!ok) trace('WIN '+JSON.stringify(await js(editWindow, `({href:location.href,loading:document.querySelector('#qk-loading') ? {hidden:document.querySelector('#qk-loading').hidden,text:document.querySelector('#qk-loading small')?.textContent} : null,head:!!document.querySelector('.qk-win-head'),canvas:!!document.querySelector('.quank-office-canvas')})`)));
      return ok;
    }, 120, 500);
    mark('clickToEditableMs', Date.now()-t0);
    await until('首屏瓦片', () => js(editWindow, `document.querySelectorAll('.qk-office-viewport canvas').length>0`));
    mark('clickToFirstTileMs', Date.now()-t0);
    await sleep(1200);
    await capture(editWindow, 'real-window-edit');

    const bounds = await js(editWindow, `(()=>{const r=document.querySelector('.qk-office-viewport').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
    if (bounds) {
      editWindow.webContents.sendInputEvent({type:'mouseDown', x:bounds.x, y:bounds.y, button:'left', clickCount:3});
      editWindow.webContents.sendInputEvent({type:'mouseUp', x:bounds.x, y:bounds.y, button:'left', clickCount:3});
      await sleep(250);
      editWindow.webContents.sendInputEvent({type:'keyDown', keyCode:'b', modifiers:['meta']});
      editWindow.webContents.sendInputEvent({type:'keyUp', keyCode:'b', modifiers:['meta']});
      await sleep(400);
      await capture(editWindow, 'real-window-float-ai');
    }
    const before = documents.read(deck).revision;
    await until('自动保存', () => documents.read(deck).revision > before);
    mark('saveObservedMs', Date.now()-t0);
    report.samples.revision = {before, after:documents.read(deck).revision};
    await until('页签预览刷新', () => js(mainWindow, `Number(document.querySelector('.file-preview-host')?.dataset.revision)>${before}`));
    await js(mainWindow, `(()=>{const b=document.querySelector('[data-office-editing]');if(b)b.hidden=false})()`);
    await capture(mainWindow, 'real-tab-editing-banner');

    const ratios = [];
    for (let i = 0; i < 10; i++) {
      await js(mainWindow, `document.querySelector('#pagePanel .pp-tools [data-action="${i%2?'ppMain':'ppWide'}"]')?.click(), true`);
      await sleep(400);
      ratios.push(await capture(mainWindow, i === 9 ? 'real-expand' : 'real-cycle-'+i));
    }
    report.samples.expandRestore = {cycles:10, minNonWhite:Math.round(Math.min(...ratios)*1000)/1000,
      maxNonWhite:Math.round(Math.max(...ratios)*1000)/1000};
    trace('DONE');
  } catch (error) {
    report.errors.push(error.message+' | '+String(error.stack||'').slice(0,400));
    trace('ERROR '+error.message);
  } finally {
    report.finishedAt = Date.now(); report.duration = report.finishedAt-report.startedAt;
    await writeFile(path.join(P, 'real-window-timings.json'), JSON.stringify(report,null,2)).catch(()=>{});
    trace('REPORT '+JSON.stringify(report.timings));
    cleanup();
    app.quit();
  }
}

await mkdir(DATA, {recursive:true});
await mkdir(P, {recursive:true});
writeFileSync(TRACE, '');
app.setPath('userData', DATA);
process.env.QUANK_DEV_USER_DATA = DATA;
process.env.QUANK_DEV_OFFICE_RUNTIME = RUNTIME;
process.env.QUANK_SELFTEST = '1';
process.env.PYTHONDONTWRITEBYTECODE = '1';
await seed();
await import('../main.mjs');
// Electron only emits `ready` after top-level evaluation completes.
app.whenReady().then(() => void run());
