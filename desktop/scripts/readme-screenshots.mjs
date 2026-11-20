// Capture README screenshots of the QuanK Office editor with the real bundled document engine and headless Chrome.
// Demo data only (no customer content).
// Run (from desktop/):
//   WB_TEST_PYTHON=<python3> WB_TEST_OFFICE_DIRECTORY=<engine program dir> CHROME_PATH=<Chrome binary> \
//   node scripts/readme-screenshots.mjs [outDir=../docs/images]
import {createServer} from 'node:http';
import {readFile, mkdtemp, rm, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {officeDirectory, officePython} from '../tests/helpers/office-kit-runtime.mjs';
import {startOfficeKit} from '../runtime/office-kit.mjs';
import {Store} from '../core.mjs';
import {generateDocument} from '../runtime/documents.mjs';
import {createDocumentService} from '../services/documents.mjs';
import {createOfficeWorkspace} from '../services/office-workspace.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] || path.join(here, '../../docs/images'));
const root = path.join(here, '../src/');
const log = (...a) => console.log('[shots]', ...a);

const SHEET = {sheets: [
  {name: '经营概览', rows: [
    ['2026 年区域销售经营概览（演示数据）'], [],
    ['区域', '一季度', '二季度', '三季度', '四季度', '全年合计', '同比增长', '负责人', '备注'],
    ['华东', 1280, 1460, 1525, 1690, 5955, 0.126, '张晨', '新品放量，渠道下沉持续推进'],
    ['华南', 980, 1105, 1210, 1302, 4597, 0.094, '李悦', ''],
    ['华北', 860, 902, 955, 1040, 3757, 0.051, '王磊', '大客户续约完成'],
    ['西南', 640, 712, 798, 865, 3015, 0.183, '赵敏', '成渝区域增长最快'],
    ['西北', 420, 455, 470, 512, 1857, 0.032, '刘洋', ''],
    ['合计', 4180, 4634, 4958, 5409, 19181, '', '', ''],
  ]},
  {name: '月度明细', rows: [['月份', '销售额', '订单数'], ['1月', 402, 118], ['2月', 365, 104], ['3月', 513, 151]]},
  {name: '产品结构', rows: [['产品线', '占比'], ['标准版', 0.42], ['专业版', 0.35], ['企业版', 0.23]]},
  {name: '渠道分析', rows: [['渠道', '贡献'], ['直销', 0.48], ['代理', 0.37], ['线上', 0.15]]},
  {name: '客户清单', rows: [['客户', '级别'], ['示例客户A', 'A'], ['示例客户B', 'B']]},
  {name: '预算对比', rows: [['项目', '预算', '实际'], ['市场', 300, 286], ['研发', 520, 548]]},
  {name: '数据口径说明', rows: [['说明'], ['本表为演示数据，不代表任何真实企业。']]},
]};
const DOC = {blocks: [
  {type: 'heading', text: 'QuanK 知识库使用教程（演示文档）'},
  {type: 'paragraph', text: '本文档介绍如何通过 QuanK 建立个人知识库、导入资料并让 AI 基于资料回答问题。以下内容均为演示数据。'},
  {type: 'heading', text: '一、登录与进入知识库'},
  {type: 'paragraph', text: '打开 QuanK，在左侧导航选择「知识库」。首次使用时，系统会为你创建以姓名命名的专业知识库。'},
  {type: 'paragraph', text: '如果知识库名称与你的姓名不一致，请联系管理员调整。'},
  {type: 'heading', text: '二、添加数据集'},
  {type: 'paragraph', text: '点击「添加数据集 - 手动数据集」，选择本机的 Word、PDF 或 Markdown 文件。导入完成后可在列表中查看解析状态。'},
  {type: 'heading', text: '三、在对话中引用资料'},
  {type: 'paragraph', text: '在对话输入框中选择知识库，AI 会优先依据资料作答，并在回答末尾标注引用来源。'},
  {type: 'table', rows: [['步骤', '操作', '预计耗时'], ['1', '登录并进入知识库', '1 分钟'], ['2', '导入资料', '3 分钟'], ['3', '开始提问', '随时']]},
]};
const DECK = {slides: [
  {layout: 'cover', title: 'QuanK 2027 产品规划', subtitle: '让 AI 从回答问题走向完成工作', meta: '产品部 · 演示数据'},
  {layout: 'cards', title: '三大核心能力', cards: [
    {title: '可交付成果', body: 'AI 直接生成可编辑的 Word、Excel、PPT，并在本机保存版本。'},
    {title: '专属智能体', body: '组合提示词、知识文档、Skills 与 MCP，复用团队工作方法。'},
    {title: '本机工作空间', body: '对话、文档与任务记录在本机管理，模型由你选择。'}]},
  {layout: 'process', title: '一份方案的完成路径', steps: [
    {title: '描述目标', body: '说明资料与交付格式'}, {title: 'AI 执行', body: '调用工具并观察结果'},
    {title: '在线编辑', body: 'Office 编辑器精修'}, {title: '保存导出', body: '生成新版本并导出'}]},
  {layout: 'summary', title: '下一步', points: ['完善表格编辑与图表', '扩展 PPT 动画与切换', '开放更多 MCP 连接器']},
]};

async function main() {
  await mkdir(outDir, {recursive: true});
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-shots-')), store = new Store(dir); await store.load();
  const documents = createDocumentService({store});
  const kit = createOfficeWorkspace({documents, directory: path.join(dir, 'kit'), runtime: async () => ({python: officePython, officeDirectory}), approve: async () => true, driver: o => startOfficeKit({...o, timeoutMs: 120000})});
  const server = createServer(async (req, res) => {
    try {
      const f = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
      if (!f.startsWith(root)) throw Error();
      res.setHeader('content-type', ({'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml'})[path.extname(f)] || 'application/octet-stream');
      res.end(await readFile(f));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH});
  const errors = [];
  const shots = [];
  async function editor(name, format, spec) {
    const d = (await documents.importFile(name, format, (await generateDocument(format, JSON.stringify(spec))).bytes)).document;
    const s = await kit.open(d.id, 1), id = s.sessionId;
    const ctx = await browser.newContext({viewport: {width: 1600, height: 960}, deviceScaleFactor: 2, locale: 'zh-CN'});
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    await page.exposeFunction('host', async (op, p = {}) => {
      if (op === 'info') return {...kit.meta(id), messages: [], models: []};
      if (op === 'snapshot') return kit.snapshot(id, p);
      if (op === 'operation') return kit.operation(id, p.op, p);
      if (op === 'save') return kit.save(id);
      if (op === 'thumbnail') return kit.thumbnail(id, p);
      if (op === 'slideAction') return kit.slideAction(id, p);
      if (op === 'notesGet') return kit.notesGet(id);
      if (op === 'notesSet') return kit.notesSet(id, p);
      if (op === 'deckInfo') return kit.deckInfo(id, p);
      if (op === 'viewMode') return kit.viewMode(id, p);
      if (op === 'pickImage') return {status: 'cancelled'};
      if (op === 'docOutline') return kit.outline(id);
      throw Error('unsupported ' + op);
    });
    await page.addInitScript(() => { window.willbuddyOffice = {invoke: (op, p) => window.host(op, p), onError: () => {}}; });
    await page.goto(base + '/office/index.html');
    await page.locator('#wb-save-state').filter({hasText: '已保存'}).waitFor({timeout: 120000}); // #status lives in the hidden legacy block
    return {page, ctx, id};
  }
  const settle = async (page, ms = 1500) => { await page.waitForTimeout(ms); };
  const snap = async (page, file, note) => { const p = path.join(outDir, file); await page.screenshot({path: p}); shots.push({file, note}); log('saved', p); };
  const esc = page => page.keyboard.press('Escape').catch(() => {});

  try {
    // ---------- Excel ----------
    const xl = await editor('区域销售经营概览', 'xlsx', SHEET);
    const p = xl.page;
    await p.locator('#wb-sheetbar').waitFor({timeout: 60000});
    await settle(p, 2500);
    const nb = p.locator('#wb-namebox');
    const go = async ref => { await nb.click(); await nb.fill(ref); await nb.press('Enter'); await settle(p, 1200); };
    // Light formatting so the sheet looks like a real report (uses the same operations as the toolbar).
    try {
      await go('A3:I3');
      await kit.operation(xl.id, 'command', {command: '.uno:Bold'});
      await kit.operation(xl.id, 'uno', {command: '.uno:BackgroundColor', args: {BackgroundColor: 0xDDEBF7}});
      await kit.operation(xl.id, 'uno', {command: '.uno:AlignHorizontalCenter'});
      await go('A3:I9'); await kit.operation(xl.id, 'sheet_border', {kind: 'all', color: '#BFBFBF', style: 'solid'});
      await go('G4:G8'); await kit.operation(xl.id, 'uno', {command: '.uno:NumberFormatPercent'});
      await go('A1'); await kit.operation(xl.id, 'command', {command: '.uno:Bold'}); await kit.operation(xl.id, 'uno', {command: '.uno:FontHeight', args: {'FontHeight.Height': 14}});
      await kit.operation(xl.id, 'sheet_size', {axis: 'column', index: 8, size: 4200});
      await kit.operation(xl.id, 'uno', {command: '.uno:FreezePanesRow', args: {Index: 3}});
      await kit.operation(xl.id, 'uno', {command: '.uno:FreezePanesColumn', args: {Index: 0}});
    } catch (e) { log('format step failed (continuing):', e.message); }
    await go('B4:E8'); await settle(p, 1500);
    await snap(p, 'office-excel.png', '表格编辑器：工具栏、名称框/公式栏、行列表头、工作表标签、状态栏统计');
    const open = async id => { await p.locator(`.sb-tool[data-id="${id}"] [data-open]`).first().click(); await settle(p, 800); };
    await go('C5');
    await open('insert');
    await p.locator('.sb-pop .sb-item', {hasText: '形状'}).hover(); await settle(p, 800);
    await snap(p, 'office-excel-insert.png', '插入菜单与形状面板');
    await esc(p); await p.mouse.click(5, 300); await settle(p, 500);
    await open('border'); await p.locator('.sb-pop .sb-item', {hasText: '边框颜色'}).hover(); await settle(p, 800);
    await snap(p, 'office-excel-border.png', '边框与颜色面板');
    await esc(p); await p.mouse.click(5, 300); await settle(p, 500);
    await open('numfmt');
    await snap(p, 'office-excel-numfmt.png', '数字格式');
    await esc(p); await p.mouse.click(5, 300); await settle(p, 500);
    await open('menu'); await p.locator('.sb-pop .sb-item', {hasText: '公式'}).hover(); await settle(p, 800);
    await snap(p, 'office-excel-formula.png', '菜单 → 公式函数分类');
    await esc(p); await p.mouse.click(5, 300);
    await xl.ctx.close(); await kit.close(xl.id).catch(() => {}); // at most two sessions may be open

    // ---------- Word ----------
    const wd = await editor('知识库使用教程', 'docx', DOC);
    const w = wd.page;
    await w.locator('#wb-docbar').waitFor({timeout: 60000});
    await settle(w, 2500);
    try {
      await kit.operation(wd.id, 'sheet_key', {key: 'Home', control: true});
      await kit.operation(wd.id, 'uno', {command: '.uno:StyleApply', args: {Style: 'Title', FamilyName: 'ParagraphStyles'}});
      await kit.operation(wd.id, 'uno', {command: '.uno:CenterPara'});
      await kit.operation(wd.id, 'sheet_key', {key: 'ArrowDown'}); await kit.operation(wd.id, 'sheet_key', {key: 'ArrowDown'});
      await kit.operation(wd.id, 'sheet_key', {key: 'Home'}); await kit.operation(wd.id, 'sheet_key', {key: 'End', shift: true});
    } catch (e) { log('doc format step failed (continuing):', e.message); }
    await settle(w, 1800);
    await snap(w, 'office-word.png', 'Word 编辑器：单行工具栏、样式/字体/字号、分页视图与状态栏');
    const wopen = async id => { await w.locator(`#wb-docbar .sb-tool[data-id="${id}"] [data-open]`).first().click(); await settle(w, 800); };
    await wopen('menu'); await w.locator('.sb-pop .sb-item', {hasText: '插入'}).first().hover(); await settle(w, 800);
    await snap(w, 'office-word-insert.png', '菜单 → 插入');
    await esc(w); await w.mouse.click(5, 500); await settle(w, 500);
    await wopen('style'); await snap(w, 'office-word-style.png', '段落样式'); await esc(w); await w.mouse.click(5, 500); await settle(w, 500);
    await wopen('font-size'); await snap(w, 'office-word-size.png', '中文字号'); await esc(w); await w.mouse.click(5, 500); await settle(w, 500);
    await w.locator('.dc-outline-tab').click().catch(() => {}); await settle(w, 1500);
    await snap(w, 'office-word-outline.png', '大纲导航');
    await wd.ctx.close(); await kit.close(wd.id).catch(() => {}); // at most two sessions may be open

    // ---------- PowerPoint ----------
    const ppt = await editor('2027 产品规划', 'pptx', DECK);
    const q = ppt.page;
    await settle(q, 4000);
    await snap(q, 'office-ppt.png', 'PPT 编辑器：开始页签、缩略图栏、备注、状态栏缩放');
    for (const [tab, file, note] of [['insert', 'office-ppt-insert.png', '插入页签'], ['beautify', 'office-ppt-beautify.png', '美化页签']]) {
      const t = q.locator(`#wb-tab-list [data-tab="${tab}"]`);
      if (await t.count()) { await t.click(); await settle(q, 1200); await snap(q, file, note); }
    }
    await q.locator('#wb-rail-list > *').nth(2).click().catch(() => {}); await settle(q, 2500);
    const home = q.locator('#wb-tab-list [data-tab="home"]'); if (await home.count()) await home.click();
    await settle(q, 1000);
    await snap(q, 'office-ppt-slide3.png', '流程版式页');
    await ppt.ctx.close(); await kit.close(ppt.id).catch(() => {}); // at most two sessions may be open
  } finally {
    console.log('SHOTS ' + JSON.stringify({outDir, shots, errors}, null, 1));
    await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r));
    await kit.shutdown(); await rm(dir, {recursive: true, force: true});
  }
}
main().catch(e => { console.error(e); process.exit(1); });
