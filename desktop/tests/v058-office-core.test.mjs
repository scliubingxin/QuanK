import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, lstat, rm, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {
    createOfficeSessionManager, createSessionView, createOpsAdapter, inspectOfficeLock, mapOfficeOperation,
    runVerifiedCommand, unoProperties,
} from '../services/office-session.mjs';
import {createComposition, officeShortcut, prioritizeTiles} from '../src/office/office-canvas.js';

function fixture(t, options = {}) {
    let revision = 'r1', time = 0, view = 0, rss = 0;
    const requests = [], saves = [];
    const worker = {
        ready:Promise.resolve(),
        rss:async () => rss,
        async request(op,payload) {
            requests.push({op,payload});
            if (op === 'attach') return {viewId:++view, metadata:{width:12000,height:15000}};
            if (op === 'snapshot' || op === 'exportFile') return {bytes:new Uint8Array([1,2,3])};
            if (op === 'reload') return {viewIds:{1:31}};
            if (op === 'key') return {changed:true};
            return {};
        },
    };
    const manager = createOfficeSessionManager({worker,
        resolveDocument:async () => ({format:'docx',revision,bytes:new Uint8Array([1]),...options.source}),
        commit:async (docId,bytes,details) => {saves.push({docId,bytes,details}); return {revision:'r2'};},
        idleMs:1000, now:() => ++time, ...options.manager,
    });
    t.after(() => manager.close());
    return {manager, requests, saves, open:documentId => manager.open({documentId}),
        advance:() => {time += 2000;}, revision:value => {revision = value;}, rss:value => {rss = value;}};
}

test('session lifecycle shares a document across views and reaps an idle handle', async t => {
    const f = fixture(t);
    const view = await f.open('writer');
    const second = await f.manager.attachView(view.sessionId);
    assert.equal(view.sessionId,second.sessionId);
    assert.notEqual(view.viewId,second.viewId);
    assert.equal(f.requests.filter(r => r.op === 'open').length,1);
    await f.manager.closeView(view);
    await assert.rejects(view.request('poll'),/视图已关闭/);
    await f.manager.closeView(second);
    f.advance();
    await f.manager.reap();
    await assert.rejects(f.manager.attachView(view.sessionId),/会话已关闭/);
});

test('three-document and RSS limits close least-recently used documents with a save first', async t => {
    const closed = [];
    const f = fixture(t,{manager:{beforeClose:info => {closed.push(info.docId);}}});
    const a = await f.open('a');
    const b = await f.open('b');
    await f.open('c');
    await a.request('key');
    await b.request('key');
    await a.request('poll');
    await f.open('d');
    assert.deepEqual(closed,['c']);
    f.rss(600_000_001);
    await f.manager.reap();
    assert.deepEqual(closed,['c','b','a']);
    assert.deepEqual(f.saves.map(x=>x.docId),['b','a']);
});

test('foreign lock forces read-only, recorded old process lock can be cleaned', async t => {
    const directory = await mkdtemp(path.join(tmpdir(),'quank-o1-lock-'));
    t.after(() => rm(directory,{recursive:true,force:true}));
    const file = path.join(directory,'source.docx');
    const lock = path.join(directory,'.~lock.source.docx#');
    await writeFile(lock,'test lock');
    const f = fixture(t,{source:{file}});
    const opened = await f.open('locked');
    assert.equal(opened.readOnlyReason,'被其他程序占用');
    assert.equal(opened.session.readOnly,true);
    await assert.rejects(opened.session.save(),/被其他程序占用/);
    assert.equal(await readFile(lock,'utf8'),'test lock');
    const owned = new Map([[lock,{...(await lstat(lock)), bytes:await readFile(lock)}]]);
    assert.equal(await inspectOfficeLock(file,owned),false);
    assert.deepEqual(await readdir(directory),[]);
});

test('snapshot returns bytes without committing to file and leaves pending edits dirty', async t => {
    const f = fixture(t);
    const opened = await f.open('writer');
    await opened.request('key');
    const snapshot = await opened.session.save({mode:'snapshot'});
    assert.deepEqual(snapshot,new Uint8Array([1,2,3]));
    assert.deepEqual(f.saves,[]);
    assert.equal(f.requests.at(-1).op,'snapshot');
    await opened.session.save();
    assert.equal(f.saves[0].details.expectedRevision,'r1');
});

test('reload refreshes authorized source revision and keeps logical view attached', async t => {
    const f = fixture(t);
    const opened = await f.open('writer');
    f.revision('fresh');
    await opened.session.reload();
    await opened.request('poll');
    assert.equal(f.requests.at(-1).payload.viewId,31);
    await opened.session.save();
    assert.equal(f.saves[0].details.expectedRevision,'fresh');
});

