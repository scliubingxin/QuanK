import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { discoverAuth, signIn, refreshGrant, safeEndpoint, resourceMetadataHint, registerClient, loopback, pkcePair } from '../runtime/mcp-oauth.mjs';
import { StdioMcpClient, normalizeStdio, resolveCommand, describeStdio, parseEnvLines } from '../runtime/mcp-stdio.mjs';
import { McpClient } from '../runtime/mcp.mjs';
import { mcpUrl } from '../services/agent-profile.mjs';
import { createMcpClientFactory, mcpViews, mcpDescribe } from '../services/mcp-access.mjs';
import { createCapabilityLibrary } from '../services/capability-library.mjs';
import { mcpConnectScope } from '../services/approval-rules.mjs';
import { capabilityPresets } from '../runtime/capability-presets.mjs';
import { mcpPage } from '../src/ui/capability-library.js';
import { mcpForm, mcpPayload, parseEnvText } from '../src/ui/mcp-form.js';
import { executeAppTool, appToolDefinitions } from '../services/app-tools.mjs';
import { fixtureSecrets } from './helpers/mcp-secrets.mjs';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const listen = server => new Promise(r => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`)));
const body = req => new Promise(r => { let s = ''; req.on('data', d => { s += d; }); req.on('end', () => r(s)); });

/** A fake MCP server + OAuth authorization server on one loopback port. */
async function authServer({dcr = true, s256 = true} = {}) {
  const st = {codes: new Map(), tokens: new Set(['tok-1']), registered: [], tokenCalls: [], mcpCalls: []};
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'), json = (code, v, h = {}) => { res.writeHead(code, {'Content-Type': 'application/json', ...h}); res.end(JSON.stringify(v)); };
    if (u.pathname === '/mcp') {
      const auth = req.headers.authorization || '', raw = await body(req);
      st.mcpCalls.push(auth);
      if (!st.tokens.has(auth.replace('Bearer ', ''))) return json(401, {error: 'unauthorized'}, {'WWW-Authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`});
      const m = JSON.parse(raw || '{}');
      if (!m.id) { res.writeHead(202).end(); return; }
      if (m.method === 'initialize') return json(200, {jsonrpc: '2.0', id: m.id, result: {protocolVersion: '2025-11-25', capabilities: {}}});
      if (m.method === 'tools/list') return json(200, {jsonrpc: '2.0', id: m.id, result: {tools: [{name: 'quote', description: 'q', inputSchema: {type: 'object'}}]}});
      return json(200, {jsonrpc: '2.0', id: m.id, result: {content: [{type: 'text', text: 'ok'}]}});
    }
    if (u.pathname === '/.well-known/oauth-protected-resource/mcp') return json(200, {resource: base + '/mcp', authorization_servers: [base + '/as'], scopes_supported: ['read']});
    if (u.pathname === '/.well-known/oauth-authorization-server/as') return json(200, {issuer: base + '/as', authorization_endpoint: base + '/as/authorize', token_endpoint: base + '/as/token', ...(dcr ? {registration_endpoint: base + '/as/register'} : {}), code_challenge_methods_supported: s256 ? ['S256'] : ['plain']});
    if (u.pathname === '/as/register') { const v = JSON.parse(await body(req)); st.registered.push(v); return json(201, {client_id: 'client-' + st.registered.length}); }
    if (u.pathname === '/as/authorize') {
      const code = 'code-' + Math.random().toString(36).slice(2);
      st.codes.set(code, {challenge: u.searchParams.get('code_challenge'), resource: u.searchParams.get('resource'), client: u.searchParams.get('client_id'), redirect: u.searchParams.get('redirect_uri'), scope: u.searchParams.get('scope'), method: u.searchParams.get('code_challenge_method')});
      const back = new URL(u.searchParams.get('redirect_uri')); back.searchParams.set('code', code); back.searchParams.set('state', u.searchParams.get('state'));
      res.writeHead(302, {Location: back.href}).end(); return;
    }
    if (u.pathname === '/as/token') {
      const f = new URLSearchParams(await body(req)); st.tokenCalls.push(Object.fromEntries(f));
      if (f.get('grant_type') === 'authorization_code') {
        const c = st.codes.get(f.get('code')); st.codes.delete(f.get('code'));
        const ok = c && c.method === 'S256' && createHash('sha256').update(f.get('code_verifier')).digest('base64url') === c.challenge && f.get('resource') === base + '/mcp' && f.get('redirect_uri') === c.redirect && f.get('client_id') === c.client;
        return ok ? json(200, {access_token: 'tok-1', token_type: 'Bearer', refresh_token: 'ref-1', expires_in: 3600, scope: 'read'}) : json(400, {error: 'invalid_grant'});
      }
      if (f.get('grant_type') === 'refresh_token' && f.get('refresh_token') === 'ref-1') { st.tokens.clear(); st.tokens.add('tok-2'); return json(200, {access_token: 'tok-2', token_type: 'bearer', expires_in: 3600}); }
      return json(400, {error: 'invalid_grant', error_description: 'bad refresh'});
    }
    res.writeHead(404).end();
  });
  const base = await listen(server);
  return {base, st, close: () => { server.closeAllConnections?.(); return new Promise(r => server.close(r)); }};
}
const browser = async url => { const r = await fetch(url, {redirect: 'follow'}); await r.text(); };

