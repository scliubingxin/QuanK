// [v45] Shared harness for README screenshots and the product video: serves the real src/ and renders index.html in
// headless Chrome with a demo-state bridge (no model calls, no real data).
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {demoState, demoQuantDetail} from './demo-state.mjs';
import {financeDemo, financeDetail} from './demo-finance.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '../src/');
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2'};

export async function openDemo({width = 1440, height = 900, scale = 2, video = null, args = []} = {}) {
  const server = createServer(async (req, res) => {
    try {
      const p = new URL(req.url, 'http://local').pathname, f = path.resolve(root, '.' + (p === '/' ? '/index.html' : p));
      if (!f.startsWith(root)) throw Error();
      res.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH, args}); // [v45h] args e.g. --window-size for the screencast
  const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: scale, ...(video ? {recordVideo: {dir: video, size: {width, height}}} : {})});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const state = financeDemo(demoState());
  const detail = financeDetail(demoQuantDetail(), state);
  await page.exposeFunction('wbHost', async (name, p) => {
    if (name === 'quant') return {state: structuredClone(state), result: p?.action === 'holdings' ? {holdings: Object.values(state.quant.holdings), totals: {}} : p?.action === 'report' ? {...state.quant.reports.daily, md: '# 算法日报（演示）\n\n当日 24 条研判，方向对打率 8%。'} : structuredClone(detail)};
    return structuredClone(state);
  });
  await page.addInitScript(() => {
    window.actwill = new Proxy({}, {get: (_t, k) => typeof k !== 'string' ? undefined : k.startsWith('on') ? () => () => {} : p => window.wbHost(k, p)});
  });
  await page.goto('http://127.0.0.1:' + server.address().port + '/index.html');
  await page.waitForSelector('#prompt');
  await page.waitForTimeout(500);
  const nav = id => page.evaluate(id => { document.querySelector(`[data-page="${id}"]`)?.click(); }, id);
  const close = async () => { await context.close(); await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); };
  return {page, context, nav, errors, close, state};
}
