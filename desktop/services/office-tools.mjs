import {basename, extname} from 'node:path';
import {lstat} from 'node:fs/promises';
import {escape} from '../src/ui/markdown.js';
export {officeApprovalCard, officeResultCard} from '../src/ui/office-cards.js';
import {resolveGranted} from '../core.mjs';
import {classifyCoding} from '../src/shared/coding-intent.js';
import {matchesOfficeSchema, officeOpsSchema, officeRangeSchema, officeRefreshTargetSchema} from './office-ops.mjs';

const string = (maxLength, minLength = 1) => ({type: 'string', minLength, maxLength});
const object = (properties, required = Object.keys(properties)) =>
  ({type: 'object', properties, required, additionalProperties: false});
const docId = {...string(160), pattern: '^[^/\\\\:]+$'};
const sourceSchema = {
  oneOf: [
    object({kind: {const: 'pool'}}),
    ...['quotes', 'backtest'].map(kind => object({
      kind: {const: kind}, codes: {type: 'array', items: {...string(6, 6), pattern: '^\\d{6}$'}, minItems: 1, maxItems: kind === 'quotes' ? 80 : 1},
    })),
  ],
};
const definitions = [
  ['app_office_outline', '读取文档结构和稳定目标 ID。', {}],
  ['app_office_read', '按目标 ID 读取内容和样式。', {range: officeRangeSchema}],
  ['app_office_find', '按字面文本定位匹配项。', {query: string(1000)}],
  ['app_office_edit', '预览结构化修改并等待用户授权。先读取目标，使用返回的 ID。', {ops: officeOpsSchema, reason: string(300)}],
  ['app_office_refresh_quant', '用只读股票池、行情或回测数据刷新现有表格或图表。', {target: officeRefreshTargetSchema, source: sourceSchema}],
];
export const OFFICE_TOOL_DEFINITIONS = definitions.map(([name, description, properties]) => ({
  type: 'function', function: {name, description, parameters: object({docId, ...properties})},
}));
export const OFFICE_TOOL_NAMES = new Set(definitions.map(([name]) => name));

