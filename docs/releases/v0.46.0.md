# QuanK v0.46.0 发布进度

## 阶段0 — 仓库定位 ✅

- **仓库路径**：`/Users/liubingxin/wb-par/QuanK`
- **Remote**：`https://github.com/scliubingxin/QuanK.git`
- **HEAD**：`087fb37` 技能移植与 QuanK 品牌 PPT
- **状态**：git status 干净（无未提交改动）
- **完成时间**：2026-11-21

---

## 阶段1 — 只读核实告警去重 bug ✅

### 1. 提交 4dc1456

**未在本仓库历史中**。对应功能由提交 `3bbc5a9`（F1 行情：接口限流时自动降级，2026-11-21）实现。

### 2. 告警 check() 中 once() 是否已修复

**已修复**。文件：`desktop/services/market.mjs`，第 211–224 行。

关键代码（第 212 行）：
```js
const once = key => { if (m.fired[key] === day) return false; m.fired[key] = day; return true; };
```

涨停（第 223 行）：
```js
if (atLimit) { if (once(`limit:${q.code}:${dir}`)) { once(`move:${q.code}:${dir}`); ... } }
```

- `dir = q.pct > 0 ? 'u' : 'd'`，涨停用 key `limit:code:u`，跌停用 `limit:code:d`
- 两者 key 完全独立，互不消耗，不存在涨停 once() 消耗导致跌停无法触发的问题
- **结论**：once() 已正确移出 if/else if 条件判断，涨跌停各自独立去重 ✅

### 3. pools() 降级修复

**已修复**。文件：`desktop/services/market.mjs`，第 125–128 行（pools()）+ 第 130–148 行（getOverview()）。

- 两个子请求各自 `.catch(() => ({total: null, date: ''}))` ——永不 reject，改为返回空值
- `getOverview()` 用 `Promise.allSettled` + `poolEmpty` 判断
- **全部失败**（前5个 part 全 rejected 且 poolEmpty）：有缓存则返回 `{...overview, stale: true}`，否则 throw（第 138 行）
- **部分失败**：`overview.partial = true`（第 147 行）

UI 文案（`desktop/src/ui/market.js` 第 27 行）：
```js
const warn = o.stale ? '<p class="mk-warn">行情接口暂时不可用，显示的是上次获取的数据。</p>'
           : o.partial ? '<p class="mk-warn">部分行情暂时没有取到，稍后会自动重试。</p>' : '';
```

与任务要求完全一致 ✅

### 4. 相关测试结果

```
node --test tests/f1-market.test.mjs
# tests 8 / pass 8 / fail 0  ✅

node --test tests/quant-q5.test.mjs tests/quant-q4.test.mjs tests/quant-q3.test.mjs tests/quant-q1.test.mjs
# tests 24 / pass 24 / fail 0  ✅
```

---

## 全量测试基线记录（阶段1完成时）

| 指标 | 基线 | 当前 | 差值 |
|------|------|------|------|
| 总测试数 | 1259 | 1262 | +3 |
| 通过 | — | 1110 | — |
| 失败 | 142 | 141 | **-1（改善）** |
| 取消 | — | 1 | — |
| 跳过 | — | 10 | — |

**与 market/M3/告警相关的失败：0 条**（全量 141 条失败均为 LibreOffice 原生编辑、OCR、PDF、PPT 等不相关模块）。

### 141 条失败用例（已排序）

<details>
<summary>展开查看完整失败列表</summary>

