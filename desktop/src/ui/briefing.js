// [p2-m4] Briefing card (top of the feed page) and settings form. Pure HTML builders.
import { escape } from './markdown.js';
import { BRIEFING_SECTIONS, briefingSettings } from '../shared/briefing.js';

const pad = n => String(n).padStart(2, '0');

export function briefingCard(state, { action }) {
  const b = (state.briefings || [])[0], s = briefingSettings(state);
  const plan = s.enabled ? `每天 ${s.time} 自动生成` : '未开启自动生成';
  const tools = action('立即生成', 'briefingGenerate', '', 'primary') + action('简报设置', 'briefingSettings');
  if (!b) return `<section class="briefing-card empty"><div class="briefing-head"><h2>今日简报</h2><small>${escape(plan)}</small><div class="actions">${tools}</div></div><p class="description">把需要你处理的事、上次以来完成的工作、今天的定时任务、新成果和记忆变化汇总成一页。只使用本机数据。</p></section>`;
  const d = new Date(b.time), title = `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sections = b.sections.map(sec => `<div class="briefing-section ${escape(sec.id)}"><h3>${escape(sec.title)} <small>${sec.items.length}</small></h3>${sec.items.length ? `<ul>${sec.items.map(i => `<li><span>${escape(i.text)}</span>${i.action ? action(escape(i.label || '处理'), i.action, i.id || '') : ''}</li>`).join('')}</ul>` : '<p class="empty-note">无</p>'}</div>`).join('');
  return `<section class="briefing-card"><div class="briefing-head"><h2>今日简报</h2><small>${escape(title)} · ${escape(plan)}</small><div class="actions">${tools}</div></div>${b.summary ? `<p class="briefing-summary">${escape(b.summary)}</p>` : ''}${b.summaryError ? `<p class="task-error">${escape(b.summaryError)}</p>` : ''}<div class="briefing-sections">${sections}</div></section>`;
}

export function briefingForm(state) {
  const s = briefingSettings(state);
  return `<div class="task-form"><label class="check"><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''}>每天自动生成（应用运行时，按本机时间）</label><label>生成时刻<input type="time" name="time" value="${escape(s.time)}"></label><fieldset class="briefing-pick"><legend>包含的板块</legend>${BRIEFING_SECTIONS.map(([id, t]) => `<label class="check"><input type="checkbox" name="sections" value="${id}" ${s.sections.includes(id) ? 'checked' : ''}>${t}</label>`).join('')}</fieldset><label class="check"><input type="checkbox" name="useModel" ${s.useModel ? 'checked' : ''}>让模型写一段概述（会把简报要点发送给当前模型）</label></div>`;
}

export function briefingPayload(f) {
  return { enabled: f.has('enabled'), time: f.get('time'), sections: f.getAll('sections'), useModel: f.has('useModel') };
}
