import {shellWords} from '../shared/shell-words.js';
import { escape } from './markdown.js';
import { codingAgent, codingDiffStat, codingStatus } from './coding-task.js';

const failures = {
  not_found: ['找不到代理命令', '检查可执行文件路径，或重新检测本机代理。'],
  no_acp: ['代理未进入 ACP 模式', '确认参数是否为 ACP 模式（如 codebuddy 需要 --acp）。'],
  auth: ['未登录', '请先在终端登录代理。若使用 WorkBuddy，请运行 codebuddy 登录，或填写 CODEBUDDY_API_KEY。'],
  quota: ['代理额度用尽或请求受限', '检查服务额度、账单或限流状态。'],
  timeout: ['代理响应超时', '检查代理和网络状态，然后重试。'],
  crashed: ['代理异常退出或请求失败', '在终端检查代理能否运行，并确认依赖已安装。'],
};

function reason(result) {
  return failures[result.kind] || [result.message || '连接失败', '检查量化设置和代理配置。'];
}

export function codingTestResult(result) {
  if (result.kind === 'cancelled') return '已取消连接测试';
  if (!result.ok) {
    const [title, hint] = reason(result);
    return `<span class="coding-failure">✕ ${escape(title)}（${escape(result.kind)}）：${escape(hint)}</span>`;
  }
  return `<span class="coding-success">✓ 连接正常 · ${(result.ms / 1000).toFixed(1)}s</span>`;
}

const testingIndicator = '<span class="coding-spinner" aria-hidden="true"></span>正在测试连接…';

export const workBuddyPreset = {
  name: 'WorkBuddy', command: 'codebuddy', args: '--acp',
  needsEnv: ['CODEBUDDY_API_KEY', 'CODEBUDDY_INTERNET_ENVIRONMENT'],
};

export function codingPreset(candidate) {
  return {
    name: candidate.name, command: candidate.command, args: candidate.args,
    env: (candidate.needsEnv || []).map(key => ({key, hasValue: false})),
  };
}

function argList(args) {
  return Array.isArray(args) ? args : shellWords(args);
}
const argText = args => argList(args).join(' ');

export function codingCards(config, { action, date, busy, project, results }) {
  const { agents = [] } = config || {};
  return agents.map(agent => {
    const { id, lastTest } = agent;
    const status = busy.has(id) ? '正在测试…' : !lastTest ? '尚未测试'
      : `${lastTest.ok ? '连接正常' : reason(lastTest)[0]} · ${date(lastTest.at)}`;
    return `<article class="card plaza-card agent-card coding-card"><div class="pc-head"><span class="tile-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16"/></svg></span><div class="pc-title"><h3>${escape(agent.name)} ${agent.isDefault ? '<span class="badge">默认</span>' : ''}</h3></div></div><div class="pc-tags"><span class="pc-tag t-violet">Coding</span></div>
<code>${escape([agent.command, argText(agent.args)].filter(Boolean).join(' '))}</code>
${agent.description ? `<p>${escape(agent.description)}</p>` : ''}
<p class="${!busy.has(id) && lastTest ? lastTest.ok ? 'coding-success' : 'coding-failure' : 'description'}" role="status">${!busy.has(id) && lastTest ? lastTest.ok ? '✓ ' : '✕ ' : ''}${escape(status)}${!busy.has(id) && lastTest && !lastTest.ok ? `<span class="coding-test-hint">${escape(reason(lastTest)[1])}</span>` : ''}</p>
<div class="pc-actions">${busy.has(id) || !project ? '<button type="button" class="secondary" disabled>测试连接</button>' : action('测试连接', 'codingTest', id)}
${busy.has(id) ? action('取消', 'codingTestCancel', id) + testingIndicator : results?.has(id) ? codingTestResult(results.get(id)) : ''}
${agent.isDefault ? '' : action('设为默认', 'codingDefault', id)}${action('编辑', 'codingEdit', id)}${action('删除', 'codingRemove', id)}</div></article>`;
  }).join('');
}

