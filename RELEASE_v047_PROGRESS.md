# QuanK v0.47.0 发布进度 · F2 投研文档

- 仓库：`/Users/liubingxin/wb-par/QuanK`
- 分支：`feat/f2-research`（起始 HEAD `fef2925`，v0.46.0 发布记录）
- 待发布内容：11 个 F2 文件（4 新增 + 7 修改）
- 规则：不改业务代码与测试（`desktop/src`、`desktop/services`、`desktop/runtime` 下 .js/.mjs/.css 及 `desktop/tests`），只改版本号、README、日志、发布文件与截图

---

## 阶段A — 公告要点过滤修复 + 测试

### 改动（来自 Quick 的 `desktop/` 源）

复制 2 个文件到仓库，`cmp` 校验字节一致：

| 文件 | 改动 |
| --- | --- |
| `desktop/src/shared/research.js` | `BOILER` 正则追加评级机构开场白：`受.{0,40}委托`、`（以下简称`、`进行了(?:主体)?(?:信用)?评级`、`^[^，。]{0,12}〔\d{4}〕\d+\s*号` |
| `desktop/tests/f2-research.test.mjs` | 新增断言：评级机构开场白被丢弃，仅保留含数字的实质句（`净利润为 -38.52 亿元`） |

`node --check src/shared/research.js` → PASS

### 定向测试

`node --test tests/f2-research.test.mjs tests/quant-q1.test.mjs` → **tests 14 / pass 14 / fail 0**

### 全量测试与基线集合 diff

基线用 `git archive HEAD` 解出到 `/tmp/qk-base`（无 F2 改动，链接工作区 `node_modules`），同机同环境实跑。

| | tests | pass | fail | cancelled | skipped |
| --- | --- | --- | --- | --- | --- |
| 基线 HEAD（`fef2925`） | 1267 | 1115 | 141 | 1 | 10 |
| 当前（含 F2） | 1275 | 1123 | 141 | 1 | 10 |

失败标题集合 diff（逐条比对）：**新增 0 条，消失 0 条**。

端口 11434 抢占偶发对（`knowledge-agent-cancel-037112` / `knowledge-agent-loop-cancel-037113`）本轮全量中**两边均未触发**；单独复跑确认：`037112` 5/5 通过、`037113` 1/1 通过。

**结论：阶段A 通过，新增失败 0 条。**

---

## 阶段B — README 与截图

### 截图

行情接口 `push2his.eastmoney.com` 探测 6 次全部 `code=000 / size=0`（不可用），`push2` 实时报价 3 次全部 `502`，公告接口同期 `200`。

按规则：
- `detail-research.png`、`quant-library.png` → 用 demo harness **重截**（阶段A 改了要点过滤）
- `report-html.png` → 行情不通，**沿用现有图**

| 预览文件 | 尺寸 | 检查 |
| --- | --- | --- |
| `detail-research.png` | `#researchBox` 1126×491 | 告警词 none、pageerror none |
| `quant-library.png` | `.q-research` 1126×284 | 告警词 none、pageerror none |

复制到 `docs/images/`（`cmp` 校验字节一致）：

| 源 | 目标 |
| --- | --- |
| `preview/f2/detail-research.png` | `docs/images/app-research-detail.png` |
| `preview/f2/quant-library.png` | `docs/images/app-research-library.png` |
| `preview/f2/report-html.png` | `docs/images/app-research-report.png` |

### README.md 改动

| 位置 | 改动 |
| --- | --- |
| 第 7 行版本徽章 | `version-0.46.0` → `version-0.47.0` |
| 第 50 行下载名 | `QuanK-v0.46.0-mac-arm64.dmg` → `QuanK-v0.47.0-mac-arm64.dmg`（v0.46 写法本已统一为 `QuanK-vX.Y.Z-mac-arm64`，无需修正；v0.45 的 `QuanK-0.45.0-arm64.dmg` 为历史条目，不动） |
| 顶部表格「📡 行情数据」 | 补「公司公告」 |
| 新增小节 | 「行情工作台」之后新增「### 投研文档：研报、公告与资料库」（5 条要点 + 两列图 app-research-detail / app-research-library + 单独 app-research-report + 图注） |
| 更新记录顶部 | 新增 v0.47 一行（原文按指令） |

图片引用核验：README 中 26 个 `docs/images/*.png` 全部存在。README 9950 → 11787 字节。

---

## 阶段C — 版本号与日志

### 版本号（`grep -rn "0\.46\.0"` 定位后统一改为 0.47.0）

| 文件 | 字段 | 处数 |
| --- | --- | --- |
| `desktop/package.json` | `version`（第 4 行） | 1 |
| `desktop/package-lock.json` | 根包 `version`（第 3 行）+ `packages[""].version`（第 9 行），未触碰任何依赖版本 | 2 |
| `RELEASE_STATUS.json` | `version`（第 4 行） | 1 |
| `SOURCE_MANIFEST.json` | 顶层 `version` + `release_status.version` | 2 |

