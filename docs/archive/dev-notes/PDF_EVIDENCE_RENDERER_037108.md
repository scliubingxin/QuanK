# PDF OCR来源预览渲染身份（0.37.108，内部检查点）

OCR工具与聊天PDF附件共用的识别结果携带渲染器名称；在同意后保存的Markdown来源记录将渲染器与每页输入图像SHA-256绑定到坐标摘要。检索快照携带对应信息，原PDF经用户选择并验证字节后，使用记录的渲染器重绘页面。只有页尺寸和PNG字节摘要均一致才返回图片与框；即使只是PNG编码不同，也会安全拒绝而不声称内容不同。无已记录渲染器的历史记录可打开原PDF但不可叠加旧坐标。既有OCR文字、来源页码和原件不被迁移或覆盖。

预览的原生选择、源文件读取、工具发现和页面图片读取即使忽略中止，也能结束等待，迟到结果被丢弃；不声称底层IO或系统对话框被强制关闭。若实际渲染子进程不响应自身取消，不能保证立即结束。摘要可检测偶然损坏，不是对恶意本机篡改的签名。

## 证据范围

- 本轮86项来源、OCR、PDF和取消定向测试：78通过，8项缺实验二进制或测试字体跳过；50项打包Python通过。真实Linux Poppler/Tesseract和本机HTTP模型夹具参与部分测试。PDFium预览分支仅通过注入适配器测试，没有本轮真实PDFium资产或Mac验收。
- 探索性完整Node回归734项，698通过、17失败、19跳过；失败为jsdom缺失，运行期间源码发生修改，因此不能当作最终完整回归。
- 公开Amazon Quick文档描述聊天附件与来源核对（https://docs.aws.amazon.com/quick/latest/userguide/working-with-chat-desktop.html）；复用既有REA部分静态证据，本轮未运行Amazon应用或复制其代码资产。
- 上游PDFium包装器当前主分支的第三方通知说明其覆盖8046d（https://github.com/hyzyla/pdfium/blob/main/THIRD_PARTY_NOTICES.md），本项目此前记录的固定载荷为8046；尚未证明二者相同，不能据此完成许可审计。Tesseract.js-core上游指出构建WASM含多个第三方许可且应保留通知（https://github.com/naptha/tesseract.js-core/issues/44）；具体固定二进制及其编译运行时通知仍待核验。本轮未分发相关二进制。
- 权威0.37.22/v60保持不变；本检查点M4未完成，没有匹配Apple应用。原生签名、公证、Mac、真实付费模型和复杂Office材料均未验收；GitHub先前安全审查拒绝提交，不绕过。
