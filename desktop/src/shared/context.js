// [p1-m3] Conversation context: what history is sent to the model, token estimate, compaction prompt.
// Pure module shared by the main side (conversation/compaction) and the renderer (context meter).

export const HISTORY_TURNS = 20, DEFAULT_CONTEXT_TOKENS = 64000;

const textOf = m => typeof m?.content === 'string' ? m.content : Array.isArray(m?.content) ? m.content.filter(x => x?.type === 'text').map(x => x.text).join('\n') : '';

/** Prior messages for the next request. After /compact only messages after the cut are replayed, preceded by the summary. */
export function historyForPrompt(chat, {turns = HISTORY_TURNS} = {}) {
  const c = chat?.compaction, all = chat?.messages || [];
  const from = c && Number.isInteger(c.upto) && c.upto >= 0 && c.upto <= all.length ? c.upto : 0;
  const recent = all.slice(from).filter(m => !m.partial && !m.intermediate).slice(-turns).map(({role, content}) => ({role, content}));
  return c?.summary ? [{role: 'system', content: '以下是本对话此前内容的摘要（由用户执行“压缩上下文”生成，细节可能有省略）：\n' + c.summary}, ...recent] : recent;
}

/** Rough token estimate: CJK ≈ 1 token/char, other text ≈ 1 token/4 chars. Good enough for a usage meter. */
export function estimateTokens(text) {
  const s = String(text || '');
  const cjk = (s.match(/[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/g) || []).length;
  return Math.ceil(cjk + (s.length - cjk) / 4);
}

/** {tokens, limit, ratio, level} for the next request built from this chat + composer contents. */
export function contextUsage({chat, draft = '', files = [], memories = [], limit = DEFAULT_CONTEXT_TOKENS} = {}) {
  let tokens = 1200; // system prompt + tool instructions, approximate
  for (const m of chat ? historyForPrompt(chat) : []) tokens += estimateTokens(textOf(m)) + 4;
  tokens += estimateTokens(draft);
  for (const f of files) tokens += estimateTokens(f?.text || '');
  for (const m of memories.slice(0, 12)) tokens += estimateTokens(m?.text || '');
  const lim = Number.isFinite(limit) && limit > 1000 ? limit : DEFAULT_CONTEXT_TOKENS;
  const ratio = Math.min(1, tokens / lim);
  return {tokens, limit: lim, ratio, level: ratio >= 0.9 ? 'high' : ratio >= 0.7 ? 'warn' : 'ok'};
}
export const formatTokens = n => n >= 1000 ? (Math.round(n / 100) / 10) + 'k' : String(n);

export const COMPACT_PROMPT = '请把下面这段对话压缩成一份供后续继续对话使用的摘要。要求：保留用户的目标、已确定的结论和决定、关键数据与文件名、仍未完成的事项和用户提出的约束；' +
  '去掉寒暄和重复内容；不编造未出现的信息；用中文分条列出，不超过 1200 字。只输出摘要正文。';

/** Transcript of the messages that will be folded into the summary (bounded). */
export function compactionTranscript(chat, {max = 60000} = {}) {
  const parts = [];
  if (chat?.compaction?.summary) parts.push('【更早的摘要】\n' + chat.compaction.summary);
  const from = chat?.compaction?.upto || 0;
  for (const m of (chat?.messages || []).slice(from)) {
    if (m.partial || m.intermediate) continue;
    const t = textOf(m).trim(); if (!t) continue;
    parts.push((m.role === 'user' ? '用户：' : '助手：') + t);
  }
  let s = parts.join('\n\n');
  if (s.length > max) s = '……（较早内容已截断）\n' + s.slice(s.length - max);
  return s;
}
