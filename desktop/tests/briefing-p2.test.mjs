// [p2-m4] Daily briefing: sections from local data, due check, settings, model summary fallback, UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../core.mjs';
import {buildBriefing, briefingDue, briefingSettings, normalizeBriefingSettings, briefingText, dayKey} from '../src/shared/briefing.js';
import {createBriefingService} from '../services/briefing.mjs';
import {briefingCard, briefingForm, briefingPayload} from '../src/ui/briefing.js';

const local = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = local(2026, 11, 19, 9, 0), H = 3600e3;

function demo() {
  const s = initialState();
  s.pendingApprovals = [{id: 'a', time: NOW - H, title: '读取网页内容', candidate: {label: '网站 https://a.com'}}];
  s.tasks = [
    {id: 't1', name: '早报', status: 'failed', error: '网络错误', chatId: 'c1', enabled: true, nextRun: local(2026, 11, 19, 18, 0), history: [{id: 'r', at: NOW - 2 * H, status: 'done'}]},
    {id: 't2', name: '周报', status: 'done', enabled: true, nextRun: local(2026, 11, 20, 9, 0), history: []},
    {id: 't3', name: '到期', status: 'ready', enabled: true, nextRun: NOW - 60e3},
  ];
  s.chats = [
    {id: 'c1', name: '早报', taskId: 't1', messages: [], finishedAt: NOW - 2 * H},
    {id: 'c2', name: 'R', messages: [], plan: {kind: 'research', goal: '储能', status: 'done', finished: NOW - 3 * H, sources: ['x', 'y'], report: {id: 'd1'}}},
    {id: 'c3', name: '闲聊', messages: [], finishedAt: NOW - 4 * H},
    {id: 'c4', name: '老对话', messages: [], finishedAt: NOW - 50 * H},
    {id: 'c5', name: '无痕', incognito: true, messages: [], finishedAt: NOW - H},
  ];
  s.documents = [{id: 'd1', name: '研究报告-储能', time: NOW - 3 * H}];
  s.artifacts = [{id: 'x1', name: '早报结果', time: NOW - 2 * H}, {id: 'x0', name: '旧', time: NOW - 60 * H}];
  s.memories = [{id: 'm', text: '周报周五发', source: 'auto', created: NOW - 5 * H}, {id: 'm0', text: '旧记忆', created: NOW - 90 * H}];
  return s;
}

test('briefing sections come from local data since the last briefing (max 24h)', () => {
  const b = buildBriefing(demo(), NOW);
  const sec = Object.fromEntries(b.sections.map(s => [s.id, s.items]));
  assert.equal(b.day, '2026-11-19');
  assert.deepEqual(sec.attention.map(i => i.text), ['待你确认：读取网页内容 · 网站 https://a.com', '任务失败：早报 · 网络错误']);
  assert.equal(sec.attention[1].action, 'runTask');
  assert.deepEqual(sec.done.map(i => i.text), ['任务完成：早报', '深度研究完成：储能（2 个来源）', '对话完成：闲聊']);
  assert.equal(sec.done[1].action, 'documentWordEditor');
  assert.deepEqual(sec.today.map(i => i.text), ['08:59 到期（已到期，等待执行）', '18:00 早报']);
  assert.deepEqual(sec.outputs.map(i => i.text), ['成果：早报结果', '文档：研究报告-储能']);
  assert.deepEqual(sec.memory.map(i => i.text), ['自动学到：周报周五发']);
  const s = demo(); s.briefings = [{day: '2026-11-19', time: NOW - 2.5 * H}];
  const later = buildBriefing(s, NOW);
  assert.deepEqual(later.sections.find(x => x.id === 'done').items.map(i => i.text), ['任务完成：早报'], 'only what happened after the previous briefing');
  assert.deepEqual(buildBriefing(demo(), NOW, {sections: ['today']}).sections.map(x => x.id), ['today']);
  assert.match(briefingText(b), /【需要你处理】\n- 待你确认/); assert.match(briefingText(buildBriefing(initialState(), NOW)), /- 无/);
});

