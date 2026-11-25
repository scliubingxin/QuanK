import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {lstat, readFile, unlink} from 'node:fs/promises';
import path from 'node:path';
import {createSessionView, unoProperties} from '../src/office/office-canvas.js';
export {createSessionView, unoProperties, unoState} from '../src/office/office-canvas.js';

const formats = {docx:'writer', pptx:'impress', xlsx:'calc'};
export async function runVerifiedCommand({read, dispatch, verify}) {
    const before = await read();
    const result = await dispatch();
    const after = await read();
    if (!verify(before, after)) throw Error('Office 命令未达到预期结果');
    return {...result, success:true, before, after};
}

// Only an ownership record captured by this process permits cleanup. LO lock
// text alone has no reliable process identity and is treated as an external lock.
export async function inspectOfficeLock(file, ownedLocks = new Map()) {
    if (!file) return false;
    const lock = path.join(path.dirname(file), '.~lock.' + path.basename(file) + '#');
    try {
        const current = await lstat(lock);
        const owned = ownedLocks.get(lock);
        if (!owned || !current.isFile() || current.dev !== owned.dev || current.ino !== owned.ino ||
            current.birthtimeMs !== owned.birthtimeMs || current.mtimeMs !== owned.mtimeMs ||
            !(await readFile(lock)).equals(owned.bytes)) return true;
        await unlink(lock);
        ownedLocks.delete(lock);
        return false;
    } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
}

