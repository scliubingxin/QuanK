// [v1.0.7] AI 对话 panel: document actions, prompt shape, wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildOfficeAIMessages, normalizeOfficeAIResult, OFFICE_DOC_ACTIONS} from '../services/office-ai.mjs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('document actions build messages from the document, not the selection', () => {
  for (const action of ['summarize', 'speech', 'logic']) {
    const m = buildOfficeAIMessages({action, kind: 'impress', document: '第一页：通威股份三季报。第二页：硅料价格。'});
    assert.equal(m.length, 2);
    assert.match(m[0].content, /资料/);
    assert.match(JSON.parse(m[1].content).document, /通威股份/);
  }
  const ask = buildOfficeAIMessages({action: 'doc_ask', kind: 'writer', document: '正文', instruction: '结论是什么？'});
  assert.equal(JSON.parse(ask[1].content).question, '结论是什么？');
  assert.ok(OFFICE_DOC_ACTIONS.has('summarize'));
});

test('empty document and missing question give readable errors', () => {
  assert.throws(() => buildOfficeAIMessages({action: 'summarize', kind: 'writer', document: '  '}), /先保存/);
  assert.throws(() => buildOfficeAIMessages({action: 'doc_ask', kind: 'writer', document: '正文'}), /问题/);
});

test('selection actions still require a selection', () => {
  assert.throws(() => buildOfficeAIMessages({action: 'polish', kind: 'writer', selection: {text: ''}}), /选择/);
});

test('document answers come back as plain answers', () => {
  assert.deepEqual(normalizeOfficeAIResult('summarize', '1. 要点'), {type: 'answer', text: '1. 要点'});
});

test('the edit window mounts the panel and main passes the document text', () => {
  const win = read('src/office/window.js');
  assert.match(win, /mountOfficeAIPanel\(\{doc:document, head, toolbar:toolbar\.element/);
  assert.match(win, /polish:\(\) => aiMenu\.run\('polish'\)/);
  assert.match(read('src/ui/office-ai-menu.js'), /run\(action, options\) \{/);
  assert.match(read('main.mjs'), /document: \['summarize','speech','logic','doc_ask'\]\.includes\(action\)/);
  const panel = read('src/ui/office-ai-panel.js');
  for (const label of ['总结要点', '生成演讲稿', '检查逻辑结构', '优化选中文字']) assert.ok(panel.includes(label), label);
});
