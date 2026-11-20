// [p4-m3] 创作 · 信息图: list page, create / edit / brand forms, image mounting and PNG rasterising (renderer only).
import { escape } from './markdown.js';
import { TEMPLATES, SIZES, normalizeInfographic, normalizeBrand, renderInfographicSvg, svgDataUrl, DEFAULT_BRAND } from '../shared/infographic.js';
import { STUDIO_TABS } from './dashboard.js';

// [p4-m4] modal handlers pass FormData (form-like objects in tests)
const val = (f, n) => String((typeof f?.get === 'function' ? f.get(n) : f?.elements?.[n]?.value ?? f?.[n]?.value) ?? '');
const checked = (f, n) => typeof f?.get === 'function' ? f.get(n) !== null : !!(f?.elements?.[n]?.checked ?? f?.[n]?.checked);
const opt = (list, cur) => list.map(([v, l]) => `<option value="${escape(v)}"${v === cur ? ' selected' : ''}>${escape(l)}</option>`).join('');
const SIZE_OPTS = Object.entries(SIZES).map(([k, v]) => [k, v[2]]);

export function infographicPage(state, {action, heading, empty, date, tab = 'infographics'}) {
  const tabs = `<div class="feed-filters studio-tabs" role="tablist">${STUDIO_TABS.map(([id, label]) => `<button type="button" role="tab" aria-selected="${id === tab}" class="${id === tab ? 'chosen' : ''}" data-action="studioTab" data-id="${id}">${label}</button>`).join('')}</div>`;
  const list = state.infographics || [];
  const brand = normalizeBrand(state.brand || {});
  const cards = list.map(g => `<div class="card ig-card"><div class="ig-host ig-thumb" data-ig="${escape(JSON.stringify(g.spec))}" role="img" aria-label="${escape(g.spec?.title || '')}"></div>
<div class="graph-head"><h3>${escape(g.name)}</h3><span class="graph-type" style="--c:${brand.primary}">${escape(TEMPLATES.find(([t]) => t === g.spec?.template)?.[1] || '')}</span></div>
<small class="graph-alias">${escape(SIZES[g.spec?.size]?.[2] || '')} · 更新于 ${escape(date(g.updated))}</small>
<div class="actions">${action('编辑', 'infographicEdit', g.id, 'primary')}${action('PNG', 'infographicPngSaved', g.id)}${action('PDF', 'infographicPdfSaved', g.id)}${action('复制', 'infographicCopy', g.id)}${action('删除', 'infographicRemove', g.id)}</div></div>`).join('');
  const brandLine = `<p class="ig-brand-line"><span class="ig-swatch" style="background:${brand.primary}"></span><span class="ig-swatch" style="background:${brand.accent}"></span>${brand.name ? escape(brand.name) : '未设置品牌名'}${brand.logo ? ' · 已设置 logo' : ''} ${action('品牌设置', 'brandEdit', '')}</p>`;
  const head = heading('', '信息图与海报', '描述想要的内容，QuanK 会排成一页数据摘要卡、流程图、时间线、对比、清单或海报；也可以在对话里直接说“做一张信息图”。所有文字都可编辑，导出 PNG / PDF 都在本机完成。', action('＋ 新建信息图', 'infographicNew', '', 'primary'));
  return `<div class="page">${head}${tabs}${brandLine}${list.length ? `<div class="cards ig-cards">${cards}</div>` : empty('还没有信息图', '点“新建信息图”描述内容，或在对话里说“把这些要点做成一张信息图”。')}</div>`;
}

export function infographicForm(state, {prompt = ''} = {}) {
  return `<label>想做什么<textarea name="prompt" rows="5" required placeholder="例如：把本季度三个关键数字做成数据摘要卡：营收 1.2 亿（同比 +18%）、新客户 320 家、续约率 92%">${escape(prompt)}</textarea></label>
<div class="form-row"><label>版式<select name="template"><option value="">自动选择</option>${opt(TEMPLATES, '')}</select></label><label>尺寸<select name="size"><option value="">自动</option>${opt(SIZE_OPTS, '')}</select></label></div>
<p class="hint">只会使用你写下的数字；没有配置模型时，会按每行一条整理成清单。</p>`;
}
export function infographicPayload(f) {
  const prompt = val(f, 'prompt').trim();
  if (!prompt) throw new Error('请描述想做的内容');
  return {action: 'create', prompt: prompt.slice(0, 4000), template: val(f, 'template'), size: val(f, 'size')};
}

