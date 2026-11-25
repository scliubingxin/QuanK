import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createAutosave, registerOfficeAutosave } from '../services/office-autosave.mjs';
import { createVault, isEncrypted } from '../services/vault.mjs';

function fakeClock() {
  let now = Date.now() + 1000, id = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, delay) {
      timers.set(++id, { fn, at: now + delay });
      return id;
    },
    clearTimeout: key => timers.delete(key),
    async advance(ms) {
      const end = now + ms;
      while (true) {
        const [key, next] = [...timers].sort((a, b) => a[1].at - b[1].at)[0] || [];
        if (!next || next.at > end) break;
        timers.delete(key);
        now = next.at;
        await next.fn();
      }
      now = end;
    },
  };
}

async function fixture(t, config = {}) {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'o5-'));
  t.after(() => fs.rm(userData, { recursive: true, force: true }));
  const file = path.join(userData, 'sheet.xlsx');
  const recoveryDir = path.join(userData, 'office', 'recovery');
  const clock = fakeClock();
  const records = new Map(), finalized = [], calls = [];
  const session = Object.assign(new EventEmitter(), {
    docId: 'sheet', text: 'original',
    async save(options) {
      calls.push(options);
      this.emit('saved');
      return Buffer.from(this.text);
    },
  });
  const edit = text => { session.text = text; session.emit('dirty'); };
  let revision = 1;
  const versions = {
    head: () => revision,
    async record(entry) {
      assert.equal(entry.expectedRevision, revision);
      assert.equal(entry.size, entry.bytes.length);
      assert.match(entry.sha256, /^[a-f0-9]{64}$/);
      const receipt = { ...entry, revision: entry.isCopy ? revision : ++revision };
      records.set(entry.mergeKey ?? entry.id, receipt);
      return receipt;
    },
    finalize: ({ mergeKey }) => finalized.push(mergeKey),
  };
  const reload = async ({ bytes }) => { session.text = (bytes ?? await fs.readFile(file)).toString(); };
  await fs.writeFile(file, 'original');
  const options = { file, userData, clock, versions, reload, ...config };
  return { file, userData, recoveryDir, clock, records, finalized, calls, session, edit, options,
    controller: await createAutosave(session, options),
    read: () => fs.readFile(file, 'utf8'),
    bumpRevision: () => revision++,
  };
}

test('idle debounce, states and manual save with unchanged bytes', async t => {
  const f = await fixture(t);
  const states = [];
  for (const state of ['saving', 'saved']) f.controller.on(state, event => states.push(event.status));
  f.edit('first');
  await f.clock.advance(1500);
  f.edit('second');
  await f.clock.advance(1999);
  assert.equal(await f.read(), 'original');
  await f.clock.advance(1);
  assert.equal(await f.read(), 'second');
  assert.deepEqual(states, ['saving', 'saved']);
  await f.controller.save();
  await f.controller.save();
  assert.deepEqual([...f.records.values()].map(v => v.reason), ['auto', 'manual', 'manual']);
});

test('continuous edits save no later than 30 seconds', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 30; i++) {
    f.edit('edit ' + i);
    await f.clock.advance(1000);
  }
  assert.equal(await f.read(), 'edit 29');
  assert.equal(f.records.size, 1);
});

test('IME and drag block saves within 20 seconds; stale interaction falls back to save', async t => {
  const f = await fixture(t);
  f.controller.setInteraction({ ime: true, drag: true });
  f.edit('中文');
  assert.equal((await f.controller.save()).ok, false);
  await f.clock.advance(19_000);
  assert.equal(f.calls.length, 0, '不足 20 秒仍不保存');
  await f.clock.advance(2_000);
  assert.equal(await f.read(), '中文', '卡住超过 20 秒后兜底保存');
});

test('fsync failure leaves source intact and removes incomplete temp files', async t => {
  const f = await fixture(t, {
    io: { ...fs, async open(...args) {
      const handle = await fs.open(...args);
      handle.sync = async () => { throw Error('disk full'); };
      return handle;
    } },
  });
  f.edit('draft');
  const result = await f.controller.save();
  assert.equal(result.state.status, 'unsaved');
  assert.match(result.state.error.message, /disk full/);
  assert.equal(await f.read(), 'original');
  assert.equal(f.session.text, 'draft');
  assert.deepEqual(await fs.readdir(f.userData), ['sheet.xlsx']);
});

