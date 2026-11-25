import {officeApprovalCard} from './ui/office-cards.js';
import { modalLayout } from './ui/modal.js';
import {bindPresetFilters, plazaIcon} from './ui/preset-catalog.js'; // [ux11] plazaIcon
import {agentAvatar} from './ui/avatars.js';
import * as panelUI from './ui/page-panel.js'; // [v0.54] right-hand page tabs
import {codeProjectsView} from './ui/code-projects.js';
import {createComposerImages} from './ui/composer-images.js';
import {compactComposer,createComposerMenus} from './ui/composer.js';
import {modelPicker,modelLibrary,modelForm,bindModelForm,modelChoiceLabel} from './ui/models.js';
import {legacyRoundLimit} from './ui/legacy-round-limit.js';
import {capabilityTabs,skillsPage,mcpPage,mcpAuthFields,mcpForm,bindMcpForm,mcpPayload} from './ui/capability-library.js';
import { approvalBar, codingApprovalRequests, revealApproval } from './ui/approval-card.js';
import {codingTaskPage} from './ui/coding-task.js';
import {codingCards, codingDetection, codingForm, codingPayload, bindCodingForm, codingPreset, workBuddyPreset} from './ui/coding.js';
import {agentEditor,bindAgentEditor,readAgentEditor} from './ui/agent-editor.js';
import {imageCards} from './ui/image-cards.js';
import {mountHtmlPreview} from './ui/html-preview.js';
import {installChatMedia} from './ui/chat-media.js';
import {mountOfficePreview, filePreviewPanel, mountFilePreviewPanel} from './ui/office-preview.js';
import {createOfficeWorkspace} from './ui/office-workspace.js';
import {mountSpreadsheet} from './ui/spreadsheet.js';
import {mountWordRuns} from './ui/word-runs.js';
import {mountWordCanvas} from './ui/word-canvas.js';
import {documentLibrary,documentExamples,messageDocuments} from './ui/documents.js';
import { escape, rich, htmlPreview } from './ui/markdown.js';
import { insightHtml } from './ui/insight.js';
import * as views from './ui/workspace.js';
import { memoryPage } from './ui/memory.js';
import { recentSections, chatMarkdown } from './ui/chats.js';
import { codingPageCommand, composerSendMode } from './shared/page-command.js';
import { matchCommands, helpHtml, contextMeter } from './ui/slash.js';
import { contextUsage } from './shared/context.js';
import { readPlanSteps } from './ui/plan.js';
import { taskForm, taskCards, taskPayload } from './ui/tasks.js';
import { automationPage, taskEditor } from './ui/automation.js'; // [ux6]
import { approvalRulesPanel, pendingBanner } from './ui/approvals.js';
import { feedPage } from './ui/feed.js';
import { briefingCard, briefingForm, briefingPayload } from './ui/briefing.js';
import { taskCenterPanel } from './ui/taskcenter.js';
import { graphPage, graphDetail, graphEntityForm, graphEntityPayload, graphMergeForm } from './ui/graph.js';
import { sidebarNav } from './ui/sidebar.js';
import { contextGraphPage, contextHeader, graphData, mountGraphCanvas, graphSidePanel, graphSettingsForm } from './ui/graph-view.js';
import { studioPage, dashboardForm, dashboardPayload, dashboardRedesignForm, dashboardViewer, mountDashboard } from './ui/dashboard.js';
import { infographicPage, infographicForm, infographicPayload, infographicEditForm, infographicEditPayload, brandForm, brandPayload, mountInfographics, svgToPng } from './ui/infographic.js';
import { renderInfographicSvg } from './shared/infographic.js';
import { miniappPage, miniappForm, miniappPayload, miniappReviseForm, miniappRevisePayload, miniappVersionsView, mountMiniApp } from './ui/miniapp.js';
import { quantPage, quantDashboards, quantAddForm, quantAddPayload, quantSettingsForm, quantSettingsPayload, quantWatchForm, quantWatchPayload, quantTradeForm, quantTradePayload, quantPlanForm, quantPlanPayload, quantReportDetail, quantReportAutoForm, quantReportAutoPayload } from './ui/quant.js';
import { researchUI } from './ui/research.js'; // [F2]
import { knowledgeUI } from './ui/knowledge.js'; // [F3]
import { portfolioUI } from './ui/portfolio.js'; // [F4]
import { securityUI } from './ui/security.js'; // [F5]
import { tradeUI } from './ui/trade.js'; // [v0.52]
import { researchPage, noteEditForm } from './ui/research-page.js'; // [v0.53]
import { marketPage, marketHomeCard, mountKlineBoxes, marketAlertForm, marketAlertPayload, sectorStocksView, patchLive, liveTargets, setKlinePeriod } from './ui/market.js';
import { session as marketSession } from './shared/market.js'; // [v0.52.1]
import { connectorsPage, connectorForm, connectorPayload, connectorItemsView, mailComposeForm, mailComposePayload, officeMessageForm, officeMessagePayload } from './ui/connectors.js';
import { feedUnread } from './shared/feed.js';
function viewContext() {
    return { state, approvalCards: approvalRequests().filter(item => item.chatId === chatId).map(item => officeApprovalCard(item, action)).join(''), chatId, pending, previewTabs, previewId, previewSource, previewZoom, sideTab, icon, composer, action, date, taskStatus, trace, executionRecords, executionRow, rich, htmlPreview, previewHtml, previewInteractive, openedDetails, recap }; }
// [p1-m4] away recap: remember what finished while the user was elsewhere, then clear the unread flag
let recap = null;
function markSeen(id) {
    const c = state.chats.find(c => c.id === id);
    if (!c?.unread) return;
    const last = [...(c.messages || [])].reverse().find(m => m.role === 'assistant' && !m.intermediate);
    const text = typeof last?.content === 'string' ? last.content : '';
    recap = { id, status: last?.error || last?.budgetExhausted ? 'failed' : 'completed', finishedAt: c.finishedAt || c.run?.finishedAt, seconds: c.run?.finishedAt && c.run?.startedAt ? ((c.run.finishedAt - c.run.startedAt) / 1000).toFixed(0) : '', tools: (last?.toolEvents || []).length, preview: text.replace(/[#*`>|_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) };
    c.unread = false;
    invoke('chatSeen', { id }).then(s => { applyState(s); render(); }).catch(() => {});
}
installChatMedia(document,{readImage:id=>invoke('imagePreview',{id})});
const api = window.actwill;
const browserTargets = new Map();
const $ = s => document.querySelector(s);
const paths = { spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z', chat: 'M5 4h14v12H9l-4 4Z', folder: 'M3 7V5h6l2 3h10v12H3Z', grid: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z', agent: 'M5 7h14v13H5ZM12 3v4M8 12h1m6 0h1m-7 4h6', clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', settings: 'M4 7h16M4 17h16M8 4v6m8 4v6', search: 'M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm6-2 6 6', plus: 'M12 5v14M5 12h14', arrow: 'M5 12h14m-5-5 5 5-5 5', up: 'M12 20V4m-6 6 6-6 6 6', file: 'M5 3h9l5 5v13H5Zm9 0v6h5M8 13h8m-8 4h6', link: 'm9 15 6-6M8 17l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 8a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1', check: 'm5 12 4 4L19 6', close: 'm5 5 14 14M5 19 19 5', activity: 'M3 12h4l3-8 4 16 3-8h4', trend: 'M3 17l6-6 4 4 8-8M15 7h6v6', fileDown: 'M5 3h9l5 5v13H5Zm9 0v5h5m-7 3v7m-3-3 3 3 3-3', download: 'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4', shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z', stop: 'M6 6h12v12H6Z' };
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.spark}"/></svg>`;
const pendingChats=new Set();
let state = { chats: [], folders: [], memories: [], agents: [], tasks: [], artifacts: [], activity: [], settings: { model: '尚未配置', name: '我的工作空间' } }, page = 'home', chatId = '', agentId = 'assistant', files = [], images = [], sendImages = false, pending = false, folderId = '', fileResults = [], fileTruncated = false, searchTerm = '', draft = '', toolsEnabled = true, activeCommand = '', toolDraft = { url: 'https://example.com', executable: 'node', args: '["--version"]', folderId: '', relative: '' };
let selections=[];
let modelChoice='legacy',modelEffort='';
let capabilityTab='agents';const busyMcp=new Set();
let codingCandidates = null;
let codingTaskList = [], codingTaskRevision = 0, codingTaskPaint;
const codingTaskDetails = new Map();
const codingTaskCall = async (action, payload = {}) => (await invoke('codingTasks', { action, ...payload })).result;
async function loadCodingTasks() {
    const revision = codingTaskRevision;
    const tasks = await codingTaskCall('list');
    if (!state.locked && codingTaskRevision === revision) codingTaskList = Array.isArray(tasks) ? tasks : [];
}
async function loadCodingTask(id) {
    const task = await codingTaskCall('get', { id });
    if (!state.locked) codingTaskDetails.set(id, task);
    return task;
}
function refreshCodingTasks(task) {
    if (state.locked) return;
    codingTaskRevision++;
    const index = codingTaskList.findIndex(item => item.id === task.id);
    const permissionChanged = codingTaskList[index]?.pendingPermission?.requestId !== task.pendingPermission?.requestId;
    if (index < 0) codingTaskList = [task, ...codingTaskList].slice(0, 50);
    else codingTaskList[index] = task;
    if (permissionChanged && !$('#modal').open) render();
    if (codingTaskPaint) return;
    codingTaskPaint = setTimeout(async () => {
        codingTaskPaint = undefined;
        try {
            const tab = panelTab();
            if (tab?.kind === 'coding-task') await loadCodingTask(tab.taskId);
            if (state.locked) return;
            if (!$('#modal').open && capabilityTab === 'agents' && agentCategory === 'coding' && (page === 'agents' || panelShows('agents'))) render();
            else if (tab?.kind === 'coding-task') renderPanel();
        } catch (error) { if (!state.locked) toast(error.message); }
    }, 80);
}
const localApprovals = new Map();
const busyApprovals = new Set();
const expandedApprovals = new Set();
function approvalRequests() {
    const scheduled = [...(state.pendingApprovals || []), ...(state.resolvedApprovals || [])].map(item => ({
        ...item, requestId: item.id, agent: '定时任务', action: item.title.replace(/[？?]$/, ''),
        summary: item.detail + '\n无人值守运行已跳过此操作。确认仅标记为已查看。',
        source: state.tasks?.find(task => task.id === item.taskId)?.name,
        highRisk: !item.candidate, network: /browser|web/.test(item.tool), channel: 'scheduled',
        ...(item.candidate && item.taskId ? { taskLabel: '仅覆盖此定时任务接下来 30 天内的同类操作。',
            promptChoices: { allow: '确认记录' } } : {}),
    }));
    return [...(state.inlineApprovals || []), ...codingTaskList.flatMap(codingApprovalRequests),
        ...scheduled, ...[...localApprovals.values()].map(entry => entry.card)]
        .map(item => ({ ...item, source: item.source || state.chats.find(chat => chat.id === item.chatId)?.name }))
        .sort((a, b) => a.time - b.time);
}
function approvalFeedState() {
    return { ...state, approvalFeed: approvalRequests().filter(request => !request.decision) };
}
function approvalMarkup() {
    return approvalBar(approvalRequests(), page === 'chat' ? chatId : '', action);
}
function inlineConfirm(title, html, handler) {
    const requestId = crypto.randomUUID();
    const body = document.createElement('template');
    body.innerHTML = html.replace(/<\/(?:p|li|div)>|<br\s*\/?>/gi, '$&\n');
    const card = { requestId, agent: 'QuanK', action: title,
        summary: body.content.textContent.trim(), chatId: page === 'chat' ? chatId : undefined,
        time: Date.now(), highRisk: true, channel: 'local' };
    localApprovals.set(requestId, { card, handler });
    if ($('#modal')?.open) $('#modal').close();
    render();
}
function paintApprovalSummaries(root = document) {
    for (const card of root.querySelectorAll('.inline-approval-card')) {
        const summary = card.querySelector('pre');
        const button = card.querySelector('[data-action="approvalExpand"]');
        if (!summary || !button) continue;
        const expanded = expandedApprovals.has(card.dataset.approvalId);
        summary.classList.toggle('expanded', expanded);
        button.hidden = !expanded && summary.scrollHeight <= summary.clientHeight + 1;
        button.textContent = expanded ? '收起' : '展开';
        button.setAttribute('aria-expanded', String(expanded));
    }
}
async function jumpToApproval(id) {
    const request = approvalRequests().find(item => item.requestId === id);
    if (!request || state.locked) return;
    if ($('#modal')?.open) $('#modal').close();
    if (request.codingTaskId) await handle('codingTaskOpen', request.codingTaskId);
    else if (request.chatId && state.chats.some(chat => chat.id === request.chatId)) {
        if (page !== 'chat' || chatId !== request.chatId) await handle('openChat', request.chatId);
    } else {
        switchChat('');
        page = 'home';
        render();
    }
    const target = request.codingTaskId ? document.getElementById('pagePanel') : document.getElementById('app');
    if (target) revealApproval(target, id);
}
async function answerApproval(id, decision) {
    if (busyApprovals.has(id)) return;
    const request = approvalRequests().find(item => item.requestId === id);
    if (!request || request.decision) return;
    busyApprovals.add(id);
    try {
        if (request.channel === 'coding') {
            await handle('codingTaskPermission', [request.codingTaskId, id, decision].join(':'));
        } else if (request.channel === 'scheduled') {
            await update('approvalRule', { action: 'resolveInline', id, decision });
        } else if (request.channel === 'local') {
            const entry = localApprovals.get(id);
            localApprovals.set(id, { card: { ...entry.card, decision, finishedAt: Date.now() } });
            render();
            if (decision === 'allow') await entry.handler();
        } else {
            await invoke('approvalResponse', { requestId: id, decision });
            await update('state');
        }
    } finally {
        busyApprovals.delete(id);
    }
}
const busyCoding = new Map(), codingTestResults = new Map();
let agentCategory = 'all';
const codingProject = () => state.quant?.mode === 'remote' ? '' : state.quant?.source || '';
const codingCall = async payload => (await invoke('coding', payload)).result;
const nav = [['home', 'chat', '工作台'], ['feed', 'activity', '动态'], ['research', 'file', '投研资料'], ['library', 'grid', '成果中心'], ['studio', 'spark', '创作'], ['files', 'folder', '本地文件'], ['agents', 'agent', '智能体'], ['tools', 'activity', '浏览器与权限'], ['security', 'shield', '安全与合规'], ['tasks', 'clock', '自动化'], ['quant', 'trend', '量化'], ['market', 'trend', '行情'], ['connectors', 'link', '连接'], ['graph', 'search', '知识图谱'], ['context', 'spark', '记忆库']];
let memoryFilter = 'all', memoryQuery = '', incognito = false, planMode = false, researchMode = false, feedFilter = 'important'; // [p1-m1][p1-m2][p1-m5][p1-m6][p2-m3]
let graphQuery = '', graphType = 'all'; // [p3-m5]
let graphMode = 'graph', graphFocus = '', graphSelected = '', graphMount = null; const graphCache = {}; // [ux4]
let studioTab = 'dashboards', dashView = null; // [p4-m1]
let miniappOpenId = '', miniappDispose = null, miniappVersionsFor = ''; // [p4-m4]
let quantOpen = '', quantDetailData = null, quantDisposers = []; // [q1]
// [v0.54] right-hand page tabs: pages opened from the chat and every stock detail open beside the conversation.
// quantOpen is the stock of the active stock tab; each stock's computed detail stays in quantCache until refreshed.
let pageTabs = [], pageTabId = '', pageWide = false, pageWidth = 0, panelClickAt = 0, panelHeadHtml = '', panelBodyKey = '', disposeFilePreview, libraryFilter, renderingStock = '', renderingStockTab;
const quantCache = new Map(), quantVer = new Map(), quantLoading = new Set();
// [v1.0.0] 展开（pp-wide）只在本次会话有效：启动一律还原，避免持久化的展开状态把主区域永久隐藏（白屏）。
try { const r = panelUI.restoreTabs(localStorage.getItem('qk.pageTabs')); pageTabs = r.tabs; pageTabId = r.active; pageWide = false; pageWidth = r.width; } catch {}
// [v0.58.1 D2] 展开状态不跨重启保存：忽略旧版本写入的 wide；没有可展示页签时也不会以展开态启动。
pageWide = false;
let marketTab = 'industry', marketStockCode = '', marketPingAt = 0; // [F1]
let rpStock = '', rpKind = '', rpQuery = ''; // [v0.53] 投研资料 filters
let taskTab = '', taskFilter = 'all', runStatus = 'all', runTaskFilter = 'all', runTrigger = 'all'; // [ux6]
let sidebarCollapsed = false, sidePanel = false, sideTab = 'preview', previewId = '', previewTabs = [], previewSource = false, previewHtml = false, previewInteractive = false, previewZoom = 100, recentQuery = '', pickerKind = '', pickerItems = [], pickerIndex = 0, pickerSerial = 0;
const openedDetails = new Set();
// [p1-m2] leaving an incognito chat discards it
// [p1-m5] plan mode: draft a plan (no tools) instead of running the turn
async function sendPlan(prompt, kind = '') {
    const id = chatId || crypto.randomUUID(), asIncognito = incognito && !state.chats.some(c => c.id === id);
    chatId = id; page = 'chat'; pendingChats.add(id); pending = true; draft = ''; incognito = false;
    const attached = [...files]; files = []; // [ux3] attached files go with the plan
    if (!state.chats.some(c => c.id === id)) state.chats.unshift({ id, agentId, name: prompt.slice(0, 36), messages: [], ...(asIncognito ? { incognito: true } : {}) });
    state.chats.find(c => c.id === id).messages.push({ role: 'user', content: prompt, planDraft: true, documents: attached.filter(f => f.documentId) });
    render(); toast(kind === 'research' ? '正在拆解研究课题…' : '正在生成计划…');
    try { applyState(await invoke('planDraft', { id, prompt, agentId, toolsEnabled, modelChoice, modelEffort, ...(kind ? { kind } : {}), ...(asIncognito ? { incognito: true } : {}),
        documents: attached.filter(f => f.documentId).map(({documentId,revision,sha256,name,archive,entryPath}) => ({documentId,revision,sha256,name,archive,entryPath})), files: attached.filter(f => !f.documentId).map(({ folderId, relative }) => ({ folderId, relative })) })); planMode = false; researchMode = false; }
    catch (e) { toast(e.message); applyState(await invoke('state')); if (chatId === id && !draft && !files.length) { draft = prompt; files = attached; } }
    finally { pendingChats.delete(id); pending = false; render(); }
}
// [p1-m3] slash commands
async function runCommand(name) {
    const c = state.chats.find(c => c.id === chatId), inChat = page === 'chat' && !!c;
    if (name === 'clear') return handle('new');
    if (name === 'help') { modal('命令与快捷键', helpHtml()); return; }
    if (name === 'research') { researchMode = !researchMode; planMode = false; render(); toast(researchMode ? '深度研究：发送研究课题后先生成研究大纲，确认后开始检索' : '已关闭深度研究'); return; }
    if (name === 'plan') { planMode = !planMode; researchMode = false; render(); toast(planMode ? '计划模式：发送后先生成步骤，确认后再执行' : '已关闭计划模式'); return; }
    if (name === 'memory') return navigate('context');
    if (name === 'files') return navigate('files');
    if (name === 'incognito') { if (inChat) throw Error('请在新对话中开启无痕'); incognito = !incognito; render(); toast(incognito ? '已开启无痕：不进最近列表，不读取也不学习记忆' : '已关闭无痕'); return; }
    if (name === 'mode') { render(); const d = document.querySelector('details[data-composer-menu="model"]'); if (d) { d.open = true; d.querySelector('summary')?.focus(); } return; }
    if (!inChat) throw Error('请在已有对话中使用该命令');
    if (name === 'rename') return handle('chatRename', c.id);
    if (name === 'export') return handle('chatExport', c.id);
    if (name === 'compact') {
        toast('正在压缩上下文…');
        const before = currentUsage().tokens;
        applyState(await invoke('chatCompact', { id: c.id })); render();
        toast(`已压缩上下文：约 ${Math.max(0, Math.round((before - currentUsage().tokens) / 100) / 10)}k tokens 被替换为摘要`);
        return;
    }
}
function leaveIncognito(id) { const c = id && state.chats.find(c => c.id === id); if (!c?.incognito || !api) return; invoke('leaveIncognito', { id }).then(s => { applyState(s); render(); }).catch(() => {}); }
const taskWorkspaces = new Map();
function switchChat(next) { if (next !== chatId) leaveIncognito(chatId); taskWorkspaces.set(chatId, { previewTabs, previewId, sidePanel, sideTab, draft, files, selections, images, sendImages, agentId,modelChoice,modelEffort }); const saved = taskWorkspaces.get(next); previewTabs = saved?.previewTabs || []; previewId = saved?.previewId || ''; sidePanel = saved?.sidePanel || false; sideTab = saved?.sideTab || 'preview'; draft=saved?.draft||''; files=saved?.files||[];selections=saved?.selections||[];images=saved?.images||[];sendImages=saved?.sendImages||false; modelChoice=saved?.modelChoice||state.chats.find(c=>c.id===next)?.modelChoice||'legacy';modelEffort=saved?.modelEffort??state.chats.find(c=>c.id===next)?.modelEffort??'';chatId = next; agentId=saved?.agentId||state.chats.find(c=>c.id===next)?.agentId||agentId; closePicker(); }
const toolNames = { image_ocr_import: '保存图片识别成果', pdf_ocr_import: '保存PDF识别成果', pdf_ocr: '识别PDF文字', image_ocr: '识别图片文字', cli_execute: '运行命令', browser_open: '打开网页', browser_read: '读取网页正文', browser_snapshot: '检查页面元素', browser_click: '点击页面元素', browser_fill: '填写文本框', app_task_list: '查看定时任务', app_task_create: '创建定时任务', app_task_update: '修改定时任务', app_task_delete: '删除定时任务', app_task_run: '运行定时任务', app_connector_list: '查看连接', app_connector_sync: '同步连接', app_connector_add: '添加连接', app_connector_guide: '查看接入步骤', app_web_search: '联网搜索', app_miniapp_list: '查看小应用', app_miniapp_read: '读取小应用数据', app_quant_status: '查看量化引擎', app_quant_signal: '计算量化信号', app_quant_scan: '扫描股票池', app_quant_insight: 'AI 研判', app_quant_pool_add: '加入股票池', app_quant_pool_remove: '移出股票池', app_quant_open: '打开量化页', app_quant_watch: '设置盯盘提醒', app_mcp_list: '查看 MCP 连接', app_mcp_add: '添加 MCP 连接', app_mcp_signin: 'MCP 浏览器登录', app_mcp_test: '测试 MCP 连接', app_quant_report: '量化报告', app_quant_report_auto: '设置日报自动生成', app_quant_holdings: '查看持仓', app_quant_trade_record: '记录成交', app_quant_plan_set: '修改定投计划', app_web_read: '阅读网页', app_dashboard_create: '生成仪表盘', app_briefing_generate: '生成简报', app_open_page: '打开页面', app_memory_add: '保存记忆', app_graph_search: '查询知识图谱', connector_search: '检索连接内容' };
const statusNames = { pending_approval: '等待你确认', running: '执行中', succeeded: '已完成', completed: '已完成', opened: '已打开', read: '已读取', inspected: '已检查', clicked: '已发送点击', filled: '已填写', failed: '失败', denied: '已拒绝', cancelled: '已取消', interrupted: '已中断', queued: '排队中', paused: '已暂停', cancelling: '正在停止', timed_out: '已超时', output_limit: '输出超限', inherited_pipes: '子进程未关闭' };
function taskStatus(c) {
    if (c.run)
        return statusNames[c.run.status] || '待查看';
    return c.messages?.at(-1)?.error ? '失败' : c.messages?.some(m => m.role === 'assistant') ? '已完成' : '待继续';
}
// [p1-m2] sidebar: 置顶 / 文件夹 / 最近 / 已归档 with full-text filter
const recentOpen = new Set();
function recentRows() { return recentSections({ chats: state.chats, folders: state.chatFolders || [], query: recentQuery, chatId, page, status: c => statusNames[c.run.status], date, live: new Set(['queued', 'running', 'cancelling']), open: recentOpen }); }
function executionRecords(runId) { return (state.executions || []).filter(r => r.chatId === chatId && (!runId || r.runId === runId)).slice().reverse(); }
function executionRow(r) { const output = r.tool === 'cli_execute' ? [r.partial || r.result?.stdout || '', r.result?.stderr ? 'stderr:\n' + r.result.stderr : '', r.result?.error || '', r.result?.exitCode !== undefined ? '退出码：' + r.result.exitCode : ''].filter(Boolean).join('\n') : JSON.stringify(r.result || {}, null, 2); return `<details class="execution-step" data-detail="${escape(r.id)}" ${openedDetails.has(r.id) ? 'open' : ''}><summary>${icon(r.tool === 'cli_execute' ? 'activity' : 'link')}<span>${toolNames[r.tool] || escape(r.tool)}</span><span class="step-status ${['failed', 'denied', 'cancelled', 'interrupted'].includes(r.status) ? 'issue' : ''}">${escape(statusNames[r.status] || r.status)}</span><span class="step-time">${r.finishedAt ? ((r.finishedAt - r.time) / 1000).toFixed(1) + 's' : date(r.time)}</span></summary><div class="step-detail"><b>实际参数</b><pre>${escape(JSON.stringify(r.command || r.receipt || r.args, null, 2))}</pre>${output && output !== '{}' ? `<b>执行结果</b><pre>${escape(output)}</pre>` : ''}${r.status === 'pending_approval' ? '<p>请在对话中的授权卡片核对目标与参数。</p>' : ''}</div></details>`; }
function commandQueue() { return views.commandQueue({state, action, date, statusNames}); }
function trace(runId) { const rows = executionRecords(runId); return rows.length ? `<section class="run-trace" aria-label="实际执行过程"><div class="trace-label">${icon('activity')}执行过程 · ${rows.length} 步</div>${rows.map(executionRow).join('')}</section>` : ''; }
function openPreview(item) {
    if (item.documentId && openDocumentPreview(item.documentId)) return;
    const existing = previewTabs.find(t => t.id === item.id);
    if (existing)
        Object.assign(existing, item);
    else {
        previewTabs.push(item);
        if (previewTabs.length > 8)
            previewTabs.shift();
    }
    previewId = item.id;
    sidePanel = true;
    sideTab = 'preview';
    previewSource = false;
    previewHtml = /\.html?$/i.test(item.name||'');
    previewInteractive = previewHtml;
    render();
}
function previewPanel() { return views.previewPanel(viewContext()); }
function toast(message, {persistent = false, retry} = {}) {
    const node = $('#toast');
    node.textContent = message;
    node.style.display = 'block';
    clearTimeout(toast.timer);
    const dismiss = () => { if (toast.dismiss === dismiss) node.style.display = 'none'; };
    toast.dismiss = dismiss;
    if (retry) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary';
        button.textContent = '重试';
        button.addEventListener('click', () => { dismiss(); retry().catch(error => toast(error.message)); }, {once: true});
        node.append(' ', button);
    }
    if (!persistent && !retry) toast.timer = setTimeout(dismiss, 4500);
    return dismiss;
}
async function runOfficeAction(label, work) {
    const dismiss = toast(label.endsWith('…') ? label : '正在' + label + '…', {persistent: true});
    try {
        await work();
    } catch (error) {
        if (!/超时|timeout/i.test(error.message)) throw error;
        const detail = error.message.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '').trim();
        toast(label + '超时。' + (/timeout/i.test(detail) ? '本机 Office 内核或转换未及时完成。' : detail), {retry: () => runOfficeAction(label, work)});
    } finally {
        dismiss();
    }
}
let officeNotice;
const editingWindows = new Set();
function clearOfficeNotice() {
    if (officeNotice && !officeNotice.inScope()) {
        officeNotice.dismiss();
        officeNotice = undefined;
    }
}
async function openDocumentOffice(document, target) {
    const origin = {page, chatId, tab: panelTab()?.id};
    const inScope = () => page === origin.page && chatId === origin.chatId && panelTab()?.id === origin.tab;
    try {
        const result = await invoke('officeOpen', {id: document.id, revision: document.revision, ...(target ? {target} : {})});
        if (result?.status === 'opened' && inScope()) officeNotice = {inScope, dismiss:toast('已在 QuanK Office 打开')};
    } catch (error) {
        if (inScope()) officeNotice = {inScope, dismiss:toast(error.message)};
    }
}
function exportOfficeDocumentPdf(id, revision) {
    return runOfficeAction('准备 PDF 导出', async () => {
        const result = await invoke('documentExportPdf', {id, revision});
        if (result?.status === 'succeeded') toast('PDF 已保存');
    });
}
async function invoke(name, payload) {
    if (!api)
        throw new Error('当前为界面预览。请通过 npm start 启动桌面应用以使用此功能。');
    try { if(typeof api?.[name] !== 'function')throw Error(`当前安装的 QuanK 不支持这个功能（缺少「${name}」接口）。请安装最新版本，完全退出（⌘Q）后重新打开。`); return await api[name](payload && typeof payload === 'object' && !Array.isArray(payload) && page === 'chat'
        ? { ...payload, approvalChatId: chatId } : payload); }
    catch(error) { throw new Error(String(error?.message||'操作失败，请重试').replace(/^Error invoking remote method ['"][^'"]+['"]:\s*(?:Error:\s*)?/,'').replace(/^Error:\s*/,'')); }
}
async function update(name, payload) { applyState(await invoke(name, payload)); render(); return state; }
function officeEngineSettings() {
    const engine = state.officeEngine;
    if (!engine) return '';
    const {phase, reason, timings} = engine;
    const status = {idle:'未启动', starting:'启动中', ready:'就绪', failed:'失败'}[phase];
    const metrics = [];
    const font = timings.startupFont;
    if (font) metrics.push(`字体缓存${font.hit ? '命中' : '生成'} ${font.ms} ms`);
    for (const [stage,label] of [['preview','预览进程'],['editor','编辑进程'],['ready','引擎就绪']]) {
        if (timings[stage]) metrics.push(`${label} ${timings[stage].ms} ms`);
    }
    if (timings.lastPreview) {
        const preview = timings.lastPreview;
        const cache = {memory:'内存缓存命中',disk:'磁盘缓存命中',miss:'缓存未命中'}[preview.cache];
        metrics.push(`最近预览 ${preview.ms} ms · ${cache} · 转换 ${preview.conversionMs} ms${preview.failed ? ' · 失败' : ''}`);
    }
    return `<p><button type="button" class="secondary" role="switch" aria-checked="${state.settings.officeStartupWarm !== false}" data-action="officeWarmToggle">启动时预热 Office 引擎 · ${state.settings.officeStartupWarm !== false ? '开启' : '关闭'}</button></p>
    <p role="status">Office 引擎${status}${reason ? ' · ' + escape(reason) : ''}</p>
    ${metrics.length ? `<p class="hint">${metrics.join(' · ')}</p>` : ''}
    ${phase === 'failed' ? action('重试','officeEngineRetry') : ''}`;
}
function settingsMarkup() {
    return modelLibrary(state,escape) + '<section id="officeEngineSettings">' + officeEngineSettings() + '</section>';
}
function action(label, act, id = '', kind = 'secondary') { return `<button type="button" class="${kind}" data-action="${act}" data-id="${escape(id)}">${label}</button>`; }
function empty(title, desc, button = '') { return `<div class="empty">${icon('spark')}<h3>${title}</h3><p>${desc}</p>${button}</div>`; }
function heading(kicker, title, desc, button = '', stats = []) { // [ux11] plaza-style hero on every list page; kicker kept for callers, no longer shown
    const t = String(title ?? ''), k = t.indexOf('，');
    const h = k > 0 && k < t.length - 1 ? `${t.slice(0, k + 1)}<em>${t.slice(k + 1)}</em>` : t;
    const s = Array.isArray(stats) && stats.length ? `<div class="plaza-stats">${stats.map(([n, l]) => `<span><b>${escape(String(n))}</b>${escape(l)}</span>`).join('')}</div>` : '';
    return `<div class="page-title page-hero"><div><h1>${h}</h1><p>${desc}</p>${s}</div>${button ? `<div class="hero-actions">${button}</div>` : ''}</div>`;
}
function date(t) { return new Date(t).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
const boundComposers=new WeakSet();
const composerMenus=createComposerMenus($('#app'));
const composerImages=createComposerImages($('#app'),id=>invoke('imagePreview',{id}));
window.addEventListener('pagehide',()=>{composerMenus.dispose();composerImages.dispose();});
const officeWorkspace = createOfficeWorkspace($('#app'), host => host.classList.contains('html-host')?mountHtmlPreview(host):mountOfficePreview(host, invoke, () => state.officeEngine?.phase === 'ready'));
window.addEventListener('pagehide', () => officeWorkspace.dispose());
// [p1-m4] a chat that finishes while the user is watching it is simply marked seen (no recap)
const seenRequests = new Set();
function autoSeen() { const c = page === 'chat' && state.chats.find(c => c.id === chatId); if (!c?.unread || seenRequests.has(c.id) || (typeof document.hasFocus === 'function' && !document.hasFocus())) return; seenRequests.add(c.id); c.unread = false; invoke('chatSeen', { id: c.id }).then(s => { seenRequests.delete(c.id); applyState(s); }).catch(() => seenRequests.delete(c.id)); }
// [v0.58.1 D2] 渲染异常兜底：异常中断时清掉展开态，确保主区域始终可见。
function render() { try { renderInner(); } catch (error) { recoverMain(); throw error; } }
function renderInner() {
    clearOfficeNotice();
    if (state.locked) { // [F5 M1] lock screen only; the data was dropped from the renderer when the lock arrived
        $('#app').className = 'app-locked'; $('#app').innerHTML = securityUI.lockScreen(state.lock);
        if ($('#modal')?.open) $('#modal').close();
        const pw = $('#lockPassword'); pw?.focus(); pw?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); handle('secUnlock').catch(err => toast(err.message)); } });
        return;
    }
    autoSeen();
    composerMenus.beforeRender();
    pending=pendingChats.has(chatId);
    const previousComposer=$('#prompt');
    const oldScroll = $('.messages-scroll'), scrollTop = oldScroll?.scrollTop || 0, stick = !oldScroll || oldScroll.scrollHeight - oldScroll.scrollTop - oldScroll.clientHeight < 90;
    const focused = document.activeElement?.id, selection = focused === 'prompt' ? [$('#prompt').selectionStart, $('#prompt').selectionEnd] : null;
    const active = nav.find(n => n[0] === page);
    const name = state.settings.name || '我的工作空间';
    $('#app').className = sidebarCollapsed ? 'sidebar-collapsed' : '';
    const markup = `<div class="titlebar"></div><aside class="sidebar"><div class="brand"><span class="brand-mark"><img src="assets/logo.png" alt="QuanK 标志"></span><div>QuanK${appVersion ? `<span class="brand-ver" title="当前版本 v${escape(appVersion)}">v${escape(appVersion)}</span>` : ''}<small>量化工作，一键搞定</small></div></div><button class="new" data-action="new">${icon('plus')}<span>新建任务</span><span>⌘ N</span></button>${sidebarNav({page, icon, unread: feedUnread(approvalFeedState())})}<div class="recent"><div class="recent-header"><span>任务 <small>${state.chats.filter(c => !c.incognito).length}</small></span><button data-action="newFolder" aria-label="新建文件夹" title="新建文件夹">${icon('folder')}</button><button data-action="search" aria-label="搜索任务与成果">${icon('search')}</button></div><input id="recentQuery" aria-label="筛选历史任务" placeholder="搜索对话标题和内容" value="${escape(recentQuery)}"><div id="recentList">${recentRows()}</div></div><button class="profile" data-action="settings"><div class="avatar">QK</div><div>${escape(name)}<small>${escape(state.settings.model)} · 本地工作空间</small></div>${icon('settings')}</button></aside><main class="main"><header class="topbar"><div><button class="icon-button" data-action="sidebarToggle" aria-label="${sidebarCollapsed ? '展开' : '收起'}侧栏">${icon('grid')}</button><span class="topbar-title">${escape(page === 'chat' ? state.chats.find(c => c.id === chatId)?.name || '新任务' : active?.[2] || '工作台')}${(page === 'chat' && state.chats.find(c => c.id === chatId)?.incognito) || (page === 'home' && incognito) ? '<span class="incognito-badge">无痕</span>' : ''}</span></div><div>${state.officeEngine?.phase==='starting' ? '<span class="office-engine-pill" role="status" title="Office 引擎启动中">Office 启动中</span>' : ''}<button class="topbar-action" data-page="tasks" aria-label="查看后台任务">后台 ${(state.runJobs||[]).filter(j=>['running','cancelling'].includes(j.status)).length} 执行 · ${(state.runJobs||[]).filter(j=>j.status==='queued').length} 排队</button>${page === 'chat' && state.chats.some(c => c.id === chatId) ? `<button class="topbar-action" data-action="chatMenu" data-id="${escape(chatId)}" aria-label="对话操作">···</button>` : ''}${page === 'chat' ? `<button class="topbar-action" data-action="panelTab" data-id="execution">${icon('activity')}执行过程</button>` : ''}<button class="topbar-action ${sidePanel ? 'chosen' : ''}" data-action="panelToggle">${icon('file')}工作区</button><button class="status" data-action="settings"><span class="dot ${state.settings.hasKey ? 'on' : ''}"></span>${state.settings.hasKey ? escape(state.settings.model) : '连接模型'}</button></div></header><div class="workbench ${sidePanel ? 'with-panel' : ''}"><div class="workspace ${page === 'chat' ? 'conversation-space' : ''}">${content()}${['home', 'chat'].includes(page) ? '' : approvalMarkup()}</div>${sidePanel ? previewPanel() : ''}</div></main>`;
    officeWorkspace.update(markup, `${page}:${chatId}`);
    renderPanel(); // [v0.54]
    paintApprovalSummaries();
    for (const el of [document.scrollingElement, document.getElementById('app'), document.querySelector('.main'), document.querySelector('.workbench')]) if (el && el.scrollLeft) el.scrollLeft = 0; // [resp] never leave the shell scrolled sideways
    if(previousComposer&&$('#prompt'))$('#prompt').replaceWith(previousComposer);
    composerMenus.afterRender(`${page}:${chatId}`);
    composerImages.update();
    bindPresetFilters($('#app'));
    bindOnce($('#sendImages'), 'change',e=>sendImages=e.target.checked);
    const composer = $('#prompt');
    if(composer&&composer.value!==draft)composer.value=draft;
    if (composer&&!boundComposers.has(composer)) {
        boundComposers.add(composer);
        composer.addEventListener('input', () => { draft = composer.value; updatePicker(); paintMeter(); });
        composer.addEventListener('keydown', e => {
            if (e.isComposing)
                return;
            if (pickerKind && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
                e.preventDefault();
                if (e.key === 'Escape') {
                    closePicker();
                    return;
                }
                if (e.key === 'Enter') {
                    choosePicker(pickerIndex).catch(e => toast(e.message));
                    return;
                }
                pickerIndex = (pickerIndex + (e.key === 'ArrowDown' ? 1 : -1) + Math.max(1, pickerItems.length)) % Math.max(1, pickerItems.length);
                paintPicker();
                return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
            }
        });
    }
    bindOnce($('#recentQuery'), 'input', e => { recentQuery = e.target.value; $('#recentList').innerHTML = recentRows(); });
    bindOnce($('#memoryQuery'), 'change', e => { memoryQuery = e.target.value; render(); });
    { // [q1] quant detail charts: one isolated chart frame per dashboard, rebuilt when the detail changes
        const qc = $('#quantCharts');
        if (!qc) { quantDisposers.forEach(d => d?.dispose?.()); quantDisposers = []; }
        else if (!qc.dataset.mounted && quantCache.get(qc.dataset.code)?.charts) {
            qc.dataset.mounted = '1'; quantDisposers.forEach(d => d?.dispose?.()); quantDisposers = [];
            for (const dash of quantDashboards(qc.dataset.code, quantCache.get(qc.dataset.code).charts)) { const box = document.createElement('div'); box.className = 'q-chart'; qc.append(box); quantDisposers.push(mountDashboard(box, dash)); }
        }
    }
    mountKlineBoxes(document, p => invoke('market', p)); marketPing(); signalPopups(); // [F1] [F1c]
    knowledgeUI.mountKnowledge(document, p => invoke('knowledge', p)); // [F3]
    portfolioUI.mountPortfolio(document, p => invoke('portfolio', p), { view: () => state.portfolio }); // [F4]
    securityUI.mountSecurity(document, p => invoke('security', p)); // [F5]
    { // [p4-m4] mini app viewer: code and data are fetched when the viewer appears; every data change goes to main
        const mh = $('#miniappHost');
        if (!mh && miniappDispose) { miniappDispose(); miniappDispose = null; }
        if (mh && !mh.dataset.mounted) {
            mh.dataset.mounted = '1'; miniappDispose?.(); miniappDispose = null;
            const id = mh.dataset.id, note = m => { const n = $('#miniappNote'); if (n) { n.hidden = false; n.textContent = m; } else toast(m); };
            invoke('miniapp', { action: 'get', id }).then(out => {
                if (!mh.isConnected) return;
                const r = out?.result || {};
                miniappDispose = mountMiniApp(mh, { html: r.html, storage: r.storage || {} }, { onStorage: op => invoke('miniapp', { action: 'storage', id, ...op }).catch(e => note('数据没有保存：' + e.message)), onError: m => note('应用脚本出错：' + m) });
            }).catch(e => { mh.textContent = '无法打开小应用：' + e.message; });
        }
    }
    mountInfographics(document, state.brand); // [p4-m3] also mounts images that arrive while a reply streams
    if (typeof MutationObserver === 'function' && !window.__wbIgObserver) { window.__wbIgObserver = new MutationObserver(() => mountInfographics(document, state.brand)); window.__wbIgObserver.observe(document.body, { childList: true, subtree: true }); }
    bindOnce($('#graphQuery'), 'change', e => { graphQuery = e.target.value; graphCache.refit = true; render(); }); // [p3-m5]
    bindOnce($('#runStatus'), 'change', e => { runStatus = e.target.value; render(); }); // [ux6]
    bindOnce($('#runTrigger'), 'change', e => { runTrigger = e.target.value; render(); });
    bindOnce($('#runTask'), 'change', e => { runTaskFilter = e.target.value; render(); });
    // [ux4] knowledge-graph canvas: positions and zoom persist in graphCache across re-renders
    if (!graphMount) graphCache.refit = true;
    graphMount?.dispose(); graphMount = null;
    if ($('#graphCanvas')) graphMount = mountGraphCanvas($('#graphCanvas'), graphData(state.graph, { type: graphType, query: graphQuery, focus: graphFocus }), { cache: graphCache, selected: graphSelected,
        onSelect: sel => { graphSelected = sel; const side = $('#graphSide'); if (side) { side.innerHTML = sel ? graphSidePanel(state, sel, { action, date }) : ''; side.hidden = !sel; } },
        onFocus: f => { graphFocus = f; if (f) graphSelected = f; render(); } });
    for (const d of document.querySelectorAll('#recentList details[data-section]')) d.addEventListener('toggle', () => { d.open ? recentOpen.add(d.dataset.section) : recentOpen.delete(d.dataset.section); });
    bindOnce($('#toolMode'), 'change', e => { toolsEnabled = e.target.checked; });
    for (const name of ['url', 'executable', 'args', 'folderId', 'relative'])
        bindOnce($('#tool-' + name), 'input', e => { toolDraft[name] = e.target.value; });
    bindOnce($('#modelChoice'), 'change',e=>{modelChoice=e.target.value;modelEffort='';render();});
    bindOnce($('#modelEffort'), 'change',e=>{modelEffort=e.target.value;render();});
    bindOnce($('#agent'), 'change', e => { agentId = e.target.value; render(); }); // [F1f] refresh the avatar
    bindOnce($('#folderSelect'), 'change', e => { folderId = e.target.value; loadFiles(); });
    bindOnce($('#rpQuery'), 'keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); handle('rpSearch').catch(err => toast(err.message)); } }); // [v0.53]
    bindOnce($('#fileQuery'), 'keydown', e => {
        if (e.key === 'Enter') {
            searchTerm = e.target.value;
            loadFiles();
        }
    });
    const scroller = $('.messages-scroll');
    if (scroller)
        scroller.scrollTop = stick ? scroller.scrollHeight : scrollTop;
    if (focused && document.getElementById(focused)) {
        document.getElementById(focused).focus({ preventScroll: true });
        if (selection)
            $('#prompt').setSelectionRange(...selection);
    }
    if (pickerKind)
        paintPicker();
}
function chatLive() { return pending || ['queued','running','cancelling'].includes(state.chats.find(c=>c.id===chatId)?.run?.status); }
function composer() {return approvalMarkup() + compactComposer({selections,state,agentId,files,images,sendImages,live:chatLive(),toolsEnabled,icon,escape,modelName:modelChoiceLabel(state,modelChoice,modelEffort),modelMarkup:modelPicker(state,modelChoice,modelEffort,escape),meter:contextMeter(currentUsage()),modes:{show:['home','chat'].includes(page)&&!chatLive(),plan:planMode,research:researchMode,incognito,incognitoAllowed:page==='home'&&!chatId}});} // [F1f] modes beside the composer
// [p1-m3] context meter for the next request
function currentUsage() { const chat = page === 'chat' ? state.chats.find(c => c.id === chatId) : null; return contextUsage({chat, draft, files, memories: state.settings?.memory?.enabled === false || chat?.incognito ? [] : (state.memories || []).filter(m => m.source !== 'auto'), limit: Number(state.settings?.contextTokens) || undefined}); }
function paintMeter() { const node = document.querySelector('.context-meter'); if (node) node.outerHTML = contextMeter(currentUsage()); }

