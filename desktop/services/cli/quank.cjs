#!/usr/bin/env node
'use strict';
// [v0.51 CLI] quank — QuanK 命令行. Talks to the running QuanK over its local socket (QUANK_SOCKET / QUANK_TOKEN_FILE,
// set by the installed wrapper). C1 subcommands with tables or --json, C2 `quank ask`, C3 `quank mcp` (MCP stdio
// server exposing QuanK's tools), C4 `quank acp` (Agent Client Protocol stdio agent). CommonJS + node built-ins only,
// so it runs under QuanK's own Electron in node mode. Exported helpers are unit-tested (tests/v051-cli.test.mjs).
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const VERSION = '1.0.0';
const DEFAULT_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'QuanK');

// ---------- connection ----------
function connectInfo(env = process.env) {
  const socket = env.QUANK_SOCKET || path.join(DEFAULT_DIR, 'quank.sock');
  const tokenFile = env.QUANK_TOKEN_FILE || path.join(DEFAULT_DIR, 'cli.token');
  return {socket, tokenFile};
}
/** One connection, many requests; events (ask deltas) go to onEvent(id, event). */
function createClient({socket, tokenFile} = connectInfo()) {
  let token = '';
  try { token = fs.readFileSync(tokenFile, 'utf8').trim(); } catch {}
  let conn = null, buf = '', seq = 0;
  const pending = new Map();
  function open() {
    if (conn) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (!token) return reject(Object.assign(new Error('QuanK 命令行没有开启。请在 QuanK「安全与合规 → 命令行」里开启后再试。'), {code: 'QK_OFF'}));
      const c = net.createConnection(socket);
      c.setEncoding('utf8');
      c.once('connect', () => { conn = c; resolve(); });
      c.once('error', e => { if (!conn) reject(Object.assign(new Error(e.code === 'ENOENT' || e.code === 'ECONNREFUSED' ? 'QuanK 没有运行，或命令行没有开启。请打开 QuanK，并在「安全与合规 → 命令行」里开启。' : `连不上 QuanK：${e.message}`), {code: 'QK_DOWN'})); });
      c.on('data', d => {
        buf += d; let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
          let m; try { m = JSON.parse(line); } catch { continue; }
          const p = pending.get(m.id); if (!p) continue;
          if (m.event) { p.onEvent?.(m); continue; }
          pending.delete(m.id);
          if (m.error) p.reject(Object.assign(new Error(m.error.message), {code: m.error.code})); else p.resolve(m.result);
        }
      });
      c.on('close', () => { conn = null; for (const p of pending.values()) p.reject(new Error('与 QuanK 的连接已断开')); pending.clear(); });
    });
  }
  async function request(method, params = {}, onEvent) {
    await open();
    const id = ++seq;
    return new Promise((resolve, reject) => { pending.set(id, {resolve, reject, onEvent}); conn.write(JSON.stringify({id, token, method, params}) + '\n'); });
  }
  const close = () => { try { conn?.end(); } catch {} conn = null; };
  return {request, close};
}

