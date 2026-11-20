// [home2] 工作台首页：渐变横幅（对话框在横幅中央）+ 卡片式工作台（量化、排行、常用智能体与技能、动态、最近任务）。
// 纯视图：只返回 HTML；交互沿用已有 data-action / data-page。
import { escape } from './markdown.js';
import { homeQuant } from './home-quant.js';
import { actionLabel, actionTone, describeWatch } from '../shared/quant.js';

const fin = v => v != null && Number.isFinite(Number(v));
const SUGGEST = [['stock', 'search', '个股研究'], ['earnings', 'file', '财报点评'], ['brief', 'activity', '盘前晨报'], ['portfolio', 'shield', '组合复盘'], ['memo', 'folder', '投资备忘录']];
const AGENT_ORDER = ['fin-research', 'fin-modeler', 'fin-quant', 'fin-risk'];
const TINTS = [['#1236f0', '#4a7cfc'], ['#2f62f5', '#8c7cff'], ['#0b2ba6', '#2f62f5'], ['#4a7cfc', '#a98bff'], ['#3d5afe', '#7b6cf6'], ['#2f62f5', '#5b8def']]; // [theme2] reference palette
const head = (title, right = '') => `<div class="qk-card-head"><h2>${title}</h2>${right ? `<div class="qk-card-tools">${right}</div>` : ''}</div>`;
const badge = (text, i) => { const [a, b] = TINTS[i % TINTS.length]; return `<span class="qk-badge" style="background:linear-gradient(135deg,${a},${b})">${escape([...String(text || '·')][0])}</span>`; };
const when = (date, t) => fin(t) ? escape(date(t)) : '';

/** Decorative hero art: glossy QuanK mark, floating glass tiles, candles and a rising line. No external assets. */
export function heroArt() {
  return `<svg class="qk-hero-art" viewBox="0 0 520 300" aria-hidden="true" focusable="false">
<defs>
  <linearGradient id="qkg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f4f6ff"/><stop offset="1" stop-color="#e2e6ff"/></linearGradient>
  <linearGradient id="qkg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset="1" stop-color="#e8efff" stop-opacity=".55"/></linearGradient>
  <linearGradient id="qkg3" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#8c7cff"/><stop offset="1" stop-color="#c9b8ff"/></linearGradient>
  <radialGradient id="qkg4" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#b9c3ff" stop-opacity=".55"/><stop offset="1" stop-color="#b9c3ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="qkq" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b2ba6"/><stop offset="1" stop-color="#2f62f5"/></linearGradient>
  <linearGradient id="qkr" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#f87171"/><stop offset=".55" stop-color="#ef4444"/><stop offset="1" stop-color="#dc2626"/></linearGradient>
  <linearGradient id="qkc" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#4a8dff"/><stop offset=".6" stop-color="#7c8cff"/><stop offset="1" stop-color="#b38cff"/></linearGradient>
  <filter id="qkf1" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#2f62f5" flood-opacity=".28"/></filter>
  <filter id="qkf2" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#4a7cfc" flood-opacity=".18"/></filter>
</defs>
<ellipse cx="330" cy="160" rx="210" ry="130" fill="url(#qkg4)"/>
<path d="M120 250 C210 180 260 230 330 170 S450 120 510 70" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width="10" stroke-linecap="round"/>
<path d="M120 250 C210 180 260 230 330 170 S450 120 510 70" fill="none" stroke="url(#qkg3)" stroke-width="4" stroke-linecap="round"/>
<g filter="url(#qkf2)" transform="rotate(-8 120 80)"><rect x="70" y="40" width="96" height="72" rx="16" fill="url(#qkg2)" stroke="#ffffff" stroke-opacity=".8"/>
  <g stroke-linecap="round"><line x1="92" y1="62" x2="92" y2="96" stroke="#ef4444" stroke-width="2"/><rect x="87" y="70" width="10" height="18" rx="2" fill="#ef4444"/>
  <line x1="114" y1="56" x2="114" y2="92" stroke="#10b981" stroke-width="2"/><rect x="109" y="62" width="10" height="20" rx="2" fill="#10b981"/>
  <line x1="136" y1="52" x2="136" y2="86" stroke="#ef4444" stroke-width="2"/><rect x="131" y="58" width="10" height="16" rx="2" fill="#ef4444"/></g></g>
<g filter="url(#qkf2)" transform="rotate(10 470 230)"><rect x="420" y="196" width="92" height="64" rx="16" fill="url(#qkg2)" stroke="#ffffff" stroke-opacity=".8"/>
  <path d="M436 244 L456 226 L470 236 L494 210" fill="none" stroke="#4a7cfc" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="494" cy="210" r="4" fill="#4a7cfc"/></g>
<g filter="url(#qkf1)"><rect x="250" y="56" width="170" height="170" rx="44" fill="url(#qkg1)"/>
  <rect x="250" y="56" width="170" height="170" rx="44" fill="none" stroke="#ffffff" stroke-width="3"/>
  <g transform="translate(250 56) scale(.27) translate(-40 -60)" fill="none" stroke-linecap="butt" stroke-linejoin="round">
    <rect x="197" y="173" width="296" height="350" rx="148" stroke="url(#qkq)" stroke-width="74"/>
    <path d="M150 505 V627 H620" stroke="url(#qkq)" stroke-width="42" stroke-linejoin="miter"/>
    <path d="M384 438 L524 602" stroke="#ffffff" stroke-width="66"/><path d="M384 438 L524 602" stroke="url(#qkc)" stroke-width="42"/>
    <path d="M128 500 C210 492 250 455 300 385 C330 345 360 335 392 356 C412 368 430 360 452 338 L566 214" stroke="#ffffff" stroke-width="66"/><path d="M128 500 C210 492 250 455 300 385 C330 345 360 335 392 356 C412 368 430 360 452 338 L566 214" stroke="url(#qkr)" stroke-width="38"/>
    <path d="M536 160 L616 138 L604 220 Z" fill="#dc2626" stroke="#dc2626" stroke-width="6"/>
  </g></g>
<g fill="#ffffff"><circle cx="210" cy="40" r="3"/><circle cx="470" cy="40" r="2.5"/><circle cx="200" cy="200" r="2"/><path d="M455 120 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" opacity=".9"/><path d="M190 120 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z" opacity=".8"/></g>
</svg>`;
}