test('oauth helpers: endpoint safety, metadata hint, PKCE', () => {
  assert.equal(safeEndpoint('https://a.example/x'), 'https://a.example/x');
  assert.equal(safeEndpoint('http://127.0.0.1:9/x'), 'http://127.0.0.1:9/x');
  for (const bad of ['http://evil.example/x', 'https://u:p@a.example/', 'javascript:alert(1)', 'https://a.example/#f']) assert.throws(() => safeEndpoint(bad), /HTTPS|无效/);
  assert.equal(resourceMetadataHint('Bearer error="invalid_token", resource_metadata="https://a.example/.well-known/oauth-protected-resource"'), 'https://a.example/.well-known/oauth-protected-resource');
  assert.equal(resourceMetadataHint('Bearer realm="x"'), null);
  const {verifier, challenge} = pkcePair();
  assert.ok(verifier.length >= 43); assert.equal(createHash('sha256').update(verifier).digest('base64url'), challenge);
});

test('oauth: discovery, dynamic registration, browser code flow with PKCE + resource, refresh', async () => {
  const s = await authServer();
  try {
    const meta = await discoverAuth(s.base + '/mcp');
    assert.deepEqual([meta.resource, meta.issuer, meta.registration_endpoint, meta.scopes], [s.base + '/mcp', s.base + '/as', s.base + '/as/register', ['read']]);
    let opened = '';
    const grant = await signIn(s.base + '/mcp', {openExternal: async u => { opened = u; await browser(u); }});
    const q = new URL(opened).searchParams;
    assert.deepEqual([q.get('response_type'), q.get('code_challenge_method'), q.get('resource'), q.get('scope')], ['code', 'S256', s.base + '/mcp', 'read']);
    assert.match(q.get('redirect_uri'), /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    assert.equal(s.st.registered[0].token_endpoint_auth_method, 'none'); assert.deepEqual(s.st.registered[0].redirect_uris, [q.get('redirect_uri')]);
    assert.deepEqual([grant.access_token, grant.refresh_token, grant.client_id, grant.resource], ['tok-1', 'ref-1', 'client-1', s.base + '/mcp']);
    assert.ok(grant.expires_at > Date.now());
    const next = await refreshGrant(grant);
    assert.equal(next.access_token, 'tok-2'); assert.equal(next.refresh_token, 'ref-1', 'refresh token kept when not rotated');
    assert.equal(s.st.tokenCalls.at(-1).resource, s.base + '/mcp');
    await assert.rejects(refreshGrant({...grant, refresh_token: 'nope'}), /获取令牌失败.*bad refresh/);
    await assert.rejects(refreshGrant({...grant, refresh_token: null}), /重新登录/);
  } finally { await s.close(); }
  const noDcr = await authServer({dcr: false});
  try { await assert.rejects(signIn(noDcr.base + '/mcp', {openExternal: browser}), /自动注册/); } finally { await noDcr.close(); }
  const plain = await authServer({s256: false});
  try { await assert.rejects(discoverAuth(plain.base + '/mcp'), /S256/); } finally { await plain.close(); }
  const none = createServer((q, r) => r.writeHead(404).end()), nb = await listen(none);
  try { await assert.rejects(discoverAuth(nb + '/mcp'), /没有提供浏览器登录/); } finally { none.close(); }
  await assert.rejects(registerClient({registration_endpoint: null}, {redirectUri: 'http://127.0.0.1/cb'}), /自动注册/);
});

test('oauth loopback: wrong state ignored, error reported, timeout', async () => {
  const lb = await loopback({state: 's1', timeoutMs: 2000});
  const r1 = await fetch(lb.redirectUri + '?code=x&state=WRONG'); assert.equal(r1.status, 400);
  await fetch(lb.redirectUri + '?error=access_denied&error_description=no&state=s1');
  await assert.rejects(lb.result, /授权被拒绝：no/);
  const lb2 = await loopback({state: 's2', timeoutMs: 30});
  await assert.rejects(lb2.result, /超时/);
});

test('McpClient: token from getToken, one refresh on 401, newer protocol versions', async () => {
  const s = await authServer();
  try {
    let refreshed = 0;
    const c = new McpClient(s.base + '/mcp', {getToken: async () => 'tok-old', onUnauthorized: async () => { refreshed++; s.st.tokens.add('tok-9'); return 'tok-9'; }});
    const tools = await c.discover();
    assert.deepEqual(tools.map(t => t.name), ['quote']); assert.equal(refreshed, 1); assert.equal(c.version, '2025-11-25');
    assert.deepEqual(s.st.mcpCalls.slice(0, 2), ['Bearer tok-old', 'Bearer tok-9']);
    const d = new McpClient(s.base + '/mcp', {getToken: async () => 'tok-old', onUnauthorized: async () => 'still-bad'});
    await assert.rejects(d.discover(), /401/);
  } finally { await s.close(); }
});

const SERVER = `
const rl = require('readline').createInterface({input: process.stdin});
console.log('banner: starting');
const send = v => process.stdout.write(JSON.stringify(v) + '\\n');
rl.on('line', line => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') { send({jsonrpc: '2.0', method: 'notifications/message', params: {}}); send({jsonrpc: '2.0', id: 'srv-1', method: 'ping'}); send({jsonrpc: '2.0', id: m.id, result: {protocolVersion: '2025-06-18', capabilities: {}}}); }
  else if (m.method === 'tools/list') send({jsonrpc: '2.0', id: m.id, result: {tools: [{name: 'env_echo', description: 'e', inputSchema: {type: 'object'}}, {name: 'die', inputSchema: {type: 'object'}}]}});
  else if (m.method === 'tools/call' && m.params.name === 'env_echo') send({jsonrpc: '2.0', id: m.id, result: {content: [{type: 'text', text: 'token=' + process.env.MY_TOKEN + ' home=' + (process.env.SECRET_FROM_PARENT || 'none') + ' cwd=' + process.cwd()}]}});
  else if (m.method === 'tools/call' && m.params.name === 'die') { process.stderr.write('fatal: token ' + process.env.MY_TOKEN + ' rejected\\n'); process.exit(7); }
  else if (m.id && m.result) { process.stderr.write('client answered ' + JSON.stringify(m) + '\\n'); }
});`;

test('stdio: spec validation, command resolution, describe, env lines', () => {
  assert.deepEqual(normalizeStdio({command: 'uvx', args: 'akshare-one-mcp\n\n', env: {A_B: '1'}}), {command: 'uvx', args: ['akshare-one-mcp'], env: {A_B: '1'}});
  for (const [spec, re] of [[{command: 'bash', args: ['-c', 'x']}, /不允许/], [{command: 'uvx --from x'}, /程序名/], [{command: ''}, /请填写/], [{command: 'npx', args: ['a\nb'].concat(Array(40).fill('x'))}, /32/],
    [{command: 'npx', env: {DYLD_INSERT_LIBRARIES: 'x'}}, /不允许设置/], [{command: 'npx', env: {PATH: '/tmp'}}, /不允许设置/], [{command: 'npx', env: {'bad name': '1'}}, /变量名无效/], [{command: '/bin/zsh'}, /不允许/]])
    assert.throws(() => normalizeStdio(spec), re);
  assert.throws(() => resolveCommand('uvx', {dirs: []}), /找不到命令 uvx。请先安装 uv/);
  assert.equal(resolveCommand('node', {dirs: ['/x'], exists: p => p === '/x/node', isFile: () => true}), '/x/node');
  assert.throws(() => resolveCommand('/no/such/bin'), /找不到可执行文件/);
  assert.equal(describeStdio({command: 'npx', args: ['-y', 'a b']}), 'npx -y "a b"');
  assert.deepEqual(parseEnvLines('# c\nA=1\n B = x=y \n'), {A: '1', B: 'x=y'}); assert.throws(() => parseEnvLines('oops'), /名称=值/);
  assert.equal(mcpUrl('stdio:local-abc-123'), 'stdio:local-abc-123'); assert.throws(() => mcpUrl('stdio:../x'), /本机MCP标识无效/);
});

test('stdio: real child process — discover, server requests answered, env isolated, secrets redacted, exit reported, kill on close', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'quank-stdio-')), script = path.join(dir, 'server.cjs');
  await writeFile(script, SERVER);
  process.env.SECRET_FROM_PARENT = 'parent-secret';
  try {
    const c = new StdioMcpClient('stdio:local-t1', {command: process.execPath, args: [script], env: {MY_TOKEN: 'tk-123456'}}, {cwd: path.join(dir, 'work')});
    const tools = await c.discover();
    assert.deepEqual(tools.map(t => t.name), ['env_echo', 'die']);
    const r = await c.call('env_echo', {});
    assert.match(r.content[0].text, /token=\[凭据已隐藏\] home=none cwd=.*work$/, 'secret redacted, parent env not inherited, cwd set');
    await assert.rejects(c.call('die', {}), e => /进程已退出（代码 7）/.test(e.message) && /\[凭据已隐藏\]/.test(e.message) && !e.message.includes('tk-123456'));
    await c.close();
    const d = new StdioMcpClient('stdio:local-t2', {command: process.execPath, args: [script], env: {}}, {});
    await d.discover(); await d.close();
    await assert.rejects(d.call('env_echo', {}), /已关闭|已退出/);
    const missing = new StdioMcpClient('stdio:local-t3', {command: 'uvx', args: ['x']}, {resolve: () => { throw new Error('找不到命令 uvx。请先安装 uv'); }});
    await assert.rejects(missing.discover(), /请先安装 uv/);
  } finally { delete process.env.SECRET_FROM_PARENT; await rm(dir, {recursive: true, force: true}); }
});

