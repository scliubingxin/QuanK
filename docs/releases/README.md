# 发布记录

QuanK 每个正式版本的打包与发布过程记录（同步清单、asar 检查、提交与 tag、GitHub Release、校验值）。功能变化见根目录 [ITERATION_LOG.md](../../ITERATION_LOG.md)。

| 版本 | 日期 | 内容 | 合并提交 | 发布记录提交 | DMG 字节 | DMG sha256 | ZIP sha256 | 记录 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [v0.52.0](https://github.com/scliubingxin/QuanK/releases/tag/v0.52.0) | 2026-11-23 | 半自动委托 | `6b2aa80` | `本次` | 457,431,093 | `670a5f70faa3…` | `4cb3f8691dc4…` | [v0.52.0.md](v0.52.0.md) |
| [v0.51.0](https://github.com/scliubingxin/QuanK/releases/tag/v0.51.0) | 2026-11-22 | quank 命令行 | `61845a7` | `本次` | 457,456,038 | `a538dca8fa37…` | `20eda134889d…` | [v0.51.0.md](v0.51.0.md) |
| [v0.50.0](https://github.com/scliubingxin/QuanK/releases/tag/v0.50.0) | 2026-11-21 | F5 合规安全 | `2f7d9c5` | `本次` | 457,511,913 | `5865671c9bb2…` | `00bfd5e9829b…` | [v0.50.0.md](v0.50.0.md) |
| [v0.49.1](https://github.com/scliubingxin/QuanK/releases/tag/v0.49.1) | 2026-11-21 | 修复投研与组合功能无法使用 | `fe3a644` | `本次` | 457,594,205 | `1e479b30d1fb…` | `e196668fc78a…` | [v0.49.1.md](v0.49.1.md) |
| [v0.49.0](https://github.com/scliubingxin/QuanK/releases/tag/v0.49.0) | 2026-11-21 | F4 组合与风控 | `2605751` | `900de41` | 457,594,417 | `db91e32dbe98…` | `d0f3f75bddd1…` | [v0.49.0.md](v0.49.0.md) |
| [v0.48.0](https://github.com/scliubingxin/QuanK/releases/tag/v0.48.0) | 2026-11-21 | F3 投研知识库 | `66a440d` | `cc5d779` | 457,712,164 | `4baa33d986d2…` | `42c311297cf3…` | [v0.48.0.md](v0.48.0.md) |
| [v0.47.1](https://github.com/scliubingxin/QuanK/releases/tag/v0.47.1) | 2026-11-21 | 行情备用源与回测口径修复 | `108291d` | `d5c7abb` | 457,637,376 | `4ccc523700b6…` | `09a62941c33a…` | [v0.47.1.md](v0.47.1.md) |
| [v0.47.0](https://github.com/scliubingxin/QuanK/releases/tag/v0.47.0) | 2026-11-21 | F2 投研文档 | `40c0e85` | `ba5e249` | 457,635,234 | `57d9fa56ab6d…` | `9ddf0bf60ac5…` | [v0.47.0.md](v0.47.0.md) |
| [v0.46.0](https://github.com/scliubingxin/QuanK/releases/tag/v0.46.0) | 2026-11-21 | F1 行情工作台 | `6e674a7` | `fef2925` | 457,530,561 | `b5864df9b49d…` | `39f5270fc547…` | [v0.46.0.md](v0.46.0.md) |

完整 sha256 见各版本记录；下载后校验：`shasum -a 256 QuanK-<版本>-mac-arm64.dmg`。所有安装包均为 ad-hoc 签名、未经 Apple 公证，仅支持 Apple 芯片 Mac。

## 归档

- [ITERATION_LOG_v0.1-v0.37.md](ITERATION_LOG_v0.1-v0.37.md)：WillBuddy 时期（0.1 – 0.37.x）的迭代记录，从根目录 ITERATION_LOG.md 移出
- [DOWNLOADS_v0.1-v0.37.md](DOWNLOADS_v0.1-v0.37.md)：同一时期各版本的下载与校验说明

## 新版本怎么记

发布时把过程记录写成 `docs/releases/v<版本>.md`（结构同上面几份），在本页表格顶部加一行，然后随「docs: v<版本> 发布记录」一起提交。不要再写到仓库根目录。