const supported = new Set(['docx', 'pptx', 'xlsx']);
const forbiddenId = /[\x00-\x1F]|^\.{1,2}$/;
const clean = value => String(value ?? '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
const shown = value => {
  const text = clean(value);
  return text.length > 40 ? text.slice(0, 40) + '…' : text || '空白';
};
const clock = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
const localTime = time => clock.format(new Date(time));
const asOf = data => data.sourceAsOf ? (data.sourceAsOf.length === 10 ? data.sourceAsOf : localTime(data.sourceAsOf)) + (data.sourceTiming === 'close' ? '（收盘）' : '') : '来源未提供时间';

const previewNames = {
  replace_text: ['↔', '替换文字'], replace_document: ['↔', '替换整份文档'],
  insert_paragraph: ['＋', '插入段落'], add_slide: ['＋', '新增幻灯片'],
  insert_table: ['▦', '插入表格'], update_table: ['▦', '更新表格'],
  insert_chart: ['▥', '插入图表'], update_chart: ['▥', '更新图表'],
  set_style: ['Aa', '设置样式'], delete: ['−', '删除'],
  set_cell: ['▦', '设置单元格'], set_shape_text: ['↔', '更新文本框'],
};
function targets(item) {
  const [icon, verb] = previewNames[item.op];
  return {icon, title: [verb, clean(item.op === 'insert_paragraph' ? item.resultLabel : item.label || item.resultLabel)].filter(Boolean).join(' ')};
}

function describe(item) {
  if (!item) return '空白';
  if (Array.isArray(item)) return item.map(describe).join('；');
  if (item.sample) return `${item.rows} 行 × ${item.columns} 列`;
  if (item.series) return `${clean(item.title) || '图表'} · ${item.points} 个数据点 · ${item.series.map(series =>
    `${clean(series.name)} ${series.values.join(' / ')}`).join('；')}`;
  if (typeof item.paragraphs === 'number') return `${item.paragraphs} 段 / ${item.tables} 表 / ${item.charts} 图`;
  const style = item.style ?? {};
  const formatting = [style.bold === undefined ? '' : style.bold ? '加粗' : '取消加粗',
    style.italic === undefined ? '' : style.italic ? '斜体' : '取消斜体',
    style.color ? `颜色 ${style.color}` : '', style.size ? `字号 ${style.size}` : '',
    style.heading === undefined ? '' : style.heading ? `${style.heading} 级标题` : '正文',
    {left: '左对齐', center: '居中', right: '右对齐', justify: '两端对齐'}[style.align]].filter(Boolean);
  return [clean(item.text ?? item.formula ?? item.value), ...formatting].filter(Boolean).join(' · ') || '空白';
}

function tablePreview(before, after) {
  const old = before?.sample ?? [], next = after.sample;
  const rowCount = Math.max(old.length, next.length);
  const columnCount = Math.min(4, Math.max(before?.columns ?? 0, after.columns));
  const cells = Array.from({length: rowCount}, (_, row) => Array.from({length: columnCount}, (_, col) => {
    const oldValue = old[row]?.[col], newValue = next[row]?.[col];
    return {changed: oldValue !== newValue, oldValue: oldValue === undefined ? '' : shown(oldValue),
      newValue: newValue === undefined ? '' : shown(newValue)};
  }));
  const resized = before && (before.rows !== after.rows || before.columns !== after.columns);
  return {cells, note: resized ? `表格尺寸从 ${describe(before)} 变为 ${describe(after)}` : '',
    truncated: Math.max(before?.rows ?? 0, after.rows) > 6 || Math.max(before?.columns ?? 0, after.columns) > 4};
}

function approvalItem(item) {
  const heading = targets(item);
  if (item.op === 'insert_paragraph') {
    const location = item.label ? `在${clean(item.label)}${item.anchorSide === 'before' ? '前' : '后'}`
      : item.anchorSide === 'before' ? '在开头' : '在末尾';
    return {...heading, title: `${location}插入：${describe(item.after)}`};
  }
  if (item.after?.sample) return {...heading, table: tablePreview(item.before, item.after)};
  if (item.op === 'replace_text' && item.before && item.after) return {...heading, textDiff:{before:describe(item.before), after:describe(item.after)}};
  if (item.op === 'delete') return {...heading, detail: describe(item.before)};
  return {...heading, detail: item.before ? `${describe(item.before)} → ${describe(item.after)}` : describe(item.after)};
}

export function officeApproval(plan, {label, reason, chatId, quantData}) {
  const heading = `${clean(label)} · ${plan.changes} 处修改${quantData ? ` · 依据：${quantData.source} ${asOf(quantData)}` : ''}`;
  const items = plan.items.map(approvalItem);
  const details = {heading, reason: clean(reason), items};
  const lines = items.map(({icon, title, detail, table, textDiff}) => [
    `${icon} ${title}`, detail, textDiff && `${textDiff.before} → ${textDiff.after}`, table?.note,
    ...(table?.cells ?? []).map(row => row.map(cell => cell.changed && cell.oldValue ? `${cell.oldValue} → ${cell.newValue}` : cell.newValue).join(' | ')),
  ].filter(Boolean).join('\n'));
  return {action: '修改文档', details, summary: [heading, details.reason, ...lines].filter(Boolean).join('\n'),
    options: {agent: 'QuankSight 助手', chatId, highRisk: plan.highRisk,
      choices: plan.highRisk ? ['deny', 'allow'] : ['deny', 'allow', 'always'],
      ...(plan.highRisk ? {promptChoices: {allow: '确认'}} : {taskLabel: '授权在当前任务结束时失效。', promptChoices: {always: '本任务内允许'}})}};
}

// A57 owns decisions. This bridge associates rich Office previews with its
// native request IDs while preserving the standard approval lifecycle.
export function createOfficeApprovalBridge(approvals, {changed = () => {}} = {}) {
  const previews = new Map();
  return {
    request(action, summary, signal, {officePreview, ...options}) {
      const existing = new Set(approvals.list().map(item => item.requestId));
      const decision = approvals.request(action, summary, signal, options);
      const card = approvals.list().find(item => !existing.has(item.requestId) && item.chatId === options.chatId && item.summary === summary);
      if (card && officePreview) {
        previews.set(card.requestId, officePreview);
        changed();
      }
      return decision.finally(() => previews.delete(card?.requestId));
    },
    list() {
      return approvals.list().map(card => previews.has(card.requestId) ? {...card, officePreview: previews.get(card.requestId)} : card);
    },
  };
}

const editIntent = /替换|修改|编辑|更新|刷新|改|插入|加|删|清空|写入|设置|设为|调成|\b(?:replace|edit|update|refresh|insert|add|delete|set|change)\b/i;
const officeSubject = /页|文档|报告|研报|段|标题|图表|表格|工作表|幻灯片|单元格|正文|文本框|列|行|\b(?:document|report|paragraph|heading|slide|table|chart|worksheet|cell)\b|\b[A-Z]{1,3}[1-9]\d{0,3}\b/i;
const quantRefresh = /更新|刷新|同步|\b(?:update|refresh|sync)\b/i;
const metrics = /行情|股票池|回测|收益|股价|涨跌|\b(?:quote|backtest|returns)\b/i;
const lookup = /查找|定位|搜索|\b(?:find|locate|search)\b/i;
const outline = /大纲|目录|结构|列出.{0,8}(?:工作表|标题|幻灯片)|\b(?:outline|list slides|list sheets)\b/i;
const reading = /读取|读一下|看一下|查看|显示|\b(?:read|show)\b/i;
const openOnly = /^(?:请|帮我)?\s*(?:打开|预览|进入|open\b)/i;

export function routeOfficeIntent(prompt, {currentDocId, specifiedDocId} = {}) {
  const docId = specifiedDocId || currentDocId;
  if (!docId || !prompt || ['code', 'explain'].includes(classifyCoding(prompt))) return null;
  if (!officeSubject.test(prompt) && !/^(?:把|将)?\s*[A-Z]{1,3}[1-9]\d{0,3}/i.test(prompt)) return null;
  if (quantRefresh.test(prompt) && metrics.test(prompt)) return {docId, tool: 'app_office_refresh_quant'};
  if (editIntent.test(prompt)) return {docId, tool: 'app_office_edit'};
  if (openOnly.test(prompt)) return null;
  if (lookup.test(prompt)) return {docId, tool: 'app_office_find'};
  if (outline.test(prompt)) return {docId, tool: 'app_office_outline'};
  if (reading.test(prompt)) return {docId, tool: 'app_office_read'};
  return null;
}

const quantColumns = {
  pool: {source: 'QuankSight 股票池', headers: ['代码', '名称'], chartFields: []},
  quotes: {source: 'QuankSight 行情', headers: ['代码', '名称', '现价', '涨跌幅 (%)'], chartFields: [2, 3]},
  backtest: {source: 'QuankSight 回测', headers: ['代码', '名称', '策略收益 (%)', '基准收益 (%)'], chartFields: [2, 3]},
};

function sourceTime(value) {
  if (typeof value === 'string' && /^\d{14}$/.test(value)) {
    const [, year, month, day, hour, minute, second] = /^(....)(..)(..)(..)(..)(..)$/.exec(value);
    value = `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`;
  }
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const iso = date.toISOString();
  return iso.slice(0, 10) === value ? value : iso;
}

export function createOfficeQuantReader({store, market, quant, now = Date.now}) {
  return async (source, {signal} = {}) => {
    if (!matchesOfficeSchema(sourceSchema, source)) throw Error('量化来源无效');
    signal?.throwIfAborted();
    const {kind} = source;
    let entries, sourceAsOf = null, sourceTiming;
    if (kind === 'pool') {
      const pool = store.data.quant;
      entries = (pool?.pool ?? []).map(({code, name}) => [code, name ?? code]);
      sourceAsOf = sourceTime(pool?.poolUpdatedAt);
    } else if (kind === 'quotes') {
      const codes = [...new Set(source.codes)];
      const data = await market.handle({action: 'quotes', codes});
      const times = [];
      entries = codes.map(code => {
        const quote = data.quotes?.find(quote => quote.code === code);
        if (!Number.isFinite(quote?.price) || !Number.isFinite(quote.pct)) throw Error('行情数据缺失：' + code);
        times.push(sourceTime(quote.sourceAsOf ?? quote.time));
        return [code, quote.name ?? code, quote.price, quote.pct];
      });
      sourceAsOf = sourceTime(data.sourceAsOf) ?? (times.every(Boolean) ? times.sort()[0] : null);
      if (data.sourceTiming === 'close' && sourceAsOf) sourceTiming = 'close';
    } else {
      const [code] = source.codes;
      const {summary, charts, sourceAsOf: time, sourceTiming: timing} = await quant.handle({action: 'signal', code});
      const metrics = [summary?.backtest?.smartPct, summary?.backtest?.blindPct];
      if (metrics.some(value => !Number.isFinite(value))) throw Error('回测收益数据缺失：' + code);
      entries = [[code, summary.name ?? code, ...metrics]];
      sourceAsOf = sourceTime(time ?? summary.backtest.sourceAsOf ?? charts?.curve?.at(-1)?.[0]);
      if (timing === 'close' && sourceAsOf) sourceTiming = 'close';
    }
    signal?.throwIfAborted();
    if (!entries.length) throw Error('量化来源无数据');
    return {...quantColumns[kind], entries, sourceAsOf, fetchedAt: new Date(now()).toISOString(),
      ...(sourceTiming && {sourceTiming})};
  };
}

function refreshOperation(target, item, data) {
  const {source, sourceAsOf, fetchedAt, sourceTiming} = data;
  const provenance = {source, sourceAsOf, fetchedAt, ...(sourceTiming && {sourceTiming})};
  if (target.table || target.kind === 'table') {
    const rows = item.header ? [data.headers, ...data.entries] : data.entries;
    return {op: 'update_table', target, rows, ...provenance};
  }
  const fields = data.chartFields.slice(0, item.chart.type === 'pie' ? 1 : undefined);
  if (!fields.length) throw Error('股票池没有可绘图的数值序列');
  return {op: 'update_chart', target, chart: {
    ...item.chart, categories: data.entries.map(entry => String(entry[1] || entry[0])),
    series: fields.map(index => ({name: data.headers[index], values: data.entries.map(entry => entry[index])})),
  }, ...provenance};
}

// register() binds to the host assistant registry. The host supplies the current
// tab for this chat, the A57 request function and the chat result renderer.
export function createOfficeTools({adapter, documents, currentTab = () => null, folders = () => [],
  requestApproval, readQuant, postResult, openDocument, openVersionHistory, blockReason = () => ''}) {
  const taskGrants = new WeakMap();
  async function resolve(id, chatId) {
    if (!matchesOfficeSchema(docId, id) || forbiddenId.test(id)) throw Error('文档 ID 无效');
    const record = documents.list().find(item => item.id === id);
    if (record && supported.has(record.format)) return {label: record.name.toLowerCase().endsWith('.' + record.format) ? record.name : record.name + '.' + record.format, identity: ['library', id], key: id};
    const tab = await currentTab(chatId);
    if (tab?.docId !== id || !supported.has(tab.format) || !tab.instanceId) throw Error('文档不在成果中心或当前右侧页签');
    const file = await resolveGranted(folders(), tab.folderId, tab.relative);
    const info = await lstat(file);
    if (!info.isFile()) throw Error('当前页签目标不是常规文件');
    if (extname(file).toLowerCase() !== '.' + tab.format) throw Error('右侧页签 Office 格式不匹配');
    return {label: basename(file), identity: ['tab', id, tab.instanceId, tab.folderId, file, info.dev, info.ino, tab.engineDocId ?? id], key: tab.engineDocId ?? id};
  }

  async function execute(name, args, {chatId, signal, postResult:publish = postResult} = {}) {
    const blocked = blockReason();
    if (blocked) throw Error(blocked);
    const def = OFFICE_TOOL_DEFINITIONS.find(entry => entry.function.name === name);
    if (!def || !matchesOfficeSchema(def.function.parameters, args)) throw Error('Office 工具参数无效');
    args = structuredClone(args);
    signal?.throwIfAborted();
    const current = await resolve(args.docId, chatId);
    const guard = async () => {
      signal?.throwIfAborted();
      const blocked = blockReason();
      if (blocked) throw Error(blocked);
      const live = await resolve(args.docId, chatId);
      if (JSON.stringify(live.identity) !== JSON.stringify(current.identity)) throw Error('文档授权范围已变化');
    };
    const {key} = current;
    const readAction = {
      app_office_outline: () => adapter.outline(key),
      app_office_read: () => adapter.read(key, args.range),
      app_office_find: () => adapter.find(key, args.query),
    }[name];
    if (readAction) {
      const result = await readAction();
      await guard();
      return result;
    }
    let ops = args.ops, expectedRevision, quantData;
    if (name === 'app_office_refresh_quant') {
      const {content, revision} = await adapter.read(key, args.target, {withRevision: true});
      expectedRevision = revision;
      quantData = await readQuant(args.source, {signal});
      ops = [refreshOperation(args.target, content, quantData)];
    }
    await guard();
    const plan = await adapter.preview(key, ops, {track: true, signal, expectedRevision});
    if (!plan.previewToken) return plan;
    const grantKey = JSON.stringify([chatId, current.identity]);
    const card = officeApproval(plan, {label: current.label, reason: args.reason ?? '刷新 QuankSight 量化数据', chatId, quantData});
    try {
      const granted = signal && taskGrants.get(signal)?.has(grantKey);
      const decision = !plan.highRisk && granted ? 'allow'
        : await requestApproval(card.action, card.summary, signal, {...card.options, officePreview: card.details});
      if (decision !== 'allow' && (decision !== 'always' || plan.highRisk)) return {status: 'denied'};
      if (decision === 'always' && signal) {
        if (!taskGrants.has(signal)) taskGrants.set(signal, new Set());
        taskGrants.get(signal).add(grantKey);
      }
      const scope = {chatId, identity: current.identity};
      const result = await adapter.apply(plan.previewToken, {confirmed: true, signal, guard, scope});
      if (result.status !== 'succeeded') return result;
      const {undoToken, revision, expiresAt, changes} = result;
      const cardResult = {type: 'office-result', docId: args.docId, title: `已修改 ${changes} 处`, revision, undoToken, expiresAt,
        items: result.items.map(item => ({title: targets(item).title})),
        ...(quantData && {quantData: Object.fromEntries(['source', 'sourceAsOf', 'fetchedAt', 'sourceTiming'].map(key => [key, quantData[key]]))})};
      await publish?.(cardResult, {chatId});
      return {status: 'succeeded', changes, revision, kind: result.kind};
    } finally {
      adapter.discardPreview(plan.previewToken);
    }
  }

  async function resultAction(card, action, {chatId, signal, index} = {}) {
    const current = await resolve(card.docId, chatId);
    const context = await adapter.undoContext(card.undoToken);
    const scope = context?.scope;
    if (scope?.chatId !== chatId || JSON.stringify(scope?.identity) !== JSON.stringify(current.identity)) throw Error('Office 结果不属于当前对话或文档');
    if (action === 'officeOpen') return openDocument(card.docId, {chatId});
    if (action === 'officeLocate') {
      if (!Number.isInteger(index) || index < 0 || index >= context.locations.length) throw Error('Office 定位项无效');
      return openDocument(card.docId, {chatId, target: context.locations[index]});
    }
    if (action !== 'officeRollback') throw Error('Office 结果操作无效');
    const result = await adapter.rollback(card.undoToken, {signal, guard: async () => {
      const latest = await resolve(card.docId, chatId);
      if (JSON.stringify(latest.identity) !== JSON.stringify(current.identity)) throw Error('文档授权范围已变化');
    }});
    if (result.status === 'version_history') await openVersionHistory?.(card.docId, {chatId, revision: result.revision});
    return result;
  }

  async function route(prompt, {chatId, specifiedDocId, currentDocId} = {}) {
    const input = String(prompt ?? '').toLowerCase();
    if (!specifiedDocId) {
      const candidates = documents.list().filter(item => supported.has(item.format)).map(item => {
        const name = item.name.toLowerCase();
        const filename = name.endsWith('.' + item.format) ? name : name + '.' + item.format;
        return {id: item.id, length: input.includes(filename) ? filename.length : name.length >= 2 && input.includes(name) ? name.length : 0};
      }).filter(item => item.length).sort((a, b) => b.length - a.length);
      if (candidates.length > 1 && candidates[0].length === candidates[1].length) return null;
      specifiedDocId = candidates[0]?.id;
    }
    const current = currentDocId ?? (await currentTab(chatId))?.docId;
    const result = routeOfficeIntent(prompt, {currentDocId: current, specifiedDocId});
    if (result) await resolve(result.docId, chatId);
    return result;
  }

  return {definitions: OFFICE_TOOL_DEFINITIONS, execute, resultAction, route,
    register(registerTool) {
      for (const def of OFFICE_TOOL_DEFINITIONS) registerTool(def, (args, context) => execute(def.function.name, args, context));
    }};
}