- AI Word replace no-op cannot be published or bypass receipt by manual save
- CLI preparation rejects revoked grants, traversal, invalid argument arrays; env omits API secrets
- Excel picture survives native edit and corrupted media blocks save and retry
- HTTP model fixture replaces selected Word text with multiple checked paragraphs
- HTTP model top-only border reloads same session; approval scope and independent DOCX verify preserved red interiors
- Office controller can discard a failed checked draft after confirmation
- Office manual matrix controller reaches real native save and keeps literal values
- PPT arrows outside text edit and after page change never move shapes; worker validates expected text
- PPT cancellation during running audit blocks native paste and leaves revision clean
- PPT crop receipt refuses changed or removed source crop and blocks native changed output
- PPT format cancellation or audit disk failure blocks native mutation before dirty flag
- PPT format native no-op cannot publish or use manual save; real changed draft retries after disk failure
- PPT format refusal stale sequence native bad args and page drift send no format command
- PPT native edit with disk failure keeps checked draft and can explicitly retry save
- PPT native no-op cannot publish or bypass receipt using manual save
- PPT refused approval and stale sequence cannot dispatch native replacement
- PPT size-only and color-only requests each keep the other known property
- PPT text replacement keeps real picture placement and detects image movement
- PPT unsupported effects and foreign namespace run payloads fail preflight with no native paste
- Word edit preserves picture bytes and rejects modified or missing media
- Word multiline manual replacement produces real paragraphs and preserves later paragraphs
- Word selected font formatting preserves inline picture and rejects image tampering
- Word selection edit preserves known formatting outside selected text
- a killed idle real LibreOfficeKit worker is replaced before the next preview without replay
- actual HTTP CJK font tool writes eastAsia independently and preserves mixed selection text
- actual HTTP font tool changes real Word run properties without replacing text
- actual HTTP model tool replaces real native selection; chat and revision persist
- actual HTTP tool loop applies real Word table outline and padding; independent DOCX and reload verify
- actual Python sibling resource execution and source SHA tampering
- actual six-page PDF only recognizes first five and reports the omitted page
- arguments are strictly typed, bounded and exact
- audit persistence failure blocks native AI write before paste
- blank rectangle can be filled and clears remain bounded; another sheet context cannot be reused
- cancel, invalid language, changed source and OCR failure do not create a document
- cancellation during durable document save rolls back the recognized result
- cancellation during durable format audit never reaches native format dispatch
- cancellation during final Word snapshot after durable audit dispatches no native format
- cancellation during post-initialization final native table query leaves no new revision
- cancellation interrupts actual waiting model request without publishing native edits
- cancelling one real Office preview does not stop a separate preview
- cleanup failure closes the draft but is reported and never deletes saved document
- color denial, stale selection, cancellation during audit and audit fault never dispatch native changes
- denial, stale part/fingerprint, cancellation and audit failure dispatch no cell writes
- deny, stale selection, cancellation and audit failure dispatch no native format
- discard audit failure preserves unsaved draft and saved document
- discard without a draft never asks for destructive confirmation
- document disk failure retains explicit retryable draft and does not claim a saved revision
- document failure keeps a verified retryable draft, while native no-op mismatch blocks explicit save too
- explicit discard denial keeps draft; approval closes only draft and preserves saved document
- failed checked Excel draft cannot be overwritten by a later manual or AI operation
- failed native outline returns its verification error without another model call
- final context version drift prevents formula dispatch and cannot overwrite concurrent revision
- font approval denial, stale selection, cancellation and audit failure publish no revision
- grid refusal, stale fingerprint, cancellation and failed durable audit do not initialize replacement
- invalid input is rejected before starting a worker and valid request works
- literal native no-op cannot publish through manual save retry
- long manual PPT replacement remains bounded while AI limit remains 600
- manual PPT selected text may be deleted but AI empty replacement stays forbidden
- manual Word controller applies selected edit through real native kit
- manual Word cross-paragraph replacement saves actual DOCX
- manual Word no-op cannot bypass receipt by saving again
- manual Word selection deletion uses real Kit; AI empty replacement is denied
- manual Word selection uses real Kit and saves a new checked revision
- manual bounded cell edit uses real native matrix and audit without a second approval
- manual cell edit rejects wrong shape, formulas and audit failures without writes
- manual literal matrix preserves leading zeros and formula-looking text in native XLSX
- manual selected PPT editing verifies output and rejects stale selections without extra approval
- manual selection edit audit failure blocks native mutation
- native Excel output changed outside selection cannot publish or bypass on retry
- native outline no-op cannot be published or bypassed by draft save
- native output with right text but changed format cannot publish or bypass using manual save
- native worker independently rejects bad keys and extra payload without changing selection
- native-selected two-page PDF becomes bounded source-cited chat document after actual OCR
- no-op formula receipt cannot be bypassed by manual save; disk failure can retry checked draft
- no-op output and explicit save cannot publish a false Word format success
- no-op output verification blocks success and explicit save; disk failure retains retryable format draft
- opened PDF cannot silently refer to a replaced path, even with identical bytes
- opt-in production preview service checks source versions and creates three real formats
- ordinary PPT input does not publish when native paste is a no-op
- ordinary PPT input replaces selected text with native and saved-output guards
- ordinary text, stale fingerprint, refusal, cancellation and audit failure never dispatch border
- packaged Python fixed path, unsupported arch/missing payload and escaping symlink reject
- page selection outside actual document fails without producing attachments
- partial native format failure keeps checked draft; mismatched manual save and new format are blocked
- preset is executable, scoped registry requires CLI and separate artifact permission
- private worker rejects forged scope, formula, dimensions and extra fields before native undo changes
- private worker rejects forged table fingerprint and invalid style before native changes
- queued operation cannot mutate a session discarded after native confirmation
- real Calc selected cells write actual XLSX values with native engine
- real Excel selection sets and clears bold and italic while preserving formulas
- real HTTP grid tool reloads same session, renders blue borders, preserves old bytes and native future edits
- real HTTP model tool loop stops when a queued knowledge search is cancelled
- real Kit keyboard selects a substring; formatting preserves every outside character and size
- real Kit undo/redo stack follows native edits, preserves durable revisions and clears redo branch
- real LibreOffice PDF includes actual Word text and embedded PNG; source parts retained
- real LibreOffice converts XLSX and PPTX into paginated PDFs
- real LibreOfficeKit opens Excel/PPT, switches parts and renders actual pixels
- real LibreOfficeKit process reuses one worker across independent documents without content crossover
- real LibreOfficeKit renders Word, native selection and edit auto-commit; no external collection
- real Node input/output, JSON observation, independent approval and persistent import
- real Office worker refuses reset while a previous job file remains
- real PPT edit within multi-paragraph shape saves other paragraphs and slides
- real PPT native keyboard selects one word; AI replacement saves exact text and all other slides
- real PPT selected word format changes size and color only; original text and other runs survive
- real PPTX to PDF export writes verified PDF and preserves original source
- real cancellation and output overflow preserve non-success status
- real merged, nested and over-limit table selections stay unavailable
- real native Excel format changes target styles, retains data/formulas/other sheet and previous bytes
- real native colors survive disk retry, reload and undo without replacing original text
- real native literal text preserves zeroes, date and formula-like strings, spaces and apostrophes
- real native matrix updates only current rectangle, retains cell formatting/formulas/other sheet and old bytes
- real native single-cell SUM preserves data/other formulas/styles and verifies dependent cached results
- real pooled LibreOfficeKit alternates Word, Excel and PowerPoint without crossing text
- real ready worker abort exits owned process; invalid PDF export payload rejects
- real shared Kit PDF exports Word, two-sheet Calc and two-slide Impress without CLI or source mutation
- real styled PPT selection preserves explicit style after native replacement and Store reload
- receipt independently rejects wrong scalar cache, wrong formula or outside data drift
- refused/stale/cancelled/audit-failed formula never reaches native mutation
- replacement init, candidate drift and document disk failure keep original session and clean candidate
- revision changed during final native selection query blocks border before dispatch
- revision changes during final native context query block formatting before mutation
- revision drift in last native context check fails before writes; merged selection is unavailable
- selected PDF OCR is sent through the real conversation attachment path only after send
- seven supported functions, comparison, percent and absolute refs compute across native save rounds
- shutdown during document commit rolls back persisted grid and closes the replacement
- source changes during OCR or storage and cancellation publish no attachment
- source mutation during document persistence rolls back the saved OCR document
- specified PDF pages are genuinely recognized with source page numbers and omitted-page notice
- stale selection and concurrent document revision are rejected by native workspace
- startup cancellation and deadline kill a real never-ready protocol fixture without a live orphan
- symlink output and code modification fail; modified artifact cannot import
- tests/image-ocr-03737.test.mjs
- tests/ocr-source-preview-03758.test.mjs
- tests/ocr-wasm-03760.test.mjs
- tests/pdf-ocr-03740.test.mjs
- two concurrent real LibreOfficeKit workers keep distinct documents separated
- unconfirmed worker termination reports cleanup failure and does not remove temp directory
- undo save failure keeps native draft and history for explicit save retry
- uniform selected Word formatting survives real replacement and altered output is rejected
- worker independently rejects unsafe formula syntax, extra fields and false cell scope before history changes
- worker rejects extra commands, forged scope and malformed formats before native history changes
- worker rejects malformed colors and extra properties without changing undo history
- worker rejects malformed literal objects before writing and keeps native history

