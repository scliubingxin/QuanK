import {codingCards, codingForm, codingPayload} from '../src/ui/coding.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {Store, initialState} from '../core.mjs';
import {createOfficeWindows} from '../main/office-windows.mjs';
import {createCodingService} from '../services/coding-agent.mjs';
import {CODING_DISABLED, executeAppTool} from '../services/app-tools.mjs';
import {createConversationService} from '../services/conversation.mjs';
import {automationPage} from '../src/ui/automation.js';
import {agentEditor, readAgentEditor} from '../src/ui/agent-editor.js';
import {filePreviewPanel} from '../src/ui/office-preview.js';

const button = (text, action) => `<button data-action="${action}">${text}</button>`;
const agent = {id:'fake',name:'假代理',command:process.execPath,args:['-e','setInterval(() => {}, 1000)'],isDefault:true};
const agentBinding = {dialogue:[],coding:['fake'],fallback:'external'};

test('共享模态框将头尾与唯一滚动区分开', async () => {
  const app = await readFile(new URL('../src/ui/modal.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/workbench.css', import.meta.url), 'utf8');
  assert.match(app, /class="modal-layout"[^>]*><header>[\s\S]*?<\/header><div class="modal-body">[\s\S]*?<\/div><footer>/);
  assert.match(css, /\.modal-layout > \.modal-body[^}]*overflow:auto/);
  assert.match(css, /\.modal-layout > :is\(header,footer\)[^}]*position:static/);
});

