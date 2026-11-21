// [F4] 组合与风控 UI: the 组合与风控 box on the 量化 page (lazy: filled by mountPortfolio, tabs 总览 / 风控 / 风险指标 /
// 压力测试), forms for manual holdings, cash, rules, stop prices, scenarios and rebalance simulation, and result views.
// Exported together as portfolioUI for app.js. Buttons use data-action so app.js handles them like any other action.
import { escape } from './markdown.js';
import { RULE_INTERVALS, BENCH, fmt } from '../shared/portfolio.js';

const val = (fm, n) => String((typeof fm?.get === 'function' ? fm.get(n) : fm?.querySelector?.(`[name="${n}"]`)?.value ?? fm?.elements?.[n]?.value) ?? '');
const on = (fm, n) => typeof fm?.get === 'function' ? fm.get(n) !== null : !!(fm?.querySelector?.(`[name="${n}"]`)?.checked ?? fm?.elements?.[n]?.checked);
const btn = (label, act, id = '', kind = 'secondary') => `<button type="button" class="${kind}" data-action="${act}" data-id="${escape(id)}">${label}</button>`;
const money = v => escape(fmt.money(v)), pct = v => escape(fmt.pct(v));
const tone = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
const kpi = (label, v, cls = '', sub = '') => `<div class="q-kpi ${cls}"><small>${escape(label)}</small><b>${v}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
const LEVEL = {high: ['pf-high', '重要'], medium: ['pf-medium', '关注'], low: ['pf-low', '提示']};
const clean = e => String(e?.message || e).replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^(Type)?Error:\s*/, '').replace(/^fetch failed$/, '行情服务暂时连不上，请检查网络后点「刷新」');

/** 量化 page placeholder; mountPortfolio fills it. */
export function portfolioBox(pf, {action = btn} = {}) {
  const p = pf || {};
  const tools = action('＋ 录入持仓', 'pfHoldingNew') + action('现金', 'pfCash') + action('风控规则', 'pfRules') + action('生成报告', 'pfReport') + '<button type="button" data-pf-refresh>刷新</button>';
  return `<section class="q-box pf-box" id="portfolioBox"><div class="plaza-section-head"><h2>组合与风控</h2><small>${escape(p.rulesText || '风控提醒未开启')} · 只提醒、只计算，不会替你下单。</small><span class="q-head-tools">${tools}</span></div><div class="mk-seg pf-tabs"><button type="button" data-pf="overview" class="chosen">组合总览</button><button type="button" data-pf="rules">风控提醒</button><button type="button" data-pf="risk">风险指标</button><button type="button" data-pf="stress">压力测试</button></div><div class="pf-body"><p class="empty-note">正在汇总持仓…</p></div></section>`;
}

const breachList = (list, {limit = 50} = {}) => list?.length ? `<ul class="pf-breaches">${list.slice(0, limit).map(b => { const [cls, txt] = LEVEL[b.level] || LEVEL.low; return `<li class="${cls}"><span class="pf-level">${txt}</span><span class="pf-label">${escape(b.label || '')}</span><span class="pf-text"><b>${escape(b.title)}</b>${b.detail ? `<small>${escape(b.detail)}</small>` : ''}</span>${b.code ? btn('详情', 'quantOpen', b.code) : ''}</li>`; }).join('')}</ul>` : '<p class="empty-note pf-ok">当前没有触发任何风控规则。</p>';

export function overviewHtml(o) {
  const s = o?.summary;
  if (!s || !s.stocks) return `<p class="empty-note">还没有持仓。引擎里记录了成交的股票会自动汇总进来（量化页「持仓与定投」→「刷新持仓」）；没有在引擎里记录的持仓，点「＋ 录入持仓」填股票、股数和成本价即可。</p>${o?.breaches?.length ? breachList(o.breaches) : ''}`;
  const kpis = `<div class="q-kpis pf-kpis">${kpi('总资产', money(s.total), '', `股票 ${escape(String(s.stockPct ?? '—'))}% · 现金 ${escape(String(s.cashPct ?? '—'))}%`)}${kpi('股票市值', money(s.invested))}${kpi('现金', money(s.cash))}${kpi('浮动盈亏', `${money(s.pnl)} <small>${pct(s.pnlPct)}</small>`, tone(s.pnl))}${kpi('今日盈亏', money(s.dayPnl), tone(s.dayPnl))}${kpi('持股', `${s.stocks} 只`, '', s.effective ? `有效持股数 ${escape(String(s.effective))}` : '')}</div>`;
  const warn = o.breaches?.filter(b => b.level !== 'low').length ? `<div class="pf-alert-strip">${breachList(o.breaches.filter(b => b.level !== 'low'), {limit: 4})}</div>` : '';
  const rows = s.positions.map(p => `<tr><td><b>${escape(p.name)}</b> <small>${escape(p.code)}</small> <span class="pf-src${p.source === 'manual' ? ' manual' : ''}">${p.source === 'manual' ? '手动' : '引擎'}</span></td><td>${escape(p.industry)}</td><td>${escape(String(p.shares))}</td><td>${escape(String(p.cost))}</td><td>${p.price === null ? '—' : escape(String(p.price))}${p.dayPct !== null && p.dayPct !== undefined ? ` <small class="${tone(p.dayPct)}">${pct(p.dayPct)}</small>` : ''}</td><td>${money(p.value)}</td><td>${p.weight === null ? '—' : escape(String(p.weight)) + '%'}</td><td class="${tone(p.pnl)}">${money(p.pnl)} <small>${pct(p.pnlPct)}</small></td><td>${p.stopPrice ? escape(String(p.stopPrice)) : '—'}</td><td class="pf-acts">${btn('止损价', 'pfStop', p.code)}${p.source === 'manual' ? btn('编辑', 'pfHoldingEdit', p.code) + btn('删除', 'pfHoldingRemove', p.code) : ''}${btn('详情', 'quantOpen', p.code)}</td></tr>`).join('');
  const table = `<div class="table-scroll"><table class="q-table pf-table"><thead><tr><th>股票</th><th>行业</th><th>持股</th><th>成本</th><th>现价</th><th>市值</th><th>仓位</th><th>浮动盈亏</th><th>止损价</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const errs = Object.keys(o.errors || {}).length ? `<p class="hint">${escape(Object.keys(o.errors).join('、'))} 的历史行情没有取到，组合曲线暂不含这几只。</p>` : '';
  return `${kpis}${warn}<h4>组合市值与回撤</h4><div class="pf-chart">${o.svg?.nav || ''}</div>${errs}<div class="pf-cols"><div><h4>个股仓位</h4><div class="pf-chart">${o.svg?.stocks || ''}</div></div><div><h4>行业分布</h4><div class="pf-chart">${o.svg?.industries || ''}</div></div></div><h4>持仓明细</h4>${table}
<p class="auto-note">价格为实时行情；组合曲线按当前持股数量回溯近一年行情估算（不是实际交易记录），灰线为${escape(BENCH.name)}。手动录入的持仓优先于引擎里同一只股票的持仓。</p>`;
}

