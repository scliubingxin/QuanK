import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createApprovalRules } from '../services/approval-rules.mjs';
import { createApprover } from '../main/approval.mjs';
import { createApprovalNotifications, createInlineApprovals } from '../main/inline-approval.mjs';
import { approvalBar, approvalCard, revealApproval } from '../src/ui/approval-card.js';

const action = (label, name, id, css = '') =>
  `<button type="button" class="${css}" data-action="${name}" data-id="${id}">${label}</button>`;
const card = { requestId: 'fixture', agent: 'Coding 智能体', action: '运行命令', summary: 'echo <fixture>', taskLabel: '任务结束后失效。', time: 1 };
const parse = markup => new JSDOM(markup).window.document;
const buttons = document => [...document.querySelectorAll('[data-action="approvalDecision"]')];

test('desktop production code contains no native confirmation calls', async () => {
  const roots = ['main', 'runtime', 'services', 'src'];
  const files = ['main.mjs', 'preload.cjs'];
  for (const root of roots) {
    for (const name of await readdir(new URL(`../${root}/`, import.meta.url), { recursive: true })) {
      if (/\.(?:js|cjs|mjs|html)$/.test(name) && !/(?:^|\/)(?:vendor|assets)\//.test(name)) files.push(root + '/' + name);
    }
  }
  const whitelist = new Map();
  for (const file of files) {
    const text = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    const calls = [...text.matchAll(/\bdialog\.showMessageBox(?:Sync)?\s*\(|\b(?:window|globalThis)\.confirm\s*\(|\bif\s*\(\s*confirm\s*\(/g)];
    assert.equal(calls.length, whitelist.get(file) || 0, file);
  }
});

test('buttons are ordered deny, always, allow with allow as the primary choice, and decisions become an inline result', async () => {
  const broker = createInlineApprovals();
  const response = broker.request(card.action, card.summary, undefined, card);
  const pending = broker.list()[0];
  const doc = parse(approvalCard(pending, action));
  assert.equal(doc.querySelector('pre').textContent, card.summary);
  assert.deepEqual(buttons(doc).map(button => [button.textContent, button.dataset.id, button.className]), [
    ['拒绝', pending.requestId + ':deny', 'danger'],
    ['本任务内允许', pending.requestId + ':always', 'secondary'],
    ['允许一次', pending.requestId + ':allow', 'primary'],
  ]);
  assert.equal(broker.finish(pending.requestId, 'allow'), true);
  assert.equal(await response, 'allow');
  assert.match(approvalCard(broker.list()[0], action), /✓ 已允许一次 · \d{2}:\d{2}/);
  assert.equal(buttons(parse(approvalCard(broker.list()[0], action))).length, 0);
});

test('merge, discard, delete and orders reject task-wide decisions in the UI and host', async () => {
  const broker = createInlineApprovals();
  for (const title of ['合并并重启引擎', '放弃迭代', '删除文档', '确认委托下单']) {
    const answer = broker.request(title, '', undefined, { taskLabel: '仅本任务', choices: ['deny', 'allow', 'always'] });
    const request = broker.list().at(-1);
    assert.deepEqual(buttons(parse(approvalCard(request, action))).map(button => button.textContent), ['拒绝', '确认']);
    assert.equal(broker.finish(request.requestId, 'always'), false);
    assert.equal(broker.finish(request.requestId, 'deny'), true);
    assert.equal(await answer, 'deny');
  }
});

test('request IDs settle once, and expired or cancelled requests cannot be approved', async () => {
  const broker = createInlineApprovals();
  const controller = new AbortController();
  const first = broker.request('运行命令', 'first');
  const second = broker.request('写入文件', 'second', controller.signal);
  const [a, b] = broker.list();
  assert.equal(broker.finish(a.requestId, 'allow'), true);
  assert.equal(broker.finish(a.requestId, 'deny'), false);
  assert.equal(await first, 'allow');
  controller.abort();
  await assert.rejects(second, { name: 'AbortError' });
  assert.equal(broker.finish(b.requestId, 'allow'), false);
  assert.equal(broker.list()[1].decision, 'cancelled');
});

test('the bar counts cross-conversation requests and targets the earliest card', () => {
  const later = { ...card, requestId: 'later', time: 2, chatId: 'other', source: '另一会话' };
  const done = { ...card, requestId: 'done', time: 0, decision: 'allow' };
  const document = parse(approvalBar([later, done, card], 'current', action) + approvalCard(card, action));
  assert.match(document.querySelector('[role="status"]').textContent, /2 项待授权 · 另一会话/);
  const target = document.querySelector('[data-action="approvalJump"]').dataset.id;
  assert.equal(target, card.requestId);
  const element = document.querySelector('[data-approval-id]');
  let scroll;
  element.scrollIntoView = options => { scroll = options; };
  assert.equal(revealApproval(document, target), true);
  assert.equal(document.activeElement, element);
  assert.equal(scroll.block, 'nearest');
  assert.equal(element.classList.contains('inline-approval-highlight'), true);
  assert.equal(revealApproval(document, 'missing'), false);
  assert.equal(approvalBar([done], '', action), '');
});

test('background notification is sent once per request and opens that request', () => {
  let focused = true;
  const sent = [], opened = [];
  const notify = createApprovalNotifications({
    isFocused: () => focused,
    send: (request, click) => sent.push([request.requestId, click]),
    open: id => opened.push(id),
  });
  notify(card);
  assert.deepEqual(sent, []);
  focused = false;
  notify({ ...card });
  assert.deepEqual(sent, []);
  const background = { ...card, requestId: 'background' };
  notify(background);
  notify({ ...background });
  assert.equal(sent.length, 1);
  sent[0][1]();
  assert.deepEqual(opened, ['background']);
});

test('task-wide consent covers the same safe scope and expires with the run', async () => {
  const broker = createInlineApprovals();
  const approve = createApprover({ approvals: broker });
  const signal = new AbortController().signal;
  const scope = { ruleScope: { label: 'git status', key: 'status' } };
  const first = approve('运行命令', 'git status', signal, scope);
  assert.equal(broker.finish(broker.list().at(-1).requestId, 'always'), true);
  assert.equal(await first, true);
  assert.equal(await approve('运行命令', 'git status', signal, scope), true);
  assert.equal(broker.list().length, 1);
  const next = approve('运行命令', 'git status', new AbortController().signal, scope);
  assert.equal(broker.finish(broker.list().at(-1).requestId, 'deny'), true);
  assert.equal(await next, false);
});

test('a scheduled approval can save a rule only for its own task and settles once', async () => {
  const store = { data: {}, save: async () => {} };
  const rules = createApprovalRules({ store });
  rules.unattended.set('fixture-chat', 'fixture-task');
  const safe = rules.defer({ chatId: 'fixture-chat', title: '读取网页内容',
    candidate: { kind: 'browser', origin: 'https://example.com', label: '网站 https://example.com' } });
  const highRisk = rules.defer({ chatId: 'fixture-chat', title: '删除文档' });
  await assert.rejects(rules.handle({ action: 'resolveInline', id: highRisk.id, decision: 'always' }), /逐次确认/);
  await rules.handle({ action: 'resolveInline', id: safe.id, decision: 'always' });
  await rules.handle({ action: 'resolveInline', id: safe.id, decision: 'deny' });
  assert.equal(store.data.approvalRules.length, 1);
  assert.equal(store.data.approvalRules[0].taskId, 'fixture-task');
  assert.deepEqual(store.data.resolvedApprovals.map(item => item.decision), ['always']);
});

test('one-time network consent displays its limit and omits the task-wide button', () => {
  const document = parse(approvalCard({ ...card, network: true, onceOnly: true, choices: ['deny', 'allow', 'always'] }, action));
  assert.deepEqual(buttons(document).map(button => button.textContent), ['拒绝', '允许一次']);
  assert.equal(document.querySelector('.inline-approval-network').textContent, '需要联网');
  assert.equal(document.querySelector('.inline-approval-card small').textContent, '联网授权仅限本次命令');
});
