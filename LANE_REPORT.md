# shell 线汇报（feat/ppt-shell）

## 做了什么
- 重写 `index.html` / `office.css`，按契约 id 搭出新外壳：`#wb-topbar`、`#wb-tabs`、`#wb-ribbon`（外层卡片 `#wb-ribbon-card`）、`#wb-rail`（含 `#wb-add-page`、`#wb-rail-list`）、`#wb-stage`（含原 `#viewport/#document` 与 `#wb-free-select`）、`#wb-notes`（上沿 `#wb-notes-resizer` 可拖拽/键盘调高）、`#wb-side-panel`、`#wb-statusbar` 及全部契约子 id。
- 新增 `shell.js`（交互与 bus 接线）、`shell-logic.js`（纯函数）、`icons/icons.js`（内联 SVG，线性 1.5px、20px，无外部资源）、`bus.js`（与契约逐字一致）。
- 顶栏：文件名 + 保存状态；保存/同步/放映/分享/「…」图标按钮；黑底「AI 对话」。「…」菜单：打开文件夹、另存为、设置默认打开方式、（分隔线）放弃草稿并关闭。Cmd/Ctrl+S 保存。
- 页签：开始/插入/美化/切换/动画/放映/视图，当前页签加粗+蓝下划线；折叠箭头收起/展开功能区（收起后页签行右侧出现展开按钮，点页签也会展开）。
- 母版外壳：`view:set{mode:'master', name?}` 显示「母版名称：xxx」栏与「关闭母版」，页签精简为 开始/插入/切换/视图，隐藏备注与自由框选；关闭发 `view:set{mode:'normal'}`。
- 状态栏：页码（监听 `slide:changed`）、普通视图/备注/放映/适应窗口、`− 78% +`；点百分比弹出 50/75/100/150/200/适应窗口。
- 迁移：保存→顶栏保存图标；放弃草稿→「…」菜单；AI 对话→侧边抽屉 `ai` 面板（原 `#ai` 整体搬入，操作提示与隐私说明折叠进去）；「编辑选中文字/AI 编辑选区/写入文档」及输入框→画布底部浮动工具条 `#wb-float`（有选区、有草稿或选区修改中时出现）。原 Slide N 按钮行不再显示。

## 改动文件
`desktop/src/office/{index.html,office.css,shell.js,shell-logic.js,bus.js,icons/icons.js}`、`desktop/tests/office-shell-logic.test.mjs`、`_review/`（截图与静态测试页）。**未改 office.js**。

## 对契约的依赖/新增
- 事件按契约收发。新增：`ribbon:collapse{collapsed}`、`ribbon:tab{name,label}`、`slide:add{}`（「添加页面」按钮）、`outline:toggle{open}`、`notes:resize{height}`、`panel:opened{name,el}`/`panel:closed{name}`、`menu:action{id,handled}`。
- **`ribbon:tab` 的 name 取值**：`home insert beautify transition animation slideshow view`（同时带 `label` 中文）。ribbon 线需按此匹配。shell 也监听该事件，其他线可用它切页签；启动时会发一次 `home`。
- `menu:action` ids：`open-folder save-as set-default sync share ribbon-search`。别的线处理后设 `detail.handled=true`，否则 shell 提示「即将支持」。目前 IPC 白名单没有这些能力，所以灰态/提示。
- 面板：`panel:open{name}` 会在 `#wb-panel-body` 找 `section[data-panel=name]`，没有就新建。动画面板已有占位 `#wb-panel-animation`（pages 线直接往里渲染）。
- 缩放：render 线接手后请设 `window.wbZoomOwner = true`，shell 就停止代点旧控件（`#zoom-in/#zoom-out/#zoom-fit/#zoom`）和每 250ms 读 `#zoom` 发 `zoom:changed` 的轮询。
- 缩略图：`#wb-rail-list` 若出现不带 `data-wb-fallback` 的子节点，shell 自动撤掉自带的文字占位列表。
- 保留的隐藏旧 id（office.js 依赖，在 `#wb-legacy` 内）：`#name #status #action-status #save #discard #toggle-ai #up #down #zoom* #parts`。shell 用 MutationObserver 镜像到新控件。`#parts` 也是页码/页数的数据源，请勿删。
- `#wb-legacy-nav`（撤销/重做/B/I/U/全选/xlsx 定位）放在 `#wb-ribbon` 之外：ribbon 线填充 `#wb-ribbon` 后它自动隐藏，同时不会删掉 office.js 初始化需要的 `#cell-nav` 等节点。docx/xlsx 仍显示它，并隐藏 PPT 专属的页签、缩略图、备注。