export function rulesHtml(o, pf) {
  const v = pf || {}, alerts = v.alerts || [];
  const hist = alerts.length ? `<div class="table-scroll"><table class="q-table"><thead><tr><th>时间</th><th>类型</th><th>内容</th></tr></thead><tbody>${alerts.map(a => `<tr><td>${escape(new Date(a.time).toLocaleString('zh-CN', {hour12: false}))}</td><td>${escape(a.label || '')}</td><td>${escape(a.title)}${a.detail ? ` <small>${escape(a.detail)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty-note">还没有发出过风控提醒。</p>';
  return `<p class="pf-rules-line"><span>${escape(o?.rulesText || v.rulesText || '')}</span> ${btn('修改规则', 'pfRules')} ${btn('立即检查', 'pfCheck')}</p><h4>当前状态</h4>${breachList(o?.breaches || [])}<h4>提醒记录 ${alerts.length ? btn('清空', 'pfClearAlerts') : ''}</h4>${hist}${v.lastError ? `<p class="task-error">上次检查失败：${escape(v.lastError)}</p>` : ''}
<p class="auto-note">交易时段按设定间隔检查，收盘后再检查一次；同一条提醒每天只发一次，进入「动态」并发系统通知（可在规则里关闭通知）。需要 QuanK 保持运行。</p>`;
}

// high positive correlation = little diversification (brand blue-violet, darker = higher); negative = soft grey-green
const corrColor = v => v === null ? '#f5f7fb' : v >= 0.999 ? '#e8eeff' : v >= 0 ? `rgba(47,98,245,${(0.06 + v * 0.5).toFixed(2)})` : `rgba(24,160,88,${(0.06 - v * 0.35).toFixed(2)})`;
export function riskHtml(r) {
  const m = r?.metrics;
  if (!m) return `<p class="empty-note">历史行情不足 20 个交易日，暂时算不出风险指标。${r?.errors && Object.keys(r.errors).length ? '部分股票的行情没有取到，请点「刷新」重试。' : ''}</p>`;
  const k = `<div class="q-kpis pf-kpis">${kpi('年化波动率', escape(m.volatility + '%'))}${kpi('最大回撤', escape(m.maxDrawdown + '%'), 'down', `${escape(m.drawdownFrom)} → ${escape(m.drawdownTo)}`)}${kpi('当前回撤', escape(m.currentDrawdown + '%'))}${kpi(`Beta（对${BENCH.name}）`, escape(String(m.beta ?? '—')), '', `相关系数 ${escape(String(m.benchCorr ?? '—'))}`)}${kpi('单日 VaR 95%', `${escape(m.var95 + '%')} <small>≈ ${money(m.varAmount)}</small>`, 'down', `CVaR ${escape(m.cvar95 + '%')} ≈ ${money(m.cvarAmount)}`)}${kpi('区间收益', pct(m.totalReturn), tone(m.totalReturn), `${escape(BENCH.name)} ${pct(m.benchReturn)}`)}</div>`;
  const betas = Object.entries(r.betas || {}).map(([c, b]) => `<tr><td><b>${escape(b.name || c)}</b> <small>${escape(c)}</small></td><td>${b.weight === null || b.weight === undefined ? '—' : escape(b.weight + '%')}</td><td>${escape(String(b.beta ?? '—'))}</td><td>${escape(String(b.adjusted ?? '—'))}</td><td>${escape(String(b.corr ?? '—'))}</td></tr>`).join('');
  const c = r.corr;
  const heat = c?.codes?.length > 1 ? `<div class="table-scroll"><table class="q-table pf-corr"><thead><tr><th></th>${c.names.map(n => `<th>${escape(n)}</th>`).join('')}</tr></thead><tbody>${c.matrix.map((row, i) => `<tr><th>${escape(c.names[i])}</th>${row.map(v => `<td style="background:${corrColor(v)};color:${v !== null && v >= 0.6 && v < 0.999 ? '#fff' : '#24324f'}">${v === null ? '—' : escape(String(v))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${c.high.length ? `<p class="hint">高度相关（≥ 0.7）：${escape(c.high.slice(0, 6).map(p => `${p.names[0]} / ${p.names[1]} ${p.corr}`).join('；'))}。这几只往往同涨同跌，分散效果有限。</p>` : ''}` : '<p class="empty-note">持有两只以上股票时显示相关性矩阵。</p>';
  return `${k}<h4>组合市值与回撤</h4><div class="pf-chart">${r.svg || ''}</div><div class="pf-cols"><div><h4>个股 Beta</h4><div class="table-scroll"><table class="q-table"><thead><tr><th>股票</th><th>仓位</th><th>实测 Beta</th><th>调整后 Beta</th><th>与大盘相关</th></tr></thead><tbody>${betas}</tbody></table></div></div><div><h4>持仓相关性（近 120 个交易日日收益）</h4>${heat}</div></div>
<p class="auto-note">按当前持股回溯 ${escape(String(m.days))} 个交易日（${escape(m.from)} 至 ${escape(m.to)}）估算。VaR 为历史模拟法：过去 95% 的交易日里，单日亏损没有超过这个数。</p>`;
}

export function stressResultRows(list) {
  return `<div class="table-scroll"><table class="q-table pf-stress"><thead><tr><th>情景</th><th>组合损失</th><th>占总资产</th><th>情景后总资产</th><th>拖累最大</th><th>会触发止损</th></tr></thead><tbody>${list.map(x => `<tr><td>${escape(x.scenario.title)}</td><td class="${tone(x.loss)}">${money(x.loss)}</td><td class="${tone(x.lossPct)}">${pct(x.lossPct)}</td><td>${money(x.after)}</td><td>${x.worst ? `${escape(x.worst.name)} <small>${money(x.worst.loss)}</small>` : '—'}</td><td>${escape(x.stops.join('、') || '—')}</td></tr>`).join('')}</tbody></table></div>`;
}
export function stressHtml(s) {
  if (!s?.results?.length || !s.total) return '<p class="empty-note">还没有持仓，录入持仓后可以做压力测试。</p>';
  const one = s.results.find(x => x.scenario.kind === 'market' && x.scenario.pct === -10) || s.results[0];
  const detail = `<div class="table-scroll"><table class="q-table"><thead><tr><th>股票</th><th>市值</th><th>冲击</th><th>依据</th><th>损失</th><th>情景后浮动</th></tr></thead><tbody>${one.rows.map(r => `<tr><td>${escape(r.name)}</td><td>${money(r.value)}</td><td class="${tone(r.shock)}">${pct(r.shock)}</td><td>${escape(r.basis || '—')}</td><td class="${tone(r.loss)}">${money(r.loss)}</td><td class="${tone(r.pnlPct)}">${pct(r.pnlPct)}${r.stop ? ' <b class="down">触发止损</b>' : ''}</td></tr>`).join('')}</tbody></table></div>`;
  return `<p class="pf-rules-line">预置情景按当前持仓估算；也可以自定义情景，或输入几笔调仓对比前后的风险。 ${btn('自定义情景', 'pfScenario')} ${btn('模拟调仓', 'pfSimulate')}</p><h4>情景结果</h4>${stressResultRows(s.results)}<h4>明细：${escape(one.scenario.title)}</h4>${detail}
<p class="auto-note">大盘情景按各股相对${escape(BENCH.name)}的调整后 Beta 传导（0.67 × 近一年实测 Beta + 0.33，向 1 收敛，避免个别股票历史相关性偏低时低估风险；限制在 0–3）；行业 / 个股情景只影响对应持仓；现金不受影响。结果是估算，不是预测。</p>`;
}
export function simulateHtml(r) {
  const a = r.before, b = r.after;
  const row = (label, x, y, f = money) => `<tr><td>${escape(label)}</td><td>${f(x)}</td><td>${f(y)}</td></tr>`;
  const w = new Map(a.positions.map(p => [p.code, p.weight])), names = new Map([...a.positions, ...b.positions].map(p => [p.code, p.name]));
  const codes = [...new Set([...a.positions.map(p => p.code), ...b.positions.map(p => p.code)])], wb = new Map(b.positions.map(p => [p.code, p.weight]));
  return `<p>${r.changes.map(c => `${escape(c.name)} ${c.delta > 0 ? '买入' : '卖出'} ${Math.abs(c.delta)} 股 @ ${escape(String(c.price))}`).join('；')}</p>${r.shortfall ? `<p class="task-error">现金不足，还差 ${money(r.shortfall)}。</p>` : ''}
<div class="table-scroll"><table class="q-table"><thead><tr><th></th><th>调仓前</th><th>调仓后</th></tr></thead><tbody>${row('总资产', a.total, b.total)}${row('股票仓位', a.stockPct, b.stockPct, v => escape(v === null ? '—' : v + '%'))}${row('现金', a.cash, b.cash)}${row('有效持股数', a.effective, b.effective, v => escape(String(v ?? '—')))}${row('大盘跌 10% 时损失', r.stressBefore.loss, r.stressAfter.loss)}${row('风控提醒', r.breachesBefore.length, r.breachesAfter.length, v => escape(String(v)))}</tbody></table></div>
<h4>仓位变化</h4><div class="table-scroll"><table class="q-table"><thead><tr><th>股票</th><th>调仓前</th><th>调仓后</th></tr></thead><tbody>${codes.map(c => `<tr><td>${escape(names.get(c) || c)}</td><td>${w.has(c) ? escape(w.get(c) + '%') : '—'}</td><td>${wb.has(c) ? escape(wb.get(c) + '%') : '—'}</td></tr>`).join('')}</tbody></table></div>
${r.breachesAfter.length ? `<h4>调仓后仍会触发</h4>${breachList(r.breachesAfter)}` : '<p class="empty-note pf-ok">调仓后没有触发风控规则。</p>'}<p class="auto-note">${escape(r.note || '只做计算，不会下单。')}</p>`;
}

// ---------- forms ----------
export function holdingForm(m = {}) {
  return `<div class="form-row"><label>股票代码<input name="code" maxlength="6" required pattern="\\d{6}" value="${escape(m.code || '')}" ${m.code ? 'readonly' : ''} placeholder="600438"></label><label>名称（可留空）<input name="name" maxlength="20" value="${escape(m.name || '')}"></label></div>
<div class="form-row"><label>持股数量<input name="shares" type="number" min="1" step="1" required value="${escape(m.shares ?? '')}"></label><label>成本价<input name="cost" type="number" min="0.0001" step="0.0001" required value="${escape(m.cost ?? '')}"></label><label>止损价（可留空）<input name="stopPrice" type="number" min="0" step="0.0001" value="${escape(m.stopPrice ?? '')}"></label></div>
<label>备注<input name="note" maxlength="60" value="${escape(m.note || '')}" placeholder="例如：华泰账户"></label><p class="hint">只保存在本机，用于组合汇总和风控提醒；和引擎里同一只股票的持仓并存时，以这里为准。</p>`;
}
export const holdingPayload = fm => ({action: 'holdingSave', code: val(fm, 'code').trim(), name: val(fm, 'name').trim(), shares: val(fm, 'shares'), cost: val(fm, 'cost'), stopPrice: val(fm, 'stopPrice'), note: val(fm, 'note')});
export const cashForm = cash => `<label>账户现金（元）<input name="cash" type="number" min="0" step="0.01" value="${escape(cash ?? 0)}"></label><p class="hint">用于计算总资产和仓位比例；不填则按 0 计算。</p>`;
export const cashPayload = fm => ({action: 'cash', cash: val(fm, 'cash') || '0'});
const numIn = (name, label, v, hint = '') => `<label>${label}<input name="${name}" type="number" min="0" step="0.1" value="${v === null || v === undefined || v === 100 && /max/.test(name) ? '' : escape(v)}" placeholder="${hint}"></label>`;
export function rulesForm(r = {}) {
  return `<label class="check"><input type="checkbox" name="enabled" ${r.enabled === false ? '' : 'checked'}> 开启风控提醒</label>
<div class="form-row">${numIn('stopLoss', '止损线：亏损 %', r.stopLoss, '留空不提醒')}${numIn('takeProfit', '止盈线：盈利 %', r.takeProfit, '留空不提醒')}${numIn('trailing', '回撤止盈：高点回落 %', r.trailing, '留空不提醒')}</div>
<div class="form-row">${numIn('maxPosition', '单股仓位上限 %', r.maxPosition, '留空不限')}${numIn('maxIndustry', '单行业仓位上限 %', r.maxIndustry, '留空不限')}${numIn('maxDrawdown', '组合回撤线 %', r.maxDrawdown, '留空不提醒')}</div>
<div class="form-row"><label>检查间隔<select name="interval">${RULE_INTERVALS.map(n => `<option value="${n}" ${n === (r.interval || 15) ? 'selected' : ''}>每 ${n} 分钟</option>`).join('')}</select></label></div>
<label class="check"><input type="checkbox" name="notices" ${r.notices === false ? '' : 'checked'}> 持仓股出现风险公告（立案、问询、处罚、质押、减持等）时提醒</label>
<label class="check"><input type="checkbox" name="notify" ${r.notify === false ? '' : 'checked'}> 发送系统通知</label><p class="hint">只提醒，不会替你下单。单只股票的止损价可以在持仓表里单独设置，优先于止损线。</p>`;
}
export const rulesPayload = fm => ({action: 'rules', rules: {enabled: on(fm, 'enabled'), notices: on(fm, 'notices'), notify: on(fm, 'notify'), interval: Number(val(fm, 'interval')) || 15, stopLoss: val(fm, 'stopLoss'), takeProfit: val(fm, 'takeProfit'), trailing: val(fm, 'trailing'), maxPosition: val(fm, 'maxPosition'), maxIndustry: val(fm, 'maxIndustry'), maxDrawdown: val(fm, 'maxDrawdown')}});
export const stopForm = (p = {}) => `<p>${escape(p.name || p.code)}，成本 ${escape(String(p.cost ?? '—'))}，现价 ${escape(String(p.price ?? '—'))}</p><label>止损价（留空取消）<input name="stopPrice" type="number" min="0" step="0.0001" value="${escape(p.stopPrice ?? '')}"></label>`;
export const stopPayload = (fm, code) => ({action: 'rules', rules: {stops: {[code]: {stopPrice: val(fm, 'stopPrice')}}}});
export function scenarioForm(summary = {}) {
  const inds = (summary.byIndustry || []).map(g => g.industry), stocks = summary.positions || [];
  return `<label>情景类型<select name="kind"><option value="market">大盘涨跌（按 Beta 传导）</option><option value="industry">某个行业涨跌</option><option value="stock">某只股票涨跌</option></select></label>
<div class="form-row"><label>涨跌幅 %<input name="pct" type="number" min="-90" max="50" step="0.1" value="-15" required></label><label>行业（行业情景）<select name="industry">${inds.map(i => `<option>${escape(i)}</option>`).join('') || '<option value="">—</option>'}</select></label><label>股票（个股情景）<select name="code">${stocks.map(p => `<option value="${escape(p.code)}">${escape(p.name)}</option>`).join('') || '<option value="">—</option>'}</select></label></div>`;
}
export const scenarioPayload = fm => ({action: 'stress', scenario: {kind: val(fm, 'kind'), pct: val(fm, 'pct'), industry: val(fm, 'industry'), code: val(fm, 'code')}});
export const simulateForm = () => `<label>调仓（每行一笔：代码 股数 [价格]，正数买入、负数卖出）<textarea name="changes" rows="4" placeholder="600438 -2000&#10;600519 100 1450"></textarea></label><p class="hint">不填价格时按现价计算。只做计算，不会下单。</p>`;
export function parseChanges(text) {
  const out = [];
  for (const line of String(text || '').split(/[\n;；]+/).map(s => s.trim()).filter(Boolean)) {
    const m = /^(\d{6})\s*[,，\s]\s*([+-]?\d+)(?:\s*[,，\s@]\s*(\d+(?:\.\d+)?))?$/.exec(line);
    if (!m) throw new Error(`看不懂这一行：「${line}」，格式是「代码 股数 [价格]」`);
    out.push({code: m[1], delta: Number(m[2]), ...(m[3] ? {price: Number(m[3])} : {})});
  }
  if (!out.length) throw new Error('请至少填写一笔调仓');
  return out;
}
export const simulatePayload = fm => ({action: 'simulate', changes: parseChanges(val(fm, 'changes'))});

const caches = new WeakMap();
/** Fill #portfolioBox: tab switch, lazy loading through call({action}), 5-minute cache per document; errors are never cached. */
export function mountPortfolio(root, call, {now = Date.now, view = () => null} = {}) {
  if (root && !caches.has(root)) caches.set(root, {tab: 'overview', data: new Map()});
  const c = caches.get(root) || {tab: 'overview', data: new Map()};
  const box = root?.querySelector?.('#portfolioBox');
  if (!box || box.dataset.bound) return;
  box.dataset.bound = '1';
  const body = box.querySelector('.pf-body');
  const paint = async (fresh = false) => {
    const tab = c.tab;
    for (const b of box.querySelectorAll('[data-pf]')) b.classList.toggle('chosen', b.dataset.pf === tab);
    const act = tab === 'rules' ? 'overview' : tab, hit = c.data.get(act);
    let d = !fresh && hit && now() - hit.at < 300e3 ? hit.data : null;
    if (!d) {
      if (body) body.innerHTML = `<p class="empty-note">${tab === 'risk' ? '正在计算风险指标…' : tab === 'stress' ? '正在做压力测试…' : '正在汇总持仓…'}</p>`;
      try { const out = await call({action: act, ...(fresh ? {fresh: true} : {})}); d = out?.result ?? out; c.data.set(act, {at: now(), data: d}); if (fresh) for (const k of [...c.data.keys()]) if (k !== act) c.data.delete(k); }
      catch (e) { if (body && box.isConnected) body.innerHTML = `<p class="task-error">${escape(clean(e))}</p>`; return; }
    }
    if (!box.isConnected || !body || c.tab !== tab) return;
    body.innerHTML = tab === 'overview' ? overviewHtml(d) : tab === 'rules' ? rulesHtml(d, view()) : tab === 'risk' ? riskHtml(d) : stressHtml(d);
  };
  box.addEventListener('click', e => { const t = e.target.closest?.('[data-pf]'); if (t) { c.tab = t.dataset.pf; paint(); return; } if (e.target.closest?.('[data-pf-refresh]')) paint(true); });
  paint();
}
/** Drop cached results after a change (holdings, cash, rules) so the next paint reloads. */
export function invalidatePortfolio(root) { const c = caches.get(root); if (c) c.data.clear(); }
export const cachedOverview = root => caches.get(root)?.data.get('overview')?.data || null;

export const portfolioUI = {portfolioBox, overviewHtml, rulesHtml, riskHtml, stressHtml, stressResultRows, simulateHtml, holdingForm, holdingPayload, cashForm, cashPayload, rulesForm, rulesPayload, stopForm, stopPayload, scenarioForm, scenarioPayload, simulateForm, simulatePayload, parseChanges, mountPortfolio, invalidatePortfolio, cachedOverview};
