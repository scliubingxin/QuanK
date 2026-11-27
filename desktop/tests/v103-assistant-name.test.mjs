import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState} from '../core.mjs';
import {migrateAssistantName, LEGACY_ASSISTANT_NAME, DEFAULT_ASSISTANT_NAME} from '../src/shared/subagents.js';

const src = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('v1.0.3 新档案的默认助手名是 QuankSight 助手', () => {
  const state = initialState();
  const assistant = state.agents.find(a => a.id === 'assistant');
  assert.ok(assistant, '新档案必须有 assistant 智能体');
  assert.equal(assistant.name, 'QuankSight 助手');
  assert.equal(DEFAULT_ASSISTANT_NAME, 'QuankSight 助手');
  // 自我介绍（系统提示）里不能留旧名
  assert.doesNotMatch(assistant.prompt, /QuanK(?!Sight)/);
  assert.match(assistant.prompt, /你是 QuankSight 工作助手/);
});

test('v1.0.3 迁移：旧默认名改写为新默认名', () => {
  assert.equal(LEGACY_ASSISTANT_NAME, 'QuanK 助手');
  const data = {agents: [{id: 'assistant', name: 'QuanK 助手'}]};
  assert.equal(migrateAssistantName(data), true);
  assert.equal(data.agents[0].name, 'QuankSight 助手');
});

test('v1.0.3 迁移：用户改过名字的不动', () => {
  for (const name of ['我的助手', 'QuanK 助手（自定义）', '', 'quank 助手']) {
    const data = {agents: [{id: 'assistant', name}]};
    assert.equal(migrateAssistantName(data), false, `不应改写 ${JSON.stringify(name)}`);
    assert.equal(data.agents[0].name, name);
  }
});

test('v1.0.3 迁移：其他智能体和缺失字段都不受影响', () => {
  const data = {agents: [{id: 'research', name: '研究分析师'}, {id: 'assistant', name: 'QuankSight 助手'}]};
  assert.equal(migrateAssistantName(data), false);
  assert.equal(data.agents[0].name, '研究分析师');
  assert.equal(data.agents[1].name, 'QuankSight 助手');
  assert.equal(migrateAssistantName({agents: []}), false);
  assert.equal(migrateAssistantName({}), false);
  assert.equal(migrateAssistantName(undefined), false);
});

test('v1.0.3 core.mjs 载入时执行迁移', () => {
  const core = src('../core.mjs');
  assert.match(core, /migrateAssistantName\(this\.data\)/);
  assert.match(core, /import \{ migrateSubagents, migrateAssistantName \}/);
});

test('v1.0.3 用户可见的 QuanK 已清理（PDF/仪表盘标题与状态栏）', () => {
  const pdfHtml = src('../src/pdf/index.html');
  const pdfFrame = src('../src/pdf/frame-source.js');
  const vizHtml = src('../src/viz/index.html');
  assert.match(pdfHtml, /<title>QuankSight Office 文档预览<\/title>/);
  assert.doesNotMatch(pdfFrame, /QuanK(?!Sight)/);
  assert.match(pdfFrame, /QuankSight Office · 本机分页预览/);
  assert.match(pdfFrame, /可在 QuankSight Office 中继续编辑/);
  assert.match(vizHtml, /<title>QuankSight 仪表盘<\/title>/);
});
