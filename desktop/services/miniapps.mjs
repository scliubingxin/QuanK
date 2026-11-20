// [p4-m4] Mini apps: stored in store.data.miniapps, each with its own version history and local data store.
// The renderer only gets summaries in the state view; code and data are fetched on demand when an app is opened.
import { uid, complete } from '../core.mjs';
import { normalizeAppHtml, applyStorageOp, storageSize, APP_LIMIT, VERSION_LIMIT, MINIAPP_PROMPT, MINIAPP_REVISE } from '../src/shared/miniapp.js';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const fileName = s => clip(s, 60).replace(/[\\/:*?"<>|]/g, '_') || '小应用';

export function createMiniAppService({store, models, key = () => '', request = complete, notify = () => {}, now = Date.now, saveFile = null}) {
  const list = () => (store.data.miniapps ??= []);
  const find = id => { const a = list().find(a => a.id === id); if (!a) throw new Error('小应用不存在或已删除'); return a; };
  let saveTimer = null;
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => store.save?.(), 400); saveTimer.unref?.(); };

  async function generate(messages) {
    const route = models?.resolve?.('legacy', '', {tools: false, vision: false});
    const settings = route?.settings || store.data.settings;
    if (!settings?.model) throw new Error('生成小应用需要先配置模型');
    const r = await request(settings, route ? route.key() : key(), messages, AbortSignal.timeout(240000));
    return normalizeAppHtml(r?.text || '');
  }
  function put({html, title}, name, prompt = '') {
    if (list().length >= APP_LIMIT) throw new Error(`最多保存 ${APP_LIMIT} 个小应用，请先删除不用的`);
    const at = now(), a = {id: uid(), name: clip(name || title || '小应用', 60), html, prompt: clip(prompt, 2000), versions: [], storage: {}, created: at, updated: at};
    list().unshift(a);
    return a;
  }
  function revise(a, html, note) {
    a.versions.unshift({html: a.html, time: a.updated, note: a.note || ''});
    if (a.versions.length > VERSION_LIMIT) a.versions.length = VERSION_LIMIT;
    a.html = html; a.note = clip(note, 120); a.updated = now();
  }
  return {
    view: () => list().map(a => ({id: a.id, name: a.name, created: a.created, updated: a.updated, versions: a.versions.length, note: a.note || '',
      bytes: a.html.length, dataItems: Object.keys(a.storage || {}).length, dataBytes: storageSize(a.storage)})),
    async handle(p = {}) {
      const act = p.action;
      if (act === 'create') {
        const prompt = String(p.prompt || '').trim();
        if (prompt.length < 4) throw new Error('请描述想要的小应用');
        const doc = await generate([{role: 'system', content: MINIAPP_PROMPT}, {role: 'user', content: prompt.slice(0, 4000)}]);
        const a = put(doc, p.name, prompt); a.note = '首次生成';
        store.log?.('已生成小应用', a.name); await store.save?.(); notify();
        return {id: a.id, name: a.name};
      }
      if (act === 'save') {
        const a = put(normalizeAppHtml(p.html), p.name); a.note = '来自对话';
        store.log?.('已保存小应用', a.name); await store.save?.(); notify();
        return {id: a.id, name: a.name};
      }
      if (act === 'get') { const a = find(p.id); return {id: a.id, name: a.name, html: a.html, storage: {...(a.storage || {})}}; }
      if (act === 'revise') {
        const a = find(p.id), ask = String(p.instruction || '').trim();
        if (ask.length < 2) throw new Error('请写下要怎么修改');
        const doc = await generate([{role: 'system', content: MINIAPP_PROMPT}, {role: 'user', content: `${MINIAPP_REVISE}\n\n修改要求：${ask.slice(0, 3000)}\n\n当前代码：\n\`\`\`html\n${a.html}\n\`\`\``}]);
        revise(a, doc.html, ask);
        await store.save?.(); notify();
        return {id: a.id, versions: a.versions.length};
      }
      if (act === 'replace') { const a = find(p.id), doc = normalizeAppHtml(p.html); revise(a, doc.html, p.note || '手动修改'); await store.save?.(); notify(); return {id: a.id}; }
      if (act === 'versions') { const a = find(p.id); return {current: {time: a.updated, note: a.note || ''}, versions: a.versions.map((v, i) => ({index: i, time: v.time, note: v.note, bytes: v.html.length}))}; }
      if (act === 'restore') {
        const a = find(p.id), v = a.versions[p.index];
        if (!Number.isInteger(p.index) || !v) throw new Error('版本不存在');
        a.versions.splice(p.index, 1);
        revise(a, v.html, `恢复到 ${new Date(v.time).toLocaleString('zh-CN', {hour12: false})} 的版本`);
        await store.save?.(); notify();
        return {id: a.id};
      }
      if (act === 'rename') { const a = find(p.id), n = clip(p.name, 60); if (!n) throw new Error('请填写名称'); a.name = n; await store.save?.(); notify(); return {id: a.id, name: n}; }
      if (act === 'copy') { const s = find(p.id), a = put({html: s.html}, s.name + ' 副本', s.prompt); a.note = '复制'; await store.save?.(); notify(); return {id: a.id, name: a.name}; }
      if (act === 'remove') { const i = list().findIndex(a => a.id === p.id); if (i < 0) throw new Error('小应用不存在或已删除'); list().splice(i, 1); await store.save?.(); notify(); return {removed: true}; }
      if (act === 'storage') {
        const a = find(p.id);
        a.storage = applyStorageOp(a.storage, {op: p.op, key: p.key, value: p.value});
        saveSoon();
        return {items: Object.keys(a.storage).length, bytes: storageSize(a.storage)};
      }
      if (act === 'resetData') { const a = find(p.id); a.storage = {}; await store.save?.(); notify(); return {id: a.id}; }
      if (act === 'export') {
        if (!saveFile) throw new Error('当前环境不能导出文件');
        const a = find(p.id);
        return {saved: !!(await saveFile({name: fileName(a.name) + '.html', format: 'html', bytes: Buffer.from(a.html, 'utf8')}))};
      }
      throw new Error('未知操作');
    },
    /** Read-only access for chat tools and scheduled tasks. */
    read(id) { const a = find(id); return {id: a.id, name: a.name, updated: a.updated, data: {...(a.storage || {})}}; },
  };
}
