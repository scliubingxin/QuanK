# 安全与合规（F5，v0.50.0）

## 本机数据加密
- 范围：`~/Library/Application Support/QuanK/workspace.json`（对话、持仓、组合、笔记、风控规则、设置）。生成的文档、策略引擎目录、审计日志不在加密范围内。
- 格式：`QKE1` + 12 字节 IV + 16 字节 GCM 标签 + 密文（AES-256-GCM）。数据密钥 32 字节随机生成，经 `safeStorage`（macOS 钥匙串）封装后存于同目录 `workspace.key`。
- 开启：先复制一份 `workspace.plain-backup-<时间>.json`，再加密写入并读回比对；失败自动恢复为未加密。
- 钥匙串不可用或 `workspace.key` 丢失时无法解密，只能用加密备份恢复。

## 加密备份
- `.qkbackup`：JSON 外壳（格式、版本、scrypt 参数 N=2^15 r=8 p=1、盐、IV、GCM 标签、条目数）+ AES-256-GCM 密文（工作区数据 + 审计日志全文）。
- 恢复：先选择文件并输入密码核对条目数，确认后替换数据，原数据另存为 `workspace.before-restore-<时间>.json`，应用重启。应用锁设置保留本机的。

## 应用锁
- 解锁密码只保存 scrypt 哈希；触控 ID 通过 `systemPreferences.promptTouchID`。
- 锁定时 `state` 只返回 `{locked, lock}`，IPC 注册层拒绝 `state`、`security`（仅 view / unlock）以外的所有调用。

## 外发记录与离线模式
- 主进程启动时包装 `globalThis.fetch`：记录主机、路径（去掉查询参数）、方法、发送字节、状态、耗时；本机地址不记录。只在内存里保留最近 2000 条。
- 离线模式下对非本机地址的请求在发出前抛出 `QK_OFFLINE`。

## 操作审计
- 文件：`audit/audit-log.jsonl`，每行 `{seq, time, kind, action, target, detail, via, prev, hash}`，`hash = sha256(prev + "|" + JSON[seq,time,kind,action,target,detail,via])`，首条 `prev` 为 64 个 0。
- 记录来源：IPC 写操作（按通道与 action 判断，读操作不记）、确认框结果、对话指令中的写操作、调用大模型（主机与路径）、安全设置变更、合规检查结果。只记标识（代码、ID、字段名），不记数值和密钥。

## 合规审阅
- 规则见 `desktop/src/shared/compliance.js` 的 `RULES`；导出时由 `services/research.mjs` 的 `render` 统一套用免责声明、风险提示和检查。
- 规则检查只能发现常见表述，对外发布前仍需人工复核。

## 冒烟检查
`node desktop/scripts/smoke-ipc.mjs --app <QuanK.app> --out <目录>`：需要先退出正在运行的 QuanK。只调用只读操作，输出 `smoke-report.json` 和三张截图。
