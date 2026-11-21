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
import { maskAmounts, shouldMask } from '../src/shared/privacy.js'; // [F5]
import { describeReview } from '../src/shared/compliance.js'; // [F5]

export const APP_PAGES = {home: '工作台', feed: '动态', quant: '量化', market: '行情', studio: '创作', tasks: '自动化', library: '成果中心', files: '本地文件', agents: '智能体', connectors: '连接', tools: '浏览器与权限', graph: '知识图谱', context: '记忆'};
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
    def('app_market_overview', '大盘与市场概况：上证、深证、创业板、沪深300、科创50 指数，涨跌家数、涨跌停数、两市成交额、领涨行业与概念、涨跌幅榜。实时公开行情，只读。'), // [F1]
    def('app_market_sectors', '行业或概念板块按涨跌幅排行（含领涨股、涨跌家数）。只读。', {kind: {type: 'string', enum: ['industry', 'concept']}, order: {type: 'string', enum: ['up', 'down']}, limit: {type: 'integer'}}),
    def('app_market_sector_stocks', '某个板块（名称如「半导体」或代码 BKxxxx）的成分股按涨幅排行。只读。', {sector: {type: 'string'}, limit: {type: 'integer'}}, ['sector']),
    def('app_market_quote', '个股实时行情（现价、涨跌幅、开高低、昨收、成交额、换手）。query 是公司名称或代码，多只用逗号分隔。只读。', {query: {type: 'string'}}, ['query']),
    def('app_market_kline', '个股 K 线与技术指标（日 / 周 / 月 / 60 分钟 / 分时；均线、MACD、KDJ、近 20 根高低点），并在 QuanK 里打开这只股票的 K 线图。', {query: {type: 'string'}, period: {type: 'string', enum: ['day', 'week', 'month', 'm60', 'intraday']}, open: {type: 'boolean'}}, ['query']),
    def('app_market_alert_add', '设置价格提醒：涨幅或跌幅达到某个百分比，或价格涨到 / 跌到某个值；交易时段触发后进入「动态」并发系统通知。会弹出确认框。', {query: {type: 'string'}, kind: {type: 'string', enum: ['up', 'down', 'above', 'below']}, value: {type: 'number'}}, ['query', 'kind', 'value']),
    def('app_market_alert_list', '列出已设置的价格提醒。只读。'),
    def('app_market_alert_remove', '删除一条价格提醒（先用 app_market_alert_list 查 id）。会弹出确认框。', {id: {type: 'string'}}, ['id']),
    // [F3] 投研知识库：检索、财务、关系图、研究主题
    def('app_kb_search', '在本机投研知识库里检索（研报、公告要点与解读、投研笔记、关联文档、导出的复盘、财务摘要、主题资讯），返回带出处的原文片段。用户问「通威最近有哪些风险」「我之前对硅料价格怎么看」「哪份研报提到回购」时先用它，回答时按 [序号] 标注出处，只依据返回的片段。只读。', {query: {type: 'string'}, stock: {type: 'string', description: '限定某只股票（公司名或代码，可选）'}, kind: {type: 'string', enum: ['report', 'notice', 'note', 'doc', 'export', 'finance', 'news']}}, ['query']),
    def('app_kb_finance', '某只股票的财务数据（东方财富 F10 公开数据，保存在本机）：最近 8 个报告期的营业总收入、归母净利润及同比、扣非净利润、毛利率、净利率、ROE、资产负债率、EPS，单季营收与净利润，以及一段摘要。只读。', {query: {type: 'string'}, fresh: {type: 'boolean'}}, ['query']),
    def('app_kb_compare', '对比 2–6 只股票最新报告期的财务指标。只读。', {queries: {type: 'string', description: '公司名称或代码，逗号分隔'}}, ['queries']),
    def('app_kb_graph', '某只股票的公司关系：所属行业、产业链上下游（按行业预置）、实际控制人、前十大股东及持股比例、股票池中的同行业公司、质押公告。只读。', {query: {type: 'string'}}, ['query']),
    def('app_kb_topics', '列出研究主题（关键词、关联股票、周报时间、上次周报）。只读。'),
    def('app_kb_topic_save', '新建或修改研究主题：按关键词汇集公告、公开资讯和资料库内容，每周自动生成主题周报。会弹出确认框。', {id: {type: 'string', description: '修改时给出主题 ID'}, name: {type: 'string'}, keywords: {type: 'string', description: '逗号分隔'}, codes: {type: 'string', description: '关联股票 6 位代码，逗号分隔，可留空'}, weekday: {type: 'integer', description: '0=周日 … 6=周六'}, time: {type: 'string', description: 'HH:mm'}, enabled: {type: 'boolean'}}, ['name', 'keywords']),
    def('app_kb_topic_remove', '删除一个研究主题（已生成的周报不受影响）。会弹出确认框。', {id: {type: 'string'}}, ['id']),
    def('app_kb_topic_digest', '立即汇集某个研究主题的最新动态；report=true 时生成主题周报（Word / PPT / 网页）保存到成果中心并打开。', {id: {type: 'string'}, report: {type: 'boolean'}, format: {type: 'string', enum: ['docx', 'pptx', 'html']}}, ['id']),
    // [F4] 组合与风控：总览、风控规则、风险指标、压力测试、调仓模拟、手动持仓、报告
    def('app_pf_overview', '组合总览与风控检查：汇总本机引擎持仓和手动录入的持仓，返回总资产、股票市值、现金、浮动与今日盈亏、各股仓位与行业分布，以及当前触发的风控提醒（止损 / 止盈 / 回撤止盈 / 仓位超限 / 行业集中 / 组合回撤 / 风险公告）。用户问「我的组合怎么样」「仓位重不重」「有没有触发止损」时使用。只读。', {fresh: {type: 'boolean', description: '先从引擎重新读取持仓'}}),
    def('app_pf_risk', '组合风险指标（按当前持仓回溯近一年行情估算）：年化波动率、最大回撤与区间、当前回撤、相对沪深300的 Beta 与相关系数、单日 VaR / CVaR（95%，历史模拟法），个股 Beta 和高相关持仓。只读。'),
    def('app_pf_stress', '组合压力测试：不给情景时计算预置情景（大盘跌 5% / 10% / 20%、第一大行业跌 20%、第一大持仓连续三个跌停）；也可以给 kind=market（按 Beta 传导）/ industry / stock 和涨跌幅 pct。返回组合损失、占总资产、拖累最大的股票、会触发止损的股票。只读。', {kind: {type: 'string', enum: ['market', 'industry', 'stock']}, pct: {type: 'number', description: '涨跌幅，例如 -15'}, industry: {type: 'string'}, stock: {type: 'string', description: '公司名称或代码'}}),
    def('app_pf_simulate', '模拟调仓（只计算，不下单）：changes 每笔一行「股票 股数 [价格]」，正数买入、负数卖出，例如「通威股份 -2000；600519 100 1450」。返回调仓前后的总资产、仓位、行业分布、大盘跌 10% 时的损失和风控提醒变化。只读。', {changes: {type: 'string'}}, ['changes']),
    def('app_pf_rules', '修改组合风控规则（只提醒，不下单）：止损线 / 止盈线 / 回撤止盈（%），单股、单行业仓位上限（%），组合回撤线（%），检查间隔（5 / 15 / 30 / 60 分钟），风险公告提醒、系统通知、总开关；数值给 0 表示关闭这一条。给 stock + stopPrice 时设置单只股票的止损价（stopPrice=0 取消）。会弹出确认框。', {enabled: {type: 'boolean'}, stopLoss: {type: 'number'}, takeProfit: {type: 'number'}, trailing: {type: 'number'}, maxPosition: {type: 'number'}, maxIndustry: {type: 'number'}, maxDrawdown: {type: 'number'}, interval: {type: 'integer'}, notices: {type: 'boolean'}, notify: {type: 'boolean'}, stock: {type: 'string'}, stopPrice: {type: 'number'}}),
    def('app_pf_holding_save', '手动录入或修改一笔持仓（没有在量化引擎里记录成交的股票），用于组合汇总和风控提醒；同一只股票以手动录入为准。会弹出确认框。', {query: {type: 'string', description: '公司名称或代码'}, shares: {type: 'integer'}, cost: {type: 'number'}, stopPrice: {type: 'number'}, note: {type: 'string'}}, ['query', 'shares', 'cost']),
    def('app_pf_holding_remove', '删除一笔手动录入的持仓（引擎里的成交记录不受影响）。会弹出确认框。', {query: {type: 'string', description: '公司名称或代码'}}, ['query']),
    def('app_pf_report', '生成组合风控报告（Word / PPT / 网页）：组合概况、行业分布、风控检查、风险指标、压力测试，Word 版附组合曲线与仓位图；保存到「成果中心」并在 QuanK 里打开。', {format: {type: 'string', enum: ['docx', 'pptx', 'html']}}),
    // [F5] 安全与合规：状态、操作审计、外发记录、合规审阅
    def('app_sec_status', '安全与合规状态：本机数据是否加密、应用锁、离线模式、发给模型前是否隐藏金额、最近一次加密备份、审计日志条数与校验结果、合规检查设置。只读。'),
    def('app_audit_list', '查看操作审计日志（谁在什么时间改了风控规则、持仓、成交、授权、导出、模型调用等，只记录操作与对象，不含金额和密钥）。可按类型或关键词筛选。只读。', {kind: {type: 'string', enum: ['data', 'trade', 'rules', 'approval', 'export', 'model', 'security', 'chat', 'system']}, q: {type: 'string'}, limit: {type: 'integer'}}),
    def('app_egress_list', '查看外发记录：QuanK 最近连接过哪些外部服务（主机、用途、次数、发送字节数、是否被离线模式阻止），不含请求内容。只读。', {host: {type: 'string'}}),
    def('app_compliance_check', '合规审阅：检查一段文字（研报、公众号文章、对外发布的观点）是否有承诺保本或收益、确定性预测、夸大收益、诱导交易、内幕信息、个性化投资建议等违规表述，以及是否缺少免责声明、数据来源、数据日期和 AI 生成标注。用户说「帮我检查一下这篇文章合不合规」「这段话能不能发」时使用。只读。', {text: {type: 'string'}, kind: {type: 'string', enum: ['article', 'report', 'text']}, aiUsed: {type: 'boolean', description: '内容是否含 AI 生成的段落'}}, ['text']),
    // [F2] 投研文档：研报、公告、资料库、导出
    def('app_research_report', '一键生成个股研究报告（Word / PPT / 网页）：汇总本机量化信号与风控、回测、持仓、实时行情、近期公告和可选的 AI 研判，Word 版附 K 线与收益率图；保存到「成果中心」并归档到这只股票的资料库，生成后在 QuanK 里打开。用户说「给 xx 出一份研报 / 研究报告」时使用。可能需要几十秒。', {query: {type: 'string', description: '公司名称或 6 位代码'}, format: {type: 'string', enum: ['docx', 'pptx', 'html']}, ai: {type: 'boolean', description: '是否加入 AI 研判段落，默认 true'}}, ['query']),
    def('app_research_notices', '某只股票最近的公司公告（公开公告接口，只读），每条带类型（业绩预告 / 定期报告 / 风险事项 / 股东变动 / 资本运作等）和重要程度。用户问「xx 最近有什么公告」「有没有减持、业绩预告」时使用。', {query: {type: 'string'}, limit: {type: 'integer', description: '条数，默认 20，最多 50'}, fresh: {type: 'boolean'}}, ['query']),
    def('app_research_notice_read', '读取并解读一条公告：返回要点摘录、AI 解读（已配置模型时）和原文节选。id 来自 app_research_notices。只读。', {id: {type: 'string'}}, ['id']),
    def('app_research_library', '查找投研资料库：生成的研报、收藏的公告、投研笔记、关联的文档和导出的复盘。可按股票（query 为公司名或代码）、类型或关键词筛选。只读。', {query: {type: 'string', description: '公司名称或代码（可选）'}, kind: {type: 'string', enum: ['report', 'notice', 'note', 'doc', 'export']}, keyword: {type: 'string'}}),
    def('app_research_read', '读取资料库里一条资料的正文（笔记全文、研报或文档的文字、公告要点），用于在对话里引用。id 来自 app_research_library。只读。', {id: {type: 'string'}}, ['id']),
    def('app_research_note_add', '把用户的投研笔记、调研纪要或交易计划保存到资料库（可关联某只股票）。不要保存密码、密钥。', {query: {type: 'string', description: '关联的公司名称或代码（可选）'}, title: {type: 'string'}, text: {type: 'string'}}, ['text']),
    def('app_research_link_document', '把「成果中心」里的一份文档归档到某只股票的资料库。', {documentId: {type: 'string'}, query: {type: 'string', description: '公司名称或代码'}}, ['documentId']),
    def('app_research_remove', '从资料库删除一条资料（成果中心里的文档不会被删除）。会弹出确认框。', {id: {type: 'string'}}, ['id']),
    def('app_research_export', '把每日简报、组合复盘（行情、持仓、信号分布、重要公告与风险）或量化引擎报告导出为 Word / PPT / 网页，保存到「成果中心」并在 QuanK 里打开。', {kind: {type: 'string', enum: ['briefing', 'review', 'quant_report']}, format: {type: 'string', enum: ['docx', 'pptx', 'html']}, id: {type: 'string', description: 'quant_report 时的报告 ID（见 app_quant_report）'}}, ['kind']),
    def('app_research_watch', '设置公告提醒：工作日按间隔检查股票池的公告，重要公告进入「动态」并发系统通知。会弹出确认框。', {enabled: {type: 'boolean'}, interval: {type: 'integer', description: '检查间隔（分钟）：15 / 30 / 60 / 120'}}),
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
const MARKET_NOTE = '行情来自公开行情接口，可能有延迟；仅供研究，不构成投资建议。'; // [F1]
export const APP_TOOL_NAMES = new Set(appToolDefinitions().map(d => d.function.name));
/** Requests that only make sense through app tools: offered even when the composer's 「允许使用工具」 is off (app tools only). */
export const APP_INTENT = /合规|免责声明|审计日志|操作记录|外发记录|离线模式|能不能发|违规(用语|表述|词)|组合(总览|风险|风控|回撤|仓位|报告|怎么样|情况)|仓位(分布|占比|上限|集中|重)|持仓分布|止损(线|价|提醒)|止盈线|回撤线|风控(规则|提醒|检查)|风险指标|波动率|VaR|压力测试|(模拟|试算).{0,4}调仓|调仓.{0,4}(模拟|试算)|行业集中|集中度|相关性矩阵|录入持仓|财务|营收|净利|毛利|ROE|roe|负债率|股东|实控人|实际控制人|产业链上下游|上下游(关系|公司|企业)|关系图|研究主题|主题周报|投研知识库|知识库里|(检索|查找|搜).{0,6}(资料|研报|笔记)|(资料|研报|笔记|知识库).{0,8}(检索|查找|搜)|研报|研究报告|公告|财报|年报|季报|业绩预告|资料库|投研笔记|(记|写).{0,2}笔记|导出.{0,8}(简报|复盘|日报|晨报|报告)|定时|每天|每日|每晚|每早|每小时|每隔|每周|每月|工作日|提醒我|定期|自动化任务|计划任务|(暂停|恢复|删除|修改|运行|停止|列出|查看).{0,12}任务|同步.{0,8}(连接|邮件|日历|订阅)|(生成|做).{0,10}(仪表盘|简报)|记住|打开.{0,6}(页面|动态|创作|自动化|知识图谱|记忆|连接)|(小应用|小工具).{0,10}(数据|记录|内容|里)|(连|连接|接入|绑定|添加|对接|关联|授权).{0,8}(钉钉|飞书|企业微信|企微|邮箱|日历|RSS|rss|订阅源?|数据源|MCP|mcp)|(添加|登录|测试|连接).{0,6}(MCP|mcp)|Tushare|AKShare|Alpha ?Vantage|Twelve ?Data|(联网|上网|网上|搜索|搜一下|查一下).{0,10}(文档|教程|资料|操作|步骤|怎么|如何)/;

