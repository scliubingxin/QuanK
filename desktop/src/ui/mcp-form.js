// [mcp2] MCP connection form: remote service (HTTP: none / Bearer / browser sign-in) or a local program (stdio).
// Secrets (Bearer token, environment values) are typed here by the user and never prefilled from saved data.
import { escape } from './markdown.js';

const sel = (v, cur) => v === cur ? 'selected' : '';
export function mcpForm(c = {}) {
  const stdio = c.transport === 'stdio', auth = ['bearer', 'oauth'].includes(c.auth) ? c.auth : 'none';
  const envHelp = Array.isArray(c.envHelp) ? c.envHelp : [];
  const envLines = (c.envNames || []).map(n => n + '=').join('\n');
  return `<label>连接名称<input name="name" required maxlength="40" value="${escape(c.name || '')}"></label>
<label>连接方式<select name="transport" data-mcp-transport><option value="http" ${stdio ? '' : 'selected'}>远程服务（Streamable HTTP）</option><option value="stdio" ${stdio ? 'selected' : ''}>本机程序（stdio）</option></select></label>
<div data-mcp-section="http" ${stdio ? 'hidden' : ''}>
<label>服务地址<input name="url" type="url" maxlength="250" value="${escape(stdio ? '' : c.url || '')}" placeholder="https://…/mcp"></label>
<label>认证方式<select name="auth" data-mcp-auth><option value="none" ${sel('none', auth)}>无认证</option><option value="bearer" ${sel('bearer', auth)}>API Key / Bearer Token</option><option value="oauth" ${sel('oauth', auth)}>浏览器登录（OAuth）</option></select></label>
<label data-mcp-auth-section="bearer" ${auth === 'bearer' ? '' : 'hidden'}>Bearer Token<input name="token" type="password" data-mcp-secret autocomplete="off" spellcheck="false" maxlength="4096" placeholder="${c.hasToken ? '已保存；留空保留同一地址的令牌' : '8–4096 字符，不含 Bearer 前缀'}"></label>
<p class="hint" data-mcp-auth-section="oauth" ${auth === 'oauth' ? '' : 'hidden'}>保存后在卡片上点「登录」，会在系统浏览器打开该服务的登录页；QuankSight 只保存服务签发的访问令牌（系统钥匙串加密），过期时自动刷新，不会看到你的密码。</p>
</div>
<div data-mcp-section="stdio" ${stdio ? '' : 'hidden'}>
<label>命令<input name="command" maxlength="300" value="${escape(stdio ? c.command || '' : '')}" placeholder="uvx、npx、node、python3，或绝对路径"></label>
<label>参数（每行一个）<textarea name="args" rows="3" maxlength="8000" placeholder="akshare-one-mcp">${escape(stdio ? (c.args || []).join('\n') : '')}</textarea></label>
<label>环境变量（每行 名称=值，可留空）<textarea name="env" rows="3" maxlength="16000" data-mcp-secret spellcheck="false" placeholder="TUSHARE_TOKEN=你的 token">${escape(envLines)}</textarea></label>
${envHelp.length ? `<p class="hint">${envHelp.map(e => `<b>${escape(e.name)}</b>：${escape(e.label || '')}${e.required ? '（必填）' : ''}`).join('；')}</p>` : ''}
<p class="hint">${c.id && (c.envNames || []).length ? '已保存的值不会显示；某一行留空「名称=」表示保留原值。' : ''}环境变量的值用系统钥匙串加密保存。本机程序以你的用户身份运行，可以访问你的文件和网络：只添加来源可信的程序；每次启动都会先请你确认完整命令。</p>
</div>
${c.setup ? `<p class="hint">${escape(c.setup)}</p>` : ''}
<label>简介<input name="description" maxlength="200" value="${escape(c.description || '')}"></label>
<label class="check"><input type="checkbox" name="enabled" ${c.enabled === false ? '' : 'checked'}>启用连接</label>
<p class="hint">保存不会联网或启动程序；「测试连接」只发现工具目录，不调用业务工具。</p>`;
}

export function bindMcpForm(root) {
  const form = root?.querySelector?.('form') || root;
  const t = form?.querySelector('[data-mcp-transport]'), a = form?.querySelector('[data-mcp-auth]');
  const sync = () => {
    for (const s of form.querySelectorAll('[data-mcp-section]')) s.hidden = s.dataset.mcpSection !== t.value;
    for (const s of form.querySelectorAll('[data-mcp-auth-section]')) s.hidden = s.dataset.mcpAuthSection !== a.value;
  };
  t?.addEventListener('change', sync); a?.addEventListener('change', sync);
  if (t && a) sync();
}

export function parseEnvText(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i <= 0) throw new Error('环境变量需要写成 名称=值，每行一个');
    out[s.slice(0, i).trim()] = s.slice(i + 1).trim();
  }
  return out;
}

const val = (f, n) => String((typeof f?.get === 'function' ? f.get(n) : f?.querySelector?.(`[name=${n}]`)?.value) ?? '');
export function mcpPayload(f, c = {}) {
  const transport = val(f, 'transport') === 'stdio' ? 'stdio' : 'http';
  const enabled = typeof f?.has === 'function' ? f.has('enabled') : !!f?.querySelector?.('[name=enabled]')?.checked;
  const base = {id: c.id, name: val(f, 'name').trim(), description: val(f, 'description'), enabled, transport, ...(c.presetId ? {presetId: c.presetId} : {})};
  if (transport === 'stdio') return {...base, command: val(f, 'command').trim(), args: val(f, 'args').split('\n').map(s => s.trim()).filter(Boolean), env: parseEnvText(val(f, 'env'))};
  return {...base, url: val(f, 'url').trim(), auth: ['bearer', 'oauth'].includes(val(f, 'auth')) ? val(f, 'auth') : 'none', token: val(f, 'token')};
}
