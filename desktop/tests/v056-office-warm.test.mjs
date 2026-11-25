import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, readdir, rm, utimes, writeFile} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {officeFontEnvironment} from '../runtime/office-fonts.mjs';
import {createOfficeEngine} from '../runtime/office-engine.mjs';
import {createOfficePreviewCache} from '../runtime/office-preview-cache.mjs';
import {createLibreOffice} from '../services/libreoffice.mjs';
import {createOfficeWorkspace} from '../services/office-workspace.mjs';
import {generateDocument, sha256} from '../runtime/documents.mjs';

async function temporary(t) {
 const root = await mkdtemp(path.join(tmpdir(), 'quank-w1-'));
 t.after(() => rm(root, {recursive: true, force: true}));
 return root;
}

test('fontconfig lists only matching asset leaves and rebuilds when a directory mtime changes', async t => {
 const root = await temporary(t), assetsRoot = path.join(root, 'AssetsV2');
 const dir = path.join(assetsRoot, 'com_apple_MobileAsset_Font8', 'installed.asset', 'AssetData');
 const fangsong = path.join(assetsRoot, 'com_apple_MobileAsset_Font8', 'fangsong.asset', 'AssetData');
 const ignored = path.join(assetsRoot, 'com_apple_MobileAsset_Font8', 'ignored.asset', 'AssetData');
 await mkdir(dir, {recursive: true});
 await mkdir(fangsong, {recursive: true});
 await writeFile(path.join(fangsong, 'STFANGSO.ttf'), '');
 await mkdir(ignored, {recursive: true});
 await writeFile(path.join(dir, 'PingFang.ttc'), '');
 await writeFile(path.join(ignored, 'Unrelated.ttc'), '');
 const fontCacheDirectory = path.join(root, 'office/fontcache');
 let builds = 0;
 const timings = [];
 async function configure(job) {
  return officeFontEnvironment({
   directory:await mkdtemp(path.join(root,job)),officeDirectory:path.join(root,'engine/MacOS'),
   platform:'darwin',home:root,assetsRoot,cacheDirectory:fontCacheDirectory,python:'unused',
   build:async()=>{builds++;},onTiming:timing=>timings.push(timing.hit),
  });
 }
 const config = await readFile((await configure('one')).FONTCONFIG_FILE, 'utf8');
 assert.ok(config.includes('<dir>' + dir + '</dir>'));
 assert.ok(config.includes('<dir>' + fangsong + '</dir>'));
 assert.ok(config.includes('<cachedir>' + fontCacheDirectory + '</cachedir>'));
 assert.ok(!config.includes('<dir>' + assetsRoot + '</dir>'));
 assert.ok(!config.includes(ignored));
 await configure('two');
 assert.equal(builds, 1);
 const future = new Date(Date.now() + 30000);
 await utimes(dir, future, future);
 await configure('three');
 assert.equal(builds, 2);
 assert.deepEqual(timings, [false,true,false]);
});

test('background prewarm begins after window readiness and shares its ordered work with requests', async t => {
 const calls = [];
 let beginPreview, finishPreview;
 const previewStarted = new Promise(resolve => {beginPreview = resolve;});
 const previewPending = new Promise(resolve => {finishPreview = resolve;});
 const engine = createOfficeEngine({
  enabled:()=>true,notify:()=>{},delayMs:10,
  warmPreview:async()=>{calls.push('preview');beginPreview();await previewPending;},
  warmEditor:async()=>{calls.push('editor');},
 });
 t.after(()=>engine.close());
 await sleep(20);
 assert.deepEqual(calls, []);
 engine.windowReady();
 await Promise.race([previewStarted, sleep(200)]);
 assert.deepEqual(calls, ['preview']);
 const edit = engine.wait().then(()=>calls.push('edit request'));
 const preview = engine.wait().then(()=>calls.push('preview request'));
 assert.equal(engine.state().phase, 'starting');
 finishPreview();
 await Promise.all([edit,preview]);
 assert.deepEqual(calls, ['preview','editor','edit request','preview request']);
 assert.equal(engine.state().phase, 'ready');
});

test('disabled prewarm schedules no workers', async t => {
 let enabled = true, starts = 0;
 const engine = createOfficeEngine({
  enabled:()=>enabled,notify:()=>{},delayMs:10,
  warmPreview:()=>{starts++;},warmEditor:()=>{starts++;},
 });
 t.after(()=>engine.close());
 engine.windowReady();
 enabled = false;
 engine.settingsChanged();
 await engine.wait();
 await sleep(30);
 assert.equal(starts,0);
});

test('low power postpones automatic prewarm, and failure reaches queued callers until a retry succeeds', async t => {
 let defer = true, fail = true, attempts = 0;
 const engine = createOfficeEngine({
  enabled:()=>true,defer:async()=>defer,delayMs:5,retryDelayMs:8,
  warmPreview:async()=>{attempts++;if(fail)throw Error('worker unavailable');},
  warmEditor:async()=>{},
 });
 t.after(()=>engine.close());
 engine.windowReady();
 await sleep(24);
 assert.equal(attempts,0);
 defer = false;
 await assert.rejects(engine.wait(),/worker unavailable/);
 assert.equal(engine.state().phase,'failed');
 await assert.rejects(engine.wait(),/worker unavailable/);
 assert.equal(attempts,1);
 fail = false;
 assert.equal(await engine.retry(),true);
 assert.equal(engine.state().phase,'ready');
 assert.equal(attempts,2);
});

