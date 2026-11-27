// [v1.0.7] Real-engine check of the canvas editor's worker (the path the edit window actually uses).
// Run: QUANK_ENGINE_RUNTIME=<…/QuanK.app/Contents/Resources/runtimes> node --test tests/acceptance/office-worker-commands-live.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {generateDocument} from '../../runtime/documents.mjs';

const runtime = process.env.QUANK_ENGINE_RUNTIME;
const python = runtime && path.join(runtime, 'python/bin/python3');
const officeDirectory = runtime && path.join(runtime, 'WillBuddyEngine/Contents/MacOS');
const ready = Boolean(runtime && existsSync(python) && existsSync(officeDirectory));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(t) {
  const {startOfficeLokWorker} = await import('../../runtime/office-lok-worker.mjs');
  const scratchDirectory = await mkdtemp(path.join(tmpdir(), 'quank-v107-live-'));
  const worker = await startOfficeLokWorker({scratchDirectory, python, officeDirectory, timeoutMs: 60000});
  t.after(async () => { await worker.close().catch(() => {}); await rm(scratchDirectory, {recursive: true, force: true}); });
  const sessionId = 's1';
  const {bytes} = await generateDocument('docx', JSON.stringify({blocks: [{type: 'paragraph', text: 'Table font probe'}]}));
  await worker.request('open', {sessionId, format: 'docx', bytes, readOnly: false});
  const {viewId} = await worker.request('attach', {sessionId});
  const call = (op, p = {}) => worker.request(op, {sessionId, viewId, ...p});
  const states = {};
  const absorb = r => { for (const [name, value] of r?.events || []) if (name === 'state') Object.assign(states, value); return r; };
  const settle = async (want, ms = 3000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { absorb(await call('poll')); if (want()) return true; await sleep(60); }
    return want();
  };
  return {worker, call: async (op, p) => absorb(await call(op, p)), states, settle};
}

test('formerly rejected toolbar commands reach the engine', {skip: !ready, timeout: 180000}, async t => {
  const o = await open(t);
  await o.call('uno', {command: '.uno:SelectAll', args: {}});
  for (const command of ['.uno:Grow', '.uno:Shrink', '.uno:SuperScript', '.uno:SubScript',
    '.uno:IncrementIndent', '.uno:DecrementIndent', '.uno:SpacePara15', '.uno:ResetAttributes']) {
    await assert.doesNotReject(o.call('uno', {command, args: {}}), command + ' was rejected by the engine worker');
  }
});

test('font family and size apply inside a table cell and read back', {skip: !ready, timeout: 180000}, async t => {
  const o = await open(t);
  await o.call('insertTable', {rows: [['单元格甲', '单元格乙'], ['单元格丙', '单元格丁']]});
  const {fonts = []} = await o.call('fonts');
  const family = ['PingFang SC', 'Arial', 'Times New Roman'].find(f => fonts.includes(f)) || fonts.find(f => /^[A-Za-z]/.test(f));
  assert.ok(family, 'engine reports at least one usable font family');
  const located = await o.call('locate', {target: {kind: 'table', index: 0}});
  assert.ok(located.rects?.length, 'a table cell is selected');
  await o.call('uno', {command: '.uno:CharFontName', args: {'CharFontName.FamilyName': {type: 'string', value: family}}});
  assert.ok(await o.settle(() => o.states['.uno:CharFontName'] === family), `font state after apply: ${o.states['.uno:CharFontName']} (wanted ${family})`);
  await o.call('uno', {command: '.uno:FontHeight', args: {'FontHeight.Height': {type: 'float', value: 20}}});
  assert.ok(await o.settle(() => parseFloat(o.states['.uno:FontHeight']) === 20), `size state after apply: ${o.states['.uno:FontHeight']}`);
});

test('font family applies in a normal paragraph too', {skip: !ready, timeout: 180000}, async t => {
  const o = await open(t);
  const {fonts = []} = await o.call('fonts');
  const family = ['Times New Roman', 'Arial', 'PingFang SC'].find(f => fonts.includes(f));
  assert.ok(family);
  await o.call('uno', {command: '.uno:SelectAll', args: {}});
  await o.call('uno', {command: '.uno:CharFontName', args: {'CharFontName.FamilyName': {type: 'string', value: family}}});
  assert.ok(await o.settle(() => o.states['.uno:CharFontName'] === family), `paragraph font state: ${o.states['.uno:CharFontName']}`);
});

test('a malformed argument is refused without killing the engine', {skip: !ready, timeout: 120000}, async t => {
  const o = await open(t);
  const r = await o.call('uno', {command: '.uno:CharFontName', args: {CharFontName: {type: 'string', value: 'Arial'}}});
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid_input');
  await assert.doesNotReject(o.call('poll'), 'engine still answers after a refused command');
});