/** Main-process manager. The resolver supplies authorized bytes and a revision. */
export function createOfficeSessionManager({
    worker, resolveDocument, commit, beforeClose, ownedLocks, autosave,
    ephemeralSource = false, maxDocuments = 3, maxRSS = 600_000_000, maxDocumentRSS = 300 * 1024 * 1024, keepActiveViews = false, idleMs = 5 * 60_000, now = Date.now,
}) {
    const docs = new Map();
    const sessions = new Map();
    let tail = Promise.resolve();
    function serial(action) {
        const result = tail.then(action);
        tail = result.catch(() => {});
        return result;
    }
    function emit(doc, type, payload) {
        for (const {publish} of doc.views.values()) publish(type, payload);
    }
    async function save(doc, {mode = 'file', reason = 'manual'} = {}) {
        if (mode !== 'file' && mode !== 'snapshot') throw Error('Office 保存模式无效');
        if (mode === 'file' && doc.readOnly) throw Error(doc.readOnlyReason);
        if (mode === 'file') {
            emit(doc, 'state', {saving:'true'});
            emit(doc, 'saving');
        }
        try {
            const exported = await worker.request(mode === 'snapshot' ? 'snapshot' : 'exportFile', {sessionId:doc.id});
            const bytes = exported.bytes ?? exported.binary;
            if (!(bytes instanceof Uint8Array)) throw Error('Office 快照无效');
            if (mode === 'snapshot') return bytes;
            const result = await commit(doc.docId, bytes, {expectedRevision:doc.revision, reason});
            if (result?.conflict) throw Object.assign(Error('Office 保存冲突'), {code:'OFFICE_CONFLICT'});
            doc.revision = result.revision;
            doc.dirty = false;
            emit(doc, 'saved', {...result, at:Date.now()});
            return result;
        } catch (error) {
            if (mode === 'file') emit(doc, error.code === 'OFFICE_CONFLICT' ? 'conflict' : 'unsaved');
            throw error;
        } finally {
            if (mode === 'file') emit(doc, 'state', {saving:'false'});
        }
    }
    async function evict(doc) {
        const result = await beforeClose?.({
            docId:doc.docId, dirty:doc.dirty, save:options => save(doc, options),
        });
        if (result === false) throw Error('Office 会话关闭已取消');
        if (doc.controller) {
            if (!await autosave.close(doc.docId)) throw Error('Office 会话关闭已取消');
        } else if (doc.dirty) await save(doc, {reason:'auto'});
        await worker.request('close', {sessionId:doc.id});
        emit(doc, 'closed');
        docs.delete(doc.docId);
        sessions.delete(doc.id);
        doc.views.clear();
    }
    function oldest(except) {
        return [...docs.values()].filter(doc => doc !== except).sort((a,b) => a.lastUsed - b.lastUsed)[0];
    }
    async function enforceRSS(active) {
        while (docs.size > 1 && (await worker.rss?.() > maxRSS || active?.rssGrowth > maxDocumentRSS)) {
            const candidate = [...docs.values()].filter(doc => doc !== active && (!keepActiveViews || !doc.views.size))
                .sort((a,b) => a.lastUsed - b.lastUsed)[0];
            if (!candidate) break;
            await evict(candidate);
        }
    }
    async function reloadDocument(doc, {bytes} = {}) {
            const source = await resolveDocument({documentId:doc.docId});
            if (source.format !== doc.format) throw Error('Office 文档格式已变更');
            const result = await worker.request('reload', {sessionId:doc.id, bytes:bytes ?? source.bytes});
            for (const record of doc.views.values()) {
                if (result.viewIds?.[record.nativeId] !== undefined) record.nativeId = result.viewIds[record.nativeId];
            }
            doc.revision = source.revision;
            doc.dirty = Boolean(bytes);
            emit(doc, 'reloaded', result);
            return result;
    }
    async function dispatch(doc, record, operation, payload) {
        if (docs.get(doc.docId) !== doc || doc.views.get(record.id) !== record) throw Error('Office 视图已关闭');
        doc.lastUsed = now();
        if (operation === 'save') return save(doc, payload);
        if (operation === 'reload') return reloadDocument(doc);
        if (operation === 'uno' && payload.command === '.uno:Undo' && doc.externalUndo) {
            const undo = doc.externalUndo;
            doc.externalUndo = undefined;
            const receipt = await undo();
            if (receipt?.status !== 'succeeded') throw Error('文档版本已变化，请在版本历史中恢复');
            await doc.controller.refresh();
            return {success:true};
        }
        const result = await worker.request(operation, {...payload, sessionId:doc.id, viewId:record.nativeId}).catch(error => {
            record.publish('error',error);
            throw error;
        });
        for (const [event, value] of result.events ?? []) record.publish(event, value);
        if (result.changed) {
            doc.externalUndo = undefined;
            doc.dirty = true;
            doc.events?.emit('dirty');
            emit(doc, 'dirty', {docId:doc.docId});
        }
        return result;
    }
    async function attach(doc) {
        const {viewId, metadata, events} = await worker.request('attach', {sessionId:doc.id});
        const record = {id:randomUUID(), nativeId:viewId};
        Object.assign(record, createSessionView({
            docId:doc.docId, kind:formats[doc.format], readOnly:doc.readOnly,
            request:(op, payload) => op === 'save' && doc.controller && payload?.mode !== 'snapshot'
                ? doc.controller.save(payload?.reason) : serial(() => dispatch(doc, record, op, payload)),
        }));
        doc.views.set(record.id, record);
        const setInteraction = value => {
            if (typeof value?.ime === 'boolean') record.ime = value.ime;
            if (typeof value?.drag === 'boolean') record.drag = value.drag;
            const views = [...doc.views.values()];
            doc.controller?.setInteraction({ime:views.some(item => item.ime), drag:views.some(item => item.drag)});
        };
        record.setInteraction = setInteraction;
        doc.lastUsed = now();
        for (const [event, value] of events ?? []) record.publish(event, value);
        return {sessionId:doc.id, viewId:record.id, session:record.view, metadata, readOnlyReason:doc.readOnlyReason,
            controller:doc.controller, setInteraction,
            request:(op, payload = {}) => serial(() => dispatch(doc, record, op, payload))};
    }
    const timer = setInterval(() => manager.reap().catch(() => {}), Math.max(20, Math.min(idleMs, 30_000)));
    timer.unref?.();
    const manager = {
        prewarm:() => worker.ready,
        abandon() {
            clearInterval(timer);
            autosave?.abandon();
            for (const doc of docs.values()) emit(doc, 'closed');
            docs.clear();
            sessions.clear();
        },
        refresh:(docId, externalUndo) => serial(async () => {
            const doc = docs.get(docId);
            if (!doc?.controller) return false;
            const refreshed = await doc.controller.refresh();
            if (refreshed && doc.format !== 'docx') doc.externalUndo = externalUndo;
            return refreshed;
        }),
        open:input => serial(async () => {
            const source = await resolveDocument(input);
            if (input.revision != null && input.revision !== source.revision) throw Error('Office 文档版本已变更');
            let doc = docs.get(input.documentId);
            if (doc) {
                if (!doc.controller && doc.revision !== source.revision) throw Error('Office 文档版本已变更');
                if (input.mode === 'read' && !doc.readOnly) throw Error('Office 会话访问模式冲突');
                return attach(doc);
            }
            if (!Object.hasOwn(formats, source.format)) throw Error('Office 格式不受支持');
            const locked = await inspectOfficeLock(source.file, ownedLocks);
            const readOnly = locked || input.mode === 'read' || source.readOnly;
            while (docs.size >= maxDocuments) await evict(oldest());
            doc = {docId:input.documentId, id:randomUUID(), format:source.format, revision:source.revision,
                readOnly:Boolean(readOnly), readOnlyReason:locked ? '被其他程序占用' : readOnly ? '只读' : '',
                dirty:false, lastUsed:now(), views:new Map()};
            if (keepActiveViews) await worker.ready;
            const rssBefore = keepActiveViews ? await worker.rss?.() : undefined;
            await worker.request('open', {sessionId:doc.id, bytes:source.bytes, format:doc.format, readOnly:doc.readOnly, ...(ephemeralSource && {ephemeralSource:true})});
            if (rssBefore) doc.rssGrowth = Math.max(0,(await worker.rss?.() ?? rssBefore) - rssBefore);
            docs.set(doc.docId, doc);
            sessions.set(doc.id, doc);
            try {
                if (autosave && !doc.readOnly) {
                    doc.events = new EventEmitter();
                    doc.controller = await autosave.open({
                        docId:doc.docId,
                        on(event, listener) {
                            doc.events.on(event, listener);
                            return () => doc.events.off(event, listener);
                        },
                        save:options => save(doc, options),
                    }, {library:true, reload:options => reloadDocument(doc, options)});
                    for (const type of ['saving','saved','unsaved','conflict']) doc.controller.on(type, state => {
                        if (type === 'saved' && state.version?.revision != null) doc.revision = state.version.revision;
                        emit(doc, type, {at:state.at, choices:state.choices, defaultChoice:state.defaultChoice, error:state.error?.message, copyId:state.version?.copyId});
                        emit(doc, 'state', {saving:type === 'saving' ? 'true' : 'false'});
                    });
                }
                await enforceRSS(doc);
                return await attach(doc);
            } catch (error) {
                await evict(doc);
                throw error;
            }
        }),
        attachView:sessionId => serial(() => {
            const doc = sessions.get(sessionId);
            if (!doc) throw Error('Office 会话已关闭');
            return attach(doc);
        }),
        closeView:({sessionId, viewId}) => serial(async () => {
            const doc = sessions.get(sessionId);
            if (!doc?.views.has(viewId)) return;
            await worker.request('detach', {sessionId, viewId:doc.views.get(viewId).nativeId});
            const record = doc.views.get(viewId);
            doc.views.delete(viewId);
            record.setInteraction?.({});
            doc.lastUsed = now();
        }),
        reap:() => serial(async () => {
            for (const doc of docs.values()) if (!doc.views.size && now() - doc.lastUsed >= idleMs) await evict(doc);
            await enforceRSS();
        }),
        close:() => serial(async () => {
            if (autosave && !await autosave.beforeQuit()) throw Error('Office 会话关闭已取消');
            for (const doc of docs.values()) await evict(doc);
            clearInterval(timer);
            await worker.close?.();
        }),
        requestDocument:(docId, operation, payload = {}) => serial(async () => {
            const doc = docs.get(docId);
            if (!doc) throw Error('Office 文档未打开');
            const record = doc.views.values().next().value;
            if (record) return dispatch(doc, record, operation, payload);
            if (operation === 'apply') throw Error('Office 文档没有活动视图');
            return worker.request(operation, {...payload, sessionId:doc.id});
        }),
    };
    return manager;
}