## 验证
- `node --test tests/office-shell-logic.test.mjs` 6 项通过。其余 office 测试与基线失败项一致（缺 LibreOffice，不涉及本次文件）；shell 目录尚未 `npm ci`，所以环境类失败条数略有浮动。
- 未启动 Electron。用 Chrome headless 加载 `_review/harness.html`（桩 API + 31 页假数据）截图：`shell-home/menu/panel/master/zoom.png`（另有 `shell-ai.png`，我没逐张核对）。截图宽 1568，最小宽度 1100 靠 `min-width` 保证，未单独截图。

## 已知问题
- 尺寸取自截图按约 1.2 倍估算（顶栏 60、页签 46、功能区 100、侧栏 270/410），非逐像素量取；字号、颜色未与截图逐点比对。
- 母版栏下方缩略图内容、母版视图中「退出母版」按钮、右下「关闭母版」气泡属于 pages/ribbon 线，shell 未做。
- 画布在 pptx 下 `max-height:100%` 自适应，真实内核渲染后的间距需实机复核。
- 浮动工具条会遮挡幻灯片底部一小块，可考虑后续改为可拖动。
- 200% 在旧缩放里取整为约 188%，等 render 线接管后会消失。
- 「放映」顶栏发 `show:start{from:'first'}`，状态栏发 `{from:'current'}`。

## 合并提示
index.html / office.css 为整体重写：与 ribbon、pages 线合并时只需在 index.html 末尾追加各自 `<script type="module">`（和 ribbon.css 的 `<link>`），别改我已有 id。bus.js 内容与契约一致，冲突时任取一份。
# pages 线汇报（feat/ppt-pages）

## 做了什么
1. **缩略图栏** `slide-rail.js`：渲染到 `#wb-rail-list`（无则临时建 `#wb-rail`），顶部「添加页面」；页码 + 真实缩略图；当前页蓝色圆角边框；点击发 `slide:goto`；↑/↓/PageUp/PageDown 切页；右键菜单（新建/复制/删除/上移/下移）；拖拽排序；懒加载（IntersectionObserver）、串行取图、LRU（64）；编辑后只对当前页做 600ms 防抖刷新；结构变化时清缓存。
2. **切页同步**：`office.js` 加 `// [lane:pages]` 段：`slide:goto` 处理（调用原 `perform('part')`）、`doc:refresh` 处理、`emitPages()`（每次 `draw()` 后发 `slide:changed {index,count}`、数量变化时发 `slides:changed`）。底部 Slide 1…N 按钮仍可用，也会触发 `slide:changed`。
3. **备注** `notes.js`：`#wb-notes`（无则临时建），占位「单击此处添加备注」；输入 800ms 防抖或失焦写回；切页/页面结构变化前先写回旧页，避免错页。
4. **放映** `slideshow.js`：`show:start {from}`；全屏黑底居中，用 `thumbnail`（宽 1600）取图并预取下一页；←/→/空格/PageUp/PageDown/Home/End/点击，Esc 退出；结束页「放映结束，单击退出」；退出发 `show:end`。演讲者视图未做（由 ribbon 置灰）。
5. **母版视图**：`view:set {mode:'master'|'normal'}`，worker 用 `.uno:SlideMasterPage` / `.uno:NormalMultiPaneGUI`；缩略图栏显示「母版 + 缩进版式」；发 `master:info {name, layouts, readonly}`，退出发 `{name:null}`。实机验证：母版模式下 LOK 的 part 即各版式（无独立母版页），所以母版行使用第 1 个版式的渲染图。母版名取自 theme 名。内核不支持时 `readonly:true` 并带 message。
6. **动画窗格** `animation-pane.js`：`panel:open {name:'animation'}` 渲染标题、空态「请选择需添加动画的对象」、当前页已有动画（解析 `p:timing` 的 presetClass/spTgt）；添加按钮置灰「即将支持」；`panel:close` 或打开其他面板时移除。
7. **worker 新增（只追加，白名单）**：`thumbnail`、`slide_action`（insert/duplicate/delete/move，对应 `.uno:InsertPage/DuplicatePage/DeletePage` 与 `selectPart+moveSelectedParts`）、`notes_get`、`notes_set`、`deck_info`、`view_mode`。每个都做字段白名单与范围校验；slide_action 执行后核对页数。
   - **备注方案**：把当前文档另存为 pptx，在 OOXML 里只改目标页的 notesSlide（没有则新建，需有 notesMaster），其余 zip 条目原样复制，再让内核重新加载补丁后的文件，之后走原有 `save()` 生成新版本。这样内核内存里的文档与草稿一致，后续保存不会丢备注。代价：写备注会清空内核的撤销栈（与每次编辑即存版本的机制一致，版本可回退）。
   - 主进程 `office-workspace.mjs` 追加 `thumbnail/slideAction/notesGet/notesSet/deckInfo/viewMode`，写操作 `locked`、检查 30 分钟授权、`sequence++`/`dirty`/`save()`，进入现有草稿与版本机制。
