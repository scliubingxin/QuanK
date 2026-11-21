## 0.37.125 SSE 模型主候选选择（内部检查点）

流式SSE响应按候选索引选择index=0，忽略仅含其他索引的数据包；同一包重复主索引时拒绝，不能让未指定索引的备用工具覆盖已指定的主回复。全部省略索引的服务保留原首项兼容行为。修改 desktop/runtime/model-stream.mjs，新增 desktop/tests/model-sse-choice-037125.test.mjs。模型、流式和故障44项通过，工具和模型语义为夹具，不称真实付费模型通过。

Linux真实LibreOfficeKit两进程跨Word、Excel、PPT 1800秒4804轮合成文档预览内容核对未见串用；并行真实Office编辑压力602.9秒17轮0失败。两项限定开发机和合成文档，不代表复杂文件或Mac性能。承接工具审批、PDF页码授权、队列故障和本机嵌入改进；本版完整串行回归823项：787通过、17项因缺jsdom失败、19项因本机ONNX或OCR/PDFium实验资产缺失跳过；完整回归未通过。Python打包50项通过。中文OCR资产、本机模型、对应Apple ARM应用、Mac签名和原生验收仍缺，M4未完成；未覆盖权威。Library空间不足，当前保存的完整0.37.122与增量可还原开发源码；先前GitHub安全审查拒绝未绕过。

## 0.37.124 浏览器和CLI审批取消（内部检查点）

所有工具逐次审批统一使用有界取消等待：原生审批适配器挂起时停止操作不再无限等待，迟到允许不会启动浏览器、CLI或其他工具；已经弹出的原生窗口能否立即关闭仍由适配器决定。使用已有取消助手和同一审批/授权/审计路径，未扩大自动授权。修改 desktop/runtime/tools.mjs，新增 desktop/tests/tool-approval-abort-037124.test.mjs。

工具审批、浏览器、CLI和文档相关50项通过；有真实Node命令进程，原生审批/浏览器适配器为夹具。实际停止挂起CLI审批后以哨兵文件验证子进程未启动。继承模型JSON主候选、OCR范围和队列故障修复；真实Linux Office跨格式预览30分钟长测及编辑压力测试仍在运行，尚不能称通过。本版完整回归未完成，中文OCR、本机模型、Apple ARM构建与Mac原生验收仍缺，M4未完成。权威未覆盖，先前GitHub安全审查拒绝未绕过。

## 0.37.123 PDF附件识别范围校验（内部检查点）

聊天PDF附件完成OCR后，核对识别页与用户已确认的连续页范围逐一一致；默认前五页按识别出的实际总页数限制。若识别结果多页、漏页、乱序、页码越界或总页数无效，拒绝保存并阻止发送模型，不从模型文本猜来源。来源名称/SHA、逐次确认和文件变化守卫保留；实际页数来自已选本机PDF解析器，并非对恶意识别器的独立证明。修改 desktop/services/pdf-chat-import.mjs 和 desktop/tests/ocr-provenance-validation-037120.test.mjs。

附件、来源和范围相关24项通过，包含实际Linux Poppler/Tesseract双页、六页和指定页OCR，以及伪造范围/漏页负例；原生确认/故障识别器为夹具，中文离线资产与Mac未验。继承JSON模型相关41、任务队列28、OCR相关70通过2跳过及知识相关60通过2跳过、打包50通过；各组有重叠，不相加。真实LibreOfficeKit跨Word/Excel/PPT 30分钟长测与独立编辑压力测试正在运行，不能提前算通过；本版完整回归待运行。无匹配Apple ARM安装包，未Mac/真实模型/公证验收；M4未完成，权威未覆盖，先前GitHub安全审查拒绝未绕过。下一轮重新核验并发，完成长测、完整回归与离线依赖。

## 0.37.122 JSON 模型主候选选择（内部检查点）

标准模型JSON响应有多个 choices 且索引顺序与数组顺序不同时，选择 index=0 主候选并使用其结束状态；存在索引而缺少或重复主候选时明确拒绝，不执行备用候选工具。所有候选均省略索引或为null时保持原首项兼容行为。真实HTTP模型夹具确认备用候选的工具调用不会执行；不是对真实付费模型的验收。修改 desktop/runtime/model-stream.mjs，新增 desktop/tests/model-json-choice-037122.test.mjs。

流式/JSON/模型故障相关41项通过，含HTTP夹具；新增重复主索引拒绝单测通过。继承队列28项、OCR 70项通过2项缺中文资源跳过、知识索引60项通过2项缺模型跳过、打包50项通过。真实Linux LibreOfficeKit跨Word/Excel/PPT 30分钟复用长测仍在运行，尚不能算通过；本版完整回归待运行。无匹配Apple ARM安装包，Mac原生/公证、真实模型和离线OCR依赖尚未验收，M4未完成；权威未覆盖，先前GitHub安全审查拒绝未绕过。下轮核对并发并继续长测和离线组件。

## 0.37.121 排队取消的持久化失败（内部检查点）

任务尚在排队时取消，如果取消终态写盘或发布状态失败，原逻辑可能让任务完成承诺返回“已取消”，而磁盘中仍是排队状态。现改为明确标记 interrupted、记录持久化错误并尝试持久化该状态，同时向取消请求返回原错误；即使磁盘持续失败，也释放队列持有的所有者且不启动工作进程。持久失败时磁盘可能仍保留旧快照，重启沿现有中断恢复规则，不声称写盘成功。修改 desktop/runtime/run-queue.mjs，新增 desktop/tests/run-queue-cancel-persistence-037121.test.mjs。

队列/状态机相关28项通过，含持续磁盘失败及一次失败后成功持久化interrupted；浏览器/CLI相关41项、OCR相关70通过2跳过、本机模型/知识相关60通过2跳过、Python打包50项。Office双worker跨Word/Excel/PPT 30分钟真实长测仍在运行，尚不能算通过；本版完整回归尚未重跑。前述浏览器使用适配器夹具、OCR为Linux Poppler/Tesseract，模型向量为夹具。M4未完成，无匹配Apple ARM应用、Mac原生/公证或真实模型验收；权威未覆盖，先前GitHub安全审查拒绝未绕过。下一轮先核验并发，继续长测、全量回归和离线依赖。

## 0.37.120 PDF OCR 来源校验（内部检查点）

聊天附件识别完成后，将结果中的源文件名和SHA与实际选择的PDF对照；不匹配时不保存。OCR成果生成前校验有效摘要、1–5个递增页码及总页数、文字预算、成对坐标与词框，以及词框的顺序与非重叠，避免保存来源信息无法核对的知识文档。原PDF和逐次授权流程保留。修改 desktop/services/pdf-chat-import.mjs、desktop/runtime/ocr-provenance.mjs，新增 desktop/tests/ocr-provenance-validation-037120.test.mjs。

PDF来源、取消、页面预览和故障相关72项：70通过、2项缺中文OCR构建资源跳过；包含真实Linux Poppler/Tesseract PDF和预览，审批/部分后端为夹具。知识索引与嵌入相关62项60通过2跳过；浏览器与CLI相关41项、Office池相关36项、打包50项通过。Office跨格式30分钟真实长测仍在运行，不能提前称通过；本版完整回归尚未运行。没有匹配的Apple ARM安装包，Mac真实系统、中文OCR、离线模型和公证仍未验收；M4未完成，权威未覆盖，先前GitHub安全审查拒绝未绕过。下一轮重查并发并继续长测和离线组件。

## 0.37.119 本机长文本 Unicode 分段（内部检查点）

本机 ONNX 嵌入遇到模型长度上限时，改为沿 Unicode 字符簇边界切分并保留组合重音和 ZWJ 表情，再按原代码点数加权；单个字符簇过长不能安全切分时明确失败，不丢弃文字。普通短批次不变；模型缓存身份从v3更新为v4，旧向量不再混用。真实模型语义、各语言分词和Apple芯片性能尚未验收。修改 desktop/runtime/long-embedding.mjs、desktop/runtime/local-onnx-embedding.mjs、desktop/tests/long-embedding-037114.test.mjs。

知识索引、模型夹具、取消等相关62项：60通过、2项缺本机模型跳过；补充多语言字符簇与令牌超限同时取消测试。0.37.118进程池、浏览器改动保留；新增真实Linux LibreOfficeKit双预览取消隔离测试通过。跨Word/Excel/PPT 30分钟真实进程池长测正在运行，不能提前称通过。本轮完整回归尚未针对最终源码重跑。无匹配Apple ARM安装包，M4、离线模型和OCR/PDFium许可、Mac签名及原生验收未完成。权威未覆盖，先前GitHub安全审查拒绝未绕过。

## 0.37.118 Office 进程派发与浏览器取消（内部检查点）

真实复现并修复进程池两个取消竞态：任务获得空闲进程后、回调实际派发前取消不再执行回调；唯一等待任务在创建前取消不再启动工作进程。进程销毁完成前不重用；已运行的底层操作仍需适配器终止。单个等待任务在容量为2时不再无故创建两个进程；双任务并行能力保留。另对系统浏览器启动加入取消和超时边界，启动已交给系统时无法保证撤回；修复适配器同步取消并返回拒绝Promise时的未处理拒绝。

修改 desktop/runtime/isolated-worker-pool.mjs、desktop/runtime/browser.mjs，新增 desktop/tests/isolated-pool-cancel-dispatch-037118.test.mjs、browser-external-cancel-037118.test.mjs。浏览器与CLI相关41项、进程池相关36项、50项Python打包测试通过；含真实Linux LibreOfficeKit的Word/Excel/PPT预览、故障与隔离，浏览器及系统启动使用适配器夹具。完整回归正在运行，尚无结果；没有Mac原生或真实付费模型验收，无匹配Apple ARM安装包。

M4未完成，权威基线未覆盖；离线OCR/PDFium依赖许可、本地模型与Mac原生验证仍缺，先前GitHub安全审查拒绝未绕过。下一轮先重查并发，继续跨格式长测、离线资源与完整回归。

## 0.37.117 浏览器已取消请求的前置守卫（内部检查点）

浏览器读取、隔离 DOM、快照和动作准备在调用页面前检查取消；URL 检查期间收到取消时也阻止启动读取或隔离世界脚本。已取消的动作不会创建新审批凭证。正在执行的原生操作不保证可被终止，不能撤回已发操作。修改 desktop/runtime/browser.mjs，新增 desktop/tests/browser-preaborted-037117.test.mjs。

浏览器适配器夹具与真实 Node 子进程/队列相关 37 项通过；50 项 Python 打包测试通过。完整串行 786 项：750 通过、17 因缺 jsdom 失败、19 跳过。无真实 Electron/Mac 浏览器验收。本轮无匹配 Apple ARM 包。OCR/PDFium 依赖许可、本机模型、Mac 原生签名和 M4 综合验收尚未完成；正式基线未覆盖，先前 GitHub 安全审查拒绝未绕过。下一轮检查并发并继续补齐离线组件和全量验证。

## 0.37.116 浏览器读取取消（内部检查点）

BrowserService 在网页读取和快照异步返回后、发布正文或可操作元素引用之前重新检查取消；在读取/快照的URL及导航状态复核后也检查取消。打开网页时加载完成后重新检查取消，失败关闭窗口。正在进行的底层原生操作未必真正停止，已打开外部页面或发送的输入无法撤回；不能排除检查与实际导航的最后竞态。现有逐站点任务授权、快照失效、审计与CLI功能保持。

修改 desktop/runtime/browser.mjs，新增 desktop/tests/browser-read-cancel-037116.test.mjs。浏览器适配器夹具覆盖读取迟到、快照迟到、导航状态检查时取消和正常读取；浏览器与真实 Node CLI 及队列相关 35 项通过，50 项打包测试通过。真实 Chromium 启动尝试因 socket() Operation not permitted 失败；没有真实 Electron/Mac/付费模型验收。本轮完整串行回归 783 项：747 通过、17 因缺 jsdom 失败、19 跳过。与当前权威相比 122 个 Web/Python 保护文件未变。

无匹配 Apple arm64 包：当前 Linux x86_64 缺 asar 和 rcodesign，且没有 Mac 真机。OCR/PDFium 依赖许可、本机语义模型与 Mac 办公验收未完成；M4 未完成，权威未覆盖。此前 GitHub 安全审查拒绝未绕过；下一轮重查并发后继续模型、Office 和原生验收。

## 0.37.115 本机长文本嵌入批处理（内部检查点）

承接 0.37.114：本机 ONNX 模型明确报告分词超限后，以最多 256 个 Unicode 码点为初始片段，最多 8 片并批处理；仍超限则拆分批次和单片，不丢失字符，并按原字符数合并向量。单次请求最多 128 次调用，沿用总超时/取消，模型错误或任一分段失败不返回部分结果；普通短文本仍走一次调用。算法身份更新为 v3，避免复用旧算法向量。测试夹具中 8 份各 1000 字合成文本由一次超限和 4 批完成，调用次数不代表真实模型性能；中日韩、emoji 边界与组合字符之间的语义保真仍需真实模型验收。Ollama 路由和授权未变。

修改 desktop/runtime/long-embedding.mjs、desktop/runtime/local-onnx-embedding.mjs、desktop/tests/long-embedding-037114.test.mjs。相关 39 项测试：37 通过、2 因真实模型及依赖缺失跳过；含批次/分段/次数上限/失败与取消测试，向量模型为夹具。50 项打包测试通过。本轮完整串行回归 778 项：742 通过、17 因缺 jsdom 失败、19 跳过，不能声称全量通过。本机模型、OCR/PDFium 的 ARM 依赖与许可及 Mac 安装/签名/实际运行未完成，尚无匹配 Apple 安装包，M4 未完成；权威未覆盖。此前 GitHub 安全审查拒绝未绕过。下轮重查最新并发检查点，补真实模型、完整回归、Apple 打包和原生验证。

## 0.37.114 本机语义长文本（内部检查点）

本机 ONNX 嵌入在明确收到模型分词超过 512 的错误时，对原始文本按 Unicode 字符递归分段，保留全部文字；各段向量按原始字符数加权并归一化。普通输入仍走原有批处理。每次最多 128 次子请求、整次受既有超时和取消限制，非分词错误不重试；任一分段失败不返回部分向量。模型身份加入新算法版本，使旧向量缓存不被误用。仅本机固定 ONNX 路由受影响，Ollama 及权限审批不变。中文、emoji 边界、取消、失败、次数上限及加权计算使用夹具验证；模型及其 Mac ARM 依赖仍未随本包提供，真实模型的长文语义效果与性能未验收，不声称可离线安装使用。

实际修改 desktop/runtime/local-onnx-embedding.mjs、新增 long-embedding.mjs、desktop/tests/long-embedding-037114.test.mjs，更新真实模型可选测试。相关 37 项测试 35 通过、2 项缺真实模型及 Python 依赖跳过；先前并行运行时两个本机 HTTP 夹具争用 11434 端口导致失败，最终串行重跑通过。50 项打包测试通过。完整串行回归 776 项：740 通过、17 项因缺 jsdom 失败、19 跳过，完整回归未通过。Office 长测仍在运行，尚无完成结果。Apple 芯片匹配包未构建，Mac、付费模型和公证未验收；M4 未完成，权威未覆盖。此前 GitHub 安全审查拒绝未绕过。下一轮先核验并发检查点，再继续本机模型依赖、中文 OCR/PDFium 许可及 Mac 原生验证。

## 0.37.113 知识审批漂移与真实 HTTP 闭环（内部检查点）

承接 0.37.112 的可取消知识查询队列；本轮在向量审批返回允许或拒绝后均复核来源和取消状态，拒绝期间来源变化不再返回基于过期快照的结果。新增真实本机 HTTP 模型夹具通过标准工具调用发起两个独立 Agent 会话，第二次在向量队列等待中取消，验证不会启动第二次嵌入请求或继续模型调用，首个会话正常完成。另验证审批拒绝时修订变化拒绝继续。相关 33 项测试通过；模型语义和审批均为夹具。实际修改 desktop/services/agent-session.mjs、desktop/tests/knowledge-agent-cancel-037112.test.mjs 和新增 knowledge-agent-loop-cancel-037113.test.mjs。

Office 混合格式长测正在独立进行，不在此声称已完成。完整回归仍受缺失 jsdom 阻塞；本版无匹配 Apple 芯片安装包，未进行 Mac 签名、公证和运行验收。实验 OCR/PDFium 的传递许可证及模型离线依赖尚未完成，M4 未完成。权威未覆盖，先前 GitHub 安全审查拒绝未绕过。下一轮重新核验并发检查点，继续离线资产和本机模型、Mac 原生验收及完整回归。

## 0.37.112 知识检索取消与办公进程池（内部检查点）

新增无Electron共享串行执行核心，词法索引和向量索引分别使用独立队列。等待的查询取消后立即退出、从队列移除且不开始检索，等待最多20个；清理与查询按各自队列顺序执行，保存/回滚和来源授权检查保留。Agent知识文档读取和本机向量审批等待忽略取消信号时，取消不再等待迟到结果，迟到结果不启动后续来源读取或模型调用。底层读取/原生弹窗可能继续；已启动任务不因取消而提前释放队列，无法保证外部副作用撤销。新增通用abortable-work，PDF旧名称兼容导出。