</details>

**结论**：141 条失败全部属于 LibreOffice 原生编辑/OCR/PDF/PPT 等模块，与本次 v0.46.0 目标（F1 行情、M3 自选股、告警去重、pools 降级）**无关**，属已知基线失败。

---

## 阶段2–5 — 待执行

等待 Quick 完成业务代码修改后继续。

---

## 阶段2 — niceTicks 修复验证 + 全量回测 + 截图（2026-11-21）

### 1. 文件复制与修复确认

```
cp .../agent_files/quank/QuanK/desktop/src/ui/quant.js → desktop/src/ui/quant.js
```

`niceTicks` 第 82 行修复确认：
```js
end = Math.ceil(hi / step - 1e-9) * step
```

语法检查：`node --check src/ui/quant.js` → **SYNTAX OK**

---

### 2. 指定测试结果

```
node --test tests/v46-detail.test.mjs tests/quant-q1.test.mjs \
     tests/f1-market.test.mjs tests/f1c-ux.test.mjs tests/f1d-avatars.test.mjs \
     tests/f1e-ux.test.mjs tests/f1f-composer.test.mjs tests/f1g-skills.test.mjs
```

**tests 37 / pass 37 / fail 0** ✅

关键用例：
- `return chart: nice ticks include 0, inline sizing beats the icon svg rule, hover columns are invisible` → **pass** ✅