8. **测试**：`tests/office-pages.test.mjs`（LRU、动作白名单与参数校验、放映状态机、python-pptx 备注往返、bundle 同步）、`tests/office-pages-ui.test.mjs`（JSDOM：栏/备注/放映）、`tests/acceptance/office-pages-live.mjs`（真实 LibreOffice 实测：缩略图、备注读写、复制/移动/删除后备注顺序、导出后用 python-pptx 复核，已通过）。

## 改动文件
- 新建：`src/office/{slide-rail,notes,slideshow,animation-pane,pages,pages-dom}.js`、`pages.css`、`bus.js`（与契约一致）、`src/shared/office-pages.js`、上述 3 个测试。
- 追加：`runtime/office-kit/worker.py`（+`office-worker-bundle.mjs` 已用脚本重新生成）、`services/office-workspace.mjs`（文件头 1 行 import + 6 个方法）、`main/office-windows.mjs`（6 行路由）、`office-preload.cjs`（白名单追加 6 个操作名）、`src/office/office.js`（文件头 1 行 import；`draw()` 末尾加 `emitPages(s);`；文件末尾 3 段）。

## 对契约的依赖/新增
- 额外内部事件：`doc:drawn {part,count,names,revision,sequence}`（office.js 发）、`doc:refresh`（任何模块请求重绘）、`pages:before-change {wait[]}`、`pages:error {message}`、`notes:saved`、`show:end`。
- `master:info` 为契约外新增，shell 订阅即可显示母版名称。
- 样式由 `pages-dom.js` 动态加载 `pages.css`（CSP 不允许内联样式）。容器无则临时建。

## 已知问题
- 动画窗格带自己的「动画 ×」标题，若 shell 的抽屉也画标题会重复，集成时二选一。
- `p:timing` 解析只列出 presetClass 效果，未用真实带动画的 PPT 验证；解析不到则显示空态。
- 母版模式的母版行是第 1 个版式的渲染图；母版名只取第一个母版。
- 放映用 LOK 静态渲染，无动画/切换效果；演讲者视图未做。
- 缩略图和画布共用同一个内核串行队列，大量缩略图加载时编辑响应会略有延迟（客户端串行、只加载可见页）。
- 第一次启动内核超过 30 秒会超时（既有行为）。
- 未在真实 Electron 窗口里目视验证 UI，仅 JSDOM 与内核实测。

## 合并提示
- `office.js` 与 render 线冲突概率最大：本线改动只有文件头 import、`draw()` 末尾的 `emitPages(s);`、文件末尾追加段；`office-preload.cjs` 与 ribbon 线都改白名单，合并时取并集。
- 合并后运行 `python3 scripts/bundle-office-worker.py` 重新生成 bundle（render 线也会改 worker.py）；`office-pages.test.mjs` 会校验同步。
- 实机测试：`WB_TEST_OFFICE_DIRECTORY=/Applications/WillBuddy.app/Contents/Resources/runtimes/LibreOffice.app/Contents/MacOS node --test tests/acceptance/office-pages-live.mjs`。