test('连接测试在总期限结束后返回 timeout，取消可以立即结束请求', async t => {
  const directory = await mkdtemp(path.join(tmpdir(),'v0571-acp-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  const store = {data:{coding:{agents:[agent]}},save:async()=>{}};
  const service = createCodingService({store,projectDir:()=>directory,runnerOptions:{totalMs:150},seal:x=>x,unseal:x=>x});
  t.after(() => service.close());
  assert.equal((await service.handle({action:'test',id:agent.id,testId:'test-timeout'})).kind,'timeout');
  const pending = service.handle({action:'test',id:agent.id,testId:'test-cancel'});
  await service.handle({action:'cancelTest',testId:'test-cancel'});
  assert.equal((await pending).kind,'cancelled');
  assert.equal(store.data.coding.agents[0].lastTest.kind,'timeout');
});

test('旧允许开关迁移默认 Coding 绑定和回退方式，显式解绑可持久化', async t => {
  const directory = await mkdtemp(path.join(tmpdir(),'v0571-migration-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  const store = new Store(directory);
  await store.load();
  delete store.data.agents[0].subagents;
  store.data.coding = {agents:[agent],settings:{allowAssistant:true,fallback:'external'}};
  await store.save();
  await store.load();
  assert.deepEqual(store.data.agents[0].subagents,agentBinding);
  const dom = new JSDOM('<form>'+agentEditor(store.data.agents[0],[],store.data)+'</form>');
  const form = dom.window.document.forms[0];
  form.querySelector('[name=codingSubagent][value=fake]').checked = false;
  form.querySelector('[name=dialogueSubagent][value=research]').checked = true;
  store.data.agents[0].subagents = readAgentEditor(new dom.window.FormData(form), form).subagents;
  await store.save();
  await store.load();
  assert.deepEqual(store.data.agents[0].subagents,{dialogue:['research'],coding:[],fallback:'external'});
});

test('Coding 工具与意图路由按当前智能体绑定生效', async () => {
  const store = {data:initialState(),save:async()=>{},log:()=>{}};
  store.data.coding = {agents:[agent],settings:{allowAssistant:true}};
  store.data.agents[0].subagents = agentBinding;
  const deps = {codingTasks:Object.assign(new EventEmitter(),{list:()=>[]})};
  const run = agentId => executeAppTool('app_coding_agents',{}, {store,deps,agentId});
  assert.equal((await run('assistant')).defaultAgent,'fake');
  assert.equal((await run('research')).message,CODING_DISABLED);
  const service = createConversationService({store,appTools:deps,active:new Map(),view:()=>store.data,key:()=>'',request:()=>assert.fail('未绑定时应返回绑定提示')});
  await service.run({id:'v0571-chat',agentId:'research',prompt:'修复策略代码'});
  assert.equal(store.data.chats[0].messages.at(-1).content,CODING_DISABLED);
});

test('绑定的对话子智能体使用自己的角色指令，只请求一次无工具答复', async () => {
  const store = {data:initialState(),save:async()=>{},log:()=>{}};
  store.data.agents[0].subagents = {dialogue:['research'],coding:[],fallback:'auto'};
  const calls=[];
  const service=createConversationService({store,active:new Map(),view:()=>store.data,key:()=>'',request:async(_s,_k,messages,_signal,tools)=>{
    calls.push({messages,tools});
    if (calls.length===1) return {message:{role:'assistant',content:'',tool_calls:[{
      id:'delegate',type:'function',function:{name:'app_subagent_ask',arguments:JSON.stringify({agentId:'research',prompt:'复核数据'})},
    }]}};
    return {text:calls.length===2?'子智能体答复':'汇总答复'};
  }});
  await service.run({id:'delegate-chat',agentId:'assistant',prompt:'请研究分析师复核数据'});
  assert.ok(calls[0].tools.some(item=>item.function.name==='app_subagent_ask'));
  assert.match(calls[1].messages[0].content,/你是研究分析师/);
  assert.equal(calls[1].messages[1].content,'复核数据');
  assert.equal(calls[1].tools,undefined);
  assert.deepEqual(store.data.chats[0].messages.at(-1).subagentResults,[{name:'研究分析师',text:'子智能体答复'}]);
});

test('自动化 Coding 分区提供任务列表及发起迭代入口', () => {
  const html=automationPage({}, {action:button,empty:()=>'',tab:'coding',codingProject:'/tmp/fixture',codingTasks:[{id:'job',title:'校验回测',status:'review'}]});
  assert.match(html,/data-id="coding">Coding 任务/);
  assert.match(html,/data-action="codingTaskStart">发起迭代/);
  assert.match(html,/校验回测/);
  assert.match(html,/data-action="codingTaskOpen">查看详情/);
});

test('预览菜单只有下载、版本历史、在成果中心查看', () => {
  const html=filePreviewPanel({id:'doc',name:'例子',format:'pptx',revision:1},{action:button,native:true,icon:()=>'<svg><path/></svg>'});
  const dom=new JSDOM(html);
  assert.deepEqual([...dom.window.document.querySelectorAll('.file-menu button')].map(el=>el.textContent),['下载','版本历史','在成果中心查看']);
  assert.equal(dom.window.document.querySelector('[data-action=documentExportPdf]').title,'导出 PDF');
});

test('Office 载入窗口在 opened 返回前 show 和 focus，重复打开复用同一窗口', async () => {
  const events=[];
  let finish, nextId=0;
  class Window extends EventEmitter {
    constructor(options) {
      super();
      assert.equal(options.show,false);
      this.webContents=new EventEmitter();
      this.webContents.id=++nextId;
      this.webContents.mainFrame={};
      this.webContents.setWindowOpenHandler=()=>{};
    }
    async loadFile(file){this.webContents.mainFrame.url=pathToFileURL(file).href;events.push(path.basename(file));}
    isDestroyed(){return false;}
    show(){events.push('show');}
    focus(){events.push('focus');}
    destroy(){this.emit('closed');}
  }
  const kit={
    open:async(_id,_rev,{onApproved})=>{onApproved();return new Promise(resolve=>{finish=resolve;});},
    close:async()=>{}, shutdown:async()=>{},
  };
  const manager=createOfficeWindows({BrowserWindow:Window,ipcMain:{handle(){}},here:process.cwd(),kit,chat:{},models:{}});
  try {
    assert.equal((await manager.open('doc',1)).status,'opened');
    assert.deepEqual(events,['loading.html','show','focus']);
    await manager.open('doc',1);
    assert.equal(nextId,1);
    finish({sessionId:'session',name:'例子'});
    await new Promise(resolve=>setImmediate(resolve));
    assert.ok(events.includes('index.html'));
  } finally {await manager.close();}
});

test('Office 载入超时在原窗口显示重试，锁定时拒绝重试', async () => {
  let window, loads = 0, unlocked = true, failLoad;
  const handlers = new Map();
  class Window extends EventEmitter {
    constructor() {
      super();
      window = this;
      this.webContents = new EventEmitter();
      this.webContents.id = 1;
      this.webContents.mainFrame = {};
      this.webContents.setWindowOpenHandler = () => {};
    }
    async loadFile(file, {hash} = {}) {
      this.webContents.mainFrame.url = pathToFileURL(file).href + (hash ? '#' + hash : '');
    }
    isDestroyed() { return false; }
    show() {}
    focus() {}
    destroy() { this.emit('closed'); }
  }
  const kit = {
    async open(_id, _rev, {onApproved}) {
      onApproved();
      if (++loads === 1) return new Promise((_, reject) => { failLoad = reject; });
      return {sessionId:'retried',name:'例子'};
    },
    close:async()=>{}, shutdown:async()=>{},
  };
  const manager = createOfficeWindows({BrowserWindow:Window,ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},
    here:process.cwd(),kit,chat:{},models:{},canOpen:()=>unlocked});
  try {
    await manager.open('doc', 1);
    const firstWindow = window;
    failLoad(Error('载入 Office 文档超时'));
    await new Promise(resolve=>setImmediate(resolve));
    const frame = window.webContents.mainFrame;
    assert.match(frame.url, /loading\.html#error$/);
    const retry = handlers.get('willbuddy-office:loading');
    const event = {sender:window.webContents,senderFrame:frame};
    unlocked = false;
    assert.throws(()=>retry(event,'retry'), /已锁定/);
    unlocked = true;
    assert.equal((await retry(event,'retry')).status,'opened');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(loads,2);
    assert.equal(window,firstWindow);
    assert.match(frame.url, /office\/index\.html$/);
  } finally { await manager.close(); }
});

test('旧参数引号从界面移除，含空格的参数仍作为单个参数提交', () => {
  const legacy = {...agent,args:"'--acp' 'with spaces'"};
  const dom = new JSDOM('<form>'+codingForm(legacy,'/tmp/project')+'</form>');
  const form = dom.window.document.forms[0];
  assert.equal(form.elements.args.value,'--acp with spaces');
  assert.equal(form.elements.name.labels[0].textContent,'名称');
  assert.deepEqual(codingPayload(form,legacy).args,['--acp','with spaces']);
  assert.match(codingCards({agents:[legacy]},{action:button,busy:new Map()}), /--acp with spaces/);
});
