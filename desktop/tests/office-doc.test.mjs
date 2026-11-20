// [docx] Word editor: pure helpers, toolbar configuration against the UNO whitelist, host gating, engine folder lookup.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {mkdtemp, rm, mkdir, writeFile, chmod, copyFile} from 'node:fs/promises';
import {sizeLabel, styleLabel, validateStyleName, parsePageState, parseWordCount, parsePageRects, pageAt, docxOutline, headingStyles, validateLink, validateBookmarkName, validateComment, STYLE_CHOICES} from '../src/shared/office-doc.js';
import {TOOLBAR, MAIN_MENU, allDocItems, mapDocStates} from '../src/office/doc/doc-config.js';
import {SEP} from '../src/office/doc/popkit.js';
import {UNO_COMMANDS, LEGACY_COMMANDS, validateUno} from '../src/shared/office-uno.js';
import {officeEngine, OFFICE_ENGINE_DIRS} from '../runtime/bundled-runtime.mjs';
import {Store} from '../core.mjs';
import {generateDocument} from '../runtime/documents.mjs';
import {createDocumentService} from '../services/documents.mjs';
import {createOfficeWorkspace} from '../services/office-workspace.mjs';

test('Chinese font sizes, style labels and status parsing', () => {
  assert.equal(sizeLabel(10.5), '五号'); assert.equal(sizeLabel(9), '小五'); assert.equal(sizeLabel(42), '初号'); assert.equal(sizeLabel(13), '13'); assert.equal(sizeLabel(''), '');
  assert.equal(styleLabel('Heading 1'), '标题 1'); assert.equal(styleLabel('Default Paragraph Style'), '正文'); assert.equal(styleLabel('Title'), '标题'); assert.equal(styleLabel(''), '');
  assert.equal(validateStyleName('Heading 2'), 'Heading 2'); assert.throws(() => validateStyleName('Evil'));
  assert.deepEqual(parsePageState('Page 1 of 2'), {page: 1, pages: 2}); assert.deepEqual(parsePageState('第 3 页，共 17 页'), {page: 3, pages: 17}); assert.equal(parsePageState(''), null);
  assert.deepEqual(parseWordCount('144 words, 169 characters'), {words: 144, characters: 169});
  assert.deepEqual(parseWordCount('Selected: 3 words, 9 characters; 1,430 words, 9,000 characters'), {words: 1430, characters: 9000});
  const rects = parsePageRects('284, 284, 12240, 15840; 284, 16408, 12240, 15840');
  assert.equal(rects.length, 2); assert.equal(pageAt(rects, 1000), 1); assert.equal(pageAt(rects, 17000), 2); assert.equal(pageAt([], 5), 1);
});
test('outline is extracted from headings, title and outline levels', () => {
  const styles = '<w:styles><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style><w:style w:type="paragraph" w:styleId="MyH"><w:name w:val="My heading"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style></w:styles>';
  assert.equal(headingStyles(styles).get('Heading2'), 1);
  const doc = '<w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>教程</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>一、登录</w:t></w:r><w:r><w:t xml:space="preserve"> XXX &amp; 系统</w:t></w:r></w:p><w:p><w:r><w:t>正文</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>步骤</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>步骤</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="MyH"/></w:pPr><w:r><w:t>细节</w:t></w:r></w:p><w:p/></w:body>';
  assert.deepEqual(docxOutline(doc, styles), [{level: 0, text: '教程', occurrence: 0}, {level: 1, text: '一、登录 XXX & 系统', occurrence: 0}, {level: 2, text: '步骤', occurrence: 0}, {level: 2, text: '步骤', occurrence: 1}, {level: 3, text: '细节', occurrence: 0}]);
});
test('dialog inputs are validated before they become UNO arguments', () => {
  assert.deepEqual(validateLink({text: '', url: 'https://example.com/a?b=1'}), {text: 'https://example.com/a?b=1', url: 'https://example.com/a?b=1'});
  for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'example.com', 'https://a b']) assert.throws(() => validateLink({url: bad}), bad);
  assert.equal(validateBookmarkName('第一章_1'), '第一章_1'); assert.throws(() => validateBookmarkName('a b')); assert.throws(() => validateBookmarkName(''));
  assert.equal(validateComment('第一行\n第二行'), '第一行 第二行'); assert.throws(() => validateComment('')); assert.throws(() => validateComment('x'.repeat(2001)));
});
test('every Word toolbar/menu command is whitelisted for docx with valid arguments', () => {
  const items = allDocItems();
  assert.ok(items.length > 70, String(items.length));
  for (const item of items) {
    const c = item.do?.uno; if (!c || LEGACY_COMMANDS.includes(c)) continue;
    assert.ok(Object.hasOwn(UNO_COMMANDS, c), 'not whitelisted: ' + c);
    assert.doesNotThrow(() => validateUno(c, item.do.args, {format: 'docx'}), c);
  }
  for (const [name] of STYLE_CHOICES) assert.doesNotThrow(() => validateUno('.uno:StyleApply', {Style: name, FamilyName: 'ParagraphStyles'}, {format: 'docx'}));
  assert.throws(() => validateUno('.uno:StyleApply', {Style: 'Heading 1', FamilyName: 'PageStyles'}, {format: 'docx'}));
  assert.ok(!Object.hasOwn(UNO_COMMANDS, '.uno:SetHyperlink'), 'external links would make the document unsaveable');
  assert.throws(() => validateUno('.uno:StyleApply', {Style: 'Heading 1', FamilyName: 'ParagraphStyles'}, {format: 'xlsx'}), /文档类型/);
  for (const c of ['.uno:InsertTable', '.uno:Text', '.uno:BasicShapes.rectangle', '.uno:Copy', '.uno:ExecuteSearch']) assert.ok(UNO_COMMANDS[c].formats.includes('docx'), c);
  assert.ok(!Object.hasOwn(UNO_COMMANDS, '.uno:ParagraphDialog') && !Object.hasOwn(UNO_COMMANDS, '.uno:FontDialog'), 'dialog commands hang the engine and must stay blocked');
});
test('toolbar order and menus follow the reference screenshots', () => {
  const ids = TOOLBAR.filter(i => i !== SEP).map(i => i.id);
  assert.deepEqual(ids.slice(0, 12), ['menu', 'undo', 'redo', 'painter', 'clear-format', 'insert', 'style', 'font-name', 'font-size', 'grow', 'shrink', 'bold']);
  assert.ok(ids.indexOf('highlight') < ids.indexOf('font-color') && ids.indexOf('font-color') < ids.indexOf('more-text') && ids.indexOf('bullets') < ids.indexOf('para') && ids.at(-1) === 'print');
  assert.deepEqual(MAIN_MENU.map(m => m.label), ['插入', '页面', '引用', '视图']);
  const insert = MAIN_MENU[0].menu.filter(i => i !== SEP).map(i => i.label);
  for (const l of ['图片', '形状', '表格', '文本框', '链接', '书签', '公式', '符号', '批注', '分隔线', '页眉页脚', '分隔符', '目录', '尾注脚注', '题注', '页码']) assert.ok(insert.includes(l), l);
  const s = mapDocStates({'.uno:Bold': 'true', '.uno:CenterPara': 'true', '.uno:FontHeight': '10.5', '.uno:StyleApply': 'Heading 2', '.uno:SpacePara15': 'true', '.uno:BrowseView': 'false'});
  assert.equal(s.bold, true); assert.equal(s.align, 'center'); assert.equal(s.sizeLabel, '五号'); assert.equal(s.styleLabel, '标题 2'); assert.equal(s.spacing, '1.5'); assert.equal(s.web, false);
});
test('Word typing reaches the engine; spreadsheet-only operations stay refused', async () => {
  const rq = [], dir = await mkdtemp(path.join(tmpdir(), 'wb-doc-')), store = new Store(dir); await store.load();
  const documents = createDocumentService({store});
  const d = (await documents.importFile('W', 'docx', (await generateDocument('docx', JSON.stringify({blocks: [{type: 'heading', text: '一、登录'}, {type: 'paragraph', text: 'hi'}]}))).bytes)).document;
  const kit = createOfficeWorkspace({documents, directory: path.join(dir, 'kit'), runtime: async () => ({python: 'x', officeDirectory: 'y'}), approve: async () => true,
    driver: async o => ({request: async (op, data) => { rq.push([op, data]); if (op === 'save') await copyFile(path.join(o.directory, 'document.' + o.format), path.join(o.directory, 'edited.' + o.format)); return op === 'sheet_text' ? {changed: true} : {}; }, close() {}})});
  try {
    const id = (await kit.open(d.id, 1)).sessionId;
    await kit.operation(id, 'sheet_text', {text: '你好'});
    await kit.operation(id, 'sheet_key', {key: 'Enter'});
    await kit.operation(id, 'uno', {command: '.uno:StyleApply', args: {Style: 'Heading 1', FamilyName: 'ParagraphStyles'}});
    assert.deepEqual(rq.filter(r => r[0].startsWith('sheet')).map(r => r[0]), ['sheet_text', 'sheet_key']);
    assert.ok(rq.some(r => r[0] === 'save'), 'typed text is saved');
    for (const [op, p] of [['cell_input', {text: 'x'}], ['sheet_goto', {ref: 'A1'}], ['sheet_tab', {action: 'insert', index: 0, name: 'x'}], ['uno', {command: '.uno:ParagraphDialog'}], ['uno', {command: '.uno:WrapText'}]]) await assert.rejects(kit.operation(id, op, p), op);
    const o = await kit.outline(id); assert.ok(Array.isArray(o.items));
  } finally { await kit.shutdown(); await rm(dir, {recursive: true, force: true}); }
});
test('bundled engine is looked up as a plain folder first, legacy .app second', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wb-engine-'));
  try {
    assert.deepEqual(OFFICE_ENGINE_DIRS, ['WillBuddyEngine', 'LibreOffice.app']);
    const make = async dir => { await mkdir(path.join(root, dir, 'Contents/MacOS'), {recursive: true}); const f = path.join(root, dir, 'Contents/MacOS/soffice'); await writeFile(f, ''); await chmod(f, 0o755); };
    await make('LibreOffice.app'); assert.equal(await officeEngine(root), 'LibreOffice.app/Contents/MacOS/soffice');
    await make('WillBuddyEngine'); assert.equal(await officeEngine(root), 'WillBuddyEngine/Contents/MacOS/soffice');
  } finally { await rm(root, {recursive: true, force: true}); }
});
