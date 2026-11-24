import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {createQuantAutostart} from '../runtime/quant-autostart.mjs';
import {createQuantEngine} from '../services/quant-engine.mjs';
import {quantSettingsForm, quantSettingsPayload} from '../src/ui/quant.js';

test('窗口就绪后等待 Office，然后延迟启动一次；低电量延后', async t => {
  let phase = 'starting', batteryLow = true, checks = 0, starts = 0;
  const scheduler = createQuantAutostart({
    enabled: () => true, officePhase: () => phase, defer: () => { checks++; return batteryLow; },
    run: () => { starts++; }, officeLimit: 5000, delay: 10, poll: 2, retryDelay: 5,
  });
  t.after(() => scheduler.close());
  await sleep(15);
  assert.equal(checks, 0);
  scheduler.windowReady();
  await sleep(15);
  assert.equal(checks, 0);
  phase = 'ready';
  await sleep(35);
  assert.ok(checks > 0);
  assert.equal(starts, 0);
  batteryLow = false;
  await sleep(35);
  scheduler.windowReady();
  await sleep(15);
  assert.equal(starts, 1);
  assert.equal(scheduler.pending(), false);
});

test('Office 卡住时等待上限，关闭开关或退出会取消等待', async t => {
  const calls = [];
  for (const scenario of ['deadline', 'disabled', 'closed', 'failed']) {
    let enabled = true;
    const scheduler = createQuantAutostart({
      enabled: () => enabled, officePhase: () => scenario === 'failed' ? 'failed' : 'starting',
      defer: () => false, run: () => calls.push(scenario), officeLimit: 8, delay: 4, poll: 2,
    });
    t.after(() => scheduler.close());
    scheduler.windowReady();
    if (scenario === 'disabled') enabled = false;
    if (scenario === 'closed') scheduler.close();
    await sleep(30);
  }
  assert.deepEqual(calls, ['deadline', 'failed']);
});

const adapter = {
  title: 'Fixture', engine: {entry: 'serve.py', port: 18057, health: '/ready'},
  auth: {path: '/login'}, endpoints: {pool: '/pool', signal: '/signal/{code}'}, fields: {action: 'action'},
  config: {file: 'settings.json'},
};

async function setup(t, {enabled, remote = false, portAvailable = true, offline = false} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'quank-e1-'));
  const dir = path.join(root, 'quant'), source = path.join(root, 'strategy');
  await mkdir(source);
  await writeFile(path.join(source, 'serve.py'), '');
  await writeFile(path.join(source, 'wb-engine.json'), JSON.stringify(adapter));
  const requests = [], children = [], ports = [];
  const store = {data: {quant: {source, startupEngine: enabled, pool: [{code: '600438'}], python: '/fixture/python3',
    ...(remote ? {mode: 'remote', remote: {url: 'https://fixture.example', tokenSealed: 'fixture', fallback: true}} : {})}}, async save() {}};
  const engine = createQuantEngine({
    dir, store, probe: () => ({ok: true}), portFree: async p => { ports.push(p); return portAvailable; },
    spawn() {
      const child = new EventEmitter();
      child.kill = () => queueMicrotask(() => child.emit('exit', 0));
      children.push(child);
      return child;
    },
    async fetcher(url) {
      const endpoint = new URL(url).pathname;
      requests.push(endpoint);
      if (offline) throw new Error('unreachable fixture');
      return Response.json(endpoint === '/wb-engine.json' ? adapter : endpoint.startsWith('/signal') ? {action: 'BUY'} : {});
    },
  });
  t.after(async () => { await engine.stop(); await rm(root, {recursive: true, force: true}); });
  return {engine, requests, children, ports, store};
}

test('启动开关默认关闭，保存独立设置，按需启动仍然可用', async t => {
  const {engine, children} = await setup(t);
  assert.equal(engine.view().startupEngine, false);
  assert.equal(engine.view().autoStart, true);
  const dom = new JSDOM('<form>' + quantSettingsForm(engine.view()) + '</form>');
  const form = dom.window.document.querySelector('form');
  assert.match(form.textContent, /常驻一个策略 Python 进程/);
  assert.equal(form.elements.startupEngine.checked, false);
  assert.equal(quantSettingsPayload(new dom.window.FormData(form)).startupEngine, false);
  assert.equal(await engine.startup(), false);
  assert.equal(children.length, 0);
  await engine.sync({});
  await engine.signal('600438');
  assert.equal(children.length, 1);
});

test('启动本地引擎并刷新一次股票池信号，即使关闭按需启动', async t => {
  const {engine, requests, children, store} = await setup(t, {enabled: true});
  store.data.quant.autoStart = false;
  assert.equal(await engine.startup(), true);
  assert.equal(children.length, 1);
  assert.equal(engine.view().status, 'running');
  assert.equal(requests.filter(p => p === '/signal/600438').length, 1);
  assert.ok(engine.view().lastWatch);
});

test('远程只探测连接，失败时也不走本地回退', async t => {
  for (const offline of [false, true]) {
    const {engine, requests, children, ports} = await setup(t, {enabled: true, remote: true, offline});
    assert.equal(await engine.startup(), !offline);
    assert.deepEqual(requests, offline ? ['/wb-engine.json'] : ['/wb-engine.json', '/ready']);
    assert.deepEqual(children, []);
    assert.deepEqual(ports, []);
    if (offline) assert.match(engine.view().watchError, /unreachable fixture/);
  }
});

test('固定端口占用后使用原提示，单次后台计划不会重试', async t => {
  const {engine, children, ports} = await setup(t, {enabled: true, portAvailable: false});
  let finish;
  const complete = new Promise(resolve => { finish = resolve; });
  const scheduler = createQuantAutostart({
    enabled: () => true, officePhase: () => 'ready', defer: () => false,
    run: async eligible => { finish(await engine.startup(eligible)); }, delay: 0,
  });
  t.after(() => scheduler.close());
  scheduler.windowReady();
  const [result] = await Promise.all([complete, sleep(100)]);
  assert.equal(result, false);
  assert.match(engine.view().watchError, /端口 18057 已被占用/);
  scheduler.windowReady();
  await engine.tick();
  await sleep(20);
  assert.deepEqual(ports, [18057]);
  assert.deepEqual(children, []);
});