实际修改 desktop/runtime/serial-jobs.mjs、abortable-work.mjs、pdf-ocr.mjs，desktop/services/knowledge-index.mjs、knowledge-vector.mjs、agent-session.mjs；新增 knowledge-index-queue、knowledge-vector-queue、knowledge-agent-cancel、abortable-work、office-pool-cross-format 测试和 office-pool-mixed-endurance 验收脚本。73项知识相关测试通过、4项缺真实模型依赖跳过，新增12项取消/队列测试全部通过，包含两个真实Agent会话与本机HTTP模型夹具；60项PDF相关通过、2项缺实验OCR资源跳过；50项打包测试通过。真实Linux LibreOfficeKit双worker混合Word表格、Excel和PPT预览9次无文字串入；混合格式耐久试验5秒31轮通过，非30分钟和Mac验收。

探索性完整串行763项727通过、17失败、19跳过；17项缺jsdom，后续添加独立测试文件，因此不是完整最终回归通过。权威0.37.22/v60的122个原Web/Python保护文件哈希不变。没有与本检查点匹配的Apple应用；当前Linux环境缺asar和rcodesign，离线中文OCR/PDFium传递许可和本机模型依赖未完成，Mac、真实模型与公证未验收。M4未完成；权威未覆盖，GitHub此前安全审查拒绝提交，未绕过。下一轮重查并发，优先完整依赖、真实Mac和办公验收。

## 0.37.111 浏览器目标复核与CLI中文输出（内部检查点）

浏览器准备目标和获取点击位置后的异步边界复核取消、快照与当前URL，即使导航事件尚未送达，也不会对已观察到的不同URL发送点击；点击命中测试使用与主机发送相同的整数坐标，无效坐标拒绝。仍无法排除最后检查与实际输入间的竞态，也不能撤回已发输入或保证网站业务成功。对话及服务CLI的UTF-8字节预算不再截断中文或表情，实时50000 UTF-16字符检查点也避免拆分代理对，截断后不跳过字符拼接后续输出；仍保留原审批、审计和输出限制。

改动：desktop/runtime/browser.mjs、browser-dom.mjs、command.mjs、tools.mjs；desktop/tests/browser-click-pixels-037111.test.mjs、browser-click-stale-037111.test.mjs、command-unicode-output-037111.test.mjs、commands.test.mjs。相关47项Node测试和50项Python打包测试通过，包含真实Node/npm子进程、项目服务、输出和停止，浏览器事件及页面对象为夹具。Chromium尝试启动失败，报socket() Operation not permitted；不称真实浏览器或Mac验收。探索性全量串行750项714通过17失败19跳过，17项缺jsdom；运行期间源码继续修改，不作为最终回归结论。原Web/Python 122文件与权威0.37.22/v60一致。

没有匹配Apple安装包：当前Linux x86_64环境缺asar与rcodesign，不能验收Mac codesign、公证或实际运行。离线中文OCR/PDFium资产及传递许可、本地语义模型、复杂Office和Mac验收未完成；M4未完成。权威文件未覆盖。GitHub此前安全审查拒绝仓库提交，本轮未绕过、未PR/合并/发布。下一轮重查并发后优先恢复依赖、完成离线组件和Apple构建、Mac验证与办公主线。

## 0.37.110 OCR来源打开取消（内部检查点）

原PDF来源打开在等待系统选择器、首次和再次读取时响应应用退出取消，拒绝迟到结果；打开前继续核对证据和文件SHA。已交给系统的打开操作不可撤回，不能宣称底层文件读取或原生窗口一定停止；文件在最后检查后仍可能被其他进程替换。本轮变更 desktop/main.mjs、desktop/services/ocr-source-open.mjs、desktop/tests/ocr-source-open-03757.test.mjs。

相关53项Node测试51通过、2因缺构建资产跳过，包含真实Linux Poppler/Tesseract PDF、真实文件和链接拒绝，系统选择器和打开适配器为夹具；50项打包测试通过。完整回归未重跑；无对应Apple应用，Mac、真实用户文档、签名公证和真实模型未验收。原Web/Python 122文件同0.37.22权威；权威未覆盖。M4仍未完成，离线中文OCR/PDFium资产及传递许可证、本地语义模型、复杂Office与Mac验收仍需完成。GitHub此前安全审查拒绝，未绕过。

下一轮核对并发后继续固定资源许可、Apple构建和Mac验收；保留Office、浏览器、CLI已有能力。

## 0.37.109 Office工作进程协议故障隔离（内部检查点）

修复LibreOfficeKit工作进程返回合法JSON但不是协议对象（例如null、数组、错误ID、缺失结果、无效错误字段）时，主进程回调可能抛异常或把缺失结果当成功的问题。现校验启动、结果和错误结构；无效响应立即终止本次工作进程，拒绝待处理和排队请求，不自动重放。对真实的已执行副作用不作回滚承诺；调用方仍须检查草稿和持久版本。修改 desktop/runtime/office-kit.mjs 与 desktop/tests/office-pipe-failure.test.mjs。

19项工作进程/进程池测试和71项Office编辑/模型工具测试通过（两组有重叠），其中使用真实Linux LibreOfficeKit、真实Node/Python子进程和HTTP模型夹具；畸形协议由真实子进程夹具模拟。50项打包Python测试通过；完整回归本轮未重跑。原生IPC/审批和模型语义仍为夹具，Mac运行/签名/公证未验收，当前没有匹配的Apple应用。原Web/Python 122保护文件与0.37.22权威一致；权威未覆盖。M4未完成：离线中文OCR/PDFium依赖和许可证、本地语义模型、复杂Office及Mac验收仍待完成。GitHub此前安全审查拒绝提交，不绕过；下一轮重新核对并发，继续完成离线组件和办公原生验证。

## 0.37.108 PDF OCR 证据定位（内部检查点）

新PDF OCR结果记录实际使用的渲染器（固定PDFium WASM或Poppler）和每页识别输入PNG的SHA-256，并把两者绑定到来源坐标；来源预览重新渲染时须与来源身份、原PDF SHA、坐标、尺寸和页面图片SHA一致，不一致拒绝显示定位，不自动换渲染器。历史证据缺少渲染器标记时保留文字与原PDF打开功能，但不能显示未经验证的定位，需重新识别。哈希用于检查意外变化，不是防本机攻击者修改并重算摘要的签名；同一内容经不同PNG编码也会保守拒绝。预览选择/读取/依赖发现和页面读取挂起时可取消并丢弃迟到结果，不能保证底层操作或原生对话框实际停止。PDF来源文件名写入Markdown时转义，来源身份保留原名。

实际修改 desktop/runtime/pdf-ocr.mjs、desktop/runtime/ocr-provenance.mjs、desktop/services/ocr-source-open.mjs、desktop/services/ocr-source-preview.mjs、desktop/tests/ocr-provenance-03746.test.mjs、desktop/tests/ocr-source-preview-03758.test.mjs。86项定向测试：78通过、8因实验OCR/PDFium资产缺失跳过；真实Linux Poppler/Tesseract识别→来源记录→知识检索→预览通过，PDFium预览路由是注入适配器，未在本轮运行真实PDFium。50项打包测试通过。探索性完整回归734项：698通过、17失败、19跳过；17项因缺jsdom，执行期间源码继续变化，不视为最终全回归。原Web/Python 122保护文件与权威0.37.22一致。当前无匹配Apple安装包；Mac、原生审批、真实模型、公证未验收。M4未完成；权威保持0.37.22，先前GitHub安全审查拒绝提交不可绕过。

下一步：获取并核对固定版本离线PDFium和Tesseract及传递依赖许可，完成实际PDFium来源高亮链路和Apple离线模型/组件集成；补齐jsdom完整回归与真实Mac安装、签名、中文OCR和复杂办公材料验收。参考docs/PDF_EVIDENCE_RENDERER_037108.md。

## 0.37.107 工具完成记录后的取消边界（内部检查点）

Agent 在工具返回并完成事件持久化后重新检查取消，避免最终模型轮将已取消任务误报为达到轮数上限，也不继续批次中的后续工具或模型请求。真实完成事件仍记录，不能假设已发生的外部副作用被撤销；记录失败仍明确提示检查实际操作。等待不响应取消的工具或事件记录本身仍可能阻塞，这次没有承诺强制中断。修改 desktop/runtime/agent.mjs 和 desktop/tests/agent-cancel-observation-037107.test.mjs。40项相关Node测试通过（含真实Node子进程及本机HTTP模型夹具），50项打包测试通过。完整回归未重跑；Mac、真实模型和原生审批未验收。本版没有匹配Apple应用，离线中文OCR/PDFium许可证与本机嵌入模型尚未完成，M4未完成。原Web/Python 122保护文件与0.37.22权威一致。权威不被本检查点覆盖；GitHub此前安全审查阻止提交，不变更路线绕过。下一步完成离线依赖许可、Apple应用持久交付和Mac原生验收，继续办公功能。

## 0.37.106 PDF授权与CLI启动取消（内部检查点）

探索性完整回归722项：686通过、17失败、19跳过，17项均报告缺jsdom；运行期间追加修改和测试，不能作为最终源码完整回归结论。

PDF识别及OCR成果保存的确认等待可取消；迟到的批准不启动识别、不创建文档。CLI执行前的授权目录/程序路径解析、只读find判定和项目启动校验也可取消，迟到校验结果不启动命令。底层文件检查或原生确认窗口可能继续，不能声称系统弹窗已关闭；已启动的进程沿用现有终止机制。修改 desktop/runtime/tools.mjs、desktop/tests/pdf-ocr-03740.test.mjs、desktop/tests/commands.test.mjs。针对相关PDF、图片OCR、队列、CLI和项目服务111项测试：109通过、2项因OCR离线构建资产缺失跳过；包含真实Linux英文PDF识别、真实Node/npm/Python项目及夹具确认/挂起/并发取消。50项打包测试通过。Mac签名、真实付费模型、中文OCR离线资源未验收，无匹配Apple安装包；当前环境缺jsdom、asar、rcodesign，离线安装依赖缺zrender。原Web/Python 122受保护文件与0.37.22权威一致。M4未完成，下一步补全合法离线模型/OCR/PDFium及依赖，执行Mac安装、原生审批和实际文档验收；遵守此前GitHub安全审查拒绝，不更换通道绕过。

## 0.37.105 PDF附件识别取消（内部检查点）

当PDF附件识别器或适配器不响应停止时，对话附件导入不再无限等待；取消后迟到的进度或识别结果被丢弃，不创建成果。识别结束后也不再接受迟到进度。底层识别器可能仍运行，不能声称停止子进程；既有逐次批准、来源复核与保存回滚保持。修改 desktop/services/pdf-chat-import.mjs 和 desktop/tests/pdf-chat-import-03747.test.mjs。目标回归70项：68通过、2项因离线OCR构建资产缺失跳过，包含真实Linux Poppler/Tesseract英文PDF、模型HTTP夹具、故障取消与授权；50项打包测试通过。真实Mac/中文OCR资产/付费模型未验收，完整Apple安装包未构建。探索性完整串行回归719项：683通过、17失败、19跳过；17项失败均报告缺jsdom。运行期间追加了一个测试并更新版本记录，因此该数字不是最终源码的完整回归通过证据。原Web/Python 122保护文件与权威0.37.22一致。M4未完成，下一轮继续离线OCR/PDFium和语义模型资源许可、Apple构建和真实Mac验收；先前GitHub安全审查拒绝不绕过。

## 0.37.104 对话附件读取取消（内部检查点）

对话发送前检查和排队后实际读取授权附件时，即使底层读取挂起，停止也能结束等待。迟到结果不进入模型请求；底层文件读取可能继续，已发生的读取不能撤销。实际修改 desktop/services/conversation.mjs、desktop/tests/run-queue.test.mjs，并更新版本和接续记录。36项队列与流式回归（含两个挂起及迟到结果负例）及50项打包测试通过；注入的挂起读取是测试夹具，未作Mac原生或真实模型验收。本轮未运行完整回归，无匹配Apple安装包，M4未完成；权威0.37.22保留，GitHub此前安全审查阻塞不绕过。下一步继续Apple离线OCR/PDFium许可、本机语义模型及Mac验收。

## 0.37.97 PDF 工具发现和来源复查取消（内部检查点）

PDF工具在初次读取、来源重新校验、OCR渲染依赖发现以及图片OCR依赖发现期间均响应取消，丢弃迟到异步结果；不会继续启动渲染或生成OCR凭证和成果，底层读取本身可能仍运行。49项PDF/OCR/权限/取消回归、50打包测试通过；含真实Linux PDFium及中英Tesseract WASM与真实子进程取消，原生审批夹具。继承0.37.96的实验性离线PDFium页渲染：0.37.96 Apple包仅本地构建，Linux Electron42直接读取其ASAR并完成中文PDF识别；278 Mach-O/93545代码页、归档门禁通过，但第三方许可证尚未全部审完，不能公开分发，未Mac原生验证/公证。源码归档不包含实验二进制；本版完整串行回归778项：774通过、4项本地ONNX开发模型/依赖缺失跳过；默认Apple ARM64候选本地完成，483368413字节SHA256 f5ddeb229a3a796cf92b78e598ccb725c4b62e9fea3b3ac93e1c31117fb8d213，266文件与ASAR一致、278 Mach-O/93545代码页及ZIP门禁通过，但持久上传准备失败，未保存应用。默认候选不包含OCR/PDFium二进制，无Mac验收/公证。M4未完成。下一步完成依赖许可及Mac真实安装和离线PDF、中文识别验收。

## 0.37.96 PDF OCR 授权复查取消（内部检查点）

在受限PDF渲染管道中，目录授权/来源复查即使异步操作不响应，取消也能结束等待并丢弃迟到结果，阻止后续渲染和OCR，私有临时目录回收；不能保证底层文件系统读取实际中断。47项PDF/OCR/附件测试与50项打包测试通过。沿用0.37.95的PDFium+Tesseract WASM实验：真实Linux两页中文PDF识别、加密/损坏/越界/撤权/取消；生产工具逐次批准且审计隐藏正文。0.37.95实验Apple离线包本地已构建（含OCR及PDFium资产，未持久交付），Linux官方Electron42以Node模式直接从包内ASAR识别合成中文PDF，非Mac GUI；278个Mach-O/93545页及闭合ZIP门禁通过。PDFium和Tesseract本体/所有传递依赖的许可审核未完成，Mac签名公证、原生运行与真实材料未验，M4未完成。源码ZIP不含二进制资产；完整回归和本版匹配Apple包尚在构建中。

## 0.37.95 PDF 离线渲染与中文 OCR（内部检查点）

新增受限 PDFium WASM 单次子进程和纯Node PNG编码，将已有PDF OCR在Poppler缺失但固定PDFium资产存在时接到离线渲染；输入16MiB、100页、每次连续最多5页、最长边1600像素、页面PNG4MiB，私有临时文件、SHA校验、超时/取消、授权复查、无部分结果；不执行PDF脚本或访问网络，子进程仍是当前操作系统账户权限而非OS沙箱。新增独立构建资源准备脚本和显式 --experimental-pdf-raster-assets，默认不分发PDFium；来源 @hyzyla/pdfium 3.0.0 固定文件SHA，源标签c60c75d及其PDFium构建8046，PDFium及依赖许可尚未完整核查。Linux实际PDFium WASM渲染两页中文图片型PDF，再经Tesseract WASM识别中文/英文；45项PDF/OCR权限故障测试和50项打包测试通过，原生审批为夹具。源码包不含PDFium、OCR训练数据或WASM；无本版本匹配Mac安装包，Mac运行、签名、公证和真实用户材料未验，M4未完成。下一步隔离ASAR真实运行、补齐许可证、构建Apple候选并完成Mac验收。

## 0.37.94 OCR 离线构建接线（内部检查点）

重构 scripts/prepare-ocr-wasm.py：固定清单、8份资源SHA/大小、源与目标符号链接和并发目标变化检查，允许安全地装入私有构建目录。scripts/repackage-native-mac.py 新增显式 --experimental-ocr-assets，仅指定时向应用ASAR注入资源并在离线清单标注；默认仍不内置。实际将固定资源装入隔离源码树，生成ASAR、解包并用真实Linux WASM识别中文图片，识别为“采购 预算 12345 / 合同 金额 TEST”；不是Electron直接ASAR运行或Mac验收。tesseract.js-core v7.0.0固定源码标签的6个二进制与候选资产逐SHA相同；发现上游构建包含9个第三方子模块，许可证及发布义务尚未全部审完，不作公开正式发布。源ZIP不包含大模型、训练数据或WASM；Mac安装包构建与验证进行中。M4未完成。

## 0.37.93 PDF 附件取消保护（内部检查点）

PDF 附件导入在等待识别语言授权期间响应取消，即使确认适配器不响应或迟到同意，也不再继续复读、启动 OCR 或保存文档；底层对话是否实际关闭仍取决于原生适配器。desktop/services/pdf-chat-import.mjs 使用现有 abortable 守卫，desktop/tests/pdf-chat-import-03747.test.mjs 新增挂起/取消/迟到同意的故障回归。53项 OCR/图片/PDF/附件测试通过，包含Linux真实离线中文图片和PDF（本机临时准备固定资源）及原生审批夹具；41项打包测试通过。训练数据与WASM不包含在源码包，尚无匹配本版Apple芯片安装包；未Mac运行、公证或真实用户文档验收，完整串行回归768项：764通过、4项因缺ONNX开发模型/依赖跳过；M4未完成。未覆盖正式权威或GitHub发布。下一步继续Apple离线OCR资源/许可与真实本机语义模型集成及Mac验收。