---

### 3. 全量测试结果

| 指标 | 上轮基线 | 本轮 | 差值 |
|------|----------|------|------|
| 总测试数 | 1262 | 1268 | +6 |
| 通过 | 1110 | 1114 | +4 |
| 失败 | 141 | 143 | +2 |
| 取消 | 1 | 1 | 0 |
| 跳过 | 10 | 10 | 0 |

#### 新增失败（1 条，非 v0.46.0 范围）

```
not ok 955 - low-level tail mode still honors an actual deadline and ordinary CLI keeps output_limit protection
  location: tests/project-services.test.mjs:16:1
  failureType: testCodeFailure
  error: The expression evaluated to a falsy value:
    assert(tail.truncated)
  code: ERR_ASSERTION
  name: AssertionError
  expected: true
  actual: false
  operator: ==
  stack:
    TestContext.<anonymous> (file:///...desktop/tests/project-services.test.mjs:16:369)
    process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    async Test.run (node:internal/test_runner/test:1054:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
```

**结论**：属于 `project-services.test.mjs` 中与 tail 截断逻辑相关的测试，与 v0.46.0 目标（niceTicks/收益率图、F1 行情、M3 自选股）无关。交 Quick 处理。

#### 2 条已知偶发测试（单独重跑）

```
node --test tests/knowledge-agent-cancel-037112.test.mjs
# tests 5 / pass 5 / fail 0  ✅

node --test tests/knowledge-vector-queue-037112.test.mjs
# tests 4 / pass 4 / fail 0  ✅
```

两条偶发测试单跑均稳定通过。

---

### 4. 回测收益率图截图

**路径**：`chat_agent_files/.../quank/preview/v46-return.png`（已覆盖）

`svg.q-return-svg` getBoundingClientRect（只读）：
- **width**: 1092 px
- **height**: 340 px
- top: 119.8 px，left: 293 px（视口内完整显示）

视觉确认：
- ✅ 曲线完整铺满卡片宽度
- ✅ 背景无黑色竖条
- ✅ 纵轴刻度为整齐值（−40%、−20%、0%、+20%、+40%），0% 只出现一次
- ✅ 标签不重叠

临时脚本（`desktop/tmp-v46-return-shot.mjs`）已删除。

---

## 阶段B — README 截图更新（Quick 接手）

**重写脚本**：`desktop/scripts/tmp-shots-v46.mjs`（以 `demo-harness.openDemo()` 为骨架：同一个 http server + `window.actwill` Proxy + `#prompt` 就绪等待）。与原 harness 的唯一差异是注入了一份**演示行情数据**，因为 v0.46 首页新增「市场行情」卡片、量化详情页新增 K 线与收益率图，缺失时截图会停在「正在获取大盘行情…」「正在加载 K 线…」的占位态：

