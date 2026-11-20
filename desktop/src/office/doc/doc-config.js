// [docx] Word toolbar and menus (Tencent Docs / WPS style single row) + pure state mapping.
// Action descriptors: {uno, args} | {legacy} | {op, ...payload} | {ui: 'name', ...}; soon: greyed with「即将支持」.
import {STYLE_CHOICES, CN_SIZES, NUM_SIZES, sizeLabel, styleLabel} from '../../shared/office-doc.js';
import {SEP} from './popkit.js';
import {displayFontName} from '../../shared/office-uno.js'; // [ux7]

export const FONTS = ['微软雅黑', '宋体', '黑体', '楷体', '仿宋', '苹方-简', '华文黑体', '冬青黑体简体中文', 'Arial', 'Calibri', 'Times New Roman', 'Helvetica', 'Courier New'];
export const SIZE_OPTIONS = [...CN_SIZES.slice(0, 12).map(([label, pt]) => ({label, pt})), ...NUM_SIZES.map(pt => ({label: String(pt), pt}))];

const it = (id, label, icon, o = {}) => ({id, label, icon, kind: 'button', ...o});
const soon = (id, label, icon, o = {}) => it(id, label, icon, {soon: true, ...o});
const uno = (id, label, icon, command, o = {}) => it(id, label, icon, {do: {uno: command, ...(o.args ? {args: o.args} : {})}, ...o});
const ui = (id, label, icon, name, o = {}) => it(id, label, icon, {do: {ui: name, ...(o.p || {})}, ...o});
const sub = (id, label, icon, menu, o = {}) => ({id, label, icon, kind: 'menu', menu, ...o});

export const STYLE_MENU = [
  ...STYLE_CHOICES.map(([name, label, preview]) => it('style-' + name.replace(/\s/g, ''), label, null, {do: {uno: '.uno:StyleApply', args: {Style: name, FamilyName: 'ParagraphStyles'}}, preview, check: ['style', label]})),
  SEP, soon('style-more', '显示更多样式', null),
];
export const BREAK_MENU = [uno('ins-pagebreak', '分页符', null, '.uno:InsertPagebreak'), uno('ins-colbreak', '分栏符', null, '.uno:InsertColumnBreak')];
export const NOTE_MENU = [uno('ins-footnote', '插入脚注', null, '.uno:InsertFootnote'), uno('ins-endnote', '插入尾注', null, '.uno:InsertEndnote')];
export const PAGENUM_MENU = [uno('ins-pagenum', '插入页码', null, '.uno:InsertPageNumberField'), uno('ins-pagecount', '插入总页数', null, '.uno:InsertPageCountField')];
const hf = (id, label, command) => uno(id, label, null, command, {args: {PageStyle: 'Default Page Style', On: true}});
export const HEADER_MENU = [hf('ins-header', '插入页眉', '.uno:InsertPageHeader'), hf('ins-footer', '插入页脚', '.uno:InsertPageFooter')];
export const INSERT_MENU = [
  ui('ins-image', '图片', 'image', 'pickImage'),
  {id: 'ins-shapes', label: '形状', icon: 'shapes', kind: 'menu', panel: 'shapes'},
  {id: 'ins-table', label: '表格', icon: 'table', kind: 'menu', panel: 'table'},
  sub('ins-textbox', '文本框', 'text-box', [uno('ins-textbox-h', '横向文本框', null, '.uno:Text'), soon('ins-textbox-v', '竖向文本框', null)]),
  soon('ins-link', '链接', 'link', {hint: '⌘+K'}), // external links are refused by the document safety policy
  ui('ins-bookmark', '书签', 'names', 'bookmark'),
  soon('ins-formula', '公式', 'fx'),
  {id: 'ins-symbol', label: '符号', icon: 'special', kind: 'menu', panel: 'symbols'},
  ui('ins-comment', '批注', 'edit', 'comment', {hint: '⌘+⌥+M'}),
  SEP,
  soon('ins-rule', '分隔线', 'line-style'),
  sub('ins-headerfooter', '页眉页脚', 'fn-box', HEADER_MENU),
  sub('ins-break', '分隔符', 'merge-split', BREAK_MENU),
  soon('ins-toc', '目录', 'text-fn'),
  sub('ins-notes', '尾注脚注', 'text-fn', NOTE_MENU),
  soon('ins-caption', '题注', 'edit'),
  sub('ins-pagenum', '页码', 'calc', PAGENUM_MENU),
];
const zoomItems = [50, 75, 100, 125, 150, 200].map(n => ui('view-zoom-' + n, n + '%', null, 'zoom', {p: {percent: n}}));
export const PAGE_MENU = [
  ui('page-outline', '显示大纲', null, 'outline', {check: ['outline', true]}),
  soon('page-ruler', '显示标尺', null), soon('page-comments', '显示批注', null),
  ui('page-fullscreen', '全屏模式', null, 'fullscreen', {hint: '^+⌘+F'}),
  soon('page-bookmarks', '查看全部书签', null),
  SEP,
  soon('page-setup', '页面设置', null, {hint: '方向/大小/尺寸'}), soon('page-columns', '分栏', null),
  sub('page-number', '页码', null, PAGENUM_MENU), sub('page-hf', '页眉页脚', null, HEADER_MENU),
];
export const REF_MENU = [
  soon('ref-toc', '目录', 'text-fn'), SEP,
  uno('ref-footnote', '插入脚注', null, '.uno:InsertFootnote'), uno('ref-endnote', '插入尾注', null, '.uno:InsertEndnote'), soon('ref-caption', '题注', 'edit'),
  SEP, sub('ref-goto', '定位到脚注尾注', null, [soon('goto-prev-fn', '上一条脚注', null), soon('goto-next-fn', '下一条脚注', null), soon('goto-prev-en', '上一条尾注', null), soon('goto-next-en', '下一条尾注', null)]),
];
export const VIEW_MENU = [
  ui('view-fullscreen', '全屏模式', null, 'fullscreen', {hint: '^+⌘+F'}),
  ui('view-web', 'Web 版式', null, 'layout', {p: {web: true}, check: ['web', true]}),
  soon('view-continuous', '连页视图', null),
  ui('view-print', '分页视图', null, 'layout', {p: {web: false}, check: ['web', false]}),
  ui('view-outline', '显示大纲', null, 'outline', {check: ['outline', true]}),
  SEP, sub('view-zoom', '显示比例', null, zoomItems), ui('view-100', '显示 100%', null, 'zoom', {p: {percent: 100}}),
  SEP, soon('view-present', '开始演示', null), SEP, soon('view-invert', '智能反色', null),
];
export const MAIN_MENU = [sub('menu-insert', '插入', null, INSERT_MENU), sub('menu-page', '页面', null, PAGE_MENU), sub('menu-ref', '引用', null, REF_MENU), sub('menu-view', '视图', null, VIEW_MENU)];

