// [v0.52] Broker web page window (main process). One visible window on an in-memory session ('qk-broker', not a
// persistent partition): the login lives only while QuanK runs and is never written to disk. QuanK only reads the page,
// fills input fields and outlines the submit button (src/shared/trade.js fillScript); it never clicks anything.
import { fillScript, calibrateScript, readRowsScript } from '../src/shared/trade.js';

const httpsOnly = u => { try { const x = new URL(String(u)); return x.protocol === 'https:' && !x.username && !x.password; } catch { return false; } };
function bounded(p, ms, what) { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what}超时`)), ms); })]).finally(() => clearTimeout(t)); }

export function createBrokerBrowser({BrowserWindow, title = 'QuanK · 券商网页版'}) {
  let win = null;
  const alive = () => win && !win.isDestroyed();
  function ensure() {
    if (alive()) return win;
    win = new BrowserWindow({width: 1280, height: 860, show: true, title, webPreferences: {partition: 'qk-broker', sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true}});
    const wc = win.webContents;
    wc.setWindowOpenHandler(({url}) => { if (httpsOnly(url)) wc.loadURL(url).catch(() => {}); return {action: 'deny'}; });
    for (const ev of ['will-navigate', 'will-redirect']) wc.on(ev, (e, u) => { if (!httpsOnly(typeof u === 'string' ? u : e?.url)) e.preventDefault(); });
    try { wc.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false)); } catch {}
    win.on('closed', () => { win = null; });
    return win;
  }
  return {
    get open() { return alive(); },
    status: () => ({open: alive(), url: alive() ? win.webContents.getURL() : ''}),
    async show(url) {
      if (!httpsOnly(url)) throw new Error('券商网址必须是 https');
      const w = ensure();
      if (!w.webContents.getURL() || (url && w.webContents.getURL() !== url && !w.webContents.getURL().startsWith(new URL(url).origin))) await w.loadURL(url).catch(() => {});
      w.show(); w.focus();
      return {open: true, url: w.webContents.getURL()};
    },
    async navigate(url) { if (!httpsOnly(url)) throw new Error('券商网址必须是 https'); const w = ensure(); await w.loadURL(url).catch(() => {}); w.show(); return {url: w.webContents.getURL()}; },
    async fill(fields, values) { if (!alive()) throw new Error('券商页面没有打开'); win.show(); win.focus(); return bounded(win.webContents.executeJavaScript(fillScript({fields, values}), true), 15000, '填写委托'); },
    async calibrate(steps) { if (!alive()) throw new Error('请先打开券商页面并登录'); win.show(); win.focus(); return bounded(win.webContents.executeJavaScript(calibrateScript(steps), true), 5 * 60e3, '标注'); },
    async readRows(selector, code) { if (!alive()) throw new Error('券商页面没有打开'); return bounded(win.webContents.executeJavaScript(readRowsScript(selector, code), true), 10000, '读取委托列表'); },
    /** Forget the login: clear the in-memory session and close the window. */
    async logout() { if (alive()) { try { await win.webContents.session.clearStorageData(); } catch {} win.close(); } win = null; return {open: false}; },
  };
}
