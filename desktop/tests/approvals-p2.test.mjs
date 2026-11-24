// [p2-m2] Smart approvals: rule scope, persistence, dialog option, tool-runtime integration and unattended scheduled runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store, initialState} from '../core.mjs';
import {ToolRuntime} from '../runtime/tools.mjs';
import {ruleCandidate, createApprovalRules, RULE_LIMIT} from '../services/approval-rules.mjs';
import {createTaskService} from '../services/tasks.mjs';
import {createWorkspaceService} from '../services/workspace.mjs';
import {pendingApprovalsPanel, approvalRulesPanel, pendingBanner} from '../src/ui/approvals.js';

const cmd = (executable, args, cwd = '/w') => ({executable, requestedExecutable: executable, args, cwd});

test('rule candidates: only low-risk, repeatable operations can be ruled', () => {
  assert.deepEqual(ruleCandidate('browser_read', {readScope: {url: 'https://news.example.com/a?b=1'}}), {kind: 'browser', origin: 'https://news.example.com', label: '网站 https://news.example.com'});
  assert.equal(ruleCandidate('browser_open', {url: 'https://x.org/p'}).origin, 'https://x.org');
  assert.equal(ruleCandidate('browser_open', {url: 'file:///etc/passwd'}), null);
  for (const n of ['browser_click', 'browser_fill', 'document_edit', 'document_write', 'document_patch', 'document_create', 'image_ocr']) assert.equal(ruleCandidate(n, {readScope: {url: 'https://a.b'}, documentToken: {readScope: {id: 'd'}}}), null, n);
  const git = ruleCandidate('cli_execute', {command: cmd('/usr/bin/git', ['status', '--short'])});
  assert.equal(git.kind, 'cli'); assert.deepEqual(git.argsPrefix, ['status']); assert.match(git.label, /git status/);
  for (const [exe, args] of [['/bin/sh', ['-c', 'true']], ['/usr/bin/python3', ['x.py']], ['/bin/rm', ['a']], ['/usr/bin/curl', ['https://a']], ['/usr/bin/git', ['push']], ['/usr/bin/git', ['clean', '-fd']], ['/usr/bin/npm', ['test']], ['/usr/bin/sudo', ['ls']]])
    assert.equal(ruleCandidate('cli_execute', {command: cmd(exe, args)}), null, exe + ' ' + args.join(' '));
  assert.equal(ruleCandidate('cli_execute', {command: cmd('/usr/bin/git', ['status']), projectService: {}}), null, 'project services always ask');
  assert.deepEqual(ruleCandidate('document_read', {documentToken: {readScope: {id: 'd1'}}, documentName: '周报'}), {kind: 'document', documentId: 'd1', label: '读取文档 周报'});
});

test('rules: add, match by scope, task restriction, expiry, de-duplication and IPC actions', async () => {
  let t = 1000;
  const store = {data: initialState(), save: async () => {}};
  const rules = createApprovalRules({store, now: () => t});
  const git = ruleCandidate('cli_execute', {command: cmd('/usr/bin/git', ['log', '-3'], '/repo')});
  const site = ruleCandidate('browser_read', {readScope: {url: 'https://a.com/x'}});
  const r1 = rules.add(git, {days: 1});
  assert.equal(rules.match(git, cmd('/usr/bin/git', ['log', '-3', '--oneline'], '/repo')).id, r1.id, 'prefix match');
  assert.equal(rules.match(git, cmd('/usr/bin/git', ['log'], '/other')), null, 'other working directory');
  assert.equal(rules.match(ruleCandidate('cli_execute', {command: cmd('/usr/bin/git', ['diff'], '/repo')}), cmd('/usr/bin/git', ['diff'], '/repo')), null);
  assert.equal(r1.uses, 1);
  const r2 = rules.add(site, {taskId: 'task-a'});
  assert.equal(rules.match(site, undefined, {chatId: 'c'}), null, 'task-only rule needs that task');
  rules.unattended.set('c', 'task-a');
  assert.equal(rules.match(site, undefined, {chatId: 'c'}).id, r2.id);
  rules.unattended.clear('c'); assert.equal(rules.unattended.has('c'), false);
  assert.equal(rules.add(git, {days: 1}).id, r1.id, 'same rule is refreshed, not duplicated');
  t += 2 * 86400e3;
  assert.equal(rules.match(git, cmd('/usr/bin/git', ['log', '-3'], '/repo')), null, 'expired');
  assert.throws(() => rules.add(null), /不能设为总是允许/);
  for (let i = 0; i < RULE_LIMIT - 1; i++) rules.add({kind: 'browser', origin: 'https://s' + i + '.com', label: 's' + i}, {days: 0});
  assert.throws(() => rules.add({kind: 'browser', origin: 'https://z.com', label: 'z'}), /最多保存/);
  const pending = rules.defer({chatId: 'c', tool: 'browser_read', title: '读取网页内容', detail: 'x'.repeat(900), candidate: site});
  assert.equal(pending.detail.length, 600);
  await rules.handle({action: 'remove', id: r2.id});
  assert.ok(!store.data.approvalRules.some(r => r.id === r2.id));
  await rules.handle({action: 'clear'}); assert.equal(store.data.approvalRules.length, 0);
  await rules.handle({action: 'allowPending', id: pending.id});
  assert.equal(store.data.approvalRules[0].origin, 'https://a.com'); assert.equal(store.data.pendingApprovals.length, 0);
  const noRule = rules.defer({chatId: 'c', tool: 'browser_fill', title: '填写', detail: ''});
  await assert.rejects(rules.handle({action: 'allowPending', id: noRule.id}), /每次都需要你确认/);
  await rules.handle({action: 'dismissPending'}); assert.equal(store.data.pendingApprovals.length, 0);
  await assert.rejects(rules.handle({action: 'nope'}), /未知操作/);
});

