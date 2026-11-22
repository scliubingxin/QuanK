// [F5] 安全与合规 service (main process): privacy & offline mode (M2), keys overview and model-key test (M2), app lock and
// workspace encryption with passphrase backups (M1), the audit log (M3) and compliance settings & review (M4).
import { readFile, writeFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { normalizePrivacy } from '../src/shared/privacy.js';
import { normalizeComplianceSettings, parseComplianceSettings, reviewText, describeReview } from '../src/shared/compliance.js';
import { hashPassword, verifyPassword, checkPassphrase, sealBackup, openBackup } from './vault.mjs';
import { KIND_LABELS } from './audit.mjs';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const IDLE_CHOICES = [0, 5, 10, 15, 30, 60];
export function normalizeLock(l) {
  const o = l && typeof l === 'object' ? l : {};
  return {enabled: o.enabled === true && !!o.passwordHash, idleMinutes: IDLE_CHOICES.includes(Number(o.idleMinutes)) ? Number(o.idleMinutes) : 15, touchId: o.touchId !== false, passwordHash: o.passwordHash || '', onSleep: o.onSleep !== false};
}

export function createSecurityService({store, audit, egress, vault = null, dir = '', appName = 'QuanK', now = Date.now, notify = () => {}, idleSeconds = () => 0,
  touchId = {can: () => false, prompt: async () => { throw new Error('这台 Mac 不支持触控 ID'); }}, saveFile = null, openFile = null, relaunch = () => {}, secretsView = () => ({}), testModel = null} = {}) {
  const st = () => {
    const s = (store.data.security ??= {});
    s.privacy = normalizePrivacy(s.privacy); s.lock = normalizeLock(s.lock); s.compliance = normalizeComplianceSettings(s.compliance);
    s.reviews ??= [];
    return s;
  };
  let locked = normalizeLock(store.data.security?.lock).enabled, failures = 0, lockedUntil = 0, cli = null;
  const log = (kind, action, target = '', detail = '') => audit?.record({kind, action, target, detail, via: 'app'}).catch(() => {});
  async function plainBackups() {
    if (!dir) return [];
    try { return (await readdir(dir)).filter(f => /^workspace\.(plain-backup|before-restore)-\d+\.json$/.test(f)).sort(); } catch { return []; }
  }

  async function view() {
    const s = st();
    return {locked, privacy: s.privacy, lock: {enabled: s.lock.enabled, idleMinutes: s.lock.idleMinutes, touchId: s.lock.touchId, onSleep: s.lock.onSleep, touchIdAvailable: !!touchId.can()},
      encryption: {enabled: !!vault?.encrypted, available: !!vault, plainBackups: await plainBackups(), lastBackup: s.lastBackup || null},
      compliance: s.compliance, reviews: s.reviews.slice(0, 20), audit: {count: audit?.count || 0, broken: audit?.broken || null, lastVerify: s.lastVerify || null},
      egress: egress ? {hosts: egress.summary().slice(0, 30), size: egress.size} : null, cli: cli ? await cli.view().catch(e => ({error: String(e?.message || e)})) : null};
  }
  function lock(reason = '手动锁定') { const s = st(); if (!s.lock.enabled || locked) return false; locked = true; log('security', '锁定 QuanK', '', reason); notify(); return true; }
  async function unlock(how, password) {
    const s = st();
    if (!locked) return {locked: false};
    if (now() < lockedUntil) throw new Error(`尝试次数过多，请 ${Math.ceil((lockedUntil - now()) / 1000)} 秒后再试`);
    if (how === 'touchid') {
      if (!s.lock.touchId || !touchId.can()) throw new Error('触控 ID 不可用，请输入解锁密码');
      await touchId.prompt(`解锁 ${appName}`);
    } else if (!verifyPassword(password, s.lock.passwordHash)) {
      failures++; if (failures >= 5) { lockedUntil = now() + 30e3 * 2 ** Math.min(4, failures - 5); }
      log('security', '解锁失败', '', `第 ${failures} 次`); throw new Error('密码不对');
    }
    failures = 0; locked = false; log('security', '解锁 QuanK', '', how === 'touchid' ? '触控 ID' : '密码'); notify();
    return {locked: false};
  }

  async function exportBackup(passphrase) {
    if (!saveFile) throw new Error('当前环境不能保存文件');
    checkPassphrase(passphrase);
    let auditText = ''; try { auditText = await readFile(audit.file, 'utf8'); } catch {}
    const d = store.data, counts = {chats: (d.chats || []).length, holdings: (d.portfolio?.manual || []).length, notes: (d.research?.library || []).length, auditEntries: audit?.count || 0};
    const text = sealBackup({workspace: d, audit: auditText, app: appName}, passphrase, {app: appName, counts});
    const day = new Date(now() + 8 * 3600e3).toISOString().slice(0, 10);
    const file = await saveFile({title: '保存加密备份', defaultName: `QuanK-备份-${day}.qkbackup`, filters: [{name: 'QuanK 加密备份', extensions: ['qkbackup']}]});
    if (!file) return {cancelled: true};
    await writeFile(file, text, {mode: 0o600});
    st().lastBackup = {time: now(), name: path.basename(file), counts}; await store.save(); log('export', '导出加密备份', path.basename(file), `对话 ${counts.chats} · 手动持仓 ${counts.holdings} · 资料 ${counts.notes}`); notify();
    return {saved: path.basename(file), counts};
  }
  async function inspectBackup(passphrase) {
    if (!openFile) throw new Error('当前环境不能选择文件');
    const file = await openFile({title: '选择 QuanK 加密备份', filters: [{name: 'QuanK 加密备份', extensions: ['qkbackup']}]});
    if (!file) return {cancelled: true};
    const r = openBackup(await readFile(file, 'utf8'), passphrase);
    pending = {file, payload: r.payload, at: now()};
    return {file: path.basename(file), created: r.created, counts: r.counts};
  }
  let pending = null;
  /** Remember a compliance review (from research render or a manual check). */
  async function noteReview(r, {title = '', kind = '', documentId = ''} = {}) {
    const s = st();
    s.reviews = [{time: now(), title: clip(title, 80), kind, documentId, level: r.level, counts: r.counts, findings: r.findings.slice(0, 20).map(f => ({rule: f.rule, level: f.level, label: f.label, match: f.match, where: f.where}))}, ...s.reviews].slice(0, 50);
    log('export', '合规检查', clip(title, 60), describeReview(r));
    await store.save?.();
  }
  async function restoreBackup() {
    if (!pending || now() - pending.at > 10 * 60e3) throw new Error('请先选择备份文件并输入密码');
    const day = new Date(now() + 8 * 3600e3).toISOString().slice(0, 19).replace(/[-:T]/g, '');
    if (dir) { const before = path.join(dir, `workspace.before-restore-${day}.json`); await writeFile(before, JSON.stringify(store.data), {mode: 0o600}); }
    const keepSecurity = store.data.security;
    store.data = pending.payload.workspace;
    store.data.security = {...(store.data.security || {}), lock: keepSecurity?.lock || store.data.security?.lock};
    await store.save();
    await log('security', '从加密备份恢复', pending.file ? path.basename(pending.file) : '', '恢复前的数据已另存为 before-restore 文件，QuanK 将重新启动');
    pending = null;
    setTimeout(() => relaunch(), 300);
    return {restored: true, relaunch: true};
  }

  return {
    view, lock, unlock, get locked() { return locked; },
    /** [v0.51] the quank command-line controller from main */
    attachCli(c) { cli = c; },
    /** Synchronous bits for the app state (banners, the security page header). */
    summary() { const s = st(); return {privacy: s.privacy, lockEnabled: s.lock.enabled, encrypted: !!vault?.encrypted, complianceEnabled: s.compliance.enabled, block: s.compliance.block}; },
    /** What the lock screen may show. */
    lockState() { const s = st(); return {appName, touchId: s.lock.touchId && !!touchId.can(), retryIn: Math.max(0, Math.ceil((lockedUntil - now()) / 1000))}; },
    privacy: () => st().privacy, compliance: () => st().compliance,
    /** Called from main's 1-second timer. */
    tick() { const s = st(); if (s.lock.enabled && !locked && s.lock.idleMinutes > 0 && idleSeconds() >= s.lock.idleMinutes * 60) lock(`闲置 ${s.lock.idleMinutes} 分钟自动锁定`); },
    onSleep() { const s = st(); if (s.lock.enabled && s.lock.onSleep) lock('系统锁屏或睡眠'); },
    noteReview,
    async handle(p = {}) {
      const a = p.action, s = st();
      if (a === 'view') return view();
      if (a === 'unlock') return unlock(p.method === 'touchid' ? 'touchid' : 'password', p.password);
      if (locked) throw new Error('QuanK 已锁定，请先解锁');
      if (a === 'lock') { if (!s.lock.enabled) throw new Error('还没有设置应用锁'); lock(); return {locked: true}; }
      if (a === 'privacy') {
        const before = s.privacy, next = normalizePrivacy({...before, ...Object.fromEntries(['offline', 'maskAmounts', 'egressLog'].filter(k => typeof p[k] === 'boolean').map(k => [k, p[k]]))});
        s.privacy = next; await store.save(); notify();
        const ch = ['offline', 'maskAmounts', 'egressLog'].filter(k => before[k] !== next[k]).map(k => `${{offline: '离线模式', maskAmounts: '发给模型前隐藏金额', egressLog: '外发记录'}[k]}${next[k] ? '开启' : '关闭'}`);
        if (ch.length) log('security', '修改隐私与外发设置', '', ch.join('，'));
        return {privacy: next};
      }
      if (a === 'egressList') return {items: egress ? egress.list({host: p.host, limit: p.limit || 300}) : [], hosts: egress ? egress.summary() : []};
      if (a === 'egressClear') { egress?.clear(); log('security', '清空外发记录'); return {cleared: true}; }
      if (a === 'auditList') return {items: audit.list({kind: p.kind, q: p.q, limit: p.limit || 300}), kinds: KIND_LABELS};
      if (a === 'auditVerify') { const r = await audit.verify(); s.lastVerify = {time: now(), ok: r.ok, total: r.total, reason: r.reason || ''}; await store.save(); notify(); return r; }
      if (a === 'auditExport') {
        if (!saveFile) throw new Error('当前环境不能保存文件');
        const rows = audit.list({kind: p.kind, q: p.q, limit: 1000}).reverse();
        const file = await saveFile({title: '导出操作审计', defaultName: `QuanK-审计日志-${new Date(now() + 8 * 3600e3).toISOString().slice(0, 10)}.csv`, filters: [{name: 'CSV', extensions: ['csv']}]});
        if (!file) return {cancelled: true};
        await writeFile(file, audit.csv(rows), {mode: 0o600}); log('export', '导出操作审计', path.basename(file), `${rows.length} 条`);
        return {saved: path.basename(file), rows: rows.length};
      }
      if (a === 'lockSettings') {
        const next = {...s.lock};
        if (typeof p.password === 'string' && p.password) { checkPassphrase(p.password, {min: 6}); next.passwordHash = hashPassword(p.password); }
        if (typeof p.enabled === 'boolean') { if (p.enabled && !next.passwordHash) throw new Error('开启应用锁前请先设置解锁密码（触控 ID 不可用时用它解锁）'); next.enabled = p.enabled; }
        if (p.idleMinutes !== undefined) { if (!IDLE_CHOICES.includes(Number(p.idleMinutes))) throw new Error('闲置时间可选 不自动锁定 / 5 / 10 / 15 / 30 / 60 分钟'); next.idleMinutes = Number(p.idleMinutes); }
        for (const k of ['touchId', 'onSleep']) if (typeof p[k] === 'boolean') next[k] = p[k];
        if (s.lock.enabled && !next.enabled && !verifyPassword(p.current, s.lock.passwordHash)) throw new Error('关闭应用锁需要输入当前解锁密码');
        s.lock = normalizeLock(next); await store.save(); notify();
        log('security', '修改应用锁', '', `${s.lock.enabled ? '开启' : '关闭'}${s.lock.enabled ? `，闲置 ${s.lock.idleMinutes || '不'} 分钟自动锁定${s.lock.touchId ? '，触控 ID' : ''}` : ''}${p.password ? '，更新了解锁密码' : ''}`);
        return {lock: (await view()).lock};
      }
      if (a === 'encrypt') {
        if (!vault) throw new Error('当前环境不支持本机加密');
        const r = p.enabled ? await vault.enable(store) : await vault.disable(store);
        log('security', p.enabled ? '开启本机数据加密' : '关闭本机数据加密', '', r.backup ? `已保留一份未加密的迁移前备份：${path.basename(r.backup)}` : ''); notify();
        return {...r, backup: r.backup ? path.basename(r.backup) : null};
      }
      if (a === 'deletePlainBackups') { const list = await plainBackups(); for (const f of list) await rm(path.join(dir, f), {force: true}); log('security', '删除未加密的备份副本', '', `${list.length} 个文件`); notify(); return {deleted: list.length}; }
      if (a === 'backupExport') return exportBackup(p.passphrase);
      if (a === 'backupInspect') return inspectBackup(p.passphrase);
      if (a === 'backupRestore') return restoreBackup();
      if (a === 'compliance') { s.compliance = parseComplianceSettings(p.settings || {}, s.compliance); await store.save(); notify(); log('security', '修改合规设置', '', `${s.compliance.enabled ? '导出前检查' : '不检查'}${s.compliance.block ? '，有必须修改项时阻止导出' : ''}`); return {compliance: s.compliance}; }
      if (a === 'review') { const r = reviewText(p.text, {kind: ['report', 'article', 'text'].includes(p.kind) ? p.kind : 'article', aiUsed: p.aiUsed === true, settings: s.compliance}); if (p.record !== false) await noteReview(r, {title: p.title || clip(p.text, 30), kind: p.kind || 'article'}); notify(); return r; }
      if (a === 'cliEnable' || a === 'cliInstall' || a === 'cliUninstall') {
        if (!cli) throw new Error('当前环境不支持命令行');
        const r = a === 'cliEnable' ? await cli.enable(p.enabled === true) : a === 'cliInstall' ? await cli.install() : await cli.uninstall();
        log('security', a === 'cliEnable' ? (p.enabled ? '开启 quank 命令行' : '关闭 quank 命令行') : a === 'cliInstall' ? '安装 quank 命令' : '卸载 quank 命令', '', a === 'cliInstall' ? String(r.bin || '') : '');
        notify(); return r;
      }
      if (a === 'secrets') return secretsView();
      if (a === 'testModel') { if (!testModel) throw new Error('当前环境不能测试模型'); const r = await testModel(); log('model', '测试默认模型密钥', r.host || '', r.ok ? '可用' : `失败：${r.status || ''} ${r.message || ''}`); return r; }
      throw new Error('未知的安全操作');
    },
  };
}