function f_isSelectInvalid(info, config) { // [ux9]
  return (info.fields || []).some(f => f.type === 'select' && config[f.name] !== undefined && !f.options.some(([v]) => v === config[f.name]));
}

export function appToolContext(now = Date.now()) {
  const d = new Date(now);
  return `\n应用内操作：用户要求创建、修改、暂停、恢复、删除或立即运行定时任务（例如「每小时看一下通威的股价」「每天 8 点汇总未读邮件」「工作日 9 点提醒我…」）时，调用 app_task_* 工具完成，不要说没有定时任务工具，也不要让用户自己去配置系统计划任务；同步连接、生成仪表盘或简报、记住偏好、打开页面同理使用 app_* 工具。用户要连接钉钉、飞书、企业微信、邮箱、日历或 RSS 时调用 app_connector_add（可先 app_connector_guide 取开通步骤，再用 app_web_search / app_web_read 查官方文档的最新做法）：不需要密码的直接添加；需要授权码、App Secret、Webhook 的会在「连接」页弹出预填好的表单，由用户本人填写，你不要索要或复述任何密钥。不要说没有添加连接的能力。用户问股票信号、买卖点、回测、定投或股票池时调用 app_quant_*（本机量化引擎，按用户自己的私有策略计算），不要凭记忆报价或编造信号；用户说「添加 / 加入 / 关注某公司」时直接调用 app_quant_pool_add，把公司名放在 query 里，QuanK 会联网查代码和标志，不要让用户自己去查代码；用户问大盘、指数、板块、涨跌幅榜、个股实时行情或 K 线时调用 app_market_*（公开实时行情），不要凭记忆报价；要看图时用 app_market_kline，它会在 QuanK 里打开 K 线；用户问财务、股东、产业链或想在自己的资料里找答案时用 app_kb_finance / app_kb_graph / app_kb_search（回答按 [序号] 标出处）；追踪一个主题用 app_kb_topic_save / app_kb_topic_digest；检查文章或研报是否合规用 app_compliance_check，问操作记录用 app_audit_list，问数据发去了哪里用 app_egress_list，问安全设置用 app_sec_status；用户问自己的组合、仓位、止损止盈、回撤、风险指标、压力测试或想试算调仓时用 app_pf_*（只提醒、只计算，不会下单），改风控规则用 app_pf_rules，没有在引擎里记录的持仓用 app_pf_holding_save 录入；用户要研报时调用 app_research_report，问公告、业绩预告、减持等用 app_research_notices 再按需 app_research_notice_read，记笔记、找资料、引用之前的研报用 app_research_note_add / app_research_library / app_research_read，导出简报或复盘用 app_research_export；公告解读只依据原文，不要编造数字；「涨超 5% 提醒我」这类请求用 app_market_alert_add；回答时说明档位、综合分、倍率和主要理由，并提示仅供研究、不构成投资建议。需要查资料、查操作文档时用 app_web_search 搜索、app_web_read 读原文，再回答并附上来源链接。修改类操作会弹出确认框，用户拒绝时如实说明未执行。当前本机时间：${local(now)}（周${WEEKDAY_NAMES[d.getDay()]}）。`;
}