test('listeners unbind via returned callback and explicit off', () => {
    const {view,publish} = createSessionView({docId:'d',kind:'writer',readOnly:false});
    let count = 0;
    const listener = () => count++;
    const off = view.on('dirty',listener);
    publish('dirty');
    off();
    publish('dirty');
    view.on('dirty',listener);
    view.off('dirty',listener);
    publish('dirty');
    assert.equal(count,1);
});

test('v3 state and UNO properties use the normalized shapes', async () => {
    const {view,publish} = createSessionView({docId:'d',kind:'writer',readOnly:false,
        request:async (operation,payload) => ({operation,payload})});
    publish('state',{'.uno:Bold':'true','.uno:Redo':'disabled'});
    assert.deepEqual(view.state.get('.uno:Bold'),{enabled:true,checked:true,value:'true'});
    assert.deepEqual(view.state.get('.uno:Redo'),{enabled:false,checked:false,value:null});
    assert.deepEqual((await view.uno('.uno:Color',{Color:0xff0000})).payload.args,{Color:{type:'long',value:0xff0000}});
});

test('selection adapter forwards token and direct-accept options and returns the change result', async () => {
    const {view,publish} = createSessionView({docId:'d',kind:'writer',readOnly:false,
        request:async (op,args) => args.token === 'new' ?
            {ok:true,changeId:null,changeset:{before:'before',after:args.text},accepted:args.accept} :
            {ok:false,reason:'selection_changed'}});
    publish('selection',{kind:'text',text:'before',token:'new',rects:[]});
    assert.deepEqual(await view.replaceSelection('after',{track:true,token:'stale'}),{ok:false,reason:'selection_changed'});
    assert.deepEqual(await view.replaceSelection('after',{track:true,accept:true}),{
        ok:true,changeId:null,changeset:{before:'before',after:'after'},accepted:true});
});

test('UNO callback false is accepted only with verified readback', async () => {
    let count = 1;
    const result = await runVerifiedCommand({read:async () => count,dispatch:async () => {count++;return {success:false};},
        verify:(before,after) => after === before+1});
    assert.equal(result.success,true);
    await assert.rejects(runVerifiedCommand({read:async () => count,dispatch:async () => ({success:false}),
        verify:(before,after) => after === before+1}),/预期结果/);
});

test('IME commits once and cancels a pending combination without inserting', async () => {
    const sent = [], displayed = [];
    const ime = createComposition(text => sent.push(text),text => displayed.push(text));
    ime.start();
    ime.update('ni');
    ime.end('你');
    ime.end('你');
    ime.start();
    ime.update('hao');
    ime.cancel();
    ime.end('好');
    assert.deepEqual(sent,['你']);
    assert.deepEqual(displayed,['','ni','','','hao','']);
});

test('keyboard maps editing commands, shifted redo and arrows', () => {
    for (const [key,command] of Object.entries({b:'Bold',i:'Italic',u:'Underline',z:'Undo',a:'SelectAll',s:'Save'})) {
        assert.deepEqual(officeShortcut({key,metaKey:true}),{command});
    }
    assert.deepEqual(officeShortcut({key:'Z',metaKey:true,shiftKey:true}),{command:'Redo'});
    assert.deepEqual(officeShortcut({key:'ArrowLeft',shiftKey:true}),{char:0,code:0x1000|1026,edit:false});
    assert.equal(officeShortcut({key:'Enter',isComposing:true}),undefined);
});

test('visible cursor tile leads the queue and offscreen tiles stay out', () => {
    const queue = prioritizeTiles({left:0,top:128,right:256,bottom:384},128,{x:190,y:300});
    assert.equal(queue[0].key,'2:1');
    assert.equal(queue.length,4);
});

test('adapter forwards table and chart geometry and delegates apply/read', async () => {
    const table = mapOfficeOperation({op:'insert_table',rows:[['H'],['value']],header:true});
    assert.deepEqual(table.args,unoProperties({Rows:2,Columns:1}));
    assert.equal(table.command,'.uno:InsertTable');
    const chart = mapOfficeOperation({op:'insert_chart',chart:{type:'line',series:[{name:'收益',values:[3,5]}],categories:['一','二']}});
    assert.equal(chart.command,'.uno:InsertObjectChart');
    assert.deepEqual(chart.args.ChartType,{type:'string',value:'line'});
    assert.deepEqual(chart.data,[['','收益'],['一',3],['二',5]]);
    let stored;
    const engine = {async requestDocument(docId,op,payload) {
        assert.equal(docId,'d');
        if (op === 'apply') {stored = payload.ops; return {changes:stored};}
        return stored;
    }};
    const adapter = createOpsAdapter(engine);
    const {changes} = await adapter.apply('d',[table,chart]);
    assert.deepEqual(await adapter.read('d',{}),changes);
});

