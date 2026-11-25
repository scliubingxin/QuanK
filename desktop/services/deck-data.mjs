// [D59] Read-only public data providers for research decks: Tencent quote valuation and
// Eastmoney F10 annual financials. Both are cached in memory and bounded by timeouts.

const CACHE = new Map();
const TTL = 60 * 60 * 1000;
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; QuanK-Deck/0.59)', 'Referer': 'https://finance.sina.com.cn/' };
const cached = (key, producer) => {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const task = Promise.resolve().then(producer).then(value => { CACHE.set(key, {at: Date.now(), value}); return value; },
    error => { CACHE.delete(key); throw error; });
  CACHE.set(key, {at: Date.now(), value: task});
  return task;
};
async function get(url, ms = 12000, fetcher = globalThis.fetch) {
  const signal = AbortSignal.timeout(ms);
  const r = await fetcher(url, {signal, headers: UA});
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r;
}
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

export function createDeckData({ fetcher = globalThis.fetch, now = Date.now, ttlMs = TTL } = {}) {
  /** Eastmoney F10 annual main financial data; returns 5 recent fiscal years. */
  async function finance(code, years = 5) {
    code = String(code || '').replace(/^(sh|sz|bj)/i, '');
    if (!/^\d{6}$/.test(code)) throw new Error('股票代码应为 6 位数字');
    return cached('finance:' + code + ':' + years, async () => {
      const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?sortColumns=NOTICE_DATE&sortTypes=-1'
        + '&pageSize=100&pageNumber=1&reportName=RPT_LICO_FN_CPD&columns=ALL'
        + '&filter=(SECURITY_CODE%3D%22' + code + '%22)';
      const json = await (await get(url, 14000, fetcher)).json();
      const list = (json?.result?.data || []).filter(r => /-\d{2}-\d{2}/.test(String(r.REPORTDATE || '')) && String(r.REPORTDATE).slice(5, 10) === '12-31');
      if (!list.length) throw new Error('未取得年度报告财务数据');
      const annual = list.slice(0, years).reverse();
      const year = r => String(r.REPORTDATE).slice(0, 4);
      const yi = v => { const n = num(v); return n === null ? '—' : String(Math.round(n / 1e8 * 100) / 100); };
      const pct = v => { const n = num(v); return n === null ? '—' : String(Math.round(n * 100) / 100) + '%'; };
      const rows = [
        ['指标', ...annual.map(year)],
        ['营业收入', ...annual.map(r => yi(r.TOTAL_OPERATE_INCOME))],
        ['归母净利润', ...annual.map(r => yi(r.PARENT_NETPROFIT))],
        ['毛利率', ...annual.map(r => pct(r.XSMLL))],
        ['ROE', ...annual.map(r => pct(r.WEIGHTAVG_ROE))],
      ];
      return {rows, asOf: String(list[0].REPORTDATE).slice(0, 10), source: '东方财富 F10'};
    });
  }

  /** Current PE/PB from Tencent quote (no historical percentile available). */
  async function valuation(code, field) {
    code = String(code || '').replace(/^(sh|sz|bj)/i, '');
    if (!/^\d{6}$/.test(code)) throw new Error('股票代码应为 6 位数字');
    return cached('valuation:' + code + ':' + (field || ''), async () => {
      const prefix = /^(6|9)/.test(code) ? 'sh' : 'sz';
      const text = await (await get('https://qt.gtimg.cn/q=' + prefix + code, 10000, fetcher)).text();
      const fields = (text.split('"')[1] || '').split('~');
      if (fields.length < 47) throw new Error('腾讯行情字段不足');
      const pe = num(fields[39]), pb = num(fields[46]), stamp = String(fields[30] || '');
      const asOf = stamp.length >= 14 ? stamp.slice(0, 4) + '-' + stamp.slice(4, 6) + '-' + stamp.slice(6, 8) + ' ' + stamp.slice(8, 10) + ':' + stamp.slice(10, 12) : null;
      if (field) {
        const v = String(field).toUpperCase() === 'PB' ? pb : pe;
        return {value: v === null || (String(field).toUpperCase() === 'PE' && v <= 0) ? '—' : Math.round(v * 100) / 100,
                asOf, source: '腾讯行情'};
      }
      return {
        percentiles: [
          {name: 'PE(TTM)', value: null, current: pe !== null && pe > 0 ? Math.round(pe * 100) / 100 : null, note: pe !== null && pe <= 0 ? '当前盈利为负，PE 不适用' : '当前值'},
          {name: 'PB(LF)', value: null, current: pb !== null && pb > 0 ? Math.round(pb * 100) / 100 : null, note: '当前值'},
          {name: 'PE 历史分位', value: null, note: '历史分位未提供'},
          {name: 'PB 历史分位', value: null, note: '历史分位未提供'},
        ],
        asOf, source: '腾讯行情',
      };
    });
  }

  return { finance, valuation };
}