export function mapOfficeOperation(operation) {
    if (operation.op === 'insert_table') {
        const {rows} = operation;
        if (!rows.length || !rows[0].length || rows.some(row => row.length !== rows[0].length)) throw Error('表格必须为矩形');
        return {...operation, command:'.uno:InsertTable', args:unoProperties({Rows:rows.length, Columns:rows[0].length})};
    }
    if (operation.op === 'insert_chart') {
        const {categories, series} = operation.chart;
        if (!series.length || !categories.length || series.some(item => item.values.length !== categories.length || item.values.some(value => !Number.isFinite(value)))) {
            throw Error('图表数据长度不匹配');
        }
        return {...operation, command:'.uno:InsertObjectChart', args:unoProperties({ChartType:operation.chart.type, Title:operation.chart.title ?? ''}), data:[['', ...series.map(item => item.name)],
            ...categories.map((category, index) => [category, ...series.map(item => item.values[index])])]};
    }
    return operation;
}

export function createOpsAdapter(engine) {
    return {
        outline:docId => engine.requestDocument(docId, 'outline'),
        read:(docId, range) => engine.requestDocument(docId, 'read', {range}),
        find:(docId, query) => engine.requestDocument(docId, 'find', {query}),
        apply:(docId, ops, {track = false} = {}) => engine.requestDocument(docId, 'apply', {ops:ops.map(mapOfficeOperation), track}),
    };
}

