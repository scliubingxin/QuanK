// [F5] 合规安全: compliance review (M4), privacy & egress (M2), audit chain (M3), vault / encrypted store / backups /
// app lock (M1), the security service, research export hook, chat tools, UI and wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { JSDOM } from 'jsdom';
import * as C from '../src/shared/compliance.js';
import { maskAmounts, shouldMask, purposeOf, isLoopback, safeUrl, normalizePrivacy } from '../src/shared/privacy.js';
import { createAuditLog, auditOf, summarizePayload, entryHash, GENESIS } from '../services/audit.mjs';
import { createEgressMonitor } from '../services/egress.mjs';
import { createVault, encryptBytes, decryptBytes, isEncrypted, sealBackup, openBackup, hashPassword, verifyPassword, checkPassphrase } from '../services/vault.mjs';
import { createSecurityService } from '../services/security.mjs';
import { createResearchService } from '../services/research.mjs';
import { Store } from '../core.mjs';
import { executeAppTool, appToolDefinitions, APP_INTENT } from '../services/app-tools.mjs';
import { securityUI } from '../src/ui/security.js';
import { NAV_LAYOUT } from '../src/ui/sidebar.js';

const tmp = () => mkdtemp(path.join(tmpdir(), 'qk-f5-'));
// a stand-in for safeStorage: XOR with a fixed pad (the tests only need seal/unseal to round-trip and fail when swapped)
const pad = randomBytes(64), fakeSeal = b => Buffer.from(Buffer.from(b).map((x, i) => x ^ pad[i % 64])), fakeUnseal = b => Buffer.from(Buffer.from(b).map((x, i) => x ^ pad[i % 64]));

test('M4 compliance: prohibited wording, missing notes, standard notes, settings', () => {
  const r = C.reviewText('通威股份目标价必达 30 元，现在赶紧上车，稳赚不赔！这是内部消息。', {kind: 'article'});
  const rules = r.findings.map(f => f.rule);
  for (const id of ['guarantee', 'certain', 'inducement', 'insider', 'disclaimer', 'nosource', 'nodate']) assert.ok(rules.includes(id), id);
  assert.equal(r.ok, false); assert.equal(r.level, 'high');
  assert.equal(r.findings.find(f => f.rule === 'guarantee').match, '稳赚不赔');
  assert.match(r.findings.find(f => f.rule === 'certain').excerpt, /目标价必达/);
  const clean = C.reviewText('据东方财富公告，2026-10-30 三季报营收 583 亿元，同比下降 9.7%。仅供研究，不构成投资建议。', {kind: 'article'});
  assert.equal(clean.level, 'ok', JSON.stringify(clean.findings));
  assert.equal(C.reviewText('市场有风险', {kind: 'text'}).level, 'ok');
  assert.ok(C.reviewText('本文 AI 研判如下', {kind: 'text', aiUsed: true}).findings.some(f => f.rule === 'ailabel'));
  assert.ok(C.reviewText('建议梭哈', {settings: {extraTerms: ['梭哈']}}).findings.some(f => f.rule.startsWith('custom')));
  const spec = {title: '通威股份研究报告 · 2026-11-21', summary: '综合分 62', sections: [{id: 'ai', title: 'AI 研判', paragraphs: ['短期一定反弹']}, {id: 'data', title: '行情', paragraphs: ['数据来自东方财富']}], disclaimer: '旧的声明'};
  const rv = C.reviewSpec(spec);
  assert.equal(rv.aiUsed, true); assert.equal(rv.findings.find(f => f.rule === 'certain').where, 'AI 研判');
  const s2 = C.applyStandardNotes(spec), s3 = C.applyStandardNotes(s2);
  assert.equal(s2.disclaimer, C.DEFAULT_DISCLAIMER);
  assert.deepEqual(s2.sections.at(-1), {id: 'compliance-notes', title: '风险提示', bullets: [...C.DEFAULT_RISK_NOTES, C.AI_LABEL]});
  assert.equal(s3.sections.length, s2.sections.length, 'idempotent');
  const after = C.reviewSpec(s2);
  assert.ok(!after.findings.some(f => ['disclaimer', 'ailabel'].includes(f.rule)), 'notes fix the auto findings');
  assert.match(C.describeReview(after), /1 处必须修改/);
  const set = C.parseComplianceSettings({block: 'on', riskNotes: '甲\n\n乙', extraTerms: '梭哈，翻倍票, x', disclaimer: ''});
  assert.deepEqual([set.block, set.riskNotes, set.extraTerms, set.disclaimer], [true, ['甲', '乙'], ['梭哈', '翻倍票'], C.DEFAULT_DISCLAIMER]);
  assert.throws(() => C.parseComplianceSettings({disclaimer: 'x'.repeat(700)}), /600 字/);
});