## 事故说明（请注意）
git worktree 共用同一个 stash 栈。我在跑基线对比时用了 `git stash -u`，`stash pop` 弹出的是别的线刚存的 stash，混进了我的目录（涉及 office-fonts、office-kit.mjs、office-zoom.js、index.html、office.css、office.js、worker.py 等）。我已把这些改动完整保存为 `./wb-par/recovered-foreign-stash-from-pages.patch`（342 行），并从本分支清除，随后恢复了我自己的 stash。该 patch 很可能属于 render 或 shell 线，请交给对应线用 `git apply` 恢复；它们的 stash 栈里那一条已不存在。
# LANE_REPORT · ribbon（feat/ppt-ribbon）

## 做了什么
- 按 mwkaekya / mwkaeqnu / mwkaewg5 / mwkaf57u / mwkafbii / mwkafhwc / mwkafoxk / mwkafueb 实现了 7 个页签的功能区，用声明式配置驱动（`ribbon-config.js`）。图标是内联 SVG 线性图标，离线可用。
- 新增 `uno` 操作：前端发 bus `command` → `commands.js` → `willbuddyOffice.invoke('operation',{op:'uno'})` → 主进程 `validateUno` 白名单 + 类型化参数校验 → worker 再做一次形状校验后调用 `postUnoCommand`。原有的 `command` 操作（撤销/重做/B/I/U，带历史校验）保持不变，继续复用。
- 插入图片走受控文件通道：新增 IPC `pickImage`，在主进程弹系统文件框（PNG/JPEG，≤4MiB，按魔数校验），文件写进会话目录 `uploads/` 后用内部专用的 `.uno:InsertGraphic` 插入。渲染进程不能指定文件路径，worker 也会拒绝 `uploads/` 以外的 URL。
- 状态同步：worker 以只追加的方式记录 `LOK_CALLBACK_STATE_CHANGED`（枚举值 8），存入 `states` 字典（最多 400 个键），snapshot 时一并返回。`office.js` 每次 draw 都发 bus `office:shot`。`commands.js` 把状态映射成 `command:state`，包括按下态、字体名、字号，以及组合/排列的可用状态。ribbon 根据 `selectionType` 和 `.uno:BringToFront` 的可用状态判断当前选区是文字、对象还是无选区。也会响应 `selection:changed`。

## 改动文件
新建：`src/office/ribbon.js`、`ribbon.css`、`ribbon-icons.js`、`ribbon-config.js`、`commands.js`、`bus.js`（与契约内容逐字一致）、`src/shared/office-uno.js`（白名单、参数校验、状态映射，主进程和渲染进程共用）；测试 `tests/ribbon-config.test.mjs`、`office-uno.test.mjs`、`office-uno-workspace.test.mjs`；验收 `tests/acceptance/office-ribbon-live.mjs`（真实内核）、`office-ribbon-ui.mjs`（Chrome 截图）。

小幅修改（都标了 `[lane:ribbon]`）：
- `office-preload.cjs`：允许列表追加 `pickImage`
- `main/office-windows.mjs`：新增 `pickImage` 分支
- `services/office-workspace.mjs`：新增 `op==='uno'` 分支和 `insertImage()`
- `runtime/office-kit/worker.py`：追加 `states` 记录、snapshot 返回 `states`、新增 `op=='uno'`；已用 `scripts/bundle-office-worker.py` 重新生成 bundle
- `src/office/office.js`：draw 时发 `office:shot`，文件末尾暴露 `window.wbOfficeHost`
- `src/office/index.html`：引入 ribbon.css、ribbon.js、commands.js