// ---------- output ----------
const wide = ch => /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{1f300}-\u{1faff}]/u.test(ch);
const width = s => [...String(s)].reduce((n, ch) => n + (wide(ch) ? 2 : 1), 0);
const padEnd = (s, w) => String(s) + ' '.repeat(Math.max(0, w - width(s)));
const cut = (s, w) => { let out = '', n = 0; for (const ch of String(s)) { const c = wide(ch) ? 2 : 1; if (n + c > w - 1) return out + '…'; out += ch; n += c; } return out; };
const isScalar = v => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const cell = v => v === null || v === undefined ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)) : typeof v === 'boolean' ? (v ? '是' : '否') : Array.isArray(v) ? v.filter(isScalar).join('、') : typeof v === 'object' ? '…' : String(v).replace(/\s+/g, ' ');
/** Rows of objects -> an aligned text table (scalar columns only, at most 8, cells cut to fit `max`). */
function table(rows, {max = 110} = {}) {
  const list = rows.filter(r => r && typeof r === 'object');
  if (!list.length) return '';
  const cols = [];
  for (const r of list) for (const [k, v] of Object.entries(r)) if (!cols.includes(k) && (isScalar(v) || (Array.isArray(v) && v.every(isScalar)))) cols.push(k);
  const use = cols.slice(0, 8), w = use.map(k => Math.min(Math.max(width(k), ...list.map(r => width(cell(r[k])))), 36));
  let total = w.reduce((a, b) => a + b + 2, 0);
  while (total > max && Math.max(...w) > 8) { const i = w.indexOf(Math.max(...w)); w[i]--; total--; }
  const line = vals => vals.map((v, i) => padEnd(width(v) > w[i] ? cut(v, w[i]) : v, w[i])).join('  ').trimEnd();
  return [line(use), line(w.map(n => '─'.repeat(n))), ...list.map(r => line(use.map(k => cell(r[k]))))].join('\n');
}
/** A tool result -> readable text: scalars as `key: value`, arrays of objects as tables, nested objects indented. */
function render(v, depth = 0) {
  const pad = '  '.repeat(depth);
  if (isScalar(v) || v === undefined) return pad + cell(v);
  if (Array.isArray(v)) {
    if (!v.length) return pad + '（无）';
    if (v.every(isScalar)) return v.map(x => pad + '· ' + cell(x)).join('\n');
    return table(v).split('\n').map(l => pad + l).join('\n');
  }
  const out = [];
  const keys = Object.keys(v).filter(k => k !== 'status' || v[k] !== 'succeeded');
  const kw = Math.min(18, Math.max(0, ...keys.filter(k => isScalar(v[k])).map(width)));
  for (const k of keys) {
    const x = v[k];
    if (x === undefined) continue;
    if (isScalar(x) || (Array.isArray(x) && x.every(isScalar) && x.length <= 6)) out.push(`${pad}${padEnd(k, kw)}  ${cell(x)}`);
    else out.push(`${pad}${k}:`, render(x, depth + 1));
  }
  return out.join('\n');
}

// ---------- commands (C1) ----------
const HELP = `quank ${VERSION} — QuanK 命令行（需要 QuanK 正在运行，并在「安全与合规 → 命令行」里开启）

用法：quank <命令> [参数] [--json]

行情    quote <公司或代码…>       实时行情（多只用逗号分隔）
        market                     大盘与市场概况
        kline <股票> [--period day|week|month|m60|intraday]
        sectors [--concept] [--down]
量化    signal <股票> [--fresh]    本机策略信号
        scan                        全部重算股票池
        pool | pool add <股票> | pool rm <代码>
        holdings [股票]
组合    pf                          组合总览与风控提醒
        pf risk | pf stress [--market -10 | --stock 股票 --pct -20 | --industry 行业 --pct -15]
        pf sim "<股票 股数 [价格]>；…"    模拟调仓（只计算）
        pf report [--format docx|pptx|html]
委托    order                       今天的委托单与额度
        order buy|sell <股票> [--shares 股数 --price 限价]   生成待确认的委托单
        order confirm <编号> | order cancel <编号>
        order fill <编号> [--status filled|partial|submitted|cancelled --price 价 --shares 股]
        order settings [--pause | --resume | --baseAmount 5000 …]   （每一步都要在 QuanK 里确认，提交由你在券商页面完成）
投研    kb search <关键词> [--stock 股票]   kb finance <股票>   kb graph <股票>
        notices <股票> [--limit 20]
        report <股票> [--format docx|pptx|html] [--ai]
提醒    alert ls | alert add <股票> <up|down|above|below> <数值> | alert rm <id>
自动化  task ls | task run <id>
安全    sec | audit [--kind trade] [--q 关键词] | egress
        check [文件|-]              合规检查（不给文件就读标准输入）
对话    ask "<问题>" [--agent id]   让 QuanK 智能体回答（可用管道传入资料）
通用    tools                       列出全部指令
        call <指令> [JSON 或 key=value …]
        status                      连接状态
服务    mcp                         作为 MCP 服务运行（给 Claude、Cursor、Quick 等调用）
        acp                         作为 ACP 代理运行（给 Quick 等编码代理面板调用）

会修改数据的操作仍会在 QuanK 里弹出确认框；所有调用都记入「操作审计」。`;

