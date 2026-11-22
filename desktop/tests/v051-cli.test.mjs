// [v0.51] quank 命令行: argument planning (C1), output tables, ask runner (C2), MCP server (C3), ACP agent (C4),
// request handler, installer, socket transport, security integration, UI and wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import { readFile, writeFile, mkdtemp, stat, rm, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCliHandler, createCliServer, createCliInstaller, createAskRunner, socketPathFor, wrapperScript } from '../services/cli-server.mjs';
import { createSecurityService } from '../services/security.mjs';
import { securityUI } from '../src/ui/security.js';
import { summarizeReport, summaryText } from '../src/shared/quant.js';

const require = createRequire(import.meta.url);
const Q = require('../services/cli/quank.cjs');
const tmp = () => mkdtemp(path.join(tmpdir(), 'qk-cli-'));
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

test('C1 plan: subcommands map to the chat tools, flags and validation', () => {
  assert.deepEqual(Q.plan(['quote', '通威', '茅台']), {tool: 'app_market_quote', args: {query: '通威 茅台'}, json: false});
  assert.equal(Q.plan(['quote', '600438', '--json']).json, true);
  assert.deepEqual(Q.plan(['signal', '通威', '--fresh']), {tool: 'app_quant_signal', args: {code: '通威', fresh: true}, json: false, resolve: 'code'});
  assert.deepEqual(Q.plan(['kline', '600519', '--period', 'week']).args, {query: '600519', period: 'week', open: false});
  assert.deepEqual(Q.plan(['pf']).tool, 'app_pf_overview');
  assert.deepEqual(Q.plan(['pf', 'stress', '--market', '-10']).args, {kind: 'market', pct: -10});
  assert.deepEqual(Q.plan(['pf', 'stress', '--stock', '茅台', '--pct', '-20']).args, {kind: 'stock', stock: '茅台', pct: -20});
  assert.deepEqual(Q.plan(['pf', 'stress', '--industry=电气设备', '--pct=-15']).args, {kind: 'industry', industry: '电气设备', pct: -15});
  assert.deepEqual(Q.plan(['pf', 'sim', '通威 -2000；600519 100 1450']).args, {changes: '通威 -2000；600519 100 1450'});
  assert.deepEqual(Q.plan(['kb', 'search', '质押', '风险', '--stock', '通威']).args, {query: '质押 风险', stock: '通威'});
  assert.deepEqual(Q.plan(['report', '通威', '--format', 'pptx', '--ai']).args, {query: '通威', format: 'pptx', ai: true});
  assert.deepEqual(Q.plan(['alert', 'add', '600438', 'below', '10.5']).args, {query: '600438', kind: 'below', value: 10.5});
  assert.throws(() => Q.plan(['alert', 'add', '600438', 'sideways', '1']), /up \/ down \/ above \/ below/);
  assert.throws(() => Q.plan(['alert', 'add', '600438', 'below', 'x']), /不是数字/);
  assert.equal(Q.plan(['audit', '--kind', 'trade', '--limit', '5']).args.limit, 5);
  assert.deepEqual(Q.plan(['call', 'market_quote', 'query=通威']), {tool: 'app_market_quote', args: {query: '通威'}, json: false});
  assert.deepEqual(Q.plan(['call', 'app_pf_stress', '{"kind":"market","pct":-5}']).args, {kind: 'market', pct: -5});
  assert.deepEqual(Q.plan(['call', 'pf_overview', 'fresh=true']).args, {fresh: true});
  assert.throws(() => Q.plan(['call', 'x', 'nokey']), /key=value/);
  assert.deepEqual(Q.plan(['ask', '池子里', '谁是买点', '--agent', 'research']), {special: 'ask', prompt: '池子里 谁是买点', agentId: 'research', json: false});
  assert.deepEqual(Q.plan(['check']), {special: 'check', file: '-', kind: 'article', aiUsed: false, json: false});
  for (const s of ['mcp', 'acp', 'status', 'tools']) assert.equal(Q.plan([s]).special, s);
  assert.equal(Q.plan([]).special, 'help'); assert.equal(Q.plan(['--version']).special, 'version');
  assert.throws(() => Q.plan(['frobnicate']), /不认识的命令/);
  assert.throws(() => Q.plan(['quote']), /缺少公司名称或代码/);
  assert.match(Q.HELP, /quank mcp|mcp  /); assert.match(Q.HELP, /会修改数据的操作仍会在 QuanK 里弹出确认框/);
});

