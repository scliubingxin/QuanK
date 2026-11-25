import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, open, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCodingContext, clearCodingContext, localEntry } from './coding-context.mjs';
import { createCodingGit, forbiddenCodingPermission } from '../runtime/coding-git.mjs';

import { codingResultStatus } from '../src/shared/coding-result.js';
import { grantedCodeProject } from './code-projects.mjs';

const activeStatuses = new Set(['preparing', 'running', 'waiting_permission']);
const fallbackErrors = new Set(['not_found', 'no_acp', 'auth', 'quota', 'timeout', 'crashed']);
const builtin = { id: 'builtin', name: 'QuankSight 内置编码', kind: 'builtin' };
const defaultSpec = new URL('./QUANT_CODING_SPEC.md', import.meta.url);
const decisions = new Set(['allow', 'deny', 'always']);
const stopError = () => Object.assign(new Error('任务已停止'), { kind: 'cancelled' });

async function specText(userData) {
  if (!userData) return readFile(defaultSpec, 'utf8');
  const file = path.join(userData, 'coding', 'QUANT_CODING_SPEC.md');
  try { return await readFile(file, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const text = await readFile(defaultSpec, 'utf8');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text, { flag: 'wx', mode: 0o600 }).catch(error => {
      if (error.code !== 'EEXIST') throw error;
    });
    return readFile(file, 'utf8');
  }
}

export async function codingSpec(userData, action, content) {
  if (action === 'get') return specText(userData);
  if (action !== 'reset' && action !== 'save') throw new Error('未知的迭代规范操作');
  const text = action === 'reset' ? await readFile(defaultSpec, 'utf8') : content;
  if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 256 * 1024) {
    throw new Error('规范须为非空 Markdown，且不超过 256 KB');
  }
  const dir = path.join(userData, 'coding');
  await mkdir(dir, { recursive: true });
  const tmp = path.join(dir, randomUUID() + '.tmp');
  await writeFile(tmp, text, { flag: 'wx', mode: 0o600 });
  await rename(tmp, path.join(dir, 'QUANT_CODING_SPEC.md'));
  return text;
}

