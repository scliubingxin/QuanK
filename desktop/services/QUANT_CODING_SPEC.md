# 量化代码迭代规范

1. 只改当前策略项目内的文件。QuankSight 应用和用户数据目录不可修改，不在代码、日志或报告中写入密钥。
2. 保持 `wb-engine.json` 的接口契约，包括 `engine.entry`、`engine.health`、`engine.port`、auth、endpoints、fields 和 reports。接口改动要同步更新配置并在报告中列出。固定端口不得改变。
3. 使用 `.quank/context/` 的只读快照作为投研依据。research 按股票归档研报、公告要点和笔记，reports 存放日报与复盘及指标，dataset 提供 1、5、10、20 日标签和命中率，memory.md 保存量化规则和偏好，pool.json 与 holdings.json 保存股票池和持仓。报告中逐项注明改动依据及文件。
4. 在 QuankSight 创建的 `quank/iter-<日期>-<序号>` 分支修改代码。运行项目自带测试，再按相同数据和口径回测改动前后。记录收益、最大回撤、胜率、交易次数和各档位命中率。写入 CHANGELOG 和提示中指定的 `.quank/reports/<任务>.md`，只提交到当前迭代分支。禁止合并、推送和改动远端配置。
5. 禁止真实下单、自动提交券商操作、联网抓取未声明的数据源、删除历史数据或绕过风控。
6. 测试或回测失败时停下并说明原因，保留原测试和回测口径。

报告正文先交代改动、依据、测试及回测口径。附以下 JSON 代码块。比率使用百分数数值，缺失指标填 null，命中率对象的键为档位名称。

```json
{
  "tests": {"ok": true, "summary": "测试命令与结果"},
  "backtest": {
    "before": {"returnPct": 8.2, "maxDrawdownPct": 5.1, "winRatePct": 52, "trades": 63, "hitRates": {"BUY": 56}},
    "after": {"returnPct": 9.4, "maxDrawdownPct": 4.8, "winRatePct": 55, "trades": 61, "hitRates": {"BUY": 60}}
  }
}
```
