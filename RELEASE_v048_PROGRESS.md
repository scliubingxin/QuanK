# QuanK v0.48.0 发布进度

分支：`feat/f3-knowledge`　基线：`d5c7abb`（v0.47.1）
执行规则：不改业务代码与测试，只改版本号 / README / ITERATION_LOG / 发布文件 / 截图；任一步失败即原样贴出并停下。

---

## 阶段 A · 同步与测试 —— **失败，已停止**

### A1. 同步 2 个文件（来自 Quick 侧 desktop/），md5 与源完全一致

| 文件 | 字节 | md5 | node --check |
|---|---|---|---|
| `desktop/src/shared/knowledge.js` | 26589 | `7bb0850cdc7abfeaa1f62d83ff585672` | ok |
| `desktop/tests/f3-knowledge.test.mjs` | 22720 | `c4eda8362f6f70fb824eca078c3a0e18` | ok |

### A2. `node --test tests/f3-knowledge.test.mjs` → **9 通过 / 1 失败**

```
ok 1 - M1 tokens, passages, BM25 index and cited search
ok 2 - M3 financial parsing, single quarters, summary, table, chart      ← 上一轮的 niceTicks 失败已消失（期望值已按 -100亿/0/100亿/200亿/300亿 修正）
not ok 3 - M2 profile, holders, chain map and graph                      ← 新增失败
ok 4 - M4 topics: validation, matching, schedule, digest
ok 5 - service: finance cache, report hook, compare, graph with peers
ok 6 - service: search covers library, notices, finance; topics collect and digest on schedule
ok 7 - research report gets a 财务数据 section
ok 8 - chat tools reach every knowledge action
ok 9 - UI: stock box mounts finance then graph; library box; forms
ok 10 - wiring: main, app, quant page, test loader
# tests 10  # pass 9  # fail 1
```

失败用例：`M2 profile, holders, chain map and graph`（`tests/f3-knowledge.test.mjs:66`，断言在 `:79:70`）

```
error: 'long labels are shortened'
code: 'ERR_ASSERTION'
name: 'AssertionError'
operator: 'doesNotMatch'
stack: TestContext.<anonymous> (file:///.../tests/f3-knowledge.test.mjs:79:70)
       Test.runInAsyncScope (node:async_hooks:228:14)
       Test.run (node:internal/test_runner/test:1118:25)
       Test.processPendingSubtests (node:test_runner/test:787:18)
       Test.postRun (node:test_runner/test:1247:19)
       Test.run (node:test_runner/test:1175:25)
       async startSubtestAfterBootstrap (node:test_runner/harness:358:3)
```

断言原文：

```js
assert.doesNotMatch(graphSvg(companyGraph({code:'600519', profile:{name:'贵州茅台', industry:'食品饮料-饮料-白酒', controller:'贵州省人民政府国有资产监督管理委员会'}})), />贵州省人民政府国有资产监督管理委员会</, 'long labels are shortened');
```

根因（`src/shared/knowledge.js:257-258`）：节点可见文本已正确截断，但 `<title>` 提示气泡保留了完整名称。

```
person label full   : 贵州省人民政府国有资产监督管理委员会
person visible text : 贵州省人民政府国有资…          ← 截断正确，10 字 + …
title tooltip text  : 贵州省人民政府国有资产监督管理委员会   ← 正则在此命中
match context: "…>贵州省人民政府国有资…</text><title>贵州省人民政府国有资产监督管理委员会</title></g>…"
```

`doesNotMatch` 正则 `/>贵州省人民政府国有资产监督管理委员会</` 未限定只匹配可见 `<text>`，因此被 `<title>` 命中。M2 在第二轮是全绿的，说明是本轮 `knowledge.js` 给 `<title>` 补全称后引入。

### A3 / A4 —— 未执行

按「任何一步失败就原样贴出并停下」，35 个分组测试、全量测试与基线集合 diff 均未运行。

---

## 阶段 B / C / D / E —— 未开始

---

## 阶段 A（重跑）· 同步与测试 —— **通过**

### A1. 同步 1 个文件 + node --check

