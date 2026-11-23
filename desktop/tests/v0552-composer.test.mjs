
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {initialState} from '../core.mjs';
import {createConversationService} from '../services/conversation.mjs';
import {composerSendMode} from '../src/shared/page-command.js';
import {compactComposer} from '../src/ui/composer.js';
import {contextMeter} from '../src/ui/slash.js';
import {stockTab, openTab, activeTab} from '../src/ui/page-panel.js';
import {quantPage} from '../src/ui/quant.js';
import {mountKnowledge} from '../src/ui/knowledge.js';

const css = await readFile(new URL('../src/workbench.css', import.meta.url), 'utf8');
const narrow = css.slice(css.indexOf('[v0.55.2]'));

test('窄主区域留出组间距、快捷入口间距和页签分界线留白，压缩模型与用量显示', () => {
  assert.match(narrow, /@container qkzone \(width < 1000px\)\{[\s\S]*\.composer-bar\{[^}]*gap:10px/);
  assert.match(narrow, /\.composer-bar-start\{[^}]*gap:10px/);
  assert.match(narrow, /\.composer-bar-end\{gap:10px/);
  assert.match(narrow, /context-meter small\{display:none/);
  assert.match(narrow, /\.qk-hero \.suggestions\{margin-top:16px/);
  assert.match(narrow, /\.workspace\{padding-right:20px/);
  assert.match(narrow, /@container qkzone \(max-width:800px\)\{[\s\S]*\.composer-model-icon\{display:inline-flex/);
  const meter = new JSDOM(contextMeter({ratio: 0.02, tokens: 200, limit: 10000, level: 'ok'})).window.document.querySelector('[role=meter]');
  assert.match(meter.title, /2%/);
});

test('窄宽下恢复开启模式的文字，模型图标沿用原菜单', () => {
  assert.match(css, /\.composer-mode \.cm-label\{display:none/);
  assert.match(narrow, /\.composer-mode\.chosen \.cm-label\{display:inline/);
  const doc = new JSDOM(compactComposer({
    state: {agents: []}, files: [], images: [], escape: String, icon: () => '<svg></svg>',
    modelName: 'deepseek-flash', modelMarkup: '<select id="original-model"></select>',
    modes: {show: true, research: true, incognitoAllowed: true},
  })).window.document;
  assert.equal(doc.querySelector('.composer-mode.chosen .cm-label').textContent, '深度研究');
  assert.equal(doc.querySelectorAll('.composer-mode:not(.chosen)').length, 2);
  const model = doc.querySelector('[data-composer-trigger=model]');
  assert.equal(model.title, 'deepseek-flash');
  assert.ok(model.querySelector('.composer-model-icon svg'));
  assert.ok(doc.getElementById(model.getAttribute('aria-controls')).querySelector('#original-model'));
});

test('研究与计划模式下的页面指令走普通对话，研究问题保留原模式', async () => {
  for (const mode of ['plan', 'research']) {
    for (const prompt of ['打开通威的公司关系图', ' 查 看 营 收 ', '显示行情', '切到我的自选']) {
      assert.equal(composerSendMode(prompt, {[mode]: true}), 'page', prompt);
    }
    for (const prompt of [
      '查看通威近三年营收变化并分析原因',
      '研究一下去年光伏行情的走势',
      '查看通威和隆基的财务对比并写报告',
      '查看营收走势',
      '请切到我的自选',
      '去我的自选',
      '查看今年的行情',
      '查看行情里所有沪深北股票从上个月第一天到今天的日线',
    ]) {
      assert.equal(composerSendMode(prompt, {[mode]: true}), mode, prompt);
    }
  }
  assert.equal(composerSendMode('打开我的自选', {}), 'chat');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const send = app.slice(app.indexOf('async function send()'), app.indexOf('// [F1] 行情 page actions'));
  assert.match(send, /composerSendMode\(prompt,[^\n]+\n[^\n]+return sendPlan[^\n]+\n[^\n]+toast\('这是打开页面的指令，已按普通对话处理'\)[\s\S]*invoke\('chat'/);
});

test('普通对话直接解析通威并打开个股页签，信号未就绪时也加载且高亮关系图', async () => {
  const store = {data: initialState(), save: async () => {}, log: () => {}};
  const opened = [];
  let requests = 0;
  const service = createConversationService({
    store, active: new Map(), key: () => '', view: () => store.data,
    request: async () => { requests++; throw new Error('应直接打开关系图'); },
    appTools: {
      quant: {handle: async p => {
        assert.deepEqual(p, {action: 'resolveStock', query: '通威'});
        return {code: '600438', name: '通威股份'};
      }},
      openPage: (page, target) => opened.push({page, ...target}),
    },
  });
  await service.run({id: 'graph', prompt: '打开通威的公司关系图', toolsEnabled: false});
  assert.equal(requests, 0);
  assert.deepEqual(opened, [{page: 'quant', code: '600438', name: '通威股份', tab: 'graph'}]);
  assert.match(store.data.chats[0].messages.at(-1).content, /已在右侧页签打开通威股份.*公司关系图/);
  const [{code, name, tab: section}] = opened;
  const panel = openTab([stockTab(code, name)], stockTab(code, name, {section}));
  assert.equal(panel.tabs.length, 1);
  const active = activeTab(panel.tabs, panel.active);
  const doc = new JSDOM(quantPage({}, {action: () => '', open: active.code, panel: true, section: active.section, stockTitle: active.title})).window.document;
  const calls = [];
  mountKnowledge(doc, async args => {
    calls.push(args);
    return {nodes: [], svg: '<svg class="graph-result"></svg>'};
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, [{action: 'graph', code: '600438'}]);
  assert.ok(doc.querySelector('[data-kn=graph].chosen[aria-pressed=true]'));
  assert.ok(doc.querySelector('.graph-result'));
});
