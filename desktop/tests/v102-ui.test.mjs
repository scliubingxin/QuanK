import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('v1.0.2 工作台不再堆叠已处理的授权结果', () => {
  assert.match(app, /item => chatId \? item\.chatId === chatId : \(!item\.chatId && !item\.decision\)/);
});

test('v1.0.2 非对话页面重绘时保留滚动位置', () => {
  assert.match(app, /const pageScrollers = \['\.workspace', '\.main', '\.page'\]/);
  assert.match(app, /if \(samePage\) for \(const \[sel, top\] of pageScrollers\)/);
  assert.match(app, /let lastRenderedPage = '';/);
});

test('v1.0.2 全部标为已读后提示仍需处理的项目并切到「待处理」', () => {
  const body = app.slice(app.indexOf("if (actionId === 'feedSeen')"), app.indexOf("if (actionId === 'feedDismiss')"));
  assert.match(body, /visibleFeedCount\(state, 'action'\)/);
  assert.match(body, /feedFilter = 'action'/);
});
