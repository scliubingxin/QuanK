// [v1.0.6] Document space: bigger budget, old versions give way before a save is refused, and the refusal
// tells the user how full it is and where to delete.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentService, DOCUMENT_LIMITS, documentUsage} from '../services/documents.mjs';

const store = () => ({data: {documents: []}, async save() {}});
const blob = (id, kb, versions = 0) => ({id, name: id, format: 'md', revision: versions + 1, time: versions + 1, size: kb * 1024,
  sha256: id, text: '', base64: 'x'.repeat(kb * 1024),
  history: Array.from({length: versions}, (_, i) => ({revision: i + 1, time: i + 1, sha256: id + i, size: kb * 1024, base64: 'y'.repeat(kb * 1024)}))});

test('limits are 200 documents / 64 MiB', () => {
  assert.equal(DOCUMENT_LIMITS.count, 200);
  assert.equal(DOCUMENT_LIMITS.bytes, 64 * 1024 * 1024);
});

test('a save that only fits after dropping old versions succeeds and keeps every current version', async () => {
  const s = store();
  // 6 documents of 2 MiB with 5 old versions each ≈ 72 MiB: over budget only because of the old versions
  s.data.documents = Array.from({length: 6}, (_, i) => blob('d' + i, 2048, 5));
  const svc = createDocumentService({store: s});
  const r = await svc.importFile('新研报', 'md', Buffer.from('# 新研报\n正文'));
  assert.equal(r.status, 'succeeded');
  assert.equal(s.data.documents.length, 7);
  for (const doc of s.data.documents) assert.ok(doc.base64 !== undefined, 'current version kept');
  assert.ok(documentUsage(s.data.documents).bytes <= DOCUMENT_LIMITS.bytes);
  assert.ok(s.data.documents.some(doc => (doc.history || []).length < 5), 'some old versions dropped');
});

test('when current versions alone are over budget the save is refused with usage and where to delete', async () => {
  const s = store();
  s.data.documents = Array.from({length: 7}, (_, i) => blob('big' + i, 10 * 1024, 0)); // 70 MiB of current versions
  const before = JSON.stringify(s.data.documents.map(x => x.history));
  const svc = createDocumentService({store: s});
  await assert.rejects(svc.importFile('再来一份', 'md', Buffer.from('x')), e => {
    assert.equal(e.code, 'QK_DOC_SPACE');
    assert.match(e.message, /MiB/);
    assert.match(e.message, /删除文档/);
    return true;
  });
  assert.equal(s.data.documents.length, 7, 'nothing written');
  assert.equal(JSON.stringify(s.data.documents.map(x => x.history)), before, 'old versions restored after a refused save');
});

test('the renderer state carries document usage for the library header', async () => {
  const {readFileSync} = await import('node:fs');
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(main, /documentUsage:documentUsage\(store\.data\.documents\|\|\[\]\)/);
  const {documentLibrary} = await import('../src/ui/documents.js');
  const html = documentLibrary({state: {documents: [], documentUsage: {bytes: 3 * 1048576, maxBytes: 64 * 1048576}}, action: () => '', date: () => ''});
  assert.match(html, /已用 3\.0 \/ 64 MiB/);
});