export function codingDetection(config, candidates, action) {
  const agents = config?.agents || [];
  const detectionRows = candidates?.map((candidate, index) => {
    const command = [candidate.command, argText(candidate.args)].filter(Boolean).join(' ');
    const candidateArgs = JSON.stringify(argList(candidate.args));
    const added = agents.some(agent => agent.command === candidate.command &&
      JSON.stringify(argList(agent.args)) === candidateArgs);
    return `<div class="coding-detected"><div><strong>${escape(candidate.name)}</strong>
      ${added ? '<span class="badge">已添加</span>' : ''}
      ${candidate.npmCache ? '<span class="badge" title="安装全局命令可以避免缓存路径变化。Codex 也可使用 npx @agentclientprotocol/codex-acp。">npx 缓存</span>' : ''}
      <small title="${escape(command)}">${escape(command)}</small></div>
      ${added ? '<button type="button" class="secondary" disabled>已添加</button>' : action('添加', 'codingPrefill', index)}</div>`;
  }).join('');
  return candidates === null ? '' : `<section class="tool-panel coding-detection"><h3>检测结果</h3>
    ${detectionRows || '<p class="description">未找到可执行的 ACP 代理。安装后可以重新检测，也可以手动添加。</p>'}</section>`;
}
const taskTone = status => {
  if (status === 'review') return 'review';
  if (status === 'failed') return 'failed';
  if (['preparing','running','waiting_permission','cancelling'].includes(status)) return 'running';
  return 'neutral';
};

export function codingTasksSection(tasks, {action, date}) {
  return `<section class="tool-panel coding-tasks">
${tasks?.length ? tasks.map(task => `<article class="coding-task-row"><div><h3>${escape(task.title)}</h3>
<p><span class="coding-task-status ${taskTone(task.status)}">${taskTone(task.status) === 'running' ? '<i class="coding-spinner" aria-hidden="true"></i>' : ''}${escape(codingStatus(task.status))}</span> ${escape(codingAgent(task.agent))} · ${escape(date(task.createdAt))}</p>
${task.fallbackReason ? `<p class="hint">${escape(task.fallbackReason)}</p>` : ''}
${task.result?.diffStat ? `<p>${escape(codingDiffStat(task.result.diffStat))}</p>` : ''}</div>${action('查看详情', 'codingTaskOpen', task.id)}</article>`).join('') : '<p class="description">还没有 Coding 任务。</p>'}</section>`;
}

function environmentRow({ key = '', hasValue = false } = {}) {
  return `<tr class="coding-env-row" data-coding-env data-saved="${hasValue}">
<td><input title="${escape(key)}" data-coding-key aria-label="环境变量键名" autocomplete="off" spellcheck="false" value="${escape(key)}" ${hasValue ? 'readonly' : ''}></td>
<td><div class="coding-env-value"><input data-coding-value type="password" aria-label="环境变量值" autocomplete="new-password" placeholder="${hasValue ? '已保存，留空不修改' : key === 'CODEBUDDY_INTERNET_ENVIRONMENT' ? '可选，中国区填写 internal' : ''}"><button type="button" class="icon-button" data-coding-visibility aria-label="显示值" title="显示值" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div></td>
<td><button type="button" class="icon-button" data-coding-delete aria-label="删除环境变量" title="删除环境变量"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18m-13 0V3h8v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg></button></td></tr>`;
}

