// [F1d] drawn avatars for agents / skills / MCP, Office-style document icons, per-kind feed icons
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { agentAvatar, skillAvatar, mcpAvatar, feedAvatar, docIcon } from '../src/ui/avatars.js';
import { appsCard } from '../src/ui/home-dashboard.js';
import { feedPage } from '../src/ui/feed.js';
import { capabilityPresets } from '../runtime/capability-presets.mjs';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const svgOf = h => new JSDOM(h).window.document.querySelector('.av svg');

test('agents: every built-in has its own drawing; custom agents get a stable generated one', () => {
  const ids = ['assistant', 'research', 'writer', 'fin-research', 'fin-modeler', 'fin-quant', 'fin-risk'];
  const drawn = ids.map(id => agentAvatar({id, name: id}));
  assert.equal(new Set(drawn.map(h => h.replace(/avg\w+/g, ''))).size, ids.length, 'all different');
  for (const h of drawn) { assert.ok(svgOf(h)); assert.match(h, /class="av pc-icon av-agent"/); assert.doesNotMatch(h, /<script|on\w+=/i); }
  assert.equal(agentAvatar({id: 'x1', name: '我的助手'}), agentAvatar({id: 'x1', name: '我的助手'}));
  assert.match(agentAvatar({id: 'fin-quant', name: '量化'}, 'qk-badge'), /class="av qk-badge av-agent"/);
  assert.match(agentAvatar({id: 'z', name: '<b>"'}), /aria-label="&lt;b&gt;&quot;"/);
});

test('skills and MCP: every preset gets an avatar, known connectors their own tile', () => {
  const {skills, mcp} = capabilityPresets();
  for (const s of skills) assert.ok(svgOf(skillAvatar(s)), s.id);
  for (const m of mcp) assert.ok(svgOf(mcpAvatar(m)), m.id);
  assert.notEqual(mcpAvatar({id: 'tushare'}), mcpAvatar({id: 'akshare-one'}));
  assert.equal(mcpAvatar({name: 'Fiscal.ai'}).replace(/aria-label="[^"]*"/, ''), mcpAvatar({id: 'fiscal-ai'}).replace(/aria-label="[^"]*"/, ''));
  assert.ok(svgOf(mcpAvatar({name: '我的服务', url: 'https://x.example/mcp'})));
  const gid = h => /linearGradient id="(\w+)"/.exec(h)[1];
  assert.notEqual(gid(mcpAvatar({name: 'Fiscal.ai'})), gid(mcpAvatar({name: 'Alpha Vantage'}))); assert.equal(gid(mcpAvatar({name: 'Twelve Data 备用'})), gid(mcpAvatar({id: 'twelve-data'})));
});

test('Office icons and feed icons', () => {
  for (const [f, kind, letter] of [['docx', 'DOC', 'W'], ['xlsx', 'XLS', 'X'], ['pptx', 'PPT', 'P'], ['pdf', 'PDF', 'PDF']]) {
    const d = new JSDOM(docIcon(f)).window.document.querySelector('.lib-icon'); assert.equal(d.dataset.kind, kind); assert.equal(d.querySelector('text').textContent, letter);
  }
  const kinds = ['chat', 'task', 'research', 'plan', 'connector', 'quant', 'approval', 'log'];
  assert.equal(new Set(kinds.map(k => feedAvatar(k))).size, kinds.length);
  const H = 3600e3, NOW = Date.parse('2026-11-21T10:00:00+08:00');
  const html = feedPage({feed: {seenAt: 0, dismissed: []}, chats: [], activity: [{id: 'a', title: '行情提醒', detail: '宁德时代（300750）', time: NOW - H}]}, {action: (l) => `<button>${l}</button>`, date: () => '', heading: () => '', empty: t => t, now: NOW});
  const row = new JSDOM(html).window.document.querySelector('.feed-row'); assert.ok(row.querySelector('.fd-badge.av-feed svg'));
});

test('wiring: home apps, agents page, plaza cards, library use the drawn avatars', async () => {
  const state = {agents: [{id: 'fin-research', name: '投研分析师', description: '个股研究'}, {id: 'assistant', name: 'QuanK 助手', description: ''}], capabilityPresets: capabilityPresets(), skillPackages: []};
  const doc = new JSDOM(appsCard(state, {action: () => ''})).window.document;
  assert.ok(doc.querySelector('.qk-pane-agents .qk-app .qk-badge.av-agent svg')); assert.ok(doc.querySelector('.qk-pane-skills .qk-app .qk-badge.av-skill svg'));
  const [app, pc, cl, docs, css] = await Promise.all(['../src/app.js', '../src/ui/preset-catalog.js', '../src/ui/capability-library.js', '../src/ui/documents.js', '../src/workbench.css'].map(read));
  assert.ok(app.includes('${agentAvatar(a)}')); assert.ok(pc.includes('${skill ? skillAvatar(p) : mcpAvatar(p)}'));
  assert.ok(cl.includes('${skillAvatar({id:') && cl.includes('${mcpAvatar({id:')); assert.ok(docs.includes('${docIcon(d.format'));
  assert.ok(css.lastIndexOf('[F1d]') > css.lastIndexOf('[F1c]'));
});
