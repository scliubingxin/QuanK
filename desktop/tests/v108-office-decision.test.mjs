// [v1.0.8] The Office AI confirm card looks and orders its buttons like the other approval cards.
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

test('Office decision card: icon header, danger for 拒绝, primary last, stable hooks', async () => {
  const {window} = new JSDOM('<div id="host"></div>');
  globalThis.document = window.document;
  try {
    const {showOfficeDecision} = await import('../src/ui/page-panel.js');
    const host = window.document.querySelector('#host');
    const card = showOfficeDecision(host, '允许 AI 将这项修改写入文档？', [['allow', '允许写入', true], ['deny', '拒绝']], () => true);
    assert.equal(card.dataset.kind, 'office');
    assert.ok(card.querySelector('header .inline-approval-icon svg'));
    assert.equal(card.querySelector('header strong').textContent, '允许 AI 将这项修改写入文档？');
    assert.deepEqual([...card.querySelectorAll('.inline-approval-actions button')].map(b => [b.textContent, b.className, b.dataset.officeDecision]),
      [['拒绝', 'danger', 'deny'], ['允许写入', 'primary', 'allow']]);
    const exit = showOfficeDecision(host, '退出前处理未保存修改', [['save', '保存并退出', true], ['discard', '放弃修改'], ['cancel', '取消退出']], () => true);
    assert.deepEqual([...exit.querySelectorAll('button')].map(b => b.className), ['danger', 'secondary', 'primary']);
  } finally { delete globalThis.document; }
});