function parseArgs(argv) {
  const pos = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { pos.push(...argv.slice(i + 1)); break; }
    if (/^--[\w-]+=/.test(a)) { const [k, ...v] = a.slice(2).split('='); flags[k] = v.join('='); }
    else if (a.startsWith('--')) { const k = a.slice(2), nx = argv[i + 1]; if (nx !== undefined && !nx.startsWith('--') && !['json', 'fresh', 'ai', 'concept', 'down', 'help', 'version', 'open'].includes(k)) { flags[k] = nx; i++; } else flags[k] = true; }
    else if (a === '-h') flags.help = true;
    else pos.push(a);
  }
  return {pos, flags};
}
const num = v => { const n = Number(String(v).replace(/%$/, '')); if (!Number.isFinite(n)) throw new Error(`不是数字：${v}`); return n; };
const need = (v, what) => { if (v === undefined || v === '' || v === true) throw new Error(`缺少${what}。用 quank --help 查看用法`); return v; };
/** argv -> {tool, args} or a special command. Pure: unit-tested. */
function plan(argv) {
  const {pos, flags} = parseArgs(argv), [cmd, sub, ...rest] = pos, json = !!flags.json;
  const T = (tool, args = {}, extra = {}) => ({tool, args, json, ...extra});
  const words = a => a.filter(Boolean).join(' ');
  if (flags.version || cmd === 'version') return {special: 'version'};
  if (!cmd || flags.help || cmd === 'help') return {special: 'help'};
  switch (cmd) {
    case 'status': return {special: 'status', json};
    case 'tools': return {special: 'tools', json};
    case 'mcp': return {special: 'mcp'};
    case 'acp': return {special: 'acp'};
    case 'ask': return {special: 'ask', prompt: words([sub, ...rest]), agentId: flags.agent || '', json};
    case 'check': return {special: 'check', file: sub || '-', kind: flags.kind || 'article', aiUsed: !!flags.ai, json};
    case 'call': {
      const name = need(sub, '指令名'), toolName = name.startsWith('app_') ? name : 'app_' + name;
      let args = {};
      if (rest.length === 1 && /^\s*\{/.test(rest[0])) { try { args = JSON.parse(rest[0]); } catch { throw new Error('参数不是有效的 JSON'); } }
      else for (const kv of rest) { const i = kv.indexOf('='); if (i < 1) throw new Error(`参数应写成 key=value：${kv}`); const k = kv.slice(0, i), v = kv.slice(i + 1); args[k] = v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v; }
      return T(toolName, args);
    }
    case 'quote': return T('app_market_quote', {query: need(words([sub, ...rest]), '公司名称或代码')});
    case 'market': return T('app_market_overview');
    case 'kline': return T('app_market_kline', {query: need(sub, '股票'), period: flags.period || 'day', open: !!flags.open});
    case 'sectors': return T('app_market_sectors', {kind: flags.concept ? 'concept' : 'industry', order: flags.down ? 'down' : 'up', limit: flags.limit ? num(flags.limit) : 15});
    case 'signal': return T('app_quant_signal', {code: need(sub, '股票'), fresh: !!flags.fresh}, {resolve: 'code'});
    case 'insight': return T('app_quant_insight', {code: need(sub, '股票')}, {resolve: 'code'});
    case 'scan': return T('app_quant_scan');
    case 'pool':
      if (!sub || sub === 'ls') return T('app_quant_status');
      if (sub === 'add') return T('app_quant_pool_add', {query: need(words(rest), '股票')});
      if (sub === 'rm' || sub === 'remove') return T('app_quant_pool_remove', {code: need(rest[0], '代码')}, {resolve: 'code'});
      break;
    case 'holdings': return T('app_quant_holdings', sub ? {code: sub} : {}, sub ? {resolve: 'code'} : {});
    case 'pf':
      if (!sub) return T('app_pf_overview', flags.fresh ? {fresh: true} : {});
      if (sub === 'risk') return T('app_pf_risk');
      if (sub === 'stress') {
        if (flags.market !== undefined) return T('app_pf_stress', {kind: 'market', pct: num(flags.market)});
        if (flags.stock) return T('app_pf_stress', {kind: 'stock', stock: flags.stock, pct: num(need(flags.pct, '--pct'))});
        if (flags.industry) return T('app_pf_stress', {kind: 'industry', industry: flags.industry, pct: num(need(flags.pct, '--pct'))});
        return T('app_pf_stress');
      }
      if (sub === 'sim' || sub === 'simulate') return T('app_pf_simulate', {changes: need(words(rest), '调仓内容，例如 "通威 -2000；600519 100 1450"')});
      if (sub === 'report') return T('app_pf_report', {format: flags.format || 'docx'});
      break;
    case 'kb':
      if (sub === 'search') return T('app_kb_search', {query: need(words(rest), '关键词'), ...(flags.stock ? {stock: flags.stock} : {}), ...(flags.kind ? {kind: flags.kind} : {})});
      if (sub === 'finance') return T('app_kb_finance', {query: need(words(rest), '股票'), fresh: !!flags.fresh});
      if (sub === 'graph') return T('app_kb_graph', {query: need(words(rest), '股票')});
      if (sub === 'topics') return T('app_kb_topics');
      break;
    case 'notices': return T('app_research_notices', {query: need(words([sub, ...rest]), '股票'), limit: flags.limit ? num(flags.limit) : 20});
    case 'report': return T('app_research_report', {query: need(words([sub, ...rest]), '股票'), format: flags.format || 'docx', ai: !!flags.ai});
    case 'alert':
      if (!sub || sub === 'ls') return T('app_market_alert_list');
      if (sub === 'add') { const [q, kind, v] = rest; if (!['up', 'down', 'above', 'below'].includes(kind)) throw new Error('提醒类型应为 up / down / above / below'); return T('app_market_alert_add', {query: need(q, '股票'), kind, value: num(need(v, '数值'))}); }
      if (sub === 'rm' || sub === 'remove') return T('app_market_alert_remove', {id: need(rest[0], '提醒 id')});
      break;
    case 'task':
      if (!sub || sub === 'ls') return T('app_task_list');
      if (sub === 'run') return T('app_task_run', {id: need(rest[0], '任务 id')});
      break;
    case 'sec': return T('app_sec_status');
    case 'audit': return T('app_audit_list', {...(flags.kind ? {kind: flags.kind} : {}), ...(flags.q ? {q: flags.q} : {}), limit: flags.limit ? num(flags.limit) : 30});
    case 'egress': return T('app_egress_list', flags.host ? {host: flags.host} : {});
    case 'order': { // [v0.52] 半自动委托 — every write asks for confirmation inside QuanK
      if (!sub || sub === 'ls') return T('app_trade_orders');
      if (sub === 'buy' || sub === 'sell') return T('app_trade_order_create', {query: need(words(rest), '股票'), side: sub, ...(flags.shares ? {shares: num(flags.shares)} : {}), ...(flags.price ? {price: num(flags.price)} : {}), ...(flags.reason ? {reason: String(flags.reason)} : {})});
      if (sub === 'confirm') return T('app_trade_order_confirm', {id: need(rest[0], '委托单编号')});
      if (sub === 'cancel') return T('app_trade_order_cancel', {id: need(rest[0], '委托单编号')});
      if (sub === 'fill') return T('app_trade_order_fill', {id: need(rest[0], '委托单编号'), status: flags.status || 'filled', ...(flags.price ? {price: num(flags.price)} : {}), ...(flags.shares ? {shares: num(flags.shares)} : {})});
      if (sub === 'settings') { const a = {}; if (flags.pause) a.paused = true; if (flags.resume) a.paused = false; for (const k of ['baseAmount', 'maxOrder', 'maxDaily', 'maxCount', 'slippage', 'maxDeviation', 'sellPct']) if (flags[k] !== undefined) a[k] = num(flags[k]); return T('app_trade_settings', a); }
      throw new Error('用法：quank order [ls | buy <股票> | sell <股票> | confirm <编号> | fill <编号> --status filled|partial|submitted|cancelled | cancel <编号> | settings]');
    }
    case 'briefing': return T('app_briefing_generate');
  }
  throw new Error(`不认识的命令：${[cmd, sub].filter(Boolean).join(' ')}。用 quank --help 查看用法`);
}
/** Find a 6-digit stock code in a lookup result. */
function codeIn(x, depth = 0) {
  if (depth > 5 || x === null || x === undefined) return '';
  if (typeof x === 'string') return /^\d{6}$/.test(x) ? x : '';
  if (Array.isArray(x)) { for (const v of x) { const c = codeIn(v, depth + 1); if (c) return c; } return ''; }
  if (typeof x === 'object') { if (/^\d{6}$/.test(String(x.code || ''))) return String(x.code); for (const v of Object.values(x)) { const c = codeIn(v, depth + 1); if (c) return c; } }
  return '';
}

// ---------- C3: MCP server over stdio ----------
const ASK_TOOL = {name: 'quank_ask', description: '把一个问题交给 QuanK 智能体（可调用本机量化引擎、行情、投研资料库、组合与风控），返回它的完整回答。适合需要多步分析的问题。', inputSchema: {type: 'object', properties: {prompt: {type: 'string'}, chatId: {type: 'string', description: '继续同一个 QuanK 对话时传入上次返回的 chatId'}}, required: ['prompt'], additionalProperties: false}};
function jsonLines(input, onMessage) {
  let buf = '';
  input.setEncoding?.('utf8');
  input.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; let m; try { m = JSON.parse(line); } catch { continue; } onMessage(m); } });
}
/** rpc(method, params, onEvent) talks to QuanK. Returns a promise that resolves when input ends. */
function runMcp({input = process.stdin, output = process.stdout, rpc}) {
  const send = m => output.write(JSON.stringify({jsonrpc: '2.0', ...m}) + '\n');
  let tools = null;
  const list = async () => (tools ??= ((await rpc('tools.list')).tools || []).map(t => ({name: t.name, description: t.description, inputSchema: t.parameters || {type: 'object', properties: {}}})));
  const text = v => ({content: [{type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2)}]});
  return new Promise(resolve => {
    jsonLines(input, async m => {
      if (m.id === undefined || m.id === null) return; // notifications (initialized, cancelled)
      try {
        if (m.method === 'initialize') return send({id: m.id, result: {protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: {tools: {listChanged: false}}, serverInfo: {name: 'quank', title: 'QuanK', version: VERSION}, instructions: 'QuanK 本机金融量化工作台的工具：行情、量化信号、组合与风控、投研资料库、合规检查。修改类操作会在 QuanK 里弹出确认框，用户拒绝时返回 denied。结果仅供研究，不构成投资建议。'}});
        if (m.method === 'ping') return send({id: m.id, result: {}});
        if (m.method === 'tools/list') return send({id: m.id, result: {tools: [...(await list()), ASK_TOOL]}});
        if (m.method === 'tools/call') {
          const {name, arguments: args = {}} = m.params || {};
          try {
            if (name === 'quank_ask') { const r = await rpc('ask', {prompt: String(args.prompt || ''), chatId: args.chatId || '', via: 'mcp'}); return send({id: m.id, result: {...text(`${r.text}\n\n(chatId: ${r.chatId})`), isError: r.status !== 'completed'}}); }
            const r = await rpc('tools.call', {name, args, audience: 'model', via: 'mcp'});
            return send({id: m.id, result: {...text(r.result), isError: r.result?.status === 'failed'}});
          } catch (e) { return send({id: m.id, result: {...text(String(e.message || e)), isError: true}}); }
        }
        if (m.method === 'resources/list') return send({id: m.id, result: {resources: []}});
        if (m.method === 'prompts/list') return send({id: m.id, result: {prompts: []}});
        send({id: m.id, error: {code: -32601, message: `Method not found: ${m.method}`}});
      } catch (e) { send({id: m.id, error: {code: -32000, message: String(e.message || e)}}); }
    });
    input.on('end', resolve);
  });
}

