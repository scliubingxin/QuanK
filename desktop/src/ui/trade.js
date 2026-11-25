// [v0.52] 半自动委托 UI: the box on the 量化 page (today's orders, caps, paper ledger), the settings form with the
// real-trading risk confirmation, the broker page panel (open / calibrate / forget login) and the fill dialog.
import { escape } from './markdown.js';
import { SIDE_TEXT, STATUS_TEXT, BROKER_FIELDS } from '../shared/trade.js';

const btn = (label, act, id = '', kind = 'secondary') => `<button type="button" class="${kind}" data-action="${act}" data-id="${escape(id)}">${label}</button>`;
const val = (fm, n) => String((typeof fm?.get === 'function' ? fm.get(n) : fm?.querySelector?.(`[name="${n}"]`)?.value ?? fm?.elements?.[n]?.value) ?? '');
const on = (fm, n) => typeof fm?.get === 'function' ? fm.get(n) !== null : !!(fm?.querySelector?.(`[name="${n}"]`)?.checked ?? fm?.elements?.[n]?.checked);
const money = v => v === null || v === undefined ? '—' : Math.abs(v) >= 1e4 ? `${Math.round(v / 100) / 100} 万` : `${Math.round(v)}`;
const time = t => t ? new Date(t).toLocaleTimeString('zh-CN', {hour12: false, hour: '2-digit', minute: '2-digit'}) : '';
const SRC = {signal: '信号', stop: '止损', manual: '手动'};
const TONE = {draft: 'warn', open: 'neutral', filling: 'neutral', awaiting: 'warn', submitted: 'neutral', filled: 'ok', partial: 'ok', cancelled: 'neutral', expired: 'neutral', blocked: 'bad', review: 'warn'};

function orderActs(o) {
  if (o.status === 'draft') return btn(o.mode === 'real' ? '下单（打开券商）' : '模拟下单', 'tdConfirm', o.id, 'primary') + btn('撤销', 'tdCancel', o.id);
  if (o.status === 'open') return btn('撤销', 'tdCancel', o.id);
  if (o.status === 'awaiting') return btn('我已提交', 'tdReport', `${o.id}:submitted`, 'primary') + btn('重新填单', 'tdConfirmAgain', o.id) + btn('撤销', 'tdCancel', o.id);
  if (o.status === 'submitted' || o.status === 'review') return btn('回填成交', 'tdFill', o.id, 'primary') + btn('读取委托列表', 'tdRead', o.id) + btn('已撤单', 'tdReport', `${o.id}:cancelled`);
  return '';
}
export function orderRow(o) {
  const amt = o.filledAmount ?? o.amount;
  const what = o.status === 'blocked' ? `<b>${escape(o.name)}</b> <small>${escape(o.code)}</small>` : `<b>${escape(o.name)}</b> <small>${escape(o.code)}</small> · ${escape(String(o.filledShares ?? o.shares))} 股 @ ${escape(String(o.filledPrice ?? o.price))} · ${escape(money(amt))} 元`;
  const sub = o.status === 'blocked' ? o.blockReason : [o.reason, ...(o.notes || [])].filter(Boolean).join('；');
  return `<li class="td-row td-${escape(o.side)} td-${escape(o.status)}"><span class="td-side">${SIDE_TEXT[o.side] || ''}</span><span class="td-main"><span class="td-what">${what}</span><small>${escape(SRC[o.source] || '')} · ${escape(time(o.created))}${o.multiplier !== null && o.multiplier !== undefined && o.side === 'buy' ? ` · 倍率 ${escape(String(o.multiplier))}` : ''}${sub ? ' · ' + escape(sub) : ''}</small></span><span class="sec-pill ${TONE[o.status] || ''}">${escape(o.mode === 'paper' && o.status === 'filled' ? '模拟成交' : STATUS_TEXT[o.status] || o.status)}</span><span class="td-acts">${orderActs(o)}</span></li>`;
}
export function tradeBox(tv, {action = btn} = {}) {
  const v = tv || {}, S = v.settings || {}, u = v.usage || {}, P = v.paper || {}, B = v.broker || {};
  const mode = S.mode === 'real' ? '<span class="sec-pill bad">真实下单</span>' : '<span class="sec-pill ok">模拟盘</span>';
  const tools = action('＋ 手动委托', 'tdCreate') + action('券商页面', 'tdBroker') + action('委托设置', 'tdSettings') + action(S.paused ? '恢复' : '暂停', 'tdPause', S.paused ? 'resume' : 'pause');
  const orders = v.orders || [];
  const list = orders.length ? `<ul class="td-list">${orders.map(orderRow).join('')}</ul>` : `<p class="empty-note">今天还没有委托单。股票池里出现买点、卖点，或者持仓触发止损时，QuankSight 会按规则生成委托单，等你确认。</p>`;
  const stats = `<div class="td-stats"><span><b>${escape(money(u.buyAmount))}</b> / ${escape(money(u.maxDaily))} 元<small>今日买入额度</small></span><span><b>${escape(String(u.count ?? 0))}</b> / ${escape(String(u.maxCount ?? '—'))}<small>今日笔数</small></span>${S.mode === 'paper' ? `<span><b>${escape(money(P.total))}</b><small>模拟盘总资产 · 现金 ${escape(money(P.cash))}</small></span><span class="${(P.pnl || 0) >= 0 ? 'up' : 'down'}"><b>${escape(money(P.pnl))}</b><small>模拟盘盈亏${P.pnlPct !== null && P.pnlPct !== undefined ? ` ${P.pnlPct > 0 ? '+' : ''}${escape(String(P.pnlPct))}%` : ''}</small></span>` : `<span><b>${B.ready?.buy && B.ready?.sell ? '已标注' : B.ready?.buy || B.ready?.sell ? '部分标注' : '未标注'}</b><small>${escape(B.name || '券商页面')}${B.open ? ' · 已打开' : ''}</small></span>`}</div>`;
  const hist = (v.history || []).length ? `<details class="td-hist"><summary>更早的委托单（${(v.history || []).length}）</summary><ul class="td-list">${v.history.map(orderRow).join('')}</ul></details>` : '';
  return `<section class="q-box td-box" id="tradeBox"><div class="plaza-section-head"><h2>半自动委托</h2>${mode}<small>${escape(v.text || '')} · 最后一步由你在券商页面亲自提交。</small><span class="q-head-tools">${tools}</span></div>${stats}${list}${hist}
<p class="auto-note">委托单当天收盘作废。止损卖出不受每日金额和笔数限制；买入会按单笔、每日、现金和仓位上限自动缩减。${S.mode === 'real' ? 'QuankSight 只会在券商页面填写代码、价格和数量并标出提交按钮，不会替你点击提交；登录只保存在本次运行的内存里。' : '模拟盘按实时行情撮合：买入现价不高于委托价、卖出现价不低于委托价时成交。'}</p></section>`;
}