test('port sends only current-epoch requests and preserves public state values', async t => {
    const {MessageChannel} = await import('node:worker_threads');
    const {bindOfficeViewPort} = await import('../services/office-session.mjs');
    const {connectOfficeViewPort} = await import('../src/office/office-canvas.js');
    const {port1,port2} = new MessageChannel();
    const {view,publish} = createSessionView({docId:'writer', kind:'writer', readOnly:false,
        request:async (op,payload) => ({op,payload})});
    publish('state',{'.uno:Bold':'true'});
    const host = {
        on(event,fn) {port1.on(event,event === 'message' ? data => fn({data}) : fn);},
        postMessage(value) {port1.postMessage(value);},
        start() {port1.start();},
        close() {port1.close();},
    };
    const close = bindOfficeViewPort(host,{session:view,metadata:{width:100,height:100}},
        async () => {});
    t.after(close);
    const remote = await connectOfficeViewPort(port2);
    t.after(() => remote.close());
    assert.deepEqual(remote.session.state.get('.uno:Bold'),{enabled:true,checked:true,value:'true'});
    assert.deepEqual(await remote.session.uno('.uno:FontHeight',{Height:12.5}),{
        op:'uno',payload:{command:'.uno:FontHeight',args:{'FontHeight.Height':{type:'float',value:12.5}}}});
    await assert.rejects(remote.session.save({mode:'snapshot'}),/只供主进程/);
});

const nativeDirectory = process.env.QUANK_O1_RUNTIME;
const nativeFixture = process.env.QUANK_O1_WRITER_FIXTURE;
test('native Writer apply, stale selection guard and direct acceptance undo round trip', {
    skip: !nativeDirectory || !nativeFixture,
}, async t => {
    const {startOfficeLokWorker} = await import('../runtime/office-lok-worker.mjs');
    const scratchDirectory = await mkdtemp(path.join(tmpdir(),'quank-o1-native-'));
    const worker = await startOfficeLokWorker({
        scratchDirectory,
        python:path.join(nativeDirectory,'python/bin/python3'),
        officeDirectory:path.join(nativeDirectory,'WillBuddyEngine/Contents/MacOS'),
    });
    t.after(async () => {await worker.close();await rm(scratchDirectory,{recursive:true,force:true});});
    const manager = createOfficeSessionManager({
        worker,
        resolveDocument:async () => ({format:'docx',revision:'r1',bytes:await readFile(nativeFixture)}),
        commit:async () => ({revision:'r2'}),
    });
    const opened = await manager.open({documentId:'writer'});
    // The same path handles encrypted and ordinary views. Pixel buffers are
    // returned in memory, and rendering creates no persistent tile artifacts.
    const tileFiles = async () => (await readdir(scratchDirectory,{recursive:true}))
        .filter(name => /\.(?:png|rgba|tile|webp)$/.test(name)).sort();
    const cached = await tileFiles();
    const tile = await opened.request('tile',{part:0,x:0,y:0,span:1920});
    assert.equal(tile.binary.byteLength,256*256*4);
    assert.deepEqual(await tileFiles(),cached);
    const adapter = createOpsAdapter(manager);
    await adapter.apply('writer',[{op:'replace_text',target:{paragraph:0},text:'Verified O1 Writer'}]);
    const before = (await adapter.read('writer',{paragraph:0})).paragraph;
    assert.equal(before.text,'Verified O1 Writer');
    await opened.session.uno('.uno:SelectAll');
    for (let i = 0; i < 30 && opened.session.selection.kind !== 'text'; i++) {
        await new Promise(resolve => setTimeout(resolve,10));
        await opened.request('poll');
    }
    const {token} = opened.session.selection;
    assert.ok(token);
    assert.equal((await opened.session.replaceSelection('stale',{token:'stale',track:true,accept:true})).reason,'selection_changed');
    const receipt = await opened.session.replaceSelection('one undo',{token,track:true,accept:true});
    assert.equal(receipt.ok,true);
    assert.equal(receipt.changeset.after,'one undo');
    assert.equal((await adapter.read('writer',{paragraph:0})).paragraph.text,'one undo');
    await opened.session.undo();
    await new Promise(resolve => setTimeout(resolve,75));
    assert.deepEqual((await adapter.read('writer',{paragraph:0})).paragraph,before);
    await manager.close();
});
