# PDF与图片OCR工具取消保护

工具的授权目录PDF初次读取、后续来源校验、PDF OCR依赖发现，以及图片OCR依赖发现，现在遇到取消会立即结束等待；迟到结果不触发子进程或保存成果。底层文件读取或发现本身可能仍在运行；取消不能撤回已完成的外部操作。识别进程通过现有runCommand信号/超时停止。

相关49项回归、50项打包测试通过；模拟原生审批，Linux真实PDFium/Tesseract WASM，Mac未验。依赖二进制不在源码ZIP，实验包含二进制的候选需完成第三方许可核查。

最终本版完整串行778项：774通过、4项因本地ONNX开发模型/依赖缺失跳过；新增真实子进程取消及图片、PDF依赖发现迟到结果测试。默认Apple ARM64候选本地构建，ASAR 266文件逐SHA一致，278 Mach-O/93545页及ZIP闭合通过；上传准备失败未持久交付。候选不含实验OCR/PDFium数据，Mac未验收/未公证。

依赖证据：@hyzyla/pdfium v3.0.0 npm构件wasm SHA beeaf5bbff216d555fecec7cd486072838c4632a2272d31b52ef1fd05008fe7c，与其源码标签c60c75d08051454f0deadf093ffdb948aa179888和pdfium-lib 8046官方wasm.tgz解出文件一致；pdfium-lib构建采用 chromium/8046 分支，构建时精确PDFium提交尚未确认，PDFium和传递依赖许可证尚未完整审核。Tesseract core v7.0.0源码标签与6个候选文件一致，上游九个静态依赖已取得固定子模块信息，须核对各项许可与第三方通知。不得把实验版当正式分发或宣称Mac已运行。