/** Ranking of the stock pool: composite score or day change, switched with pure-CSS tabs. */
/** [theme] footer: signal distribution and watch status, so the card never ends in blank space. */
function rankFoot(q, pool, date) {
  const buy = pool.filter(p => actionTone(p.last.action) === 'buy').length, sell = pool.filter(p => actionTone(p.last.action) === 'sell').length, hold = pool.length - buy - sell;
  const pct = n => pool.length ? (n / pool.length * 100).toFixed(1) + '%' : '0%';
  return `<div class="qk-rank-foot"><div class="qk-dist" aria-label="信号分布">${buy ? `<i class="d-buy" style="width:${pct(buy)}"></i>` : ''}${hold ? `<i class="d-hold" style="width:${pct(hold)}"></i>` : ''}${sell ? `<i class="d-sell" style="width:${pct(sell)}"></i>` : ''}</div>
<div class="qk-dist-legend"><span class="l-buy"><b>${buy}</b>买点</span><span class="l-hold"><b>${hold}</b>持有观望</span><span class="l-sell"><b>${sell}</b>风控</span></div>
<p class="qk-rank-watch"><b>${escape(describeWatch(q?.watch))}</b>${fin(q?.lastWatch) ? `<span>上次检查 ${escape(date(q.lastWatch))}</span>` : ''}</p></div>`;
}
export function rankCard(q, {action, date = t => String(t)}) {
  const pool = (q?.pool || []).filter(p => p.last);
  if (!pool.length) return `<section class="qk-card qk-rank">${head('股票池排行')}<p class="qk-empty">股票池计算后，这里会按综合分和涨跌幅排行。</p>${action('＋ 添加股票', 'quantAdd', '', 'primary')}</section>`;
  const list = (rows, val, fmt, tone) => {
    const max = Math.max(...rows.map(r => Math.abs(val(r)) || 0), 1);
    return `<ol class="qk-rank-list">${rows.slice(0, 6).map((p, i) => { const v = val(p); return `<li><button data-action="quantOpen" data-id="${escape(p.code)}"><span class="qk-rank-no ${i < 3 ? 'top' : ''}">${i + 1}</span><span class="qk-rank-name">${escape(p.name || p.code)}</span><span class="qk-rank-bar"><i class="${tone(p)}" style="width:${fin(v) ? Math.max(4, Math.round(Math.abs(v) / max * 100)) : 0}%"></i></span><b class="${tone(p)}">${fmt(v)}</b></button></li>`; }).join('')}</ol>`;
  };
  const score = [...pool].sort((a, b) => (b.last.score ?? -1) - (a.last.score ?? -1));
  const change = [...pool].filter(p => fin(p.last.changePct)).sort((a, b) => b.last.changePct - a.last.changePct);
  return `<section class="qk-card qk-rank"><input type="radio" name="qk-rank" id="qk-rank-score" checked hidden><input type="radio" name="qk-rank" id="qk-rank-change" hidden>
${head('股票池排行', '<label for="qk-rank-score" class="qk-tab">综合分</label><label for="qk-rank-change" class="qk-tab">涨跌幅</label>')}
<div class="qk-rank-pane qk-pane-score">${list(score, p => p.last.score, v => fin(v) ? Number(v).toFixed(1) : '—', p => 'qk-' + actionTone(p.last.action))}</div>
<div class="qk-rank-pane qk-pane-change">${change.length ? list(change, p => p.last.changePct, v => `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`, p => p.last.changePct >= 0 ? 'qk-up' : 'qk-down') : '<p class="qk-empty">暂无涨跌数据。</p>'}</div>${rankFoot(q, pool, date)}</section>`;
}

