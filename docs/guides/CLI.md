# 命令行 quank（v0.51.0）

## 开启
「安全与合规 → 命令行 quank → 开启并安装 quank」。会做三件事：
1. 在用户数据目录（`~/Library/Application Support/QuankSight/`）启动本机套接字 `quank.sock`（权限 0600），并生成随机令牌 `cli.token`（0600）。每次开启都会换新令牌。
2. 把命令脚本复制到 `~/Library/Application Support/QuankSight/cli/quank.cjs`（应用启动时自动更新）。
3. 写入 `~/.local/bin/quank`：一个 shell 包装脚本，用 QuankSight 自带的 Electron（`ELECTRON_RUN_AS_NODE=1`）运行上面的脚本，不需要另装 Node。如果那个位置已有不是 QuankSight 装的文件，不会覆盖。

终端里找不到 `quank` 时，在 `~/.zprofile` 里加一行 `export PATH="$HOME/.local/bin:$PATH"`。

## 用法
`quank --help` 列出全部子命令。所有子命令都映射到对话里的同名指令（`services/app-tools.mjs`），`quank tools` 列出全部 74 个，`quank call <指令> key=value …` 直接调用。加 `--json` 输出原始 JSON。

退出码：0 成功；1 失败或用户在确认框里拒绝（`check` 有必须修改项时也是 1）；2 参数错误；3 QuankSight 已锁定；4 QuankSight 没有运行或命令行没开。

## MCP（`quank mcp`）
stdio，换行分隔的 JSON-RPC 2.0。支持 `initialize`、`ping`、`tools/list`、`tools/call`。工具 = 全部 `app_*` 指令 + `quank_ask`。结果以文本内容返回 JSON；`status: failed` 时 `isError: true`。调用标记为「发给模型」，按隐私设置打码金额。

Claude Desktop / Cursor 配置：
```json
{"mcpServers": {"quank": {"command": "/Users/<你>/.local/bin/quank", "args": ["mcp"]}}}
```

## ACP（`quank acp`）
stdio，Agent Client Protocol v1：`initialize`、`authenticate`、`session/new`、`session/prompt`（`agent_message_chunk` 流式更新，`stopReason: end_turn | cancelled`）、`session/cancel`。每个会话对应一个 QuankSight 对话（`acp-<id>`），对话记录在 QuankSight 里能看到。

## 协议（`services/cli-server.mjs`）
每行一个 JSON：`{id, token, method, params}` → `{id, result}` 或 `{id, error: {message, code}}`；`ask` 期间会多次返回 `{id, event: "delta", text}`。方法：`hello`、`tools.list`、`tools.call {name, args, audience, via}`、`ask {prompt, chatId, agentId, via}`、`ask.cancel {chatId}`。令牌不对返回 `QK_TOKEN`，锁定时返回 `QK_LOCKED`（`hello` 除外）。

## 安全边界
- 只有本机、同一个 macOS 账户能连接；不监听网络端口。
- 修改类操作照样弹出 QuankSight 的确认框；拒绝时返回 `status: denied`。
- 所有写操作和 `ask` 记入操作审计，来源为「cli / mcp / acp」。
- 离线模式、应用锁对命令行同样生效。默认关闭，关闭时删除套接字和令牌。