export function codingForm(agent, project) {
  return `<div class="coding-form"><p>只接入你信任的编码代理；它会读写策略项目里的代码</p>
<label>名称<input name="name" value="${escape(agent.name || '')}" required maxlength="120"></label>
<div class="coding-command"><label>命令<input name="command" value="${escape(agent.command || '')}" required spellcheck="false"></label><button type="button" class="secondary" data-coding-browse>浏览…</button></div>
<label>参数<input name="args" value="${escape(argText(agent.args))}" placeholder="支持 shell 引号" spellcheck="false"></label>
<label>说明<textarea name="description" maxlength="1000">${escape(agent.description || '')}</textarea></label>
<label>工作目录<input name="cwd" value="${escape(project || '')}" placeholder="请先在量化设置中导入策略项目" readonly></label><button type="button" class="secondary coding-project-link" data-coding-project>修改策略项目</button>
<section class="coding-env"><h3>环境变量</h3><table><colgroup><col><col><col></colgroup><thead><tr><th scope="col">键名</th><th scope="col">值</th><th scope="col">操作</th></tr></thead><tbody data-coding-env-list>${(agent.env || []).map(environmentRow).join('')}</tbody></table><button type="button" data-coding-add><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>添加环境变量</button></section>
<div class="toolbar coding-test-line"><button type="button" class="secondary" data-coding-test ${project ? '' : 'disabled'}>测试连接</button><button type="button" class="secondary" data-coding-cancel hidden>取消</button><span data-coding-result role="status"></span></div></div>`;
}

export function codingPayload(form, agent) {
  const pick = name => form.elements.namedItem(name).value;
  const env = [...form.querySelectorAll('[data-coding-env]')].flatMap(row => {
    const key = row.querySelector('[data-coding-key]').value.trim();
    const value = row.querySelector('[data-coding-value]').value;
    if (row.hidden) return [{key, value: null}];
    if (!value) return [];
    if (!key) throw new Error('请填写环境变量键名');
    return [{key, value}];
  });
  const args = pick('args');
  return { ...(agent.id ? {id: agent.id} : {}), name: pick('name'), command: pick('command'), args: args === argText(agent.args) ? argList(agent.args) : args, description: pick('description'), cwd: '', env };
}

export function bindCodingForm(dialog, agent, { browse, test, cancelTest, projectSettings }) {
  const form = dialog.querySelector('form'), content = form.querySelector('.coding-form');
  const result = content.querySelector('[data-coding-result]');
  const cancel = content.querySelector('[data-coding-cancel]');
  let testId;
  const cancelCurrent = () => testId ? cancelTest(testId) : Promise.resolve();
  dialog.addEventListener('close', () => { void cancelCurrent().catch(() => {}); }, {once: true});
  content.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-coding-add')) {
      content.querySelector('[data-coding-env-list]').insertAdjacentHTML('beforeend', environmentRow());
    } else if (button.hasAttribute('data-coding-visibility')) {
      const input = button.closest('[data-coding-env]').querySelector('[data-coding-value]');
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      const label = visible ? '隐藏值' : '显示值';
      button.title = label;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(visible));
    } else if (button.hasAttribute('data-coding-delete')) {
      const row = button.closest('[data-coding-env]');
      row.querySelector('[data-coding-value]').value = '';
      if (row.dataset.saved === 'true') row.hidden = true;
      else row.remove();
    } else if (button.hasAttribute('data-coding-project')) {
      dialog.close();
      projectSettings?.();
    } else if (button.hasAttribute('data-coding-browse')) {
      button.disabled = true;
      try {
        const path = await browse();
        if (path && content.isConnected && dialog.open) form.elements.command.value = path;
      } catch (error) { result.textContent = error.message; }
      finally { button.disabled = false; }
    } else if (button === cancel) {
      cancel.disabled = true;
      try { await cancelCurrent(); }
      catch (error) { result.textContent = error.message; }
    } else if (button.hasAttribute('data-coding-test') && form.reportValidity()) {
      const save = dialog.querySelector('#modalSubmit');
      button.disabled = true;
      if (save) save.disabled = true;
      testId = crypto.randomUUID();
      cancel.hidden = false;
      cancel.disabled = false;
      result.innerHTML = testingIndicator;
      try { result.innerHTML = codingTestResult(await test(codingPayload(form, agent), testId)); }
      catch (error) { result.textContent = error.message; }
      finally {
        testId = undefined;
        cancel.hidden = true;
        button.disabled = false;
        if (save) save.disabled = false;
      }
    }
  });
}