- `wbHost('market', {action:'overview'})` → 返回 `{result: overview, state: {...state, market: {overview, quotes, alerts}}}`：5 个指数（含分时小图）、涨跌家数/涨跌停、10 涨 10 跌、12 个行业 + 10 个概念板块、两市成交额；`quotes` 让股票池卡片显示「实时」价。
- `wbHost('market', {action:'kline'})` → 返回 `{result: {code:'600519', name:'贵州茅台', bars: 300 根日 K, quote}}`。日 K 由确定性行情生成器产出，日期区间覆盖 demo 回测 ops 的日期（2026-06-01 ~ 2026-11-20），最后两根收盘价对齐 demo 详情的 1667.19 / 1688.20（+1.26%）。
- 其余调用（`quant` / 其它 name）原样返回 `structuredClone(state)` 或 `structuredClone(detail)`，与 `openDemo` 行为一致。
- 详情页的「评分构成」区块需要 `summary.factors`，demo-state 的 `DEMO_ADAPTER` 未映射该字段，故在临时脚本里补齐 6 条演示因子（趋势/动量/波动率/量能/估值/情绪，合计 72.4 与 demo 综合分一致）。未改任何 `desktop/src`、`desktop/services`、`desktop/runtime`、`desktop/tests` 代码。

**导航要点（已验证）**：量化页用 `page.evaluate` 点 `.home-quant [data-action="quantHome"]`；个股详情先回顶部再点 `[data-action="quantOpen"][data-id="600519"]`，等 `.q-hero` / `.mk-box .mk-kline` / `.q-return .q-return-svg`；「我的记忆」`[data-page="context"]` 用 `page.evaluate` 触发；没有设置任何 SVG 宽高、没有改 DOM 样式。

**逐张自动校验**（每张截图落地后立即执行）：
1. 用 canvas 解码 PNG 计算亮度均值 / 标准差 / 独立色数 → 空白页判定（阈值 sd≥6、colors≥40）；
2. 视口内所有叶子节点的可见文字里不允许出现 `正在加载/加载中/正在获取/正在计算/加载失败/出错了/操作失败/NaN/undefined/Infinity`；
3. 关键选择器必须存在**且完整落在截图视口内**（`getBoundingClientRect` 判定）；
4. K 线图额外要求视口内 `.mk-mark` ≥ 4 个。

结果：21 张截图全部通过，`problems: []`、`errors: []`。

| 文件 | 尺寸 | 大小 | 校验 |
| --- | --- | --- | --- |
| app-home.png | 2880×1800 | 926KB | 市场行情卡片（5 指数 + 涨跌家数 + 领涨行业）在视口内 |
| app-home-cards.png | 2880×1800 | 623KB | `.qk-grid` 内含市场行情卡片 + 首页量化工作台 |
| app-chat-research.png | 2880×1800 | 431KB | 个股研究对话 |
| app-quant.png | 2880×1800 | 534KB | 股票池 6 张卡片，`.q-live` 实时角标 6 个 |
| app-quant-holdings.png | 2880×1800 | 495KB | 持仓与定投表格 3 行 + 合计 |
| **app-quant-detail.png** | 2880×3922 | 778KB | 持仓卡片 + 评分构成同图（视口高度按 measured 几何自适应，两张卡片都在视口内） |
| **app-quant-kline.png** | 2880×1800 | 455KB | 日 K + MA + 成交量 + MACD，**14 个 B/S 买卖点**在视口内 |
| **app-quant-return.png** | 2880×1800 | 388KB | 收益率对比曲线 + 0% 基准线 + 图例（-40%~+40% 整齐刻度） |
| app-agents.png | 2880×1800 | 573KB | 智能体列表 |
| app-skills.png | 2880×1800 | 553KB | 技能页 |
| app-mcp.png | 2880×1800 | 521KB | 数据源页 |
| app-tasks.png | 2880×1800 | 461KB | 定时任务 |
| app-feed.png | 2880×1800 | 747KB | 动态 |
| app-research-report.png | 2880×1800 | 421KB | 研究报告 |
| app-plan.png | 2880×1800 | 349KB | 计划模式 |
| app-memory.png | 2880×1800 | 411KB | 对话内长期记忆来源 |
| app-graph.png | 2880×1800 | 325KB | 知识图谱 |
| app-memory-page.png | 2880×1800 | 483KB | 记忆库 |
| app-infographic.png | 2880×1800 | 553KB | 信息图 |
| app-miniapps.png | 2880×1800 | 420KB | 小应用 |
| app-narrow.png | 1800×1800 | 569KB | 900px 窄窗口 |

**README 改动**：
- 量化工作台截图表的「个股详情」改为 `![个股详情：持仓卡片与评分构成]`；
- 行情工作台小节新增 `app-quant-kline.png` + `app-quant-return.png` 双列截图与一句图注（买卖点含义、收益率对比含 0% 基准线）。

