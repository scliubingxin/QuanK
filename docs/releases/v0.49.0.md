# QuanK v0.49.0 发布进度

分支：`feat/f4-portfolio`　基线：`cc5d779`（v0.48.0）
执行规则：只同步、打包、发布；不跑测试、不截图、不修改任何文件内容；任一步失败即原样贴出并停下。

源目录 `M` = Quick 侧 `desktop/`（`…/agent_files/quank/QuanK`）；仓库 `R` = `/Users/liubingxin/wb-par/QuanK`。

---

## R1. 同步：22 个文件逐个 cp + cmp 逐字节一致

复制前 `diff -rq`（排除 `node_modules`、`.git`、`dist`、`out`、`__pycache__`、`*.dmg`、`*.zip`）比对 `desktop/src`、`desktop/services`、`desktop/tests`、`desktop/main.mjs`、`docs/images` 与根文件，
差异文件**正好是清单内的 22 个**，无清单外差异：

```
=== desktop/src ===
Files M/desktop/src/app.js and R/desktop/src/app.js differ
Files M/desktop/src/shared/feed.js and R/desktop/src/shared/feed.js differ
Only in M/desktop/src/shared: portfolio.js
Only in M/desktop/src/ui: portfolio.js
Files M/desktop/src/ui/quant.js and R/desktop/src/ui/quant.js differ
Files M/desktop/src/workbench.css and R/desktop/src/workbench.css differ
=== desktop/services ===
Files M/desktop/services/app-tools.mjs and R/desktop/services/app-tools.mjs differ
Files M/desktop/services/market.mjs and R/desktop/services/market.mjs differ
Only in M/desktop/services: portfolio.mjs
Files M/desktop/services/research.mjs and R/desktop/services/research.mjs differ
=== desktop/tests ===
Files M/desktop/tests/f3-knowledge.test.mjs and R/desktop/tests/f3-knowledge.test.mjs differ
Only in M/desktop/tests: f4-portfolio.test.mjs
Files M/desktop/tests/helpers/load-ui.mjs and R/desktop/tests/helpers/load-ui.mjs differ
=== desktop/main.mjs ===
Files M/desktop/main.mjs and R/desktop/main.mjs differ
=== docs/images ===
Only in M/docs/images: app-pf-overview.png
Only in M/docs/images: app-pf-risk.png
=== 根文件 / desktop 顶层 ===
Files M/ITERATION_LOG.md and R/ITERATION_LOG.md differ
Files M/README.md and R/README.md differ
Files M/RELEASE_STATUS.json and R/RELEASE_STATUS.json differ
Files M/SOURCE_MANIFEST.json and R/SOURCE_MANIFEST.json differ
Files M/desktop/package-lock.json and R/desktop/package-lock.json differ
Files M/desktop/package.json and R/desktop/package.json differ
```

（合计 16 个 differ + 6 个 only-in-M = 22。`_review/` 两侧完全一致。）

| 文件 | 字节 | sha256（前 16 位） |
| --- | --- | --- |
| `desktop/src/shared/portfolio.js`（新增） | 35,240 | `8dda96555f6e7635` |
| `desktop/services/portfolio.mjs`（新增） | 14,280 | `d9380c530bb8101d` |
| `desktop/src/ui/portfolio.js`（新增） | 22,603 | `d50abdfe03661b77` |
| `desktop/tests/f4-portfolio.test.mjs`（新增） | 30,979 | `296db655813f2657` |
| `docs/images/app-pf-overview.png`（新增） | 502,443 | `38f42ddd03cb4f91` |
| `docs/images/app-pf-risk.png`（新增） | 593,452 | `0c62c9c1b080f999` |
| `desktop/services/market.mjs` | 28,943 | `a702843fe7ab5079` |
| `desktop/services/research.mjs` | 21,445 | `0a655789f8ae69aa` |
| `desktop/services/app-tools.mjs` | 74,831 | `e67ebcfbaad9a2f1` |
| `desktop/main.mjs` | 56,341 | `3137c7fb1a115b4a` |
| `desktop/src/app.js` | 159,813 | `fd33b1904f8e51bd` |
| `desktop/src/ui/quant.js` | 31,236 | `0129b5160ca85768` |
| `desktop/src/shared/feed.js` | 10,872 | `eae8167d1083ecfa` |
| `desktop/src/workbench.css` | 143,211 | `e09f80b0f197ad46` |
| `desktop/tests/helpers/load-ui.mjs` | 8,382 | `17ac13868dd01655` |
| `desktop/tests/f3-knowledge.test.mjs` | 23,584 | `a1f7fbb70e596210` |
| `desktop/package.json` | 3,502 | `657e5d7c514c2d9b` |
| `desktop/package-lock.json` | 288,404 | `10ad3e875bcaf8f5` |
| `RELEASE_STATUS.json` | 52,241 | `3f4cc2e57d0dcca1` |
| `SOURCE_MANIFEST.json` | 279,294 | `c3f27187f846a68e` |
| `README.md` | 16,254 | `0e21d6bb3277bbd2` |
| `ITERATION_LOG.md` | 387,845 | `ae3f8814f9f3eda4` |