## 按钮清单
**已打通（真实 UNO）**：撤销、重做、格式刷、清除格式、加粗、倾斜、下划线、删除线、上标、下标、字体、字号、增大/减小字号、字体颜色、高亮色、左/居中/右/两端对齐、项目符号、编号、减少/增加缩进、行距（1/1.5/2）、横向文本框、形状（矩形/圆角矩形/椭圆/直线/箭头）、图片、表格（8×8 网格）、空白页面、填充颜色、边框颜色、组合/取消组合、置于顶层/底层/上移/下移、幻灯片比例 16:9/4:3（开始→页面设置、美化→幻灯片比例两个入口）。
**走 bus 事件**：动画、动画窗格（`panel:open{name:'animation'}`）、从头演示/从当前页演示（`show:start`）、普通视图、幻灯片母版、母版编辑、退出母版（`view:set`）、标尺/参考线/网格线/智能吸附/备注（`view:toggle`，带 `checked`）、缩放下拉（`zoom:set`）、适应窗口（`zoom:fit`）。
**置灰（悬停显示「即将支持」，点击无反应）**：打印（LibreOfficeKit 没有打印接口）、所有切换效果（含无切换和淡出淡入）、效果选项、持续时间、应用到全部、预览效果；所有动画效果、预览、批量动画、动画刷、开始方式、持续时间、延迟、触发器、隐藏全部角标；字间距、分栏、分散对齐、垂直对齐、效果、竖向文本框、更多形状；音频、视频、链接、图表、页脚；4 组配色（保持彩色显示，不可点）、更多配色、设置背景；演讲者视图；功能区右侧的搜索。
- 切换效果没打通的原因：Impress 设置幻灯片切换要走侧边栏或对话框，没有可以带参数直接 dispatch 的 UNO 命令，在 LOK 下发出去也不会落盘。要实现，需要在 worker 里通过 UNO API 修改页面的 `TransitionType` 属性，或者交给 gen 线改 XML。

## 验证
- `node --test tests/*.test.mjs`：本线新增 3 个测试文件共 22 项全部通过。和基线（stash 后跑）逐项对比失败列表，没有新增失败。全量运行时偶尔有个别并发、HTTP 类用例失败（例如 knowledge-vector），单独重跑都通过，原因是本机负载高（load 20 到 80），与本线无关。
- 真实内核（`/Applications/WillBuddy.app` 打包的 LibreOffice 和 python）上 `office-ribbon-live.mjs` 通过：插入 3×2 表格、页面改 4:3、插入 PNG、加粗/删除线/字号 30 写入 PPTX 并经 python-pptx 复核、STATE_CHANGED 回报 `Bold=true`/`FontHeight=30`/`BringToFront=enabled`、组合、撤销。运行命令：
  `WB_TEST_PYTHON=/Applications/WillBuddy.app/Contents/Resources/runtimes/python/bin/python3 WB_TEST_OFFICE_DIRECTORY=/Applications/WillBuddy.app/Contents/Resources/runtimes/LibreOffice.app/Contents/MacOS node --test tests/acceptance/office-ribbon-live.mjs`
  本机负载高时内核启动约 43 秒，超过默认的 30 秒，所以这个验收用例注入了 120 秒超时的 driver。生产环境默认值没改。
- `office-ribbon-ui.mjs`：Chrome 截图逐页签与目标图比对，页面无报错。点击加粗、选字号 24、在表格网格选 3×2 都发出了正确的 operation；点击置灰的打印按钮不报错。

## 契约依赖与新增
- 使用：`ribbon:tab`、`command`、`command:state`、`selection:changed`、`panel:open`、`show:start`、`view:set`、`view:toggle`、`zoom:set`、`zoom:fit`。
- 新增（需要在 CONTRACT.md 登记）：`office:shot`（office.js 每次 snapshot 后发出，内容为完整 snapshot，含 `states`）；`ribbon:tabs` {visible}（页签条由 shell 提供时，ribbon 通知母版模式下应显示哪些页签）；`window.wbOfficeHost` {serial, perform, draw, status, shot, info}。
- `command` 的 detail 可以带 `action:'pickImage'`（不带 uno）。

## 已知问题
- 状态里 `.uno:Color=-1` 表示自动颜色，目前没映射到颜色条，颜色条显示的是最近一次选择的颜色。
- `.uno:Text` / `.uno:BasicShapes.*` 只是进入绘制工具，需要用户在画布上拖动才会生成对象。这取决于 render 线的鼠标拖拽是否转发 move 事件（基线只有按下和抬起）。
- `uno` 操作没有检查 `UNO_COMMAND_RESULT.success`，命令无效时只会表现为文档没有变化，不会报错。

## 合并提示
- 如果 shell 线已经创建 `#wb-tabs`（有子元素），ribbon 不再自己渲染页签条，只监听 `ribbon:tab`。没有的话会临时生成 `.wb-tabs-temp`。`#wb-ribbon` 不存在时会插到 `<main>` 前面。
- 基线 `<nav>` 里的旧按钮（撤销/B/I/U/缩放）原样保留，没有删。集成时由 shell 决定是否隐藏。
- `worker.py` 改动是 3 处追加。和 pages 线冲突时保留双方的 `elif op==` 分支即可，然后必须重新运行 `python3 scripts/bundle-office-worker.py`（bundle 文件不要手工合并）。
- `office-workspace.mjs` 的 `else if(op==='uno')` 插在 `else throw Error('不支持的Office操作')` 前一行。