function lib({approve = async () => true, signInFn} = {}) {
  const store = {data: {mcpConnections: [], agents: [], skillPackages: [], executions: [], commandJobs: []}, save: async () => {}};
  const secrets = fixtureSecrets().codec;
  return {store, secrets, lib: createCapabilityLibrary({store, approve, secrets, openExternal: async () => {}, signInFn, localDir: tmpdir()})};
}

test('library: stdio connections seal env, keep values on blank, views never leak; oauth sign-in stores a sealed grant', async () => {
  const f = lib({signInFn: async (url, o) => { assert.equal(typeof o.openExternal, 'function'); return {access_token: 'acc-SECRET-1', refresh_token: 'ref-SECRET', token_endpoint: 'https://a.example/t', client_id: 'c', resource: url, expires_at: Date.now() + 3600e3}; }});
  const {id} = await f.lib.connection({name: 'Tushare', enabled: true, transport: 'stdio', command: 'npx', args: ['-y', 'tushare-mcp-server'], env: {TUSHARE_TOKEN: 'ts-SECRET-1'}, presetId: 'tushare'});
  let row = f.store.data.mcpConnections[0];
  assert.match(row.url, /^stdio:local-[a-z0-9-]+$/); assert.deepEqual([row.command, row.args, row.envNames, row.presetId], ['npx', ['-y', 'tushare-mcp-server'], ['TUSHARE_TOKEN'], 'tushare']);
  assert.ok(!JSON.stringify(f.store.data).includes('ts-SECRET-1'));
  await f.lib.connection({id, name: 'Tushare', enabled: true, transport: 'stdio', command: 'npx', args: ['-y', 'tushare-mcp-server'], env: {TUSHARE_TOKEN: ''}});
  row = f.store.data.mcpConnections[0];
  assert.deepEqual(JSON.parse(f.secrets.open(row.encryptedEnv)), {TUSHARE_TOKEN: 'ts-SECRET-1'}, 'blank value keeps the saved one');
  const v = mcpViews(f.store.data)[0];
  assert.deepEqual([v.transport, v.command, v.envNames], ['stdio', 'npx', ['TUSHARE_TOKEN']]); assert.ok(!JSON.stringify(v).includes('encryptedEnv'));
  assert.match(mcpDescribe(row), /本机程序：npx -y tushare-mcp-server[\s\S]*TUSHARE_TOKEN（值已加密/);
  assert.equal(mcpConnectScope({name: 'x', url: row.url}), null, 'starting a local program is never covered by an always-allow rule');
  await assert.rejects(f.lib.connection({name: 'x', enabled: true, transport: 'stdio', command: 'bash', args: ['-c', 'rm -rf ~']}), /不允许/);
  const o = await f.lib.connection({name: 'Alpha', enabled: true, url: 'https://mcp.example.com/mcp', auth: 'oauth'});
  await assert.rejects(f.lib.probe(o.id), /请先.*登录/);
  const r = await f.lib.oauthSignIn(o.id);
  assert.equal(r.signedIn, true);
  const orow = f.store.data.mcpConnections.find(c => c.id === o.id);
  assert.ok(orow.encryptedGrant && orow.grantId); assert.ok(!JSON.stringify(f.store.data).includes('acc-SECRET-1'));
  assert.equal(mcpViews(f.store.data).find(c => c.id === o.id).signedIn, true);
  await f.lib.connection({id: o.id, name: 'Alpha 2', enabled: true, url: 'https://mcp.example.com/mcp', auth: 'oauth'});
  assert.ok(f.store.data.mcpConnections.find(c => c.id === o.id).encryptedGrant, 'renaming keeps the sign-in');
  await f.lib.connection({id: o.id, name: 'Alpha 2', enabled: true, url: 'https://other.example.com/mcp', auth: 'oauth'});
  assert.equal(f.store.data.mcpConnections.find(c => c.id === o.id).encryptedGrant, undefined, 'a new address needs a new sign-in');
  await f.lib.oauthSignIn(o.id); await f.lib.oauthSignOut(o.id);
  assert.equal(mcpViews(f.store.data).find(c => c.id === o.id).signedIn, false);
  const denied = lib({approve: async () => false, signInFn: async () => { throw new Error('should not run'); }});
  const d = await denied.lib.connection({name: 'A', enabled: true, url: 'https://mcp.example.com/mcp', auth: 'oauth'});
  await assert.rejects(denied.lib.oauthSignIn(d.id), /取消/);
});