`cmp` 22/22 一致（FAIL=0）。M/desktop/node_modules 是指向 `…/quank/testdeps/node_modules` 的符号链接，按指令未复制；仓库 `desktop/node_modules` 未改动。
`desktop/scripts/` 下无 `tmp-f4-*`（M 与 R 两侧均为 8 个常规脚本，无 `tmp-*` 残留）。

版本号复核：`desktop/package.json` = 0.49.0；lock 根包与 `packages[""]` = 0.49.0；`RELEASE_STATUS.version`、`SOURCE_MANIFEST.version`、`SOURCE_MANIFEST.release_status.version` 均 = 0.49.0。

### 关键内容抽查（只读 grep，不跑测试）

| 检查 | 结果 |
| --- | --- |
| `desktop/src/shared/portfolio.js` 含 `adjustedBeta` | ✓ 2 处 |
| `desktop/services/market.mjs` 含 `indexKline` | ✓ 2 处 |
| `node --check` 语法（10 个改动的 JS/MJS） | ✓ 全部 ok（仅语法校验，非测试） |

---

## R2. 打包（流程同 v0.48.0）

```
TS=20261121-2155
python3 scripts/package-offline-mac.py \
  --native-runtimes ~/Downloads/wb-pack-inputs/native-runtimes-040 \
  --runtime ~/Downloads/wb-pack-inputs/cache/electron-v42.0.0-darwin-arm64.zip \
  --checksums ~/Downloads/wb-pack-inputs/cache/SHASUMS256.txt \
  --work-dir /tmp/qk-pack-049-$TS \
  --output dist/QuanK-v0.49.0-mac-arm64.zip \
  --signing-tool ~/Downloads/wb-pack-inputs/apple-codesign-0.29.0-aarch64-apple-darwin/rcodesign

sh scripts/make-dmg.sh /tmp/qk-pack-049-$TS/QuanK.app \
  dist/QuanK-v0.49.0-mac-arm64.dmg \
  scripts/dmg-assets/background.png scripts/dmg-assets/background@2x.png
```

打包器输出：`version 0.49.0 / arm64 / ad-hoc / verified true / app_entries 20711 / extra_files 5 / closed_inventory true / residual_entries 0`，
`app_asar_sha256=48233e287901db1c6e7a51eb4c7824c8bdeea38d0cf65e7cd04e6a823a773cc7`。DMG 脚本输出 `LAYOUT ok`。

| 产物 | 字节 | sha256 |
| --- | --- | --- |
| `dist/QuanK-v0.49.0-mac-arm64.dmg` | 457,594,417 | `db91e32dbe989113d21a9907d6fd0411ce258dec1fc029f30b0fe450bc1d7304` |
| `dist/QuanK-v0.49.0-mac-arm64.zip` | 483,752,264 | `d0f3f75bddd1a2e20f79f1a9fb150306b8ab8c3ca53796a8563f91e3b96c73ed` |

#### 检查项

