import {escape} from './markdown.js';
import {skillAvatar, mcpAvatar} from './avatars.js'; // [F1d]
// [ux10] Skill / MCP "plaza" layout: hero with a large search box and live counts, a category bar, and uniform cards
// (icon, name, tags, two-line description, footer). Search / category filtering keeps the data-preset-* contract.
const PALETTE = ['#2F62F5', '#4A7CFC', '#7B6CF6', '#1236F0', '#0B2BA6', '#5B8DEF', '#6A5CF0', '#3D5AFE', '#8C7CFF', '#2B6CF0']; // [theme2] reference palette
export const iconColor = s => PALETTE[[...String(s || '')].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7) % PALETTE.length];
export const iconText = s => { const t = String(s || '').replace(/^(willbuddy|wb|public)[-_ ]?/i, '').trim(); const ch = [...t].find(c => /[\p{L}\p{N}]/u.test(c)) || '·'; return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch; };
export const plazaIcon = (name, cls = '') => `<span class="pc-icon${cls ? ' ' + cls : ''}" style="--c:${iconColor(name)}" aria-hidden="true">${escape(iconText(name))}</span>`;
const tag = (text, tone = '') => `<span class="pc-tag${tone ? ' t-' + tone : ''}">${escape(text)}</span>`;
const host = url => { try { return new URL(url).host; } catch { return String(url || ''); } };

function hero(kind, state) {
  const skill = kind === 'skills', presets = state.capabilityPresets?.[kind] || [];
  const mine = skill ? state.skillPackages || [] : state.mcpConnections || [];
  const stats = skill
    ? [[presets.length, '个预置 Skill'], [mine.length, '个已添加'], [mine.filter(s => s.enabled).length, '个已启用']]
    : [[presets.length, '个预置 MCP 模板'], [mine.length, '个已配置连接'], [mine.reduce((n, c) => n + (c.lastTest?.status === 'succeeded' ? c.lastTest.tools.length : 0), 0), '个已发现工具']];
  return `<header class="plaza-hero"><h1>${skill ? '金融工作的常用方法，<em>一键装进智能体</em>' : '接入金融数据与资讯，<em>让 AI 直接查</em>'}</h1>
<p>${skill ? '个股研究、财报点评、三表建模、估值、晨报、组合复盘、回测审阅……预置的投研工作流可绑定到智能体；上传只保存文件，不执行脚本。' : '把财报、行情、新闻与舆情等外部服务接成 MCP 工具，配置一次即可在多个智能体中复用；业务调用仍逐次由你确认。'}</p>
<label class="plaza-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" data-preset-search aria-label="${skill ? '搜索预置技能' : '搜索预置MCP'}" placeholder="${skill ? '搜索 Skill，例如：财报、估值、回测、晨报' : '搜索工具名称、用途，例如：财报、新闻、舆情'}"><span class="plaza-go" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span></label>
<div class="plaza-stats">${stats.map(([n, l]) => `<span><b>${n}</b>${l}</span>`).join('')}</div></header>`;
}

function toolbar(kind, items) {
  const skill = kind === 'skills', cats = [...new Set(items.map(p => p.category))];
  const chips = [['', '全部'], ...cats.map(c => [c, c])].map(([v, l], i) => `<button type="button" class="plaza-chip${i ? '' : ' on'}" data-preset-chip="${escape(v)}">${escape(l)}</button>`).join('');
  return `<div class="plaza-bar"><div class="plaza-chips">${chips}</div><div class="plaza-bar-end"><select data-preset-category aria-label="${skill ? '技能' : 'MCP'}分类"><option value="">全部分类</option>${cats.map(c => `<option>${escape(c)}</option>`).join('')}</select>${skill ? '<button class="primary" data-action="uploadSkill">上传 Skill</button>' : '<button class="primary" data-action="newMcp">添加 MCP 连接</button>'}</div></div>`;
}

