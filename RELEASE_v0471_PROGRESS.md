# v0.47.1 发布进度

分支：`fix/v471`（基线 HEAD `ba5e249`，v0.47.0 发布记录）

## 阶段A · 同步修复后的文件并复测 ✅

同步两个文件到 `desktop/`，与 Quick 交付目录逐字节一致：

- `desktop/services/research.mjs`（lastReturns() 提取，注释移出调用行）
- `desktop/tests/f2-research.test.mjs`（新增断言：研报智能定投收益率取引擎汇总 -13.52%）

### 1. node --check（7 个改过的 js/mjs）全部通过

```
check services/market.mjs exit=0
check services/research.mjs exit=0
check src/ui/market.js exit=0
check src/shared/quant.js exit=0
check src/ui/quant.js exit=0
check tests/v471-market-fallback.test.mjs exit=0
check tests/f2-research.test.mjs exit=0
```

（上一轮 `research.mjs` 的 SyntaxError: Unexpected identifier 'svgs' 已消失。）

### 2. 定向测试 8 个文件

```
tests 51   pass 51   fail 0   cancelled 0   skipped 0
```

上一轮的 1 个失败（`tests/f2-research.test.mjs`）已修复，测试数由 44 增至 51（f2 文件恢复加载 + 1 条新断言）。

### 3. 全量测试与 HEAD 基线集合 diff

| | tests | pass | fail | cancelled | skipped |
|---|---|---|---|---|---|
| 工作树 | 1280 | 1128 | 141 | 1 | 10 |
| HEAD 基线（git archive HEAD） | 1275 | 1123 | 141 | 1 | 10 |

失败名单集合 diff：

```
WORK entries: 142   BASE entries: 142
== ONLY IN WORKING TREE (new failures): 0
== ONLY IN BASELINE: 0
== COMMON: 142
```

新增失败 0，142 个既有失败与基线逐条一致（OCR / soffice 等本机缺件的环境性失败）。

11434 端口偶发用例单独复跑：`tests/knowledge-vector-queue-037112.test.mjs` + `tests/knowledge-agent-cancel-037112.test.mjs` → 9/9 通过。

---

## 阶段B · 版本号与日志 ✅

`grep -rn "0\.47\.0"` 定位后统一改为 0.47.1：

| 文件 | 字段 | 处数 |
| --- | --- | --- |
| `desktop/package.json` | `version` | 1 |
| `desktop/package-lock.json` | 根包 `version` + `packages[""].version` | 2 |
| `RELEASE_STATUS.json` | 顶层 `version` | 1 |
| `SOURCE_MANIFEST.json` | 顶层 `version` + `release_status.version` | 2 |
| `README.md` | 第 7 行徽章 `version-0.47.1`；第 50 行下载名 `QuanK-v0.47.1-mac-arm64.dmg` | 2 |

4 个 JSON 文件 `json.load` 解析全部通过。`0.47.0` 残留仅两处历史记录，按规则不动：
`README.md:201`（v0.47 更新记录条目）、`ITERATION_LOG.md:6`（v0.47.0 历史条目）。

README「更新记录」顶部新增一行：

```
- **v0.47.1** — K 线在东方财富接口受限时自动改用腾讯行情；回测收益率与策略收益统一口径（含储备金）。
```

`ITERATION_LOG.md` 顶部加入 v0.47.1 条目（3 条要点，原文按指令），历史条目保留（`## ` 标题 186 个）。

---

## 阶段C · 打包 ✅

打包前磁盘：`df -h` → 可用 **45 GiB**（> 4 GB），故未删除 `dist/` 中 v0.46.0 的两个旧包。

### 命令

```
TS=20261121-200651
python3 scripts/package-offline-mac.py \
  --native-runtimes ~/Downloads/wb-pack-inputs/native-runtimes-040 \
  --runtime ~/Downloads/wb-pack-inputs/cache/electron-v42.0.0-darwin-arm64.zip \
  --checksums ~/Downloads/wb-pack-inputs/cache/SHASUMS256.txt \
  --work-dir /tmp/qk-pack-0471-$TS \
  --output dist/QuanK-v0.47.1-mac-arm64.zip \
  --signing-tool ~/Downloads/wb-pack-inputs/apple-codesign-0.29.0-aarch64-apple-darwin/rcodesign

sh scripts/make-dmg.sh /tmp/qk-pack-0471-$TS/QuanK.app \
  dist/QuanK-v0.47.1-mac-arm64.dmg \
  scripts/dmg-assets/background.png scripts/dmg-assets/background@2x.png
```