| 文件 | 字节 | md5（repo == mirror） | node --check |
|---|---|---|---|
| `desktop/tests/f3-knowledge.test.mjs` | 22772 | `6853e69028109f45fceb3587f7d64d80` | ok |

断言已改为只匹配可见文本：`/>贵州省人民政府国有资产监督管理委员会<\/text>/`（`<title>` 全称气泡保留）。

### A2. `node --test tests/f3-knowledge.test.mjs` —— **全绿**

```
ok 1 - M1 tokens, passages, BM25 index and cited search
ok 2 - M3 financial parsing, single quarters, summary, table, chart
ok 3 - M2 profile, holders, chain map and graph
ok 4 - M4 topics: validation, matching, schedule, digest
ok 5 - service: finance cache, report hook, compare, graph with peers
ok 6 - service: search covers library, notices, finance; topics collect and digest on schedule
ok 7 - research report gets a 财务数据 section
ok 8 - chat tools reach every knowledge action
ok 9 - UI: stock box mounts finance then graph; library box; forms
ok 10 - wiring: main, app, quant page, test loader
# tests 10  # pass 10  # fail 0  # duration_ms 891
```

### A3. 35 个分组测试（f1/f2/v45/v46/v471/quant/feed/app-tools/ux/briefing）—— 全绿

```
targeted files: 35
# tests 166  # pass 166  # fail 0  # cancelled 0  # skipped 0  # duration_ms 4687   EXIT=0
```

### A4. 全量测试 + 与 HEAD 基线集合 diff —— 新增失败 **0**

```
工作区 (20:45:01→20:45:46): # tests 1290  # pass 1137  # fail 142  # cancelled 1  # skipped 10
基线 HEAD d5c7abb (20:45:51→20:46:33): # tests 1280  # pass 1127  # fail 142  # cancelled 1  # skipped 10
基线确认不含 4 个 F3 新文件

R4 failures: 143    BASE failures: 143
=== 新增失败 (R4 only, 0) ===
=== 基线有、R4 无 (0) ===
```

两组失败名单**逐条完全一致**。11434 那对偶发用例两边都恰好是同一半失败：

```
工作区: not ok 388 - real HTTP model tool loop stops when a queued knowledge search is cancelled   (ok 387 - two real agent sessions serialize …)
基线  : not ok 378 - real HTTP model tool loop stops when a queued knowledge search is cancelled   (ok 377 - two real agent sessions serialize …)
```

单独复跑（同进程两个文件）：

```
not ok 5 - two real agent sessions serialize local-model HTTP and a cancelled queued session sends no request
# tests 6  # pass 5  # fail 1
037112 单跑 → # tests 5  # pass 5  # fail 0
037113 单跑 → # tests 1  # pass 1  # fail 0
```

结论：撞端口偶发，基线同构，与 F3 无关。

**阶段 A 通过，进入阶段 B。**

---

## 阶段 R · 同步 / 打包 / 发布（v0.48.0 只做同步、打包、发布；未跑测试、未截图、未改任何文件内容）

### R1. 同步：22 个文件逐个 cp + cmp 逐字节一致

指令正文写「23 个文件」，但列出的路径实为 **22 个**；`diff -rq` 全量比对 `desktop/src`、`desktop/services`、`desktop/tests` 后确认 M 与仓库的差异文件全部落在该 22 个路径内，无第 23 个待同步文件。

