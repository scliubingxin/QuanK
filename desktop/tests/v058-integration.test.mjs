import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {Store} from '../core.mjs';
import {generateDocument} from '../runtime/documents.mjs';
import {createDocumentService} from '../services/documents.mjs';
import {createAutosave, createOfficeCommitJournal} from '../services/office-autosave.mjs';
import {createMockSession} from '../src/office/mock-session.js';
import {applyOfficeAIResult, diffOfficeWords} from '../src/ui/office-ai-diff.js';
import {officeApproval, officeApprovalCard, routeOfficeIntent} from '../services/office-tools.mjs';
import {filePreviewPanel} from '../src/ui/office-preview.js';

test('替换、CAS、幂等与自动版本合并经成果中心提交锁保存', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'i58-versions-'));
  t.after(() => rm(directory, {recursive:true, force:true}));
  const store = new Store(directory);
  await store.load();
  const docs = createDocumentService({store});
  const word = async text => (await generateDocument('docx', JSON.stringify({blocks:[{type:'paragraph',text}]}))).bytes;
  const source = await docs.importFile('I58 Writer', 'docx', await word('原文'));
  const id = source.document.id;
  const options = {expectedRevision:1, requestId:randomUUID(), mergeKey:'window', reason:'auto'};
  const first = await word('第一次自动保存');
  const [a,b] = await Promise.all([docs.replaceBytes(id,first,options), docs.replaceBytes(id,first,options)]);
  assert.equal(a.revision, 2);
  assert.equal(b.revision, 2);
  assert.equal((await docs.replaceBytes(id,first,{expectedRevision:1})).code, 'OFFICE_CONFLICT');
  await docs.replaceBytes(id, await word('手动保存'), {expectedRevision:2, reason:'manual'});
  const merged = await docs.replaceBytes(id, await word('第二次自动保存'), {expectedRevision:3, mergeKey:'window', reason:'auto'});
  assert.equal(merged.revision, 4);
  assert.deepEqual(merged.document.history.map(({revision,reason}) => [revision,reason]), [[1,undefined],[3,'manual']]);
  await docs.replaceBytes(id,4,null,undefined,{mergeKey:'window', finalize:true});
  assert.equal((await docs.replaceBytes(id, await word('窗口已定稿'), {expectedRevision:4, mergeKey:'window'})).document.history.at(-1).revision, 4);
  await store.load();
  assert.equal((await docs.replaceBytes(id,first,options)).revision, 2);
});

test('提交日志经重启补录，源文件与意图散列不符时保持待处理', async t => {
  const userData = await mkdtemp(path.join(tmpdir(), 'i58-journal-'));
  t.after(() => rm(userData, {recursive:true, force:true}));
  const submissions = [];
  const versions = {record:job => submissions.push(job)};
  const journal = createOfficeCommitJournal({userData,versions});
  const bytes = Buffer.from('OOXML fixture');
  const receipt = {docId:'doc', size:bytes.length, bytes, sha256:createHash('sha256').update(bytes).digest('hex')};
  const file = path.join(userData,'input.docx');
  await writeFile(file, 'different');
  await journal.intent({...receipt, id:randomUUID(), file});
  await journal.intent({...receipt, id:randomUUID()});
  const restarted = createOfficeCommitJournal({userData,versions});
  assert.deepEqual(await restarted.recover({allowPath:path => path === file}), {completed:1, deferred:1});
  await writeFile(file,bytes);
  assert.deepEqual(await restarted.recover({allowPath:path => path === file}), {completed:1, deferred:0});
  assert.deepEqual(await restarted.recover(), {completed:0, deferred:0});
  assert.equal(submissions.length,2);
});

test('O2 会话供 O5 保存，外部版本变化触发冲突后可重新载入', async t => {
  const userData = await mkdtemp(path.join(tmpdir(), 'i58-library-'));
  t.after(() => rm(userData, {recursive:true, force:true}));
  const session = createMockSession({selection:{kind:'text',text:'原文'}});
  let revision = 1, content = '原文';
  const versions = {
    head: () => revision,
    fingerprint: () => ({identity:revision, sha256:createHash('sha256').update(content).digest('hex')}),
    record(job) {
      assert.equal(job.expectedRevision,revision);
      content = job.bytes.toString();
      return {revision:++revision};
    },
  };
  const controller = await createAutosave(session,{library:true,userData,versions,
    reload:() => session.setSelection({kind:'text',text:content})});
  t.after(() => controller.abandon());
  await session.replaceSelection('本地编辑',{token:session.selection.token});
  assert.equal((await controller.save()).ok,true);
  assert.equal(content,'本地编辑');
  await session.replaceSelection('后续编辑',{token:session.selection.token});
  revision++;
  content = '独立窗口修改';
  assert.equal((await controller.save()).state.status,'conflict');
  assert.equal((await controller.resolveConflict('reload')).ok,true);
  assert.equal(session.selection.text,content);
});