test('C1 output: aligned CJK tables, readable nested results, code lookup', () => {
  assert.equal(Q.width('通威ab'), 6);
  const t = Q.table([{name: '通威股份', price: 11.11, pct: -2.456}, {name: '贵州茅台', price: 1485.75, pct: 1.75}]).split('\n');
  assert.equal(t.length, 4); assert.match(t[0], /^name\s+price\s+pct$/); assert.match(t[2], /^通威股份\s+11\.11\s+-2\.46$/);
  assert.equal(Q.width(t[2].split(/\s{2,}/)[0]), 8);
  const r = Q.render({status: 'succeeded', total: 215905, positions: [{code: '600519', name: '贵州茅台', weight: 68.81}], note: '仅供研究'});
  assert.ok(!/succeeded/.test(r)); assert.match(r, /total\s+215905/); assert.match(r, /positions:\n\s+code\s+name\s+weight/); assert.match(r, /贵州茅台/);
  assert.match(Q.render({status: 'denied', message: '用户没有确认，未执行'}), /status\s+denied/);
  assert.equal(Q.codeIn({candidates: [{name: '通威股份', code: '600438'}]}), '600438');
  assert.equal(Q.codeIn({x: 'abc'}), '');
  const long = Q.table([{a: '很长'.repeat(40)}]); assert.ok(long.split('\n')[2].endsWith('…'));
});

function fakeDeps(over = {}) {
  const calls = [], audits = [];
  const deps = {
    tools: {list: () => [{name: 'app_market_quote', description: '行情', parameters: {type: 'object', properties: {query: {type: 'string'}}}}, {name: 'app_pf_overview', description: '组合', parameters: {type: 'object', properties: {}}}],
      call: async (name, args, o) => { calls.push({name, args, ...o}); return {status: 'succeeded', echo: args}; }},
    ask: async ({prompt, chatId, onDelta}) => { onDelta('你好'); onDelta('，世界'); return {chatId: chatId || 'cli-1', status: 'completed', text: `答：${prompt}`}; },
    cancel: async id => calls.push({cancel: id}), locked: () => false, info: () => ({version: '0.51.0', tools: 2}), audit: e => audits.push(e), ...over};
  return {deps, calls, audits};
}

test('handler: hello, lock, tool calls with audience / via, ask streaming and audit', async () => {
  const {deps, calls, audits} = fakeDeps();
  const h = createCliHandler(deps);
  assert.deepEqual(await h({method: 'hello'}), {app: 'QuanK', protocol: 1, version: '0.51.0', tools: 2, locked: false});
  assert.equal((await h({method: 'tools.list'})).tools.length, 2);
  assert.deepEqual((await h({method: 'tools.call', params: {name: 'app_market_quote', args: {query: '通威'}}})).result.echo, {query: '通威'});
  assert.deepEqual([calls[0].audience, calls[0].via], ['human', 'cli']);
  await h({method: 'tools.call', params: {name: 'app_pf_overview', audience: 'model', via: 'mcp'}});
  assert.deepEqual([calls[1].audience, calls[1].via, calls[1].args], ['model', 'mcp', {}]);
  await assert.rejects(h({method: 'tools.call', params: {name: 'app_task_delete'}}), /没有这个指令/);
  await assert.rejects(h({method: 'tools.call', params: {name: '../x'}}), /没有这个指令/);
  const events = [];
  const r = await h({id: 7, method: 'ask', params: {prompt: '谁是买点'}}, e => events.push(e));
  assert.deepEqual(events, [{event: 'delta', text: '你好'}, {event: 'delta', text: '，世界'}]);
  assert.equal(r.text, '答：谁是买点'); assert.equal(audits[0].action, 'quank ask'); assert.equal(audits[0].via, 'cli');
  await assert.rejects(h({method: 'ask', params: {prompt: ' '}}), /请给出/);
  await assert.rejects(h({method: 'nope'}), /未知的请求/);
  const locked = createCliHandler(fakeDeps({locked: () => true}).deps);
  assert.equal((await locked({method: 'hello'})).locked, true, 'hello still answers so the CLI can explain');
  await assert.rejects(locked({method: 'tools.list'}), e => e.code === 'QK_LOCKED' && /已锁定/.test(e.message));
});

