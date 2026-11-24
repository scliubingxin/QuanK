import { escape } from './markdown.js';
import { codingAgent, codingDiffStat, codingStatus } from './coding-task.js';

const failures = {
  not_found: ['找不到代理命令', '检查可执行文件路径，或重新检测本机代理。'],
  no_acp: ['代理未进入 ACP 模式', '确认参数是否为 ACP 模式（如 codebuddy 需要 --acp）。'],
  auth: ['代理鉴权失败', '检查 API Key 或先在终端登录。'],
  quota: ['代理额度用尽或请求受限', '检查服务额度、账单或限流状态。'],
  timeout: ['代理响应超时', '检查代理和网络状态，然后重试。'],
  crashed: ['代理异常退出或请求失败', '在终端检查代理能否运行，并确认依赖已安装。'],
};

function reason(result) {
  return failures[result.kind] || [result.message || '连接失败', '检查量化设置和代理配置。'];
}

export function codingTestResult(result) {
  if (!result.ok) {
    const [title, hint] = reason(result);
    return `<p class="coding-failure"><strong>✕ ${escape(title)}</strong><span class="coding-test-hint">${escape(hint)}</span></p>`;
  }
  const { name, version } = result.agentInfo || {};
  const agent = [name, version].filter(Boolean).join(' · ');
  return `<p class="coding-success"><strong>✓ 连接正常</strong>${agent ? ' · ' + escape(agent) : ''} · ${escape(result.ms)} ms</p>
${result.reply ? `<p class="coding-reply">${escape(result.reply)}</p>` : ''}${result.warning ? `<p class="hint">${escape(result.warning)}</p>` : ''}`;
}

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

function argText(args) {
  if (!Array.isArray(args)) return args || '';
  return args.map(arg => "'" + arg.replaceAll("'", "'\\''") + "'").join(' ');
}

export function codingPage(config, { heading, action, empty, date, candidates, busy, project, tasks }) {
  const { agents = [], settings = {} } = config || {};
  const defaultAgent = agents.find(a => a.isDefault);
  const cards = agents.map(agent => {
    const { id, lastTest } = agent;
    const status = busy.has(id) ? '正在测试…' : !lastTest ? '尚未测试'
      : `${lastTest.ok ? '连接正常' : reason(lastTest)[0]} · ${date(lastTest.at)}`;
    return `<article class="tool-panel coding-card"><h3>${escape(agent.name)} ${agent.isDefault ? '<span class="badge">默认</span>' : ''}</h3>
<code>${escape([agent.command, argText(agent.args)].filter(Boolean).join(' '))}</code>
${agent.description ? `<p>${escape(agent.description)}</p>` : ''}
<p class="${!busy.has(id) && lastTest ? lastTest.ok ? 'coding-success' : 'coding-failure' : 'description'}" role="status">${!busy.has(id) && lastTest ? lastTest.ok ? '✓ ' : '✕ ' : ''}${escape(status)}${!busy.has(id) && lastTest && !lastTest.ok ? `<span class="coding-test-hint">${escape(reason(lastTest)[1])}</span>` : ''}</p>
<div class="toolbar">${busy.has(id) || !project ? '<button type="button" class="secondary" disabled>测试连接</button>' : action('测试连接', 'codingTest', id)}
${agent.isDefault ? '' : action('设为默认', 'codingDefault', id)}${action('编辑', 'codingEdit', id)}${action('删除', 'codingRemove', id)}</div></article>`;
  }).join('');
  const detected = candidates === null ? '' : `<section class="tool-panel coding-detection"><h3>检测结果</h3>
${candidates.length ? candidates.map((candidate, index) => `<div class="coding-detected"><div><strong>${escape(candidate.name)}</strong><code>${escape([candidate.command, argText(candidate.args)].filter(Boolean).join(' '))}</code>${candidate.npmCache && candidate.name === 'Codex' ? '<p class="hint">这是 npx 缓存路径，建议全局安装或改用 <code>npx @agentclientprotocol/codex-acp</code></p>' : ''}</div>${action('填入表单', 'codingPrefill', index)}</div>`).join('') : '<p class="description">未找到可执行的 ACP 代理。安装后可以重新检测，也可以手动添加。</p>'}</section>`;
  return `<div class="coding-page">${heading('', 'Coding 智能体', '接入本机编码代理，迭代量化策略项目。', action('检测本机代理', 'codingDetect') + action('添加代理', 'codingNew', '', 'primary'), [[agents.length, '个代理'], [defaultAgent?.name || '未设置', '默认代理']])}
${project ? '' : '<p class="hint">请先在量化设置中导入本地策略项目，再测试连接。</p>'}
<div class="coding-grid">${cards || empty('还没有 Coding 智能体', '可以检测本机代理，或手动添加。')}</div>${detected}
<section class="tool-panel"><h2>设置</h2><form id="coding-settings">
<label>回退方式<select name="fallback"><option value="auto" ${!settings.fallback || settings.fallback === 'auto' ? 'selected' : ''}>自动回退</option><option value="external" ${settings.fallback === 'external' ? 'selected' : ''}>仅外部</option><option value="builtin" ${settings.fallback === 'builtin' ? 'selected' : ''}>仅内置</option></select></label>
<label class="check"><input type="checkbox" name="allowAssistant" ${settings.allowAssistant !== false ? 'checked' : ''}> 允许 QuanK 助手调用 Coding 智能体</label>
<div class="toolbar">${action('保存设置', 'codingSettings', '', 'primary')}${tasks ? action('编辑迭代规范', 'codingSpecEdit') + action('恢复默认', 'codingSpecReset') : '<button type="button" class="secondary" disabled>编辑迭代规范</button><button type="button" class="secondary" disabled>恢复默认</button>'}</div></form></section>
<section class="tool-panel coding-tasks"><div class="toolbar"><h2>任务</h2>${tasks && project ? action('发起迭代', 'codingTaskStart', '', 'primary') : ''}</div>
${tasks?.length ? tasks.map(task => `<article class="coding-task-row"><div><h3>${escape(task.title)}</h3>
<p>${escape(codingStatus(task.status))} · ${escape(codingAgent(task.agent))} · ${escape(date(task.createdAt))}</p>
${task.fallbackReason ? `<p class="hint">${escape(task.fallbackReason)}</p>` : ''}
${task.result?.diffStat ? `<p>${escape(codingDiffStat(task.result.diffStat))}</p>` : ''}</div>${action('查看详情', 'codingTaskOpen', task.id)}</article>`).join('') : '<p class="description">还没有 Coding 任务。</p>'}</section></div>`;
}