test('中文短语按词替换，Impress 与 Calc 接受后一次撤销', async () => {
  assert.deepEqual(diffOfficeWords('一月份是','一月为'), [
    {type:'delete',text:'一月份是'}, {type:'insert',text:'一月为'},
  ]);
  for (const kind of ['impress','calc']) {
    const session = createMockSession({kind,selection:{kind:'text',text:'一月份是'}});
    const {changeSet} = await applyOfficeAIResult(session,{type:'text',text:'一月为'});
    assert.equal(session.selection.text,'一月为');
    await changeSet.undo();
    assert.equal(session.selection.text,'一月份是');
  }
});

test('页签状态位及 A57 替换预览，Office 路由避开 coding-intent', () => {
  const action = (label,name,id) => `<button data-action="${name}" data-id="${id}">${label}</button>`;
  assert.match(filePreviewPanel({id:'a',name:'Writer',format:'docx',revision:1},{action,icon:()=>' ',native:true,inTab:true}), /data-office-edit-status>只读/);
  const card = officeApproval({changes:1,items:[{op:'replace_text',label:'第 2 段',before:{text:'旧文字'},after:{text:'新文字'}}]},
    {label:'Writer',reason:'润色',chatId:'chat'});
  const html = officeApprovalCard({...card.options, requestId:'id', action:card.action, summary:card.summary, officePreview:card.details},action);
  assert.match(html, /<del>旧文字<\/del>.*<mark[^>]*>新文字<\/mark>/s);
  assert.equal(routeOfficeIntent('把表 1 第 2 行收益改成 3.2%',{currentDocId:'a'}).tool,'app_office_edit');
  assert.equal(routeOfficeIntent('改这个项目的代码并运行测试',{currentDocId:'a'}),null);
});

test('主动打开独立 Office 并手动保存走成果中心版本，无需打开或保存授权', async t => {
  const {createOfficeWorkspace} = await import('../services/office-workspace.mjs');
  const directory = await mkdtemp(path.join(tmpdir(), 'i58-window-'));
  t.after(() => rm(directory, {recursive:true, force:true}));
  const store = new Store(directory);
  await store.load();
  const documents = createDocumentService({store});
  const doc = async text => (await generateDocument('docx', JSON.stringify({blocks:[{type:'paragraph',text}]}))).bytes;
  const {document} = await documents.importFile('主动打开', 'docx', await doc('原文'));
  const edited = await doc('手动修改');
  const requests = [];
  const kit = createOfficeWorkspace({documents, directory:path.join(directory,'kit'), runtime:async () => ({}),
    requireOpenApproval:false, approve:async title => { requests.push(title); return false; },
    driver:async ({directory:dir}) => ({
      close() {},
      async request(command) {
        if (command === 'save') await writeFile(path.join(dir,'edited.docx'),edited);
        return {changed:command === 'key'};
      },
    }),
  });
  t.after(() => kit.shutdown());
  const opened = await kit.open(document.id, document.revision);
  assert.ok(opened.sessionId);
  await kit.operation(opened.sessionId, 'paste', {text:'手动修改'});
  assert.equal(documents.read(document.id).revision, 2);
  assert.deepEqual(requests, []);
});

test('Calc 和 Impress 已提交变更集通过页签一次 Undo 恢复原版本', async t => {
  const {createOfficeSessionManager} = await import('../services/office-session.mjs');
  const {registerOfficeAutosave} = await import('../services/office-autosave.mjs');
  const userData = await mkdtemp(path.join(tmpdir(), 'i58-changeset-'));
  t.after(() => rm(userData, {recursive:true,force:true}));
  for (const format of ['xlsx','pptx']) {
    let revision = 1, text = 'original';
    const ops = [];
    const worker = {async request(op,payload) {
      ops.push([op,payload.bytes && Buffer.from(payload.bytes).toString()]);
      return op === 'attach' ? {viewId:0,metadata:{width:500,height:500}} : {};
    }};
    const manager = createOfficeSessionManager({worker,
      resolveDocument:() => ({format,revision,bytes:Buffer.from(text)}),
      autosave:registerOfficeAutosave({promptClose:async()=> 'cancel',defaults:{userData,versions:{
        head:() => revision, fingerprint:() => ({identity:revision,sha256:text}),
      }}}),
    });
    try {
      const view = await manager.open({documentId:format,mode:'edit'});
      text = 'assistant changes'; revision++;
      assert.equal(await manager.refresh(format, async () => {
        text = 'original'; revision++;
        return {status:'succeeded'};
      }),true);
      await view.session.undo();
      assert.equal(text,'original');
      assert.deepEqual(ops.filter(entry => entry[0] === 'reload'),[['reload','assistant changes'],['reload','original']]);
      assert.ok(!ops.some(entry => entry[0] === 'uno'));
    } finally { await manager.close(); }
  }
});
