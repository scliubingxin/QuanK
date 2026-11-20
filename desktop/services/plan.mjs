// [p1-m5] Plan mode: draft an editable step plan (no tools), then execute it one step at a time
// through the normal conversation pipeline (same approvals, queue and tools as a regular turn).
// [p1-m6] Deep research is a plan of kind 'research': sub-questions gathered with tools, then a final
// cited report that is saved as a Word document in the library.
import { uid } from '../core.mjs';
import { requiredText as text } from './validation.mjs';
import { generateDocument } from '../runtime/documents.mjs';

export const PLAN_MAX_STEPS = 12;
export const PLAN_PROMPT = '你是任务规划助手。根据用户的目标，制定一个可以逐步执行的计划。要求：3 到 8 步为宜，每步是一个可独立完成、可验证结果的动作；' +
  '按执行顺序排列；不要把「总结」「汇报」单列为一步，除非用户要求；不编造用户没提供的资料。' +
  '只输出 JSON：{"steps":[{"title":"不超过30字的步骤名","detail":"这一步具体做什么、产出什么"}]}';
export const RESEARCH_PROMPT = '你是研究规划助手。把用户的研究课题拆成 3 到 6 个互不重叠、可以通过检索回答的子问题，覆盖背景、现状数据、主要观点或方案、对比与风险等必要维度。' +
  '每个子问题给出检索要点（关键词、优先的权威来源类型）。不要包含「撰写报告」这一步，系统会自动追加。' +
  '只输出 JSON：{"steps":[{"title":"不超过30字的子问题","detail":"检索要点"}]}';
export const REPORT_STEP = {title: '撰写研究报告', detail: '综合前面各步的发现，写成带引用的结构化报告'};

// [ux3] attachments chosen in the composer travel with the plan: shown to the planner by name, sent with every step
// (except the research report step, which only writes from earlier findings).
const ATTACH_MAX = 20;
export function planAttachments(p) {
  const str = (v, n) => typeof v === 'string' && v.length <= n ? v : undefined;
  const documents = (Array.isArray(p?.documents) ? p.documents : []).slice(0, ATTACH_MAX).filter(d => str(d?.documentId, 200))
    .map(d => ({documentId: d.documentId, ...(Number.isFinite(d.revision) ? {revision: d.revision} : {}), ...(str(d.sha256, 128) ? {sha256: d.sha256} : {}),
      ...(str(d.name, 300) ? {name: d.name} : {}), ...(str(d.archive, 300) ? {archive: d.archive} : {}), ...(str(d.entryPath, 1000) ? {entryPath: d.entryPath} : {})}));
  const files = (Array.isArray(p?.files) ? p.files : []).slice(0, ATTACH_MAX).filter(f => str(f?.folderId, 200) && str(f?.relative, 2000))
    .map(f => ({folderId: f.folderId, relative: f.relative}));
  return documents.length || files.length ? {documents, files} : null;
}
const attachmentNames = a => [...a.documents.map(d => d.name || '文档'), ...a.files.map(f => String(f.relative).split('/').pop())].join('、');

/** Model output → [{title, detail}] (JSON first, numbered/bulleted lines as fallback). */
export function parsePlan(output) {
  const s = String(output || '');
  let items = null;
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const a = s.indexOf(open), b = s.lastIndexOf(close);
    if (a < 0 || b <= a) continue;
    try { const d = JSON.parse(s.slice(a, b + 1)); items = Array.isArray(d) ? d : Array.isArray(d?.steps) ? d.steps : null; } catch {}
    if (items) break;
  }
  if (!items) items = s.split('\n').map(l => l.match(/^\s*(?:\d+[.、)）]|[-*•])\s*(.+)$/)?.[1]).filter(Boolean);
  const out = [];
  for (const it of items) {
    const title = String(typeof it === 'string' ? it : it?.title || '').replace(/\s+/g, ' ').trim();
    if (!title) continue;
    out.push({title: title.slice(0, 80), detail: String(typeof it === 'object' && it?.detail || '').trim().slice(0, 1000)});
    if (out.length >= PLAN_MAX_STEPS) break;
  }
  return out;
}

