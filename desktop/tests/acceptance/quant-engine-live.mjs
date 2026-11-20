// [q1] Live check against a real private engine project: sync into a temp folder, start it, read the pool, compute one
// stock (summary + chart data), ask for the AI insight (an algorithm fallback is fine), stop.
// Run: WB_QUANT_SOURCE=<project with wb-engine.json> [WB_QUANT_PYTHON=<python3>] [WB_QUANT_CODE=<6 digits>] node --test tests/acceptance/quant-engine-live.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createQuantEngine } from '../../services/quant-engine.mjs';

const SOURCE = process.env.WB_QUANT_SOURCE || '';
test('real engine: sync, start, pool, signal and charts, insight, stop', {timeout: 420000, skip: !SOURCE || !existsSync(path.join(SOURCE, 'wb-engine.json'))}, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wbq-live-'));
  const store = {data: {quant: {python: process.env.WB_QUANT_PYTHON || '', ai: 'none', pool: []}}, save() {}};
  const engine = createQuantEngine({dir, store});
  try {
    const s = await engine.sync({source: SOURCE});
    assert.ok(s.files > 5, 'project files copied');
    await engine.start();
    assert.equal(engine.view().status, 'running');
    const pool = await engine.handle({action: 'pool'});
    const code = process.env.WB_QUANT_CODE || pool.pool[0]?.code;
    assert.ok(code, 'the pool has at least one stock');
    const r = await engine.handle({action: 'signal', code});
    console.log('QUANT-LIVE', JSON.stringify({action: r.summary.action, score: r.summary.score, mult: r.summary.multiplier, price: r.summary.price, bars: r.charts.price?.length, curve: r.charts.curve?.length, ops: r.charts.ops.length}));
    assert.ok(typeof r.summary.score === 'number' && r.summary.action, 'signal computed');
    assert.ok(r.charts.price?.length > 20, 'chart data present');
    if (engine.view().features.holdings) { const h = await engine.handle({action: 'holding', code}); assert.equal(typeof h.shares, 'number'); assert.ok(r.holding, 'the signal carries the holding'); } // [q4]
    if (engine.view().features.plan) { const pl = await engine.handle({action: 'plan'}); assert.ok(pl.options.length > 0 && pl.plan.label, 'investment plan readable'); }
    if (engine.view().reportDefs.some(d => d.schedule === 'daily')) { const id = engine.view().reportDefs.find(d => d.schedule === 'daily').id, rep = await engine.handle({action: 'reportRun', id}); console.log('QUANT-REPORT', JSON.stringify({id, ok: rep.ok, error: rep.error, metrics: rep.metrics, warnings: rep.warnings?.length, items: rep.items?.length, md: rep.hasMarkdown, ms: rep.ms})); assert.equal(typeof rep.ok, 'boolean'); } // [q5]
    const ins = await engine.handle({action: 'insight', code});
    assert.ok(ins.text.length > 10, 'insight (or algorithm fallback) returned');
  } finally {
    await engine.stop();
    await rm(dir, {recursive: true, force: true, maxRetries: 30, retryDelay: 100});
  }
});
