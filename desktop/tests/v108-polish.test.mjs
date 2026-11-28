// [v1.0.8] polish: plan check marks, holdings note wraps, completed-sell count on the stock detail.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {codingTaskPage} from '../src/ui/coding-task.js';

const css = readFileSync(new URL('../src/workbench.css', import.meta.url), 'utf8');
const quant = readFileSync(new URL('../src/ui/quant.js', import.meta.url), 'utf8');
const action = (label, act, id = '') => `<button type="button" data-action="${act}" data-id="${id}">${label}</button>`;
const task = {id: 'p', title: '计划示例', status: 'running', agent: {name: '演示 Coding 智能体'}, updatedAt: 1,
  stream: [{type: 'plan', text: 'completed · 读取上下文\nin_progress · 修改代码\npending · 运行测试\n没有状态的一行', at: 1}]};

test('plan entries carry a mark per state; finished steps are checked, not struck through', () => {
  const doc = new JSDOM(codingTaskPage(task, {action, date: () => '10:10', markdown: t => t})).window.document;
  const items = [...doc.querySelectorAll('.ct-plan-list li')];
  assert.deepEqual(items.map(li => li.dataset.planState), ['completed', 'in_progress', 'pending', 'pending']);
  assert.deepEqual(items.map(li => li.querySelector('.ct-plan-mark').textContent), ['✓', '●', '○', '○']);
  assert.equal(items[0].querySelector('.ct-plan-text').textContent, '读取上下文');
  assert.equal(items[3].querySelector('.ct-plan-text').textContent, '没有状态的一行');
  assert.equal(items[0].querySelector('.ct-plan-mark').getAttribute('aria-label'), '已完成');
  const last = css.lastIndexOf('.ct-plan-list li.completed {');
  assert.match(css.slice(last, css.indexOf('}', last)), /text-decoration:none/);
});

test('the holdings note wraps instead of being cut off', () => {
  assert.match(css, /\.q-kpi b em \{ white-space:normal;/);
});

test('the stock detail counts completed sells like the research PPT', () => {
  assert.match(quant, /kpi\('完成交易（卖出）', bt\.trades === 0 \? '0<em>期内无卖出<\/em>'/);
  assert.match(quant, /bt\.winRate == null \|\| bt\.trades === 0 \? '—'/);
  assert.doesNotMatch(quant, /kpi\('交易次数'/);
});