// ---------- forms ----------
const numIn = (n, label, v, step = '1') => `<label>${label}<input name="${n}" type="number" step="${step}" min="0" value="${escape(v ?? '')}"></label>`;
export function settingsForm(S = {}) {
  return `<div class="form-row"><label>模式<select name="mode"><option value="paper" ${S.mode !== 'real' ? 'selected' : ''}>模拟盘（只记模拟账，不打开券商）</option><option value="real" ${S.mode === 'real' ? 'selected' : ''}>真实下单（填好券商页面，由你提交）</option></select></label></div>
<label class="check"><input type="checkbox" name="enabled" ${S.enabled === false ? '' : 'checked'}> 开启半自动委托</label>
<label class="check"><input type="checkbox" name="fromSignals" ${S.fromSignals === false ? '' : 'checked'}> 股票池出现买点 / 卖点时生成委托单</label>
<label class="check"><input type="checkbox" name="fromStops" ${S.fromStops === false ? '' : 'checked'}> 持仓触发止损时生成卖出委托单</label>
<div class="form-row">${numIn('baseAmount', '每笔基准金额（元，× 引擎倍率）', S.baseAmount)}${numIn('sellPct', '卖点卖出比例（%，强烈卖出与止损全部卖出）', S.sellPct)}</div>
<div class="form-row">${numIn('maxOrder', '单笔上限（元）', S.maxOrder)}${numIn('maxDaily', '每日买入上限（元）', S.maxDaily)}${numIn('maxCount', '每日最多笔数', S.maxCount)}</div>
<div class="form-row">${numIn('slippage', '限价滑点（%）', S.slippage, '0.1')}${numIn('maxDeviation', '限价偏离现价上限（%）', S.maxDeviation, '0.1')}${numIn('paperCash', '模拟盘初始资金（元）', S.paperCash)}</div>
<p class="hint">委托单只是建议，每一笔都要你确认；真实下单时最后的提交按钮由你在券商页面亲自点击。</p>`;
}
export const settingsPayload = fm => ({action: 'settings', settings: {mode: val(fm, 'mode'), enabled: on(fm, 'enabled'), fromSignals: on(fm, 'fromSignals'), fromStops: on(fm, 'fromStops'),
  ...Object.fromEntries(['baseAmount', 'sellPct', 'maxOrder', 'maxDaily', 'maxCount', 'slippage', 'maxDeviation', 'paperCash'].map(k => [k, val(fm, k)]))}});
