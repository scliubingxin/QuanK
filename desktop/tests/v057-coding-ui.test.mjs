import { codingTaskPage } from '../src/ui/coding-task.js';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {bindCodingForm, codingForm, codingPage, codingPayload, codingPreset, codingTestResult, workBuddyPreset} from '../src/ui/coding.js';
import {capabilityTabs} from '../src/ui/capability-library.js';
import {codingPageCommand} from '../src/shared/page-command.js';

function editable(agent, project = '/tmp/strategy') {
  const dom = new JSDOM('<dialog open><form>' + codingForm(agent, project) + '</form></dialog>');
  const dialog = dom.window.document.querySelector('dialog');
  return {dialog, form: dialog.querySelector('form')};
}

test('Coding 表单字段、工作目录和已保存密钥的留空与单独删除', () => {
  const agent = {id: 'a', name: '代理', command: '/tmp/agent', args: ['with spaces'], description: '说明', env: [{key: 'API_KEY', hasValue: true, value: 'must-not-echo'}]};
  const {dialog, form} = editable(agent);
  for (const field of ['name', 'command', 'args', 'description', 'cwd']) assert.ok(form.elements.namedItem(field));
  assert.equal(form.elements.cwd.value, '/tmp/strategy');
  assert.equal(form.elements.cwd.readOnly, true);
  assert.match(form.elements.args.placeholder, /支持 shell 引号/);
  assert.match(dialog.textContent, /只接入你信任的编码代理/);
  const password = form.querySelector('[data-coding-value]');
  assert.equal(password.type, 'password');
  assert.equal(password.value, '');
  assert.match(password.placeholder, /已保存，留空不修改/);
  assert.doesNotMatch(dialog.innerHTML, /must-not-echo/);
  assert.deepEqual(codingPayload(form, agent).env, []);
  assert.deepEqual(codingPayload(form, agent).args, ['with spaces']);
  bindCodingForm(dialog, agent, {});
  form.querySelector('[data-coding-delete]').click();
  assert.deepEqual(codingPayload(form, agent).env, [{key: 'API_KEY', value: null}]);
});

test('检测结果一键填入 WorkBuddy，预备环境变量且不填值', async () => {
  const agent = codingPreset({...workBuddyPreset, command: '/fixture/codebuddy'});
  const {dialog, form} = editable(agent);
  assert.deepEqual([form.elements.name.value, form.elements.command.value, form.elements.args.value], ['WorkBuddy', '/fixture/codebuddy', '--acp']);
  assert.deepEqual([...form.querySelectorAll('[data-coding-key]')].map(x => x.value), workBuddyPreset.needsEnv);
  assert.ok([...form.querySelectorAll('input[type=password]')].every(x => !x.value));
  bindCodingForm(dialog, agent, {browse: async () => '/other/executable'});
  form.querySelector('[data-coding-browse]').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(form.elements.command.value, '/other/executable');
  assert.ok(editable(agent, '').form.querySelector('[data-coding-test]').disabled);
});

test('六类失败有中文原因和建议，成功展示代理信息、回复和耗时', () => {
  for (const [kind, text] of Object.entries({
    not_found: /找不到代理命令.*路径/,
    no_acp: /未进入 ACP 模式.*codebuddy.*--acp/,
    auth: /鉴权失败.*检查 API Key 或先在终端登录/,
    quota: /额度用尽.*账单/,
    timeout: /响应超时.*网络/,
    crashed: /异常退出.*依赖/,
  })) assert.match(codingTestResult({ok: false, kind}), text);
  const result = codingTestResult({ok: true, agentInfo: {name: 'Fixture', version: '1.0'}, reply: '<正常>', ms: 42});
  assert.match(result, /Fixture · 1\.0 · 42 ms/);
  assert.match(result, /&lt;正常&gt;/);
});

test('标签、列表上次测试、设置默认值、规范入口和空任务区', () => {
  assert.match(capabilityTabs('coding'), /aria-selected="true"[^>]+data-id="coding"/);
  const markup = codingPage({agents: [{id: 'a', name: 'WorkBuddy', isDefault: true, command: 'codebuddy', args: '--acp', description: '本地代理', lastTest: {at: 1, ok: false, kind: 'auth'}}]}, {
    heading: (_, title, __, actions, stats) => title + actions + stats.flat().join(' '),
    action: text => '<button type="button">' + text + '</button>', empty: () => '', date: () => '测试时间',
    candidates: [workBuddyPreset], busy: new Set(), project: '/tmp/strategy',
  });
  const doc = new JSDOM(markup).window.document;
  assert.match(doc.querySelector('.coding-card').textContent, /鉴权失败 · 测试时间/);
  assert.match(doc.querySelector('.coding-detected').textContent, /WorkBuddy.*--acp/s);
  assert.equal(doc.querySelector('[name=fallback]').value, 'auto');
  assert.deepEqual([...doc.querySelectorAll('[name=fallback] option')].map(o => o.value), ['auto', 'external', 'builtin']);
  assert.ok(doc.querySelector('[name=allowAssistant]').checked);
  assert.deepEqual([...doc.querySelectorAll('#coding-settings button:disabled')].map(b => b.textContent), ['编辑迭代规范', '恢复默认']);
  assert.match(doc.body.textContent, /还没有 Coding 任务/);
});

test('页面和表单随窄容器收缩，沿用主题变量', async () => {
  const css = await readFile(new URL('../src/workbench.css', import.meta.url), 'utf8');
  assert.match(css, /\.coding-grid[^}]+minmax\(min\(100%,285px\),1fr\)/);
  assert.match(css, /\.coding-command, \.coding-env-row[^}]+flex-wrap:wrap/);
  assert.match(css, /\.coding-form fieldset[^}]+var\(--line\)/);
});

test('对话导航指令精确匹配，普通 WorkBuddy 讨论和编码需求继续走对话', async () => {
  assert.equal(codingPageCommand('打开 Coding 智能体'), 'open');
  assert.equal(codingPageCommand('请帮我接入 WorkBuddy。'), 'workbuddy');
  for (const text of ['用 WorkBuddy 优化通威的买点', '怎么接入 WorkBuddy', '对比 Coding 智能体']) assert.equal(codingPageCommand(text), '');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /const codingCommand = .*codingPageCommand\(prompt\)[\s\S]+?await openPageTab\('agents'\)[\s\S]+?showCodingForm\(codingPreset/);
});

test('空任务显示置灰合并和可打开的项目相对报告路径', () => {
  const html = codingTaskPage({ id: 'fixture', status: 'no_changes', request: '', branch: 'iter',
    result: { diffStat: {files: 0, insertions: 0, deletions: 0}, reportPath: '/private/tmp/project/.quank/reports/fixture.md',
      backtest: {before: {maxDrawdownPct: 5.1}, after: {maxDrawdownPct: 4.8}} } }, {
    action: (label, act, id) => `<button data-action="${act}" data-id="${id}">${label}</button>`,
    date: () => '',
  });
  assert.match(html, /无改动/);
  assert.match(html, /disabled>合并并重启引擎/);
  assert.match(html, /data-action="codingTaskFollowup"/);
  assert.match(html, /data-action="codingTaskDiscard"/);
  assert.match(html, /data-action="codingTaskReport"[^>]*>\.quank\/reports\/fixture\.md/);
  assert.match(html, /最大回撤<\/th><td>−5\.1%<\/td><td>−4\.8%/);
  assert.doesNotMatch(html, /\/private\/tmp|data-action="codingTaskMerge"|>收益</);
});
