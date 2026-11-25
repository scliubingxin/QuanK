// [F5] 安全与合规 page + lock screen. The page shell comes from securityPage(); mountSecurity fills the tab body through
// call({action}) (view, secrets, egressList, auditList, review). Buttons use data-action (secXxx), handled in app.js.
import { escape } from './markdown.js';
import { LEVEL_TEXT, DEFAULT_DISCLAIMER } from '../shared/compliance.js';

const btn = (label, act, id = '', kind = 'secondary') => `<button type="button" class="${kind}" data-action="${act}" data-id="${escape(id)}">${label}</button>`;
const val = (fm, n) => String((typeof fm?.get === 'function' ? fm.get(n) : fm?.querySelector?.(`[name="${n}"]`)?.value ?? fm?.elements?.[n]?.value) ?? '');
const on = (fm, n) => typeof fm?.get === 'function' ? fm.get(n) !== null : !!(fm?.querySelector?.(`[name="${n}"]`)?.checked ?? fm?.elements?.[n]?.checked);
const time = t => t ? new Date(t).toLocaleString('zh-CN', {hour12: false}) : '—';
const bytes = n => n < 0 ? '—' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
const clean = e => String(e?.message || e).replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^(Type)?Error:\s*/, '');
const TABS = [['overview', '总览'], ['keys', '密钥'], ['egress', '外发记录'], ['audit', '操作审计'], ['compliance', '合规审阅']];
const KINDS = {data: '数据修改', trade: '成交记录', rules: '风控规则', approval: '确认与授权', export: '导出与分享', model: '模型调用', security: '安全设置', chat: '对话指令', system: '系统'};

export function securityPage(state, {heading, action = btn} = {}) {
  const s = state.security || {}, p = s.privacy || {};
  const stats = [[s.encrypted ? '已加密' : '未加密', '本机数据'], [s.lockEnabled ? '已开启' : '未开启', '应用锁'], [p.offline ? '离线' : '联网', '网络'], [s.complianceEnabled === false ? '关闭' : '开启', '合规检查']];
  const head = heading('', '安全与合规，数据留在本机。', '持仓、笔记和对话可以加密保存，离开电脑时自动锁定；看得见每个外部连接发了什么，每次改动都留下不可篡改的记录；研报和文章导出前自动做合规检查。', action('立即锁定', 'secLock') + action('导出加密备份', 'secBackup', '', 'primary'), stats);
  const upload = state.settings?.office?.ai?.allowUpload !== false;
  const office = action(upload ? '禁止 Office AI 上传' : '允许 Office AI 上传', 'officeAIToggleUpload', upload ? 'off' : 'on');
  return `<div class="page security-page">${head}<section class="q-box sec-box" aria-label="Office AI"><p>Office AI 文档上传已${upload ? '允许' : '禁止'}。</p>${office}</section><section class="q-box sec-box" id="securityBox"><div class="mk-seg sec-tabs">${TABS.map(([id, t], i) => `<button type="button" data-sec="${id}" class="${i ? '' : 'chosen'}">${t}</button>`).join('')}</div><div class="sec-body"><p class="empty-note">正在读取…</p></div></section></div>`;
}