function presetCard(kind, p, state) {
  const skill = kind === 'skills';
  const installed = skill ? (state.skillPackages || []).find(s => s.sha256 === p.sha256) : (state.mcpConnections || []).find(c => c.presetId === p.id || (!!p.url && c.url.replace(/\/$/, '') === p.url.replace(/\/$/, '')));
  const origin = skill ? (p.id.startsWith('public-') ? '公开技能 · MIT' : 'QuankSight 内置') : p.transport === 'stdio' ? '本机程序' : p.auth === 'oauth' ? '浏览器登录' : 'Streamable HTTP';
  const tags = skill
    ? [tag(p.category, 'blue'), tag(p.id.startsWith('public-') ? '公开' : '内置', p.id.startsWith('public-') ? 'violet' : 'green'), tag(p.license || 'MIT')]
    : [tag(p.category, 'orange'), p.transport === 'stdio' ? tag((p.env || []).some(e => e.required) ? '需要 Token' : '免密钥', (p.env || []).some(e => e.required) ? 'violet' : 'green') : tag(p.auth === 'bearer' ? '需要密钥' : p.auth === 'oauth' ? '浏览器登录' : '免密钥', p.auth === 'none' ? 'green' : 'violet'), tag(p.transport === 'stdio' ? '本机' : 'Remote')];
  const btn = skill
    ? `<button class="pc-add${installed ? ' done' : ''}" data-action="addPresetSkill" data-id="${escape(p.id)}" ${installed ? 'disabled' : ''}>${installed ? '已添加' : '添加技能'}</button>`
    : `<button class="pc-add${installed ? ' done' : ''}" data-action="newPresetMcp" data-id="${escape(p.id)}">${installed ? '查看配置' : '配置连接'}</button>`;
  const foot = skill ? `<span>${escape(origin)}</span><span>${p.fileCount} 个文件</span>` : `<span class="pc-url">${escape(p.transport === 'stdio' ? [p.command, ...(p.args || [])].join(' ') : host(p.url))}</span><span>${p.transport === 'stdio' ? '在本机运行' : p.auth === 'bearer' ? '需要你填写密钥' : p.auth === 'oauth' ? '浏览器登录你的账号' : '公共入口 · 可能限流'} · ${installed ? '已配置，状态见上方' : '未配置、未测试'}</span>`;
  return `<div class="card preset-card plaza-card" data-preset-searchable="${escape([p.title, p.description, p.category].join(' ').toLowerCase())}" data-preset-kind="${escape(p.category)}">
<div class="pc-head">${skill ? skillAvatar(p) : mcpAvatar(p)}<div class="pc-title"><h3>${escape(p.title)}</h3><small>${escape(p.category)} · ${escape(origin)}</small></div>${btn}</div>
<div class="pc-tags">${tags.join('')}</div><p class="pc-desc">${escape(p.description)}</p>${skill ? '' : `<p class="pc-setup">${escape(p.setup)}</p>`}
<div class="pc-foot">${foot}</div>
<details class="pc-more"><summary>来源与使用条件</summary><p>${escape(p.source)}</p><p>目录核对日期：${escape(state.capabilityPresets?.checkedDate || '')}。${skill ? '技能不新增工具权限；依赖CLI或其他技能时须单独具备。' : '账户权限、服务可用性和费用以提供方为准。'}</p></details></div>`;
}

/** The whole plaza for one kind. `mine` is the HTML of the user's own items (rendered above the catalogue). */
export function presetCatalog(kind, state, {mine = ''} = {}) {
  const skill = kind === 'skills', items = state.capabilityPresets?.[kind] || [];
  return `<section class="preset-catalog plaza" data-preset-catalog="${kind}">${hero(kind, state)}${mine}
${items.length ? '' : `<div class="plaza-bar-end plaza-solo">${skill ? '<button class="primary" data-action="uploadSkill">上传 Skill</button>' : '<button class="primary" data-action="newMcp">添加 MCP 连接</button>'}</div>`}
${items.length ? `${toolbar(kind, items)}<div class="plaza-section-head"><h2>${skill ? '预置技能' : '预置 MCP 工具'}</h2><small>${skill ? '投研、建模、风控与量化工作流（QuankSight 内置）排在前面，其后是通用办公与开发技能；添加后即可绑定，不自动运行脚本。' : '金融数据与资讯服务排在前面；官方公开服务模板，按需填写自己的密钥，保存不联网。测试成功后才显示发现的真实工具。'}</small></div>
<div class="plaza-grid">${items.map(p => presetCard(kind, p, state)).join('')}</div><p class="plaza-empty" data-preset-empty hidden>没有匹配的预置项，换个关键词试试。</p>` : ''}</section>`;
}

export function bindPresetFilters(root) {
  for (const section of root.querySelectorAll('[data-preset-catalog]')) {
    const search = section.querySelector('[data-preset-search]'), category = section.querySelector('[data-preset-category]');
    if (!search) continue;
    const update = () => {
      const q = search.value.toLowerCase().trim(), cat = category?.value || '';
      let shown = 0;
      for (const card of section.querySelectorAll('[data-preset-searchable]')) {
        const mine = card.hasAttribute('data-preset-mine');
        const visible = card.dataset.presetSearchable.includes(q) && (mine || !cat || card.dataset.presetKind === cat);
        card.hidden = !visible;
        if (visible && !mine) shown++;
      }
      for (const chip of section.querySelectorAll('[data-preset-chip]')) chip.classList.toggle('on', chip.dataset.presetChip === cat);
      const empty = section.querySelector('[data-preset-empty]');
      if (empty) empty.hidden = shown > 0;
    };
    search.addEventListener('input', update);
    category?.addEventListener('change', update);
    for (const chip of section.querySelectorAll('[data-preset-chip]')) chip.addEventListener('click', () => { if (category) category.value = chip.dataset.presetChip; update(); });
  }
}
