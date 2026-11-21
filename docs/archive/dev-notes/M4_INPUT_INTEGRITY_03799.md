
## 0.37.99 M4 内部检查点（2026-11-15）

从已核验0.37.98检查点和正式0.37.22/v60接续。PDF授权读取结束时核对打开的文件描述符与当前真实路径设备/inode/大小/时间戳，再次核对授权路径；路径被替换时拒绝。读取缓冲按初始文件大小加一字节分配，增长则拒绝，既有16MiB上限、SHA和后续授权校验保留。路径检查无法消除检查之后的竞态，也不保证抵御本地攻击者伪造元数据。

本地ONNX模型校验改为只读取已声明的固定字节范围，保持AbortSignal；读前后比较描述符状态，文件增长、同长度修改或读取不完整时不接受摘要。真实模型和Mac ARM依赖仍未打包，此改动不代表可用的离线模型。

实际改动：desktop/runtime/pdf-ocr.mjs、desktop/runtime/local-onnx-embedding.mjs、desktop/tests/pdf-stable-read-03798.test.mjs、desktop/tests/local-onnx-integrity-03799.test.mjs。相关测试124项，112通过、12因本机模型或实验OCR/PDFium资源缺失跳过、0失败；包括真实Linux文件替换与增长、取消、英文PDF OCR和本机HTTP模型夹具。50项Python打包测试通过；另真实Linux LibreOfficeKit两worker、两份合成文档30秒317轮核对无交叉，非Mac或复杂文档验收。原Web/Python保护目录与正式基线122文件一致。

完整回归未运行：锁文件离线安装缺zrender缓存。没有本版Apple安装包；当前环境未找到rcodesign及ASAR工具。未Mac真机、公证、真实付费模型或真实用户中文材料验收。原生审批与模型语义仍是夹具，实验OCR/PDFium资产未包含，第三方传递许可未完成，M4未完成。权威文件未覆盖。此前GitHub安全审查拒绝不绕过，本轮无GitHub上传或发布。

下一轮重新检查并发，优先恢复离线依赖和签名构建工具、核对OCR/PDFium传递许可、集成可合法分发的Apple ARM64本机模型并进行Mac验收，保留用户原数据。复查Amazon Quick官方桌面文档的文件上传、引用与后台任务说明；REA沿用已有静态证据，无新增Amazon原生运行结论。
