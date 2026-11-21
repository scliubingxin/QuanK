import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { automationPage } from '../src/ui/automation.js';
import { escape } from '../src/ui/markdown.js';
import { plazaIcon } from '../src/ui/preset-catalog.js';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const action = (l, a, id = '', c = 'secondary') => `<button type="button" class="${c}" data-action="${a}" data-id="${id}">${l}</button>`;

async function appFn(name) {
  const app = await read('../src/app.js');
  const m = new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`).exec(app);
  assert.ok(m, name + ' found');
  return new Function('escape', 'plazaIcon', 'action', `${m[0]}; return ${name};`)(escape, plazaIcon, action);
}

test('heading renders the plaza hero: highlighted second half, stats, actions; kicker not shown', async () => {
  const heading = await appFn('heading');
  const doc = new JSDOM(heading('YOUR AI TEAM', '为每一种工作，找到好搭档。', '说明<b>粗</b>', action('新建', 'newAgent'), [[3, '个智能体'], ['<i>', '<x>']])).window.document;
  const h = doc.querySelector('.page-title.page-hero h1');
  assert.equal(h.textContent, '为每一种工作，找到好搭档。', 'accessible name unchanged');
  assert.equal(h.querySelector('em').textContent, '找到好搭档。');
  assert.ok(!doc.body.textContent.includes('YOUR AI TEAM'));
  assert.deepEqual([...doc.querySelectorAll('.plaza-stats b')].map(b => b.textContent), ['3', '<i>'], 'stats are escaped');
  assert.ok(doc.querySelector('.hero-actions [data-action="newAgent"]'));
  const plain = new JSDOM(heading('', '成果中心', 'd')).window.document;
  assert.equal(plain.querySelector('h1').innerHTML, '成果中心'); assert.ok(!plain.querySelector('.hero-actions') && !plain.querySelector('.plaza-stats'));
  assert.ok(!new JSDOM(heading('', '结尾逗号，', 'd')).window.document.querySelector('em'));
});

test('agents page uses plaza cards with icons, capability tags and the original actions', async () => {
  const app = await read('../src/app.js');
  const i = app.indexOf("if (page === 'agents') { // [ux11]"), block = app.slice(i, app.indexOf("if (page === 'tasks')", i));
  for (const s of ['plaza-grid', 'agentAvatar(a)', "'useAgent'", "'editAgent'", "'deleteAgent'", "'newAgent'", "'clearKnowledgeIndex'", '个智能体']) assert.ok(block.includes(s), s);
  assert.match(app, /import \{bindPresetFilters, plazaIcon\} from '\.\/ui\/preset-catalog\.js'/);
  const helper = await read('./helpers/load-ui.mjs');
  assert.equal(helper.split('bindPresetFilters,plazaIcon,codeProjectsView').length, 3);
});

test('automation page gets the hero with task counts above its tab bar', () => {
  const state = {tasks: [{id: 't1', name: 'a', enabled: true, schedule: {kind: 'daily', time: '09:00'}}, {id: 't2', name: 'b', enabled: false, schedule: {kind: 'daily', time: '09:00'}}], agents: [], chats: []};
  for (const tab of ['tasks', 'runs']) {
    const doc = new JSDOM(automationPage(state, {action, empty: t => t, tab})).window.document;
    const hero = doc.querySelector('.auto-page > .page-hero');
    assert.ok(hero && hero.nextElementSibling.classList.contains('auto-head'), tab);
    assert.equal(hero.querySelector('em').textContent, '按时自动完成');
    assert.equal(hero.querySelectorAll('.plaza-stats b')[0].textContent, '2');
  }
});

test('shared CSS: hero, cards, chip bars', async () => {
  const css = await read('../src/workbench.css');
  for (const s of ['.page-title.page-hero{', '.page .card:not(.plaza-card){', '.page .feed-filters button.chosen{', '.auto-page .auto-tabs button.chosen{', '.page:has(.page-hero){max-width:1180px}']) assert.ok(css.includes(s), s);
  assert.ok(css.lastIndexOf('[ux11]') > css.lastIndexOf('[ux10]'), 'loaded after the plaza rules');
});