test('M2 privacy: host purposes, loopback, safe URLs, masking amounts for the model', () => {
  assert.equal(purposeOf('push2.eastmoney.com'), '行情与公告（东方财富）');
  assert.equal(purposeOf('api.deepseek.com'), '大模型');
  assert.equal(purposeOf('127.0.0.1'), '本机服务'); assert.ok(isLoopback('localhost')); assert.ok(!isLoopback('10.0.0.1'));
  assert.deepEqual(safeUrl('https://u:p@api.deepseek.com/v1/chat?key=abc'), {host: 'api.deepseek.com', path: '/v1/chat', protocol: 'https'});
  const out = {total: 215905, positions: [{code: '600519', name: '贵州茅台', shares: 100, cost: 1500, price: 1485.75, value: 148575, weight: 68.81, pnlPct: -0.95, pnl: -1425}], lossIfMarketDown10: {before: -1, after: -2}, note: 'x'};
  const m = maskAmounts(out);
  assert.deepEqual(m.result.positions[0], {code: '600519', name: '贵州茅台', shares: '***', cost: '***', price: 1485.75, value: '***', weight: 68.81, pnlPct: -0.95, pnl: '***'});
  assert.equal(m.result.total, '***'); assert.equal(m.result.lossIfMarketDown10, '***'); assert.equal(m.masked, 6);
  assert.ok(shouldMask('app_pf_overview', {maskAmounts: true})); assert.ok(!shouldMask('app_pf_overview', {})); assert.ok(!shouldMask('app_market_quote', {maskAmounts: true}));
  assert.deepEqual(normalizePrivacy(null), {offline: false, maskAmounts: false, egressLog: true});
});

test('M3 audit: hash chain, verify, tampering and deletion detected, filtering, CSV', async () => {
  const dir = await tmp(); let t = 1_700_000_000_000;
  const log = createAuditLog({dir, now: () => t++});
  const e1 = await log.record({kind: 'rules', action: 'portfolio.rules', target: '', detail: 'x'});
  await log.record({kind: 'trade', action: 'quant.record', target: '600438', detail: 'side=buy'});
  await Promise.all([log.record({kind: 'export', action: 'a'}), log.record({kind: 'export', action: 'b'})]);
  assert.equal(e1.prev, GENESIS); assert.equal(e1.hash, entryHash(GENESIS, e1)); assert.equal(log.count, 4);
  assert.deepEqual(await log.verify().then(r => [r.ok, r.total]), [true, 4]);
  assert.deepEqual(log.list({kind: 'export'}).map(e => e.action), ['b', 'a']);
  assert.deepEqual(log.list({q: '600438'}).map(e => e.seq), [2]);
  const again = createAuditLog({dir, now: () => t++}); await again.load(); assert.equal(again.count, 4);
  await again.record({kind: 'data', action: 'after reload'}); assert.equal((await again.verify()).ok, true);
  const lines = (await readFile(again.file, 'utf8')).trim().split('\n');
  const edited = lines.map((l, i) => i === 1 ? l.replace('600438', '600519') : l).join('\n') + '\n';
  await writeFile(again.file, edited); let r = await again.verify();
  assert.deepEqual([r.ok, r.line, r.reason], [false, 2, '内容与校验值不符（记录被修改过）']);
  await writeFile(again.file, [lines[0], ...lines.slice(2)].join('\n') + '\n'); r = await again.verify();
  assert.equal(r.ok, false); assert.match(r.reason, /接不上/);
  const csv = log.csv([{seq: 1, time: 0, kind: 'data', action: '=cmd()', target: 'a,b', detail: '', via: 'app', hash: 'h'}]);
  assert.ok(csv.startsWith('\ufeff序号')); assert.match(csv, /"'=cmd\(\)"/); assert.match(csv, /"a,b"/);
  assert.equal(summarizePayload({action: 'rules', code: '600438', apiKey: 'sk-1', rules: {stopLoss: 8}}), 'action=rules code=600438 字段：rules 含密钥字段（未记录）');
  assert.equal(auditOf('portfolio', {action: 'overview'}), null);
  assert.equal(auditOf('portfolio', {action: 'rules'}).kind, 'rules');
  assert.equal(auditOf('portfolio', {action: 'report'}).kind, 'export');
  assert.equal(auditOf('quant', {action: 'record', code: '600438'}).kind, 'trade');
  assert.equal(auditOf('market', {action: 'kline'}), null); assert.equal(auditOf('market', {action: 'addAlert'}).kind, 'data');
  assert.equal(auditOf('chat', {}), null); assert.equal(auditOf('security', {action: 'privacy'}), null, 'the security service logs its own actions');
  await rm(dir, {recursive: true, force: true});
});

