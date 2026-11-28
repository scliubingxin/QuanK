#!/usr/bin/env node
// Post-package smoke check: the research PPT engine must run from a packaged QuankSight.app.
// The engine module is imported from inside app.asar (as the app does) and must hand the bundled Python a script
// outside the archive. Usage (from the repo root, with the packaged app's own Node):
//   ELECTRON_RUN_AS_NODE=1 <app>/Contents/MacOS/Electron scripts/smoke-packaged-deck.mjs <app>
import path from 'node:path';
import os from 'node:os';
import {mkdtemp, readFile, rm, stat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const app = path.resolve(process.argv[2] || '');
const res = path.join(app, 'Contents', 'Resources');
const fail = message => { console.log(JSON.stringify({ok: false, error: message})); process.exit(1); };
const mod = await import(pathToFileURL(path.join(res, 'app.asar', 'runtime', 'deck-engine.mjs')).href).catch(e => fail('import: ' + e.message));
if (!mod.SCRIPT.includes(path.sep + 'app.asar.unpacked' + path.sep)) fail('deck script is still inside app.asar: ' + mod.SCRIPT);
await stat(mod.SCRIPT).catch(() => fail('unpacked deck script missing: ' + mod.SCRIPT));
const python = path.join(res, 'runtimes', 'python', 'bin', 'python3.12');
const userData = await mkdtemp(path.join(os.tmpdir(), 'qk-deck-smoke-'));
const MOCK = {
  'quote:600438': {name: '通威股份', price: '22.18', changePct: '+1.84', turnover: '18.6亿元', asOf: '2026-11-28 15:00', source: '冒烟测试'},
  'financials:600438:5y': {rows: [['指标', '2021', '2022', '2023', '2024', '2025E'], ['营业收入', '880', '1196', '1391', '1560', '1720'],
    ['归母净利润', '82', '257', '135', '-112', '130']], asOf: '2026-11-28', source: '冒烟测试'},
  'kline:600438:1d:120': {dates: Array.from({length: 120}, (_, i) => 'D' + i),
    series: Array.from({length: 120}, (_, i) => ({open: 20 + i * 0.02, high: 20.5 + i * 0.02, low: 19.6 + i * 0.02, close: 20.2 + i * 0.02})), asOf: '2026-11-28', source: '冒烟测试'},
  'kline:600438:1d:120:dates': {dates: Array.from({length: 120}, (_, i) => 'D' + i), asOf: '2026-11-28'},
};
try {
  const engine = mod.createDeckEngine({python, userData});
  const spec = {...JSON.parse(await readFile(path.join(mod.DECK_DIR, 'examples', 'research_demo.json'), 'utf8')), watermark: '冒烟测试'};
  const r = await engine.build({spec, dataMap: MOCK, theme: 'research', sourceAsOf: '2026-11-28 15:00'});
  const ok = r.ok === true && r.slides > 0 && r.bytes?.length > 0;
  console.log(JSON.stringify({ok, slides: r.slides, bytes: r.bytes?.length, script: mod.SCRIPT}));
  process.exitCode = ok ? 0 : 1;
} catch (e) { fail('build: ' + e.message); }
finally { await rm(userData, {recursive: true, force: true}); }
