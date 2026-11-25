// [F5 M4] 合规审阅 (pure, shared by main and renderer).
// Checks research reports, portfolio reports, topic digests and articles before export: prohibited promises
// (保本 / 稳赚 / 目标价必达 …), inducement and personalised advice wording, missing disclaimer, missing data source or
// report date, AI-generated content without a label. Also owns the configurable standard disclaimer and risk notes.

export const DEFAULT_DISCLAIMER = '本文内容由 QuankSight 根据公开数据与用户本机数据生成，仅供研究参考，不构成任何投资建议或收益承诺。市场有风险，投资需谨慎，请独立判断并自行承担投资决策的风险。';
export const DEFAULT_RISK_NOTES = ['历史表现不代表未来收益，回测结果不等于实际收益。', '数据可能存在延迟或错误，请以交易所与上市公司公告为准。'];
export const AI_LABEL = '本文部分内容由人工智能生成，已标注 AI 研判段落，请注意甄别。';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
/** [id, level, label, pattern, suggestion]. high = must fix before publishing, medium = should fix, low = hint. */
export const RULES = [
  ['guarantee', 'high', '承诺保本或收益', /保本|保收益|稳赚不赔|稳赚|只赚不赔|零风险|无风险(收益|套利)|包赚|保证(收益|盈利|赚钱|回本)|收益(有)?保障|本金(无忧|安全|不亏)|绝对(收益|安全|不亏)|躺赚/, '删除收益承诺，改为客观描述，并提示投资风险'],
  ['certain', 'high', '确定性预测', /(必|一定|肯定|铁定|注定)(涨|大涨|暴涨|翻倍|上涨|反弹|涨停)|目标价(必|一定)(达|到)|(必达|必涨|必翻倍)|闭眼(买|入)|无脑(买|入|上)|稳(涨|升)不跌/, '改为「可能」「存在……可能」等不确定表述，并说明依据'],
  ['multiple', 'high', '夸大收益', /(翻\s*\d+\s*倍|\d+\s*倍(大)?牛股|年化\s*\d{3,}\s*%|月(赚|入)\s*\d+\s*%|十倍股|百倍股|妖股(必|一定))/, '删除夸大收益的说法；如引用历史数据，注明区间和来源'],
  ['inducement', 'medium', '诱导交易', /(赶紧|赶快|马上|立即|立刻|速度)(买入|上车|入场|抄底|加仓|满仓|梭哈)|最后(一次)?(上车|买入)机会|错过(就|再)?(没有|等十年|后悔)|满仓(干|梭哈)|梭哈|all\s*in/i, '删除催促交易的表述，交给读者自行判断'],
  ['insider', 'high', '内幕或违规信息', /内幕(消息|信息)|内部消息|庄家(拉升|操盘)|(带|跟)你(赚钱|上车)|荐股群|喊单|老师带(单|你)|保证金返还/, '删除，不得传播内幕信息或荐股、喊单内容'],
  ['personal', 'medium', '个性化投资建议', /(你|您)(应该|必须|一定要)(买|卖|加仓|减仓|清仓|满仓)|建议(全部|全仓|满仓)|(无论|不管)(什么|多少)价(位)?都(要)?买/, '改为「策略信号显示……」等客观描述，并提示仅供研究'],
  ['source', 'low', '未注明来源的数据', /据(内部|可靠|知情)(人士|消息)/, '注明公开、可核实的数据来源'],
];
export const RULE_LABELS = Object.fromEntries(RULES.map(r => [r[0], r[2]]));

export function normalizeComplianceSettings(c) {
  const o = c && typeof c === 'object' ? c : {};
  const notes = Array.isArray(o.riskNotes) ? o.riskNotes.map(x => clip(x, 200)).filter(Boolean).slice(0, 8) : DEFAULT_RISK_NOTES;
  return {enabled: o.enabled !== false, block: o.block === true, disclaimer: clip(o.disclaimer, 600) || DEFAULT_DISCLAIMER, riskNotes: notes, aiLabel: o.aiLabel !== false,
    extraTerms: (Array.isArray(o.extraTerms) ? o.extraTerms : []).map(x => clip(x, 30)).filter(x => x.length >= 2).slice(0, 50)};
}
/** Settings change from the form or chat; throws a Chinese message. */
export function parseComplianceSettings(input = {}, base = {}) {
  const out = normalizeComplianceSettings(base);
  for (const k of ['enabled', 'block', 'aiLabel']) if (k in input) out[k] = input[k] === true || input[k] === 'on' || input[k] === 'true';
  if ('disclaimer' in input) { const d = clip(input.disclaimer, 601); if (d.length > 600) throw new Error('免责声明最多 600 字'); out.disclaimer = d || DEFAULT_DISCLAIMER; }
  if ('riskNotes' in input) out.riskNotes = (Array.isArray(input.riskNotes) ? input.riskNotes : String(input.riskNotes || '').split(/\n+/)).map(x => clip(x, 200)).filter(Boolean).slice(0, 8);
  if ('extraTerms' in input) out.extraTerms = (Array.isArray(input.extraTerms) ? input.extraTerms : String(input.extraTerms || '').split(/[,，、;；\n]+/)).map(x => clip(x, 30)).filter(x => x.length >= 2).slice(0, 50);
  return out;
}

const DISCLAIMER_HINT = /不构成(任何)?投资建议|仅供(研究|参考)|投资有风险|市场有风险/;
const SOURCE_HINT = /来源|数据来自|出处|东方财富|交易所|公告|F10|本机量化引擎|腾讯行情|Wind|同花顺/;
const DATE_HINT = /\d{4}[-年./]\d{1,2}([-月./]\d{1,2})?|\d{1,2}\s*月\s*\d{1,2}\s*日|报告期|截至|数据日期/;
const AI_HINT = /AI 研判|AI研判|AI 解读|人工智能生成|大模型|由 AI|AI 生成/;

