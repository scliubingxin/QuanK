# 图片 OCR 知识证据检查点

## 0.37.101 M4 图片 OCR 来源检查点（2026-11-15）

图片 OCR 经同任务批准导入后保留来源名称、SHA-256、图片尺寸和有界词框；知识命中与证据快照重新核对内容和坐标后显示来源、像素框及高亮。信息摘要用于损坏检测，不是防篡改签名；没有原图重开或画面叠加。原 PDF 路径保留。96 项相关测试 93 通过、3 项缺构建资产跳过；真实 Linux Tesseract，审批为夹具。另有 jsdom 缺失导致的测试未运行；未做 Mac 验收、未构建匹配 Apple 包，OCR/PDF 二进制与本机嵌入模型未包含。M4 未完成。下一轮优先离线依赖许可及 Mac 安装验证、原图定位和本机语义模型。

代码：desktop/runtime/ocr-provenance.mjs、desktop/runtime/tools.mjs、desktop/services/agent-session.mjs、desktop/services/knowledge-evidence.mjs、desktop/src/ui/knowledge-evidence.js，以及对应测试。词框最多保留64个，展示最多16个；审计不新增识别正文。授权、文件变化及任务取消仍使用既有保护。