export const REAL_RISK_HTML = `<p><b>切换到真实下单后：</b></p><ul><li>点「下单」时，QuankSight 会在内置浏览器里打开券商网页版，填好股票代码、委托价格和数量，并用红框标出提交按钮。</li><li><b>QuankSight 不会替你点击提交</b>，每一笔都由你核对后亲自提交；你没有提交的委托不会发生。</li><li>委托价按现价加减滑点计算，市场波动时可能成交不了或成交价不同；量化信号不保证盈利。</li><li>按规定，用程序辅助交易可能需要向券商报告，具体以券商要求为准。</li><li>券商登录只保存在本次运行的内存里，退出 QuankSight 即失效。</li></ul><p>确认已了解以上风险，并自行承担交易结果？</p>`;
export function createForm() {
  return `<div class="form-row"><label>股票代码<input name="code" maxlength="6" pattern="\\d{6}" required placeholder="600438"></label><label>方向<select name="side"><option value="buy">买入</option><option value="sell">卖出</option></select></label></div>
<div class="form-row"><label>股数（可留空：买入按基准金额计算，卖出按比例）<input name="shares" type="number" min="100" step="100"></label><label>限价（可留空：现价 ± 滑点）<input name="price" type="number" min="0" step="0.01"></label></div>
<label>理由（可留空）<input name="reason" maxlength="80"></label><p class="hint">手动委托同样经过单笔、每日、现金和仓位检查。</p>`;
}
export const createPayload = fm => ({action: 'create', code: val(fm, 'code').trim(), side: val(fm, 'side'), shares: val(fm, 'shares'), price: val(fm, 'price'), reason: val(fm, 'reason')});
export function fillForm(o, hints = []) {
  const h = hints.find(x => x.status) || {};
  return `<p>${escape(SIDE_TEXT[o.side])} <b>${escape(o.name)}</b>（${escape(o.code)}）委托 ${escape(String(o.shares))} 股 @ ${escape(String(o.price))}</p>
${hints.length ? `<div class="td-rows"><small>券商页面上找到的相关记录：</small>${hints.map(x => `<code>${escape(x.row)}</code>`).join('')}</div>` : ''}
<div class="form-row"><label>结果<select name="status"><option value="filled" ${h.status !== 'partial' ? 'selected' : ''}>全部成交</option><option value="partial" ${h.status === 'partial' ? 'selected' : ''}>部分成交</option></select></label><label>成交均价<input name="price" type="number" step="0.001" min="0" value="${escape(h.price ?? o.price)}"></label><label>成交股数<input name="shares" type="number" step="1" min="1" max="${escape(String(o.shares))}" value="${escape(h.shares ?? o.shares)}"></label></div>
<p class="hint">确认后记入持仓（引擎支持记录成交时记入引擎，否则更新手动持仓），并写入操作审计。</p>`;
}
export const fillPayload = (fm, id) => ({action: 'report', id, status: val(fm, 'status'), price: val(fm, 'price'), shares: val(fm, 'shares')});
export function brokerPanel(B = {}, presets = []) {
  const st = side => B.ready?.[side] ? '<span class="sec-pill ok">已标注</span>' : '<span class="sec-pill warn">未标注</span>';
  return `<div class="form-row"><label>券商<select name="preset">${presets.map(p => `<option value="${escape(p.id)}" ${p.id === B.id ? 'selected' : ''}>${escape(p.name)}</option>`).join('')}<option value="custom" ${presets.some(p => p.id === B.id) ? '' : 'selected'}>其他（自己填网址）</option></select></label></div>
<label>网页版地址（https）<input name="url" value="${escape(B.url || '')}"></label>
<div class="td-broker"><p>1. 点「打开券商页面」，在弹出的窗口里<b>自己登录</b>（QuankSight 看不到你的密码，登录只保存在本次运行的内存里）。</p>
<p>2. 打开<b>买入</b>页面，点「标注买入页面」，按提示依次点击：${Object.values(BROKER_FIELDS).map(escape).join('、')}。卖出页面同样标注一次。 买入页面 ${st('buy')} 卖出页面 ${st('sell')}</p>
<p>3. 可选：打开「当日委托」，点「标注委托列表」，以后可以从页面读取成交情况。 ${B.orders ? '<span class="sec-pill ok">已标注</span>' : '<span class="sec-pill">未标注</span>'}</p>
<p class="hint">标注时你的点击不会传给券商页面，不会触发任何操作。</p></div>
<div class="sec-acts">${btn('打开券商页面', 'tdBrokerOpen', '', 'primary')}${btn('标注买入页面', 'tdCalibrate', 'buy')}${btn('标注卖出页面', 'tdCalibrate', 'sell')}${btn('标注委托列表', 'tdCalibrate', 'orders')}${btn('退出登录', 'tdBrokerLogout')}</div>`;
}
export const brokerPayload = fm => ({action: 'broker', preset: val(fm, 'preset') === 'custom' ? '' : val(fm, 'preset'), url: val(fm, 'url').trim()});

export const tradeUI = {tradeBox, orderRow, settingsForm, settingsPayload, REAL_RISK_HTML, createForm, createPayload, fillForm, fillPayload, brokerPanel, brokerPayload};
