
## 0.37.100 M4 内部检查点（2026-11-15）

新增 image_ocr_import：已批准识别的当前任务图片生成一次性内存凭证，模型只能提交凭证与成果名称，不能提供正文。保存前须本任务同一图片和摘要仍有效，并额外批准；复用文档事务和提交前后守卫，取消、权限撤销或持久化失败不发布；任务结束清理，审计不记录OCR正文。成果是真实Markdown，包含图片名、SHA-256和识别准确性提示，保持原图，成功加入对话可信成果引用；可由用户显式绑定知识后查询。此版未提供图片原图坐标结构化引用，不能将文档引用当原图位置证据。智能体必须同时允许image_ocr、image_ocr_import、document_create；已有显式白名单不被自动扩大。

图片OCR输出新增完整JSON预算：保留所有识别正文，必要时移除位置框并标明截断；如果正文转义后仍超预算明确失败，不返回截断的JSON或半截正文。图片识别及保存审批若忽略取消信号，宿主不再等待迟到决定；底层原生弹窗能否关闭取决于适配器。

修改 desktop/runtime/tools.mjs、runtime/image-ocr.mjs、runtime/agent.mjs、services/agent-session.mjs、services/conversation.mjs、src/ui/agent-editor.js、src/app.js、tests/image-ocr-03737.test.mjs。最终相关Node测试91项：88通过、3因缺实验OCR资产跳过；真实Linux Tesseract英文图片、真实本机HTTP模型夹具、同run来源、跨任务、重复、并发、撤销、迟到、文档失败回滚、绑定检索和工具预算通过。另浏览器与CLI/流式/模型53项通过；原browser-runtime因缺jsdom无法启动（此前同组54项中53过1失败），没有真实浏览器验收。50项Python打包测试通过。原Web/Python保护目录122文件对照权威无变化。

本版无匹配Apple ARM应用；当前环境缺签名器和ASAR构建依赖。OCR/PDFium实验资产和真实本地语义模型不在源码或已保存的旧包；未Mac原生、中文实文档、真实付费模型或公证验收。原生审批为夹具，模型为HTTP夹具。完整回归未运行。正式基线未覆盖，GitHub安全审查拒绝未绕过，未PR/合并/发布。

下一轮重新搜索最新检查点与正式基线核对并发；完成OCR/PDFium传递许可、Apple ARM64构建工具和离线模型，推进真实Mac/复杂文档验收与结构化图片原图引用。AWS Quick官方桌面文档说明支持文件附件和引用，本轮对齐其中工作流的一部分；REA仅复用既有部分静态证据，未新增Amazon原生运行结论。