test('consumed standby is replenished and an idle standby is released', async t => {
 const root = await temporary(t);
 const {bytes} = await generateDocument('docx',JSON.stringify({blocks:[{type:'paragraph',text:'Office standby'}]}));
 const document = {id:'doc',name:'Test',format:'docx',revision:1,sha256:sha256(bytes),bytes};
 const formats = [], loaded = [];
 let closes = 0, replenished;
 const replacement = new Promise(resolve=>{replenished=resolve;});
 const kit = createOfficeWorkspace({
  directory:root,runtime:async()=>({}),approve:async()=>true,standbyIdleMs:80,
  documents:{read:()=>document,bytes:()=>document},
  driver:async({format})=>{
   formats.push(format);
   return {load:async type=>loaded.push(type),close:()=>{closes++;}};
  },
  onStandbyTiming:()=>{if(formats.length===2)replenished();},
 });
 t.after(()=>kit.shutdown());
 await kit.prewarm();
 const opened = await kit.open(document.id,1);
 assert.ok(opened.sessionId);
 await Promise.race([replacement,sleep(500)]);
 assert.deepEqual(formats,['standby','standby']);
 assert.deepEqual(loaded,['docx']);
 assert.equal(kit.hasSpare(),true);
 await sleep(110);
 assert.equal(kit.hasSpare(),false);
 assert.equal(closes,1);
});

test('disk previews survive a restart, differ by revision and SHA-256, and evict least recently used bytes', async t => {
 const directory = await temporary(t), pdf = Buffer.from('%PDF-test\n%%EOF');
 const first = {sha256:'a',revision:1}, second = {sha256:'b',revision:1};
 let allowed = true;
 const options = {directory,maxBytes:2*pdf.length,allowed:()=>allowed};
 let cache = createOfficePreviewCache(options);
 await cache.put(first,pdf);
 await sleep(10);
 await cache.put(second,pdf);
 cache = createOfficePreviewCache(options);
 await sleep(10);
 assert.deepEqual(await cache.get(first),pdf);
 assert.equal(await cache.get({...first,revision:2}),null);
 assert.equal(await cache.get({...first,sha256:'c'}),null);
 const third = {...first,revision:2};
 await sleep(10);
 await cache.put(third,pdf);
 assert.equal((await readdir(directory)).length,2);
 assert.equal(await cache.get(second),null);
 assert.deepEqual(await cache.get(first),pdf);
 assert.deepEqual(await cache.get(third),pdf);
 allowed = false;
 await cache.clear();
 await cache.put(first,pdf);
 assert.equal(await cache.get(first),null);
 await assert.rejects(readdir(directory),{code:'ENOENT'});
});

test('shared hero statistics switch to equal-width wrapping cells without separators inside a narrow qkzone', async () => {
 const css = await readFile(new URL('../src/workbench.css', import.meta.url), 'utf8');
 assert.match(css, /\.plaza-stats,\.fd-stats\{display:grid;grid-auto-flow:column;grid-auto-columns:minmax\(0,1fr\)\}/);
 assert.match(css, /@container qkzone \(max-width:760px\)\s*\{\s*\.plaza-stats,\.fd-stats\s*\{[^}]*grid-auto-flow:row;[^}]*grid-template-columns:repeat\(auto-fit,minmax/);
 assert.match(css, /\.plaza-stats > span \+ span\{border-left:0\}/);
 assert.doesNotMatch(css, /\.security-page[^\n{]*\.plaza-stats/);
});


test('preview cache misses when the LibreOffice version, QuankSight version, or font fingerprint changes', async t => {
 const directory = await temporary(t);
 const cache = createOfficePreviewCache({directory});
 const pdf = Buffer.from('%PDF-test');
 const original = {sha256:'a',revision:1,engineVersion:['26.8.1.1','0.56.0'],fontFingerprint:'font-1'};
 await cache.put(original,pdf);
 assert.deepEqual(await cache.get(original),pdf);
 assert.equal(await cache.get({...original,engineVersion:['26.8.2.1','0.56.0']}),null);
 assert.equal(await cache.get({...original,engineVersion:['26.8.1.1','0.56.1']}),null);
 assert.equal(await cache.get({...original,fontFingerprint:'font-2'}),null);
});

test('with startup prewarm off, opening an editor or preview still starts its own engine on demand', async t => {
 const root = await temporary(t);
 const {bytes} = await generateDocument('docx',JSON.stringify({blocks:[{type:'paragraph',text:'Office on demand'}]}));
 const document = {id:'doc',name:'Test',format:'docx',revision:1,sha256:sha256(bytes),bytes};
 const documents = {read:()=>document,bytes:()=>document};
 const starts = [];
 const engine = createOfficeEngine({
  enabled:()=>false,delayMs:5,
  warmPreview:async()=>{starts.push('prewarm preview');},
  warmEditor:async()=>{starts.push('standby');},
 });
 const kit = createOfficeWorkspace({
  documents,directory:path.join(root,'edit'),runtime:async()=>({}),approve:async()=>true,
  waitForEngine:engine.wait,allowStandby:()=>false,
  driver:async({format})=>{starts.push('edit '+format);return {close(){}};},
 });
 const service = createLibreOffice({
  documents,directory:path.join(root,'preview'),waitForEngine:engine.wait,
  pdfRuntime:async()=>({}),
  pdfDriver:async({directory,format})=>{
   starts.push('preview '+format);
   return {close(){},request:async()=>writeFile(path.join(directory,'output/document.pdf'),'%PDF-test')};
  },
 });
 try {
  engine.windowReady();
  await sleep(20);
  assert.deepEqual(starts,[]);
  assert.ok((await kit.open(document.id,1)).sessionId);
  assert.equal((await service.preview(document.id,1)).format,'pdf');
  assert.deepEqual(starts,['edit docx','preview docx']);
  assert.equal(kit.hasSpare(),false);
 }finally{
  engine.close();
  await Promise.all([kit.shutdown(),service.close()]);
 }
});
