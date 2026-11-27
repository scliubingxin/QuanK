# demo-data — 界面截图用演示数据与脚本

给 QuankSight v1.0.6 截图用的**纯演示**工作空间数据 + 取证脚本。数据里的人物、持仓、聊天、
公告都是演示内容（工作空间名就叫「QK 演示工作空间」），不含任何真实账户、真实持仓或密钥。

## 内容

| 文件 | 用途 |
|---|---|
| `seed-v106.json` | 演示工作空间数据（256 KB）。schema=1，可直接作为 `workspace.json` |
| `build-seed.py` | 由 `h11d-seed.json` 生成 `seed-v106.json`（docx/xlsx/pptx 用 python-docx / openpyxl / python-pptx 真实生成） |
| `gate-check.mjs` | 截图前「占位符门禁」：CDP 打开 24 个页面，检查 `暂无数据/还没有/加载中/未计算…`，每页最多等 60 s，结果写 `shots106-gate.json` |
| `load-seed.sh` | 把 seed 装进**隔离**的 userData 并启动应用 |
| `SEED.md` / `PLAN.md` / `SEED-CHECK.md` | 数据规格 / 截图清单 / 门禁检查结果 |

## 数据规模

股票池 6 只（600438 通威、300750 宁德、600519 茅台、601012 隆基、002594 比亚迪、000858 五粮液）·
持仓 3 只 + 现金 52,000 · 风控规则 4 条 · 价格提醒 2 条 · 记忆 5 条 · 知识图谱 16 节点 / 24 边 ·
会话 6 个 · 动态 7 条 · 定时任务 4 个 + 12 条运行记录 · 文档 7 个（docx/xlsx/pptx/html/md）·
投研资料 11 条 · 连接 4 个 + MCP 1 个。

**不写任何假行情。** 股票池里没有价格字段的股票（002594 / 000858）由应用自己抓真实报价；
买卖点、综合分由本机策略引擎计算。

## 用法

```bash
./load-seed.sh                 # 隔离 UD 启动（默认 /private/tmp/shots106-ud）
node gate-check.mjs            # 截图前门禁检查
```

## 注意

- 只写 `/private/tmp/shots106-ud`，**绝不**碰 `~/Library/Application Support/Actwill AI`，也不启动 `/Applications/QuankSight.app`。
- `Store.load()` 读的是**裸 state 对象**（`{schema:1, chats:[…]}`），不是 `{state:{…}}` 包装；
  `load-seed.sh` 会自动解包，否则启动即报「不支持的数据版本」或 `reading 'find'`。
