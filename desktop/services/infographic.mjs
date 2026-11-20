// [p4-m3] Infographics: model-designed (or locally structured) specs stored in store.data.infographics, brand settings,
// PNG export (renderer rasterises, main only writes after the save dialog) and PDF export (rendered here, printed off-screen).
import { uid, complete } from '../core.mjs';
import { normalizeInfographic, normalizeBrand, renderInfographicSvg, INFOGRAPHIC_PROMPT, TEMPLATES, SIZES } from '../src/shared/infographic.js';

export const INFOGRAPHIC_LIMIT = 100, PNG_BYTES = 20 * 1024 * 1024, LOGO_BYTES = 2 * 1024 * 1024;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const fileName = s => clip(s, 60).replace(/[\\/:*?"<>|]/g, '_') || '信息图';

/** Without a model: one line per item, "数值 标题 说明" heuristics; never invents numbers. */
export function localSpec(prompt, template = '', size = '') {
  const lines = String(prompt || '').split(/\n|；|;/).map(l => l.replace(/^\s*(?:[-*•·]|\d+[.、)])\s*/, '').trim()).filter(Boolean);
  const title = clip(lines.length > 1 ? lines[0] : (lines[0] || '').slice(0, 20), 40) || '信息图';
  const items = (lines.length > 1 ? lines.slice(1) : lines).map(l => {
    const m = l.match(/^(.{1,16}?)[：:]\s*(.+)$/);
    const num = l.match(/[-+]?\d[\d,.]*\s*(?:%|万|亿|元|个|家|人|次|倍|天|小时)?/);
    if (m) return {title: m[1], value: num && m[2].includes(num[0]) ? num[0].trim() : '', text: num && m[2].trim() === num[0].trim() ? '' : m[2]};
    return {title: clip(l, 40), text: ''};
  });
  return normalizeInfographic({template: template || 'list', size, title, items: items.length ? items : [{title}]});
}

export function createInfographicService({store, models, key = () => '', request = complete, notify = () => {}, now = Date.now, saveFile = null, pdfFromSvg = null, chooseLogo = null}) {
  const list = () => (store.data.infographics ??= []);
  const find = id => { const g = list().find(g => g.id === id); if (!g) throw new Error('信息图不存在或已删除'); return g; };
  const brand = () => normalizeBrand(store.data.brand || {});
  const specOf = p => p?.id ? find(p.id).spec : normalizeInfographic(typeof p?.spec === 'string' ? p.spec : JSON.stringify(p?.spec ?? null));

  function put(spec, name) {
    const at = now(), g = {id: uid(), name: clip(name || spec.title, 60), spec, created: at, updated: at};
    list().unshift(g);
    if (list().length > INFOGRAPHIC_LIMIT) list().length = INFOGRAPHIC_LIMIT;
    return g;
  }

  async function design(prompt, template, size) {
    const route = models?.resolve?.('legacy', '', {tools: false, vision: false});
    const settings = route?.settings || store.data.settings;
    const force = s => normalizeInfographic({...s, template: template || s.template, size: size || s.size});
    if (!settings?.model) return {spec: localSpec(prompt, template, size), designer: 'local', note: '未配置模型，已按每行一条整理'};
    try {
      const hint = [template && `版式必须是 ${template}（${TEMPLATES.find(([t]) => t === template)?.[1]}）`, size && `尺寸 ${size}`].filter(Boolean).join('；');
      const r = await request(settings, route ? route.key() : key(), [{role: 'system', content: INFOGRAPHIC_PROMPT},
        {role: 'user', content: `${clip(prompt, 4000)}${hint ? '\n\n' + hint : ''}`}], AbortSignal.timeout(90000));
      return {spec: force(normalizeInfographic(r?.text || '')), designer: 'model'};
    } catch (e) {
      return {spec: localSpec(prompt, template, size), designer: 'local', note: '模型没有给出可用的版式，已按每行一条整理：' + clip(e.message, 80)};
    }
  }

  return {
    async handle(p = {}) {
      const a = p.action;
      if (a === 'create') {
        if (!clip(p.prompt, 10)) throw new Error('请描述想做的内容');
        const template = TEMPLATES.some(([t]) => t === p.template) ? p.template : '', size = SIZES[p.size] ? p.size : '';
        const {spec, designer, note} = await design(p.prompt, template, size);
        const g = put(spec); g.designer = designer;
        store.log?.('已生成信息图', g.name); await store.save?.(); notify();
        return {id: g.id, name: g.name, designer, note};
      }
      if (a === 'save') { const g = put(specOf({spec: p.spec}), p.name); g.designer = 'chat'; store.log?.('已保存信息图', g.name); await store.save?.(); notify(); return {id: g.id, name: g.name}; }
      if (a === 'update') { const g = find(p.id); g.spec = specOf({spec: p.spec}); g.name = clip(p.name || g.spec.title, 60); g.updated = now(); await store.save?.(); notify(); return {id: g.id, name: g.name}; }
      if (a === 'copy') { const s = find(p.id); const g = put(structuredClone(s.spec), s.name + ' 副本'); await store.save?.(); notify(); return {id: g.id, name: g.name}; }
      if (a === 'remove') { const i = list().findIndex(g => g.id === p.id); if (i < 0) throw new Error('信息图不存在或已删除'); list().splice(i, 1); await store.save?.(); notify(); return {removed: true}; }
      if (a === 'brand') {
        const next = normalizeBrand({...brand(), ...(p.brand || {}), logo: p.removeLogo ? '' : brand().logo});
        if (p.chooseLogo) {
          if (!chooseLogo) throw new Error('当前环境不能选择图片');
          const logo = await chooseLogo();
          if (logo) { if (!Buffer.isBuffer(logo) || logo.length > LOGO_BYTES) throw new Error('logo 图片需要不超过 2MB'); next.logo = logo.toString('base64'); }
        }
        store.data.brand = normalizeBrand(next); await store.save?.(); notify();
        return {brand: {...store.data.brand, logo: store.data.brand.logo ? 'set' : ''}};
      }
      if (a === 'exportPng') {
        const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(p.dataUrl || ''));
        if (!m) throw new Error('图片数据无效');
        const bytes = Buffer.from(m[1], 'base64');
        if (bytes.length > PNG_BYTES || bytes.readUInt32BE(0) !== 0x89504e47) throw new Error('图片数据无效');
        if (!saveFile) throw new Error('当前环境不能导出文件');
        const ok = await saveFile({name: fileName(p.name) + '.png', format: 'png', bytes});
        return {saved: !!ok};
      }
      if (a === 'exportPdf') {
        if (!saveFile || !pdfFromSvg) throw new Error('当前环境不能导出 PDF');
        const spec = specOf(p), {svg, width, height} = renderInfographicSvg(spec, brand());
        const bytes = await pdfFromSvg(svg, width, height);
        if (!Buffer.isBuffer(bytes) || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('PDF 生成失败');
        const ok = await saveFile({name: fileName(spec.title) + '.pdf', format: 'pdf', bytes});
        return {saved: !!ok};
      }
      throw new Error('未知操作');
    },
  };
}