test('factory: oauth token refreshed when near expiry and persisted; stdio gets its decrypted env', async () => {
  const f = lib();
  const secrets = f.secrets;
  f.store.data.mcpConnections.push({id: 'o1', name: 'A', url: 'https://mcp.example.com/mcp', auth: 'oauth', enabled: true, revision: 1, grantId: 'g1',
    encryptedGrant: secrets.seal(JSON.stringify({access_token: 'old', refresh_token: 'r', expires_at: Date.now() + 1000, token_endpoint: 'https://a.example/t', client_id: 'c', resource: 'https://mcp.example.com/mcp'}))});
  const seen = [];
  const fetcher = async (url, o) => { seen.push(o.headers.Authorization); return new Response(JSON.stringify({jsonrpc: '2.0', id: 1, result: {protocolVersion: '2025-06-18'}}), {headers: {'content-type': 'application/json'}}); };
  const factory = createMcpClientFactory({store: f.store, secrets, fetcher, refresh: async g => ({...g, access_token: 'fresh', expires_at: Date.now() + 3600e3})});
  const c = factory('https://mcp.example.com/mcp', {id: 'o1', revision: 1});
  await c.rpc('initialize', {});
  assert.equal(seen[0], 'Bearer fresh');
  assert.equal(JSON.parse(secrets.open(f.store.data.mcpConnections[0].encryptedGrant)).access_token, 'fresh', 'refreshed grant sealed back');
  f.store.data.mcpConnections.push({id: 's1', name: 'L', url: 'stdio:local-s1', transport: 'stdio', command: 'npx', args: ['x'], envNames: ['K'], encryptedEnv: secrets.seal(JSON.stringify({K: 'v'})), enabled: true, revision: 1});
  let spawned;
  const g = createMcpClientFactory({store: f.store, secrets, spawnFn: (cmd, args, o) => { spawned = {cmd, args, env: o.env, shell: o.shell}; throw new Error('stop'); }, localDir: tmpdir()});
  const s = g('stdio:local-s1', {id: 's1', revision: 1});
  assert.ok(s instanceof StdioMcpClient);
  await assert.rejects(s.discover(), /stop|无法启动|npx/);
  if (spawned) { assert.equal(spawned.env.K, 'v'); assert.equal(spawned.shell, false); }
});

