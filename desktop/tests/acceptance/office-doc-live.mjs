import {startLiveOfficeKit} from '../helpers/office-live-ui.mjs';
// [docx] Live check of the Word editor operations against the real bundled document engine (Writer).
// Run: WB_TEST_PYTHON=<python3> WB_TEST_OFFICE_DIRECTORY=<engine program dir> node --test tests/acceptance/office-doc-live.mjs
// Every check is recorded; prints DOC-LIVE {json} and fails if any check failed.
import {officeDirectory, officePython} from '../helpers/office-kit-runtime.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import office from '../../runtime/vendor/office.cjs';
import {Store} from '../../core.mjs';
import {generateDocument} from '../../runtime/documents.mjs';
import {createDocumentService} from '../../services/documents.mjs';
import {createOfficeWorkspace} from '../../services/office-workspace.mjs';
import {allDocItems, mapDocStates} from '../../src/office/doc/doc-config.js';
import {parsePageRects, parseWordCount} from '../../src/shared/office-doc.js';

test('real DOCX: typing, styles, fonts, lists, inserts, links, comments, outline, page info', {timeout: 120000}, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-doc-live-')), store = new Store(dir); await store.load();
  const documents = createDocumentService({store});
  const blocks = [{type: 'heading', text: '一、登录系统'}, {type: 'paragraph', text: '通过链接登录 XXX，点击以你名字命名的专业知识库。'}, {type: 'heading', text: '二、添加数据集'}, {type: 'paragraph', text: '点击添加数据集-手动数据集。'}];
  const d = (await documents.importFile('Doc live', 'docx', (await generateDocument('docx', JSON.stringify({blocks}))).bytes)).document;
  const kit = createOfficeWorkspace({documents, directory: path.join(dir, 'kit'), runtime: async () => ({python: officePython, officeDirectory}), approve: async () => true, driver: o => startLiveOfficeKit({...o, timeoutMs: 120000})});
  const results = [];
  const check = async (name, fn) => { const t = Date.now(); try { const detail = await fn(); results.push({name, ok: true, ms: Date.now() - t, detail: detail ?? ''}); } catch (e) { results.push({name, ok: false, ms: Date.now() - t, error: String(e.message || e).slice(0, 300)}); } };
  const plain = () => [...xml().matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
  const xml = () => new TextDecoder().decode(office.zip.unzipSync(documents.bytes(d.id, documents.read(d.id).revision).bytes)['word/document.xml'] || new Uint8Array());
  try {
    const id = (await kit.open(d.id, 1)).sessionId;
    const shot = () => kit.snapshot(id, {width: 600, height: 600, x: 0, y: 0, tileWidth: 12240, tileHeight: 12240});
    const op = (o, p) => kit.operation(id, o, p);
    const uno = (command, args) => op('uno', args ? {command, args} : {command});
    const home = () => op('sheet_key', {key: 'Home', control: true});
    const selectLine = async () => { await op('sheet_key', {key: 'Home'}); await op('sheet_key', {key: 'End', shift: true}); };

    await check('snapshot carries page rectangles and word count', async () => {
      const s = await shot(); const rects = parsePageRects(s.doc?.pageRects);
      assert.ok(rects.length >= 1, 'pageRects ' + s.doc?.pageRects);
      return {pages: rects.length, words: s.states?.['.uno:StateWordCount'] || ''};
    });
    await check('typing (incl. Chinese) reaches the document and is saved', async () => {
      await home(); const r0 = documents.read(d.id).revision;
      await op('sheet_text', {text: '前言：QuankSight 文档'}); await op('sheet_key', {key: 'Enter'});
      assert.ok(documents.read(d.id).revision > r0, 'new revision'); assert.ok(plain().includes('前言：QuankSight 文档'), 'text saved');
      const wc = parseWordCount((await shot()).states?.['.uno:StateWordCount']); return wc || '';
    });
    await check('paragraph styles: 标题 1 / 标题 / 正文', async () => {
      await home(); await uno('.uno:StyleApply', {Style: 'Heading 1', FamilyName: 'ParagraphStyles'});
      const s = mapDocStates((await shot()).states); assert.ok(/Heading1|Heading 1/.test(xml()) , 'Heading1 in xml');
      await uno('.uno:StyleApply', {Style: 'Title', FamilyName: 'ParagraphStyles'}); assert.ok(/w:val="Title"/.test(xml()), 'Title in xml');
      await uno('.uno:StyleApply', {Style: 'Standard', FamilyName: 'ParagraphStyles'});
      return {label: s.styleLabel};
    });
    await check('font name / size / bold / colors on a selection', async () => {
      await home(); await selectLine();
      await uno('.uno:CharFontName', {'CharFontName.FamilyName': 'Arial'}); await uno('.uno:FontHeight', {'FontHeight.Height': 16});
      await op('command', {command: '.uno:Bold'}); await uno('.uno:Color', {Color: 0xE53935}); await uno('.uno:CharBackColor', {CharBackColor: 0xFFEB3B});
      const x = xml(); assert.ok(x.includes('Arial'), 'font'); assert.ok(x.includes('w:sz w:val="32"'), 'size 16pt'); assert.ok(/<w:b\/>|<w:b w:val="true"\/>/.test(x), 'bold'); assert.ok(/E53935/i.test(x), 'color');
      const s = mapDocStates((await shot()).states); return {font: s.font, size: s.sizeLabel, bold: s.bold};
    });
    await check('grow/shrink, strike, superscript, underline double, clear format', async () => {
      await home(); await selectLine();
      for (const c of ['.uno:Grow', '.uno:Shrink', '.uno:Strikeout', '.uno:UnderlineDouble']) await uno(c);
      const x = xml(); assert.ok(x.includes('<w:strike'), 'strike'); assert.ok(x.includes('w:val="double"'), 'double underline');
      await uno('.uno:ResetAttributes'); assert.ok(!xml().includes('w:val="double"'), 'cleared');
    });
    await check('alignment, spacing, indent, bullets and numbering', async () => {
      await home(); await op('sheet_key', {key: 'ArrowDown'});
      await uno('.uno:CenterPara'); assert.ok(mapDocStates((await shot()).states).align === 'center' || xml().includes('w:val="center"'), 'centered');
      await uno('.uno:SpacePara15'); await uno('.uno:IncrementIndent'); await uno('.uno:DecrementIndent');
      await uno('.uno:DefaultBullet'); assert.ok(xml().includes('<w:numPr>'), 'bullet list'); await uno('.uno:DefaultBullet');
      await uno('.uno:DefaultNumbering'); assert.ok(xml().includes('<w:numPr>'), 'numbering'); await uno('.uno:LeftPara');
    });
    await check('insert table / page break', async () => {
      await op('sheet_key', {key: 'End', control: true});
      await uno('.uno:InsertTable', {Columns: 3, Rows: 2}); assert.ok(xml().includes('<w:tbl>'), 'table');
      await op('sheet_key', {key: 'End', control: true});
      await uno('.uno:InsertPagebreak'); assert.ok(xml().includes('w:type="page"'), 'page break');
      return {pages: parsePageRects((await shot()).doc?.pageRects).length};
    });
    await check('bookmark, comment, page number', async () => {
      await home(); await op('sheet_key', {key: 'End'});
      await uno('.uno:InsertBookmark', {Bookmark: 'bm_live'});
      await uno('.uno:InsertAnnotation', {Text: '请复核'});
      await uno('.uno:InsertPageNumberField');
      const x = xml(); assert.ok(x.includes('bm_live'), 'bookmark'); assert.ok(x.includes('commentReference'), 'comment');
      assert.ok(/PAGE/.test(x), 'page field');
    });
    await check('header/footer and web layout toggle', async () => {
      await uno('.uno:InsertPageHeader', {PageStyle: 'Default Page Style', On: true});
      await uno('.uno:InsertPageFooter', {PageStyle: 'Default Page Style', On: true});
      const names = Object.keys(office.zip.unzipSync(documents.bytes(d.id, documents.read(d.id).revision).bytes));
      assert.ok(names.some(n => /word\/header\d*\.xml/.test(n)), 'header part ' + names.filter(n => n.startsWith('word/')).join(','));
      await uno('.uno:BrowseView'); const web = mapDocStates((await shot()).states).web; await uno('.uno:BrowseView');
      return {web};
    });
    await check('footnote (runs last among inserts: the cursor stays inside the note)', async () => {
      await op('sheet_key', {key: 'End', control: true});
      await uno('.uno:InsertFootnote'); await op('sheet_text', {text: '脚注内容'});
      assert.ok(xml().includes('footnoteReference'), 'footnote');
    });
    await check('undo/redo and find', async () => {
      await op('command', {command: '.uno:Undo'}); await op('command', {command: '.uno:Redo'});
      await home(); await uno('.uno:ExecuteSearch', {'SearchItem.SearchString': '数据集', 'SearchItem.Backward': false, 'SearchItem.Command': 0});
      const s = await shot(); assert.ok(String(s.selection || '').includes('数据集'), 'found: ' + s.selection);
    });
    await check('outline lists headings from the saved document', async () => {
      const o = await kit.outline(id); assert.ok(o.items.some(i => i.text.includes('添加数据集')), JSON.stringify(o.items));
      return o.items.slice(0, 6);
    });
    await check('dialog-only commands are blocked before reaching the engine', async () => {
      for (const c of ['.uno:ParagraphDialog', '.uno:FontDialog', '.uno:PageDialog', '.uno:InsertSymbol', '.uno:SetHyperlink', '.uno:HyperlinkDialog']) await assert.rejects(uno(c), c);
    });
    await check('every enabled toolbar UNO command executes without hanging', async () => {
      const skip = new Set(['.uno:BrowseView', '.uno:FormatPaintbrush', '.uno:Text', '.uno:InsertPagebreak', '.uno:InsertColumnBreak', '.uno:InsertTable', '.uno:InsertAnnotation', '.uno:InsertBookmark', '.uno:InsertFootnote', '.uno:InsertEndnote']);
      const done = [];
      for (const item of allDocItems()) {
        const c = item.do?.uno; if (!c || item.soon || skip.has(c) || c.startsWith('.uno:BasicShapes') ) continue;
        await home(); await uno(c, item.do.args); done.push(c);
      }
      return {count: done.length};
    });
  } finally {
    await kit.shutdown().catch(() => {});
    console.log('DOC-LIVE ' + JSON.stringify({passed: results.filter(r => r.ok).length, total: results.length, results}, null, 1));
    await rm(dir, {recursive: true, force: true, maxRetries: 30, retryDelay: 100});
  }
  const failed = results.filter(r => !r.ok);
  assert.equal(failed.length, 0, failed.map(f => f.name + ': ' + f.error).join('\n'));
});