function homeContent() {
    const cards = approvalRequests().filter(item => !item.codingTaskId && !state.chats.some(chat => chat.id === item.chatId));
    return (cards.length ? `<div class="home-approvals">${cards.map(item => officeApprovalCard(item, action)).join('')}</div>` : '') + views.homeContent(viewContext());
}
function conversationContent() { return views.conversationContent(viewContext()); }
function closePicker() {
    pickerKind = '';
    pickerItems = [];
    pickerSerial++;
    const node = $('#inlinePicker');
    if (node)
        node.hidden = true;
}
/** [v46] @ / menu placement: fixed to the viewport so the home hero card (overflow:hidden) cannot clip it, opening
 *  downward under the composer when there is room (preferred), otherwise upward. Re-placed on resize / scroll. */
function placePicker(node = $('#inlinePicker')) {
    const host = node?.parentElement;
    if (!node || node.hidden || !host || typeof host.getBoundingClientRect !== 'function')
        return;
    const r = host.getBoundingClientRect(), vh = window.innerHeight || document.documentElement.clientHeight || 800, gap = 8, want = 330;
    if (!r.width)
        return;
    const below = vh - r.bottom - gap - 12, above = r.top - gap - 12, down = below >= Math.min(want, 220) || below >= above;
    Object.assign(node.style, {position: 'fixed', left: `${Math.round(r.left)}px`, right: 'auto', width: `${Math.round(r.width)}px`,
        top: down ? `${Math.round(r.bottom + gap)}px` : 'auto', bottom: down ? 'auto' : `${Math.round(vh - r.top + gap)}px`,
        maxHeight: `${Math.round(Math.max(160, Math.min(want, down ? below : above)))}px`});
    node.classList.toggle('opens-down', down);
    node.classList.toggle('opens-up', !down);
}
if (typeof window !== 'undefined' && !window.__qkPickerPlace) {
    window.__qkPickerPlace = true;
    window.addEventListener('resize', () => placePicker());
    document.addEventListener('scroll', () => placePicker(), true);
}
function paintPicker() {
    const node = $('#inlinePicker');
    if (!node)
        return;
    node.hidden = !pickerKind;
    node.innerHTML = `<div class="picker-title">${pickerKind === '/' ? '命令与智能体' : '附加授权目录中的资料'}<small>↑ ↓ 选择 · Enter 确认 · Esc 关闭</small></div>${pickerItems.map((t, i) => `<button role="option" aria-selected="${i === pickerIndex}" data-action="pickerChoose" data-id="${i}" class="${t.type === 'command' ? 'picker-command' : ''}">${icon(t.type === 'command' ? 'spark' : pickerKind === '/' ? 'agent' : 'file')}<span>${escape(t.name)}<small>${escape(t.description || t.relative || '')}</small></span></button>`).join('') || `<p>${pickerKind === '/' ? '没有匹配的智能体' : '没有匹配的文本文件，可在本地文件页授权目录'}</p>`}${pickerKind === '@' ? '<button class="picker-browse" data-page="files">浏览已授权文件夹 ↗</button>' : ''}`;
    placePicker(node);
    node.querySelector('[aria-selected="true"]')?.scrollIntoView?.({block: 'nearest'});
}
async function updatePicker(force) {
    const node = $('#prompt');
    if (!node)
        return;
    const token = draft.slice(0, node.selectionStart).match(/(?:^|\s)([@/])([^\s]*)$/);
    const kind = force || token?.[1];
    if (!kind) {
        closePicker();
        return;
    }
    const query = force ? '' : token[2], serial = ++pickerSerial;
    pickerKind = kind;
    pickerIndex = 0;
    if (kind === '/') {
        // [p1-m3] commands only at the start of the input; agents remain selectable below them
        const atStart = !force && /^\s*\/[^\s]*$/.test(draft.slice(0, node.selectionStart));
        const inChat = page === 'chat' && state.chats.some(c => c.id === chatId);
        pickerItems = [...(atStart || force ? matchCommands(query, {inChat}) : []), ...state.agents.filter(a => a.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)];
        paintPicker();
        return;
    }
    pickerItems = [];
    paintPicker();
    try {
        const groups = await Promise.all(state.folders.slice(0, 5).map(f => invoke('listFiles', { id: f.id, query })));
        if (serial !== pickerSerial)
            return;
        pickerItems = groups.flatMap(g => g.files || []).filter(f => !files.some(a => a.folderId === f.folderId && a.relative === f.relative)).slice(0, 10);
        paintPicker();
    }
    catch (e) {
        if (serial === pickerSerial) {
            closePicker();
            toast(e.message);
        }
    }
}
async function choosePicker(index) {
    const item = pickerItems[index];
    if (!item)
        return;
    const kind = pickerKind, node = $('#prompt'), at = node?.selectionStart ?? draft.length;
    const prefix = draft.slice(0, at);
    if (kind === '/' && item.type === 'command') {
        draft = prefix.replace(/(^|\s)[@/][^\s]*$/, '$1') + draft.slice(at);
        closePicker();
        await runCommand(item.id);
        return;
    }
    if (kind === '/')
        agentId = item.id;
    else {
        if (files.length >= 32)
            throw new Error('每次最多附加 32 个文件');
        const f = await invoke('readFile', { folderId: item.folderId, relative: item.relative });
        if (!files.some(a => a.folderId === f.folderId && a.relative === f.relative))
            files.push(f);
    }
    draft = prefix.replace(/(^|\s)[@/][^\s]*$/, '$1') + draft.slice(at);
    closePicker();
    render();
    $('#prompt')?.focus();
}
function content() {
    if (page === 'home')
        return homeContent();
    if (page === 'chat')
        return conversationContent();
    if (page === 'market') // [F1]
        return marketPage(state, {action, date, tab: marketTab, stock: marketStockCode});
    if (page === 'quant') // [q1]
        return quantPage(state, {action, heading, empty, date, open: renderingStock, detail: renderingStock ? quantCache.get(renderingStock) ?? null : null, panel: !!renderingStock, section: renderingStockTab?.section, stockTitle: renderingStockTab?.title}); // [v0.54] stock details live in panel tabs
    if (page === 'studio') // [p4-m1]
        return studioTab === 'infographics' ? infographicPage(state, {action, heading, empty, date, tab: studioTab}) : studioTab === 'miniapps' ? miniappPage(state, {action, heading, empty, date, tab: studioTab, open: miniappOpenId}) : studioPage(state, {action, heading, empty, date, tab: studioTab}); // [p4-m3][p4-m4]
    if (page === 'graph') // [p3-m5][ux4] 我的上下文 · 知识图谱
        return contextGraphPage(state, {action, date, empty, query: graphQuery, type: graphType, mode: graphMode, focus: graphFocus, selected: graphSelected});
    if (page === 'connectors') // [p3-m1]
        return connectorsPage(state, {action, date, heading, empty});
    if (page === 'security') // [F5]
        return securityUI.securityPage(state, {heading, action});
    if (page === 'tools')
        return `<div class="page">${heading('', '浏览器与权限', '助手打开网页、运行命令前会先征求你的确认；确认框可按 Esc 取消，60 秒无人响应自动取消。在这里管理「总是允许」的规则和已有授权。', action('刷新', 'refresh')+action('撤销浏览器授权','revokeBrowserApprovals')+action('取消所有确认框','cancelApprovals'))}
 ${approvalRulesPanel(state, {action, date})}<div class="tool-grid"><section class="tool-panel"><h2>浏览器</h2><p class="description">内置浏览器支持检查元素、点击与填写；系统浏览器使用你平常的浏览器，但助手不能读取其内容。</p><label>网址<input id="tool-url" aria-label="浏览器网址" value="${escape(toolDraft.url)}" placeholder="https://example.com"></label><div class="toolbar">${action('打开内置浏览器', 'browserOpen', '', 'primary')}${action('在系统浏览器打开', 'externalBrowser')}</div><div class="browser-list">${(state.browsers || []).map(b => `<div class="file-row"><div>${escape(b.title || '网页')}<small>${escape(b.url)}</small></div>${action('读取正文', 'browserRead', b.id)}${action('检查元素', 'browserInspect', b.id)}</div>`).join('')}</div></section>
 <section class="tool-panel"><h2>CLI 命令</h2><p class="description">非交互执行，返回真实输出及退出码。命令以当前账号权限运行；工作目录不是权限沙箱。</p><label>程序名 / 绝对路径<input id="tool-executable" aria-label="CLI 程序" value="${escape(toolDraft.executable)}" placeholder="node / python3 / git / codex"></label><label>参数（JSON 字符串数组）<textarea id="tool-args" aria-label="CLI 参数">${escape(toolDraft.args)}</textarea></label><label>授权工作目录<select id="tool-folderId" aria-label="CLI 工作目录"><option value="">请选择文件夹</option>${state.folders.map(f => `<option value="${f.id}" ${toolDraft.folderId === f.id ? 'selected' : ''}>${escape(f.name)}</option>`).join('')}</select></label><label>子目录（可留空）<input id="tool-relative" value="${escape(toolDraft.relative)}"></label><div class="toolbar">${action('审阅并执行', 'commandRun', '', 'primary')}${action('授权文件夹', 'folder')}</div><p class="description">例如 node + ["--version"]，或 codex + ["exec","检查此项目的测试失败原因"]。需要先在电脑上安装并配置对应 CLI。</p></section></div>
 ${commandQueue()}<div class="section-head"><h2>实际执行记录</h2><small>包含模型和手动发起的操作</small></div>${(state.executions || []).map(r => `<details class="execution" ${['running', 'pending_approval'].includes(r.status) ? 'open' : ''}><summary><span>${escape(r.tool)}</span><span class="badge">${escape(r.status)}</span><small>${date(r.time)}</small></summary><pre>${escape(JSON.stringify(r.command || r.args, null, 2))}</pre>${r.partial ? `<pre class="terminal">${escape(r.partial)}</pre>` : ''}${r.result ? `<pre class="terminal">${escape(r.tool === 'cli_execute' ? [r.result.stdout || '', r.result.stderr ? 'stderr:\n' + r.result.stderr : '', r.result.error || '', 'status: ' + r.result.status, 'exit code: ' + r.result.exitCode].join('\n') : JSON.stringify(r.result, null, 2))}</pre>` : ''}</details>`).join('') || empty('还没有执行记录', '可先打开一个网页，或授权项目目录后执行 node --version。')}</div>`;
    if (page === 'files')
        return `<div class="page">${heading('LOCAL KNOWLEDGE', '让本地知识，触手可及。', '仅列出已授权目录中的文本和代码文件。选择文件后可预览、附加到对话。', action(icon('plus') + '授权文件夹', 'folder'))}${state.folders.length ? `<div class="file-search"><select id="folderSelect" aria-label="文件夹">${state.folders.map(f => `<option value="${f.id}" ${f.id === folderId ? 'selected' : ''}>${escape(f.name)}</option>`).join('')}</select><input id="fileQuery" placeholder="按文件名搜索，按 Enter 确认" value="${escape(searchTerm)}"><button class="secondary" data-action="fileSearch">${icon('search')}搜索</button><button class="secondary" data-action="revoke" data-id="${escape(folderId)}">撤销授权</button></div><p class="description">不自动上传。单个文件最大 1 MB，每次最多附加 32 个文件。Word/PDF 可使用原 Web 工作台处理。</p>${fileResults.map((f, i) => `<div class="file-row">${icon('file')}<div>${escape(f.name)}<small>${escape(f.relative)}</small></div>${action('预览', 'previewFile', i)}${action('附加到对话', 'attachFile', i)}</div>`).join('') || empty('暂无匹配的文件', '支持 Markdown、TXT、CSV、JSON 与常见代码文件；隐藏文件和依赖目录不会列出。')}${fileTruncated ? '<p class="description">列表已达到扫描上限（300 个结果 / 5000 个目录项 / 深度 6），可选择更小的文件夹。</p>' : ''}` : empty('选择你的第一个文件夹', '通过系统窗口授予文件夹访问权限。你可以随时在这里撤销。', action('选择文件夹', 'folder', '', 'primary'))}</div>`;
    if (page === 'agents' && capabilityTab!=='agents')return `<div class="page">${capabilityTabs(capabilityTab)}${capabilityTab==='skills'?skillsPage(state):mcpPage(state,busyMcp)}</div>`;
    if (page === 'agents') { // [ux11] plaza cards
        const ag = state.agents || [], skillN = a => (a.skills || []).length + (a.skillIds || []).length, mcpN = a => (a.mcp || []).length + (a.mcpIds || []).length;
        const tags = a => [[(a.knowledge || []).length, '份知识', 'blue'], [skillN(a), '项技能', 'violet'], [mcpN(a), '个 MCP', 'orange']].filter(([n]) => n).map(([n, l, t]) => `<span class="pc-tag t-${t}">${n} ${l}</span>`).join('') || '<span class="pc-tag">通用对话</span>';
        const cards = ag.map(a => `<div class="card plaza-card agent-card"><div class="pc-head">${agentAvatar(a)}<div class="pc-title"><h3>${escape(a.name)}</h3><small>${a.id === 'assistant' ? '内置智能体' : '自定义智能体'} · ReAct ${a.maxSteps || 32} 轮</small></div></div>
<div class="pc-tags">${tags(a)}</div><p class="pc-desc">${escape(a.description)}</p><div class="pc-actions">${action('开始对话', 'useAgent', a.id, 'primary')}${action('编辑', 'editAgent', a.id)}${a.id !== 'assistant' ? action('删除', 'deleteAgent', a.id) : ''}</div></div>`).join('');
        const categories = `<div class="agent-segments" role="group" aria-label="智能体分类">${[['all', '全部'], ['dialogue', '对话智能体'], ['coding', 'Coding 智能体']].map(([id, label]) => `<button type="button" data-action="agentCategory" data-id="${id}" aria-pressed="${agentCategory === id}" class="${agentCategory === id ? 'active' : ''}">${label}</button>`).join('')}</div>`;
        const coding = codingCards(state.coding, {action, date, busy: busyCoding, project: codingProject(), results: codingTestResults});
        const codingOnly = agentCategory === 'coding';
        const proxies = state.coding?.agents || [];
        const lastTest = Math.max(0, ...proxies.map(agent => agent.lastTest?.at || 0));
        const codingStats = [[proxies.length, '个代理'], [proxies.find(agent => agent.isDefault)?.name || '未设置', '默认代理'], [lastTest ? date(lastTest) : '尚未测试', '最近连接测试']];
        const actions = codingOnly ? action('检测本机代理', 'codingDetect') + action('添加代理', 'codingNew', '', 'primary') :
            action('清除检索索引', 'clearKnowledgeIndex') + action(icon('plus') + '新建智能体', 'newAgent', '', 'primary');
        return `<div class="page">${capabilityTabs('agents')}${heading('', '为每一种工作，找到好搭档。', '配置知识文档、Skills、MCP、工具和提示词，通过 ReAct 循环完成任务。', actions,
            codingOnly ? codingStats : [[ag.length, '个智能体'], [ag.reduce((n, a) => n + skillN(a), 0), '项已绑定技能'], [ag.reduce((n, a) => n + mcpN(a), 0), '个已绑定 MCP']])}
<div class="plaza-section-head agent-section-head"><h2>我的智能体</h2>${categories}</div><div class="plaza-grid agent-plaza-grid">${codingOnly ? '' : cards}${agentCategory === 'dialogue' ? '' : coding}</div>${codingOnly ? codingDetection(state.coding, codingCandidates, action) : ''}</div>`;
    }
    if (page === 'tasks') // [ux6] 定时任务 / 运行记录
        return automationPage(state, {action, empty, codingTasks: codingTaskList, codingProject: codingProject(), date, tab: taskTab || (state.trade ? 'trade' : 'tasks'), filter: taskFilter, runStatus, runTask: runTaskFilter, runTrigger, banner: pendingBanner(state, action),
            extra: taskTab === 'runs' && (state.runJobs || []).some(j => ['queued', 'running', 'cancelling'].includes(j.status)) ? views.runQueue({state, action, date, statusNames}) : ''}); // [ux8] only while something is queued
    if (page === 'research') return researchPage(state, {action, date, stock: rpStock, kind: rpKind, query: rpQuery}); // [v0.53]
    if (page === 'library')
        return `<div class="page">${heading('', '成果中心', '对话与自动化生成的文档和成果都在这里，可预览、继续编辑和导出。', '', [[(state.documents || []).length, '份文档'], [state.artifacts.length, '份保存的成果']])}${documentLibrary({state,action,date,filter: libraryFilter})}${libraryFilter ? '' : state.artifacts.length ? `<div class="cards">${state.artifacts.map(a => `<div class="card"><span class="tile-icon amber">${icon('file')}</span><h3>${escape(a.name)}</h3><p>${escape(a.text.slice(0, 110))}…</p><div class="meta">${date(a.time)}</div><div class="actions">${action('查看', 'viewArtifact', a.id)}${action('导出', 'exportArtifact', a.id)}${action('删除', 'deleteArtifact', a.id)}</div></div>`).join('')}</div>` : empty('还没有保存的成果', '在助手回复下点击“保存到成果中心”，或完成一个自动化任务。')}</div>`;
    if (page === 'context') // [ux4] 我的上下文 · 记忆
        return memoryPage({state, action, icon, date, empty, filter: memoryFilter, query: memoryQuery,
            heading: (kicker, title, desc, buttons = '') => contextHeader(state, {tab: 'context', date}) + `<div class="ctx-sub"><p class="description">${desc}</p><div class="ctx-actions">${buttons}</div></div>`}).replace('<div class="page">', '<div class="page context-page">');
    if (page === 'feed') // [p2-m3]
        return feedPage(approvalFeedState(), {action, date, heading, empty, filter: feedFilter}).replace('<!--briefing-->', briefingCard(state, {action})); // [p2-m4] briefing on top
    return '';
}
function modal(title, body, submit, handler) {
    if (handler && submit && /^(?:删除|清空|放弃|撤销|移出|移除|禁用|断开|恢复默认|确认恢复|开启离线模式|开启本机数据加密|关闭本机数据加密|切换到真实下单)|下单/.test(title)
        && !/<(?:input|select|textarea)\b/i.test(body)) {
        inlineConfirm(title, body, handler);
        return;
    }
    const d = $('#modal');
    d.classList.remove('task-modal'); // [ux6]
    d.onclick=null;
    d.onclose=()=>d.querySelectorAll('[data-mcp-secret],[data-coding-value],input[type="password"]').forEach(el=>el.value='');
    d.innerHTML = modalLayout(title, body, submit, icon);
    for(const close of d.querySelectorAll("[data-modal-close]"))close.onclick=()=>d.close();
    if (!d.open)
        d.showModal();
    if (handler)
        $('#modalSubmit').onclick = async () => {
            if(!d.querySelector('form').reportValidity())return;
            const button = $('#modalSubmit');
            button.disabled = true;
            try {
                const data=new FormData(d.querySelector('form'));
                d.querySelectorAll('[data-mcp-secret]').forEach(el=>el.value='');
                const result = await handler(data);
                if(result === 'modelLibrary') modal('设置',settingsMarkup());
                else d.close();
            }
            catch (e) {
                const message=d.querySelector('#modal-error');
                if(message){message.textContent=e.message;message.hidden=false;}
                toast(e.message);
            }
            finally {
                button.disabled = false;
            }
        };
}
function input(label, name, value = '', type = 'text') { return `<label>${label}<input name="${name}" type="${type}" value="${escape(value)}" required></label>`; }
function memoryKindSelect(kind) { return `<label>类型<select name="kind">${[['preference','偏好'],['fact','事实'],['profile','背景']].map(([v,t]) => `<option value="${v}" ${v === kind ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`; }
function area(label, name, value = '') { return `<label>${label}<textarea name="${name}" required>${escape(value)}</textarea></label>`; }
async function loadFiles() {
    if (!state.folders.length) {
        fileResults = [];
        render();
        return;
    }
    if (!state.folders.some(f => f.id === folderId))
        folderId = state.folders[0].id;
    const r = await invoke('listFiles', { id: folderId, query: searchTerm });
    fileResults = r.files;
    fileTruncated = r.truncated;
    render();
}
async function send() {
    if (chatLive() || (!draft.trim()&&!images.length&&!files.length))
        return;
    if (!api) {
        toast('请在桌面应用中配置模型后使用。');
        return;
    }
    if(!draft.trim()&&images.length&&!sendImages){toast('请勾选本轮发送图片，或输入文字');return;}
    const prompt = draft.trim()?draft:files.length?'请阅读附加的资料，概括要点并指出需要我注意的地方。':'请分析这些图片。'; // [ux3] an attachment alone can be sent
    const codingCommand = !files.length && !images.length && !selections.length && codingPageCommand(prompt);
    if (codingCommand) {
        draft = '';
        capabilityTab = 'agents';
        agentCategory = 'coding';
        await openPageTab('agents');
        if (codingCommand === 'workbuddy') {
            const candidates = await codingCall({action: 'detect'}).catch(() => []);
            if (!state.locked && panelTab()?.page === 'agents' && capabilityTab === 'agents' && agentCategory === 'coding')
                showCodingForm(codingPreset(candidates.find(candidate => candidate.command.endsWith('/codebuddy')) || workBuddyPreset));
        }
        return;
    }
    const mode = composerSendMode(prompt, {plan: planMode, research: researchMode});
    if (mode === 'plan' || mode === 'research') return sendPlan(prompt, mode === 'research' ? mode : '');
    if (mode === 'page') toast('这是打开页面的指令，已按普通对话处理');
    const id = chatId || crypto.randomUUID();
    const selectedSelections=[...selections];
    const selected = [...files], selectedImages=[...images], selectedConsent=sendImages;
    chatId = id;
    page = 'chat';
    pendingChats.add(id); pending = true;
    draft = '';
    files = [];selections=[];images=[];sendImages=false;
    const asIncognito = incognito && !state.chats.some(c => c.id === id); incognito = false;
    if (!state.chats.some(c => c.id === id))
        state.chats.unshift({ id, agentId, name: prompt.slice(0, 36), messages: [], ...(asIncognito ? { incognito: true } : {}) });
    state.chats.find(c => c.id === id).messages.push({ role: 'user', content: prompt,documents:selected.filter(f=>f.documentId),images:selectedImages,imagesSent:selectedConsent });
    render();
    try {
        applyState(await invoke('chat', { id, requestId:crypto.randomUUID(), prompt, officeDocId:panelTab()?.documentId, ...(asIncognito || state.chats.find(c => c.id === id)?.incognito ? { incognito: true } : {}), selections:selectedSelections.map(({documentId,revision,sha256,request})=>({documentId,revision,sha256,request})), agentId, toolsEnabled,modelChoice,modelEffort,images:selectedImages.map(i=>i.id),sendImages:selectedConsent, documents:selected.filter(f=>f.documentId).map(({documentId,revision,sha256,name,archive,entryPath})=>({documentId,revision,sha256,name,archive,entryPath})), files: selected.filter(f=>!f.documentId).map(({ folderId, relative }) => ({ folderId, relative })) }));
    }
    catch (e) {
        toast(e.message);
        applyState(await invoke('state'));
        if(chatId===id&&!draft&&!files.length&&!images.length){draft = prompt;files = selected;selections=selectedSelections;images=selectedImages;sendImages=selectedConsent;}
    }
    finally {
        const reply=state.chats.find(c=>c.id===id)?.messages?.at(-1);
        if(reply?.error&&selectedImages.length&&chatId===id&&!draft&&!files.length&&!images.length){draft=prompt;files=selected;images=selectedImages;sendImages=selectedConsent;toast('发送未成功，已恢复文字和图片，请检查错误后手动重试');}
        pendingChats.delete(id); pending = pendingChats.has(chatId);
        render();
    }
}
// [F1] 行情 page actions, overview keep-alive and live refresh
async function marketAction(actionId, id) {
    const mcall = async p => { const out = await invoke('market', p); if (out?.state) applyState(out.state); return out?.result ?? {}; };
    if (actionId === 'mkSignal') { if ($('#modal')?.open) $('#modal').close(); const [kind, code] = String(id || '').split(':'); if (kind === 'quant') return handle('quantOpen', code); return marketAction('mkStock', code); } // [F1c]
    if (actionId === 'mkTab') { marketTab = id === 'concept' ? 'concept' : 'industry'; render(); return; }
    if (actionId === 'mkStock') { if ($('#modal')?.open) $('#modal').close(); marketStockCode = String(id || ''); if (page === 'market') render(); else await navigate('market'); return; }
    if (actionId === 'mkBack') { const t = panelTab(); if (t?.kind === 'market-stock' && Date.now() - panelClickAt < 1500) { closePanelTab(t.id); return openPageTab('market'); } marketStockCode = ''; render(); return; }
    if (actionId === 'mkRefresh') { toast('正在刷新行情…'); await mcall({ action: 'overview' }); render(); toast('行情已更新'); return; }
    if (actionId === 'mkSector') { const r = await mcall({ action: 'sectorStocks', sector: id, limit: 30 }); modal(`${r.sector?.name || '板块'} · 成分股涨幅前 30`, sectorStocksView(r)); return; }
    if (actionId === 'mkAddPool') { const out = await invoke('quant', { action: 'addStock', code: id }); if (out?.state) applyState(out.state); render(); toast('已加入股票池'); return; }
    if (actionId === 'mkAlert') { modal('价格提醒', marketAlertForm(id || ''), '添加', async f => { const p = marketAlertPayload(f); const r = await mcall({ action: 'resolve', query: p.query }); const a = await mcall({ action: 'addAlert', code: r.code, name: r.name, kind: p.kind, value: p.value }); render(); toast('已添加提醒：' + a.text); }); return; }
    if (actionId === 'mkAlertRemove') { await mcall({ action: 'removeAlert', id }); render(); toast('已删除提醒'); return; }
}
function marketRefreshView() {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (page === 'market' && marketStockCode) return;
    if (page === 'home') { const n = $('#mkHome'); if (n) n.outerHTML = marketHomeCard(state, { date }); }
    else if ((page === 'market' || page === 'quant' || panelShows('market') || panelShows('quant')) && !typing) render(); // [v0.54] main 量化 is always the pool
}
// [v0.52.1] per-second prices: while trading (incl. the call auction) and the page shows quotes, ask main for live
// quotes every second and patch the numbers in place.
let liveBusy = false;
async function liveTick() {
    if (!api || liveBusy || state.locked || document.hidden || !['open', 'pre'].includes(marketSession(Date.now()))) return;
    const targets = liveTargets(document);
    if (!targets) return;
    const {codes} = targets;
    liveBusy = true;
    try {
        const out = await invoke('market', { action: 'live', codes }), r = out?.result || {};
        if (state.locked || document.hidden || !['open', 'pre'].includes(marketSession(Date.now()))) return;
        patchLive(document, r);
        const o = state.market?.overview;
        if (o && r.indices?.length) {
            o.liveAt = r.at;
            o.indices = (o.indices || []).map(x => ({ ...x, ...(r.indices.find(y => y.secid === x.secid) || {}) }));
        }
        if (state.market && r.quotes) state.market.quotes = { ...(state.market.quotes || {}), ...Object.fromEntries(Object.entries(r.quotes).map(([c, q]) => [c, { ...q, at: r.at }])) };
    } catch {} finally { liveBusy = false; }
}
setInterval(() => { liveTick(); }, 1000);
function marketPing() {
    if (!api || (page !== 'home' && page !== 'market')) return;
    const now = Date.now(), o = state.market?.overview;
    if (now - marketPingAt < 15e3) return;
    marketPingAt = now;
    if (!o || now - (o.at || 0) > 600e3) Promise.resolve().then(() => invoke('market', { action: 'overview' })).then(out => { if (out?.state) { applyState(out.state); marketRefreshView(); } }).catch(() => {});
    else Promise.resolve().then(() => invoke('market', { action: 'watch' })).catch(() => {});
}
// [F1c] buy / sell points and price alerts pop up inside the app (main also sends a system notification)
let signalSeenAt = null;
function signalPopups() {
    if (!api) return;
    const tone = a => /BUY/i.test(a || '') ? 'buy' : /SELL/i.test(a || '') ? 'sell' : '';
    const items = [
        ...(state.quant?.alerts || []).filter(a => a?.kind === 'change' && tone(a.to)).map(a => ({time: a.time, tone: tone(a.to), title: `${tone(a.to) === 'buy' ? '买点' : '卖点'}提醒 · ${a.name || a.code}`, text: [a.toText || a.to, a.score != null ? `综合分 ${a.score}` : '', a.price != null ? `现价 ${a.price}` : '', a.reason].filter(Boolean).join(' · '), code: a.code, quant: true})),
        ...(state.activity || []).filter(a => a?.title === '行情提醒') /* [v0.52.1] only the user's own price alerts pop up */.map(a => ({time: a.time, tone: /跌停/.test(a.title) || /-\d/.test((/（([+-]?[\d.]+)%）/.exec(a.detail || '') || [])[0] || '') ? 'sell' : 'buy', title: a.title, text: a.detail || '', code: a.code || (/（(\d{6})）/.exec(a.detail || '') || [])[1] || ''}))].filter(x => Number.isFinite(x.time));
    if (signalSeenAt === null) {
        let v = 0; try { v = Number(localStorage.getItem('qk.signalSeenAt')) || 0; } catch {}
        signalSeenAt = v || Math.max(0, ...items.map(x => x.time));
    }
    const fresh = items.filter(x => x.time > signalSeenAt && Date.now() - x.time < 6 * 3600e3).sort((a, b) => b.time - a.time).slice(0, 5);
    if (!fresh.length || $('#modal')?.open) return;
    signalSeenAt = Math.max(...fresh.map(x => x.time)); try { localStorage.setItem('qk.signalSeenAt', String(signalSeenAt)); } catch {}
    modal(fresh.length > 1 ? `${fresh.length} 条交易提醒` : fresh[0].title, `<div class="sig-pop">${fresh.map(x => `<div class="sig-item ${x.tone}"><span class="sig-badge">${x.tone === 'buy' ? (x.quant ? '买' : '涨') : (x.quant ? '卖' : '跌')}</span><div><b>${escape(x.title)}</b><p>${escape(x.text)}</p><small>${escape(date(x.time))}</small></div>${x.code ? `<button type="button" data-action="mkSignal" data-id="${escape((x.quant ? 'quant:' : 'market:') + x.code)}">查看详情</button>` : ''}</div>`).join('')}<p class="muted">信号来自你本机的策略与公开行情，仅供研究，不构成投资建议；QuanK 不会替你下单。</p></div>`);
}
async function navigate(next, main = false) {
    if (!main && !panelUI.MAIN_ONLY.has(next) && Date.now() - panelClickAt < 1500) return openPageTab(next); // [v0.54] links inside a panel tab open another tab
    if (page === 'feed' && next !== 'feed') invoke('feed', { action: 'seen' }).then(s => { applyState(s); render(); }).catch(() => {}); // [p2-m3] leaving the feed marks it read
    page = next;
    if (next === 'files') {
        await loadFiles();
    }
    else
        render();
}
function showCodingForm(agent = {}) {
    modal(agent.id ? '编辑 Coding 智能体' : '添加 Coding 智能体', codingForm(agent, codingProject()), '保存', async () => {
        const form = $('#modal form');
        const payload = codingPayload(form, agent);
        state.coding = await codingCall({action: 'save', ...payload});
        render();
    });
    bindCodingForm($('#modal'), agent, {
        browse: () => invoke('codingBrowse'),
        test: (draft, testId) => codingCall({action: 'test', id: agent.id, draft, testId}),
        cancelTest: testId => codingCall({action: 'cancelTest', testId}),
        projectSettings: () => handle('quantSettings').catch(error => toast(error.message)),
    });
}

async function handle(actionId, id, stockTarget) {
    if (actionId === 'approvalJump') return jumpToApproval(id);
    if (actionId === 'approvalDecision') {
        const [requestId, decision] = id.split(':');
        return answerApproval(requestId, decision);
    }
    if (actionId === 'approvalExpand') {
        if (expandedApprovals.has(id)) expandedApprovals.delete(id);
        else expandedApprovals.add(id);
        paintApprovalSummaries();
        return;
    }
    if (actionId === 'ppSelect') { setPanelActive(id); savePanel(); render(); return; } // [v0.54]
    if (actionId === 'ppClose') { closePanelTab(id); return; }
    if (actionId === 'ppCloseAll') { pageTabs = []; setPanelActive(''); savePanel(); render(); return; }
    if (actionId === 'ppWide') { pageWide = !pageWide; savePanel(); render(); return; }
    if (actionId === 'ppMain') { const t = panelTab(); if (!t) return; if (t.kind === 'market-stock') { marketStockCode = t.code; closePanelTab(t.id); return navigate('market', true); } if (['stock', 'document', 'coding-task'].includes(t.kind)) { pageWide = true; savePanel(); render(); return; } const r = panelUI.closeTab(pageTabs, t.id, pageTabId); pageTabs = r.tabs; setPanelActive(r.active); savePanel(); return navigate(t.page, true); }
    if (typeof actionId === 'string' && actionId.startsWith('mk')) return marketAction(actionId, id); // [F1]
    if(actionId==='previewImageOcrEvidence'){
      const ref=JSON.parse(id);if(ref.chatId!==chatId)throw Error('任务已切换，请重新选择证据');
      const v=await invoke('previewImageOcrEvidence',ref);if(ref.chatId!==chatId)throw Error('任务已切换，未显示图片');
      if(!v||!Number.isInteger(v.width)||!Number.isInteger(v.height)||v.width<1||v.height<1||v.width>4096||v.height>4096||v.width*v.height>16777216||typeof v.base64!=='string'||v.base64.length>5592408||!/^[A-Za-z0-9+/=]+$/.test(v.base64)||!Array.isArray(v.boxes)||!v.boxes.length||v.boxes.length>16)throw Error('图片定位数据无效');
      const boxes=v.boxes.map(b=>{if(!b||![b.x,b.y,b.w,b.h].every(Number.isInteger)||b.x<0||b.y<0||b.w<1||b.h<1||b.x+b.w>v.width||b.y+b.h>v.height)throw Error('图片定位数据无效');return `<span style="position:absolute;left:${100*b.x/v.width}%;top:${100*b.y/v.height}%;width:${100*b.w/v.width}%;height:${100*b.h/v.height}%;border:2px solid #0078CB;background:rgba(0,120,203,.18);box-sizing:border-box"></span>`}).join('');
      modal('图片 OCR 证据','<p>蓝框表示识别文字的位置。显示的是导入时规范化的本机图片；机器识别可能有误。'+(v.regionsTruncated?'部分定位未包含。':'')+'</p><div style="position:relative;width:'+v.width+'px;max-width:100%;line-height:0"><img alt="OCR 来源图片" style="width:100%;height:auto" src="data:image/png;base64,'+v.base64+'">'+boxes+'</div>');return;
    }
    if(actionId==='previewOcrSource'){
      const ref=JSON.parse(id);if(ref.chatId!==chatId)throw Error('任务已切换，请重新选择证据');
      const v=await invoke('previewOcrSource',ref);if(!v)return;if(ref.chatId!==chatId)throw Error('任务已切换，未显示原PDF页面');
      if(!Array.isArray(v.pages)||v.pages.length<1||v.pages.length>5)throw Error('页面定位数据无效');
      let totalBoxes=0;
      const pages=v.pages.map(p=>{
        if(!Number.isInteger(p.page)||p.page<1||p.page>100||!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width<1||p.height<1||p.width>1600||p.height>1600||typeof p.base64!=='string'||p.base64.length>5592408||!/^[A-Za-z0-9+/=]+$/.test(p.base64)||!Array.isArray(p.boxes)||(totalBoxes+=p.boxes.length)>16)throw Error('页面定位数据无效');
        const boxes=p.boxes.map(b=>{if(!b||![b.x,b.y,b.w,b.h].every(Number.isInteger)||b.x<0||b.y<0||b.w<1||b.h<1||b.x+b.w>p.width||b.y+b.h>p.height)throw Error('页面定位数据无效');return `<span style="position:absolute;left:${100*b.x/p.width}%;top:${100*b.y/p.height}%;width:${100*b.w/p.width}%;height:${100*b.h/p.height}%;border:2px solid #0078CB;background:rgba(0,120,203,.18);box-sizing:border-box"></span>`}).join('');
        return '<h3>第 '+p.page+' 页</h3><div style="position:relative;width:'+p.width+'px;max-width:100%;line-height:0"><img alt="原PDF页面" style="width:100%;height:auto" src="data:image/png;base64,'+p.base64+'">'+boxes+'</div>';
      }).join('');
      modal('原PDF证据','<p>蓝框表示 OCR 对应位置；识别可能有误，页面数据仅在本机显示。'+(v.regionsTruncated?'定位区域已截断，未显示全部位置。':'')+'</p>'+pages);return;
    }
    if(actionId==='openOcrSource'){const ref=JSON.parse(id);if(ref.chatId!==chatId)throw Error('任务已切换，请重新选择证据');const result=await invoke('openOcrSource',ref);if(result?.opened)toast('已核对并打开原PDF，请查看第 '+result.pages.join('、')+' 页');return;}
    if(actionId==='continueReply'){
      const c=state.chats.find(c=>c.id===chatId),failed=c?.messages?.[Number(id)];if(!failed||(failed.continuation!==true&&!(failed.continuation===undefined&&failed.error&&/长度上限/.test(failed.content))))throw Error('没有可继续的文字');
      const partial=c.messages.filter(m=>m.runId===failed.runId&&m.partial&&m.content).at(-1);if(!partial)throw Error('未保留可续写内容');
      draft='请从下方已接收内容的末尾继续，只输出尚未完成的文字，不重复前文或执行工具。以下是原回复末尾：\n'+partial.content.slice(-16000);toolsEnabled=false;render();await send();return;
    }
    if(actionId==='detachSelection'){selections.splice(Number(id),1);render();return;}
    if (actionId === 'sidebarToggle') {
        sidebarCollapsed = !sidebarCollapsed;
        render();
        return;
    }
    if (actionId === 'panelToggle') {
        sidePanel = !sidePanel;
        render();
        return;
    }
    if (actionId === 'panelClose') {
        sidePanel = false;
        render();
        return;
    }
    if (actionId === 'panelTab') {
        sideTab = id;
        sidePanel = true;
        render();
        return;
    }
    if (actionId === 'previewSelect') {
        previewId = id;
        render();
        return;
    }
    if (actionId === 'previewClose') {
        const index = previewTabs.findIndex(t => t.id === id);
        previewTabs = previewTabs.filter(t => t.id !== id);
        if (previewId === id)
            previewId = previewTabs[Math.max(0, index - 1)]?.id || previewTabs.at(-1)?.id || '';
        render();
        return;
    }
    if(actionId==='previewInteractive'){previewHtml=true;previewSource=false;previewInteractive=!previewInteractive;render();return;}
    if (actionId === 'previewHtml') {
        previewHtml = !previewHtml;
        previewSource = false;
        render();
        return;
    }
    if (actionId === 'previewMode') {
        previewSource = !previewSource;
        render();
        return;
    }
    if (actionId === 'previewZoom') {
        previewZoom = Math.max(80, Math.min(120, previewZoom + Number(id) * 10));
        render();
        return;
    }
    if(actionId==='documentExportVersion'){const [doc,revision]=id.split(':');await invoke('documentExport',{id:doc,revision:Number(revision)});return;}
    if(actionId==='revokeBrowserApprovals'||actionId==='cancelApprovals'){await invoke(actionId);toast(actionId==='cancelApprovals'?'已取消当前与排队的确认；也可按 ⌘⇧Esc':'已撤销全部浏览器任务授权');return;}
    if (actionId==='documentImport') {await invoke('documentImport');await update('state');return;}
    if(actionId==='officeCollect'){const result=await invoke('officeCollect',{id});if(result.status==='succeeded'){await update('state');toast('编辑结果已保存新版本');}return;}
    if (actionId === 'documentOfficeWindow' || actionId === 'officeWindowFocus') {
        const d = state.documents?.find(item => item.id === id);
        if (!d) throw Error('文档不存在');
        return openDocumentOffice(d);
    }
    if(state.officeNative&&id&&['documentCanvas','documentWordEditor','documentEditor'].includes(actionId)&&['docx','xlsx','pptx'].includes(state.documents?.find(d=>d.id===id)?.format)){
        const d=state.documents.find(d=>d.id===id);
        if (!state.officeWorkspace) {
            const result = await invoke('officeEdit', {id, revision: d.revision});
            if (result?.status === 'opened') { await update('state'); toast('已打开内置编辑窗口；保存并退出后点击收回编辑结果'); }
            return;
        }
        return openDocumentOffice(d);
    }
    if (actionId==='documentCanvas') {
        const editor=id?await invoke('documentRichEditor',{id}):{name:'新文档',html:'<h1>项目方案</h1><p>在这里编辑正文，选择文字后可设置格式。</p>'};
        let canvas;
        modal('Word 写作画布',input('文档名称','canvasName',editor.name)+'<p>支持标题、粗体、列表、表格；使用本机GenOffice引擎生成可编辑DOCX。此画布不是导入Word的保真排版编辑器。</p><div id="wordCanvas"></div>','保存为 Word',async f=>{
            const result=await invoke('documentOperation',{operation:'document_write',name:f.get('canvasName'),...(id?{id,expectedRevision:editor.revision}:{}),html:canvas.html()});
            if(result.status!=='succeeded')throw Error(result.error||'未保存');await update('state');toast('真实Word已保存，可在成果中心下载');
        });
        canvas=mountWordCanvas($('#wordCanvas'),editor.html);return;
    }
    if (actionId==='documentNew') {
        modal('新建文档',input('名称','documentName','新文档')+'<label>文件格式<select name="format" id="documentFormat">'+Object.keys(documentExamples).map(f=>'<option>'+f+'</option>').join('')+'</select></label>'+area('内容（Office 使用结构化 JSON；可让 AI 代写）','documentContent',documentExamples.docx),'审阅并创建',async f=>{const result=await invoke('documentOperation',{operation:'document_create',name:f.get('documentName'),format:f.get('format'),content:f.get('documentContent')});if(result.status!=='succeeded')throw Error(result.error||result.message||'未保存');await update('state');toast('文档已创建并校验，可导出');});
        $('#documentFormat').onchange=e=>{$('#modal [name="documentContent"]').value=documentExamples[e.target.value];};return;
    }
    if (actionId === 'libraryClearFilter') { libraryFilter = undefined; render(); return; }
    if (actionId === 'documentLocate') {
        libraryFilter = {ids: [id], label: '当前文件'};
        if (page === 'library') render(); else await openPageTab('library');
        return;
    }
    if (actionId === 'libraryConversation') {
        const chat = state.chats.find(c => c.id === id);
        const ids = chat?.messages.flatMap(m => messageDocuments(state, chat, m).map(d => d.id)) || [];
        libraryFilter = {ids: [...new Set(ids)], label: '本对话的产物'};
        if (page === 'library') render(); else await openPageTab('library');
        return;
    }
    if (actionId?.startsWith('document')) {
        const d=(state.documents||[]).find(x=>x.id===id);if(!d)throw Error('文档不存在');
        if(actionId==='documentConvert'){toast('正在本机转换为Word…');const result=await invoke('documentOperation',{operation:'document_convert',id,expectedRevision:d.revision});if(result.status==='denied')return;if(result.status!=='succeeded')throw Error(result.error||'转换未完成');await update('state');const doc=result.document;openPreview({id:'document:'+doc.id,name:doc.name+'.docx',text:doc.text,kind:'document',documentId:doc.id});toast('真实Word文档已保存，可直接导出');return;}
        if(['documentGenOffice','documentGenOfficeImport'].includes(actionId)){openPreview({id:'document:'+d.id,name:d.name+'.'+d.format,text:d.text,kind:'document',documentId:d.id});return;}
        if(actionId==='documentWordEditor'){
            const editor=await invoke('documentEditor',{id,mode:'runs'});let word;
            modal('Word 分段编辑 · '+d.name,'<div id="wordRuns"></div>','保存Word新版本',async()=>{
                const result=await invoke('documentSaveEditor',{id,revision:editor.revision,patch:{patches:word.patches()}});
                if(result.status!=='succeeded')throw Error(result.error||'未保存');await update('state');toast('新版本已保存，未修改部件通过校验');
            });word=mountWordRuns($('#wordRuns'),editor);return;
        }
        if(actionId==='documentEditor'){
            const editor=await invoke('documentEditor',{id});
            if(editor.kind==='cells'){
                let sheet;modal('表格计算编辑 · '+d.name,'<div id="spreadsheetEditor"></div>','保存表格新版本',async()=>{
                    const result=await invoke('documentSaveEditor',{id,revision:editor.revision,patch:sheet.patch()});
                    if(result.status!=='succeeded')throw Error(result.error||'未保存');await update('state');toast('表格与公式缓存已保存，可下载XLSX');
                });sheet=mountSpreadsheet($('#spreadsheetEditor'),editor);return;
            }
            const fields=editor.kind==='source'?area('文档原文','source',editor.source):editor.kind==='blocks'?editor.blocks.map((b,i)=>area((d.format==='pptx'?'演示文本块 ':'段落 ')+(i+1),'block'+i,b.text)).join(''):editor.cells.map((c,i)=>input('工作表 '+c.sheetIndex+' · '+c.address,'cell'+i,c.value===null?'':String(c.value))).join('');
            modal('编辑内容 · '+d.name, '<p>修改当前文档内容并保存新版本。Word/PPT 为段落内容编辑，整段修改采用首文字样式；保留其他文件部件。复杂排版暂不支持在此编辑，请在工作区预览。</p><div class="editor-fields">'+fields.replace(/ required/g,'')+'</div>','保存文档版本',async f=>{
                const patch=editor.kind==='source'?{source:f.get('source')}:editor.kind==='blocks'?{blocks:editor.blocks.flatMap((b,i)=>f.get('block'+i)!==b.text?[{...b,text:f.get('block'+i)}]:[])}:{cells:editor.cells.flatMap((c,i)=>{const v=f.get('cell'+i);if(v===(c.value===null?'':String(c.value)))return [];return [{...c,value:typeof c.value==='number'&&v.trim()!==''&&Number.isFinite(Number(v))?Number(v):typeof c.value==='boolean'&&['true','false'].includes(v)?v==='true':v}];})};
                const result=await invoke('documentSaveEditor',{id,revision:editor.revision,patch});if(result.status!=='succeeded')throw Error(result.error||'未保存');await update('state');toast('编辑已保存，可下载新版本');
            });return;
        }
        if(actionId==='documentView'){openPreview({id:'document:'+id,name:d.name+'.'+d.format,text:d.text,kind:'document',documentId:id});return;}
        if(actionId==='documentHistory'){modal('历史版本 · '+d.name,d.history.map(h=>`<div class="file-row"><div>v${h.revision} · ${date(h.time)}<small>${h.size} 字节 · ${escape(h.sha256)}</small></div>${action('导出此版本','documentExportVersion',id+':'+h.revision)}</div>`).join(''));return;}
        if(actionId==='documentExportPdf')return exportOfficeDocumentPdf(id, d.revision);
        if(['documentExport','documentSystemOpen'].includes(actionId)){await invoke('documentExport',{id,revision:d.revision,openWithSystem:actionId==='documentSystemOpen'});return;}
        if(actionId==='documentContinue'){switchChat('');page='home';toolsEnabled=true;draft=`请先调用 document_read 读取文档「${d.name}.${d.format}」（id=${id}，当前版本 ${d.revision}），再根据以下要求调用 ${d.hasRichSource?'document_write（保留editableHtml结构）':d.format==='docx'?'document_patch（使用wordEditing片段坐标，保留其他样式）':'document_edit'} 保存新版本。修改要求：`;render();$('#prompt')?.focus();return;}
        if(actionId==='documentEdit'){
            const body=d.format==='xlsx'?area('单元格修改 JSON（sheetIndex 指 sheetN.xml，从 1 开始）','cells','[{"sheetIndex":1,"address":"A1","value":"新内容"}]'):input('查找原文（Word/PPT 不跨段落）','find')+area('替换内容','replacement','新内容');
            modal('精确修改 · '+d.name,body,'审阅并保存版本',async f=>{const changes=d.format==='xlsx'?{cells:JSON.parse(f.get('cells'))}:{replacements:[{find:f.get('find'),replace:f.get('replacement')}]};const r=await invoke('documentOperation',{operation:'document_edit',id,expectedRevision:d.revision,...changes});if(r.status!=='succeeded')throw Error(r.error||r.message||'未保存');await update('state');toast('新版本已保存，原始导入文件不变');});return;
        }
        if(actionId==='documentDelete'){modal('删除文档与本地版本','<p>请先导出所需版本；原始导入文件不受影响。</p>','删除',async()=>{await invoke('documentDelete',{id});await update('state');});return;}
    }
    if (actionId === 'previewExportPdf') {
        const item=previewTabs.find(t=>t.id===previewId);const d=(state.documents||[]).find(x=>x.id===item?.documentId);
        if(!d)throw Error('文档已删除');return exportOfficeDocumentPdf(d.id, d.revision);
    }
    if (actionId === 'previewExport') {
        const item = previewTabs.find(t => t.id === previewId);
        if (item?.documentId){const d=(state.documents||[]).find(x=>x.id===item.documentId);if(!d)throw Error('文档已删除');await invoke('documentExport',{id:d.id,revision:d.revision});}
        else if(item) await invoke('exportText', { name: item.name, text: item.text });
        return;
    }
    if (actionId === 'previewContinue') {
        const item = previewTabs.find(t => t.id === previewId);
        if (item) {
            if(item.documentId){const d=(state.documents||[]).find(x=>x.id===item.documentId);switchChat('');page='home';toolsEnabled=true;draft=`请先 document_read 文档 id=${item.documentId}，再 ${d?.hasRichSource?'document_write（基于editableHtml保留其他结构）':d?.format==='docx'?'document_patch（使用wordEditing片段坐标）':'document_edit'}。修改要求：`;render();return;}
            const addition = `请继续修改「${item.name}」。修改要求：\n\n参考原文${item.text.length > 14000 ? '（前 14000 字符）' : ''}：\n${item.text.slice(0, 14000)}`;
            if (draft.length + addition.length > 20000)
                throw new Error('当前草稿过长，请先整理草稿再继续修改');
            draft += (draft ? '\n\n' : '') + addition;
            page = chatId ? 'chat' : 'home';
            render();
            $('#prompt')?.focus();
        }
        return;
    }
    if (actionId === 'previewMessage') {
        const c = state.chats.find(c => c.id === chatId), m = c?.messages[Number(id)];
        const docs=messageDocuments(state,c,m||{});
        if(docs.length){for(const d of docs)openPreview({id:'document:'+d.id,name:d.name+'.'+d.format,text:d.text,kind:'document',documentId:d.id});return;}
        if (m)
            openPreview({ id: 'message:' + chatId + ':' + id, name: c.name, text: m.content, kind: 'message' });
        return;
    }
    if (actionId === 'attachedPreview') {
        const f = files[Number(id)];
        if(f?.documentId){openPreview({id:'document:'+f.documentId,name:f.name,text:f.text,kind:'document',documentId:f.documentId});return;}
        if (f)
            openPreview({ id: 'file:' + f.folderId + ':' + f.relative, name: f.name, text: f.text, kind: 'file' });
        return;
    }
    if (actionId === 'contextPicker') {
        await updatePicker('@');
        $('#prompt')?.focus();
        return;
    }
    if (actionId === 'pickerChoose') {
        await choosePicker(Number(id));
        return;
    }
    if (actionId === 'send')
        return send();
    if (actionId === 'browserOpen' || actionId === 'externalBrowser') {
        const result = await invoke('openBrowser', { url: toolDraft.url, external: actionId === 'externalBrowser' });
        await update('state');
        if (result.error)
            throw new Error(result.error);
        toast('浏览器已打开');
        return;
    }
    if (actionId === 'browserInspect') {
        const result = await invoke('inspectBrowser', { id });
        if (result.error)
            throw new Error(result.error);
        if (result.status === 'denied') {
            toast('已取消检查');
            return;
        }
        browserTargets.clear();
        for (const target of result.elements)
            browserTargets.set(result.snapshotId + ':' + target.ref, { id: result.id, snapshotId: result.snapshotId, ref: target.ref, target });
        modal('可操作页面元素', `<p>${escape(result.url)} · 操作后需要重新检查</p>${result.elements.map(t => `<div class="file-row"><div>${escape(t.label)}<small>${escape(t.tag)} · ${escape(t.ref)}</small></div>${action(t.kind === 'input' ? '填写' : '点击', t.kind === 'input' ? 'browserFill' : 'browserClick', result.snapshotId + ':' + t.ref)}</div>`).join('') || '<p>未找到可操作元素；跨域 iframe 和密码等字段不会提供。</p>'}${result.truncated ? '<p>列表已截断：最多 120 个元素。</p>' : ''}`);
        return;
    }
    if (actionId === 'browserClick' || actionId === 'browserFill') {
        const target = browserTargets.get(id);
        if (!target)
            throw new Error('元素快照已失效，请重新检查');
        const payload = { id: target.id, snapshotId: target.snapshotId, ref: target.ref, operation: actionId === 'browserFill' ? 'browser_fill' : 'browser_click' };
        const run = async (text) => {
            const result = await invoke('browserAction', { ...payload, ...(text === undefined ? {} : { text }) });
            if (result.error)
                throw new Error(result.error);
            browserTargets.clear();
            await update('state');
            toast('浏览器操作：' + result.status + '；继续前请重新检查页面');
            return result;
        };
        if (actionId === 'browserFill') {
            modal('填写：' + target.target.label, '<p>输入将替换该字段内容；不会自动提交。原生窗口会再次展示具体目标和文本。</p>' + area('输入文本', 'browserText'), '审阅并填写', async (f) => run(String(f.get('browserText') || '')));
        }
        else {
            await run();
            $('#modal').close();
        }
        return;
    }
    if (actionId === 'browserRead') {
        const result = await invoke('readBrowser', { id });
        await update('state');
        if (result.error)
            throw new Error(result.error);
        if (result.status === 'denied') {
            toast('已取消读取');
            return;
        }
        modal('网页正文', `<p>${escape(result.url)}</p><pre>${escape(result.text)}</pre>`);
        return;
    }
    if (actionId === 'commandRun') {
        if (activeCommand) return;
        let args;
        try { args = JSON.parse(toolDraft.args); }
        catch { throw new Error('参数需要填写 JSON 数组，例如 ["--version"]'); }
        if (!toolDraft.folderId) throw new Error('请先选择授权工作目录');
        const request = { ...toolDraft, args, id: crypto.randomUUID() };
        activeCommand = request.id;
        try {
            const job = await invoke('enqueueCommand', request);
            applyState(await invoke('state'));
            if (!state.locked && api.codingTasks) await loadCodingTasks();
            toast('命令已受理：' + (statusNames[job.status] || job.status));
        } finally { activeCommand = ''; render(); }
        return;
    }
    if (actionId === 'commandCancelJob') {
        await invoke('cancelCommand', { id });
        await update('state');
        toast('已请求停止命令');
        return;
    }
    if (actionId === 'commandRetryJob') {
        const job = state.commandJobs?.find(j => j.id === id);
        if (!job) throw new Error('命令记录不存在');
        await invoke('retryCommand', { retryOf: id, revision: job.revision, id: crypto.randomUUID() });
        await update('state');
        toast('已创建新执行，仍需系统确认');
        return;
    }
    if (actionId === 'commandForgetJob') {
        await invoke('forgetCommand', { id });
        await update('state');
        return;
    }
    if (actionId === 'stop') {
        await invoke('cancelChat', { id: chatId });
        return;
    }
    if (actionId === 'new') {
        switchChat('');
        draft = '';
        files = [];selections=[];images=[];sendImages=false;
        page = 'home';
        render();
        return;
    }
    if (actionId === 'openChat') {
        switchChat(id);
        page = 'chat';
        markSeen(id);
        render();
        return;
    }
    if(actionId==='officeWarmToggle'||actionId==='officeEngineRetry'){
        await update('officeEngine',actionId==='officeWarmToggle' ? {enabled:state.settings.officeStartupWarm===false} : {retry:true});
        return;
    }
    if(actionId==='settings'){modal('设置',settingsMarkup());return;}
    if(actionId==='modelEdit'){const p=(state.modelProfiles||[]).find(p=>p.id===id)||{};modal(p.id?'编辑模型':'添加模型',modelForm(p,state.settings.secureStorage,escape),'保存模型',async f=>{const payload={...Object.fromEntries(f),id:p.id,revision:p.revision};delete payload.provider;if(!String(payload.name||'').trim())payload.name=payload.model||'模型';for(const k of ['supportsOff','tools','vision','enabled','persistKey','clearKey'])payload[k]=f.has(k);await update('modelProfile',payload);toast('模型已保存');return 'modelLibrary';});bindModelForm($('#modal'),{test:x=>invoke('modelTest',x)});return;}
    if(actionId==='modelRemove'){const p=(state.modelProfiles||[]).find(p=>p.id===id);if(p)modal('删除模型配置','<p>移除此配置及保存的密钥；排队或执行中的请求不会自动换模型。</p>','删除',async()=>{await update('modelProfile',{id:p.id,revision:p.revision,remove:true});});return;}
    if (actionId === 'legacySettings') {
        modal('连接你的模型', `<p>支持 Chat Completions 兼容 API。远程服务使用 HTTPS，本机 Ollama 可用 http://127.0.0.1:11434/v1。内容只会发送到你填写的地址。</p>${input('工作空间名称', 'name', state.settings.name)}${input('Base URL', 'baseUrl', state.settings.baseUrl || 'https://api.deepseek.com')}${input('模型 ID', 'model', state.settings.model === '尚未配置' ? 'deepseek-chat' : state.settings.model)}${input('每次任务模型调用轮数（1–96）', 'maxSteps', legacyRoundLimit(state.settings,state.agents,agentId).value, 'number')}<label>本机向量嵌入模型（留空使用关键词检索）<input name="localEmbeddingModel" value="${escape(state.settings.localEmbeddingModel || '')}"></label><p>普通模型名称使用本机 Ollama 服务。固定模型名 wb-bge-small-zh-v1.5 使用应用内本机推理；当前版本尚未附带模型和运行依赖，启用会提示缺失。索引为敏感派生数据；查询时会请求确认。</p><label class="check"><input type="checkbox" name="officePreviewPool" ${state.settings.officePreviewPool !== false ? 'checked' : ''}>复用 Office 预览进程，加快文档预览（重启后生效；出错时自动改用单次转换）</label><p>${legacyRoundLimit(state.settings,state.agents,agentId).inherited ? '当前工具任务沿用所选智能体的轮数；修改并保存后，原模型按此设置执行。' : '当前原模型使用已保存的轮数设置。'}增加轮数可能增加用量；正在执行的任务不会改变。</p><label>API Key ${state.settings.hasKey ? '（留空保留当前密钥）' : ''}<input name="apiKey" type="password" autocomplete="off"></label><label class="check"><input type="checkbox" name="persistKey" ${state.settings.secureStorage ? '' : 'disabled'}>使用系统钥匙串加密保存新密钥</label><label class="check"><input type="checkbox" name="clearKey">清除当前保存的密钥</label><p>${state.settings.secureStorage ? '未勾选时，新密钥只保留至应用退出。' : '系统加密存储不可用，新密钥只在本次运行中保留。'}保存配置不会发送测试请求；可通过一次真实对话验证连接。</p>`, '保存配置', async (f) => { await update('settings', { ...Object.fromEntries(f), persistKey: f.has('persistKey'), clearKey: f.has('clearKey'), officePreviewPool: f.has('officePreviewPool') }); toast('模型配置已保存'); });
        return;
    }
    if (actionId === 'folder') {
        state = await invoke('pickFolder');
        folderId = state.folders.at(-1)?.id || '';
        page = 'files';
        await loadFiles();
        return;
    }
    if (actionId === 'revoke') {
        if (!id)
            return;
        modal('撤销文件夹授权', '<p>今后不能再读取该文件夹。已发送的对话和模型服务商持有的内容不会自动删除。</p>', '撤销授权', async () => { await update('removeFolder', { id }); files = files.filter(f => f.folderId !== id); folderId = ''; await loadFiles(); });
        return;
    }
    if (actionId === 'fileSearch') {
        searchTerm = $('#fileQuery').value;
        return loadFiles();
    }
    if(actionId==='codeProjects'){
        applyState(await invoke('state'));
        modal('代码项目与运行环境',codeProjectsView({projects:state.codeProjects,jobs:state.commandJobs,escape}));return;
    }
    if(actionId==='projectImport'){const p=await invoke('projectImport');if(p)return handle('codeProjects');return;}
    if(actionId==='projectLogs'){$('#modal').close();await navigate('tools');return;}
    if(actionId==='projectRun'||actionId==='projectRunService'){const split=id.indexOf(':');await invoke('projectRun',{id:id.slice(0,split),stepId:id.slice(split+1),service:actionId==='projectRunService'});applyState(await invoke('state'));$('#modal').close();await navigate('tools');toast('已加入持久命令队列，请核对系统确认中的实际命令');return;}
    if(actionId==='attachImage'){
        if(images.length>=8)throw Error('每次最多8张图片');
        const scope=chatId,presentPage=page,row=await invoke('imageImport');
        applyState(await invoke('state'));
        if(row&&scope===chatId&&presentPage===page){images.push(row);sendImages=false;}else if(row)toast('图片已保存在本机图片库，可按需附加');render();return;
    }
    if(actionId==='detachImage'){images.splice(Number(id),1);sendImages=false;render();return;}
    if(actionId==='imageLibrary'){
        applyState(await invoke('state'));
        modal('本机图片', '<p>选择附加图片后，默认仅本机保存；发送像素需勾选输入框中的选项。历史消息引用的图片不能在此移除。</p>'+(state.imageAttachments||[]).map(i=>`<div class="file-row"><div>${escape(i.name)}<small>${i.width} × ${i.height}</small></div><button type="button" data-action="imageAttachStored" data-id="${escape(i.id)}">附加</button><button type="button" data-action="imageRemove" data-id="${escape(i.id)}">移除未使用图片</button></div>`).join(''));return;
    }
    if(actionId==='imageAttachStored'){if(images.length>=8)throw Error('每次最多8张图片');const i=(state.imageAttachments||[]).find(i=>i.id===id);if(i&&!images.some(i=>i.id===id))images.push(i);sendImages=false;$('#modal').close();render();return;}
    if(actionId==='imageRemove'){await update('imageRemove',{id});images=images.filter(i=>i.id!==id);$('#modal').close();return;}
    if(actionId==='reattachDocument'){
        if(files.length>=32)throw Error('每次最多32份附件');
        const d=(state.documents||[]).find(d=>d.id===id);
        if(!d)throw Error('附件已移除，请重新上传');
        if(!files.some(f=>f.documentId===id))files.push({documentId:d.id,revision:d.revision,sha256:d.sha256,name:d.name,text:d.text});
        render();toast('已重新附加当前保存版本，请核对后发送');return;
    }
    if (actionId === 'attachPdfRange') {
        if(files.length>=32)throw Error('每次最多32份附件');
        const scope=chatId,presentPage=page;
        modal('识别 PDF 指定页','<p>选择第1至100页中的连续最多5页。识别文字仅在发送后交给当前模型；需要本机OCR及PDF组件。</p><label>起始页<input type="number" name="startPage" min="1" max="100" step="1" value="1" required></label><label>结束页<input type="number" name="endPage" min="1" max="100" step="1" value="1" required></label>','选择 PDF',async f=>{
            const startPage=Number(f.get('startPage')),endPage=Number(f.get('endPage'));
            if(!Number.isInteger(startPage)||!Number.isInteger(endPage)||startPage<1||endPage>100||endPage<startPage||endPage-startPage>=5)throw Error('请选择1至100页内连续最多5页');
            // The modal closes immediately so the independent stop control is reachable.
            void (async()=>{try{
                const row=await invoke('chatAttachmentImport',{pdfRange:{startPage,endPage}});applyState(await invoke('state'));
                if(row&&scope===chatId&&presentPage===page){if(files.length+row.attachments.length>32)throw Error('附件已满，识别成果已保存到成果中心');files.push(...row.attachments);toast(row.notice||'识别成果已附加');}
                else if(row)toast('识别成果已保存到成果中心；未自动附加');
                render();
            }catch(e){toast(e.message);}})();
        });return;
    }
    if (actionId === 'cancelPdfImport') {
        await invoke('cancelPdfImport',{id});
        applyState(await invoke('state'));render();return;
    }
    if (actionId === 'attach') {
        if(files.length>=32)throw Error('每次最多32份附件');
        const scope=chatId,presentPage=page;
        const row=await invoke('chatAttachmentImport');
        applyState(await invoke('state'));
        if(row&&scope===chatId&&presentPage===page){const added=row.attachments||[row];if(row.project)toast('已识别代码项目，可在＋菜单的代码项目与运行环境中准备和启动');if(files.length+added.length>32)throw Error('合计超过32份，导入副本已保存到成果中心，请分批附加');files.push(...added);if(row.notice)modal('PDF识别范围','<p>'+escape(row.notice)+'</p>');else toast('已附加'+added.length+'份，点击发送后正文交给当前模型');if(row.skipped?.length)modal('ZIP解压报告','<p>已附加'+added.length+'份；以下文件未作为正文理解：</p>'+row.skipped.map(x=>'<p>'+escape(x.path)+'：'+escape(x.reason)+'</p>').join(''));}
        else if(row)toast('文档已保存到成果中心；对话已切换，未自动附加');
        render();$('#prompt')?.focus();return;
    }
    if (actionId === 'detach') {
        files.splice(Number(id), 1);
        render();
        return;
    }
    if (actionId === 'previewFile') {
        const f = await invoke('previewFile', fileResults[Number(id)]);
        if(f.truncated)toast('文本预览已截断；HTML文件使用完整预览');
        openPreview({ id: 'file:' + f.folderId + ':' + f.relative, name: f.name, text: f.text, kind: 'file' });
        return;
    }
    if (actionId === 'attachFile') {
        if (files.length >= 32)
            throw new Error('每次最多附加 32 个文件');
        const f = await invoke('readFile', fileResults[Number(id)]);
        if (!files.some(x => x.folderId === f.folderId && x.relative === f.relative))
            files.push(f);
        page = chatId ? 'chat' : 'home';
        render();
        $('#prompt')?.focus();
        return;
    }
    if (actionId === 'suggest') {
        const FIN_SUGGEST = { // [fin1] finance starters, each routed to its finance agent when present
            stock: ['fin-research', '请帮我做一份个股研究：商业模式、近 3 年财务趋势、估值区间与历史分位、主要风险，关键数字注明来源。\n股票代码或名称：'],
            earnings: ['fin-research', '请点评最新一期财报：收入与利润拆分、毛利率与费用率变化、现金流质量、与预期的差异，并列出跟踪要点。\n公司与报告期：'],
            brief: ['fin-quant', '请生成今天的盘前晨报：自选股信号与最近变化、持仓与浮动盈亏、今天需要关注的公告和事项。'],
            portfolio: ['fin-risk', '请复盘我的持仓组合：收益与回撤、集中度与行业暴露、主要风险点和调仓建议（只给建议，不下单）。\n补充说明：'],
            memo: ['fin-research', '请起草一份投资备忘录：投资逻辑、关键假设、估值与目标区间、催化剂、主要风险与退出条件。\n标的与背景：'] };
        if (FIN_SUGGEST[id]) { const [aid, text] = FIN_SUGGEST[id]; agentId = state.agents.some(a => a.id === aid) ? aid : 'assistant'; draft = text; render(); $('#prompt')?.focus(); return; }
        agentId = id === 'writer' ? 'writer' : id === 'research' ? 'research' : 'assistant';
        draft = ({ research: '请帮我研究以下问题。先明确目标、证据来源和信息缺口，再给出有依据的结论。\n研究问题：', writer: '请根据以下背景起草一份项目方案，包含目标、实施步骤、交付物与验收标准。\n项目背景：', summary: '请根据我附加的资料，提取关键事实、决策和下一步行动，标出信息缺口。\n整理要求：', project: '请检查我授权的项目。先列出检查步骤，获得工具批准后运行必要命令，依据实际结果报告问题与改进建议。\n项目与检查目标：' })[id];
        render();
        $('#prompt')?.focus();
        return;
    }
    if (actionId === 'codingTaskStart') {
        const agents = state.coding?.agents || [];
        const options = agents.map(agent => `<option value="${escape(agent.id)}">${escape(agent.name)}</option>`).join('');
        modal('发起量化代码迭代', area('迭代需求', 'request') + (options ? `<label>代理<select name="agent"><option value="">按回退设置选择</option>${options}</select></label>` : ''), '开始', async data => {
            const task = await codingTaskCall('start', { request: data.get('request'), agentId: data.get('agent') || undefined });
            if (task) await handle('codingTaskOpen', task.id);
        });
        return;
    }
    if (['officeOpen','officeLocate','officeRollback','officeEditWindow'].includes(actionId)) {
        const [token, index] = id.split(':');
        const result = await invoke('officeResultAction', {chatId, token, index:index === undefined ? undefined : Number(index), action:actionId === 'officeEditWindow' ? 'officeLocate' : actionId});
        if (actionId === 'officeEditWindow') {
            if (!result?.documentId) throw Error('成果中心文档已移除');
            await update('state');
            await openDocumentOffice(state.documents.find(d => d.id === result.documentId), result.target);
            return;
        }
        if (result?.documentId) {
            await update('state');
            if (!openDocumentPreview(result.documentId)) throw Error('成果中心文档已移除');
            if (result.target) document.querySelector('#pagePanel .file-preview-main')?.dispatchEvent(new CustomEvent('office-locate', {detail:result.target}));
        } else if (result?.status === 'version_history') {
            await update('state');
            if (openDocumentPreview(result.docId)) await handle('documentHistory', result.docId);
        } else if (result?.status === 'succeeded') {
            await update('state');
            toast('已撤回本次修改');
        }
        return;
    }
    if (actionId === 'codingSetupOpen') return openCodingPage({page: 'agents', coding: {}});
    if (actionId === 'codingResultOpen') return openCodingPage({page:'tasks', coding:{task:id}});
    if (actionId === 'codingTaskOpen') {
        const task = await loadCodingTask(id);
        if (!state.locked) {
            openPanelTab(panelUI.codingTaskTab(id, task.title));
            render();
        }
        return;
    }
    if (actionId === 'codingTaskPermission') {
        const [taskId, requestId, decision] = id.split(':');
        const task = await codingTaskCall('permission', { id: taskId, requestId, decision });
        codingTaskDetails.set(taskId, task);
        refreshCodingTasks(task);
        render();
        return;
    }
    if (actionId === 'codingTaskFollowup') {
        modal('继续修改', area('追加需求', 'request'), '继续', async data => {
            codingTaskDetails.set(id, await codingTaskCall('followup', { id, request: data.get('request') }));
            renderPanel();
        });
        return;
    }
    if (actionId === 'codingTaskStop') {
        codingTaskDetails.set(id, await codingTaskCall('stop', { id }));
        renderPanel();
        return;
    }
    if (actionId === 'codingTaskReport') return codingTaskCall('openReport', { id });
    if (actionId === 'codingTaskMerge' || actionId === 'codingTaskDiscard') {
        const merge = actionId === 'codingTaskMerge';
        try { await codingTaskCall(merge ? 'merge' : 'discard', { id }); }
        finally {
            await loadCodingTasks();
            await loadCodingTask(id);
            render();
        }
        return;
    }
    if (actionId === 'codingDetect') { codingCandidates = await codingCall({action: 'detect'}); render(); return; }
    if (actionId === 'codingNew') return showCodingForm();
    if (actionId === 'codingPrefill') {
        const candidate = codingCandidates?.[Number(id)];
        if (candidate) showCodingForm(codingPreset(candidate));
        return;
    }
    if (actionId === 'codingEdit') return showCodingForm((state.coding?.agents || []).find(agent => agent.id === id));
    if (actionId === 'codingDefault') { state.coding = await codingCall({action: 'setDefault', id}); render(); return; }
    if (actionId === 'codingRemove') {
        const agent = state.coding?.agents.find(agent => agent.id === id);
        if (agent) modal('删除 Coding 智能体', `<p>删除「${escape(agent.name)}」及其连接配置？</p>`, '删除', async () => {
            state.coding = await codingCall({action: 'remove', id}); render();
        });
        return;
    }
    if (actionId === 'codingTestCancel' && busyCoding.has(id)) return codingCall({action: 'cancelTest', testId: busyCoding.get(id)});
    if (actionId === 'codingTest' && !busyCoding.has(id)) {
        const testId = crypto.randomUUID();
        busyCoding.set(id, testId); render();
        try {
            const result = await codingCall({action: 'test', id, testId});
            if (!state.locked) {
                codingTestResults.set(id, result);
                state.coding = await codingCall({action: 'list'});
            }
        } finally { busyCoding.delete(id); render(); }
        return;
    }
    if (actionId === 'agentCategory' && ['all', 'dialogue', 'coding'].includes(id)) { agentCategory = id; render(); return; }
    if(actionId==='capabilityTab'){capabilityTab=id;render();return;}
    if(actionId==='addPresetSkill'){const out=await invoke('skillPreset',{id});applyState(out.state);render();toast('技能已添加，可在智能体中绑定');return;}
    if(actionId==='uploadSkill'){const out=await invoke('skillImport');applyState(out.state);render();if(out.imported)toast('技能已上传，可在智能体中绑定');return;}
    if(actionId==='inspectSkill'){const out=await invoke('skillRead',{id});modal(out.name,`<p>${escape(out.description)}</p><pre class="skill-source">${escape(out.text)}</pre><h3>资源文件</h3>${out.files.map(f=>`<p>${escape(f.path)} · ${f.bytes} 字节</p>`).join('')}`);return;}
    if(actionId==='toggleSkill'||actionId==='removeSkill'){const item=(state.skillPackages||[]).find(s=>s.id===id);applyState(await invoke('skillUpdate',{id,...(actionId==='removeSkill'?{remove:true}:{enabled:!item.enabled})}));render();return;}
    if(actionId==='clearKnowledgeIndex'){await invoke('clearKnowledgeIndex');toast('已清除派生检索索引，文档与对话保留；后续获批查询会重建');return;}
    if(actionId==='newMcp'||actionId==='editMcp'||actionId==='newPresetMcp'){ // [mcp2] remote (none / Bearer / browser sign-in) or a local stdio program
        const preset=actionId==='newPresetMcp'?(state.capabilityPresets?.mcp||[]).find(p=>p.id===id):null;if(actionId==='newPresetMcp'&&!preset)throw Error('预置连接器不存在');
        const same=c=>preset?(c.presetId===preset.id||(!!preset.url&&c.url.replace(/\/$/,'')===preset.url.replace(/\/$/,''))):c.id===id;
        const found=(state.mcpConnections||[]).find(same), pre=found?.presetId?(state.capabilityPresets?.mcp||[]).find(p=>p.id===found.presetId):preset;
        const c=found?{...found,envHelp:pre?.env,setup:pre?.setup}:(preset?{name:preset.title,url:preset.url||'',auth:preset.auth||'none',description:preset.description,transport:preset.transport==='stdio'?'stdio':'http',command:preset.command,args:preset.args,envNames:(preset.env||[]).map(e=>e.name),envHelp:preset.env,setup:preset.setup,presetId:preset.id}:{});
        modal(c.id?'配置 MCP 连接':'添加 MCP 连接',mcpForm(c),'保存',async f=>{const out=await invoke('mcpConnection',mcpPayload(f,c));applyState(out.state);render();const row=(state.mcpConnections||[]).find(x=>x.id===out.saved?.id);toast(row?.auth==='oauth'&&!row.signedIn?'已保存，点卡片上的「登录」完成浏览器登录':'已保存，可以点「测试连接」');});
        bindMcpForm($('#modal'));return;}
    if(actionId==='mcpSignIn'){toast('正在打开浏览器登录页，完成后回到 QuanK…');try{const out=await invoke('mcpSignIn',{id});applyState(out.state);render();toast('登录成功，可以点「测试连接」');}catch(e){applyState(await invoke('state'));render();throw e;}return;}
    if(actionId==='mcpSignOut'){const out=await invoke('mcpSignOut',{id});applyState(out.state);render();toast('已退出登录');return;}
    if(actionId==='removeMcp'){const out=await invoke('mcpConnection',{id,remove:true});applyState(out.state);render();return;}
    if(actionId==='cancelMcpTest'){await invoke('mcpCancelTest',{id});return;}
    if(actionId==='testMcp'){busyMcp.add(id);render();try{const out=await invoke('mcpTest',{id});applyState(out.state);toast('已发现 '+out.result.count+' 项工具');}finally{busyMcp.delete(id);applyState(await invoke('state'));render();}return;}
    if (actionId === 'newAgent' || actionId === 'editAgent') {
        const a = state.agents.find(a => a.id === id) || {};
        modal(a.id ? '编辑智能体' : '创建智能体', input('名称', 'name', a.name) + input('简介', 'description', a.description) + area('角色指令', 'prompt', a.prompt) + agentEditor(a,state.documents||[],state), '保存', async (f) => {
            const spec = f.get('codingSpec');
            if (spec && f.getAll('codingSubagent').length) await codingTaskCall('specSave', {text: spec});
            return update('agent', {name:f.get('name'),description:f.get('description'),prompt:f.get('prompt'),...readAgentEditor(f,$('#modal')),id:a.id});
        });
        bindAgentEditor($('#modal'),{readSpec:()=>codingTaskCall('specGet'),resetSpec:()=>codingTaskCall('specDefault'),uploadSkill:async()=>{const out=await invoke('skillImport');applyState(out.state);return out;},saveMcp:async p=>{const out=await invoke('mcpConnection',p);applyState(out.state);return out;},onError:toast});
        return;
    }
    if (actionId === 'useAgent') {
        switchChat('');
        agentId = id;
        page = 'home';
        draft = '';
        files = [];selections=[];images=[];sendImages=false;
        render();
        return;
    }
    if (actionId === 'newMemory') {
        modal('添加记忆', '<p>手动添加的记忆每次对话都会参考，可随时编辑或删除。</p>' + memoryKindSelect('preference') + area('工作背景或偏好', 'text'), '保存', async (f) => update('memory', { text: f.get('text'), kind: f.get('kind') }));
        return;
    }
    // [p1-m1] memory management
    if (actionId === 'editMemory') {
        const m = (state.memories || []).find(m => m.id === id);
        if (!m) return;
        modal('编辑记忆', '<p>编辑后视为手动添加的记忆，每次对话都会参考。</p>' + memoryKindSelect(m.kind || 'preference') + area('内容', 'text', m.text), '保存', async (f) => update('memory', { id, text: f.get('text'), kind: f.get('kind') }));
        return;
    }
    if (actionId === 'memoryToggle') {
        const cur = state.settings?.memory || {};
        const next = id === 'enabled' ? { enabled: cur.enabled === false } : { autoLearn: cur.autoLearn === false, ...(cur.enabled === false ? { enabled: true } : {}) };
        await update('memory', { settings: next });
        return;
    }
    if (actionId === 'memoryFilter') { memoryFilter = id; render(); return; }
    // [p1-m2] conversation management
    if (actionId === 'recapDismiss') { recap = null; render(); return; }
    if (actionId === 'recapJump') { recap = null; render(); const s = document.querySelector('.messages-scroll'); if (s) s.scrollTop = s.scrollHeight; return; }
    // [p1-m5] plan mode
    if (actionId === 'toggleResearch') { researchMode = !researchMode; planMode = false; render(); toast(researchMode ? '深度研究：发送研究课题后先生成研究大纲，确认后开始检索' : '已关闭深度研究'); return; }
    if (actionId === 'navigateLibrary') return navigate('library');
    if (actionId === 'togglePlan') { planMode = !planMode; researchMode = false; render(); toast(planMode ? '计划模式：发送后先生成步骤，确认后再执行' : '已关闭计划模式'); return; }
    if (['planAddStep', 'planRemoveStep'].includes(actionId)) {
        const c = state.chats.find(c => c.id === chatId); if (c?.plan?.status !== 'draft') return;
        const steps = readPlanSteps(document);
        const research = c.plan.kind === 'research', limit = research ? 11 : 12;
        if (actionId === 'planAddStep') { if (steps.length >= limit) throw Error(`最多 ${limit} ${research ? '个子问题' : '步'}`); steps.push({ title: research ? '新的子问题' : '新步骤', detail: '' }); }
        else { if (steps.length <= 1) return; steps.splice(Number(id), 1); }
        if (research) steps.push(c.plan.steps.at(-1));
        c.plan.steps = steps.map(s => ({ ...s, status: 'pending' })); render(); return;
    }
    if (actionId === 'planRun') { const research = state.chats.find(c => c.id === chatId)?.plan?.kind === 'research'; applyState(await invoke('planRun', { id: chatId, steps: readPlanSteps(document) })); render(); toast(research ? '开始深度研究，完成后报告会保存到成果中心' : '开始按计划执行'); return; }
    if (actionId === 'planResume') { applyState(await invoke('planRun', { id: chatId, resume: true })); render(); toast('从未完成的步骤继续执行'); return; } // [p2-ux]
    if (actionId === 'planDiscard') { applyState(await invoke('planDiscard', { id: chatId })); render(); return; }
    if (actionId === 'planCancel') { applyState(await invoke('planCancel', { id: chatId })); render(); toast('已停止计划，当前步骤结束后不再继续'); return; }
    if (actionId === 'toggleIncognito') { incognito = !incognito; render(); return; }
    if (actionId === 'chatMenu') {
        const c = state.chats.find(c => c.id === id); if (!c) return;
        const b = (label, act, kind = 'secondary') => `<button type="button" class="${kind}" data-action="${act}" data-id="${escape(id)}">${label}</button>`;
        modal('对话操作', `<p>${escape(c.name)}</p><div class="chat-menu">${b('重命名', 'chatRename')}${c.incognito ? '' : b(c.pinned ? '取消置顶' : '置顶', 'chatPin') + b('移到文件夹', 'chatMove') + b(c.archived ? '取消归档' : '归档', 'chatArchive')}${b('导出为 Markdown', 'chatExport')}${b('删除', 'deleteChat', 'danger')}</div>`);
        return;
    }
    if (['chatRename', 'chatPin', 'chatArchive', 'chatMove', 'chatExport'].includes(actionId)) {
        const c = state.chats.find(c => c.id === id); if (!c) return;
        if ($('#modal')?.open) $('#modal').close();
        if (actionId === 'chatRename') { modal('重命名对话', input('名称', 'name', c.name), '保存', async f => update('chatMeta', { id, name: f.get('name') })); return; }
        if (actionId === 'chatPin') { await update('chatMeta', { id, pinned: !c.pinned }); toast(c.pinned ? '已取消置顶' : '已置顶'); return; }
        if (actionId === 'chatArchive') { await update('chatMeta', { id, archived: !c.archived }); toast(c.archived ? '已取消归档' : '已归档'); return; }
        if (actionId === 'chatExport') { const agent = state.agents.find(a => a.id === c.agentId); await invoke('exportText', { name: c.name + '.md', text: chatMarkdown(c, { agentName: agent?.name || 'QuanK', date }) }); return; }
        const folders = state.chatFolders || [];
        modal('移到文件夹', `<label>文件夹<select name="folder"><option value="">（不放入文件夹）</option>${folders.map(f => `<option value="${escape(f.id)}" ${c.folderId === f.id ? 'selected' : ''}>${escape(f.name)}</option>`).join('')}<option value="__new">＋ 新建文件夹…</option></select></label><label>新文件夹名称（选择“新建”时填写）<input name="name" placeholder="例如：通威项目"></label>`, '移动', async f => {
            let folderId = f.get('folder') || null;
            if (folderId === '__new') { const name = String(f.get('name') || '').trim(); if (!name) throw Error('请输入新文件夹名称'); const s = await update('chatFolder', { name }); folderId = (s.chatFolders || []).find(x => x.name === name)?.id; }
            await update('chatMeta', { id, folderId });
        });
        return;
    }
    if (actionId === 'newFolder') { modal('新建文件夹', input('名称', 'name'), '创建', async f => update('chatFolder', { name: f.get('name') })); return; }
    if (actionId === 'renameFolder') { const f0 = (state.chatFolders || []).find(f => f.id === id); if (!f0) return; modal('重命名文件夹', input('名称', 'name', f0.name), '保存', async f => update('chatFolder', { id, name: f.get('name') })); return; }
    if (actionId === 'deleteFolder') { modal('删除文件夹', '<p>文件夹里的对话会回到“最近”，不会被删除。</p>', '删除', async () => update('chatFolder', { id, remove: true })); return; }
    if (actionId === 'openMemoryChat') { switchChat(id); page = 'chat'; render(); return; }
    if (actionId === 'clearMemories') {
        modal('清除记忆', '<p>选择要清除的范围。清除后无法恢复。</p><label>范围<select name="scope"><option value="auto">只清除自动学习的记忆</option><option value="all">清除全部记忆</option></select></label>', '清除', async (f) => update('memory', { clear: f.get('scope') }));
        return;
    }
    if (actionId === 'forgetLearned') {
        await update('memory', { id, remove: true });
        toast('已撤销这条记忆');
        return;
    }
    if (actionId === 'newTask') {
        modal('新建定时任务', taskEditor(state), '创建', async (f) => update('task', taskPayload(f))); // [p2-m1][ux6]
        $('#modal')?.classList.add('task-modal');
        return;
    }
    // [p2-m2] approval rules and items waiting for the user
    if (['allowPending', 'allowPendingTask', 'dismissPending', 'removeApprovalRule'].includes(actionId)) {
        const action = {allowPending: 'allowPending', allowPendingTask: 'allowPending', dismissPending: 'dismissPending', removeApprovalRule: 'remove'}[actionId];
        await update('approvalRule', { action, id: id || undefined, ...(actionId === 'allowPendingTask' ? { onlyTask: true } : {}) });
        toast(actionId.startsWith('allow') ? '已保存规则，同类操作以后自动执行' : actionId === 'removeApprovalRule' ? '已撤销规则' : '已忽略');
        return;
    }
    if (actionId === 'clearApprovalRules') { modal('撤销全部规则', '<p>撤销后，所有操作重新逐次确认；定时任务遇到这些操作会记入「待你确认」。</p>', '全部撤销', async () => update('approvalRule', { action: 'clear' })); return; }
    // [p3-m1] connectors
    if (actionId === 'connectorPrefill') { // [ux9] add form opened from chat and prefilled by the assistant; secrets are typed here by the user
        const p = JSON.parse(id || '{}'), kind = ['feed', 'calendar', 'mail', 'office'].includes(p.kind) ? p.kind : 'feed';
        const draft = { kind, config: p.config && typeof p.config === 'object' ? p.config : {}, name: String(p.name || ''), ...(Number.isInteger(p.interval) ? { interval: p.interval } : {}) };
        modal('添加连接', connectorForm(state, draft, kind), '连接并同步', async f => {
            const out = await invoke('connector', connectorPayload(f));
            applyState(out.state); render();
            if (out.result?.error) toast('已保存，但同步失败：' + out.result.error);
            else if (out.result && 'added' in out.result) toast(`同步完成，新增 ${out.result.added} 条`);
            else toast('已保存');
        });
        return;
    }
    if (actionId === 'connectorAdd' || actionId === 'connectorEdit') {
        const c = actionId === 'connectorEdit' ? (state.connectors || []).find(x => x.id === id) : null;
        modal(c ? '编辑连接' : '添加连接', connectorForm(state, c, c?.kind || id || 'feed'), c ? '保存' : '连接并同步', async f => {
            const out = await invoke('connector', connectorPayload(f, c?.id));
            applyState(out.state); render();
            if (out.result?.error) toast('已保存，但同步失败：' + out.result.error);
            else if (out.result && 'added' in out.result) toast(`同步完成，新增 ${out.result.added} 条`);
            else toast('已保存');
        });
        return;
    }
    if (actionId === 'connectorCompose') { // [p3-m3]
        const c = (state.connectors || []).find(x => x.id === id);
        modal('写邮件', mailComposeForm(c), '发送', async f => {
            const out = await invoke('connector', mailComposePayload(f, id));
            applyState(out.state); render();
            toast(out.result?.sent ? '邮件已发送' : '已取消发送');
        });
        return;
    }
    if (actionId === 'connectorMessage') { // [p3-m4]
        const c = (state.connectors || []).find(x => x.id === id);
        modal('发群消息', officeMessageForm(c), '发送', async f => {
            const out = await invoke('connector', officeMessagePayload(f, id));
            applyState(out.state); render();
            toast(out.result?.sent ? '消息已发送' : '已取消发送');
        });
        return;
    }
    // [p3-m5] knowledge graph
    // [ux4] 我的上下文 · knowledge graph view
    if (actionId === 'graphMode') { graphMode = id === 'list' ? 'list' : 'graph'; render(); return; }
    if (actionId === 'graphUnfocus') { graphFocus = ''; graphCache.refit = true; render(); return; }
    if (actionId === 'graphFit') { graphMount?.fit(); return; }
    if (actionId === 'graphClose') { graphSelected = ''; graphMount?.select(''); const side = $('#graphSide'); if (side) side.hidden = true; return; }
    if (actionId === 'graphSettings') { modal('知识图谱设置', graphSettingsForm(state), '', null); return; }
    if (actionId === 'graphSettingToggle') {
        const cur = state.graph?.settings || {};
        const out = await invoke('graph', { action: 'settings', settings: { [id]: cur[id] === false } });
        applyState(out.state); render();
        modal('知识图谱设置', graphSettingsForm(state), '', null);
        return;
    }
    if (actionId === 'graphType') { graphType = !id || id === graphType ? 'all' : id; graphCache.refit = true; render(); return; }
    if (actionId === 'graphToggle') {
        const cur = state.graph?.settings || {};
        const out = await invoke('graph', { action: 'settings', settings: { [id]: cur[id] === false } });
        applyState(out.state); render();
        return;
    }
    if (actionId === 'graphExtract') {
        toast('正在整理知识图谱…');
        const out = await invoke('graph', { action: 'extract' });
        applyState(out.state); render();
        const r = out.result || {};
        toast(r.error ? r.error : r.done ? `已整理 ${r.done} 项内容，新增 ${r.added} 个实体` : '没有需要整理的新内容');
        return;
    }
    if (actionId === 'graphOpen') {
        const e = (state.graph?.entities || []).find(x => x.id === id);
        modal(e?.name || '实体', graphDetail(state, id, { action, date }), '', null);
        return;
    }
    if (actionId === 'graphEdit') {
        const e = (state.graph?.entities || []).find(x => x.id === id);
        modal('编辑实体', graphEntityForm(e), '保存', async f => { const out = await invoke('graph', graphEntityPayload(f, id)); applyState(out.state); render(); toast('已保存'); });
        return;
    }
    if (actionId === 'graphMerge') {
        modal('合并实体', graphMergeForm(state, id), '合并', async f => { const out = await invoke('graph', { action: 'merge', id, into: f.get('into') }); applyState(out.state); render(); toast('已合并'); });
        return;
    }
    if (actionId === 'graphRemove') {
        const e = (state.graph?.entities || []).find(x => x.id === id);
        modal('删除实体', `<p>删除「${escape(e?.name || '')}」和它的所有关系。以后自动整理时也不会再添加这个名称。</p>`, '删除', async () => { const out = await invoke('graph', { action: 'remove', id }); applyState(out.state); render(); toast('已删除'); });
        return;
    }
    if (actionId === 'graphRemoveRelation') {
        const rel = (state.graph?.relations || []).find(r => r.id === id);
        const out = await invoke('graph', { action: 'removeRelation', id });
        applyState(out.state); render();
        if (rel && $('#modal')?.open && $('#modal .graph-detail')) { const e = (state.graph?.entities || []).find(x => x.id === rel.from); if (e) modal(e.name, graphDetail(state, e.id, { action, date }), '', null); }
        toast('已删除关系');
        return;
    }
    if (actionId === 'graphClear') {
        modal('清空知识图谱', '<p>删除所有实体和关系，以及「不再添加」的名称记录。</p><label class="check"><input type="checkbox" name="reprocess"> 清空后重新整理全部对话、文档和连接内容</label>', '清空', async f => { const out = await invoke('graph', { action: 'clear', reprocess: f.has('reprocess') }); applyState(out.state); render(); toast('图谱已清空'); });
        return;
    }
    // [p4-m1] studio · dashboards
    if (actionId === 'studioTab') { studioTab = id || 'dashboards'; miniappOpenId = ''; render(); return; }
    if (actionId === 'dashboardNew' || actionId === 'dashboardFromDocument') {
        modal('新建仪表盘', dashboardForm(state, { documentId: actionId === 'dashboardFromDocument' ? id : '' }), '生成', async f => {
            const p = dashboardPayload(f);
            toast(p.source === 'file' ? '请在弹出的窗口中选择文件…' : '正在生成仪表盘…');
            const out = await invoke('dashboard', p);
            applyState(out.state); render();
            if (out.result?.cancelled) return;
            if (out.result?.note) toast(out.result.note);
            if (out.result?.id) setTimeout(() => handle('dashboardOpen', out.result.id).catch(e => toast(e.message)), 0); // [ux8] stay on the current page
        });
        return;
    }
    if (actionId === 'dashboardOpen') {
        const out = await invoke('dashboard', { action: 'get', id });
        dashView?.dispose(); dashView = null;
        modal(out.result.name, dashboardViewer(id), '', null);
        const dlg = $('#modal');
        dlg.classList.add('viz-modal');
        dashView = mountDashboard(dlg.querySelector('.viz-host'), out.result);
        const prev = dlg.onclose;
        dlg.onclose = () => { dashView?.dispose(); dashView = null; dlg.classList.remove('viz-modal'); prev?.(); };
        return;
    }
    if (actionId === 'dashboardExportPng') {
        if (!dashView) throw new Error('请先打开仪表盘');
        toast('正在生成图片…');
        const dataUrl = await dashView.exportPng();
        const out = await invoke('dashboard', { action: 'export', id, format: 'png', dataUrl });
        toast(out.result?.saved ? '已导出图片' : '已取消导出');
        return;
    }
    if (actionId === 'dashboardExportHtml') {
        const out = await invoke('dashboard', { action: 'export', id, format: 'html', filters: dashView?.filters() || {} });
        toast(out.result?.saved ? '已导出网页（可离线打开）' : '已取消导出');
        return;
    }
    if (actionId === 'dashboardRedesign') {
        const d = (state.dashboards || []).find(x => x.id === id);
        dashView?.dispose(); dashView = null; $('#modal')?.classList.remove('viz-modal');
        modal('重新设计仪表盘', dashboardRedesignForm(d), '重新设计', async f => {
            toast('正在重新设计…');
            const out = await invoke('dashboard', { action: 'redesign', id, prompt: String(f.get('prompt') || ''), sendSamples: f.has('sendSamples') });
            applyState(out.state); render();
            if (out.result?.note) toast(out.result.note);
            setTimeout(() => handle('dashboardOpen', id).catch(e => toast(e.message)), 0);
        });
        return;
    }
    if (actionId === 'dashboardRename') {
        const d = (state.dashboards || []).find(x => x.id === id);
        modal('重命名仪表盘', `<label>名称<input name="name" required maxlength="60" value="${escape(d?.name || '')}"></label>`, '保存', async f => { const out = await invoke('dashboard', { action: 'rename', id, name: f.get('name') }); applyState(out.state); render(); });
        return;
    }
    if (actionId === 'dashboardRemove') {
        const d = (state.dashboards || []).find(x => x.id === id);
        modal('删除仪表盘', `<p>删除「${escape(d?.name || '')}」和它保存的数据快照。原始表格不受影响。</p>`, '删除', async () => { const out = await invoke('dashboard', { action: 'remove', id }); applyState(out.state); render(); toast('已删除'); });
        return;
    }
    if (/^kn[A-Z]/.test(actionId)) { // [F3] 投研知识库: search, topics
        const call = async p => { const out = await invoke('knowledge', p); if (out?.state) applyState(out.state); return out?.result || {}; };
        const K = knowledgeUI, topic = () => (state.knowledge?.topics || []).find(t => t.id === id);
        if (actionId === 'knSearch') { const q = ($('#knQuery')?.value || '').trim(); if (q.length < 2) { toast('请输入至少 2 个字'); return; } const box = $('#knResults'); if (box) box.innerHTML = '<p class="empty-note">正在检索…</p>'; const r = await call({ action: 'search', query: q }); const out = $('#knResults'); if (out) out.innerHTML = K.searchResultsHtml(r, { action }); return; }
        if (actionId === 'knTopicNew' || actionId === 'knTopicEdit') { const t = actionId === 'knTopicEdit' ? topic() : null; modal(t ? `编辑研究主题 · ${t.name}` : '新建研究主题', K.topicForm(t || {}), '保存', async f => { const r = await call(K.topicPayload(f, t?.id)); render(); toast(r.topic?.enabled ? '已保存，按计划每周生成主题周报' : '已保存'); }); return; }
        if (actionId === 'knTopicRemove') { const t = topic(); modal('删除研究主题', `<p>删除「${escape(t?.name || '')}」？已生成的周报会保留在成果中心。</p>`, '删除', async () => { await call({ action: 'topicRemove', id }); render(); toast('已删除'); }); return; }
        if (actionId === 'knTopicCollect') { const t = topic(); toast('正在汇集公告、资讯和资料…'); const r = await call({ action: 'topicCollect', id }); modal(`主题动态 · ${t?.name || ''}`, K.topicItemsHtml(r), '生成周报', async () => handle('knTopicDigest', id)); return; }
        if (actionId === 'knTopicDigest') { toast('正在生成主题周报…'); const r = await call({ action: 'topicDigest', id, format: 'docx' }); render(); toast(`主题周报已生成（${r.count} 条动态）`); if (r.document?.id) await handle('documentView', r.document.id); return; }
    }
    if (/^td[A-Z]/.test(actionId)) { // [v0.52] 半自动委托
        const T = tradeUI, tv = state.trade || {}, call = async p => { const out = await invoke('trade', p); if (out?.state) applyState(out.state); return out?.result || {}; };
        const order = oid => [...(tv.orders || []), ...(tv.history || [])].find(o => o.id === oid);
        const later = (title, html, submit, fn) => setTimeout(() => modal(title, html, submit, fn), 0);
        const line = o => `${o.side === 'buy' ? '买入' : '卖出'} <b>${escape(o.name)}</b>（${escape(o.code)}）${escape(String(o.shares))} 股，限价 ${escape(String(o.price))}，约 ${escape(String(Math.round(o.amount)))} 元`;
        if (actionId === 'tdConfirm' || actionId === 'tdConfirmAgain') {
            const o = order(id); if (!o) return;
            const real = tv.settings?.mode === 'real';
            modal(real ? '下单：在券商页面填好委托' : '模拟下单', `<p>${line(o)}</p>${real ? '<p>QuanK 会打开券商网页版并填好代码、价格和数量，用红框标出提交按钮。<b>请核对后由你自己点击提交</b>，QuanK 不会替你提交。</p>' : '<p>按模拟盘撮合：现价到达委托价时成交，记入模拟账户。</p>'}${(o.notes || []).length ? `<p class="hint">${escape(o.notes.join('；'))}</p>` : ''}`, real ? '打开券商并填单' : '模拟下单', async () => { const r = await call({ action: 'confirm', id }); render(); toast(r.note || '已处理'); });
            return;
        }
        if (actionId === 'tdCancel') { const o = order(id); modal('撤销委托单', `<p>撤销：${o ? line(o) : ''}？</p>`, '撤销', async () => { const r = await call({ action: 'cancel', id }); render(); toast(r.note || '已撤销'); }); return; }
        if (actionId === 'tdReport') { const [oid, st] = String(id).split(':'); const r = await call({ action: 'report', id: oid, status: st }); render(); toast(st === 'submitted' ? '已记下：等待成交后点「回填成交」' : st === 'cancelled' ? '已标记为撤单' : '已更新'); void r; return; }
        if (actionId === 'tdRead') { const r = await call({ action: 'readBack', id }); modal('券商页面上的委托记录', r.rows?.length ? `<div class="td-rows">${r.rows.map(x => `<code>${escape(x)}</code>`).join('')}</div>` : '<p class="empty-note">委托列表里没有找到这只股票。请在券商页面打开「当日委托」后再试。</p>'); return; }
        if (actionId === 'tdFill') {
            const o = order(id); if (!o) return;
            let hints = []; if (tv.broker?.open && tv.broker?.orders) { try { hints = (await call({ action: 'readBack', id })).hints || []; } catch {} }
            modal('回填成交', T.fillForm(o, hints), '确认成交', async f => { const r = await call(T.fillPayload(f, id)); render(); toast(r.recorded === 'engine' ? '已记入引擎持仓' : r.recorded === 'manual' ? '已更新手动持仓' : '已记录'); });
            return;
        }
        if (actionId === 'tdCreate') { modal('手动委托', T.createForm(), '生成委托单', async f => { await call(T.createPayload(f)); render(); toast('已生成委托单，确认后才会下单'); }); return; }
        if (actionId === 'tdPause') { await call({ action: 'settings', settings: { paused: id === 'pause' } }); render(); toast(id === 'pause' ? '已暂停：不再生成新的委托单，也不能下单' : '已恢复'); return; }
        if (actionId === 'tdSettings') {
            modal('委托设置', T.settingsForm(tv.settings || {}), '保存', async f => {
                const p = T.settingsPayload(f);
                if (p.settings.mode === 'real' && tv.settings?.mode !== 'real') { const rest = { ...p.settings }; delete rest.mode; await call({ action: 'settings', settings: rest }); later('切换到真实下单', T.REAL_RISK_HTML, '我已了解风险，切换', async () => { await call({ action: 'settings', settings: { mode: 'real', confirmReal: true } }); render(); toast('已切换到真实下单'); }); render(); return; }
                const r = await call(p); render(); toast(r.text || '已保存');
            });
            return;
        }
        if (actionId === 'tdBroker') { modal('券商页面', T.brokerPanel(tv.broker || {}, tv.presets || []), '保存', async f => { await call(T.brokerPayload(f)); render(); toast('已保存'); }); return; }
        if (actionId === 'tdBrokerOpen') { const u = $('#modal [name="url"]')?.value; if (u !== undefined && u !== (tv.broker?.url || '')) await call({ action: 'broker', url: u.trim() }); await call({ action: 'brokerOpen' }); toast('已打开券商页面，请在新窗口里登录'); return; }
        if (actionId === 'tdCalibrate') { toast('请切换到券商窗口，按顶部提示依次点击'); const r = await call({ action: 'calibrate', target: id }); if (r.cancelled) { toast('已取消标注'); return; } applyState(await invoke('state')); if ($('#modal')?.open) modal('券商页面', T.brokerPanel(state.trade?.broker || {}, state.trade?.presets || []), '保存', async f => { await call(T.brokerPayload(f)); render(); }); const NAMES = { code: '代码输入框', price: '价格输入框', shares: '数量输入框', submit: '提交按钮', orders: '委托列表' }; toast(r.missing?.length ? `有 ${r.missing.length} 项没有记下：${r.missing.map(k => NAMES[k] || k).join('、')}。请确认点在输入框本身上，再标注一次` : '标注已保存'); return; } // [v0.53] report what did not stick
        if (actionId === 'tdBrokerLogout') { await call({ action: 'brokerLogout' }); toast('已退出券商登录并关闭窗口'); return; }
    }
    if (actionId === 'officeAIToggleUpload') {
        applyState(await invoke('officeAISettings', {allowUpload:id === 'on'}));
        render();
        return;
    }
    if (/^sec[A-Z]/.test(actionId)) { // [F5] 安全与合规
        const S = securityUI, call = async p => { const out = await invoke('security', p); if (out?.state) applyState(out.state); return out?.result || {}; };
        const repaint = (tab = null) => { if (tab) S.setSecurityTab(document, tab); render(); };
        const later = (title, html, submit, fn) => setTimeout(() => modal(title, html, submit, fn), 0);
        if (actionId === 'secUnlock') { const pw = $('#lockPassword')?.value || ''; try { await call({ action: 'unlock', method: 'password', password: pw }); applyState(await invoke('state')); render(); } catch (e) { const el = $('#lockError'); if (el) { el.textContent = e.message; el.hidden = false; } const p2 = $('#lockPassword'); if (p2) { p2.value = ''; p2.focus(); } } return; }
        if (actionId === 'secUnlockTouch') { try { await call({ action: 'unlock', method: 'touchid' }); applyState(await invoke('state')); render(); } catch (e) { const el = $('#lockError'); if (el) { el.textContent = e.message; el.hidden = false; } } return; }
        if (actionId === 'secLock') { if (!state.security?.lockEnabled) { handle('secLockSettings'); return; } await call({ action: 'lock' }); applyState(await invoke('state')); render(); return; }
        if (actionId === 'secTab') { repaint(id); return; }
        if (actionId === 'secPrivacy') { const [k, v] = String(id).split(':'); if (k === 'offline' && v === 'on') { modal('开启离线模式', '<p>开启后 QuanK 不再连接任何外部服务：实时行情、公告、财务数据、大模型对话和联网搜索都会暂停，本机策略引擎和本机数据照常可用。</p>', '开启', async () => { await call({ action: 'privacy', offline: true }); repaint(); toast('已开启离线模式'); }); return; } await call({ action: 'privacy', [k]: v === 'on' }); repaint(); toast('已保存'); return; }
        if (actionId === 'secEgressClear') { await call({ action: 'egressClear' }); repaint('egress'); return; }
        if (actionId === 'secAuditFilter') { S.setSecurityTab(document, 'audit', { kind: $('#secAuditKind')?.value || '', q: ($('#secAuditQ')?.value || '').trim() }); render(); return; }
        if (actionId === 'secAuditVerify') { const r = await call({ action: 'auditVerify' }); toast(r.ok ? `操作审计完整：${r.total} 条记录都未被改动` : `操作审计校验失败：第 ${r.line} 行，${r.reason}`); render(); return; }
        if (actionId === 'secAuditExport') { const r = await call({ action: 'auditExport', kind: $('#secAuditKind')?.value || '', q: ($('#secAuditQ')?.value || '').trim() }); if (!r.cancelled) toast(`已导出 ${r.rows} 条到 ${r.saved}`); return; }
        if (actionId === 'secTestModel') { const box = $('#secTestResult'); if (box) box.innerHTML = '<p class="empty-note">正在测试…</p>'; const r = await call({ action: 'testModel' }); if ($('#secTestResult')) $('#secTestResult').innerHTML = S.testResultHtml(r); return; }
        if (actionId === 'secLockSettings') { const v = (await call({ action: 'view' })); modal('应用锁', S.lockForm(v.lock), '保存', async f => { const r = await call(S.lockPayload(f)); repaint(); toast(r.lock?.enabled ? '应用锁已开启' : '应用锁已关闭'); }); return; }
        if (actionId === 'secEncrypt') {
            if (id === 'on') { modal('开启本机数据加密', '<p>对话、持仓、组合、笔记、风控规则和设置会用 AES-256 加密保存，密钥放在 macOS 钥匙串里，只有当前 macOS 用户能解开。</p><p>开启前会先留一份<b>未加密的副本</b>，确认一切正常后可以在这里删除。钥匙串被重置或换电脑时，只能用<b>加密备份</b>找回数据，建议先导出一份。</p>', '开启加密', async () => { const r = await call({ action: 'encrypt', enabled: true }); repaint(); toast(r.backup ? `已开启加密，未加密副本：${r.backup}` : '已开启加密'); }); return; }
            modal('关闭本机数据加密', '<p>关闭后数据重新以明文保存，钥匙串里的数据密钥会删除。</p>', '关闭加密', async () => { await call({ action: 'encrypt', enabled: false }); repaint(); toast('已关闭加密'); }); return;
        }
        if (actionId === 'secDeletePlain') { modal('删除未加密副本', '<p>删除开启加密前留下的未加密副本和恢复前的数据副本？删除后无法找回，请确认 QuanK 运行正常、并且已经导出过加密备份。</p>', '删除', async () => { const r = await call({ action: 'deletePlainBackups' }); repaint(); toast(`已删除 ${r.deleted} 个文件`); }); return; }
        if (actionId === 'secBackup') { modal('导出加密备份', S.backupForm(false), '选择保存位置', async f => { const r = await call(S.backupPayload(f, false)); if (!r.cancelled) { repaint(); toast(`已保存 ${r.saved}`); } }); return; }
        if (actionId === 'secRestore') { modal('从加密备份恢复', S.backupForm(true), '选择备份文件', async f => { const r = await call(S.backupPayload(f, true)); if (r.cancelled) return; const c = r.counts || {}; later('确认恢复', `<p>备份文件：${escape(r.file)}</p><p>备份时间：${escape(new Date(r.created).toLocaleString('zh-CN', { hour12: false }))}；对话 ${c.chats ?? '—'} 个，手动持仓 ${c.holdings ?? '—'} 条，资料 ${c.notes ?? '—'} 条。</p><p>恢复会<b>替换当前全部数据</b>（当前数据会另存一份），然后 QuanK 重新启动。已保存的密钥如果来自另一台 Mac，需要重新填写。</p>`, '恢复并重启', async () => { await call({ action: 'backupRestore' }); toast('正在恢复，QuanK 即将重新启动…'); }); }); return; }
        if (actionId === 'secCliInstall') { const r = await call({ action: 'cliInstall' }); repaint(); toast(r.inPath === false ? `已安装 ${r.bin}。终端里找不到 quank 的话，把 ~/.local/bin 加进 PATH` : `已安装 quank 命令，在终端里运行 quank --help 试试`); return; }
        if (actionId === 'secCliUninstall') { await call({ action: 'cliUninstall' }); repaint(); toast('已卸载 quank 命令'); return; }
        if (actionId === 'secCliEnable') { await call({ action: 'cliEnable', enabled: id !== 'off' }); repaint(); toast(id === 'off' ? '已关闭命令行' : '已开启命令行'); return; }
        if (actionId === 'secCliMcp') { const v = await call({ action: 'view' }); modal('MCP 与 ACP 配置', S.cliMcpHtml(v.cli)); return; }
        if (actionId === 'secComplianceSettings') { const v = await call({ action: 'view' }); modal('合规设置', S.complianceForm(v.compliance), '保存', async f => { await call(S.compliancePayload(f)); repaint(); toast('已保存'); }); return; }
        if (actionId === 'secReview') { const text = $('#secReviewText')?.value || ''; if (text.trim().length < 4) { toast('请先粘贴要检查的文字'); return; } const r = await call({ action: 'review', text, kind: $('#secReviewKind')?.value || 'article', aiUsed: !!$('#secReviewAi')?.checked }); const box = $('#secReviewResult'); if (box) box.innerHTML = S.findingsHtml(r); return; }
    }
    if (/^pf[A-Z]/.test(actionId)) { // [F4] 组合与风控: holdings, cash, rules, checks, scenarios, simulation, report
        const P = portfolioUI, pf = state.portfolio || {};
        const call = async p => { const out = await invoke('portfolio', p); if (out?.state) applyState(out.state); return out?.result || {}; };
        const after = msg => { P.invalidatePortfolio(document); render(); if (msg) toast(msg); };
        const later = (title, html) => setTimeout(() => modal(title, html), 0); // the form dialog closes right after its handler returns
        const pos = c => (P.cachedOverview(document)?.summary?.positions || []).find(p => p.code === c), man = c => (pf.manual || []).find(m => m.code === c);
        if (actionId === 'pfHoldingNew' || actionId === 'pfHoldingEdit') { const m = actionId === 'pfHoldingEdit' ? man(id) : null; modal(m ? `编辑持仓 · ${m.name || m.code}` : '录入持仓', P.holdingForm(m || {}), '保存', async f => { await call(P.holdingPayload(f)); after('已保存'); }); return; }
        if (actionId === 'pfHoldingRemove') { const m = man(id); modal('删除手动持仓', `<p>删除「${escape(m?.name || id)}」的手动持仓记录？引擎里的成交记录不受影响。</p>`, '删除', async () => { await call({ action: 'holdingRemove', code: id }); after('已删除'); }); return; }
        if (actionId === 'pfCash') { modal('账户现金', P.cashForm(pf.cash), '保存', async f => { await call(P.cashPayload(f)); after('已保存'); }); return; }
        if (actionId === 'pfRules') { modal('风控规则', P.rulesForm(pf.rules || {}), '保存', async f => { const r = await call(P.rulesPayload(f)); after(r.text || '已保存'); }); return; }
        if (actionId === 'pfStop') {
            const p = pos(id) || { code: id }, m = man(id), cur = m ? m.stopPrice : pf.rules?.stops?.[id]?.stopPrice;
            modal(`止损价 · ${p.name || id}`, P.stopForm({ ...p, stopPrice: cur ?? '' }), '保存', async f => { if (m) await call({ ...m, action: 'holdingSave', stopPrice: f.get('stopPrice') }); else await call(P.stopPayload(f, id)); after('已保存'); });
            return;
        }
        if (actionId === 'pfCheck') { toast('正在检查风控规则…'); const r = await call({ action: 'check' }); after(r.breaches?.length ? `${r.breaches.length} 条风控提示` : '没有触发风控规则'); return; }
        if (actionId === 'pfClearAlerts') { await call({ action: 'clearAlerts' }); after('已清空'); return; }
        if (actionId === 'pfScenario') { modal('自定义情景', P.scenarioForm(P.cachedOverview(document)?.summary || {}), '计算', async f => { const r = await call(P.scenarioPayload(f)); later('压力测试结果', P.stressResultRows(r.results || [])); }); return; }
        if (actionId === 'pfSimulate') { modal('模拟调仓', P.simulateForm(), '计算', async f => { const r = await call(P.simulatePayload(f)); later('调仓模拟结果', P.simulateHtml(r)); }); return; }
        if (actionId === 'pfReport') { toast('正在生成组合风控报告…'); const r = await call({ action: 'report', format: 'docx' }); render(); toast('组合风控报告已保存到成果中心'); if (r.document?.id) await handle('documentView', r.document.id); return; }
    }
    if (/^research/.test(actionId)) { // [F2] 投研文档: reports, announcements, library, exports
        const call = async p => { const out = await invoke('research', p); if (out?.state) applyState(out.state); return out?.result || {}; };
        const R = researchUI, rs = state.research || {}, nameOf = c => (state.quant?.pool || []).find(p => p.code === c)?.name || c;
        const openDoc = async docId => { render(); if (docId) await handle('documentView', docId); };
        if (actionId === 'researchEdit') { const r = await call({ action: 'read', id }); modal('编辑笔记', noteEditForm(r), '保存', async f => { const g = n => String(f.get?.(n) ?? f.querySelector?.(`[name="${n}"]`)?.value ?? ''); await call({ action: 'noteUpdate', id, title: g('title').trim(), text: g('text').trim(), tags: g('tags').trim() }); render(); toast('笔记已更新'); }); return; } // [v0.53]
        if (actionId === 'researchReport') { modal(`生成研报 · ${nameOf(id)}`, R.reportForm(), '生成', async f => { const p = R.reportPayload(f, id); toast('正在汇总信号、行情和公告并生成研报，大约需要 10–60 秒…'); const r = await call(p); toast(r.warnings?.length ? `研报已生成（部分内容缺失：${r.warnings.join('；')}）` : '研报已生成，已保存到成果中心和资料库'); await openDoc(r.document?.id); }); return; }
        if (actionId === 'researchNotices') { toast('正在获取公告…'); const r = await call({ action: 'notices', code: id, fresh: true }); if (page === 'research') { render(); toast(`已获取 ${r.notices?.length || 0} 条公告，重要公告可在详情里收藏到资料库`); return; } if (quantOpen !== id) { await handle('quantOpen', id); } else render(); toast(`已获取 ${r.notices?.length || 0} 条公告`); return; }
        if (actionId === 'researchNotice') { toast('正在读取公告…'); const r = await call({ action: 'notice', id }); render(); modal(r.title || '公告解读', R.noticeDetail(r)); return; }
        if (actionId === 'researchSaveNotice') { await call({ action: 'saveNotice', id }); render(); toast('已收入资料库'); return; }
        if (actionId === 'researchNote') { modal(`记笔记${id ? ' · ' + nameOf(id) : ''}`, R.noteForm(), '保存', async f => { await call(R.notePayload(f, id)); render(); toast('笔记已保存到资料库'); }); return; }
        if (actionId === 'researchLink') { modal('关联成果中心文档', R.linkForm(state.documents || []), '关联', async f => { await call(R.linkPayload(f, id)); render(); toast('已关联到资料库'); }); return; }
        if (actionId === 'researchOpen') {
            const it = (rs.library || []).find(x => x.id === id);
            if (!it) throw new Error('资料不存在或已删除');
            if (it.documentId) { if (!(state.documents || []).some(d => d.id === it.documentId)) throw new Error('这份文档已从成果中心删除'); return openDoc(it.documentId); }
            if (it.kind === 'notice' && it.noticeId) return handle('researchNotice', it.noticeId);
            const r = await call({ action: 'read', id }); modal(r.title || '笔记', R.noteDetail(r)); return;
        }
        if (actionId === 'researchRemove') { const it = (rs.library || []).find(x => x.id === id); modal('删除资料', `<p>从资料库删除「${escape(it?.title || '')}」？${it?.documentId ? '成果中心里的文档不会被删除。' : ''}</p>`, '删除', async () => { await call({ action: 'remove', id }); render(); toast('已删除'); }); return; }
        if (actionId === 'researchExport') { modal('导出到成果中心', R.exportForm(id, state), '导出', async f => { const p = R.exportPayload(f); toast('正在生成…'); const r = await call(p); toast('已导出到成果中心'); await openDoc(r.document?.id); }); return; }
        if (actionId === 'researchWatch') { modal('公告提醒', R.watchForm(rs.watch || {}), '保存', async f => { const r = await call(R.watchPayload(f)); render(); toast(r.text || '已保存'); }); return; }
    }
    if (/^quant/.test(actionId)) { // [q1] local quant engine
        const call = async p => { const out = await invoke('quant', p); if (out?.state) applyState(out.state); return out?.result || {}; };
        const loadDetail = async (code, fresh = false) => { // [v0.54] each stock opens in its own panel tab; its result is kept
            const existing = pageTabs.find(t => t.id === 'stock:' + code);
            const poolName = stockName(code);
            const title = stockTarget?.name || (poolName === code ? existing?.title || code : poolName);
            openPanelTab(panelUI.stockTab(code, title, stockTarget));
            const paintDetail = () => {
                if (stockTarget?.section === 'graph') panelBodyKey = '';
                render();
                if (stockTarget?.section === 'graph') document.querySelector('#pagePanel [data-kn-initial="graph"]')?.scrollIntoView?.({block: 'start'});
            };
            const have = quantCache.get(code);
            if (!fresh && have && !have.error) { quantDetailData = have; paintDetail(); return; }
            if (quantLoading.has(code)) { paintDetail(); return; }
            quantLoading.add(code); quantCache.delete(code); quantVer.set(code, (quantVer.get(code) || 0) + 1); if (quantOpen === code) quantDetailData = null;
            paintDetail();
            let d; try { d = await call({ action: 'signal', code, fresh }); } catch (e) { d = { error: e.message }; }
            quantLoading.delete(code); quantCache.set(code, d); quantVer.set(code, (quantVer.get(code) || 0) + 1);
            while (quantCache.size > 16) quantCache.delete(quantCache.keys().next().value);
            if (quantOpen === code) quantDetailData = d;
            render();
        };
        if (actionId === 'quantStart' || actionId === 'quantRestart') { toast('正在启动量化引擎…'); render(); await call({ action: actionId === 'quantStart' ? 'start' : 'restart' }); render(); toast('量化引擎已启动'); call({ action: 'pool' }).then(render).catch(() => {}); return; }
        if (actionId === 'quantSyncRestart') { toast('正在同步策略代码并重启引擎…'); const r = await call({ action: 'syncRestart' }); render(); toast(`已同步 ${r.files ?? ''} 个文件，引擎已重启`); call({ action: 'pool' }).then(render).catch(() => {}); return; } // [v0.52.1]
        if (actionId === 'quantStop') { await call({ action: 'stop' }); render(); toast('量化引擎已停止'); return; }
        if (actionId === 'quantSync') { const q = state.quant || {}; if (q.installed) { toast('正在同步策略代码…'); const r = await call({ action: 'sync' }); render(); toast(`已同步 ${r.files} 个文件`); } else { const r = await call({ action: 'chooseSource' }); render(); if (!r.cancelled) toast(`已导入 ${r.files} 个文件`); } return; }
        if (actionId === 'quantSettings') { modal('量化设置', quantSettingsForm(state.quant || {}), '保存', async f => { const r = await call(quantSettingsPayload(f)); render(); toast(r.remote ? (r.remote.ok ? `已保存 · 远程引擎连接正常${r.remote.title ? '（' + r.remote.title + '）' : ''}` : `已保存 · 远程引擎暂时连不上：${r.remote.error || ''}`) : r.python?.ok ? `已保存 · Python ${r.python.version} 依赖齐全` : `已保存 · Python 缺少：${(r.python?.missing || []).join('、')}`); }); return; }
        if (actionId === 'quantTestRemote') { toast('正在测试远程引擎…'); const r = await call({ action: 'testRemote' }); toast(r.ok ? `远程引擎连接正常 · ${r.ms} ms${r.title ? ' · ' + r.title : ''}` : `连接失败：${r.error || ''}`); return; } // [v0.55]
        if (actionId === 'quantHoldings') { toast('正在读取持仓…'); const r = await call({ action: 'holdings' }); render(); const bad = (r.holdings || []).filter(x => x.error).length; toast(bad ? `已更新，${bad} 只读取失败` : '持仓已更新'); return; } // [q4]
        if (actionId === 'quantTrade') {
            const [code0, side0] = String(id || '').split(':'), q = state.quant || {}, code = code0 || quantOpen || q.pool?.[0]?.code || '';
            const price = (quantOpen === code ? quantDetailData?.summary?.price : null) ?? q.pool?.find(p => p.code === code)?.last?.price ?? null;
            const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
            modal('记录成交', quantTradeForm(q, { code, side: side0 === 'sell' ? 'sell' : 'buy', price, today }), '记录', async f => {
                const p = quantTradePayload(f), r = await call(p);
                toast(`已记录${p.side === 'sell' ? '卖出' : '买入'} ${p.shares} 股，现持 ${r.holding?.shares ?? '—'} 股`);
                if (quantOpen === p.code) await loadDetail(p.code, true); else render();
            });
            return;
        }
        if (actionId === 'quantPlan') { await call({ action: 'plan' }); render(); modal('定投计划', quantPlanForm(state.quant || {}), '保存', async f => { const out = await call(quantPlanPayload(f)); render(); toast('定投计划已改为：' + (out.plan?.label || '')); }); return; }
        if (actionId === 'quantReportRun') { // [q5]
            const title = (state.quant?.reportDefs || []).find(d => d.id === id)?.title || '报告';
            toast(`正在本机生成${title}，可能需要几分钟…`);
            const r = await call({ action: 'reportRun', id }); render();
            toast(r.ok ? `${title}已生成` : `${title}生成失败：${r.error || ''}`);
            return;
        }
        if (actionId === 'quantReport') {
            const r = await call({ action: 'report', id });
            modal(r.title || '报告', quantReportDetail(r) + (r.md ? `<div class="q-report-md markdown">${rich(r.md)}</div>` : ''));
            return;
        }
        if (actionId === 'quantReportAuto') { modal('日报自动生成', quantReportAutoForm(state.quant || {}), '保存', async f => { const r = await call(quantReportAutoPayload(f)); render(); toast(r.text); }); return; }
        if (actionId === 'quantWatch') { modal('盯盘与提醒', quantWatchForm(state.quant || {}), '保存', async f => { const r = await call(quantWatchPayload(f)); render(); toast(r.watch?.enabled ? '已开启：' + r.text : '已关闭盯盘提醒'); }); return; } // [q3]
        if (actionId === 'quantContact') { modal('获取量化策略', `<div class="q-contact"><img src="assets/wechat-qr.jpg" alt="微信二维码"><p>微信扫一扫，添加 <b>findingnoone</b></p><p class="muted">获取量化策略、接入指导和使用支持。拿到策略项目后，在「量化」页点「导入策略项目」即可。</p><button type="button" data-action="quantCopyWx">复制微信号</button></div>`);
            $('#modal').addEventListener('close', () => { quantOpen = ''; quantDetailData = null; navigate('quant'); }, {once: true}); return; } // [v45e][v45m] closing the dialog opens the 量化 page
        if (actionId === 'quantCopyWx') { try { await navigator.clipboard.writeText('findingnoone'); toast('已复制微信号 findingnoone'); } catch { toast('微信号：findingnoone'); } return; }
        if (actionId === 'quantHome') { await navigate('quant'); return; }
        if (actionId === 'quantLog') { const r = await call({ action: 'log' }); modal('量化引擎日志', `<pre class="q-log">${escape(r.text || '（暂无日志）')}</pre>`); return; }
        if (actionId === 'quantAdd') { modal('添加股票', quantAddForm(), '添加', async f => { await call(quantAddPayload(f)); render(); toast('已加入股票池'); }); return; }
        if (actionId === 'quantRemove') { const s = (state.quant?.pool || []).find(x => x.code === id); modal('移出股票池', `<p>把「${escape(s?.name || id)}」移出股票池？</p>`, '移出', async () => { await call({ action: 'removeStock', code: id }); quantCache.delete(id); if (pageTabs.some(t => t.id === 'stock:' + id)) { const r = panelUI.closeTab(pageTabs, 'stock:' + id, pageTabId); pageTabs = r.tabs; setPanelActive(r.active); savePanel(); } render(); toast('已移出'); }); return; }
        if (actionId === 'quantOpen') return loadDetail(id);
        if (actionId === 'quantClose') { const t = panelTab(); if (t?.kind === 'stock') closePanelTab(t.id); else { quantOpen = ''; quantDetailData = null; render(); } return; }
        if (actionId === 'quantRefresh') { if (quantOpen === id) return loadDetail(id, true); quantCache.delete(id); toast('正在重新计算…'); await call({ action: 'signal', code: id, fresh: true }); render(); toast('已更新'); return; }
        if (actionId === 'quantRefreshAll') { toast('正在逐只计算，可能需要几分钟…'); const r = await call({ action: 'refreshAll' }); render(); const bad = (r.results || []).filter(x => x.error).length; toast(bad ? `完成，${bad} 只失败` : '全部已更新'); return; }
        if (actionId === 'quantInsight') { toast('正在生成 AI 研判…'); const r = await call({ action: 'insight', code: id }); modal('AI 研判', `${r.available ? '' : `<p class="hint">${escape(r.reason || 'AI 大模型研判暂不可用，以下为算法结论')}</p>`}${insightHtml(r.text || '', {name: r.name || '', code: id})}`); return; } // [F1e]
    }
    if (/^miniapp/.test(actionId)) { // [p4-m4] mini apps
        const call = async p => { const out = await invoke('miniapp', p); if (out?.state) { applyState(out.state); render(); } return out?.result || {}; };
        const app = () => { const a = (state.miniapps || []).find(x => x.id === id); if (!a) throw new Error('小应用不存在或已删除'); return a; };
        const show = r => { page = 'studio'; studioTab = 'miniapps'; miniappOpenId = r.id; render(); };
        if (actionId === 'miniappNew') { modal('新建小应用', miniappForm(), '生成', async f => { const p = miniappPayload(f); toast('正在生成小应用，大约需要 20–60 秒…'); const r = await call(p); toast(`已生成：${r.name}`); show(r); }); return; }
        if (actionId === 'miniappOpen') return show({ id });
        if (actionId === 'miniappClose') { miniappOpenId = ''; render(); return; }
        if (actionId === 'miniappSaveOpen') { const p = JSON.parse(id || '{}'); const r = await call({ action: 'save', html: p.html, name: p.title }); toast(`已保存到 创作 · 小应用：${r.name}`); return show(r); }
        if (actionId === 'miniappCode') { const p = JSON.parse(id || '{}'); modal('小应用代码', `<pre class="miniapp-code">${escape(p.html || '')}</pre>`, '复制代码', async () => { await navigator.clipboard.writeText(p.html || ''); toast('已复制'); }); return; }
        if (actionId === 'miniappRevise') { const a = app(); modal(`修改「${a.name}」`, miniappReviseForm(), '修改', async f => { const p = miniappRevisePayload(f, a.id); toast('正在修改小应用，大约需要 20–60 秒…'); await call(p); toast('已更新，旧版本可在「版本」里恢复'); }); return; }
        if (actionId === 'miniappVersions') { const a = app(); miniappVersionsFor = a.id; const r = await call({ action: 'versions', id: a.id }); modal(`「${a.name}」的版本`, miniappVersionsView(r, { date })); return; }
        if (actionId === 'miniappRestore') { await call({ action: 'restore', id: miniappVersionsFor, index: Number(id) }); $('#modal').close(); toast('已恢复，原来的版本存为历史'); return; }
        if (actionId === 'miniappReload') { miniappDispose?.(); miniappDispose = null; render(); return; }
        if (actionId === 'miniappReset') { const a = app(); modal('清空数据', `<p>清空「${escape(a.name)}」保存的全部数据？应用代码不受影响。</p>`, '清空', async () => { await call({ action: 'resetData', id: a.id }); miniappDispose?.(); miniappDispose = null; render(); toast('数据已清空'); }); return; }
        if (actionId === 'miniappExport') { const r = await call({ action: 'export', id }); toast(r.saved ? '已导出 HTML' : '已取消导出'); return; }
        if (actionId === 'miniappRename') { const a = app(); modal('重命名', `<label>名称<input name="name" maxlength="60" required value="${escape(a.name)}"></label>`, '保存', async f => { await call({ action: 'rename', id: a.id, name: f.get('name') }); toast('已重命名'); }); return; }
        if (actionId === 'miniappCopy') { await call({ action: 'copy', id }); toast('已复制'); return; }
        if (actionId === 'miniappRemove') { const a = app(); modal('删除小应用', `<p>删除「${escape(a.name)}」和它保存的数据？</p>`, '删除', async () => { await call({ action: 'remove', id: a.id }); if (miniappOpenId === a.id) miniappOpenId = ''; render(); toast('已删除'); }); return; }
    }
    if (/^infographic|^brandEdit$/.test(actionId)) { // [p4-m3] infographics & posters
        const call = async p => { const out = await invoke('infographic', p); applyState(out.state); render(); return out.result || {}; };
        const spec = () => JSON.parse(id || 'null');
        const saved = () => { const g = (state.infographics || []).find(x => x.id === id); if (!g) throw new Error('信息图不存在或已删除'); return g; };
        const png = async s => { const r = renderInfographicSvg(s, state.brand || {}); toast('正在生成图片…'); const dataUrl = await svgToPng(document, r.svg, r.width, r.height); const res = await call({ action: 'exportPng', name: s.title, dataUrl }); toast(res.saved ? '已导出 PNG' : '已取消导出'); };
        const pdf = async p => { toast('正在生成 PDF…'); const res = await call({ action: 'exportPdf', ...p }); toast(res.saved ? '已导出 PDF' : '已取消导出'); };
        const edit = (s, save) => modal('编辑信息图', infographicEditForm(s), '保存', async f => save(infographicEditPayload(f)));
        if (actionId === 'infographicNew') { modal('新建信息图', infographicForm(state), '生成', async f => { const p = infographicPayload(f); toast('正在设计信息图…'); const r = await call(p); toast(r.note || `已生成：${r.name}`); }); return; }
        if (actionId === 'infographicSave') { const r = await call({ action: 'save', spec: spec() }); toast(`已存到 创作 · 信息图：${r.name}`); return; }
        if (actionId === 'infographicEditChat') { edit(spec(), async s => { const r = await call({ action: 'save', spec: s }); toast(`已把修改后的版本存到 创作 · 信息图：${r.name}`); }); return; }
        if (actionId === 'infographicPng') return png(spec());
        if (actionId === 'infographicPdf') return pdf({ spec: spec() });
        if (actionId === 'infographicEdit') { edit(saved().spec, async s => { await call({ action: 'update', id, spec: s }); toast('已保存'); }); return; }
        if (actionId === 'infographicPngSaved') return png(saved().spec);
        if (actionId === 'infographicPdfSaved') return pdf({ id });
        if (actionId === 'infographicCopy') { await call({ action: 'copy', id }); toast('已复制'); return; }
        if (actionId === 'infographicRemove') { const g = saved(); modal('删除信息图', `<p>删除「${escape(g.name)}」？</p>`, '删除', async () => { await call({ action: 'remove', id }); toast('已删除'); }); return; }
        if (actionId === 'brandEdit') { modal('品牌设置', brandForm(state.brand || {}), '保存', async f => { const p = brandPayload(f); if (p.chooseLogo) toast('请在弹出的窗口中选择 logo 图片…'); await call(p); toast('品牌设置已保存'); }); return; }
    }
    if (actionId === 'comparisonExport') { // [p4-m2] save a comparison table from a reply into the library
        const p = JSON.parse(id || '{}');
        toast('正在保存对比表…');
        const out = await invoke('comparison', { action: 'export', format: p.format, spec: p.spec });
        applyState(out.state); render();
        toast(`已存入成果中心：${out.result?.name || ''}.${out.result?.format || ''}`);
        return;
    }
    // [ux6] automation page
    if (actionId === 'taskTab') { taskTab = ['runs', 'trade', 'coding'].includes(id) ? id : 'tasks'; render(); return; }
    if (actionId === 'tradeHome') { taskTab = 'trade'; await navigate('tasks'); return; } // [v0.52.2]
    if (actionId === 'taskFilter') { taskFilter = ['active', 'paused'].includes(id) ? id : 'all'; render(); return; }
    if (actionId === 'taskRuns') { taskTab = 'runs'; runTaskFilter = id || 'all'; runStatus = 'all'; runTrigger = 'all'; render(); return; }
    if (actionId === 'taskEditorToggle') { $('#modal')?.close(); return handle('toggleTask', id); }
    if (actionId === 'taskEditorRun') { $('#modal')?.close(); return handle('runTask', id); }
    if (actionId === 'connectorSoon') { toast('这种连接正在开发中，很快会加入'); return; }
    if (actionId === 'connectorSync') {
        toast('正在同步…');
        const out = await invoke('connector', { action: 'sync', id });
        applyState(out.state); render();
        toast(out.result?.error ? '同步失败：' + out.result.error : `同步完成，新增 ${out.result?.added || 0} 条`);
        return;
    }
    if (actionId === 'connectorRemove') {
        const c = (state.connectors || []).find(x => x.id === id);
        modal('断开连接', `<p>断开「${escape(c?.name || '')}」后，已同步到本机的内容和保存的凭据会一起删除。</p>`, '断开', async () => { const out = await invoke('connector', { action: 'remove', id }); applyState(out.state); render(); });
        return;
    }
    if (actionId === 'connectorItems') {
        const c = (state.connectors || []).find(x => x.id === id);
        modal(c?.name || '同步内容', connectorItemsView(state, id, { action, date }), '关闭', async () => {});
        return;
    }
    if (actionId === 'connectorOpen') { const r = await invoke('openBrowser', { url: id, external: true }); if (r?.error) throw new Error(r.error); return; }
    // [p2-m3] feed
    if (actionId === 'skipTask') { await update('task', { id, skipNext: true }); toast('已跳过这次，下次按计划执行'); return; } // [p2-m5]
    // [p2-m4] briefing
    if (actionId === 'briefingGenerate') { toast('正在生成简报…'); await update('briefingGenerate'); toast('简报已生成'); return; }
    if (actionId === 'briefingSettings') { modal('简报设置', briefingForm(state), '保存', async f => update('briefingSettings', briefingPayload(f))); return; }
    if (actionId === 'rpOpen') { await navigate('research'); return; } // [v0.53] 投研资料
    if (actionId === 'rpStock') { rpStock = id || ''; render(); return; }
    if (actionId === 'rpKind') { rpKind = id || ''; render(); return; }
    if (actionId === 'rpSearch') { rpQuery = ($('#rpQuery')?.value || '').trim(); render(); return; }
    if (actionId === 'rpQuery') { rpQuery = ''; render(); return; }
    if (actionId === 'datasetLabel') { toast('正在用日 K 线标注之后的涨跌…'); const out = await invoke('dataset', { action: 'label' }); if (out?.state) applyState(out.state); render(); toast(`已标注 ${out?.result?.labelled || 0} 条`); return; }
    if (actionId === 'datasetExport') { const out = await invoke('dataset', { action: 'export', format: id === 'jsonl' ? 'jsonl' : 'csv', target: id === 'project' ? 'project' : '' }); if (out?.state) applyState(out.state); const r = out?.result || {}; if (!r.cancelled) toast(`已导出 ${r.count} 条 → ${r.file}`); return; }
    if (actionId === 'feedFilter') { feedFilter = id || 'important'; render(); return; }
    if (actionId === 'feedSeen') { await update('feed', { action: 'seen' }); toast('已全部标为已读'); return; }
    if (actionId === 'feedDismiss') { await update('feed', { action: 'dismiss', id }); return; }
    if (actionId === 'feedRestore') { await update('feed', { action: 'restore' }); return; }
    if (actionId === 'gotoPending') {
        const first = approvalRequests().find(item => item.channel === 'scheduled' && !item.decision);
        if (first) return jumpToApproval(first.requestId);
        return;
    }
    if (actionId === 'editTask') { // [p2-m1]
        const t = state.tasks.find(t => t.id === id); if (!t) return;
        modal('编辑定时任务', taskEditor(state, t), '保存', async (f) => update('task', taskPayload(f, id))); // [ux6]
        $('#modal')?.classList.add('task-modal');
        return;
    }
    if (actionId === 'cancelTask' || actionId === 'cancelRun') {
        await invoke(actionId, {id}); await update('state'); return;
    }
    if (actionId === 'runTask') {
        toast('任务开始执行，可稍后刷新状态');
        const result = invoke('runTask', { id, requestId:crypto.randomUUID() });
        await new Promise(r => setTimeout(r, 150));
        applyState(await invoke('state'));
        render();
        applyState(await result);
        render();
        toast('任务执行已结束');
        return;
    }
    if (actionId === 'toggleTask') {
        await update('task', { id, enabled: !state.tasks.find(t => t.id === id).enabled });
        return;
    }
    if (actionId === 'taskResult') {
        const t = state.tasks.find(t => t.id === id);
        modal(t.name, `<pre>${escape(t.result)}</pre>`);
        return;
    }
    if (actionId === 'refresh') {
        await update('state');
        return;
    }
    if (actionId === 'runner') {
        await invoke('openRunner');
        toast('已打开本地 Office 执行器');
        return;
    }
    if (actionId === 'saveMessage' || actionId === 'exportMessage') {
        const c = state.chats.find(c => c.id === chatId), m = c.messages[Number(id)];
        if (actionId === 'saveMessage') {
            await update('artifact', { name: c.name, text: m.content });
            toast('已保存到成果中心');
        }
        else {
            const docs=messageDocuments(state,c,m);
            if(docs.length===1)await invoke('documentExport',{id:docs[0].id,revision:docs[0].revision});
            else if(docs.length){modal('下载生成文件',docs.map(d=>action(d.name+'.'+d.format,'documentExport',d.id)).join(''));}
            else await invoke('exportText', { name: c.name, text: m.content });
        }
        return;
    }
    if (actionId === 'exportChat') {
        const c = state.chats.find(c => c.id === chatId);
        if (!c?.messages.length)
            throw new Error('暂无可导出的对话');
        await invoke('exportText', { name: c.name, text: c.messages.map(m => `## ${m.role === 'user' ? '你' : 'QuanK'}\n\n${m.content}`).join('\n\n') });
        return;
    }
    if (actionId === 'viewArtifact' || actionId === 'exportArtifact') {
        const a = state.artifacts.find(a => a.id === id);
        if (actionId === 'viewArtifact')
            openPreview({ id: 'artifact:' + id, name: a.name, text: a.text, kind: 'artifact' });
        else
            await invoke('exportText', { name: a.name, text: a.text });
        return;
    }
    const deleteMethods = { deleteArtifact: 'artifact', deleteTask: 'task', deleteMemory: 'memory', deleteAgent: 'agent', deleteChat: 'deleteChat' };
    if (deleteMethods[actionId]) {
        modal('确认删除', '<p>此操作会从当前本地工作空间移除该项目。</p>', '删除', async () => {
            await update(deleteMethods[actionId], { id, remove: true });
            if (actionId === 'deleteChat') {
                chatId = '';
                page = 'home';
                render();
            }
        });
        return;
    }
    if (actionId === 'search') {
        modal('搜索工作空间', '<label>搜索对话、成果、智能体<input id="globalSearch" placeholder="输入关键词"></label><div id="searchResults"></div>');
        $('#globalSearch').oninput = e => { const q = e.target.value.toLowerCase(); $('#searchResults').innerHTML = q ? [...state.chats.map(c => ({ ...c, type: 'openChat' })), ...state.artifacts.map(a => ({ ...a, type: 'viewArtifact' })), ...state.agents.map(a => ({ ...a, type: 'useAgent' }))].filter(x => x.name.toLowerCase().includes(q)).slice(0, 20).map(x => `<div class="file-row"><div>${escape(x.name)}</div><button class="secondary" data-action="${x.type}" data-id="${x.id}" data-search-result="true">打开</button></div>`).join('') || '<p>未找到匹配项目</p>' : ''; };
        return;
    }
}
document.addEventListener('click', async (e) => {
    const menu = e.target.closest('.file-menu');
    for (const opened of document.querySelectorAll('.file-menu[open]')) {
        if (opened !== menu || e.target.closest('[data-action]')) opened.open = false;
    }
    const b = e.target.closest('button');
    if (!b)
        return;
    if(b.dataset.action)e.preventDefault();
    try {
        if (b.dataset.searchResult)
            $('#modal').close();
        if (b.dataset.page)
            await navigate(b.dataset.page);
        else if (b.dataset.action)
            await handle(b.dataset.action, b.dataset.id, b.dataset.action === 'codingSettings' ? b : undefined);
    }
    catch (err) {
        toast(err.message);
    }
});
document.addEventListener('toggle', e => {
    const d = e.target;
    if (!d.matches?.('details[data-detail]') || !d.isConnected)
        return;
    if (d.open)
        openedDetails.add(d.dataset.detail);
    else
        openedDetails.delete(d.dataset.detail);
    document.querySelectorAll('details[data-detail]').forEach(other => {
        if (other !== d && other.dataset.detail === d.dataset.detail && other.open !== d.open)
            other.open = d.open;
    });
}, true);
document.addEventListener('keydown', e => {
    // [p1-m4] Cmd/Ctrl+B: keep the current task running in the background and start a new one
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && !$('#modal').open && page === 'chat' && chatLive()) {
        e.preventDefault();
        handle('new').then(() => toast('已转到后台继续执行，完成后会通知你')).catch(e => toast(e.message));
        return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && !$('#modal').open) {
        e.preventDefault();
        handle('new').catch(e => toast(e.message));
    }
});
// [v0.54] ---- right-hand page tabs ----
const PAGE_TITLES = { market: '行情', quant: '量化', graph: '知识图谱', context: '我的上下文', connectors: '连接', memory: '记忆', research: '投研资料', portfolio: '组合与风控' };
function bindOnce(el, type, fn) { if (!el) return; const k = type + ':' + fn.toString(); el.__qkBound ||= new Set(); if (el.__qkBound.has(k)) return; el.__qkBound.add(k); el.addEventListener(type, fn); } // the panel DOM persists across renders
// [v1.0.0] 不再持久化 wide（始终写 false），旧版本读到也不会进入展开态。
function savePanel() { try { localStorage.setItem('qk.pageTabs', JSON.stringify({ tabs: pageTabs.map(({ scroll, ...t }) => t), active: pageTabId, wide: false, width: pageWidth })); } catch {} }
// [v0.58.1 D2] 兜底还原：清掉 pp-wide 与内存展开态，让 .main 恢复显示。
function recoverMain() {
  if (!pageWide && !document.body.classList.contains('pp-wide')) return;
  pageWide = false;
  document.body.classList.remove('pp-wide');
  savePanel();
}
function panelTab() { return panelUI.activeTab(pageTabs, pageTabId); }
function panelShows(p) { const t = !state.locked && panelTab(); return !!t && t.kind === 'page' && t.page === p && t.page !== page; }
function stockName(code) { return (state.quant?.pool || []).find(p => p.code === code)?.name || code; }
function keepPanelScroll() { const el = document.querySelector('#pagePanel .pp-body'), t = panelTab(); if (el && t) t.scroll = el.scrollTop; }
function setPanelActive(id) { keepPanelScroll(); pageTabId = id || ''; const t = panelTab(); quantOpen = t?.kind === 'stock' ? t.code : ''; quantDetailData = quantOpen ? quantCache.get(quantOpen) ?? null : null; }
function openPanelTab(tab) { keepPanelScroll(); pageTabs = panelUI.openTab(pageTabs, tab).tabs; setPanelActive(tab.id); savePanel(); }
function closePanelTab(id) { const r = panelUI.closeTab(pageTabs, id, pageTabId); pageTabs = r.tabs; setPanelActive(r.active); savePanel(); render(); }
function openDocumentPreview(id) {
    const d = state.documents?.find(item => item.id === id);
    if (!d) return false;
    openPanelTab(panelUI.documentTab(id, d.name + '.' + d.format, d.format));
    render();
    return true;
}
function openMarketStockTab({code, period, name}) {
    setKlinePeriod(code, period);
    const tab = panelUI.marketStockTab(code, name, period);
    tab.chartRevision = (pageTabs.find(t => t.id === tab.id)?.chartRevision || 0) + 1;
    openPanelTab(tab);
    render();
}
async function openPageTab(p) {
    if (panelUI.MAIN_ONLY.has(p)) return navigate(p, true);
    openPanelTab(panelUI.pageTab(p, nav.find(n => n[0] === p)?.[2] || PAGE_TITLES[p] || p));
    if (p === 'files') await loadFiles(); else render();
}
function bindPanelResize(host) {
    host.querySelector('.pp-resize').addEventListener('mousedown', e => {
        e.preventDefault(); document.body.classList.add('pp-resizing');
        const move = ev => { pageWidth = panelUI.clampWidth(innerWidth - ev.clientX, innerWidth); host.style.setProperty('--pp-w', pageWidth + 'px'); paintApprovalSummaries(host); };
        const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); document.body.classList.remove('pp-resizing'); savePanel(); };
        addEventListener('mousemove', move); addEventListener('mouseup', up);
    });
}
function renderPanel() {
    clearOfficeNotice();
    let host = document.getElementById('pagePanel');
    const tab = !state.locked && panelTab();
    if (!tab) { disposeFilePreview?.(); disposeFilePreview = undefined; host?.remove(); pageWide = false; document.body.classList.remove('pp-on', 'pp-wide'); panelHeadHtml = panelBodyKey = ''; return; }
    try { renderPanelTab(host, tab); }
    catch (error) {
        // [v1.0.0] 页签渲染失败时不能把整个应用拖成白屏：退出展开态、恢复主区域，并在页签里给出可关闭的错误。
        console.error('[pagePanel] render failed', error);
        pageWide = false; document.body.classList.remove('pp-wide');
        const body = document.querySelector('#pagePanel .pp-body');
        if (body) body.innerHTML = '<div class="pp-error">页面加载失败，已恢复主界面。<button data-action="ppClose" data-id="' + escape(tab.id) + '">关闭此页签</button></div>';
    }
}
// [v1.0.0] 原 renderPanel 的主体（自 `if (!host) {` 起至函数结束）原样移入 renderPanelTab(host, tab)，
// 其中 host 为 null 时按原逻辑创建；仅把函数边界拆开以便上面的 try/catch 兜底。实现时整体剪切，不改内部逻辑。
function renderPanelTab(host, tab) {
    if (!host) {
        host = document.createElement('aside'); host.id = 'pagePanel'; host.className = 'page-panel'; host.setAttribute('aria-label', '页面页签');
        host.innerHTML = '<div class="pp-resize" title="拖动调整宽度"></div><header class="pp-head"></header><div class="pp-body"></div>';
        document.body.insertBefore(host, document.getElementById('modal')); bindPanelResize(host);
    }
    if (pageTabId !== tab.id) setPanelActive(tab.id);
    document.body.classList.add('pp-on'); document.body.classList.toggle('pp-wide', pageWide);
    host.style.setProperty('--pp-w', panelUI.clampWidth(pageWidth, innerWidth) + 'px');
    const head = panelUI.panelHead({ tabs: pageTabs, active: tab.id, wide: pageWide, icon });
    if (head !== panelHeadHtml) { host.querySelector('.pp-head').innerHTML = head; panelHeadHtml = head; }
    let body, key;
    if (tab.kind === 'coding-task') {
        const task = codingTaskDetails.get(tab.taskId);
        body = codingTaskPage(task, { action, date,
            approvals: approvalRequests().filter(item => item.codingTaskId === tab.taskId) });
        key = tab.id + '\n' + body;
        if (!task && !tab.loading) {
            tab.loading = true;
            void loadCodingTask(tab.taskId).then(() => renderPanel()).catch(() => {});
        }
    } else if (tab.kind === 'document') {
        const d = state.documents?.find(item => item.id === tab.documentId);
        body = d ? filePreviewPanel(d, {action, icon, native: state.officeNative, inTab:state.officeInTab}) : '<p>文件已从成果中心移除。</p>';
        key = tab.id + '\n' + (d ? (state.officeInTab && ['docx','pptx','xlsx'].includes(d.format) ? 'office' : d.revision + ':' + state.officeNative) : 'missing');
    } else if (tab.kind === 'market-stock') {
        if (!tab.chartRevision) setKlinePeriod(tab.code, tab.period);
        body = marketPage(state, {action, date, stock: tab.code});
        key = tab.id + ':' + (tab.period || '') + ':' + (tab.chartRevision || 0);
    } else if (tab.kind === 'page' && tab.page === page) { body = panelUI.panelBusy(tab); key = 'busy:' + tab.id; }
    else {
        const saved = page; page = tab.page; renderingStockTab = tab.kind === 'stock' ? tab : undefined; renderingStock = renderingStockTab?.code || '';
        try { body = content(); } catch (e) { body = `<div class="pp-same"><p>页面加载失败：${escape(e.message)}</p></div>`; } finally { page = saved; renderingStock = ''; renderingStockTab = undefined; }
        key = tab.kind === 'stock' ? `${tab.id}\n#${quantVer.get(tab.code) || 0}:${tab.section || ''}` : `${tab.id}\n${body}`; // a stock detail only changes when it is (re)computed
    }
    const el = host.querySelector('.pp-body');
    el.classList.toggle('pp-file-body', tab.kind === 'document');
    if (key !== panelBodyKey) { disposeFilePreview?.(); disposeFilePreview = undefined; const same = panelBodyKey.split('\n')[0] === key.split('\n')[0];
        const openFolds = same && tab.kind === 'coding-task' ? new Map([...el.querySelectorAll('[data-coding-fold]')].map(item => [item.dataset.codingFold, item.open])) : new Map();
        el.innerHTML = body;
        for (const fold of el.querySelectorAll('[data-coding-fold]')) if (openFolds.has(fold.dataset.codingFold)) fold.open = openFolds.get(fold.dataset.codingFold); panelBodyKey = key; if (!same) el.scrollTop = tab.scroll || 0;
        const preview = el.querySelector('.file-preview-panel');
        if (preview) {
            // v0.58.1: the right tab is a read-only preview only. Editing lives in the
            // dedicated edit window; no canvas/attachView/toolbar is mounted here.
            const disposePreview = mountFilePreviewPanel(preview, invoke, () => state.officeEngine?.phase === 'ready');
            const banner = preview.querySelector('[data-office-editing]');
            if (banner) banner.hidden = !editingWindows.has(banner.dataset.id);
            disposeFilePreview = disposePreview;
        }
    }
    paintApprovalSummaries(host);
    if (tab.kind === 'stock' && !quantCache.has(tab.code) && !quantLoading.has(tab.code)) setTimeout(() => handle('quantOpen', tab.code).catch(err => toast(err.message)), 0);
}
document.addEventListener('click', e => { if (e.target.closest?.('#pagePanel')) panelClickAt = Date.now(); }, true);
addEventListener('resize', () => { paintApprovalSummaries(); const h = document.getElementById('pagePanel'); if (h) h.style.setProperty('--pp-w', panelUI.clampWidth(pageWidth, innerWidth) + 'px'); });
async function boot() {
    try {
        if (api) {
            applyState(await invoke('state'));
            if (!state.locked && api.codingTasks) await loadCodingTasks();
        }
        render();
    }
    catch (e) {
        $('#app').textContent = '工作空间加载失败：' + e.message;
    }
}
let runtimeTimer;
api?.onOfficeWindow?.(event => {
    if (!event?.id) return;
    if (event.type === 'open') editingWindows.add(event.id);
    if (event.type === 'close') editingWindows.delete(event.id);
    if (event.type === 'saved') { void update('state').catch(() => {}); return; }
    renderPanel();
});
api?.onCodingTask?.(refreshCodingTasks);
async function openCodingPage(p) {
    const task = p?.page === 'coding-task' ? p.taskId : p?.coding?.task;
    if (typeof task === 'string' && ['tasks', 'agents', 'coding-task'].includes(p.page)) {
        taskTab = 'coding';
        await navigate('tasks', true);
        await handle('codingTaskOpen', task);
        return true;
    }
    if (p?.page === 'agents' && p.coding) {
        capabilityTab = 'agents';
        agentCategory = 'coding';
        await openPageTab('agents');
        return true;
    }
    return false;
}
api?.onOpenPage?.(async p => {
    if (p?.page === 'office-result') {
        try {
            await update('state');
            await handle('documentView', p.docId);
            if (p.history) await handle('documentHistory', p.docId);
            else if (p.target) document.querySelector('#pagePanel .file-preview-main')?.dispatchEvent(new CustomEvent('office-locate', {detail:p.target}));
        } catch (error) { toast(error.message); }
        return;
    }
    if (p?.page === 'office-close') {
        try {
            await update('state');
            await handle('documentView', p.docId);
            const host = document.querySelector('#pagePanel .file-preview-main');
            if (!host) throw Error('Office 页签不可用');
            panelUI.showOfficeDecision(host, '退出前处理未保存修改', [
                ['save','保存并退出',true], ['discard','放弃修改'], ['cancel','取消退出'],
            ], choice => invoke('officeCloseDecision', {token:p.token, choice}));
        } catch (error) {
            await invoke('officeCloseDecision', {token:p.token, choice:'cancel'}).catch(() => {});
            toast(error.message);
        }
        return;
    }
    if (p?.page === 'notice') { if (!state.locked) toast(p.message); return; }
    if (p?.page === 'approval') {
        try { applyState(await invoke('state')); await loadCodingTasks(); await jumpToApproval(p.requestId); }
        catch (error) { toast(error.message); }
        return;
    }
    if (await openCodingPage(p).catch(e => { toast(e.message); return true; })) return;
 if (p?.page === 'library' && p.document) { Promise.resolve(update('state')).then(() => handle('documentView', String(p.document))).catch(e => toast(e.message)); return; } /* [F2] */ if (p?.page === 'market') { if (/^\d{6}$/.test(String(p.code))) openMarketStockTab(p); else openPageTab('market'); return; } if (p?.page === 'quant') { if (p.code) handle('quantOpen', String(p.code), {name: p.name, section: p.tab}).catch(e => toast(e.message)); else openPageTab('quant'); return; } if (p?.page === 'tasks' && p.tab) { taskTab = ['trade', 'runs', 'coding'].includes(p.tab) ? p.tab : 'tasks'; openPageTab('tasks'); return; } /* [v0.52.2] */ if (p?.page === 'research') { rpStock = /^\d{6}$/.test(String(p.stock || '')) ? String(p.stock) : ''; rpKind = typeof p.kind === 'string' ? p.kind : ''; rpQuery = ''; openPageTab('research'); return; } /* [v0.53.1] */ if (['home', 'feed', 'studio', 'tasks', 'library', 'files', 'agents', 'connectors', 'tools', 'graph', 'context', 'security'].includes(p?.page)) openPageTab(p.page); if (p?.page === 'agents' && p.mcp && typeof p.mcp === 'object') { capabilityTab = 'mcp'; render(); setTimeout(() => handle(p.mcp.preset ? 'newPresetMcp' : 'newMcp', String(p.mcp.preset || '')).catch(e => toast(e.message)), 0); } if (p?.page === 'connectors' && p.connector && typeof p.connector === 'object') setTimeout(() => handle('connectorPrefill', JSON.stringify(p.connector)).catch(e => toast(e.message)), 0); }); // [p2-m4][ux5][ux9]