/** 常用智能体 / 投研技能 (like an app launcher). */
export function appsCard(state, {action}) {
  const agents = [...AGENT_ORDER.map(id => (state.agents || []).find(a => a.id === id)).filter(Boolean), ...(state.agents || []).filter(a => !AGENT_ORDER.includes(a.id))].slice(0, 8);
  const tags = s => String(s || '').split(/[、，,]/).map(t => t.trim()).filter(Boolean).slice(0, 2);
  const agentTiles = agents.map((a, i) => `<button class="qk-app" data-action="useAgent" data-id="${escape(a.id)}">${badge(a.name, i)}<span class="qk-app-text"><b>${escape(a.name)}</b><small>${escape(a.description || '')}</small><span class="qk-chips">${tags(a.description).map(t => `<em># ${escape(t.slice(0, 8))}</em>`).join('')}</span></span></button>`).join('');
  const installed = new Set((state.skillPackages || []).map(s => s.sha256));
  const skills = (state.capabilityPresets?.skills || []).filter(s => s.id.startsWith('fin-')).slice(0, 8);
  const skillTiles = skills.map((s, i) => { const on = installed.has(s.sha256); return `<button class="qk-app" ${on ? 'data-page="agents"' : `data-action="addPresetSkill" data-id="${escape(s.id)}"`}>${badge(s.title, i + 2)}<span class="qk-app-text"><b>${escape(s.title)}</b><small>${escape(s.description)}</small><span class="qk-chips"><em># ${escape(s.category)}</em><em class="${on ? 'on' : ''}">${on ? '已添加' : '点击添加'}</em></span></span></button>`; }).join('');
  return `<section class="qk-card qk-apps"><input type="radio" name="qk-apps" id="qk-apps-agents" checked hidden><input type="radio" name="qk-apps" id="qk-apps-skills" hidden>
${head('常用智能体', '<label for="qk-apps-agents" class="qk-tab">智能体</label><label for="qk-apps-skills" class="qk-tab">投研技能</label>')}
<div class="qk-apps-pane qk-pane-agents">${agentTiles || '<p class="qk-empty">还没有智能体。</p>'}</div>
<div class="qk-apps-pane qk-pane-skills">${skillTiles || '<p class="qk-empty">技能库里还没有金融技能。</p>'}</div></section>`;
}

/** 动态与提醒: signal changes, reports and recent app activity, newest first. */
export function newsCard(state, {date}) {
  const q = state.quant || {};
  const rows = [
    ...(q.alerts || []).filter(a => a && fin(a.time)).map(a => a.kind === 'report'
      ? {time: a.time, tag: '日报', tone: a.ok ? 'blue' : 'red', title: `${a.title || '报告'}：${a.ok ? a.summary || '已生成' : '生成失败'}`, attrs: a.reportId ? `data-action="quantReport" data-id="${escape(a.reportId)}"` : ''}
      : a.kind === 'digest'
        ? {time: a.time, tag: '盘前', tone: 'violet', title: `盘前简报：${a.counts?.total || 0} 只，${a.counts?.buy || 0} 个买点，${a.counts?.sell || 0} 个风控提示`, attrs: 'data-page="feed"'}
        : {time: a.time, tag: '信号', tone: actionTone(a.to) === 'sell' ? 'green' : 'red', title: `${a.name || a.code}：${actionLabel(a.from)} → ${actionLabel(a.to, a.toText)}`, attrs: a.code ? `data-action="quantOpen" data-id="${escape(a.code)}"` : ''}),
    ...(state.activity || []).filter(a => a && fin(a.time)).slice(0, 20).map(a => ({time: a.time, tag: '动态', tone: 'gray', title: [a.title, a.detail].filter(Boolean).join('：'), attrs: 'data-page="feed"'})),
  ].sort((a, b) => b.time - a.time).slice(0, 6);
  return `<section class="qk-card qk-news">${head('动态与提醒', '<button class="qk-more" data-page="feed">更多 ›</button>')}
${rows.length ? `<ul class="qk-list">${rows.map(r => `<li><button ${r.attrs || 'data-page="feed"'}><span class="qk-tag t-${r.tone}">${r.tag}</span><span class="qk-list-title">${escape(String(r.title).slice(0, 80))}</span><time>${when(date, r.time)}</time></button></li>`).join('')}</ul>` : '<p class="qk-empty">信号变化、日报和后台任务完成后会出现在这里。</p>'}</section>`;
}

export function recentCard(state, {icon, date, taskStatus}) {
  const chats = (state.chats || []).filter(c => !c.incognito).slice(0, 6);
  return `<section class="qk-card qk-recent">${head(`继续最近的任务<small>${(state.chats || []).length} 个</small>`)}
${chats.length ? `<ul class="qk-list">${chats.map(c => `<li><button data-action="openChat" data-id="${escape(c.id)}"><span class="qk-list-icon">${icon('chat')}</span><span class="qk-list-title">${escape(c.name)}<small>${escape(taskStatus(c))}</small></span><time>${when(date, c.time || 0)}</time></button></li>`).join('')}</ul>` : '<p class="qk-empty">你的任务会保存在这里。可以从上方选一个方向，也可以直接输入。</p>'}</section>`;
}

export function homeDashboard({state, icon, composer, action, date, taskStatus}) {
  const setup = !state.settings?.hasKey ? `<div class="setup-note qk-setup">${icon('link')}<div><b>连接你自己的模型</b><p>支持第三方 Chat Completions API 与本机 Ollama。首次使用请填写服务地址与模型。</p></div>${action('设置模型', 'settings')}</div>` : '';
  return `<div class="home qk-home">
<section class="qk-hero">${heroArt()}<div class="qk-hero-inner">
<span class="qk-pill"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1l1.8 4.6L14.5 7l-4.7 1.5L8 13l-1.8-4.5L1.5 7l4.7-1.4z" fill="currentColor"/></svg>QuanK · 量化工作，一键搞定</span>
<h1>今天的市场，从哪里开始？</h1>
<p class="subtitle">看信号、读财报、写研报、做模型，一句话交给 QuanK；也可以先附上资料。</p>
${composer()}
<div class="suggestions">${SUGGEST.map(([id, i, t]) => `<button data-action="suggest" data-id="${id}">${icon(i)}${t}</button>`).join('')}</div>${setup}
</div></section>
<div class="qk-grid">
<div class="qk-col-8">${homeQuant(state, {action, icon, date, showRecent: false})}</div>
<div class="qk-col-4">${rankCard(state.quant, {action, date})}</div>
<div class="qk-col-12">${appsCard(state, {action})}</div>
<div class="qk-col-6">${newsCard(state, {date})}</div>
<div class="qk-col-6">${recentCard(state, {icon, date, taskStatus})}</div>
</div></div>`;
}
