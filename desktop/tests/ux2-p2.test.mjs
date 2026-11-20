// [p2-ux2] Second round of feedback: streamed reply below execution steps, plain-language approvals,
// standby Office engine, warmed preview engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store, initialState} from '../core.mjs';
import {ToolRuntime} from '../runtime/tools.mjs';
import {createOfficeWorkspace} from '../services/office-workspace.mjs';
import {createDocumentService} from '../services/documents.mjs';
import {generateDocument} from '../runtime/documents.mjs';
import {conversationContent} from '../src/ui/workspace.js';

test('while a run is live the streamed reply is rendered after the execution steps', () => {
  const s = initialState();
  s.chats = [{id: 'c', name: 'x', run: {id: 'r1', status: 'running'}, messages: [
    {role: 'user', content: '做成ppt', runId: 'r1'},
    {role: 'assistant', content: '我将新建一份浅色风格 PPT', streaming: true, runId: 'r1'},
  ]}];
  const html = conversationContent({state: s, chatId: 'c', pending: false, previewTabs: [], icon: () => '', composer: () => '', action: () => '', date: () => '',
    taskStatus: () => '', trace: () => '<div class="TRACE">document_read</div>', executionRecords: () => [], executionRow: () => '', rich: s => String(s)});
  const trace = html.indexOf('class="TRACE"'), reply = html.indexOf('我将新建一份浅色风格 PPT');
  assert.ok(trace > 0 && reply > 0); assert.ok(trace < reply, 'trace first, then the streaming reply');
  s.chats[0].run.status = 'completed'; s.chats[0].messages[1].streaming = false;
  const done = conversationContent({state: s, chatId: 'c', pending: false, previewTabs: [], icon: () => '', composer: () => '', action: () => '', date: () => '',
    taskStatus: () => '', trace: () => '<div class="TRACE">document_read</div>', executionRecords: () => [], executionRow: () => '', rich: s => String(s)});
  assert.ok(done.includes('我将新建一份浅色风格 PPT'));
});

test('approval dialogs describe CLI and web reads in plain language, without JSON', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-ux2-'));
  try {
    const store = new Store(dir); await store.load(); store.data.folders = [{id: 'f', path: dir, name: 'fixture'}];
    const asked = [];
    const browser = {list: () => [{id: 'w1', url: 'https://www.longi.com/cn/news/', title: '隆基新闻'}], read: async () => ({text: '正文'})};
    const runtime = new ToolRuntime({store, browser, approve: async (title, detail) => { asked.push({title, detail}); return false; }});
    await runtime.execute('cli_execute', {executable: '/bin/echo', args: ['hello world', '-n'], folderId: 'f'}, undefined, {chatId: 'c', runId: 'r'});
    await runtime.execute('browser_read', {id: 'w1'}, undefined, {chatId: 'c', runId: 'r'});
    const [cli, read] = asked;
    assert.equal(cli.title, '执行本机 CLI');
    assert.match(cli.detail, /^程序：\/bin\/echo\n参数："hello world" -n\n工作目录：/);
    assert.match(cli.detail, /最长运行：120 秒/); assert.match(cli.detail, /命令输出会发送给当前模型/);
    assert.match(read.detail, /^网页：隆基新闻\n地址：https:\/\/www\.longi\.com\/cn\/news\//);
    for (const a of asked) { assert.doesNotMatch(a.detail, /[{}]|"id"|"url"|stdout/); }
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('a standby engine is started ahead of time and used for the next document', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-ux2-kit-'));
  try {
    const store = new Store(dir); await store.load();
    const documents = createDocumentService({store});
    const bytes = (await generateDocument('docx', JSON.stringify({blocks: [{type: 'paragraph', text: '你好'}]}))).bytes;
    const d = (await documents.importFile('样例', 'docx', bytes)).document;
    const started = [], loads = [];
    const driver = async ({format}) => { started.push(format); return {format, closed: false,
      load: async f => { loads.push(f); }, request: async () => ({}), close() { this.closed = true; }}; };
    const kit = createOfficeWorkspace({documents, directory: path.join(dir, 'kit'), runtime: async () => ({}), approve: async () => true, driver});
    await kit.prewarm();
    assert.deepEqual(started, ['standby']); assert.equal(kit.hasSpare(), true);
    await kit.prewarm(); assert.deepEqual(started, ['standby'], 'only one standby engine');
    const s = await kit.open(d.id, 1);
    assert.ok(s.sessionId); assert.deepEqual(loads, ['docx']); assert.deepEqual(started, ['standby'], 'no new engine when the standby was used');
    assert.equal(kit.hasSpare(), false);
    await kit.shutdown();
    const failing = createOfficeWorkspace({documents, directory: path.join(dir, 'kit2'), runtime: async () => ({}), approve: async () => true,
      driver: async ({format}) => { started.push('f:' + format); return {load: async () => { throw new Error('engine died'); }, request: async () => ({}), close() {}}; }});
    await failing.prewarm();
    assert.ok((await failing.open(d.id, 1)).sessionId, 'a dead standby falls back to a fresh engine');
    assert.deepEqual(started.slice(-2), ['f:standby', 'f:docx']);
    await failing.shutdown();
  } finally { await rm(dir, {recursive: true, force: true}); }
});
