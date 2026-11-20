// [mcp2] Browser sign-in (OAuth 2.1 authorization code + PKCE) for remote MCP servers, following the MCP authorization
// spec: protected-resource metadata (RFC 9728) -> authorization-server metadata (RFC 8414 / OIDC discovery) -> dynamic
// client registration (RFC 7591) -> code flow with S256 PKCE and the `resource` indicator (RFC 8707) on a loopback
// redirect (RFC 8252). Tokens never reach the renderer; callers seal the returned grant.
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';

const META_BYTES = 256 * 1024, TOKEN_MAX = 8192;
const clip = (s, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const b64url = buf => Buffer.from(buf).toString('base64url');
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Endpoints must be HTTPS (plain HTTP only on this machine), without credentials or fragments. */
export function safeEndpoint(value, label = '授权地址') {
  let u;
  try { u = new URL(String(value || '')); } catch { throw Error(`${label}无效`); }
  if (u.username || u.password || u.hash || !(u.protocol === 'https:' || (u.protocol === 'http:' && LOOPBACK.has(u.hostname)))) throw Error(`${label}必须是 HTTPS 地址`);
  return u.href;
}

async function getJson(url, fetcher, signal) {
  const r = await fetcher(url, {method: 'GET', headers: {Accept: 'application/json', 'MCP-Protocol-Version': '2025-06-18'}, redirect: 'follow', credentials: 'omit', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000)});
  if (!r.ok) { await r.body?.cancel(); return null; }
  const text = await r.text();
  if (text.length > META_BYTES) throw Error('授权元数据过大');
  try { const v = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}

/** `Bearer resource_metadata="..."` from a WWW-Authenticate header. */
export function resourceMetadataHint(header) {
  const m = /resource_metadata\s*=\s*"([^"]+)"/i.exec(String(header || '')) || /resource_metadata\s*=\s*([^\s,]+)/i.exec(String(header || ''));
  return m ? m[1] : null;
}
const wellKnown = (base, name) => { const u = new URL(base), p = u.pathname.replace(/\/$/, ''); return [`${u.origin}/.well-known/${name}${p}`, ...(p ? [`${u.origin}/.well-known/${name}`] : [])]; };

/** Find the authorization server for an MCP endpoint and read its metadata. */
export async function discoverAuth(mcpUrl, {fetcher = fetch, signal} = {}) {
  const resource = safeEndpoint(mcpUrl, 'MCP 地址');
  let hint = null;
  try {
    const r = await fetcher(resource, {method: 'POST', redirect: 'error', credentials: 'omit', headers: {'Content-Type': 'application/json', Accept: 'application/json, text/event-stream'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'QuanK', version: '1'}}}), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000)});
    hint = resourceMetadataHint(r.headers.get('www-authenticate'));
    await r.body?.cancel();
  } catch (e) { if (signal?.aborted) throw e; }
  let prm = null;
  for (const u of [...(hint ? [safeEndpoint(hint, '资源元数据地址')] : []), ...wellKnown(resource, 'oauth-protected-resource')]) { prm = await getJson(u, fetcher, signal); if (prm) break; }
  const issuer = safeEndpoint(Array.isArray(prm?.authorization_servers) && prm.authorization_servers[0] ? prm.authorization_servers[0] : new URL(resource).origin, '授权服务器地址');
  let meta = null;
  for (const u of [...wellKnown(issuer, 'oauth-authorization-server'), ...wellKnown(issuer, 'openid-configuration'), issuer.replace(/\/$/, '') + '/.well-known/openid-configuration']) { meta = await getJson(u, fetcher, signal); if (meta?.authorization_endpoint && meta?.token_endpoint) break; meta = null; }
  if (!meta) throw Error('这个服务没有提供浏览器登录（未找到 OAuth 授权服务器）；请改用 API Key / Bearer Token');
  const methods = meta.code_challenge_methods_supported;
  if (Array.isArray(methods) && !methods.includes('S256')) throw Error('授权服务器不支持 PKCE S256，出于安全考虑不连接');
  return {
    resource: typeof prm?.resource === 'string' ? safeEndpoint(prm.resource, '资源标识') : resource,
    issuer,
    authorization_endpoint: safeEndpoint(meta.authorization_endpoint),
    token_endpoint: safeEndpoint(meta.token_endpoint, '令牌地址'),
    registration_endpoint: meta.registration_endpoint ? safeEndpoint(meta.registration_endpoint, '注册地址') : null,
    scopes: Array.isArray(prm?.scopes_supported) ? prm.scopes_supported.filter(s => typeof s === 'string' && s.length < 100).slice(0, 20) : [],
  };
}

