// [p4-m4] Mini apps: one self-contained HTML file per app, run in the double sandbox (willbuddy-preview://local/apps/).
// Pure helpers shared by the main process, the renderer and tests: source extraction / limits, per-app storage quota.
export const APP_LIMIT = 30, VERSION_LIMIT = 10, HTML_BYTES = 256 * 1024;
export const STORAGE_KEYS = 200, STORAGE_BYTES = 1024 * 1024, KEY_CHARS = 200;
const enc = new TextEncoder();
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Pull an HTML document out of a model reply (```html / ```miniapp fence, or a bare <html> document). */
export function extractHtml(text) {
  const s = String(text ?? '');
  const fence = /```[ \t]*(?:html|miniapp)?[ \t]*\n([\s\S]*?)\n[ \t]*```/i.exec(s);
  let html = fence ? fence[1] : s;
  if (!fence) { const a = s.search(/<!doctype html|<html[\s>]/i), b = s.toLowerCase().lastIndexOf('</html>'); if (a >= 0 && b > a) html = s.slice(a, b + 7); }
  return html.trim();
}

/** Validate an app document. Returns {html, title}. External scripts / styles are refused up front (CSP blocks them anyway). */
export function normalizeAppHtml(input) {
  const html = extractHtml(input);
  if (!html) throw new Error('小应用代码为空');
  if (enc.encode(html).length > HTML_BYTES) throw new Error('小应用代码超过 256 KB');
  if (!/<(html|body|script|div|main|section|button|input|canvas|table|form|h1|p)\b/i.test(html)) throw new Error('小应用需要 HTML 代码');
  if (/<script\b[^>]*\bsrc\s*=/i.test(html) || /<link\b[^>]*rel\s*=\s*["']?stylesheet/i.test(html) || /@import\s/i.test(html)) throw new Error('小应用不能引用外部脚本或样式，请把代码写在同一个文件里');
  const title = clip(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, ''), 60);
  return {html: /^<!doctype/i.test(html) ? html : '<!doctype html>\n' + html, title};
}

export const storageSize = st => Object.entries(st || {}).reduce((n, [k, v]) => n + k.length + String(v).length, 0) * 2;
/** Apply one storage operation to a copy of the store; throws on quota / shape errors. */
export function applyStorageOp(storage, op) {
  const next = {...(storage || {})};
  if (op?.op === 'clear') return {};
  const key = typeof op?.key === 'string' ? op.key : null;
  if (key === null || !key.length || key.length > KEY_CHARS) throw new Error('存储键无效');
  if (op.op === 'remove') { delete next[key]; return next; }
  if (op.op !== 'set') throw new Error('未知存储操作');
  const value = String(op.value ?? '');
  if (!(key in next) && Object.keys(next).length >= STORAGE_KEYS) throw new Error(`每个小应用最多保存 ${STORAGE_KEYS} 项数据`);
  next[key] = value;
  if (storageSize(next) > STORAGE_BYTES) throw new Error('小应用数据超过 1 MB');
  return next;
}

export const MINIAPP_INSTRUCTION = '用户要一个小工具、小应用、计算器、表单、清单、看板、计时器、小游戏等可交互页面时，用完整miniapp代码围栏输出单个HTML文件：' +
  '所有CSS和JavaScript都写在同一文件里，不引用任何外部脚本、样式、字体、图片或网络接口（运行环境不联网）；需要保存数据时直接用 localStorage（每个应用独立保存，最多1MB）；' +
  '界面用中文，清爽美观，适配窄窗口；<title> 写应用名。之后用一两句话说明怎么用。';
export const MINIAPP_PROMPT = '你是小应用开发助手。根据要求写一个完整、可直接运行的单文件 HTML 小应用，只输出一个 ```html 代码块，不要解释。要求：' +
  '1) 所有 CSS 与 JavaScript 内联在同一文件，不引用外部脚本、样式、字体、图片、CDN 或网络接口（运行环境完全离线，fetch 不可用）；' +
  '2) 需要保存数据时用 localStorage（JSON 序列化，最多 1MB），刷新后能恢复；3) 中文界面，系统字体，留白充足、主色 #0078CB，适配 360–1200px 宽度；' +
  '4) <title> 写应用名称（不超过 20 字）；5) 输入要做校验，出错给出提示，不使用 alert 以外的弹窗 API；6) 代码完整，不要省略号或「此处省略」。';
export const MINIAPP_REVISE = '在保留已有功能和已保存数据格式（localStorage 的键名与结构）的前提下，按修改要求改写下面的小应用，输出完整的新文件。';
