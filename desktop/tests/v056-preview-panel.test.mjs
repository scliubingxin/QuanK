import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
import {readFile} from 'node:fs/promises';
import {documentCards} from '../src/ui/documents.js';
import {documentTab, openTab, closeTab, restoreTabs, panelHead} from '../src/ui/page-panel.js';
import {filePreviewPanel, previewStatus} from '../src/ui/office-preview.js';

const action = (label, name) => `<button data-action="${name}">${label}</button>`;
const doc = {id:'word', name:'季度研报', format:'docx', size:9000, revision:2};

test('file cards group existing operations into the menu and expose both open controls', () => {
  const html = documentCards([doc, {...doc, id:'deck', format:'pptx'}], action, true, true, 'chat');
  assert.match(html, /季度研报\.docx/);
  assert.match(html, /8\.8 KB · v2/);
  for (const label of ['预览', 'QuanK Office 编辑', '导出 PDF', '下载', '在成果中心查看']) {
    assert.ok(html.match(/<details class="file-menu">[\s\S]*?<\/details>/)[0].includes(label));
  }
  assert.match(html, /在右侧打开/);
  assert.match(html, /查看所有产物（2）›/);
});

test('reopening a document focuses a single closable right tab across restore', () => {
  const tab = documentTab(doc.id, doc.name, doc.format);
  const other = documentTab('other', '另一个文件', 'pdf');
  const result = openTab([tab, other], tab);
  assert.equal(result.tabs.length, 2);
  assert.equal(result.active, tab.id);
  const stored = restoreTabs(JSON.stringify(result));
  assert.deepEqual(stored.tabs, [tab, other]);
  assert.match(panelHead({...stored}), /关闭 季度研报/);
  assert.equal(closeTab(stored.tabs, tab.id, tab.id).active, other.id);
});

test('status shows format-specific counts and verified zoom', () => {
  assert.deepEqual(previewStatus({current:2, pages:5, zoom:59}), {pages:'第 2 页 / 共 5 页', zoom:'59%'});
  assert.equal(previewStatus({current:2, pages:5, format:'pptx'}).pages, '第 2 张 / 共 5 张');
  assert.equal(previewStatus({current:3, pages:5, format:'xlsx', sheet:2, sheets:3}).pages, '工作表 2 / 3');
  assert.equal(previewStatus({current:3, pages:5, format:'xlsx', sheets:3}).pages, '');
  assert.deepEqual(previewStatus({current:2, pages:1, zoom:201}), {pages:'', zoom:''});
});

test('preview renders a collapsed outline and document-specific tools', () => {
  const html = filePreviewPanel(doc, {action, icon: name => name === 'fileDown' ? '<svg><path d="M12 4v12m-4-4 4 4 4-4"/></svg>' : '', native:true});
  assert.equal([...html.matchAll(/data-outline aria-expanded="false"/g)].length, 2);
  assert.match(html, /class="file-outline" aria-label="大纲" data-format="docx" hidden/);
  assert.match(html, /class="graph-search"><svg[\s\S]*?<input[^>]+aria-label="搜索文字"/);
  assert.match(html, /data-action="documentExportPdf"[^>]+title="导出 PDF"[^>]*><svg><path/);
  assert.match(html, /<details class="file-menu">[\s\S]*?下载[\s\S]*?<\/details>/);
  for (const label of ['适合宽度', '适合页面', '上一页', '下一页', '版本历史']) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /撤销|格式刷/);
});

