import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {initialState} from '../core.mjs';
import {classifyCoding} from '../src/shared/coding-intent.js';
import {composerSendMode} from '../src/shared/page-command.js';
import {executeAppTool} from '../services/app-tools.mjs';
import {createConversationService} from '../services/conversation.mjs';
import {createApprovalRules} from '../services/approval-rules.mjs';

const examples = {
  code: [
    '编写一个选股算法', '写一个成交量指标', '实现一个动量因子', '开发一个择时策略脚本', '迭代现有回测代码',
    '优化通威的策略代码', '重构数据清洗脚本', '修复均线计算函数', '修仓位模块的 bug', '给策略加滑点计算逻辑',
    '卖点命中率低，改一下', '为什么卖点命中率低，改一下', '止损改成 ATR 动态止损', '训练数据加一列换手率',
    '打开量化并修复策略代码', '用 Codex 优化通威的选股算法', '先解释代码，再修复 bug',
    '修改策略代码让卖点信号考虑成交量', '给策略加一个低波动因子', '修改策略代码让止损线根据波动率计算',
    '给策略加一个换手率指标', '给策略加新的信号计算逻辑', '调整止损线，改成跟踪止损',
    '写个脚本生成周报', '修改提醒脚本',
    'Write a breakout strategy script', 'Refactor the backtest pipeline', 'Fix the position sizing bug',
  ],
  explain: [
    '解释这段代码', '讲解一下均线算法', '这个因子的含义是什么', '这段脚本做什么的', '回测怎么实现的',
    'ATR 的原理是什么', '这个策略为什么会高买低卖', '代码里的 lambda 是什么意思', '函数是怎么工作的',
    '解读一下这段代码', '解释这个指标如何计算', '讲讲策略原理', '看懂脚本需要了解哪些概念',
    '如何实现一个趋势跟踪策略算法', '请问这个脚本有什么作用', 'Explain this code',
    'What does the function do?', 'How does this algorithm work?',
  ],
  tool: [
    '查看信号', '看下通威的买卖点', '刷新今天的信号', '跑一下回测', '运行去年全年的回测',
    '生成通威研报', '导出研究报告', '改风控规则', '调整定投参数', '修改我的定投计划',
    '打开量化', '查看我的股票池', '打开 Coding 智能体', '打开成果中心', '进入动态',
    '修改定投策略为每周一次', '修改风控规则', '写一份研报', '写个周报总结',
    '修改一下回测参数再跑一次', '帮我优化一下仓位配置', '调整策略的止损线到 8%',
    'Run the backtest', 'Show the signals', 'Change the risk rules',
  ],
  none: [
    '你好', '今天几号', '通威的收盘价是多少', '查一下汇率', '什么是复利', '讲个笑话',
    '谢谢', '帮我写一封邮件', '查找最近一封邮件', '用两句话概括这段文字', '天气如何',
    '把这句话翻译成德语', '这家公司在哪里', '为什么天是蓝色的', '给我一份晨跑计划',
    '优化通威的策略', '聊聊这个策略', 'Develop a breakout strategy',
    'Good morning', 'What is the closing price?', 'Summarize this paragraph',
  ],
};
for (const [intent, prompts] of Object.entries(examples))
  for (const prompt of prompts) test(`${intent} · ${prompt}`, () => assert.equal(classifyCoding(prompt), intent));

