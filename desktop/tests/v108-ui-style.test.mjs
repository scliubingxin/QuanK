// [v1.0.8] Coding task page and approval cards follow the design system: structure, classes and readable colours.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {codingTaskPage, codingSteps} from '../src/ui/coding-task.js';
import {approvalCard, approvalBar, approvalKind} from '../src/ui/approval-card.js';
import {backtestDeltas, backtestRows} from '../src/shared/coding-result.js';
import {opLabel, opTone} from '../src/shared/quant.js';

const action = (label, act, id = '', cls = 'secondary') => `<button type="button" class="${cls}" data-action="${act}" data-id="${id}">${label}</button>`;
const date = () => '10:10';
const parse = html => new JSDOM(html).window.document;
const css = readFileSync(new URL('../src/workbench.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

const reviewTask = {
  id: 'fixture', title: '给定投策略加一个 20 日波动率过滤', status: 'review', branch: 'quank/iter-20261128-a', agent: {name: '演示 Coding 智能体'},
  request: '加一个波动率过滤', updatedAt: 1, strategyProject: true,
  stream: [
    {type: 'text', text: '先读取 **策略上下文**。', at: 1},
    {type: 'tool', text: '运行命令 python -m unittest · in_progress', at: 2},
    {type: 'tool', text: '运行命令 python -m unittest · completed', at: 3},
  ],
  result: {
    diffStat: {files: 2, insertions: 18, deletions: 4}, tests: {ok: true, summary: '5 个用例全部通过'}, reportPath: '/x/.quank/reports/fixture.md',
    backtest: {before: {returnPct: -24.64, maxDrawdownPct: 36.79, winRatePct: 11.5, trades: 96}, after: {returnPct: -20.33, maxDrawdownPct: 32.27, winRatePct: 14.3, trades: 77}},
    diff: 'diff --git a/vol_filter.py b/vol_filter.py\n--- a/vol_filter.py\n+++ b/vol_filter.py\n@@ -1,2 +1,3 @@\n import math\n-LIMIT = 1\n+LIMIT = 0.35\n+WINDOW = 20\n',
  },
};
const markdown = text => text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

test('the header has the title, agent, branch and a status pill', () => {
  const doc = parse(codingTaskPage(reviewTask, {action, date, markdown}));
  const head = doc.querySelector('.coding-task-page > header.ct-head');
  assert.equal(head.querySelector('h2').textContent, reviewTask.title);
  assert.equal(head.querySelector('.coding-task-status.review').textContent, '待合并');
  assert.match(head.querySelector('.ct-meta').textContent, /演示 Coding 智能体/);
  assert.equal(head.querySelector('.ct-meta code').textContent, 'quank/iter-20261128-a');
  assert.equal(head.querySelectorAll('svg').length, 3, 'line icons from the shared set');
});

test('the step timeline shows where the task is', () => {
  const doc = parse(codingTaskPage(reviewTask, {action, date, markdown}));
  const steps = [...doc.querySelectorAll('.ct-steps > .ct-step')];
  assert.deepEqual(steps.map(step => step.querySelector('.ct-step-label').textContent), ['读取上下文', '修改代码', '运行测试', '回测对比', '待合并']);
  assert.deepEqual(steps.map(step => step.classList[1]), ['done', 'done', 'done', 'done', 'current']);
  assert.equal(doc.querySelector('[aria-current="step"] .ct-step-label').textContent, '待合并');
  const running = {...reviewTask, status: 'running', result: null, stream: [{type: 'tool', text: '编辑文件 vol_filter.py · completed', at: 1}]};
  assert.deepEqual(codingSteps(running).map(step => step.state), ['done', 'current', 'todo', 'todo', 'todo']);
  const waiting = {...running, status: 'waiting_permission', stream: [{type: 'tool', text: '运行命令 python -m unittest · pending', at: 1}]};
  assert.deepEqual(codingSteps(waiting).map(step => step.state), ['done', 'done', 'wait', 'todo', 'todo']);
  assert.deepEqual(codingSteps({...reviewTask, status: 'merged'}).map(step => step.state).at(-1), 'done');
  assert.deepEqual(codingSteps({...running, status: 'failed'}).map(step => step.state), ['done', 'failed', 'todo', 'todo', 'todo']);
});

test('agent text renders as chat markdown and tool output as a collapsible monospace block with a copy button', () => {
  const doc = parse(codingTaskPage(reviewTask, {action, date, markdown}));
  assert.equal(doc.querySelector('.ct-msg .ct-msg-body.markdown strong').textContent, '策略上下文');
  const tools = doc.querySelectorAll('details.ct-tool');
  assert.equal(tools.length, 1, 'status updates of one tool call are merged');
  assert.ok(tools[0].classList.contains('completed'));
  assert.equal(tools[0].querySelector('.ct-tool-state').textContent, '完成');
  assert.equal(tools[0].querySelector('.ct-block-title').textContent, '运行命令 python -m unittest');
  assert.ok(tools[0].querySelector('.ct-code > pre'));
  assert.equal(tools[0].querySelector('.ct-copy').dataset.action, 'codingCopy');
  assert.equal(tools[0].querySelector('.ct-copy').dataset.id, tools[0].dataset.codingFold);
  assert.match(css, /\.coding-task-page \.ct-code pre \{[^}]*max-height:260px;[^}]*ui-monospace/);
  assert.match(app, /actionId === 'codingCopy'/);
  assert.match(app, /codingTaskPage\(task, \{ action, date, markdown: rich,/);
  assert.match(app, /import \{icon\} from '\.\/ui\/icons\.js';/);
  assert.doesNotMatch(app, /\nconst paths = \{/);
});

test('diffs are a clean +/- view per file', () => {
  const doc = parse(codingTaskPage(reviewTask, {action, date, markdown}));
  const file = doc.querySelector('details.ct-file');
  assert.equal(file.querySelector('.ct-block-title').textContent, 'vol_filter.py');
  assert.equal(file.querySelector('.ct-diffstat').textContent, '+2 −1');
  assert.equal(file.querySelectorAll('.ct-diff-add').length, 2);
  assert.equal(file.querySelectorAll('.ct-diff-del').length, 1);
  assert.equal(file.querySelectorAll('.ct-diff-hunk').length, 1);
});

test('the backtest comparison is a KPI table with green / red changes', () => {
  const rows = backtestDeltas(reviewTask.result.backtest);
  assert.deepEqual(rows.map(row => [row.label, row.before, row.after, row.delta, row.tone]), [
    ['收益', '−24.64%', '−20.33%', '+4.31 个点', 'better'],
    ['最大回撤', '−36.79%', '−32.27%', '+4.52 个点', 'better'],
    ['胜率', '11.5%', '14.3%', '+2.8 个点', 'better'],
    ['交易次数', '96', '77', '−19 笔', 'same'],
  ]);
  assert.deepEqual(backtestDeltas({before: {returnPct: 3}, after: {returnPct: 1}})[0].tone, 'worse');
  assert.deepEqual(backtestRows({before: {returnPct: -1}, after: {}})[0], ['收益', '−1%', '—']);
  const doc = parse(codingTaskPage(reviewTask, {action, date, markdown}));
  const table = doc.querySelector('.ct-kpi-table table');
  assert.deepEqual([...table.querySelectorAll('thead th')].map(th => th.textContent), ['指标', '修改前', '修改后', '变化']);
  assert.equal(table.querySelectorAll('td.ct-delta.better').length, 3);
  assert.match(css, /\.ct-delta\.better \{ color:#0f7a43; \}/);
  assert.match(css, /\.ct-delta\.worse \{ color:#c62828; \}/);
});

test('the action bar sticks to the bottom: 合并 primary, 放弃 danger', () => {
  const doc = parse(codingTaskPage({...reviewTask, status: 'review'}, {action, date, markdown}));
  const bar = doc.querySelector('.coding-task-page > footer.ct-actions');
  assert.ok(bar, 'the actions are the last element of the page');
  assert.equal(doc.querySelector('.coding-task-page').lastElementChild, bar);
  assert.equal(bar.querySelector('[data-action="codingTaskMerge"]').className, 'primary');
  assert.equal(bar.querySelector('[data-action="codingTaskDiscard"]').className, 'danger');
  assert.match(css, /\.coding-task-page \.ct-actions \{ position:sticky; bottom:0;/);
  assert.match(css, /@container qkzone \(max-width: 480px\) \{\n  \.ct-steps \{ grid-template-columns:1fr;/);
});

test('approval cards: amber accent, icon by kind, 允许 primary, 拒绝 danger, pulse only while new', () => {
  const now = 10_000;
  const request = {requestId: 'r1', agent: 'Coding 智能体', action: '运行测试命令', summary: 'python -m unittest', taskLabel: '任务结束后失效。', time: now - 500};
  const doc = parse(approvalCard(request, action, {now}));
  const card = doc.querySelector('.inline-approval-card');
  assert.equal(card.dataset.kind, 'command');
  assert.ok(card.querySelector('header .inline-approval-icon svg'));
  assert.ok(card.classList.contains('fresh'));
  assert.equal(card.getAttribute('style'), '--qk-age:-500ms');
  assert.deepEqual([...card.querySelectorAll('.inline-approval-actions button')].map(b => [b.textContent, b.className]),
    [['拒绝', 'danger'], ['本任务内允许', 'secondary'], ['允许一次', 'primary']]);
  const old = parse(approvalCard(request, action, {now: now + 10_000})).querySelector('.inline-approval-card');
  assert.ok(!old.classList.contains('fresh'));
  assert.equal(approvalKind({action: '写入文件 a.py'}), 'file');
  assert.equal(approvalKind({action: '抓取网页', network: true}), 'network');
  const bar = parse(approvalBar([{...request, chatId: 'other'}], 'mine', action)).querySelector('.inline-approval-bar');
  assert.ok(bar.querySelector('.inline-approval-icon svg'));
  assert.equal(bar.querySelector('[data-action="approvalJump"]').className, 'primary');
  for (const rule of [/\.inline-approval-card \{ position:relative; border:1px solid var\(--approval-tint-border\); border-left:4px solid var\(--approval-accent\); background:var\(--approval-tint\);/,
    /\.inline-approval-bar \{ border:1px solid var\(--approval-tint-border\); border-left:4px solid var\(--approval-accent\);/,
    /\.inline-approval-actions button:focus-visible, [^{]*\{ outline:2px solid #2f62f5; outline-offset:2px; \}/,
    /@keyframes qk-approval-pulse/, /@media \(prefers-reduced-motion: reduce\) \{ \.inline-approval-card\.fresh/,
    /\.coding-task-page details\.coding-approval-bar\[data-pending\] \{ border-color:var\(--approval-tint-border\); border-left:4px solid var\(--approval-accent\);/]) {
    assert.match(css, rule);
  }
});

// WCAG relative luminance and contrast ratio, with alpha colours composited over the surface below them.
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const lum = c => { const [r, g, b] = c.map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const over = (rgba, base) => { const [r, g, b, alpha] = rgba.match(/[\d.]+/g).map(Number); return [r, g, b].map((v, i) => Math.round(v * alpha + base[i] * (1 - alpha))); };
const token = (block, name) => new RegExp(`--${name}:([^;]+);`).exec(block)[1].trim();

test('approval and Coding page colours meet WCAG AA', () => {
  const light = /:root \{ --approval-accent:[^}]+\}/.exec(css)[0];
  const dark = /@media \(prefers-color-scheme: dark\) \{\n  :root \{ --approval-accent:[^}]+\}/.exec(css)[0];
  const tint = rgb(token(light, 'approval-tint'));
  const darkPanel = rgb('#212733');
  const darkTint = over(token(dark, 'approval-tint'), darkPanel);
  const pairs = [
    ['amber text on the tint', rgb(token(light, 'approval-text')), tint],
    ['card title on the tint', rgb(token(light, 'approval-title')), tint],
    ['拒绝 on the tint', rgb('#b42318'), tint],
    ['secondary button text', rgb('#1f2a44'), rgb('#ffffff')],
    ['白字 on the brand button', rgb('#ffffff'), rgb('#2f62f5')],
    ['better delta', rgb('#0f7a43'), rgb('#ffffff')],
    ['worse delta', rgb('#c62828'), rgb('#ffffff')],
    ['dark amber text', rgb(token(dark, 'approval-text')), darkTint],
    ['dark card title', rgb(token(dark, 'approval-title')), darkTint],
    ['dark 拒绝', rgb('#ffb3b3'), darkTint],
    ['dark better delta', rgb('#8ee0b0'), darkPanel],
    ['dark worse delta', rgb('#ff9aa4'), darkPanel],
  ];
  for (const [name, fg, bg] of pairs) assert.ok(ratio(fg, bg) >= 4.5, `${name}: ${ratio(fg, bg).toFixed(2)}`);
  // the amber accent border is a non-text UI component: 3:1 against the panel
  assert.ok(ratio(rgb(token(light, 'approval-accent')), rgb('#ffffff')) >= 3);
  assert.ok(ratio(rgb(token(dark, 'approval-accent')), darkPanel) >= 3);
});

test('backtest operations show Chinese labels', () => {
  assert.equal(opLabel('BUY'), '买入');
  assert.equal(opLabel('REBUY'), '回补买入');
  assert.equal(opTone('REBUY'), 'buy');
  assert.equal(opLabel('分批买入'), '分批买入');
  const quant = readFileSync(new URL('../src/ui/quant.js', import.meta.url), 'utf8');
  assert.match(quant, /<td class="q-op \$\{opTone\(o\.action\)\}">\$\{escape\(opLabel\(o\.action\)\)\}<\/td>/);
  assert.match(quant, /action\('添加微信', 'quantContact', '', 'secondary'\)/);
});

// The tutorial recording and other automation find these elements by data-* hooks, not by layout classes.
test('stable data-* hooks for automation', () => {
  const waiting = {...reviewTask, status: 'waiting_permission', result: null,
    pendingPermission: {requestId: 'p1', action: '运行测试', summary: 'python -m unittest', time: 1}};
  const doc = parse(codingTaskPage(waiting, {action, date, markdown}));
  const page = doc.querySelector('[data-coding-task="fixture"]');
  assert.equal(page.dataset.codingStatus, 'waiting_permission');
  assert.equal(page.querySelector('[data-coding-status-label]').textContent, '待授权');
  assert.deepEqual([...page.querySelectorAll('[data-coding-step]')].map(step => step.dataset.codingStep), ['context', 'edit', 'test', 'backtest', 'review']);
  assert.equal(page.querySelector('[data-coding-step="test"]').dataset.state, 'wait');
  assert.deepEqual([...page.querySelectorAll('[data-coding-output]')].map(block => block.dataset.codingOutput), ['text', 'tool']);
  const pending = [...page.querySelectorAll('[data-approval-pending]')];
  assert.ok(pending.length >= 1 && pending.every(el => el.dataset.approvalId === 'p1'));
  assert.ok(page.querySelector('[data-coding-approvals] summary [data-approval-pending] [data-action="approvalDecision"][data-id="p1:always"]'),
    'the collapsed bar carries the buttons of the waiting request');
  assert.ok(page.querySelector('[data-coding-actions] [data-action="codingTaskStop"]'));
  const review = parse(codingTaskPage(reviewTask, {action, date, markdown}));
  assert.ok(review.querySelector('[data-coding-result] [data-coding-backtest] table'));
  assert.ok(review.querySelector('[data-coding-file="vol_filter.py"] pre'));
  assert.ok(review.querySelector('[data-coding-actions] [data-action="codingTaskMerge"]'));
  assert.equal(review.querySelector('[data-coding-output="tool"]').dataset.state, 'completed');
  const decided = parse(approvalCard({requestId: 'd1', agent: 'A', action: 'B', decision: 'allow', finishedAt: 1}, action));
  assert.equal(decided.querySelector('[data-approval-pending]'), null);
});

test('a finished call with output lines still merges with its earlier status updates', () => {
  const task = {...reviewTask, stream: [
    {type: 'tool', text: '运行命令 python -m unittest · in_progress', at: 1},
    {type: 'tool', text: '运行命令 python -m unittest · completed\n.....\nRan 5 tests in 0.004s\n\nOK', at: 2},
  ]};
  const doc = parse(codingTaskPage(task, {action, date, markdown}));
  const tools = doc.querySelectorAll('details.ct-tool');
  assert.equal(tools.length, 1);
  assert.equal(tools[0].querySelector('.ct-block-title').textContent, '运行命令 python -m unittest');
  assert.equal(tools[0].dataset.state, 'completed');
  assert.match(tools[0].querySelector('pre').textContent, /Ran 5 tests/);
  assert.match(css, /\.coding-task-page \.ct-kpi-table tbody th \{ background:transparent; color:inherit; \}/);
});

test('the decided-only approval bar does not stick; result chips keep a soft corner', () => {
  assert.match(css, /\.coding-task-page details\.coding-approval-bar:not\(\[data-pending\]\) \{ position:relative; top:auto; box-shadow:none; \}/);
  assert.match(css, /\.ct-chip \{ border-radius:10px; \}/);
});
