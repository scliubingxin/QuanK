import { complete, uid } from '../core.mjs';
import { sharedRunQueue, requestFingerprint } from '../runtime/run-queue.mjs';
import { nextRunAt } from '../src/shared/schedule.js';

export const TASK_HISTORY_LIMIT = 20;
const LIVE = ['queued', 'running', 'cancelling'];

/**
 * Model-only routines use the same persisted queue and cancellation as conversations.
 * [p2-m1] Tasks with mode 'agent' run as a turn of their own conversation instead: same agent, tools,
 * approvals, streaming and completion notification as a chat, and the history stays readable in that chat.
 */
export function createTaskService({ models, store, active, key, view, conversations, rules, notify = () => {}, notifyCompleted = () => {}, request = complete, queue = sharedRunQueue({store,active,notify}) }) {
    const agentRuns = new Map();
    // An agent run cannot survive a restart (its conversation turn was recovered as interrupted).
    for (const t of store.data.tasks || []) if (t.mode === 'agent' && LIVE.includes(t.status)) { t.status = 'failed'; t.error = '应用退出，运行被中断'; }

    const record = (task, entry) => { task.history = [entry, ...(task.history || [])].slice(0, TASK_HISTORY_LIMIT); };
    const advance = (task, from) => {
        task.nextRun = task.enabled ? nextRunAt(task.schedule, from) : null;
        if (task.schedule?.kind === 'once') { task.enabled = false; task.nextRun = null; }
    };

    async function runAgent(task, { scheduledFor } = {}) {
        if (!conversations) throw Error('当前环境不支持智能体任务');
        if (agentRuns.has(task.id) || LIVE.includes(task.status)) throw Error('任务正在执行或排队');
        if (scheduledFor !== undefined && (!Number.isFinite(scheduledFor) || !task.enabled || task.nextRun !== scheduledFor || scheduledFor > Date.now())) throw Error('定时任务已变化或尚未到期');
        if (!store.data.agents.some(a => a.id === task.agentId)) throw Error('任务使用的智能体已删除，请编辑任务');
        const startedAt = Date.now(), run = {id: uid(), at: startedAt, trigger: scheduledFor !== undefined ? 'schedule' : 'manual', status: 'running'};
        const fresh = !store.data.chats.some(c => c.id === task.chatId);
        if (fresh) task.chatId = uid();
        agentRuns.set(task.id, run);
        Object.assign(task, {status: 'running', error: '', lastRun: startedAt, runId: run.id});
        advance(task, startedAt);
        record(task, run);
        await store.save(); notify();
        const chatId = task.chatId, before = store.data.chats.find(c => c.id === chatId)?.messages.length || 0;
        // [p2-m2] scheduled runs are unattended: tools only proceed by rule, the rest wait for the user
        if (run.trigger === 'schedule') rules?.unattended.set(chatId, task.id);
        const pendingBefore = new Set((store.data.pendingApprovals || []).map(x => x.id)); // count by identity, not by clock
        try {
            await conversations.run({id: chatId, prompt: task.prompt, agentId: task.agentId, toolsEnabled: task.toolsEnabled === true, modelChoice: task.modelChoice || 'legacy', modelEffort: task.modelEffort || ''});
        } catch (e) { run.error = String(e?.message || e).slice(0, 300); }
        finally { rules?.unattended.clear(chatId); }
        const pending = (store.data.pendingApprovals || []).filter(x => x.chatId === chatId && !pendingBefore.has(x.id)).length;
        if (pending) run.pending = pending;
        const chat = store.data.chats.find(c => c.id === chatId);
        if (chat) { if (fresh) chat.name = task.name; chat.taskId = task.id; }
        const reply = chat?.messages.slice(before).reverse().find(m => m.role === 'assistant');
        const ok = !run.error && reply && !reply.error && !reply.budgetExhausted;
        run.status = ok ? 'done' : run.cancelled ? 'cancelled' : 'failed';
        run.ms = Date.now() - startedAt;
        if (!ok && !run.error) run.error = reply?.budgetExhausted ? '达到模型轮数上限，已保留阶段性结果' : reply?.error ? String(reply.content || '').slice(0, 300) : '没有得到回复';
        task.status = ok ? 'done' : run.status;
        task.error = ok ? '' : run.error;
        if (ok) { task.result = reply.content; store.data.artifacts.unshift({id: uid(), name: task.name, text: reply.content, time: Date.now(), taskId: task.id, chatId}); store.log('任务已完成', task.name); }
        else store.log('任务未完成', `${task.name}：${task.error}`);
        agentRuns.delete(task.id);
        await store.save(); notify();
        // The conversation itself already raised the completion notification (dock badge + system notice).
        return view();
    }

    async function run(id, { scheduledFor, requestId } = {}) {
        const task = store.data.tasks.find(t => t.id === id);
        if (!task) throw Error('任务不存在');
        if (task.mode === 'agent') return runAgent(task, { scheduledFor });
        const runId = requestId || (scheduledFor !== undefined ? 'schedule-' + requestFingerprint({id,scheduledFor}) : uid());
        if (queue.hasOwner('task',id) && !queue.lookup(runId)) throw Error('任务正在执行或排队');
        const prompt = task.prompt, name = task.name;
        const modelRoute=models?.resolve(task.modelChoice||'legacy',task.modelEffort);
        const fingerprint = requestFingerprint({id,prompt,name,scheduledFor});
        if (scheduledFor !== undefined && (!Number.isFinite(scheduledFor) || !task.enabled
            || task.nextRun !== scheduledFor || scheduledFor > Date.now()) && !queue.lookup(runId)) throw Error('定时任务已变化或尚未到期');
        const nextRun = task.enabled ? nextRunAt(task.schedule, Date.now()) : null;
        await queue.submit({id:runId,kind:'task',ownerId:id,label:name,fingerprint}, async controller => {
            modelRoute?.check();
            const result = await request(modelRoute?.settings||store.data.settings,modelRoute?modelRoute.key():key(),[
                {role:'system',content:'你是 QuankSight 定时工作助手。仅根据任务描述输出结果。没有联网或本机工具，不能假装查询了实时数据。'},
                {role:'user',content:prompt}
            ],controller.signal);
            modelRoute?.check();
            // Providers may ignore abort and deliver late replies. Never save/notify those as success.
            controller.signal.throwIfAborted();
            task.result = result.text;
            store.data.artifacts.unshift({id:uid(),name,text:result.text,time:Date.now(),runId});
            store.log('任务已完成',name);
            return {status:'completed'};
        }, job => {
            task.runId=runId;
            task.runRevision=job.revision;
            task.status=job.status === 'completed' ? 'done' : job.status;
            task.error=job.error || (job.status === 'cancelled' ? '请求已停止或超时' : '');
            if (job.status === 'queued') {
                task.lastRun=job.createdAt;task.nextRun=nextRun;
                if (task.schedule?.kind === 'once') { task.enabled = false; task.nextRun = null; }
            }
        });
        const record=queue.lookup(runId);
        if (record?.status === 'completed') {
            // Only the worker creates an artifact; duplicate requests must not repeat notification.
            if (!record.notified) {
                record.notified=true;
                await store.save();
                notifyCompleted(task);
            }
        }
        return view();
    }
    return {
        run,
        cancel: async id => {
            const task = store.data.tasks.find(t => t.id === id), live = agentRuns.get(id);
            if (task?.mode === 'agent') { if (live) { live.cancelled = true; await conversations.cancel(task.chatId); } return view(); }
            return queue.cancelOwner('task',id);
        },
        isRunning: id => agentRuns.has(id),
    };
}
