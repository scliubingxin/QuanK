# PDF 授权与 CLI 启动取消

探索性完整回归722项：686通过、17失败、19跳过，17项均报告缺jsdom；运行期间追加修改和测试，不能作为最终源码完整回归结论。

## 0.37.106 PDF授权与CLI启动取消（内部检查点）

PDF识别及OCR成果保存的确认等待可取消；迟到的批准不启动识别、不创建文档。CLI执行前的授权目录/程序路径解析、只读find判定和项目启动校验也可取消，迟到校验结果不启动命令。底层文件检查或原生确认窗口可能继续，不能声称系统弹窗已关闭；已启动的进程沿用现有终止机制。修改 desktop/runtime/tools.mjs、desktop/tests/pdf-ocr-03740.test.mjs、desktop/tests/commands.test.mjs。针对相关PDF、图片OCR、队列、CLI和项目服务111项测试：109通过、2项因OCR离线构建资产缺失跳过；包含真实Linux英文PDF识别、真实Node/npm/Python项目及夹具确认/挂起/并发取消。50项打包测试通过。Mac签名、真实付费模型、中文OCR离线资源未验收，无匹配Apple安装包；当前环境缺jsdom、asar、rcodesign，离线安装依赖缺zrender。原Web/Python 122受保护文件与0.37.22权威一致。M4未完成，下一步补全合法离线模型/OCR/PDFium及依赖，执行Mac安装、原生审批和实际文档验收；遵守此前GitHub安全审查拒绝，不更换通道绕过。

参考 https://docs.aws.amazon.com/quick/latest/userguide/working-with-chat-desktop.html ，REA沿用既有静态证据；本轮无新的Amazon应用运行结论。