api?.onOpenChat?.(p => { if (p?.id && state.chats.some(c => c.id === p.id)) handle('openChat', p.id).catch(e => toast(e.message)); });
api?.onRuntime?.(() => {
    clearTimeout(runtimeTimer);
    runtimeTimer = setTimeout(async () => {
        try {
            const wasLocked = !!state.locked, officePhase = state.officeEngine?.phase, next = await invoke('state');
            const approvalChanged = JSON.stringify([state.inlineApprovals, state.pendingApprovals, state.resolvedApprovals]) !==
                JSON.stringify([next.inlineApprovals, next.pendingApprovals, next.resolvedApprovals]);
            if (approvalChanged && next.inlineApprovals?.some(item => !item.decision) && $('#modal')?.open && $('#modalSubmit')?.disabled) $('#modal').close();
            applyState(next);
            if (wasLocked && !state.locked && api.codingTasks) await loadCodingTasks();
            if (wasLocked !== !!state.locked || state.locked) render(); // [F5] lock / unlock
            else if (approvalChanged || !$('#modal').open && (officePhase !== state.officeEngine?.phase || ['chat', 'tools', 'tasks', 'security'].includes(page) || ['tools', 'tasks', 'security', 'feed'].some(panelShows)))
                render();
            else if (!$('#modal').open) { marketRefreshView(); signalPopups(); } // [F1] [v0.53.1] buy / sell popups also on pages that do not re-render (工作台, 资料库 …)
        }
        catch (e) {
            toast(e.message);
        }
    }, 120);
});
const streamUpdates = new Map();
const liveStreams = new Map();
let appVersion = ''; // [v0.52] shown next to the brand
function applyState(next) {
    if (next?.appVersion) appVersion = String(next.appVersion);
    if (next?.locked) { localApprovals.clear(); expandedApprovals.clear(); codingCandidates = null; codingTestResults.clear(); codingTaskList = []; codingTaskDetails.clear(); codingTaskRevision++; clearTimeout(codingTaskPaint); codingTaskPaint = undefined;
        for (const tab of pageTabs) if (tab.kind === 'coding-task') delete tab.loading; state = { locked: true, lock: next.lock || {}, chats: [], folders: [], memories: [], agents: [], tasks: [], artifacts: [], activity: [], settings: { name: '' } }; return; } // [F5]
    if (state.locked) { state = { ...next }; state.tasks ??= []; return; }
    for (let i=0;i<(next.runJobs || []).length;i++) {
        const incoming=next.runJobs[i],old=(state.runJobs || []).find(j=>j.id===incoming.id);
        if (old && old.revision > incoming.revision) next.runJobs[i]=old;
    }
    for (let i=0;i<next.tasks.length;i++) {
        const incoming=next.tasks[i],old=state.tasks.find(t=>t.id===incoming.id);
        if (old && ((old.lastRun || 0) > (incoming.lastRun || 0) ||
            (old.runId && old.runId===incoming.runId && (old.runRevision || 0) > (incoming.runRevision || 0)))) next.tasks[i]=old;
    }
    for (let i = 0; i < next.chats.length; i++) {
        const incoming = next.chats[i], previous = state.chats.find(c => c.id === incoming.id);
        if (previous?.run && ((previous.run.id === incoming.run?.id && (previous.run.revision || 0) > (incoming.run.revision || 0)) || previous.run.startedAt > (incoming.run?.startedAt || 0) || (previous.run.id === incoming.run?.id && !['queued','running','cancelling'].includes(previous.run.status) && ['queued','running','cancelling'].includes(incoming.run.status))))
            next.chats[i] = previous;
    }
    for (const [id, local] of liveStreams) {
        const chat = next.chats.find(c => c.id === local.chatId);
        if (!chat || chat.run?.id !== local.message.runId || chat.run.status !== 'running') {
            liveStreams.delete(id);
            continue;
        }
        const message = chat.messages.find(m => m.id === id);
        if (message?.sequence >= local.message.sequence)
            continue;
        if (message)
            Object.assign(message, local.message);
        else
            chat.messages.push({ ...local.message });
    }
    state = next;
    const engineSettings = $('#officeEngineSettings');
    if (engineSettings && $('#modal').open) engineSettings.innerHTML = officeEngineSettings();
    for(const tabs of [previewTabs,...[...taskWorkspaces.values()].map(w=>w.previewTabs||[])])for(const t of tabs){if(t.documentId){const d=(state.documents||[]).find(d=>d.id===t.documentId);if(d){t.text=d.text;t.name=d.name+'.'+d.format;}}}
}
let streamPaintTimer;
api?.onStream?.(event => {
    if (event?.version !== 1 || event.type !== 'text' || typeof event.content !== 'string' || event.content.length > 4 * 1024 * 1024 || !Number.isSafeInteger(event.sequence))
        return;
    const chat = state.chats.find(c => c.id === event.chatId);
    if (!chat)
        return;
    if (chat.run?.id === event.runId && !['queued','running'].includes(chat.run.status))
        return;
    if (chat.run && chat.run.id !== event.runId && chat.run.startedAt >= event.startedAt)
        return;
    chat.run = { ...chat.run, id: event.runId, status: 'running', startedAt: event.startedAt };
    let message = chat.messages.find(m => m.id === event.messageId);
    if (message && message.sequence >= event.sequence)
        return;
    if (!message) {
        message = { id: event.messageId, role: 'assistant', content: '', runId: event.runId, time: event.time };
        chat.messages.push(message);
    }
    Object.assign(message, { content: event.content, sequence: event.sequence, streaming: true, intermediate: true });
    liveStreams.set(event.messageId, { chatId: event.chatId, message: { ...message } });
    streamUpdates.set(event.messageId, message);
    if (!streamPaintTimer)
        streamPaintTimer = setTimeout(() => {
            streamPaintTimer = undefined;
            if (page !== 'chat' || $('#modal').open)
                return;
            const chat = state.chats.find(c => c.id === chatId);
            let missing = false;
            const scroller = $('.messages-scroll'), stick = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 90;
            for (const message of streamUpdates.values())
                if (message.runId === chat?.run?.id && chat.run.status === 'running') {
                    const node = [...document.querySelectorAll('[data-message-id]')].find(n => n.dataset.messageId === message.id);
                    if (node) {
                        node.querySelector('.message-content').innerHTML = rich(message.content);
                        node.dataset.streaming = 'true';
                    }
                    else
                        missing = true;
                }
            streamUpdates.clear();
            if (missing)
                render();
            else if (stick && scroller)
                scroller.scrollTop = scroller.scrollHeight;
        }, 40);
});
// [F1f] drag files onto the composer, or paste a screenshot / copied file into it, to attach
async function ingestComposerFiles(list) {
    for (const f of list.slice(0, 8)) {
        try {
            if (f.size > 32 * 1024 * 1024) throw Error(`${f.name || '文件'} 超过 32 MB`);
            const image = /^image\/(png|jpeg)$/.test(f.type) || /\.(png|jpe?g)$/i.test(f.name || '');
            const name = f.name || (image ? `截图-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.png` : '附件');
            const scope = chatId, presentPage = page;
            const row = await invoke('chatDropImport', { name, kind: image ? 'image' : 'file', bytes: new Uint8Array(await f.arrayBuffer()) });
            applyState(await invoke('state'));
            if (!state.locked && api.codingTasks) await loadCodingTasks();
            if (scope !== chatId || presentPage !== page) { toast('已保存到本机，可在＋菜单里附加'); continue; }
            if (image) { if (images.length >= 8) throw Error('每次最多8张图片'); images.push(row); toast('已添加图片；勾选「本轮发送图片给模型」后随消息发送'); }
            else { const added = row?.attachments || []; if (files.length + added.length > 32) throw Error('合计超过32份附件，请分批添加'); files.push(...added); toast(`已添加 ${name}`); }
        } catch (e) { toast(e.message); }
    }
    render();
}
document.addEventListener('dragover', e => { if (!e.dataTransfer?.types?.includes('Files')) return; e.preventDefault(); const c = e.target.closest?.('.composer'); document.querySelectorAll('.composer.drop-on').forEach(x => x !== c && x.classList.remove('drop-on')); if (c) { c.classList.add('drop-on'); e.dataTransfer.dropEffect = 'copy'; } else e.dataTransfer.dropEffect = 'none'; });
document.addEventListener('dragleave', e => { const c = e.target.closest?.('.composer'); if (c && !c.contains(e.relatedTarget)) c.classList.remove('drop-on'); });
document.addEventListener('drop', e => { if (!e.dataTransfer?.types?.includes('Files')) return; e.preventDefault(); const c = e.target.closest?.('.composer'); document.querySelectorAll('.composer.drop-on').forEach(x => x.classList.remove('drop-on')); if (c) ingestComposerFiles([...e.dataTransfer.files]); });
document.addEventListener('paste', e => { if (e.target?.id !== 'prompt') return; const list = [...(e.clipboardData?.files || [])]; if (!list.length) return; e.preventDefault(); ingestComposerFiles(list); });
document.addEventListener('click', event => { const row = event.target.closest?.('.feed-row[data-feed].unread'); if (row) update('feed', { action: 'read', id: row.dataset.feed }).catch(() => {}); }); // [F1e] opening a feed item marks it read
document.addEventListener('click', event => { const link = event.target.closest('a.rendered-link'); if (!link)
    return; event.preventDefault(); const url = link.getAttribute('href'); if (url && /^https?:\/\//i.test(url))
    invoke('openBrowser', { url }).catch(error => toast(error.message)); });
boot();

// A preview frame has no native bridge. Reconcile its explicit selection on the host.
document.addEventListener('office-selection',async e=>{
 const scope=chatId;try{
  const selected=await invoke('documentSelection',e.detail.input);
  if(scope!==chatId)return;
  if(e.detail.action==='edit'){
   if(selected.kind!=='text'||!selected.editable)throw Error('此选区仅可附加问答，复杂段落不能直接编辑');
   modal('编辑选中文字','<p>仅替换以下选区，保留未修改文字与其他文档部件。</p><blockquote>'+escape(selected.text)+'</blockquote>'+area('替换为','replacement',selected.text),'保存Word新版本',async f=>{const r=await invoke('documentSelectionReplace',{...e.detail.input,replacement:f.get('replacement')});if(r.status!=='succeeded')throw Error('未保存选区');await update('state');toast('已保存选区修改，原件保留');});return;
  }
  if(selections.length>=3)throw Error('每轮最多3处选区');selections.push(selected);toolsEnabled=true;page=chatId?'chat':'home';render();$('#prompt')?.focus();toast('选区已附加，发送后交给当前模型；修改范围受限于选区');
 }catch(err){toast(err.message);}
});

// Explicit double-click opens an owned Office editor window; never infer filesystem paths.
document.addEventListener('dblclick',event=>{if(!state.officeWorkspace||event.target.closest('button,a,input,textarea'))return;const card=event.target.closest('[data-document]');const d=state.documents?.find(d=>d.id===card?.dataset.document);if(d&&['docx','xlsx','pptx'].includes(d.format))openDocumentOffice(d).catch(e=>toast(e.message));});

// [p1-m2] right-click a conversation in the sidebar for its actions
// [p2-m1] task form: show only the fields that belong to the chosen cadence
document.addEventListener('change', e => { if (e.target?.matches?.('[data-schedule-kind]')) e.target.closest('.task-form').dataset.kind = e.target.value; });
document.addEventListener('contextmenu', e => { const row = e.target.closest?.('[data-chat-row]'); if (!row) return; e.preventDefault(); handle('chatMenu', row.dataset.chatRow).catch(err => toast(err.message)); });