test('settings validation and due check', () => {
  const s = initialState();
  assert.deepEqual(briefingSettings(s), {enabled: false, time: '08:30', sections: ['attention', 'done', 'today', 'calendar', 'mail', 'updates', 'quant', 'outputs', 'memory'], useModel: false}); // [q3]
  assert.equal(briefingDue(s, NOW), false);
  s.settings.briefing = normalizeBriefingSettings({enabled: true, time: '08:30', sections: ['done', 'attention', 'bogus', 'done'], useModel: true});
  assert.deepEqual(s.settings.briefing.sections, ['done', 'attention']);
  assert.deepEqual(briefingSettings(s).sections, ['attention', 'done'], 'canonical order');
  assert.equal(briefingDue(s, local(2026, 11, 19, 8, 29)), false);
  assert.equal(briefingDue(s, NOW), true);
  s.briefings = [{day: dayKey(NOW)}]; assert.equal(briefingDue(s, NOW), false);
  for (const bad of [null, {time: '25:00', sections: ['done']}, {time: '08:00', sections: []}, {time: '08:00', sections: ['x']}]) assert.throws(() => normalizeBriefingSettings(bad));
});

test('service: manual and scheduled generation, model summary and failure fallback', async () => {
  let t = NOW;
  const store = {data: demo(), save: async () => {}};
  const asked = [], ready = [];
  let fail = false;
  const svc = createBriefingService({store, key: () => 'k', now: () => t, onReady: b => ready.push(b.trigger),
    request: async (_s, _k, messages) => { asked.push(messages); if (fail) throw new Error('超时'); return {text: '  先处理早报失败。  '}; }});
  const b1 = await svc.generate({manual: true});
  assert.equal(asked.length, 0, 'no model unless enabled'); assert.equal(b1.summary, undefined);
  await svc.settings({enabled: true, time: '08:30', sections: ['attention', 'done', 'today'], useModel: true});
  assert.equal(await svc.tick(), null, 'already generated today');
  t = NOW + 24 * H;
  const b2 = await svc.tick();
  assert.equal(b2.trigger, 'schedule'); assert.equal(b2.summary, '先处理早报失败。');
  assert.match(asked[0][1].content, /【需要你处理】/); assert.equal(b2.sections.length, 3);
  assert.equal(await svc.tick(), null);
  fail = true; t += H;
  const b3 = await svc.generate({manual: true});
  assert.match(b3.summaryError, /概述生成失败：超时/); assert.ok(b3.sections.length);
  assert.deepEqual(ready, ['manual', 'schedule', 'manual']);
  assert.equal(store.data.briefings[0], b3);
  assert.ok(store.data.briefings.length <= 3);
  await assert.rejects(svc.settings({time: 'x'}), /生成时刻/);
});

test('service: concurrent requests share one generation; keeps at most 14', async () => {
  let t = NOW, calls = 0;
  const store = {data: demo(), save: async () => { calls++; }};
  const svc = createBriefingService({store, key: () => '', now: () => t});
  const [a, b] = await Promise.all([svc.generate({manual: true}), svc.generate({manual: true})]);
  assert.equal(a, b); assert.equal(calls, 1);
  for (let i = 1; i <= 20; i++) { t = NOW + i * 24 * H; await svc.generate(); }
  assert.equal(store.data.briefings.length, 14);
});

test('briefing card and settings form', () => {
  const action = (l, a, id = '', k = '') => `<button data-action="${a}" data-id="${id}" class="${k}">${l}</button>`;
  const s = demo();
  assert.match(briefingCard(s, {action}), /只使用本机数据/); assert.match(briefingCard(s, {action}), /briefingGenerate/);
  s.briefings = [{...buildBriefing(s, NOW), summary: '概述<b>'}];
  const html = briefingCard(s, {action});
  assert.match(html, /11月19日 09:00 · 未开启自动生成/); assert.match(html, /概述&lt;b&gt;/);
  assert.match(html, /data-action="runTask" data-id="t1"/); assert.match(html, /需要你处理 <small>2/);
  s.settings.briefing = {enabled: true, time: '07:45', sections: ['today'], useModel: false};
  assert.match(briefingCard(s, {action}), /每天 07:45 自动生成/);
  const form = briefingForm(s);
  assert.match(form, /name="enabled" checked/); assert.match(form, /value="07:45"/); assert.match(form, /value="today" checked/); assert.doesNotMatch(form, /value="done" checked/);
  const data = new Map([['enabled', 'on'], ['time', '06:00']]);
  assert.deepEqual(briefingPayload({has: k => data.has(k), get: k => data.get(k), getAll: () => ['done', 'memory']}), {enabled: true, time: '06:00', sections: ['done', 'memory'], useModel: false});
});