function snippet(text, i, len) { const s = Math.max(0, i - 18); return (s ? '…' : '') + text.slice(s, i + len + 18).replace(/\s+/g, ' ') + (i + len + 18 < text.length ? '…' : ''); }
/**
 * Review plain text (an article, a chat answer). Returns {findings, counts, ok, level}. kind: 'report' | 'article' | 'text'.
 * 'report' / 'article' also require a disclaimer, a source and a date; aiUsed requires the AI label.
 */
export function reviewText(text, {kind = 'text', aiUsed = false, settings = null, where = ''} = {}) {
  const S = normalizeComplianceSettings(settings), t = String(text || ''), findings = [];
  const rules = [...RULES, ...S.extraTerms.map((w, i) => [`custom${i}`, 'medium', '自定义禁用词', new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), '按公司规定删除或替换'])];
  for (const [id, level, label, re, fix] of rules) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m, n = 0;
    while ((m = g.exec(t)) && n < 5) { findings.push({rule: id, level, label, match: m[0], excerpt: snippet(t, m.index, m[0].length), fix, where}); n++; if (!m[0]) g.lastIndex++; }
  }
  if (kind === 'report' || kind === 'article') {
    if (!DISCLAIMER_HINT.test(t)) findings.push({rule: 'disclaimer', level: 'high', label: '缺少免责声明', match: '', excerpt: '', fix: '在文末加入标准免责声明（可自动补上）', where, auto: true});
    if (!SOURCE_HINT.test(t)) findings.push({rule: 'nosource', level: 'medium', label: '未注明数据来源', match: '', excerpt: '', fix: '注明行情、财务、公告等数据的来源', where});
    if (!DATE_HINT.test(t)) findings.push({rule: 'nodate', level: 'medium', label: '未注明数据日期或报告期', match: '', excerpt: '', fix: '注明数据截至日期或财报报告期', where});
  }
  if (aiUsed && S.aiLabel && !/人工智能生成|AI 生成|AI生成|由 AI/.test(t)) findings.push({rule: 'ailabel', level: 'medium', label: '缺少 AI 生成标注', match: '', excerpt: '', fix: '标注哪些内容由 AI 生成（可自动补上）', where, auto: true});
  return summarize(findings);
}
function summarize(findings) {
  const counts = {high: 0, medium: 0, low: 0};
  for (const f of findings) counts[f.level]++;
  return {findings, counts, ok: !counts.high, level: counts.high ? 'high' : counts.medium ? 'medium' : counts.low ? 'low' : 'ok'};
}
/** Flatten a report spec ({title, subtitle, summary, sections:[{title, paragraphs, bullets, table}], disclaimer}) to text. */
export function specText(spec) {
  const out = [spec?.title, spec?.subtitle, spec?.summary];
  for (const s of spec?.sections || []) { out.push(s.title, ...(s.paragraphs || []), ...(s.bullets || [])); for (const r of (s.table || []).slice(0, 120)) out.push(r.join(' ')); }
  out.push(spec?.disclaimer);
  return out.filter(Boolean).map(String).join('\n');
}
/** Review a report spec section by section (findings carry the section title in `where`). */
export function reviewSpec(spec, {settings = null} = {}) {
  const S = normalizeComplianceSettings(settings), aiUsed = (spec?.sections || []).some(s => /AI|人工智能/.test(s.title || '') || s.ai === true) || AI_HINT.test(spec?.summary || '');
  const findings = [];
  for (const s of spec?.sections || []) {
    if (s.id === 'compliance-notes') continue;
    findings.push(...reviewText([s.title, ...(s.paragraphs || []), ...(s.bullets || [])].join('\n'), {settings: S, where: clip(s.title, 30)}).findings);
  }
  findings.push(...reviewText([spec?.title, spec?.summary].filter(Boolean).join('\n'), {settings: S, where: '标题与摘要'}).findings);
  const whole = reviewText(specText(spec), {kind: 'report', aiUsed, settings: S}).findings.filter(f => ['disclaimer', 'nosource', 'nodate', 'ailabel'].includes(f.rule));
  return {...summarize([...findings, ...whole]), aiUsed};
}
/**
 * Standard notes: the configured disclaimer (replacing the spec's), the risk notes and, when AI content is present, the
 * AI label, as a final 「风险提示」 section. Idempotent.
 */
export function applyStandardNotes(spec, settings = null, {aiUsed = null} = {}) {
  const S = normalizeComplianceSettings(settings), ai = aiUsed ?? reviewSpec(spec, {settings: S}).aiUsed;
  const sections = (spec?.sections || []).filter(s => s.id !== 'compliance-notes');
  const bullets = [...S.riskNotes, ...(ai && S.aiLabel ? [AI_LABEL] : [])];
  if (bullets.length) sections.push({id: 'compliance-notes', title: '风险提示', bullets});
  return {...spec, sections, disclaimer: S.disclaimer};
}
export const LEVEL_TEXT = {high: '必须修改', medium: '建议修改', low: '提示', ok: '通过'};
/** One-line summary for toasts, documents and the audit log. */
export function describeReview(r) {
  if (!r || r.level === 'ok') return '合规检查通过';
  const c = r.counts, parts = [c.high ? `${c.high} 处必须修改` : '', c.medium ? `${c.medium} 处建议修改` : '', c.low ? `${c.low} 处提示` : ''].filter(Boolean);
  return `合规检查：${parts.join('，')}`;
}