/** User-edited steps from the plan card. */
export function validateSteps(steps) {
  if (!Array.isArray(steps) || !steps.length || steps.length > PLAN_MAX_STEPS) throw new Error(`计划需要 1 到 ${PLAN_MAX_STEPS} 步`);
  return steps.map(s => {
    if (!s || typeof s !== 'object') throw new Error('计划步骤无效');
    const title = text(s.title, 80), detail = s.detail === undefined || s.detail === '' ? '' : text(s.detail, 1000);
    return {title, detail};
  });
}

const outline = (plan, i) => plan.steps.map((x, j) => `${j + 1}. ${x.title}${j < i ? '（已完成）' : j === i ? '（当前）' : ''}`).join('\n');

export function stepPrompt(plan, i) {
  const s = plan.steps[i];
  if (plan.kind === 'research') {
    if (i === plan.steps.length - 1) return `深度研究最后一步：撰写研究报告。\n研究课题：${plan.goal}\n\n` +
      '只依据本对话前面各步已经查到的资料写作，不要再检索，不要编造数据或来源。要求：\n' +
      '1. Markdown 格式：第一行用「# 标题」，然后是「## 摘要」（3 到 5 条要点），再按主题分「## 」章节展开，必要时用表格对比，最后是「## 结论与建议」；\n' +
      '2. 每个事实、数字后面用 [n] 标注来源编号；\n3. 报告末尾写「## 参考来源」，按编号逐行列出「[n] 标题 网址」，编号与正文一致；\n' +
      '4. 资料不足或相互矛盾的地方明确写出来。';
    return `深度研究第 ${i + 1}/${plan.steps.length} 步，子问题：${s.title}` + (s.detail ? `\n检索要点：${s.detail}` : '') +
      `\n\n研究课题：${plan.goal}\n研究大纲：\n${outline(plan, i)}\n\n` +
      '请检索资料回答这个子问题：可以用 browser_open 打开搜索页（如 https://www.bing.com/search?q=关键词 ）和权威网页，再用 browser_read 阅读正文；资料库里的相关文档也可以引用。' +
      '至少核对 2 个独立来源，优先官方、学术和一手资料。\n只回答当前子问题，最后按下面格式输出：\n' +
      '### 发现\n- 要点（附具体数字、日期）\n### 来源\n- 标题 | 网址\n若查不到可靠资料，如实说明。';
  }
  return `按已确认的计划执行第 ${i + 1}/${plan.steps.length} 步：${s.title}` + (s.detail ? `\n具体要求：${s.detail}` : '') +
    `\n\n整体目标：${plan.goal}\n完整计划：\n${outline(plan, i)}` +
    '\n\n只完成当前这一步，不要提前做后面的步骤；完成后用两三句话说明本步结果。';
}

