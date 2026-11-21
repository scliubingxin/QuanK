# 实验性 PDFium WASM 页面渲染

既有PDF OCR在找不到已内置Poppler时，只有固定PDFium资产存在才退回到实验性WASM子进程，缺失时明确失败。固定包 @hyzyla/pdfium 3.0.0，源码标签c60c75d08051454f0deadf093ffdb948aa179888，src/vendor/LAST_RELEASE 为8046，npm的pdfium.wasm与源码标签逐SHA一致。包装器MIT许可证已保留，PDFium本体及其传递依赖许可证和发布义务未完成，不公开分发候选二进制。

允许1–100页，单次1–5连续页；每页最长边1600px，面积最多256万像素，PNG最多4MiB，源PDF 16MiB；每一进程30秒，取消后丢弃结果，输出前核验页码与PNG。外部文件需既有授权和来源复核，进程仍与用户同账户，不是操作系统沙箱，WASM内存没有操作系统强制限制。禁网络fetch和PDF表单渲染，但不将其当完整恶意PDF隔离保证。

构建者显式传 --experimental-pdf-raster-assets 和 --experimental-ocr-assets，将已单独获取并SHA确认的资产装入签名前的私有ASAR；源码归档及默认应用构建均不包含二进制。Linux真实两页PDF渲染/OCR、密文/损坏/越界/撤权/取消边界已测；未Mac实测，不称Apple应用可用。

0.37.96：授权/来源异步复查不响应时也支持取消，迟到结果不能启动新子进程；底层读取可能继续。Linux官方Electron42直接读取0.37.95应用ASAR，实际合成中文PDF→PDFium渲染→Tesseract识别通过；并非Mac应用运行。