test('C2 ask runner: streams deltas, resolves on completion, cancels, falls back to the chat', async () => {
  const listeners = [];
  const store = {data: {chats: []}};
  let busy = true;
  const conversations = {runs: [], cancelled: [], async run(p) { this.runs.push(p); listeners.push(p); }, cancel(id) { this.cancelled.push(id); }};
  const runner = createAskRunner({conversations, store, isBusy: () => busy, uid: (() => { let n = 0; return () => 'u' + ++n; })()});
  const deltas = [];
  const pr = runner.ask({prompt: '你好', onDelta: t => deltas.push(t)});
  await tick();
  const id = conversations.runs[0].id;
  assert.equal(id, 'cli-u1'); assert.equal(conversations.runs[0].toolsEnabled, true);
  runner.stream({type: 'text', chatId: id, content: '池子'}); runner.stream({type: 'text', chatId: id, content: '池子里有'}); runner.stream({type: 'text', chatId: 'other', content: 'x'});
  runner.finished({chat: {id}, status: 'completed', text: '池子里有 3 个买点'});
  assert.deepEqual(await pr, {chatId: id, status: 'completed', text: '池子里有 3 个买点'});
  assert.deepEqual(deltas, ['池子', '里有']);
  const ac = new AbortController();
  const p2 = runner.ask({prompt: 'x', chatId: 'acp-1', signal: ac.signal});
  await tick(); ac.abort();
  assert.deepEqual(await p2, {chatId: 'acp-1', status: 'cancelled', text: ''}); assert.deepEqual(conversations.cancelled, ['acp-1']);
  busy = false; store.data.chats.push({id: 'acp-2', messages: [{role: 'user', content: 'q'}, {role: 'assistant', content: '迟到的回答'}]});
  const p3 = await runner.ask({prompt: 'q', chatId: 'acp-2'});
  assert.deepEqual(p3, {chatId: 'acp-2', status: 'completed', text: '迟到的回答'}, 'no onCompleted: read the chat once the turn is no longer busy');
  const bad = createAskRunner({conversations: {run: async () => { throw new Error('请先设置模型'); }}, store});
  await assert.rejects(bad.ask({prompt: 'x'}), /请先设置模型/);
  assert.equal(bad.pending, 0);
});

function rpcPipe(handler) {
  const input = new PassThrough(), output = new PassThrough(), lines = [];
  output.setEncoding('utf8'); let buf = '';
  output.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const send = m => input.write(JSON.stringify({jsonrpc: '2.0', ...m}) + '\n');
  const wait = async (pred, ms = 2000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const hit = lines.find(pred); if (hit) return hit; await tick(5); } throw new Error('timeout waiting for reply'); };
  return {input, output, lines, send, wait, end: () => input.end()};
}

test('C3 MCP server: initialize, tools/list with quank_ask, tools/call for the model, errors', async () => {
  const seen = [];
  const rpc = async (method, params) => {
    seen.push({method, params});
    if (method === 'tools.list') return {tools: [{name: 'app_market_quote', description: '行情', parameters: {type: 'object', properties: {query: {type: 'string'}}, required: ['query']}}]};
    if (method === 'tools.call') { if (params.name === 'app_bad') throw new Error('QuanK 已锁定，请先在应用里解锁'); return {result: {status: 'succeeded', price: 11.11}}; }
    if (method === 'ask') return {chatId: 'c9', status: 'completed', text: '有 3 个买点'};
  };
  const io = rpcPipe(); const done = Q.runMcp({input: io.input, output: io.output, rpc});
  io.send({id: 1, method: 'initialize', params: {protocolVersion: '2025-03-26', capabilities: {}, clientInfo: {name: 't', version: '1'}}});
  const init = await io.wait(m => m.id === 1);
  assert.equal(init.result.protocolVersion, '2025-03-26'); assert.deepEqual(init.result.capabilities, {tools: {listChanged: false}}); assert.equal(init.result.serverInfo.name, 'quank');
  io.send({method: 'notifications/initialized'});
  io.send({id: 2, method: 'tools/list'});
  const list = await io.wait(m => m.id === 2);
  assert.deepEqual(list.result.tools.map(t => t.name), ['app_market_quote', 'quank_ask']);
  assert.deepEqual(list.result.tools[0].inputSchema.required, ['query']);
  io.send({id: 3, method: 'tools/call', params: {name: 'app_market_quote', arguments: {query: '通威'}}});
  const call = await io.wait(m => m.id === 3);
  assert.equal(call.result.isError, false); assert.deepEqual(JSON.parse(call.result.content[0].text), {status: 'succeeded', price: 11.11});
  assert.deepEqual(seen.find(s => s.method === 'tools.call').params, {name: 'app_market_quote', args: {query: '通威'}, audience: 'model', via: 'mcp'});
  io.send({id: 4, method: 'tools/call', params: {name: 'app_bad', arguments: {}}});
  const err = await io.wait(m => m.id === 4);
  assert.equal(err.result.isError, true); assert.match(err.result.content[0].text, /已锁定/);
  io.send({id: 5, method: 'tools/call', params: {name: 'quank_ask', arguments: {prompt: '谁是买点'}}});
  assert.match((await io.wait(m => m.id === 5)).result.content[0].text, /有 3 个买点[\s\S]*chatId: c9/);
  io.send({id: 6, method: 'nope/x'});
  assert.equal((await io.wait(m => m.id === 6)).error.code, -32601);
  io.send({id: 7, method: 'ping'}); assert.deepEqual((await io.wait(m => m.id === 7)).result, {});
  assert.ok(!io.lines.some(l => l.id === undefined && l.result), 'notifications get no reply');
  assert.equal(seen.filter(s => s.method === 'tools.list').length, 1, 'tool list cached');
  io.end(); await done;
});

