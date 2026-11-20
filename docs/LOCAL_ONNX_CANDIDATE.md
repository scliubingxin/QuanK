# 本机 ONNX 嵌入适配器（实验）

`desktop/runtime/local-onnx-embedding.mjs` 提供给可信主机层的 `createLocalOnnxEmbedding`，兼容 `createVectorIndex` 的 `identity` / `embedder` 接口；主进程已为固定模型名 `wb-bge-small-zh-v1.5` 配置受控路径，但未增加界面入口。它只接受固定模型名称，验证普通文件大小和 SHA-256，使用指定绝对 Python 路径、`-I -B`、无 shell 子进程，设置超时/取消和有界 JSON；编码后超 512 分词直接失败，不做静默截断。模型和 Python 扩展未包含在源码或安装包，当前安装包没有模型和依赖，即使在旧设置中输入该名称也会明确失败，不会调用其他服务。

开发试验模型：Qdrant/bge-small-zh-v1.5，固定 revision `46fbe35fd4374a00fee7de77dfddaeb6dd6a2c59`；`model_optimized.onnx` 94,781,076 字节，SHA-256 `1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38`；`tokenizer.json` 439,125 字节，SHA-256 `48cea5d44424912a6fd1ea647bf4fe50b55ab8b1e5879c3275f80e339e8fae26`。模型卡标注 MIT；来源：https://huggingface.co/Qdrant/bge-small-zh-v1.5/tree/46fbe35fd4374a00fee7de77dfddaeb6dd6a2c59 ，上游BAAI模型卡：https://huggingface.co/BAAI/bge-small-zh-v1.5 。正式分发前仍须整理完整版权、许可及依赖清单。

通过真实 Linux x86_64 CPU 推理和向量服务，验证无词法重叠的中文查询命中目标、512维、索引复用、超分词拒绝；另用真实子进程夹具验证取消终止。实验使用开发环境 Python/ONNX Runtime/tokenizers/numpy，非应用自带；测试通过环境变量显式给出模型和解释器时才运行，默认跳过。尚未固定并集成 macOS ARM64 的所有依赖和签名、尚未真实Mac执行，也未实施模型进程 OS 沙箱。所有权重不写入源码包，不声称用户端可离线使用。
