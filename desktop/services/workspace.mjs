import { builtinCodingAgent, codingFallbacks, getSubagents } from '../src/shared/subagents.js';
import {resolveCapabilities} from './capability-library.mjs';
import {agentCapabilities} from './agent-profile.mjs';
import { liveRunStates } from '../runtime/run-queue.mjs';
import { uid, nextDaily } from '../core.mjs';
import { requiredText as text } from './validation.mjs';
import { memorySettings, MEMORY_KINDS } from './memory.mjs'; // [p1-m1]
import { normalizeSchedule, nextRunAt } from '../src/shared/schedule.js'; // [p2-m1]
import { applyFeedAction } from '../src/shared/feed.js'; // [p2-m3]
import { skipNext } from '../src/shared/taskcenter.js'; // [p2-m5]
/** Workspace mutations preserve the existing persisted schema. */
export function createWorkspaceService({ store, active, view }) {
    // [p2-m1] fields of an agent task, validated against the current agents and model profiles
    const agentTaskFields = (p) => {
        const agentId = p.agentId || 'assistant';
        if (!store.data.agents.some(a => a.id === agentId)) throw new Error('智能体不存在');
        if (p.toolsEnabled !== undefined && typeof p.toolsEnabled !== 'boolean') throw new Error('工具设置无效');
        return { name: text(p.name, 100), prompt: text(p.prompt), agentId, toolsEnabled: p.toolsEnabled === true, schedule: normalizeSchedule(p.schedule || { kind: 'manual' }), ...(typeof p.modelChoice === 'string' && p.modelChoice ? { modelChoice: p.modelChoice.slice(0, 200) } : {}) };
    };
    const queued = (kind, id) => (store.data.runJobs || []).some(j => j.kind === kind && j.ownerId === id && liveRunStates.has(j.status));
    return {
        deleteChat: async (p) => {
            if (active.has(p.id) || queued('conversation', p.id))
                throw new Error('请先停止生成');
            store.data.chats = store.data.chats.filter(c => c.id !== p.id);
            await store.save();
            return view();
        },
        // [p1-m1] memory: add / edit / remove / clear / settings
        memory: async (p) => {
            const list = store.data.memories ??= [];
            if (p.settings) {
                const s = p.settings;
                if (typeof s !== 'object' || Object.keys(s).some(k => !['enabled', 'autoLearn'].includes(k) || typeof s[k] !== 'boolean')) throw new Error('记忆设置无效');
                store.data.settings.memory = {...memorySettings(store.data.settings), ...s};
            }
            else if (p.clear) {
                if (!['all', 'auto'].includes(p.clear)) throw new Error('清除范围无效');
                store.data.memories = p.clear === 'all' ? [] : list.filter(m => m.source !== 'auto');
            }
            else if (p.remove)
                store.data.memories = list.filter(m => m.id !== p.id);
            else if (p.id) {
                const m = list.find(m => m.id === p.id);
                if (!m) throw new Error('记忆不存在或已删除');
                m.text = text(p.text, 2000); m.updated = Date.now(); m.source = 'user';
                if (p.kind !== undefined) { if (!MEMORY_KINDS.includes(p.kind)) throw new Error('记忆类型无效'); m.kind = p.kind; }
            }
            else {
                if (list.filter(m => m.source !== 'auto').length >= 100)
                    throw new Error('最多手动保存 100 条记忆');
                if (p.kind !== undefined && !MEMORY_KINDS.includes(p.kind)) throw new Error('记忆类型无效');
                const now = Date.now();
                list.unshift({ id: uid(), text: text(p.text, 2000), kind: p.kind || 'preference', source: 'user', created: now, updated: now, uses: 0 });
            }
            await store.save();
            return view();
        },
        agent: async (p) => {
            const previous=structuredClone(store.data.agents);
            try {
            if (p.remove) {
                if (p.id === 'assistant')
                    throw new Error('不能删除默认助手');
                store.data.agents = store.data.agents.filter(a => a.id !== p.id);
                for (const agent of store.data.agents) {
                    if (agent.subagents) agent.subagents.dialogue = agent.subagents.dialogue.filter(id => id !== p.id);
                }
            }
            else {
                const value = { id: p.id || uid(), name: text(p.name, 80), description: text(p.description || '自定义工作助手', 200), prompt: text(p.prompt, 10000), ...agentCapabilities(p) };
                const bindings = p.subagents ?? getSubagents(store.data, store.data.agents.find(a => a.id === value.id));
                const validate = (ids, available) => Array.isArray(ids) && new Set(ids).size === ids.length &&
                    ids.every(id => available.some(item => item.id === id));
                if (!validate(bindings.dialogue, store.data.agents.filter(item => item.id !== value.id)) || !validate(bindings.coding, [...(store.data.coding?.agents || []), builtinCodingAgent]) ||
                    !codingFallbacks.includes(bindings.fallback)) throw Error('子智能体绑定或回退方式无效');
                value.subagents = {dialogue: [...bindings.dialogue], coding: [...bindings.coding], fallback: bindings.fallback};
                for(const id of value.knowledge)if(!(store.data.documents||[]).some(d=>d.id===id))throw Error('知识文档不存在');
                if(!p.id&&store.data.agents.length>=30)throw Error('最多30个智能体');
                resolveCapabilities(store.data,value);
                const i = store.data.agents.findIndex(a => a.id === value.id);
                if (i < 0)
                    store.data.agents.push(value);
                else
                    store.data.agents[i] = value;
            }
            await store.save();
            return view();
            }catch(e){store.data.agents=previous;throw e;}
        },
        task: async (p) => {
            if (p.remove) {
                if (active.has('task:' + p.id) || queued('task', p.id))
                    throw new Error('请等待任务结束');
                store.data.tasks = store.data.tasks.filter(t => t.id !== p.id);
            }
            else if (p.id) {
                const t = store.data.tasks.find(t => t.id === p.id);
                if (!t)
                    throw new Error('任务不存在');
                if (queued('task', p.id) || (t.mode === 'agent' && ['queued', 'running', 'cancelling'].includes(t.status))) throw Error('请先停止任务再修改定时设置');
                if (p.skipNext) { skipNext(t, Date.now()); await store.save(); return view(); } // [p2-m5]
                if (p.edit) { // [p2-m1] edit name, prompt, agent, tools and cadence
                    const next = agentTaskFields(p);
                    Object.assign(t, next, { mode: 'agent' });
                    t.enabled = next.schedule.kind !== 'manual';
                }
                else t.enabled = !!p.enabled;
                if (t.enabled && t.schedule?.kind === 'manual') throw Error('该任务设置为仅手动运行，请先编辑执行频率');
                t.nextRun = t.enabled ? nextRunAt(t.schedule, Date.now()) : null;
                if (t.enabled && t.nextRun === null) throw Error('执行时间已过去，请重新选择');
            }
            else {
                if (store.data.tasks.length >= 50)
                    throw new Error('最多 50 个任务');
                if (p.schedule !== undefined || p.agentId !== undefined) { // [p2-m1]
                    const next = agentTaskFields(p), enabled = next.schedule.kind !== 'manual', nextRun = enabled ? nextRunAt(next.schedule, Date.now()) : null;
                    if (enabled && nextRun === null) throw Error('执行时间已过去，请重新选择');
                    store.data.tasks.unshift({ id: uid(), ...next, mode: 'agent', enabled, nextRun, status: 'ready', history: [], created: Date.now() });
                }
                else store.data.tasks.unshift({ id: uid(), name: text(p.name, 100), prompt: text(p.prompt), enabled: !!p.enabled, nextRun: p.enabled ? nextDaily() : null, status: 'ready' });
            }
            await store.save();
            return view();
        },
        // [p2-m3] feed read / dismiss state
        feed: async (p) => { store.data.feed = applyFeedAction(store.data, p); await store.save(); return view(); },
        artifact: async (p) => {
            if (p.remove)
                store.data.artifacts = store.data.artifacts.filter(a => a.id !== p.id);
            else
                store.data.artifacts.unshift({ id: uid(), name: text(p.name, 100), text: text(p.text, 500000), time: Date.now() });
            await store.save();
            return view();
        }
    };
}