**临时脚本已删除**（`desktop/scripts/tmp-shots-v46.mjs`），`git status` 中不再有 tmp- 文件。

---

## 阶段C — 版本号与发布日志

### 版本号清单（`grep -rn "0\.45\.0"`，排除 node_modules）

| 文件 | 改动 | 处数 |
| --- | --- | --- |
| desktop/package.json | `"version": "0.45.0"` → `0.46.0` | 1 |
| desktop/package-lock.json | 同上（root + `packages[""]`） | 2 |
| RELEASE_STATUS.json | 同上；`checked_date` 2026-11-16 → 2026-11-21 | 1 |
| SOURCE_MANIFEST.json | 同上（顶层 + 内嵌 release_status） | 2 |
| README.md | shields 徽标 `version-0.45.0` → `version-0.46.0`；下载包名 → `QuanK-v0.46.0-mac-arm64.dmg` | 2 |

`desktop/tests/v45-release.test.mjs` 里硬编码的 `QuanK-0.45.0-arm64.dmg` 属于**历史版本测试**（不可修改），为保持其通过，在 README「更新记录」的 **v0.45** 条目里保留了真实历史包名 `QuanK-0.45.0-arm64.dmg`（v0.45.0 Release 的实际资材名，已用 `gh release view v0.45.0` 核对）。历史日志中的旧版本记录一律未改。

### 发布日志

按仓库习惯把条目原样加到 `ITERATION_LOG.md` **顶部**（该文件最新在上；仓库没有 CHANGELOG.md），并在 README「更新记录」补一条 v0.46 摘要：

```
## v0.46.0 · 2026-11-21 · F1 行情工作台
- 行情：首页新增市场行情卡片，……（原样 6 条）
```

### 语法检查

```
find desktop/src desktop/services desktop/runtime desktop/scripts desktop/main desktop/tests scripts tests \
  -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) | grep -v node_modules   # 638 个文件
node --check <每个文件> → 0 失败
desktop/main.mjs、desktop/core.mjs → ok
```

### 全量测试

`cd desktop && node --test tests/*.test.mjs`

| 指标 | 基线（阶段A） | 本次 |
| --- | --- | --- |
| tests | ~1268 | 1267 |
| pass | — | 1115 |
| fail | ~143 | **141** |
| cancelled | 1 | 1 |
| skipped | 10 | 10 |

失败名单（按文件归组，全部为原生模块/环境缺失）：

```
office-presentation 23 / office-cells 12 / office-chat 11 / pdf-chat-import-03747 9 /
office-table-outline 7 / office-formula 7 / office-word-format 6 / office-table-grid 6 /
office-discard 6 / office-cell-format 6 / skill-runtime 5 / office-preview-pool-03739 5 /
office-pdf 3 / office-literal 3 / office-kit 3 / office-colors 3 / native-office 3 /
office-word-preserve-styles 2 / office-word-media 2 / office-word-cross-selection 2 /
office-navigation 2 / office-history 2 / office-* 各 1 / pdf-* 各 1 / image-ocr / ocr-wasm / ocr-source-preview 各 1
```

典型错误均为环境缺少原生二进制：`找不到命令 /opt/codex/runtimes/codex-primary-runtime/dependencies/bin/override/soffice`、`Error: 运行时路径不安全`（bundled python 缺失）、`路径发生变化`（skill-runtime 资源未打包）。

**对比结论：无新增失败**。基线里的三类已知偶发（knowledge-vector、knowledge-agent-loop-cancel、project-services tail mode）本次全部通过（全量日志中无 EADDRINUSE、无 knowledge/queue/tail 失败），因此失败数由 143 降到 141；与 v0.46 改动相关的 quant / market / ui / README / release 用例 **0 失败**。

关键用例单独复跑（逐文件，避免 11434 端口并发冲突）：

| 用例文件 | pass | fail |
| --- | --- | --- |
| tests/v45-release.test.mjs | 3 | 0 |
| tests/v46-detail.test.mjs | 6 | 0 |
| tests/project-services.test.mjs | 11 | 0 |
| tests/knowledge-agent-loop-cancel-037113.test.mjs | 1 | 0 |
| tests/knowledge-vector-03736.test.mjs | 19 | 0 |
| tests/knowledge-vector-queue-037112.test.mjs | 4 | 0 |

---

## 阶段D — 打包（沿用 v0.45.0 流程：scripts/package-offline-mac.py + scripts/make-dmg.sh）

### 输入校验