// ---------- C4: ACP agent over stdio ----------
function runAcp({input = process.stdin, output = process.stdout, rpc, uid = () => Math.random().toString(36).slice(2, 10)}) {
  const send = m => output.write(JSON.stringify({jsonrpc: '2.0', ...m}) + '\n');
  const sessions = new Map(); // sessionId -> {chatId}
  const promptText = blocks => (Array.isArray(blocks) ? blocks : []).map(b => b?.type === 'text' ? b.text : b?.type === 'resource' && b.resource?.text ? `\n[${b.resource.uri || '附件'}]\n${b.resource.text}` : b?.type === 'resource_link' ? `\n[${b.name || b.uri}](${b.uri})` : '').join('').trim();
  return new Promise(resolve => {
    jsonLines(input, async m => {
      const reply = result => send({id: m.id, result}), fail = (code, message) => send({id: m.id, error: {code, message}});
      try {
        if (m.method === 'initialize') return reply({protocolVersion: 1, agentCapabilities: {loadSession: false, promptCapabilities: {image: false, audio: false, embeddedContext: true}, mcpCapabilities: {http: false, sse: false}}, agentInfo: {name: 'quank', title: 'QuanK', version: VERSION}, authMethods: []});
        if (m.method === 'authenticate') return reply({});
        if (m.method === 'session/new') { const sessionId = 'qk-' + uid(); sessions.set(sessionId, {chatId: ''}); return reply({sessionId}); }
        if (m.method === 'session/cancel') { const s = sessions.get(m.params?.sessionId); if (s?.chatId) await rpc('ask.cancel', {chatId: s.chatId}).catch(() => {}); return; }
        if (m.method === 'session/prompt') {
          const s = sessions.get(m.params?.sessionId);
          if (!s) return fail(-32602, '未知的会话');
          const prompt = promptText(m.params?.prompt);
          if (!prompt) return reply({stopReason: 'end_turn'});
          if (!s.chatId) s.chatId = 'acp-' + uid();
          const chunk = text => send({method: 'session/update', params: {sessionId: m.params.sessionId, update: {sessionUpdate: 'agent_message_chunk', content: {type: 'text', text}}}});
          let streamed = false;
          const r = await rpc('ask', {prompt, chatId: s.chatId, via: 'acp'}, ev => { if (ev.event === 'delta' && ev.text) { streamed = true; chunk(ev.text); } });
          if (!streamed && r.text) chunk(r.text);
          return reply({stopReason: r.status === 'cancelled' ? 'cancelled' : 'end_turn'});
        }
        if (m.id !== undefined) fail(-32601, `Method not found: ${m.method}`);
      } catch (e) { if (m.id !== undefined) fail(-32000, String(e.message || e)); }
    });
    input.on('end', resolve);
  });
}

