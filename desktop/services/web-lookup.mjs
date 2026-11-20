// [ux9] Web lookup for chat app tools: search (Bing RSS, no key) and read a public page as plain text.
// Read-only; private / loopback / link-local hosts are refused so the model cannot probe the local network.
import { fetchText } from './connectors.mjs';
import { parseFeed, plainText, decodeEntities } from '../runtime/feed-parse.mjs';
import { safeUrl } from '../src/shared/connectors.js';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export function publicUrl(value) {
  const href = safeUrl(value), u = new URL(href), h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  const privateV4 = v4 && (v4[1] === '10' || v4[1] === '127' || v4[1] === '0' || (v4[1] === '169' && v4[2] === '254') || (v4[1] === '192' && v4[2] === '168') || (v4[1] === '172' && +v4[2] >= 16 && +v4[2] <= 31) || (v4[1] === '100' && +v4[2] >= 64 && +v4[2] <= 127));
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || privateV4 || h.includes(':') || !h.includes('.')) throw new Error('只能读取公网网页');
  return href;
}

export function createWebLookup({fetcher = globalThis.fetch, endpoint = 'https://cn.bing.com/search?format=rss&setlang=zh-CN&q='} = {}) {
  return {
    async search(query, {signal, limit = 8} = {}) {
      const q = clip(query, 200);
      if (q.length < 2) throw new Error('请提供搜索词');
      const {text} = await fetchText(fetcher, endpoint + encodeURIComponent(q), {signal, timeoutMs: 15000, maxBytes: 2 * 1024 * 1024});
      const feed = parseFeed(text, endpoint);
      if (!feed) throw new Error('搜索服务没有返回结果');
      const items = (feed.items || []).filter(i => /^https?:\/\//i.test(i.url || '')).slice(0, Math.min(10, limit));
      return items.map(i => ({title: clip(i.title, 160), url: i.url, snippet: clip(i.summary, 300)}));
    },
    async read(url, {signal, maxChars = 12000} = {}) {
      const href = publicUrl(url);
      const {text, contentType, url: finalUrl} = await fetchText(fetcher, href, {signal, timeoutMs: 20000, maxBytes: 3 * 1024 * 1024});
      publicUrl(finalUrl || href);
      const html = /html|xml/i.test(contentType) || /<html|<body|<div/i.test(text.slice(0, 2000));
      const title = html ? clip(decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1] || ''), 160) : '';
      const body = (html ? plainText(text) : text).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      return {url: finalUrl || href, title, text: body.slice(0, Math.max(1000, Math.min(30000, maxChars))), truncated: body.length > maxChars};
    },
  };
}