打包器输出：`version 0.47.1 / arm64 / ad-hoc / verified true / app_entries 20711 / extra_files 5 / closed_inventory true / residual_entries 0`，
`app_asar_sha256=d4dffb36f69e7e4954bac6535842e692ef9143c5f325f2b88b6d72b11e7135ca`。DMG 脚本输出 `LAYOUT ok`。

### 产物

| 产物 | 字节 | sha256 |
| --- | --- | --- |
| `dist/QuanK-v0.47.1-mac-arm64.dmg` | 457,637,376 | `4ccc523700b61e961a5e95d5d9a342a4c13f559912c9fbb0307c27dd4c4a080b` |
| `dist/QuanK-v0.47.1-mac-arm64.zip` | 483,697,683 | `09a62941c33abe9b4748c0b78d8d146e409028cf70736cf94a7e93473efd60a6` |

### 版本与内容确认

| 检查 | 结果 |
| --- | --- |
| 根 `package.json` 已还原 | ✓ `git diff --quiet HEAD -- package.json` 通过；sha256 `0a0e0c37…fbd8b0`，version 0.2.0（Web 框架包，未改动） |
| `Info.plist` CFBundleShortVersionString / CFBundleVersion | 0.47.1 / 0.47.1 |
| `app.asar` → package.json | name=quank-desktop，productName=QuanK，**version=0.47.1** |
| asar 内 `services/market.mjs`（27,533 B） | `parseTxKline` ✓、`txSymbol` ✓ |
| asar 内 `src/ui/quant.js`（30,987 B） | `withCash` ✓、`储备金` 提示 ✓ |
| asar 内 `src/shared/quant.js`（19,253 B） | `C.cash` ✓ |
| asar 内 `services/research.mjs`（20,391 B） | `lastReturns` ✓ |
| asar 条目 | 397 个文件 + 49 个目录 = 446（与 v0.47.0 口径一致） |
| `hdiutil verify` | `checksum ... is VALID`（CRC32 $7A72E964） |
| 挂载后内容 | `QuanK.app`、`应用程序` 链接、`首次打开.command`；app 版本 0.47.1；`Signature=adhoc`、`Identifier=com.quank.desktop`、arm64 thin |

---

## 阶段D · 发布 ✅

### 提交与推送

| 项 | SHA | 说明 |
| --- | --- | --- |
| feature commit | `1792ff99dca7fdad68a70718f2810b2cd8d3b4d3` | `fix: v0.47.1 行情备用源与回测口径`（15 个文件，318 插入 / 23 删除；`dist/`、`node_modules` 未入库） |
| merge commit | `108291da7d15a106cee6a93059c1020905b7b9f2` | `merge: v0.47.1 修复`（`--no-ff`，`ba5e249..108291d` 已推送 main） |
| tag | `4dbb4f5f31f871da7c39af9428d0c01a36a0eebb` | 附注标签 `v0.47.1` → 指向 merge commit `108291d`，已推送 |

### Release

- 链接：https://github.com/scliubingxin/QuanK/releases/tag/v0.47.1
- 标题：`QuanK v0.47.1 · 行情备用源与回测口径修复`
- notes 组成：ITERATION_LOG v0.47.1 条目原文 + 下载校验表（含 shasum 命令）+ 安装说明（ad-hoc 签名、未经公证）+ 自带私有策略用户的 cash 字段接入指引。

`gh release view v0.47.1 --json url,name,tagName,assets` 核对结果：

| 资产 | 字节 | digest（远端） | 与本地比对 |
| --- | --- | --- | --- |
| `QuanK-v0.47.1-mac-arm64.dmg` | 457,637,376 | `sha256:4ccc523700b61e961a5e95d5d9a342a4c13f559912c9fbb0307c27dd4c4a080b` | 一致 ✓ |
| `QuanK-v0.47.1-mac-arm64.zip` | 483,697,683 | `sha256:09a62941c33abe9b4748c0b78d8d146e409028cf70736cf94a7e93473efd60a6` | 一致 ✓ |

---

## 说明

- 未同步、未重启用户的量化引擎（该步骤由用户在 QuanK 界面「从源目录同步」+重启完成）。
- `dist/` 内 v0.46.0、v0.47.0 的旧安装包保留未删（磁盘可用 45 GiB，无需腾空间）。
