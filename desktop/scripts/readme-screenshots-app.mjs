// Capture README screenshots of the QuanK workbench (P1: memory, conversations, slash commands, plan, deep research)
// by rendering the real src/index.html in headless Chrome with a demo-state bridge. Demo data only; no model calls.
// Run (from desktop/): CHROME_PATH=<Chrome binary> node scripts/readme-screenshots-app.mjs [outDir=../docs/images]
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {initialState} from '../core.mjs';
import {buildBriefing} from '../src/shared/briefing.js';
import {capabilityPresets} from '../runtime/capability-presets.mjs'; // [ux12]
import {summarize, chartGrids} from '../src/shared/quant.js';
import {normalizeInfographic} from '../src/shared/infographic.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] || path.join(here, '../../docs/images'));
const root = path.join(here, '../src/');
const log = (...a) => console.log('[app-shots]', ...a);
const H = 3600e3, now = Date.now();
// [ux12] Demo quant data for README screenshots: a made-up engine adapter and synthetic series. Not a real strategy.
const DEMO_ADAPTER = {labels: {price: '收盘价', score: '综合分'}, fields: {
  action: 'action', actionText: 'action_text', score: 'score', scoreRaw: 'score_raw', multiplier: 'mult', pause: 'pause', price: 'price', date: 'date', changePct: 'chg',
  detail: 'detail', reasons: 'reasons', gates: 'limits', advice: ['advice'], indicators: [['RSI', 'rsi'], ['MA20', 'ma20'], ['20 日涨跌 %', 'pct20']],
  probPct: 'prob', model: 'model', plan: 'plan', backtest: {smartPct: 'bt.a', blindPct: 'bt.b', excess: 'bt.d', winRate: 'bt.w', trades: 'bt.n', maxDrawdown: 'bt.dd'},
  series: {path: 'hist'}, curves: {a: {path: 'curve_a', label: '策略市值'}, b: {path: 'curve_b', label: '基准市值'}, costLabel: '累计投入'}, ops: {path: 'ops'},
  quoteName: 'name', quotePrice: 'price', quoteChange: 'chg'}};
function demoQuantDetail() {
  const days = [], d0 = new Date(2026, 5, 1);
  for (let d = new Date(d0); days.length < 160; d.setDate(d.getDate() + 1)) if (d.getDay() % 6) days.push(new Date(d));
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let p = 1580, ca = 0, cb = 0, ha = 0, hb = 0;
  const hist = [], curveA = [], curveB = [], ops = [];
  days.forEach((d, i) => {
    p = p * (1 + Math.sin(i / 11) * 0.009 + Math.cos(i / 29) * 0.006 + 0.0004);
    const score = Math.round((55 + Math.sin(i / 8) * 20) * 10) / 10, type = score > 70 ? 'buy' : score < 38 ? 'sell' : 'hold';
    hist.push({date: iso(d), price: Math.round(p * 100) / 100, score, type});
    const k = type === 'buy' ? 1.5 : type === 'sell' ? 0.5 : 1;
    ca += 1000 * k; ha += 1000 * k / p; cb += 1000; hb += 1000 / p;
    if (type !== 'hold' && i % 4 === 0) ops.push({date: iso(d), action: type === 'buy' ? '加仓' : '减仓', price: Math.round(p * 100) / 100, shares: 100, amount: Math.round(p * 100), score, reason: '演示数据'});
    curveA.push({date: iso(d), value: Math.round(ha * p), cost: Math.round(ca)}); curveB.push({date: iso(d), value: Math.round(hb * p), cost: Math.round(cb)});
  });
  const raw = {plan: '每周 1 次', hist, curve_a: curveA, curve_b: curveB, ops, bt: {a: 8.4, b: 5.1, d: 3.3, w: 58, n: ops.length, dd: -9.6},
    action: 'BUY', action_text: '分批买入', score: 72.4, score_raw: 72.4, mult: 1.5, pause: false, price: Math.round(p * 100) / 100, date: '2026-11-20', chg: 1.26, rsi: 58.3, ma20: Math.round(p * 0.98 * 100) / 100, pct20: 3.9,
    detail: '演示数据：综合分位于买入区间，按计划分批加仓；仅用于展示界面，不代表任何真实策略或投资建议。',
    reasons: ['演示：价格站上 20 日均线', '演示：近 20 日涨幅温和', '演示：模型概率高于 50%'], limits: ['演示：单次加仓不超过计划的 1.5 倍'],
    advice: '演示：本次建议买入 100 股', prob: 61.5, model: 'demo'};
  return {summary: summarize(DEMO_ADAPTER, '600519', raw, {name: '贵州茅台', price: raw.price, chg: 1.26}), charts: chartGrids(DEMO_ADAPTER, raw), at: now - 4 * 60e3};
}

