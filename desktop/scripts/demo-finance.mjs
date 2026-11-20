// [v45] Finance additions to the README / video demo state (demo data only; no real strategy, account or holdings).
import {emptyGraph, mergeExtraction} from '../src/shared/graph.js';
const H = 3600e3;
const series = (seed, start, drift, n = 60) => { const out = []; let p = start; for (let i = 0; i < n; i++) { p *= 1 + Math.sin((i + seed) / 5.3) * 0.011 + Math.cos((i * 1.7 + seed) / 9) * 0.006 + drift; out.push(Math.round(p * 100) / 100); } return out; };

export function financeDemo(s, now = Date.now()) {
  const spark = {'600519': series(1, 1580, 0.0012), '600036': series(4, 39.8, 0.0006), '300750': series(7, 285, -0.0011), '000333': series(2, 70.2, 0.0016), '601318': series(9, 57.3, -0.0017), '002594': series(5, 305, 0.0003)};
  for (const p of s.quant.pool) { p.spark = spark[p.code]; if (p.spark) p.last.price = p.spark.at(-1); }
  s.quant.features = {holdings: true, record: true, plan: true, planSet: true, lot: 100};
  s.quant.planOptions = [{type: 'day', label: '每天', min: 1, max: 5}, {type: 'week', label: '每周', min: 1, max: 5}, {type: 'month', label: '每月', min: 1, max: 22}];
  s.quant.plan = {label: '每周 1 次', type: 'week', times: 1, maxMultiplier: 2};
  const hold = (code, shares, cost) => { const price = spark[code].at(-1); return {code, shares, cost, cash: 25000, trades: 6, price, value: Math.round(shares * price * 100) / 100, pnl: Math.round((price - cost) * shares * 100) / 100, pnlPct: Math.round((price / cost - 1) * 10000) / 100, budget: 100,
    log: [{date: '2026-11-18', time: '10:02:11', side: 'buy', price: Math.round(cost * 0.99 * 100) / 100, shares: 100, amount: Math.round(cost * 99), note: '按计划定投'}, {date: '2026-11-11', time: '14:35:40', side: 'buy', price: Math.round(cost * 1.01 * 100) / 100, shares: 100, amount: Math.round(cost * 101), note: ''}]}; };
  s.quant.holdings = {'600519': hold('600519', 200, 1540), '000333': hold('000333', 1200, 68.4), '601318': hold('601318', 800, 55.9)};
  s.quant.watch = {enabled: true, interval: 5, notify: true, premarket: true, premarketTime: '09:15'};
  s.quant.lastWatch = now - 3 * 60e3;
  s.quant.alerts = [
    {id: 'a1', kind: 'change', time: now - 25 * 60e3, code: '000333', name: '美的集团', from: 'BUY', to: 'STRONG_BUY', toText: '加倍定投', score: 81.2, reason: '综合分升至 81'},
    {id: 'a2', kind: 'report', time: now - 50 * 60e3, reportId: 'daily', title: '算法日报', ok: true, summary: '当日 24 条研判，方向对打率 8%，无系统性偏差', warnings: []},
    {id: 'a3', kind: 'change', time: now - 2 * H, code: '601318', name: '中国平安', from: 'HOLD', to: 'SELL', toText: '分批减仓', score: 31.5},
    {id: 'a4', kind: 'digest', time: now - 5 * H, counts: {total: 6, buy: 2, sell: 1, failed: 0}, items: []}];
  s.quant.reportDefs = [{id: 'daily', title: '算法日报', schedule: 'daily'}, {id: 'outcome', title: '信号结果评估', schedule: 'manual'}];
  s.quant.reportAuto = {enabled: true, time: '18:00', minutes: 1080};
  s.quant.reports = {daily: {id: 'daily', title: '算法日报', at: now - 50 * 60e3, date: '2026-11-20', ok: true, summary: '当日 24 条研判，方向对打率 8%，无系统性偏差', metrics: [{label: '研判条数', value: '24'}, {label: '方向对打率', value: '8.3%'}, {label: 'AI 降噪', value: '5'}], warnings: [], items: [], ms: 2100}};
  const fin = [
    {id: 'fin-research', name: '投研分析师', description: '个股与行业研究、财报点评、投资备忘录', prompt: '演示'},
    {id: 'fin-modeler', name: '财务建模师', description: '三表联动模型、DCF 与可比估值，交付可核对的 Excel', prompt: '演示'},
    {id: 'fin-quant', name: '量化策略助手', description: '解读本机策略信号、盯盘提醒、日报与回测复盘', prompt: '演示'},
    {id: 'fin-risk', name: '风控合规官', description: '组合风险指标、合规审阅与敏感信息脱敏', prompt: '演示'}];
  s.agents = [...(s.agents || []).filter(a => !a.id.startsWith('fin-')), ...fin];
  s.financeAgentsSeeded = true;
  // [v45k] 智能记忆 demo: a small knowledge graph and finance-flavoured memories (demo data)
  const X = {entities: [
    {name: '贵州茅台', type: 'org', summary: '白酒龙头，自选股'}, {name: '宁德时代', type: 'org', summary: '动力电池龙头，自选股'}, {name: '比亚迪', type: 'org', summary: '新能源整车，自选股'},
    {name: '招商银行', type: 'org', summary: '零售银行，自选股'}, {name: '美的集团', type: 'org', summary: '家电龙头，自选股'}, {name: '中国平安', type: 'org', summary: '综合金融，自选股'},
    {name: '张伟', type: 'person', summary: '消费行业研究员'}, {name: '李娜', type: 'person', summary: '新能源行业研究员'}, {name: '王磊', type: 'person', summary: '组合经理'},
    {name: '白酒行业跟踪', type: 'project', summary: '每周更新批价与库存'}, {name: '新能源产业链', type: 'project', summary: '电池、整车、上游材料'}, {name: '稳健定投组合', type: 'project', summary: '每周 1 次，倍率上限 2 倍'},
    {name: '飞天茅台', type: 'product', summary: '核心大单品'}, {name: '麒麟电池', type: 'product', summary: '第三代 CTP 电池'},
    {name: '三季报', type: 'event', summary: '2026 年三季度财报'}, {name: '成都', type: 'place', summary: '团队所在地'}],
    relations: [
      {from: '张伟', to: '白酒行业跟踪', type: '负责'}, {from: '李娜', to: '新能源产业链', type: '负责'}, {from: '王磊', to: '稳健定投组合', type: '管理'},
      {from: '贵州茅台', to: '白酒行业跟踪', type: '属于'}, {from: '宁德时代', to: '新能源产业链', type: '属于'}, {from: '比亚迪', to: '新能源产业链', type: '属于'},
      {from: '贵州茅台', to: '飞天茅台', type: '生产'}, {from: '宁德时代', to: '麒麟电池', type: '量产'}, {from: '比亚迪', to: '宁德时代', type: '供应链合作'},
      {from: '稳健定投组合', to: '贵州茅台', type: '持有'}, {from: '稳健定投组合', to: '美的集团', type: '持有'}, {from: '稳健定投组合', to: '中国平安', type: '持有'},
      {from: '稳健定投组合', to: '招商银行', type: '观察'}, {from: '贵州茅台', to: '三季报', type: '发布'}, {from: '宁德时代', to: '三季报', type: '发布'},
      {from: '王磊', to: '成都', type: '位于'}, {from: '张伟', to: '王磊', type: '汇报给'}, {from: '李娜', to: '王磊', type: '汇报给'}]};
  let n = 0; const g = emptyGraph();
  mergeExtraction(g, X, {key: 'chat:c-fin', title: '贵州茅台个股研究'}, {now: now - 3 * H, uid: () => 'ge' + (++n)});
  s.graph = {...g, status: {lastRun: now - 40 * 60e3, pending: 0}};
  s.memories = [
    {id: 'mf1', text: '关注白酒与新能源两条主线，个股研究先给结论', kind: 'preference', source: 'user', created: now - 120 * H, updated: now - 120 * H, uses: 14, lastUsed: now - H},
    {id: 'mf2', text: '研报需要附估值区间和三条主要风险', kind: 'preference', source: 'user', created: now - 100 * H, updated: now - 100 * H, uses: 9, lastUsed: now - 2 * H},
    {id: 'mf3', text: '单只股票仓位不超过组合的 20%', kind: 'rule', source: 'user', created: now - 90 * H, updated: now - 90 * H, uses: 6, lastUsed: now - 5 * H},
    {id: 'mf4', text: '定投节奏：每周 1 次，倍率上限 2 倍', kind: 'profile', source: 'auto', created: now - 60 * H, updated: now - 60 * H, uses: 4, lastUsed: now - 20 * H},
    ...(s.memories || [])];

  s.brand = {...(s.brand || {}), primary: '#2F62F5', accent: '#8C7CFF'};
  s.activity = [{id: 'l2', title: '已记录买入', detail: '600519 100 股 @ 1532.4', time: now - 40 * 60e3}, ...(s.activity || [])];
  s.chats = [{id: 'c-fin', name: '贵州茅台个股研究', agentId: 'fin-research', time: now - 30 * 60e3, messages: [
    {role: 'user', content: '帮我做一份 600519 的个股研究，重点看估值和风险', time: now - 31 * 60e3},
    {role: 'assistant', time: now - 30 * 60e3, content: '## 贵州茅台（600519）个股研究 · 演示\n\n**一句话结论：** 盈利能力与现金流稳健，当前估值处于近五年中低分位；短期关注渠道库存与批价。\n\n| 指标 | 2024 | 2025 | 2026E |\n|---|---|---|---|\n| 营业收入（亿元） | 1,741 | 1,893 | 2,040 |\n| 归母净利润（亿元） | 862 | 935 | 1,006 |\n| 毛利率 | 91.9% | 92.1% | 92.0% |\n| PE（TTM） | 24.1 | 22.6 | 20.8 |\n\n**主要风险：** 批价波动、需求恢复不及预期、政策变化。\n\n> 本机量化引擎当前档位：**分批买入**，综合分 72.4（来自你自己的策略，仅供参考）。\n\n*演示数据，仅供研究，不构成投资建议。*'}]}, ...(s.chats || [])];
  return s;
}

export function financeDetail(detail, s) {
  return {...detail, holding: s.quant.holdings['600519']};
}
