# PDF附件识别取消

## 0.37.105 PDF附件识别取消（内部检查点）

当PDF附件识别器或适配器不响应停止时，对话附件导入不再无限等待；取消后迟到的进度或识别结果被丢弃，不创建成果。识别结束后也不再接受迟到进度。底层识别器可能仍运行，不能声称停止子进程；既有逐次批准、来源复核与保存回滚保持。修改 desktop/services/pdf-chat-import.mjs 和 desktop/tests/pdf-chat-import-03747.test.mjs。目标回归70项：68通过、2项因离线OCR构建资产缺失跳过，包含真实Linux Poppler/Tesseract英文PDF、模型HTTP夹具、故障取消与授权；50项打包测试通过。真实Mac/中文OCR资产/付费模型未验收，完整Apple安装包未构建。探索性完整串行回归719项：683通过、17失败、19跳过；17项失败均报告缺jsdom。运行期间追加了一个测试并更新版本记录，因此该数字不是最终源码的完整回归通过证据。原Web/Python 122保护文件与权威0.37.22一致。M4未完成，下一轮继续离线OCR/PDFium和语义模型资源许可、Apple构建和真实Mac验收；先前GitHub安全审查拒绝不绕过。

官方桌面功能差距参考 https://docs.aws.amazon.com/quick/latest/userguide/working-with-chat-desktop.html ，REA继续复用已有静态证据；没有新的Amazon应用运行结论。