# gen 线报告（feat/ppt-gen）：PPT 生成源头重做

## 1. 现有链路（改前）
| 环节 | 位置 | 现状 |
|---|---|---|
| 模型入口 | `desktop/runtime/agent.mjs` 的 `document_create` 工具 | 模型输出 JSON `{slides:[{title,bullets[],notes,chart?/cards?/table?/layers?}]}`，没有版式概念 |
| 排版 | `desktop/runtime/documents.mjs`（vendor `office.cjs` 里的 PptxGenJS） | 标题固定 30pt Arial，蓝色；bullets 一个 11.5in×5in 文本框，字号靠 `bulletFontSize` 粗估，依赖 `fit:shrink`（LibreOffice 不执行）。cards/table/chart 只是 2 列网格或固定行高。**排版者是代码里的固定坐标，模型无法选版式** |
| 图层/编辑 | `ppt-layers.mjs`（`layers` 自定义图层，校验+绘制）、`ppt-layer-edit.mjs`（对已有 pptx 的单图层 OOXML 补丁） | 只负责后期调整，不参与生成 |
| Web 导出 | `lib/slides.ts`（pptxgenjs，Markdown→每章节一页大标题+项目符号，封面+页脚 n/N） | 同样是「标题 + bullet 墙」 |
| genoffice | `desktop/main/genoffice.mjs`、`local-runner/genoffice_adapter.py`、`vendor/genoffice*`：`create_pptx` 接收 `--ops`，由 genoffice 原生渲染/转换/审计 | 本线未改；它是转换/预览/审计通道，不是 PPT 内容生成的排版者 |
| 提示词 | 仅 `document_create` 工具描述（无独立 skill/preset 提到 pptx） | 只描述 bullets/cards/table/chart/layers 字段 |

用户截图的问题（字号过大、整页项目符号、溢出）来自 `bullets` 路径：模型只能给文字，排版靠固定框。

## 2. 新方案
新模块 `desktop/runtime/ppt-deck/`（纯 ESM，无依赖；PptxGenJS 构造器由调用方传入，桌面用 vendor 版，Web 用 npm 版）：

| 文件 | 作用 |
|---|---|
| `schema.mjs` | 结构化 schema：每页 `layout` + 槽位；严格校验（未知字段/数量/图片 ID 白名单）；`lintDeck` 给出要点条数/字数警告 |
| `measure.mjs` | 中文宽度估算（CJK=1em，数字 0.56，大写 0.66…，+3% 余量）、折行（行首禁标点、行尾禁开括号、英文词不拆）、`fitParas`（缩字→紧凑行距）、`splitText` |
| `themes.mjs` | 4 套主题、网格与字号常量 |
| `layouts.mjs` | 13 种版式，纯函数产出图元（shape/text/table/image），自身计算几何并标记溢出 |
| `engine.mjs` | 校验→版式→溢出则拆页（递归）→章节编号→页码 n / N→渲染到 PptxGenJS |
| `from-markdown.mjs` | Markdown 兜底转换（Web 导出用，按内容自动选 cards/process/compare-table/summary） |
| `prompt.mjs` | 提示词（大纲→选版式→填槽位）与工具说明 |

### 版式（13 种，覆盖要求的 12 类）
cover 封面、toc 目录、section 章节页、cards 要点卡片（2/3/4 列）、image-text 左文右图、compare-table 对比表（2–4 数据列+首列维度）、process 横向箭头流程（3–6）、timeline 时间线（3–8）、kpi 关键数字（2–4）、architecture 分层架构（2–5 层）、matrix 四象限、summary 总结、closing 封底。

