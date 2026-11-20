// [p1-m1] Long-term memory: selection, prompt block, learning from finished turns, bounded storage.
// Pure helpers (no I/O) except learnFromTurn, which receives an injected model request function.
import { uid } from '../core.mjs';

export const MEMORY_LIMIT = 200, MEMORY_TEXT_MAX = 500, MEMORY_KINDS = Object.freeze(['preference', 'fact', 'profile']);
export const KIND_LABEL = Object.freeze({preference: '偏好', fact: '事实', profile: '背景'});

/** Effective memory switches; both default on. */
export function memorySettings(settings = {}) {
  const m = settings?.memory || {};
  return {enabled: m.enabled !== false, autoLearn: m.autoLearn !== false};
}
/** Older stores only kept {id,text}: those are explicit user memories. */
export function normalizeMemory(m) {
  const text = String(m?.text ?? '').trim().slice(0, 2000);
  return {
    id: String(m?.id || uid()), text,
    kind: MEMORY_KINDS.includes(m?.kind) ? m.kind : 'preference',
    source: m?.source === 'auto' ? 'auto' : 'user',
    chatId: typeof m?.chatId === 'string' ? m.chatId : undefined,
    created: Number.isFinite(m?.created) ? m.created : 0,
    updated: Number.isFinite(m?.updated) ? m.updated : (Number.isFinite(m?.created) ? m.created : 0),
    uses: Number.isInteger(m?.uses) && m.uses > 0 ? m.uses : 0,
    lastUsed: Number.isFinite(m?.lastUsed) ? m.lastUsed : undefined,
  };
}
export function normalizeMemories(list) { return (Array.isArray(list) ? list : []).map(normalizeMemory).filter(m => m.text); }

/** Lower-case latin/number words plus CJK character bigrams (and single chars for 1-char runs). */
export function terms(text) {
  const out = new Set(), s = String(text || '').toLowerCase();
  for (const w of s.match(/[a-z0-9][a-z0-9_.+-]{1,}/g) || []) out.add(w);
  for (const run of s.match(/[\u3400-\u9fff]+/g) || []) {
    if (run.length === 1) out.add(run);
    for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2));
  }
  return out;
}
export function similarity(a, b) {
  const x = a instanceof Set ? a : terms(a), y = b instanceof Set ? b : terms(b);
  if (!x.size || !y.size) return 0;
  let both = 0; for (const t of x) if (y.has(t)) both++;
  return both / (x.size + y.size - both);
}

/**
 * Pick the memories for this turn. Explicit user memories are standing instructions and are always
 * included (most recent first, up to `always`); learned ones must share terms with the query.
 */