/** Distinct http(s) URLs cited in replies, in order of first appearance. */
export function collectSources(texts) {
  const seen = new Set(), out = [];
  for (const t of texts) for (const m of String(t || '').matchAll(/https?:\/\/[^\s<>()\[\]{}"'|，。；）]+/g)) {
    const url = m[0].replace(/[.,;:!?]+$/, '');
    if (!seen.has(url)) { seen.add(url); out.push(url); }
  }
  return out.slice(0, 200);
}

const plain = s => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 $2').trim();

/** Markdown report → {title, blocks} for the Word generator (headings, paragraphs, bullet lines, tables). */
export function reportSpec(markdown, fallbackTitle) {
  const lines = String(markdown || '').replace(/\r/g, '').split('\n');
  let title = '', table = null;
  const blocks = [];
  const flush = () => { if (table?.length) blocks.push({type: 'table', rows: table.slice(0, 100)}); table = null; };
  for (const raw of lines) {
    const line = raw.trim();
    if (/^\|.*\|$/.test(line)) {
      if (/^\|[\s:|-]+\|$/.test(line)) continue;
      const cells = line.slice(1, -1).split('|').map(c => plain(c).slice(0, 2000)).slice(0, 20);
      (table ??= []).push(cells);
      continue;
    }
    flush();
    if (!line) continue;
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h && h[1].length === 1 && !title) { title = plain(h[2]).slice(0, 200); continue; }
    if (h) { blocks.push({type: 'heading', text: plain(h[2]).slice(0, 10000)}); continue; }
    const li = line.match(/^(?:[-*•]|\d+[.、)])\s+(.+)$/);
    blocks.push({type: 'paragraph', text: (li ? (/^\d/.test(line) ? line.match(/^\d+/)[0] + '. ' : '• ') + plain(li[1]) : plain(line)).slice(0, 10000)});
  }
  flush();
  // tables need a rectangular shape for the Word writer
  for (const b of blocks) if (b.type === 'table') { const w = Math.max(...b.rows.map(r => r.length)); b.rows = b.rows.map(r => [...r, ...Array(w - r.length).fill('')]); }
  return {title: title || String(fallbackTitle || '研究报告').slice(0, 200), blocks: blocks.slice(0, 200)};
}

