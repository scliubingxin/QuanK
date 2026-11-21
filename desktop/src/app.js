import {bindPresetFilters, plazaIcon} from './ui/preset-catalog.js'; // [ux11] plazaIcon
import {agentAvatar} from './ui/avatars.js';
import {codeProjectsView} from './ui/code-projects.js';
import {createComposerImages} from './ui/composer-images.js';
import {compactComposer,createComposerMenus} from './ui/composer.js';
import {modelPicker,modelLibrary,modelForm,bindModelForm,modelChoiceLabel} from './ui/models.js';
import {legacyRoundLimit} from './ui/legacy-round-limit.js';
import {capabilityTabs,skillsPage,mcpPage,mcpAuthFields,mcpForm,bindMcpForm,mcpPayload} from './ui/capability-library.js';
import {agentEditor,bindAgentEditor,readAgentEditor} from './ui/agent-editor.js';
import {imageCards} from './ui/image-cards.js';
import {mountHtmlPreview} from './ui/html-preview.js';
import {installChatMedia} from './ui/chat-media.js';
import {mountOfficePreview} from './ui/office-preview.js';
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
import { matchCommands, helpHtml, contextMeter } from './ui/slash.js';
import { contextUsage } from './shared/context.js';
import { readPlanSteps } from './ui/plan.js';
import { taskForm, taskCards, taskPayload } from './ui/tasks.js';
import { automationPage, taskEditor } from './ui/automation.js'; // [ux6]
import { pendingApprovalsPanel, approvalRulesPanel, pendingBanner } from './ui/approvals.js';
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
import { marketPage, marketHomeCard, mountKlineBoxes, marketAlertForm, marketAlertPayload, sectorStocksView } from './ui/market.js';
import { connectorsPage, connectorForm, connectorPayload, connectorItemsView, mailComposeForm, mailComposePayload, officeMessageForm, officeMessagePayload } from './ui/connectors.js';
import { feedUnread } from './shared/feed.js';
function viewContext() { return { state, chatId, pending, previewTabs, previewId, previewSource, previewZoom, sideTab, icon, composer, action, date, taskStatus, trace, executionRecords, executionRow, rich, htmlPreview, previewHtml, previewInteractive, openedDetails, recap }; }
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
const paths = { spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z', chat: 'M5 4h14v12H9l-4 4Z', folder: 'M3 7V5h6l2 3h10v12H3Z', grid: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z', agent: 'M5 7h14v13H5ZM12 3v4M8 12h1m6 0h1m-7 4h6', clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', settings: 'M4 7h16M4 17h16M8 4v6m8 4v6', search: 'M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm6-2 6 6', plus: 'M12 5v14M5 12h14', arrow: 'M5 12h14m-5-5 5 5-5 5', up: 'M12 20V4m-6 6 6-6 6 6', file: 'M5 3h9l5 5v13H5Zm9 0v6h5M8 13h8m-8 4h6', link: 'm9 15 6-6M8 17l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 8a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1', check: 'm5 12 4 4L19 6', close: 'm5 5 14 14M5 19 19 5', activity: 'M3 12h4l3-8 4 16 3-8h4', trend: 'M3 17l6-6 4 4 8-8M15 7h6v6', download: 'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4', shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z', stop: 'M6 6h12v12H6Z' };
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.spark}"/></svg>`;
const pendingChats=new Set();
let state = { chats: [], folders: [], memories: [], agents: [], tasks: [], artifacts: [], activity: [], settings: { model: '尚未配置', name: '我的工作空间' } }, page = 'home', chatId = '', agentId = 'assistant', files = [], images = [], sendImages = false, pending = false, folderId = '', fileResults = [], fileTruncated = false, searchTerm = '', draft = '', toolsEnabled = true, activeCommand = '', toolDraft = { url: 'https://example.com', executable: 'node', args: '["--version"]', folderId: '', relative: '' };
let selections=[];
let modelChoice='legacy',modelEffort='';
let capabilityTab='agents';const busyMcp=new Set();
const nav = [['home', 'chat', '工作台'], ['feed', 'activity', '动态'], ['library', 'grid', '成果中心'], ['studio', 'spark', '创作'], ['files', 'folder', '本地文件'], ['agents', 'agent', '智能体'], ['tools', 'activity', '浏览器与权限'], ['tasks', 'clock', '自动化'], ['quant', 'trend', '量化'], ['market', 'trend', '行情'], ['connectors', 'link', '连接'], ['graph', 'search', '知识图谱'], ['context', 'spark', '记忆库']];
let memoryFilter = 'all', memoryQuery = '', incognito = false, planMode = false, researchMode = false, feedFilter = 'all'; // [p1-m1][p1-m2][p1-m5][p1-m6][p2-m3]
let graphQuery = '', graphType = 'all'; // [p3-m5]
let graphMode = 'graph', graphFocus = '', graphSelected = '', graphMount = null; const graphCache = {}; // [ux4]
let studioTab = 'dashboards', dashView = null; // [p4-m1]
let miniappOpenId = '', miniappDispose = null, miniappVersionsFor = ''; // [p4-m4]
let quantOpen = '', quantDetailData = null, quantDisposers = []; // [q1]
let marketTab = 'industry', marketStockCode = '', marketPingAt = 0; // [F1]
let taskTab = 'tasks', taskFilter = 'all', runStatus = 'all', runTaskFilter = 'all', runTrigger = 'all'; // [ux6]
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
function executionRow(r) { const output = r.tool === 'cli_execute' ? [r.partial || r.result?.stdout || '', r.result?.stderr ? 'stderr:\n' + r.result.stderr : '', r.result?.error || '', r.result?.exitCode !== undefined ? '退出码：' + r.result.exitCode : ''].filter(Boolean).join('\n') : JSON.stringify(r.result || {}, null, 2); return `<details class="execution-step" data-detail="${escape(r.id)}" ${openedDetails.has(r.id) ? 'open' : ''}><summary>${icon(r.tool === 'cli_execute' ? 'activity' : 'link')}<span>${toolNames[r.tool] || escape(r.tool)}</span><span class="step-status ${['failed', 'denied', 'cancelled', 'interrupted'].includes(r.status) ? 'issue' : ''}">${escape(statusNames[r.status] || r.status)}</span><span class="step-time">${r.finishedAt ? ((r.finishedAt - r.time) / 1000).toFixed(1) + 's' : date(r.time)}</span></summary><div class="step-detail"><b>实际参数</b><pre>${escape(JSON.stringify(r.command || r.receipt || r.args, null, 2))}</pre>${output && output !== '{}' ? `<b>执行结果</b><pre>${escape(output)}</pre>` : ''}${r.status === 'pending_approval' ? '<p>请在系统确认窗口核对目标与参数；此处不能代替原生授权。</p>' : ''}</div></details>`; }
function commandQueue() { return views.commandQueue({state, action, date, statusNames}); }
function trace(runId) { const rows = executionRecords(runId); return rows.length ? `<section class="run-trace" aria-label="实际执行过程"><div class="trace-label">${icon('activity')}执行过程 · ${rows.length} 步</div>${rows.map(executionRow).join('')}</section>` : ''; }
function openPreview(item) {
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
function toast(message) { $('#toast').textContent = message; $('#toast').style.display = 'block'; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').style.display = 'none', 4500); }
async function invoke(name, payload) {
    if (!api)
        throw new Error('当前为界面预览。请通过 npm start 启动桌面应用以使用此功能。');
    try { if(typeof api?.[name] !== 'function')throw Error('当前窗口缺少此功能接口，请完全退出 QuanK 后重新打开；若仍失败请更新应用。'); return await api[name](payload); }
    catch(error) { throw new Error(String(error?.message||'操作失败，请重试').replace(/^Error invoking remote method ['"][^'"]+['"]:\s*(?:Error:\s*)?/,'').replace(/^Error:\s*/,'')); }
}
async function update(name, payload) { applyState(await invoke(name, payload)); render(); return state; }
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
const officeWorkspace = createOfficeWorkspace($('#app'), host => host.classList.contains('html-host')?mountHtmlPreview(host):mountOfficePreview(host, invoke));
window.addEventListener('pagehide', () => officeWorkspace.dispose());
// [p1-m4] a chat that finishes while the user is watching it is simply marked seen (no recap)
const seenRequests = new Set();
function autoSeen() { const c = page === 'chat' && state.chats.find(c => c.id === chatId); if (!c?.unread || seenRequests.has(c.id) || (typeof document.hasFocus === 'function' && !document.hasFocus())) return; seenRequests.add(c.id); c.unread = false; invoke('chatSeen', { id: c.id }).then(s => { seenRequests.delete(c.id); applyState(s); }).catch(() => seenRequests.delete(c.id)); }
function render() {
    autoSeen();
    composerMenus.beforeRender();
    pending=pendingChats.has(chatId);
    const previousComposer=$('#prompt');
    const oldScroll = $('.messages-scroll'), scrollTop = oldScroll?.scrollTop || 0, stick = !oldScroll || oldScroll.scrollHeight - oldScroll.scrollTop - oldScroll.clientHeight < 90;
    const focused = document.activeElement?.id, selection = focused === 'prompt' ? [$('#prompt').selectionStart, $('#prompt').selectionEnd] : null;
    const active = nav.find(n => n[0] === page);
    const name = state.settings.name || '我的工作空间';
    $('#app').className = sidebarCollapsed ? 'sidebar-collapsed' : '';
    const markup = `<div class="titlebar"></div><aside class="sidebar"><div class="brand"><span class="brand-mark"><img src="assets/logo.png" alt="QuanK 标志"></span><div>QuanK<small>量化工作，一键搞定</small></div></div><button class="new" data-action="new">${icon('plus')}<span>新建任务</span><span>⌘ N</span></button>${sidebarNav({page, icon, unread: feedUnread(state)})}<div class="recent"><div class="recent-header"><span>任务 <small>${state.chats.filter(c => !c.incognito).length}</small></span><button data-action="newFolder" aria-label="新建文件夹" title="新建文件夹">${icon('folder')}</button><button data-action="search" aria-label="搜索任务与成果">${icon('search')}</button></div><input id="recentQuery" aria-label="筛选历史任务" placeholder="搜索对话标题和内容" value="${escape(recentQuery)}"><div id="recentList">${recentRows()}</div></div><button class="profile" data-action="settings"><div class="avatar">QK</div><div>${escape(name)}<small>${escape(state.settings.model)} · 本地工作空间</small></div>${icon('settings')}</button></aside><main class="main"><header class="topbar"><div><button class="icon-button" data-action="sidebarToggle" aria-label="${sidebarCollapsed ? '展开' : '收起'}侧栏">${icon('grid')}</button><span class="topbar-title">${escape(page === 'chat' ? state.chats.find(c => c.id === chatId)?.name || '新任务' : active?.[2] || '工作台')}${(page === 'chat' && state.chats.find(c => c.id === chatId)?.incognito) || (page === 'home' && incognito) ? '<span class="incognito-badge">无痕</span>' : ''}</span></div><div><button class="topbar-action" data-page="tasks" aria-label="查看后台任务">后台 ${(state.runJobs||[]).filter(j=>['running','cancelling'].includes(j.status)).length} 执行 · ${(state.runJobs||[]).filter(j=>j.status==='queued').length} 排队</button>${page === 'chat' && state.chats.some(c => c.id === chatId) ? `<button class="topbar-action" data-action="chatMenu" data-id="${escape(chatId)}" aria-label="对话操作">···</button>` : ''}${page === 'chat' ? `<button class="topbar-action" data-action="panelTab" data-id="execution">${icon('activity')}执行过程</button>` : ''}<button class="topbar-action ${sidePanel ? 'chosen' : ''}" data-action="panelToggle">${icon('file')}工作区</button><button class="status" data-action="settings"><span class="dot ${state.settings.hasKey ? 'on' : ''}"></span>${state.settings.hasKey ? escape(state.settings.model) : '连接模型'}</button></div></header><div class="workbench ${sidePanel ? 'with-panel' : ''}"><div class="workspace ${page === 'chat' ? 'conversation-space' : ''}">${content()}</div>${sidePanel ? previewPanel() : ''}</div></main>`;
    officeWorkspace.update(markup, `${page}:${chatId}`);
    for (const el of [document.scrollingElement, document.getElementById('app'), document.querySelector('.main'), document.querySelector('.workbench')]) if (el && el.scrollLeft) el.scrollLeft = 0; // [resp] never leave the shell scrolled sideways
    if(previousComposer&&$('#prompt'))$('#prompt').replaceWith(previousComposer);
    composerMenus.afterRender(`${page}:${chatId}`);
    composerImages.update();
    bindPresetFilters($('#app'));
    $('#sendImages')?.addEventListener('change',e=>sendImages=e.target.checked);
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
    $('#recentQuery')?.addEventListener('input', e => { recentQuery = e.target.value; $('#recentList').innerHTML = recentRows(); });
    $('#memoryQuery')?.addEventListener('change', e => { memoryQuery = e.target.value; render(); });
    { // [q1] quant detail charts: one isolated chart frame per dashboard, rebuilt when the detail changes
        const qc = $('#quantCharts');
        if (!qc) { quantDisposers.forEach(d => d?.dispose?.()); quantDisposers = []; }
        else if (!qc.dataset.mounted && quantDetailData?.charts) {
            qc.dataset.mounted = '1'; quantDisposers.forEach(d => d?.dispose?.()); quantDisposers = [];
            for (const dash of quantDashboards(qc.dataset.code, quantDetailData.charts)) { const box = document.createElement('div'); box.className = 'q-chart'; qc.append(box); quantDisposers.push(mountDashboard(box, dash)); }
        }
    }
    mountKlineBoxes(document, p => invoke('market', p)); marketPing(); signalPopups(); // [F1] [F1c]
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
    $('#graphQuery')?.addEventListener('change', e => { graphQuery = e.target.value; render(); }); // [p3-m5]
    $('#runStatus')?.addEventListener('change', e => { runStatus = e.target.value; render(); }); // [ux6]
    $('#runTrigger')?.addEventListener('change', e => { runTrigger = e.target.value; render(); });
    $('#runTask')?.addEventListener('change', e => { runTaskFilter = e.target.value; render(); });
    // [ux4] knowledge-graph canvas: positions and zoom persist in graphCache across re-renders
    graphMount?.dispose(); graphMount = null;
    if ($('#graphCanvas')) graphMount = mountGraphCanvas($('#graphCanvas'), graphData(state.graph, { type: graphType, query: graphQuery, focus: graphFocus }), { cache: graphCache, selected: graphSelected,
        onSelect: sel => { graphSelected = sel; const side = $('#graphSide'); if (side) { side.innerHTML = sel ? graphSidePanel(state, sel, { action, date }) : ''; side.hidden = !sel; } },
        onFocus: f => { graphFocus = f; if (f) graphSelected = f; render(); } });
    for (const d of document.querySelectorAll('#recentList details[data-section]')) d.addEventListener('toggle', () => { d.open ? recentOpen.add(d.dataset.section) : recentOpen.delete(d.dataset.section); });
    $('#toolMode')?.addEventListener('change', e => { toolsEnabled = e.target.checked; });
    for (const name of ['url', 'executable', 'args', 'folderId', 'relative'])
        $('#tool-' + name)?.addEventListener('input', e => { toolDraft[name] = e.target.value; });
    $('#modelChoice')?.addEventListener('change',e=>{modelChoice=e.target.value;modelEffort='';render();});
    $('#modelEffort')?.addEventListener('change',e=>{modelEffort=e.target.value;render();});
    $('#agent')?.addEventListener('change', e => { agentId = e.target.value; render(); }); // [F1f] refresh the avatar
    $('#folderSelect')?.addEventListener('change', e => { folderId = e.target.value; loadFiles(); });
    $('#fileQuery')?.addEventListener('keydown', e => {
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
function composer() {return compactComposer({selections,state,agentId,files,images,sendImages,live:chatLive(),toolsEnabled,icon,escape,modelName:modelChoiceLabel(state,modelChoice,modelEffort),modelMarkup:modelPicker(state,modelChoice,modelEffort,escape),meter:contextMeter(currentUsage()),modes:{show:['home','chat'].includes(page)&&!chatLive(),plan:planMode,research:researchMode,incognito,incognitoAllowed:page==='home'&&!chatId}});} // [F1f] modes beside the composer
// [p1-m3] context meter for the next request
function currentUsage() { const chat = page === 'chat' ? state.chats.find(c => c.id === chatId) : null; return contextUsage({chat, draft, files, memories: state.settings?.memory?.enabled === false || chat?.incognito ? [] : (state.memories || []).filter(m => m.source !== 'auto'), limit: Number(state.settings?.contextTokens) || undefined}); }
function paintMeter() { const node = document.querySelector('.context-meter'); if (node) node.outerHTML = contextMeter(currentUsage()); }

function homeContent() { return views.homeContent(viewContext()); }
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
        return quantPage(state, {action, heading, empty, date, open: quantOpen, detail: quantDetailData});
    if (page === 'studio') // [p4-m1]
        return studioTab === 'infographics' ? infographicPage(state, {action, heading, empty, date, tab: studioTab}) : studioTab === 'miniapps' ? miniappPage(state, {action, heading, empty, date, tab: studioTab, open: miniappOpenId}) : studioPage(state, {action, heading, empty, date, tab: studioTab}); // [p4-m3][p4-m4]
    if (page === 'graph') // [p3-m5][ux4] 我的上下文 · 知识图谱
        return contextGraphPage(state, {action, date, empty, query: graphQuery, type: graphType, mode: graphMode, focus: graphFocus, selected: graphSelected});
    if (page === 'connectors') // [p3-m1]
        return connectorsPage(state, {action, date, heading, empty});
    if (page === 'tools')
        return `<div class="page">${heading('', '浏览器与权限', '助手打开网页、运行命令前会先征求你的确认；确认框可按 Esc 取消，60 秒无人响应自动取消。在这里管理「总是允许」的规则和已有授权。', action('刷新', 'refresh')+action('撤销浏览器授权','revokeBrowserApprovals')+action('取消所有确认框','cancelApprovals'))}
 ${pendingApprovalsPanel(state, {action, date})}${approvalRulesPanel(state, {action, date})}<div class="tool-grid"><section class="tool-panel"><h2>浏览器</h2><p class="description">内置浏览器支持检查元素、点击与填写；系统浏览器使用你平常的浏览器，但助手不能读取其内容。</p><label>网址<input id="tool-url" aria-label="浏览器网址" value="${escape(toolDraft.url)}" placeholder="https://example.com"></label><div class="toolbar">${action('打开内置浏览器', 'browserOpen', '', 'primary')}${action('在系统浏览器打开', 'externalBrowser')}</div><div class="browser-list">${(state.browsers || []).map(b => `<div class="file-row"><div>${escape(b.title || '网页')}<small>${escape(b.url)}</small></div>${action('读取正文', 'browserRead', b.id)}${action('检查元素', 'browserInspect', b.id)}</div>`).join('')}</div></section>
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
        return `<div class="page">${capabilityTabs('agents')}${heading('', '为每一种工作，找到好搭档。', '配置知识文档、Skills、MCP、工具和提示词，通过 ReAct 循环完成任务。', action('清除检索索引', 'clearKnowledgeIndex') + action(icon('plus') + '新建智能体', 'newAgent', '', 'primary'),
            [[ag.length, '个智能体'], [ag.reduce((n, a) => n + skillN(a), 0), '项已绑定技能'], [ag.reduce((n, a) => n + mcpN(a), 0), '个已绑定 MCP']])}
<div class="plaza-section-head"><h2>我的智能体</h2><small>「开始对话」用它处理任务；「编辑」可绑定知识、Skills、MCP 和工具。</small></div><div class="plaza-grid">${cards}</div></div>`;
    }
    if (page === 'tasks') // [ux6] 定时任务 / 运行记录
        return automationPage(state, {action, empty, tab: taskTab, filter: taskFilter, runStatus, runTask: runTaskFilter, runTrigger, banner: pendingBanner(state, action),
            extra: taskTab === 'runs' && (state.runJobs || []).some(j => ['queued', 'running', 'cancelling'].includes(j.status)) ? views.runQueue({state, action, date, statusNames}) : ''}); // [ux8] only while something is queued
    if (page === 'library')
        return `<div class="page">${heading('', '成果中心', '对话与自动化生成的文档和成果都在这里，可预览、继续编辑和导出。', '', [[(state.documents || []).length, '份文档'], [state.artifacts.length, '份保存的成果']])}${documentLibrary({state,action,date})}${state.artifacts.length ? `<div class="cards">${state.artifacts.map(a => `<div class="card"><span class="tile-icon amber">${icon('file')}</span><h3>${escape(a.name)}</h3><p>${escape(a.text.slice(0, 110))}…</p><div class="meta">${date(a.time)}</div><div class="actions">${action('查看', 'viewArtifact', a.id)}${action('导出', 'exportArtifact', a.id)}${action('删除', 'deleteArtifact', a.id)}</div></div>`).join('')}</div>` : empty('还没有保存的成果', '在助手回复下点击“保存到成果中心”，或完成一个自动化任务。')}</div>`;
    if (page === 'context') // [ux4] 我的上下文 · 记忆
        return memoryPage({state, action, icon, date, empty, filter: memoryFilter, query: memoryQuery,
            heading: (kicker, title, desc, buttons = '') => contextHeader(state, {tab: 'context', date}) + `<div class="ctx-sub"><p class="description">${desc}</p><div class="ctx-actions">${buttons}</div></div>`}).replace('<div class="page">', '<div class="page context-page">');
    if (page === 'feed') // [p2-m3]
        return feedPage(state, {action, date, heading, empty, filter: feedFilter}).replace('<!--briefing-->', briefingCard(state, {action})); // [p2-m4] briefing on top
    return '';
}
function modal(title, body, submit, handler) {
    const d = $('#modal');
    d.classList.remove('task-modal'); // [ux6]
    d.onclick=null;
    d.onclose=()=>d.querySelectorAll('[data-mcp-secret],input[type="password"]').forEach(el=>el.value='');
    d.innerHTML = `<form method="dialog" novalidate><header><h2>${escape(title)}</h2><button type="button" data-modal-close class="icon-button" value="cancel" aria-label="关闭">${icon('close')}</button></header>${body}<p id="modal-error" role="alert" hidden></p><footer><button type="button" data-modal-close value="cancel" class="secondary">关闭</button>${submit ? `<button type="button" id="modalSubmit" class="primary">${submit}</button>` : ''}</footer></form>`;
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
                if(result === 'modelLibrary') modal('模型设置',modelLibrary(state,escape));
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
    if (planMode || researchMode) return sendPlan(prompt, researchMode ? 'research' : ''); // [p1-m5][p1-m6]
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
        applyState(await invoke('chat', { id, requestId:crypto.randomUUID(), prompt, ...(asIncognito || state.chats.find(c => c.id === id)?.incognito ? { incognito: true } : {}), selections:selectedSelections.map(({documentId,revision,sha256,request})=>({documentId,revision,sha256,request})), agentId, toolsEnabled,modelChoice,modelEffort,images:selectedImages.map(i=>i.id),sendImages:selectedConsent, documents:selected.filter(f=>f.documentId).map(({documentId,revision,sha256,name,archive,entryPath})=>({documentId,revision,sha256,name,archive,entryPath})), files: selected.filter(f=>!f.documentId).map(({ folderId, relative }) => ({ folderId, relative })) }));
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
    if (actionId === 'mkBack') { marketStockCode = ''; render(); return; }
    if (actionId === 'mkRefresh') { toast('正在刷新行情…'); await mcall({ action: 'overview' }); render(); toast('行情已更新'); return; }
    if (actionId === 'mkSector') { const r = await mcall({ action: 'sectorStocks', sector: id, limit: 30 }); modal(`${r.sector?.name || '板块'} · 成分股涨幅前 30`, sectorStocksView(r)); return; }
    if (actionId === 'mkAddPool') { const out = await invoke('quant', { action: 'addStock', code: id }); if (out?.state) applyState(out.state); render(); toast('已加入股票池'); return; }
    if (actionId === 'mkAlert') { modal('价格提醒', marketAlertForm(id || ''), '添加', async f => { const p = marketAlertPayload(f); const r = await mcall({ action: 'resolve', query: p.query }); const a = await mcall({ action: 'addAlert', code: r.code, name: r.name, kind: p.kind, value: p.value }); render(); toast('已添加提醒：' + a.text); }); return; }
    if (actionId === 'mkAlertRemove') { await mcall({ action: 'removeAlert', id }); render(); toast('已删除提醒'); return; }
}
function marketRefreshView() {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (page === 'home') { const n = $('#mkHome'); if (n) n.outerHTML = marketHomeCard(state, { date }); }
    else if ((page === 'market' || (page === 'quant' && !quantOpen)) && !typing) render();
}
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
        ...(state.activity || []).filter(a => /^(行情提醒|自选股涨停|自选股跌停)$/.test(a?.title || '')).map(a => ({time: a.time, tone: /跌停/.test(a.title) || /-\d/.test((/（([+-]?[\d.]+)%）/.exec(a.detail || '') || [])[0] || '') ? 'sell' : 'buy', title: a.title, text: a.detail || '', code: a.code || (/（(\d{6})）/.exec(a.detail || '') || [])[1] || ''}))].filter(x => Number.isFinite(x.time));
    if (signalSeenAt === null) {
        let v = 0; try { v = Number(localStorage.getItem('qk.signalSeenAt')) || 0; } catch {}
        signalSeenAt = v || Math.max(0, ...items.map(x => x.time));
    }
    const fresh = items.filter(x => x.time > signalSeenAt && Date.now() - x.time < 6 * 3600e3).sort((a, b) => b.time - a.time).slice(0, 5);
    if (!fresh.length || $('#modal')?.open) return;
    signalSeenAt = Math.max(...fresh.map(x => x.time)); try { localStorage.setItem('qk.signalSeenAt', String(signalSeenAt)); } catch {}
    modal(fresh.length > 1 ? `${fresh.length} 条交易提醒` : fresh[0].title, `<div class="sig-pop">${fresh.map(x => `<div class="sig-item ${x.tone}"><span class="sig-badge">${x.tone === 'buy' ? (x.quant ? '买' : '涨') : (x.quant ? '卖' : '跌')}</span><div><b>${escape(x.title)}</b><p>${escape(x.text)}</p><small>${escape(date(x.time))}</small></div>${x.code ? `<button type="button" data-action="mkSignal" data-id="${escape((x.quant ? 'quant:' : 'market:') + x.code)}">查看详情</button>` : ''}</div>`).join('')}<p class="muted">信号来自你本机的策略与公开行情，仅供研究，不构成投资建议；QuanK 不会替你下单。</p></div>`);
}
async function navigate(next) {
    if (page === 'feed' && next !== 'feed') invoke('feed', { action: 'seen' }).then(s => { applyState(s); render(); }).catch(() => {}); // [p2-m3] leaving the feed marks it read
    page = next;
    if (next === 'files') {
        await loadFiles();
    }
    else
        render();
}
async function handle(actionId, id) {
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
    if(state.officeNative&&id&&['documentCanvas','documentWordEditor','documentEditor'].includes(actionId)&&['docx','xlsx','pptx'].includes(state.documents?.find(d=>d.id===id)?.format)){const d=state.documents.find(d=>d.id===id);await invoke(state.officeWorkspace?'officeOpen':'officeEdit',{id,revision:d.revision});await update('state');toast(state.officeWorkspace?'已打开QuanK Office，编辑直接保存，无需收回':'已打开内置编辑窗口；保存并退出后点击收回编辑结果');return;}
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
        if(actionId==='documentExportPdf'){const result=await invoke('documentExportPdf',{id,revision:d.revision});if(result?.status==='succeeded')toast('PDF 已保存');return;}
        if(actionId==='documentExport'){await invoke('documentExport',{id,revision:d.revision});return;}
        if(actionId==='documentContinue'){switchChat('');page='home';toolsEnabled=true;draft=`请先调用 document_read 读取文档「${d.name}.${d.format}」（id=${id}，当前版本 ${d.revision}），再根据以下要求调用 ${d.hasRichSource?'document_write（保留editableHtml结构）':d.format==='docx'?'document_patch（使用wordEditing片段坐标，保留其他样式）':'document_edit'} 保存新版本。修改要求：`;render();$('#prompt')?.focus();return;}
        if(actionId==='documentEdit'){
            const body=d.format==='xlsx'?area('单元格修改 JSON（sheetIndex 指 sheetN.xml，从 1 开始）','cells','[{"sheetIndex":1,"address":"A1","value":"新内容"}]'):input('查找原文（Word/PPT 不跨段落）','find')+area('替换内容','replacement','新内容');
            modal('精确修改 · '+d.name,body,'审阅并保存版本',async f=>{const changes=d.format==='xlsx'?{cells:JSON.parse(f.get('cells'))}:{replacements:[{find:f.get('find'),replace:f.get('replacement')}]};const r=await invoke('documentOperation',{operation:'document_edit',id,expectedRevision:d.revision,...changes});if(r.status!=='succeeded')throw Error(r.error||r.message||'未保存');await update('state');toast('新版本已保存，原始导入文件不变');});return;
        }
        if(actionId==='documentDelete'){modal('删除文档与本地版本','<p>请先导出所需版本；原始导入文件不受影响。</p>','删除',async()=>{await invoke('documentDelete',{id});await update('state');});return;}
    }
    if (actionId === 'previewExportPdf') {
        const item=previewTabs.find(t=>t.id===previewId);const d=(state.documents||[]).find(x=>x.id===item?.documentId);
        if(!d)throw Error('文档已删除');const result=await invoke('documentExportPdf',{id:d.id,revision:d.revision});if(result?.status==='succeeded')toast('PDF 已保存');return;
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
    if(actionId==='settings'){modal('模型设置',modelLibrary(state,escape));return;}
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
        modal(a.id ? '编辑智能体' : '创建智能体', input('名称', 'name', a.name) + input('简介', 'description', a.description) + area('角色指令', 'prompt', a.prompt) + agentEditor(a,state.documents||[],state), '保存', async (f) => update('agent', {name:f.get('name'),description:f.get('description'),prompt:f.get('prompt'),...readAgentEditor(f,$('#modal')),id:a.id}));
        bindAgentEditor($('#modal'),{uploadSkill:async()=>{const out=await invoke('skillImport');applyState(out.state);return out;},saveMcp:async p=>{const out=await invoke('mcpConnection',p);applyState(out.state);return out;},onError:toast});
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
    if (actionId === 'graphType') { graphType = !id || id === graphType ? 'all' : id; render(); return; }
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
    if (/^research/.test(actionId)) { // [F2] 投研文档: reports, announcements, library, exports
        const call = async p => { const out = await invoke('research', p); if (out?.state) applyState(out.state); return out?.result || {}; };
        const R = researchUI, rs = state.research || {}, nameOf = c => (state.quant?.pool || []).find(p => p.code === c)?.name || c;
        const openDoc = async docId => { render(); if (docId) await handle('documentView', docId); };
        if (actionId === 'researchReport') { modal(`生成研报 · ${nameOf(id)}`, R.reportForm(), '生成', async f => { const p = R.reportPayload(f, id); toast('正在汇总信号、行情和公告并生成研报，大约需要 10–60 秒…'); const r = await call(p); toast(r.warnings?.length ? `研报已生成（部分内容缺失：${r.warnings.join('；')}）` : '研报已生成，已保存到成果中心和资料库'); await openDoc(r.document?.id); }); return; }
        if (actionId === 'researchNotices') { toast('正在获取公告…'); const r = await call({ action: 'notices', code: id, fresh: true }); if (quantOpen !== id) { await handle('quantOpen', id); } else render(); toast(`已获取 ${r.notices?.length || 0} 条公告`); return; }
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
        const loadDetail = async (code, fresh = false) => {
            quantOpen = code; quantDetailData = null; page = 'quant'; render();
            try { quantDetailData = await call({ action: 'signal', code, fresh }); } catch (e) { quantDetailData = { error: e.message }; }
            if (quantOpen === code) render();
        };
        if (actionId === 'quantStart' || actionId === 'quantRestart') { toast('正在启动量化引擎…'); render(); await call({ action: actionId === 'quantStart' ? 'start' : 'restart' }); render(); toast('量化引擎已启动'); call({ action: 'pool' }).then(render).catch(() => {}); return; }
        if (actionId === 'quantStop') { await call({ action: 'stop' }); render(); toast('量化引擎已停止'); return; }
        if (actionId === 'quantSync') { const q = state.quant || {}; if (q.installed) { toast('正在同步策略代码…'); const r = await call({ action: 'sync' }); render(); toast(`已同步 ${r.files} 个文件`); } else { const r = await call({ action: 'chooseSource' }); render(); if (!r.cancelled) toast(`已导入 ${r.files} 个文件`); } return; }
        if (actionId === 'quantSettings') { modal('量化设置', quantSettingsForm(state.quant || {}), '保存', async f => { const r = await call(quantSettingsPayload(f)); render(); toast(r.python?.ok ? `已保存 · Python ${r.python.version} 依赖齐全` : `已保存 · Python 缺少：${(r.python?.missing || []).join('、')}`); }); return; }
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
        if (actionId === 'quantHome') { quantOpen = ''; quantDetailData = null; await navigate('quant'); return; }
        if (actionId === 'quantLog') { const r = await call({ action: 'log' }); modal('量化引擎日志', `<pre class="q-log">${escape(r.text || '（暂无日志）')}</pre>`); return; }
        if (actionId === 'quantAdd') { modal('添加股票', quantAddForm(), '添加', async f => { await call(quantAddPayload(f)); render(); toast('已加入股票池'); }); return; }
        if (actionId === 'quantRemove') { const s = (state.quant?.pool || []).find(x => x.code === id); modal('移出股票池', `<p>把「${escape(s?.name || id)}」移出股票池？</p>`, '移出', async () => { await call({ action: 'removeStock', code: id }); if (quantOpen === id) quantOpen = ''; render(); toast('已移出'); }); return; }
        if (actionId === 'quantOpen') return loadDetail(id);
        if (actionId === 'quantClose') { quantOpen = ''; quantDetailData = null; render(); return; }
        if (actionId === 'quantRefresh') { if (quantOpen === id) return loadDetail(id, true); toast('正在重新计算…'); await call({ action: 'signal', code: id, fresh: true }); render(); toast('已更新'); return; }
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
    if (actionId === 'taskTab') { taskTab = id === 'runs' ? 'runs' : 'tasks'; render(); return; }
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
    if (actionId === 'feedFilter') { feedFilter = id || 'all'; render(); return; }
    if (actionId === 'feedSeen') { await update('feed', { action: 'seen' }); toast('已全部标为已读'); return; }
    if (actionId === 'feedDismiss') { await update('feed', { action: 'dismiss', id }); return; }
    if (actionId === 'feedRestore') { await update('feed', { action: 'restore' }); return; }
    if (actionId === 'gotoPending') { page = 'tools'; render(); document.getElementById('pending-approvals')?.scrollIntoView(); return; }
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
            await handle(b.dataset.action, b.dataset.id);
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
async function boot() {
    try {
        if (api) {
            applyState(await invoke('state'));
        }
        render();
    }
    catch (e) {
        $('#app').textContent = '工作空间加载失败：' + e.message;
    }
}
let runtimeTimer;
api?.onOpenPage?.(p => { if (p?.page === 'library' && p.document) { navigate('library'); Promise.resolve(update('state')).then(() => handle('documentView', String(p.document))).catch(e => toast(e.message)); return; } /* [F2] */ if (p?.page === 'market') { marketStockCode = p.code ? String(p.code) : ''; navigate('market'); return; } if (p?.page === 'quant') { if (p.code) handle('quantOpen', String(p.code)).catch(e => toast(e.message)); else { quantOpen = ''; navigate('quant'); } return; } if (['home', 'feed', 'studio', 'tasks', 'library', 'files', 'agents', 'connectors', 'tools', 'graph', 'context'].includes(p?.page)) navigate(p.page); if (p?.page === 'agents' && p.mcp && typeof p.mcp === 'object') { capabilityTab = 'mcp'; render(); setTimeout(() => handle(p.mcp.preset ? 'newPresetMcp' : 'newMcp', String(p.mcp.preset || '')).catch(e => toast(e.message)), 0); } if (p?.page === 'connectors' && p.connector && typeof p.connector === 'object') setTimeout(() => handle('connectorPrefill', JSON.stringify(p.connector)).catch(e => toast(e.message)), 0); }); // [p2-m4][ux5][ux9]
api?.onOpenChat?.(p => { if (p?.id && state.chats.some(c => c.id === p.id)) handle('openChat', p.id).catch(e => toast(e.message)); });
api?.onRuntime?.(() => {
    clearTimeout(runtimeTimer);
    runtimeTimer = setTimeout(async () => {
        try {
            applyState(await invoke('state'));
            if (!$('#modal').open && ['chat', 'tools', 'tasks'].includes(page))
                render();
            else if (!$('#modal').open) marketRefreshView(); // [F1]
        }
        catch (e) {
            toast(e.message);
        }
    }, 120);
});
const streamUpdates = new Map();
const liveStreams = new Map();
function applyState(next) {
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
document.addEventListener('dblclick',event=>{if(!state.officeWorkspace||event.target.closest('button,a,input,textarea'))return;const card=event.target.closest('[data-document]');const d=state.documents?.find(d=>d.id===card?.dataset.document);if(d&&['docx','xlsx','pptx'].includes(d.format))invoke('officeOpen',{id:d.id,revision:d.revision}).catch(e=>toast(e.message));});

// [p1-m2] right-click a conversation in the sidebar for its actions
// [p2-m1] task form: show only the fields that belong to the chosen cadence
document.addEventListener('change', e => { if (e.target?.matches?.('[data-schedule-kind]')) e.target.closest('.task-form').dataset.kind = e.target.value; });
document.addEventListener('contextmenu', e => { const row = e.target.closest?.('[data-chat-row]'); if (!row) return; e.preventDefault(); handle('chatMenu', row.dataset.chatRow).catch(err => toast(err.message)); });
