// [v1.0.7] Real engine: fonts inside a PPT table cell apply and are saved — Chinese text gets the East Asian
// face (a:ea), Latin text gets the western face (a:latin), size is saved.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {generateDocument} from '../../runtime/documents.mjs';
import office from '../../runtime/vendor/office.cjs';

const runtime = process.env.QUANK_ENGINE_RUNTIME;
const python = runtime && path.join(runtime, 'python/bin/python3');
const officeDirectory = runtime && path.join(runtime, 'WillBuddyEngine/Contents/MacOS');
const ready = Boolean(runtime && existsSync(python) && existsSync(officeDirectory));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const s = v => ({type: 'string', value: v});

test('PPT table cell: Chinese face, Latin face and size apply and are saved', {skip: !ready, timeout: 240000}, async t => {
  const {startOfficeLokWorker} = await import('../../runtime/office-lok-worker.mjs');
  const scratchDirectory = await mkdtemp(path.join(tmpdir(), 'quank-v107-ppt-'));
  const worker = await startOfficeLokWorker({scratchDirectory, python, officeDirectory, timeoutMs: 60000});
  t.after(async () => { await worker.close().catch(() => {}); await rm(scratchDirectory, {recursive: true, force: true}); });
  const {bytes} = await generateDocument('pptx', JSON.stringify({slides: [{title: '6 只标的', table: [['标的', '现价'], ['隆基绿能', '10.80'], ['通威股份', '11.16']]}]}));
  const sessionId = 'p1';
  await worker.request('open', {sessionId, format: 'pptx', bytes, readOnly: false});
  const {viewId} = await worker.request('attach', {sessionId});
  const states = {};
  const call = async (op, p = {}) => {
    const r = await worker.request(op, {sessionId, viewId, ...p});
    for (const [name, value] of r?.events || []) if (name === 'state') Object.assign(states, value);
    return r;
  };
  const settle = async (want, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { await call('poll'); if (want()) return true; await sleep(60); } return want(); };
  const select = async text => {
    await call('uno', {command: '.uno:ExecuteSearch', args: {'SearchItem.SearchString': s(text), 'SearchItem.Backward': {type: 'boolean', value: false}, 'SearchItem.Command': {type: 'long', value: 0}}});
    assert.equal((await call('selection')).text, text, text + ' selected');
  };
  const runOf = async text => {
    const xml = new TextDecoder().decode(office.zip.unzipSync(new Uint8Array((await call('exportFile')).binary))['ppt/slides/slide1.xml']);
    const i = xml.indexOf(text);
    return xml.slice(xml.lastIndexOf('<a:r>', i), i);
  };
  const {fonts = []} = await call('fonts');
  const cjk = ['Songti SC', 'Kaiti SC', 'Hiragino Sans GB'].find(f => fonts.includes(f));
  const latin = ['Times New Roman', 'Georgia'].find(f => fonts.includes(f));
  assert.ok(cjk && latin, `engine has a Chinese (${cjk}) and a Latin (${latin}) face besides the default`);

  await select('隆基绿能');
  await call('uno', {command: '.uno:CharFontName', args: {'CharFontName.FamilyName': s(cjk)}});
  assert.ok(await settle(() => states['.uno:CharFontName'] === cjk), 'engine reports the Chinese face');
  await call('uno', {command: '.uno:FontHeight', args: {'FontHeight.Height': {type: 'float', value: 24}}});
  const cn = await runOf('隆基绿能');
  console.log('RUN_CN', cn.match(/<a:ea typeface="[^"]+"/)?.[0], cn.match(/sz="\d+"/)?.[0]);
  assert.match(cn, new RegExp(`<a:ea typeface="${cjk}"`), 'Chinese face saved on the Chinese run');
  assert.match(cn, /sz="2400"/, 'size saved');

  await select('10.80');
  await call('uno', {command: '.uno:CharFontName', args: {'CharFontName.FamilyName': s(latin)}});
  assert.ok(await settle(() => states['.uno:CharFontName'] === latin), 'engine reports the Latin face');
  const en = await runOf('10.80');
  console.log('RUN_EN', en.match(/<a:latin typeface="[^"]+"/)?.[0]);
  assert.match(en, new RegExp(`<a:latin typeface="${latin}"`), 'Latin face saved on the number run');
});