test('narrow panel compacts the header and count using its own width', async () => {
  const css = await readFile(new URL('../src/workbench.css', import.meta.url), 'utf8');
  assert.match(css, /@container qkzone \(max-width: 740px\)\s*\{\s*\.file-preview-head \.file-edit-label,\[data-word-count\]\s*\{\s*display:none/);
});

const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('PDF frame reports scroll and zoom, and the outline and narrow controls respond', {
  skip: !existsSync(chromePath), timeout: 30000,
}, async () => {
  const browser = await chromium.launch({executablePath: chromePath});
  const fixture = await browser.newPage();
  await fixture.setContent('<h1>Quarterly report</h1><p style="break-before: page">Second page</p>');
  const pdf = await fixture.pdf();
  await fixture.close();

  const paths = {
    '/ui/office-preview.js': ['text/javascript', 'ui/office-preview.js'],
    '/ui/markdown.js': ['text/javascript', 'ui/markdown.js'],
    '/workbench.css': ['text/css', 'workbench.css'],
    '/pdf/index.html': ['text/html', 'pdf/index.html'],
    '/pdf/engine.js': ['text/javascript', 'pdf/engine.js'],
  };
  const server = createServer(async (req, res) => {
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<link rel="stylesheet" href="/workbench.css"><div class="pp-body" style="height:740px;width:900px;padding:0"></div>');
      return;
    }
    const asset = paths[req.url] || (/^\/(?:ui|shared|vendor)\/[a-z-]+\.js$/.test(req.url) ? ['text/javascript', req.url.slice(1)] : null);
    if (!asset) { res.writeHead(404).end(); return; }
    try {
      const body = await readFile(new URL('../src/' + asset[1], import.meta.url));
      res.setHeader('Content-Type', asset[0]);
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const page = await browser.newPage({viewport:{width:1100,height:820}});
    page.setDefaultTimeout(5000);
    await page.goto('http://127.0.0.1:' + server.address().port);
    const mount = (fixture, sourceFormat, extra) => page.evaluate(async ({buffer, fixture, sourceFormat, extra}) => {
      const {filePreviewPanel, mountFilePreviewPanel} = await import('/ui/office-preview.js');
      const body = document.querySelector('.pp-body');
      body.innerHTML = filePreviewPanel(fixture, {native:true, workspace:true, icon:() => '',
        action: label => '<button>' + label + '</button>'});
      window.disposePreview?.();
      window.disposePreview = mountFilePreviewPanel(body, async () => ({format:'pdf', base64:buffer, sourceFormat, ...extra}));
    }, {buffer:pdf.toString('base64'), fixture, sourceFormat, extra});
    const headings = [{title:'Quarterly report',level:1}, {title:'Second page',level:2}];
    await mount(doc, 'docx', {wordCount:123, headings});
    await page.getByText('第 1 页 / 共 2 页', {exact:true}).waitFor();
    await page.getByText('123 字', {exact:true}).waitFor();
    const outline = page.locator('.file-outline');
    assert.equal(await outline.isVisible(), false);
    await page.locator('.file-outline-handle').click();
    const firstHeading = outline.getByText('Quarterly report');
    const secondHeading = outline.getByText('Second page');
    assert.ok(await firstHeading.isVisible());
    assert.equal(await firstHeading.evaluate(el => getComputedStyle(el).borderTopWidth), '0px');
    assert.ok(await secondHeading.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft)) >
      await firstHeading.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft)));
    assert.equal(await firstHeading.getAttribute('aria-current'), 'location');
    await page.getByRole('button', {name:'下一页', exact:true}).click();
    await page.getByText('第 2 页 / 共 2 页', {exact:true}).waitFor();
    assert.equal(await secondHeading.getAttribute('aria-current'), 'location');
    await mount(doc, 'docx', {wordCount:123, headings});
    await outline.getByText('Quarterly report').waitFor();
    const zoom = await page.locator('[data-preview-zoom]').textContent();
    await page.getByRole('button', {name:'放大', exact:true}).click();
    await page.waitForFunction(zoom => document.querySelector('[data-preview-zoom]').textContent !== zoom, zoom);
    await page.locator('.pp-body').evaluate(el => { el.style.width = '600px'; });
    assert.equal(await page.locator('[data-word-count]').isVisible(), false);
    assert.equal(await page.locator('.file-edit-label').isVisible(), false);
    const search = page.getByRole('searchbox', {name:'搜索文字'});
    assert.equal(await search.isVisible(), false);
    await page.getByRole('button', {name:'搜索文字'}).click();
    assert.ok(await search.isVisible());
    await search.fill('Second page');
    await search.press('Enter');
    // Search centers the match, while the status uses a reading anchor near the top.
    const frame = await (await page.locator('.office-frame').elementHandle()).contentFrame();
    await frame.waitForFunction(() => {
      const rect = document.querySelector('section:nth-of-type(2) .pdf-highlight')?.getBoundingClientRect();
      return rect && rect.top >= 0 && rect.bottom <= innerHeight;
    });
    await search.press('Escape');
    assert.equal(await search.isVisible(), false);

    await mount({...doc, format:'pptx'}, 'pptx', {});
    await page.getByText('第 1 张 / 共 2 张', {exact:true}).waitFor();
    const card = outline.getByRole('button', {name:'幻灯片 1'});
    const image = card.locator('img');
    await outline.locator('[aria-current="location"]').filter({hasText:'幻灯片 1'}).waitFor();
    await image.evaluate(el => el.decode());
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({colorScheme});
      assert.equal(await card.getAttribute('aria-current'), 'location');
      assert.deepEqual(await image.evaluate(el => {
        const style = getComputedStyle(el);
        return [style.backgroundColor, style.borderTopWidth, style.boxShadow !== 'none',
          Math.abs(el.getBoundingClientRect().height / el.getBoundingClientRect().width -
            el.naturalHeight / el.naturalWidth) < 0.02];
      }), ['rgb(255, 255, 255)', '1px', true, true]);
    }
    await outline.getByRole('button', {name:'幻灯片 2'}).click();
    await page.getByText('第 2 张 / 共 2 张', {exact:true}).waitFor();
    await page.locator('.file-preview-status [data-outline]').click();
    await mount({...doc, format:'xlsx'}, 'xlsx', {sheets:['Budget', 'Charts']});
    await page.getByText('工作表 1 / 2', {exact:true}).waitFor();
    assert.equal(await outline.isVisible(), false);
    await page.getByRole('button', {name:'下一页', exact:true}).click();
    await page.getByText('工作表 2 / 2', {exact:true}).waitFor();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
