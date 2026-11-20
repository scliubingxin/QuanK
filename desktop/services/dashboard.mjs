// [p4-m1] Dashboard service: build a table snapshot from a source, ask the model for a layout (columns + aggregations only),
// fall back to a heuristic layout, store the dashboard locally, export PNG / standalone HTML.
// The model receives column names, types and a few sample values (optional) — never the full table.
import { uid, complete, readGranted } from '../core.mjs';
import { readTable, readCsv } from '../runtime/table-read.mjs';
import { inferColumns, describeTable, normalizeSpec, autoSpec, computeDashboard, tableFromGrid, DASHBOARD_PROMPT } from '../src/shared/dashboard.js';

export const DASHBOARD_LIMIT = 30, SNAPSHOT_BYTES = 4 * 1024 * 1024, TOTAL_BYTES = 24 * 1024 * 1024;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const ext = name => (/\.([a-z0-9]+)$/i.exec(String(name || ''))?.[1] || '').toLowerCase();

/** Synced connector items as a table (one row per item). */
export function connectorTable(data) {
  const names = new Map((data.connectors || []).map(c => [c.id, c.name]));
  const KIND = {mail: '邮件', event: '日程', feed: '订阅', message: '群消息'};
  const iso = ms => Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : null;
  const rows = (data.connectorItems || []).filter(i => names.has(i.connectorId)).map(i => [names.get(i.connectorId), KIND[i.kind] || i.kind,
    clip(i.title, 120), clip(String(i.author || '').replace(/\s*<[^>]*>$/, ''), 40) || null, iso(i.kind === 'event' ? i.start : i.time), i.unread ? '未读' : i.kind === 'mail' ? '已读' : null]);
  if (!rows.length) throw new Error('还没有已同步的连接内容');
  return {sheets: [], sheet: '', ...tableFromGrid([['来源', '类型', '标题', '发件人或作者', '时间', '状态'], ...rows])};
}

