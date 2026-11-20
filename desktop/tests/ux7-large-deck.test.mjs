import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAX_SLIDES, normalizeSlideAction, normalizeThumbnail, normalizeNotesWrite } from '../src/shared/office-pages.js';
import { displayFontName, mapUnoStates } from '../src/shared/office-uno.js';
import { OFFICE_WORKER_FILES } from '../runtime/office-worker-bundle.mjs';
import { runCommand } from '../runtime/command.mjs';

test('large decks: page helpers accept slide 182 and cap at 1000', () => {
  assert.equal(MAX_SLIDES, 1000);
  assert.deepEqual(normalizeThumbnail({part: 181, width: 240}, 182), {part: 181, width: 240});
  assert.deepEqual(normalizeSlideAction({action: 'duplicate', part: 150}, 182), {action: 'duplicate', part: 150});
  assert.deepEqual(normalizeSlideAction({action: 'move', part: 0, to: 181}, 182), {action: 'move', part: 0, to: 181});
  assert.throws(() => normalizeSlideAction({action: 'insert', part: 0}, 1000), /1000/);
  assert.throws(() => normalizeThumbnail({part: 182}, 182), /范围/);
  assert.equal(normalizeNotesWrite({part: 170, text: 'x'}, 182).part, 170);
});

test('worker and bundle: no 100-part limit left, bundle in sync, clear messages', async () => {
  const src = await readFile(new URL('../runtime/office-kit/worker.py', import.meta.url), 'utf8');
  assert.ok(!src.includes('Document part limit:100'));
  assert.ok(!/num\(p\['(part|to)'\],0,99\)/.test(src));
  assert.match(src, /文档引擎没有读到任何页面/);
  assert.match(src, /文档超过 1000 页/);
  assert.equal(OFFICE_WORKER_FILES['worker.py'].text, src, 'office-worker-bundle.mjs regenerated');
  const ws = await readFile(new URL('../services/office-workspace.mjs', import.meta.url), 'utf8');
  assert.ok(!/p\.part>\s*99(?!\d)/.test(ws));
});

test('font box shows the original font name instead of the engine substitute', () => {
  assert.equal(displayFontName('Liberation Sans'), 'Arial');
  assert.equal(displayFontName('Carlito'), 'Calibri');
  assert.equal(displayFontName('微软雅黑'), '微软雅黑');
  assert.equal(displayFontName(''), '');
  assert.equal(mapUnoStates({'.uno:CharFontName': 'Liberation Serif'}).font, 'Times New Roman');
});

test('a command that cannot be executed gets a clear message instead of a raw EACCES', async () => {
  const dir = await import('node:fs/promises').then(f => f.mkdtemp(new URL('file:///tmp/wb-eacces-').pathname));
  const fs = await import('node:fs/promises');
  const exe = dir + '/not-executable';
  await fs.writeFile(exe, '#!/bin/sh\necho hi\n', {mode: 0o644});
  try {
    await assert.rejects(runCommand({executable: exe, args: [], cwd: dir, timeoutMs: 5000}), e => /无法执行命令|找不到命令/.test(e.message) && !/^spawn /.test(e.message));
  } finally { await fs.rm(dir, {recursive: true, force: true}); }
});

test('web PPT export prefers the structured layout engine with a fallback', async () => {
  const src = await readFile(new URL('../../app/office-actions.tsx', import.meta.url), 'utf8');
  assert.match(src, /exportStructuredPptx\(name,content,\{brandName:'QuanK'\}\)/);
  assert.match(src, /catch\(e\)\{[^}]*exportPptx\(name,content\)/);
});

test('.gitignore covers the node_modules symlink and _wbcheck', async () => {
  const g = await readFile(new URL('../../.gitignore', import.meta.url), 'utf8');
  assert.match(g, /^\/desktop\/node_modules$/m);
  assert.match(g, /^\/desktop\/_wbcheck\/$/m);
});