test('C4 ACP agent: initialize, sessions keep one QuanK chat, streamed chunks, cancel', async () => {
  const seen = [];
  const rpc = async (method, params, onEvent) => {
    seen.push({method, params});
    if (method === 'ask') { onEvent?.({event: 'delta', text: '第一'}); onEvent?.({event: 'delta', text: '段'}); return {chatId: params.chatId, status: 'completed', text: '第一段'}; }
    return {};
  };
  const io = rpcPipe(); const done = Q.runAcp({input: io.input, output: io.output, rpc, uid: (() => { let n = 0; return () => 'x' + ++n; })()});
  io.send({id: 1, method: 'initialize', params: {protocolVersion: 1, clientCapabilities: {}}});
  const init = (await io.wait(m => m.id === 1)).result;
  assert.equal(init.protocolVersion, 1); assert.equal(init.agentInfo.name, 'quank'); assert.deepEqual(init.authMethods, []);
  io.send({id: 2, method: 'session/new', params: {cwd: '/tmp', mcpServers: []}});
  const sid = (await io.wait(m => m.id === 2)).result.sessionId; assert.equal(sid, 'qk-x1');
  io.send({id: 3, method: 'session/prompt', params: {sessionId: sid, prompt: [{type: 'text', text: '生成复盘'}, {type: 'resource', resource: {uri: 'file:///a.md', text: '附件内容'}}]}});
  assert.deepEqual((await io.wait(m => m.id === 3)).result, {stopReason: 'end_turn'});
  const chunks = io.lines.filter(l => l.method === 'session/update').map(l => l.params.update);
  assert.deepEqual(chunks, [{sessionUpdate: 'agent_message_chunk', content: {type: 'text', text: '第一'}}, {sessionUpdate: 'agent_message_chunk', content: {type: 'text', text: '段'}}]);
  const ask1 = seen.find(s => s.method === 'ask').params;
  assert.match(ask1.prompt, /生成复盘[\s\S]*file:\/\/\/a\.md[\s\S]*附件内容/); assert.equal(ask1.via, 'acp');
  io.send({id: 4, method: 'session/prompt', params: {sessionId: sid, prompt: [{type: 'text', text: '再来'}]}});
  await io.wait(m => m.id === 4);
  const asks = seen.filter(s => s.method === 'ask'); assert.equal(asks[1].params.chatId, asks[0].params.chatId, 'same QuanK chat for the session');
  io.send({method: 'session/cancel', params: {sessionId: sid}}); await tick(20);
  assert.deepEqual(seen.at(-1), {method: 'ask.cancel', params: {chatId: asks[0].params.chatId}});
  io.send({id: 5, method: 'session/prompt', params: {sessionId: 'nope', prompt: []}});
  assert.equal((await io.wait(m => m.id === 5)).error.code, -32602);
  io.end(); await done;
});

