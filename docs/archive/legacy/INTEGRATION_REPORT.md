# WillBuddy PPT 集成 · 阶段 1 小结

- 恢复来源：本分支 `feat/ppt-render-rebuilt` 上未提交的 render 线改动（`desktop/src/office/{canvas-view.js,bus.js}`、`desktop/src/shared/{office-zoom.js,office-font-map.js}`、office 字体/快照内核与 `_review/` 下的 harness 与对照图）。
- 核对结果：`git status --short` 仅涉及 render 线 14 个文件 + `_review/`，无越界改动；`office-worker-bundle.mjs` 与 `office-kit/worker.py` 内容一致（bundle 非过期）。
- 改动一（压缩转发）：`office.js` 拖动期间新增 `pointermove` 转发，鼠标移动类型改用内核许可的 `LOK_MOUSEEVENT_MOUSEMOVE=2`（原 `type:5` 会被白名单拒绝），以 `requestAnimationFrame` 节流仅保留最新坐标，`pointerup` 清空挂起状态即停。
- 改动二（缩放归属）：`office.js` 模块顶层置位 `window.wbZoomOwner = true`，外壳据此不再注入重复缩放控件；`office-workspace.mjs` 的鼠标白名单核查为 0=按下/1=抬起/2=移动，type:2 已在许可范围内，故未改 `worker.py`、无需重跑 `scripts/bundle-office-worker.py`。
- 测试结果：`node --test tests/office-render-view.test.mjs tests/office-zoom.test.mjs` → 12/12 通过，0 失败（日志 `/tmp/integ-p1.log`）。
- 提交哈希：`f8d40d9`（`[render] 重建：适应窗口/百分比缩放/Retina/坐标/字体替换/拖动转发`）；本报告为紧随其后的第二个提交。
- 未进入阶段 2：未启动 Electron/GUI，未 push，未使用 stash/reset/checkout --/clean。

## 阶段 2 合并记录

已合并 origin/feat/ppt-shell (3fca91b)，冲突文件：desktop/src/office/index.html、desktop/src/office/office.css，处理方式：按阶段 2 规则以 shell 外壳版本为主（git checkout --theirs），render 线内容已由 shell 外壳保留（旧 id 均迁至 #wb-legacy 隐藏容器）。合并提交：dad8ecb。

已合并 origin/feat/ppt-pages (c8715e7)，冲突文件：LANE_REPORT.md（add/add）、desktop/runtime/office-kit/worker.py（内容）、desktop/runtime/office-worker-bundle.mjs（内容）、desktop/src/office/office.js（内容），处理方式：LANE_REPORT.md 保留两条线内容拼接；worker.py 保留 HEAD 的 `return` 行（含 tileWidth/tileHeight/fonts 字段），追加 pages 的全部 ooxml 与 lok 新增函数；bundle 暂保留 HEAD（render 线）版本，待 ribbon 合并后统一用 scripts/bundle-office-worker.py 重新生成；office.js 两处冲突分别取 render 的 import/draw() 并追加 pages 的 bus/pages.js import 及 emitPages(s)。合并提交：c667828。

