import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('v1.0.2 工作台不再堆叠已处理的授权结果', () => {
  // v1.0.5: home draws no approval cards; a conversation draws only its own (tests/v105-home-approvals).
  assert.match(app, /conversationApprovalCards\(approvalRequests\(\), chatId/);
  assert.match(app, /homeApprovalCards\(approvalRequests\(\)\)/);
});

test('v1.0.2 非对话页面重绘时保留滚动位置', () => {
  assert.match(app, /const pageScrollers = \['\.workspace', '\.main', '\.page'\]/);
  assert.match(app, /if \(samePage\) for \(const \[sel, top\] of pageScrollers\)/);
  assert.match(app, /let lastRenderedPage = '';/);
});

test('v1.0.2 全部标为已读后提示仍需处理的项目并切到「待处理」', () => {
  const body = app.slice(app.indexOf("if (actionId === 'feedSeen')"), app.indexOf("if (actionId === 'feedDismiss')"));
  // v1.0.5: the count comes from the shared feedCounts (orders included), see tests/v105-feed-counts.
  assert.match(body, /feedCounts\(/);
  assert.match(body, /feedFilter = 'action'/);
});