test('M2 egress: records host / path without query, offline mode blocks non-local hosts', async () => {
  let privacy = {}; const seen = [];
  const eg = createEgressMonitor({privacy: () => privacy, onRequest: e => seen.push(e.purpose)});
  const f = eg.wrap(async (u, init) => ({status: String(u).includes('bad') ? 500 : 200}));
  await f('https://push2.eastmoney.com/api/qt/stock/get?secid=1.600438&token=x');
  await f('https://api.deepseek.com/v1/chat/completions', {method: 'POST', body: JSON.stringify({a: '中文'})});
  await f('http://127.0.0.1:8123/api/signal');
  const items = eg.list();
  assert.equal(items.length, 2, 'loopback is not logged');
  assert.deepEqual([items[0].host, items[0].method, items[0].purpose, items[0].bytesOut], ['api.deepseek.com', 'POST', '大模型', Buffer.byteLength(JSON.stringify({a: '中文'}))]);
  assert.equal(items[1].path, '/api/qt/stock/get'); assert.ok(!JSON.stringify(items).includes('token'));
  assert.deepEqual(seen, ['行情与公告（东方财富）', '大模型']);
  privacy = {offline: true};
  await assert.rejects(f('https://push2.eastmoney.com/x'), e => e.code === 'QK_OFFLINE' && /离线模式/.test(e.message));
  assert.equal((await f('http://localhost:1/x')).status, 200, 'local engine still works');
  assert.equal(eg.summary().find(h => h.host === 'push2.eastmoney.com').blocked, 1);
  const g = {fetch: async () => ({status: 204})}; eg.install(g); const once = g.fetch; eg.install(g); assert.equal(g.fetch, once, 'installs once');
  privacy = {egressLog: false}; eg.clear(); await f('https://x.eastmoney.com/'); assert.equal(eg.size, 0);
});