test('installer: wrapper script, permissions, refuses foreign files, PATH hint, MCP config', async () => {
  const dir = await tmp(), home = await tmp(), bundled = path.join(dir, 'bundled.cjs');
  await writeFile(bundled, '// quank\n');
  const ins = createCliInstaller({dir, bundled, electron: "/Applications/Quan K's.app/Contents/MacOS/Electron", home, socket: '/s/quank.sock', tokenFile: '/s/cli.token'});
  assert.equal(await ins.installed(), false);
  const r = await ins.install();
  assert.equal(r.inPath, false);
  const w = await readFile(ins.bin, 'utf8');
  assert.match(w, /^#!\/bin\/sh\n# quank — QuanK 命令行/);
  assert.match(w, /ELECTRON_RUN_AS_NODE=1 exec '\/Applications\/Quan K'\\''s\.app\/Contents\/MacOS\/Electron' '.*cli\/quank\.cjs' "\$@"/);
  assert.equal((await stat(ins.bin)).mode & 0o777, 0o755);
  assert.equal(await readFile(ins.script, 'utf8'), '// quank\n');
  await writeFile(path.join(home, '.zprofile'), 'export PATH="$HOME/.local/bin:$PATH"\n'); assert.equal(await ins.inPath(), true);
  assert.deepEqual(ins.mcpConfig(), {mcpServers: {quank: {command: ins.bin, args: ['mcp']}}});
  await writeFile(bundled, '// quank v2\n'); assert.equal(await ins.refresh(), true); assert.equal(await readFile(ins.script, 'utf8'), '// quank v2\n');
  await ins.uninstall(); assert.equal(await ins.installed(), false);
  await writeFile(ins.bin, '#!/bin/sh\necho other\n');
  await assert.rejects(ins.install(), /不是 QuanK 装的/);
  assert.equal(await ins.refresh(), false, 'never touches a foreign file');
  assert.match(wrapperScript({electron: '/a', script: '/b', socket: '/c', tokenFile: '/d'}), /QUANK_SOCKET='\/c' QUANK_TOKEN_FILE='\/d'/);
  assert.equal(socketPathFor('/x'), '/x/quank.sock');
  assert.match(socketPathFor('/' + 'y'.repeat(120), 501), /quank-501\.sock$/);
  await rm(dir, {recursive: true, force: true}); await rm(home, {recursive: true, force: true});
});

const canListen = await new Promise(res => { const s = createServer(); s.once('error', () => res(false)); s.listen(path.join(tmpdir(), `qk-probe-${process.pid}.sock`), () => s.close(() => res(true))); });
test('socket transport end to end: token, 0600, the real quank client, streamed ask', {skip: canListen ? false : 'this sandbox cannot open Unix sockets (runs on the release Mac)'}, async () => {
  const dir = await mkdtemp('/tmp/qkc-');
  const {deps} = fakeDeps();
  const srv = createCliServer({dir, handler: createCliHandler(deps)});
  const st = await srv.start();
  assert.equal(st.running, true); assert.equal((await stat(srv.socket)).mode & 0o777, 0o600); assert.equal((await stat(srv.tokenFile)).mode & 0o777, 0o600);
  const c = Q.createClient({socket: srv.socket, tokenFile: srv.tokenFile});
  assert.equal((await c.request('hello')).app, 'QuanK');
  assert.deepEqual((await c.request('tools.call', {name: 'app_market_quote', args: {query: '通威'}})).result.echo, {query: '通威'});
  const ev = []; const r = await c.request('ask', {prompt: 'q'}, e => ev.push(e.text));
  assert.deepEqual(ev, ['你好', '，世界']); assert.equal(r.status, 'completed');
  await assert.rejects(c.request('nope'), /未知的请求/);
  c.close();
  await writeFile(path.join(dir, 'bad.token'), 'wrong\n');
  const bad = Q.createClient({socket: srv.socket, tokenFile: path.join(dir, 'bad.token')});
  await assert.rejects(bad.request('hello'), e => e.code === 'QK_TOKEN'); bad.close();
  await srv.stop();
  await assert.rejects(Q.createClient({socket: srv.socket, tokenFile: srv.tokenFile}).request('hello'), e => e.code === 'QK_OFF' || e.code === 'QK_DOWN');
  await rm(dir, {recursive: true, force: true});
});

test('security service: quank controls are audited; overview card states', async () => {
  const store = {data: {security: {}}, async save() {}}, records = [];
  const audit = {count: 0, broken: null, file: '/x', async record(e) { records.push(e); }, list: () => [], verify: async () => ({ok: true, total: 0})};
  const sec = createSecurityService({store, audit});
  await assert.rejects(sec.handle({action: 'cliEnable', enabled: true}), /不支持命令行/);
  let state = {enabled: false, running: false, installed: false, bin: '/h/.local/bin/quank', inPath: false, served: 0, mcp: {mcpServers: {quank: {command: '/h/.local/bin/quank', args: ['mcp']}}}};
  sec.attachCli({view: async () => state, enable: async on => (state = {...state, enabled: on, running: on}), install: async () => { state = {...state, enabled: true, running: true, installed: true}; return {bin: state.bin, inPath: false, view: state}; }, uninstall: async () => (state = {...state, installed: false})});
  assert.equal((await sec.view()).cli.enabled, false);
  assert.match(securityUI.cliCard(state), /默认关闭[\s\S]*开启并安装 quank/);
  await sec.handle({action: 'cliInstall'});
  assert.deepEqual(records.map(r => r.action), ['安装 quank 命令']); assert.equal(records[0].target, '');
  const on = securityUI.cliCard(state);
  assert.match(on, /已开启/); assert.match(on, /data-action="secCliMcp"/); assert.match(on, /export PATH=/); assert.match(on, /data-action="secCliEnable" data-id="off"/);
  await sec.handle({action: 'cliEnable', enabled: false}); assert.equal(records.at(-1).action, '关闭 quank 命令行');
  assert.match(securityUI.cliMcpHtml(state), /&quot;mcpServers&quot;|"mcpServers"/);
  assert.match(securityUI.overviewHtml(await sec.view()), /命令行 quank/);
  sec.lock(); // lock is not enabled: no effect
  assert.equal(securityUI.cliCard(null), '');
});

test('wiring: main, app tools, renderer, packaging', async () => {
  const read = f => readFile(new URL(f, import.meta.url), 'utf8');
  const [main, tools, app, pack] = await Promise.all(['../main.mjs', '../services/app-tools.mjs', '../src/app.js', '../../scripts/package-offline-mac.py'].map(read));
  assert.match(main, /createCliServer\(\{ dir: userDir, handler \}\)/);
  assert.match(main, /cliAsk\?\.stream\(event\)/); assert.match(main, /cliAsk\?\.finished\(e\)/);
  assert.match(main, /security\.attachCli\(cliCtl\)/);
  assert.match(main, /if \(store\.data\.cli\?\.enabled\) cliServer\.start\(\)/, 'off until the user turns it on');
  assert.match(main, /audience === 'model' \? appDeps : Object\.assign\(Object\.create\(appDeps\), \{ privacy: \(\) => \(\{\}\) \}\)/, 'amounts masked for models only');
  assert.match(tools, /via: opts\.via \|\| \(chatId \? 'chat' : 'task'\)/);
  for (const a of ['secCliInstall', 'secCliUninstall', 'secCliEnable', 'secCliMcp']) assert.ok(app.includes(`'${a}'`), a);
  assert.match(pack, /'services'\]/, 'services/cli/quank.cjs ships inside services/');
  const src = await read('../services/cli/quank.cjs');
  assert.ok(!/require\('(?!node:)/.test(src), 'only node built-ins: runs under Electron in node mode');
});

test('report cards: an object summary is never printed as [object Object]; metrics found inside it', () => {
  const def = {fields: {summary: 'summary', metrics: [['回看天数', 'window_days'], ['信号总数', 'n_alerts_total'], ['可评估', 'n_alerts_evaluated']]}};
  const r = summarizeReport(def, {summary: {window_days: 90, n_alerts_total: 37, n_alerts_evaluated: 30, hit_rate: 0.6333, best_action: 'BUY'}});
  assert.ok(!/object Object/.test(r.summary), r.summary);
  assert.equal(r.summary, 'hit_rate：0.633 · best_action：BUY', 'metric keys are not repeated in the summary');
  assert.deepEqual(r.metrics.map(m => [m.label, m.value]), [['回看天数', '90'], ['信号总数', '37'], ['可评估', '30']]);
  assert.equal(summarizeReport(def, {summary: {text: '近 90 天买点胜率 63%'}}).summary, '近 90 天买点胜率 63%');
  assert.equal(summarizeReport({fields: {summary: 'summary'}}, {summary: '当日 1 条研判'}).summary, '当日 1 条研判');
  assert.equal(summaryText([{text: 'a'}, 'b']), 'a；b'); assert.equal(summaryText(null), '');
});
test('missing-interface message names the channel and asks to update', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /当前安装的 QuanK 不支持这个功能（缺少「\$\{name\}」接口）/);
});
