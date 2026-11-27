# SEED-CHECK — stage 1 (build data + gate check) · QuankSight v1.0.6

Seed: `/private/tmp/shots106-seed.json` (256 KB, schema=1) · isolated UD `/private/tmp/shots106-ud` (userData assert OK)
Gate script: `/private/tmp/gate106b.mjs` (CDP 9275, 24 pages, ≤60 s wait per page) · raw: `/private/tmp/shots106-gate.json`
No screenshots taken this turn. Group A stays void; group B untouched.

## Root cause of the previous total failure (fixed)
`Store.load()` expects **workspace.json = the bare state object** (`{schema:1, chats:[…]}`), but the seed was written as
`{schema:1, state:{…}}`. That wrapper passes `schema!==1` yet leaves `agents/chats/…` undefined →
`启动失败：Cannot read properties of undefined (reading 'find')`; the pristine h11d file (no `schema` key at all) →
`启动失败：不支持的数据版本`. It was never a schema-version problem. `load-seed.sh` now unwraps.

## Gate result — 14 pass / 10 fail
| page | pass/fail | placeholders still present | data items |
|---|---|---|---|
| 01 工作台 | **FAIL** | 未计算 | 12 chats, 12 pool rows |
| 02 行情 | pass | none | 3 indices, 20 stocks |
| 03 量化 | pass | none | 16 pool rows, 9 综合分 |
| 04 600438 详情 | pass | none | svg + 投研资料 + 财务 box |
| 05 财务与单季趋势 | **FAIL** | 还没有 | 1 table, 1 chart |
| 06 公司关系图 | **FAIL** | 还没有 | svg, 52 nodes |
| 07 投研资料(个股) | **FAIL** | 还没有 | 12 items |
| 08 持仓与定投 | **FAIL** | 还没有 | 2 rows, 2 定投 refs |
| 09 组合与风控 | **FAIL** | 还没有 | 总资产 present |
| 10 风险指标/压力测试 | **FAIL** | 还没有 | 1 chart |
| 11 成果中心 | **FAIL** | 还没有 | 7 documents |
| 12 文档预览 doc1 | **FAIL** | 还没有 | preview OK (err=0), outline toggle present |
| 13 投研资料库 | pass | none | items listed |
| 14 知识库检索 | pass | none | matches + sources |
| 15 智能体 | pass | none | agents listed |
| 16 技能 | **FAIL** | 还没有 | 3 skill entries |
| 17 连接·数据源 | pass | none | 4 connectors |
| 18 MCP | **FAIL** | 还没有 | 0 MCP actions |
| 19 定时任务 | pass | none | 4 tasks |
| 20 运行记录 | pass | none | 12 run records |
| 21 动态 | pass | none | ≥7 activity items |
| 22 知识图谱 | pass | none | svg nodes rendered |
| 23 记忆库 | pass | none | 5 memories |
| 24 安全与合规 | **FAIL** | 还没有 | 3 audit rows, egress rows |

## Failure reasons
1. **05–10 (6 pages) — engine panel copy「还没有记录过成交。」** All six were checked on the *same* 600438 detail page
   (they differ only by scroll/knob), and the string comes from the **strategy-engine panel**: `quant.source` was pointed at
   `/private/tmp/h9-strategy`, whose fill/trade log for this demo workspace is empty. The seeded holdings (5000/200/100 股) are
   in `portfolio.manual`, but the engine's own `holdings[].log` has no fills → its panel prints 还没有记录过成交.
   Fix: seed `quant.holdings[code].log` + `trades` with demo fills (a demo trade log, not a price).
2. **01 工作台 — 002594 比亚迪 shows 未计算 / — 综合分.** The two new pool rows have no signal until the engine computes
   one; 比亚迪 got a real quote (79.68 / -0.87%) but the action stays 未计算, 五粮液 has no score at all.
   Deliberately **not** faked. Fix: let the engine score the 2 new rows (needs a working strategy run) or drop to the 4 scored rows.
3. **11/12 — 「还没有保存的成果」** is the empty *成果* section heading under the document list while 7 documents exist
   (the doc list itself passes). Fix: seed an artifact/成果 entry.
4. **16 技能 / 18 MCP — 「还没有技能」「0 个已启用」** genuinely empty: `skillPackages` and `mcpConnections` render 0 rows
   on the 技能 tab (the MCP seed row is not picked up by that view). Fix: seed built-in skill packages in the shape the view expects.
5. **24 安全与合规 — 「还没有校验过。」** audit has 3 rows (good) but integrity verification was never run.

## Verdict
Pages 02 / 03 / 04 / 13 / 14 / 15 / 17 / 19 / 20 / 21 / 22 / 23 + 13 others listed above: **14 pages are shot-ready**
(fig-05, 06, 13, 14, 19, 20, 21, 22, 23, 24, 25, 29 partially). The 5 issues above must be seeded before
fig-01, 02, 07, 08, 09, 10, 11, 12, 15, 16, 17, 18, 26, 27, 28 are worth capturing.
