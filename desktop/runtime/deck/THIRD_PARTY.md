# 第三方与来源说明（deck 投研 PPT 引擎）

## 引擎代码

| 组件 | 来源 | 许可 |
| --- | --- | --- |
| `deckkit/*.py`、`build_deck.py` | ppt-deck-pro，用户自研，随 QuankSight 分发（JSON spec → 原生可编辑 PPTX 渲染器） | 用户自研，随 QuankSight 分发 |
| `research.py`、`data.py` | QuankSight 本轮新增（D59） | QuankSight 项目许可（见仓库根 LICENSE） |
| `assets/quank_logo.png`、`assets/quank_logo_white.png` | QuankSight 既有品牌资源 `desktop/src/assets/logo.png`（白色版由本地着色生成） | QuankSight 项目许可 |

移植时已按要求移除来源技能中的第三方客户品牌、实景照片、安全标识与角标；原 `.b64` 素材全部删除。生成内容只使用 QuankSight 品牌色（皇家蓝 `#2F62F5`、深蓝 `#0B2BA6/#14213D`、浅蓝灰 `#EEF2FF`）与原生形状/渐变。

## Python 运行依赖

| 包 | 版本 | 许可 | wheel 体积（arm64） |
| --- | --- | --- | --- |
| python-pptx | 1.0.2 | MIT | 0.45 MB |
| lxml | 6.1.3 | BSD-3-Clause | 8.2 MB（universal2，含 arm64/x86_64） |
| XlsxWriter | 3.3.4 | BSD-2-Clause | 0.18 MB（python-pptx 依赖） |
| Pillow | 13.0.0 | HPND | 4.7 MB（原有） |

以上 wheel 由 `desktop/python-wheels.lock.json` 固定 SHA-256，构建期离线安装到内置 Python；合计新增约 8.9 MB（wheel）/ 21.4 MB（安装后），均低于 25 MB 阈值。

## 来源确认

- ppt-deck-pro 为用户自研，随 QuankSight 分发（用户 2026-11-25 确认）。