test('M1 vault: AES-GCM, encrypted Store, enable keeps a plaintext copy, disable, wrong key, backups, passwords', async () => {
  const k = randomBytes(32), enc = encryptBytes('持仓 600519', k);
  assert.ok(isEncrypted(enc)); assert.equal(decryptBytes(enc, k).toString(), '持仓 600519');
  assert.throws(() => decryptBytes(enc, randomBytes(32)), /解密失败/);
  const dir = await tmp();
  const s1 = new Store(dir); await s1.load(); s1.data.portfolio = {manual: [{code: '600519', shares: 100, cost: 1500}]}; await s1.save();
  const v1 = createVault({dir, seal: fakeSeal, unseal: fakeUnseal, now: () => Date.UTC(2026, 10, 21, 14)});
  await v1.prepare(); s1.codec = v1.codec;
  const r = await v1.enable(s1);
  assert.ok(r.backup.endsWith('workspace.plain-backup-20261121220000.json'));
  const raw = await readFile(path.join(dir, 'workspace.json'));
  assert.ok(isEncrypted(raw)); assert.ok(!raw.includes(Buffer.from('600519')));
  assert.match(await readFile(r.backup, 'utf8'), /600519/);
  const s2 = new Store(dir), v2 = createVault({dir, seal: fakeSeal, unseal: fakeUnseal}); assert.deepEqual(await v2.prepare(), {encrypted: true}); s2.codec = v2.codec; await s2.load();
  assert.equal(s2.data.portfolio.manual[0].code, '600519'); assert.ok(v2.encrypted);
  s2.data.x = 1; await s2.save(); assert.ok(isEncrypted(await readFile(path.join(dir, 'workspace.json'))));
  const bad = createVault({dir, seal: fakeSeal, unseal: () => { throw new Error('keychain'); }});
  await assert.rejects(bad.prepare(), /无法从钥匙串读取密钥/);
  const s3 = new Store(dir); await assert.rejects(s3.load(), /没有找到钥匙串里的密钥|不支持|JSON/);
  await v2.disable(s2);
  assert.ok(!isEncrypted(await readFile(path.join(dir, 'workspace.json'))));
  assert.ok(!(await readdir(dir)).includes('workspace.key'));
  const back = sealBackup({workspace: {schema: 1, chats: [1], note: 'SECRET-MARK'}, audit: 'a'}, 'correct horse', {counts: {chats: 1}});
  assert.ok(!back.includes('SECRET-MARK'));
  assert.deepEqual(openBackup(back, 'correct horse').payload.workspace.chats, [1]);
  assert.throws(() => openBackup(back, 'wrong pass'), /密码不对/);
  assert.throws(() => openBackup('{}', 'x'), /不是 QuanK 备份/);
  assert.throws(() => checkPassphrase('1234567'), /至少 8 位/); assert.throws(() => checkPassphrase('11111111'), /太简单/);
  const h = hashPassword('lock-me-1'); assert.ok(verifyPassword('lock-me-1', h)); assert.ok(!verifyPassword('lock-me-2', h)); assert.ok(!verifyPassword('x', 'junk'));
  await rm(dir, {recursive: true, force: true});
});

function secHarness({encrypted = false} = {}) {
  const store = {data: {schema: 1, chats: [{id: 'c'}], portfolio: {manual: [{code: '600519'}]}, research: {library: []}}, saves: 0, async save() { this.saves++; }};
  const records = [], audit = {count: 0, broken: null, file: '/nonexistent/audit.jsonl', async record(e) { records.push(e); this.count++; return e; }, list: () => records.map((e, i) => ({...e, seq: i + 1, time: i})), verify: async () => ({ok: true, total: records.length}), csv: rows => `rows:${rows.length}`};
  let t = 1_700_000_000_000, idle = 0, relaunched = 0, saved = null; const files = {};
  const sec = createSecurityService({store, audit, egress: createEgressMonitor(), vault: {encrypted, enable: async () => ({encrypted: true, backup: '/x/workspace.plain-backup-1.json'}), disable: async () => ({encrypted: false})}, now: () => t, idleSeconds: () => idle,
    saveFile: async ({defaultName}) => (saved = `/tmp/${defaultName}`), openFile: async () => '/tmp/b.qkbackup', relaunch: () => relaunched++, testModel: async () => ({ok: false, status: 401, host: 'api.deepseek.com', message: '密钥无效'})});
  return {sec, store, records, setIdle: v => { idle = v; }, tick: ms => { t += ms; }, get relaunched() { return relaunched; }, get saved() { return saved; }};
}