| 检查 | 结果 |
| --- | --- |
| 根目录 `package.json` 已还原 | ✓ `git diff --quiet HEAD -- package.json` 通过；sha256 `0a0e0c37…fbd8b0`，version 0.2.0（Web 框架包，全程未变） |
| asar 头部 | `header_pickle_size=104,543`；`app.asar` 15,012,327 B，sha256 `48233e28…773cc7`，与打包器 `app_asar_sha256` 一致 |
| asar 内 `package.json` | ✓ 218 B，name=`quank-desktop`、productName=`QuanK`、**version=`0.49.0`**，main=`main.mjs` |
| asar 内 `services/portfolio.mjs` | ✓ 存在，14,280 B，sha256 `d9380c53…295e1357`，与仓库同步文件逐字节一致 |
| asar 内 `src/shared/portfolio.js` | ✓ 存在，35,240 B，sha256 `8dda9655…d100d83`，与仓库同步文件逐字节一致；**`adjustedBeta` 出现 2 次** |
| asar 内 `src/ui/portfolio.js` | ✓ 存在，22,603 B，sha256 `d50abdfe…2fe5f27`，与仓库同步文件逐字节一致 |
| asar 内 `services/market.mjs` | ✓ 28,943 B，sha256 `a702843f…5f1a5d3`，与仓库同步文件逐字节一致；**`indexKline` 出现 3 次** |
| asar 条目 | 452 个（v0.48.0 为 449，+3 = 三个 F4 源码文件）；`tests/` 不入包（`tests/` 前缀条目 0 个） |
| `Info.plist` | CFBundleShortVersionString / CFBundleVersion = 0.49.0 / 0.49.0；CFBundleIdentifier=`com.quank.desktop` |
| 签名 | `Signature=adhoc`、`Identifier=com.quank.desktop`、Mach-O thin (arm64)、TeamIdentifier=not set |
| `hdiutil verify` | `checksum of "dist/QuanK-v0.49.0-mac-arm64.dmg" is VALID`（末尾 CRC32 $B231F48E） |
| 挂载后内容 | `QuanK.app`、`应用程序` 链接、`首次打开.command`；app 版本 0.49.0；包内 `app.asar` sha256 与打包目录一致 |

---

## R3. 发布

本机无 `user.*` 配置（git 报 `Author identity unknown`），提交与打标签用 `-c user.name=刘冰鑫 -c user.email=liubingxin@ip-192-168-30-10.ap-northeast-1.compute.internal` 沿用历史作者身份，未写任何 git 配置文件。

| 项 | SHA | 说明 |
| --- | --- | --- |
| feature commit | `4d7e4e5230397bf02ba01c114b37e356de1eb091` | `feat: v0.49.0 F4 组合与风控`（22 个文件，1227 插入 / 18 删除；`dist/`、`node_modules`、`tmp-*` 未入库） |
| merge commit | `260575142d0011f3a078e1f7a14af31dac362680` | `merge: F4 组合与风控`（`--no-ff`，`cc5d779..2605751` 已推送 main） |
| tag | `4c0d728c2c4b2af0853bf4315bfd34651f96d9f6` | 附注标签 `v0.49.0` → 指向 merge commit `2605751`，已推送 |

推送 main 第一次报 `Failed to connect to github.com port 443 after 75003 ms`，立即重试成功（`cc5d779..2605751  main -> main`）；tag 推送一次成功。

Release：

- 链接：https://github.com/scliubingxin/QuanK/releases/tag/v0.49.0
- 标题：`QuanK v0.49.0 · F4 组合与风控`
- notes 组成：ITERATION_LOG.md 顶部 v0.49.0 条目原文（733 字，原样）+ 下载校验表（含 `shasum -a 256 -c` 命令）+ 安装说明（ad-hoc 签名、未公证，首次打开运行 DMG 里的「首次打开.command」或右键打开）+ 结尾说明「组合风控只提醒、只计算，不会替你下单；组合曲线与风险指标按当前持仓数量回溯历史行情估算，不是实际交易记录。」

`gh release view v0.49.0 --json url,assets` 核对：

| 资产 | 字节 | digest（远端） | 与本地比对 |
| --- | --- | --- | --- |
| `QuanK-v0.49.0-mac-arm64.dmg` | 457,594,417 | `sha256:db91e32dbe989113d21a9907d6fd0411ce258dec1fc029f30b0fe450bc1d7304` | 一致 ✓ |
| `QuanK-v0.49.0-mac-arm64.zip` | 483,752,264 | `sha256:d0f3f75bddd1a2e20f79f1a9fb150306b8ab8c3ca53796a8563f91e3b96c73ed` | 一致 ✓ |

---

## R4. 清理

`/tmp/qk-pack-049-*`（打包工作目录）、`/tmp/qk-mnt-049`（挂载点）、`/tmp/qk049_*`（asar 校验脚本、notes、日志）已删除。

---

## 说明

- 本轮未运行任何测试、未截图；测试结果沿用 Quick 侧已跑通的记录。
- `dist/` 内 v0.46.0、v0.47.0、v0.47.1、v0.48.0 的旧安装包保留未删。
