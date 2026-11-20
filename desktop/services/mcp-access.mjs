import os from "node:os";
import path from "node:path";
import { McpClient } from "../runtime/mcp.mjs";
import { StdioMcpClient, describeStdio } from "../runtime/mcp-stdio.mjs"; // [mcp2]
import { refreshGrant } from "../runtime/mcp-oauth.mjs"; // [mcp2]
export function bearerToken(value) {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    value.length > 4096 ||
    !/^[A-Za-z0-9._~+\/-]+=*$/.test(value)
  )
    throw Error("Bearer Token须为8–4096字符的有效令牌，不含Bearer前缀或空白");
  return value;
}
/** Deliberate projection: never spread ciphertext or future secret fields. */
export function mcpViews(data) {
  return (data.mcpConnections || []).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    url: c.url,
    enabled: c.enabled,
    revision: c.revision,
    time: c.time,
    auth: c.auth || "none",
    hasToken: !!(c.encryptedToken || c.encryptedGrant),
    // [mcp2] transport details are not secret; env values and OAuth tokens stay sealed
    transport: c.transport === "stdio" ? "stdio" : "http",
    ...(c.transport === "stdio" ? { command: c.command, args: [...(c.args || [])], envNames: [...(c.envNames || [])] } : {}),
    ...(c.auth === "oauth" ? { signedIn: !!c.encryptedGrant, oauthExpires: c.oauthExpires || null, oauthAt: c.oauthAt || null } : {}),
    ...(c.presetId ? { presetId: c.presetId } : {}),
    ...(c.lastTest ? { lastTest: structuredClone(c.lastTest) } : {}),
  }));
}
/** [mcp2] Human description for approval dialogs (no secrets). */
export function mcpDescribe(c) {
  if (c?.transport === "stdio")
    return `本机程序：${describeStdio(c)}\n环境变量：${(c.envNames || []).join("、") || "无"}（值已加密，不显示）\n该程序以你的用户身份在本机运行，可访问你的文件和网络；请只运行来源可信的程序。`;
  return `${c?.url}\n认证：${c?.auth === "bearer" ? "使用此连接已保存的Bearer Token" : c?.auth === "oauth" ? (c.encryptedGrant ? "使用浏览器登录获得的访问令牌（过期时自动刷新）" : "浏览器登录（尚未登录）") : "无认证"}`;
}
/** Called only AFTER native approval. No network or decryption at config/list time. */
export function createMcpClientFactory({ store, secrets, fetcher, spawnFn, localDir, refresh = refreshGrant }) {
  return (url, binding) => {
    if (!binding) return new McpClient(url, { fetcher });
    const row = (store.data.mcpConnections || []).find(
      (c) => c.id === binding.id,
    );
    if (
      !row ||
      !row.enabled ||
      row.url !== url ||
      row.revision !== binding.revision
    )
      throw Error("MCP连接配置已变更");
    const revision = row.revision,
      cipher = row.encryptedToken,
      auth = row.auth || "none",
      grantId = row.grantId,
      envCipher = row.encryptedEnv;
    const current = () => (store.data.mcpConnections || []).find((c) => c.id === row.id);
    const validate = () => {
      const c = current();
      if (
        !c ||
        !c.enabled ||
        c.url !== url ||
        c.revision !== revision ||
        (c.auth || "none") !== auth ||
        c.encryptedToken !== cipher ||
        c.grantId !== grantId ||
        c.encryptedEnv !== envCipher
      )
        throw Error("MCP连接或凭据已变更，请重新发起任务");
    };
    if (row.transport === "stdio") { // [mcp2] local program
      if (!secrets) throw Error("系统安全存储不可用，不能启动本机MCP");
      let env = {};
      if (envCipher) { try { env = JSON.parse(secrets.open(envCipher)); } catch { throw Error("本机MCP的环境变量无法解密，请重新填写"); } }
      return new StdioMcpClient(url, { command: row.command, args: row.args, env }, { validate, spawnFn, cwd: path.join(localDir || path.join(os.tmpdir(), "quank-mcp"), row.id) });
    }
    let token;
    if (auth === "bearer") {
      if (!cipher || !secrets) throw Error("MCP凭据不可用，请重新配置");
      token = bearerToken(secrets.open(cipher));
    } else if (auth === "oauth") { // [mcp2] browser sign-in grant, refreshed on expiry or a 401
      if (!row.encryptedGrant || !secrets) throw Error("请先在 MCP 连接器里点「登录」完成浏览器登录");
      const load = () => { try { return JSON.parse(secrets.open(current()?.encryptedGrant || row.encryptedGrant)); } catch { throw Error("登录凭据无法解密，请重新登录"); } };
      const persist = async (g) => { const c = current(); if (!c || c.grantId !== grantId) throw Error("登录状态已变更，请重新发起任务"); c.encryptedGrant = secrets.seal(JSON.stringify(g)); c.oauthExpires = g.expires_at || null; await store.save?.(); return g.access_token; };
      const renew = async () => persist(await refresh(load(), { fetcher }));
      return new McpClient(url, {
        fetcher,
        validate,
        getToken: async () => { const g = load(); return g.expires_at && g.expires_at - Date.now() < 60e3 && g.refresh_token ? renew() : g.access_token; },
        onUnauthorized: async () => { const g = load(); if (!g.refresh_token) throw Error("登录已过期，请在 MCP 连接器里重新登录"); return renew(); },
      });
    } else if (auth !== "none") throw Error("不支持的MCP认证方式");
    return new McpClient(url, { fetcher, token, validate });
  };
}
