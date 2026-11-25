// [F5 M1] 本机数据保护: AES-256-GCM encryption of workspace.json with a random data key sealed by the macOS keychain
// (safeStorage), passphrase-protected backups (scrypt + AES-256-GCM) that can be restored on any Mac, and the app-lock
// password hash. Pure node crypto; the keychain functions are injected.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, rm, copyFile, chmod } from 'node:fs/promises';
import path from 'node:path';

export const MAGIC = Buffer.from('QKE1');
const SCRYPT = {N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024};
export const isEncrypted = buf => Buffer.isBuffer(buf) && buf.length > 32 && buf.subarray(0, 4).equals(MAGIC);

export function encryptBytes(plain, key) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(Buffer.isBuffer(plain) ? plain : Buffer.from(String(plain), 'utf8')), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]);
}
export function decryptBytes(buf, key) {
  if (!isEncrypted(buf)) throw new Error('不是 QuankSight 加密数据');
  const iv = buf.subarray(4, 16), tag = buf.subarray(16, 32), d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  try { return Buffer.concat([d.update(buf.subarray(32)), d.final()]); } catch { throw new Error('本机数据解密失败：密钥不匹配或文件已损坏'); }
}

// ---------- passphrase (backups, lock password) ----------
export function checkPassphrase(p, {min = 8} = {}) {
  const s = String(p ?? '');
  if (s.length < min) throw new Error(`密码至少 ${min} 位`);
  if (s.length > 200) throw new Error('密码太长');
  if (/^(\d)\1+$|^(12345678|password|88888888|qwertyui)/i.test(s)) throw new Error('密码太简单，请换一个');
  return s;
}
export function hashPassword(p, salt = randomBytes(16)) {
  const h = scryptSync(String(p), salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${h.toString('base64')}`;
}
export function verifyPassword(p, stored) {
  const m = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([^$]+)\$([^$]+)$/.exec(String(stored || ''));
  if (!m) return false;
  const want = Buffer.from(m[5], 'base64'), got = scryptSync(String(p ?? ''), Buffer.from(m[4], 'base64'), want.length, {N: Number(m[1]), r: Number(m[2]), p: Number(m[3]), maxmem: SCRYPT.maxmem});
  return got.length === want.length && timingSafeEqual(got, want);
}
/** Passphrase backup: a JSON envelope, readable on any Mac with the passphrase. */
export function sealBackup(payload, passphrase, meta = {}) {
  const salt = randomBytes(16), key = scryptSync(checkPassphrase(passphrase), salt, 32, SCRYPT), iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(payload), 'utf8')), c.final()]);
  return JSON.stringify({format: 'quank-backup', v: 1, created: meta.created || Date.now(), app: meta.app || '', kdf: {name: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: salt.toString('base64')},
    cipher: 'aes-256-gcm', iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: ct.toString('base64'), counts: meta.counts || {}});
}
export function openBackup(text, passphrase) {
  let env; try { env = JSON.parse(String(text)); } catch { throw new Error('这不是 QuankSight 备份文件'); }
  if (env?.format !== 'quank-backup' || env.v !== 1 || env.kdf?.name !== 'scrypt') throw new Error('这不是 QuankSight 备份文件，或备份版本不受支持');
  if (!(env.kdf.N <= 1 << 20 && env.kdf.r <= 16 && env.kdf.p <= 4)) throw new Error('备份文件参数异常');
  const key = scryptSync(String(passphrase ?? ''), Buffer.from(env.kdf.salt, 'base64'), 32, {N: env.kdf.N, r: env.kdf.r, p: env.kdf.p, maxmem: SCRYPT.maxmem});
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
  d.setAuthTag(Buffer.from(env.tag, 'base64'));
  let plain; try { plain = Buffer.concat([d.update(Buffer.from(env.data, 'base64')), d.final()]); } catch { throw new Error('密码不对，或备份文件已损坏'); }
  const payload = JSON.parse(plain.toString('utf8'));
  if (payload?.workspace?.schema !== 1) throw new Error('备份里没有有效的 QuankSight 数据');
  return {payload, created: env.created, counts: env.counts || {}};
}

// ---------- the data key ----------
/**
 * The workspace codec. keyFile holds the data key sealed by the keychain. active: workspace.json is written encrypted.
 * seal / unseal: Buffer <-> Buffer through safeStorage (injected; throws when the keychain is unavailable).
 */
export function createVault({dir, seal, unseal, now = Date.now}) {
  const keyFile = path.join(dir, 'workspace.key'), dataFile = path.join(dir, 'workspace.json');
  let key = null;
  async function readKey() {
    if (key) return key;
    let sealed; try { sealed = await readFile(keyFile); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    try { key = Buffer.from(unseal(sealed)); } catch { throw new Error('本机数据已加密，但无法从钥匙串读取密钥。请确认登录的是同一个 macOS 用户；如果钥匙串被重置，请用加密备份恢复。'); }
    if (key.length !== 32) { key = null; throw new Error('钥匙串里的数据密钥无效'); }
    return key;
  }
  const codec = {
    active: false,
    encode: s => key && codec.active ? encryptBytes(s, key) : Buffer.from(String(s), 'utf8'),
    decode: buf => isEncrypted(buf) ? (() => { if (!key) throw new Error('本机数据已加密，但没有找到钥匙串里的密钥（workspace.key 缺失）。请用加密备份恢复。'); return decryptBytes(buf, key).toString('utf8'); })() : buf.toString('utf8'),
  };
  /** Before store.load(): pick up the key and mode from disk. */
  async function prepare() {
    let head = null; try { head = (await readFile(dataFile)).subarray(0, 4); } catch {}
    const enc = !!head && head.equals(MAGIC);
    if (enc) await readKey();
    codec.active = enc;
    return {encrypted: enc};
  }
  /** Turn encryption on: keep a plaintext copy, write encrypted, read back and compare. */
  async function enable(store) {
    if (codec.active) return {encrypted: true, backup: null};
    const k = randomBytes(32), sealed = seal(k);
    await writeFile(keyFile + '.tmp', sealed, {mode: 0o600}); await rename(keyFile + '.tmp', keyFile);
    key = k;
    const backup = path.join(dir, `workspace.plain-backup-${new Date(now() + 8 * 3600e3).toISOString().slice(0, 19).replace(/[-:T]/g, '')}.json`);
    try { await copyFile(dataFile, backup); await chmod(backup, 0o600); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    codec.active = true;
    try {
      await store.save();
      const back = JSON.parse(codec.decode(await readFile(dataFile)));
      if (JSON.stringify(back) !== JSON.stringify(store.data)) throw new Error('加密后读回的数据与原数据不一致');
    } catch (e) { codec.active = false; await store.save().catch(() => {}); throw new Error(`开启加密失败，已恢复为未加密：${e.message}`); }
    return {encrypted: true, backup};
  }
  async function disable(store) {
    if (!codec.active) return {encrypted: false};
    codec.active = false;
    await store.save();
    await rm(keyFile, {force: true}); key = null;
    return {encrypted: false};
  }
  return {codec, prepare, enable, disable, keyFile, dataFile, get encrypted() { return codec.active; }};
}