test('presets: finance OAuth and local data sources; UI form, cards and payload', () => {
  const mcp = capabilityPresets().mcp, ids = mcp.map(m => m.id);
  for (const id of ['fiscal-ai', 'alpha-vantage', 'twelve-data', 'akshare-one', 'tushare']) assert.ok(ids.includes(id), id);
  assert.deepEqual(ids.slice(0, 5), ['fiscal-ai', 'alpha-vantage', 'twelve-data', 'akshare-one', 'tushare']);
  const av = mcp.find(m => m.id === 'alpha-vantage'), ak = mcp.find(m => m.id === 'akshare-one'), ts = mcp.find(m => m.id === 'tushare');
  assert.equal(av.auth, 'oauth'); assert.equal(mcpUrl(av.url), av.url);
  assert.deepEqual([ak.transport, ak.command, ak.args], ['stdio', 'uvx', ['akshare-one-mcp']]);
  assert.deepEqual([ts.command, ts.args, ts.env[0].name, ts.env[0].required], ['npx', ['-y', 'tushare-mcp-server'], 'TUSHARE_TOKEN', true]);
  for (const p of mcp.filter(m => m.transport === 'stdio')) assert.doesNotThrow(() => normalizeStdio(p));
  const doc = new JSDOM(mcpPage({capabilityPresets: capabilityPresets(), mcpConnections: [
    {id: 'a', name: 'Alpha', url: 'https://mcp.alphavantage.co/mcp', auth: 'oauth', enabled: true, signedIn: false, transport: 'http'},
    {id: 'b', name: 'AKShare', url: 'stdio:local-b', transport: 'stdio', command: 'uvx', args: ['akshare-one-mcp'], envNames: [], enabled: true, auth: 'none', presetId: 'akshare-one'}]}, new Set())).window.document;
  const cards = [...doc.querySelectorAll('.mine-card')];
  assert.match(cards[0].textContent, /浏览器登录 · 未登录/); assert.ok(cards[0].querySelector('[data-action="mcpSignIn"]')); assert.equal(cards[0].querySelector('[data-action="mcpSignOut"]'), null);
  assert.match(cards[1].querySelector('.connection-url').textContent, /uvx akshare-one-mcp/); assert.match(cards[1].textContent, /本机程序/);
  const ak2 = [...doc.querySelectorAll('.preset-card')].find(c => /AKShare/.test(c.textContent));
  assert.match(ak2.textContent, /本机程序/); assert.match(ak2.querySelector('[data-action="newPresetMcp"]').textContent, /查看配置/, 'installed preset recognised by presetId');
  const f = new JSDOM(`<form>${mcpForm({name: 'T', transport: 'stdio', command: 'npx', args: ['-y', 'tushare-mcp-server'], envNames: ['TUSHARE_TOKEN'], envHelp: ts.env})}</form>`).window.document.querySelector('form');
  assert.equal(f.querySelector('[name=transport]').value, 'stdio'); assert.equal(f.querySelector('[data-mcp-section="http"]').hidden, true);
  assert.equal(f.querySelector('[name=env]').value, 'TUSHARE_TOKEN='); assert.ok(f.querySelector('[name=env]').hasAttribute('data-mcp-secret'));
  f.querySelector('[name=env]').value = 'TUSHARE_TOKEN=abc';
  assert.deepEqual(mcpPayload(f, {id: 'x', presetId: 'tushare'}), {id: 'x', name: 'T', description: '', enabled: true, transport: 'stdio', presetId: 'tushare', command: 'npx', args: ['-y', 'tushare-mcp-server'], env: {TUSHARE_TOKEN: 'abc'}});
  const h = new JSDOM(`<form>${mcpForm({name: 'A', url: 'https://x.example/mcp', auth: 'oauth'})}</form>`).window.document.querySelector('form');
  assert.equal(h.querySelector('[name=auth]').value, 'oauth'); assert.equal(h.querySelector('[data-mcp-auth-section="oauth"]').hidden, false);
  assert.deepEqual(mcpPayload(h, {}).auth, 'oauth');
  assert.throws(() => parseEnvText('nope'), /名称=值/);
});