### 网格与字号（13.333×7.5in）
- 左右边距 0.6，页面安全边距 ≥0.4；页眉：章节编号标签（0.56 方块，如「2.4」）+标题（28→22pt，居中对齐）+副标题（14→12pt）+分隔线（带 1.1in 主色短条）+右上 logo 位（品牌名/图片，可关 `brand.showLogo:false`）；正文区 y=1.9–6.8；页脚 y=7.04：左品牌名、右「n / N」（9pt）。封面/章节/封底不显示页码，`pageNumbers:false` 可全关。
- 字号：标题 24–28（极端长标题允许降到 22 且仍不溢出）、副标题 12–14、正文/卡片文字 11–14、卡片标题 12–16、image-text/要点列表主体 11–16（唯一超过 14 的正文）、KPI 数值 28–44、封面/章节大标题 32–44 与 30–40。
- 行距：多倍行距 1.1（紧凑时 1.0）；估算行高 = 字号×1.32×行距倍数。
- 卡片：圆角 0.1in、浅底填充、0.75pt 描边、内边距 0.22in；配色角色：primary / accent / light / bg / coverBg / text / muted / border / series[4]。
- 字体：`Microsoft YaHei`；回退链 `PingFang SC → Noto Sans CJK SC → Arial` 写在主题 JSON 中。OOXML 本身无字体回退列表，pptx 内只写 YaHei，由 PowerPoint/渲染器做替换（见已知问题）。

### 自适应与「零溢出」
每个文本框先在目标字号下测量，放不下依次：缩字（到下限）→ 紧凑行距/段距 → 仍放不下则由引擎拆页。拆分策略：表格按行拆并重复表头；cards/process/timeline/kpi/summary/toc/architecture 按项对半拆；单项过长按句子拆文本；image-text 后半转 summary；matrix 转 cards。标题加「（续）/（续2）」，页码按最终页数重算。表格列宽按内容自动分配（最小 1.3in），行高按折行数计算。

## 3. 主题与 ribbon 对接
`desktop/runtime/ppt-themes.json`（由 `node desktop/scripts/gen-ppt-themes.mjs` 从 `themes.mjs` 导出，单测校验同步）：
- `themes[]`: `business-blue`（商务蓝 #1F4E9E/#2F80ED/浅蓝灰 #EAF1FB）、`tech-dark`、`minimal-gray`、`warm-orange`；每个含 `id/name/dark/preview[4色]/colors{primary,accent,light,bg,coverBg,text,muted,border,onPrimary,onCoverMuted,series[4]}`；顶层 `font`、`slide` 尺寸、`default`。
- ribbon 线用 `preview` 画色块，用 `id` 作为 deck 的 `theme` 值。**换主题的实现建议**：在文档里对已有 pptx 无法反向换色（本线不做）；Ribbon「美化」可走 UNO 改配色，或用 AI 重新以新 theme 生成。

## 4. 提示词
`prompt.mjs` 的 `PPT_DECK_PROMPT`（完整）与 `PPT_DECK_TOOL_NOTE`（已追加进 `document_create` 工具描述）：先大纲→逐页选版式→填槽位；首页 cover、末页 closing；>8 页要 toc+section；标题结论式 ≤24 字；禁止整页要点墙，每页要点 ≤5 条、每条 ≤30 字（超长在 lint 给警告，引擎仍保证不溢出）；不确定事实标「待核验」；不写 Markdown 符号、不控制字号位置颜色。

## 5. 接入点（改动文件）
- 新增：`desktop/runtime/ppt-deck/*`、`desktop/runtime/ppt-themes.json`、`desktop/scripts/gen-ppt-themes.mjs`、`desktop/scripts/make-ppt-review.mjs`、`desktop/tests/ppt-deck.test.mjs`、`desktop/tests/fixtures/ppt-deck-tongwei.json`、`scripts/ppt_check.py`、`scripts/ppt_render.py`、`scripts/ppt_fonts.conf`、`_review/*`
- 修改（均带 `[lane:gen]` 注释，改动很小）：
  - `desktop/runtime/documents.mjs`：pptx 内容只要有一页带 `layout` 即走新引擎（要求全部页带 layout，否则报错）；无 `layout` 的旧格式完全不变。
  - `desktop/runtime/ppt-layers.mjs`：`pptImageIds` 额外收集 deck 的 `imageId` 与 `brand.logoImageId`，保持「只能用本轮附加图片」的授权检查。
  - `desktop/runtime/agent.mjs`：`document_create` 描述追加 `PPT_DECK_TOOL_NOTE`。
  - `lib/slides.ts`：**旧 `buildPptx/exportPptx` 原样保留**（`tests/exports-regression.mjs` 断言旧格式的页数、「•」和「2 / 3」），新增 `buildStructuredPptx/exportStructuredPptx`（Markdown→新引擎）。UI 入口 `app/office-actions.tsx` 不是本线文件，未切换，集成时可把「PowerPoint .pptx」按钮改调 `exportStructuredPptx`，并同步更新该回归测试。
