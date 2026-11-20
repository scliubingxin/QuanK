import {makeOcrDocument,makeImageOcrDocument} from './ocr-provenance.mjs';
import {readGrantedPdf,recognizePdf,bundledPdfOcrTools,abortablePdfWork} from './pdf-ocr.mjs';
import {validateOcrImage,recognizeImage,bundledOcrEngine} from './image-ocr.mjs';
import {pptImagesFromContent} from './documents.mjs';
import { validateWebUrl } from './browser.mjs';
import {checkServicePolicy} from './project-service-policy.mjs';
import {createBrowserPermissions} from './browser-permissions.mjs';
import { createDocumentService } from '../services/documents.mjs';
import { uid } from '../core.mjs';
import { prepareCommand, runCommand, commandJson, isReadOnlyFind, utf16Prefix, utf16Suffix } from './command.mjs';
import { ruleCandidate } from '../services/approval-rules.mjs';
// [p2-ux2] approval dialogs describe the operation in plain language instead of raw JSON
const clipText = (s, n = 200) => String(s ?? '').replace(/[\u0000-\u001f]+/g, ' ').slice(0, n);
const friendlyPage = p => `网页：${clipText(p?.title || '（无标题）', 120)}\n地址：${clipText(p?.url)}`;
function friendlyTarget(t) {
  if (!t || typeof t !== 'object') return clipText(t, 80);
  const kind = {button: '按钮', a: '链接', link: '链接', input: '输入框', textarea: '文本框', select: '下拉框', checkbox: '复选框'}[String(t.role || t.tag || t.type || '').toLowerCase()] || '元素';
  const text = t.name || t.text || t.label || t.placeholder || t.value || t.ariaLabel || '';
  return text ? `${kind}「${clipText(text, 60)}」` : kind;
}
const friendlyAction = (p, name) => `网页：${clipText(p?.url)}\n${name === 'browser_fill' ? '填写' : '点击'}：${friendlyTarget(p?.target)}`;
const friendlyCommand = c => `程序：${clipText(c?.requestedExecutable || c?.executable, 160)}\n参数：${(c?.args || []).length ? clipText(c.args.map(a => /\s/.test(a) ? '"' + a + '"' : a).join(' '), 300) : '（无）'}\n工作目录：${clipText(c?.cwd, 200)}\n最长运行：${Math.round((c?.timeoutMs || 0) / 1000)} 秒`;

// URL opening alone does not grant access to page content or actions.
// Keep loopback and literal IP addresses behind the existing explicit approval.
export function isPublicWebOpen(value) {
    try {
        const u = new URL(validateWebUrl(value));
        const host = u.hostname.toLowerCase().replace(/\.$/, '');
        return !!host && host !== 'localhost' && !host.endsWith('.localhost') &&
            !host.endsWith('.local') && !host.endsWith('.internal') &&
            !/^\d+(?:\.\d+){0,3}$/.test(host) && !host.includes(':');
    } catch { return false; }
}

export class ToolRuntime {
    constructor({ store, browser, approve, notify = () => {}, convertDocument, beforeCli, ocrEngine = bundledOcrEngine, pdfOcrTools = bundledPdfOcrTools, rules = null }) {
        Object.assign(this, { store, browser, approve, notify, beforeCli, ocrEngine, pdfOcrTools, rules });
        this.documents = createDocumentService({store,notify,convertDocument});
        this.browserPermissions = createBrowserPermissions();
        this.documentReadGrants = new Map();
        this.pdfOcrReceipts = new Map();
        this.imageOcrReceipts = new Map();
    }