export const UNDERLINE_MENU = [it('u-single', '下划线', 'underline', {do: {legacy: '.uno:Underline'}, state: 'underline'}), uno('u-double', '双下划线', 'underline', '.uno:UnderlineDouble')];
export const MORE_ROW = {id: 'more-row', kind: 'iconrow', items: [
  uno('strike', '删除线', 'strike', '.uno:Strikeout', {state: 'strike'}),
  {id: 'script', label: '上标 / 下标', icon: 'superscript', kind: 'menu', menu: [uno('sup', '上标', 'superscript', '.uno:SuperScript', {state: 'superscript'}), uno('sub', '下标', 'subscript', '.uno:SubScript', {state: 'subscript'})]},
  soon('char-spacing', '字符间距', 'char-spacing'),
  soon('circled', '带圈字符', 'compat'),
  soon('phonetic', '拼音指南', 'text-fn'),
]};
export const ALIGN_MENU = [
  uno('al-left', '左对齐', 'align-left', '.uno:LeftPara', {check: ['align', 'left']}),
  uno('al-center', '居中对齐', 'align-center', '.uno:CenterPara', {check: ['align', 'center']}),
  uno('al-right', '右对齐', 'align-right', '.uno:RightPara', {check: ['align', 'right']}),
  uno('al-justify', '两端对齐', 'align-justify', '.uno:JustifyPara', {check: ['align', 'justify']}),
];
export const SPACING_MENU = [
  uno('ls-1', '1.0 倍', null, '.uno:SpacePara1', {check: ['spacing', '1']}), uno('ls-15', '1.5 倍', null, '.uno:SpacePara15', {check: ['spacing', '1.5']}), uno('ls-2', '2.0 倍', null, '.uno:SpacePara2', {check: ['spacing', '2']}),
  SEP, uno('ps-inc', '增加段落间距', null, '.uno:ParaspaceIncrease'), uno('ps-dec', '减少段落间距', null, '.uno:ParaspaceDecrease'),
];

