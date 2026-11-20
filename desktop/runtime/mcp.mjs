import { mcpUrl } from "../services/agent-profile.mjs";
/** Bounded per-run Streamable HTTP client. No subprocess, OAuth, reconnect or hidden retry; optional exact-endpoint bearer. */
export class McpClient {
  #closed = false;
  #url;
  #token;
  #validate;
  #getToken;
  #onUnauthorized;
  #dyn = new Set();
  #override;
  constructor(url, { fetcher = fetch, token, validate = () => {}, getToken = null, onUnauthorized = null } = {}) {
    this.#getToken = getToken; // [mcp2] OAuth access token supplier and refresh-on-401
    this.#onUnauthorized = onUnauthorized;
    if (
      token !== undefined &&
      (typeof token !== "string" ||
        token.length < 8 ||
        token.length > 4096 ||
        !/^[A-Za-z0-9._~+\/-]+=*$/.test(token))
    )
      throw Error("MCP凭据无效");
    this.#token = token;
    this.#validate = validate;
    this.#url = mcpUrl(url);
    this.fetcher = fetcher;
    this.sequence = 0;
  }
  get url() {
    return this.#url;
  }
  redact(value) {
    if (!this.#token && !this.#dyn.size) return value;
    let s = JSON.stringify(value);
    for (const t of [this.#token, ...this.#dyn]) if (t) s = s.split(t).join("[凭据已隐藏]");
    return JSON.parse(s);
  }
  parse(input) {
    try {
      return JSON.parse(input);
    } catch {
      throw Error("MCP响应JSON无效");
    }
  }
  async rpc(method, params, signal, options) {
    try {
      return await this.request(method, params, signal, options);
    } catch (e) {
      if (this.#token || this.#dyn.size || this.#getToken) {
        // Transport errors and parse diagnostics must never expose headers/body.
        const known = /^(MCP|不支持|测试期间|智能体|登录|请先)/.test(e.message);
        throw Error(
          known
            ? [this.#token, ...this.#dyn].filter(Boolean).reduce((m, t) => m.split(t).join("[凭据已隐藏]"), e.message)
            : "MCP认证请求失败或已取消",
        );
      }
      throw e;
    }
  }
  async request(method, params, signal, { notification = false, retried = false } = {}) {
    if (this.#closed) throw Error("MCP连接已关闭");
    this.#validate();
    signal?.throwIfAborted();
    const id = ++this.sequence,
      body = {
        jsonrpc: "2.0",
        ...(notification ? {} : { id }),
        method,
        ...(params ? { params } : {}),
      };
    const bearer = this.#token || this.#override || (this.#getToken ? await this.#getToken() : undefined);
    if (bearer && bearer !== this.#token) {
      if (typeof bearer !== "string" || bearer.length > 8192 || !/^[A-Za-z0-9._~+\/-]+=*$/.test(bearer)) throw Error("MCP凭据无效");
      this.#dyn.add(bearer);
    }
    const headers = {
      ...(bearer ? { Authorization: "Bearer " + bearer } : {}),
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(this.version ? { "MCP-Protocol-Version": this.version } : {}),
      ...(this.session ? { "Mcp-Session-Id": this.session } : {}),
    };
    const timed = AbortSignal.timeout(15000),
      combined = signal ? AbortSignal.any([signal, timed]) : timed;
    const r = await this.fetcher(this.url, {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      headers,
      body: JSON.stringify(body),
      signal: combined,
    });
    try {
      this.#validate();
    } catch (e) {
      await r.body?.cancel();
      throw e;
    }
    if (!r.ok) {
      await r.body?.cancel();
      if (r.status === 401 && this.#onUnauthorized && !retried) { // [mcp2] one refresh, then fail
        const next = await this.#onUnauthorized();
        if (typeof next === "string" && next) { this.#override = next; return this.request(method, params, signal, { notification, retried: true }); }
      }
      if ([401, 403].includes(r.status))
        throw Error(
          "MCP HTTP " +
            r.status +
            "：认证失败或权限不足，请检查凭据；未自动重试",
        );
      throw Error("MCP HTTP " + r.status);
    }
    const session = r.headers.get("mcp-session-id");
    if (session) {
      if (!/^[\x21-\x7e]{1,256}$/.test(session)) throw Error("MCP会话标识无效");
      if (this.session && session !== this.session)
        throw Error("MCP会话发生变化");
      this.session = session;
    }
    if (notification) {
      await r.body?.cancel();
      return;
    }
    const reader = r.body?.getReader();
    if (!reader) throw Error("MCP响应为空");
    const decoder = new TextDecoder(),
      sse = (r.headers.get("content-type") || "").includes("text/event-stream");
    let input = "",
      size = 0;
    const check = (value) => {
      if (value?.jsonrpc !== "2.0" || value.id !== id)
        throw Error("MCP响应ID不匹配或不支持服务端请求");
      if (value.error) throw Error("MCP远端错误 " + String(value.error.code));
      if (!Object.hasOwn(value, "result")) throw Error("MCP结果无效");
      this.#validate();
      return this.redact(value.result);
    };
    try {
      while (true) {
        combined.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) {
          input += decoder.decode();
          break;
        }
        size += value.byteLength;
        if (size > 1048576) throw Error("MCP响应超过1MiB");
        input += decoder.decode(value, { stream: true });
        if (sse) {
          input = input.replace(/\r\n/g, "\n");
          let split;
          while ((split = input.indexOf("\n\n")) >= 0) {
            const event = input.slice(0, split);
            input = input.slice(split + 2);
            const data = event
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trimStart())
              .join("\n");
            if (!data) continue;
            const v = this.parse(data);
            if (v.id === id) return check(v);
            if (v.method && !v.id) continue;
            throw Error("不支持的MCP服务端请求");
          }
        }
      }
      if (sse) throw Error("MCP事件流缺少对应结果");
      return check(this.parse(input));
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
  async discover(signal) {
    const init = await this.rpc(
      "initialize",
      {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "QuanK", version: "0.32.0" },
      },
      signal,
    );
    if (typeof init.protocolVersion !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(init.protocolVersion) || init.protocolVersion < "2025-03-26") // [mcp2] newer versions accepted
      throw Error("不支持的MCP协议版本");
    this.version = init.protocolVersion;
    await this.rpc("notifications/initialized", undefined, signal, {
      notification: true,
    });
    const tools = [];
    let cursor;
    const cursors = new Set();
    for (let i = 0; i < 10; i++) {
      const result = await this.rpc(
        "tools/list",
        cursor ? { cursor } : undefined,
        signal,
      );
      if (!Array.isArray(result.tools)) throw Error("MCP工具目录无效");
      tools.push(...result.tools);
      if (tools.length > 128) throw Error("每个MCP最多128项工具");
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
      if (
        typeof cursor !== "string" ||
        cursor.length > 1000 ||
        cursors.has(cursor) ||
        i === 9
      )
        throw Error("MCP分页无效");
      cursors.add(cursor);
    }
    const seen = new Set();
    for (const t of tools) {
      t.description ??= "";
      if (
        !/^[A-Za-z0-9_-]{1,48}$/.test(t.name) ||
        seen.has(t.name) ||
        typeof t.description !== "string" ||
        t.description.length > 2000 ||
        t.inputSchema?.type !== "object" ||
        JSON.stringify(t.inputSchema).length > 12000 ||
        /"\$(?:ref|id|schema)"/.test(JSON.stringify(t.inputSchema))
      )
        throw Error("MCP工具定义不支持或超限");
      seen.add(t.name);
    }
    return tools;
  }
  async call(name, args, signal) {
    return this.rpc("tools/call", { name, arguments: args }, signal);
  }
  async close() {
    try {
      // A revoked or changed credential must not be sent even for cleanup.
      this.#validate();
      if (this.session)
        await this.fetcher(this.url, {
          method: "DELETE",
          redirect: "error",
          credentials: "omit",
          headers: {
            "Mcp-Session-Id": this.session,
            "MCP-Protocol-Version": this.version,
            ...((this.#token || this.#override) ? { Authorization: "Bearer " + (this.#token || this.#override) } : {}),
          },
          signal: AbortSignal.timeout(2000),
        })
          .then((r) => r.body?.cancel())
          .catch(() => {});
    } catch {
    } finally {
      this.#closed = true;
      this.session = undefined;
      this.#token = undefined;
      this.#override = undefined;
    }
  }
}
