// [p1-m2] Sidebar sections (置顶 / 文件夹 / 最近 / 归档), full-text search and Markdown export. Pure HTML/text builders.
import { escape } from './markdown.js';

/** Plain text of a message (multimodal content arrays keep their text parts). */
export const messageText = m => typeof m?.content === 'string' ? m.content : Array.isArray(m?.content) ? m.content.filter(x => x?.type === 'text').map(x => x.text).join('\n') : '';

/** Match on name first, then on message text (only for queries of 2+ chars). Returns {chat, snippet}. */
export function searchChats(chats, query, {limit = 40} = {}) {
  const q = String(query || '').trim().toLowerCase(), out = [];
  for (const c of chats || []) {
    if (!q) { out.push({chat: c}); continue; }
    if (String(c.name || '').toLowerCase().includes(q)) { out.push({chat: c}); continue; }
    if (q.length < 2) continue;
    for (const m of c.messages || []) {
      const t = messageText(m), i = t.toLowerCase().indexOf(q);
      if (i >= 0) { out.push({chat: c, snippet: (i > 12 ? '…' : '') + t.slice(Math.max(0, i - 12), i + q.length + 24).replace(/\s+/g, ' ')}); break; }
    }
  }
  return out.slice(0, limit);
}

/** Group chats for the sidebar. Incognito chats are never listed. */
export function groupChats(chats, folders = [], query = '') {
  const visible = (chats || []).filter(c => !c.incognito).sort((a, b) => (b.time || 0) - (a.time || 0));
  const hits = searchChats(visible, query, {limit: 500});
  const folderIds = new Set(folders.map(f => f.id));
  const g = {pinned: [], folders: folders.map(f => ({folder: f, items: []})), recent: [], archived: []};
  for (const h of hits) {
    const c = h.chat;
    if (c.archived) g.archived.push(h);
    else if (c.pinned) g.pinned.push(h);
    else if (c.folderId && folderIds.has(c.folderId)) g.folders.find(x => x.folder.id === c.folderId).items.push(h);
    else g.recent.push(h);
  }
  g.recent = g.recent.slice(0, 40);
  return g;
}

export function recentSections({chats, folders = [], query = '', chatId = '', page = '', status = () => '', date = () => '', live = new Set(), open = new Set()}) {
  const g = groupChats(chats, folders, query), searching = !!String(query).trim();
  const row = ({chat: c, snippet}) => `<button class="${chatId === c.id && page === 'chat' ? 'selected' : ''}" data-action="openChat" data-id="${escape(c.id)}" data-chat-row="${escape(c.id)}" title="${escape(c.name)}"><span class="recent-name">${c.pinned ? '<i class="pin-dot" aria-label="已置顶"></i>' : ''}${escape(c.name)}${c.unread && chatId !== c.id ? '<i class="unread-dot" aria-label="有新结果"></i>' : ''}</span>${snippet ? `<small class="recent-snippet">${escape(snippet)}</small>` : `<small class="${c.run?.status === 'running' ? 'live' : ''}">${live.has(c.run?.status) ? status(c) : date(c.time || 0)}</small>`}</button>`;
  const section = (key, title, items, {collapsible = false, extra = ''} = {}) => {
    if (!items.length && !extra) return '';
    const body = items.map(row).join('');
    if (!collapsible) return `<div class="recent-section"><div class="recent-section-title">${title}</div>${body}</div>`;
    return `<details class="recent-section" data-section="${escape(key)}" ${open.has(key) || searching ? 'open' : ''}><summary class="recent-section-title">${title}<small>${items.length}</small>${extra}</summary>${body || '<p class="recent-empty">空文件夹</p>'}</details>`;
  };
  const html = [
    section('pinned', '置顶', g.pinned),
    ...g.folders.map(({folder, items}) => section('folder:' + folder.id, `<span class="folder-name">${escape(folder.name)}</span>`, items, {collapsible: true, extra: `<span class="folder-actions"><button type="button" data-action="renameFolder" data-id="${escape(folder.id)}" aria-label="重命名文件夹">✎</button><button type="button" data-action="deleteFolder" data-id="${escape(folder.id)}" aria-label="删除文件夹">×</button></span>`})),
    section('recent', '最近', g.recent),
    section('archived', '已归档', g.archived, {collapsible: true}),
  ].join('');
  return html || (searching ? '<p>没有找到匹配的对话。</p>' : '<p>还没有任务。从一个具体目标开始。</p>');
}

/** Markdown export of one chat: user / assistant turns, attachments named, intermediate stream fragments skipped. */
export function chatMarkdown(chat, {agentName = 'QuankSight', date = t => new Date(t).toLocaleString('zh-CN')} = {}) {
  const lines = [`# ${chat.name || '对话'}`, '', `> 导出自 QuankSight · ${date(Date.now())}`, ''];
  for (const m of chat.messages || []) {
    if (m.intermediate || m.partial && !m.error) continue;
    const t = messageText(m).trim();
    if (!t) continue;
    lines.push(m.role === 'user' ? '## 我' : `## ${agentName}`);
    if (m.time) lines.push(`*${date(m.time)}*`);
    const att = [...(m.documents || []).map(d => d.name), ...(m.files || []).map(f => f.name), ...(m.images || []).map(i => i.name)].filter(Boolean);
    if (att.length) lines.push('', '附件：' + att.join('、'));
    lines.push('', t, '');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