const review = {
  id: 'coding-1', title: 'ATR 止损', status: 'review', updatedAt: 1, branch: 'quank/iter-1',
  agent: {id: 'builtin', name: 'QuanK 内置', kind: 'builtin'},
  result: {diffStat: {files: 2, insertions: 18, deletions: 4}, backtest: {before: {returnPct: null, maxDrawdownPct: 5.1}, after: {returnPct: null, maxDrawdownPct: 4.8}}},
};
function setup({mode = 'local', settings = {}, agents = [], task = review, answer = true} = {}) {
  const store = {data: initialState(), async save() {}, log() {}};
  store.data.coding = {settings, agents};
  store.data.quant = {mode, source: '/quant/project'};
  const calls = [], dialogs = [], pages = [], feed = [], notifications = [], requests = [];
  const codingTasks = Object.assign(new EventEmitter(), {
    list: () => task ? [task] : [],
    get: id => id === task?.id ? task : undefined,
    async start(args) { calls.push(['start', args]); return {...review, status: 'running', result: undefined}; },
    async stop(id) { calls.push(['stop', id]); return {...task, status: 'stopped'}; },
    async followup(id, request) { calls.push(['followup', id, request]); return {...task, status: 'running'}; },
    async merge(id) { calls.push(['merge', id]); return {...task, status: 'merged'}; },
    async discard(id) { calls.push(['discard', id]); return {...task, status: 'discarded'}; },
    async respondPermission(...args) { calls.push(['permission', ...args]); return {...task, status: 'running'}; },
  });
  const deps = {codingTasks, openPage: (...args) => pages.push(args), feed: item => feed.push(item), notify: item => notifications.push(item)};
  const ask = async (...args) => { dialogs.push(args); return answer; };
  const run = (name, args, extra) => executeAppTool('app_coding_' + name, args, {store, deps, ask, chatId: 'chat-1', ...extra});
  const chat = async (prompt, {toolsEnabled = false, rules, response} = {}) => {
    const service = createConversationService({store, appTools: deps, approve: ask, rules, key: () => 'test', active: new Map(),
      view: () => store.data, request: async (_settings, _key, messages, _signal, definitions) => {
        requests.push({messages, definitions});
        return response?.(requests.length) || {text: '完成'};
      }});
    await service.run({prompt, toolsEnabled, id: 'chat-1'});
    return store.data.chats.find(chat => chat.id === 'chat-1').messages.at(-1);
  };
  return {store, deps, calls, dialogs, pages, feed, notifications, requests, run, chat, ask};
}
const start = {request: '把止损改成 ATR 动态止损'};
const taskArgs = {task: review.id};
const toolCall = (name, args) => ({message: {role: 'assistant', content: '我会在本地策略项目更新止损逻辑。', tool_calls: [
  {id: 'call-1', type: 'function', function: {name: 'app_coding_' + name, arguments: JSON.stringify(args)}},
]}});

test('启动确认显示内置、项目和需求，空代理列表仍交给任务服务', async () => {
  const f = setup();
  await f.run('start', start);
  assert.match(f.dialogs[0][1], /代理：QuanK 内置.*\n项目：\/quant\/project\n需求：把止损改成 ATR 动态止损/);
  assert.deepEqual(f.calls, [['start', {...start, source: 'chat', chatId: 'chat-1'}]]);
  assert.deepEqual(f.pages, [['coding-task', {taskId: review.id}]]);
});

test('列代理只返回公开字段，选择指定代理需确认，拒绝后无副作用', async () => {
  const f = setup({answer: false, agents: [{id: 'a', name: 'Codex', isDefault: true, envSealed: {TOKEN: 'private'}}]});
  const result = await f.run('agents');
  assert.equal(result.defaultAgent, 'a');
  assert.equal(result.fallback, 'auto');
  assert.ok(!JSON.stringify(result).includes('private'));
  assert.equal((await f.run('start', {...start, agent: 'Codex'})).status, 'denied');
  assert.match(f.dialogs[0][1], /代理：Codex/);
  assert.deepEqual(f.calls, []);
});

test('只接受已授权的其他代码项目', async () => {
  const f = setup();
  f.store.data.codeProjects = [{id: 'local', name: '本地项目'}];
  f.store.data.folders = [{id: 'project:local', path: '/other/project'}];
  await assert.rejects(f.run('start', {...start, project: '/ungranted'}), /授权/);
  await assert.rejects(f.run('start', {...start, project: '本地项目'}), /尚未接入/);
  assert.equal(f.calls.length + f.dialogs.length, 0);
  f.deps.codingTasks.supportsProject = true;
  await f.run('start', {...start, project: '本地项目'});
  assert.match(f.dialogs[0][1], /项目：\/other\/project/);
  assert.equal(f.calls[0][1].project, '/other/project');
});

