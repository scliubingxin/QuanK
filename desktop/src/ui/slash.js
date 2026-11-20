// [p1-m3] Slash commands and the context meter. Pure builders; app.js maps each command id to an action.
import { escape } from './markdown.js';
import { formatTokens } from '../shared/context.js';

/** needsChat: only offered inside an existing conversation. homeOnly: only before the first message. */
export const SLASH_COMMANDS = Object.freeze([
  {id: 'clear', name: '/clear', description: '开始新对话'},
  {id: 'compact', name: '/compact', description: '把此前的对话压缩成摘要，释放上下文', needsChat: true},
  {id: 'rename', name: '/rename', description: '重命名当前对话', needsChat: true},
  {id: 'export', name: '/export', description: '导出当前对话为 Markdown', needsChat: true},
  {id: 'plan', name: '/plan', description: '计划模式：先列出可编辑的步骤，确认后逐步执行'},
  {id: 'research', name: '/research', description: '深度调研：拆解子问题联网检索，生成带引用的 Word 报告'},
  {id: 'mode', name: '/mode', description: '选择模型与思考强度'},
  {id: 'incognito', name: '/incognito', description: '开启或关闭无痕对话', homeOnly: true},
  {id: 'memory', name: '/memory', description: '查看和管理记忆'},
  {id: 'files', name: '/files', description: '打开本地文件与授权文件夹'},
  {id: 'help', name: '/help', description: '查看全部命令和快捷键'},
]);

export function matchCommands(query, {inChat = false} = {}) {
  const q = String(query || '').toLowerCase();
  return SLASH_COMMANDS.filter(c => (!c.needsChat || inChat) && (!c.homeOnly || !inChat) && (c.id.startsWith(q) || c.description.includes(q))).map(c => ({...c, type: 'command'}));
}

export function helpHtml() {
  return `<table class="slash-help"><tbody>${SLASH_COMMANDS.map(c => `<tr><td><code>${c.name}</code></td><td>${escape(c.description)}${c.needsChat ? '（对话中可用）' : ''}</td></tr>`).join('')}</tbody></table>` +
    '<p class="panel-note">在输入框开头输入 / 打开命令；继续输入可筛选，也可以选择下方的智能体。@ 添加授权文件夹中的资料。Enter 发送，Shift+Enter 换行。</p>';
}

export function contextMeter(u) {
  if (!u) return '';
  const pct = Math.round(u.ratio * 100);
  const tip = `本轮预计约 ${formatTokens(u.tokens)} / ${formatTokens(u.limit)} tokens（估算）` + (u.level !== 'ok' ? '。对话较长时可输入 /compact 压缩上下文' : '');
  return `<span class="context-meter ${u.level}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="上下文用量" title="${escape(tip)}"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" class="track"/><circle cx="10" cy="10" r="8" class="bar" stroke-dasharray="${(u.ratio * 50.27).toFixed(2)} 50.27"/></svg><small>${pct}%</small></span>`;
}