export function createPlanService({ store, models, key, request, conversations, documents, notify = () => {}, view }) {
  const running = new Map();
  const chatOf = id => { const c = (store.data.chats || []).find(c => c.id === id); if (!c) throw new Error('对话不存在或已删除'); return c; };

  async function planDraft(p) {
    const goal = text(p?.prompt, 20000), id = p?.id || uid(), research = p?.kind === 'research';
    if (running.has(id)) throw new Error('计划正在执行');
    if (research && !documents) throw new Error('当前环境无法保存研究报告');
    const route = models?.resolve(p.modelChoice || 'legacy', p.modelEffort || '', {tools: false, vision: false});
    const attachments = planAttachments(p); // [ux3]
    const result = await request(route?.settings || store.data.settings, route ? route.key() : key(), [{role: 'system', content: research ? RESEARCH_PROMPT : PLAN_PROMPT}, {role: 'user', content: goal + (attachments ? `\n\n用户附加了资料：${attachmentNames(attachments)}。执行每一步时都会提供这些资料的内容，请据此规划，需要时优先从资料中提取信息。` : '')}], AbortSignal.timeout(120000));
    let steps = parsePlan(result?.text);
    if (research) steps = [...steps.filter(s => !/撰写|报告/.test(s.title)).slice(0, PLAN_MAX_STEPS - 1), REPORT_STEP];
    if (!steps.length || (research && steps.length < 2)) throw new Error('模型没有给出可执行的步骤，请补充目标后重试');
    let chat = (store.data.chats || []).find(c => c.id === id);
    if (!chat) { chat = {id, name: goal.slice(0, 36), messages: [], time: Date.now(), agentId: p.agentId || 'assistant', ...(p.incognito === true ? {incognito: true} : {})}; store.data.chats.unshift(chat); }
    if (chat.plan?.status === 'running') throw new Error('计划正在执行');
    const now = Date.now();
    chat.messages.push({role: 'user', content: goal, time: now, planDraft: true, ...(attachments?.documents.length ? {documents: attachments.documents} : {})});
    chat.plan = {id: uid(), goal, status: 'draft', created: now, ...(research ? {kind: 'research'} : {}), agentId: p.agentId || chat.agentId || 'assistant',
      toolsEnabled: research || p.toolsEnabled === true, modelChoice: p.modelChoice || 'legacy', modelEffort: p.modelEffort || '', ...(attachments ? {attachments} : {}), steps: steps.map(s => ({...s, status: 'pending'}))};
    chat.time = now;
    await store.save(); notify();
    return {...view(), chatId: id};
  }

  async function saveReport(chat, plan, reply) {
    const spec = reportSpec(reply.content, plan.goal);
    if (!spec.blocks.length) throw new Error('报告内容为空');
    const {bytes} = await generateDocument('docx', JSON.stringify(spec));
    const name = ('研究报告-' + spec.title).replace(/[\\/:*?"<>|\n]/g, ' ').slice(0, 80);
    const saved = await documents.importFile(name, 'docx', bytes);
    const doc = saved?.document || saved;
    plan.report = {id: doc.id, name: doc.name || name, revision: doc.revision || 1};
    reply.researchReport = plan.report;
  }

  async function planRun(p) {
    const chat = chatOf(p?.id), plan = chat.plan;
    const resume = p?.resume === true && ['failed', 'cancelled'].includes(plan?.status); // [p2-ux] continue from the first unfinished step
    if (!plan || (plan.status !== 'draft' && !resume)) throw new Error('没有待执行的计划');
    if (resume) { for (const s of plan.steps) if (s.status !== 'done') { s.status = 'pending'; delete s.error; delete s.finished; } delete plan.error; }
    if (!resume && p.steps !== undefined) {
      let steps = validateSteps(p.steps);
      if (plan.kind === 'research') steps = [...steps.filter(s => s.title !== REPORT_STEP.title).slice(0, PLAN_MAX_STEPS - 1), REPORT_STEP];
      plan.steps = steps.map(s => ({...s, status: 'pending'}));
    }
    plan.status = 'running'; plan.started = Date.now();
    await store.save(); notify();
    const job = {cancelled: false};
    running.set(chat.id, job);
    void (async () => {
      let last = null;
      try {
        for (let i = 0; i < plan.steps.length; i++) {
          const step = plan.steps[i];
          if (step.status === 'done') continue;
          if (job.cancelled) { step.status = 'skipped'; continue; }
          step.status = 'running'; step.started = Date.now(); await store.save(); notify();
          const before = chat.messages.length;
          try {
            const withFiles = plan.attachments && !(plan.kind === 'research' && i === plan.steps.length - 1); // [ux3]
            await conversations.run({id: chat.id, prompt: stepPrompt(plan, i), agentId: plan.agentId, toolsEnabled: plan.toolsEnabled, modelChoice: plan.modelChoice, modelEffort: plan.modelEffort, planStep: i, ...(withFiles ? {documents: plan.attachments.documents, files: plan.attachments.files} : {})});
            const reply = chat.messages.slice(before).reverse().find(m => m.role === 'assistant');
            step.status = job.cancelled ? 'cancelled' : reply && !reply.error && !reply.budgetExhausted ? 'done' : 'failed';
            if (reply) { last = reply; step.output = String(reply.content || '').slice(0, 20000); }
          } catch (e) { step.status = 'failed'; step.error = String(e.message || e).slice(0, 300); }
          step.finished = Date.now();
          if (step.status === 'failed') { for (const s of plan.steps.slice(i + 1)) s.status = 'skipped'; break; }
        }
        if (plan.kind === 'research') plan.sources = collectSources(plan.steps.map(s => s.output));
        let ok = !job.cancelled && plan.steps.every(s => s.status === 'done');
        if (ok && plan.kind === 'research') {
          try { await saveReport(chat, plan, last); }
          catch (e) { ok = false; plan.error = '报告保存失败：' + String(e.message || e).slice(0, 200); }
        }
        plan.status = job.cancelled ? 'cancelled' : ok ? 'done' : 'failed';
      } finally {
        plan.finished = Date.now(); running.delete(chat.id);
        await store.save().catch(() => {}); notify();
      }
    })();
    return view();
  }

  return {
    planDraft,
    planRun,
    /** Discard a draft plan (keeps the conversation). */
    planDiscard: async (p) => { const c = chatOf(p?.id); if (c.plan?.status === 'draft') { c.plan.status = 'discarded'; await store.save(); } return view(); },
    planCancel: async (p) => { const c = chatOf(p?.id), job = running.get(c.id); if (!job) return view(); job.cancelled = true; await conversations.cancel(c.id); return view(); },
    /** test hook */ _running: running,
  };
}