| 文件 | 字节 | sha256（前 16 位） |
| --- | --- | --- |
| `desktop/src/shared/knowledge.js` | 28,626 | `b7067e1371a8a804` |
| `desktop/services/knowledge.mjs` | 16,084 | `f8ae454ee11ce740` |
| `desktop/src/ui/knowledge.js` | 10,925 | `fb634a58c62f8603` |
| `desktop/tests/f3-knowledge.test.mjs` | 23,563 | `88ff1ffdcf731916` |
| `desktop/src/shared/research.js` | 26,846 | `e9928e7ca48a9ce4` |
| `desktop/services/research.mjs` | 21,323 | `34d9ec4718f4a0ce` |
| `desktop/src/ui/quant.js` | 31,139 | `ab2fefd54be6ebed` |
| `desktop/src/shared/feed.js` | 10,428 | `c04cb9bf4d4b22ea` |
| `desktop/services/app-tools.mjs` | 63,100 | `3d75558df069e76a` |
| `desktop/main.mjs` | 55,417 | `7a93036ff0af4222` |
| `desktop/src/app.js` | 156,379 | `e75dbcf6f0f47e71` |
| `desktop/src/workbench.css` | 141,388 | `e5f2b19817af671e` |
| `desktop/tests/helpers/load-ui.mjs` | 8,303 | `c5cde9643055ddfd` |
| `desktop/package.json` | 3,502 | `7450441e11d6ee19` |
| `desktop/package-lock.json` | 288,404 | `b24d3503f07e373d` |
| `RELEASE_STATUS.json` | 52,241 | `58f82b9b326f977b` |
| `SOURCE_MANIFEST.json` | 279,294 | `3ccf23fbe38354d0` |
| `README.md` | 13,850 | `510e223ee1c422d1` |
| `ITERATION_LOG.md` | 385,999 | `dc0a0d0ef8b6c254` |
| `docs/images/app-kb-finance.png` | 337,032 | `1eb19ee6fd15472e` |
| `docs/images/app-kb-graph.png` | 186,389 | `fed62ae38e3cd543` |
| `docs/images/app-kb-search.png` | 81,592 | `62adc10991765b42` |

`cmp` 22/22 一致（FAIL=0）。M/desktop/node_modules 是指向 `.../quank/testdeps/node_modules` 的符号链接，按指令未复制；仓库 `desktop/node_modules` 未改动。

已删除临时脚本：`desktop/scripts/tmp-f3-check.mjs`、`desktop/scripts/tmp-f3-shots.mjs`（`tmp-*` 已无残留）。

版本号复核：`desktop/package.json` = 0.48.0；lock 根包与 `packages[""]` = 0.48.0；`RELEASE_STATUS.version`、`SOURCE_MANIFEST.version`、`SOURCE_MANIFEST.release_status.version` 均 = 0.48.0。

### R2. 打包（流程同 v0.47.1）

```
TS=20261121-2130
python3 scripts/package-offline-mac.py \
  --native-runtimes ~/Downloads/wb-pack-inputs/native-runtimes-040 \
  --runtime ~/Downloads/wb-pack-inputs/cache/electron-v42.0.0-darwin-arm64.zip \
  --checksums ~/Downloads/wb-pack-inputs/cache/SHASUMS256.txt \
  --work-dir /tmp/qk-pack-048-$TS \
  --output dist/QuanK-v0.48.0-mac-arm64.zip \
  --signing-tool ~/Downloads/wb-pack-inputs/apple-codesign-0.29.0-aarch64-apple-darwin/rcodesign

sh scripts/make-dmg.sh /tmp/qk-pack-048-$TS/QuanK.app \
  dist/QuanK-v0.48.0-mac-arm64.dmg \
  scripts/dmg-assets/background.png scripts/dmg-assets/background@2x.png
```

打包器输出：`version 0.48.0 / arm64 / ad-hoc / verified true / app_entries 20711 / extra_files 5 / closed_inventory true / residual_entries 0`，
`app_asar_sha256=f56bc17072c1af777a4c1a5e00a3cd890807dd91bc0f69bc59280deea18f9e8d`。DMG 脚本输出 `LAYOUT ok`。

| 产物 | 字节 | sha256 |
| --- | --- | --- |
| `dist/QuanK-v0.48.0-mac-arm64.dmg` | 457,712,164 | `4baa33d986d29fadd07717cadeb0d2e4e434b93095abfcb8c04e2dc0e8944295` |
| `dist/QuanK-v0.48.0-mac-arm64.zip` | 483,722,441 | `42c311297cf3b182d49cf220ba7586e9cbe1741ef6da044b1f09ea85cd5efd98` |

#### 检查项

