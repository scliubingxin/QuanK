# 图片 OCR 来源预览

## 0.37.102 M4 图片来源定位检查点（2026-11-15）

图片 OCR 证据卡片增加主动查看：宿主按存档证据的任务、run、时间和摘要查找本机图片，校验PNG字节、SHA-256、尺寸及最多16个词框，再由界面在本机显示图片与蓝框。展示为导入时规范化图片，并非用户文件的原始字节；移除图片后明确失败，历史文字证据保留。无任意路径、无自动发送模型。来源摘要不是抵抗有本机写权限者的签名。原PDF证据流程保留。56项相关Node测试54通过2项缺构建资源跳过，含真实Linux Tesseract、导入/知识检索/证据/图片字节；原生审批为夹具，无真实浏览器/Mac验证。50项打包测试通过，原Web/Python 122文件与权威一致。无匹配Apple包，缺asar与rcodesign构建工具，离线OCR/PDFium资产及语义模型未分发；M4未完成。下一轮补离线依赖许可证与Apple构建工具、真实Mac和用户文档验证。

变更文件：desktop/services/image-ocr-evidence-preview.mjs、desktop/main.mjs、desktop/preload.cjs、desktop/src/app.js、desktop/src/ui/knowledge-evidence.js、desktop/tests/image-ocr-preview-037102.test.mjs、desktop/tests/image-ocr-03737.test.mjs。