export function pkcePair() {
  const verifier = b64url(randomBytes(32));
  return {verifier, challenge: b64url(createHash('sha256').update(verifier).digest())};
}

export async function registerClient(meta, {redirectUri, fetcher = fetch, signal, clientId = null}) {
  if (clientId) return {client_id: String(clientId)};
  if (!meta.registration_endpoint) throw Error('授权服务器不支持自动注册客户端（RFC 7591）；请改用 API Key / Bearer Token');
  const r = await fetcher(meta.registration_endpoint, {method: 'POST', redirect: 'error', credentials: 'omit', headers: {'Content-Type': 'application/json', Accept: 'application/json'},
    body: JSON.stringify({client_name: 'QuanK', redirect_uris: [redirectUri], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none'}),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)});
  const text = await r.text();
  if (!r.ok) throw Error(`注册客户端失败（HTTP ${r.status}）${clip(text, 120) ? '：' + clip(text, 120) : ''}`);
  let v; try { v = JSON.parse(text); } catch { throw Error('注册客户端的返回无效'); }
  if (typeof v.client_id !== 'string' || !v.client_id || v.client_id.length > 500) throw Error('注册客户端的返回缺少 client_id');
  return {client_id: v.client_id, ...(typeof v.client_secret === 'string' && v.client_secret.length < 2000 ? {client_secret: v.client_secret} : {})};
}

export function authorizeUrl(meta, {clientId, redirectUri, challenge, state, scope = ''}) {
  const u = new URL(meta.authorization_endpoint);
  for (const [k, v] of Object.entries({response_type: 'code', client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256', state, resource: meta.resource, ...(scope ? {scope} : {})})) u.searchParams.set(k, v);
  return u.href;
}

function tokenResult(v, prev = {}) {
  if (!v || typeof v.access_token !== 'string' || !v.access_token || v.access_token.length > TOKEN_MAX || !/^[A-Za-z0-9._~+\/-]+=*$/.test(v.access_token)) throw Error('授权服务器返回的访问令牌无效');
  if (v.token_type && String(v.token_type).toLowerCase() !== 'bearer') throw Error('不支持的令牌类型 ' + clip(v.token_type, 20));
  const sec = Number(v.expires_in);
  return {access_token: v.access_token, refresh_token: typeof v.refresh_token === 'string' && v.refresh_token.length <= TOKEN_MAX ? v.refresh_token : prev.refresh_token || null,
    expires_at: Number.isFinite(sec) && sec > 0 ? Date.now() + sec * 1000 : null, scope: typeof v.scope === 'string' ? clip(v.scope, 500) : prev.scope || ''};
}

async function tokenRequest(endpoint, form, {fetcher, signal}) {
  const r = await fetcher(endpoint, {method: 'POST', redirect: 'error', credentials: 'omit', headers: {'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json'},
    body: new URLSearchParams(form).toString(), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)});
  const text = await r.text();
  let v = null; try { v = JSON.parse(text); } catch {}
  if (!r.ok) throw Error(`获取令牌失败（HTTP ${r.status}）${v?.error ? '：' + clip(v.error_description || v.error, 120) : ''}`);
  return v;
}

/** Refresh an expired grant. Throws when there is no refresh token or the server refuses. */
export async function refreshGrant(grant, {fetcher = fetch, signal} = {}) {
  if (!grant?.refresh_token) throw Error('登录已过期，请重新登录');
  const v = await tokenRequest(grant.token_endpoint, {grant_type: 'refresh_token', refresh_token: grant.refresh_token, client_id: grant.client_id, resource: grant.resource, ...(grant.client_secret ? {client_secret: grant.client_secret} : {})}, {fetcher, signal});
  return {...grant, ...tokenResult(v, grant)};
}

/** One-shot loopback receiver for the authorization redirect. */
export function loopback({state, timeoutMs = 300e3, signal} = {}) {
  return new Promise((ready, fail) => {
    let finish;
    const result = new Promise((resolve, reject) => { finish = (e, v) => { clearTimeout(timer); try { server.close(); } catch {} e ? reject(e) : resolve(v); }; });
    result.catch(() => {}); // a rejection before the caller awaits (denied / timeout / cancel) is not an unhandled rejection
    const page = ok => `<!doctype html><meta charset="utf-8"><title>QuanK</title><body style="font-family:-apple-system,sans-serif;text-align:center;padding-top:80px;color:#0b2f55"><h2>${ok ? '登录完成' : '登录未完成'}</h2><p>${ok ? '可以关闭此页面，回到 QuanK。' : '请回到 QuanK 查看原因。'}</p></body>`;
    const server = createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
      if (u.searchParams.get('state') !== state) { res.writeHead(400, {'Content-Type': 'text/html; charset=utf-8'}).end(page(false)); return; }
      const err = u.searchParams.get('error'), code = u.searchParams.get('code');
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}).end(page(!err && !!code));
      if (err) finish(Error('授权被拒绝：' + clip(u.searchParams.get('error_description') || err, 160)));
      else if (!code || code.length > 4096) finish(Error('授权回调缺少授权码'));
      else finish(null, code);
    });
    const timer = setTimeout(() => finish(Error('等待浏览器登录超时（5 分钟）')), timeoutMs);
    signal?.addEventListener('abort', () => finish(Error('已取消登录')), {once: true});
    server.on('error', e => { clearTimeout(timer); fail(e); });
    server.listen(0, '127.0.0.1', () => ready({redirectUri: `http://127.0.0.1:${server.address().port}/callback`, result, close: () => finish(Error('已取消登录'))}));
  });
}

/** Full sign-in: discover -> register -> open the browser -> wait for the code -> exchange. Returns the grant to seal. */
export async function signIn(mcpUrl, {openExternal, fetcher = fetch, signal, timeoutMs = 300e3, clientId = null, scope = ''} = {}) {
  if (typeof openExternal !== 'function') throw Error('无法打开浏览器');
  const meta = await discoverAuth(mcpUrl, {fetcher, signal});
  const state = b64url(randomBytes(16)), {verifier, challenge} = pkcePair();
  const lb = await loopback({state, timeoutMs, signal});
  try {
    const client = await registerClient(meta, {redirectUri: lb.redirectUri, fetcher, signal, clientId});
    const wanted = scope || (meta.scopes.length ? meta.scopes.join(' ') : '');
    await openExternal(authorizeUrl(meta, {clientId: client.client_id, redirectUri: lb.redirectUri, challenge, state, scope: wanted}));
    const code = await lb.result;
    const v = await tokenRequest(meta.token_endpoint, {grant_type: 'authorization_code', code, redirect_uri: lb.redirectUri, code_verifier: verifier, client_id: client.client_id, resource: meta.resource, ...(client.client_secret ? {client_secret: client.client_secret} : {})}, {fetcher, signal});
    return {issuer: meta.issuer, token_endpoint: meta.token_endpoint, resource: meta.resource, client_id: client.client_id, ...(client.client_secret ? {client_secret: client.client_secret} : {}), ...tokenResult(v), signedInAt: Date.now()};
  } finally { lb.close(); lb.result.catch(() => {}); }
}