const itemLines = items => items.map(i => [i.value, i.title, i.text].map(s => String(s || '').replace(/\|/g, '｜')).join(' | ').replace(/( \| )+$/, '')).join('\n');
export function infographicEditForm(spec) {
  const s = normalizeInfographic(spec);
  return `<label>标题<input name="title" maxlength="60" required value="${escape(s.title)}"></label>
<label>副标题<input name="subtitle" maxlength="120" value="${escape(s.subtitle)}"></label>
<div class="form-row"><label>版式<select name="template">${opt(TEMPLATES, s.template)}</select></label><label>尺寸<select name="size">${opt(SIZE_OPTS, s.size)}</select></label></div>
<label>内容（每行一项：数值或时间 | 标题 | 说明）<textarea name="items" rows="8">${escape(itemLines(s.items))}</textarea></label>
<label>页脚<input name="footer" maxlength="80" value="${escape(s.footer)}"></label>
<div class="ig-host ig-preview" data-ig="${escape(JSON.stringify(s))}"></div>`;
}
export function infographicEditPayload(f) {
  const items = val(f, 'items').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const p = l.split(/\s*\|\s*/);
    return p.length === 1 ? {title: p[0]} : {value: p[0] || '', title: p[1] || '', text: p.slice(2).join(' | ')};
  });
  return normalizeInfographic({title: val(f, 'title'), subtitle: val(f, 'subtitle'), template: val(f, 'template'), size: val(f, 'size'), footer: val(f, 'footer'), items});
}

export function brandForm(brand = {}) {
  const b = normalizeBrand(brand);
  return `<label>品牌名（显示在页眉 / 页脚）<input name="name" maxlength="40" value="${escape(b.name)}"></label>
<div class="form-row"><label>主色<input type="color" name="primary" value="${b.primary.toLowerCase()}"></label><label>强调色<input type="color" name="accent" value="${b.accent.toLowerCase()}"></label></div>
<p class="hint">${b.logo ? '已设置 logo。' : '还没有 logo。'}保存后可在“信息图与海报”页再选 logo 图片（PNG / JPG，最大 2MB）。</p>
${b.logo ? '<label class="check"><input type="checkbox" name="removeLogo"> 移除 logo</label>' : ''}
<label class="check"><input type="checkbox" name="chooseLogo"> 保存后选择 logo 图片</label>`;
}
export function brandPayload(f) {
  return {action: 'brand', brand: {name: val(f, 'name'), primary: val(f, 'primary') || DEFAULT_BRAND.primary, accent: val(f, 'accent') || DEFAULT_BRAND.accent}, removeLogo: checked(f, 'removeLogo'), chooseLogo: checked(f, 'chooseLogo')};
}

/** Set the image of every not-yet-mounted .ig-host under root. Errors become a short note, never a blank box. */
export function mountInfographics(root, brand) {
  let n = 0;
  for (const host of root?.querySelectorAll?.('.ig-host:not([data-mounted])') || []) {
    host.dataset.mounted = '1';
    try {
      const {svg, width, height} = renderInfographicSvg(JSON.parse(host.dataset.ig || 'null'), brand || {});
      const img = host.ownerDocument.createElement('img');
      img.alt = host.getAttribute('aria-label') || '信息图'; img.width = width; img.height = height; img.src = svgDataUrl(svg); img.draggable = false;
      host.replaceChildren(img); n++;
    } catch (e) { host.textContent = '信息图无法显示：' + e.message; host.classList.add('chart-error'); }
  }
  return n;
}

/** Rasterise an SVG string to a PNG data URL at 2× (renderer only). */
export function svgToPng(doc, svg, width, height, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new (doc.defaultView.Image)();
    img.onload = () => {
      try {
        const c = doc.createElement('canvas'); c.width = Math.round(width * scale); c.height = Math.round(height * scale);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('图片生成失败'));
    img.src = svgDataUrl(svg);
  });
}
