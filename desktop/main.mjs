import {createOfficeApprovalBridge, createOfficeQuantReader, createOfficeTools} from './services/office-tools.mjs';
import {createFileOfficeUndoStore, createNativeOfficeOpsEngine, createOpsAdapter} from './services/office-ops.mjs';
import {createOfficeCommitJournal, migrateOfficeDrafts, registerOfficeAutosave} from './services/office-autosave.mjs';
import {randomUUID as officeRequestId} from 'node:crypto';
import {createOfficeAI} from './services/office-ai.mjs';
import {bindOfficeViewPort, createOfficeSessionManager} from './services/office-session.mjs';
import {startOfficeLokWorker} from './runtime/office-lok-worker.mjs';
import {documentPreviewMetadata} from './runtime/documents.mjs';
import {execFile as execOfficePowerCommand} from 'node:child_process';
import {availableParallelism, loadavg} from 'node:os';
import {officeFontFingerprint} from './runtime/office-fonts.mjs';
import {createOfficeEngine} from './runtime/office-engine.mjs';
import {previewImageOcrEvidence} from './services/image-ocr-evidence-preview.mjs';
import {createPdfImportControl} from './main/pdf-import-control.mjs';
import {openOcrSource} from './services/ocr-source-open.mjs';
import {createOcrPreviewLimiter} from './services/ocr-source-preview.mjs';
import {importChatPdf,validatePdfRange} from './services/pdf-chat-import.mjs';
import {bundledPdfOcrTools} from './runtime/pdf-ocr.mjs';
import {exportDocumentPdf} from './main/pdf-export.mjs';
import {createOfficeWorkspace} from './services/office-workspace.mjs';
import {createOfficeChat} from './services/office-chat.mjs';
import {createOfficeWindows} from './main/office-windows.mjs';
import {createOfficeEditWindows} from './main/office-edit-windows.mjs';
import {bundledExecutable,runtimeRoot} from './runtime/bundled-runtime.mjs';
import {createChatService,purgeIncognito} from './services/chats.mjs';
import {createPlanService} from './services/plan.mjs';
import {createApprovalRules} from './services/approval-rules.mjs';
import {createBriefingService} from './services/briefing.mjs';
import {createLibreOffice} from './services/libreoffice.mjs';
import {resolveDocumentSelection} from './services/document-selection.mjs';
import {selectionPatches} from './runtime/word-selection.mjs';
import {capabilityPresets} from './runtime/capability-presets.mjs';
import {createCodeProjects} from './services/code-projects.mjs';
import {createLegacyModelSettings} from './services/legacy-model-settings.mjs';
import {createModelService} from './services/models.mjs';
import {createModelSecretCodec} from './main/model-secrets.mjs';
import {parseChatUpload} from './runtime/chat-archive.mjs';
import {sharedKnowledgeIndex} from './services/knowledge-index.mjs';
import {sharedVectorIndex,configureLocalOnnx} from './services/knowledge-vector.mjs';
import {createLocalOnnxEmbedding} from './runtime/local-onnx-embedding.mjs';
import {createMcpSecretCodec} from './main/mcp-secrets.mjs';
import { createConnectorService } from './services/connectors.mjs';
import { createGraphService } from './services/graph.mjs';
import { createDashboardService } from './services/dashboard.mjs';
import { createComparisonService } from './services/comparison.mjs';
import { createInfographicService } from './services/infographic.mjs'; // [p4-m3]
import { createMiniAppService } from './services/miniapps.mjs'; // [p4-m4]
import { createStockLookup } from './services/stock-lookup.mjs'; // [v45q]
import { createMarketService } from './services/market.mjs'; // [F1]
import { createResearchService } from './services/research.mjs'; // [F2]
import { createKnowledgeService } from './services/knowledge.mjs'; // [F3]
import { createPortfolioService } from './services/portfolio.mjs'; // [F4]
import { createTradeService } from './services/trade.mjs'; // [v0.52]
import { createDatasetService } from './services/dataset.mjs'; // [v0.53]
import { createBrokerBrowser } from './services/broker.mjs'; // [v0.52]
import { createAuditLog, auditOf } from './services/audit.mjs'; // [F5]
import { createEgressMonitor } from './services/egress.mjs'; // [F5]
import { createVault } from './services/vault.mjs'; // [F5]
import { createSecurityService } from './services/security.mjs'; // [F5]
import { createCliHandler, createCliServer, createCliInstaller, createAskRunner } from './services/cli-server.mjs'; // [v0.51 CLI]
import { executeAppTool, appToolDefinitions } from './services/app-tools.mjs'; // [v0.51 CLI]
import { createDeckEngine } from './runtime/deck-engine.mjs'; // [D59]
import { createDeckData } from './services/deck-data.mjs'; // [D59]
import { modelEndpoint as qkModelEndpoint } from './core.mjs'; // [F1c]
import { createQuantAutostart } from './runtime/quant-autostart.mjs';
import { codingSpec, createCodingTasks } from './services/coding-tasks.mjs';
import { createCodingRunner, createCodingService, detectAgents } from './services/coding-agent.mjs';
import { createQuantEngine } from './services/quant-engine.mjs'; // [q1]
import { normalizeWatch, actionLabel as quantActionLabel } from './src/shared/quant.js'; // [q3]
import { createWebLookup } from './services/web-lookup.mjs'; // [ux9]
import {mcpViews} from './services/mcp-access.mjs';
import {createCapabilityLibrary,skillViews} from './services/capability-library.mjs';
import {createSkillImporter} from './main/skill-files.mjs';
import {readFilePreview} from './services/file-preview.mjs';
import {protectPreviewNavigation} from './main/preview-navigation.mjs';
import {createImageService,imageViews} from './services/images.mjs';
import {createImageImporter,normalizeNativeImage} from './main/image-files.mjs';
import {previewScheme,preparePreviewProtocol} from './main/preview-protocol.mjs';
import {createConversionBrowser} from './main/conversion-browser.mjs';
import {createDocumentConverter} from './runtime/document-converter.mjs';
import {createGenOfficeBridge} from './main/genoffice.mjs';
import {readDocumentSource,writeDocumentDestination} from './main/document-files.mjs';
import {documentViews, documentUsage} from './services/documents.mjs';
import { sharedRunQueue } from './runtime/run-queue.mjs';
import { createCommandService } from './services/commands.mjs';
import { createWorkspaceService } from './services/workspace.mjs';
import { createApprover } from './main/approval.mjs';
import { createInlineApprovals, createApprovalNotifications } from './main/inline-approval.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRegistrar } from './main/ipc.mjs';
import { observeCodingTasks } from './services/app-tools.mjs';
import { createConversationService } from './services/conversation.mjs';
import { createTaskService } from './services/tasks.mjs';
import { recoverInterruptedWork } from './services/recovery.mjs';
import { requiredText as text } from './services/validation.mjs';
import { app, BrowserWindow, MessageChannelMain, ipcMain, dialog, globalShortcut, Menu, safeStorage, shell, Notification, session, protocol, nativeImage, powerMonitor, systemPreferences } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { realpath, readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { ToolRuntime } from './runtime/tools.mjs';
import { prepareUserData, rekeySecrets, needsRekey, APP_NAME, DISPLAY_NAME, LEGACY_CRYPTO_NAME, CRYPTO_NAME, LEGACY_CRYPTO_NAMES } from './runtime/identity.mjs';
import { legacyUnsealChild, runLegacyUnseal } from './main/legacy-unseal.mjs'; // [rebrand]
import { BrowserService } from './runtime/browser.mjs';
import { Store, uid, listGranted, readGranted, complete } from './core.mjs';
protocol.registerSchemesAsPrivileged([previewScheme]);
const here = path.dirname(fileURLToPath(import.meta.url));
let win, store, sessionKey = '', runner, closing = false, tick, shortcutReady = false;
let security = null, auditLog = null, vault = null, coding = null, codingTasks = null; // [F5]
let cliAsk = null; // [v0.51 CLI] follows `quank ask` turns
// [F5 M2] every fetch from the main process is recorded (host / path / bytes, never bodies) and refused in offline mode
const egress = createEgressMonitor({ privacy: () => store?.data?.security?.privacy, onRequest: e => { if (e.purpose === '大模型' && e.method === 'POST') auditLog?.record({ kind: 'model', action: '调用大模型', target: e.host, detail: `${e.path} · ${e.status === -1 ? '失败' : e.status}`, via: 'app' }).catch(() => {}); } });
egress.install(globalThis);
const active = new Map();
const browser = new BrowserService({ BrowserWindow, shell });
// [p1-m4] background completion: system notification when the window is not focused, dock badge = unread chats
function conversationFinished({ chat, status, text }) {
    try {
        if (process.platform === 'darwin') app.dock?.setBadge(String((store?.data?.chats || []).filter(c => c.unread && !c.incognito).length || ''));
        if (win && !win.isDestroyed() && win.isFocused()) return;
        if (!Notification.isSupported()) return;
        if (!chat.taskId) return; // [v0.52.1] a finished conversation is not something to handle: only automation runs notify
        const n = new Notification({ title: status === 'completed' ? 'QuankSight · 任务完成' : 'QuankSight · 任务未完成', body: (chat.incognito ? '无痕对话' : chat.name) + (text ? '\n' + String(text).replace(/\s+/g, ' ').slice(0, 80) : ''), silent: false });
        n.on('click', () => { focus(); win?.webContents.send('actwill:openChat', { id: chat.id }); });
        n.show();
    } catch {}
}
const notifyRuntime = () => {
    if (win && !win.isDestroyed())
        win.webContents.send('actwill:runtime');
};
const activeCodingRunners = new Set();
const closeCodingRunners = () => Promise.allSettled([...activeCodingRunners].map(runner => runner.close()));
const approvalContext = new AsyncLocalStorage();
const notifyApproval = createApprovalNotifications({
    isFocused: () => win && !win.isDestroyed() && win.isFocused(),
    send: (request, open) => {
        if (!Notification.isSupported()) return;
        const notice = new Notification({ title: 'QuankSight · 待确认授权', body: request.agent + '：' + request.action });
        notice.on('click', open);
        notice.show();
    },
    open: requestId => {
        focus();
        if (win && !win.isDestroyed()) win.webContents.send('actwill:openPage', { page: 'approval', requestId });
    },
});
function approvalCreated(card) {
    store?.log('待确认授权', card.source || card.agent);
    void store?.save().catch(() => {});
    try { notifyApproval(card); } catch {}
}
const inlineApprovals = createInlineApprovals({ changed: notifyRuntime, created: approvalCreated });
const officeApprovals = createOfficeApprovalBridge(inlineApprovals, {changed:notifyRuntime});
const approveInline = createApprover({ approvals: inlineApprovals, context: () => approvalContext.getStore() });
const approve = Object.assign(async (title, detail, signal, scope) => { // [F5 M3] every confirmation and its answer is audited
    let r; try { r = await approveInline(title, detail, signal, scope); } catch (e) { auditLog?.record({ kind: 'approval', action: '授权请求', target: String(title || '').slice(0, 60), detail: `取消：${String(e?.message || e).slice(0, 60)}` }).catch(() => {}); throw e; }
    const ok = r === true || r?.allowed === true;
    auditLog?.record({ kind: 'approval', action: ok ? '已确认' : '已拒绝', target: String(title || '').slice(0, 60), detail: r?.alwaysAllow ? '选择了总是允许' : r?.browserTask ? '本任务本站点允许' : r?.documentTask ? '本任务允许此文档' : '' }).catch(() => {});
    return r;
}, { cancelAll: () => approveInline.cancelAll() });
let officeEngine, quantAutostart, previewDiskTransitions = 0;
let officeTabs, officeTabsStarting;
let toolRuntime, genoffice, models, projects, libreoffice, officeWindows, officeEditWindows, connectors, graphService, dashboards, miniapps, quant, market, research, knowledge, portfolio, trade, dataset, deckEngine, deckData; // [p3-m1][p3-m5][p4-m1][p4-m4][q1][F1][F2][F3][F4]
const pdfImports = createPdfImportControl({notify: notifyRuntime});
const executeTool = (name, args, signal, context) => {
    const chat = store?.data.chats.find(item => item.id === context?.chatId);
    const agent = store?.data.agents.find(item => item.id === chat?.agentId)?.name;
    return approvalContext.run({ ...approvalContext.getStore(), ...(agent ? { agent } : {}) },
        () => toolRuntime.execute(name, args, signal, context));
};
const view = () => { if (security?.locked) return { locked: true, lock: security.lockState() }; const { encryptedKey, ...settings } = store.data.settings; const {knowledgeIndexes,knowledgeVectorIndexes,modelProfiles,codeProjects,connectors:_connectors,connectorItems:_connectorItems,graph:_graph,dashboards:_dashboards,miniapps:_miniapps,trade:_trade,research:_research,coding:_coding,knowledge:_knowledge,portfolio:_portfolio,security:_security,quant:_quant,...publicData}=store.data; return { ...publicData, inlineApprovals: officeApprovals.list(), coding: coding?.view(), appVersion: app.getVersion(), pdfImport: pdfImports.view(), officeNative:!!libreoffice,officeInTab:!!officeWindows,officeEngine:officeEngine?.state()||null,officeWorkspace:!!officeWindows,officeEdits:libreoffice?.sessions()||[], capabilityPresets:capabilityPresets(), codeProjects:projects?.view()||[], ...(connectors?.view()||{connectors:[],connectorItems:[]}), graph: graphService?.view()||null, dashboards: dashboards?.view()||[], miniapps: miniapps?.view()||[], quant: quant?.view()||null, market: market?.view()||null, research: research?.view()||null, knowledge: knowledge?.view()||null, portfolio: portfolio?.view()||null, trade: trade?.view()||null, dataset: dataset?.view()||null, security: security?.summary()||null, modelProfiles:models?.view()||[], mcpConnections:mcpViews(store.data), documents:documentViews(store.data), documentUsage:documentUsage(store.data.documents||[]), skillPackages:skillViews(store.data), imageAttachments:imageViews(store.data), settings: { ...settings, hasKey: !!sessionKey || !!encryptedKey, keySaved: !!encryptedKey, secureStorage: safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text' }, browsers: browser.list(), desktop: { platform: process.platform, shortcutReady } }; };
function key() {
    if (sessionKey)
        return sessionKey;
    const encrypted = store.data.settings.encryptedKey;
    return encrypted ? safeStorage.decryptString(Buffer.from(encrypted, 'base64')) : '';
}
const registerIpc = createRegistrar({ ipcMain, getWindow: () => win, entryURL: new URL('./src/index.html', import.meta.url).href });
// [F5] while QuankSight is locked only the lock screen's calls are served; writes are recorded in the audit log
const LOCK_OPEN = new Set(['state', 'security']);
const register = (name, handler) => registerIpc(name, async p => {
    if (security?.locked && !LOCK_OPEN.has(name)) throw new Error('QuankSight 已锁定，请先解锁');
    const a = auditLog ? auditOf(name, p) : null;
    try { const r = await approvalContext.run({ chatId: typeof p?.approvalChatId === 'string' ? p.approvalChatId : undefined }, () => handler(p)); if (a) auditLog.record({ ...a, via: 'app' }).catch(() => {}); return r; }
    catch (e) { if (a) auditLog.record({ ...a, detail: `${a.detail} · 失败：${String(e?.message || e).slice(0, 60)}`, via: 'app' }).catch(() => {}); throw e; }
});
const previewOcrSource = createOcrPreviewLimiter();
const ocrPreviewAbort = new AbortController();
app.on('before-quit',()=>ocrPreviewAbort.abort(Error('应用正在退出')));
async function launch() {
    win = new BrowserWindow({ show: false, width: 1380, height: 920, minWidth: 860, minHeight: 640, title: 'QuankSight', icon: path.join(here, 'assets/icon-512.png'), backgroundColor: '#ffffff', titleBarStyle: 'hiddenInset', ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 20, y: 20 } } : {}), webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
    win.once('ready-to-show', () => {
        win.show();
        officeEngine?.windowReady();
        quantAutostart?.windowReady();
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', e => e.preventDefault());
    protectPreviewNavigation(win.webContents);
    win.on('close', e => {
        if (!closing && process.platform === 'darwin') {
            e.preventDefault();
            win.hide();
        }
    });
    await win.loadFile(path.join(here, 'src/index.html'));
}
function focus() {
    if (win && !win.isDestroyed()) {
        win.show();
        win.focus();
    }
}
let conversations, tasks, commands, runs, briefing;
const runTask = (id, options) => tasks.run(id, options);
// [rebrand] a short-lived child that reads values sealed under the old keychain name (see main/legacy-unseal.mjs)
// Not awaited: in an ESM entry `ready` fires only after this module's top-level code finishes. The child skips the rest of startup.
const legacyChild = process.env.QUANK_LEGACY_UNSEAL === '1';
if (legacyChild) legacyUnsealChild({ app, safeStorage, name: LEGACY_CRYPTO_NAME });
// Data lives in <appData>/QuankSight; an older build's data folder is copied there once (packaged app only).
const devUserData = !app.isPackaged && process.env.QUANK_DEV_USER_DATA;
if (!app.isPackaged && process.env.QUANK_DEV_OFFICE_RUNTIME && !devUserData) throw Error('开发版 Office 必须指定隔离用户数据目录');
if (devUserData && (!path.isAbsolute(devUserData) || !path.resolve(devUserData).startsWith('/tmp/') && !path.resolve(devUserData).startsWith('/private/tmp/'))) throw Error('开发版 Office 数据目录必须在 /tmp 内');
const dataDir = devUserData ? {dir:path.resolve(devUserData), migratedFrom:null} : legacyChild ? { dir: app.getPath('userData'), migratedFrom: null } : await prepareUserData(app.getPath('appData'), { migrate: app.isPackaged });
if (!legacyChild) app.setPath('userData', dataDir.dir);
// [V100-4] 自测隔离钩子：QUANK_SELFTEST=1 时覆盖 packaged 分支默认的真实用户目录。
// 必须放在 dataDir 的 setPath 之后、app ready 之前，才能同时隔离 userData / sessionData / logs。
if (process.env.QUANK_SELFTEST === '1' && process.env.QUANK_USER_DATA) {
    const testUserData = path.resolve(process.env.QUANK_USER_DATA);
    app.setPath('userData', testUserData);
    app.setPath('sessionData', testUserData);
    app.setPath('logs', path.join(testUserData, 'logs'));
    void writeFile(path.join(testUserData, 'V1004_SELFTEST_USERDATA.json'), JSON.stringify({
      userData: app.getPath('userData'), sessionData: app.getPath('sessionData'), logs: app.getPath('logs'),
    })).catch(() => {});
}
if (!legacyChild) app.setName(DISPLAY_NAME); // keychain key "QuankSight Safe Storage"; older sealed values are re-sealed once after the store loads
app.setAboutPanelOptions({ applicationName: 'QuankSight', applicationVersion: app.getVersion() });
if (legacyChild) { /* legacy unseal child: nothing else runs */ }
else if (!app.requestSingleInstanceLock())
    app.quit();
else {
    app.on('second-instance', focus);
    app.whenReady().then(async () => {
        protocol.handle(previewScheme.scheme,await preparePreviewProtocol(path.join(here,"src/preview")));
        if (process.platform === 'darwin')
            app.dock.setIcon(path.join(here, 'assets/icon-1024.png'));
        store = new Store(app.getPath('userData'));
        // [F5 M1] encrypted workspace: the data key is sealed by the keychain; plaintext files keep loading as before
        vault = createVault({ dir: app.getPath('userData'), seal: b => safeStorage.encryptString(b.toString('base64')), unseal: buf => Buffer.from(safeStorage.decryptString(buf), 'base64') });
        await vault.prepare();
        store.codec = vault.codec;
        await store.load();
        auditLog = createAuditLog({ dir: path.join(app.getPath('userData'), 'audit') });
        await auditLog.load().catch(() => {});
        if (needsRekey(store.data, CRYPTO_NAME)) { // [rebrand][v1.0.2] re-seal secrets saved under QuanK / Actwill AI as QuankSight, in the background (never blocks the window)
            const openCurrent = c => { try { return safeStorage.decryptString(Buffer.from(c, 'base64')); } catch { return null; } };
            const sources = LEGACY_CRYPTO_NAMES.map(name => ({ name, unseal: list => runLegacyUnseal(list, { name }) }));
            void rekeySecrets(store.data, { unsealLegacy: sources, target: CRYPTO_NAME, openCurrent, seal: s => safeStorage.encryptString(s).toString('base64') })
                .then(async r => { await store.save(); notifyRuntime(); if (r.total) console.log(`[quank] 密钥迁移（第 ${r.attempts} 次）：${r.ok}/${r.total} 可用${r.failed ? `，${r.failed} 项未迁移${r.error ? '（' + r.error + '）' : ''}` : ''}${dataDir.migratedFrom ? `；数据已从 ${dataDir.migratedFrom} 复制` : ''}`); })
                .catch(e => console.warn('[quank] 密钥迁移失败', e?.message));
        }
        purgeIncognito(store.data); // [p1-m2] incognito chats never survive a restart
        configureLocalOnnx(store,async()=>{const root=runtimeRoot();if(!root)throw Error('此版本未内置本机ONNX嵌入运行时');const python=await bundledExecutable('python');return createLocalOnnxEmbedding({python,modelDirectory:path.join(root,'embedding','bge-small-zh-v1.5')});});
        const defaultAgent = store.data.agents.find(a => a.id === 'assistant');
        if (['Actwill 助手', 'WillBuddy 助手'].includes(defaultAgent?.name))
            defaultAgent.name = 'QuankSight 助手';
        if (['你是 Actwill 工作助手。用中文清晰地帮助用户完成工作。区分事实和假设，不编造来源。', '你是 WillBuddy 工作助手。用中文清晰地帮助用户完成工作。区分事实和假设，不编造来源。'].includes(defaultAgent?.prompt))
            defaultAgent.prompt = '你是 QuankSight 工作助手。用中文清晰地帮助用户完成工作。区分事实和假设，不编造来源。';
        if (!store.data.financeAgentsSeeded) { // [fin1] finance agents, added once (the user may edit or delete them)
            for (const a of [
                { id: 'fin-research', name: '投研分析师', description: '个股与行业研究、财报点评、投资备忘录', prompt: '你是 QuankSight 的投研分析师。围绕个股、行业和财报给出有依据的研究结论：关键数字注明来源与报告期，事实与观点分开，拿不到的数据标为待核实，不编造。需要时调用本机量化工具查看信号与持仓。结尾注明仅供研究，不构成投资建议。' },
                { id: 'fin-modeler', name: '财务建模师', description: '三表联动模型、DCF 与可比估值，交付可核对的 Excel', prompt: '你是 QuankSight 的财务建模师。按假设页、三表、校验页的结构搭建可联动的 Excel 模型，资产负债表必须配平；估值给出区间和敏感性分析，所有参数写明取值与来源，交付前读取真实文件核对。' },
                { id: 'fin-quant', name: '量化策略助手', description: '解读本机策略信号、盯盘提醒、日报与回测复盘', prompt: '你是 QuankSight 的量化策略助手。使用本机量化工具读取股票池信号、持仓、日报与回测，用清楚的中文解释档位、综合分和变化原因；任何记录成交、修改计划的操作都先说明再请用户确认；不替用户下单，不承诺收益。' },
                { id: 'fin-risk', name: '风控合规官', description: '组合风险指标、合规审阅与敏感信息脱敏', prompt: '你是 QuankSight 的风控合规官。计算组合收益、回撤、波动与集中度并列出风险清单；审阅研究材料中的收益承诺、未授权买卖建议和缺失的风险提示；对客户、账户等敏感信息脱敏并列出替换清单。' }])
                if (!store.data.agents.some(x => x.id === a.id)) store.data.agents.push(a);
            store.data.financeAgentsSeeded = true;
        }
        store.data.executions ??= [];
        const convertDocument=createDocumentConverter({createDriver:signal=>createConversionBrowser({BrowserWindow,session,signal})});
        const approvalRules = createApprovalRules({ store, notify: notifyRuntime, onDeferred: item => approvalCreated({
            requestId: item.id, agent: '定时任务', action: item.title,
            source: store.data.tasks?.find(task => task.id === item.taskId)?.name,
        }) }); // [p2-m2]
        toolRuntime = new ToolRuntime({ store, browser, approve, notify: notifyRuntime, convertDocument,beforeCli:(args,policy)=>projects?.validate(args,policy), rules: approvalRules });
        deckEngine = createDeckEngine({ userData: app.getPath('userData'), encrypted: () => !!vault?.encrypted }); // [D59]
        deckData = createDeckData(); // [D59]
        register('approvalResponse', p => inlineApprovals.finish(p.requestId, p.decision));
        register('approvalRule', p => approvalRules.handle(p).then(() => view()));
        const officeHome = path.join(store.dir, 'office');
        const officeWarmEnabled = () => store.data.settings.officeStartupWarm !== false;
        const deferOfficeWarm = async () => {
            if (loadavg()[0] >= availableParallelism()) return true;
            if (process.platform !== 'darwin' || !powerMonitor.isOnBatteryPower()) return false;
            return new Promise(resolve => {
                execOfficePowerCommand('/usr/bin/pmset', ['-g', 'batt'], {timeout: 2000}, (error, stdout) => {
                    const charge = stdout?.match(/(\d+)%/);
                    resolve(!error && !!charge && Number(charge[1]) <= 20);
                });
            });
        };
        const officeRuntime=async()=>({
            python:await bundledExecutable('python'),
            officeDirectory:path.dirname(await bundledExecutable('office')),
            fontCacheDirectory:path.join(officeHome,'fontcache'),
            onFontTiming: timing => officeEngine?.record('font',timing),
            lowPriority:true,
        });
        if(runtimeRoot()){
            await bundledExecutable('python');
            const officeBinary = await bundledExecutable('office');
            const officeDirectory = path.dirname(officeBinary);
            const manifest = JSON.parse(await readFile(path.join(runtimeRoot(),'RUNTIMES.json'),'utf8'));
            const officeBinaryStat = await stat(officeBinary);
            const engineVersion = JSON.stringify([manifest.libreoffice,app.getVersion(),officeDirectory,officeBinaryStat.mtimeMs]);
            libreoffice=createLibreOffice({
                documents:toolRuntime.documents,directory:path.join(store.dir,'office-runtime'),
                executable:()=>bundledExecutable('office'),pdfRuntime:officeRuntime,approve,notify:notifyRuntime,
                previewPoolEnabled:store.data.settings.officePreviewPool!==false,
                previewCacheDirectory:path.join(officeHome,'preview-cache'),
                allowPreviewDisk:()=>!vault?.encrypted&&!previewDiskTransitions,
                previewIdentity:async()=>({engineVersion,fontFingerprint:await officeFontFingerprint(officeDirectory)}),
                waitForEngine:()=>officeEngine?.wait(),
                onPreviewTiming:timing=>officeEngine?.record('lastPreview',timing),
            });
            if(vault?.encrypted) await libreoffice.clearPreviewDisk().catch(error=>console.warn('[Office] 缓存清理失败',error.code||error.name));
        }
        genoffice=createGenOfficeBridge({documents:toolRuntime.documents,approve});
        recoverInterruptedWork(store.data);
        commands = createCommandService({ store, active, executeTool, notify: notifyRuntime });
        projects=createCodeProjects({store,directory:path.join(app.getPath('userData'),'code-projects'),approve,commands});
        register('projectRun',p=>projects.run(p.id,p.stepId,{service:p.service===true}));
        register('projectImport',async()=>{const result=await dialog.showOpenDialog(win,{title:'导入代码项目ZIP（不自动执行）',properties:['openFile'],filters:[{name:'代码项目ZIP',extensions:['zip']}]});if(result.canceled)return false;const source=result.filePaths?.[0];if(!source)throw Error('未选择代码包');return projects.importArchive(path.basename(source),await readDocumentSource(source,{noFollow:true,maxBytes:32*1024*1024,label:'代码ZIP'}));});
        runs = sharedRunQueue({store, active, notify:notifyRuntime});
        const mcpSecrets=createMcpSecretCodec(safeStorage);
        models=createModelService({store,secrets:createModelSecretCodec(safeStorage),legacyKey:key});
        const officeAI = createOfficeAI({models, store, key, getPrivacy:() => ({
            encrypted:vault.encrypted, privacy:security?.privacy(),
        })});
        const officeAIRequests = new Map();
        register('officeAI', async ({token, input, cancel}) => {
            if (typeof token !== 'string' || !/^[a-f0-9-]{36}$/.test(token)) throw Error('Office AI 请求无效');
            if (cancel) {
                officeAIRequests.get(token)?.abort();
                return;
            }
            if (officeAIRequests.has(token)) throw Error('Office AI 请求重复');
            const controller = new AbortController();
            officeAIRequests.set(token, controller);
            try {
                const {action, kind, selection, language, tone, instruction} = input ?? {};
                return await officeAI.run({action, kind, selection, language, tone, instruction}, {
                    signal:controller.signal,
                    onDelta:delta => win?.webContents.send('actwill:officeAIDelta', {token, delta}),
                });
            } finally {
                officeAIRequests.delete(token);
            }
        });
        register('officeAISettings', async ({allowUpload}) => {
            if (typeof allowUpload !== 'boolean') throw Error('Office AI 设置无效');
            const previous = store.data.settings.office;
            store.data.settings.office = {...previous, ai:{...previous?.ai, allowUpload}};
            try { await store.save(); }
            catch (error) { store.data.settings.office = previous; throw error; }
            if (!allowUpload) for (const controller of officeAIRequests.values()) controller.abort();
            notifyRuntime();
            return view();
        });
        register('modelProfile',async p=>{await models.update(p);return view();});
        register('modelTest', async p => { // [F1c] 「测试连接」/「获取模型列表」: one short request to the address the user typed
            const url = qkModelEndpoint(String(p?.baseUrl || '').trim()), base = url.replace(/\/chat\/completions$/, '');
            const key = String(p?.apiKey || '').trim(), local = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(base);
            if (!key && !local) throw new Error('请先填写 API Key（已保存的密钥不会回填，测试时需要重新输入）');
            if (key.length > 4096 || /[\s\x00-\x1f\x7f]/.test(key)) throw new Error('API Key 含空白或过长');
            const headers = {'content-type': 'application/json', ...(key ? {authorization: `Bearer ${key}`} : {})}, t0 = Date.now();
            const fail = (r, msg) => new Error(r.status === 401 || r.status === 403 ? 'API Key 无效或没有权限' : r.status === 404 ? `接口地址或模型名称不对（HTTP 404）${msg ? '：' + msg : ''}` : r.status === 429 ? '请求太频繁或额度不足（HTTP 429）' : `连接失败（HTTP ${r.status}）${msg ? '：' + msg : ''}`);
            const body = async r => { const t = await r.text(); try { return JSON.parse(t); } catch { return {text: t.slice(0, 160)}; } };
            if (p?.kind === 'models') {
                const r = await fetch(base + '/models', {headers, signal: AbortSignal.timeout(15000)}), j = await body(r);
                if (!r.ok) throw fail(r, j?.error?.message || j?.message || j?.text);
                return {models: (Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : []).map(m => typeof m === 'string' ? m : m?.id || m?.name).filter(x => typeof x === 'string').slice(0, 500)};
            }
            const model = String(p?.model || '').trim(); if (!model) throw new Error('请先填写模型名称');
            const r = await fetch(url, {method: 'POST', headers, body: JSON.stringify({model, messages: [{role: 'user', content: '只回复一个字：好'}], max_tokens: 16, stream: false}), signal: AbortSignal.timeout(30000)}), j = await body(r);
            if (!r.ok) throw fail(r, j?.error?.message || j?.message || j?.text);
            return {ok: true, ms: Date.now() - t0, reply: String(j?.choices?.[0]?.message?.content || '').slice(0, 40)};
        });
        app.on('before-quit',()=>models.close());
        const images=createImageService({store,decode:bytes=>normalizeNativeImage(nativeImage,bytes)});
        register('imageImport',createImageImporter({dialog,getWindow:()=>win,nativeImage,images}));
        register('imagePreview',p=>images.preview(p.id));
        register('imageRemove',async p=>{await images.remove(p.id);return view();});
        // [ux5] services the chat app tools can drive; getters so later-created services are picked up
        let officeTools;
        const appDeps = { get deck() { return deckEngine; }, get deckData() { return deckData; }, get documents() { return toolRuntime?.documents; }, get office() {return officeTools;}, officeBlockReason:officeAI.blockReason,
            officeCommitted:(card, chatId) => officeTabs?.refresh(card.docId, () => officeTools.resultAction(card, 'officeRollback', {chatId})),
            redactOfficeResult:result => {
                if (!security?.privacy()?.maskAmounts) return result;
                const redact = value => {
                    if (Array.isArray(value)) return value.map(redact);
                    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) =>
                        [k, ['id','kind','status','sheet','cell','index','revision','changes','target','row','column'].includes(k) ? v : redact(v)]));
                    if (typeof value === 'string') return value.replace(/\p{N}+/gu, '***');
                    return typeof value === 'number' ? '***' : value;
                };
                return redact(result);
            },
            get codingTasks() { return codingTasks; }, notify: notifyRuntime, openPage: (page, extra = {}) => { focus(); if (win && !win.isDestroyed()) win.webContents.send('actwill:openPage', { ...extra, page }); }, // [v0.53.1] page filters / tabs
            openConnectorForm: p => { focus(); if (win && !win.isDestroyed()) win.webContents.send('actwill:openPage', { page: 'connectors', connector: p }); }, web: createWebLookup(), // [ux9]
            openMcpForm: p => { focus(); if (win && !win.isDestroyed()) win.webContents.send('actwill:openPage', { page: 'agents', mcp: p }); }, get capabilities() { return capabilityLibrary; }, // [mcp2]
            runTask: (id, o) => runTask(id, o), get workspace() { try { return workspace; } catch { return null; } },
            get connectors() { return connectors; }, get dashboards() { return dashboards; }, get briefing() { return briefing; }, get miniapps() { return miniapps; }, get quant() { return quant; }, get market() { return market; }, get research() { return research; }, get knowledge() { return knowledge; }, get portfolio() { return portfolio; }, get trade() { return trade; }, get dataset() { return dataset; }, get security() { return security; }, get audit() { return auditLog; }, privacy: () => store.data.security?.privacy, openDocument: id => { focus(); if (win && !win.isDestroyed()) win.webContents.send('actwill:openPage', { page: 'library', document: id }); }, openMarket: (code, period, name) => { focus(); if (win && !win.isDestroyed()) win.webContents.send('actwill:openPage', { page: 'market', code, period, name }); }, openQuant: code => { focus(); if (win && !win.isDestroyed()) win.webContents.send('actwill:openPage', { page: 'quant', code }); } };
        conversations = createConversationService({ appTools: appDeps, approve, rules: approvalRules, models, secrets:mcpSecrets, images, queue:runs, store, active, key, view, executeTool, releaseToolGrants:id=>toolRuntime.releaseGrants(id), notify: notifyRuntime,notifyStream:event=>{if(win&&!win.isDestroyed())win.webContents.send('actwill:stream',event);cliAsk?.stream(event);},onCompleted:e=>{conversationFinished(e);cliAsk?.finished(e);} });
        if(runtimeRoot()){
            const kit=createOfficeWorkspace({documents:toolRuntime.documents,directory:path.join(store.dir,'office-kit'),runtime:officeRuntime,approve,requireOpenApproval:false,notify:notifyRuntime,
                allowStandby:()=>officeWarmEnabled()&&!closing,
                onStandbyTiming:timing=>officeEngine?.record('editorWorker',timing),
                audit:async event=>{const prev=store.data.executions;store.data.executions=[event,...prev.filter(e=>e.id!==event.id)].slice(0,300);try{await store.save();}catch(e){store.data.executions=prev;throw e;}notifyRuntime();}});
            const officeChat=createOfficeChat({store,kit,models,key,approve,queue:runs,notify:notifyRuntime});
            officeWindows=createOfficeWindows({BrowserWindow,ipcMain,here,kit,chat:officeChat,models,documents:toolRuntime.documents,dialog,canOpen:()=>!security?.locked&&!closing,notice: message => {
                focus();
                win?.webContents.send('actwill:openPage', { page: 'notice', message });
            }});
            const officeClosePrompts = new Map();
            register('officeCloseDecision', ({token, choice}) => {
                if (['save','discard','cancel'].includes(choice)) officeClosePrompts.get(token)?.(choice);
            });
            const promptOfficeClose = (docId, card) => new Promise(resolve => {
                if (!win || win.isDestroyed() || security?.locked) return resolve('cancel');
                const token = officeRequestId();
                const finish = choice => {
                    clearTimeout(timeout);
                    officeClosePrompts.delete(token);
                    resolve(choice);
                };
                const timeout = setTimeout(() => finish('cancel'), 60_000);
                officeClosePrompts.set(token, finish);
                focus();
                win.webContents.send('actwill:openPage', {page:'office-close', docId, token, card});
            });
            const documents = toolRuntime.documents;
            const userData = app.getPath('userData');
            const versions = {
                head:docId => documents.read(docId).revision,
                fingerprint:docId => {
                    const {revision, sha256, time} = documents.read(docId);
                    return {identity:revision, sha256, mtime:time};
                },
                async record(job) {
                    if (job.isCopy) {
                        const result = await documents.importOfficeCopy(job.docId, job.bytes, job.id);
                        return {copyId:result.document.id};
                    }
                    const result = await documents.replaceBytes(job.docId, job.bytes, {
                        expectedRevision:job.expectedRevision, requestId:job.id, mergeKey:job.mergeKey,
                        reason:job.reason, nativeOffice:true,
                    });
                    if (result.conflict) throw Object.assign(Error('Office 保存冲突'), {code:'OFFICE_CONFLICT'});
                    return result;
                },
                finalize:({docId, mergeKey}) => documents.replaceBytes(docId, documents.read(docId).revision, null,
                    undefined, {mergeKey, finalize:true, nativeOffice:true}),
            };
            const journal = createOfficeCommitJournal({userData, codec:vault.codec, versions});
            const recovered = await journal.recover();
            if (recovered.completed || recovered.deferred) {
                store.log('Office 提交恢复', '已补录 ' + recovered.completed + '，待处理 ' + recovered.deferred);
                await store.save();
            }

            const ensureOfficeTabs = () => {
                const encrypted = vault.encrypted;
                if (!officeTabsStarting) officeTabsStarting = (async () => {
                    const scratchDirectory = path.join(app.getPath('userData'), 'office', 'tmp');
                    await mkdir(scratchDirectory, {recursive:true, mode:0o700});
                    const worker = await startOfficeLokWorker({...await officeRuntime(), scratchDirectory});
                    const autosave = registerOfficeAutosave({
                        promptClose:promptOfficeClose,
                        defaults:{userData, codec:vault.codec, versions, journal},
                    });
                    const manager = createOfficeSessionManager({
                        worker, autosave, keepActiveViews:true, ephemeralSource:encrypted,
                        resolveDocument:({documentId}) => documents.bytes(documentId, documents.read(documentId).revision),
                        commit:(docId, bytes, options) => documents.replaceBytes(docId, bytes, {...options, nativeOffice:true}),
                    });
                    void worker.closed.then(() => {
                        manager.abandon();
                        if (officeTabs === manager) officeTabs = officeTabsStarting = undefined;
                    });
                    return manager;
                })().then(manager => officeTabs = manager).catch(error => {
                    officeTabsStarting = undefined;
                    throw error;
                });
                return officeTabsStarting;
            };

            register('officeAttach', async ({id, token}) => {
                if (typeof token !== 'string' || !/^[a-f0-9-]{36}$/.test(token)) throw Error('Office 页签标识无效');
                if (previewDiskTransitions) throw Error('安全设置正在更新，请重新打开文档');
                const encrypted = vault.encrypted;
                const frame = win.webContents.mainFrame;
                const manager = await ensureOfficeTabs();
                const view = await manager.open({documentId:id, mode:'edit'});
                const closeView = attached => manager.closeView(attached);
                if (closing || security?.locked || vault.encrypted !== encrypted || win.webContents.mainFrame !== frame || frame.detached) {
                    await closeView(view);
                    throw Error('Office 页签已失效');
                }
                const {port1, port2} = new MessageChannelMain();
                const dispose = bindOfficeViewPort(port1, view, closeView, () => !closing && !security?.locked && vault.encrypted === encrypted);
                try { frame.postMessage('actwill:officePort', token, [port2]); }
                catch (error) { dispose(); port2.close(); throw error; }
                return true;
            });
            const officeDocuments = toolRuntime.documents;
            const officeScratch = path.join(app.getPath('userData'), 'office', 'tmp');
            const officeUndo = createFileOfficeUndoStore(path.join(app.getPath('userData'), 'office', 'undo'));
            const opsEngine = await createNativeOfficeOpsEngine(officeDocuments, {
                undoStore:officeUndo,
                async withNativeDocument(source, perform) {
                    if (officeAI.blockReason()) throw Error(officeAI.blockReason());
                    await mkdir(officeScratch, {recursive:true, mode:0o700});
                    const worker = await startOfficeLokWorker({...await officeRuntime(), scratchDirectory:officeScratch});
                    const sessionId = officeRequestId();
                    try {
                        await worker.request('open', {sessionId, format:source.format, bytes:source.bytes, readOnly:false});
                        const {viewId} = await worker.request('attach', {sessionId});
                        return await perform((op, payload = {}) => worker.request(op, {...payload, sessionId, viewId}));
                    } finally {
                        await worker.close();
                    }
                },
            });
            const adapter = createOpsAdapter(opsEngine);
            officeTools = createOfficeTools({
                adapter, documents:officeDocuments,
                blockReason:() => security?.locked || previewDiskTransitions ? '安全设置正在更新，Office AI 已暂停。' : officeAI.blockReason(),
                requestApproval:(...args) => officeApprovals.request(...args),
                readQuant:(...args) => createOfficeQuantReader({store, market, quant})(...args),
                openDocument:(docId, {target} = {}) => ({documentId:docId, target}),
            });
            register('officeResultAction', async ({chatId, token, action, index}) => {
                const chat = store.data.chats.find(item => item.id === chatId);
                const card = chat?.messages.flatMap(message => message.officeResults ?? []).find(item => item.undoToken === token);
                if (!card) throw Error('Office 结果不存在');
                const result = await officeTools.resultAction(card, action, {chatId, index});
                if (action === 'officeRollback' && result?.status === 'succeeded') await officeTabs?.refresh(card.docId);
                return result;
            });
            officeEditWindows = createOfficeEditWindows({
                BrowserWindow, ipcMain, MessageChannelMain, here, sessions:ensureOfficeTabs, documents:toolRuntime.documents,
                canOpen:() => !security?.locked && !closing,
                onEvent:(docId, type, detail) => {
                    if (win && !win.isDestroyed()) win.webContents.send('actwill:officeWindow', {id:docId, type, detail});
                },
            });
            register('officeOpen', p => officeEditWindows.open(p.id, p.revision, p.target));
            register('officeLegacyOpen', p => officeWindows.open(p.id, p.revision));
            officeEngine=createOfficeEngine({
                enabled:officeWarmEnabled, defer:deferOfficeWarm, notify:notifyRuntime,
                warmPreview:()=>libreoffice.warmPreview(), warmEditor:()=>kit.prewarm(),
            });
            powerMonitor.on('on-ac', () => officeEngine?.settingsChanged());
        }
        tasks = createTaskService({ models, queue:runs, notify:notifyRuntime, store, active, key, view, conversations, rules: approvalRules, notifyCompleted: task => {
                if (Notification.isSupported())
                    new Notification({ title: 'QuankSight · 任务完成', body: task.name }).show();
            } });
        // [p2-m4] daily briefing
        briefing = createBriefingService({ store, models, key, notify: notifyRuntime, onReady: b => {
            try {
                if (b.trigger !== 'schedule' || (win && !win.isDestroyed() && win.isFocused()) || !Notification.isSupported()) return;
                const need = b.counts.attention || 0, done = b.counts.done || 0;
                const n = new Notification({ title: 'QuankSight · 今日简报', body: (need ? `${need} 项需要你处理，` : '') + `上次以来完成 ${done} 项` });
                n.on('click', () => { focus(); win?.webContents.send('actwill:openPage', { page: 'feed' }); }); n.show();
            } catch {}
        } });
        register('briefingGenerate', async () => { await briefing.generate({ manual: true }); return view(); });
        register('briefingSettings', async p => { await briefing.settings(p); return view(); });
        // [p3-m1] connectors: credentials sealed with the same OS secure storage as MCP tokens
        connectors = createConnectorService({ store, secrets: createMcpSecretCodec(safeStorage), notify: notifyRuntime,
            confirm: async ({ title, detail }) => await approve(title, detail, undefined, { highRisk: true }) === true }); // [p3-m3] every send confirmed
        register('connector', async p => { const result = await connectors.handle(p); return { result, state: view() }; });
        // [p3-m5] knowledge graph (extraction uses the configured model)
        graphService = createGraphService({ store, models, key, notify: notifyRuntime });
        register('graph', async p => { const result = await graphService.handle(p); return { result, state: view() }; });
        // [p4-m1] dashboards: files come only from the system open dialog; exports go through the save dialog
        dashboards = createDashboardService({ store, models, key, notify: notifyRuntime,
            chooseFile: async () => { const r = await dialog.showOpenDialog(win, { title: '选择 Excel 或 CSV 文件', properties: ['openFile'], filters: [{ name: '表格', extensions: ['xlsx', 'csv', 'tsv', 'txt'] }] }); return r.canceled || !r.filePaths[0] ? null : { path: r.filePaths[0] }; },
            readFile: async p => { const s = await stat(p); if (s.size > 16 * 1024 * 1024) throw new Error('文件超过 16MB'); return readFile(p); },
            saveFile: async ({ name, format, bytes }) => { const r = await dialog.showSaveDialog(win, { title: '导出仪表盘', defaultPath: name.replace(/[\\/:*?"<>|]/g, '_'), filters: [{ name: format.toUpperCase(), extensions: [format] }] }); if (r.canceled || !r.filePath) return false; await writeFile(r.filePath, bytes); return true; },
            standaloneHtml: async view => { const dir = path.join(here, 'src/viz'); const [html, ec, fr] = await Promise.all(['index.html', 'echarts.min.js', 'frame.js'].map(n => readFile(path.join(dir, n), 'utf8'))); const data = JSON.stringify(view).replace(/</g, '\\u003c'); return html.replace('<script src="echarts.min.js"></script>', () => '<script>' + ec.replace(/<\/script/gi, '<\\/script') + '</script>').replace('<script src="frame.js"></script>', () => '<script>window.__WB_VIEW__=' + data + ';</script><script>' + fr + '</script>'); } });
        register('dashboard', async p => { const result = await dashboards.handle(p); return { result, state: view() }; });
        // [p4-m2] comparison tables saved into the library
        const comparisons = createComparisonService({ documents: toolRuntime.documents, store, notify: notifyRuntime });
        register('comparison', async p => { const result = await comparisons.handle(p); return { result, state: view() }; });
        // [p4-m3] infographics: PNG is rasterised in the renderer; PDF is printed from an off-screen window with JavaScript disabled
        const infographics = createInfographicService({ store, models, key, notify: notifyRuntime,
            saveFile: async ({ name, format, bytes }) => { const r = await dialog.showSaveDialog(win, { title: '导出信息图', defaultPath: name.replace(/[\\/:*?"<>|]/g, '_'), filters: [{ name: format.toUpperCase(), extensions: [format] }] }); if (r.canceled || !r.filePath) return false; await writeFile(r.filePath, bytes); return true; },
            chooseLogo: async () => { const r = await dialog.showOpenDialog(win, { title: '选择 logo 图片', properties: ['openFile'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg'] }] }); if (r.canceled || !r.filePaths[0]) return null; const s = await stat(r.filePaths[0]); if (s.size > 2 * 1024 * 1024) throw new Error('logo 图片需要不超过 2MB'); const img = nativeImage.createFromPath(r.filePaths[0]); if (img.isEmpty()) throw new Error('无法读取这张图片'); const { height } = img.getSize(); return (height > 160 ? img.resize({ height: 160, quality: 'best' }) : img).toPNG(); },
            pdfFromSvg: async (svg, width, height) => { const w = new BrowserWindow({ show: false, width, height, webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: false } }); w.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); w.webContents.on('will-navigate', e => e.preventDefault()); try { await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:0}html,body{margin:0;padding:0}svg{display:block}</style></head><body>${svg}</body></html>`)); return await w.webContents.printToPDF({ printBackground: true, pageSize: { width: width / 96, height: height / 96 }, margins: { top: 0, bottom: 0, left: 0, right: 0 } }); } finally { w.destroy(); } } });
        register('infographic', async p => { const result = await infographics.handle(p); return { result, state: view() }; });
        // [p4-m4] mini apps: code and data stay in the store; the renderer fetches them only when an app is opened
        miniapps = createMiniAppService({ store, models, key, notify: notifyRuntime,
            saveFile: async ({ name, format, bytes }) => { const r = await dialog.showSaveDialog(win, { title: '导出小应用', defaultPath: name.replace(/[\\/:*?"<>|]/g, '_'), filters: [{ name: 'HTML', extensions: [format] }] }); if (r.canceled || !r.filePath) return false; await writeFile(r.filePath, bytes); return true; } });
        // [q1] local private quant engine (the user's own strategy project, run as a child process on 127.0.0.1)
        dataset = createDatasetService({ dir: path.join(app.getPath('userData'), 'quant'), market: { handle: p => market ? market.handle(p) : Promise.reject(new Error('行情未就绪')) }, quantSource: () => store.data.quant?.source || '', notify: notifyRuntime, log: (t, d) => store.log?.(t, d), // [v0.53]
            saveDialog: async ({ name, ext }) => { const r = await dialog.showSaveDialog(win, { title: '导出训练数据', defaultPath: path.join(app.getPath('downloads'), name), filters: [{ name: ext.toUpperCase(), extensions: [ext] }] }); return r.canceled ? '' : r.filePath; } });
        const seal = s => 'v1:' + safeStorage.encryptString(s).toString('base64');
        // [v1.0.2] A value that cannot be opened becomes a readable error instead of Chromium's raw safeStorage message.
        const unseal = s => { if (!String(s || '').startsWith('v1:')) return s; try { return safeStorage.decryptString(Buffer.from(String(s).slice(3), 'base64')); } catch { const e = new Error('已保存的引擎凭据无法读取（应用改名后钥匙串未迁移），请在量化设置里重新填写'); e.code = 'QK_UNSEAL'; throw e; } };
        quant = createQuantEngine({ onSignal: (code, summary) => { void dataset?.record(code, summary).catch(() => {}); }, // [v0.53] training data
            onReport: async (r, md) => { const pool = store.data.quant?.pool || []; await research?.handle({ action: 'archive', kind: 'quant', reportId: r.id, date: r.date, title: `${r.title} · ${r.date}`, summary: r.summary, metrics: r.metrics, text: md || [r.summary, ...(r.items || []).map(x => `- ${x.title}${x.detail ? '：' + x.detail : ''}`)].filter(Boolean).join('\n'), tags: ['量化日报', ...pool.slice(0, 3).map(p => p.name).filter(Boolean)] }); }, // [v0.53] 日报复盘 → 资料库
            dir: path.join(app.getPath('userData'), 'quant'), store, lookup: createStockLookup(), notify: notifyRuntime, onAlert: a => { try { if (!normalizeWatch(store.data.quant?.watch).notify || !Notification.isSupported()) return; // [q3]
                if (a.kind !== 'change' || !/^(BUY|STRONG_BUY|SELL|STRONG_SELL)$/i.test(String(a.to || ''))) return; // [v0.52.1] only buy / sell points
                const n = new Notification(a.kind === 'report' ? { title: `QuankSight · ${a.title}`, body: a.ok ? `${a.summary || '已生成'}${(a.warnings || []).length ? '\n⚠ ' + a.warnings[0] : ''}`.slice(0, 200) : `生成失败：${a.summary || ''}`.slice(0, 200) } : a.kind === 'digest' ? { title: 'QuankSight · 盘前量化简报', body: `${a.counts.total} 只：${a.counts.buy} 个买点，${a.counts.sell} 个风控提示` } : { title: 'QuankSight · 量化信号变化', body: `${a.name || a.code}：${quantActionLabel(a.from)} → ${quantActionLabel(a.to, a.toText)}${a.score != null ? `，综合分 ${a.score}` : ''}` });
                n.on('click', () => { focus(); win?.webContents.send('actwill:openPage', { page: 'quant', ...(a.kind === 'change' ? { code: a.code } : {}), ...(a.kind === 'report' ? { report: a.reportId } : {}) }); }); n.show(); } catch {} },
            seal: s => safeStorage.isEncryptionAvailable() ? seal(s) : s,
            unseal,
            aiGateway: () => { const r = models.resolve('legacy', '', { tools: false, vision: false }); const s = r?.settings || store.data.settings; if (!s?.model || !s?.baseUrl) return null; return { baseUrl: String(s.baseUrl).replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, ''), model: s.model, key: r ? r.key() : key() }; },
            chooseFolder: async current => { const r = await dialog.showOpenDialog(win, { title: '选择你的策略项目文件夹（根目录需有 wb-engine.json）', ...(current ? { defaultPath: current } : {}), properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; } });
        quantAutostart = createQuantAutostart({
            enabled: () => store.data.quant?.startupEngine === true,
            officePhase: () => officeWarmEnabled() ? officeEngine?.state().phase : null,
            defer: deferOfficeWarm,
            run: canRun => quant.startup(canRun),
            onError: error => console.warn('[Quant]', error.message),
        });
        register('quant', async p => { const result = await quant.handle(p); return { result, state: view() }; });
        market = createMarketService({ store, lookup: createStockLookup(), notify: notifyRuntime, onAlert: a => { try { if (!Notification.isSupported()) return; const n = new Notification({ title: `QuankSight · ${a.title}`, body: a.detail }); n.on('click', () => { focus(); win?.webContents.send('actwill:openPage', { page: 'market', code: a.code }); }); n.show(); } catch {} } }); // [F1]
        // [F2] research documents: announcements, reports, library, exports. Charts are rasterised in a hidden offscreen window.
        const rasterize = async (svg, { width = 960, height = 460 } = {}) => {
            const w = new BrowserWindow({ show: false, width, height, useContentSize: true, webPreferences: { offscreen: true, javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false } });
            try {
                await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><html><body style="margin:0;background:#fff;width:${width}px;height:${height}px;overflow:hidden"><div style="width:${width}px">${svg}</div></body></html>`));
                await new Promise(r => setTimeout(r, 120));
                const img = await w.webContents.capturePage({ x: 0, y: 0, width, height });
                return img.isEmpty() ? null : img.toPNG();
            } finally { if (!w.isDestroyed()) w.destroy(); }
        };
        const researchAsk = async (system, user) => { const route = models?.resolve('legacy', '', { tools: false, vision: false }); const s = route?.settings || store.data.settings; if (!s?.model || !s?.baseUrl) throw new Error('未配置模型'); const r = await complete(s, route ? route.key() : key(), [{ role: 'system', content: system }, { role: 'user', content: user }], AbortSignal.timeout(60000)); return String(r?.text || '').trim(); };
        research = createResearchService({ store, documents: toolRuntime.documents, market, quant, compliance: { settings: () => security?.compliance(), note: (r, m) => security?.noteReview(r, m) }, finance: code => knowledge ? knowledge.forReport(code) : Promise.reject(new Error('知识库未就绪')), ask: researchAsk, rasterize, notify: notifyRuntime, onAlert: a => { try { if (!Notification.isSupported()) return; const n = new Notification({ title: `QuankSight · ${a.title}`, body: a.detail }); n.on('click', () => { focus(); win?.webContents.send('actwill:openPage', { page: 'quant', code: a.code }); }); n.show(); } catch {} } });
        knowledge = createKnowledgeService({ store, research, market, web: appDeps.web, notify: notifyRuntime, onAlert: a => { try { if (!Notification.isSupported()) return; const n = new Notification({ title: `QuankSight · ${a.title}`, body: a.detail }); n.on('click', () => { focus(); win?.webContents.send('actwill:openPage', { page: 'library', ...(a.documentId ? { document: a.documentId } : {}) }); }); n.show(); } catch {} } }); // [F3]
        portfolio = createPortfolioService({ store, quant, market, knowledge, research, notify: notifyRuntime, onAlert: a => { try { if (!Notification.isSupported()) return; const n = new Notification({ title: `QuankSight · ${a.title}`, body: a.detail }); n.on('click', () => { focus(); win?.webContents.send('actwill:openPage', { page: 'quant', ...(a.code ? { code: a.code } : {}) }); }); n.show(); } catch {} } }); // [F4]
        // [F5] 安全与合规
        const aiDefault = () => { const r = models.resolve('legacy', '', { tools: false, vision: false }); const s0 = r?.settings || store.data.settings; if (!s0?.model || !s0?.baseUrl) return null; return { baseUrl: String(s0.baseUrl).replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, ''), model: s0.model, key: r ? r.key() : key(), name: r?.profile?.name || s0.name || '' }; };
        security = createSecurityService({ store, audit: auditLog, egress, vault, dir: app.getPath('userData'), appName: APP_NAME, displayName: DISPLAY_NAME, notify: () => { if (security?.locked) { approve.cancelAll(); void coding?.cancelActive(); void closeCodingRunners(); } notifyRuntime(); },
            idleSeconds: () => { try { return powerMonitor.getSystemIdleTime(); } catch { return 0; } },
            touchId: { can: () => { try { return process.platform === 'darwin' && systemPreferences.canPromptTouchID(); } catch { return false; } }, prompt: reason => systemPreferences.promptTouchID(reason) },
            saveFile: async ({ title, defaultName, filters }) => { const r = await dialog.showSaveDialog(win, { title, defaultPath: path.join(app.getPath('documents'), defaultName), filters }); return r.canceled ? null : r.filePath; },
            openFile: async ({ title, filters }) => { const r = await dialog.showOpenDialog(win, { title, properties: ['openFile'], filters }); return r.canceled ? null : r.filePaths[0]; },
            relaunch: async () => { await coding?.close(); app.relaunch(); app.exit(0); },
            secretsView: () => { const ai = aiDefault(); let host = ''; try { host = ai ? new URL(ai.baseUrl).hostname : ''; } catch {} return {
                models: (models?.view() || []).map(m => { let h = ''; try { h = new URL(m.baseUrl).hostname; } catch {} return { id: m.id, name: m.name, host: h, model: m.model, hasKey: !!m.hasKey, keySaved: !!m.keySaved, enabled: m.enabled !== false }; }),
                legacy: { hasKey: !!sessionKey || !!store.data.settings?.encryptedKey, keySaved: !!store.data.settings?.encryptedKey, model: store.data.settings?.model || '' },
                mcp: mcpViews(store.data).filter(c => c.auth !== 'none' || (c.envNames || []).length).map(c => ({ id: c.id, name: c.name, auth: c.auth, hasToken: c.hasToken, signedIn: c.signedIn, envNames: c.envNames || [] })),
                connectors: (connectors?.view()?.connectors || []).map(c => ({ id: c.id, name: c.name, kind: c.kind })),
                engine: { ai: store.data.quant?.ai || 'willbuddy', model: ai?.model || '', host, configFile: path.join(app.getPath('userData'), 'quant', 'engine', 'config.json') },
                secureStorage: safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text' }; },
            testModel: async () => { const ai = aiDefault(); if (!ai) return { ok: false, message: '还没有配置默认模型' }; let host = ''; try { host = new URL(ai.baseUrl).hostname; } catch {}
                if (!ai.key) return { ok: false, host, message: '默认模型没有保存 API Key' };
                try { const r = await fetch(ai.baseUrl + '/models', { headers: { authorization: `Bearer ${ai.key}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
                    if (r.ok) return { ok: true, host, status: r.status, model: ai.model, message: '密钥有效' };
                    return { ok: false, host, status: r.status, model: ai.model, message: r.status === 401 || r.status === 403 ? '密钥无效或已失效（服务返回 ' + r.status + '）。请在「模型设置」里更换 API Key，然后在量化页点「重启」让策略引擎用上新密钥' : r.status === 404 ? '服务不支持模型列表接口，无法判断密钥是否有效；可以直接发一条对话试试' : `服务返回 ${r.status}` };
                } catch (e) { return { ok: false, host, message: e?.code === 'QK_OFFLINE' ? e.message : `连不上 ${host}：${String(e?.message || e).slice(0, 80)}` }; } } });
        coding = createCodingService({
            // C1 replaces the configuration object on save. Preserve the C3 task log across those writes.
            store: {
                get data() {
                    return new Proxy(store.data, { set(target, key, value) {
                        if (key === 'coding' && value && target.coding?.tasks) value.tasks = target.coding.tasks;
                        return Reflect.set(target, key, value);
                    } });
                },
                save: () => store.save(),
            },
            terminalPython: () => quant.view().pythonFound,
            projectDir: () => store.data.quant?.mode === 'remote' ? '' : store.data.quant?.source,
            locked: () => !!security?.locked,
            offline: () => !!store.data.security?.privacy?.offline,
            seal: value => {
                if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text')
                    throw new Error('系统安全存储不可用，无法保存代理环境变量');
                return seal(value);
            },
            unseal,
            audit: event => auditLog?.record(event),
        });
        function summarizeCodingTask({ stream, result, ...task }) {
            return { ...task, ...(result ? { result: { diffStat: result.diffStat } } : {}) };
        }
        codingTasks = createCodingTasks({
            store, coding, quant, research, dataset,
            locked: () => !!security?.locked || closing,
            audit: event => auditLog?.record(event),
            notify: task => {
                if (task.pendingPermission) approvalCreated({
                    ...task.pendingPermission, agent: 'Coding 智能体', source: task.title,
                });
                const title = { review: '量化代码迭代待合并', no_changes: '量化代码迭代无改动', failed: '量化代码迭代失败' }[task.status];
                if (title) {
                    store.log(title, task.title);
                    void store.save().catch(() => {});
                }
                notifyRuntime();
            },
            runnerFactory: (kind, { redactWith, ...opts }) => {
                const agent = store.data.coding?.agents?.find(item => item.id === opts.id);
                let env;
                try { env = Object.fromEntries(Object.entries(agent?.envSealed || {}).map(([key, value]) => [key, unseal(value)])); }
                catch { throw Object.assign(new Error('无法读取代理的鉴权配置'), { kind: 'auth' }); }
                redactWith(Object.values(env));
                const runner = createCodingRunner({ ...opts, kind, models, env: { ...env, GIT_ALLOW_PROTOCOL: '' },
                    terminalPython: quant.view().pythonFound, offline: () => !!store.data.security?.privacy?.offline });
                activeCodingRunners.add(runner);
                runner.on('end', () => activeCodingRunners.delete(runner));
                return runner;
            },
        });
        observeCodingTasks(store, appDeps);
        codingTasks.on('change', task => {
            if (win && !win.isDestroyed()) win.webContents.send('actwill:codingTask', summarizeCodingTask(task));
        });
        const handleCoding = coding.handle;
        coding.handle = async p => {
            if (p?.action !== 'detect') return handleCoding(p);
            // Search stable PATH entries before paths managed by npm exec's disposable cache.
            const entries = (process.env.PATH || '').split(path.delimiter);
            const caches = await Promise.all(entries.map(async entry => {
                const resolved = entry && await realpath(entry).catch(() => entry);
                return /[\\/]_npx[\\/]/.test(resolved || '');
            }));
            const searchPath = [...entries.filter((_, i) => !caches[i]), ...entries.filter((_, i) => caches[i])].join(path.delimiter);
            const candidates = await detectAgents({ searchPath });
            if (security?.locked) throw new Error('QuankSight 已锁定，请先解锁');
            return Promise.all(candidates.map(async candidate => ({
                ...candidate, npmCache: /[\\/]_npx[\\/]/.test(await realpath(candidate.command).catch(() => candidate.command)),
            })));
        };
        register('coding', async p => ({ result: await coding.handle(p) }));
        register('codingTasks', async p => {
            switch (p?.action) {
                case 'list': return { result: codingTasks.list().map(summarizeCodingTask) };
                case 'get': return { result: codingTasks.get(p.id) };
                case 'start': {
                    const agreed = await approve('启动 Coding 任务', '在本地策略项目创建分支。\n需求：' + String(p.request || '').slice(0, 750), undefined, { agent: 'Coding 智能体' });
                    if (!(agreed === true || agreed?.allowed)) return { result: null };
                    return { result: await codingTasks.start({ agentId: p.agentId, request: p.request, source: 'ui' }) };
                }
                case 'followup': return { result: await codingTasks.followup(p.id, p.request) };
                case 'permission': return { result: await codingTasks.respondPermission(p.id, p.requestId, p.decision) };
                case 'stop': return { result: await codingTasks.stop(p.id) };
                case 'openReport': {
                    const error = await shell.openPath(await codingTasks.reportFile(p.id));
                    if (error) throw new Error('无法打开迭代报告');
                    return { result: true };
                }
                case 'merge':
                case 'discard': {
                    const task = codingTasks.get(p.id);
                    const merge = p.action === 'merge';
                    const strategy = task.strategyProject !== false;
                    const action = merge ? (strategy ? '合并并重启引擎' : '合并代码项目') : '放弃迭代';
                    const detail = merge
                        ? (strategy ? '合并到原分支，随后同步策略、重启本地引擎并刷新股票池信号。' : '将代码项目的改动合并到原分支。')
                        : '删除迭代分支并返回原分支，保留迭代报告。';
                    if (!await approve(action, task.title + '\n' + detail, undefined, { agent: 'Coding 智能体', codingTaskId: task.id, source: task.title, highRisk: true }))
                        return { result: task };
                    if (codingTasks.get(p.id).updatedAt !== task.updatedAt) throw new Error('迭代已更新，请重新核对后确认');
                    return { result: await codingTasks[p.action](p.id) };
                }
                case 'specDefault': return { result: await codingSpec(null, 'get') };
                case 'specGet': return { result: await codingSpec(store.dir, 'get') };
                case 'specSave': return { result: await codingSpec(store.dir, 'save', p.text) };
                case 'specReset': return { result: await codingSpec(store.dir, 'reset') };
                default: throw new Error('未知的 Coding 任务操作');
            }
        });
        register('codingBrowse', async () => {
            const result = await dialog.showOpenDialog(win, { title: '选择代理可执行文件', properties: ['openFile'] });
            if (security?.locked) throw new Error('QuankSight 已锁定，请先解锁');
            return result.canceled ? null : result.filePaths[0];
        });
        let codingDrained = false;
        app.on('will-quit', event => {
            if (codingDrained) return;
            event.preventDefault();
            void Promise.allSettled([coding.close(), closeCodingRunners()]).finally(() => { codingDrained = true; app.quit(); });
        });
        // [v0.51 CLI] quank: local socket bridge to the same app tools (off until the user turns it on)
        {
            const userDir = app.getPath('userData');
            const toolList = () => appToolDefinitions().map(d => ({ name: d.function.name, description: d.function.description, parameters: d.function.parameters }));
            cliAsk = createAskRunner({ conversations, store, isBusy: id => active.has(id) || !!runs.hasOwner?.('conversation', id) });
            const handler = createCliHandler({
                tools: { list: toolList, call: (name, args, { audience, via }) => executeAppTool(name, args, { store, deps: audience === 'model' ? appDeps : Object.assign(Object.create(appDeps), { privacy: () => ({}) }), ask: (t, d, s) => approve(t, d, s), via }) },
                ask: o => cliAsk.ask(o), cancel: id => conversations.cancel(id), locked: () => !!security?.locked,
                info: () => ({ version: app.getVersion(), tools: toolList().length }), audit: e => { auditLog?.record(e).catch(() => {}); } });
            const cliServer = createCliServer({ dir: userDir, handler });
            const cliInstaller = createCliInstaller({ dir: userDir, bundled: path.join(here, 'services', 'cli', 'quank.cjs'), electron: process.execPath, socket: cliServer.socket, tokenFile: cliServer.tokenFile });
            const cliCtl = {
                async view() { const s = cliServer.status(), installed = await cliInstaller.installed(); return { enabled: !!store.data.cli?.enabled, ...s, installed, bin: cliInstaller.bin, inPath: installed ? await cliInstaller.inPath() : false, mcp: cliInstaller.mcpConfig() }; },
                async enable(on) { store.data.cli = { ...(store.data.cli || {}), enabled: !!on }; await store.save(); if (on) await cliServer.start(); else await cliServer.stop(); return cliCtl.view(); },
                async install() { const r = await cliInstaller.install(); if (!store.data.cli?.enabled) await cliCtl.enable(true); return { ...r, view: await cliCtl.view() }; },
                async uninstall() { await cliInstaller.uninstall(); return cliCtl.view(); },
            };
            security.attachCli(cliCtl);
            if (store.data.cli?.enabled) cliServer.start().catch(e => console.error('quank 命令行启动失败', e));
            cliInstaller.refresh().catch(() => {});
            app.on('will-quit', () => { cliServer.stop().catch(() => {}); });
        }
        register('security', async p => {
            const changingEncryption = p?.action === 'encrypt' && !security.locked && Boolean(p.enabled) !== vault.encrypted;
            if (changingEncryption) previewDiskTransitions++;
            try {
                if (changingEncryption) {
                    await (await officeTabsStarting)?.close();
                    if (p.enabled) await libreoffice?.clearPreviewDisk();
                }
                const result = await security.handle(p);
                if (changingEncryption && Boolean(p.enabled) === vault.encrypted) {
                    await migrateOfficeDrafts(app.getPath('userData'), vault.codec);
                }
                return ['view', 'egressList', 'auditList', 'auditVerify', 'review', 'secrets', 'testModel'].includes(p?.action) ? { result } : { result, state: view() };
            } finally { if (changingEncryption) previewDiskTransitions--; }
        });
        powerMonitor.on('lock-screen', () => security?.onSleep()); powerMonitor.on('suspend', () => security?.onSleep());
        trade = createTradeService({ store, quant, market, portfolio, broker: createBrokerBrowser({ BrowserWindow }), notify: notifyRuntime, onAlert: a => { try { if (!Notification.isSupported()) return; const n = new Notification({ title: `QuankSight · ${a.title}`, body: a.detail }); n.on('click', () => { focus(); win?.webContents.send('actwill:openPage', { page: 'tasks', tab: 'trade' }); }); n.show(); } catch {} } }); // [v0.52]
        register('dataset', async p => { const result = await dataset.handle(p); return p?.action === 'view' ? { result } : { result, state: view() }; }); // [v0.53]
        register('trade', async p => { const result = await trade.handle(p); return ['view', 'readBack'].includes(p?.action) ? { result } : { result, state: view() }; });
        register('portfolio', async p => { const result = await portfolio.handle(p); return ['view', 'overview', 'risk', 'stress', 'simulate'].includes(p?.action) ? { result } : { result, state: view() }; });
        register('knowledge', async p => { const result = await knowledge.handle(p); return ['view', 'search', 'finance', 'graph', 'profile', 'compare', 'topicCollect'].includes(p?.action) ? { result } : { result, state: view() }; });
        register('research', async p => { const result = await research.handle(p); return ['view', 'library', 'read'].includes(p?.action) ? { result } : { result, state: view() }; });
        register('market', async p => { const result = await market.handle(p); return ['kline', 'quotes', 'sectors', 'sectorStocks', 'resolve', 'watch', 'live'].includes(p?.action) ? { result } : { result, state: view() }; });
        app.on('before-quit', () => { quant?.stop().catch(() => {}); });
        register('miniapp', async p => { const result = await miniapps.handle(p); return ['get', 'storage', 'versions', 'export'].includes(p?.action) ? { result } : { result, state: view() }; });
        await store.save();
        Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'QuankSight', submenu: [{ label: '显示工作台', click: focus }, { label: '取消所有操作确认', accelerator: 'CommandOrControl+Shift+Escape', click: () => approve.cancelAll() }, { label: '撤销浏览器任务授权', click: () => { toolRuntime.revokeGrants(); approve.cancelAll(); } }, { role: 'about' }, { type: 'separator' }, { role: 'quit' }] }, { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }, { label: '视图', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }] }]));
        const workspace = createWorkspaceService({ store, active, view });
        for (const [name, handler] of Object.entries(workspace))
            register(name, handler);
        // [p1-m2] conversation folders / pin / archive / rename / incognito
        const chatService = createChatService({ store, active, view, queued: (kind, id) => (store.data.runJobs || []).some(j => j.kind === kind && j.ownerId === id && ['queued', 'running', 'cancelling'].includes(j.status)) });
        for (const [name, handler] of Object.entries(chatService))
            register(name, handler);
        const capabilityLibrary=createCapabilityLibrary({store,approve,secrets:mcpSecrets,notify:notifyRuntime,openExternal:url=>shell.openExternal(url),localDir:path.join(app.getPath('userData'),'mcp-local')}); // [mcp2]
        const importSkill=createSkillImporter({dialog,getWindow:()=>win,library:capabilityLibrary});
        app.on('before-quit',()=>capabilityLibrary.close());
        register('skillImport',async()=>{const imported=await importSkill();return {imported,state:view()};});
        register('skillPreset',async p=>{const imported=await capabilityLibrary.installPreset(p.id);return {imported,state:view()};});
        register('skillRead',p=>capabilityLibrary.readSkill(p.id));
        register('skillUpdate',async p=>{await capabilityLibrary.skill(p);return view();});
        register('mcpConnection',async p=>{const saved=await capabilityLibrary.connection(p);return {saved,state:view()};});
        register('mcpTest',async p=>{const result=await capabilityLibrary.probe(p.id);return {result,state:view()};});
        register('mcpCancelTest',p=>{capabilityLibrary.cancelProbe(p.id);return true;});
        register('mcpSignIn',async p=>{const result=await capabilityLibrary.oauthSignIn(p.id);return {result,state:view()};}); // [mcp2]
        register('mcpSignOut',async p=>{const result=await capabilityLibrary.oauthSignOut(p.id);return {result,state:view()};});
        register('mcpCancelSignIn',p=>{capabilityLibrary.cancelSignIn(p.id);return true;});
        register('clearKnowledgeIndex',async()=>{await sharedVectorIndex(store).clear();await sharedKnowledgeIndex(store).clear();return true;});
        register('state', () => view());
        const updateLegacySettings=createLegacyModelSettings({store,safeStorage,getSessionKey:()=>sessionKey,setSessionKey:value=>{sessionKey=value;},isBusy:()=>active.size>0||runs.hasPending()});
        register('settings',async p=>{await updateLegacySettings(p);return view();});
        register('officeEngine', async p => {
            if (!officeEngine) throw Error('当前环境没有内置 Office 引擎');
            if (typeof p?.enabled === 'boolean') {
                const previous = store.data.settings.officeStartupWarm;
                store.data.settings.officeStartupWarm = p.enabled;
                try { await store.save(); }
                catch (error) { store.data.settings.officeStartupWarm = previous; throw error; }
                officeEngine.settingsChanged();
                notifyRuntime();
            }
            if (p?.retry === true) void officeEngine.retry();
            return view();
        });
        register('pickFolder', async () => {
            const result = await dialog.showOpenDialog(win, { title: '选择授权给 QuankSight 的文件夹', properties: ['openDirectory'] });
            if (!result.canceled) {
                const folderPath = result.filePaths[0];
                if (!store.data.folders.some(f => f.path === folderPath)) {
                    store.data.folders.push({ id: uid(), name: path.basename(folderPath), path: folderPath });
                    store.log('已授权本地文件夹', path.basename(folderPath));
                    await store.save();
                }
            }
            return view();
        });
        register('removeFolder', async (p) => { store.data.folders = store.data.folders.filter(f => f.id !== p.id); store.log('已撤销文件夹授权'); await store.save(); return view(); });
        register('listFiles', p => listGranted(store.data.folders, p.id, String(p.query || '').slice(0, 200)));
        register('previewFile',p=>readFilePreview(store,p));
        register('readFile', p => readGranted(store.data.folders, p.folderId, p.relative));
        register('chat', p => conversations.run(p));
        register('chatCompact', p => conversations.compact(p)); // [p1-m3]
        // [p1-m5] plan mode
        const plans = createPlanService({ store, models, key, request: complete, conversations, documents: toolRuntime.documents, notify: notifyRuntime, view });
        for (const name of ['planDraft', 'planRun', 'planDiscard', 'planCancel']) register(name, p => plans[name](p));
        register('revokeBrowserApprovals', () => { toolRuntime.revokeGrants(); approve.cancelAll(); return true; });
        register('cancelApprovals', () => { approve.cancelAll(); return true; });
        register('openBrowser', p => executeTool('browser_open', p, undefined, { manual: true }));
        register('readBrowser', p => executeTool('browser_read', p));
        register('inspectBrowser', p => executeTool('browser_snapshot', p));
        register('browserAction', p => {
            const { operation, ...args } = p;
            if (!['browser_click', 'browser_fill'].includes(operation))
                throw new Error('未知浏览器操作');
            return executeTool(operation, args);
        });
        register('enqueueCommand', p => commands.enqueue(p));
        register('retryCommand', p => commands.retry(p));
        register('forgetCommand', p => commands.forget(p.id));
        register('cancelCommand', p => commands.cancel(p.id));
        register('cancelChat', p => conversations.cancel(p.id));
        register('runTask', p => runTask(p.id, {requestId:p.requestId}));
        register('cancelTask', p => tasks.cancel(p.id));
        register('cancelRun', p => runs.cancel(p.id));
        register('documentOperation', p => {
            const {operation,...args}=p;
            if (!['document_create','document_read','document_edit','document_convert','document_write','document_patch','document_insert_image'].includes(operation)) throw Error('未知文档操作');
            return executeTool(operation,args);
        });
        register('genofficeOpen', p => genoffice.open(p.id,p.revision));
        register('genofficeImport', p => genoffice.importEdited(p.id));
        register('documentRichEditor', p => toolRuntime.documents.richEditor(p.id));
        register('documentSelection', p=>resolveDocumentSelection(store,p));
        register('documentSelectionReplace', p=>{const selected=resolveDocumentSelection(store,p);return toolRuntime.documents.updateEditor(selected.documentId,selected.revision,{patches:selectionPatches(selected,p.replacement)},approve);});
        register('officeEdit',p=>{if(!libreoffice)throw Error('源码开发环境没有内置文档引擎');return libreoffice.edit(p.id,p.revision);});
        register('officeCollect',p=>{if(!libreoffice)throw Error('源码开发环境没有内置文档引擎');return libreoffice.collect(p.id);});
        register('documentPreview', async p => {
            const d = toolRuntime.documents.bytes(p.id, p.revision);
            if (d.format === 'pdf') return {id: d.id, revision: d.revision, sha256: d.sha256, format: 'pdf', base64: d.bytes.toString('base64')};
            if (!libreoffice || !['docx','xlsx','pptx'].includes(d.format)) return toolRuntime.documents.preview(p.id, p.revision);
            const result = await libreoffice.preview(p.id, p.revision);
            if (!p.panel) return result;
            try { return {...result, ...documentPreviewMetadata(d.format, d.bytes)}; }
            catch { return {...result, sourceFormat: d.format}; }
        });
        register('documentEditor', p => toolRuntime.documents.editor(p.id,p.mode));
        register('documentSaveEditor', p => toolRuntime.documents.updateEditor(p.id,p.revision,p.patch,approve));
        register('documentRead', p => toolRuntime.documents.read(p.id));
        register('documentDelete', p => toolRuntime.documents.remove(p.id));
        register('cancelPdfImport', p => pdfImports.cancel(p.id));
        register('previewOcrSource', p => previewOcrSource({store,reference:p,directory:store.dir,signal:ocrPreviewAbort.signal,choose:async source=>{
            const r=await dialog.showOpenDialog(win,{title:'选择原PDF以定位OCR来源',properties:['openFile'],filters:[{name:'PDF',extensions:['pdf']}]});
            return r.canceled?null:r.filePaths?.length===1?r.filePaths[0]:null;
        },tools:bundledPdfOcrTools,read:f=>readDocumentSource(f,{noFollow:true,maxBytes:16*1024*1024,label:'PDF'}),readImage:f=>readDocumentSource(f,{noFollow:true,maxBytes:4*1024*1024,label:'页面图片'})}));
        register('previewImageOcrEvidence', p => previewImageOcrEvidence({store,reference:p}));
        register('openOcrSource', p => openOcrSource({store,reference:p,signal:ocrPreviewAbort.signal,choose:async source=>{
            const r=await dialog.showOpenDialog(win,{title:'选择原PDF以核对OCR来源（第 '+source.pages.join('、')+' 页）',properties:['openFile'],filters:[{name:'PDF',extensions:['pdf']}]});
            return r.canceled?null:r.filePaths?.length===1?r.filePaths[0]:null;
        },read:f=>readDocumentSource(f,{noFollow:true,maxBytes:16*1024*1024,label:'PDF'}),open:f=>shell.openPath(f)}));
        register('chatAttachmentImport', async p => {
            const range=p.pdfRange===undefined?undefined:validatePdfRange(p.pdfRange);
            const result=await dialog.showOpenDialog(win,{title:'上传文档、PDF或ZIP（发送时正文交给当前模型）',properties:['openFile'],filters:[{name:'文档 / PDF / ZIP',extensions:range?['pdf']:['pdf','zip','docx','xlsx','pptx','md','txt','csv','json','html','js','ts','py','yaml','yml','css','sql','java','go','rs','sh']}]});
            if(result.canceled)return false;
            if(result.filePaths?.length!==1)throw Error('每次选择一个文档或ZIP');
            return importAttachment(result.filePaths[0],range);
        });
        const importAttachment=async(source,range)=>{ // [F1f] shared by the picker and drag & drop
            if(range&&!source.toLowerCase().endsWith('.pdf'))throw Error('指定页识别仅支持PDF');
            if(source.toLowerCase().endsWith('.pdf')){const job=pdfImports.start();try{return await importChatPdf({file:source,range,directory:store.dir,signal:job.signal,onProgress:progress=>pdfImports.progress(job,progress),documents:toolRuntime.documents,tools:bundledPdfOcrTools,read:f=>readDocumentSource(f,{noFollow:true,maxBytes:16*1024*1024,label:'PDF'}),confirm:async({name,startPage,endPage})=>{const rangeText=endPage==='first5'?'前5页（不足5页则全部识别）':'第 '+startPage+'–'+endPage+' 页';const choice=await inlineApprovals.request('本机识别 PDF 附件','识别 '+name.replace(/[\u0000-\u001f]/g,' ').slice(0,150)+' 的'+rangeText+'\n仅在本机识别；发送后识别文字会交给当前模型。所选范围之外的页面不会识别。OCR 可能有误，请核对原文。',job.signal,{...approvalContext.getStore(),choices:['deny','chi_sim+eng','chi_sim','eng'],promptChoices:{'chi_sim+eng':'中英混合',chi_sim:'中文',eng:'英文'}});return choice==='deny'?null:choice;}});}finally{pdfImports.finish(job);}}
            const bytes=await readDocumentSource(source,{noFollow:true,maxBytes:source.toLowerCase().endsWith(".zip")?32*1024*1024:4*1024*1024,label:source.toLowerCase().endsWith(".zip")?"ZIP压缩包":"文档"});
            let project,projectError;if(source.toLowerCase().endsWith('.zip')){try{project=await projects.importArchive(path.basename(source),bytes);}catch(e){projectError=e.message;}}
            const parsed=parseChatUpload(path.basename(source),bytes),documents=await toolRuntime.documents.importBatch(parsed.items);
            return {project,projectError,attachments:documents.map((d,i)=>({documentId:d.id,revision:d.revision,sha256:d.sha256,name:d.name,text:d.text,archive:parsed.items[i].archive,entryPath:parsed.items[i].entryPath})),skipped:parsed.skipped};
        };
        // [F1f] files dragged onto / pasted into the composer arrive as bytes; same checks as the picker
        register('chatDropImport', async p => {
            const name = String(p?.name || '').replace(/[\\/\u0000-\u001f]/g, '_').trim().slice(0, 160), bytes = p?.bytes;
            if (!name || !(bytes instanceof Uint8Array) || !bytes.length) throw Error('拖入的文件无效');
            if (bytes.length > 32 * 1024 * 1024) throw Error('文件超过 32 MB');
            if (p.kind === 'image') {
                const png = bytes[0] === 0x89 && bytes[1] === 0x50, jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
                if (!png && !jpg) throw Error('图片仅支持 PNG / JPEG');
                return images.importFile(/\.(png|jpe?g)$/i.test(name) ? name : name + (png ? '.png' : '.jpg'), Buffer.from(bytes));
            }
            const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
            if (!['pdf','zip','docx','xlsx','pptx','md','txt','csv','json','html','js','ts','py','yaml','yml','css','sql','java','go','rs','sh'].includes(ext)) throw Error('暂不支持这种文件：' + (ext || name));
            const fsp = await import('node:fs/promises'), os = await import('node:os');
            const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'quank-drop-')), file = path.join(dir, name);
            try { await fsp.writeFile(file, bytes, { mode: 0o600 }); return await importAttachment(file, undefined); }
            finally { await fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
        });
        register('documentImport', async () => {
            const result=await dialog.showOpenDialog(win,{title:'导入文档（原文件不变）',properties:['openFile'],filters:[{name:'文档',extensions:['docx','xlsx','pptx','pdf','md','html']}]});
            if(result.canceled)return false;
            const source=result.filePaths[0],bytes=await readDocumentSource(source);
            return toolRuntime.documents.importFile(path.basename(source,path.extname(source)),path.extname(source).slice(1).toLowerCase(),bytes);
        });
        register('documentExportPdf',async p=>exportDocumentPdf({id:p.id,revision:p.revision,documents:toolRuntime.documents,office:libreoffice,chooseDestination:async defaultPath=>{const result=await dialog.showSaveDialog(win,{title:'导出为 PDF',defaultPath,filters:[{name:'PDF',extensions:['pdf']}]});return result.canceled?null:result.filePath;},writeDestination:writeDocumentDestination}));
        register('documentExport', async p => {
            const selected=toolRuntime.documents.bytes(p.id,p.revision);
            const result=await dialog.showSaveDialog(win,{title:p.openWithSystem?'保存并用系统应用打开':'导出文档',defaultPath:selected.name.replace(/[\\/:*?"<>|]/g,'_')+'.'+selected.format,filters:[{name:selected.format.toUpperCase(),extensions:[selected.format]}]});
            if(result.canceled)return false;
            // Dialog explicitly authorizes the destination; recheck version after user interaction.
            toolRuntime.documents.bytes(p.id,p.revision);
            const written=await writeDocumentDestination(result.filePath,selected.bytes);
            store.log('已导出文档',path.basename(result.filePath));await store.save();
            if (p.openWithSystem) {
                const error = await shell.openPath(result.filePath);
                if (error) throw Error(error);
            }
            return {saved:true,sha256:selected.sha256,bytes:written};
        });
        register('exportText', async (p) => {
            const content = text(p.text, 500000);
            const result = await dialog.showSaveDialog(win, { title: '保存成果', defaultPath: (p.name || 'QuankSight 成果').replace(/[\\/:*?"<>|]/g, '_') + '.md', filters: [{ name: 'Markdown', extensions: ['md'] }] });
            if (!result.canceled) {
                await writeFile(result.filePath, content, 'utf8');
                store.log('已导出文件', path.basename(result.filePath));
                await store.save();
                return true;
            }
            return false;
        });
        register('openRunner', async () => {
            const runnerPath = path.resolve(here, '../local-runner/server.py');
            if (app.isPackaged)
                throw new Error('安装版请使用源码包中的 local-runner/server.py；具体依赖见运行说明');
            await stat(runnerPath);
            if (!runner) {
                runner = spawn(process.platform === 'win32' ? 'python' : 'python3', [runnerPath, '--port', '8765'], { cwd: path.dirname(runnerPath), env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}, stdio: 'ignore' });
                runner.on('error', () => { runner = null; });
                runner.on('exit', () => { runner = null; });
            }
            for (let i = 0; i < 30; i++) {
                try {
                    const r = await fetch('http://127.0.0.1:8765/', { signal: AbortSignal.timeout(300) });
                    if (r.ok && (await r.text()).includes('X-Muyun-Session')) {
                        await shell.openExternal('http://127.0.0.1:8765');
                        return true;
                    }
                }
                catch { }
                await new Promise(r => setTimeout(r, 100));
            }
            throw new Error('本地执行器未就绪，请检查 Python 3.10+ 或端口占用');
        });
        await launch();
        shortcutReady = globalShortcut.register('CommandOrControl+Shift+Space', focus);
        tick = setInterval(() => {
            void commands.pump();
            void runs.pump();
            void briefing?.tick().catch(() => {});
            void connectors?.tick().catch(() => {}); // [p3-m1]
            void graphService?.tick().catch(() => {}); // [p3-m5]
            if (!quantAutostart?.pending()) void quant?.tick().catch(() => {}); // [q3] watch the pool in trading hours
            void market?.tick().catch(() => {}); // [F1] watchlist quotes, alerts, overview keep-alive
            void research?.tick().catch(() => {}); // [F2] pool announcements
            void knowledge?.tick().catch(() => {}); // [F3] weekly topic digests
            void portfolio?.tick().catch(() => {}); // [F4] risk rules in trading hours and after the close
            void dataset?.tick().catch(() => {}); // [v0.53] label signals after the close
            void trade?.tick().catch(() => {}); // [v0.52] (throttled inside to every 15 s) draft orders from new signals / stops, paper fills, expiry
            try { security?.tick(); } catch {} // [F5] idle auto-lock
            for (const t of store.data.tasks) {
                if (t.enabled && t.nextRun && t.nextRun <= Date.now() && !['queued','running','cancelling'].includes(t.status))
                    runTask(t.id, {scheduledFor:t.nextRun}).catch(() => { });
            }
        }, 1000);
    }).catch(e => {
        // F581 selftest: never raise a native dialog; the launcher writes the
        // failure to its report JSON instead.
        if (process.env.QUANK_SELFTEST === '1') console.error('[QuankSight selftest] 启动失败：' + e.message);
        else dialog.showErrorBox('QuankSight 启动失败', e.message);
        app.quit();
    });
    app.on('activate', focus);
    let officeTabsQuitApproved = false, officeTabsQuitPending = false;
    let officeQuitApproved = false, officeQuitPending = false;
    app.on('before-quit', (event) => {
        if (officeEditWindows?.hasUnsaved() || officeWindows?.hasUnsaved()) {
            event.preventDefault();
            focus();
            win?.webContents.send('actwill:openPage', { page: 'notice', message: 'QuankSight 有尚未保存的修改。请在文档窗口保存后退出。' });
            return;
        }
        if (!officeQuitApproved && libreoffice?.sessions().length) {
            event.preventDefault();
            if (!officeQuitPending) {
                officeQuitPending = true;
                void approve('放弃副本并退出', '编辑副本尚未收回。确认退出会清理这些副本。', undefined, { highRisk: true })
                    .then(allowed => { if (allowed) { officeQuitApproved = true; app.quit(); } })
                    .catch(() => {}).finally(() => { officeQuitPending = false; });
            }
            return;
        }
        if (officeTabs && !officeTabsQuitApproved) {
            event.preventDefault();
            if (!officeTabsQuitPending) {
                officeTabsQuitPending = true;
                void officeTabs.close().then(() => {
                    officeTabsQuitApproved = true;
                    app.quit();
                }).catch(error => {
                    focus();
                    win?.webContents.send('actwill:openPage', {page:'notice', message:error.message});
                }).finally(() => { officeTabsQuitPending = false; });
            }
            return;
        }
        pdfImports.close();
        officeEngine?.close();
        quantAutostart?.close();
        officeWindows?.close().catch(()=>{});
        libreoffice?.close().catch(()=>{});
        genoffice?.close().catch(()=>{});
        closing = true;
        approve.cancelAll();
        toolRuntime?.revokeGrants();
        commands?.stop();
        runs?.stop();
        clearInterval(tick);
        globalShortcut.unregisterAll();
        for (const c of active.values())
            c.abort();
        browser.closeAll();
        runner?.kill();
    });
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin')
            app.quit();
    });
}
