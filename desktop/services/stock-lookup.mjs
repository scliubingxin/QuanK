// [v45q] Stock lookup for 「添加宁德时代」-style requests: company name / short name / pinyin / code -> A-share code + name
// (Eastmoney public suggest API, no key) and a best-effort company logo (the listed company's official website icon,
// found through Eastmoney F10 company profile). Read-only, public hosts only, small size caps; never throws for logos.
import { publicUrl } from './web-lookup.mjs';

const SUGGEST = 'https://searchapi.eastmoney.com/api/suggest/get?type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=10&input=';
const F10 = 'https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code=';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 QuanK';
const LOGO_MAX = 200 * 1024, TEXT_MAX = 2 * 1024 * 1024;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Exchange prefix used by Eastmoney F10 for a 6-digit A-share code. */
export function exchangeOf(code) {
  const c = String(code || '');
  return /^(6|9)/.test(c) ? 'SH' : /^(4|8|92)/.test(c) ? 'BJ' : 'SZ';
}

/** Image type from magic bytes (headers are often wrong for icons); '' when not a supported raster image. */
export function sniffImage(b) {
  if (!b || b.length < 32) return '';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon';
  return '';
}

/** Icon candidates from a homepage, best first: apple-touch-icon, then larger declared sizes, then /favicon.ico. */
export function iconCandidates(html, base) {
  const out = [];
  for (const tag of String(html || '').match(/<link\b[^>]*>/gi) || []) {
    const rel = (/\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1] || '').toLowerCase();
    const href = /\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1];
    if (!href || !/icon/.test(rel) || /\.svg(\?|$)/i.test(href) || /svg/i.test(/\btype\s*=\s*["']?([^"'>\s]+)/i.exec(tag)?.[1] || '')) continue;
    const size = Math.max(0, ...((/\bsizes\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1] || '').match(/\d+/g) || []).map(Number));
    try { out.push({url: new URL(href, base).href, score: (/apple-touch/.test(rel) ? 1000 : 0) + Math.min(size, 512)}); } catch {}
  }
  out.sort((a, b) => b.score - a.score);
  try { out.push({url: new URL('/favicon.ico', base).href, score: -1}); } catch {}
  return [...new Set(out.map(x => x.url))].slice(0, 5);
}

/** The company website from an F10 profile (field names vary, so search keys that look like a website field). */
export function websiteFrom(json) {
  let found = '';
  const walk = v => {
    if (found || !v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      if (found) return;
      if (typeof x === 'string' && /ORG_WEB|WEB_?SITE|COMPANY_?WEB|HOMEPAGE|网址/i.test(k) && /[a-z0-9-]+\.[a-z]{2,}/i.test(x)) found = x.trim().split(/[\s;；,，]/)[0];
      else if (typeof x === 'object') walk(x);
    }
  };
  walk(json);
  if (!found) return '';
  return /^https?:\/\//i.test(found) ? found : 'http://' + found.replace(/^\/+/, '');
}

export function createStockLookup({fetcher = globalThis.fetch, timeoutMs = 8000} = {}) {
  async function get(url, {max, signal}) {
    const href = publicUrl(url);
    const s = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    const r = await fetcher(href, {signal: s, redirect: 'follow', headers: {'user-agent': UA, accept: '*/*', referer: 'https://quote.eastmoney.com/'}});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (r.url) publicUrl(r.url);
    const len = Number(r.headers?.get?.('content-length') || 0);
    if (len > max) throw new Error('too large');
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length > max) throw new Error('too large');
    return {b, type: String(r.headers?.get?.('content-type') || '').toLowerCase(), url: r.url || href};
  }
  const text = ({b, type}) => {
    const cs = /charset=([\w-]+)/.exec(type)?.[1] || /<meta[^>]+charset=["']?([\w-]+)/i.exec(b.slice(0, 4096).toString('latin1'))?.[1] || 'utf-8';
    try { return new TextDecoder(/gb/i.test(cs) ? 'gbk' : 'utf-8').decode(b); } catch { return b.toString('utf8'); }
  };
  return {
    async find(query, {signal} = {}) {
      const q = clip(query, 40);
      if (!q) throw new Error('请提供公司名称或代码');
      const res = await get(SUGGEST + encodeURIComponent(q), {max: TEXT_MAX, signal});
      let data; try { data = JSON.parse(text(res)); } catch { throw new Error('股票搜索服务返回了无法识别的结果'); }
      const rows = data?.QuotationCodeTable?.Data || [], seen = new Set(), out = [];
      for (const x of rows) {
        const code = clip(x.Code, 12), name = clip(x.Name, 30), key = code + '|' + x.Classify;
        if (!code || !name || seen.has(key)) continue;
        seen.add(key);
        out.push({code, name, board: clip(x.SecurityTypeName, 12), pinyin: clip(x.PinYin, 20), aShare: x.Classify === 'AStock' && /^\d{6}$/.test(code)});
      }
      return out;
    },
    /** data:image/...;base64 logo or '' (best effort: any failure returns ''). */
    async logo(code, {signal} = {}) {
      try {
        const c = String(code || '');
        if (!/^\d{6}$/.test(c)) return '';
        const prof = await get(F10 + exchangeOf(c) + c, {max: TEXT_MAX, signal});
        let site = ''; try { site = websiteFrom(JSON.parse(text(prof))); } catch {}
        if (!site) return '';
        let home; try { home = await get(site, {max: TEXT_MAX, signal}); } catch { home = null; }
        const cands = iconCandidates(home ? text(home) : '', home?.url || site);
        for (const u of cands) {
          try {
            const img = await get(u, {max: LOGO_MAX, signal}), mime = sniffImage(img.b);
            if (mime && img.b.length >= 64) return `data:${mime};base64,${img.b.toString('base64')}`;
          } catch {}
        }
      } catch {}
      return '';
    },
  };
}

const NORM = s => String(s || '').replace(/\s|股份|有限公司|有限|集团|公司|\*|ST/gi, '').toUpperCase();
/**
 * Query -> {code, name, board} | {choices: [...]} | {error}. Only A-shares (6-digit codes) can go into the pool.
 */
export async function resolveStock(lookup, query) {
  const q = clip(query, 40);
  if (!q) return {error: '请提供公司名称或 6 位代码'};
  const m = /^(?:sh|sz|bj)?(\d{6})$/i.exec(q);
  let list = [];
  try { list = await lookup.find(m ? m[1] : q); } catch (e) { if (m) return {code: m[1], name: '', board: ''}; return {error: `暂时无法联网查找股票：${e.message || e}`}; }
  const view = x => ({code: x.code, name: x.name, board: x.board});
  const a = list.filter(x => x.aShare);
  if (m) { const hit = a.find(x => x.code === m[1]); return {code: m[1], name: hit?.name || '', board: hit?.board || ''}; }
  if (!a.length) return {error: list.length
    ? `QuanK 股票池目前只支持沪深北 A 股；「${q}」找到的是：${list.slice(0, 3).map(x => `${x.name}（${x.board || '其他'} ${x.code}）`).join('、')}`
    : `没有找到「${q}」对应的股票，请换个名称或直接给 6 位代码`};
  const exact = a.filter(x => x.name === q || NORM(x.name) === NORM(q) || x.pinyin.toUpperCase() === q.toUpperCase());
  if (exact.length === 1) return view(exact[0]);
  if (a.length === 1) return view(a[0]);
  return {choices: a.slice(0, 6).map(view)};
}