async function runtimeFixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-rules-'));
  const store = new Store(dir); await store.load(); store.data.folders = [{id: 'f', path: dir, name: 'fixture'}];
  const rules = createApprovalRules({store});
  const asked = [];
  let answer = {allowed: true, alwaysAllow: true};
  const runtime = new ToolRuntime({store, browser: {list: () => []}, rules, approve: async (title, detail, _s, opts) => { asked.push({title, opts}); return answer; }});
  return {dir, store, rules, runtime, asked, setAnswer: a => { answer = a; }};
}

test('tool runtime: "always allow" saves a rule, later identical commands run without a dialog and are audited', async () => {
  const f = await runtimeFixture();
  try {
    const r1 = await f.runtime.execute('cli_execute', {executable: '/bin/echo', args: ['rule-ok'], folderId: 'f'}, undefined, {chatId: 'c1', runId: 'r1'});
    assert.match(JSON.stringify(r1), /rule-ok/);
    assert.equal(f.asked.length, 1); assert.equal(f.asked[0].opts.ruleScope.kind, 'cli');
    assert.equal(f.store.data.approvalRules.length, 1);
    assert.equal(f.store.data.executions[0].authorization, 'approval_rule_granted');
    const r2 = await f.runtime.execute('cli_execute', {executable: '/bin/echo', args: ['rule-ok', 'again'], folderId: 'f'}, undefined, {chatId: 'c2', runId: 'r2'});
    assert.match(JSON.stringify(r2), /again/);
    assert.equal(f.asked.length, 1, 'no second dialog');
    assert.equal(f.store.data.executions[0].authorization, 'approval_rule');
    assert.equal(f.store.data.executions[0].ruleId, f.store.data.approvalRules[0].id);
    f.setAnswer(false);
    const denied = await f.runtime.execute('cli_execute', {executable: '/bin/echo', args: ['other'], folderId: 'f'}, undefined, {chatId: 'c3', runId: 'r3'});
    assert.equal(denied.status, 'denied'); assert.equal(f.asked.length, 2, 'different prefix asks again');
  } finally { await rm(f.dir, {recursive: true, force: true}); }
});

