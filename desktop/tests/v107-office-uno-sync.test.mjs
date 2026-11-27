// [v1.0.7] The engine worker's command allow-list and argument names come from the app's UNO whitelist.
import test from 'node:test';
import assert from 'node:assert/strict';
import {UNO_COMMANDS, LEGACY_COMMANDS} from '../src/shared/office-uno.js';
import {nativeWorker} from '../runtime/office-lok-native.mjs';

const allowed = new Set([...nativeWorker.match(/allowed = \{([^}]*)\}/)[1].matchAll(/'([A-Za-z0-9.\-]+)'/g)].map(m => m[1]));
const argsBlock = nativeWorker.match(/UNO_ARGS = \{([\s\S]*?)\}\n/)[1];

test('every whitelisted toolbar command is allowed by the engine worker', () => {
  const missing = [...Object.keys(UNO_COMMANDS), ...LEGACY_COMMANDS].map(n => n.slice(5)).filter(n => !allowed.has(n));
  assert.deepEqual(missing, []);
});

test('every argument the app may send is declared for the engine worker', () => {
  for (const [name, def] of Object.entries(UNO_COMMANDS)) {
    for (const key of Object.keys(def.args || {})) {
      assert.ok(argsBlock.includes(`'${name}': {`) && argsBlock.slice(argsBlock.indexOf(`'${name}': {`)).split('}')[0].includes(`'${key}'`),
        `${name} argument ${key} not declared in worker UNO_ARGS`);
    }
  }
});

test('font family and size keep their qualified argument names', () => {
  assert.match(argsBlock, /'\.uno:CharFontName': \{'CharFontName\.FamilyName'\}/);
  assert.match(argsBlock, /'\.uno:FontHeight': \{'FontHeight\.Height'\}/);
});