test('security service: lock settings, lock / unlock, backoff, idle lock, privacy and compliance audited', async () => {
  const h = secHarness(), S = h.sec;
  assert.equal(S.locked, false);
  await assert.rejects(S.handle({action: 'lockSettings', enabled: true}), /先设置解锁密码/);
  await assert.rejects(S.handle({action: 'lockSettings', enabled: true, password: '123'}), /至少 6 位/);
  await S.handle({action: 'lockSettings', enabled: true, password: 'lock-me-1', idleMinutes: 5});
  assert.ok(h.store.data.security.lock.passwordHash.startsWith('scrypt$')); assert.ok(!JSON.stringify(h.store.data).includes('lock-me-1'));
  h.setIdle(299); S.tick(); assert.equal(S.locked, false);
  h.setIdle(300); S.tick(); assert.equal(S.locked, true);
  await assert.rejects(S.handle({action: 'privacy', offline: true}), /已锁定/);
  assert.equal((await S.handle({action: 'view'})).locked, true);
  for (let i = 0; i < 5; i++) await assert.rejects(S.handle({action: 'unlock', password: 'nope'}), /密码不对/);
  await assert.rejects(S.handle({action: 'unlock', password: 'lock-me-1'}), /尝试次数过多/);
  h.tick(31e3);
  await S.handle({action: 'unlock', password: 'lock-me-1'}); assert.equal(S.locked, false);
  await assert.rejects(S.handle({action: 'unlock', method: 'touchid'}).then(() => S.lock()).then(() => S.handle({action: 'unlock', method: 'touchid'})), /触控 ID 不可用/);
  await S.handle({action: 'unlock', password: 'lock-me-1'});
  assert.deepEqual(S.lockState(), {appName: 'QuanK', touchId: false, retryIn: 0});
  await assert.rejects(S.handle({action: 'lockSettings', enabled: false, current: 'x'}), /当前解锁密码/);
  await S.handle({action: 'lockSettings', enabled: false, current: 'lock-me-1'}); assert.equal(S.summary().lockEnabled, false);
  S.onSleep(); assert.equal(S.locked, false, 'no lock when disabled');
  await S.handle({action: 'privacy', offline: true, maskAmounts: true});
  assert.deepEqual(S.privacy(), {offline: true, maskAmounts: true, egressLog: true});
  await S.handle({action: 'compliance', settings: {block: true}}); assert.equal(S.compliance().block, true);
  const r = await S.handle({action: 'review', text: '稳赚不赔', kind: 'text'});
  assert.equal(r.level, 'high'); assert.equal((await S.view()).reviews[0].findings[0].rule, 'guarantee');
  const actions = h.records.map(x => x.action);
  for (const a of ['修改应用锁', '锁定 QuanK', '解锁失败', '解锁 QuanK', '修改隐私与外发设置', '修改合规设置', '合规检查']) assert.ok(actions.includes(a), a);
  assert.match(h.records.find(x => x.action === '修改隐私与外发设置').detail, /离线模式开启，发给模型前隐藏金额开启/);
  assert.equal((await S.handle({action: 'testModel'})).status, 401);
  assert.ok(h.records.some(x => x.kind === 'model' && /失败：401/.test(x.detail)));
  const enc = await S.handle({action: 'encrypt', enabled: true}); assert.equal(enc.backup, 'workspace.plain-backup-1.json');
  const ex = await S.handle({action: 'auditExport'}); assert.ok(ex.rows > 5); assert.match(ex.saved, /^QuanK-审计日志-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('security service: encrypted backup export, inspect and restore (keeps the lock, relaunches)', async () => {
  const h = secHarness(), S = h.sec, dir = await tmp();
  await S.handle({action: 'lockSettings', enabled: true, password: 'lock-me-1', idleMinutes: 0});
  const r = await S.handle({action: 'backupExport', passphrase: 'backup-pass-1'});
  assert.deepEqual([r.counts.chats, r.counts.holdings, r.counts.notes], [1, 1, 0]);
  const text = await readFile(h.saved, 'utf8'); assert.ok(!text.includes('600519'));
  await writeFile('/tmp/b.qkbackup', text);
  await assert.rejects(S.handle({action: 'backupRestore'}), /先选择备份文件/);
  await assert.rejects(S.handle({action: 'backupInspect', passphrase: 'wrong-pass'}), /密码不对/);
  const ins = await S.handle({action: 'backupInspect', passphrase: 'backup-pass-1'});
  assert.equal(ins.counts.chats, 1);
  const lockBefore = h.store.data.security.lock;
  h.store.data.chats = []; h.store.data.portfolio.manual = [];
  const out = await S.handle({action: 'backupRestore'});
  assert.equal(out.relaunch, true); assert.equal(h.store.data.chats.length, 1); assert.equal(h.store.data.portfolio.manual[0].code, '600519');
  assert.equal(h.store.data.security.lock.passwordHash, lockBefore.passwordHash);
  await new Promise(r2 => setTimeout(r2, 350)); assert.equal(h.relaunched, 1);
  assert.ok(h.records.some(x => x.action === '从加密备份恢复'));
  await rm(dir, {recursive: true, force: true});
});

test('research export: standard notes, review recorded, blocking findings stop the export', async () => {
  const notes = [], imported = [];
  const documents = {importFile: async (name, format, bytes) => { imported.push({name, format, size: bytes.length}); return {document: {id: 'd' + imported.length, name}}; }};
  let settings = C.normalizeComplianceSettings({});
  const svc = createResearchService({store: {data: {}, save: async () => {}}, documents, compliance: {settings: () => settings, note: async (r, m) => notes.push({r, m})}});
  const spec = {kind: 'topic', title: '研究主题周报：光伏 · 2026-11-21', date: '2026-11-21', summary: '本期 3 条', sections: [{id: 's', title: '相关公告', bullets: ['据上交所公告，某公司减产']}]};
  const out = await svc.handle({action: 'render', spec, format: 'html'});
  assert.equal(out.document.compliance.level, 'ok'); assert.equal(notes[0].m.documentId, 'd1');
  settings = C.normalizeComplianceSettings({block: true});
  const bad = {...spec, sections: [{id: 's', title: '观点', paragraphs: ['这只股票稳赚不赔，目标价必达']}]};
  await assert.rejects(svc.handle({action: 'render', spec: bad, format: 'html'}), e => e.code === 'QK_COMPLIANCE' && /已阻止导出/.test(e.message) && /稳赚不赔/.test(e.message));
  assert.equal(imported.length, 1, 'nothing written'); assert.equal(notes.at(-1).r.level, 'high');
  settings = C.normalizeComplianceSettings({block: false});
  const warn = await svc.handle({action: 'render', spec: bad, format: 'html'});
  assert.equal(warn.document.compliance.level, 'high'); assert.match(warn.document.compliance.text, /必须修改/);
  const plain = createResearchService({store: {data: {}, save: async () => {}}, documents});
  assert.equal((await plain.handle({action: 'render', spec, format: 'html'})).document.compliance, undefined, 'no compliance dep: unchanged');
});

test('chat tools: new tools, masking, audit of writes, compliance check, intent', async () => {
  const names = appToolDefinitions().map(d => d.function.name);
  for (const n of ['app_sec_status', 'app_audit_list', 'app_egress_list', 'app_compliance_check']) assert.ok(names.includes(n), n);
  const records = [], h = secHarness();
  const portfolio = {handle: async p => ({summary: {total: 215905, invested: 181905, cash: 34000, cost: 190500, pnl: -8595, pnlPct: -4.51, dayPnl: 1715, stockPct: 84.25, effective: 1.43, positions: [{code: '600519', name: '贵州茅台', shares: 100, cost: 1500, price: 1485.75, value: 148575, weight: 68.81, pnl: -1425, pnlPct: -0.95, dayPct: 1.75, industry: '食品饮料', source: 'manual'}], byIndustry: []}, breaches: [], rulesText: ''}), view: () => ({rules: {}, manual: []})};
  let privacy = {maskAmounts: true};
  const deps = {portfolio, security: h.sec, audit: {record: async e => records.push(e)}, privacy: () => privacy, market: {handle: async () => ({code: '600519'})}, notify() {}};
  const run = (n, a, yes = true) => executeAppTool(n, a, {store: {data: {}}, deps, ask: async () => yes, chatId: 'c1'});
  let r = await run('app_pf_overview', {});
  assert.equal(r.total, '***'); assert.equal(r.positions[0].shares, '***'); assert.equal(r.positions[0].price, 1485.75); assert.equal(r.positions[0].weight, 68.81); assert.match(r.privacy, /已按隐私设置隐藏/);
  privacy = {}; r = await run('app_pf_overview', {}); assert.equal(r.total, 215905); assert.equal(r.privacy, undefined);
  assert.equal(records.length, 0, 'reads are not audited');
  r = await run('app_pf_holding_save', {query: '600519', shares: 100, cost: 1500}, false);
  assert.equal(r.status, 'denied');
  assert.deepEqual([records[0].action, records[0].detail, records[0].via, records[0].target], ['app_pf_holding_save', '对话指令 · 用户未确认，未执行', 'chat', '600519']);
  r = await run('app_compliance_check', {text: '闭眼买，稳赚', kind: 'text'});
  assert.equal(r.level, 'high'); assert.ok(r.findings.some(f => f.issue === '承诺保本或收益'));
  r = await run('app_sec_status', {}); assert.equal(r.status, 'succeeded'); assert.equal(r.encrypted, false);
  r = await run('app_audit_list', {limit: 5}); assert.ok(Array.isArray(r.items));
  r = await run('app_egress_list', {}); assert.ok(Array.isArray(r.hosts));
  for (const q of ['帮我检查一下这篇文章合不合规', '这段话能不能发', '看看操作记录', '开离线模式']) assert.ok(APP_INTENT.test(q), q);
});

test('UI: page, overview cards, forms, lock screen, lazy tabs', async () => {
  const heading = (k, t, d, b, s) => `<h1>${t}</h1>${b}${(s || []).map(x => x.join('')).join('')}`;
  const page = securityUI.securityPage({security: {encrypted: false, lockEnabled: false, privacy: {}}}, {heading});
  assert.match(page, /id="securityBox"/); assert.match(page, /data-sec="audit"/); assert.match(page, /未加密本机数据/);
  const h = secHarness(), v = await h.sec.view();
  const ov = securityUI.overviewHtml({...v, encryption: {...v.encryption, plainBackups: ['workspace.plain-backup-1.json']}});
  assert.match(ov, /data-action="secEncrypt" data-id="on"/); assert.match(ov, /data-action="secDeletePlain"/); assert.match(ov, /data-action="secPrivacy" data-id="offline:on"/);
  assert.match(securityUI.keysHtml({models: [{name: 'DeepSeek', host: 'api.deepseek.com', model: 'deepseek-chat', keySaved: true}], engine: {ai: 'willbuddy', host: 'api.deepseek.com', model: 'deepseek-chat', configFile: '/x/config.json'}}), /测试默认模型密钥/);
  assert.match(securityUI.testResultHtml({ok: false, host: 'api.deepseek.com', status: 401, message: '密钥无效'}), /HTTP 401/);
  assert.match(securityUI.egressHtml({hosts: [{host: 'api.deepseek.com', purpose: '大模型', count: 2, blocked: 0, bytesOut: 2048, last: 1}], items: [{time: 1, host: 'api.deepseek.com', path: '/v1', method: 'POST', bytesOut: 10, status: 200}]}), /2\.0 KB/);
  assert.match(securityUI.auditHtml({items: [{seq: 1, time: 1, kind: 'rules', action: 'portfolio.rules', target: '', detail: 'x', via: 'chat'}]}, {lastVerify: {time: 1, ok: true, total: 1}}), /风控规则[\s\S]*对话[\s\S]*未被改动/);
  assert.match(securityUI.findingsHtml(C.reviewText('稳赚')), /必须修改/);
  const lf = new JSDOM(`<form>${securityUI.lockForm({touchIdAvailable: true})}</form>`).window;
  const f1 = lf.document.querySelector('form'); f1.querySelector('[name=enabled]').checked = true; f1.querySelector('[name=password]').value = 'lock-me-1';
  assert.deepEqual(securityUI.lockPayload(new lf.FormData(f1)), {action: 'lockSettings', enabled: true, password: 'lock-me-1', current: '', idleMinutes: 15, onSleep: true, touchId: true});
  const bf = new JSDOM(`<form>${securityUI.backupForm(false)}</form>`).window, f2 = bf.document.querySelector('form');
  f2.querySelector('[name=passphrase]').value = 'aaaaaaaa1'; f2.querySelector('[name=passphrase2]').value = 'aaaaaaaa2';
  assert.throws(() => securityUI.backupPayload(new bf.FormData(f2)), /不一致/);
  const cf = new JSDOM(`<form>${securityUI.complianceForm(C.normalizeComplianceSettings({}))}</form>`).window;
  assert.equal(securityUI.compliancePayload(new cf.FormData(cf.document.querySelector('form'))).settings.disclaimer, C.DEFAULT_DISCLAIMER);
  const ls = securityUI.lockScreen({appName: 'QuanK', touchId: true});
  assert.match(ls, /QuanK 已锁定/); assert.match(ls, /data-action="secUnlockTouch"/); assert.ok(!/持仓.*\d{3,}/.test(ls));
  const w = new JSDOM(`<body>${page}</body>`).window, calls = [];
  const call = async p => { calls.push(p.action); return {result: p.action === 'view' ? v : p.action === 'auditList' ? {items: []} : {}}; };
  securityUI.mountSecurity(w.document, call); await new Promise(r => setTimeout(r, 0));
  assert.match(w.document.querySelector('.sec-body').innerHTML, /本机数据加密/);
  w.document.querySelector('[data-sec="audit"]').click(); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(calls, ['view', 'view', 'auditList']); assert.match(w.document.querySelector('.sec-body').innerHTML, /没有符合条件的记录/);
  assert.ok(NAV_LAYOUT.find(n => n.group === 'capabilities').items.some(i => i[0] === 'security'));
});

test('wiring: main, preload, renderer', async () => {
  const read = f => readFile(new URL(f, import.meta.url), 'utf8');
  const [main, preload, app, core] = await Promise.all(['../main.mjs', '../preload.cjs', '../src/app.js', '../core.mjs'].map(read));
  assert.match(main, /egress\.install\(globalThis\)/);
  assert.ok(main.indexOf('egress.install(globalThis)') < main.indexOf('app.whenReady'), 'fetch is wrapped before any service is created');
  assert.ok(main.indexOf('await vault.prepare()') < main.indexOf('await store.load()'), 'codec ready before the store loads');
  assert.match(main, /const LOCK_OPEN = new Set\(\['state', 'security'\]\)/);
  assert.match(main, /if \(security\?\.locked\) return \{ locked: true, lock: security\.lockState\(\) \}/);
  assert.match(main, /register\('security'/); assert.match(main, /security\?\.tick\(\)/); assert.match(main, /powerMonitor\.on\('lock-screen'/);
  assert.match(main, /compliance: \{ settings: \(\) => security\?\.compliance\(\)/);
  assert.match(main, /security:_security,quant:_quant/);
  assert.match(preload, /'security'\]/);
  assert.match(app, /if \(state\.locked\) \{ \/\/ \[F5 M1\]/); assert.match(app, /\/\^sec\[A-Z\]\/\.test\(actionId\)/);
  for (const a of ['secUnlock', 'secUnlockTouch', 'secLock', 'secPrivacy', 'secAuditVerify', 'secAuditExport', 'secTestModel', 'secLockSettings', 'secEncrypt', 'secDeletePlain', 'secBackup', 'secRestore', 'secComplianceSettings', 'secReview']) assert.ok(app.includes(`'${a}'`), a);
  assert.match(core, /this\.codec \? this\.codec\.decode\(raw\)/);
});
