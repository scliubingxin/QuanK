// [F5 M2] 外发管控 helpers (pure): what a destination host is, which hosts are allowed in offline mode, and masking of
// holding amounts before tool results are handed to a chat model.

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const HOST_PURPOSES = [
  [/(^|\.)eastmoney\.com$/, '行情与公告（东方财富）'],
  [/(^|\.)gtimg\.cn$|(^|\.)qq\.com$/, '行情备用源（腾讯）'],
  [/(^|\.)deepseek\.com$|openai\.com$|anthropic\.com$|moonshot\.cn$|bigmodel\.cn$|dashscope\.aliyuncs\.com$|volces\.com$|siliconflow\.cn$|openrouter\.ai$|googleapis\.com$/, '大模型'],
  [/(^|\.)github\.com$|githubusercontent\.com$/, '更新与下载'],
  [/(^|\.)bing\.com$|duckduckgo\.com$|baidu\.com$|sogou\.com$/, '联网搜索'],
  [/(^|\.)dingtalk\.com$|feishu\.cn$|larksuite\.com$|weixin\.qq\.com$|work\.weixin\.qq\.com$/, '办公平台连接'],
];
export const isLoopback = host => /^(127\.\d+\.\d+\.\d+|localhost|\[?::1\]?|0\.0\.0\.0)$/i.test(String(host || ''));
export function purposeOf(host) {
  const h = String(host || '').toLowerCase();
  if (isLoopback(h)) return '本机服务';
  for (const [re, p] of HOST_PURPOSES) if (re.test(h)) return p;
  return '其他';
}

export const PRIVACY_DEFAULTS = {offline: false, maskAmounts: false, egressLog: true};
export function normalizePrivacy(p) {
  const o = p && typeof p === 'object' ? p : {};
  return {offline: o.offline === true, maskAmounts: o.maskAmounts === true, egressLog: o.egressLog !== false};
}

// Fields that reveal how much money the user has. Prices, percentages and weights stay (they are needed for analysis).
const AMOUNT_KEYS = new Set(['shares', 'cost', 'costValue', 'value', 'pnl', 'dayPnl', 'cash', 'total', 'invested', 'stockValue', 'budget', 'amount', 'fee', 'loss', 'after', 'before',
  'varAmount', 'cvarAmount', 'cashShortfall', 'shortfall', 'delta', 'stopPrice', 'marketValue', 'position', 'positions_value']);
const MASKED_TOOLS = /^app_(pf_|quant_holdings|quant_trade|research_export|research_report)/;
/** Replace amount fields with '***' in a tool result for a model (deep, bounded). Returns {result, masked: count}. */
export function maskAmounts(result, {depth = 0} = {}) {
  let n = 0;
  const walk = (x, d) => {
    if (d > 8) return x;
    if (Array.isArray(x)) return x.map(v => walk(v, d + 1));
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => {
      if (AMOUNT_KEYS.has(k) && (typeof v === 'number' || (typeof v === 'string' && /\d/.test(v)))) { n++; return [k, '***']; }
      if (k === 'lossIfMarketDown10' && v && typeof v === 'object') { n++; return [k, '***']; }
      return [k, walk(v, d + 1)];
    }));
    return x;
  };
  return {result: walk(result, depth), masked: n};
}
export const shouldMask = (toolName, privacy) => normalizePrivacy(privacy).maskAmounts && MASKED_TOOLS.test(String(toolName || ''));

/** URL -> the part that may be logged: protocol, host, path (no query string, no credentials). */
export function safeUrl(u) {
  try { const x = new URL(String(u)); return {host: x.hostname, path: clip(x.pathname, 120), protocol: x.protocol.replace(':', '')}; } catch { return {host: '', path: '', protocol: ''}; }
}
