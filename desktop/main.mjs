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
import { modelEndpoint as qkModelEndpoint } from './core.mjs'; // [F1c]
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
import {documentViews} from './services/documents.mjs';
import { sharedRunQueue } from './runtime/run-queue.mjs';
import { createCommandService } from './services/commands.mjs';
import { createWorkspaceService } from './services/workspace.mjs';
import { createApprover } from './main/approval.mjs';
import { createRegistrar } from './main/ipc.mjs';
import { createConversationService } from './services/conversation.mjs';
import { createTaskService } from './services/tasks.mjs';
import { recoverInterruptedWork } from './services/recovery.mjs';
import { requiredText as text } from './services/validation.mjs';
import { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu, safeStorage, shell, Notification, session, protocol, nativeImage } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { ToolRuntime } from './runtime/tools.mjs';
import { prepareUserData, rekeySecrets, APP_NAME, LEGACY_CRYPTO_NAME } from './runtime/identity.mjs';
import { legacyUnsealChild, runLegacyUnseal } from './main/legacy-unseal.mjs'; // [rebrand]
import { BrowserService } from './runtime/browser.mjs';
import { Store, uid, listGranted, readGranted, complete } from './core.mjs';
protocol.registerSchemesAsPrivileged([previewScheme]);
const here = path.dirname(fileURLToPath(import.meta.url));
let win, store, sessionKey = '', runner, closing = false, tick, shortcutReady = false;
const active = new Map();
const browser = new BrowserService({ BrowserWindow, shell });
// [p1-m4] background completion: system notification when the window is not focused, dock badge = unread chats
function conversationFinished({ chat, status, text }) {
    try {
        if (process.platform === 'darwin') app.dock?.setBadge(String((store?.data?.chats || []).filter(c => c.unread && !c.incognito).length || ''));
        if (win && !win.isDestroyed() && win.isFocused()) return;
        if (!Notification.isSupported()) return;
        const n = new Notification({ title: status === 'completed' ? 'QuanK · 任务完成' : 'QuanK · 任务未完成', body: (chat.incognito ? '无痕对话' : chat.name) + (text ? '\n' + String(text).replace(/\s+/g, ' ').slice(0, 80) : ''), silent: false });
        n.on('click', () => { focus(); win?.webContents.send('actwill:openChat', { id: chat.id }); });
        n.show();
    } catch {}
}
const notifyRuntime = () => {
    if (win && !win.isDestroyed())
        win.webContents.send('actwill:runtime');
};
const approve = createApprover({ dialog, getWindow: () => win, focus });
let toolRuntime, genoffice, models, projects, libreoffice, officeWindows, connectors, graphService, dashboards, miniapps, quant, market, research, knowledge; // [p3-m1][p3-m5][p4-m1][p4-m4][q1][F1][F2][F3]
const pdfImports = createPdfImportControl({notify: notifyRuntime});
const executeTool = (...args) => toolRuntime.execute(...args);
const view = () => { const { encryptedKey, ...settings } = store.data.settings; const {knowledgeIndexes,knowledgeVectorIndexes,modelProfiles,codeProjects,connectors:_connectors,connectorItems:_connectorItems,graph:_graph,dashboards:_dashboards,miniapps:_miniapps,research:_research,knowledge:_knowledge,quant:_quant,...publicData}=store.data; return { ...publicData, pdfImport: pdfImports.view(), officeNative:!!libreoffice,officeWorkspace:!!officeWindows,officeEdits:libreoffice?.sessions()||[], capabilityPresets:capabilityPresets(), codeProjects:projects?.view()||[], ...(connectors?.view()||{connectors:[],connectorItems:[]}), graph: graphService?.view()||null, dashboards: dashboards?.view()||[], miniapps: miniapps?.view()||[], quant: quant?.view()||null, market: market?.view()||null, research: research?.view()||null, knowledge: knowledge?.view()||null, modelProfiles:models?.view()||[], mcpConnections:mcpViews(store.data), documents:documentViews(store.data), skillPackages:skillViews(store.data), imageAttachments:imageViews(store.data), settings: { ...settings, hasKey: !!sessionKey || !!encryptedKey, keySaved: !!encryptedKey, secureStorage: safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text' }, browsers: browser.list(), desktop: { platform: process.platform, shortcutReady } }; };
function key() {
    if (sessionKey)
        return sessionKey;
    const encrypted = store.data.settings.encryptedKey;
    return encrypted ? safeStorage.decryptString(Buffer.from(encrypted, 'base64')) : '';
}
const register = createRegistrar({ ipcMain, getWindow: () => win, entryURL: new URL('./src/index.html', import.meta.url).href });
const previewOcrSource = createOcrPreviewLimiter();
const ocrPreviewAbort = new AbortController();
app.on('before-quit',()=>ocrPreviewAbort.abort(Error('应用正在退出')));
async function launch() {
    win = new BrowserWindow({ width: 1380, height: 920, minWidth: 860, minHeight: 640, title: 'QuanK', icon: path.join(here, 'assets/icon-512.png'), backgroundColor: '#ffffff', titleBarStyle: 'hiddenInset', ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 20, y: 20 } } : {}), webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
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
// Data lives in <appData>/QuanK; an older build's data folder is copied there once (packaged app only).
const dataDir = legacyChild ? { dir: app.getPath('userData'), migratedFrom: null } : await prepareUserData(app.getPath('appData'), { migrate: app.isPackaged });
if (!legacyChild) app.setPath('userData', dataDir.dir);
if (!legacyChild) app.setName(APP_NAME); // keychain key "QuanK Safe Storage"; older sealed values are re-sealed once after the store loads
app.setAboutPanelOptions({ applicationName: 'QuanK', applicationVersion: app.getVersion() });
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
        await store.load();
        if (store.data.cryptoIdentity !== APP_NAME && (store.data.cryptoMigration?.attempts || 0) < 3) { // [rebrand] re-seal secrets saved under the old name, in the background (never blocks the window)
            const openCurrent = c => { try { return safeStorage.decryptString(Buffer.from(c, 'base64')); } catch { return null; } };
            void rekeySecrets(store.data, { unsealLegacy: list => runLegacyUnseal(list), openCurrent, seal: s => safeStorage.encryptString(s).toString('base64') })
                .then(async r => { await store.save(); notifyRuntime(); if (r.total) console.log(`[quank] 密钥迁移（第 ${r.attempts} 次）：${r.ok}/${r.total} 可用${r.failed ? `，${r.failed} 项未迁移${r.error ? '（' + r.error + '）' : ''}` : ''}${dataDir.migratedFrom ? `；数据已从 ${dataDir.migratedFrom} 复制` : ''}`); })
                .catch(e => console.warn('[quank] 密钥迁移失败', e?.message));
        }
        purgeIncognito(store.data); // [p1-m2] incognito chats never survive a restart
        configureLocalOnnx(store,async()=>{const root=runtimeRoot();if(!root)throw Error('此版本未内置本机ONNX嵌入运行时');const python=await bundledExecutable('python');return createLocalOnnxEmbedding({python,modelDirectory:path.join(root,'embedding','bge-small-zh-v1.5')});});
        const defaultAgent = store.data.agents.find(a => a.id === 'assistant');
        if (['Actwill 助手', 'WillBuddy 助手'].includes(defaultAgent?.name))
            defaultAgent.name = 'QuanK 助手';
        if (['你是 Actwill 工作助手。用中文清晰地帮助用户完成工作。区分事实和假设，不编造来源。', '你是 WillBuddy 工作助手。用中文清晰地帮助用户完成工作。区分事实和假设，不编造来源。'].includes(defaultAgent?.prompt))
            defaultAgent.prompt = '你是 QuanK 工作助手。用中文清晰地帮助用户完成工作。区分事实和假设，不编造来源。';
        if (!store.data.financeAgentsSeeded) { // [fin1] finance agents, added once (the user may edit or delete them)
            for (const a of [
                { id: 'fin-research', name: '投研分析师', description: '个股与行业研究、财报点评、投资备忘录', prompt: '你是 QuanK 的投研分析师。围绕个股、行业和财报给出有依据的研究结论：关键数字注明来源与报告期，事实与观点分开，拿不到的数据标为待核实，不编造。需要时调用本机量化工具查看信号与持仓。结尾注明仅供研究，不构成投资建议。' },
                { id: 'fin-modeler', name: '财务建模师', description: '三表联动模型、DCF 与可比估值，交付可核对的 Excel', prompt: '你是 QuanK 的财务建模师。按假设页、三表、校验页的结构搭建可联动的 Excel 模型，资产负债表必须配平；估值给出区间和敏感性分析，所有参数写明取值与来源，交付前读取真实文件核对。' },
                { id: 'fin-quant', name: '量化策略助手', description: '解读本机策略信号、盯盘提醒、日报与回测复盘', prompt: '你是 QuanK 的量化策略助手。使用本机量化工具读取股票池信号、持仓、日报与回测，用清楚的中文解释档位、综合分和变化原因；任何记录成交、修改计划的操作都先说明再请用户确认；不替用户下单，不承诺收益。' },
                { id: 'fin-risk', name: '风控合规官', description: '组合风险指标、合规审阅与敏感信息脱敏', prompt: '你是 QuanK 的风控合规官。计算组合收益、回撤、波动与集中度并列出风险清单；审阅研究材料中的收益承诺、未授权买卖建议和缺失的风险提示；对客户、账户等敏感信息脱敏并列出替换清单。' }])
                if (!store.data.agents.some(x => x.id === a.id)) store.data.agents.push(a);
            store.data.financeAgentsSeeded = true;
        }
        store.data.executions ??= [];
        const convertDocument=createDocumentConverter({createDriver:signal=>createConversionBrowser({BrowserWindow,session,signal})});
        const approvalRules = createApprovalRules({ store, notify: notifyRuntime }); // [p2-m2]
        toolRuntime = new ToolRuntime({ store, browser, approve, notify: notifyRuntime, convertDocument,beforeCli:(args,policy)=>projects?.validate(args,policy), rules: approvalRules });
        register('approvalRule', p => approvalRules.handle(p).then(() => view()));
        const officeRuntime=async()=>({python:await bundledExecutable('python'),officeDirectory:path.dirname(await bundledExecutable('office'))});
        if(runtimeRoot()){await bundledExecutable('python');await bundledExecutable('office');libreoffice=createLibreOffice({documents:toolRuntime.documents,directory:path.join(store.dir,'office-runtime'),executable:()=>bundledExecutable('office'),pdfRuntime:officeRuntime,approve,notify:notifyRuntime,previewPoolEnabled:store.data.settings.officePreviewPool!==false});}
        genoffice=createGenOfficeBridge({documents:toolRuntime.documents,approve});
        // [p2-ux2] start the preview engine with the app and keep one worker warm
        if(libreoffice){setTimeout(()=>void libreoffice.warmPreview?.(),2500).unref?.();setInterval(()=>void libreoffice.warmPreview?.(),240000).unref?.();}
        recoverInterruptedWork(store.data);
        commands = createCommandService({ store, active, executeTool, notify: notifyRuntime });
        projects=createCodeProjects({store,directory:path.join(app.getPath('userData'),'code-projects'),approve,commands});
        register('projectRun',p=>projects.run(p.id,p.stepId,{service:p.service===true}));
        register('projectImport',async()=>{const result=await dialog.showOpenDialog(win,{title:'导入代码项目ZIP（不自动执行）',properties:['openFile'],filters:[{name:'代码项目ZIP',extensions:['zip']}]});if(result.canceled)return false;const source=result.filePaths?.[0];if(!source)throw Error('未选择代码包');return projects.importArchive(path.basename(source),await readDocumentSource(source,{noFollow:true,maxBytes:32*1024*1024,label:'代码ZIP'}));});
        runs = sharedRunQueue({store, active, notify:notifyRuntime});
        const mcpSecrets=createMcpSecretCodec(safeStorage);
        models=createModelService({store,secrets:createModelSecretCodec(safeStorage),legacyKey:key});
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
        const appDeps = { notify: notifyRuntime, openPage: page => { focus(); if (win && !win.isDestroyed()) win.webContents.send('actwill:openPage', { page }); },
            openConnectorForm: p => { focus(); if (win && !win.isDestroyed()) win.webContents.send('actwill:openPage', { page: 'connectors', connector: p }); }, web: createWebLookup(), // [ux9]
            openMcpForm: p => { focus(); if (win && !win.isDestroyed()) win.webContents.send('actwill:openPage', { page: 'agents', mcp: p }); }, get capabilities() { return capabilityLibrary; }, // [mcp2]
            runTask: (id, o) => runTask(id, o), get workspace() { try { return workspace; } catch { return null; } },
            get connectors() { return connectors; }, get dashboards() { return dashboards; }, get briefing() { return briefing; }, get miniapps() { return miniapps; }, get quant() { return quant; }, get market() { return market; }, get research() { return research; }, get knowledge() { return knowledge; }, openDocument: id => { focus(); if (win && !win.isDestroyed()) win.webContents.send('actwill:openPage', { page: 'library', document: id }); }, openMarket: code => { focus(); if (win && !win.isDestroyed()) win.webContents.send('actwill:openPage', { page: 'market', code }); }, openQuant: code => { focus(); if (win && !win.isDestroyed()) win.webContents.send('actwill:openPage', { page: 'quant', code }); } };
        conversations = createConversationService({ appTools: appDeps, approve, rules: approvalRules, models, secrets:mcpSecrets, images, queue:runs, store, active, key, view, executeTool, releaseToolGrants:id=>toolRuntime.releaseGrants(id), notify: notifyRuntime,notifyStream:event=>{if(win&&!win.isDestroyed())win.webContents.send('actwill:stream',event);},onCompleted:conversationFinished });
        if(runtimeRoot()){
            const kit=createOfficeWorkspace({documents:toolRuntime.documents,directory:path.join(store.dir,'office-kit'),runtime:officeRuntime,approve,notify:notifyRuntime,audit:async event=>{const prev=store.data.executions;store.data.executions=[event,...prev.filter(e=>e.id!==event.id)].slice(0,300);try{await store.save();}catch(e){store.data.executions=prev;throw e;}notifyRuntime();}});
            const officeChat=createOfficeChat({store,kit,models,key,approve,queue:runs,notify:notifyRuntime});
            officeWindows=createOfficeWindows({BrowserWindow,ipcMain,here,kit,chat:officeChat,models,documents:toolRuntime.documents,dialog});
            register('officeOpen',p=>officeWindows.open(p.id,p.revision));
            setTimeout(()=>void kit.prewarm?.(),4000).unref?.(); // [p2-ux2] standby editor engine
        }
        tasks = createTaskService({ models, queue:runs, notify:notifyRuntime, store, active, key, view, conversations, rules: approvalRules, notifyCompleted: task => {
                if (Notification.isSupported())
                    new Notification({ title: 'QuanK · 任务完成', body: task.name }).show();
            } });
        // [p2-m4] daily briefing
        briefing = createBriefingService({ store, models, key, notify: notifyRuntime, onReady: b => {
            try {
                if (b.trigger !== 'schedule' || (win && !win.isDestroyed() && win.isFocused()) || !Notification.isSupported()) return;
                const need = b.counts.attention || 0, done = b.counts.done || 0;
                const n = new Notification({ title: 'QuanK · 今日简报', body: (need ? `${need} 项需要你处理，` : '') + `上次以来完成 ${done} 项` });
                n.on('click', () => { focus(); win?.webContents.send('actwill:openPage', { page: 'feed' }); }); n.show();
            } catch {}
        } });
        register('briefingGenerate', async () => { await briefing.generate({ manual: true }); return view(); });
        register('briefingSettings', async p => { await briefing.settings(p); return view(); });
        // [p3-m1] connectors: credentials sealed with the same OS secure storage as MCP tokens
        connectors = createConnectorService({ store, secrets: createMcpSecretCodec(safeStorage), notify: notifyRuntime,
            confirm: async ({ title, detail }) => (await dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, { type: 'question', buttons: ['发送', '取消'], defaultId: 1, cancelId: 1, noLink: true, message: title, detail })).response === 0 }); // [p3-m3] every send confirmed
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
        quant = createQuantEngine({ dir: path.join(app.getPath('userData'), 'quant'), store, lookup: createStockLookup(), notify: notifyRuntime, onAlert: a => { try { if (!normalizeWatch(store.data.quant?.watch).notify || !Notification.isSupported()) return; // [q3]
                const n = new Notification(a.kind === 'report' ? { title: `QuanK · ${a.title}`, body: a.ok ? `${a.summary || '已生成'}${(a.warnings || []).length ? '\n⚠ ' + a.warnings[0] : ''}`.slice(0, 200) : `生成失败：${a.summary || ''}`.slice(0, 200) } : a.kind === 'digest' ? { title: 'QuanK · 盘前量化简报', body: `${a.counts.total} 只：${a.counts.buy} 个买点，${a.counts.sell} 个风控提示` } : { title: 'QuanK · 量化信号变化', body: `${a.name || a.code}：${quantActionLabel(a.from)} → ${quantActionLabel(a.to, a.toText)}${a.score != null ? `，综合分 ${a.score}` : ''}` });
                n.on('click', () => { focus(); win?.webContents.send('actwill:openPage', { page: 'quant', ...(a.kind === 'change' ? { code: a.code } : {}), ...(a.kind === 'report' ? { report: a.reportId } : {}) }); }); n.show(); } catch {} },
            seal: s => safeStorage.isEncryptionAvailable() ? 'v1:' + safeStorage.encryptString(s).toString('base64') : s,
            unseal: s => String(s || '').startsWith('v1:') ? safeStorage.decryptString(Buffer.from(String(s).slice(3), 'base64')) : s,
            aiGateway: () => { const r = models.resolve('legacy', '', { tools: false, vision: false }); const s = r?.settings || store.data.settings; if (!s?.model || !s?.baseUrl) return null; return { baseUrl: String(s.baseUrl).replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, ''), model: s.model, key: r ? r.key() : key() }; },
            chooseFolder: async current => { const r = await dialog.showOpenDialog(win, { title: '选择你的策略项目文件夹（根目录需有 wb-engine.json）', ...(current ? { defaultPath: current } : {}), properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; } });
        register('quant', async p => { const result = await quant.handle(p); return { result, state: view() }; });
        market = createMarketService({ store, lookup: createStockLookup(), notify: notifyRuntime, onAlert: a => { try { if (!Notification.isSupported()) return; const n = new Notification({ title: `QuanK · ${a.title}`, body: a.detail }); n.on('click', () => { focus(); win?.webContents.send('actwill:openPage', { page: 'market', code: a.code }); }); n.show(); } catch {} } }); // [F1]
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
        research = createResearchService({ store, documents: toolRuntime.documents, market, quant, finance: code => knowledge ? knowledge.forReport(code) : Promise.reject(new Error('知识库未就绪')), ask: researchAsk, rasterize, notify: notifyRuntime, onAlert: a => { try { if (!Notification.isSupported()) return; const n = new Notification({ title: `QuanK · ${a.title}`, body: a.detail }); n.on('click', () => { focus(); win?.webContents.send('actwill:openPage', { page: 'quant', code: a.code }); }); n.show(); } catch {} } });
        knowledge = createKnowledgeService({ store, research, market, web: appDeps.web, notify: notifyRuntime, onAlert: a => { try { if (!Notification.isSupported()) return; const n = new Notification({ title: `QuanK · ${a.title}`, body: a.detail }); n.on('click', () => { focus(); win?.webContents.send('actwill:openPage', { page: 'library', ...(a.documentId ? { document: a.documentId } : {}) }); }); n.show(); } catch {} } }); // [F3]
        register('knowledge', async p => { const result = await knowledge.handle(p); return ['view', 'search', 'finance', 'graph', 'profile', 'compare', 'topicCollect'].includes(p?.action) ? { result } : { result, state: view() }; });
        register('research', async p => { const result = await research.handle(p); return ['view', 'library', 'read'].includes(p?.action) ? { result } : { result, state: view() }; });
        register('market', async p => { const result = await market.handle(p); return ['kline', 'quotes', 'sectors', 'sectorStocks', 'resolve', 'watch'].includes(p?.action) ? { result } : { result, state: view() }; });
        app.on('before-quit', () => { quant?.stop().catch(() => {}); });
        register('miniapp', async p => { const result = await miniapps.handle(p); return ['get', 'storage', 'versions', 'export'].includes(p?.action) ? { result } : { result, state: view() }; });
        await store.save();
        Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'QuanK', submenu: [{ label: '显示工作台', click: focus }, { label: '取消所有操作确认', accelerator: 'CommandOrControl+Shift+Escape', click: () => approve.cancelAll() }, { label: '撤销浏览器任务授权', click: () => { toolRuntime.revokeGrants(); approve.cancelAll(); } }, { role: 'about' }, { type: 'separator' }, { role: 'quit' }] }, { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }, { label: '视图', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }] }]));
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
        register('pickFolder', async () => {
            const result = await dialog.showOpenDialog(win, { title: '选择授权给 QuanK 的文件夹', properties: ['openDirectory'] });
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
        register('documentPreview',p=>libreoffice?libreoffice.preview(p.id,p.revision):toolRuntime.documents.preview(p.id,p.revision));
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
            if(source.toLowerCase().endsWith('.pdf')){const job=pdfImports.start();try{return await importChatPdf({file:source,range,directory:store.dir,signal:job.signal,onProgress:progress=>pdfImports.progress(job,progress),documents:toolRuntime.documents,tools:bundledPdfOcrTools,read:f=>readDocumentSource(f,{noFollow:true,maxBytes:16*1024*1024,label:'PDF'}),confirm:async({name,startPage,endPage})=>{const rangeText=endPage==='first5'?'前5页（不足5页则全部识别）':'第 '+startPage+'–'+endPage+' 页';const choice=await dialog.showMessageBox(win,{type:'question',title:'本机识别 PDF 附件',message:'识别 '+name.replace(/[\u0000-\u001f]/g,' ').slice(0,150)+' 的'+rangeText,detail:'仅在本机识别；发送后识别文字会交给当前模型。所选范围之外的页面不会识别。OCR可能有误，请核对原文。',buttons:['中英混合','中文','英文','取消'],defaultId:3,cancelId:3,noLink:true,signal:AbortSignal.any([job.signal,AbortSignal.timeout(60000)])});return ['chi_sim+eng','chi_sim','eng',null][choice.response]??null;}});}finally{pdfImports.finish(job);}}
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
            const result=await dialog.showOpenDialog(win,{title:'导入可编辑文档（原文件不变）',properties:['openFile'],filters:[{name:'文档',extensions:['docx','xlsx','pptx','md','html']}]});
            if(result.canceled)return false;
            const source=result.filePaths[0],bytes=await readDocumentSource(source);
            return toolRuntime.documents.importFile(path.basename(source,path.extname(source)),path.extname(source).slice(1).toLowerCase(),bytes);
        });
        register('documentExportPdf',async p=>exportDocumentPdf({id:p.id,revision:p.revision,documents:toolRuntime.documents,office:libreoffice,chooseDestination:async defaultPath=>{const result=await dialog.showSaveDialog(win,{title:'导出为 PDF',defaultPath,filters:[{name:'PDF',extensions:['pdf']}]});return result.canceled?null:result.filePath;},writeDestination:writeDocumentDestination}));
        register('documentExport', async p => {
            const selected=toolRuntime.documents.bytes(p.id,p.revision);
            const result=await dialog.showSaveDialog(win,{title:'导出文档',defaultPath:selected.name.replace(/[\\/:*?"<>|]/g,'_')+'.'+selected.format,filters:[{name:selected.format.toUpperCase(),extensions:[selected.format]}]});
            if(result.canceled)return false;
            // Dialog explicitly authorizes the destination; recheck version after user interaction.
            toolRuntime.documents.bytes(p.id,p.revision);
            const written=await writeDocumentDestination(result.filePath,selected.bytes);
            store.log('已导出文档',path.basename(result.filePath));await store.save();
            return {saved:true,sha256:selected.sha256,bytes:written};
        });
        register('exportText', async (p) => {
            const content = text(p.text, 500000);
            const result = await dialog.showSaveDialog(win, { title: '保存成果', defaultPath: (p.name || 'QuanK 成果').replace(/[\\/:*?"<>|]/g, '_') + '.md', filters: [{ name: 'Markdown', extensions: ['md'] }] });
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
                runner = spawn(process.platform === 'win32' ? 'python' : 'python3', [runnerPath, '--port', '8765'], { cwd: path.dirname(runnerPath), stdio: 'ignore' });
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
            void quant?.tick().catch(() => {}); // [q3] watch the pool in trading hours
            void market?.tick().catch(() => {}); // [F1] watchlist quotes, alerts, overview keep-alive
            void research?.tick().catch(() => {}); // [F2] pool announcements
            void knowledge?.tick().catch(() => {}); // [F3] weekly topic digests
            for (const t of store.data.tasks) {
                if (t.enabled && t.nextRun && t.nextRun <= Date.now() && !['queued','running','cancelling'].includes(t.status))
                    runTask(t.id, {scheduledFor:t.nextRun}).catch(() => { });
            }
        }, 1000);
    }).catch(e => { dialog.showErrorBox('QuanK 启动失败', e.message); app.quit(); });
    app.on('activate', focus);
    app.on('before-quit', (event) => {
        pdfImports.close();
        if(officeWindows?.hasUnsaved()){event.preventDefault();dialog.showMessageBoxSync({type:'warning',message:'QuanK Office有尚未保存的修改',detail:'请在文档窗口重试保存后退出；不会丢弃未保存内容。'});return;}
        if(libreoffice?.sessions().length){const choice=dialog.showMessageBoxSync(win,{type:'warning',message:'有文档编辑副本尚未收回',detail:'请先保存并退出内置编辑窗口，再返回收回新版本。放弃退出会清理尚未回收的副本。',buttons:['返回处理','放弃副本并退出'],defaultId:0,cancelId:0});if(choice===0){event.preventDefault();return;}}
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