| 检查 | 结果 |
| --- | --- |
| 根目录 `package.json` 已还原 | ✓ `git diff --quiet HEAD -- package.json` 通过；sha256 `0a0e0c37…fbd8b0`，version 0.2.0（Web 框架包，全程未变） |
| asar 头部（node 直接读二进制） | header_pickle=103,780 / json_bytes=103,772 / data_base=103,788；`package.json` size=218 → name=`quank-desktop`、productName=`QuanK`、**version=`0.48.0`**，main=`main.mjs` |
| asar 内 `services/knowledge.mjs` | ✓ 存在，16,084 B，sha256 `f8ae454e…`，与仓库同步文件逐字节一致 |
| asar 内 `src/shared/knowledge.js` | ✓ 存在，28,626 B，sha256 `b7067e13…`，与仓库同步文件逐字节一致；**`graphLayout` 出现 3 次** |
| asar 内 `src/ui/knowledge.js` | ✓ 存在，10,925 B，sha256 `fb634a58…`，与仓库同步文件逐字节一致 |
| asar 条目 | 449 个（v0.47.1 为 446，+3 = 三个 F3 源码文件）；`tests/` 不入包（`tests/f3-knowledge.test.mjs` MISSING 属预期） |
| `Info.plist` | CFBundleShortVersionString / CFBundleVersion = 0.48.0 / 0.48.0；CFBundleIdentifier=`com.quank.desktop` |
| 签名 | `Signature=adhoc`、`Identifier=com.quank.desktop`、Mach-O thin (arm64)、TeamIdentifier=not set |
| `hdiutil verify` | `checksum of "dist/QuanK-v0.48.0-mac-arm64.dmg" is VALID`（末尾 CRC32 $FF1093F0） |
| 挂载后内容 | `QuanK.app`、`应用程序` 链接、`首次打开.command`；app 版本 0.48.0 |

### R3. 发布

本机无 `user.*` 配置（git 报 `Author identity unknown`），提交与打标签用 `-c user.name=刘冰鑫 -c user.email=liubingxin@ip-192-168-30-10.ap-northeast-1.compute.internal` 沿用历史作者身份，未写任何 git 配置文件。

| 项 | SHA | 说明 |
| --- | --- | --- |
| feature commit | `aa6e06cdf88ecb8a91a3ba39c3eff9af58c2d3a6` | `feat: v0.48.0 F3 投研知识库`（22 个文件，958 插入 / 24 删除；`dist/`、`node_modules`、`tmp-*` 未入库） |
| merge commit | `66a440d136e8989ad123ddfef8f038b327953178` | `merge: F3 投研知识库`（`--no-ff`，`d5c7abb..66a440d` 已推送 main） |
| tag | `dade274aa81daff757f9e603534cfef87fe7a948` | 附注标签 `v0.48.0` → 指向 merge commit `66a440d`，已推送 |

Release：

- 链接：https://github.com/scliubingxin/QuanK/releases/tag/v0.48.0
- 标题：`QuanK v0.48.0 · F3 投研知识库`
- notes 组成：ITERATION_LOG.md 顶部 v0.48.0 条目原文（552 字，原样）+ 下载校验表（含 `shasum -a 256 -c` 命令）+ 安装说明（ad-hoc 签名、未公证，首次打开运行 DMG 里的「首次打开.command」或右键打开）+ 结尾说明「产业链上下游为按行业预置的通用模板，仅作研究线索；资料库检索为本机关键词检索」

`gh release view v0.48.0 --json url,assets` 核对：

| 资产 | 字节 | digest（远端） | 与本地比对 |
| --- | --- | --- | --- |
| `QuanK-v0.48.0-mac-arm64.dmg` | 457,712,164 | `sha256:4baa33d986d29fadd07717cadeb0d2e4e434b93095abfcb8c04e2dc0e8944295` | 一致 ✓ |
| `QuanK-v0.48.0-mac-arm64.zip` | 483,722,441 | `sha256:42c311297cf3b182d49cf220ba7586e9cbe1741ef6da044b1f09ea85cd5efd98` | 一致 ✓ |

### R4. 清理

`/tmp/qk-pack-048-*`（打包工作目录 + 临时校验脚本 + 挂载点）已删除。

### 说明

- 本轮未运行任何测试、未截图；测试结果沿用阶段 A（Quick 本机已跑通）的记录。
- `dist/` 内 v0.46.0、v0.47.0、v0.47.1 的旧安装包保留未删（磁盘可用 44 GiB）。