| 项 | 结果 |
| --- | --- |
| native-runtimes | `/Users/liubingxin/Downloads/wb-pack-inputs/native-runtimes-040`，架构 arm64，schema 1 |
| RUNTIMES.json 清单 | 声明 20428 个文件；磁盘实际文件/符号链接集合 **完全一致**（多 0 / 少 0） |
| 逐文件字节 | 20428 项 sha256 + 权限位 + 符号链接目标全部匹配，**0 处不符** |
| 版本 pin | `scripts/prepare-native-runtimes.py` PINS 3 个包，与 RUNTIMES.json 的 sha256 **0 处不符** |
| Python wheel 锁 | `desktop/python-wheels.lock.json` 的 wheels 与 RUNTIMES.json `python_packages` **一致** |
| python / libreoffice | 3.12.16+20261026 / 26.8.1.1 |
| Electron 运行时 | `electron-v42.0.0-darwin-arm64.zip` 117,864,828 字节，sha256 `3c619bb8ec6a243142e392335382a3383739a9977ca85067cb1f31599ff993e5`，与 `SHASUMS256.txt` 完全一致 |

### 命令

```
TS=20261121-143842
python3 scripts/package-offline-mac.py \
  --native-runtimes /Users/liubingxin/Downloads/wb-pack-inputs/native-runtimes-040 \
  --runtime /Users/liubingxin/Downloads/wb-pack-inputs/cache/electron-v42.0.0-darwin-arm64.zip \
  --checksums /Users/liubingxin/Downloads/wb-pack-inputs/cache/SHASUMS256.txt \
  --work-dir /tmp/qk-pack-046-$TS \
  --output dist/QuanK-v0.46.0-mac-arm64.zip \
  --signing-tool /Users/liubingxin/Downloads/wb-pack-inputs/apple-codesign-0.29.0-aarch64-apple-darwin/rcodesign

sh scripts/make-dmg.sh /tmp/qk-pack-046-$TS/QuanK.app \
  dist/QuanK-v0.46.0-mac-arm64.dmg \
  scripts/dmg-assets/background.png scripts/dmg-assets/background@2x.png
```

### 产物

| 产物 | 路径 | 字节 | sha256 |
| --- | --- | --- | --- |
| ZIP | `dist/QuanK-v0.46.0-mac-arm64.zip` | 483,673,768 | `39f5270fc5474f8a610f0ae7ebda30f5f765707d1e1baa081692d1aa60800bc9` |
| DMG | `dist/QuanK-v0.46.0-mac-arm64.dmg` | 457,530,561 | `b5864df9b49d257fdd2fd3664e27cfafe44fb556d32d363dbeb01333d1f32cae` |

打包器自校验输出：`version 0.46.0 / arm64 / ad-hoc / verified true / app_entries 20711 / extra_files 5 / closed_inventory true / residual_entries 0`；OFFLINE-MANIFEST：274 个 Mach-O 二进制、93526 代码页通过哈希校验，`app_asar_sha256=e2d0203574d5a6d82cb2e6207bf82106653bbcc61a642625d2e2e2807306ae41`。

### 版本号确认（app 内）

| 位置 | 值 |
| --- | --- |
| `QuanK.app/Contents/Info.plist` CFBundleShortVersionString / CFBundleVersion | 0.46.0 / 0.46.0 |
| `Contents/Resources/app.asar` → package.json | `quank-desktop` / QuanK / **0.46.0** |
| `OFFLINE-MANIFEST.json` | version 0.46.0，architecture arm64 |
| 挂载 DMG 后的 QuanK.app Info.plist | 0.46.0（DMG 含「应用程序」链接与「首次打开.command」） |

其他校验：`codesign -dv` → `Signature=adhoc`、`Identifier=com.quank.desktop`、arm64 thin、`Sealed Resources files=20440`；`hdiutil verify` → CRC32 有效；`unzip -l` → 20716 条（应用 20711 + 5 个配套文件）。

---

## 阶段E — 发布（续跑轮次核对 + 提交 + Release）

### 续跑核对（全部只读通过）