## 0.37.92 简体中文离线 OCR（内部检查点）

在实验性 Tesseract.js WASM 路径增加 chi_sim 和 chi_sim+eng；固定 tessdata_fast 版本和 SHA，准备脚本及运行前校验清单，中文训练数据缺失或篡改时拒绝。Linux 本机以实际离线引擎识别合成中文/中英图片，以及 Poppler 渲染的图片型 PDF；中文词之间可能出现空格，识别质量不等于真实用户文档验收。33项 OCR/附件测试及41项打包测试通过，其中原生审批为夹具；没有本轮完整回归。训练数据及 WASM 只在开发环境暂存，不包含在本源码包或旧 Mac 安装包中；Apple ARM64 依赖集成、中文 OCR 和 PDF 渲染的 Mac 运行、签名公证均未验收。未生成匹配 0.37.92 的安装包；不覆盖权威、不发布 GitHub，M4 未完成。下一步完善 ARM64 离线资产集成和许可、用户文档 OCR、真实模型及 Mac 原生验收。详见 docs/archive/dev-notes/OCR_CHINESE_WASM_03792.md。

## 0.37.77 差距

2026-11-14 0.37.77 M4 内部检查点：每个等待的进程池请求最多遇到两个不可用空闲worker，随后明确失败，避免持续创建/销毁；工作任务未开始时才替换，不重放运行中失败动作。33项进程池/真实LinuxKit相关测试通过，含重复坏worker有界、取消、真实崩溃和跨文档隔离。最终实现长测重新启动，尚未完成；Mac/真实模型及匹配安装包未验，M4未完成、未GitHub发布。修改 desktop/runtime/isolated-worker-pool.mjs、desktop/tests/isolated-worker-pool-03738.test.mjs。

## 0.37.76 差距

2026-11-14 0.37.76 M4 内部检查点：进程池在分配前检查空闲Office worker是否已退出，已知死亡则先清理再为等待的预览创建新进程；不重放执行中失败的请求，死亡发生在检查与执行之间仍可能失败。32项相关回归通过，包括强杀真实Linux LibreOfficeKit空闲进程后下一次显式预览使用新PID且不串读；清理期间取消不创建替代。新实现30分钟长测已重启未完成，旧实现长测不可代替；Mac与实际用户文档未验。无匹配Mac包，M4未完成、未GitHub发布。修改 desktop/runtime/isolated-worker-pool.mjs、office-preview-pool.mjs及对应测试。

## 0.37.75 差距

2026-11-14 0.37.75 M4 内部检查点：增加真实Linux LibreOfficeKit子进程崩溃验收：预热后强杀进程，下一次预览明确失败不自动重放，再次显式请求创建新进程并验证第二文档无第一文档内容。Office池9项、Word/PPT/字体/关闭47项通过；非Mac/真实用户文档验收，当前长测未完成。无匹配Mac安装包，M4未完成、未GitHub发布。修改 desktop/tests/office-preview-pool-03739.test.mjs。

## 0.37.74 差距

2026-11-14 0.37.74 M4 内部检查点：模型流出现相互冲突的结束状态时拒绝整批工具调用，不允许后续结束状态覆盖之前的状态。23项流式/模型故障测试通过；新增CLI实际ToolRuntime与真实Node进程的输出回调故障集成回归，CLI相关18项通过。模型为HTTP夹具，Office双worker长测进行中；Mac/真实模型及匹配安装包未验，M4未完成、未GitHub发布。修改 desktop/runtime/model-stream.mjs、desktop/tests/mock-llm-faults-03740.test.mjs、desktop/tests/command-output-fault-03773.test.mjs。

## 0.37.73 差距

2026-11-14 0.37.73 M4 内部检查点：CLI进程输出回调同步抛错时请求终止子进程，并在进程关闭后返回错误提示核对实际副作用；不让异常从事件回调逸出，不宣称可撤销先前动作。17项CLI队列/权限/真实Node子进程测试通过，新增检查确认出错后真实子进程退出。Mac原生与真实第三方CLI未验；Office真实双worker长测进行中。无匹配Mac应用，M4未完成、未GitHub发布。修改 desktop/runtime/command.mjs 与 desktop/tests/command-output-fault-03773.test.mjs。

## 0.37.72 差距

2026-11-14 0.37.72 M4 内部检查点：模型SSE结束或错误后发起流取消，最多等待1秒，避免底层取消Promise挂起阻塞已完成任务；超时仅表示不再等待，不声称底层连接已关闭。22项流式和mock模型故障测试通过，包括挂起取消的成功与无效JSON路径、真实本机HTTP和Node CLI；模型语义为夹具。旧长测在环境重置后最后可见1560秒/22865轮，未计完成；新长测运行中。无对应Mac安装包、Mac及真实模型未验，M4未完成、未GitHub发布。修改 desktop/runtime/model-stream.mjs、desktop/tests/streaming.test.mjs。

## 0.37.71 差距

2026-11-14 0.37.71 M4 内部检查点：从已保存0.37.70重新取回接续；处理工具抛出null、字符串或异常message访问器时模型循环不崩溃，错误信息限制4000字符，记录失败且不自动重放。模型/状态机17项、模型/队列31项通过，模型为本机HTTP夹具。环境重置后此前长测最后可见1560秒、22865轮，完整结果丢失，不记为30分钟通过；当前环境真实LibreOfficeKit短回归通过，需重新进行并持久记录长测。未Mac/真实模型/匹配安装包验收；M4未完成，未GitHub发布。修改 desktop/runtime/agent.mjs、desktop/tests/mock-llm-faults-03740.test.mjs。

## 0.37.70 差距

2026-11-14 0.37.70 M4 内部检查点：运行队列认领失败后继续处理后续排队任务，失败任务不执行且不自动重试。19项队列测试通过，包括单次写盘认领故障与20项混合队列中5项认领故障、15项各执行一次；不保证进程崩溃期间外部副作用可撤销。Office双worker长测进行中不计完成；无匹配Mac应用，M4未完成、未GitHub发布。修改 desktop/runtime/run-queue.mjs、desktop/tests/run-queue.test.mjs。

## 0.37.69 差距

2026-11-14 0.37.69 M4 内部检查点：修复运行队列终态保存失败后，中断状态再保存失败导致重复状态转换抛错、执行名额无法释放。重复写盘失败时保留内存中断态与错误、释放名额、不重放；磁盘最后的running状态在重启恢复后为interrupted。17项运行队列测试通过，含真实Store故障注入与恢复，不代表已执行的外部副作用可撤销。Office双worker长测进行中不计完成；缺jsdom及rcodesign，无匹配Mac应用，M4未完成、未GitHub发布。修改 desktop/runtime/run-queue.mjs、desktop/tests/run-queue.test.mjs。

## 0.37.68 差距

2026-11-14 0.37.68 M4 内部检查点：工具调用后事件记录或通知失败，模型循环停止并明确提示检查已执行操作后再决定重试，不自动重放或再次请求模型。11项mock模型故障测试通过，含本机HTTP模型夹具及工具调用计数；不是付费模型验收。Office双worker长测进行中不计完成；开发环境缺jsdom与rcodesign，无匹配Mac应用。M4未完成，未GitHub发布。修改 desktop/runtime/agent.mjs、desktop/tests/mock-llm-faults-03740.test.mjs。

## 0.37.67 差距

2026-11-14 0.37.67 M4 内部检查点：PDF原文证据预览在应用退出时传递取消；退出发生于原生文件选择时不启动渲染，运行中的子进程收到取消并清理私有暂存。13项相关测试通过，含真实Node子进程终止及真实Linux PDF OCR；选择器/OS打开为夹具，Mac未验。缺rcodesign，未生成与源码匹配的Apple包。Office双worker长测进行中，不计完成；M4未完成，未GitHub发布。修改 desktop/main.mjs、services/ocr-source-preview.mjs、tests/ocr-source-preview-03758.test.mjs。

## 0.37.66 差距

2026-11-14 0.37.66 M4 内部检查点：Office预览池提前注册初始化失败处理，目录不可用但暂未打开预览时不触发未处理Promise；调用仍收到原错误。新增真实Node子进程测试验证销毁卡住时报告状态未知并在迟到解除后杀死子进程。池测试20项与真实Kit预览8项通过。完整桌面测试612通过、17因缺jsdom失败、6因WASM资产未提供跳过（全量开始于本轮最后两项测试加入之前）；41项打包测试通过，签名克隆为夹具。Office双worker长测仍在运行，未计通过；无匹配Mac包/真实Mac/语义模型验收，M4未完成。修改 runtime/office-preview-pool.mjs、tests/office-preview-pool-03739.test.mjs、tests/isolated-worker-pool-03738.test.mjs。

## 0.37.65 差距

2026-11-14 0.37.65 M4 内部检查点：PDF OCR将授权/来源异步复核增加到OCR子进程实际启动前；复核前后检查取消，页渲染后的撤销或源变化不启动识别。识别完成后的复核被取消不返回结果。适用于原生引擎和WASM启动钩子；WASM资产缺失未验实际启动。PDF/图片/WASM相关24项通过、6项缺资产跳过；41项打包测试通过，签名和克隆为夹具。真实Linux Poppler/Tesseract英文通过；Mac/中文/真实模型及对应安装包未验。Office双worker长测进行中，不计完成。变更 runtime/pdf-ocr.mjs、image-ocr.mjs、ocr-wasm.mjs及tests/pdf-ocr-03740.test.mjs；M4未完成，未GitHub发布。

## 0.37.64 差距

2026-11-14 0.37.64 M4 内部检查点：Office池任务失败及空闲时销毁设置有界等待；清理超时后明确状态未知并关闭池，禁止替代或重用，迟到清理继续跟踪。OCR原PDF证据预览采用单槽，重复请求拒绝不排队，成功和失败均释放。54项相关回归通过，含真实Linux Kit双worker、PDF Poppler/Tesseract，以及本机HTTP模型夹具；Mac及真实嵌入模型未验。30分钟池长测仍在运行，未计通过；无匹配安装包，不发布，M4未完成。修改 runtime/isolated-worker-pool.mjs、services/ocr-source-preview.mjs、main.mjs及对应测试。

## 0.37.63 差距

2026-11-14 0.37.63 M4 内部检查点：向量索引保存之后再次核对本地嵌入模型摘要；保存过程中模型更换或身份查询失败时回滚，不返回检索结果。模型目录同名条目摘要冲突或格式无效时拒绝使用。14项向量测试通过，含保存阶段模型替换和磁盘回滚、真实本机HTTP夹具；不代表真实语义模型或Mac验收。Office双worker 30分钟长测在运行，检查点保存时未结束。无匹配安装包，未发布，M4未完成。修改 desktop/services/knowledge-vector.mjs 和 desktop/tests/knowledge-vector-03736.test.mjs。

## 0.37.62 差距

池关闭在清理挂起时有界失败，无法证明未知进程已退出；真实 Mac Office 隔离性能、中文 OCR、离线语义模型、跨端核心与云同步仍待实现验收。

## 0.37.61 差距

工具异常返回只记录失败和副作用未知，无法证明远端动作是否执行；真实模型和第三方工具仍需验收。Apple ARM64 中文 OCR/PDF、真实本地嵌入模型、Mac Office 进程池和跨端共享核心尚未完成。

## 0.37.60 差距

WASM OCR 已在 Linux 开发环境识别英文，相关二进制和语言数据未随源码包或应用分发，中文和 Mac 未验；PDF 仍需本机 Poppler。真实本地语义模型尚未打包，Office 预览池默认关闭。跨 Web/桌面共享核心、跨端云同步、真实 Mac 浏览器/CLI/审批和 Office 保真仍有差距。对照 AWS 官方桌面说明（https://docs.aws.amazon.com/quick/latest/userguide/what-is-desktop.html）为公开文档分析，本轮无 Amazon 原生运行结论。

## 0.37.55 差距

识别词可在历史证据片段标记，尚未打开原PDF或在页面上画框；Mac中文OCR/PDF、真实离线嵌入模型和Mac Office池验收仍缺。

## 0.37.54 差距

OCR 来源可保留词框并输出有界的渲染页面像素区域，尚不支持原 PDF 坐标或界面高亮；Mac 中文 OCR、离线嵌入模型、真实模型和 Office 池性能仍未验收。

## 0.37.53 差距

OCR 输出支持词框到识别文本 UTF-16 区间，尚无证据高亮、PDF 原生坐标或框持久化。Apple ARM64 中文 OCR/PDF、真实离线嵌入模型、Mac Office 池与真实模型验收仍缺。

## 0.37.52 差距

模型工具批次现有有界结构子集检查，尚不覆盖完整 JSON Schema 或业务语义。离线 ARM64 中文 OCR/PDF 和本地嵌入模型、Mac 进程池隔离性能及真实模型验收仍缺。

## 0.37.51 差距

本轮加强模型多工具批次身份检查和结束状态处理；完整 schema 在执行前跨全批校验仍未实现。Mac 本地中文 OCR/PDF、真实离线嵌入模型、多模态、Office 池隔离性能及真实模型验收仍缺，不代表 M4 完成。

## 0.37.50 增量与差距

新增 PDF 当前识别页真实进度及取消任务隔离；不表示整页已完成。离线 Apple ARM64 OCR/PDF 与中文数据、真实本地语义模型、Mac 上 Office 池隔离和性能、真实模型多模态仍待完成和验收。

## 0.37.49 增量与差距

PDF 附件识别增加可见停止与当前任务隔离；并非完整 Quick 文档理解。Mac ARM64 OCR/PDF/中文数据、离线真实嵌入模型、Mac Office 池隔离与性能及真实模型仍缺。PDF 识别的原生对话框和生产界面取消未在 Mac 验收。

## 0.37.48

PDF附件可指定连续最多5页进行本机OCR，但Mac OCR/PDF组件和中文数据尚未内置、未做Mac验收；缺手动取消、PDF坐标高亮、真实语义模型、Office池Mac隔离与性能。REA沿用已有静态证据，无新Amazon原生运行结论。

## 0.37.47

原生选择PDF后可经本机OCR提取前5页作为本轮附件，但依赖未内置Mac OCR/PDF组件；无真实Mac和中文验收。PDF自选页/原坐标高亮、本地语义模型、跨端核心及Office池Mac隔离与性能仍有差距；沿用已有REA公开静态证据，无新Amazon原生运行结论。

## 0.37.46

OCR知识检索片段可标识原PDF页码和SHA，但并非PDF原生坐标高亮；附件直接识别、中文离线OCR、实际本机嵌入模型和Mac进程池隔离性能仍未完成。复用已有REA部分静态证据，无新Amazon原生运行结论。

## 0.37.45

OCR结果经批准可保存为带来源/页码的知识资料；Mac OCR中文、真实本地向量模型、PDF附件直接导入及实际Mac验收尚缺。

## 0.37.44

OCR提供图像词框和PDF渲染像素位置，尚缺PDF原生坐标映射和证据高亮；Mac中文OCR、语义模型和池隔离性能未验收。

## 0.37.43

混合检索增加多来源覆盖；双LibreOfficeKit进程在Linux合成样例中未见输出交叉。Mac隔离/性能、真实本地语义模型与中文OCR离线封装仍未验收。

## 0.37.42

本机向量服务可混合关键词检索，但模型未内置；OCR保留未识别页，Mac OCR/PDF组件与中文数据未内置。Mac池隔离与性能、用户数据和真实模型仍未验收。

## 0.37.41

加固重复停止与PDF读取安全；真实离线嵌入模型、Mac OCR/中文数据、PDF附件及Mac进程池验收仍缺。

## 0.37.40

新增授权目录PDF多页OCR和模拟模型批调用故障保护；只在Linux以真实外部Poppler/Tesseract英文样例验证，Mac组件和中文尚未内置。语义模型和Mac进程池验收仍缺，M4未完成。

## 0.37.39

已实验接入LibreOfficeKit预览池，真实Linux样例有冷/热差异，Mac隔离、签名与性能未验证。真实本地嵌入模型、ARM64中文OCR/PDF和完整mock故障矩阵仍缺。

## 0.37.38

仅Node真实子进程池原型具备重置/取消/关闭测试，尚未接LibreOfficeKit，不声称办公性能改进；Mac OCR与嵌入模型未内置，M4未完成。

## 0.37.37

已接入OCR工具调用和本机向量接口，Mac OCR/中文数据和本地语义模型均未内置；尚无真实热Office进程池或性能数据、复杂多模态及完整Mac验收。

## 0.37.36

可选择本机 Ollama 向量服务，但未内置模型/推理运行时、未验证真实语义质量；OCR、Office 进程池和完整跨文档语义体验尚未完成。

## M4 检查点 0.37.35

已有词法索引并非向量 RAG；现有视觉模型发送并非本地 OCR；Office 预览并发限流并非常驻进程池。任务状态转换和模型异常夹具已增补，完整状态协议和真实 Mac 验收未完成。

## 0.37.34

PPT 的复杂布局、动效、图层画布、中文字体保真和模型自动验收仍未达到目标；受控 LibreOfficeKit 与 OOXML 工具尚未构成完整 UNO/MCP 服务。

## 0.37.33 补充差距

PPT 支持经审批的顶层图层定向修改；尚缺可视化多对象画布、丰富母版与图表、对象动画播放和跨 Office 保真。Mac 和真实模型仍待验收；Quick 对比继续沿用既有公开资料与 REA 静态证据。

