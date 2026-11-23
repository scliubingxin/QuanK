// [p1-m1] Memory views: the "我的记忆" page and the per-reply memory sources. Pure HTML builders.
import { searchField } from './search-field.js';
import { escape } from './markdown.js';

const KIND = {preference: '偏好', fact: '事实', profile: '背景'};
const kindOf = m => KIND[m.kind] || '偏好';
const sourceOf = m => m.source === 'auto' ? '自动学习' : '手动添加';

export function memorySettingsOf(state) {
  const m = state?.settings?.memory || {};
  return {enabled: m.enabled !== false, autoLearn: m.autoLearn !== false};
}

/** Filter: 'all' | 'user' | 'auto'. */
export function memoryPage({state, action, icon, date, heading, empty, filter = 'all', query = ''}) {
  const cfg = memorySettingsOf(state), all = state.memories || [];
  const q = query.trim().toLowerCase();
  const rows = all.filter(m => (filter === 'all' || (filter === 'auto' ? m.source === 'auto' : m.source !== 'auto')) && (!q || String(m.text).toLowerCase().includes(q)));
  const toggle = (id, on, label, hint) => `<button type="button" class="memory-toggle ${on ? 'on' : ''}" data-action="memoryToggle" data-id="${id}" aria-pressed="${on}"><span class="switch"><i></i></span><span><b>${label}</b><small>${hint}</small></span></button>`;
  const chip = (id, label, n) => `<button type="button" class="chip ${filter === id ? 'chosen' : ''}" data-action="memoryFilter" data-id="${id}">${label} <small>${n}</small></button>`;
  const autoCount = all.filter(m => m.source === 'auto').length;
  const head = heading('MY CONTEXT', '记住对你重要的事。', '对话时会挑选与本轮相关的记忆发送给当前模型；回复下方可以看到参考了哪些记忆。无痕对话不会读取或学习记忆。',
    action(icon('plus') + '添加记忆', 'newMemory') + (all.length ? action('全部清除', 'clearMemories', 'all', 'danger') : ''));
  const settings = `<div class="memory-settings">${toggle('enabled', cfg.enabled, '使用记忆', '对话时参考已保存的记忆')}${toggle('autoLearn', cfg.autoLearn && cfg.enabled, '自动学习', '从对话中记住你明确表达的偏好和背景（不会记录密码、密钥等敏感信息）')}</div>`;
  const tools = `<div class="memory-tools">${chip('all', '全部', all.length)}${chip('user', '手动添加', all.length - autoCount)}${chip('auto', '自动学习', autoCount)}${searchField('memoryQuery', '搜索记忆', query)}</div>`;
  const list = rows.length ? rows.map(m => `<div class="file-row memory-row" data-memory="${escape(m.id)}">${icon('spark')}<div class="memory-main"><div>${escape(m.text)}</div><div class="meta"><span class="tag">${kindOf(m)}</span><span class="tag ${m.source === 'auto' ? 'auto' : ''}">${sourceOf(m)}</span>${m.uses ? `<span>参考 ${m.uses} 次</span>` : ''}${m.updated || m.created ? `<span>${date(m.updated || m.created)}</span>` : ''}${m.chatId && state.chats?.some(c => c.id === m.chatId) ? `<button type="button" class="link" data-action="openMemoryChat" data-id="${escape(m.chatId)}">来源对话</button>` : ''}</div></div>${action('编辑', 'editMemory', m.id)}${action('删除', 'deleteMemory', m.id)}</div>`).join('')
    : (all.length ? `<p class="panel-note">没有符合条件的记忆。</p>` : empty('从一句话认识你', '例如“请用简洁的中文回答，优先给出行动建议”。也可以在对话里说“记住……”，开启自动学习后会自动保存。'));
  return `<div class="page">${head}${settings}${all.length ? tools : ''}${list}</div>`;
}

/** Under an assistant reply: memories that were sent with this turn and memories learned from it. */
export function memorySources(m, action) {
  const used = Array.isArray(m?.memories) ? m.memories : [], learned = Array.isArray(m?.learned) ? m.learned : [];
  if (!used.length && !learned.length) return '';
  const usedHtml = used.length ? `<details class="memory-sources"><summary>参考了 ${used.length} 条记忆</summary>${used.map(x => `<div class="memory-source"><span>${escape(x.text)}</span>${action('删除', 'deleteMemory', x.id)}</div>`).join('')}</details>` : '';
  const learnedHtml = learned.map(x => `<div class="memory-learned"><span>已记住：${escape(x.text)}</span>${action('撤销', 'forgetLearned', x.id)}</div>`).join('');
  return `<div class="memory-block">${usedHtml}${learnedHtml}</div>`;
}