function demoState() {
  const s = initialState();
  s.settings = {...s.settings, name: '演示工作空间', hasKey: true, keySaved: true, secureStorage: true};
  s.memories = [
    {id: 'm1', text: '周报每周五下午发给部门负责人，用一页纸提纲', kind: 'preference', source: 'user', created: now - 72 * H, updated: now - 72 * H, uses: 6, lastUsed: now - H},
    {id: 'm2', text: '回复默认用中文，数字保留两位小数', kind: 'preference', source: 'user', created: now - 96 * H, updated: now - 96 * H, uses: 11, lastUsed: now - 2 * H},
    {id: 'm3', text: '负责华东区域销售运营，常用表格是「区域经营概览」', kind: 'profile', source: 'auto', created: now - 30 * H, updated: now - 30 * H, uses: 3, lastUsed: now - 5 * H},
    {id: 'm4', text: '对外材料不出现客户真实名称', kind: 'rule', source: 'auto', created: now - 20 * H, updated: now - 20 * H, uses: 2},
  ];
  const chat = (id, name, messages, extra = {}) => ({id, name, agentId: 'assistant', time: now - (extra.ago || 0), messages, ...extra});
  const research = {
    id: 'p-r', kind: 'research', goal: '2026 年国内工商业储能市场现状与机会', status: 'done', agentId: 'assistant', toolsEnabled: true,
    created: now - 2 * H, started: now - 2 * H, finished: now - 1.5 * H,
    sources: ['https://www.nea.gov.cn/', 'https://www.cnesa.org/', 'https://www.ndrc.gov.cn/', 'https://example.com/a', 'https://example.com/b', 'https://example.com/c', 'https://example.com/d'],
    report: {id: 'doc-r', name: '研究报告-2026 年国内工商业储能市场研究', revision: 1},
    steps: [
      {title: '政策环境与电价机制', detail: '分时电价、峰谷价差、地方补贴', status: 'done'},
      {title: '装机规模与增长', detail: '近三年新增装机、区域分布', status: 'done'},
      {title: '主流技术路线与成本', detail: '磷酸铁锂、钠电、系统集成成本', status: 'done'},
      {title: '商业模式与收益测算', detail: '合同能源管理、峰谷套利回收期', status: 'done'},
      {title: '撰写研究报告', detail: '综合前面各步的发现，写成带引用的结构化报告', status: 'done'},
    ]};
  const outline = {
    id: 'p-d', kind: 'research', goal: '比较三家主流协同办公平台的 AI 功能', status: 'draft', agentId: 'assistant', toolsEnabled: true, created: now - 10 * 60e3,
    steps: [
      {title: '各平台 AI 功能清单', detail: '官方文档与发布说明', status: 'pending'},
      {title: '定价与授权方式', detail: '按席位 / 按用量，企业版差异', status: 'pending'},
      {title: '数据安全与合规', detail: '数据存储位置、模型训练使用条款', status: 'pending'},
      {title: '撰写研究报告', detail: '综合前面各步的发现，写成带引用的结构化报告', status: 'pending'},
    ]};
  const plan = {
    id: 'p-p', goal: '整理一份新员工入职清单', status: 'running', agentId: 'assistant', toolsEnabled: true, created: now - 15 * 60e3, started: now - 14 * 60e3,
    steps: [
      {title: '收集现有入职材料', detail: '读取「人事资料」文件夹中的制度和表格', status: 'done'},
      {title: '按时间线整理事项', detail: '入职前 / 第一天 / 第一周 / 第一个月', status: 'done'},
      {title: '生成 Excel 清单', detail: '事项、负责人、截止时间、完成状态', status: 'running'},
      {title: '生成欢迎信 Word', detail: '一页纸，附清单链接', status: 'pending'},
    ]};
  s.chats = [
    chat('c-mem', '下周例会周报提纲', [
      {role: 'user', content: '帮我准备下周例会的周报提纲', time: now - 40 * 60e3},
      {role: 'assistant', time: now - 39 * 60e3, content: '## 华东区域周报提纲（第 47 周）\n\n1. **本周核心数据**：销售额、环比、重点客户进展\n2. **重点事项**：新品渠道下沉、成渝区域对标\n3. **风险与求助**：交付周期、价格政策\n4. **下周计划**：三项可量化目标\n\n> 已按一页纸提纲组织，周五下午可直接发给部门负责人。',
        memories: [{id: 'm1', text: '周报每周五下午发给部门负责人，用一页纸提纲'}, {id: 'm3', text: '负责华东区域销售运营，常用表格是「区域经营概览」'}],
        learned: [{id: 'm5', text: '例会周报按「数据-事项-风险-计划」四段组织'}]},
    ], {pinned: true, ago: 40 * 60e3}),
    chat('c-plan', '新员工入职清单', [{role: 'user', content: '整理一份新员工入职清单', time: now - 15 * 60e3, planDraft: true}], {plan, ago: 15 * 60e3}),
    chat('c-research', '工商业储能市场研究', [
      {role: 'user', content: '2026 年国内工商业储能市场现状与机会', time: now - 2 * H, planDraft: true},
      {role: 'assistant', time: now - 1.5 * H, content: '# 2026 年国内工商业储能市场研究\n\n## 摘要\n- 峰谷价差扩大是装机增长的首要驱动 [1]\n- 系统集成成本继续下降，回收期缩短 [2]\n- 华东、华南需求最集中 [3]\n\n## 参考来源\n[1] 国家能源局 https://www.nea.gov.cn/\n[2] 中关村储能产业技术联盟 https://www.cnesa.org/\n[3] 国家发展改革委 https://www.ndrc.gov.cn/\n\n*（演示内容）*',
        researchReport: research.report},
    ], {plan: research, unread: true, ago: 2 * H}),
    chat('c-outline', '协同办公平台 AI 对比', [{role: 'user', content: '比较三家主流协同办公平台的 AI 功能', time: now - 10 * 60e3, planDraft: true}], {plan: outline, ago: 10 * 60e3}),
    chat('c-4', '季度预算表格校对', [{role: 'user', content: '校对预算表', time: now - 26 * H}, {role: 'assistant', content: '已完成校对。', time: now - 26 * H}], {ago: 26 * H}),
    chat('c-5', '客户拜访纪要整理', [{role: 'user', content: '整理纪要', time: now - 50 * H}, {role: 'assistant', content: '纪要已整理。', time: now - 50 * H}], {ago: 50 * H, archived: false}),
  ];
  // [p2] scheduled tasks, approvals, feed and briefing demo data
  const at = (h, m = 0) => { const d = new Date(now); d.setHours(h, m, 0, 0); return d.getTime(); };
  s.tasks = [
    {id: 't-news', mode: 'agent', name: '每日行业早报', prompt: '整理昨天以来储能行业的重要新闻，列 5 条，每条附来源链接。', agentId: 'research', toolsEnabled: true, enabled: true,
      schedule: {kind: 'weekdays', time: '08:30'}, nextRun: at(8, 30) + 24 * H, status: 'done', chatId: 'c-research', lastRun: now - 3 * H,
      history: [{id: 'n3', at: now - 3 * H, ms: 48000, status: 'done', trigger: 'schedule', pending: 1}, {id: 'n2', at: now - 27 * H, ms: 52000, status: 'done'}, {id: 'n1', at: now - 51 * H, status: 'failed', error: '网络超时'}]},
    {id: 't-kpi', mode: 'agent', name: '销售数据巡检', prompt: '读取「区域经营概览」，找出环比下降超过 10% 的区域。', agentId: 'assistant', toolsEnabled: true, enabled: true,
      schedule: {kind: 'hourly', every: 3}, nextRun: now + 40 * 60e3, status: 'failed', error: '文件夹授权已撤销', lastRun: now - 2.3 * H,
      history: [{id: 'k2', at: now - 2.3 * H, status: 'failed', error: '文件夹授权已撤销'}, {id: 'k1', at: now - 5.3 * H, ms: 21000, status: 'done'}]},
    {id: 't-week', mode: 'agent', name: '周报初稿', prompt: '按「数据-事项-风险-计划」写本周周报初稿。', agentId: 'writer', toolsEnabled: false, enabled: true,
      schedule: {kind: 'weekly', time: '16:00', days: [5]}, nextRun: at(16) + 2 * 24 * H, status: 'ready', history: []},
  ];
  s.runJobs = [{id: 'j-live', kind: 'conversation', ownerId: 'c-plan', label: '新员工入职清单', status: 'running', createdAt: now - 14 * 60e3}];
  s.pendingApprovals = [
    {id: 'pa1', time: now - 3 * H, chatId: 'c-research', taskId: 't-news', tool: 'browser_read', title: '读取网页内容', detail: 'https://www.cnesa.org/', candidate: {kind: 'browser', origin: 'https://www.cnesa.org', label: '网站 https://www.cnesa.org'}},
    {id: 'pa2', time: now - 2.5 * H, chatId: 'c-research', taskId: 't-news', tool: 'browser_fill', title: '填写网页文本框', detail: '搜索框'},
  ];
  s.approvalRules = [
    {id: 'ar1', kind: 'browser', origin: 'https://www.nea.gov.cn', label: '网站 https://www.nea.gov.cn', created: now - 50 * H, expires: now + 28 * 24 * H, uses: 9, lastUsed: now - 3 * H, taskId: 't-news'},
    {id: 'ar2', kind: 'cli', label: '命令 git status（工作目录 /Users/demo/项目资料）', created: now - 70 * H, expires: now + 27 * 24 * H, uses: 4, lastUsed: now - 20 * H},
    {id: 'ar3', kind: 'document', label: '读取文档 区域经营概览', created: now - 30 * H, expires: now + 29 * 24 * H, uses: 6, lastUsed: now - 5.3 * H},
  ];
  s.documents = [{id: 'doc-r', name: '研究报告-2026 年国内工商业储能市场研究', format: 'docx', revision: 1, time: now - 1.5 * H}];
  s.artifacts = [{id: 'af1', name: '每日行业早报', text: '1. ……', time: now - 3 * H}];
  s.activity = [{id: 'l1', title: '已授权文件夹', detail: '项目资料', time: now - 6 * H}];
  s.briefings = [{...buildBriefing(s, now - 20 * 60e3), summary: '先处理「销售数据巡检」的失败（文件夹授权已撤销）和早报留下的 2 项待确认；上次以来完成了储能市场深度研究和早报；今天还有 3 次巡检和周报初稿准备。'}];
  // [ux12] v0.44 pages: quant, agents, Skill / MCP plaza, infographics, mini apps (demo data)
  s.agents = (s.agents || []).map(a => a.id === 'research' ? {...a, skillIds: ['sk-report'], mcpIds: ['mcp-ctx'], knowledge: [{id: 'k1'}]} : a.id === 'writer' ? {...a, skillIds: ['sk-report']} : a);
  s.quant = {status: 'running', installed: true, title: '我的量化策略（演示）', source: '/Users/demo/私有策略项目', files: 312, lastSync: now - 30 * 60e3, python: '', pythonFound: '/usr/local/bin/python3', autoStart: true, ai: 'willbuddy',
    pool: [
      {code: '600519', name: '贵州茅台', last: {at: now - 4 * 60e3, action: 'BUY', actionText: '分批买入', score: 72.4, multiplier: 1.5, price: 1688.2, changePct: 1.26, date: '2026-11-20'}},
      {code: '600036', name: '招商银行', last: {at: now - 6 * 60e3, action: 'HOLD', actionText: '正常定投', score: 55.1, multiplier: 1, price: 41.35, changePct: 0.42, date: '2026-11-20'}},
      {code: '300750', name: '宁德时代', last: {at: now - 6 * 60e3, action: 'HOLD', actionText: '暂停加仓', score: 44.8, multiplier: 0, price: 268.5, changePct: -1.86, date: '2026-11-20'}},
      {code: '000333', name: '美的集团', last: {at: now - 7 * 60e3, action: 'STRONG_BUY', actionText: '加倍定投', score: 81.2, multiplier: 2, price: 76.9, changePct: 2.12, date: '2026-11-20'}},
      {code: '601318', name: '中国平安', last: {at: now - 8 * 60e3, action: 'SELL', actionText: '分批减仓', score: 31.5, multiplier: 0, price: 52.6, changePct: -2.4, date: '2026-11-20'}},
      {code: '002594', name: '比亚迪', last: {at: now - 9 * 60e3, action: 'HOLD', actionText: '正常定投', score: 58.6, multiplier: 1, price: 312.4, changePct: 0.31, date: '2026-11-20'}},
    ]};
  s.infographics = [
    {id: 'ig1', name: '三季度经营概览', updated: now - 3 * H, spec: normalizeInfographic({template: 'stats', title: '三季度经营概览', subtitle: '核心指标同比全部提升', footer: '数据来源：演示数据', items: [{value: '1.2 亿', title: '营收', text: '同比 +18%'}, {value: '320', title: '新客户', text: '制造业占 45%'}, {value: '92%', title: '续约率', text: '连续三个季度提升'}, {value: '4.6', title: '客户满意度', text: '满分 5 分'}]})},
    {id: 'ig2', name: '新员工入职流程', updated: now - 6 * H, spec: normalizeInfographic({template: 'process', title: '新员工入职流程', items: [{title: '入职前', text: '签约、设备申请、账号开通'}, {title: '第一天', text: '报到、导师见面、安全培训'}, {title: '第一周', text: '熟悉业务、完成首个小任务'}, {title: '第一个月', text: '转正目标对齐、反馈面谈'}]})},
    {id: 'ig3', name: '储能项目里程碑', updated: now - 26 * H, spec: normalizeInfographic({template: 'timeline', title: '储能项目里程碑', items: [{value: '3月', title: '立项', text: '完成可研与选址'}, {value: '6月', title: '备案', text: '取得并网备案'}, {value: '9月', title: '建设', text: '设备进场安装'}, {value: '12月', title: '并网', text: '完成调试并网'}]})},
    {id: 'ig4', name: '年度大会海报', updated: now - 50 * H, spec: normalizeInfographic({template: 'poster', title: '2026 年度合作伙伴大会', subtitle: '12 月 18 日 · 成都', footer: '扫码报名，席位有限', items: [{value: '30+', title: '行业嘉宾'}, {value: '8', title: '专题论坛'}, {value: '1000', title: '参会伙伴'}]})},
  ];
  s.brand = {name: 'QuanK', primary: '#0078CB', accent: '#F59E0B'};
  s.miniapps = [
    {id: 'ma1', name: '团队周报打卡表', updated: now - 2 * H, versions: 2, dataItems: 18, bytes: 9800, note: '加了按周筛选和完成率'},
    {id: 'ma2', name: '报价计算器', updated: now - 20 * H, versions: 0, dataItems: 4, bytes: 6200, note: '首次生成'},
    {id: 'ma3', name: '会议计时器', updated: now - 30 * H, versions: 1, dataItems: 0, bytes: 4100, note: '超时变红并提醒'},
    {id: 'ma4', name: '采购台账', updated: now - 70 * H, versions: 3, dataItems: 46, bytes: 15300, note: '导出 CSV'},
  ];
  s.connectors = [];
  return {...s, documents: s.documents, browsers: [], capabilityPresets: capabilityPresets(), codeProjects: [], modelProfiles: [],
    mcpConnections: [{id: 'mcp-ctx', name: 'Context7 文档检索', description: '查询开源库的最新文档与示例', url: 'https://mcp.context7.com/mcp', enabled: true, auth: 'bearer', hasToken: true, lastTest: {status: 'succeeded', tools: [{name: 'resolve-library-id', description: '查找库'}, {name: 'get-library-docs', description: '读取文档'}]}}],
    skillPackages: [{id: 'sk-report', name: 'willbuddy-office-report', description: '按公司模板生成周报、月报与经营分析 Word 文档', enabled: true, files: [{path: 'SKILL.md'}, {path: 'template.docx'}], bytes: 48213, preset: {id: 'wb-office-report'}}], imageAttachments: [], officeEdits: [], officeNative: true, officeWorkspace: true, desktop: {platform: 'darwin', shortcutReady: true}};
}