真实 Chromium 验收尝试失败：当前容器启动 Chromium 时 socket() Operation not permitted，浏览器未能启动；不能将 18 项模拟/DOM 适配器测试称为真实浏览器验收。

## 2026-11-12 · 0.37.28 浏览器填写导航边界（工作候选）

浏览器填写通过已授权快照定位元素后，焦点设置和焦点复核均会异步等待；期间导航可能使旧页面授权对应的快照失效。现在每次异步焦点步骤之后、实际输入前再次检查快照、当前 URL 和导航 epoch；输入完成后再次检查，发生导航或取消时不返回成功。保留现有单次操作凭证、同 run/精确站点授权、敏感字段限制、结果验证和审计脱敏。

此检查阻止已被主进程观察到的导航后继续输入；导航与输入发送并发时不能证明远端没有收到已经发送的输入，也不能撤回网页副作用。当前仅在注入浏览器适配器/DOM 夹具中测试，不是 Mac Electron 或真实网站验收。新增 desktop/tests/browser-fill-navigation.test.mjs、修改 desktop/runtime/browser.mjs。18项浏览器/审批相关测试、7项 Office 测试（含 Linux LibreOfficeKit）、10项构建/更新器测试通过。0.37.27 Office 启动修复及工作副本校验保留，Mac 用户现场根因仍未知。

GitHub main 和版本分支未发现并发变化，但旧分支仍缺验证文件，既有浏览器安全审查拒绝不得绕过，本候选未 PR/合并/发布。Quick 完整跨端核心、真实多模型、Office 保真和 Mac 原生验收仍有差距。下一轮优先用户 Mac Office 修复结果和实际浏览器输入导航验证，再推进稳定的后台浏览器体验；不要声称已完成 Mac 验收。

修复包补记：从实际候选安装包提取 ASAR，Electron 42（Linux，ELECTRON_RUN_AS_NODE）加载真实包中的 Office 模块、启动真实 LibreOfficeKit 并渲染 Word；164 个可比较应用源码与 ASAR 字节一致。两个旧 0.37.26 候选到 0.37.27 只改 Info.plist、Electron、app.asar、CodeResources；新增约7.2MB双基线修复补丁。仅接受两个指定旧构建，每个基线固定四文件摘要，目标固定四文件摘要与权限；保留原始和目标 codesign、APFS 克隆、回滚。11 项更新器测试通过，真实两个旧 ZIP 的四个文件经更新后与目标 SHA 一致；Linux 的签名与 APFS 为模拟。用户当前安装构建未知，其他版本不匹配会停止；之前 codesign 失败根因未确认。尚无 Apple 芯片 Mac 原生启动/签名/安装结论。

## 2026-11-12 · 0.37.27 Office 启动故障修复候选

用户截图报告临时 worker.py 首行出现语法错误，Office 内核退出。检查当前候选源文件和上轮应用 app.asar 均为正确的 Python；Linux Electron 42 对同一 app.asar 的 fs.promises URL 读取与 ASAR 解包字节均一致，因此尚不能确定用户 Mac 现场的错误来源，未宣称完全修复。用户原始截图和路径不收入源码。

将权威 worker.py 与 ABI.json 在构建时生成 JS 数据模块，由已有模块加载链路提供完整内容；启动前验证内嵌内容 SHA-256、私有目录独占写入后再回读核对 SHA-256，校验失败拒绝启动。打包前执行生成物与源文件一致性检查，防止 Worker 后续修改与内嵌副本漂移。用户数据、审批和原有身份保持。修改 desktop/runtime/office-kit.mjs，新增 desktop/runtime/office-worker-bundle.mjs、scripts/bundle-office-worker.py、desktop/tests/office-worker-materialization.test.mjs、desktop/tests/native/office-worker-asar.mjs，scripts/repackage-native-mac.py 增加构建前一致性门禁。

7 项 Office 测试通过，包括真实 Linux LibreOfficeKit Word/Excel/PPT、写入损坏拒绝与不覆盖已有文件；13 项构建/更新器测试通过。另以真实 Linux Electron 42（ELECTRON_RUN_AS_NODE）从测试 ASAR 加载生产代码，启动 Python Office worker 并渲染 Word；不是 Electron GUI、Apple 芯片或 Mac 原生验收。Mac 运行、签名、公证、用户现场根因及真实文件尚未验收。原 GitHub 版本分支缺失文件，安全审查拒绝仍未解除，未 PR/合并/发布。下一步在用户 Mac 验证启动并定位原现场数据。

完整树验证补记：Linux 实际解压旧应用完整目录，使用 cp -a --reflink=auto 克隆并应用候选补丁；结果与目标包 20727 个应用文件逐项 SHA-256、模式、符号链接完全一致，原始树保留为备份。codesign 和 macOS APFS 原生门禁仍为模拟，不能由此推断 Mac 验收或安装耗时。

实包验证：从旧完整 ZIP 提取四个真实基线文件，用候选小包在 Linux 临时目录更新后，目标三个文件 SHA 与新完整 ZIP 一致，备份四文件 SHA 与旧版一致；签名门禁和 APFS 克隆以模拟替代，运行时用标记文件模拟，未解压并克隆整套应用。新增测试 3 项，连同旧更新器 7 项共 10 项通过。

## 2026-11-12 · 精确候选构建的小更新（未发布）

针对网络慢和重复下载完整运行时，新增仅适用于两个精确 0.37.26 候选构建的小更新生成器和安装脚本。输入完整 ZIP 的 SHA-256 固定，打包前校验闭合清单，只允许 Electron、app.asar、CodeResources 三个文件变化；20,724 个应用条目不变。更新器除了版本还固定原 Info.plist、Electron、app.asar 与 CodeResources 四项 SHA，并固定目标三项摘要和权限；保留原及候选 deep/strict codesign、APFS 克隆、备份回滚、超时和日志。运行端无需 npm/pip。

该补丁仅适用于此前 draft 候选（app.asar SHA 9749e55d...）到 draft-generation 候选（23897d9b...），不适用于其他同版本构建；用户现有安装版本未知。此前用户报告 codesign 失败，根因未确认，本轮不声称解决或加快 Mac 安装。Linux 文件系统测试使用模拟签名/克隆，Mac codesign、APFS 和真实安装未验收。旧离线应用未更改。

源码修改：scripts/package-draft-generation-update.py、desktop/installer/update-draft-generation.py、desktop/installer/Apply-Draft-Generation-Update.command、scripts/tests/test_draft_generation_update.py。下一步在 Apple 芯片真机收集原始签名日志、检验旧构建身份及更新/回滚；继续 Office 编辑与用户文档验收。

## 2026-11-06 综合办公验证补记（未发布）

2026-11-06 验证补记：最终候选 Word/PPT/Excel 组合串行 56 项通过，命令队列 14 项通过、打包脚本 28 项通过；浏览器测试因缺 jsdom 未启动。另对本轮较早、独立冻结的源码树循环执行真实 Linux Kit Word/Excel/PPT 测试，111轮无失败后在1694.7秒主动结束，未达到30分钟压力测试，且该树早于最终图片锚点/尺寸/裁剪修改，不能作为最终代码30分钟稳定性结论。先前非隔离短测出现2项内核异常退出，根因未确定。Mac/真实模型/用户原件/完整UI和新离线应用未验收。

## 2026-11-06 综合办公工作检查点（未发布）

2026-11-06 后续 Excel 图片裁剪保护：校验每个工作表图片源裁剪 a:srcRect 四边（缺省为零），变化、重复或非法数值拒绝发布；真实 Linux Kit 未裁剪图片写入、输出注入裁剪负例及 Excel 全组18项通过。未验证所有复杂裁剪、旋转、效果、图表及实际文件保真；Linux 与 Mac 可能转换裁剪参数，当前严格策略可能保守拒绝。命令队列14项通过（包含真实Node子进程）；浏览器运行时测试因缺 jsdom 无法启动，不能视作通过。修改 desktop/runtime/office-cells.mjs、desktop/tests/office-cells.test.mjs；未构建安装包、未发布，Mac/真实模型/完整UI/用户原件仍未验收。

## 2026-11-02 · 0.37.19 PPT选中文字字号与字色

## 2026-11-04 · 0.37.22 PPT选区手动编辑

用户实测反馈字体恢复；沿用0.37.21字体配置。PPT新增选中文字后载入编辑框、修改、保存和取消路径，绑定原生选区及sequence，写前持久审计，保存时校验文本与既有直接格式；迟到选区、审计失败和错误输出不发布。仅唯一普通单段文字选区，不是完整PPT编辑器；真实Mac原文档尚未验收。见docs/PPT_MANUAL_EDIT_03722.md。


## 0.37.21 中文字体候选

Office Kit 进程在 macOS 使用独立 Fontconfig 文件，读取系统、公共、用户及 LibreOffice 自带字体目录，缓存放在私有任务目录，不修改应用签名包或文档。编辑与 PDF 预览共用该进程。Linux 字体配置及真实引擎测试支持该方案；尚未在 Apple 芯片 Mac 或用户原文档验收，不能承诺已解决 Mac 方框。详细证据与局限见 docs/archive/dev-notes/MAC_FONT_CANDIDATE_03721.md。


## 2026-11-04 · 0.37.20 视口滚动与受限文件搜索

Office 画布增加纵向滚轮与可拖动滚动条，切页归顶并按内核视口坐标映射点击；帮助文字折叠，避免固定栏遮住文档。已授权目录内的系统 find 仅允许明确的只读表达式自动执行，保留审计；Shell、删除、未知命令仍逐次审批，不能以“非删除”假设安全。Mac 的中文方框和预览缺字尚未定位或验收。见 docs/archive/dev-notes/OFFICE_VIEWPORT_AND_CLI_03720.md。


新增 office_format_presentation，标准模型工具循环实际设置当前唯一普通单段文本框同格式选区的字号/字色，不改文字。无Electron核心复用逐字输出验收，主机与worker双层固定参数/页面选区守卫，逐次批准/持久审计/取消/CAS和每请求一次修改额度保持；未实际修改或格式不符不提交，手动保存不能绕验收。详见[实现与验证](../archive/dev-notes/PPT_DIRECT_FORMAT_03719.md)及validation/v0.37.19。Mac/付费模型/IME/原生签名未验收，安装慢未解决。GitHub历史审批额度提示Nov2 07:24恢复，本轮凌晨未到时点不重试或换路线；长期发布授权有效。下一轮Mac优先，否则受控PPT编辑或选区上下文，持续办公目标未完成。

## 2026-11-01 · 0.37.18 PPT选词替换直接格式验收

扩展无Electron PPT核心，核实际保存文件已知字号/粗斜体/下划线/字色/适用脚本字体与对齐，允许run拆合；混合选区/复杂效果目标调用native前拒绝。文字正确但格式丢失不能发布，显式save不能绕验收，私有草稿修正后可手动重试。沿原审批/审计/选区/版本/取消与一次修改额度，不是新增AI设置PPT格式或完整OOXML保真。详见[实现与验证](../archive/dev-notes/PPT_FORMAT_RECEIPT_03718.md)及validation/v0.37.18。Mac/付费模型/IME/原生签名未验收，安装慢未解决；GitHub额度Nov2前不绕过，长期发布授权保留。下一轮先Mac原文档验收，否则受控PPT直接格式编辑/选区上下文，避免只写说明队列。

## 2026-11-01 · 0.37.17 Word整表指定外边

office_table_grid新增可选edges仅修改完整唯一未合并表的指定外围边，省略仍保持原全部网格。内部线与未选外边、padding/文字及非目标部件保留；单边不是每格同名边，start/end为逻辑方向。复用无Electron核心与审批/审计/版本/取消/CAS及同session预加载重载，审批明示清空原生Undo/Redo、前5持久版本保留。详见[实现与验收](../archive/dev-notes/OFFICE_PERIMETER_03717.md)及validation/v0.37.17。Mac/真实付费模型/IME/原生签名未验收，安装慢未解决；GitHub额度Nov2前不绕过，长期授权继续。下一轮先Mac原文档验收，否则复杂PPT文字保护或受控Office编辑，不只做说明队列。

## 2026-11-01 · 0.37.16 Word完整表格全部网格

新增office_table_grid与无Electron的OOXML核心：仅整个Word包唯一正文顶层表格的完整选区，设置全部实线含内横/竖线；保留文字、直接格式、padding和非目标部件。候选经真实Kit预加载/画面与全部件SHA核验后CAS提交，在同一session自动换worker，审批明示清空原生Undo/Redo栈、前版保留。初始化/候选漂移/拒绝/取消/审计/磁盘失败保留旧版，文档服务新增提交guard支持关闭期间写前写后检查/回滚。不是失败UNO网格原型换名放行；多表、部分、合并、嵌套和复杂目标保守拒绝。详见[实现与验收](../archive/dev-notes/OFFICE_TABLE_GRID_03716.md)和validation/v0.37.16。保留原Web/Python、白蓝logo、旧身份及所有旧能力。Mac/付费模型/IME/原生签名和复杂Office保真仍待验收，安装慢未解决，GitHub额度提示Nov2当前不绕过，长期发布授权保留。下一轮Mac优先，否则受控单边或PPT复杂文字保护，不只加说明队列。

## 2026-11-01 · 0.37.15 Word格式完成与成品验收

Word格式工具等待固定原生命令完成通知，新增无Electron的DOCX核验核心：选区唯一对应正文连续纯文字段落，检查全部正文/页眉页脚段落文字保持，并逐片段验证请求的西文/东亚字体、字号、字色与底纹，允许原生拆run。原生未执行/部分执行/缺属性均不能发布；调用前保留dirty和验收器，手动save不能绕过，最后异步查询后再检查取消/版本，worker独立核expectedSelection。跨段全选旧能力保留，复杂/歧义选区保守拒绝，非全OOXML/字形保真。首轮错误与复测见[实现与验收](../archive/dev-notes/OFFICE_WORD_RECEIPT_03715.md)及validation/v0.37.15。保留原Web/Python122文件、白蓝logo和旧身份。Mac/付费模型/IME、签名安装、安装速度仍未验收或未解决；GitHub此前额度提示Nov2，不重试或换路线，长期发布授权保留。下一轮Mac优先，否则Word网格/单边或复杂PPT文字保护；不只写介绍队列。

## 2026-10-31 · 0.37.14 Excel原生单格受控公式

新增office_set_formula，单格同表算术/七函数数值结果，复用既有AST/依赖核心与原生受控定位写入；保存前核验全工作簿数据/公式及全部公式缓存，保留审批/审计/CAS/一次修改额度/错误阻断和草稿验收重试。独立布尔/文本、外链、跨表、循环、错误、共享数组/图表/合并等拒绝。没有放开常量或通用粘贴公式。449核心完整串行/9新增公式/11最终Chromium/26打包通过。首轮CJK UI失误复测通过但根因未知，保留失败记录，不称稳定性已修。详见[实现与验收](../archive/dev-notes/OFFICE_NATIVE_FORMULA_03714.md)。Mac/付费模型/IME未验收、未公证，安装慢未解决；GitHub额度提示Nov2不绕过，长期授权保留。下一轮Mac优先，否则Word网格或PPT复杂文字；不只改说明队列。

## 2026-10-31 · 0.37.13 PPT精确文字选区与替换

PPT普通单段文本框双击/全选后可用固定方向键与Shift精确选词；现有office_replace_selection绑定真实文字类型/页面/sequence，审批与持久审计后再检查，保存前核验真实PPTX所有页形状顺序/类型和段落文字，只允许唯一目标子串变化。重复词、分组/表格/域/链接/多段拒绝；no-op与显式保存重试受同一验收器保护。440核心完整串行/10真实Chromium/26打包通过。见[实现与验收](../archive/dev-notes/OFFICE_PPT_SELECTION_03713.md)。不是完整对象/格式无损/IME；Mac和付费模型未验收。保留旧能力与Web/Python、白蓝logo/旧身份，安装慢未解决。GitHub额度提示Nov2，未重试或绕过，长期授权保留。下一轮Mac优先，否则Word网格/受控公式或PPT复杂文字。


2026-10-31官方对齐复查：https://docs.aws.amazon.com/quick/latest/userguide/working-with-chat-desktop.html 描述文档页签呈现/编辑，以及文字、图片、表格选区作为上下文。QuanK本轮仅补Excel有界矩形格式与真实保存验收；PPT对象/图片选区、复杂Office往返、跨Web完整核心/云同步、自主并行仍未完成，不将局部格式能力称全面对应。REA沿原部分静态证据，无新Amazon原生运行结论。

## 2026-10-31 · 0.37.12 Excel选区真实格式

新增office_format_cells，真实内核修改当前矩形的字号/字色/底色；保存前核验XLSX目标样式及全工作簿单元格数据/公式不变，精确十进制比较，主题tint/条件格式/目标富文本/共享数组公式保守拒绝。原生范围/审批/持久审计/CAS/输出失败草稿重试保护保持，checkCells供新旧工具共用。433核心/最终9格式/9Chromium/26打包通过。见[实现与验收](../archive/dev-notes/OFFICE_CELL_FORMAT_03712.md)。Mac/付费模型/IME未验收，ad-hoc未公证、安装慢和复杂保真未解决。GitHub仍受Nov2恢复的审批额度阻塞，本轮不绕过、未上传PR合并发布；长期授权有效。下一轮Mac优先，否则PPT选区/Word网格/受控公式。