export function selectMemories(memories, query, {limit = 12, always = 8, budget = 3000} = {}) {
  const all = normalizeMemories(memories), q = terms(query), picked = [];
  const user = all.filter(m => m.source === 'user').sort((a, b) => b.updated - a.updated).slice(0, always);
  const scored = all.filter(m => !user.includes(m)).map(m => {
    const t = terms(m.text); let hit = 0; for (const x of t) if (q.has(x)) hit++;
    return {m, score: hit ? hit / Math.sqrt(t.size) + Math.min(m.uses, 20) * 0.01 : 0};
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score || b.m.updated - a.m.updated).map(s => s.m);
  let size = 0;
  for (const m of [...user, ...scored]) {
    if (picked.length >= limit || size + m.text.length > budget) break;
    picked.push(m); size += m.text.length;
  }
  return picked;
}
export function memoryBlock(selected) {
  if (!selected.length) return '';
  return '\n关于用户的长期记忆（来自过往对话或用户手动保存；可能已过时，与本轮要求冲突时以本轮为准；不要逐条复述）：\n' +
    selected.map(m => `- [${KIND_LABEL[m.kind] || '偏好'}] ${m.text}`).join('\n');
}
export function recordUse(memories, ids, now = Date.now()) {
  const set = new Set(ids);
  for (const m of memories || []) if (set.has(m.id)) { m.uses = (Number.isInteger(m.uses) ? m.uses : 0) + 1; m.lastUsed = now; }
}

// ---- learning -------------------------------------------------------------------------------
const SENSITIVE = /密码|口令|passw|验证码|token|api[ _-]?key|secret|私钥|身份证|银行卡|卡号|cvv|sk-[a-z0-9]{6,}|ghp_|github_pat_|\b1[3-9]\d{9}\b|\b\d{15,19}\b/i;
export const isSensitive = text => SENSITIVE.test(String(text || ''));
const CUE = /记住|记一下|以后|今后|下次|每次|总是|一律|不要再|别再|我是|我叫|我在|我的|我们(公司|团队|部门)|偏好|习惯|喜欢|讨厌|请用|请始终|统一用|remember|from now on|always|never|i am|i'm|my |prefer/i;
/** Cheap gate so ordinary turns do not cost an extra model call. */
export function shouldLearn(userText) { const s = String(userText || ''); return s.length >= 4 && s.length <= 8000 && CUE.test(s) && !isSensitive(s); }

export const EXTRACT_PROMPT = '你负责为用户维护长期记忆。阅读这一轮对话，只提取以后的对话也有用、且由用户本人明确表达的稳定信息：' +
  '偏好（回复方式、格式、语言、工具习惯）、事实（项目、产品、约定）、背景（角色、团队、所在地）。' +
  '不要记录：一次性任务内容、助手的观点、推测、密码/密钥/验证码/证件号/手机号等敏感信息、对文件或网页内容的转述。' +
  '每条用第三人称「用户……」写成一句不超过80字的中文。没有可记的就返回 []。' +
  '只输出 JSON 数组，例如 [{"text":"用户希望回复先给结论再给细节","kind":"preference"}]，kind 取 preference/fact/profile，最多3条。';

export function parseExtraction(text) {
  const s = String(text || ''), start = s.indexOf('['), end = s.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  let data; try { data = JSON.parse(s.slice(start, end + 1)); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const item of data.slice(0, 20)) {
    if (out.length >= 3) break;
    const t = String(typeof item === 'string' ? item : item?.text || '').replace(/\s+/g, ' ').trim();
    if (t.length < 4 || t.length > 200 || isSensitive(t)) continue;
    out.push({text: t, kind: MEMORY_KINDS.includes(item?.kind) ? item.kind : 'preference'});
  }
  return out;
}

/** Add or refresh learned memories in place. Never edits a user-written memory; evicts least-used learned ones. */
export function mergeLearned(memories, items, {chatId, now = Date.now(), limit = MEMORY_LIMIT} = {}) {
  const added = [], updated = [];
  for (const item of items) {
    const t = terms(item.text);
    const near = memories.map(m => ({m, s: similarity(t, m.text)})).sort((a, b) => b.s - a.s)[0];
    if (near && near.s >= 0.6) {
      if (near.m.source === 'auto' && near.m.text !== item.text) { near.m.text = item.text.slice(0, MEMORY_TEXT_MAX); near.m.kind = item.kind; near.m.updated = now; near.m.chatId = chatId; updated.push(near.m); }
      continue;
    }
    const m = {id: uid(), text: item.text.slice(0, MEMORY_TEXT_MAX), kind: item.kind, source: 'auto', chatId, created: now, updated: now, uses: 0};
    memories.unshift(m); added.push(m);
  }
  while (memories.length > limit) {
    const victims = memories.filter(m => m.source === 'auto' && !added.includes(m));
    if (!victims.length) break;
    victims.sort((a, b) => (a.uses || 0) - (b.uses || 0) || (a.updated || 0) - (b.updated || 0));
    memories.splice(memories.indexOf(victims[0]), 1);
  }
  return {added, updated};
}

/** One bounded, tool-less model call after a completed turn. Returns {added, updated}; throws on model errors. */
export async function learnFromTurn({request, settings, key, userText, assistantText, memories, chatId, signal}) {
  const known = normalizeMemories(memories).slice(0, 40).map(m => '- ' + m.text).join('\n');
  const messages = [
    {role: 'system', content: EXTRACT_PROMPT + (known ? '\n已知记忆（不要重复）：\n' + known : '')},
    {role: 'user', content: '用户：' + String(userText).slice(0, 4000) + '\n\n助手：' + String(assistantText || '').slice(0, 2000)},
  ];
  const result = await request(settings, key, messages, signal);
  return mergeLearned(memories, parseExtraction(result?.text), {chatId});
}