const taskView = t => ({id: t.id, name: t.name, schedule: describeSchedule(t.schedule), enabled: !!t.enabled, status: t.status || 'ready',
  nextRun: local(t.nextRun), lastRun: local(t.lastRun), toolsEnabled: !!t.toolsEnabled, prompt: clip(t.prompt, 200), ...(t.error ? {error: clip(t.error, 200)} : {})});

/**
 * deps (filled in by main as services are created): workspace, runTask, connectors, dashboards, briefing, openPage, notify.
 * ask(title, detail, signal) -> boolean (the gated approver).
 */
const WRITE_TOOL = /_(create|update|delete|run|sync|add|remove|record|set|signin|test|watch|auto|save|digest|report|export|note_add|link_document|rules|holding_save|holding_remove)$/;
/** [F5] Runs a tool, masks holding amounts for the model when configured, and records writes in the audit log. */
export async function executeAppTool(name, args = {}, opts = {}) {
  const {deps = {}, chatId} = opts;
  let out, error = null;
  try { out = await runAppTool(name, args, opts); } catch (e) { error = e; }
  if (deps.audit && WRITE_TOOL.test(String(name)) && !/^app_(sec|audit|egress|compliance)_/.test(name)) {
    const st = error ? `失败：${String(error?.message || error).slice(0, 60)}` : out?.status === 'denied' ? '用户未确认，未执行' : out?.status || 'succeeded';
    const a = typeof args === 'string' ? (() => { try { return JSON.parse(args); } catch { return {}; } })() : args || {};
    try { await deps.audit.record({kind: /trade_record/.test(name) ? 'trade' : /rules/.test(name) ? 'rules' : /report|export|digest/.test(name) ? 'export' : 'chat', action: name, target: String(a.code || a.query || a.id || a.name || a.stock || '').slice(0, 40), detail: `对话指令 · ${st}`, via: chatId ? 'chat' : 'task'}); } catch {}
  }
  if (error) throw error;
  if (out && typeof out === 'object' && shouldMask(name, deps.privacy?.())) { const m = maskAmounts(out); return {...m.result, privacy: `已按隐私设置隐藏 ${m.masked} 处金额（股数、成本、市值、盈亏、现金等）；回答时不要猜测或推算这些数字。`}; }
  return out;
}
async function runAppTool(name, args = {}, {store, deps = {}, ask, signal, chatId, now = Date.now} = {}) {
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
    case 'app_market_overview': { // [F1]
      const o = await need('market').handle({action: 'overview'}), qv = q => ({code: q.code, name: q.name, price: q.price, pct: q.pct});
      const sv = s => ({name: s.name, pct: s.pct, leader: s.leader?.name || ''});
      return {status: 'succeeded', date: o.date, session: o.session, amount: o.amount, indices: (o.indices || []).map(i => ({name: i.name, price: i.price, pct: i.pct, change: i.change})), breadth: o.breadth,
        topIndustry: (o.industry || []).slice(0, 5).map(sv), topConcept: (o.concept || []).slice(0, 5).map(sv), gainers: (o.gainers || []).slice(0, 5).map(qv), losers: (o.losers || []).slice(0, 5).map(qv), note: MARKET_NOTE};
    }
    case 'app_market_sectors': {
      const r = await need('market').handle({action: 'sectors', kind: args.kind === 'concept' ? 'concept' : 'industry', order: args.order === 'down' ? 'down' : 'up', limit: Math.min(30, Math.max(1, Number(args.limit) || 10))});
      return {status: 'succeeded', kind: r.kind, sectors: (r.sectors || []).map(s => ({code: s.code, name: s.name, pct: s.pct, up: s.up, down: s.down, leader: s.leader})), note: MARKET_NOTE};
    }
    case 'app_market_sector_stocks': {
      const r = await need('market').handle({action: 'sectorStocks', sector: String(args.sector || ''), limit: Math.min(30, Math.max(1, Number(args.limit) || 10))});
      return {status: 'succeeded', sector: r.sector, stocks: (r.stocks || []).map(q => ({code: q.code, name: q.name, price: q.price, pct: q.pct, amount: q.amount})), note: MARKET_NOTE};
    }
    case 'app_market_quote': case 'app_market_kline': case 'app_market_alert_add': {
      const m = need('market'), terms = name === 'app_market_quote' ? String(args.query || '').split(/[,，、;；\s]+/).filter(Boolean).slice(0, 10) : [String(args.query || '').trim()];
      if (!terms.length || !terms[0]) return {status: 'failed', error: '请提供公司名称或 6 位代码'};
      const found = [];
      for (const q of terms) {
        try { found.push(await m.handle({action: 'resolve', query: q})); }
        catch (e) { if (e?.choices) return {status: 'needs_choice', query: q, candidates: e.choices, message: '有多只股票匹配，请让用户确认是哪一只'}; return {status: 'failed', error: e?.message || String(e)}; }
      }
      if (name === 'app_market_quote') {
        const r = await m.handle({action: 'quotes', codes: found.map(f => f.code)});
        return {status: 'succeeded', quotes: (r.quotes || []).map(q => ({code: q.code, name: q.name, price: q.price, pct: q.pct, change: q.change, open: q.open, high: q.high, low: q.low, preClose: q.preClose, amount: q.amount, turnover: q.turnover})), note: MARKET_NOTE};
      }
      const {code, name: label} = found[0];
      if (name === 'app_market_kline') {
        const period = ['day', 'week', 'month', 'm60', 'intraday'].includes(args.period) ? args.period : 'day';
        const k = await m.handle({action: 'kline', code, period, summary: true});
        if (args.open !== false) deps.openMarket?.(code);
        return {status: 'succeeded', kline: k, opened: args.open !== false && !!deps.openMarket, note: MARKET_NOTE};
      }
      const kinds = {up: '涨幅达到', down: '跌幅达到', above: '价格涨到', below: '价格跌到'}, v = Number(args.value);
      if (!kinds[args.kind] || !Number.isFinite(v) || v <= 0) return {status: 'failed', error: '请说明提醒条件（涨幅 / 跌幅百分比，或目标价格）'};
      const shown = `${label ? `${label}（${code}）` : code}${kinds[args.kind]} ${v}${args.kind === 'up' || args.kind === 'down' ? '%' : ''}`;
      if (!await confirm(`设置价格提醒：${shown}？`, '交易时段每 15 秒检查一次，每天最多提醒一次；触发后进入「动态」并发系统通知。')) return denied;
      const a = await m.handle({action: 'addAlert', code, name: label, kind: args.kind, value: v});
      deps.notify?.();
      return {status: 'succeeded', alert: {id: a.id, text: a.text}};
    }
    case 'app_market_alert_list':
      return {status: 'succeeded', alerts: (need('market').view().alerts || []).map(a => ({id: a.id, text: a.text, code: a.code, kind: a.kind, value: a.value}))};
    case 'app_market_alert_remove': {
      const m = need('market'), a = (m.view().alerts || []).find(x => x.id === args.id);
      if (!await confirm(`删除价格提醒${a ? '「' + a.text + '」' : ''}？`, '删除后不再检查这条提醒。')) return denied;
      await m.handle({action: 'removeAlert', id: String(args.id || '')}); deps.notify?.();
      return {status: 'succeeded'};
    }
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
    case 'app_kb_search': case 'app_kb_finance': case 'app_kb_graph': { // [F3]
      const k = need('knowledge');
      try {
        if (name === 'app_kb_search') {
          let code = '';
          if (args.stock) code = /^\d{6}$/.test(String(args.stock).trim()) ? String(args.stock).trim() : (await need('market').handle({action: 'resolve', query: String(args.stock)})).code || '';
          const r = await k.handle({action: 'search', query: String(args.query || ''), code, kind: args.kind});
          return {status: 'succeeded', query: r.query, hits: r.hits.map(h => ({ref: h.ref, kind: h.kind, title: h.title, stock: h.name || h.code || undefined, date: h.date, excerpt: h.excerpt, ...(h.url ? {url: h.url} : {})})), total: r.total, indexed: r.indexed, note: '回答时按 [ref] 标注出处，只依据片段内容。'};
        }
        if (name === 'app_kb_finance') { const f = await k.handle({action: 'finance', query: String(args.query || ''), fresh: args.fresh === true}); return {status: 'succeeded', code: f.code, name: f.name, summary: f.summary?.lines || [], table: f.table, quarters: f.quarters, note: '东方财富 F10 公开财务数据；单季值由相邻报告期相减得到。仅供研究。'}; }
        const g = await k.handle({action: 'graph', query: String(args.query || '')});
        return {status: 'succeeded', code: g.code, profile: g.profile, holders: g.holders, relations: g.edges.map(e => `${g.nodes.find(n => n.id === e.from)?.label} → ${g.nodes.find(n => n.id === e.to)?.label}：${e.label}`), note: '上下游为按行业预置的通用产业链，仅作研究线索。'};
      } catch (e) { if (e?.choices) return {status: 'needs_choice', candidates: e.choices, message: '有多只股票匹配，请让用户确认是哪一只'}; throw e; }
    }
    case 'app_kb_compare': {
      const r = await need('knowledge').handle({action: 'compare', codes: String(args.queries || '')});
      return {status: 'succeeded', items: r.items.map(x => ({code: x.code, name: x.name, period: x.latest ? `${x.latest.date.slice(0, 4)} ${x.latest.type}` : '', revenue: x.latest?.revenue, revenueYoy: x.latest?.revenueYoy, profit: x.latest?.profit, profitYoy: x.latest?.profitYoy, grossMargin: x.latest?.grossMargin, roe: x.latest?.roe, debtRatio: x.latest?.debtRatio})), note: '金额单位为元。仅供研究。'};
    }
    case 'app_kb_topics':
      return {status: 'succeeded', topics: (need('knowledge').view().topics || []).map(t => ({id: t.id, name: t.name, keywords: t.keywords, codes: t.codes, enabled: t.enabled, weekday: t.weekday, time: t.time, lastDigest: local(t.lastDigest), nextDigest: local(t.nextAt)}))};
    case 'app_kb_topic_save': {
      const k = need('knowledge'), old = args.id ? (k.view().topics || []).find(t => t.id === args.id) : null;
      if (args.id && !old) throw new Error('主题不存在，请先用 app_kb_topics 查看');
      const p = {name: args.name ?? old?.name, keywords: args.keywords ?? old?.keywords, codes: args.codes ?? old?.codes ?? '', weekday: args.weekday ?? old?.weekday ?? 1, time: args.time ?? old?.time ?? '08:30', enabled: args.enabled ?? old?.enabled ?? true};
      if (!await confirm(`${old ? '修改' : '新建'}研究主题「${clip(p.name, 30)}」？`, `关键词：${Array.isArray(p.keywords) ? p.keywords.join('、') : clip(p.keywords, 120)}\n${p.enabled ? `每${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][Number(p.weekday)] || '周一'} ${p.time} 生成主题周报` : '暂不自动生成周报'}；资讯通过公开搜索获取（只发送关键词）。`)) return denied;
      const r = await k.handle({action: 'topicSave', ...(old ? {id: old.id} : {}), ...p}); deps.notify?.();
      return {status: 'succeeded', topic: {id: r.topic.id, name: r.topic.name, keywords: r.topic.keywords, nextDigest: local(r.topic.nextAt)}};
    }
    case 'app_kb_topic_remove': {
      const k = need('knowledge'), t = (k.view().topics || []).find(x => x.id === args.id);
      if (!t) throw new Error('主题不存在，请先用 app_kb_topics 查看');
      if (!await confirm(`删除研究主题「${clip(t.name, 30)}」？`, '已生成的周报会保留在成果中心。')) return denied;
      await k.handle({action: 'topicRemove', id: t.id}); deps.notify?.();
      return {status: 'succeeded'};
    }
    case 'app_kb_topic_digest': {
      const k = need('knowledge');
      if (args.report) { const r = await k.handle({action: 'topicDigest', id: String(args.id || ''), format: args.format}); deps.openDocument?.(r.document.id); deps.notify?.(); return {status: 'succeeded', document: r.document, count: r.count, sections: r.sections, opened: !!deps.openDocument}; }
      const r = await k.handle({action: 'topicCollect', id: String(args.id || '')});
      return {status: 'succeeded', topic: r.topic.name, items: r.items.slice(0, 30).map(x => ({kind: x.kind, date: x.date, title: x.title, stock: x.name || undefined, excerpt: clip(x.excerpt, 160), matched: x.matched, ...(x.url ? {url: x.url} : {})})), note: '资讯来自公开搜索结果，未经核实。'};
    }
    case 'app_pf_overview': case 'app_pf_risk': case 'app_pf_stress': case 'app_pf_simulate': case 'app_pf_rules': case 'app_pf_holding_save': case 'app_pf_holding_remove': case 'app_pf_report': { // [F4]
      const pf = need('portfolio');
      const codeOf = async q => { const s = String(q ?? '').trim(); if (/^\d{6}$/.test(s)) return s; if (!s) throw new Error('请给出公司名称或 6 位代码'); const r = await need('market').handle({action: 'resolve', query: s}); if (!/^\d{6}$/.test(String(r?.code || ''))) throw new Error(`没有找到「${clip(s, 20)}」`); return r.code; };
      const brief = b => ({level: {high: '重要', medium: '关注', low: '提示'}[b.level], type: b.label, text: b.title, detail: b.detail || undefined, code: b.code || undefined});
      try {
        if (name === 'app_pf_overview') {
          const o = await pf.handle({action: 'overview', fresh: args.fresh === true}), s = o.summary;
          return {status: 'succeeded', total: s.total, stockValue: s.invested, cash: s.cash, cost: s.cost, pnl: s.pnl, pnlPct: s.pnlPct, dayPnl: s.dayPnl, stockPct: s.stockPct, effectiveStocks: s.effective,
            positions: s.positions.map(p => ({code: p.code, name: p.name, shares: p.shares, cost: p.cost, price: p.price, value: p.value, weight: p.weight, pnl: p.pnl, pnlPct: p.pnlPct, dayPct: p.dayPct, industry: p.industry, stopPrice: p.stopPrice || undefined, source: p.source === 'manual' ? '手动录入' : '量化引擎'})),
            industries: s.byIndustry.map(g => ({industry: g.industry, weight: g.weight, stocks: g.names})), alerts: o.breaches.map(brief), rules: o.rulesText,
            note: s.stocks ? '仓位按股票市值 + 现金计算；QuanK 只提醒，不会下单。' : '还没有持仓：可以在引擎里记录成交，或用 app_pf_holding_save 手动录入。'};
        }
        if (name === 'app_pf_risk') {
          const r = await pf.handle({action: 'risk'});
          return {status: 'succeeded', metrics: r.metrics, betas: r.betas, highCorrelation: r.corr?.high?.slice(0, 10).map(p => ({stocks: p.names, corr: p.corr})), averageCorrelation: r.corr?.avg, benchmark: r.benchmark, note: r.metrics ? r.note : '历史行情不足 20 个交易日，算不出风险指标。'};
        }
        if (name === 'app_pf_stress') {
          let scenario;
          if (args.kind) { scenario = {kind: args.kind, pct: args.pct, industry: args.industry}; if (args.kind === 'stock') scenario.code = await codeOf(args.stock); }
          const r = await pf.handle({action: 'stress', ...(scenario ? {scenario} : {})});
          return {status: 'succeeded', total: r.total, results: r.results.map(x => ({scenario: x.scenario.title, loss: x.loss, lossPct: x.lossPct, after: x.after, worst: x.worst ? {name: x.worst.name, loss: x.worst.loss} : null, wouldStop: x.stops, rows: x.rows.map(y => ({name: y.name, shock: y.shock, loss: y.loss, basis: y.basis}))})), note: '大盘情景按各股调整后 Beta（0.67 × 实测 + 0.33）传导，结果是估算，不是预测。'};
        }
        if (name === 'app_pf_simulate') {
          const changes = [];
          for (const line of String(args.changes || '').split(/[\n;；]+/).map(s => s.trim()).filter(Boolean).slice(0, 20)) {
            const m = /^(.+?)\s+([+-]?\d+)(?:\s*(?:股)?\s*[@,，\s]\s*(\d+(?:\.\d+)?))?\s*(?:股)?$/.exec(line);
            if (!m) throw new Error(`看不懂「${clip(line, 40)}」，格式是「股票 股数 [价格]」`);
            changes.push({code: await codeOf(m[1]), delta: Number(m[2]), ...(m[3] ? {price: Number(m[3])} : {})});
          }
          const r = await pf.handle({action: 'simulate', changes});
          const sum = s => ({total: s.total, stockPct: s.stockPct, cash: s.cash, effectiveStocks: s.effective, weights: s.positions.map(p => ({name: p.name, weight: p.weight})), industries: s.byIndustry.map(g => ({industry: g.industry, weight: g.weight}))});
          return {status: 'succeeded', changes: r.changes, before: sum(r.before), after: sum(r.after), cashShortfall: r.shortfall || undefined, lossIfMarketDown10: {before: r.stressBefore.loss, after: r.stressAfter.loss}, alertsBefore: r.breachesBefore.map(brief), alertsAfter: r.breachesAfter.map(brief), note: r.note};
        }
        if (name === 'app_pf_rules') {
          const cur = pf.view().rules, rules = {};
          for (const k of ['enabled', 'notices', 'notify']) if (typeof args[k] === 'boolean') rules[k] = args[k];
          for (const k of ['stopLoss', 'takeProfit', 'trailing', 'maxPosition', 'maxIndustry', 'maxDrawdown']) if (args[k] !== undefined && args[k] !== null) rules[k] = Number(args[k]) === 0 ? '' : args[k];
          if (args.interval !== undefined) rules.interval = args.interval;
          let what = '';
          if (args.stock) { const code = await codeOf(args.stock); rules.stops = {[code]: {stopPrice: Number(args.stopPrice) > 0 ? args.stopPrice : ''}}; what = Number(args.stopPrice) > 0 ? `${code} 止损价 ${args.stopPrice}` : `取消 ${code} 的止损价`; }
          if (!Object.keys(rules).length) return {status: 'succeeded', rules: cur, text: pf.view().rulesText};
          const labels = {stopLoss: '止损线', takeProfit: '止盈线', trailing: '回撤止盈', maxPosition: '单股仓位上限', maxIndustry: '单行业仓位上限', maxDrawdown: '组合回撤线'};
          const lines = Object.entries(rules).filter(([k]) => labels[k]).map(([k, v]) => `${labels[k]}：${v === '' ? '关闭' : v + '%'}`);
          if (!await confirm('修改组合风控规则？', [...lines, what, typeof rules.enabled === 'boolean' ? (rules.enabled ? '开启风控提醒' : '关闭风控提醒') : '', rules.interval ? `每 ${rules.interval} 分钟检查` : ''].filter(Boolean).join('\n') + '\n只提醒，不会下单。')) return denied;
          const r = await pf.handle({action: 'rules', rules}); deps.notify?.();
          return {status: 'succeeded', text: r.text};
        }
        if (name === 'app_pf_holding_save') {
          const code = await codeOf(args.query);
          if (!await confirm(`录入持仓：${clip(args.query, 20)}（${code}）？`, `${args.shares} 股，成本 ${args.cost}${Number(args.stopPrice) > 0 ? `，止损价 ${args.stopPrice}` : ''}\n只保存在本机，用于组合汇总和风控提醒。`)) return denied;
          const r = await pf.handle({action: 'holdingSave', code, shares: args.shares, cost: args.cost, stopPrice: Number(args.stopPrice) > 0 ? args.stopPrice : '', note: args.note || ''}); deps.notify?.();
          return {status: 'succeeded', holding: r.holding};
        }
        if (name === 'app_pf_holding_remove') {
          const code = await codeOf(args.query), m = (pf.view().manual || []).find(x => x.code === code);
          if (!m) throw new Error('这只股票没有手动录入的持仓');
          if (!await confirm(`删除手动持仓「${m.name || code}」？`, '引擎里的成交记录不受影响。')) return denied;
          await pf.handle({action: 'holdingRemove', code}); deps.notify?.();
          return {status: 'succeeded'};
        }
        const r = await pf.handle({action: 'report', format: args.format});
        deps.openDocument?.(r.document.id); deps.notify?.();
        return {status: 'succeeded', document: r.document, summary: r.summary, sections: r.sections, opened: !!deps.openDocument};
      } catch (e) { if (e?.choices) return {status: 'needs_choice', candidates: e.choices, message: '有多只股票匹配，请让用户确认是哪一只'}; throw e; }
    }
    case 'app_sec_status': { // [F5]
      const v = await need('security').view();
      return {status: 'succeeded', encrypted: v.encryption.enabled, plainBackupsLeft: v.encryption.plainBackups.length, lastBackup: v.encryption.lastBackup ? local(v.encryption.lastBackup.time) : null, appLock: v.lock.enabled, idleMinutes: v.lock.idleMinutes, offline: v.privacy.offline, maskAmounts: v.privacy.maskAmounts, egressLog: v.privacy.egressLog,
        audit: {entries: v.audit.count, lastVerify: v.audit.lastVerify ? {time: local(v.audit.lastVerify.time), ok: v.audit.lastVerify.ok} : null}, compliance: {enabled: v.compliance.enabled, block: v.compliance.block, disclaimer: v.compliance.disclaimer}, note: '设置在「安全与合规」页修改；对话里只能查看。'};
    }
    case 'app_audit_list': {
      const r = await need('security').handle({action: 'auditList', kind: args.kind, q: args.q, limit: Math.min(100, Number(args.limit) || 30)});
      return {status: 'succeeded', items: r.items.map(e => ({time: local(e.time), type: r.kinds[e.kind] || e.kind, action: e.action, target: e.target || undefined, detail: e.detail || undefined, via: e.via})), note: '审计日志只记录操作与对象，不含金额和密钥；每条带上一条的校验值，可在「安全与合规」里校验是否被改动。'};
    }
    case 'app_egress_list': {
      const r = await need('security').handle({action: 'egressList', host: args.host, limit: 50});
      return {status: 'succeeded', hosts: r.hosts.map(h => ({host: h.host, purpose: h.purpose, count: h.count, blocked: h.blocked, bytesOut: h.bytesOut, last: local(h.last)})), recent: r.items.slice(0, 20).map(e => ({time: local(e.time), host: e.host, path: e.path, method: e.method, status: e.blocked ? '已阻止' : e.status, purpose: e.purpose})), note: '只记录主机、路径、方法和字节数，不含请求内容；记录只保存在本次运行的内存里。'};
    }
    case 'app_compliance_check': {
      const r = await need('security').handle({action: 'review', text: String(args.text || ''), kind: args.kind || 'article', aiUsed: args.aiUsed === true, title: '对话中的合规检查'});
      return {status: 'succeeded', result: describeReview(r), level: r.level, findings: r.findings.map(f => ({level: {high: '必须修改', medium: '建议修改', low: '提示'}[f.level], issue: f.label, text: f.match || undefined, excerpt: f.excerpt || undefined, fix: f.fix})), note: '规则检查只能发现常见违规表述，发布前仍需人工复核。'};
    }
    case 'app_research_report': case 'app_research_notices': { // [F2]
      const r = need('research');
      try {
        if (name === 'app_research_notices') {
          const out = await r.handle({action: 'notices', query: String(args.query || ''), limit: Math.min(50, Math.max(1, Number(args.limit) || 20)), fresh: args.fresh === true});
          return {status: 'succeeded', code: out.code, name: out.name, notices: out.notices.map(n => ({id: n.id, date: n.date, type: n.label, level: n.level, title: n.title, ...(n.points?.length ? {points: n.points.slice(0, 2)} : {})})), note: '公告来自公开公告接口，以交易所披露的原文为准。'};
        }
        const out = await r.handle({action: 'report', query: String(args.query || ''), format: args.format, ai: args.ai !== false});
        deps.openDocument?.(out.document.id); deps.notify?.();
        return {status: 'succeeded', document: out.document, sections: out.sections, summary: out.summary, ...(out.gaps?.length ? {missing: out.gaps} : {}), ...(out.warnings?.length ? {warnings: out.warnings} : {}), opened: !!deps.openDocument, note: '研报已保存到「成果中心」并归档到资料库；仅供研究，不构成投资建议。'};
      } catch (e) { if (e?.choices) return {status: 'needs_choice', candidates: e.choices, message: '有多只股票匹配，请让用户确认是哪一只'}; throw e; }
    }
    case 'app_research_notice_read': {
      const n = await need('research').handle({action: 'notice', id: String(args.id || '')});
      return {status: 'succeeded', notice: {id: n.id, date: n.date, type: n.label, title: n.title, points: n.points, ...(n.summary ? {aiSummary: n.summary} : {}), ...(n.aiError ? {aiNote: n.aiError} : {}), excerpt: String(n.text || '').slice(0, 3000), pdf: n.pdf || undefined}, note: '要点为自动摘录，请以公告原文为准；仅供研究。'};
    }
    case 'app_research_library': {
      const r = need('research'); let code = '';
      if (args.query) { try { code = (await need('market').handle({action: 'resolve', query: String(args.query)})).code; } catch (e) { if (e?.choices) return {status: 'needs_choice', candidates: e.choices}; code = /^\d{6}$/.test(String(args.query)) ? String(args.query) : ''; } }
      const out = await r.handle({action: 'library', code, kind: args.kind, query: args.keyword || (code ? '' : args.query || ''), limit: 30});
      return {status: 'succeeded', items: out.items.map(x => ({id: x.id, kind: x.kind, code: x.code || undefined, name: x.name || undefined, title: x.title, summary: x.summary, time: local(x.time), ...(x.documentId ? {documentId: x.documentId} : {})})), total: out.total};
    }
    case 'app_research_read':
      return {status: 'succeeded', ...(await need('research').handle({action: 'read', id: String(args.id || '')}))};
    case 'app_research_note_add': {
      const out = await need('research').handle({action: 'note', ...(args.query ? {query: String(args.query)} : {}), title: clip(args.title, 60), text: String(args.text || '')});
      deps.notify?.();
      return {status: 'succeeded', item: {id: out.item.id, title: out.item.title, code: out.item.code || undefined}};
    }
    case 'app_research_link_document': {
      const out = await need('research').handle({action: 'link', documentId: String(args.documentId || ''), ...(args.query ? {query: String(args.query)} : {})});
      deps.notify?.();
      return {status: 'succeeded', item: {id: out.item.id, title: out.item.title, code: out.item.code || undefined}};
    }
    case 'app_research_remove': {
      const r = need('research'), it = (r.view().library || []).find(x => x.id === args.id);
      if (!it) throw new Error('资料不存在，请先用 app_research_library 查看');
      if (!await confirm(`从资料库删除「${clip(it.title, 40)}」？`, it.documentId ? '成果中心里的文档不会被删除。' : '删除后无法恢复。')) return denied;
      await r.handle({action: 'remove', id: it.id}); deps.notify?.();
      return {status: 'succeeded'};
    }
    case 'app_research_export': {
      const out = await need('research').handle({action: 'export', kind: String(args.kind || ''), format: args.format, ...(args.id ? {id: String(args.id)} : {})});
      deps.openDocument?.(out.document.id); deps.notify?.();
      return {status: 'succeeded', document: out.document, sections: out.sections, opened: !!deps.openDocument, note: '已保存到「成果中心」；Word 可在预览里导出为 PDF。'};
    }
    case 'app_research_watch': {
      const r = need('research'), cur = r.view().watch || {}, next = {enabled: typeof args.enabled === 'boolean' ? args.enabled : cur.enabled !== false, interval: args.interval !== undefined ? Number(args.interval) : cur.interval || 30};
      if (![15, 30, 60, 120].includes(next.interval)) throw new Error('检查间隔可选 15 / 30 / 60 / 120 分钟');
      if (!await confirm('修改公告提醒？', next.enabled ? `工作日 7:00–23:00 每 ${next.interval} 分钟检查股票池公告，重要公告进入「动态」并发系统通知` : '关闭公告提醒')) return denied;
      const out = await r.handle({action: 'watch', ...next}); deps.notify?.();
      return {status: 'succeeded', watch: out.text};
    }
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