// line icons (24×24, stroke) for the overview cards
const ICONS = {lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3', archive: 'M4 5h16v4H4zM5 9v10h14V9M10 13h4', shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z', wifi: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.4M19 12.5a10 10 0 0 0-3.2-2.2M12 20h.01',
  eye: 'M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.5 9.5 6a17 17 0 0 1-3 3.4M6.6 7.6A16 16 0 0 0 2.5 12c1 1.5 4.5 6 9.5 6a9.6 9.6 0 0 0 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2', list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01', check: 'M9 12l2 2 4-4M7 3h8l4 4v14H5V3z', key: 'M14 7a4 4 0 1 1-3.5 6L4 19.5V21h3v-2h2v-2h2l1.5-1.5', term: 'M4 5h16v14H4zM7 9l3 3-3 3M12 15h5'};
const ico = n => `<span class="sec-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n] || ICONS.shield}"/></svg></span>`;
const card = (icon, title, status, tone, desc, acts) => `<div class="sec-card ${tone}"><div class="sec-card-head">${ico(icon)}<b>${escape(title)}</b><span class="sec-pill ${tone}">${escape(status)}</span></div><p>${desc}</p><div class="sec-acts">${acts}</div></div>`;
export function overviewHtml(v) {
  const e = v.encryption || {}, l = v.lock || {}, p = v.privacy || {}, a = v.audit || {}, c = v.compliance || {};
  const plain = e.plainBackups?.length ? `<p class="sec-notice"><span>还有 ${e.plainBackups.length} 个未加密的备份副本（开启加密前自动留下的），确认 QuanK 运行正常后建议删除。</span>${btn('删除未加密副本', 'secDeletePlain')}</p>` : '';
  return `<div class="sec-grid">
${card('lock', '本机数据加密', e.enabled ? '已开启' : '未开启', e.enabled ? 'ok' : 'warn', e.enabled ? '对话、持仓、组合、笔记、风控规则和设置以 AES-256 加密保存，密钥在 macOS 钥匙串里。生成的文档、策略引擎数据不在加密范围内。' : '对话、持仓、组合、笔记都以明文保存在 workspace.json（只有你的账户能读）。开启后用钥匙串里的密钥加密；开启前会先留一份未加密副本。', e.enabled ? btn('关闭加密', 'secEncrypt', 'off') : btn('开启加密', 'secEncrypt', 'on', 'primary'))}
${card('archive', '加密备份', e.lastBackup ? '已备份' : '从未备份', e.lastBackup ? 'ok' : 'warn', e.lastBackup ? `上次备份：${escape(time(e.lastBackup.time))}，${escape(e.lastBackup.name)}。备份用你设置的密码加密，可以在任何一台 Mac 上恢复。` : '钥匙串被重置或换电脑时，只能靠加密备份找回数据。开启加密前建议先导出一份。', btn('导出加密备份', 'secBackup', '', 'primary') + btn('从备份恢复', 'secRestore'))}
${card('key', '应用锁', l.enabled ? '已开启' : '未开启', l.enabled ? 'ok' : 'warn', l.enabled ? `${l.idleMinutes ? `闲置 ${l.idleMinutes} 分钟自动锁定` : '不自动锁定'}${l.onSleep ? '，锁屏或睡眠时锁定' : ''}；${l.touchId && l.touchIdAvailable ? '可用触控 ID 解锁' : '用解锁密码解锁'}。锁定期间界面和所有功能都不可用，后台盯盘照常。` : '离开电脑时，任何人都能打开 QuanK 看到持仓和对话。', btn(l.enabled ? '修改' : '设置应用锁', 'secLockSettings', '', l.enabled ? 'secondary' : 'primary'))}
${card('wifi', '离线模式', p.offline ? '已开启' : '未开启', p.offline ? 'ok' : 'neutral', p.offline ? '已阻止所有外部连接（行情、公告、大模型、联网搜索），本机策略引擎照常运行。' : '需要时可以一键断开所有外部连接，只用本机数据和本机策略。', btn(p.offline ? '恢复联网' : '开启离线模式', 'secPrivacy', p.offline ? 'offline:off' : 'offline:on'))}
${card('eye', '发给模型前隐藏金额', p.maskAmounts ? '已开启' : '未开启', p.maskAmounts ? 'ok' : 'neutral', p.maskAmounts ? '对话里查询持仓、组合时，股数、成本、市值、盈亏和现金会替换成 ***，模型只看到价格、涨跌幅和仓位比例。' : '对话里查询持仓、组合时，金额会原样发给大模型服务。', btn(p.maskAmounts ? '关闭' : '开启', 'secPrivacy', p.maskAmounts ? 'maskAmounts:off' : 'maskAmounts:on'))}
${card('list', '操作审计', a.broken ? '校验失败' : '记录中', a.broken ? 'bad' : 'ok', `已记录 ${escape(String(a.count || 0))} 条。${a.lastVerify ? `上次校验 ${escape(time(a.lastVerify.time))}：${a.lastVerify.ok ? '完整，未被改动' : escape(a.lastVerify.reason || '发现异常')}` : '还没有校验过。'}`, btn('校验完整性', 'secAuditVerify') + btn('查看记录', 'secTab', 'audit'))}
${cliCard(v.cli)}
${card('check', '合规检查', c.enabled ? (c.block ? '检查并阻止' : '导出前检查') : '已关闭', c.enabled ? 'ok' : 'warn', c.enabled ? `研报、组合报告、主题周报导出前自动补上免责声明和风险提示，并检查违规用语${c.block ? '；有必须修改的问题时不允许导出' : '；问题会写在导出结果里，不阻止导出'}。` : '导出前不做合规检查，也不自动补免责声明。', btn('合规设置', 'secComplianceSettings') + btn('检查一段文字', 'secTab', 'compliance'))}
</div>${plain}`;
}

/** [v0.51] quank command line: socket bridge on/off, the `quank` command, MCP configuration. */
export function cliCard(c) {
  if (!c) return '';
  if (c.error) return card('term', '命令行 quank', '出错', 'bad', escape(c.error), '');
  const status = c.enabled ? (c.running ? '已开启' : '开启中') : '未开启', tone = c.enabled && c.running ? 'ok' : 'neutral';
  const desc = c.enabled
    ? `终端、脚本和其他 AI 工具可以通过本机套接字调用 QuanK 的全部指令（只有你的 macOS 账户能连接，不开放网络端口）；会修改数据的操作照样弹确认框并记入操作审计。${c.installed ? `命令已安装：<code>${escape(c.bin)}</code>${c.inPath ? '' : '。终端里找不到 quank 时，在 ~/.zprofile 里加一行 <code>export PATH="$HOME/.local/bin:$PATH"</code>'}` : '还没有安装 quank 命令。'}${c.served ? ` 本次运行已处理 ${escape(String(c.served))} 个请求。` : ''}`
    : '开启后可以在终端里用 quank 查行情、看信号、跑压力测试、让智能体回答问题，也可以作为 MCP 服务给 Claude、Cursor、Quick 调用。默认关闭。';
  const acts = c.enabled
    ? (c.installed ? btn('MCP 配置', 'secCliMcp') + btn('卸载命令', 'secCliUninstall') : btn('安装 quank 命令', 'secCliInstall', '', 'primary')) + btn('关闭命令行', 'secCliEnable', 'off')
    : btn('开启并安装 quank', 'secCliInstall', '', 'primary');
  return card('term', '命令行 quank', status, tone, desc, acts);
}
export function cliMcpHtml(c) {
  const cfg = JSON.stringify(c?.mcp || {}, null, 2);
  return `<p>在支持 MCP 的工具里添加一个本机（stdio）服务，命令填 <code>${escape(c?.bin || '~/.local/bin/quank')}</code>，参数填 <code>mcp</code>。Claude Desktop、Cursor 用下面这段配置：</p><pre class="sec-pre">${escape(cfg)}</pre>
<p>作为编码代理添加时（ACP），命令同上，参数填 <code>acp</code>。</p><p class="hint">MCP 调用按「发给模型前隐藏金额」的设置打码；修改类操作会在 QuanK 里弹出确认框。</p>`;
}

export function keysHtml(k) {
  const row = (name, where, status, tone, extra = '') => `<tr><td><b>${escape(name)}</b></td><td>${escape(where)}</td><td><span class="sec-pill ${tone}">${escape(status)}</span></td><td>${extra}</td></tr>`;
  const models = (k.models || []).map(m => row(m.name || m.model, `${m.host || '—'} · ${m.model || ''}`, m.keySaved ? '钥匙串加密保存' : m.hasKey ? '仅本次运行' : '未设置', m.keySaved ? 'ok' : m.hasKey ? '' : 'warn')).join('');
  const legacy = k.legacy ? row('默认模型（旧版设置）', k.legacy.model || '—', k.legacy.keySaved ? '钥匙串加密保存' : k.legacy.hasKey ? '仅本次运行' : '未设置', k.legacy.keySaved ? 'ok' : 'warn') : '';
  const mcp = (k.mcp || []).map(c => row(c.name, `MCP · ${c.auth === 'oauth' ? '浏览器登录' : c.auth === 'bearer' ? '访问令牌' : '本机程序'}${c.envNames?.length ? '（' + c.envNames.join('、') + '）' : ''}`, c.hasToken || c.signedIn ? '钥匙串加密保存' : '未登录', c.hasToken || c.signedIn ? 'ok' : 'warn')).join('');
  const e = k.engine || {};
  const engine = row('策略引擎 AI 研判', e.ai === 'none' ? '已关闭' : `使用 QuanK 默认模型 · ${e.host || '—'} · ${e.model || ''}`, e.ai === 'none' ? '不使用' : '启动时写入引擎配置', e.ai === 'none' ? '' : 'warn', btn('测试默认模型密钥', 'secTestModel'));
  return `${k.secureStorage === false ? '<p class="task-error">系统钥匙串不可用，密钥无法加密保存。</p>' : ''}<h4>已保存的密钥</h4><div class="table-scroll"><table class="q-table sec-table"><thead><tr><th>密钥</th><th>用途</th><th>保存方式</th><th></th></tr></thead><tbody>${models}${legacy}${engine}${mcp}${(k.connectors || []).map(c => row(c.name, `连接 · ${c.kind}`, '钥匙串加密保存', 'ok')).join('')}</tbody></table></div>
<div id="secTestResult"></div>
<p class="auto-note">QuanK 从不显示或回传已保存的密钥。更换模型密钥：「设置 → 模型」里重新填写。策略引擎的 AI 研判使用 QuanK 的默认模型：QuanK 启动引擎时把密钥写入引擎目录的 config.json（只有你的账户能读，路径 ${escape(e.configFile || '')}），所以换了密钥后要在量化页点「重启」。</p>`;
}
export function testResultHtml(r) {
  return `<p class="${r.ok ? 'pf-ok' : 'task-error'}">${r.ok ? '✓' : '✗'} ${escape(r.host || '')}${r.model ? ' · ' + escape(r.model) : ''}：${escape(r.message || '')}${r.status ? `（HTTP ${escape(String(r.status))}）` : ''}</p>`;
}

export function egressHtml(r, privacy = {}) {
  const hosts = r.hosts || [], items = r.items || [];
  if (!hosts.length) return `<p class="empty-note">${privacy.egressLog === false ? '外发记录已关闭。' : '本次运行还没有连接过外部服务。'}</p>`;
  return `<p class="sec-line">${btn(privacy.offline ? '恢复联网' : '开启离线模式', 'secPrivacy', privacy.offline ? 'offline:off' : 'offline:on')} ${btn(privacy.egressLog === false ? '开启外发记录' : '暂停记录', 'secPrivacy', privacy.egressLog === false ? 'egressLog:on' : 'egressLog:off')} ${btn('清空', 'secEgressClear')}</p>
<h4>连接过的服务</h4><div class="table-scroll"><table class="q-table"><thead><tr><th>主机</th><th>用途</th><th>次数</th><th>已阻止</th><th>发送</th><th>最近</th></tr></thead><tbody>${hosts.map(h => `<tr><td>${escape(h.host)}</td><td>${escape(h.purpose)}</td><td>${h.count}</td><td>${h.blocked || ''}</td><td>${bytes(h.bytesOut)}</td><td>${escape(time(h.last))}</td></tr>`).join('')}</tbody></table></div>
<h4>最近的请求</h4><div class="table-scroll"><table class="q-table"><thead><tr><th>时间</th><th>主机</th><th>路径</th><th>方法</th><th>发送</th><th>结果</th></tr></thead><tbody>${items.slice(0, 100).map(e => `<tr><td>${escape(time(e.time))}</td><td>${escape(e.host)}</td><td>${escape(e.path)}</td><td>${escape(e.method)}</td><td>${bytes(e.bytesOut)}</td><td class="${e.blocked || e.status < 0 || e.status >= 400 ? 'down' : ''}">${e.blocked ? '已阻止' : e.status < 0 ? '失败' : escape(String(e.status))}</td></tr>`).join('')}</tbody></table></div>
<p class="auto-note">只记录主机、路径、方法和发送的字节数，不记录请求内容、参数和密钥；记录只保存在本次运行的内存里，退出 QuanK 后清空。本机策略引擎（127.0.0.1）不计入。</p>`;
}

export function auditHtml(r, {kind = '', q = '', lastVerify = null} = {}) {
  const items = r.items || [];
  const filters = `<div class="sec-line"><select id="secAuditKind"><option value="">全部类型</option>${Object.entries(KINDS).map(([k, t]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${t}</option>`).join('')}</select><input id="secAuditQ" placeholder="搜索操作或对象" value="${escape(q)}">${btn('筛选', 'secAuditFilter')}${btn('校验完整性', 'secAuditVerify')}${btn('导出 CSV', 'secAuditExport')}</div>`;
  const verify = lastVerify ? `<p class="${lastVerify.ok ? 'pf-ok' : 'task-error'}">上次校验 ${escape(time(lastVerify.time))}：${lastVerify.ok ? `${escape(String(lastVerify.total))} 条记录完整，未被改动` : escape(lastVerify.reason || '发现异常')}</p>` : '';
  return `${filters}${verify}${items.length ? `<div class="table-scroll"><table class="q-table sec-audit"><thead><tr><th>#</th><th>时间</th><th>类型</th><th>操作</th><th>对象</th><th>说明</th><th>来源</th></tr></thead><tbody>${items.map(e => `<tr><td>${e.seq}</td><td>${escape(time(e.time))}</td><td>${escape(KINDS[e.kind] || e.kind)}</td><td>${escape(e.action)}</td><td>${escape(e.target || '')}</td><td>${escape(e.detail || '')}</td><td>${escape({app: '界面', chat: '对话', task: '自动化'}[e.via] || e.via)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty-note">没有符合条件的记录。</p>'}
<p class="auto-note">记录改风控规则、改持仓、记成交、确认框的选择、导出文件、调用大模型、修改安全设置等操作，只记操作和对象，不记金额、密钥和对话内容。每条记录带上一条的校验值，任何一条被修改、删除或调换，「校验完整性」都会指出位置。</p>`;
}

export const findingsHtml = r => r?.findings?.length ? `<ul class="pf-breaches">${r.findings.map(f => `<li class="${f.level === 'high' ? 'pf-high' : f.level === 'medium' ? 'pf-medium' : 'pf-low'}"><span class="pf-level">${escape(LEVEL_TEXT[f.level])}</span><span class="pf-text"><b>${escape(f.label)}${f.match ? `：「${escape(f.match)}」` : ''}</b><small>${f.where ? escape(f.where) + ' · ' : ''}${f.excerpt ? escape(f.excerpt) + ' · ' : ''}${escape(f.fix || '')}</small></span></li>`).join('')}</ul>` : '<p class="pf-ok">✓ 没有发现问题。规则检查只能发现常见违规表述，发布前仍需人工复核。</p>';
export function complianceHtml(v) {
  const c = v.compliance || {}, reviews = v.reviews || [];
  return `<div class="sec-line">${btn('合规设置', 'secComplianceSettings')}<span class="hint">${c.enabled ? `导出前检查${c.block ? '，有必须修改项时阻止导出' : ''}` : '已关闭'} · 免责声明 ${escape(String((c.disclaimer || '').length))} 字 · 风险提示 ${escape(String((c.riskNotes || []).length))} 条${c.extraTerms?.length ? ` · 自定义禁用词 ${c.extraTerms.length} 个` : ''}</span></div>
<h4>检查一段文字</h4><label class="sec-check">粘贴要检查的文字（公众号文章、研报段落、对外发布的观点）<textarea id="secReviewText" rows="7" placeholder="例如：通威股份目标价必达 30 元，现在上车稳赚不赔……"></textarea></label>
<div class="sec-line"><select id="secReviewKind"><option value="article">文章（要求免责声明、来源、日期）</option><option value="text">一段文字（只查违规用语）</option></select><label class="check"><input type="checkbox" id="secReviewAi"> 含 AI 生成内容</label>${btn('开始检查', 'secReview', '', 'primary')}</div><div id="secReviewResult"></div>
<h4>最近的检查</h4>${reviews.length ? `<div class="table-scroll"><table class="q-table"><thead><tr><th>时间</th><th>内容</th><th>结果</th><th>问题</th></tr></thead><tbody>${reviews.map(r => `<tr><td>${escape(time(r.time))}</td><td>${escape(r.title)}</td><td class="${r.level === 'high' ? 'down' : ''}">${escape(LEVEL_TEXT[r.level] || r.level)}</td><td>${escape(r.findings.slice(0, 3).map(f => f.label + (f.match ? '「' + f.match + '」' : '')).join('；'))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty-note">还没有检查记录。导出研报、组合报告和主题周报时会自动检查。</p>'}`;
}

// ---------- forms ----------
export function lockForm(l = {}) {
  return `<label class="check"><input type="checkbox" name="enabled" ${l.enabled ? 'checked' : ''}> 开启应用锁</label>
<label>${l.enabled ? '新的解锁密码（不改就留空）' : '解锁密码（至少 6 位，触控 ID 不可用时用它解锁）'}<input name="password" type="password" autocomplete="new-password" ${l.enabled ? '' : 'required'} minlength="6"></label>
${l.enabled ? '<label>当前解锁密码（关闭应用锁时需要）<input name="current" type="password" autocomplete="current-password"></label>' : ''}
<div class="form-row"><label>闲置自动锁定<select name="idleMinutes">${[[0, '不自动锁定'], [5, '5 分钟'], [10, '10 分钟'], [15, '15 分钟'], [30, '30 分钟'], [60, '60 分钟']].map(([n, t]) => `<option value="${n}" ${n === (l.idleMinutes ?? 15) ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
<label class="check"><input type="checkbox" name="onSleep" ${l.onSleep === false ? '' : 'checked'}> Mac 锁屏或睡眠时锁定</label>
<label class="check"><input type="checkbox" name="touchId" ${l.touchId === false ? '' : 'checked'} ${l.touchIdAvailable ? '' : 'disabled'}> 用触控 ID 解锁${l.touchIdAvailable ? '' : '（这台 Mac 不可用）'}</label>
<p class="hint">密码只保存其加盐哈希；忘记密码时，可以完全退出 QuanK 后用加密备份恢复。锁定期间后台盯盘、风控提醒照常运行。</p>`;
}
export const lockPayload = fm => ({action: 'lockSettings', enabled: on(fm, 'enabled'), password: val(fm, 'password'), current: val(fm, 'current'), idleMinutes: Number(val(fm, 'idleMinutes')), onSleep: on(fm, 'onSleep'), touchId: on(fm, 'touchId')});
export const backupForm = (restore = false) => `<label>${restore ? '备份密码' : '设置备份密码（至少 8 位，恢复时需要）'}<input name="passphrase" type="password" autocomplete="${restore ? 'current-password' : 'new-password'}" required minlength="8"></label>${restore ? '' : '<label>再输入一次<input name="passphrase2" type="password" autocomplete="new-password" required minlength="8"></label>'}
<p class="hint">${restore ? '先选择备份文件并核对内容，确认后才会替换当前数据；当前数据会另存一份，QuanK 随后重新启动。' : '备份包含对话、持仓、组合、笔记、规则、设置和操作审计，用这个密码加密；已保存的密钥只能在本机解开，换电脑后需要重新填写。QuanK 不保存这个密码，忘记就无法恢复。'}</p>`;
export function backupPayload(fm, restore = false) {
  const a = val(fm, 'passphrase');
  if (!restore && a !== val(fm, 'passphrase2')) throw new Error('两次输入的密码不一致');
  return {action: restore ? 'backupInspect' : 'backupExport', passphrase: a};
}
export function complianceForm(c = {}) {
  return `<label class="check"><input type="checkbox" name="enabled" ${c.enabled === false ? '' : 'checked'}> 导出研报、组合报告、主题周报前自动检查，并补上免责声明和风险提示</label>
<label class="check"><input type="checkbox" name="block" ${c.block ? 'checked' : ''}> 有「必须修改」的问题时阻止导出</label>
<label class="check"><input type="checkbox" name="aiLabel" ${c.aiLabel === false ? '' : 'checked'}> 含 AI 研判时加上 AI 生成标注</label>
<label>免责声明（统一用于所有导出文档）<textarea name="disclaimer" rows="4" maxlength="600">${escape(c.disclaimer || DEFAULT_DISCLAIMER)}</textarea></label>
<label>风险提示（每行一条，放在文末「风险提示」章节）<textarea name="riskNotes" rows="3">${escape((c.riskNotes || []).join('\n'))}</textarea></label>
<label>自定义禁用词（逗号分隔，例如公司规定不能出现的说法）<input name="extraTerms" value="${escape((c.extraTerms || []).join('，'))}"></label>`;
}
export const compliancePayload = fm => ({action: 'compliance', settings: {enabled: on(fm, 'enabled'), block: on(fm, 'block'), aiLabel: on(fm, 'aiLabel'), disclaimer: val(fm, 'disclaimer'), riskNotes: val(fm, 'riskNotes'), extraTerms: val(fm, 'extraTerms')}});

// ---------- lock screen ----------
export function lockScreen(l = {}) {
  return `<div class="lock-screen"><div class="lock-card"><img src="assets/logo.png" alt="" class="lock-logo"><h2>${escape(l.appName || 'QuanK')} 已锁定</h2><p>持仓、对话和设置已隐藏。后台盯盘和风控提醒照常运行。</p>
<form id="lockForm" onsubmit="return false"><input id="lockPassword" type="password" autocomplete="current-password" placeholder="解锁密码" autofocus><button type="button" class="primary" data-action="secUnlock">解锁</button></form>
${l.touchId ? '<button type="button" class="secondary lock-touch" data-action="secUnlockTouch">用触控 ID 解锁</button>' : ''}${l.retryIn ? `<p class="task-error">尝试次数过多，请 ${l.retryIn} 秒后再试</p>` : ''}<p class="lock-error task-error" id="lockError" hidden></p></div></div>`;
}

const caches = new WeakMap();
/** Fill #securityBox. tab / filters persist per document; every paint reloads (the data is small and changes often). */
export function mountSecurity(root, call) {
  if (root && !caches.has(root)) caches.set(root, {tab: 'overview', kind: '', q: ''});
  const c = caches.get(root), box = root?.querySelector?.('#securityBox');
  if (!box || box.dataset.bound) return;
  box.dataset.bound = '1';
  const body = box.querySelector('.sec-body');
  const paint = async () => {
    const tab = c.tab;
    for (const b of box.querySelectorAll('[data-sec]')) b.classList.toggle('chosen', b.dataset.sec === tab);
    try {
      const v = (await call({action: 'view'}))?.result;
      let html;
      if (tab === 'overview') html = overviewHtml(v);
      else if (tab === 'keys') html = keysHtml((await call({action: 'secrets'}))?.result || {});
      else if (tab === 'egress') html = egressHtml((await call({action: 'egressList'}))?.result || {}, v.privacy);
      else if (tab === 'audit') html = auditHtml((await call({action: 'auditList', kind: c.kind, q: c.q}))?.result || {}, {kind: c.kind, q: c.q, lastVerify: v.audit?.lastVerify});
      else html = complianceHtml(v);
      if (box.isConnected && c.tab === tab && body) body.innerHTML = html;
    } catch (e) { if (body && box.isConnected) body.innerHTML = `<p class="task-error">${escape(clean(e))}</p>`; }
  };
  box.addEventListener('click', e => { const t = e.target.closest?.('[data-sec]'); if (t) { c.tab = t.dataset.sec; paint(); } });
  paint();
}
export const setSecurityTab = (root, tab, extra = {}) => { const c = caches.get(root); if (c) Object.assign(c, {tab}, extra); };

export const securityUI = {cliCard, cliMcpHtml, securityPage, overviewHtml, keysHtml, testResultHtml, egressHtml, auditHtml, complianceHtml, findingsHtml, lockForm, lockPayload, backupForm, backupPayload, complianceForm, compliancePayload, lockScreen, mountSecurity, setSecurityTab};