test('tool runtime: unattended runs never open a dialog; unruled operations are recorded for the user', async () => {
  const f = await runtimeFixture();
  try {
    f.rules.unattended.set('sched', 'task-1');
    const r = await f.runtime.execute('cli_execute', {executable: '/bin/echo', args: ['nobody-home'], folderId: 'f'}, undefined, {chatId: 'sched', runId: 'r1'});
    assert.equal(r.status, 'denied'); assert.match(r.message, /待你确认/);
    assert.equal(f.asked.length, 0);
    assert.equal(f.store.data.executions[0].authorization, 'unattended_deferred');
    const item = f.store.data.pendingApprovals[0];
    assert.equal(item.taskId, 'task-1'); assert.equal(item.candidate.kind, 'cli'); assert.equal(item.title, '运行命令');
    const shell = await f.runtime.execute('cli_execute', {executable: '/bin/sh', args: ['-c', 'echo hi'], folderId: 'f'}, undefined, {chatId: 'sched', runId: 'r2'});
    assert.equal(shell.status, 'denied'); assert.equal(f.store.data.pendingApprovals[0].candidate, undefined, 'shells can never be ruled');
    await f.rules.handle({action: 'allowPending', id: item.id, onlyTask: true});
    assert.equal(f.store.data.approvalRules[0].taskId, 'task-1');
    const ok = await f.runtime.execute('cli_execute', {executable: '/bin/echo', args: ['nobody-home'], folderId: 'f'}, undefined, {chatId: 'sched', runId: 'r3'});
    assert.match(JSON.stringify(ok), /nobody-home/); assert.equal(f.asked.length, 0);
    f.rules.unattended.clear('sched');
    await f.runtime.execute('cli_execute', {executable: '/bin/echo', args: ['nobody-home'], folderId: 'f'}, undefined, {chatId: 'manual', runId: 'r4'});
    assert.equal(f.asked.length, 1, 'task-only rule does not apply outside that task');
  } finally { await rm(f.dir, {recursive: true, force: true}); }
});

test('scheduled task runs are unattended only while they run; pending items are counted on the run', async () => {
  const store = {data: initialState(), save: async () => {}, log: () => {}};
  const rules = createApprovalRules({store});
  const seen = [];
  const conversations = {run: async p => {
    seen.push(rules.unattended.has(p.id));
    rules.defer({chatId: p.id, tool: 'browser_read', title: '读取网页内容', detail: 'x'});
    let chat = store.data.chats.find(c => c.id === p.id); if (!chat) { chat = {id: p.id, name: 'x', messages: []}; store.data.chats.unshift(chat); }
    chat.messages.push({role: 'user', content: p.prompt}, {role: 'assistant', content: '部分完成'});
  }, cancel: async () => {}};
  const active = new Map(), view = () => store.data;
  const workspace = createWorkspaceService({store, active, view});
  const tasks = createTaskService({store, active, view, key: () => '', conversations, rules});
  await workspace.task({name: '早报', prompt: 'p', schedule: {kind: 'hourly', every: 1}});
  const t = store.data.tasks[0];
  await tasks.run(t.id);
  t.nextRun = Date.now() - 5;
  await tasks.run(t.id, {scheduledFor: t.nextRun});
  assert.deepEqual(seen, [false, true]);
  assert.equal(rules.unattended.has(t.chatId), false);
  assert.equal(t.history[0].pending, 1); assert.equal(store.data.pendingApprovals[0].taskId, t.id);
});

test('approval UI panels', () => {
  const action = (l, a, id = '') => `<button data-action="${a}" data-id="${id}">${l}</button>`, date = () => 'D';
  const s = initialState();
  assert.equal(pendingApprovalsPanel(s, {action, date}), ''); assert.equal(pendingBanner(s, action), '');
  assert.match(approvalRulesPanel(s, {action, date}), /没有已保存的审批规则/);
  s.tasks = [{id: 't', name: '早报'}];
  s.pendingApprovals = [{id: 'p1', time: 1, chatId: 'gone', taskId: 't', title: '读取网页内容', detail: 'd', candidate: {label: '网站 https://a.com'}}, {id: 'p2', time: 2, title: '填写网页文本框', detail: 'line1\nline2'}];
  s.approvalRules = [{id: 'r', kind: 'cli', label: '命令 git status', uses: 3, expires: Date.now() + 1e6, taskId: 't'}, {id: 'old', kind: 'browser', label: 'x', expires: 1}];
  const p = pendingApprovalsPanel(s, {action, date});
  assert.match(p, /待你确认 <small>2/); assert.match(p, /data-action="allowPending" data-id="p1"/); assert.match(p, /allowPendingTask/); assert.match(p, /早报/);
  assert.equal((p.match(/allowPending"/g) || []).length, 1, 'no "always allow" for operations that can never be ruled');
  const r = approvalRulesPanel(s, {action, date});
  assert.match(r, /总是允许的规则 <small>1/); assert.match(r, /已使用 3 次/); assert.match(r, /仅限：早报/); assert.doesNotMatch(r, />x</);
  assert.match(pendingBanner(s, action), /2 项操作/);
});