// ---------- main ----------
function readStdin() { return new Promise(res => { if (process.stdin.isTTY) return res(''); let s = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', d => { s += d; }); process.stdin.on('end', () => res(s)); }); }
async function main(argv = process.argv.slice(2)) {
  let p;
  try { p = plan(argv); } catch (e) { process.stderr.write(e.message + '\n'); return 2; }
  if (p.special === 'help') { process.stdout.write(HELP + '\n'); return 0; }
  if (p.special === 'version') { process.stdout.write(`quank ${VERSION}\n`); return 0; }
  const client = createClient();
  const rpc = (m, params, onEvent) => client.request(m, params, onEvent);
  const out = v => process.stdout.write((typeof v === 'string' ? v : render(v)) + '\n');
  try {
    if (p.special === 'mcp') { await runMcp({rpc}); return 0; }
    if (p.special === 'acp') { await runAcp({rpc}); return 0; }
    if (p.special === 'status') { const h = await rpc('hello'); p.json ? out(JSON.stringify(h, null, 2)) : out({应用: `${h.app} ${h.version || ''}`.trim(), 已锁定: h.locked, 指令数: h.tools, 协议: h.protocol}); return 0; }
    if (p.special === 'tools') { const r = await rpc('tools.list'); p.json ? out(JSON.stringify(r.tools, null, 2)) : out(table(r.tools.map(t => ({指令: t.name.replace(/^app_/, ''), 说明: t.description})), {max: 120})); return 0; }
    if (p.special === 'check') {
      const text = p.file === '-' ? await readStdin() : fs.readFileSync(p.file, 'utf8');
      if (!text.trim()) throw new Error('没有要检查的内容');
      const r = (await rpc('tools.call', {name: 'app_compliance_check', args: {text: text.replace(/<[^>]+>/g, ' '), kind: p.kind, aiUsed: p.aiUsed}})).result;
      p.json ? out(JSON.stringify(r, null, 2)) : out(render(r));
      return r.level === 'high' ? 1 : 0;
    }
    if (p.special === 'ask') {
      const piped = await readStdin();
      const prompt = [p.prompt, piped.trim() ? `\n\n以下是附带的资料：\n${piped.slice(0, 90000)}` : ''].join('').trim();
      if (!prompt) throw new Error('请给出要问的内容，例如 quank ask "池子里谁是买点"');
      let printed = false;
      const r = await rpc('ask', {prompt, agentId: p.agentId}, ev => { if (!p.json && ev.event === 'delta') { process.stdout.write(ev.text); printed = true; } });
      if (p.json) out(JSON.stringify(r, null, 2)); else { if (!printed) process.stdout.write(r.text); process.stdout.write('\n'); }
      return r.status === 'completed' ? 0 : 1;
    }
    if (p.resolve === 'code' && p.args.code && !/^\d{6}$/.test(String(p.args.code))) {
      const found = (await rpc('tools.call', {name: 'app_quant_find_stock', args: {query: String(p.args.code)}})).result;
      const c = codeIn(found); if (!c) throw new Error(`没有找到「${p.args.code}」`); p.args.code = c;
    }
    const r = (await rpc('tools.call', {name: p.tool, args: p.args})).result;
    if (p.json) out(JSON.stringify(r, null, 2));
    else if (r?.status === 'denied') out('已取消：在 QuanK 的确认框里没有同意，未执行。');
    else out(render(r));
    return r?.status === 'failed' || r?.status === 'denied' ? 1 : 0;
  } catch (e) { process.stderr.write(`quank：${e.message}\n`); return e.code === 'QK_LOCKED' ? 3 : e.code === 'QK_OFF' || e.code === 'QK_DOWN' ? 4 : 1; }
  finally { client.close(); }
}

module.exports = {VERSION, parseArgs, plan, codeIn, table, render, width, runMcp, runAcp, createClient, connectInfo, HELP, main};
if (require.main === module) main().then(code => { process.exitCode = code; }, e => { process.stderr.write(String(e?.stack || e) + '\n'); process.exitCode = 1; });
