# 投研 PPT 引擎（D59，v0.59 候选）

## 用途

`app_deck_build` / `app_deck_themes` 两个助手工具：把资料、日报复盘、研究结果做成原生可编辑的 QuanK 投研 PPT。文件保存到成果中心（带版本）、右侧页签预览，对话里返回文件卡片（页数、版式清单、数据占位说明）。

## 主题与版式

- `research`（默认，10 种页型）：`cover` / `summary` / `company` / `financials` / `valuation` / `chart` / `signals` / `catalysts_risks` / `event` / `disclaimer`。免责声明固定末页且自动补齐，不可删除。
- `report`：浅色方案报告（6 种页型 + 25 种内容块）。
- `product`：深色胶片（10 种页型 + 10 种面板）。

## 数据绑定

spec 字段可写 `{"$data": "quote:600438"}`、`"financials:600438:5y"`、`"kline:600438:1d:120"`、`"backtest:<strategy>"`、`"signals:pool"`。生成前由 QuanK 行情/财务/量化服务**只读**取数填入；每页底部自动加「数据来源 · 截至 <sourceAsOf>」。取不到的数据显示「—」并写入 warnings，不编造。金额隐藏开启时持仓金额脱敏。

## 调用链

```
assistant → app_deck_build(outline) → 大纲卡片确认 → spec → build_deck.py --check → build_deck.py --build
         → 成果中心 importFile(pptx) → 右侧预览 → 文件卡片
```

溢出/超出画布告警会自动精简内容并重试，最多 2 轮。Python 缺包时给出中文提示。加密模式下临时文件只写在 `userData/deck/tmp` 并立即删除；普通模式用系统临时目录并同样立即删除。

## 与现有入口的关系

`document_create(format:'pptx')`（PptxGenJS 结构化版式）与 `app_research_report` / `app_research_export` / `app_pf_report` / `app_kb_topic_digest`（研报导出）均保留；新引擎作为研究型 PPT 的并行高保真通道，由 `app_deck_build` 显式调用。已有文档的修改请求仍走 `app_office_*`。

## 数据来源

- 报价与 K 线：腾讯行情（QuanK `createMarketService`，1/5/15/30 分钟与日 K）。
- 财务：东方财富 F10 `datacenter-web / RPT_LICO_FN_CPD` 年度报告（`deck-data.mjs`，只读、超时、缓存），近 5 年营收/归母净利/毛利率/ROE。
- 估值：腾讯报价字段 PE(TTM)/PB(LF)；PE 为负或历史分位无来源时显示「—」。
- 量化信号与回测：QuanK 本机量化引擎（临时副本，勿改用户策略项目）。

## 来源与许可

见 `desktop/runtime/deck/THIRD_PARTY.md`。ppt-deck-pro 用户自研，随 QuanK 分发。
