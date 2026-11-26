# 任务：修复官网 3 张截图对应的 App bug 并重拍

## 目标
1. 修 3 个 App bug（A 成果中心 slice 报错；B 同一页面左右重复打开；C 信号标签 buy→买入），每个配测试。
2. 用演示工作空间重拍 3 张截图（scene-office.webp / dialog-stockpool.webp / signal-buy-popup.webp），遮盖/避免微信、路径、报错条等敏感信息。
3. 压 webp（质量 ~85、宽 ~1600），备份原图为 *.bak.webp，覆盖 site/src/assets 同名文件。
4. 本地 commit：bug 修复与图片分开；严禁 git push / 改 remote / 部署。
5. 核对官方品牌名（QuanK vs QuankSight），不擅自改品牌。

## 进度
- [x] 0. 定位仓库 `/Users/liubingxin/wb-par/QuanK`，资源 `site/src/assets/`，TASK.md 写入。
- [x] 1. 修 bug A/B/C，补 `desktop/tests/website-shot-fixes.test.mjs`（3/3 通过），更新 `v054-panel.test.mjs`；全量测试 1579 通过 / 159 失败，与基线 1578/160 对比无新增失败（两项 EADDRINUSE 端口竞争为偶发），已单独 commit。
- [ ] 2. 用演示数据重拍 3 张 1440×900 @2x 截图，无敏感信息，人工检查。
- [ ] 3. 转 webp（质量≈85、宽≈1600），备份原图为 *.bak.webp，覆盖同名文件，单独 commit。
- [ ] 4. 分两次本地 commit，核对品牌名并汇报。
