// [p1-m2] Conversation management: folders, pin, archive, rename, incognito purge. Pure helpers + workspace handlers.
import { uid } from '../core.mjs';
import { requiredText as text } from './validation.mjs';

export const FOLDER_LIMIT = 50;

/** Drop incognito chats that are not the one being kept (called on startup and when the user leaves one). */
export function purgeIncognito(data, keepId = '') {
  const before = (data.chats || []).length;
  data.chats = (data.chats || []).filter(c => !c.incognito || c.id === keepId);
  return before - data.chats.length;
}

export function createChatService({ store, active, view, queued = () => false }) {
  const find = id => { const c = (store.data.chats || []).find(c => c.id === id); if (!c) throw new Error('对话不存在或已删除'); return c; };
  return {
    /** {id, name?, pinned?, archived?, folderId? (string | null)} */
    chatMeta: async (p) => {
      const c = find(p?.id), keys = Object.keys(p || {}).filter(k => k !== 'id');
      if (!keys.length || keys.some(k => !['name', 'pinned', 'archived', 'folderId'].includes(k))) throw new Error('对话设置无效');
      if (c.incognito && (p.pinned || p.folderId)) throw new Error('无痕对话不能置顶或归入文件夹');
      if (p.name !== undefined) c.name = text(p.name, 80);
      for (const k of ['pinned', 'archived']) if (p[k] !== undefined) { if (typeof p[k] !== 'boolean') throw new Error('对话设置无效'); if (p[k]) c[k] = true; else delete c[k]; }
      if (p.archived === true) delete c.pinned;
      if (p.folderId !== undefined) {
        if (p.folderId === null || p.folderId === '') delete c.folderId;
        else { if (!(store.data.chatFolders || []).some(f => f.id === p.folderId)) throw new Error('文件夹不存在'); c.folderId = p.folderId; }
      }
      await store.save();
      return view();
    },
    /** {name} create | {id, name} rename | {id, remove:true} delete (chats move back to 最近) */
    chatFolder: async (p) => {
      const folders = store.data.chatFolders ??= [];
      if (p?.remove) {
        if (!folders.some(f => f.id === p.id)) throw new Error('文件夹不存在');
        store.data.chatFolders = folders.filter(f => f.id !== p.id);
        for (const c of store.data.chats || []) if (c.folderId === p.id) delete c.folderId;
      } else if (p?.id) {
        const f = folders.find(f => f.id === p.id); if (!f) throw new Error('文件夹不存在');
        f.name = text(p.name, 40);
      } else {
        if (folders.length >= FOLDER_LIMIT) throw new Error('最多创建 ' + FOLDER_LIMIT + ' 个文件夹');
        const name = text(p?.name, 40);
        if (folders.some(f => f.name === name)) throw new Error('已有同名文件夹');
        folders.push({ id: uid(), name, created: Date.now() });
      }
      await store.save();
      return view();
    },
    /** [p1-m4] the user opened a chat that finished in the background */
    chatSeen: async (p) => {
      const c = (store.data.chats || []).find(c => c.id === p?.id);
      if (!c || !c.unread) return view();
      delete c.unread;
      await store.save();
      return view();
    },
    /** Leaving an incognito chat discards it (unless it is still generating). */
    leaveIncognito: async (p) => {
      const c = (store.data.chats || []).find(c => c.id === p?.id);
      if (!c || !c.incognito) return view();
      if (active?.has(c.id) || queued('conversation', c.id)) return view();
      store.data.chats = store.data.chats.filter(x => x.id !== c.id);
      await store.save();
      return view();
    },
  };
}