    async execute(name, args, signal, { chatId, runId, jobId, onRecord, projectService, manual = false, allowedImageIds = [] } = {}) {
        const auditArgs = structuredClone(args);
        if (name.startsWith('document_')) { delete auditArgs.content; delete auditArgs.html; delete auditArgs.replacements; delete auditArgs.cells; delete auditArgs.patches; delete auditArgs.pptLayer; auditArgs.note='文档正文/修改内容不写入执行审计'; }
        if (name === 'browser_fill' && 'text' in auditArgs) auditArgs.text = '[输入文本已隐藏]';
        const record = { id: uid(), tool: name, args: auditArgs, chatId, runId, jobId,
            time: Date.now(), status: 'pending_approval' };
        this.store.data.executions.unshift(record);
        // Keep audits for live queue jobs even when many browser operations are recorded.
        const live = new Set((this.store.data.commandJobs || []).filter(j => ['queued', 'pending_approval', 'running', 'cancelling'].includes(j.status)).map(j => j.id));
        this.store.data.executions = this.store.data.executions.filter((r, i) => i < 200 || live.has(r.jobId));
        let prepared, documentToken;
        try {
            await this.store.save();
            await onRecord?.(record);
            this.notify();
            signal?.throwIfAborted();
            if (!['cli_execute', 'browser_open', 'browser_read', 'browser_snapshot', 'browser_click', 'browser_fill', 'document_create', 'document_read', 'document_edit', 'document_convert', 'document_write', 'document_patch','document_insert_image', 'image_ocr', 'image_ocr_import', 'pdf_ocr', 'pdf_ocr_import'].includes(name)) throw new Error('未知工具');
            let command, readScope, ocrImage, pdfSource, pdfReceipt, pdfImportGuard, imageReceipt, imageImportGuard;
            if(name==='image_ocr_import'){
                imageReceipt=this.imageOcrReceipts.get(args.receiptId);
                if(!runId||!imageReceipt||imageReceipt.runId!==runId||imageReceipt.busy)throw Error('图片OCR凭证不存在、已使用或不属于当前任务');
                if(typeof args.name!=='string'||!args.name.trim()||args.name.length>100||/[\u0000-\u001f/\\]/.test(args.name))throw Error('成果名称无效');
                imageImportGuard=()=>{
                    signal?.throwIfAborted();
                    if(this.imageOcrReceipts.get(args.receiptId)!==imageReceipt)throw Error('图片OCR凭证已失效');
                    const current=validateOcrImage(this.store.data,imageReceipt.source.id,allowedImageIds);
                    if(current.sha256!==imageReceipt.source.sha256)throw Error('图片来源已变化，请重新识别');
                };
                imageImportGuard();
            }
            if(name==='pdf_ocr_import'){
                pdfReceipt=this.pdfOcrReceipts.get(args.receiptId);
                if(!runId||!pdfReceipt||pdfReceipt.runId!==runId||pdfReceipt.busy)throw Error('OCR凭证不存在、已使用或不属于当前任务');
                if(typeof args.name!=='string'||!args.name.trim()||args.name.length>100||/[\u0000-\u001f/\\]/.test(args.name))throw Error('成果名称无效');
                pdfImportGuard=async()=>{if(this.pdfOcrReceipts.get(args.receiptId)!==pdfReceipt)throw Error('OCR凭证已失效');const current=await abortablePdfWork(()=>readGrantedPdf(this.store.data.folders,pdfReceipt.source),signal);if(current.sha256!==pdfReceipt.source.sha256)throw Error('PDF来源已变化，请重新识别');};
                await pdfImportGuard();
            }
            if(name==='pdf_ocr'){pdfSource=await abortablePdfWork(()=>readGrantedPdf(this.store.data.folders,args),signal);if(!Number.isInteger(args.startPage)||!Number.isInteger(args.endPage)||args.startPage<1||args.endPage<args.startPage||args.endPage-args.startPage>=5||args.endPage>100)throw Error('每次只能识别连续1至5页');}
            if(name==='image_ocr'){ocrImage=validateOcrImage(this.store.data,args.imageId,allowedImageIds);if(args.language!==undefined&&! ['eng','chi_sim','chi_sim+eng'].includes(args.language))throw Error('不支持该 OCR 语言');}
            if (['browser_read', 'browser_snapshot'].includes(name)) {
                readScope = this.browser.list().find(w => w.id === args.id);
                if (!readScope) throw new Error('浏览器窗口已关闭或不存在');
                record.receipt = { operation: name, ...readScope };
            }
            if (name === 'cli_execute') { projectService=checkServicePolicy(projectService,args);command = await abortablePdfWork(()=>prepareCommand(this.store.data.folders, args),signal); if(projectService){command.timeoutMs=projectService.maxDurationMs;record.projectService=projectService;}record.command = command; }
            if (['browser_click', 'browser_fill'].includes(name)) { prepared = await this.browser.prepareAction(name, args, signal); record.receipt = this.browser.receipt(prepared); }
            if(name==='document_create'&&args.format==='pptx'){const ids=pptImagesFromContent(args.content);if(!Array.isArray(allowedImageIds)||ids.some(id=>!allowedImageIds.includes(id)))throw Error('PPT只能嵌入本轮用户明确附加的图片');}
            if (name.startsWith('document_')) documentToken = await this.documents.prepare(name,args,signal);
            const title = imageReceipt ? '保存图片识别成果' : pdfReceipt ? '保存PDF识别成果' : pdfSource ? '识别授权PDF' : ocrImage ? '识别本轮图片文字' : documentToken ? '文档操作 · ' + name : name === 'cli_execute' ? (projectService?'启动项目开发服务':'执行本机 CLI') : name === 'browser_read' ? '读取网页内容' : name === 'browser_snapshot' ? '检查网页元素' : name === 'browser_click' ? '点击网页元素' : name === 'browser_fill' ? '填写网页文本框' : '打开浏览器';
            const detail = imageReceipt ? args.name+'.md\n保存已批准的图片识别结果，来源 '+imageReceipt.source.name.replace(/[\u0000-\u001f]/g,' ')+'，SHA-256 '+imageReceipt.source.sha256+'；保留原图片。识别文字会保存为本机文档，可供后续绑定知识库。' : pdfReceipt ? args.name+'.md\n保存已批准识别结果，来源 '+pdfReceipt.source.name.replace(/[\u0000-\u001f]/g,' ')+'，SHA-256 '+pdfReceipt.source.sha256+'，共 '+pdfReceipt.pages.length+' 页；保留原PDF。识别文字会保存为本机文档，可供后续绑定知识库。' : pdfSource ? pdfSource.name+'\n第 '+args.startPage+'–'+args.endPage+' 页将本机识别并将文字发送给当前模型；请核对来源和准确性。' : ocrImage ? ocrImage.name+'\n将本机识别图片文字并发送给当前模型。识别结果可能有误。' : documentToken ? documentToken.detail : prepared ? friendlyAction(prepared, name) + (name === 'browser_fill' ? '\n将填入（不会自动提交）：\n' + prepared.inputText : '\n点击可能会提交表单或触发网页上的操作，请核对网址和目标。')
                : name === 'cli_execute' ? friendlyCommand(command) + '\n命令以你的账号权限运行，可以访问工作目录以外的文件。' + (projectService?'\n开发服务最长30分钟；日志保留最近尾部，退出/停止会终止进程；不表示业务就绪。':'') + (chatId ? '\n命令输出会发送给当前模型。' : '')
                : readScope ? friendlyPage(readScope) + '\n将读取这个网页的正文，并发送给当前模型。' : String(args.url);
            const browserScope = this.browserPermissions.scope(name,args,{runId,readScope,prepared});
            const documentReadScope = runId && documentToken?.readScope ? JSON.stringify([runId,documentToken.readScope.id,documentToken.readScope.revision,documentToken.readScope.sha256]) : null;
            const rememberedDocument = !!documentReadScope && this.documentReadGrants.has(documentReadScope);
            const remembered = this.browserPermissions.has(browserScope);
            const autoFind = name === 'cli_execute' && !projectService && await abortablePdfWork(()=>isReadOnlyFind(command),signal);
            const autoOpen = name === 'browser_open' && args.external !== true && isPublicWebOpen(args.url);
            // [p2-m2] persistent "always allow" rules and unattended (scheduled) runs
            const ruleScope = this.rules ? ruleCandidate(name, {command, readScope, url: args.url, documentToken, projectService, documentName: documentToken?.readScope ? this.store.data.documents?.find(d => d.id === documentToken.readScope.id)?.name : undefined}) : null;
            const rule = this.rules ? this.rules.match(ruleScope, command, {chatId}) : null;
            const automatic = (manual && name === 'browser_open') || autoOpen || remembered || rememberedDocument || autoFind || !!rule;
            if (!automatic && !manual && this.rules?.unattended.has(chatId)) {
                this.rules.defer({chatId, tool: name, title, detail, candidate: ruleScope});
                record.status = 'denied'; record.authorization = 'unattended_deferred';
                record.result = {status:'denied',message:'定时任务无人值守：该操作需要用户确认，已记入「待你确认」，本次没有执行。不得声称已执行；可换用不需要确认的方式，或在结果里说明需要用户处理。'};
                return record.result;
            }
            const decision = automatic ? true
                : await abortablePdfWork(()=>this.approve(title,detail,signal,{browserScope,documentReadScope,ruleScope}),signal);
            const allowed = decision === true || ((browserScope || documentReadScope || ruleScope) && decision?.allowed === true);
            if (!allowed) {
                record.status = 'denied';
                record.result = {status:'denied',message:'用户拒绝该操作，不得声称执行成功'};
                return record.result;
            }
            this.browserPermissions.check(browserScope);
            if(browserScope && decision?.browserTask === true) this.browserPermissions.allow(browserScope);
            if(documentReadScope && decision?.documentTask === true) this.documentReadGrants.set(documentReadScope,runId);
            let ruleGranted = null;
            if(ruleScope && decision?.alwaysAllow === true) { ruleGranted = this.rules.add(ruleScope, {source:'dialog'}); }
            if(rule || ruleGranted) record.ruleId = (rule || ruleGranted).id;
            record.authorization = rule ? 'approval_rule' : ruleGranted ? 'approval_rule_granted' : autoOpen ? 'background_web_open' : autoFind ? 'read_only_find' : rememberedDocument ? 'document_task_revision' : documentReadScope && decision?.documentTask ? 'document_task_revision_granted' : remembered ? 'browser_task_origin' : browserScope && decision?.browserTask ? 'browser_task_origin_granted' : 'once';
            if(browserScope) record.authorizationScope = {runId:browserScope.runId,origin:browserScope.origin};
            signal?.throwIfAborted();
            if (readScope && this.browser.list().find(w => w.id === args.id)?.url !== readScope.url) throw new Error('审批期间网页地址发生变化，请重新确认');
            record.status = 'running';
            record.startedAt=Date.now();
            await this.store.save();
            await onRecord?.(record); // A durable queue claim must succeed before any side effect.
            signal?.throwIfAborted();
            this.browserPermissions.check(browserScope);
            if (readScope && this.browser.list().find(w => w.id === args.id)?.url !== readScope.url) throw Error('网页已变化，请重新确认');
            this.notify();
            let result;
            if(imageReceipt){
                if(imageReceipt.busy)throw Error('图片OCR成果正在保存');imageReceipt.busy=true;
                try{
                    imageImportGuard();
                    const {text:content,provenance}=makeImageOcrDocument(imageReceipt.source,imageReceipt.result);
                    result=await this.documents.importFile(args.name,'md',Buffer.from(content,'utf8'),signal,imageImportGuard,provenance);
                    this.imageOcrReceipts.delete(args.receiptId);
                }finally{imageReceipt.busy=false;}
            }
            else if(pdfReceipt){
                if(pdfReceipt.busy)throw Error('OCR成果正在保存');pdfReceipt.busy=true;
                try{await pdfImportGuard();const {text:content,provenance}=makeOcrDocument(pdfReceipt.source,pdfReceipt.pages);result=await this.documents.importFile(args.name,'md',Buffer.from(content,'utf8'),signal,pdfImportGuard,provenance);this.pdfOcrReceipts.delete(args.receiptId);}finally{pdfReceipt.busy=false;}
            }
            else if (documentToken) result = await this.documents.perform(documentToken,signal);
            else if(pdfSource){const guard=async()=>{const current=await abortablePdfWork(()=>readGrantedPdf(this.store.data.folders,args),signal);if(current.sha256!==pdfSource.sha256)throw Error('PDF在识别期间变化');};await guard();const tools=await abortablePdfWork(()=>this.pdfOcrTools(),signal);signal?.throwIfAborted();await guard();result=await recognizePdf({source:pdfSource,tools,directory:this.store.dir,startPage:args.startPage,endPage:args.endPage,language:args.language||'eng',signal,guard});signal?.throwIfAborted();await guard();if(runId){while(this.pdfOcrReceipts.size>=32)this.pdfOcrReceipts.delete(this.pdfOcrReceipts.keys().next().value);const receiptId=uid();this.pdfOcrReceipts.set(receiptId,{runId,source:result.source,pages:structuredClone(result.pages),busy:false});result.receiptId=receiptId;}}
            else if(ocrImage){const guard=()=>{const current=validateOcrImage(this.store.data,args.imageId,allowedImageIds);if(current.sha256!==ocrImage.sha256)throw Error('图片在识别期间变化');};guard();const engine=await abortablePdfWork(()=>this.ocrEngine(),signal);signal?.throwIfAborted();guard();result=await recognizeImage({image:ocrImage,engine,directory:this.store.dir,language:args.language||'eng',signal,guard});guard();signal?.throwIfAborted();if(runId){while(this.imageOcrReceipts.size>=32)this.imageOcrReceipts.delete(this.imageOcrReceipts.keys().next().value);const receiptId=uid();this.imageOcrReceipts.set(receiptId,{runId,source:{id:ocrImage.id,name:String(ocrImage.name||'图片'),sha256:ocrImage.sha256},result:{text:result.text,boxes:structuredClone(result.boxes),boxesTruncated:result.boxesTruncated,coordinateSpace:structuredClone(result.coordinateSpace)},busy:false});result.receiptId=receiptId;}}
            else if (name === 'cli_execute') {
                await abortablePdfWork(()=>this.beforeCli?.(args,projectService),signal);
                const checked = await abortablePdfWork(()=>prepareCommand(this.store.data.folders, args),signal);
                if (checked.cwd !== command.cwd || checked.executable !== command.executable) throw new Error('工作目录或程序路径在审批期间发生变化，请重新执行');
                if (autoFind && !await abortablePdfWork(()=>isReadOnlyFind(checked),signal)) throw new Error('只读搜索条件发生变化，请重新确认');
                if(projectService)checked.timeoutMs=projectService.maxDurationMs;
                signal?.throwIfAborted();
                const persistence = new AbortController();
                const commandSignal = signal ? AbortSignal.any([signal, persistence.signal]) : persistence.signal;
                let streamed = 0, lastSaved = 0, checkpoint = Promise.resolve(), diskError;
                result = await runCommand(checked, { signal: commandSignal,...(projectService?{outputMode:'tail',maxBytes:65536}:{}), onOutput: chunk => {
                    const part = projectService?chunk.text:utf16Prefix(chunk.text, Math.max(0, 50000 - streamed));
                    // A non-fitting character closes the prefix: do not skip it
                    // and then append later output as though it were contiguous.
                    streamed = !projectService&&part.length<chunk.text.length?50000:streamed+part.length;
                    const combined=(record.partial||'')+part;
                    record.partial = projectService?utf16Suffix(combined,50000):combined;
                    if(projectService)record.logPolicy='最近50000字符；结果stdout/stderr合计最近64KiB';
                    const now = Date.now(),publish=now-lastSaved>=500;
                    if (publish) {
                        lastSaved = now;
                        checkpoint = this.store.save().catch(error => { diskError = error; persistence.abort(); });
                    }
                    if(!projectService||publish)this.notify();
                } });
                await checkpoint;
                if (diskError) throw diskError;
                delete record.partial;
                if(args.args.includes("--json")&&!result.truncated){const data=commandJson(result.stdout);if(data!==undefined)result.structuredOutput=data;}
            } else if (name === 'browser_open') result = await this.browser.open(args.url, args.external === true, signal,{visible:manual});
            else if (name === 'browser_read') result = await this.browser.read(args.id, signal);
            else if (name === 'browser_snapshot') result = await this.browser.snapshot(args.id, signal);
            else if (prepared) result = await this.browser.perform(prepared, signal);
            else throw new Error('未知工具');
            record.result = imageReceipt ? {status:result.status,note:'已批准的图片识别成果已保存，正文不写入执行审计',document:(({text,history,editableHtml,wordEditing,spreadsheetEditing,pptEditing,...rest})=>rest)(result.document)} : pdfReceipt ? {status:result.status,note:'已批准的PDF识别成果已保存，正文不写入执行审计',document:(({text,history,editableHtml,wordEditing,spreadsheetEditing,pptEditing,...rest})=>rest)(result.document)} : pdfSource ? {status:result.status,note:'PDF OCR正文不写入执行审计',source:{sha256:result.source.sha256,totalPages:result.source.totalPages},pageCount:result.pages.length} : ocrImage ? {status:result.status,note:'OCR正文不写入执行审计',source:{id:result.source.id,sha256:result.source.sha256},language:result.language} : documentToken && result.document ? {...result,document:(( {text,history,editableHtml,wordEditing,spreadsheetEditing,pptEditing,...rest})=>rest)(result.document)} : result;
            record.status = result.status || 'succeeded';
            return result;
        } catch (error) {
            record.status = signal?.aborted ? 'cancelled' : 'failed';
            record.result = { status: record.status, error: error.message };
            if (signal?.aborted) throw error;
            return record.result;
        } finally {
            if (prepared) this.browser.discard(prepared);
            record.finishedAt = Date.now();
            this.store.log('工具执行 · ' + record.status, name);
            await this.store.save();
            this.notify();
        }
    }
    releaseGrants(runId) { for(const [key,r] of this.pdfOcrReceipts)if(r.runId===runId)this.pdfOcrReceipts.delete(key); for(const [key,r] of this.imageOcrReceipts)if(r.runId===runId)this.imageOcrReceipts.delete(key); this.browserPermissions.release(runId); for (const [key,id] of this.documentReadGrants) if (id === runId) this.documentReadGrants.delete(key); }
    revokeGrants() { this.pdfOcrReceipts.clear(); this.imageOcrReceipts.clear(); this.browserPermissions.revoke(); this.documentReadGrants.clear(); }
}
