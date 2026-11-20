// [p2-m4] Daily briefing service: stores the last 14 briefings, generates on schedule (local time) or on demand,
// and optionally asks the model for a short summary. Without a model (or on failure) the structured list stands alone.
import { complete } from '../core.mjs';
import { buildBriefing, briefingText, briefingDue, briefingSettings, normalizeBriefingSettings, BRIEFING_KEEP } from '../src/shared/briefing.js';

export const BRIEFING_PROMPT = '你是工作助理。下面是用户本机工作空间的简报要点。用不超过 120 字的中文写一段晨间概述：先说最需要处理的事，再说已完成的重点和今天的安排。只依据给出的要点，不编造，不加标题和列表。';

export function createBriefingService({ store, models, key, request = complete, notify = () => {}, onReady = () => {}, now = Date.now }) {
    let busy = null;
    async function generate({ manual = false } = {}) {
        if (busy) return busy;
        busy = (async () => {
            const t = now(), settings = briefingSettings(store.data);
            const b = { ...buildBriefing(store.data, t), trigger: manual ? 'manual' : 'schedule' };
            const total = Object.values(b.counts).reduce((n, x) => n + x, 0);
            if (settings.useModel && total) {
                try {
                    const route = models?.resolve('legacy', '', { tools: false, vision: false });
                    const r = await request(route?.settings || store.data.settings, route ? route.key() : key(), [{ role: 'system', content: BRIEFING_PROMPT }, { role: 'user', content: briefingText(b) }], AbortSignal.timeout(60000));
                    b.summary = String(r?.text || '').trim().slice(0, 600) || undefined;
                } catch (e) { b.summaryError = '概述生成失败：' + String(e?.message || e).slice(0, 120); }
            }
            store.data.briefings = [b, ...(store.data.briefings || []).filter(x => x.day !== b.day || manual && x.time !== b.time)].slice(0, BRIEFING_KEEP);
            await store.save(); notify();
            try { onReady(b); } catch {}
            return b;
        })();
        try { return await busy; } finally { busy = null; }
    }
    return {
        generate,
        async settings(p) { store.data.settings.briefing = normalizeBriefingSettings(p); await store.save(); notify(); return store.data.settings.briefing; },
        /** Called from the main-process timer; generates at most once per day. */
        async tick() { if (!busy && briefingDue(store.data, now())) return generate(); return null; },
    };
}