已合并 origin/feat/ppt-ribbon (bb30862)，冲突文件：LANE_REPORT.md（add/add）、desktop/runtime/office-kit/worker.py、desktop/runtime/office-worker-bundle.mjs、desktop/services/office-workspace.mjs、desktop/src/office/index.html、desktop/src/office/office.js（3 处）；office-preload.cjs 为已解决态（白名单并集）。处理方式：
- worker.py：回调事件种类取并集（HEAD 的 5/6/7 + ribbon 的 1/2/8/34，并保留 STATE_CHANGED `states` 状态表）；snapshot 的 `return` 行用 HEAD 版本（含 tileWidth/tileHeight/fonts 与 pages 字段）并加入 ribbon 的 `states`；保留全部 `elif op ==` 分支（pages 的 thumbnail/slide_action/notes_get/notes_set/deck_info/view_mode，ribbon 的 uno）；删除两处合并残留文本（`origin/feat/ppt-pages`、`origin/feat/ppt-ribbon`）。`python3 -c "import ast;ast.parse(...)"` 通过。
- office-workspace.mjs：导入取并集（validateSnapshotPng + validateUno + INTERNAL + pathToFileURL/realpath 合并进 node:fs/promises 单条），操作白名单两边的 `elif op==` 处理分支全部保留（pages 各方法 + ribbon 的 `uno`/insertImage）。
- office.js：保留 render 的 canvas-view 渲染、[integ] 拖动转发；`draw()` 内新增 `bus.emit('office:shot',s)`（ribbon.js/commands.js 依赖）；保留 pages 的 bus/pages.js import、emitPages 与末尾 slide:goto/doc:refresh 三段；保留 ribbon 的 `window.wbOfficeHost` 接线。ribbon 的 `viewport` 常量与重复 `import './bus.js'` 未取用（viewport 由 canvas-view.js 管理）。
- index.html：以 shell 外壳为主，并入 ribbon.css 引用与 ribbon.js/commands.js 脚本（顺序：office.js → ribbon.js → commands.js → shell.js）。
- office-worker-bundle.mjs：不手工合并，`git checkout --theirs` 后用 `python3 scripts/bundle-office-worker.py` 重新生成，`--check` 通过。
- LANE_REPORT.md：shell/pages/ribbon 三条线汇报顺序拼接。
合并后 `grep -rn '^<<<<<<<|^>>>>>>>|^=======$' desktop` 无结果；`node --check` 对 desktop/src/office/*.js（15 个）、desktop/services/office-workspace.mjs、desktop/office-preload.cjs 全部通过。合并提交：f681a4f。

已合并 origin/feat/ppt-gen (5cbdc94)，冲突文件：LANE_REPORT.md（add/add，四条线汇报顺序拼接）；其余 [lane:gen] 改动（desktop/runtime/documents.mjs 的结构化版式分支、desktop/runtime/ppt-layers.mjs 的 imageId/logo、desktop/runtime/agent.mjs 的 PPT_DECK_TOOL_NOTE、lib/slides.ts 的 buildStructuredPptx/exportStructuredPptx）自动合并无冲突。新增 desktop/runtime/ppt-deck/*（engine/from-markdown/layouts/measure/prompt/schema/themes）、desktop/runtime/ppt-themes.json、desktop/scripts/{gen-ppt-themes,make-ppt-review}.mjs、scripts/{ppt_check.py,ppt_render.py,ppt_fonts.conf}、desktop/tests/ppt-deck.test.mjs 与 _review/ 对照产物。合并后再次运行 `python3 scripts/bundle-office-worker.py`（gen 线未改 worker.py，bundle 与上一版一致）并 `--check` 通过。合并提交：ccef8e1。

## 阶段 2 小结

### 合并顺序与冲突清单
| 序 | 合并对象 | 合并提交 | 冲突文件 | 处理 |
|---|---|---|---|---|
| 1 | origin/feat/ppt-shell (3fca91b) | dad8ecb | desktop/src/office/index.html、office.css | 以 shell 外壳为主，render 旧 id 迁入 #wb-legacy |
| 2 | origin/feat/ppt-pages (c8715e7) | c667828 | LANE_REPORT.md（add/add）、office-kit/worker.py、office-worker-bundle.mjs、desktop/src/office/office.js | 报告拼接；worker.py 取 HEAD return 行 + 追加 pages 的 ooxml/lok 函数；bundle 暂留 HEAD 待统一重建；office.js 取 render import/draw + pages 的 bus/emitPages |
| 3 | origin/feat/ppt-ribbon (bb30862) | f681a4f | LANE_REPORT.md（add/add）、worker.py、office-worker-bundle.mjs、services/office-workspace.mjs、index.html、office.js（3 处） | 事件种类与状态表取并集、return 行加 states、保留全部 elif op 分支并清残留文本；workspace 导入/白名单并集；office.js 保留 canvas-view + 拖动转发并在 draw 内发 office:shot，保留 pages 三段与 wbOfficeHost；index.html 以 shell 为主并入 ribbon.css/ribbon.js/commands.js；bundle 由脚本重建 |
| 4 | origin/feat/ppt-gen (5cbdc94) | ccef8e1 | LANE_REPORT.md（add/add） | 四条线汇报顺序拼接；gen 的四处 [lane:gen] 代码改动自动合并 |
| 5 | 合并记录 | 6a22ad5、bd2ca07 | — | 报告追加 |

- 合并后 `grep -rn '^<<<<<<<\|^>>>>>>>\|^=======$' desktop --exclude-dir=node_modules` 无结果（全仓库扫描亦无结果）。
- `node --check` 通过：desktop/src/office/*.js（15 个）、desktop/services/office-workspace.mjs、desktop/office-preload.cjs；`python3 -c "import ast; ast.parse(...)"` 对 worker.py 通过。
- `python3 scripts/bundle-office-worker.py` 重新生成 office-worker-bundle.mjs，`--check` 通过（ribbon、gen 两次合并后各跑一次）。

### 测试结果
- 阶段 2 指定用例（render/pages/ribbon/gen 四线新增）：`tests/office-render-view.test.mjs`、`office-zoom.test.mjs`、`office-shell-logic.test.mjs`、`ribbon-config.test.mjs`、`office-uno.test.mjs`、`office-uno-workspace.test.mjs`、`ppt-deck.test.mjs`、`office-pages.test.mjs`、`office-pages-ui.test.mjs` → **61 用例全部通过，0 失败**（日志 `/tmp/integ-p2.log`）。
- 受影响面回归：`office-workspace.test.mjs`、`office-preload.test.mjs`、`preload-office.test.mjs` → 10 用例全部通过。
- 全 office 套件侦察性跑（`tests/office-*.test.mjs`、`native-office.test.mjs`、`preload-office.test.mjs`）：256 用例，136 通过 / 119 失败 / 1 取消；失败原因全部为本机缺失打包运行时（`libmergedlo.dylib`、`soffice`、`运行时路径不安全`），与合并改动无关，正式与 main 逐项比对留待阶段 3（`/tmp/integ-p2-office.log`）。
- 未启动 Electron/GUI，未 push，未使用 stash/reset --hard/clean/restore。

### 契约登记（待办，CONTRACT.md 在 $W 根目录、$I 之外只读，未改动）
- 新增：`office:shot`（office.js 每次 snapshot 后发到 bus，内容含 `states`）、`ribbon:tabs{visible}`、`window.wbOfficeHost{serial,perform,draw,status,shot,info}`、`window.wbBus`；`command` detail 可带 `action:'pickImage'`。
- 沿用/新增的 shell 事件：`master:info`、`menu:action`、`font:substituted`、`slide:add`、`notes:resize`、`panel:opened/closed`、`ribbon:tab`（name 用英文键 home/insert/beautify/transition/animation/slideshow/view）。

### 最终提交
- `ccef8e1` merge feat/ppt-gen、`bd2ca07` gen 合并记录、`f681a4f` merge feat/ppt-ribbon、`6a22ad5` ribbon 合并记录、`c667828` merge feat/ppt-pages、`dad8ecb` merge feat/ppt-shell。
- `git ls-files | grep -E '\.whl$|node_modules'` 无结果，无需 `git rm --cached` 清理。