test('two retries and exactly one version even when version storage needs retry', async t => {
  let attempts = 0;
  const f = await fixture(t, {
    io: { ...fs, async rename(...args) {
      if (++attempts < 3) throw Error('temporary rename failure');
      await fs.rename(...args);
    } },
  });
  const record = f.options.versions.record;
  let versionAttempts = 0;
  f.options.versions.record = entry => {
    if (++versionAttempts === 1) throw Error('temporary version failure');
    return record(entry);
  };
  f.edit('retried');
  assert.equal((await f.controller.save()).state.status, 'unsaved');
  assert.equal((await f.controller.save('auto')).ok, true);
  assert.equal(await f.read(), 'retried');
  assert.equal(attempts, 3);
  assert.equal(f.records.size, 1);
  assert.equal(f.calls.length, 1);
});

test('rolling work in the same ten-minute window updates one auto version and close seals it', async t => {
  const f = await fixture(t);
  f.edit('first');
  await f.clock.advance(2000);
  const [key] = f.records.keys();
  await f.controller.save('ai');
  f.edit('merged');
  await f.clock.advance(2000);
  assert.equal(f.records.get(key).bytes.toString(), 'merged');
  assert.equal(f.records.size, 2);
  await f.clock.advance(600_000);
  f.edit('next window');
  await f.clock.advance(2000);
  assert.equal(f.records.size, 3);
  assert.deepEqual(f.finalized, [key]);
  assert.equal(await f.controller.requestClose(() => assert.fail('unexpected card')), true);
  assert.equal(f.finalized.length, 2);
});

for (const choice of ['copy', 'overwrite', 'reload']) {
  test('external change prompts for ' + choice, async t => {
    const f = await fixture(t);
    f.edit('local');
    await fs.writeFile(f.file, 'external');
    const result = await f.controller.save();
    assert.deepEqual(result.state.choices, ['copy', 'overwrite', 'reload']);
    assert.equal(result.state.defaultChoice, 'copy');
    assert.equal(await f.read(), 'external');
    const copy = path.join(f.userData, 'copy.xlsx');
    assert.equal((await f.controller.resolveConflict(choice, copy)).ok, true);
    assert.equal(await f.read(), choice === 'overwrite' ? 'local' : 'external');
    if (choice === 'copy') assert.equal(await fs.readFile(copy, 'utf8'), 'local');
    if (choice === 'reload') assert.equal(f.session.text, 'external');
  });
}

test('library-only changes and same-size edits before rename are conflicts', async t => {
  const f = await fixture(t);
  f.edit('local');
  f.bumpRevision();
  assert.equal((await f.controller.save()).state.status, 'conflict');
  assert.equal(await f.read(), 'original');
  await f.controller.resolveConflict('reload');
  const serialize = f.session.save;
  f.session.save = async function (options) {
    await fs.writeFile(f.file, 'EXTERNAL');
    return serialize.call(this, options);
  };
  f.edit('local');
  assert.equal((await f.controller.save()).state.status, 'conflict');
  assert.equal(await f.read(), 'EXTERNAL');
});

