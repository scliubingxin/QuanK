# QuanK · 对标 AWS Quick · P1 核心体验（任务说明，可中断续做）

仓库：`wb-par/quick`，分支 `feat/quick-p1`（基于 84022ca）。架构：本机优先，所有数据存在本机 `workspace.json`，模型调用只到用户配置的服务。

## 规则
- 代码由主助手编写；deepcode 只负责跑测试、打包、提交和推送。
- 每个模块完成后提交一次（前缀 `[p1-mN]`），并在本文件末尾「进度」追加一行。
- 禁止 git stash / reset / checkout -- / clean / rebase / force push。
- 不破坏现有 Office 编辑器、知识检索、审批、运行队列等已有能力；新增能力默认安全（不扩大工具权限）。

## 模块
| # | 模块 | 对标 Quick | 验收要点 |
|---|---|---|---|
| M1 | 长期记忆 v2 | My context → Memories；Sources 中的记忆 | 自动学习（可关）、按相关性选取注入、回复下显示「参考了 N 条记忆 / 已记住」并可删除、记忆页可编辑/删除/全部清除/开关、敏感信息不记、无痕对话不读不写 |
| M2 | 对话管理 | Recents、文件夹、置顶、归档、搜索、重命名、导出、无痕 | 侧栏分组（置顶/文件夹/最近/归档）、全文搜索、导出 Markdown、无痕对话不进最近列表且离开即删除 |
| M3 | 斜杠命令与上下文用量 | `/` 命令、Context meter、`/compact` | /clear /compact /export /rename /mode /help 等；输入框显示上下文估算用量；/compact 生成摘要替代历史 |
| M4 | 后台任务与通知 | Send to background、完成通知、AFK recap | 对话可转后台继续，完成后系统通知；离开后返回显示「离开期间」摘要 |
| M5 | 计划模式 | Plan mode | 先生成可编辑计划卡，确认后逐步执行，每步状态可见 |
| M6 | 深度研究 | Deep research | 多轮检索（浏览器/知识库）→ 带引用报告 → 保存为文档 |

## 进度
- 2026-11-18 P1 启动；M1 编码中。
