// [v1.0.8] The packaged app keeps the research PPT engine outside app.asar so the bundled Python can read it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unpackedPath, SCRIPT, DECK_DIR} from '../runtime/deck-engine.mjs';

test('paths inside app.asar map to app.asar.unpacked, others stay as they are', () => {
  assert.equal(unpackedPath('/Applications/QuankSight.app/Contents/Resources/app.asar/runtime'),
    '/Applications/QuankSight.app/Contents/Resources/app.asar.unpacked/runtime');
  assert.equal(unpackedPath('/Applications/QuankSight.app/Contents/Resources/app.asar'),
    '/Applications/QuankSight.app/Contents/Resources/app.asar.unpacked');
  assert.equal(unpackedPath('C:\\QuankSight\\resources\\app.asar\\runtime'), 'C:\\QuankSight\\resources\\app.asar.unpacked\\runtime');
  assert.equal(unpackedPath('/Users/x/QuanK/desktop/runtime'), '/Users/x/QuanK/desktop/runtime');
  assert.equal(unpackedPath('/tmp/app.asar.unpacked/runtime'), '/tmp/app.asar.unpacked/runtime');
  assert.equal(unpackedPath('/tmp/my.app.asarx/runtime'), '/tmp/my.app.asarx/runtime');
  assert.ok(SCRIPT.startsWith(DECK_DIR) && SCRIPT.endsWith('build_deck.py'));
});

test('the packager leaves runtime/deck unpacked and checks it', () => {
  const pack = readFileSync(new URL('../../scripts/package-offline-mac.py', import.meta.url), 'utf8');
  assert.match(pack, /'--unpack-dir','runtime\/deck'/);
  assert.match(pack, /app\.asar\.unpacked'\/'runtime\/deck\/build_deck\.py'/);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(pkg.build.asarUnpack, ['runtime/deck/**']);
});