## 2026-10-31 · 0.37.11 Excel原样文本常量

现有office_update_cells新增显式{text:...}，真实原生写入和XLSX字符串类型/精确值核验，保留前导零/日期样式/公式样式文字；普通字符串规则保留，不能执行公式。完整矩阵预检/审批/审计/CAS和失败草稿重试保护沿用。首次空文本被原生写成单引号已被核验拦截并修正，不降低非空类型断言。见[实现与验收](../archive/dev-notes/OFFICE_LITERAL_TEXT_03711.md)及validation/v0.37.11记录。原Web/Python、白蓝logo和旧身份不变。Mac/付费模型/IME未验收、ad-hoc未公证、安装慢未解决；GitHub额度提示Nov2，当前不绕过、未新发布。下一轮先Mac或Excel精确格式/PPT选区。
## 2026-10-30 · 0.37.10 真实Excel选区常量更新

新增office_update_cells，绑定原生part/地址/光标/HTML矩形指纹，强制同尺寸单行常量矩阵，逐次审批/审计/CAS与真实XLSX输出验收；通用AI粘贴不再可扩展Excel选区。真实HTTP模型夹具→LinuxKit→独立openpyxl核验区域/样式/范围外公式重算；原生no-op或错误输出无法经显式save绕过，模型“成功”不能覆盖工具失败。修复真实Redo用例暴露的保存先于动作完成时序，以原生通知+真实历史栈状态验证后保存。419核心/最终12相关/8Chromium/26打包通过。Mac/付费模型/IME未验收，原生字体行高规范化仍有边界，ad-hoc未公证，安装耗时未解决。详见[实现及验收](../archive/dev-notes/OFFICE_CELLS_03710.md)。GitHub额度提示Nov2恢复，当前未重试，无上传/PR/main/Release。保存以最终交付回执为准。

## 2026-10-30 · 0.37.9 精确选区文字与背景颜色

新增office_format_selection的fontColor/backgroundColor，固定原生Word选区颜色/字符底纹，两层RGB参数校验，保留原生审批/审计/CAS/单次额度；精确TARGET生产UI→实际HTTP模型夹具→真实LinuxKit→独立DOCX只改选词验证，411核心/7Chromium/26打包通过。网格原型独立DOCX断言未达到指定颜色/线宽，已撤回，外框仍清内部线。Mac/真实付费模型/IME/安装速度未验收或未解决，ad-hoc未公证。详见[实现与验收](../archive/dev-notes/OFFICE_SELECTION_COLORS_0379.md)。下一轮Mac真实链路或Word网格/单边与ExcelPPT受控编辑。GitHub审批额度提示Nov2恢复，当前不绕过，无新上传/PR/main/Release。

## 2026-10-30 · 0.37.8 复用Office内核导出PDF

安装版预览与编辑共用Kit运行时，固定PDF导出、启动/在途取消及回读版本守卫；407核心/6真实Chromium/26打包通过。原CLI三格式测试本轮重新通过，历史卡住根因未定位，不宣称根治。Mac签名/字体/IME/真实模型未验收，ad-hoc未公证，安装耗时未解决；跨Web核心/OAuth/stdio/自主并行与完整Office仍差距。详见[实现及验收](../archive/dev-notes/OFFICE_PDF_RUNTIME_0378.md)。GitHub此前审批额度提示Nov2恢复，当前未到时点，无新上传/PR/main/Release，不绕过；保存状态以最终交付为准。

> 0.37.7为候选：完整核心399/400，XLSX原生CLI PDF转换超时未过；新增键盘选区与静态arm64包检查通过，正式基线仍0.37.6。见[验证状态](../validation/v0.37.7.json)。

## 2026-10-30 · 0.37.7 Word键盘选区

Word画布固定方向/Home/End+Shift/Ctrl，导航推进选区sequence但不创建文档revision；真实精准词选区→既有模型工具→独立DOCX校验。不是完整键盘/IME或Mac验收；完整网格边框、跨Web核心/OAuth/stdio/自主并行仍差距。详见[实现与验证](../archive/dev-notes/OFFICE_KEYBOARD_SELECTION_0377.md)。GitHub此前审批额度故障未到恢复时点，本轮不绕过，无新PR/main/Release；安装耗时未解决。

## 2026-10-29 · 0.37.6

Word真实表格选区外框样式工具已实现：颜色/线宽/显式内边距，清内部线；不是全部网格线，合并/嵌套/超限选区拒绝。395核心/3Chromium/26打包通过，详见[验收说明](../archive/dev-notes/OFFICE_TABLE_OUTLINE_0376.md)。Mac原生签名/字体/IME/付费模型与安装耗时未验收，发布仍受此前审批服务额度故障阻塞。Quick/REA仅复用公开文档与旧静态证据。

## 2026-10-29 · 0.37.5

真实内核撤销/重做计数与执行前双重检查、生产按钮禁用/步数、失败草稿显式保存重试已实现。389核心/2Chromium/26打包通过，详见[验收说明](../archive/dev-notes/OFFICE_HISTORY_0375.md)。仍无Mac原生签名/IME/字体显示验收，安装耗时与临时副本根因未解决；REA复用旧静态证据。发布受此前审批额度故障阻塞，未PR/main/Release；保存下载结果以最终交付为准。


本轮最终构建核对：干净0.37.4 arm64 ZIP483215507字节，SHA3470dcff2fddb3ad27c7fe0ea9e6f9d0237af7ac0f8b07443ab69c1190a43a8a；ASAR fd0922c1300ca4958f0e58746b478e25615c80e9b94961ae0d9a4b1c104a3470，与149生产文件及最小package逐字节一致，无宿主字节码。278可运行MachO/93545代码页、20727应用条目+5配套、47链接、零残留、闭合CRC、实际Electron页篡改负例拒绝。与0.37.2比较仅Info.plist/Electron/app.asar/CodeResources四条目改变，全部Python/LO运行时条目字节/模式/链接不变。首次带开发字节码包不交付，仅当前干净包有效。仍ad-hoc未公证；页哈希不替代Mac codesign深严格资源封印/Gatekeeper/安装/字体显示验收。不把本轮隔离目录构建通过称先前临时副本根因或安装速度已修；没有新小更新，用户无需为提速反复重装。
public只读并发核对main仍27bd38f6b43806fb702c62ec4586426730b8190a（0.37.1），0.37.2分支0ce607437ef2c7814b295b43ec7b4ccd3c0b4a42。没有本轮0.37.4 GitHub上传/PR/Release；此前自动审批额度故障未到恢复时间，不绕过。保存与权威expected43更新按包外最终回执记录；本文件是构建时快照。

# 0.37.4 · Word选区东亚字体与审计后取消保护

从权威0.37.2/v43（653内容SHA）及最新0.37.3-r1候选（662内容SHA）重新获取核验后接续；保留西文字体/字号及构建输入校验，不回退候选代码。新增office_format_selection.fontNameAsian，映射固定.uno:CharFontNameCJK及CharFontNameCJK.FamilyName参数。fontName仍仅表示西文字体；统一中西文时须显式分别指定。仅DOCX当前真实非空选区，80字符字体名和控制/路径字符限制、主机与Python双校验、逐次原生确认、sequence/revision/SHA、写前持久审计与CAS及一次任务一次修改额度保持。新增审计返回后取消/版本/30分钟许可检查，取消时不再向内核发格式命令。

验证实际OOXML写入eastAsia，不等于安装/捆绑字体，不保证目标Mac已安装所选字体，不宣称所有中文方框已修复。没有分发微软雅黑或新字体，没有改LibreOffice上游/原许可。Office侧栏说明新增中西文字体区分，没加占位按钮；手工字体工具栏/表格边框/撤销可用状态/Finder关联仍待做。

本轮385核心测试串行完整通过，14相关测试单独通过；新增3项涵盖Asian参数边界、真实本机HTTP模型夹具→真实LinuxKit→DOCX独立python-docx/lxml校验eastAsia=Noto Sans CJK SC、西文Liberation Serif/15pt不变且中英文原文保持、审计期间取消原生命令0次且不产生revision。2条真实Chromium通过：新增生产Office窗口选区→Enter发送→实际HTTP工具调用→Kit写东亚字体→新revision/导出独立校验→刷新对话保持；既有手工/模型替换/保存/失败重试回归。原生IPC/审批/模型语义仍夹具，LinuxLODev26.8alpha不等于Mac26.8.1.1。首次全量并行测试有内核退出/等待超时，未确定根因；最终按test-concurrency=1完整385项通过，不把串行结果泛称无限并行负载已验收。首次新文本断言未考虑既有提取器按run加换行，改为容忍提取换行，独立DOCX原始text join检查没有放宽。

