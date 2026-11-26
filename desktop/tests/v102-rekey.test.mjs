import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectSealed, rekeySecrets, needsRekey, CRYPTO_NAME, LEGACY_CRYPTO_NAMES} from '../runtime/identity.mjs';
import {legacyChildName, runLegacyUnseal} from '../main/legacy-unseal.mjs';

const b = s => Buffer.from(s).toString('base64');

test('v1.0.2 钥匙串身份：QuankSight 为目标，QuanK、Actwill AI 依次作为旧身份', () => {
  assert.equal(CRYPTO_NAME, 'QuankSight');
  assert.deepEqual(LEGACY_CRYPTO_NAMES, ['QuanK', 'Actwill AI']);
  assert.equal(legacyChildName('QuanK', 'Actwill AI'), 'QuanK');
  assert.equal(legacyChildName('evil', 'Actwill AI'), 'Actwill AI');
});

test('v1.0.2 v1.0.1 用户数据：cryptoIdentity=QuanK 仍需迁移，次数按目标身份重新计', () => {
  const data = {cryptoIdentity: 'QuanK', cryptoMigration: {at: 1, total: 1, ok: 1, failed: 0, attempts: 1}};
  assert.equal(needsRekey(data), true);
  assert.equal(needsRekey({cryptoIdentity: 'QuankSight'}), false);
  assert.equal(needsRekey({cryptoIdentity: 'QuanK', cryptoMigration: {target: 'QuankSight', attempts: 3}}), false);
});

test('v1.0.2 *Sealed 字段与 envSealed 映射都会被迁移', () => {
  const data = {quant: {adminSealed: 'v1:' + b('admin-secret'), remote: {tokenSealed: 'v1:' + b('remote-token'), passSealed: 'v1:' + b('remote-pass')}},
    coding: {agents: [{envSealed: {CODEBUDDY_API_KEY: 'v1:' + b('codebuddy-key')}}]}, note: {text: b('plain text, not sealed')}};
  const keys = collectSealed(data).map(x => x.key).sort();
  assert.deepEqual(keys, ['CODEBUDDY_API_KEY', 'adminSealed', 'passSealed', 'tokenSealed']);
});

test('v1.0.2 依次尝试 QuanK、Actwill AI，只把仍未解开的密文交给下一个', async () => {
  const data = {cryptoIdentity: 'QuanK', settings: {encryptedKey: b('A:model')},
    quant: {adminSealed: 'v1:' + b('Q:admin'), remote: {tokenSealed: 'v1:' + b('Q:token')}}, coding: {agents: [{envSealed: {K: 'v1:' + b('X:lost')}}]}};
  const asked = {};
  const open = (tag, name) => async list => { asked[name] = list.length; return list.map(c => { const p = Buffer.from(c, 'base64').toString(); return p.startsWith(tag + ':') ? p.slice(2) : null; }); };
  const r = await rekeySecrets(data, {unsealLegacy: [{name: 'QuanK', unseal: open('Q', 'QuanK')}, {name: 'Actwill AI', unseal: open('A', 'Actwill AI')}],
    seal: p => b('S:' + p), openCurrent: () => null, now: () => 9});
  assert.deepEqual(asked, {QuanK: 4, 'Actwill AI': 2});
  assert.deepEqual([r.total, r.ok, r.failed], [4, 3, 1]);
  assert.deepEqual(r.from, {QuanK: 2, 'Actwill AI': 1});
  assert.equal(data.quant.adminSealed, 'v1:' + b('S:admin'));
  assert.equal(data.quant.remote.tokenSealed, 'v1:' + b('S:token'));
  assert.equal(data.settings.encryptedKey, b('S:model'));
  assert.equal(data.coding.agents[0].envSealed.K, 'v1:' + b('X:lost'), '解不开的保持原样');
  assert.equal(data.cryptoIdentity, 'QuankSight');
  assert.equal(needsRekey(data), false);
});

test('v1.0.2 子进程带上要打开的旧身份名', async () => {
  let env;
  const fake = (exe, args, opts) => { env = opts.env; const {EventEmitter} = require_events(); const c = new EventEmitter();
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => {};
    setTimeout(() => { c.stdout.emit('data', '["x"]'); c.emit('exit', 0); }, 1); return c; };
  assert.deepEqual(await runLegacyUnseal(['c'], {spawnFn: fake, execPath: '/bin/true', argv: ['x', 'y'], name: 'QuanK'}), ['x']);
  assert.equal(env.QUANK_LEGACY_NAME, 'QuanK');
});

test('v1.0.2 引擎凭据解不开时给出可读提示；本机引擎管理员密码自动重建', () => {
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(main, /QK_UNSEAL/);
  assert.match(main, /LEGACY_CRYPTO_NAMES\.map\(name => \(\{ name, unseal: list => runLegacyUnseal\(list, \{ name \}\) \}\)\)/);
  const quant = readFileSync(new URL('../services/quant-engine.mjs', import.meta.url), 'utf8');
  assert.match(quant, /const adminPass = s =>/);
  assert.doesNotMatch(quant, /unseal\(s\.adminSealed\),|unseal\(st\(\)\.adminSealed\)\}/);
});

import {EventEmitter as _EE} from 'node:events';
function require_events() { return {EventEmitter: _EE}; }