test('app tools: list, add from preset (secret-free directly, secret via form), sign in and test', async () => {
  const names = appToolDefinitions().map(d => d.function.name);
  for (const n of ['app_mcp_list', 'app_mcp_add', 'app_mcp_signin', 'app_mcp_test']) assert.ok(names.includes(n), n);
  const store = {data: {mcpConnections: [{id: 'm1', name: 'Alpha', url: 'https://mcp.alphavantage.co/mcp', auth: 'oauth', enabled: true, revision: 1}]}};
  const calls = [], forms = [], asks = [];
  const capabilities = {connection: async p => { calls.push(['connection', p]); return {id: 'new1'}; }, oauthSignIn: async id => { calls.push(['signin', id]); return {signedIn: true}; }, probe: async id => { calls.push(['probe', id]); return {count: 3}; }};
  const run = (name, args, answer = true) => executeAppTool(name, args, {store, deps: {capabilities, openMcpForm: p => forms.push(p), notify() {}}, ask: async (t, d) => { asks.push([t, d]); return answer; }});
  const list = await run('app_mcp_list', {});
  assert.equal(list.connections[0].name, 'Alpha'); assert.ok(list.presets.some(p => p.id === 'tushare' && p.needsSecret)); assert.ok(list.presets.some(p => p.id === 'akshare-one' && !p.needsSecret));
  const ts = await run('app_mcp_add', {preset: 'tushare'});
  assert.equal(ts.status, 'needs_user'); assert.deepEqual(forms, [{preset: 'tushare'}]); assert.equal(asks.length, 0);
  assert.equal((await run('app_mcp_add', {preset: 'akshare-one'}, false)).status, 'denied'); assert.match(asks.at(-1)[1], /本机程序：uvx akshare-one-mcp/);
  const ak = await run('app_mcp_add', {preset: 'akshare-one'});
  assert.equal(ak.status, 'succeeded'); assert.deepEqual(calls.at(-1)[1], {name: 'AKShare One', description: calls.at(-1)[1].description, url: undefined, auth: 'none', transport: 'stdio', command: 'uvx', args: ['akshare-one-mcp'], presetId: 'akshare-one', enabled: true, env: {}});
  const av = await run('app_mcp_add', {preset: 'alpha-vantage'});
  assert.match(av.next, /app_mcp_signin/); assert.equal(calls.at(-1)[1].auth, 'oauth');
  await assert.rejects(run('app_mcp_add', {preset: 'nope'}), /没有这个预置/);
  assert.deepEqual(await run('app_mcp_signin', {id: 'Alpha'}), {status: 'succeeded', signedIn: true}); assert.deepEqual(calls.at(-1), ['signin', 'm1']);
  assert.deepEqual(await run('app_mcp_test', {id: 'm1'}), {status: 'succeeded', tools: 3});
  await assert.rejects(run('app_mcp_test', {id: 'zzz'}), /没有这个 MCP 连接/);
});

test('wiring: IPC, preload, main, renderer', async () => {
  const main = await read('../main.mjs'), preload = await read('../preload.cjs'), app = await read('../src/app.js'), session = await read('../services/agent-session.mjs');
  for (const k of ["register('mcpSignIn'", "register('mcpSignOut'", "register('mcpCancelSignIn'", 'openExternal:', "get capabilities()", 'openMcpForm:']) assert.ok(main.includes(k), k);
  for (const k of ["'mcpSignIn'", "'mcpSignOut'", "'mcpCancelSignIn'"]) assert.ok(preload.includes(k), k);
  for (const k of ["actionId==='mcpSignIn'", "actionId==='mcpSignOut'", 'mcpForm(c)', 'bindMcpForm(', "p.mcp"]) assert.ok(app.includes(k), k);
  assert.match(session, /mcpDescribe\(/);
});