function environmentRow({ key = '', hasValue = false } = {}) {
  return `<div class="coding-env-row" data-coding-env data-saved="${hasValue}">
<label>键名<input title="${escape(key)}" data-coding-key aria-label="环境变量键名" autocomplete="off" spellcheck="false" value="${escape(key)}" ${hasValue ? 'readonly' : ''}></label>
<label>值<input data-coding-value type="password" aria-label="环境变量值" autocomplete="new-password" placeholder="${hasValue ? '已保存，留空不修改' : key === 'CODEBUDDY_INTERNET_ENVIRONMENT' ? '可选，中国区填写 internal' : ''}"></label>
<button type="button" class="secondary" data-coding-delete>删除</button></div>`;
}

export function codingForm(agent, project) {
  return `<div class="coding-form"><p>只接入你信任的编码代理；它会读写策略项目里的代码</p>
<label>名称<input name="name" value="${escape(agent.name || '')}" required maxlength="120"></label>
<div class="coding-command"><label>命令<input name="command" value="${escape(agent.command || '')}" required spellcheck="false"></label><button type="button" class="secondary" data-coding-browse>浏览…</button></div>
<label>参数<input name="args" value="${escape(argText(agent.args))}" placeholder="支持 shell 引号" spellcheck="false"></label>
<label>说明<textarea name="description" maxlength="1000">${escape(agent.description || '')}</textarea></label>
<label>工作目录<input name="cwd" value="${escape(project || '')}" placeholder="请先在量化设置中导入策略项目" readonly></label><button type="button" class="secondary coding-project-link" data-coding-project>修改策略项目</button>
<fieldset><legend>环境变量</legend><div data-coding-env-list>${(agent.env || []).map(environmentRow).join('')}</div><button type="button" class="secondary" data-coding-add>添加环境变量</button></fieldset>
<div class="toolbar"><button type="button" class="secondary" data-coding-test ${project ? '' : 'disabled'}>测试连接</button></div>
<div data-coding-result role="status"></div></div>`;
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
  return { ...(agent.id ? {id: agent.id} : {}), name: pick('name'), command: pick('command'), args: args === argText(agent.args) ? agent.args ?? '' : args, description: pick('description'), cwd: '', env };
}

export function bindCodingForm(dialog, agent, { browse, test, projectSettings }) {
  const form = dialog.querySelector('form'), content = form.querySelector('.coding-form');
  const result = content.querySelector('[data-coding-result]');
  content.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-coding-add')) {
      content.querySelector('[data-coding-env-list]').insertAdjacentHTML('beforeend', environmentRow());
    } else if (button.hasAttribute('data-coding-delete')) {
      const row = button.closest('[data-coding-env]');
      row.querySelector('input[type=password]').value = '';
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
    } else if (button.hasAttribute('data-coding-test') && form.reportValidity()) {
      const save = dialog.querySelector('#modalSubmit');
      button.disabled = true;
      if (save) save.disabled = true;
      result.textContent = '正在测试连接…';
      try { result.innerHTML = codingTestResult(await test(codingPayload(form, agent))); }
      catch (error) { result.textContent = error.message; }
      finally { button.disabled = false; if (save) save.disabled = false; }
    }
  });
}