26项打包/文件系统故障测试通过。新生产源码复制过滤__pycache__/*.pyc/*.pyo；仅应用自有源码过滤，不删除既有原厂Python/LO载荷。首次隔离包完整签名/页哈希/CRC过后，ASAR检查发现本轮py_compile的宿主字节码缓存，不作为最终交付；增加缓存过滤和负例后重建。本轮使用/tmp新0700临时构建目录，沿0.37.3-r1独立输入输出与所有清单/代码页/LO字节门禁，未清残留后重算、未去隔离或跳签名。工作区此前截断临时副本来源仍未知，不把一次隔离成功称根因已修。

官方协议参照：https://raw.githubusercontent.com/LibreOffice/core/master/svx/sdi/svx.sdi（本轮只读核对CharFontNameCJK定义；未复制分发源码）。Quick继续复用REA既有部分静态证据，无新Amazon运行结论。原Web/Python122保护文件保持，旧35Python执行器未改未重跑，无新生产依赖，身份/白蓝logo/原业务不变。

实际代码变更：desktop/runtime/office-format.mjs、runtime/office-kit/worker.py；services/office-workspace.mjs、office-chat.mjs；src/office/index.html；tests/office-format.test.mjs、office-chat.test.mjs及新增acceptance/office-cjk-live.mjs；scripts/offline_bundle.py、package-offline-mac.py、tests/test_native_repackage.py；版本/验证/迭代记录。签名和Mac原生中文/IME/实际付费模型仍未验收。下一轮优先Mac原始codesign日志与原文档字体/真实模型验收，然后表格边框、撤销状态与精确选区编辑，不停在说明或队列。

GitHub0.37.2版本分支已上传但此前创建PR遇自动审批额度故障，提示恢复时点未到。本轮不重试或换接口绕过，没有0.37.4 PR/main/Release。用户持续发布授权有效，阻塞来自审批服务，不再套用历史未授权边界。

# 2026-10-29 · 0.37.3-r1 构建输入完整性检查

本轮重新读取权威0.37.2/v43（653内容SHA）及已保存0.37.3候选（658内容SHA），保留所有实际字体/字号功能；本轮不新增Office编辑能力，不把旧功能计作新增。

已修改scripts/repackage-native-mac.py：解压后立即核对整个应用的路径集合、逐文件SHA/大小/执行位/符号链接，任何额外、缺失或改变即拒绝，早于Info.plist/ASAR修改和签名。签名改为独立输入树与全新输出树，拒绝重叠或已有输出；签后重查输入完全不变、输出路径闭合。并非删残留、跳签名或排除运行时校验。只有完整通过原有代码页/上游LO字节/闭合ZIP门禁才允许发布。

事实证据：基线ZIP Framework为182559840字节，SHA307eb07de8401c8917239abd7bfd52284f7154ff30a3673f93af04179eb78f9e；本轮解出原文件仍相同。单独诊断副本rcodesign签名通过44224代码页验证，完整Framework单独签名也未报解析错误，不代表Mac codesign/Gatekeeper。整包新目录在本次整包签名命令执行前出现额外.Electron Framework.*文件，其内容为原文件截断前缀；基线ZIP无该条目。新增前置检查在第二个新目录成功拒绝，签名器未启动。来源/写入进程未知，不归因用户应用写入、pyc或上游运行时损坏。独立输出签名路径未进入完整真实整包验收，仅单元故障测试覆盖，不能称已解决竞态或安装慢。

25项打包/真实文件系统及故障测试通过（新增5项）；382核心全量重跑通过。新5测试：解压字节/模式/链接/额外路径异常、不同输入输出保留输入、重叠/已有输出拒绝、签名器篡改输入或输出额外文件拒绝、已知残留签名前拒绝。实际签名CLI在测试中注入，明确不是Mac原生验收。原生产模块与上一份0.37.3候选逐SHA相同，122原Web/Python保护文件未改，旧35Python执行器未改未重跑；不重复跑未改变的Chromium交互测试，上一轮1项结论只作历史记录。

没有0.37.3离线应用包、没有PR/main/Release；正式权威仍0.37.2/v43，不覆盖不完整候选。GitHub0.37.2此前审批额度故障仍未到提示恢复时点，本轮不重试或换路线绕过。签名/完整ZIP/Mac安装与原生CJK仍阻塞。新版源码候选r1保留，下一轮先查临时前缀文件来源、在Mac原生验证严格签名，再推进eastAsia字体/表格边框/撤销状态等Office主线。Quick继续复用既有REA部分静态证据，无新增Amazon运行结论。


最终检查：20项打包/更新器测试通过。两次独立私有目录完整离线重建均在rcodesign签Electron Framework临时文件时失败：binary parsing error: type is too big (171409408)，各次临时输入长度不同，根因未确定。未删除残留后重算清单，未绕过签名或修改Python/LO，不放行任何0.37.3应用包。最终ASAR/完整ZIP/MachO页/完整资源清单未通过本轮构建，不能借用0.37.2结果。保存0.37.3完整源码候选，不覆盖正式权威0.37.2/v43。下一轮应先复现临时文件解析并核对原始已签输入与临时输出，不能无证据重签或关安全机制。
实际修改：desktop/runtime/office-format.mjs（新）；desktop/runtime/office-kit/worker.py；desktop/services/office-workspace.mjs、office-chat.mjs；desktop/src/office/index.html；desktop/tests/office-format.test.mjs（新）、office-chat.test.mjs；desktop/package.json、package-lock.json；scripts/package-desktop-source.py、repackage-native-mac.py；迭代/差距/REA/下载/验证与发布状态文档。原Web/Python122保护文件SHA不变，无新生产依赖；旧35Python执行器未改未重跑。

# 0.37.3 Word选区字体与字号

从权威0.37.2/v43重取653内容文件逐SHA核验。实际新增office_format_selection模型工具：Word当前真实选区→单独原生确认→持久审计→固定UNO字体/字号命令→真实DOCX新版本/CAS。与文字替换共用每请求最多一次修改额度，不能混改两次；不开放任意UNO命令或参数。主服务与Python worker两层校验字体名80字符、无控制字符/路径字符，字号6–96pt、0.5pt步长；审批前后核选区/版本，过30分钟授权拒绝。审计不记录选区或参数正文。

本轮验证到的是西文字体属性ascii/hAnsi与字号。未设置eastAsia；不是中文字体或缺字修复，不捆绑微软雅黑等商业字体，不保证目标机器已安装指定字体。仅DOCX；Excel/PPT格式、表格边框、撤销状态、Finder关联和原生LO欢迎品牌仍待做。常规手工工具栏未新增字体输入框，仅现有Office AI对话可调用真实工具。

382项核心测试通过（较0.37.2新增3）；15项相关测试单独通过。实际本机HTTP模型夹具→真实LinuxLibreOfficeKit→保存DOCX→独立python-docx校验全部非空run字体Liberation Serif、18.5pt、文字保持，旧版保留。拒绝/旧选区/取消/审计磁盘失败不发布新revision。首次原型使用错误UNO参数名，独立DOCX断言失败拦下；按LibreOffice官方FontController参数CharFontName.FamilyName/FontHeight.Height修正后全部重测通过，不把命令回执当修改成功。1项生产Chromium真Kit手改/模型选区替换/保存/历史回归通过。IPC/审批/模型语义仍夹具；LinuxLODev26.8alpha不等于Mac包内26.8.1.1，未Mac/真实付费模型验收。

官方参数参考：https://docs.libreoffice.org/android/html/FontController_8java_source.html
Quick沿用docs/REA_FINDINGS.md既有公开包部分静态证据，无新Amazon运行结论。距完整Office替代仍有中文字体、复杂格式/对象、键盘IME与Mac安装签名差距。

GitHub0.37.2分支0ce6074已654文件逐SHA核验，但创建PR被自动审批额度故障阻塞，main仍0.37.1；本轮不重试或换路线绕过。用户持续发布授权有效，不缺权限确认。0.37.3新发布尚未执行，无新Release链接；安装故障、全量解压耗时未解决，不要求用户为提速重装。下一轮先Mac签名原始stderr/原文档CJK证据，再东亚字体与表格边框定向编辑。


# 0.37.2 Office交互修复

从权威0.37.1/v42重取649源码SHA核验后恢复实现。保存按钮显示进度与版本/时间、失败明确报错可重试；Enter发送/ShiftEnter换行/IME组合不误发；移除常规技术内核文字。用户点击发送明确同意当前文档正文/选区给当前模型，文档ID/revision/SHA/sequence精确绑定，排队内容变化拒绝；AI选区修改保留逐动作审批/审计/CAS。不是全任务/全盘默认授权。合入已保存r2更新器诊断，仍未解决Mac签名故障/解压慢。

重新验证：379项核心测试、3条真实Chromium、20项打包/更新器测试通过；之前环境丢失候选的测试不复用。真实LinuxLibreOfficeKit画布手改v2、真实HTTP模型夹具选区修改v3与落盘历史、保存中/失败重试/已是当前版本确认、Enter/ShiftEnter/组合输入、普通资料原生审批0次均通过。IPC/审批/模型语义仍夹具，Mac原生运行未验收；本机LODev26.8alpha与Mac内置26.8.1.1不同。打包进行中。字体/字号/表格边框AI修改、撤销重做状态、Finder打开方式和原生LO欢迎页品牌、原生Kit中文方框仍待做，不能用PDF.js修复替代。最新私有截图仅作为需求，不入源码。下一步测试生产Office窗口保存/回车/权限/故障及真实Kit写入，再打包保存和GitHub分支PR/main/Release；Mac实际签名/安装/字体/IME仍需原生环境。

# 0.37.1 截图故障修复

用户九张截图已逐张查看，包含私有事故资料；原图和资料不收入源码。修复范围按证据分开：

1. 多个 QuanK Office 编辑按钮报 api[name] is not a function：0.37主进程已有officeOpen注册，生产preload白名单漏掉该方法。补齐精确方法，不新增任意IPC入口。新增VM实际加载生产preload验证冻结接口/准确channel，再将真实preload导出的接口名用于生产Chromium页面回归，覆盖成果中心、预览工作区、文档双击三入口。旧测试手工模拟桥接遗漏这层，已补覆盖。界面接口缺失时也显示中文升级/重启提示。
2. 中文预览缺字：旧PDF组件未分发CMap与标准字体数据。固定pdfjs-dist5.6.205自带资源全量内联到引擎，独立内存BinaryDataFactory精确键查找，useWorkerFetch=false，无网络或文件代理，不放宽CSP。保留Adobe/Foxit/Liberation许可证。使用无嵌入中文CID字体、UniGB-UCS2-H真实PDF：旧引擎提取文字为空，修复后完整中文文本/2387暗像素且无外部请求、无CMap加载错误。已查看真实画布截图，中文可读。测试宿主临时安装官方NotoSansCJK字体用于显示，不随应用分发；原图文档没有文件原件，不能称原文档全部字体/内容已验收。源DOCX/XLSX已丢失的正文/图片不会由本修复补造。
3. 正常分页预览标题和状态统一QuanK Office，保留第三方许可/开发说明。编辑窗口使用现有蓝红logo。桥接修通后正常入口为QuanK自有Kit窗口；主应用已有dock.setIcon，历史外部LO进程的独立Dock图标不是简单改按钮文字能解决。Mac Dock实际显示与Kit启动仍未真机验收，不称图标问题完全解决。
4. 纳入此前安装性能候选：同盘严格签名检查后移动已解压app，不再次ditto复制整个Python/LO；跨盘保留复制后codesign，事务失败恢复原件/旧版。13打包事务测试含新增3项真实文件系统inode保持、提交失败回滚、备份冲突拒绝。设备号通过开发测试适配；Mac跨盘与签名调用未跑。全量ZIP解压和增量更新/原生DMG仍未完成，不能把本补丁称完整安装性能修复。

377核心、5相关真实Chromium、13打包测试通过。新桥接测试本身初次语法笔误修正后通过；新PDF测试初次静态服务器根路径多斜线导致404，修正测试后通过；未把这些测试错误称生产Bug。真实LinuxKit/HTTP夹具沿既有链路回归，IPC/原生审批/Keychain/模型语义仍夹具。无Mac原生/付费模型/Gatekeeper/公证验收。应用不移除隔离或关闭保护。Python/LibreOffice原载荷保留，148生产文件ASAR逐字节相同，原Web/Python保护文件不改。

下一轮：实际用户Mac编辑启动/中文文件与Dock验收，优先原生安装和仅应用代码变更的更新包，避免反复解压全部运行时；再完整IME和Office对象编辑。用户WorkBuddy截图仅交互参考，无底层实现推断，不拷贝其资产。Quick/REA复用既有部分静态证据，没有新增Amazon运行结论。

## 2026-10-27 · 0.37.0 QuanK Office 嵌入式编辑

从权威0.36/v39重新获取612内容文件逐SHA校验后实现。内置 LibreOfficeKit 独立进程绘制/选区/格式与文字编辑，QuanK自有窗口和默认折叠文档AI；手动和批准AI写入直接新版本，无退出再收回。真实原生内核而非仅外部打开按钮。上游二进制不改，自有适配器不是重编上游或完整Office编辑器。

376核心、6相关真实Chromium、10打包测试；详见validation/v0.37.0.json。Linux真实内核+本机HTTP模型夹具，IPC/审批/模型语义仍夹具，无Mac/付费模型/中文IME及完整Office兼容结论。原122Web/Python保护文件不变；旧35Python执行器未改未重跑。Python/LO及离线依赖沿0.36内置，ad-hoc未公证。

0.36已PR9合并main f4445a5bdc19466464a590432437c1e5ddca74d0并发布。本轮构建时分支/PR/main/Release待执行，最终以对应Release记录为准，继续长期授权。下一轮先Mac原生Kit启动/选区/保存与严格签名验收，再完整键盘IME、图片图表对象/样式、Excel公式与PPT编辑。后台浏览器焦点、定时历史仍待做。见docs/QUANK_OFFICE.md。

# 2026-10-27 · 0.36.0 内置 Python / LibreOffice

从权威0.35/v38重新获取并核验595内容文件。内置arm64 Python3.12.16、LibreOffice26.8.1.1及20个锁定wheel；安装端不另装软件。默认Office改为真实LibreOffice→PDF分页预览；编辑使用包内独立原生窗口，保存退出后批准收回新版本。不是同面板完整LibreOfficeKit编辑器，PDF尚未复用旧OOXML选区映射。

新增普通DOCX末尾插入本轮本机PNG模型工具，逐次批准/图片SHA/版本守卫；不下载外部图片或生成假素材。原Web/Python/白蓝logo/旧身份/双任务/浏览器授权/Skills/MCP及旧源码开发编辑器保留。实际LinuxLibreOffice三格式转换、图片PDF与文本独立解析；真实Chromium生产页PDF→原生编辑启动夹具→真实字节→回收新版本。Mac/付费模型/Keychain未验收，SDK随包不等同于完整actions协议集成。旧35Python执行器未改未重跑。详见docs/NATIVE_OFFICE_AND_PYTHON.md和validation/v0.36.0.json。

早期候选两次重置丢失后从正式基线恢复重测，保存未验证检查点。构建曾拒绝未知临时残留及原厂LO链接输入重签失败；最终全新私有载荷路径/字节清单，LO原厂签名保留；残留根因未确定。外壳/Python ad-hoc，未公证/未Mac深严格资源封印或Gatekeeper验收。

0.35已PR8合并main19b54fe并发布。本版构建时GitHub分支/PR/main/Release待执行，以Release最终状态为准，不沿用旧未授权边界。下一轮Mac安装/内置Python依赖和LO真实编辑；LibreOfficeKit/UNO选区与AI定向修改。后台浏览器焦点和定时任务历史仍待完成。

# 2026-10-27 · 0.35.0 Skill实际代码运行

从权威0.34/v37重新获取并核验584内容文件。执行环境重置丢失早期未保存候选后，全部从正式基线恢复重做，不沿用旧测试结论。

新增 runtime/skill-runtime.mjs、services/skill-execution.mjs；绑定资源私有物化、SHA复验、真实Node/Python进程、逐次审批/取消/限额、持久运行记录与受控成果导入。新增第13项独立预算脚本预置，原12项与8MCP保留。CLI --json有界解析独立于退出状态；共享文档服务锁和提交后守卫回滚避免跨实例覆盖。

恢复后的356核心、5真实Chromium、10打包测试通过；实际Node/Python与本机HTTP模型夹具→预算XLSX→openpyxl及生产预览验证。IPC/审批/模型语义仍夹具，无Mac/付费模型/Keychain原生结论。125生产文件与最终ASAR逐字节一致、122原Web/Python保护文件不变；旧35Python执行器测试未改未重跑。ad-hoc未公证，不宣称Gatekeeper通过。

0.34已PR#7合并main292207f4f6e051fdf21c908a0ce2c983f3b4aef3并发布，旧进行中状态已过时。本版构建时GitHub发布待执行，最终状态以Release为准，不修改既有附件。

下一轮：Mac原生脚本/审批/安装验收；Python离线依赖与SDK适配、CLI后端依赖预检；Office选区原格式修改仍是主线。不是全Python SDK/OS沙箱/全部CLI-Anything后端集成。详见docs/SKILL_RUNTIME.md。

# 2026-10-26 · 0.34.0 标注问题修复


- 智能体仅勾选已上传技能；对话执行前通过真实 skill_read 载入已绑定技能并记录审计，重复读取复用同次会话结果。原有手工技能兼容保存。
- MCP 空白必填项不再阻止关闭，保存仍校验；统一认证选择框、预置目录筛选、文档卡片与主按钮可读性。
- 同次任务真实成功的文档修改收据可推进附件版本，外部修改或移除仍中止；修正重复扩展名展示。
- Excel 无图片的形状绘图不再强求图片关系部件；缺失图片关系时明确警告并显示单元格，不伪造图片、不改原件。其他安全和限额仍拒绝。
- JSON/SSE 长度中断保留收到的文字，默认旧配置输出预算8192；显式模型预算保持。仅无未完成工具调用的部分文字提供手动继续，作为新请求关闭工具，绝不自动重放操作。旧版部分文字错误也可恢复。


详情与验收边界：[标注问题修复](../archive/dev-notes/FEEDBACK_FIXES.md)。下一步继续Office选区与AI修改、Mac原生验收。发布字段为构建时快照，最终结果见Release。

# 0.33.0优先差距

已实现导入Word单段文字/整表选区附加、源坐标核验和范围限制补丁；Excel文字替换直接保留原包部件。仍缺任意Office同格式分页保真/跨段与图片选区、Excel/PPT所见即所得编辑、后台浏览器无抢焦点及定时任务完整运行历史。跨Web完整核心/OAuth/stdio/自主子任务组保持待办。详见OFFICE_SELECTION.md。

## 2026-10-26 · 0.32.0 预置技能与MCP库

按用户“skill太少”与截图落实12项技能（4公开MIT/8独立内置工作流）和8官方远程MCP模板；真实添加/重复去重/停用不复活/绑定/密钥配置/发现/模型循环，不是假工具按钮或固定答复。目录离线，添加不联网不执行；主机id白名单、包及资源SHA检查，上传与旧数据不覆盖。模板显示待配置/未测试，不把密钥保存或目录当已联网。MCP原生批准、Bearer安全存储与逐业务审批不变。UI支持用途分类、搜索和来源。用户私人上传包不收入公开发布。

338核心（新增8）、8真实Chromium相关回归、10打包通过；真实公网Microsoft Learn/DeepWiki各3工具发现，其余仅公开官方文档验证。生产UI→真实技能ZIP→秘密适配夹具→实际本机HTTP发现→智能体绑定→三轮模型skill_read/MCP→磁盘重载通过。native IPC/选择器/审批/Keychain/模型语义仍夹具，无Mac/付费服务结论。119生产文件ASAR逐字节相同；官方Electron42arm64 SHASUM/15MachO51216页/282应用+5配套/14链接/零残留/篡改负例/CRC/installer通过。122旧Web/Python SHA不变，旧35Python未改未重跑；无新生产依赖。

修复Skill上传误用文档4MiB读限制，独立32MiB输入/单4MiB/展开16MiB/256文件，正文12000与库16MiB保留。实际两个用户包可解析，CAD本地清单冲突、Dashi展开过大、微信正文过长仍拒绝，详见docs/PRESET_CAPABILITIES.md；原件不改、不执行、不公开。前期测试夹具codec/文件数/静态路径错误已修正；一次空Python发现未算通过，正确目录10项通过。

基线权威0.31/v34，558内容SHA核验；0.31已PR4合并main a52a7dc3c1979c24ce20d8d5db479a0949b71b37并发布。0.32包内是发布前快照，持续授权版本分支/PR/main/Release，完成结果看Release，不修改旧附件。README只产品用法。保留logo白蓝/旧身份/两任务/项目服务/Office/知识/浏览器站点许可。ad-hoc未公证，无Mac严格资源密封/Gatekeeper/启动。REA沿旧公开包静态证据，无新Amazon运行结论。跨Web核心/OAuth/stdio/自主子任务组/全Office保真仍差距。

下一轮先Mac预置绑定/真实密钥/MCP与安装验收；缺机器优先大型技能资源与长正文有界读取、ZIP兼容/技能脚本受控执行链，仍不自动放宽审批或静默运行。见docs/PRESET_CAPABILITIES.md、validation/v0.32.0.json/tests/public-mcp。

## 2026-10-26 · 0.31.0 项目开发服务与失败恢复

从权威0.30/v33重新取得550内容文件并核验。0.30已通过PR #3合并main 24c712072499af12fd1621d6af675d7816bbc534并公开v0.30.0-preview；每轮分支/PR/main/Release持续授权有效，不套用旧未授权记录。并发检查后上传，不强推，不用GitHub插件或聊天密码。

实际新增主机绑定服务策略、64KiB尾部输出、30分钟服务租期、单服务/共享双名额公平调度、预计到期/日志/停止、固定环境故障诊断；纯代码项目视图从app提取。只允许项目启动入口，普通命令仍5分钟/1MiB，不接受渲染层伪造服务策略。源码/授权目录精确绑定、逐次确认、磁盘故障不放行、重启不自动重放；服务必须从项目页重新批准启动。不是OS隔离或业务就绪承诺。详见docs/PROJECT_SERVICES.md。

330核心（新增11）/9真实Chromium相关回归/10打包通过；真实npm/Node HTTP服务>1.1MiB日志仍响应、刷新/停止、真实缺包/端口冲突、拒绝/存储失败/篡改策略/源码变化/重启边界。未作30分钟墙钟或Mac/付费模型验收。首UI全回归8/9，旧CLI测试仍点击已移入＋菜单的旧入口，修正交互后完整9/9；开发中变量闭包错误由测试拦截后修复，最终330/330。114生产文件与ASAR逐字节相同；官方Electron42arm64 SHASUM/15MachO51216页/282应用+5配套/14链接/零残留/篡改负例/ZIP CRC/installer语法通过。122原Web/Python保护文件SHA不变，旧35Python执行器未改未重跑，无新生产依赖。

ad-hoc未公证，无Mac严格资源密封/Gatekeeper/启动/Keychain。保留旧身份、logo白蓝、图片/Office/HTML/知识/MCP/浏览器站点许可和双任务。REA复用既有部分静态证据，官方Quick system-tools/desktop-security与Node child_process公开文档于2026-10-26复查，无新Amazon原生运行结论。跨Web核心/OAuth/stdio/自主子任务组/全Office保真仍差距。本包字段为发布前时点，以最终Release说明为准，不改旧附件。

下一轮先Mac实际图片/项目/审批与严格签名安装；缺机器继续代码来源问答/有界PDF与Office成果。测试证据docs/validation/v0.31.0.json及-tests.txt。

## 2026-10-26 · 0.30.0 图片可用性与代码项目运行

从权威0.29.0/v32重新取回并核验540内容文件。前次未保存的0.30工作区在环境清理后丢失，本轮重新实现并重测，不复用丢失候选测试结果。0.29已通过PR #2合并main aea62a8c03939500dfa03173f87cfc3f32a702c7并公开v0.29.0-preview，旧未合并说明仅是历史记录。用户持续授权每轮验证后版本分支→PR→main→源码/arm64 Release，保留并发保护，不用GitHub插件/聊天密码。

图片：PNG/JPEG输入32MiB、64百万像素、32768边；在主进程nativeImage解码后按比例完整缩放，4096边/16百万像素、PNG4MiB以内，按字节预算最多12次缩放，不裁剪。原件不改，元数据经PNG重编码。持久100张/128MiB，单轮8张；普通state无像素。输入框真实本机Blob缩略图，移除/切任务释放；仅勾选本轮视觉发送才发image_url，无文字时自动提问；失败恢复文字/图片供手动重试，不自动重发或换模型。不是HEIC/WebP/GIF、EXIF方向全兼容或真实视觉语义验收。修复主按钮蓝底文字对比。

代码：复用ZIP路径/CRC/规范化/类型/体积预检，独立完整项目文件与二进制资源复制到私有host目录，不依赖32份问答摘要。识别唯一package.json或Python根；拒绝多个根/node_modules/.git/.venv。npm优先ci（有lock）或install，均ignore-scripts；实际dev/start/build/test脚本按用户选择运行。Python显式venv→requirements→main.py/app.py/server.py。导入不执行不联网；＋代码项目入口显示文件清单/实际命令/包内脚本。授权目录与每命令原生批准，复用持久CLI队列/审计/停止/重启不重放；受理前及批准后再核验源码SHA/路径链接。源码改变须重新导入。新增schema1 codeProjects元数据/私有目录；不改旧身份/数据/原Web/Python。无新生产依赖。

运行不是OS沙箱，也不是任意项目自动云部署。npm/完整Node工具链和Python为可选本机外部工具，未捆绑安装器；缺失明确报错。每命令最长5分钟/输出1MiB，未提供长驻进程守护、端口代理、容器、Docker、系统包、密钥环境编辑、monorepo选择或pnpm/yarn/Poetry。10项目，ZIP32MiB/2000条目/单文件4MiB/展开16MiB；无项目删除UI，私有副本由本机保留。已有问答仍32正文/10万字符，不声称模型已理解全部项目。安装ignore-scripts不是安全隔离，显式启动脚本和Python构建仍可执行代码。

319核心（新增9）、7真实Chromium、10打包测试通过。新增实际npm无依赖安装/Node执行、Python真实venv/pip空依赖/入口、源码变更/链接/磁盘失败/拒绝/取消。生产UI→真实ZIP/service→npm→Node HTTP服务→实际health响应→日志/停止/刷新；原生选择器/IPC/审批为夹具。实际600万像素PNG浏览器解码/缩略图/文本+图片HTTP载荷/无文字图片提问/HTTP失败草稿恢复通过；nativeImage缩放是注入适配器测试，不是Mac原生运行。完整旧ZIP/多模型/SSE/工作区回归通过。新UI项目首测发现受理后未刷新state，已真实修复；图片仅调整完整提示词前缀断言。

111生产文件与最终ASAR逐字节相同；官方Electron42arm64 SHASUM、282应用+5配套/14链接/15MachO/51216页/零残留/篡改负例/CRC与installer语法通过。122原Web/Python保护文件SHA不变；旧35Python执行器未改未重跑。ad-hoc未公证，无Mac严格资源密封/Gatekeeper/安装启动/Keychain或真实付费模型验收，不去隔离或关保护。REA复用已有部分静态证据，复查官方Quick桌面文档与Electron nativeImage，未新增Amazon运行结论。

下一轮：Mac先图片原生解码/ZIP项目实际依赖与启动/严格签名安装；缺机器继续项目长驻服务管理/受控环境与失败诊断、代码来源问答，再PDF/Office兼容。跨Web完整核心/OAuth/stdio/自主子任务组仍差距。详见docs/IMAGES_AND_CODE_PROJECTS.md、validation/v0.30.0.json/-tests.txt。本包构建时0.30 GitHub发布待执行，以最终Release为准，不修改已发旧版附件。

## 0.29.0 · 输入区层级

根据用户提供的Quick/WorkBuddy截图，实际收敛常驻控件并保留菜单内的真实功能与授权。仅UX参考，不复制代码/资产；复用旧REA静态证据，无新第三方原生运行结论。Mac/真实模型、跨Web核心、自主子任务、OAuth/stdio与全Office保真继续待完成。

## 0.28.0 ZIP与模型策略

已实现ZIP有界逐文件正文与按配置的多模型选择/真实思考参数；未验证真实供应商/Mac。RAR/7z/PDF/OCR、语义索引、OAuth/stdio、跨Web完整核心/自主子任务组与全Office保真仍差距。

## 0.27.0 对话文档附件增量

已支持本机选择的Office/文本副本经真实字节提取后直接对话问答，工具关闭可用；不等于PDF/OCR/视频理解，附件正文长文检索/逐句来源、OAuth/stdio/跨Web核心与Mac真机仍待完善。复用REA部分静态证据，无新增Amazon运行推断。

## 0.26.0 · 2026-10-25

已增加本机持久词法倒排索引、逐次批准后跨重载复用、来源更新和损坏重建、候选原文精确验证与清除控制；不是Quick跨端索引/云知识图谱、向量检索或全目录监听。继续缺OAuth/stdio、完整跨Web业务核心、自主子任务组、Mac原生/稳定签名公证/真实付费模型与Office全保真。REA复用既有部分公开包静态证据。见PERSISTENT_KNOWLEDGE_INDEX.md。

## 0.25.0 · 2026-10-25

实际增加全局MCP连接器的手动Bearer认证、系统加密适配、元数据投影及精确目标/令牌变更/错误边界；不是OAuth登录/自动刷新或所有商业MCP可用。仍缺OAuth/PKCE、安全回调、stdio、持久语义索引、跨Web完整核心、自主子任务组、Mac原生/稳定签名公证/实际账户及Office完整保真。REA复用旧公开包静态证据，无新增Amazon运行结论。见MCP_AUTHENTICATION.md。

## 0.24.0 · 2026-10-24

新增真实检索原文快照卡片与版本漂移提示，已完成来源证据的本地交互，不是全局引用图谱或逐句事实核验。仍缺认证MCP/OAuth/stdio、持久语义索引、跨Web共享核心、自主子任务组及Mac原生/公证/实际付费模型/全Office保真。REA继续复用既有公开包静态证据，无新Amazon运行结论。见KNOWLEDGE_EVIDENCE.md。

## 0.23.0 · 2026-10-24

跨智能体绑定文档的词法分块检索与有版本/哈希/行号来源已实际接入ReAct；每份需读取审批，来源变化整次失效，JSON预算完整。仍不是Quick云端知识图谱/跨端索引，也不是AgentScope向量RAG。MCP认证/OAuth/stdio、受控技能脚本、自主子任务组、跨Web共享核心、Mac原生/公证/实际付费模型/全Office保真继续未完成。见KNOWLEDGE_RETRIEVAL.md。0.22已公开合并main；0.23本轮尚未公开。

## 0.22.0 · 2026-10-24

真实技能上传/资源库、MCP全局连接管理与工具发现测试、智能体ID绑定和ReAct已接通；没有复制第三方市场目录或虚构在线状态。仍缺认证/OAuth/stdio、技能脚本受控执行/完整资源编辑与导出、语义知识索引、跨Web共享业务核心和自主子任务组；Mac/真实账户模型/公证/全Office保真待验收。参见SKILLS_AND_CONNECTORS.md。REA复用合法公开包既有静态证据，无新增Amazon原生运行或内部实现结论。

## 0.21.0 · 2026-10-24

智能体能力组合现有真实执行：提示词 + 绑定知识 + 按需Markdown技能 + 内置工具白名单 + Streamable HTTP MCP + 标准tool_calls ReAct循环；真实HTTP夹具验证四轮执行和验收。仍缺向量索引/OCR/认证MCP/stdio/完整技能包、跨Web业务核心与自主并行任务组。HTML交互预览与本机图片附件补真实用户链路，不代表所有HTML后台或所有视觉模型已工作。Mac/原生审批/公证与全Office保真待验收。AgentScope参考与边界见AGENT_CAPABILITIES.md；REA复用已有合法公开包静态证据，本轮无新Amazon原生运行结论。

## 0.20.0 接续 · 对话富媒体

已实现图片/视频直链点击加载、网页链接卡片、有限数据图表，内置离线渲染器；不是视觉模型、本地附件上传或全Office图表。真实Chromium/夹具媒体通过，Mac/真实模型/远端服务待验收。跨Web核心、MCP、自主并行组仍未完成。详见CHAT_RICH_MEDIA.md。

## 2026-10-24 · 0.19.0 Excel图片按锚点预览

0.19.0：Excel预览图片按单格/双格/绝对锚点定位，跟随对应工作表与可见网格；不再把整个工作簿图片堆在表尾。保持离线内置，无需另装软件。184核心/12真实Chromium/9打包；真实XLSX图片坐标+decode+独立openpyxl，Linux原生Electron源码/ASAR验证与旧生命周期回归。Mac/付费模型/完整Office保真未验收。见SPREADSHEET_IMAGES.md及validation/v0.19.0.json。下一轮Mac反馈与图表/主题/模板质量；MCP/跨Web核心/自主子任务组仍有差距；不建PR/合并main。

## 2026-10-23 · 0.18.0 预览不随状态刷新重建

0.18.0：同一Office文档版本的预览在后台刷新/侧栏调整时保持连接，不重新读文件/解析，保留Excel工作表选择和滚动；关闭、换文档或版本后释放重载。无需新增软件。177核心/12真实Chromium/9打包测试；Linux真实Electron源码与ASAR各三种文件20次绘制额外读取=0。Mac/付费模型/Office全保真未验收。详见PREVIEW_LIFECYCLE.md及validation/v0.18.0.json。下一轮Mac链路与图片锚点/表格分页质量；保留旧系统/身份/logo/双任务/授权，不增加依赖，不建PR/合并main。

## 2026-10-23 · 0.17.0 修复本地Office预览超时

真实Electron42/Linux复现旧file路径未握手，修复为固定两资源应用内协议，保持CSP/Node/IPC边界；新增阶段超时/手动重载，About版本跟随应用。生产HTML+preload+真实IPC+真实Office文件在源码与ASAR通过，子帧正文/ready/无原生桥验证。173核心/12 Chromium/9打包通过；Mac/付费模型/Office显示/公证未验收。详见docs/PREVIEW_TIMEOUT_FIX.md及validation/v0.17.0.json。缓存/图片定位因最新超时反馈优先处理未交付，不列完成项。下一步用户Mac验收、独立预览生命周期与图表图片质量，保留原Web/Python、身份、白蓝logo/并发/审批。

## 2026-10-23 · 0.16.0 内置 Office 预览

完成：真实二进制预览服务、隔离帧、Word页面/多表Excel/PPT静态渲染、离线依赖与许可证、移除外部GenOffice UI。详见docs/OFFICE_PREVIEW.md与validation/v0.16.0.json。保留原Web/Python/身份/logo/并发/审批。下一步：Mac原生安装/预览/审批验收，复杂图表/图片定位/字体/分页质量，预览独立生命周期。未实现全Office保真或完整GenOffice嵌入。

# 0.15.0 · 2026-10-23

新增有界Word简单正文段落增删，主进程保留其他部件，审批/指纹/版本与回滚完整。Quick官方段落/节/表格管理方向仍有差距：本次不能重排章节或增删表格行列，复杂结构与继承样式段落保护，无分页保真/修订协作。现有双任务与Excel基础七函数保留。无新增Amazon二进制运行证据，见WORD_PARAGRAPHS.md与REA_FINDINGS.md。

# 0.14.0 表格公式增量 · 2026-10-23

参考 [Quick 官方创作说明](https://docs.aws.amazon.com/quick/latest/userguide/document-and-visual-creation.html)，本轮增加七函数/跨表A1计算、编辑预览和真实XLSX缓存重算；与完整Office工作流仍有明显差距：无完整函数兼容、图表/透视表编辑、分页/任意文档保真、修订协作或自主并行子任务组。2项独立模型任务并发保持。没有新Amazon安装包/原生运行结论，复用REA既有证据。没有Mac设备时不将适配器测试当原生验证。下一轮优先Mac安装/审批/真实模型Office验收，其次结构编辑与公式/模板质量。

2026-10-22 复查官方文档 https://docs.aws.amazon.com/quick/latest/userguide/document-and-visual-creation.html ：Quick描述上传文档后编辑内容/格式/结构并预览下载。QuanK本轮只落实有界Word片段编辑，结构增删、完整保真/图片编辑、Excel公式与图表、PPT画布仍有差距。REA复用既有哈希/部分静态证据，没有新增Amazon二进制运行结论。

# 0.13.0 导入Word增量 · 2026-10-22

实际新增导入DOCX片段文字/粗体/斜体编辑，正文、表格文字、页眉页脚的简单段落支持；其他格式和未改ZIP部件保留并核对SHA。复杂段落只读、版本/片段指纹门禁、模型read→document_patch、原件保留与新版本真实导出。见IMPORTED_WORD_EDITING.md和validation/v0.13.0.json。新模块为QuanK自己的受限OOXML补丁，既有GenOffice子引擎继续保留；不是完整上游编辑器或任意Word保真往返。136核心/9真实Chromium/7打包测试通过；原生IPC/审批/模型内容夹具，无Mac或付费模型/Office显示验收。

下一轮有Mac先安装严格签名/启动/审批/实际模型Word链路；缺目标机则推进受限段落/表格结构增删及电子表格公式引擎。不要持续只加队列或说明。原Web/Python、白蓝logo、加密身份、双任务/浏览器授权保持，不PR/不合并main。

# 0.12.0 文档引擎增量 · 2026-10-22

已内嵌GenOffice HTML→DOCX子引擎，Markdown/HTML真实转Word，内部写作画布并可保存/修改新版本。仍缺任意导入DOCX的保真往返、分页/图片/修订、Excel计算与图表、PPT画布、自动并行子任务组及Mac真机验收。独立模块来源/许可/测试见GENOFFICE_ENGINE.md；不是已实现Quick全套Office能力。复用已有Quick公开文档与REA证据，本轮官方system-tools-desktop页面读取失败，未补造最新AWS文档或原生二进制结论。

# 0.11.0 文档主线更新 · 2026-10-22

已实现：真实生成文件→可信卡片→下载原格式；段落/常量单元格/Markdown和HTML原文直接编辑；可选GenOffice外部副本接续与校验收回。仍缺：内嵌Word/PPT保真布局、Excel公式计算/图表、完整结构编辑、图片/复杂模板、用户真实模型及Mac原生验收。不是只靠自然语言收据就算完成Office交付。GenOffice具体依赖/许可证/集成边界见GENOFFICE_DESKTOP.md。本轮复用既有Quick公开文档与REA证据，未新增Amazon应用原生运行结论。

# 0.10.1 授权体验更新 · 2026-10-22

按用户截图修复document_create长JSON原生sheet超出屏幕、取消信号未传入dialog导致队列等待的问题。文档确认用摘要；浏览器可显式选择本任务/本站点授权，不逐步弹窗，新站点/新任务重新确认；撤销、任务结束和退出清理许可。增加60秒超时、菜单⌘⇧Esc紧急取消、拒绝无父窗口/过长消息及迟到允许，导航前后校验防止站点授权泄漏。完整边界见docs/APPROVAL_FIX.md（从docs阅读为APPROVAL_FIX.md）。

105项核心、6项真实Chromium回归；原生弹窗为适配器夹具，Mac真机/严格签名/启动仍未验收。继续保留0.10.0文档、双任务能力及原Web/Python/白蓝logo/加密身份。下一步优先用户Mac弹窗/浏览器/文档链路验证，继而Office保真预览和结构编辑；不回退纯壳、不创建PR/合并main。

# 0.10.0 更新 · 2026-10-22

本轮按用户最新要求将桌面 Office 文档与多任务体验列为主线，交付真正的 DOCX/XLSX/PPTX 编解码、md/html 原文编辑、原件导入、模型 create/read/edit 工具、逐次原生审批、版本冲突保护、5个历史版本与导出回读核验。文档内容在本地保存，模型读取需批准。Office 仅提取文本预览；不是保真页面编辑器。

修复了前端全局 pending 禁止新建/切换任务的实际阻塞。可以同时发起两项模型对话，第三项排队，切换任务保留草稿和工作区，单独停止不影响另一项。现有容量2与CLI共享，CLI依然独立FIFO。没有实现模型自动拆解并行子任务组、后台进程跨重启续跑或关闭应用继续运行。

2026-10-22 复查官方公开文档：Quick 支持会话生成/编辑 Word、Excel、PowerPoint、PDF 与预览下载，也描述有进度的并行后台子任务。来源：
- https://docs.aws.amazon.com/quick/latest/userguide/document-and-visual-creation.html
- https://docs.aws.amazon.com/quick/latest/userguide/system-tools-desktop.html

差距：复杂版式/品牌模板、图片图表、Excel公式计算/透视/条件格式、修订批注、PDF导出、Office原生/兼容引擎保真渲染和真实模型/Apple芯片验收。宏、嵌入对象、外部关系链接拒绝导入；含公式工作簿不允许更新，以免留下过期缓存。Web/Python原有更深入的文档能力仍保留，桌面尚未共用该完整业务核心。

下一轮优先扩展保真预览与有边界的文档结构修改/公式计算，而不是持续只加队列界面；有Mac环境先补签名/启动/原生审批和Office工具链。REA复用已有静态证据，没有新增Quick原生运行结论。

# 0.9.0 更新 · 2026-10-22

对话与每日任务共享持久队列、取消、状态事件、定时发生去重；CLI仍独立FIFO并共用2个执行名额，不是三者统一或原Web Runtime统一。真实Chromium→服务→HTTP模型夹具验收了排队/刷新/停止；真实模型与Mac原生仍缺。下一步重点桌面MCP、授权文件写入/索引、Office真实成果，以及跨队列公平与统一事件，避免只扩展界面。

复查官方系统工具文档的Task management/进度与工具权限描述，继续保留逐次审批；不推断Quick内部调度实现。来源：https://docs.aws.amazon.com/quick/latest/userguide/system-tools-desktop.html 。REA复用已有证据，未运行官方应用。

# 0.8.0 更新 · 2026-10-21

手动CLI已接通持久队列、共享并发名额、受理ID去重、刷新后停止、输出检查点、重启暂停/中断和明确重新审批重试。状态事件具备v1契约与每任务单调序号，但还不是跨端事件总线；模型轮次/每日任务未接入该队列，不声称完成全部持久Agent Runtime。新增真实Chromium→服务→Node验收，原生审批仍夹具。

当日复查官方system-tools-desktop及desktop-interface文档：Quick描述后台子任务/进度和Mission Control，QuanK当前只实现上述受限CLI队列；仍缺跨端业务核心、本地MCP、文件写入/索引、Office真实成果、OAuth与原生Mac验收。逐次审批保持，不跟随Quick默认Always Allow权限。来源：https://docs.aws.amazon.com/quick/latest/userguide/system-tools-desktop.html 、https://docs.aws.amazon.com/quick/latest/userguide/desktop-interface.html 。REA已有静态证据复用，没有新增Amazon运行结论。

0.7.0 输出体验：SSE 首段提前可见、增量事件和取消保留、完整 GFM 与静态 CSS HTML 预览通过真实浏览器验收；真实模型/Mac、交互 HTML、Office/队列/MCP 仍存在差距。

0.6.1 架构进展：无 Electron 的 conversation/tasks/workspace/recovery 服务已拆出，IPC/审批为独立适配器，Markdown/任务视图为纯函数。Web/桌面尚未统一业务核心；持久队列/MCP/Office/原生签名仍待完成。详见 ARCHITECTURE.md。

# Quick 对齐状态 · 桌面 0.6.0

本表用于下一轮接续，不能把测试夹具通过当作 Mac 真机验收。

| 能力 | 当前实现 | 主要差距 / 下一步 |
| --- | --- | --- |
| 任务与成果交互 | 任务筛选、逐轮真实执行过程、右侧文本成果多页签、Markdown、导出/继续修改、@ 资料、/ 智能体 | Mac 原生/真实模型端到端；Office/图片成果；持久页签/草稿与多任务交互 |
| 模型工具执行 | 标准 tools/tool_calls、多轮循环、逐次审批、真实工具结果回传 | 工具 schema 更细粒度校验、流式事件、统一 Web Runtime |
| 浏览器 | 内置隔离窗口、正文、快照引用定位/点击/填写；Headless Shell/CDP 隔离世界和可信输入测试通过 | 原生 Electron/Mac 尚未验收；iframe、Shadow DOM、截图、业务验收、持久登录 |
| CLI | 程序查找、argv、授权 cwd、真实 stdout/stderr/exitCode、取消/超时/输出上限 | Mac 实机及 Codex 等第三方 CLI；Windows cmd 适配；PTY/交互终端 |
| 权限与审计 | 可信本地页面 IPC、原生逐次确认、解析路径预览、二次核验、执行日志 | 浏览器单次目标凭证已实现；持久化审批、OS 隔离与更细工具策略 |
| 调度 | 应用运行时的每日模型文本任务，重启中断不自动重放 | 持久化任务队列、幂等、恢复与带审批的工具任务 |
| 文件/知识 | 授权目录、文本预览和附件、受限文件名搜索 | 写入工具、有证据索引、全文/语义检索、OCR、文件夹监控 |
| 记忆/智能体 | 手动偏好、自定义角色 | 结构化上下文、技能发现与版本化 |
| Office | 原 Web 和 Python 执行器保留 | 与桌面工具闭环及成果验收统一 |
| MCP/连接器 | 原 Web MCP/REST 保留 | 桌面本地 MCP、工具注册与 OAuth |
| 产品分层 | 已分离 Agent、ToolRuntime、Command、Browser 模块 | Web/桌面业务服务与数据模型仍未统一 |
| 交付 | 完整源码 ZIP、逐文件 SHA-256、arm64 离线应用、原 logo | Developer ID、公证及安装包真机验证 |

第一优先级：把本轮浏览器/CLI 功能在 Mac 真机打开、执行与失败恢复路径验收；推进持久化执行/中断恢复与更完整的浏览器交互，不以增加卡片数量替代功能。

实现参考 API：
- https://www.electronjs.org/docs/latest/api/browser-window
- https://www.electronjs.org/docs/latest/api/shell
- https://nodejs.org/api/child_process.html

REA 静态分析事实及限制仍见 REA_FINDINGS.md（0.3.0 基线记录），本轮没有重新声称解析官方完整应用或复制其实现。

2026-10-20 对照官方系统工具文档：Quick 的 Browser Automation 包括导航、交互、表单、截图和提取。当前仅覆盖顶层 DOM 子集，不能据此推断同等兼容性。官方来源：https://docs.aws.amazon.com/quick/latest/userguide/system-tools-desktop.html 。本轮复用 REA 基线证据，未取得新的原生执行结论。


0.28.1：修复附件按钮/模型行布局与ZIP读取上限；复用已有REA部分静态证据，无新增Amazon运行结论。Mac原生安装/审批/Keychain、真实模型、OAuth/stdio、跨Web核心、自主子任务与Office全保真仍有差距。


2026-11-05 · 0.37.23 候选：模型调用轮数 1–96 可在模型配置中设置，保留旧智能体默认；添加模型保存错误可见并返回列表。完整回归因离线依赖 jsdom 缺失未通过，真实 Mac/付费模型和新版离线包未验收；详情 docs/archive/dev-notes/MODEL_ROUNDS_03723.md。下轮先恢复依赖后执行完整回归及 UI，核对并完成 0.37.22/后续 GitHub 发布。

2026-11-05 · 0.37.24 候选：旧模型设置暂存、失败回滚与串行保存；模型/智能体/CLI 44 项、打包边界 26 项通过。缺 jsdom，完整 UI 和完整回归未完成，无本版 arm64 构建/正式发布；见 docs/archive/dev-notes/MODEL_SETTINGS_TRANSACTION_03724.md。

2026-11-05 · 0.37.25 候选：增加 Office 文件通过原生保存对话框导出 PDF，真实 Linux LibreOffice PPTX 导出及取消/版本/SHA 边界验证；46 定向、26 打包测试通过。UI/完整回归和 Mac 构建未完成；见 docs/archive/dev-notes/OFFICE_PDF_EXPORT_03725.md。下一轮推进文档直接编辑及完整回归、签名构建和 GitHub 发布。

2026-11-05 · 0.37.26 候选：工作区 PDF 导出及最终发布前版本检查，拒绝无 EOF 截断 PDF；47 定向和 26 打包测试通过。完整回归/UI/Mac/离线构建未完成，见 docs/archive/dev-notes/OFFICE_PDF_EXPORT_GUARDS_03726.md。下一轮优先文档内选择与编辑、完整回归和已授权 GitHub 发布。

## 2026-11-06 综合办公开发中

Word行内图片引用与尺寸、Excel选区外数据和公式保护及手动矩阵写入已有受限实现，但并不覆盖浮动图片、裁剪、图表、复杂样式或完整生产界面。Quick公开桌面文档描述其授权目录、本机浏览器和本机工具能力；QuanK跨Web共享核心、云端记忆/知识图谱、完整浏览器自动化及自主多任务仍有差距。参考 https://docs.aws.amazon.com/quick/latest/userguide/amazon-quick-desktop.html 与 https://docs.aws.amazon.com/quick/latest/userguide/what-is-desktop.html ，未新增对Amazon客户端实际运行结论。离线测试依赖不齐、真实Mac和模型未验，详见 OFFICE_COMPREHENSIVE_WORK_IN_PROGRESS.md；本检查点不是发布版。

## 2026-11-06 综合办公稳定性

新增有限Office编辑与恢复仍不是完整办公替代：30分钟Linux Kit回归153轮出现5轮测试失败（其中一轮确认测试误判、两轮Excel诊断被遮挡、两轮PPT未得到文字选区），真实Mac/IME及复杂格式未验，完整前端回归缺依赖。详细失败与数据见 OFFICE_COMPREHENSIVE_WORK_IN_PROGRESS.md 和 validation/office-stress-30min.jsonl；Quick跨端核心、记忆/知识图谱、连接器和自主任务能力仍有差距。

2026-11-11：Excel 编辑新增图片旋转和翻转的保守输出校验，仍不证明复杂图片效果、真实 Mac 图片保真或完整 Office 兼容；跨 Web 核心、OAuth 和自主并行组仍有差距。

2026-11-11 PPT 页面引用歧义现保守拒绝，仍不支持全部 Office 复杂对象与任意文件的保真编辑，未完成真实 Mac 和模型验收。

2026-11-11 Office 窗口异步写入与对话完成时保留期间输入的新草稿；不同窗口/重启草稿恢复、真实 Mac 输入法和完整多任务办公体验仍待验收。

2026-11-12 检查点：Office 子进程输入管道故障可拒绝请求；复杂文档保真、真实 Mac/IME 验收及与 Quick 完整能力差距仍未解决。

2026-11-13 Office关闭与编辑进入同一会话队列；复杂Office格式、跨Web核心、自主任务与真实Mac/IME验收仍有差距。

2026-11-13 原模型配置的轮数输入显示当前继承值并可显式设置1–96；真实Mac Office启动与中文输入、复杂格式和自主任务仍未验收，不能称全面对齐。


0.37.29 候选：对话轮数耗尽前可保留有明确限制的阶段性总结；仍缺自动任务恢复、真实模型和 Mac 验收，不能将其视为完整自主执行。


0.37.30候选支持后台网页、有限的任务内文档读取许可、预览排队及可编辑条形图形；与Quick在全对话授权、复杂PPT、全保真Office、真实Mac浏览器自动化仍有差距。


0.37.31候选：Excel支持AI对当前选区设置/取消粗体斜体并验收；PPT可生成卡片及原生表格。复杂对象编辑、图表数据编辑、模板保真、Mac原生验收仍待完成。


0.37.32候选支持受限PPT对象图层、用户附加PNG和淡入切页；仍缺完整对象拖拽、对象级动画、复杂图表及模板保真和Mac实测。

0.37.56 检索证据增加已审批正文逐字核验与损坏元数据容错；尚无原PDF页高亮、内置Mac中文OCR/离线语义模型或真实Mac验收，Quick能力差距仍在。

0.37.57 支持显式重新选择并校验原PDF后通过系统应用打开；没有PDF内自动跳页、框选高亮、Mac OCR离线依赖和真实Mac验收。

0.37.58 可选择原PDF并显示首个有OCR坐标页的像素定位，尚无跨页切换、PDF原生坐标、Mac离线OCR组件与原生UI验收；未完成M4。

2026-11-14：多页 OCR 定位仅为本地渲染像素框，未证明识别正确；Mac OCR/PDF 组件、中文识别、本地语义模型和原生Office进程池验收仍缺。

2026-11-14 工作中：预览池发生销毁失败时停止接收任务；这不保证目标机器进程一定已被操作系统终止。真实Mac进程清理、Office复杂文档隔离及OCR依赖仍待验证。

2026-11-14：英文OCR WASM仅在开发环境真实测试，源包与离线应用均不包含尚待许可核对的WASM/训练数据；Mac、中文、PDF依赖和独立本地语义模型仍缺。

## 0.37.99 M4 内部检查点（2026-11-15）

从已核验0.37.98检查点和正式0.37.22/v60接续。PDF授权读取结束时核对打开的文件描述符与当前真实路径设备/inode/大小/时间戳，再次核对授权路径；路径被替换时拒绝。读取缓冲按初始文件大小加一字节分配，增长则拒绝，既有16MiB上限、SHA和后续授权校验保留。路径检查无法消除检查之后的竞态，也不保证抵御本地攻击者伪造元数据。

本地ONNX模型校验改为只读取已声明的固定字节范围，保持AbortSignal；读前后比较描述符状态，文件增长、同长度修改或读取不完整时不接受摘要。真实模型和Mac ARM依赖仍未打包，此改动不代表可用的离线模型。

实际改动：desktop/runtime/pdf-ocr.mjs、desktop/runtime/local-onnx-embedding.mjs、desktop/tests/pdf-stable-read-03798.test.mjs、desktop/tests/local-onnx-integrity-03799.test.mjs。相关测试124项，112通过、12因本机模型或实验OCR/PDFium资源缺失跳过、0失败；包括真实Linux文件替换与增长、取消、英文PDF OCR和本机HTTP模型夹具。50项Python打包测试通过；另真实Linux LibreOfficeKit两worker、两份合成文档30秒317轮核对无交叉，非Mac或复杂文档验收。原Web/Python保护目录与正式基线122文件一致。

完整回归未运行：锁文件离线安装缺zrender缓存。没有本版Apple安装包；当前环境未找到rcodesign及ASAR工具。未Mac真机、公证、真实付费模型或真实用户中文材料验收。原生审批与模型语义仍是夹具，实验OCR/PDFium资产未包含，第三方传递许可未完成，M4未完成。权威文件未覆盖。此前GitHub安全审查拒绝不绕过，本轮无GitHub上传或发布。

下一轮重新检查并发，优先恢复离线依赖和签名构建工具、核对OCR/PDFium传递许可、集成可合法分发的Apple ARM64本机模型并进行Mac验收，保留用户原数据。复查Amazon Quick官方桌面文档的文件上传、引用与后台任务说明；REA沿用已有静态证据，无新增Amazon原生运行结论。

## 0.37.100 M4 内部检查点（2026-11-15）

新增 image_ocr_import：已批准识别的当前任务图片生成一次性内存凭证，模型只能提交凭证与成果名称，不能提供正文。保存前须本任务同一图片和摘要仍有效，并额外批准；复用文档事务和提交前后守卫，取消、权限撤销或持久化失败不发布；任务结束清理，审计不记录OCR正文。成果是真实Markdown，包含图片名、SHA-256和识别准确性提示，保持原图，成功加入对话可信成果引用；可由用户显式绑定知识后查询。此版未提供图片原图坐标结构化引用，不能将文档引用当原图位置证据。智能体必须同时允许image_ocr、image_ocr_import、document_create；已有显式白名单不被自动扩大。

图片OCR输出新增完整JSON预算：保留所有识别正文，必要时移除位置框并标明截断；如果正文转义后仍超预算明确失败，不返回截断的JSON或半截正文。图片识别及保存审批若忽略取消信号，宿主不再等待迟到决定；底层原生弹窗能否关闭取决于适配器。

修改 desktop/runtime/tools.mjs、runtime/image-ocr.mjs、runtime/agent.mjs、services/agent-session.mjs、services/conversation.mjs、src/ui/agent-editor.js、src/app.js、tests/image-ocr-03737.test.mjs。最终相关Node测试91项：88通过、3因缺实验OCR资产跳过；真实Linux Tesseract英文图片、真实本机HTTP模型夹具、同run来源、跨任务、重复、并发、撤销、迟到、文档失败回滚、绑定检索和工具预算通过。另浏览器与CLI/流式/模型53项通过；原browser-runtime因缺jsdom无法启动（此前同组54项中53过1失败），没有真实浏览器验收。50项Python打包测试通过。原Web/Python保护目录122文件对照权威无变化。

本版无匹配Apple ARM应用；当前环境缺签名器和ASAR构建依赖。OCR/PDFium实验资产和真实本地语义模型不在源码或已保存的旧包；未Mac原生、中文实文档、真实付费模型或公证验收。原生审批为夹具，模型为HTTP夹具。完整回归未运行。正式基线未覆盖，GitHub安全审查拒绝未绕过，未PR/合并/发布。

下一轮重新搜索最新检查点与正式基线核对并发；完成OCR/PDFium传递许可、Apple ARM64构建工具和离线模型，推进真实Mac/复杂文档验收与结构化图片原图引用。AWS Quick官方桌面文档说明支持文件附件和引用，本轮对齐其中工作流的一部分；REA仅复用既有部分静态证据，未新增Amazon原生运行结论。

## 0.37.101 M4 图片 OCR 来源检查点（2026-11-15）

图片 OCR 经同任务批准导入后保留来源名称、SHA-256、图片尺寸和有界词框；知识命中与证据快照重新核对内容和坐标后显示来源、像素框及高亮。信息摘要用于损坏检测，不是防篡改签名；没有原图重开或画面叠加。原 PDF 路径保留。96 项相关测试 93 通过、3 项缺构建资产跳过；真实 Linux Tesseract，审批为夹具。另有 jsdom 缺失导致的测试未运行；未做 Mac 验收、未构建匹配 Apple 包，OCR/PDF 二进制与本机嵌入模型未包含。M4 未完成。下一轮优先离线依赖许可及 Mac 安装验证、原图定位和本机语义模型。

## 0.37.102 M4 图片来源定位检查点（2026-11-15）

图片 OCR 证据卡片增加主动查看：宿主按存档证据的任务、run、时间和摘要查找本机图片，校验PNG字节、SHA-256、尺寸及最多16个词框，再由界面在本机显示图片与蓝框。展示为导入时规范化图片，并非用户文件的原始字节；移除图片后明确失败，历史文字证据保留。无任意路径、无自动发送模型。来源摘要不是抵抗有本机写权限者的签名。原PDF证据流程保留。56项相关Node测试54通过2项缺构建资源跳过，含真实Linux Tesseract、导入/知识检索/证据/图片字节；原生审批为夹具，无真实浏览器/Mac验证。50项打包测试通过，原Web/Python 122文件与权威一致。无匹配Apple包，缺asar与rcodesign构建工具，离线OCR/PDFium资产及语义模型未分发；M4未完成。下一轮补离线依赖许可证与Apple构建工具、真实Mac和用户文档验证。

## 0.37.103 M4 流回调取消检查点（2026-11-15）

修复模型JSON或SSE输出的增量回调挂起时无法及时响应取消：回调前后复核取消，等待期间响应中止，不再处理后续片段，不自动重试。已进入的回调仍可能完成自身副作用，不能保证底层操作被杀死；持久层仍需自身守卫。28项流/真实HTTP模型夹具与故障测试通过，50项打包测试通过；包含回调失败/迟到、SSE和JSON取消、已有真实Node进程工具测试。全量回归未完成，缺jsdom导致已观察到测试失败，不能称全量通过。保持原Web/Python122文件不变；未Mac原生/付费模型验收，无匹配Apple安装包（构建环境缺asar及签名器），未完成离线OCR/PDFium资产与本地模型的许可和交付；M4未完成。下一轮补依赖与全量回归、离线模型及Mac验证。