export function createCodingTasks({ store, coding, runnerFactory, quant, research, memory, dataset, notify, audit, locked = () => false, now = Date.now }) {
  const events = new EventEmitter();
  const controls = new Map();
  const rows = (store.data.coding?.tasks ?? []).slice(0, 50).map(row => row.task ? row : { task: row });
  for (const {task} of rows) {
    task.status = codingResultStatus(task);
    const lastPlan = task.stream?.findLastIndex(event => event.type === 'plan');
    if (lastPlan >= 0) task.stream = task.stream.filter((event, i) => event.type !== 'plan' || i === lastPlan);
  }
  (store.data.coding ??= {}).tasks = rows;
  let saving, dirty = false;
  function unlocked() {
    if (locked()) throw new Error('QuankSight 已锁定，请先解锁');
  }
  function save() {
    (store.data.coding ??= {}).tasks = rows;
    dirty = true;
    saving ??= Promise.resolve().then(async () => {
      try {
        while (dirty) {
          dirty = false;
          await store.save?.();
        }
      } finally { saving = undefined; }
    });
    return saving;
  }
  const view = row => structuredClone({ ...(row.chatId ? { chatId: row.chatId } : {}), ...row.task });
  function find(id) {
    const row = rows.find(row => row.task.id === id);
    if (!row) throw new Error('找不到 Coding 任务');
    return row;
  }
  function record(action, row, detail) {
    return Promise.resolve().then(() => audit?.({
      kind: 'approval', action: 'coding.tasks.' + action, target: row.task.id, detail, via: 'app',
    })).catch(() => {});
  }
  function changed(row, important = false) {
    row.task.updatedAt = +now();
    void save().catch(() => {});
    if (locked()) return;
    const task = view(row);
    events.emit('change', task);
    if (important) notify?.(task);
  }
  function append(row, type, text) {
    if (type === 'plan') {
      const previous = row.task.stream.findIndex(event => event.type === 'plan');
      if (previous >= 0) {
        row.task.stream[previous].text = String(text ?? '').slice(0, 4000);
        changed(row);
        return;
      }
    }
    row.task.stream.push({ at: +now(), type, text: String(text ?? '').slice(0, 4000) });
    row.task.stream = row.task.stream.slice(-400);
    changed(row);
  }
  function markError(row, status, error, redact = String) {
    row.task.status = status;
    row.task.error = { kind: error.kind || 'failed', message: redact(error.message || String(error)).slice(0, 1000) };
    append(row, 'error', row.task.error.message);
    changed(row, status === 'failed');
  }
  const interrupted = rows.filter(row => activeStatuses.has(row.task.status));
  for (const row of interrupted) {
    delete row.task.pendingPermission;
    markError(row, 'stopped', Object.assign(new Error('QuankSight 重启，未完成的任务已停止'), { kind: 'restart' }));
  }
  const ready = Promise.all(interrupted.map(async row => {
    if (row.project && row.task.branch) await clearCodingContext(row.project).catch(() => {});
  }));

  function control(row) {
    if (!controls.has(row.task.id)) controls.set(row.task.id, { queue: [], always: new Set(), redact: String });
    return controls.get(row.task.id);
  }
  function check(c) {
    if (c.stopping) throw stopError();
    unlocked();
  }
  function resolvePermission(info, decision) {
    if (info.kind !== 'session') return decision !== 'deny';
    const options = info.options || [];
    const kinds = { allow: ['allow_once', 'allow_always'], deny: ['reject_once', 'reject_always'], always: ['allow_once', 'allow_always'] };
    for (const kind of kinds[decision]) {
      const selected = options.find(option => option.kind === kind);
      if (selected) return selected.optionId;
    }
    return undefined;
  }
  function showPermission(row, c) {
    const next = c.queue[0];
    if (next) {
      row.task.status = 'waiting_permission';
      const kind = next.info.kind === 'session' ? next.info.toolCall?.kind : next.info.kind;
      const highRisk = riskyPermission(next.info);
      const network = !!next.info.network || !!next.info.toolCall?.requiresNetwork || kind === 'fetch';
      row.task.pendingPermission = { requestId: next.id, kind: next.info.kind, summary: next.summary, time: next.time,
        action: next.info.network ? '联网' : ({ execute: '运行命令', command: '运行命令', edit: '写入文件', write: '写入文件', delete: '删除文件', move: '移动文件', read: '读取文件', fetch: '联网' })[kind] || '执行工具操作',
        network, highRisk, onceOnly: network };
    } else {
      row.task.status = c.phase;
      delete row.task.pendingPermission;
    }
    changed(row, !!next);
  }
  function riskyPermission(info) {
    return ['delete', 'move'].includes(info.toolCall?.kind || info.kind) ||
      /合并|放弃|删除|委托|下单/.test(info.toolCall?.title || info.summary || '');
  }
  async function permission(row, c, info) {
    if (locked() || c.stopping || forbiddenCodingPermission(info)) {
      await record('permission', row, 'blocked');
      return resolvePermission(info, 'deny');
    }
    const key = info.kind === 'session' ? 'session:' + (info.toolCall?.kind || 'other') : info.kind;
    if (!info.summary && c.always.has(key) && !riskyPermission(info) && !info.toolCall?.requiresNetwork && !info.network) {
      await record('permission', row, 'task_allow');
      return resolvePermission(info, 'always');
    }
    const summary = c.redact(info.summary || info.toolCall?.title || (info.kind === 'write' ? '写入 ' + info.path
      : [info.command, ...(info.args || [])].filter(Boolean).join(' ')) || '代理请求授权').slice(0, 1000);
    return new Promise(resolve => {
      const id = randomUUID();
      const timer = setInterval(() => {
        if (!locked()) return;
        c.stopping = true;
        cancelPermissions(row, c);
      }, 250);
      timer.unref?.();
      c.queue.push({ id, info, resolve: value => { clearInterval(timer); resolve(value); }, key, summary, time: +now() });
      append(row, 'permission', summary);
      if (c.queue.length === 1) showPermission(row, c);
    });
  }
  function rememberPermission(row, decision) {
    const card = row.task.pendingPermission;
    if (!card) return;
    row.task.permissionHistory = [...(row.task.permissionHistory || []), { ...card, decision, finishedAt: +now() }].slice(-50);
  }
  function cancelPermissions(row, c) {
    rememberPermission(row, 'cancelled');
    for (const next of c.queue.splice(0)) next.resolve(resolvePermission(next.info, 'deny'));
    delete row.task.pendingPermission;
  }
  function streamText(row, c, chunk, final = false) {
    const secrets = c.secrets || [];
    const text = (c.textTail || '') + String(chunk ?? '');
    c.textTail = '';
    let output = '';
    for (let i = 0; i < text.length;) {
      const secret = secrets.find(secret => text.startsWith(secret, i));
      if (secret) {
        output += '[已隐藏]';
        i += secret.length;
        continue;
      }
      if (secrets.some(secret => secret[0] === text[i] && secret.startsWith(text.slice(i)))) {
        if (final) output += '[已隐藏]';
        else c.textTail = text.slice(i);
        break;
      }
      output += text[i++];
    }
    if (output) append(row, 'text', output);
  }
  function bind(row, c, runner) {
    runner.on('update', update => {
      if (c.runner !== runner || c.stopping || locked() || !activeStatuses.has(row.task.status)) return;
      const label = update.sessionUpdate;
      if (label === 'agent_message_chunk' && update.content?.type === 'text') streamText(row, c, update.content.text);
      if (label === 'tool_call' || label === 'tool_call_update') append(row, 'tool', c.redact([update.title || update.toolCallId, update.status].filter(Boolean).join(' · ')));
      if (label === 'plan') append(row, 'plan', c.redact((update.entries || []).map(entry => entry.status + ' · ' + entry.content).join('\n')));
      if (label === 'warning') append(row, 'text', c.redact(update.message));
    });
    runner.on('end', () => {
      if (!c.operation && c.runner === runner) c.runner = null;
    });
  }
  async function closeRunner(row, c) {
    const runner = c.runner;
    c.runner = null;
    if (c.textTail) streamText(row, c, '', true);
    cancelPermissions(row, c);
    await runner?.close();
  }
  async function snapshot(row, c) {
    row.snapshotBytes = await createCodingContext(row.project, { store, quant, research, memory, dataset, check: () => check(c) });
    changed(row);
  }
  const reportNote = row => '请把本任务报告写到 .quank/reports/' + row.task.id + '.md。';
  async function run(row, c, request, first, agents) {
    try {
      await ready;
      check(c);
      const task = row.task;
      const git = createCodingGit(row.project);
      if (first) {
        await record('start', row, row.source);
        await git.prepare(task, row, info => permission(row, c, info), () => check(c));
        changed(row);
      }
      await snapshot(row, c);
      check(c);
      c.phase = task.status = 'running';
      delete task.result;
      delete task.error;
      changed(row);
      const spec = await specText(store.dir);
      const prompt = spec + '\n\n' + reportNote(row) + '\n\n用户需求：\n' + request;
      if (first) {
        const failures = [];
        const { candidates, reason } = agents;
        if (reason) failures.push(reason);
        for (const agent of candidates) {
          check(c);
          task.agent = { id: agent.id, name: agent.name, kind: agent.kind };
          if (failures.length) task.fallbackReason = failures.join('；').slice(0, 2000);
          changed(row);
          c.redact = String;
          c.secrets = [];
          const opts = {
            ...agent, projectDir: row.project,
            onPermission: info => permission(row, c, info),
            redactWith: values => {
              const secrets = [...new Set(values.filter(Boolean))].sort((a, b) => b.length - a.length);
              c.secrets = secrets;
              c.redact = value => secrets.reduce((text, secret) => text.split(secret).join('[已隐藏]'), String(value ?? ''));
            },
            locked, audit,
          };
          try {
            c.runner = await runnerFactory(agent.kind, opts);
            bind(row, c, c.runner);
            check(c);
            await c.runner.start();
            check(c);
            await c.runner.prompt(prompt);
            break;
          } catch (error) {
            await closeRunner(row, c);
            check(c);
            if (!fallbackErrors.has(error.kind)) throw error;
            if (agent === candidates.at(-1)) {
              if (agents.externalOnly) throw Object.assign(new Error(error.message), { kind: 'external_unavailable' });
              throw error;
            }
            if (await git.hasChanges(task, row)) throw error;
            failures.push(agent.name + '：' + c.redact(error.message || '代理不可用').slice(0, 400));
          }
        }
      } else {
        if (!c.runner) throw new Error('原代理会话已结束，无法继续追问');
        await c.runner.prompt(prompt);
      }
      check(c);
      if (c.textTail) streamText(row, c, '', true);
      await clearCodingContext(row.project);
      check(c);
      task.result = await git.result(task, c.redact);
      check(c);
      task.status = task.result.diffStat.files === 0 ? 'no_changes' : 'review';
      changed(row, true);
    } catch (error) {
      await closeRunner(row, c).catch(() => {});
      if (row.task.branch) {
        await clearCodingContext(row.project).catch(() => {});
        if (row.iterationBase) {
          try { row.task.result = await createCodingGit(row.project).result(row.task, c.redact); }
          catch { /* Keep the branch and its changes for inspection. */ }
        }
      }
      markError(row, c.stopping || locked() || error.kind === 'cancelled' ? 'stopped' : 'failed', error, c.redact);
    }
  }
  function launch(row, c, request, first, agents) {
    c.operation = run(row, c, request, first, agents).finally(() => { c.operation = null; });
  }
  function projectInUse(project, except) {
    return rows.some(row => row !== except && row.project === project &&
      (activeStatuses.has(row.task.status) || row.task.branch && !['merged', 'discarded'].includes(row.task.status)));
  }

  const api = {
    list() { unlocked(); return rows.map(view); },
    get(id) { unlocked(); return view(find(id)); },
    supportsProject: true,
    async start({ agentId, request, source, chatId, project: requested, fallback, allowedAgents } = {}) {
      unlocked();
      request = typeof request === 'string' ? request.trim() : '';
      if (!request || request.length > 32000) throw new Error('请填写不超过 32000 字的迭代需求');
      if (!['ui', 'chat', 'schedule'].includes(source)) throw new Error('无效的任务来源');
      const config = quant?.view?.() ?? store.data.quant;
      if (config?.mode === 'remote') throw new Error('Coding 智能体仅适用于本地策略项目，请切换到本地模式');
      const grant = requested === undefined ? null : grantedCodeProject(store, requested);
      if (requested !== undefined && !grant) throw Object.assign(new Error('请先在「代码项目与运行环境」授权该本地代码项目'), { kind: 'project_not_granted' });
      const sourcePath = grant?.path ?? config?.source;
      if (!sourcePath) throw new Error('请先导入本地策略项目');
      const project = await realpath(sourcePath);
      if (grant && grantedCodeProject(store, requested)?.id !== grant.id) throw Object.assign(new Error('代码项目授权已变化'), { kind: 'project_not_granted' });
      if (!(await stat(project)).isDirectory()) throw new Error('策略项目必须是目录');
      unlocked();
      const strategyProject = !grant || !!config?.source && await realpath(config.source).catch(() => null) === project;
      if (projectInUse(project)) throw new Error('策略项目已有待处理的 Coding 任务');
      if (rows.length >= 50) {
        const index = rows.findLastIndex(row => !activeStatuses.has(row.task.status) &&
          (!row.task.branch || ['merged', 'discarded'].includes(row.task.status)));
        if (index < 0) throw new Error('请先处理现有的 Coding 任务');
        controls.delete(rows[index].task.id);
        rows.splice(index, 1);
      }
      const { agents: configured = [], settings = {} } = coding.view();
      const agents = allowedAgents ? configured.filter(item => allowedAgents.includes(item.id)) : configured;
      const preferred = agentId ? agents.find(agent => agent.id === agentId) : agents.find(agent => agent.isDefault) || agents[0];
      if (agentId && !preferred && agentId !== 'builtin') throw new Error('找不到指定的 Coding 智能体');
      const external = [preferred, ...agents.filter(agent => agent !== preferred)].filter(Boolean).map(agent => ({ ...agent, kind: 'acp' }));
      const mode = fallback || settings.fallback || 'auto';
      const candidates = mode === 'builtin' || (agentId === 'builtin' && mode === 'auto') ? [builtin]
        : mode === 'external' ? external.slice(0, 1) : [...external, builtin];
      if (!candidates.length) throw Object.assign(new Error('请先接入可用的外部 Coding 智能体'), { kind: 'external_unavailable' });
      const at = +now();
      const row = { project, source, strategyProject, task: {
        ...(chatId ? { chatId } : {}), strategyProject,
        id: randomUUID(), title: request.split('\n')[0].slice(0, 80), request,
        status: 'preparing', agent: candidates.length ? { id: candidates[0].id, name: candidates[0].name, kind: candidates[0].kind } : builtin,
        createdAt: at, updatedAt: at, stream: [],
      } };
      rows.unshift(row);
      const c = control(row);
      c.phase = 'preparing';
      changed(row);
      launch(row, c, request, true, { candidates, externalOnly: mode === 'external', reason: mode === 'auto' && !external.length && agentId !== 'builtin' ? '没有配置外部 Coding 智能体' : '' });
      return view(row);
    },
    async respondPermission(id, requestId, decision) {
      unlocked();
      if (!decisions.has(decision)) throw new Error('无效的授权决定');
      const row = find(id), c = control(row);
      const next = c.queue[0];
      if (!next || next.id !== requestId || c.stopping) throw new Error('此授权请求已结束');
      if (decision === 'always' && (row.task.pendingPermission?.highRisk || row.task.pendingPermission?.onceOnly)) throw new Error('此操作需要逐次确认');
      rememberPermission(row, decision);
      c.queue.shift();
      if (decision === 'always' && !next.info.summary) c.always.add(next.key);
      showPermission(row, c);
      next.resolve(resolvePermission(next.info, decision));
      await record('permission', row, decision);
      return view(row);
    },
    async followup(id, request) {
      unlocked();
      const row = find(id), c = control(row);
      if (!['review', 'no_changes'].includes(row.task.status) || c.operation || c.mutating || row.gitMerged || !c.runner) throw new Error('此任务无法继续追问');
      if (typeof request !== 'string' || !request.trim() || request.length > 32000) throw new Error('请填写不超过 32000 字的追问');
      c.phase = row.task.status = 'preparing';
      changed(row);
      void record('followup', row, 'start');
      launch(row, c, request.trim(), false);
      return view(row);
    },
    async stop(id) {
      unlocked();
      const row = find(id), c = control(row);
      if (!activeStatuses.has(row.task.status)) throw new Error('此任务当前无法停止');
      c.stopping = true;
      cancelPermissions(row, c);
      await record('stop', row, 'requested');
      try { await c.runner?.cancel(); }
      finally {
        await c.operation;
        if (activeStatuses.has(row.task.status)) markError(row, 'stopped', stopError());
      }
      return view(row);
    },
    async reportFile(id) {
      unlocked();
      const {project, task} = find(id);
      if (!project || !/^[\w-]+$/.test(task.id)) throw new Error('找不到迭代报告');
      const dir = path.join(project, '.quank', 'reports');
      const file = path.join(dir, task.id + '.md');
      if (task.result?.reportPath !== file || await realpath(project) !== project ||
          !(await localEntry(path.dirname(dir)))?.isDirectory() ||
          !(await localEntry(dir))?.isDirectory() || !(await localEntry(file))?.isFile()) {
        throw new Error('找不到迭代报告');
      }
      unlocked();
      return file;
    },
    async merge(id) { return finish(id, 'merge'); },
    async discard(id) { return finish(id, 'discard'); },
    on(event, listener) { events.on(event, listener); return api; },
  };
  async function finish(id, action) {
    unlocked();
    await ready;
    unlocked();
    const row = find(id), c = control(row), task = row.task;
    const merge = action === 'merge';
    if (merge && codingResultStatus(task) === 'no_changes') throw new Error('本次没有修改任何文件，无法合并');
    if (!task.branch || c.mutating || (merge ? task.status !== 'review' : !['review', 'no_changes', 'stopped', 'failed'].includes(task.status))) {
      throw new Error('此任务当前无法' + (merge ? '合并' : '放弃'));
    }
    const config = quant?.view?.() ?? store.data.quant;
    if (merge && row.strategyProject !== false && (config?.mode === 'remote' || !config?.source || await realpath(config.source) !== row.project)) {
      throw new Error('请先将量化设置切回本任务的本地策略项目');
    }
    if (c.mutating) throw new Error('此任务正在处理');
    c.mutating = true;
    try {
      await closeRunner(row, c);
      unlocked();
      await clearCodingContext(row.project);
      const git = createCodingGit(row.project);
      await record(action, row, 'requested');
      unlocked();
      if (merge) {
        await git.merge(task, row);
        await save();
        unlocked();
        if (row.strategyProject === false) {
          task.result = { ...task.result, mergeNote: '已合并代码项目。已跳过策略代码同步、引擎重启和股票池刷新。' };
        } else {
          await quant.sync({ source: row.project });
          unlocked();
          await quant.handle({ action: 'restart' });
          unlocked();
          const refresh = await quant.handle({ action: 'refreshAll' });
          const failures = refresh?.results?.filter(result => result.error) || [];
          if (failures.length) throw new Error('股票池信号刷新失败：' + failures.map(result => result.code).join('、'));
          store.log?.('量化策略迭代已合并', task.title);
        }
      } else await git.discard(task, row);
      task.status = merge ? 'merged' : 'discarded';
      delete task.error;
      changed(row, merge);
      await record(action, row, 'ok');
      await save();
      return view(row);
    } catch (error) {
      if (error.kind === 'discard_restore') {
        const recoveryNote = c.redact(error.message);
        task.result = { ...task.result, recoveryNote };
        if (/^[\w-]+$/.test(task.id)) {
          const reportDir = path.join(row.project, '.quank', 'reports');
          try {
            await localEntry(path.dirname(reportDir));
            await localEntry(reportDir);
            await mkdir(reportDir, { recursive: true, mode: 0o700 });
            const reportPath = path.join(reportDir, task.id + '.md');
            const file = await open(reportPath, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT |
              constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
            try {
              const stat = await file.stat();
              if (!stat.isFile() || stat.nlink !== 1) throw new Error('迭代报告必须是普通文件');
              await file.writeFile('\n\n## 放弃任务\n\n' + recoveryNote + '\n');
              task.result.reportPath = reportPath;
            } finally { await file.close(); }
          } catch { /* The persisted task report still contains the recovery note. */ }
        }
        markError(row, 'failed', error, c.redact);
        await record(action, row, 'failed');
        await save();
        throw new Error(task.error.message);
      }
      task.error = { kind: merge && row.gitMerged ? 'merge_sync' : action, message: c.redact(error.message).slice(0, 1000) };
      changed(row);
      await record(action, row, 'failed');
      throw new Error(task.error.message);
    } finally {
      c.mutating = false;
      if (['merged', 'discarded'].includes(task.status)) controls.delete(id);
    }
  }
  return api;
}
