import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareUserData, chooseUserDataDirectory, collectSealed, rekeySecrets, APP_NAME, LEGACY_CRYPTO_NAME, LEGACY_DATA_DIRS } from '../runtime/identity.mjs';
import { runLegacyUnseal } from '../main/legacy-unseal.mjs';

const read = p => readFile(p, 'utf8');
async function appData() { return mkdtemp(path.join(tmpdir(), 'quank-id-')); }
async function legacy(root, name, body = {}, time = null) {
  const dir = path.join(root, name);
  await mkdir(path.join(dir, 'documents'), {recursive: true});
  await writeFile(path.join(dir, 'workspace.json'), JSON.stringify({chats: [], ...body}));
  if (time) { const {utimes} = await import('node:fs/promises'); await utimes(path.join(dir, 'workspace.json'), time / 1000, time / 1000); }
  return dir;
}

test('identity constants', () => {
  assert.equal(APP_NAME, 'QuanK'); assert.equal(LEGACY_CRYPTO_NAME, 'Actwill AI');
  assert.deepEqual(LEGACY_DATA_DIRS, ['WillBuddy', 'Actwill AI', 'actwill-desktop']);
});

test('prepareUserData: fresh install, existing QuankSight, migration copy with path rewrite', async () => {
  const root = await appData();
  try {
    assert.deepEqual(await prepareUserData(root), {dir: path.join(root, 'QuanK'), migratedFrom: null}, 'fresh install');
    assert.equal(existsSync(path.join(root, 'QuanK')), false, 'nothing created up front');
    const old = await legacy(root, 'Actwill AI', {doc: path.join(root, 'Actwill AI', 'documents', 'a.docx'), other: '/elsewhere/a'}, Date.now() - 1000);
    await legacy(root, 'WillBuddy', {older: true}, Date.now() - 900e3);
    await writeFile(path.join(old, 'documents', 'a.docx'), 'DOC');
    await mkdir(path.join(old, 'Cache'), {recursive: true}); await writeFile(path.join(old, 'Cache', 'x'), 'c'); await writeFile(path.join(old, 'SingletonLock'), 'l');
    await mkdir(path.join(old, 'nested'), {recursive: true}); await writeFile(path.join(old, 'nested', 'idx.json'), JSON.stringify({p: path.join(old, 'documents')}));
    assert.deepEqual(await prepareUserData(root, {migrate: false}), {dir: old, migratedFrom: null}, 'preview: use the newest old folder in place');
    assert.equal(await chooseUserDataDirectory(root), old);
    const r = await prepareUserData(root, {now: () => Date.UTC(2026, 10, 20)});
    const dir = path.join(root, 'QuanK');
    assert.deepEqual([r.dir, r.migratedFrom, r.rewritten], [dir, old, 2]);
    const ws = JSON.parse(await read(path.join(dir, 'workspace.json')));
    assert.equal(ws.doc, path.join(dir, 'documents', 'a.docx')); assert.equal(ws.other, '/elsewhere/a');
    assert.equal(JSON.parse(await read(path.join(dir, 'nested', 'idx.json'))).p, path.join(old, 'documents').replace(old, dir));
    assert.equal(await read(path.join(dir, 'documents', 'a.docx')), 'DOC');
    assert.equal(existsSync(path.join(dir, 'Cache')), false); assert.equal(existsSync(path.join(dir, 'SingletonLock')), false);
    assert.equal(JSON.parse(await read(path.join(dir, 'MIGRATED_FROM.json'))).from, old);
    assert.equal(JSON.parse(await read(path.join(old, 'workspace.json'))).doc, path.join(old, 'documents', 'a.docx'), 'old folder untouched');
    const again = await prepareUserData(root);
    assert.deepEqual(again, {dir, migratedFrom: null}, 'second start uses QuankSight');
    assert.equal(await chooseUserDataDirectory(root), dir);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('collectSealed + rekeySecrets', async () => {
  const b = s => Buffer.from(s).toString('base64');
  const data = {settings: {encryptedKey: b('old:main')}, models: [{id: 'm', encryptedKey: b('old:model')}, {id: 'n', encryptedKey: ''}],
    mcp: [{encryptedToken: b('old:mcp')}], connectors: [{sealed: {password: b('old:mail'), token: b('old:bad')}}], quant: {adminSealed: 'v1:' + b('old:admin')}, note: {text: b('not a secret')}};
  const list = collectSealed(data);
  assert.deepEqual(list.map(x => [x.key, x.prefix]).sort(), [['adminSealed', 'v1:'], ['encryptedKey', ''], ['encryptedKey', ''], ['encryptedToken', ''], ['password', ''], ['token', '']]);
  const seen = [];
  const r = await rekeySecrets(data, {now: () => 7, unsealLegacy: async c => { seen.push(...c); return c.map(x => { const p = Buffer.from(x, 'base64').toString(); return p === 'old:bad' ? null : p.replace('old:', ''); }); }, seal: p => b('new:' + p)});
  assert.deepEqual([r.at, r.total, r.ok, r.failed, r.attempts, r.target], [7, 6, 5, 1, 1, 'QuankSight']); assert.equal(seen.length, 6);
  assert.equal(data.settings.encryptedKey, b('new:main')); assert.equal(data.models[0].encryptedKey, b('new:model')); assert.equal(data.models[1].encryptedKey, '');
  assert.equal(data.mcp[0].encryptedToken, b('new:mcp')); assert.equal(data.connectors[0].sealed.password, b('new:mail')); assert.equal(data.connectors[0].sealed.token, b('old:bad'), 'undecryptable left as is');
  assert.equal(data.quant.adminSealed, 'v1:' + b('new:admin')); assert.equal(data.note.text, b('not a secret'));
  assert.equal(data.cryptoIdentity, 'QuankSight');
  const empty = {chats: []}, calls = [];
  { const e = await rekeySecrets(empty, {unsealLegacy: async c => { calls.push(c); return []; }, seal: x => x, now: () => 1}); assert.deepEqual([e.at, e.total, e.ok, e.failed, e.attempts], [1, 0, 0, 0, 1]); }
  assert.equal(calls.length, 0, 'no child process when nothing is sealed'); assert.equal(empty.cryptoIdentity, 'QuankSight');
  const down = {settings: {encryptedKey: b('old:down-key')}};
  const d = await rekeySecrets(down, {unsealLegacy: async () => { throw new Error('keychain denied'); }, seal: x => x});
  assert.equal(d.failed, 1); assert.equal(d.attempts, 1); assert.match(d.error, /keychain denied/);
  assert.equal((await rekeySecrets(down, {unsealLegacy: async () => { throw new Error('x'); }, seal: x => x})).attempts, 2, 'attempts counted');
  const mixed = {settings: {encryptedKey: b('new:already')}, models: [{encryptedKey: b('old:legacy')}]}, asked = [];
  const m = await rekeySecrets(mixed, {openCurrent: c => Buffer.from(c, 'base64').toString().startsWith('new:') ? 'ok' : null, unsealLegacy: async c => { asked.push(...c); return c.map(() => 'plain'); }, seal: p => b('new:' + p)});
  assert.deepEqual([m.total, m.ok, m.failed, asked.length], [2, 2, 0, 1], 'already-current values are not sent to the old identity'); assert.equal(mixed.settings.encryptedKey, b('new:already')); assert.equal(down.cryptoIdentity, undefined, 'retried next start'); assert.equal(down.settings.encryptedKey, b('old:down-key'));
});

test('runLegacyUnseal: child args, env, private input file, stderr in errors', async () => {
  let seen, inputSeen, inputMode;
  const { readFileSync, statSync } = await import('node:fs');
  const child = (reply, code = 0) => (cmd, args, o) => {
    seen = {cmd, args, o};
    inputSeen = JSON.parse(readFileSync(o.env.QUANK_LEGACY_IN, 'utf8')); inputMode = statSync(o.env.QUANK_LEGACY_IN).mode & 0o777;
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => {};
    setTimeout(() => { if (reply === null) { c.stderr.emit('data', 'legacy unseal: boom\n'); } else c.stdout.emit('data', JSON.stringify(reply(inputSeen))); c.emit('exit', code); }, 2);
    return c;
  };
  process.env.ELECTRON_RUN_AS_NODE = '1';
  try {
    const out = await runLegacyUnseal(['a', 'b'], {execPath: '/app/QuanK', argv: ['/app/QuanK', '--remote-debugging-port=9556', '--user-data-dir=/tmp/p', '-psn_0_1', '/app/dir'], spawnFn: child(l => l.map(x => x + '!'))});
    assert.deepEqual(out, ['a!', 'b!']);
  } finally { delete process.env.ELECTRON_RUN_AS_NODE; }
  assert.deepEqual(inputSeen, ['a', 'b']); assert.equal(inputMode, 0o600);
  assert.equal(seen.cmd, '/app/QuanK'); assert.equal(seen.args[0], '/app/dir'); assert.match(seen.args[1], /^--user-data-dir=.*quank-rekey-.*profile$/); assert.equal(seen.args.length, 2);
  assert.equal(seen.o.env.QUANK_LEGACY_UNSEAL, '1'); assert.equal('ELECTRON_RUN_AS_NODE' in seen.o.env, false); assert.deepEqual(seen.o.stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(existsSync(seen.o.env.QUANK_LEGACY_IN), false, 'input file removed');
  await assert.rejects(runLegacyUnseal(['a'], {spawnFn: child(null, 2), argv: ['x']}), /旧密钥读取失败（退出码 2）：legacy unseal: boom/);
  const hang = () => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => setTimeout(() => c.emit('exit', null), 1); return c; };
  await assert.rejects(runLegacyUnseal(['a'], {spawnFn: hang, argv: ['x'], timeoutMs: 20}), /读取旧密钥超时/);
});
test('wiring and visible brand', async () => {
  const main = await read(new URL('../main.mjs', import.meta.url));
  assert.match(main, /QUANK_LEGACY_UNSEAL === '1'/); assert.doesNotMatch(main, /await legacyUnsealChild/, 'must not be awaited (ESM ready deadlock)');
  assert.match(main, /if \(legacyChild\) \{ \/\* legacy unseal child: nothing else runs \*\/ \}\nelse if \(!app\.requestSingleInstanceLock\(\)\)/); assert.match(main, /prepareUserData\(app\.getPath\('appData'\), \{ migrate: app\.isPackaged \}\)/);
  assert.match(main, /app\.setName\(DISPLAY_NAME\)/); assert.doesNotMatch(main, /app\.setName\('Actwill AI'\)/);
  assert.match(main, /needsRekey\(store\.data, CRYPTO_NAME\)/);
  assert.match(main, /title: 'QuankSight'/);
  const pkg = JSON.parse(await read(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.productName, 'QuankSight'); assert.equal(pkg.build.appId, 'com.quank.desktop'); assert.equal(pkg.name, 'quank-desktop');
  const app = await read(new URL('../src/app.js', import.meta.url));
  assert.match(app, /alt="QuankSight 标志"/);
  assert.match(app, /<span class="brand-en">QuankSight<\/span><span class="brand-cn">量见\$\{appVersion \? `<span class="brand-ver"[^`]*` : ''\}<\/span>/);
  assert.match(app, /<small>量化工作，一键搞定<\/small>/);
  assert.doesNotMatch(app, /<small>量见 · 量化工作，一键搞定<\/small>/); // [v0.52] version badge between name and tagline
  const html = await read(new URL('../src/index.html', import.meta.url));
  assert.match(html, /<title>QuankSight 量见 · 金融量化工作台<\/title>/);
  for (const f of ['main.mjs', 'src/app.js', 'src/index.html', 'src/office/index.html', 'src/ui/quant.js', 'services/app-tools.mjs'])
    assert.doesNotMatch(await read(new URL('../' + f, import.meta.url)), /WillBuddy(?!Engine| 助手| 工作助手)/, f + ' still shows the old name');
  const icon = await stat(new URL('../assets/app.icns', import.meta.url));
  assert.ok(icon.size > 50000);
});

test('legacyUnsealChild: sets the old name before ready, decrypts after ready, exits', async () => {
  const { legacyUnsealChild } = await import('../main/legacy-unseal.mjs');
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const dir = await mkdtemp(path.join(tmpdir(), 'quank-child-')), input = path.join(dir, 'in.json');
  await writeFile(input, JSON.stringify([Buffer.from('k1').toString('base64'), Buffer.from('bad').toString('base64')]));
  const ev = []; let ready; const readyP = new Promise(r => { ready = r; });
  const app = {setName: n => ev.push('name:' + n), dock: {hide: () => ev.push('hide')}, whenReady: () => readyP, exit: c => ev.push('exit:' + c)};
  const safeStorage = {decryptString: b => { const s = b.toString(); if (s === 'bad') throw new Error('nope'); return 'plain-' + s; }};
  let written = '', errs = '';
  const out = {write: (s, cb) => { written += s; cb?.(); }}, err = {write: s => { errs += s; }};
  const p = legacyUnsealChild({app, safeStorage, name: 'Actwill AI', out, err, input, timeoutMs: 5000});
  assert.deepEqual(ev, ['name:Actwill AI', 'hide'], 'returns before ready (caller does not await)');
  ready(); assert.equal(await p, 2);
  assert.deepEqual(JSON.parse(written), ['plain-k1', null]); assert.match(errs, /nope/); assert.equal(ev.at(-1), 'exit:0');
  const ev2 = []; const app2 = {setName() {}, whenReady: () => new Promise(() => {}), exit: c => ev2.push(c)};
  legacyUnsealChild({app: app2, safeStorage, name: 'x', out, err, input, timeoutMs: 20});
  await new Promise(r => setTimeout(r, 60)); assert.deepEqual(ev2, [3], 'bails out when ready never comes');
  await rm(dir, {recursive: true, force: true});
});