/** Bind an already-authorized view to a port issued to the owning main frame. */
export function bindOfficeViewPort(port, view, closeView, canAccess = () => true) {
    const session = view.session;
    const methods = new Set(['uno','getSelection','replaceSelection','setTrackChanges','acceptAll','rejectAll',
        'acceptChange','rejectChange','undo','redo','save','reload']);
    const operations = new Set(['viewport','tile','mouse','key','ime','paste','part','poll','graphic','thumbnail','thumbnails','locate']);
    const epoch = randomUUID();
    let closed = false, lastSequence = 0;
    const send = message => {
        if (!closed) port.postMessage({...message, epoch});
    };
    const subscriptions = ['state','selection','dirty','saving','saved','unsaved','conflict','reloaded','error','changes','closed'].map(type =>
        session.on(type,value => send({type:'event', event:type, value:type === 'error' ? value?.message : value})));
    function dispose() {
        if (closed) return;
        closed = true;
        for (const unsubscribe of subscriptions) unsubscribe();
        port.close();
        void closeView(view).catch(() => {});
    }
    port.on('close',dispose);
    port.on('message',async ({data}) => {
        if (!canAccess()) { dispose(); return; }
        if (!data || data.epoch !== epoch || !Number.isSafeInteger(data.seq) || data.seq <= lastSequence) return;
        const {seq, op, args} = data;
        lastSequence = seq;
        try {
            let result;
            if (op === 'resolveRecovery' && view.controller) result = await view.controller.resolveRecovery(args?.[0]);
            else if (op === 'resolveConflict' && view.controller) result = await view.controller.resolveConflict(args?.[0]);
            else if (op === 'interaction' && view.controller) result = view.setInteraction?.(args?.[0]);
            else if (methods.has(op) && Array.isArray(args) && args.length <= 2) {
                // Snapshot bytes and reload sources are exclusively main-process data.
                if (op === 'save' && args[0]?.mode === 'snapshot') throw Error('Office 快照只供主进程使用');
                result = await session[op](...args);
            } else if (operations.has(op) && Array.isArray(args) && args.length === 1) {
                result = await view.request(op,args[0]);
            } else {
                throw Error('Office 视图操作无效');
            }
            send({type:'reply',seq,result});
        } catch (error) {
            send({type:'reply',seq,error:error.message});
        }
    });
    port.start();
    send({type:'ready',docId:session.docId,kind:session.kind,readOnly:session.readOnly,readOnlyReason:view.readOnlyReason,
        metadata:view.metadata,recovery:view.controller?.recovery,saveState:view.controller?.state.status,state:Object.fromEntries(session.state),selection:session.selection});
    return dispose;
}
