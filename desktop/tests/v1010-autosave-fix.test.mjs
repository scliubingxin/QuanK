import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {createAutosave} from '../services/office-autosave.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function fakeClock() {
  let now = Date.now() + 1000, id = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, delay) { timers.set(++id, {fn, at: now + delay}); return id; },
    clearTimeout: key => timers.delete(key),
    async advance(ms) {
      const end = now + ms;
      while (true) {
        const [key, next] = [...timers].sort((a,b) => a[1].at - b[1].at)[0] || [];
        if (!next || next.at > end) break;
        timers.delete(key); now = next.at; await next.fn();
      }
      now = end;
    },
  };
}

async function fixture(t) {
  const {mkdtemp, writeFile, readFile, rm} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const userData = await mkdtemp(path.join(tmpdir(), 'v1010-'));
  t.after(() => rm(userData, {recursive:true, force:true}));
  const file = path.join(userData, 'sheet.xlsx');
  await writeFile(file, 'original');
  const clock = fakeClock();
  const session = Object.assign(new EventEmitter(), {
    docId:'sheet', text:'original',
    async save() { return Buffer.from(this.text); },
  });
  const versions = {head:()=>revision, async record(entry){return {...entry, revision:++revision};}, finalize(){}};
  let revision = 1;
  const reload = async () => {};
  const controller = await createAutosave(session, {file, userData, clock, versions, reload});
  return {session, controller, clock, read:()=>readFile(file,'utf8'),
    edit:text => {session.text = text; session.emit('dirty');}};
}

test('(f) 窗口路径 dirty 后 2 秒内出现 saved', async t => {
  const f = await fixture(t);
  const states = [];
  f.controller.on('saved', s => states.push(s.status));
  f.edit('edited');
  await f.clock.advance(2000);
  assert.deepEqual(states, ['saved']);
  assert.equal(await f.read(), 'edited');
});

test('(g) drag 卡在 true 超过 20 秒后仍会保存', async t => {
  const f = await fixture(t);
  f.controller.setInteraction({drag:true});
  f.edit('stale-drag');
  await f.clock.advance(19_000);
  assert.equal(await f.read(), 'original');
  await f.clock.advance(2_000);
  assert.equal(await f.read(), 'stale-drag');
});

test('(h) 正在拖动且不足 20 秒时不保存', async t => {
  const f = await fixture(t);
  f.controller.setInteraction({drag:true});
  f.edit('fresh-drag');
  await f.clock.advance(18_000);
  assert.equal(await f.read(), 'original');
  assert.equal((await f.controller.save()).ok, false);
});

const canvas = readFileSync(path.join(here,'..','src','office','office-canvas.js'),'utf8');
test('(a)(b)(c)(d)(e) 输入层自愈复位路径齐全', () => {
  assert.match(canvas, /try \{ sheet\.setPointerCapture\(pointerId\); \} catch/);
  assert.match(canvas, /setDrag\(true\)/);
  assert.match(canvas, /document\.addEventListener\('pointerup', end, \{capture:true/);
  assert.match(canvas, /document\.addEventListener\('pointercancel', end, \{capture:true/);
  assert.match(canvas, /sheet\.addEventListener\('lostpointercapture', end\)/);
  assert.match(canvas, /compositionend[^\n]*setIme\(false\)/);
  assert.match(canvas, /window\.addEventListener\('blur', \(\) => \{ setDrag\(false\); setIme\(false\); \}/);
  assert.match(canvas, /visibilitychange[^\n]*document\.hidden[^\n]*setDrag\(false\); setIme\(false\)/);
  assert.match(canvas, /setTimeout\(\(\) => setDrag\(false\), 10_000\)/);
  assert.match(canvas, /setTimeout\(\(\) => setIme\(false\), 15_000\)/);
  assert.match(canvas, /clearTimeout\(dragTimer\); clearTimeout\(imeTimer\)/);
});