- Word/Excel 路径未触碰。

## 6. 验证
同一份「通威近期并购案分析」内容（14 页，覆盖全部 13 种版式，`tests/fixtures/ppt-deck-tongwei.json`），旧链路为每页「标题+bullet」：
- `_review/old.pptx`（旧链路）、`_review/new.pptx`（新链路）、`_review/compare.png`（14 页逐页左旧右新）。生成命令：`cd desktop && node scripts/make-ppt-review.mjs`；渲染：`python3 scripts/ppt_render.py compare _review/old.pptx _review/new.pptx <outdir> _review/compare.png`（需 PyMuPDF+Pillow；soffice 用 WillBuddy.app 内置的 LibreOffice）。
- 检查脚本 `scripts/ppt_check.py`（python-pptx）：形状越界、文本溢出估算、字号下限（页脚/logo 例外）、字体白名单、表格行撑高、normAutofit 依赖。结果（`_review/check-*.json`）：

| | 幻灯片 | 形状 | 错误 | 警告 |
|---|---|---|---|---|
| old.pptx | 14 | 28 | 14（每页标题字体为 Arial） | 14（正文依赖 normAutofit 自动缩放） |
| new.pptx | 14 | 344 | 0 | 0 |

  脚本自测：对故意构造的越界/小字/Arial 文本框能报出 4 类错误。
- 单测 `desktop/tests/ppt-deck.test.mjs` 14 项全过：schema 校验与拒绝、文本测量/禁则、缩字下限、拆页（表头重复、内容不丢、文字总量守恒）、14 页逐页无越界/无溢出/字号≥11、页码与章节编号、4 主题、主题 JSON 同步、`generateDocument` 集成（python-pptx 反读）、旧格式不变与混用报错、Markdown 兜底。
- 全量 `node --test tests/*.test.mjs`：基线 861 项 705 过 145 败（本机缺原生内核）；改后 875 项 719 过 145 败，**无新增失败**。

## 7. 已知问题 / 提示
1. **渲染字体**：本机 LibreOffice（soffice）不识别微软雅黑，直接渲染为方块。预览脚本用 fontconfig（`ppt_fonts.conf`）并把字体名临时替换为 `Heiti SC`，不改原文件。render 线需在内核字体替换表里加：`Microsoft YaHei → PingFang SC / Noto Sans CJK SC`。
2. 回退字体只在 `ppt-themes.json` 与文档中声明，pptx 内只写 `Microsoft YaHei`。
3. 文本测量是估算（含 3% 余量），未用真实字体度量；在 PowerPoint/WPS 的实机效果未验证，仅用 LibreOffice+PingFang/Heiti 渲染核对过。表格单元格 `margin` 以 pt 数组传入，未在 PowerPoint 中确认内边距。
4. 版式空白：卡片/流程在文字很少时底部会有留白（已做垂直居中偏上）；image-text 无图时显示「在此插入图片 / 图表」占位。matrix 在 schema 上限内不会触发拆页，拆页路径仅由代码保证。
5. 旧的 `bullets/chart/cards/table/layers` 仍可用（保留编辑与图层能力），但提示词已引导模型使用 `layout`。`layers` 自定义图层不能与 layout 混用。
6. KPI 值上限 14 字符，表格最多 40 行（自动续页）、5 列。
7. 未实现图表（chart）版式；需要时可新增 `chart` layout。

## 8. 给集成者
- 合并面很小：只有 `documents.mjs`、`ppt-layers.mjs`、`agent.mjs`、`lib/slides.ts` 四处 `[lane:gen]` 改动，其余均为新增文件。
- ribbon 读取 `desktop/runtime/ppt-themes.json`；`pages` 线若新增空白页，可复用 `layoutSlide` 生成的图元，但注意引擎输出的是新建 pptx，不是对已有文档的修改。
- 依赖：python-pptx（检查）、PyMuPDF+Pillow（渲染对比）仅为开发脚本，不进安装包。