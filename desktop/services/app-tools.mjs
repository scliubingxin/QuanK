// [ux5] App tools: everything a user can do in the QuanK UI can also be asked for in chat.
// Reads run directly; anything that changes the app (create / edit / pause / delete / run a scheduled task) shows a native
// confirmation first. In unattended scheduled runs the approval gate defers those to 「待你确认」, so tasks cannot spawn tasks.
import { uid } from '../core.mjs';
import { normalizeSchedule, nextRunAt, describeSchedule, WEEKDAY_NAMES } from '../src/shared/schedule.js';
import { selectEntities, relationsOf } from '../src/shared/graph.js';
import { kindInfo, safeUrl } from '../src/shared/connectors.js'; // [ux9]
import { guideFor } from './connector-guides.mjs'; // [ux9]
import { normalizeWatch, parseWatch, describeWatch, parseTrade, normalizeReportAuto, parseReportAuto, describeReportAuto } from '../src/shared/quant.js'; // [q3][q4][q5]
import { capabilityPresets } from '../runtime/capability-presets.mjs'; // [mcp2]

export const APP_PAGES = {home: '工作台', feed: '动态', quant: '量化', studio: '创作', tasks: '自动化', library: '成果中心', files: '本地文件', agents: '智能体', connectors: '连接', tools: '浏览器与权限', graph: '知识图谱', context: '记忆'};
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const iso = ms => Number.isFinite(ms) ? new Date(ms).toISOString() : null;
const local = ms => { if (!Number.isFinite(ms)) return null; const d = new Date(ms), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const def = (name, description, properties = {}, required = []) => ({type: 'function', function: {name, description, parameters: {type: 'object', properties, required, additionalProperties: false}}});
const SCHEDULE = {type: 'object', description: '执行频率。kind：manual 仅手动 / once 仅一次（at 为本机时间 "YYYY-MM-DDTHH:mm"）/ hourly 每 every 小时（1–24）/ daily 每天 time / weekdays 工作日 time / weekly 每周 days（0=周日…6=周六）的 time。time 为 "HH:mm"。',
  properties: {kind: {type: 'string', enum: ['manual', 'once', 'hourly', 'daily', 'weekdays', 'weekly']}, every: {type: 'integer'}, time: {type: 'string'}, days: {type: 'array', items: {type: 'integer'}}, at: {type: 'string'}}, required: ['kind'], additionalProperties: false};

export function appToolDefinitions({incognito = false} = {}) {
  return [
    def('app_task_list', '列出 QuanK 的定时任务（名称、频率、是否启用、状态、下次与上次运行时间）。'),
    def('app_task_create', '在 QuanK「自动化」中创建定时任务：到点后由智能体按 prompt 自动执行一次对话，结果进入动态。用户说「每天/每小时/工作日…帮我…」「提醒我…」「定时…」时使用。会弹出确认框。prompt 要写成到点后能独立执行的完整指令。',
      {name: {type: 'string', description: '不超过 30 字的任务名'}, prompt: {type: 'string'}, schedule: SCHEDULE, toolsEnabled: {type: 'boolean', description: '执行时是否允许使用工具（联网查资料、读文档等）；需要查网页或数据时为 true'}, agentId: {type: 'string'}}, ['name', 'prompt', 'schedule']),
    def('app_task_update', '修改定时任务：改名称、指令、频率、工具开关，或用 enabled 暂停 / 恢复。会弹出确认框。', {id: {type: 'string'}, enabled: {type: 'boolean'}, name: {type: 'string'}, prompt: {type: 'string'}, schedule: SCHEDULE, toolsEnabled: {type: 'boolean'}}, ['id']),
    def('app_task_delete', '删除一个定时任务（运行记录一并删除）。会弹出确认框。', {id: {type: 'string'}}, ['id']),
    def('app_task_run', '立即运行一次定时任务（不影响原定计划）。会弹出确认框。', {id: {type: 'string'}}, ['id']),
    def('app_connector_list', '列出「连接」里已添加的数据源（网页 / RSS、日历、邮件、飞书 / 钉钉 / 企业微信）及同步状态。'),
    def('app_connector_sync', '立即同步一个连接（只读，拉取新内容）。', {id: {type: 'string'}}, ['id']),
    def('app_connector_add', '在「连接」里添加数据源：网页 / RSS（kind=feed，config.url）、日历（kind=calendar，config.mode=ics|caldav，config.url）、邮箱（kind=mail，config.preset=qq|163|126|exmail|aliyun|feishu|gmail|outlook|custom，config.email）、飞书 / 钉钉 / 企业微信（kind=office，config.platform=feishu|dingtalk|wecom，config.appId 可选）。不需要密码的直接添加（弹确认框）；需要授权码、App Secret、Webhook 等密钥时，会在「连接」页弹出预填好的表单由用户本人填写——不要向用户索要或在对话里传递任何密钥。',
      {kind: {type: 'string', enum: ['feed', 'calendar', 'mail', 'office']}, name: {type: 'string'}, config: {type: 'object', description: '只放非密钥字段', additionalProperties: {type: 'string'}}, interval: {type: 'integer', description: '同步间隔（分钟）：0 / 15 / 30 / 60 / 180 / 720 / 1440'}}, ['kind']),
    def('app_connector_guide', '取得某种连接的开通步骤（在哪个后台创建应用、复制哪些凭证、开哪些权限、平台限制）和官方文档入口。', {kind: {type: 'string', enum: ['feed', 'calendar', 'mail', 'office']}, platform: {type: 'string', enum: ['feishu', 'dingtalk', 'wecom']}, mode: {type: 'string', enum: ['ics', 'caldav']}}, ['kind']),
    def('app_miniapp_list', '列出「创作 · 小应用」里保存的小应用（名称、版本数、数据条数、更新时间）。'),
    def('app_miniapp_read', '只读取某个小应用在本机保存的数据（localStorage 的键和值），用于汇总、提醒或分析。不会修改应用或数据。', {id: {type: 'string'}}, ['id']),
    def('app_quant_status', '查看本机量化引擎状态和股票池（每只股票最近一次的档位、综合分、倍率、现价）。'),
    def('app_quant_signal', '计算某只股票当前的量化信号（本机私有策略引擎）：档位、综合分与调整前分数、倍率、理由、约束与风控、评分构成、指标、模型概率、仓位建议和回测摘要。单只可能需要几十秒，2 分钟内有缓存。', {code: {type: 'string', description: '6 位股票代码'}, fresh: {type: 'boolean', description: '忽略缓存重新计算'}}, ['code']),
    def('app_quant_scan', '逐只计算股票池里所有股票的信号并汇总（可能需要几分钟），用于「池子里谁是买点」「哪些在风控」。'),
    def('app_quant_insight', '取某只股票的 AI 研判（大模型复核算法结论）；AI 不可用时返回算法结论。', {code: {type: 'string'}}, ['code']),
    def('app_quant_find_stock', '按公司名称、简称、拼音首字母或代码联网查找沪深北 A 股的股票代码、名称和板块。只读。', {query: {type: 'string'}}, ['query']), // [v45q]
    def('app_quant_pool_add', '把股票加入量化股票池。用户只说公司名称（如「添加宁德时代」「把茅台加到自选」）时把名称放进 query，QuanK 会联网查代码、名称并获取公司标志；同名多只时返回候选供用户选择。会弹出确认框。', {query: {type: 'string', description: '公司名称、简称或 6 位代码'}, code: {type: 'string'}, name: {type: 'string'}}, []),
    def('app_quant_pool_remove', '把股票移出量化股票池。会弹出确认框。', {code: {type: 'string'}}, ['code']),
    def('app_quant_holdings', '查看本机量化引擎里的持仓（股数、成本、现价、市值、浮动盈亏、最近成交记录）和定投计划；给 code 时只看这一只。只读。', {code: {type: 'string'}}),
    def('app_quant_trade_record', '记录一笔用户在券商实际成交的买卖，用来更新本机引擎里的持仓与成本（不会替用户下单）。会弹出确认框。', {code: {type: 'string'}, side: {type: 'string', enum: ['buy', 'sell']}, price: {type: 'number'}, shares: {type: 'integer'}, date: {type: 'string', description: '成交日期 YYYY-MM-DD，默认今天'}, note: {type: 'string'}}, ['code', 'side', 'price', 'shares']),
    def('app_quant_plan_set', '修改定投计划（周期与次数），可选的周期见 app_quant_holdings 返回的 planOptions。会弹出确认框。', {type: {type: 'string'}, times: {type: 'integer'}}, ['type', 'times']),
    def('app_quant_report', '量化引擎自带的分析报告（如算法日报、信号结果评估）。不给 id 时列出可用报告和最近一次结果；给 id 时返回该报告的指标、告警、建议和正文；run=true 时在本机重新运行分析脚本（可能需要几分钟），date 可指定日期 YYYY-MM-DD。', {id: {type: 'string'}, run: {type: 'boolean'}, date: {type: 'string'}}),
    def('app_quant_report_auto', '设置工作日收盘后自动生成每日报告（时间需在 15:00 之后）。会弹出确认框。', {enabled: {type: 'boolean'}, time: {type: 'string', description: 'HH:mm'}}),
    def('app_mcp_list', '列出已配置的 MCP 连接（名称、方式、是否已登录、上次测试）和可以一键添加的预置数据源（含是否需要密钥）。'),
    def('app_mcp_add', '添加 MCP 连接。preset 为预置 ID（先用 app_mcp_list 查看）：不需要密钥的预置直接添加（弹确认框）；需要 API Key / Token 的会在「MCP 连接器」页弹出预填好的表单由用户本人填写——不要向用户索要或在对话里传递任何密钥。也可以给 url 添加自定义远程服务（auth=none 或 oauth）。',
      {preset: {type: 'string'}, name: {type: 'string'}, url: {type: 'string'}, auth: {type: 'string', enum: ['none', 'oauth']}}),
    def('app_mcp_signin', '为「浏览器登录」方式的 MCP 连接打开系统浏览器登录（会弹确认框）。id 可以是连接 ID 或名称。', {id: {type: 'string'}}, ['id']),
    def('app_mcp_test', '测试 MCP 连接并发现工具目录（会弹确认框；本机程序会显示完整启动命令）。id 可以是连接 ID 或名称。', {id: {type: 'string'}}, ['id']),
    def('app_quant_watch', '设置量化盯盘提醒：交易时段按频率重新计算股票池，档位变化写入「动态」并发系统通知；工作日开盘前生成盘前简报。会弹出确认框。', {enabled: {type: 'boolean'}, interval: {type: 'integer', description: '检查频率（分钟）：5 / 10 / 15 / 30 / 60'}, premarket: {type: 'boolean'}, premarketTime: {type: 'string', description: '盘前简报时间 HH:mm，06:00–09:29'}, notify: {type: 'boolean'}}),
    def('app_quant_open', '在 QuanK 里打开「量化」页；给 code 时直接打开该股的详情（K 线、综合分、回测曲线）。', {code: {type: 'string'}}),
    def('app_web_search', '联网搜索（返回标题、链接、摘要）。用于查官方操作文档、最新做法、公开资料；回答时给出来源链接。', {query: {type: 'string'}}, ['query']),
    def('app_web_read', '读取一个公网网页的正文（纯文本，最多约 12000 字）。先 app_web_search 找到链接再读取。', {url: {type: 'string'}}, ['url']),
    def('app_dashboard_create', '用成果中心里的 Excel 表格生成可交互仪表盘（保存在「创作」页）。数值由本机计算。', {documentId: {type: 'string'}, prompt: {type: 'string', description: '想看什么，例如「按月看各区域销售额」'}}, ['documentId']),
    def('app_briefing_generate', '立即生成今日简报（需要你处理的事、完成的工作、今日日程、新邮件等），返回各板块要点。'),
    def('app_open_page', '在 QuanK 窗口中打开某个页面，方便用户查看结果。', {page: {type: 'string', enum: Object.keys(APP_PAGES)}}, ['page']),
    ...(incognito ? [] : [
      def('app_memory_add', '把用户明确要求记住的偏好或事实存入长期记忆（不要存密码、密钥等敏感信息）。', {text: {type: 'string'}, kind: {type: 'string', enum: ['preference', 'fact', 'profile']}}, ['text']),
      def('app_graph_search', '在知识图谱中查找人、公司、项目等实体及其关系。', {query: {type: 'string'}}, ['query']),
    ]),
  ];
}
export const APP_TOOL_NAMES = new Set(appToolDefinitions().map(d => d.function.name));
/** Requests that only make sense through app tools: offered even when the composer's 「允许使用工具」 is off (app tools only). */
export const APP_INTENT = /定时|每天|每日|每晚|每早|每小时|每隔|每周|每月|工作日|提醒我|定期|自动化任务|计划任务|(暂停|恢复|删除|修改|运行|停止|列出|查看).{0,12}任务|同步.{0,8}(连接|邮件|日历|订阅)|(生成|做).{0,10}(仪表盘|简报)|记住|打开.{0,6}(页面|动态|创作|自动化|知识图谱|记忆|连接)|(小应用|小工具).{0,10}(数据|记录|内容|里)|(连|连接|接入|绑定|添加|对接|关联|授权).{0,8}(钉钉|飞书|企业微信|企微|邮箱|日历|RSS|rss|订阅源?|数据源|MCP|mcp)|(添加|登录|测试|连接).{0,6}(MCP|mcp)|Tushare|AKShare|Alpha ?Vantage|Twelve ?Data|(联网|上网|网上|搜索|搜一下|查一下).{0,10}(文档|教程|资料|操作|步骤|怎么|如何)/;

function f_isSelectInvalid(info, config) { // [ux9]
  return (info.fields || []).some(f => f.type === 'select' && config[f.name] !== undefined && !f.options.some(([v]) => v === config[f.name]));
}

export function appToolContext(now = Date.now()) {
  const d = new Date(now);
  return `\n应用内操作：用户要求创建、修改、暂停、恢复、删除或立即运行定时任务（例如「每小时看一下通威的股价」「每天 8 点汇总未读邮件」「工作日 9 点提醒我…」）时，调用 app_task_* 工具完成，不要说没有定时任务工具，也不要让用户自己去配置系统计划任务；同步连接、生成仪表盘或简报、记住偏好、打开页面同理使用 app_* 工具。用户要连接钉钉、飞书、企业微信、邮箱、日历或 RSS 时调用 app_connector_add（可先 app_connector_guide 取开通步骤，再用 app_web_search / app_web_read 查官方文档的最新做法）：不需要密码的直接添加；需要授权码、App Secret、Webhook 的会在「连接」页弹出预填好的表单，由用户本人填写，你不要索要或复述任何密钥。不要说没有添加连接的能力。用户问股票信号、买卖点、回测、定投或股票池时调用 app_quant_*（本机量化引擎，按用户自己的私有策略计算），不要凭记忆报价或编造信号；用户说「添加 / 加入 / 关注某公司」时直接调用 app_quant_pool_add，把公司名放在 query 里，QuanK 会联网查代码和标志，不要让用户自己去查代码；回答时说明档位、综合分、倍率和主要理由，并提示仅供研究、不构成投资建议。需要查资料、查操作文档时用 app_web_search 搜索、app_web_read 读原文，再回答并附上来源链接。修改类操作会弹出确认框，用户拒绝时如实说明未执行。当前本机时间：${local(now)}（周${WEEKDAY_NAMES[d.getDay()]}）。`;
}

const taskView = t => ({id: t.id, name: t.name, schedule: describeSchedule(t.schedule), enabled: !!t.enabled, status: t.status || 'ready',
  nextRun: local(t.nextRun), lastRun: local(t.lastRun), toolsEnabled: !!t.toolsEnabled, prompt: clip(t.prompt, 200), ...(t.error ? {error: clip(t.error, 200)} : {})});

/**
 * deps (filled in by main as services are created): workspace, runTask, connectors, dashboards, briefing, openPage, notify.
 * ask(title, detail, signal) -> boolean (the gated approver).
 */
export async function executeAppTool(name, args = {}, {store, deps = {}, ask, signal, chatId, now = Date.now} = {}) {
  const tasks = () => store.data.tasks || [];
  const findTask = id => { const t = tasks().find(t => t.id === id); if (!t) throw new Error('任务不存在，请先用 app_task_list 查看任务 ID'); return t; };
  const confirm = async (title, detail) => { const r = await ask(title, detail, signal); return r === true || r?.allowed === true; };
  const need = k => { if (!deps[k]) throw new Error('当前环境不支持这个操作'); return deps[k]; };
  const denied = {status: 'denied', message: '用户没有确认，未执行'};
  const findMcp = v => { const list = store.data.mcpConnections || []; const c = list.find(c => c.id === v) || list.find(c => c.name === v); if (!c) throw new Error('没有这个 MCP 连接，请先用 app_mcp_list 查看'); return c; }; // [mcp2]
  switch (name) {
    case 'app_task_list':
      return {status: 'succeeded', tasks: tasks().slice(0, 50).map(taskView), total: tasks().length};
    case 'app_task_create': {
      const schedule = normalizeSchedule(args.schedule);
      const nameText = clip(args.name, 100), prompt = String(args.prompt || '').trim();
      if (!nameText || !prompt) throw new Error('请提供任务名称和执行指令');
      if (schedule.kind !== 'manual' && nextRunAt(schedule, now()) === null) throw new Error('执行时间已过去，请换一个时间');
      const agentId = args.agentId && (store.data.agents || []).some(a => a.id === args.agentId) ? args.agentId : 'assistant';
      const agentName = (store.data.agents || []).find(a => a.id === agentId)?.name || 'QuanK 助手';
      if (!await confirm('创建定时任务？', `名称：${nameText}\n频率：${describeSchedule(schedule)}\n执行：${agentName}${args.toolsEnabled ? '，允许使用工具' : ''}\n\n${clip(prompt, 400)}`)) return denied;
      const before = new Set(tasks().map(t => t.id));
      await need('workspace').task({name: nameText, prompt, schedule, agentId, toolsEnabled: args.toolsEnabled === true});
      const created = tasks().find(t => !before.has(t.id));
      store.log?.('已通过对话创建定时任务', `${nameText} · ${describeSchedule(schedule)}`);
      deps.notify?.();
      return {status: 'succeeded', task: created ? taskView(created) : null, note: '任务已保存在「自动化」页；应用需要保持运行才能按时执行。'};
    }
    case 'app_task_update': {
      const t = findTask(args.id);
      const editing = ['name', 'prompt', 'schedule', 'toolsEnabled'].some(k => args[k] !== undefined);
      if (!editing && typeof args.enabled !== 'boolean') throw new Error('没有要修改的内容');
      const next = {name: args.name !== undefined ? clip(args.name, 100) : t.name, prompt: args.prompt !== undefined ? String(args.prompt).trim() : t.prompt,
        schedule: args.schedule !== undefined ? normalizeSchedule(args.schedule) : t.schedule || {kind: 'manual'}, toolsEnabled: args.toolsEnabled !== undefined ? args.toolsEnabled === true : !!t.toolsEnabled};
      const changes = [editing && next.name !== t.name ? `名称：${t.name} → ${next.name}` : '', editing && args.schedule !== undefined ? `频率：${describeSchedule(t.schedule)} → ${describeSchedule(next.schedule)}` : '',
        editing && args.prompt !== undefined ? `指令：${clip(next.prompt, 200)}` : '', editing && args.toolsEnabled !== undefined ? `工具：${next.toolsEnabled ? '允许' : '不允许'}` : '',
        typeof args.enabled === 'boolean' ? (args.enabled ? '恢复执行' : '暂停执行') : ''].filter(Boolean);
      if (!await confirm(`修改定时任务「${clip(t.name, 40)}」？`, changes.join('\n'))) return denied;
      const ws = need('workspace');
      if (editing) await ws.task({id: t.id, edit: true, ...next, agentId: t.agentId || 'assistant', ...(t.modelChoice ? {modelChoice: t.modelChoice} : {})});
      if (typeof args.enabled === 'boolean' && (!editing || args.enabled !== (next.schedule.kind !== 'manual'))) await ws.task({id: t.id, enabled: args.enabled});
      deps.notify?.();
      return {status: 'succeeded', task: taskView(findTask(t.id))};
    }
    case 'app_task_delete': {
      const t = findTask(args.id);
      if (!await confirm(`删除定时任务「${clip(t.name, 40)}」？`, `频率：${describeSchedule(t.schedule)}\n删除后不再执行，运行记录一并删除。`)) return denied;
      await need('workspace').task({id: t.id, remove: true});
      deps.notify?.();
      return {status: 'succeeded', deleted: t.id};
    }
    case 'app_task_run': {
      const t = findTask(args.id);
      if (t.chatId && t.chatId === chatId) throw new Error('不能在任务自己的运行中再次启动它');
      if (!await confirm(`立即运行「${clip(t.name, 40)}」？`, `运行一次，不影响原定计划（${describeSchedule(t.schedule)}）。`)) return denied;
      await need('runTask')(t.id, {requestId: uid()});
      return {status: 'succeeded', note: '已开始运行，结果会出现在「动态」和任务自己的对话里。'};
    }
    case 'app_connector_list':
      return {status: 'succeeded', connectors: (store.data.connectors || []).map(c => ({id: c.id, name: c.name, kind: c.kind, status: c.status, items: c.count || 0, lastSync: local(c.lastSync), ...(c.error ? {error: clip(c.error, 160)} : {})}))};
    case 'app_connector_sync': {
      const c = (store.data.connectors || []).find(c => c.id === args.id);
      if (!c) throw new Error('连接不存在，请先用 app_connector_list 查看');
      const r = await need('connectors').sync(c.id, {signal});
      return r?.error ? {status: 'failed', error: r.error} : {status: 'succeeded', added: r?.added || 0};
    }
    case 'app_connector_add': { // [ux9] secrets never pass through the conversation
      const info = kindInfo(args.kind);
      if (!info?.available) throw new Error('连接类型只支持 feed / calendar / mail / office');
      const raw = args.config && typeof args.config === 'object' && !Array.isArray(args.config) ? args.config : {};
      const fieldNames = new Set((info.fields || []).map(f => f.name)), secretFields = info.secretFields || [];
      const dropped = Object.keys(raw).filter(k => !fieldNames.has(k));
      const config = {};
      for (const f of info.fields || []) {
        const v = raw[f.name];
        if (v !== undefined && v !== null && String(v).trim()) config[f.name] = String(v).trim().slice(0, 2048);
        else if (f.type === 'select') config[f.name] = f.options[0][0];
      }
      if (f_isSelectInvalid(info, config)) throw new Error('连接配置的选项无效');
      const name = clip(args.name, 60), interval = Number.isInteger(args.interval) ? args.interval : undefined;
      const guide = guideFor(info.kind, config);
      const needSecret = info.kind === 'office' || secretFields.some(f => f.required || (f.requiredWhen && Object.entries(f.requiredWhen).every(([k, v]) => config[k] === v)));
      const missing = (info.fields || []).filter(f => f.required && !config[f.name]).map(f => f.label);
      if (config.url) config.url = safeUrl(config.url);
      if (needSecret || missing.length) {
        need('openConnectorForm')({kind: info.kind, config, name, ...(interval !== undefined ? {interval} : {})});
        const toFill = [...missing, ...secretFields.filter(f => f.required || (f.requiredWhen && Object.entries(f.requiredWhen).every(([k, v]) => config[k] === v)) || info.kind === 'office').map(f => f.label)];
        return {status: 'needs_user', message: `已打开「连接」页，并预填好「${info.label}」的添加表单。请用户本人在表单里填写：${toFill.join('、')}，然后点「连接并同步」。`, guide,
          ...(dropped.length ? {note: '密钥等非表单字段不会经过对话，已忽略，请在表单里填写'} : {})};
      }
      const labelOf = k => (info.fields || []).find(f => f.name === k)?.label || k;
      if (!await confirm(`添加连接「${info.label}」？`, `${Object.entries(config).map(([k, v]) => `${labelOf(k)}：${v}`).join('\n')}${name ? `\n名称：${name}` : ''}\n\n添加后按频率只读同步，内容只保存在本机。`)) return denied;
      const r = await need('connectors').handle({action: 'add', kind: info.kind, name, config, ...(interval !== undefined ? {interval} : {})});
      deps.notify?.();
      return r?.error ? {status: 'failed', id: r.id, error: clip(r.error, 200), guide} : {status: 'succeeded', id: r.id, added: r.added || 0};
    }
    case 'app_connector_guide': {
      const info = kindInfo(args.kind);
      if (!info) throw new Error('连接类型只支持 feed / calendar / mail / office');
      return {status: 'succeeded', guide: guideFor(info.kind, {platform: args.platform, mode: args.mode}), fields: [...(info.fields || []), ...(info.secretFields || [])].map(f => f.label), description: info.description};
    }
    case 'app_miniapp_list': // [p4-m4]
      return {status: 'succeeded', apps: need('miniapps').view().map(a => ({id: a.id, name: a.name, versions: (a.versions || 0) + 1, dataItems: a.dataItems || 0, updated: local(a.updated)}))};
    case 'app_miniapp_read': {
      const r = need('miniapps').read(args.id);
      let budget = 20000;
      const data = {};
      for (const [k, v] of Object.entries(r.data || {})) { if (budget <= 0) break; const s = String(v).slice(0, Math.min(4000, budget)); data[k] = s; budget -= k.length + s.length; }
      return {status: 'succeeded', id: r.id, name: r.name, updated: local(r.updated), data, ...(Object.keys(data).length < Object.keys(r.data || {}).length ? {note: '数据较多，只返回了前面的部分'} : {})};
    }
    case 'app_quant_status': { // [q1]
      const v = need('quant').view();
      return {status: 'succeeded', engine: v.status, error: v.error || undefined, source: v.source, watch: describeWatch(v.watch), recentChanges: (v.alerts || []).filter(a => a.kind === 'change').slice(0, 5).map(a => ({code: a.code, name: a.name, from: a.from, to: a.to, time: local(a.time)})), pool: v.pool.map(p => ({code: p.code, name: p.name, ...(p.last ? {action: p.last.action, actionText: p.last.actionText, score: p.last.score, multiplier: p.last.multiplier, price: p.last.price, changePct: p.last.changePct, updated: local(p.last.at)} : {})}))};
    }
    case 'app_quant_signal': {
      const r = await need('quant').handle({action: 'signal', code: args.code, fresh: args.fresh === true});
      return {status: 'succeeded', signal: r.summary, holding: r.holding ? {...r.holding, log: (r.holding.log || []).slice(0, 3)} : null, recentOps: (r.charts?.ops || []).slice(0, 8), updated: local(r.at), note: '仅供研究，不构成投资建议。'};
    }
    case 'app_quant_scan': {
      const r = await need('quant').handle({action: 'refreshAll'});
      return {status: 'succeeded', results: (r.results || []).map(s => s.error ? {code: s.code, error: s.error} : {code: s.code, name: s.name, action: s.action, actionText: s.actionText, score: s.score, multiplier: s.multiplier, price: s.price, changePct: s.changePct, reason: (s.reasons || [])[0] || ''})};
    }
    case 'app_quant_insight':
      return {status: 'succeeded', ...(await need('quant').handle({action: 'insight', code: args.code}))};
    case 'app_quant_find_stock': // [v45q]
      return {status: 'succeeded', ...(await need('quant').handle({action: 'findStock', query: String(args.query || '').trim()}))};
    case 'app_quant_pool_add': case 'app_quant_pool_remove': {
      const add = name === 'app_quant_pool_add', q = need('quant');
      let code = String(args.code || '').trim(), label = String(args.name || '').trim();
      if (add) { // [v45q] a company name is enough: look the code up first
        const query = /^(?:sh|sz|bj)?\d{6}$/i.test(code) ? '' : String(args.query || code || label || '').trim();
        if (query) {
          const r = await q.handle({action: 'resolveStock', query});
          if (r?.choices?.length) return {status: 'needs_choice', candidates: r.choices, message: '有多只股票匹配，请让用户确认是哪一只，再用 code 调用'};
          if (r?.error) return {status: 'failed', error: r.error};
          code = String(r?.code || ''); label = label || String(r?.name || '');
        }
        code = code.replace(/^(sh|sz|bj)/i, '');
        if (!/^\d{6}$/.test(code)) return {status: 'failed', error: '没找到这只股票，请提供公司全称或 6 位代码'};
      }
      const shown = label ? `${label}（${code}）` : code; const sep = label ? '' : ' '; // 全角括号后不加空格
      if (!await confirm(add ? `把 ${shown}${sep}加入量化股票池？` : `把 ${shown}${sep}移出量化股票池？`, add ? '加入后可在「量化」页查看信号，定时提醒也会覆盖它；会自动联网获取公司标志。' : '移出后不再计算和提醒这只股票。')) return denied;
      const r = await q.handle({action: add ? 'addStock' : 'removeStock', code, name: label || args.name});
      deps.notify?.();
      return {status: 'succeeded', ...(add ? {added: {code, name: label || r.name || ''}, logo: !!r.logo} : {}), pool: (r.pool || []).map(p => ({code: p.code, name: p.name}))};
    }
    case 'app_quant_holdings': { // [q4]
      const q = need('quant');
      if (args.code) return {status: 'succeeded', holding: await q.handle({action: 'holding', code: args.code}), note: '持仓来自本机引擎的记录；仅供研究，不构成投资建议。'};
      const r = await q.handle({action: 'holdings'});
      let pl = null;
      try { pl = await q.handle({action: 'plan'}); } catch {}
      return {status: 'succeeded', holdings: (r.holdings || []).map(h => Array.isArray(h.log) ? {...h, log: h.log.slice(0, 5)} : h), totals: r.totals, plan: pl?.plan || null, planOptions: pl?.options || []};
    }
    case 'app_quant_trade_record': {
      const t = parseTrade(null, args), word = t.side === 'sell' ? '卖出' : '买入';
      if (!await confirm(`记录一笔${word}？`, `${t.code} ${word} ${t.shares} 股 @ ${t.price}（约 ${Math.round(t.price * t.shares * 100) / 100} 元）${t.date ? '\n成交日期：' + t.date : ''}${t.note ? '\n备注：' + t.note : ''}\n\n只更新本机引擎里的持仓与成本，不会下单。`)) return denied;
      const r = await need('quant').handle({action: 'record', ...t});
      deps.notify?.();
      return {status: 'succeeded', trade: r.trade, holding: r.holding ? {...r.holding, log: (r.holding.log || []).slice(0, 3)} : null};
    }
    case 'app_quant_plan_set': {
      const o = (need('quant').view().planOptions || []).find(x => x.type === args.type);
      if (!await confirm('修改定投计划？', `${o?.label || args.type} ${args.times} 次\n修改后所有股票的信号和仓位建议按新节奏重新计算。`)) return denied;
      const r = await need('quant').handle({action: 'planSet', type: args.type, times: args.times});
      deps.notify?.();
      return {status: 'succeeded', plan: r.plan};
    }
    case 'app_quant_report': { // [q5]
      const q = need('quant');
      if (!args.id) { const v = q.view(); return {status: 'succeeded', auto: describeReportAuto(v.reportAuto), reports: (v.reportDefs || []).map(d => { const r = v.reports?.[d.id]; return {id: d.id, title: d.title, schedule: d.schedule === 'daily' ? '每日' : '手动', at: r?.at || null, ok: r?.ok ?? null, summary: r ? (r.ok ? r.summary : r.error) : '尚未生成'}; })}; }
      const r = args.run ? await q.handle({action: 'reportRun', id: args.id, ...(args.date ? {date: args.date} : {})}) : await q.handle({action: 'report', id: args.id});
      deps.notify?.();
      return {status: 'succeeded', report: {...r, ...(typeof r.md === 'string' ? {md: r.md.slice(0, 6000)} : {})}, note: '报告由本机引擎的分析脚本生成；仅供研究，不构成投资建议。'};
    }
    case 'app_quant_report_auto': {
      const change = parseReportAuto(args), next = {...normalizeReportAuto(need('quant').view().reportAuto), ...change};
      if (!await confirm('修改量化日报自动生成？', describeReportAuto(next))) return denied;
      const r = await need('quant').handle({action: 'reportAuto', ...change});
      deps.notify?.();
      return {status: 'succeeded', auto: r.text};
    }
    case 'app_mcp_list': // [mcp2]
      return {status: 'succeeded', connections: (store.data.mcpConnections || []).map(c => ({id: c.id, name: c.name, transport: c.transport === 'stdio' ? 'stdio' : 'http', auth: c.auth || 'none', enabled: c.enabled !== false, ...(c.auth === 'oauth' ? {signedIn: !!c.encryptedGrant} : {}), lastTest: c.lastTest?.status || null, tools: c.lastTest?.tools?.length || 0})),
        presets: capabilityPresets().mcp.map(p => ({id: p.id, title: p.title, category: p.category, description: p.description, way: p.transport === 'stdio' ? '本机程序' : p.auth === 'oauth' ? '浏览器登录' : p.auth === 'bearer' ? 'API Key' : '免密钥', needsSecret: p.auth === 'bearer' || (p.env || []).some(e => e.required)}))};
    case 'app_mcp_add': {
      const lib = need('capabilities');
      if (args.preset) {
        const p = capabilityPresets().mcp.find(x => x.id === args.preset);
        if (!p) throw new Error('没有这个预置 MCP，请先用 app_mcp_list 查看');
        if (p.auth === 'bearer' || (p.env || []).some(e => e.required)) { need('openMcpForm')({preset: p.id}); return {status: 'needs_user', message: `已在「MCP 连接器」打开预填好的「${p.title}」表单，请用户本人填写${p.auth === 'bearer' ? ' API Key' : '所需 Token'}后保存。`}; }
        const stdio = p.transport === 'stdio';
        if (!await confirm(`添加 MCP「${p.title}」？`, stdio ? `本机程序：${[p.command, ...(p.args || [])].join(' ')}\n首次运行可能需要下载程序包；每次启动仍会请你确认完整命令。` : `${p.url}\n${p.auth === 'oauth' ? '添加后需要在浏览器登录你的账号。' : '免密钥公共入口。'}`)) return denied;
        const r = await lib.connection({name: p.title, description: p.description, url: stdio ? undefined : p.url, auth: stdio ? 'none' : p.auth, transport: stdio ? 'stdio' : 'http', ...(stdio ? {command: p.command, args: [...(p.args || [])]} : {}), presetId: p.id, enabled: true, env: {}});
        deps.notify?.();
        return {status: 'succeeded', id: r?.id, next: p.auth === 'oauth' ? '请调用 app_mcp_signin 让用户在浏览器登录，然后用 app_mcp_test 测试' : '可以调用 app_mcp_test 测试连接'};
      }
      const url = String(args.url || '').trim();
      if (!url) throw new Error('请提供预置 ID（preset）或服务地址（url）');
      const auth = args.auth === 'oauth' ? 'oauth' : 'none';
      let host = url; try { host = new URL(url).host; } catch {}
      if (!await confirm('添加 MCP 连接？', `${url}\n${auth === 'oauth' ? '添加后需要在浏览器登录。' : '无认证。'}`)) return denied;
      const r = await lib.connection({name: clip(args.name, 40) || host, url, auth, transport: 'http', enabled: true});
      deps.notify?.();
      return {status: 'succeeded', id: r?.id, next: auth === 'oauth' ? '请调用 app_mcp_signin' : '可以调用 app_mcp_test'};
    }
    case 'app_mcp_signin': {
      const c = findMcp(args.id);
      if (c.auth !== 'oauth') throw new Error('这个连接不是浏览器登录方式');
      const r = await need('capabilities').oauthSignIn(c.id);
      deps.notify?.();
      return {status: 'succeeded', signedIn: !!r?.signedIn};
    }
    case 'app_mcp_test': {
      const c = findMcp(args.id);
      const r = await need('capabilities').probe(c.id);
      deps.notify?.();
      return {status: 'succeeded', tools: r?.count ?? 0};
    }
    case 'app_quant_watch': { // [q3]
      const change = parseWatch(args), next = {...normalizeWatch(need('quant').view().watch), ...change};
      if (!await confirm('修改量化盯盘提醒？', describeWatch(next))) return denied;
      const r = await need('quant').handle({action: 'watch', ...change});
      deps.notify?.();
      return {status: 'succeeded', watch: r.text};
    }
    case 'app_quant_open':
      need('openQuant')(args.code ? String(args.code).trim() : '');
      return {status: 'succeeded', opened: args.code ? `量化 · ${args.code}` : '量化'};
    case 'app_web_search':
      return {status: 'succeeded', results: await need('web').search(args.query, {signal})};
    case 'app_web_read':
      return {status: 'succeeded', ...(await need('web').read(args.url, {signal}))};
    case 'app_dashboard_create': {
      const d = (store.data.documents || []).find(d => d.id === args.documentId);
      if (!d) throw new Error('文档不存在');
      if (d.format !== 'xlsx') throw new Error('只有 Excel 表格可以生成仪表盘');
      const r = await need('dashboards').handle({action: 'create', source: 'document', documentId: d.id, prompt: clip(args.prompt, 2000)});
      deps.notify?.();
      return {status: 'succeeded', dashboardId: r.id, ...(r.note ? {note: r.note} : {}), hint: '仪表盘已保存在「创作」页，可用 app_open_page 打开。'};
    }
    case 'app_briefing_generate': {
      const b = await need('briefing').generate({manual: true});
      return {status: 'succeeded', summary: b.summary || '', sections: b.sections.map(s => ({title: s.title, items: s.items.slice(0, 8).map(i => i.text)}))};
    }
    case 'app_open_page': {
      if (!APP_PAGES[args.page]) throw new Error('页面不存在');
      need('openPage')(args.page);
      return {status: 'succeeded', opened: APP_PAGES[args.page]};
    }
    case 'app_memory_add': {
      const text = clip(args.text, 500);
      if (text.length < 2) throw new Error('记忆内容太短');
      if (/密码|口令|passw|验证码|token|api[ _-]?key|secret|私钥|sk-[a-z0-9]{6,}/i.test(text)) throw new Error('不保存密码、密钥等敏感信息');
      await need('workspace').memory({text, ...(['preference', 'fact', 'profile'].includes(args.kind) ? {kind: args.kind} : {})});
      deps.notify?.();
      return {status: 'succeeded', saved: text};
    }
    case 'app_graph_search': {
      const g = store.data.graph || {entities: [], relations: []}, q = String(args.query || '').trim().toLowerCase();
      if (!q) throw new Error('请提供检索词');
      let hits = selectEntities(g, args.query, {limit: 10});
      if (!hits.length) hits = (g.entities || []).filter(e => [e.name, e.summary, ...(e.aliases || [])].join(' ').toLowerCase().includes(q)).slice(0, 10);
      return {status: 'succeeded', entities: hits.map(e => ({name: e.name, type: e.type, summary: e.summary || '', aliases: e.aliases || [], relations: relationsOf(g, e.id).slice(0, 8).map(r => `${r.fromName} ${r.type} ${r.toName}`)}))};
    }
  }
  throw new Error('未知的应用操作');
}