| 检查 | 结果 |
| --- | --- |
| `git status --short` | 33 个已跟踪改动 + 2 个新截图 + RELEASE_v046_PROGRESS.md + desktop/tests/v46-detail.test.mjs，无 tmp- 文件、无 dist/ |
| 新截图存在 | `docs/images/app-quant-kline.png` 455,251 字节、`docs/images/app-quant-return.png` 387,738 字节（README 第 86 行引用两者，第 74 行引用 app-quant-detail.png） |
| 根 `package.json` | `git diff --quiet HEAD -- package.json` → **无差异**（打包器曾拷入同名临时文件，已还原） |
| 版本字段 | `grep -rn "0\.45\.0" desktop/package.json desktop/package-lock.json RELEASE_STATUS.json SOURCE_MANIFEST.json` → **0 处命中**；当前 `"version": "0.46.0"` |
| ITERATION_LOG 顶部 | `## v0.46.0 · 2026-11-21 · F1 行情工作台`（6 条原样） |
| 产物 | dmg 457,530,561 字节 sha256 `b5864df9…32cae`；zip 483,673,768 字节 sha256 `39f5270f…00bc9`，与阶段D 一致；`dist/` 已被 .gitignore 第 42 行 `/dist/` 忽略，`git ls-files dist` 为空 |

### 全量测试（版本号改完后的第二次完整运行，交叉验证）

`cd desktop && node --test tests/*.test.mjs` → tests 1267 / pass 1115 / **fail 141** / cancelled 1 / skipped 10 / todo 0

两次运行的失败标题集合 `diff` **完全一致（IDENTICAL）**，按文件：office-presentation 23、office-cells 12、office-chat 11、pdf-chat-import-03747 9、office-table-outline 7、office-formula 7、office-word-format 6、office-table-grid 6、office-discard 6、office-cell-format 6、skill-runtime 5、office-preview-pool-03739 5、office-pdf/office-literal/office-kit/office-colors/native-office 各 3、office-word-preserve-styles/office-word-media/office-word-cross-selection/office-navigation/office-history 各 2、其余 office-*/pdf-*/ocr-*/image-ocr 各 1。

**对比基线（1268 / 143）**：失败 143 → 141，无新增失败；基线中的四个已知偶发（project-services tail mode、knowledge-vector、knowledge-agent-loop-cancel、queued operation cannot mutate a session discarded after native confirmation）在本轮全量中 "queued operation…" 仍按已知偶发出现在名单内，其余三个全量内未复现（逐文件单跑全部通过：project-services 11/0、knowledge-vector-03736 19/0、knowledge-vector-queue 4/0、knowledge-agent-loop-cancel 1/0、v45-release 3/0、v46-detail 6/0）。

### 发布

```
git add -A            # 37 个文件；dist/、node_modules、tmp-* 均未进索引（已核验）
git commit -m "release: v0.46.0 F1 行情工作台"
git push origin main                      # 087fb37..6e674a7  main -> main
git tag -a v0.46.0 -m "QuanK v0.46.0 · F1 行情工作台"
git push origin v0.46.0                   # * [new tag] v0.46.0 -> v0.46.0
gh release create v0.46.0 dist/QuanK-v0.46.0-mac-arm64.dmg dist/QuanK-v0.46.0-mac-arm64.zip \
  --title "QuanK v0.46.0 · F1 行情工作台" --notes-file /tmp/qk-release-notes-v046.md
```

| 项 | 值 |
| --- | --- |
| commit SHA | `6e674a73265ca0395606fbf278a0748d2bc107a5`（`release: v0.46.0 F1 行情工作台`） |
| tag 对象 SHA | `4308f7ffaf030bb7c1163a488e7efee1c0c9bc91`（annotated tag v0.46.0） |
| tag 指向 commit | `6e674a73265ca0395606fbf278a0748d2bc107a5` |
| Release URL | https://github.com/scliubingxin/QuanK/releases/tag/v0.46.0 |
| asset 1 | QuanK-v0.46.0-mac-arm64.dmg · 457,530,561 B · digest `sha256:b5864df9b49d257fdd2fd3664e27cfafe44fb556d32d363dbeb01333d1f32cae` · uploaded |
| asset 2 | QuanK-v0.46.0-mac-arm64.zip · 483,673,768 B · digest `sha256:39f5270fc5474f8a610f0ae7ebda30f5f765707d1e1baa081692d1aa60800bc9` · uploaded |

Release notes 内容 = ITERATION_LOG 顶部 v0.46.0 条目原文 + 下载校验表（两个产物的字节数与 sha256）+ 安装说明（ad-hoc 签名、未公证，首次打开请运行 DMG 里的「首次打开.command」或右键打开）。

工作区在提交后 `git status --short` 为空（本进度文件已在提交内）。