export function createDashboardService({store, models, key = () => '', request = complete, notify = () => {}, now = Date.now, readFile = null, chooseFile = null, saveFile = null, standaloneHtml = null}) {
  const list = () => (store.data.dashboards ??= []);
  const find = id => { const d = list().find(d => d.id === id); if (!d) throw new Error('仪表盘不存在或已删除'); return d; };

  async function loadSource(p) {
    if (p?.source === 'document') {
      const d = (store.data.documents || []).find(d => d.id === p.documentId);
      if (!d) throw new Error('文档不存在或已删除');
      if (d.format !== 'xlsx') throw new Error('只有 Excel 表格可以生成仪表盘');
      return {table: readTable('xlsx', Buffer.from(d.base64 || '', 'base64'), {sheet: p.sheet}), source: {kind: 'document', documentId: d.id, revision: d.revision, name: d.name}};
    }
    if (p?.source === 'file') {
      if (!chooseFile || !readFile) throw new Error('当前环境不能选择文件');
      const file = await chooseFile(); // the path always comes from the system file dialog, never from the renderer
      if (!file) return null;
      const bytes = await readFile(file.path), name = file.path.split(/[\\/]/).pop();
      return {table: readTable(ext(name), bytes, {sheet: p.sheet}), source: {kind: 'file', name}};
    }
    if (p?.source === 'granted') { // [ux8] a CSV attached from an authorised folder
      const f = await readGranted(store.data.folders || [], p.folderId, p.relative);
      const name = String(p.relative || '').split(/[\\/]/).pop();
      return {table: readCsv(Buffer.from(f.text, 'utf8')), source: {kind: 'granted', name}};
    }
    if (p?.source === 'connectors') return {table: connectorTable(store.data), source: {kind: 'connectors', name: '已同步的连接内容'}};
    throw new Error('请选择数据来源');
  }

  async function design(table, cols, prompt, title, {samples}) {
    const fallback = () => ({spec: autoSpec(cols, title), designer: 'auto'});
    const route = models?.resolve?.('legacy', '', {tools: false, vision: false});
    const settings = route?.settings || store.data.settings;
    if (!settings?.model) return {...fallback(), note: '未配置模型，已按数据自动排版'};
    try {
      const r = await request(settings, route ? route.key() : key(), [{role: 'system', content: DASHBOARD_PROMPT},
        {role: 'user', content: `数据「${title}」：\n${describeTable(table, cols, {samples})}\n\n用户要求：${clip(prompt, 2000) || '做一页能看清全貌的概览仪表盘'}`}], AbortSignal.timeout(90000));
      const spec = normalizeSpec(r?.text, cols, title);
      return spec ? {spec, designer: 'model'} : {...fallback(), note: '模型给出的版式无法使用，已按数据自动排版'};
    } catch (e) { return {...fallback(), note: '模型设计失败（' + clip(e?.message || e, 80) + '），已按数据自动排版'}; }
  }

  async function create(p) {
    if (list().length >= DASHBOARD_LIMIT) throw new Error(`最多保存 ${DASHBOARD_LIMIT} 个仪表盘，请先删除不用的`);
    const loaded = await loadSource(p);
    if (!loaded) return {cancelled: true};
    const {table, source} = loaded, cols = inferColumns(table.columns, table.rows);
    const snapshot = {columns: table.columns, rows: table.rows, truncated: table.truncated};
    const size = JSON.stringify(snapshot).length;
    if (size > SNAPSHOT_BYTES) throw new Error('数据太大（超过 4MB），请先筛选或拆分后再试');
    if (list().reduce((n, d) => n + JSON.stringify(d.table).length, 0) + size > TOTAL_BYTES) throw new Error('仪表盘数据快照合计超过 24MB，请先删除不用的仪表盘');
    const title = clip(p.title, 60) || clip(String(source.name || '').replace(/\.[a-z0-9]+$/i, ''), 50) || '仪表盘';
    const {spec, designer, note} = await design(table, cols, p.prompt, title, {samples: p.sendSamples !== false});
    const t = now();
    const d = {id: uid(), name: spec.title, prompt: clip(p.prompt, 2000), source: {...source, sheet: table.sheet, sheets: table.sheets}, table: snapshot, spec, designer, created: t, updated: t};
    list().unshift(d);
    store.log?.('已生成仪表盘', `${d.name}（${table.rows.length} 行）`);
    await store.save(); notify();
    return {id: d.id, designer, ...(note ? {note} : {})};
  }

  return {
    create,
    view() { return list().map(({table, ...d}) => ({...d, rows: table.rows.length, columns: table.columns, truncated: !!table.truncated})); },
    /** Full table for the viewer (renderer computes filtered views locally). */
    get(id) { const d = find(id); return {id: d.id, name: d.name, spec: d.spec, table: d.table, source: d.source, designer: d.designer, updated: d.updated}; },
    async handle(p) {
      const a = p?.action;
      if (a === 'create') return create(p);
      if (a === 'get') return this.get(p.id);
      if (a === 'redesign') {
        const d = find(p.id), cols = inferColumns(d.table.columns, d.table.rows);
        const {spec, designer, note} = await design(d.table, cols, p.prompt, d.name, {samples: p.sendSamples !== false});
        Object.assign(d, {spec, designer, prompt: clip(p.prompt, 2000) || d.prompt, name: spec.title, updated: now()});
        await store.save(); notify();
        return {id: d.id, designer, ...(note ? {note} : {})};
      }
      if (a === 'rename') { const d = find(p.id), name = clip(p.name, 60); if (!name) throw new Error('请填写名称'); d.name = name; d.spec.title = name; d.updated = now(); }
      else if (a === 'remove') store.data.dashboards = list().filter(d => d.id !== p.id);
      else if (a === 'export') {
        const d = find(p.id);
        if (!saveFile) throw new Error('当前环境不能导出');
        if (p.format === 'png') {
          const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(p.dataUrl || ''));
          if (!m || m[1].length > 40 * 1024 * 1024) throw new Error('图片数据无效');
          const saved = await saveFile({name: d.name + '.png', format: 'png', bytes: Buffer.from(m[1], 'base64')});
          if (saved) store.log?.('已导出仪表盘图片', d.name);
          return {saved: !!saved};
        }
        if (p.format === 'html') {
          if (!standaloneHtml) throw new Error('当前环境不能导出 HTML');
          const view = computeDashboard(d.table, d.spec, p.filters || {});
          const saved = await saveFile({name: d.name + '.html', format: 'html', bytes: Buffer.from(await standaloneHtml(view), 'utf8')});
          if (saved) store.log?.('已导出仪表盘网页', d.name);
          return {saved: !!saved};
        }
        throw new Error('导出格式无效');
      } else throw new Error('未知操作');
      await store.save(); notify();
      return {ok: true};
    },
  };
}