test('查看最近任务并打开详情，继续和停止调用原任务', async () => {
  const f = setup();
  assert.equal((await f.run('status')).task.id, review.id);
  assert.deepEqual(f.pages, [['coding-task', {taskId: review.id}]]);
  await f.run('followup', {...taskArgs, request: '再跑一次'});
  await f.run('stop', taskArgs);
  assert.deepEqual(f.calls, [['followup', review.id, '再跑一次'], ['stop', review.id]]);
});

test('合并确认同时显示 diffStat 和回测前后，放弃也需要确认', async () => {
  const f = setup();
  await f.run('merge', taskArgs);
  assert.match(f.dialogs[0][1], /2 个文件，新增 18 行，删除 4 行\n回测对比\n最大回撤 −5\.1% → −4\.8%/);
  assert.doesNotMatch(f.dialogs[0][1], /\{|null/);
  await f.run('discard', taskArgs);
  assert.match(f.dialogs[1][0], /放弃/);
  assert.deepEqual(f.calls, [['merge', review.id], ['discard', review.id]]);
});

test('工具模式关闭仍提供 Coding 工具以及系统约束', async () => {
  const f = setup();
  const result = await f.chat(start.request, {response: n => n === 1 && toolCall('start', start)});
  assert.equal(f.requests[0].definitions.filter(d => d.function.name.startsWith('app_coding_')).length, 8);
  assert.match(f.requests[0].messages[0].content, /需要写代码时，调用 app_coding_start.*先用一句话复述.*改哪个项目.*不要在回复里贴大段代码.*短代码片段除外/);
  assert.deepEqual(f.calls, [['start', {...start, source: 'chat', chatId: 'chat-1'}]]);
  assert.equal(result.actions[0].label, '查看结果');
  assert.match(f.store.data.chats[0].messages.at(-2).content, /项目中处理.*ATR/);
});

test('规则未命中的策略诉求交给模型判断，解释请求保持普通对话', async () => {
  const f = setup();
  const prompt = '卖点应该考虑最近成交量突然放大的情况';
  assert.equal(classifyCoding(prompt), 'none');
  await f.chat(prompt, {response: n => n === 1 && toolCall('start', {request: prompt})});
  assert.ok(f.requests[0].definitions.some(d => d.function.name === 'app_coding_start'));
  assert.equal(f.calls.length, 1);
  await f.chat('解释一下策略原理');
  assert.equal(f.requests.at(-1).definitions, undefined);
});

test('关闭助手调用时不暴露任何 Coding 工具，并提供开启指引', async () => {
  const f = setup({settings: {allowAssistant: false}});
  await f.chat('你好', {toolsEnabled: true});
  assert.ok(!f.requests[0].definitions.some(d => d.function.name.startsWith('app_coding_')));
  const reply = await f.chat(start.request, {toolsEnabled: true});
  assert.match(reply.content, /设置里开启/);
  assert.equal(f.requests.length, 1);
  assert.equal((await f.run('status')).status, 'disabled');
});

test('外部模式无代理给出接入入口，有代理启动失败也使用同一入口', async () => {
  const f = setup({settings: {fallback: 'external'}});
  f.deps.codingTasks.start = async () => { throw Object.assign(new Error('缺少登录'), {kind: 'external_unavailable'}); };
  const reply = await f.chat(start.request, {response: n => n === 1 ? toolCall('start', start) : {text: '请接入外部代理'}});
  assert.match(f.requests[1].messages.at(-1).content, /仅用外部.*接入/);
  assert.deepEqual(reply.actions, [{label: '打开 Coding 智能体', page: 'agents', coding: {}}]);
  assert.equal(f.dialogs.length, 0);
  f.store.data.coding.agents = [{id: 'a', name: 'Codex'}];
  assert.match((await f.run('start', start)).message, /接入/);
  assert.equal(f.dialogs.length, 1);
});

test('远程模式提示仅支持本地项目', async () => {
  const f = setup({mode: 'remote'});
  assert.match((await f.chat(start.request)).content, /只作用于本地策略项目/);
  assert.match((await f.run('start', start)).message, /只作用于本地策略项目/);
  assert.equal(f.dialogs.length + f.calls.length + f.requests.length, 0);
});

test('计划与研究模式下编码请求走对话，真正打开页面的指令仍路由页面', () => {
  for (const mode of [{plan: true}, {research: true}]) {
    assert.equal(composerSendMode('打开量化并修复策略代码', mode), 'chat');
    assert.equal(composerSendMode('打开量化', mode), 'page');
  }
});

test('定时任务在工具关闭时也把启动确认记入待你确认', async () => {
  const f = setup();
  const rules = createApprovalRules({store: f.store});
  rules.unattended.set('chat-1', 'scheduled');
  await f.chat(start.request, {rules, response: n => n === 1 && toolCall('start', start)});
  assert.equal(f.dialogs.length + f.calls.length, 0);
  assert.equal(f.store.data.pendingApprovals.length, 1);
  assert.match(f.requests[1].messages.at(-1).content, /待你确认/);
});

test('仅需处理的状态推送动态与通知，完成摘要及按钮写入原对话一次', async () => {
  const f = setup();
  await f.chat(start.request, {response: n => n === 1 && toolCall('start', start)});
  for (const update of [
    {...review, status: 'running'},
    {...review, status: 'waiting_permission', pendingPermission: {requestId: 'p', summary: '写文件'}},
    {...review, status: 'waiting_permission', pendingPermission: {requestId: 'p', summary: '写文件'}},
    review, review, {...review, status: 'merged'}, {...review, id: 'other', status: 'failed', error: {message: '失败'}},
  ]) f.deps.codingTasks.emit('change', update);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.feed.length, 3);
  assert.equal(f.store.data.chats[0].messages.filter(message => message.codingPermissionId === 'p').length, 1);
  assert.equal(f.notifications.filter(Boolean).length, 3);
  const messages = f.store.data.chats[0].messages.filter(message => message.codingTaskId === review.id);
  assert.equal(messages.length, 1);
  assert.match(messages[0].content, /待合并[\s\S]*最大回撤 −5\.1% → −4\.8%/);
  assert.doesNotMatch(messages[0].content, /\{|null/);
  assert.deepEqual(messages[0].actions, [{label: '查看结果', page: 'coding-task', taskId: review.id}]);
});
test('零改动结果写入原对话，合并工具拒绝且不要求确认', async () => {
  const task = {...review, status: 'no_changes', chatId: 'chat-1',
    result: {diffStat: {files: 0, insertions: 0, deletions: 0}, backtest: {before: {returnPct: null}, after: {returnPct: null}}}};
  const f = setup({task});
  const result = await f.run('merge', taskArgs);
  assert.equal(result.status, 'failed');
  assert.match(result.message, /没有修改任何文件，无法合并/);
  assert.equal(f.dialogs.length, 0);
  assert.equal(f.calls.length, 0);
  await f.chat(start.request);
  f.deps.codingTasks.emit('change', task);
  await new Promise(resolve => setImmediate(resolve));
  const message = f.store.data.chats[0].messages.find(item => item.codingTaskId === task.id);
  assert.match(message.content, /本次没有修改任何文件[\s\S]*报告中没有回测对比/);
  assert.doesNotMatch(message.content, /待合并|\{|null/);
});

for (const [answer, decision] of [['允许', 'allow'], ['拒绝', 'deny'], ['本任务内总是允许', 'always'], ['总是允许', 'always'], ['always', 'always']]) {
  test(`对话中的「${answer}」只处理本对话等待中的任务权限`, async () => {
    const f = setup({task: {...review, chatId: 'chat-1', status: 'waiting_permission',
      pendingPermission: {requestId: 'p-1', kind: 'write', summary: '写文件'}}});
    assert.match((await f.chat(answer)).content, new RegExp('已' + answer));
    assert.deepEqual(f.calls, [['permission', review.id, 'p-1', decision]]);
    assert.equal(f.requests.length, 0);
  });
}
