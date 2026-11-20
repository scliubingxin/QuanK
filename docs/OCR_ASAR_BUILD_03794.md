# 离线OCR应用构建实验

仅显式提供 --experimental-ocr-assets 时，打包程序在隔离应用源码目录校验并装入固定中文/英文数据与WASM；默认构建不装入。构建清单标记 experimental_ocr_assets。数据源应已在构建环境准备，SHA不符、符号链接或目标并发变化立即失败。源码ZIP排除训练数据和WASM。

Linux验证：真实固定资源装入临时树、ASAR打包并解包，然后用真实Node运行OCR识别合成图片。Electron直接ASAR路径、Mac本机、PDF渲染组件、真实用户文档未验。tesseract.js-core v7.0.0源标签与6文件SHA相同，其构建使用tesseract、leptonica、libjpeg、giflib、libpng、libtiff、libwebp、zlib、openlibm等子模块，须完成全部固定版本许可证核查及应带文字后再公开分发；不能仅凭顶层Apache许可确认。