/** Toolbar, left to right; prio: higher collapses into「更多」first on narrow windows. */
export const TOOLBAR = [
  {id: 'menu', label: '菜单', icon: 'menu', kind: 'menu', showLabel: true, menu: MAIN_MENU, prio: 0},
  SEP,
  it('undo', '撤销 (⌘Z)', 'undo', {do: {legacy: '.uno:Undo'}, when: 'undo', prio: 0}),
  it('redo', '重做 (⌘⇧Z)', 'redo', {do: {legacy: '.uno:Redo'}, when: 'redo', prio: 0}),
  uno('painter', '格式刷', 'format-painter', '.uno:FormatPaintbrush', {prio: 1}),
  uno('clear-format', '清除格式', 'eraser', '.uno:ResetAttributes', {prio: 1}),
  SEP,
  {id: 'insert', label: '插入', icon: 'insert-circle', kind: 'menu', showLabel: true, menu: INSERT_MENU, prio: 0},
  SEP,
  {id: 'style', label: '样式', kind: 'select', menu: STYLE_MENU, width: 78, state: 'styleLabel', placeholder: '正文', prio: 2},
  {id: 'font-name', label: '字体', kind: 'select', options: FONTS, width: 150, state: 'font', placeholder: '默认字体', prio: 2},
  {id: 'font-size', label: '字号', kind: 'select', options: SIZE_OPTIONS, width: 60, state: 'sizeLabel', placeholder: '五号', prio: 2},
  uno('grow', '增大字号', 'font-grow', '.uno:Grow', {prio: 3}),
  uno('shrink', '减小字号', 'font-shrink', '.uno:Shrink', {prio: 3}),
  SEP,
  it('bold', '加粗 (⌘B)', 'bold', {do: {legacy: '.uno:Bold'}, state: 'bold', prio: 0}),
  it('italic', '斜体 (⌘I)', 'italic', {do: {legacy: '.uno:Italic'}, state: 'italic', prio: 1}),
  {id: 'underline', label: '下划线 (⌘U)', icon: 'underline', kind: 'split', do: {legacy: '.uno:Underline'}, state: 'underline', menu: UNDERLINE_MENU, prio: 1},
  {id: 'highlight', label: '高亮颜色', icon: 'highlight', kind: 'color', command: '.uno:CharBackColor', argKey: 'CharBackColor', initial: '#FFEB3B', none: true, prio: 1},
  {id: 'font-color', label: '字体颜色', icon: 'font-color', kind: 'color', command: '.uno:Color', argKey: 'Color', initial: '#E53935', prio: 1},
  {id: 'more-text', label: '更多文字格式', icon: 'more', kind: 'menu', showLabel: true, text: '更多', menu: [MORE_ROW], prio: 2},
  SEP,
  {id: 'bullets', label: '项目符号', icon: 'bullets', kind: 'split', do: {uno: '.uno:DefaultBullet'}, state: 'bullet', menu: [uno('bullets-default', '圆点项目符号', 'bullets', '.uno:DefaultBullet', {state: 'bullet'})], prio: 2},
  {id: 'numbering', label: '编号', icon: 'numbering', kind: 'split', do: {uno: '.uno:DefaultNumbering'}, state: 'numbering', menu: [uno('numbering-default', '数字编号', 'numbering', '.uno:DefaultNumbering', {state: 'numbering'})], prio: 2},
  soon('tasklist', '任务列表', 'validate', {prio: 3}),
  uno('indent-less', '减少缩进', 'indent-less', '.uno:DecrementIndent', {prio: 3}),
  uno('indent-more', '增加缩进', 'indent-more', '.uno:IncrementIndent', {prio: 3}),
  {id: 'align', label: '对齐方式', icon: 'align-left', kind: 'menu', menu: ALIGN_MENU, prio: 2},
  {id: 'spacing', label: '行距与段落间距', icon: 'line-spacing', kind: 'menu', menu: SPACING_MENU, prio: 3},
  ui('para', '段落设置', 'text-to-cols', 'paragraph', {prio: 3}),
  SEP,
  soon('print', '打印', 'print', {showLabel: true, prio: 3}),
];

// ---- pure state mapping (unit tested) ----
const truthy = v => v === 'true';
export function mapDocStates(states = {}) {
  const s = states && typeof states === 'object' ? states : {};
  const h = parseFloat(s['.uno:FontHeight']);
  const align = truthy(s['.uno:CenterPara']) ? 'center' : truthy(s['.uno:RightPara']) ? 'right' : truthy(s['.uno:JustifyPara']) ? 'justify' : 'left';
  const spacing = truthy(s['.uno:SpacePara15']) ? '1.5' : truthy(s['.uno:SpacePara2']) ? '2' : truthy(s['.uno:SpacePara1']) ? '1' : '';
  const size = Number.isFinite(h) && h > 0 ? Math.round(h * 10) / 10 : null;
  return {
    bold: truthy(s['.uno:Bold']), italic: truthy(s['.uno:Italic']), underline: truthy(s['.uno:Underline']), strike: truthy(s['.uno:Strikeout']),
    superscript: truthy(s['.uno:SuperScript']), subscript: truthy(s['.uno:SubScript']),
    bullet: truthy(s['.uno:DefaultBullet']), numbering: truthy(s['.uno:DefaultNumbering']),
    align, spacing, web: truthy(s['.uno:BrowseView']),
    font: typeof s['.uno:CharFontName'] === 'string' ? displayFontName(s['.uno:CharFontName']) : '',
    size, sizeLabel: size ? sizeLabel(size) : '',
    style: styleLabel(s['.uno:StyleApply']), styleLabel: styleLabel(s['.uno:StyleApply']),
  };
}
export const ALIGN_ICON = {left: 'align-left', center: 'align-center', right: 'align-right', justify: 'align-justify'};
export function allDocItems() {
  const out = [], seen = new Set();
  const walk = x => { if (!x || x === SEP || seen.has(x)) return; seen.add(x); out.push(x); (Array.isArray(x.menu) ? x.menu : []).forEach(walk); (x.items || []).forEach(walk); };
  TOOLBAR.forEach(walk);
  return out;
}
