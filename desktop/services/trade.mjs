// [v0.52] 半自动委托 service (main process). Turns new signal changes (quant alerts) and stop-loss breaches (portfolio
// alerts) into draft orders, keeps today's caps, fills paper orders against live quotes, and in real mode opens the
// broker page, fills it and waits for the user to press the broker's own submit button. Fills are recorded into the
// engine holdings (or the manual holdings) only when the user reports them.
import { normalizeTradeSettings, parseTradeSettings, describeTradeSettings, draftOrder, usage, ACTIVE, STATUS_TEXT, SIDE_TEXT, normalizePaper, paperFill, applyPaper, paperSummary,
  normalizeBroker, brokerReady, BROKER_PRESETS, BROKER_FIELDS, parseRow, cstDay, cstMinutes, CLOSE_MINUTES, num } from '../src/shared/trade.js';
import { mergePositions, summarizePortfolio, normalizeRules, industryOf } from '../src/shared/portfolio.js';
import { session } from '../src/shared/market.js';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const isCode = c => /^\d{6}$/.test(String(c || ''));
const ORDER_LIMIT = 300;

export function createTradeService({store, quant = null, market = null, portfolio = null, broker = null, notify = () => {}, onAlert = () => {}, now = Date.now, uid = () => Math.random().toString(36).slice(2, 8), tickMs = 15000} = {}) {
  let busy = false, lastPaper = 0, lastTick = -Infinity, quoteCache = {};
  const st = () => {
    const t = (store.data.trade ??= {});
    t.settings = normalizeTradeSettings(t.settings);
    t.orders ??= []; t.seen ??= {};
    t.paper = normalizePaper(t.paper, t.settings.paperCash);
    t.broker = normalizeBroker(t.broker || BROKER_PRESETS[0]);
    return t;
  };
  const find = id => { const o = st().orders.find(x => x.id === id); if (!o) throw new Error('没有这张委托单'); return o; };
  const today = () => cstDay(now());
  const save = async () => { await store.save?.(); notify(); };
  const activity = (title, detail, code = '') => { store.data.activity = [{id: 'td-' + now().toString(36) + uid(), title, code, detail: clip(detail, 200), time: now()}, ...(store.data.activity || [])].slice(0, 500); };
  const orderText = o => `${SIDE_TEXT[o.side]} ${o.name}（${o.code}）${o.shares} 股 @ ${o.price}，约 ${Math.round(o.amount)} 元`;

  async function quotes(codes) {
    const list = [...new Set(codes.filter(isCode))];
    if (!market || !list.length) return {};
    try { const r = await market.handle({action: 'quotes', codes: list}); for (const q of r?.quotes || []) if (q?.code) quoteCache[q.code] = q; } catch {}
    return Object.fromEntries(list.map(c => [c, quoteCache[c]]).filter(([, q]) => q));
  }
  const industries = () => Object.fromEntries(Object.entries(store.data.knowledge?.profiles || {}).map(([c, p]) => [c, industryOf(p?.profile?.industry)]));
  function context(mode, q) {
    const t = st();
    if (mode === 'paper') {
      const P = t.paper, manual = Object.entries(P.positions).map(([code, x]) => ({code, name: x.name, shares: x.shares, cost: x.cost}));
      const summary = summarizePortfolio(mergePositions({manual, quotes: q, industries: industries()}), P.cash);
      return {holding: c => P.positions[c] || null, cash: P.cash, summary};
    }
    const engine = store.data.quant?.holdings || {}, manual = store.data.portfolio?.manual || [], cash = num(store.data.portfolio?.cash);
    const summary = summarizePortfolio(mergePositions({engine, manual, pool: store.data.quant?.pool || [], quotes: q, industries: industries()}), cash || 0);
    return {holding: c => manual.find(m => m.code === c) || (num(engine[c]?.shares) > 0 ? engine[c] : null), cash: cash > 0 ? cash : null, summary};
  }

  /** New signals since the last look. The first look only marks what is already there. */
  function pendingSignals() {
    const t = st(), day = today(), out = [], S = t.settings;
    const seed = !t.seeded;
    for (const a of store.data.quant?.alerts || []) {
      if (a?.kind !== 'change' || !a.id || t.seen[a.id]) continue;
      t.seen[a.id] = now();
      if (seed || !S.fromSignals || cstDay(a.time || 0) !== day) continue;
      out.push({code: a.code, name: a.name, action: a.to, multiplier: a.multiplier, reason: `信号 ${a.from || '—'} → ${a.toText || a.to}${a.reason ? '：' + a.reason : ''}`, source: 'signal'});
    }
    for (const a of store.data.portfolio?.alerts || []) {
      if (!['stopLoss', 'stopPrice'].includes(a?.kind) || !a.id || t.seen[a.id]) continue;
      t.seen[a.id] = now();
      if (seed || !S.fromStops || cstDay(a.time || 0) !== day || !isCode(a.code)) continue;
      out.push({code: a.code, name: '', action: 'SELL', reason: a.title, source: 'stop'});
    }
    t.seeded = true;
    for (const [k, v] of Object.entries(t.seen)) if (now() - v > 10 * 86400e3) delete t.seen[k];
    return out;
  }
  async function draft(signal, {mode} = {}) {
    const t = st(), S = t.settings, m = mode || S.mode;
    const q = await quotes([signal.code, ...Object.keys(t.paper.positions)]);
    const ctx = context(m, q), used = usage(t.orders, today());
    const r = draftOrder({signal, quote: q[signal.code] || {}, holding: ctx.holding(signal.code), settings: S, used, cash: ctx.cash, summary: ctx.summary, rules: normalizeRules(store.data.portfolio?.rules), industry: industries()[signal.code], now: now()});
    return r;
  }
  async function generate({auto = true} = {}) {
    const t = st(), made = [];
    for (const s of pendingSignals()) {
      const side = s.source === 'stop' ? 'sell' : /BUY/.test(String(s.action)) ? 'buy' : 'sell';
      if (t.orders.some(o => o.key === `${s.code}:${side}:${today()}` && ACTIVE.has(o.status))) continue;
      const r = await draft(s);
      if (!r.order) continue;
      const o = {id: 'od-' + now().toString(36) + uid(), mode: t.settings.mode, ...r.order};
      t.orders = [o, ...t.orders].slice(0, ORDER_LIMIT); made.push(o);
    }
    if (made.length && auto) {
      for (const o of made) activity('委托单', o.status === 'blocked' ? `${SIDE_TEXT[o.side]} ${o.name}（${o.code}）未生成：${o.blockReason}` : `${orderText(o)}，待你确认`, o.code);
      const ok = made.filter(o => o.status === 'draft');
      if (ok.length) { try { onAlert({title: ok.length > 1 ? `委托单 · ${ok.length} 张待确认` : `委托单 · ${SIDE_TEXT[ok[0].side]} ${ok[0].name}`, detail: ok.map(orderText).join('；').slice(0, 180), code: ok[0].code}); } catch {} }
    }
    if (made.length || t.seeded) await save();
    return made;
  }
  async function fillPaper(o) {
    const t = st(), q = (await quotes([o.code]))[o.code], f = paperFill(o, q);
    if (!f) return false;
    t.paper = applyPaper(t.paper, o, f, now());
    Object.assign(o, {status: 'filled', filledAt: now(), filledPrice: f.price, filledShares: f.shares, filledAmount: Math.round(f.price * f.shares * 100) / 100});
    activity('委托单', `模拟成交：${SIDE_TEXT[o.side]} ${o.name}（${o.code}）${f.shares} 股 @ ${f.price}`, o.code);
    return true;
  }
  /** User confirmed an order: paper fills (or waits); real opens and fills the broker page. */
  async function confirm(id) {
    const t = st(), o = find(id), S = t.settings;
    if (!(o.status === 'draft' || (o.status === 'awaiting' && S.mode === 'real'))) throw new Error(`这张委托单${STATUS_TEXT[o.status] || o.status}，不能再下单`);
    if (o.day !== today() || cstMinutes(now()) >= CLOSE_MINUTES) { o.status = 'expired'; await save(); throw new Error('委托单已过期（当天收盘作废）'); }
    if (S.paused) throw new Error('半自动委托已暂停');
    const q = (await quotes([o.code]))[o.code], last = num(q?.price);
    if (last && Math.abs(o.price / last - 1) * 100 > S.maxDeviation) throw new Error(`现价 ${last} 和委托价 ${o.price} 相差超过 ${S.maxDeviation}%，请撤销后重新生成`);
    const used = usage(t.orders.filter(x => x.id !== o.id), today());
    if (o.side === 'buy' && used.buyAmount + o.amount > S.maxDaily) throw new Error(`今天买入已用 ${used.buyAmount} 元，再买会超过每日上限 ${S.maxDaily} 元`);
    if (used.count + 1 > S.maxCount && o.source !== 'stop') throw new Error(`今天已有 ${used.count} 笔，达到每日最多 ${S.maxCount} 笔`);
    o.mode = S.mode; o.confirmedAt = now();
    if (S.mode === 'paper') {
      o.status = 'open';
      const filled = await fillPaper(o);
      await save();
      return {order: o, paper: true, filled, note: filled ? '已按模拟盘成交' : '现价还没到委托价，模拟挂单中；收盘前到价自动成交'};
    }
    if (!broker) throw new Error('当前环境不能打开券商页面');
    const B = t.broker, F = B[o.side];
    if (!brokerReady(B, o.side)) throw new Error(`还没有标注券商的${SIDE_TEXT[o.side]}页面。请在「半自动委托 → 券商页面」里打开券商网页并登录，然后标注${SIDE_TEXT[o.side]}页面的输入框`);
    o.status = 'filling'; await save();
    try {
      const url = o.side === 'buy' ? B.buyUrl || B.url : B.sellUrl || B.url;
      if (!broker.open) await broker.show(url); else if ((o.side === 'buy' ? B.buyUrl : B.sellUrl)) await broker.navigate(url);
      const r = await broker.fill(F, {code: o.code, price: o.price.toFixed(2), shares: String(o.shares)});
      const ok = r && !r.missing?.length && String(r.read?.code || '').includes(o.code) && Math.abs(Number(r.read?.price) - o.price) < 0.0001 && Number(r.read?.shares) === o.shares;
      o.fillCheck = {read: r?.read || {}, missing: r?.missing || [], submitFound: !!r?.submitFound, at: now()};
      if (!ok) {
        o.status = 'draft'; await save();
        const miss = (r?.missing || []).map(k => BROKER_FIELDS[k]).join('、');
        throw new Error(miss ? `券商页面上找不到：${miss}。请确认已登录并打开了${SIDE_TEXT[o.side]}页面，或者重新标注` : `券商页面上的值和委托单不一致（代码 ${r?.read?.code ?? '—'}、价格 ${r?.read?.price ?? '—'}、数量 ${r?.read?.shares ?? '—'}），没有继续。请检查页面后重试`);
      }
      o.status = 'awaiting';
      activity('委托单', `已在券商页面填好：${orderText(o)}，等你点击提交`, o.code);
      await save();
      return {order: o, paper: false, note: '已在券商页面填好代码、价格和数量，并用红框标出提交按钮。请核对后由你自己点击提交，然后回到 QuanK 点「我已提交」'};
    } catch (e) { if (o.status === 'filling') { o.status = 'draft'; await save(); } throw e; }
  }
  /** The user reports what happened at the broker. Filled / partial fills are recorded into the holdings. */
  async function report(id, p = {}) {
    const o = find(id), status = ['submitted', 'filled', 'partial', 'cancelled'].includes(p.status) ? p.status : null;
    if (!status) throw new Error('状态应为 已提交 / 已成交 / 部分成交 / 已撤单');
    if (o.mode !== 'real' || !['awaiting', 'submitted', 'review'].includes(o.status)) throw new Error('只有已经在券商页面填好的真实委托单才能回填');
    if (status === 'submitted') { o.status = 'submitted'; o.submittedAt = now(); await save(); return {order: o}; }
    if (status === 'cancelled') { o.status = 'cancelled'; o.cancelledAt = now(); await save(); return {order: o}; }
    const price = num(p.price) ?? o.price, shares = Math.floor(num(p.shares) ?? o.shares);
    if (!(price > 0) || !(shares > 0) || shares > o.shares) throw new Error(`成交数量应在 1–${o.shares} 股之间`);
    let recorded = '';
    if (store.data.quant?.features?.record && quant) {
      await quant.handle({action: 'record', code: o.code, side: o.side, price, shares, date: today(), note: `QuanK 委托单 ${o.id}`}); recorded = 'engine';
    } else if (portfolio) {
      const man = store.data.portfolio?.manual?.find(m => m.code === o.code), have = num(man?.shares) || 0, cost = num(man?.cost) || 0;
      if (o.side === 'buy') await portfolio.handle({action: 'holdingSave', code: o.code, name: o.name, shares: have + shares, cost: Math.round((cost * have + price * shares) / (have + shares) * 10000) / 10000, stopPrice: man?.stopPrice ?? '', note: man?.note || ''});
      else if (have - shares > 0) await portfolio.handle({action: 'holdingSave', code: o.code, name: man.name || o.name, shares: have - shares, cost: man.cost, stopPrice: man.stopPrice ?? '', note: man.note || ''});
      else if (man) await portfolio.handle({action: 'holdingRemove', code: o.code});
      recorded = 'manual';
    }
    Object.assign(o, {status: shares < o.shares ? 'partial' : 'filled', filledAt: now(), filledPrice: price, filledShares: shares, filledAmount: Math.round(price * shares * 100) / 100, recorded});
    activity('委托单', `已成交：${SIDE_TEXT[o.side]} ${o.name}（${o.code}）${shares} 股 @ ${price}${recorded === 'engine' ? '，已记入引擎持仓' : recorded === 'manual' ? '，已更新手动持仓' : ''}`, o.code);
    await save();
    return {order: o, recorded};
  }
  async function cancel(id) {
    const o = find(id);
    if (!ACTIVE.has(o.status) && o.status !== 'review') throw new Error(`这张委托单${STATUS_TEXT[o.status]}，不能撤销`);
    const atBroker = ['awaiting', 'submitted', 'review'].includes(o.status) && o.mode === 'real';
    o.status = 'cancelled'; o.cancelledAt = now(); await save();
    return {order: o, note: atBroker ? '已在 QuanK 里撤销。如果你已经在券商页面提交过，请在券商那边也撤单' : ''};
  }
  async function readBack(id) {
    const o = find(id), B = st().broker;
    if (!broker?.open) throw new Error('券商页面没有打开');
    if (!B.orders) throw new Error('还没有标注「当日委托」列表');
    const r = await broker.readRows(B.orders, o.code);
    return {found: !!r?.found, rows: r?.rows || [], hints: (r?.rows || []).map(row => ({row, ...parseRow(row, o)}))};
  }
  async function expire() {
    const t = st(), day = today(), late = cstMinutes(now()) >= CLOSE_MINUTES;
    let n = 0;
    for (const o of t.orders) {
      if (!(o.day < day || (o.day === day && late))) continue;
      if (['draft', 'open', 'filling'].includes(o.status)) { o.status = 'expired'; n++; }
      else if (['awaiting', 'submitted'].includes(o.status)) { o.status = 'review'; n++; }
    }
    if (n) await save();
    return n;
  }
  function view() {
    const t = st(), day = today(), u = usage(t.orders, day), S = t.settings;
    const list = t.orders.filter(o => o.day === day || ACTIVE.has(o.status) || o.status === 'review');
    return {settings: S, text: describeTradeSettings(S), usage: {...u, maxDaily: S.maxDaily, maxCount: S.maxCount}, orders: list.slice(0, 60), history: t.orders.filter(o => !list.includes(o)).slice(0, 40),
      paper: paperSummary(t.paper, quoteCache), broker: {...t.broker, ready: {buy: brokerReady(t.broker, 'buy'), sell: brokerReady(t.broker, 'sell')}, open: !!broker?.open}, presets: BROKER_PRESETS};
  }

  return {
    view,
    async tick() {
      const S = st().settings;
      if (!S.enabled || busy || now() - lastTick < tickMs) return;
      busy = true; lastTick = now();
      try {
        await expire();
        const ses = session(now());
        if (!S.paused && ['pre', 'open', 'lunch'].includes(ses)) await generate();
        else pendingSignals();
        if (ses === 'open' && now() - lastPaper > 60e3) {
          lastPaper = now(); let n = 0;
          for (const o of st().orders.filter(x => x.status === 'open' && x.mode === 'paper')) if (await fillPaper(o)) n++;
          if (n) await save();
        }
      } finally { busy = false; }
    },
    async handle(p = {}) {
      const a = p.action, t = st();
      if (a === 'view') return view();
      if (a === 'create') {
        const code = String(p.code || '').trim(); if (!isCode(code)) throw new Error('股票代码应为 6 位数字');
        const side = p.side === 'sell' ? 'sell' : p.side === 'buy' ? 'buy' : null; if (!side) throw new Error('请选择买入或卖出');
        if (t.orders.some(o => o.key === `${code}:${side}:${today()}` && ACTIVE.has(o.status))) throw new Error(`今天已经有一张${SIDE_TEXT[side]}这只股票的委托单`);
        const r = await draft({code, name: p.name, side, action: side === 'buy' ? 'BUY' : 'SELL', shares: num(p.shares), price: num(p.price), multiplier: 1, reason: clip(p.reason, 160) || '手动创建', source: 'manual'});
        if (!r.ok) throw new Error(r.reason);
        const o = {id: 'od-' + now().toString(36) + uid(), mode: t.settings.mode, ...r.order};
        t.orders = [o, ...t.orders].slice(0, ORDER_LIMIT); await save();
        return {order: o};
      }
      if (a === 'confirm') return confirm(String(p.id || ''));
      if (a === 'report') return report(String(p.id || ''), p);
      if (a === 'cancel') return cancel(String(p.id || ''));
      if (a === 'readBack') return readBack(String(p.id || ''));
      if (a === 'generate') return {orders: await generate({auto: false})};
      if (a === 'settings') {
        const before = t.settings, next = parseTradeSettings(p.settings || {}, before);
        if (next.paperCash !== before.paperCash && !t.paper.trades.length) t.paper = normalizePaper({cash: next.paperCash, start: next.paperCash}, next.paperCash);
        t.settings = next;
        if (before.mode !== next.mode) activity('委托单', next.mode === 'real' ? '已切换到真实下单：委托单会在券商页面填好，由你自己点击提交' : '已切换回模拟盘');
        await save(); return {settings: next, text: describeTradeSettings(next)};
      }
      if (a === 'paperReset') {
        for (const o of t.orders) if (o.mode === 'paper' && o.status === 'open') o.status = 'cancelled';
        t.paper = normalizePaper({cash: t.settings.paperCash, start: t.settings.paperCash}, t.settings.paperCash); await save(); return {paper: paperSummary(t.paper)};
      }
      if (a === 'broker') {
        const next = normalizeBroker({...t.broker, ...(p.preset ? BROKER_PRESETS.find(x => x.id === p.preset) || {} : {}), ...(p.name !== undefined ? {name: p.name} : {}), ...(p.url !== undefined ? {url: p.url} : {}), ...(p.buyUrl !== undefined ? {buyUrl: p.buyUrl} : {}), ...(p.sellUrl !== undefined ? {sellUrl: p.sellUrl} : {})});
        if (p.url !== undefined && !next.url) throw new Error('券商网址必须是 https 开头');
        t.broker = next; await save(); return {broker: next};
      }
      if (a === 'brokerOpen') { if (!broker) throw new Error('当前环境不能打开券商页面'); if (!t.broker.url) throw new Error('请先填写券商网址'); return broker.show(p.side === 'sell' ? t.broker.sellUrl || t.broker.url : p.side === 'buy' ? t.broker.buyUrl || t.broker.url : t.broker.url); }
      if (a === 'brokerLogout') { if (!broker) return {open: false}; return broker.logout(); }
      if (a === 'calibrate') {
        if (!broker) throw new Error('当前环境不能打开券商页面');
        const what = p.target === 'orders' ? 'orders' : p.target === 'sell' ? 'sell' : 'buy';
        if (!broker.open) throw new Error('请先打开券商页面并登录');
        const steps = what === 'orders' ? [['orders', '「当日委托」或「当日成交」列表区域']] : Object.entries(BROKER_FIELDS).map(([k, v]) => [k, `${SIDE_TEXT[what]}页面的${v}`]);
        const r = await broker.calibrate(steps);
        if (!r?.ok) return {cancelled: true};
        const B = {...t.broker};
        if (what === 'orders') B.orders = r.fields.orders; else B[what] = {...B[what], ...r.fields};
        if (what !== 'orders' && p.saveUrl !== false) { const url = broker.status?.().url; if (url && /^https:/.test(url)) B[what === 'buy' ? 'buyUrl' : 'sellUrl'] = url; }
        t.broker = normalizeBroker(B); await save();
        const missing = what === 'orders' ? (t.broker.orders ? [] : ['orders']) : Object.keys(BROKER_FIELDS).filter(k => !t.broker[what][k]); // [v0.53] tell the user what did not stick
        return {broker: {...t.broker, ready: {buy: brokerReady(t.broker, 'buy'), sell: brokerReady(t.broker, 'sell')}}, fields: r.fields, missing};
      }
      throw new Error('未知的委托操作');
    },
  };
}
