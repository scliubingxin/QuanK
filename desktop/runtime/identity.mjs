import path from 'node:path';
import { stat, cp, readdir, readFile, writeFile } from 'node:fs/promises';
// [rebrand] Product identity. QuanK keeps its data in <appData>/QuanK and its keychain key under the name QuanK.
// Older builds (WillBuddy / Actwill AI / actwill-desktop) are found and copied over once; the old folder is left untouched.
export const APP_NAME = 'QuanK';
export const LEGACY_CRYPTO_NAME = 'Actwill AI';
export const LEGACY_DATA_DIRS = ['WillBuddy', 'Actwill AI', 'actwill-desktop'];
const SKIP = /^(Singleton(Lock|Socket|Cookie)|Cache|Code Cache|GPUCache|DawnCache|DawnGraphiteCache|DawnWebGPUCache|GrShaderCache|ShaderCache|Crashpad|blob_storage)$/;

async function workspaceTime(dir) {
  try { const info = await stat(path.join(dir, 'workspace.json')); return info.isFile() ? info.mtimeMs : null; }
  catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') throw e; return null; }
}
async function newestLegacy(appData) {
  const found = [];
  for (const name of LEGACY_DATA_DIRS) { const dir = path.join(appData, name), time = await workspaceTime(dir); if (time !== null) found.push({dir, time}); }
  found.sort((a, b) => b.time - a.time);
  return found[0]?.dir || null;
}
/** Display/product naming must not silently abandon an existing workspace or vault. (kept for older callers) */
export async function chooseUserDataDirectory(appData) {
  if (await workspaceTime(path.join(appData, APP_NAME)) !== null) return path.join(appData, APP_NAME);
  return (await newestLegacy(appData)) || path.join(appData, APP_NAME);
}
/** Rewrite absolute paths that point into the old folder (JSON files only, up to 64 MB each). */
async function rewritePaths(dir, from, to) {
  const esc = s => JSON.stringify(s).slice(1, -1), a = esc(from + path.sep), b = esc(to + path.sep);
  let files = 0;
  async function walk(d) {
    for (const e of await readdir(d, {withFileTypes: true})) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP.test(e.name)) await walk(p); continue; }
      if (!e.isFile() || !e.name.endsWith('.json')) continue;
      const info = await stat(p); if (info.size > 64 * 1024 * 1024) continue;
      const t = await readFile(p, 'utf8'); if (!t.includes(a)) continue;
      await writeFile(p, t.split(a).join(b)); files++;
    }
  }
  await walk(dir);
  return files;
}
/**
 * Pick the data folder; when only an older build's folder exists, copy it to <appData>/QuanK first.
 * `migrate:false` (source preview) only reports what would be used. Returns {dir, migratedFrom, rewritten}.
 */
export async function prepareUserData(appData, {migrate = true, now = Date.now} = {}) {
  const target = path.join(appData, APP_NAME);
  if (await workspaceTime(target) !== null) return {dir: target, migratedFrom: null};
  const legacy = await newestLegacy(appData);
  if (!legacy) return {dir: target, migratedFrom: null};
  if (!migrate) return {dir: legacy, migratedFrom: null};
  await cp(legacy, target, {recursive: true, errorOnExist: false, force: false, filter: src => !SKIP.test(path.basename(src)) || src === legacy});
  const rewritten = await rewritePaths(target, legacy, target);
  await writeFile(path.join(target, 'MIGRATED_FROM.json'), JSON.stringify({from: legacy, at: new Date(now()).toISOString(), rewritten}, null, 2) + '\n');
  return {dir: target, migratedFrom: legacy, rewritten};
}

// Sealed values in workspace.json: plain base64 under these keys or inside a `sealed` map; `v1:`-prefixed for adminSealed.
const SEALED_KEYS = new Set(['encryptedKey', 'encryptedToken', 'adminSealed']);
export function collectSealed(data) {
  const out = [], seen = new WeakSet();
  const visit = (o, inSealed) => {
    if (!o || typeof o !== 'object' || seen.has(o)) return; seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && v && (inSealed || SEALED_KEYS.has(k))) {
        const prefix = v.startsWith('v1:') ? 'v1:' : '', cipher = v.slice(prefix.length);
        if (/^[A-Za-z0-9+/=]{8,}$/.test(cipher)) out.push({obj: o, key: k, prefix, cipher});
      } else if (v && typeof v === 'object') visit(v, k === 'sealed' && !Array.isArray(v));
    }
  };
  visit(data, false);
  return out;
}
/**
 * Re-encrypt every sealed value under the new keychain identity. `unsealLegacy(ciphers)` returns plaintexts (null when it
 * cannot decrypt); `seal(plain)` returns base64 under the current identity. Values that cannot be decrypted are left as
 * they are (the owning feature then asks the user to enter that secret again). Plaintext never leaves memory.
 */
export async function rekeySecrets(data, {unsealLegacy, seal, openCurrent = null, now = Date.now}) {
  const all = collectSealed(data);
  // values that already open under the current identity (entered again after the rename) are left alone
  const list = openCurrent ? all.filter(x => { try { return typeof openCurrent(x.cipher) !== 'string'; } catch { return true; } }) : all;
  const result = {at: now(), total: all.length, ok: all.length - list.length, failed: 0, attempts: (Number(data.cryptoMigration?.attempts) || 0) + 1};
  if (list.length) {
    let plain = [];
    try { plain = await unsealLegacy(list.map(x => x.cipher)); } catch (e) { result.error = String(e?.message || e).slice(0, 200); }
    list.forEach((x, i) => {
      const p = Array.isArray(plain) ? plain[i] : null;
      if (typeof p !== 'string') { result.failed++; return; }
      try { x.obj[x.key] = x.prefix + seal(p); result.ok++; } catch { result.failed++; }
    });
  }
  if (!result.error) data.cryptoIdentity = APP_NAME; // retried on the next start when the old key could not be reached at all
  data.cryptoMigration = result;
  return result;
}
