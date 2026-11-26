// [rebrand] Runs in a short-lived child of QuankSight (QUANK_LEGACY_UNSEAL=1) under the old keychain name, so values sealed by
// WillBuddy can be read once and re-sealed under QuankSight. Ciphertexts arrive in a 0600 file inside a private 0700 temp folder
// (QUANK_LEGACY_IN); plaintexts leave on stdout (pipe only, never written to disk).
// IMPORTANT: main.mjs must NOT await this. In an ESM entry Electron emits `ready` only after the module's top-level code has
// finished, so awaiting app.whenReady() at the top level deadlocks (that was the "legacy unseal: timed out" in rebrand-fix).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** [v1.0.2] The child may open any of these keychain identities (QUANK_LEGACY_NAME); anything else falls back to `name`. */
export const LEGACY_NAMES = ['QuanK', 'Actwill AI'];
export function legacyChildName(requested, fallback) {
  return LEGACY_NAMES.includes(String(requested || '')) ? String(requested) : fallback;
}
export function legacyUnsealChild({app, safeStorage, name, timeoutMs = 100e3, out = process.stdout, err = process.stderr, input = process.env.QUANK_LEGACY_IN}) {
  app.setName(legacyChildName(process.env.QUANK_LEGACY_NAME, name));
  app.dock?.hide?.();
  const bail = setTimeout(() => { err.write('legacy unseal: timed out\n'); app.exit(3); }, timeoutMs);
  let list = [];
  try { list = JSON.parse(readFileSync(String(input || ''), 'utf8')); } catch (e) { err.write('legacy unseal: no input ' + e.message + '\n'); }
  return app.whenReady().then(() => {
    const plain = (Array.isArray(list) ? list : []).slice(0, 2000).map(c => { try { return safeStorage.decryptString(Buffer.from(String(c), 'base64')); } catch (e) { err.write('legacy unseal: ' + e.message + '\n'); return null; } });
    out.write(JSON.stringify(plain), () => { clearTimeout(bail); app.exit(0); });
    return plain.length;
  }).catch(e => { err.write('legacy unseal: ' + (e?.message || e) + '\n'); clearTimeout(bail); app.exit(2); });
}

/** Parent side: spawn ourselves once with the legacy identity. Resolves to an array of plaintexts / nulls.
 *  120 s leaves time to answer a macOS keychain prompt; the window is not blocked meanwhile. */
export function runLegacyUnseal(ciphers, {execPath = process.execPath, argv = process.argv, timeoutMs = 120e3, spawnFn = spawn, name = ''} = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'quank-rekey-')), profile = path.join(dir, 'profile'), input = path.join(dir, 'in.json');
  chmodSync(dir, 0o700);
  writeFileSync(input, JSON.stringify(ciphers), {mode: 0o600});
  const args = [...argv.slice(1).filter(a => !/^--(remote-debugging|user-data-dir|inspect)/.test(a) && !a.startsWith('-psn')), `--user-data-dir=${profile}`];
  return new Promise((resolve, reject) => {
    let out = '', err = '', done = false;
    const fin = (e, v) => { if (done) return; done = true; clearTimeout(timer); try { rmSync(dir, {recursive: true, force: true}); } catch {} e ? reject(e) : resolve(v); };
    const env = {...process.env, QUANK_LEGACY_UNSEAL: '1', QUANK_LEGACY_IN: input}; delete env.ELECTRON_RUN_AS_NODE;
    if (name) env.QUANK_LEGACY_NAME = name; else delete env.QUANK_LEGACY_NAME;
    let c;
    try { c = spawnFn(execPath, args, {env, stdio: ['ignore', 'pipe', 'pipe']}); } catch (e) { fin(e); return; }
    const why = m => new Error(m + (err.trim() ? '：' + err.trim().split('\n').slice(-2).join(' / ').slice(0, 200) : ''));
    const timer = setTimeout(() => { try { c.kill('SIGKILL'); } catch {} fin(why('读取旧密钥超时')); }, timeoutMs);
    c.stdout?.on('data', b => { out += b; });
    c.stderr?.on('data', b => { err = (err + b).slice(-2000); });
    c.on('error', e => fin(e));
    c.on('exit', code => { try { const v = JSON.parse(out); Array.isArray(v) ? fin(null, v) : fin(why('旧密钥读取结果无效')); } catch { fin(why(`旧密钥读取失败（退出码 ${code}）`)); } });
  });
}