4 个文件 JSON 解析校验全部通过。`0.46.0` 残留仅两处历史记录，按规则不动：
`README.md:201`（v0.46 更新记录条目）、`ITERATION_LOG.md:1`（v0.46.0 历史条目）。

### ITERATION_LOG.md

在文件顶部（原 v0.46.0 条目之前）加入 `## v0.47.0 · 2026-11-21 · F2 投研文档` 及其 6 条要点（原文按指令）。历史条目全部保留（185 个 `## ` 标题）。

### 语法检查

`desktop/` 下排除 `node_modules`、`dist`、`out` 的全部 `.js/.mjs/.cjs`：**608 个文件，`node --check` 失败 0 个**。

### 全量测试与基线对比

`node --test tests/*.test.mjs` → tests 1275 / pass 1122 / fail 142 / cancelled 1 / skipped 10。
与阶段A基线（1267 / 1115 / 141）集合 diff：**新增 1 条、消失 0 条**，新增项为已知端口抢占偶发：

```
knowledge-agent-loop-cancel-037113 :: real HTTP model tool loop stops when a queued knowledge search is cancelled
Error: listen EADDRINUSE: address already in use 127.0.0.1:11434
```

单独复跑：`037113` 1/1 通过、`037112` 5/5 通过。**除该偶发外新增失败 0 条。**

---

## 阶段D — 打包

### 输入校验（native-runtimes 与 RUNTIMES.json）

`/Users/liubingxin/Downloads/wb-pack-inputs/native-runtimes-040`，`schema 1 / architecture arm64 / python 3.12.16+20261026 / libreoffice 26.8.1.1`。

| 项 | 结果 |
| --- | --- |
| RUNTIMES.json 声明条目 | 20428（20395 普通文件 + 33 符号链接） |
| 声明项在磁盘缺失 | **0** |
| 逐文件 sha256 / 符号链接目标不符 | **0 处** |
| Electron 运行时 | `electron-v42.0.0-darwin-arm64.zip` 117,864,828 字节 + `SHASUMS256.txt` |
| 签名工具 | `apple-codesign-0.29.0-aarch64-apple-darwin/rcodesign` |

### 命令

```
TS=20261121-191247
python3 scripts/package-offline-mac.py \
  --native-runtimes .../native-runtimes-040 \
  --runtime .../cache/electron-v42.0.0-darwin-arm64.zip \
  --checksums .../cache/SHASUMS256.txt \
  --work-dir /tmp/qk-pack-047-$TS \
  --output dist/QuanK-v0.47.0-mac-arm64.zip \
  --signing-tool .../rcodesign

sh scripts/make-dmg.sh /tmp/qk-pack-047-$TS/QuanK.app \
  dist/QuanK-v0.47.0-mac-arm64.dmg \
  scripts/dmg-assets/background.png scripts/dmg-assets/background@2x.png
```

### 产物

| 产物 | 字节 | sha256 |
| --- | --- | --- |
| `dist/QuanK-v0.47.0-mac-arm64.zip` | 483,695,801 | `9ddf0bf60ac5f77bdd88365db792c8e3935814ed57cf9f6c7d474338af11498e` |
| `dist/QuanK-v0.47.0-mac-arm64.dmg` | 457,635,234 | `57d9fa56ab6d2976fba64d4fa566df11a983e7dafef61edff5b07ce02511edd5` |

打包器自校验：`version 0.47.0 / arm64 / ad-hoc / verified true / app_entries 20711 / extra_files 5 / closed_inventory true / residual_entries 0`，`app_asar_sha256=7f5240dcb4967ebdb70e3ff6348c8f73a7a14c8ca581f4fd6f4b942f18aa32cd`。

### 版本与内容确认

| 检查 | 结果 |
| --- | --- |
| 根 `package.json` 已还原 | ✓ `git diff --quiet HEAD -- package.json` 通过，sha256 仍为 `0a0e0c37…fbd8b0`，version 0.2.0（Web 框架包，未改动） |
| `Info.plist` CFBundleShortVersionString / CFBundleVersion | 0.47.0 / 0.47.0 |
| `app.asar` → package.json | name=quank-desktop，productName=QuanK，**version=0.47.0** |
| asar 内 F2 文件 | `services/research.mjs` ✓ / `src/shared/research.js` ✓ / `src/ui/research.js` ✓（asar 条目共 446） |
| `hdiutil verify` | `checksum ... is VALID`（CRC32 $D75F546D） |
| 挂载后内容 | `QuanK.app`、`应用程序` 链接、`首次打开.command`；app 版本 0.47.0；`Signature=adhoc`、`Identifier=com.quank.desktop`、arm64 thin |