const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://local').pathname, f = path.resolve(root, '.' + (p === '/' ? '/index.html' : p));
    if (!f.startsWith(root)) throw Error();
    res.setHeader('content-type', ({'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml'})[path.extname(f)] || 'application/octet-stream');
    res.end(await readFile(f));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
await mkdir(outDir, {recursive: true});
const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH});
const errors = [], shots = [];
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}, deviceScaleFactor: 2});
  page.on('pageerror', e => errors.push(e.message));
  const state = demoState();
  const QUANT_DETAIL = demoQuantDetail(); // [ux12]
  await page.exposeFunction('wbHost', async name => name === 'quant' ? {state: structuredClone(state), result: structuredClone(QUANT_DETAIL)} : structuredClone(state));
  await page.addInitScript(() => {
    window.actwill = new Proxy({}, {get: (_t, k) => typeof k !== 'string' ? undefined : k.startsWith('on') ? () => () => {} : p => window.wbHost(k, p)});
  });
  await page.goto(base + '/index.html');
  await page.waitForSelector('#prompt');
  await page.waitForTimeout(400);
  const shot = async (name, prep) => {
    await prep(); await page.waitForTimeout(350);
    const file = path.join(outDir, name);
    await page.screenshot({path: file});
    shots.push(name); log('saved', name);
  };
  const openChat = id => page.click(`[data-action="openChat"][data-id="${id}"]`);
  const toBottom = () => page.evaluate(() => { const s = document.querySelector('.messages-scroll'); if (s) s.scrollTop = s.scrollHeight; });

  await shot('app-slash.png', async () => {
    await page.click('[data-page="home"]');
    await page.fill('#prompt', '/');
    await page.dispatchEvent('#prompt', 'input');
  });
  await page.keyboard.press('Escape'); await page.fill('#prompt', '');
  await shot('app-memory.png', async () => { await openChat('c-mem'); await page.evaluate(() => document.querySelectorAll('details.memory-sources').forEach(d => d.open = true)); });
  await shot('app-memory-page.png', async () => { await page.evaluate(() => document.querySelector('[data-page="context"]')?.click()); });
  await shot('app-plan.png', async () => { await openChat('c-plan'); await toBottom(); });
  await shot('app-research-outline.png', async () => { await openChat('c-outline'); await toBottom(); });
  await shot('app-research-report.png', async () => { await openChat('c-research'); await toBottom(); });
  const morePage = id => page.evaluate(id => { const d = document.querySelector('details.more-nav'); if (d) d.open = true; document.querySelector(`[data-page="${id}"]`)?.click(); }, id);
  await shot('app-tasks.png', async () => { await morePage('tasks'); await page.evaluate(() => document.querySelector('.workspace')?.scrollTo(0, 0)); });
  await shot('app-feed.png', async () => { await page.click('[data-page="feed"]'); });
  await shot('app-approvals.png', async () => { await morePage('tools'); });
  // [ux12] v0.44 pages
  await shot('app-agents.png', async () => { await morePage('agents'); await page.evaluate(() => document.querySelector('.workspace')?.scrollTo(0, 0)); });
  await shot('app-skills.png', async () => { await page.click('[data-action="capabilityTab"][data-id="skills"]'); });
  await shot('app-mcp.png', async () => { await page.click('[data-action="capabilityTab"][data-id="mcp"]'); });
  await page.click('[data-action="capabilityTab"][data-id="agents"]');
  await shot('app-quant.png', async () => { await morePage('quant'); });
  await shot('app-quant-detail.png', async () => { await page.click('[data-action="quantOpen"][data-id="600519"]'); await page.waitForSelector('.q-hero'); await page.waitForTimeout(2500); });
  await page.click('[data-action="quantClose"]');
  await shot('app-infographic.png', async () => { await morePage('studio'); await page.click('[data-action="studioTab"][data-id="infographics"]'); await page.waitForTimeout(600); });
  await shot('app-miniapps.png', async () => { await page.click('[data-action="studioTab"][data-id="miniapps"]'); });
  console.log('APP-SHOTS ' + JSON.stringify({outDir, shots, errors}));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
  server.closeAllConnections(); await new Promise(r => server.close(r));
}