for (const encrypted of [false, true]) {
  test('recovery write, restore and cleanup with encryption ' + encrypted, async t => {
    const f = await fixture(t, { idleMs: 60_000, maxMs: 60_000 });
    const vault = createVault({ dir: f.userData, seal: bytes => bytes, unseal: bytes => bytes });
    await fs.writeFile(vault.dataFile, '{}');
    const store = {
      data: { history: [] },
      save() { return fs.writeFile(vault.dataFile, vault.codec.encode(JSON.stringify(this.data))); },
    };
    if (encrypted) await vault.enable(store);
    const record = f.options.versions.record;
    f.options.versions.record = async entry => {
      const receipt = await record(entry);
      store.data.history.push({ ...receipt, bytes: receipt.bytes.toString('base64') });
      await store.save();
      return receipt;
    };
    const options = { ...f.options, codec: vault.codec, clock: fakeClock() };
    const controller = await createAutosave(f.session, options);
    f.edit('recover me');
    await options.clock.advance(30_000);
    const [name] = await fs.readdir(f.recoveryDir);
    const raw = await fs.readFile(path.join(f.recoveryDir, name));
    assert.equal(isEncrypted(raw), encrypted);
    assert.equal(await f.read(), 'original');
    const restarted = await createAutosave(f.session, options);
    assert.equal(restarted.recovery.message, '恢复未保存的修改');
    assert.equal(await restarted.resolveRecovery('restore'), true);
    assert.equal((await restarted.save()).ok, true);
    assert.equal(await f.read(), 'recover me');
    const workspace = await fs.readFile(vault.dataFile);
    assert.equal(isEncrypted(workspace), encrypted);
    assert.equal(JSON.parse(vault.codec.decode(workspace)).history[0].reason, 'manual');
    assert.deepEqual(await fs.readdir(f.recoveryDir), []);
  });
}

test('recovery can be discarded without changing the source', async t => {
  const f = await fixture(t, { idleMs: 60_000, maxMs: 60_000 });
  f.edit('discard me');
  await f.clock.advance(30_000);
  const reopened = await createAutosave(f.session, f.options);
  assert.equal(await reopened.resolveRecovery('discard'), true);
  assert.equal(await f.read(), 'original');
  assert.deepEqual(await fs.readdir(f.recoveryDir), []);
});

test('close attempts save first, then supports cancel, retry and discard via tab card', async t => {
  const f = await fixture(t);
  let fail = true;
  const serialize = f.session.save;
  f.session.save = async function (options) {
    if (fail) throw Error('暂时无法保存');
    return serialize.call(this, options);
  };
  f.edit('draft');
  assert.equal(await f.controller.requestClose(card => {
    assert.deepEqual(card.choices, ['save', 'discard', 'cancel']);
    assert.equal(card.state.status, 'unsaved');
    return 'cancel';
  }), false);
  assert.equal(await f.read(), 'original');
  assert.equal(await f.controller.requestClose(() => { fail = false; return 'save'; }), true);
  assert.equal(await f.read(), 'draft');

  const manager = registerOfficeAutosave({ defaults: f.options, promptClose: () => 'discard' });
  await manager.open(f.session);
  fail = true;
  f.edit('discard this');
  assert.equal(await manager.beforeQuit(), true);
  assert.equal(await f.read(), 'draft');
});

test('cancelling quit in the second tab preserves the first tab and its unsaved changes', async t => {
  const first = await fixture(t);
  const second = await fixture(t);
  second.session.docId = 'second';
  const choices = [];
  const manager = registerOfficeAutosave({ promptClose: docId => {
    choices.push(docId);
    return docId === 'second' ? 'cancel' : 'discard';
  } });
  const tab = await manager.open(first.session, first.options);
  await manager.open(second.session, second.options);
  const originalSave = first.session.save;
  first.session.save = second.session.save = async () => { throw Error('disk full'); };
  first.edit('first draft');
  second.edit('second draft');
  assert.equal(await manager.beforeQuit(), false);
  assert.deepEqual(choices, ['sheet', 'second']);
  assert.equal(await first.read(), 'original');
  first.session.save = originalSave;
  assert.equal((await tab.retry()).ok, true);
  assert.equal(await first.read(), 'first draft');
});

test('copy choice never replaces an existing file', async t => {
  const f = await fixture(t);
  f.edit('draft');
  await fs.writeFile(f.file, 'external');
  const copy = path.join(f.userData, 'copy.xlsx');
  await fs.writeFile(copy, 'keep me');
  assert.equal((await f.controller.save()).state.status, 'conflict');
  assert.equal((await f.controller.resolveConflict('copy', copy)).state.status, 'unsaved');
  assert.equal(await fs.readFile(copy, 'utf8'), 'keep me');
  assert.equal(await f.read(), 'external');
  assert.equal(f.session.text, 'draft');
});
