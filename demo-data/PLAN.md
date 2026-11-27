# Retake: manual figures + remaining homepage shots (QuankSight v1.0.5)

Rules for every shot
- App: /Users/liubingxin/wb-par/QuanK-wt/v105/desktop (v1.0.5), QUANK_SELFTEST=1, QUANK_USER_DATA=/private/tmp/shots105b-ud (assert userData first; never real data)
- Reuse /private/tmp/shots105.mjs capture flow; inject `.brand-ver{display:none!important}` before each shot
- Output PNG to this folder with the exact name + pixel size below; then webp (q86)
- Per shot: body.innerText must not contain 一键搞定 / QuanK (except QuankSight) / v1.0.
- If a shot cannot be reproduced honestly from the demo seed: SKIP and write the reason. Never invent content.
- Sidebar 「最近」 chat titles: demo titles only (seed), no real user chats.

## A. Manual (site repo src/manual/img/, same names)
| file | size | what it must show |
|---|---|---|
| fig-01 | 1192x777 | 工作台主界面 (sidebar, work area, top bar) |
| fig-02 | 1192x745 | 工作台 scrolled to 量化工作台 card + 股票池排行 |
| fig-03 | 1192x777 | chat with a file card, file previewed in right tab |
| fig-04 | 1192x745 | chat with an inline approval card + 「需要你的授权」 bar above input |
| fig-05 | 1192x777 | 行情 page |
| fig-06 | 1192x777 | 量化 page |
| fig-07 | 807x1100 | stock detail: holding card + score breakdown (tall crop) |
| fig-08 | 1440x940 | stock K-line with backtest B/S markers |
| fig-09 | 1192x745 | backtest return comparison (smart vs regular, 0% line) |
| fig-10 | 1192x745 | 量化 › 持仓与定投 |
| fig-11 | 969x1100 | stock research report (web version) — skip if no demo report exists |
| fig-12 | 1192x745 | stock detail › 投研资料 |
| fig-13 | 1192x777 | 投研资料库 |
| fig-14 | 1192x225 | 投研知识库 search bar + a few results (thin strip) |
| fig-15 | 1192x841 | 财务数据与单季趋势 |
| fig-16 | 1192x520 | 公司关系图 |
| fig-17 | 1192x777 | 组合与风控 overview |
| fig-18 | 1192x777 | 风险指标与压力测试 |
| fig-19 | 1192x745 | 智能体 page (金融智能体) |
| fig-20 | 1192x745 | 技能 page |
| fig-21 | 1192x745 | 连接 › 数据源 |
| fig-22 | 1192x745 | 自动化 › 定时任务 |
| fig-23 | 1192x745 | 动态 |
| fig-24 | 1192x745 | 知识图谱 |
| fig-25 | 1192x745 | 记忆库 |
| fig-26 | 1192x777 | right-tab document preview with outline |
| fig-27 | 1192x715 | Word editing |
| fig-28 | 1192x715 | Excel editing |
| fig-29 | 1192x777 | 安全与合规 |

## B. Homepage leftovers (site repo src/assets/, 1600x1000 unless noted)
| file | what |
|---|---|
| dialog-stockpool | stock pool with 比亚迪 (002594) highlighted — add 比亚迪 to the demo pool in the isolated seed first |
| price-alert | 「行情提醒」 popup. Find the renderer function that draws it (grep 行情提醒 in desktop/src) and call it via CDP with a demo payload (通威 600438 跌破 10.80). Skip if no such function |
| signal-buy-popup | buy-point popup, same approach (宁德时代 300750 买入) |
| memory-advice | chat answer "按单股≤30% 宁德时代买多少". Use the H9 seed chat if it still exists under /private/tmp/h9-*; otherwise SKIP |
| scene-portfolio | 组合与风控 overview (same page as fig-17, 1600x1000) |
