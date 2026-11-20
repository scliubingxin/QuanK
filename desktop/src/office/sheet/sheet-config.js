// [excel] Declarative spreadsheet toolbar (Tencent Docs / WPS style single row) and pure state mapping.
// Item fields: id, label, icon, kind: 'button'|'menu'|'split'|'select'|'color'|'border'|'numfmt'|'text',
//   do: action descriptor (see sheet-ui.js run()), menu: [items|'-'], state: key in mapSheetStates(), soon: greyed.
// Action descriptors: {uno, args} | {legacy} | {op, ...payload} | {fn: 'NAME'} | {ui: 'name', ...}.
import {colName} from '../../shared/office-sheet.js';
import {displayFontName} from '../../shared/office-uno.js'; // [ux7]

export const SOON = '即将支持';
export const FONTS = ['默认字体', '微软雅黑', '宋体', '黑体', '楷体', '仿宋', 'PingFang SC', 'Arial', 'Calibri', 'Times New Roman', 'Courier New'];
export const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 72];
export const THEME_COLORS = [
  ['#FFFFFF', '#000000', '#44546A', '#4472C4', '#00B0F0', '#2E9A5B', '#E53935', '#F57C00', '#FFC000', '#9C27B0'],
  ['#F2F2F2', '#7F7F7F', '#D6DCE4', '#D9E2F3', '#DDEBF7', '#E2EFDA', '#FCE4E4', '#FBE5D6', '#FFF2CC', '#EEDDF5'],
  ['#D9D9D9', '#595959', '#ADB9CA', '#B4C6E7', '#BDD7EE', '#C6E0B4', '#F8CBAD', '#F8CBAD', '#FFE699', '#DDB8EC'],
  ['#BFBFBF', '#3F3F3F', '#8497B0', '#8EA9DB', '#9BC2E6', '#A9D08E', '#F4B183', '#F4B183', '#FFD966', '#C792DE'],
  ['#A6A6A6', '#262626', '#333F4F', '#2F5597', '#2E75B6', '#548235', '#C00000', '#C55A11', '#BF8F00', '#7030A0'],
  ['#808080', '#0D0D0D', '#222A35', '#1F3864', '#1F4E78', '#375623', '#7F0000', '#843C0C', '#7F6000', '#4A1F6B'],
];
export const STANDARD_COLORS = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];

const it = (id, label, icon, o = {}) => ({id, label, icon, kind: 'button', ...o});
const soon = (id, label, icon, o = {}) => it(id, label, icon, {soon: true, ...o});
const uno = (id, label, icon, command, o = {}) => it(id, label, icon, {do: {uno: command, ...(o.args ? {args: o.args} : {})}, ...o});
const sub = (id, label, icon, menu, o = {}) => ({id, label, icon, kind: 'menu', menu, ...o});
export const SEP = '-';

// ---- shapes (LibreOffice custom shape commands; drawn by dragging on the grid) ----
export const SHAPES = [
  {group: '线条', items: [['line', '.uno:Line', '直线'], ['arrow', '.uno:LineArrowEnd', '箭头']]},
  {group: '矩形', items: [['rect', '.uno:BasicShapes.rectangle', '矩形'], ['round-rect', '.uno:BasicShapes.round-rectangle', '圆角矩形']]},
  {group: '基本形状', items: [['circle', '.uno:BasicShapes.circle', '圆形'], ['ellipse', '.uno:BasicShapes.ellipse', '椭圆'], ['tri', '.uno:BasicShapes.isosceles-triangle', '等腰三角形'],
    ['rtri', '.uno:BasicShapes.right-triangle', '直角三角形'], ['para', '.uno:BasicShapes.parallelogram', '平行四边形'], ['trap', '.uno:BasicShapes.trapezoid', '梯形'],
    ['diamond', '.uno:BasicShapes.diamond', '菱形'], ['pent', '.uno:BasicShapes.pentagon', '五边形'], ['hex', '.uno:BasicShapes.hexagon', '六边形'],
    ['oct', '.uno:BasicShapes.octagon', '八边形'], ['ring', '.uno:BasicShapes.ring', '圆环'], ['can', '.uno:BasicShapes.can', '圆柱'],
    ['cube', '.uno:BasicShapes.cube', '立方体'], ['frame', '.uno:BasicShapes.frame', '框架'], ['cross', '.uno:BasicShapes.cross', '十字形'],
    ['smiley', '.uno:SymbolShapes.smiley', '笑脸'], ['heart', '.uno:SymbolShapes.heart', '心形'], ['lightning', '.uno:SymbolShapes.lightning', '闪电'],
    ['sun', '.uno:SymbolShapes.sun', '太阳'], ['moon', '.uno:SymbolShapes.moon', '月亮'], ['cloud', '.uno:SymbolShapes.cloud', '云形'],
    ['brace-pair', '.uno:SymbolShapes.brace-pair', '双大括号'], ['bracket-pair', '.uno:SymbolShapes.bracket-pair', '双中括号'], ['star', '.uno:StarShapes.star5', '五角星']]},
  {group: '箭头总汇', items: [['right', '.uno:ArrowShapes.right-arrow', '右箭头'], ['left', '.uno:ArrowShapes.left-arrow', '左箭头'], ['up', '.uno:ArrowShapes.up-arrow', '上箭头'],
    ['down', '.uno:ArrowShapes.down-arrow', '下箭头'], ['lr', '.uno:ArrowShapes.left-right-arrow', '左右箭头'], ['ud', '.uno:ArrowShapes.up-down-arrow', '上下箭头'],
    ['four', '.uno:ArrowShapes.4-way-arrow', '十字箭头'], ['chevron', '.uno:ArrowShapes.chevron', 'V 形箭头'], ['pentagon', '.uno:ArrowShapes.pentagon-right', '五边形箭头']]},
];
export const SHAPE_COMMANDS = SHAPES.flatMap(g => g.items.map(i => i[1]));

// ---- functions (inserted into the active cell as "=NAME(") ----
export const FUNCTION_GROUPS = [
  ['常用函数', 'sum', ['SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN', 'IF', 'VLOOKUP', 'SUMIF', 'COUNTIF', 'ROUND']],
  ['财务', 'money', ['PMT', 'FV', 'PV', 'NPV', 'IRR', 'RATE', 'NPER', 'SLN']],
  ['日期与时间', 'calendar', ['TODAY', 'NOW', 'DATE', 'YEAR', 'MONTH', 'DAY', 'WEEKDAY', 'DATEDIF', 'EDATE', 'NETWORKDAYS']],
  ['数学与三角函数', 'math', ['ABS', 'INT', 'MOD', 'ROUNDUP', 'ROUNDDOWN', 'POWER', 'SQRT', 'SUMPRODUCT', 'RAND', 'PI']],
  ['统计', 'stats', ['COUNTA', 'COUNTIFS', 'AVERAGEIF', 'MEDIAN', 'MODE', 'STDEV', 'LARGE', 'SMALL', 'RANK']],
  ['查找与引用', 'lookup', ['VLOOKUP', 'HLOOKUP', 'INDEX', 'MATCH', 'LOOKUP', 'OFFSET', 'ROW', 'COLUMN', 'CHOOSE']],
  ['文本', 'text-fn', ['CONCATENATE', 'TEXTJOIN', 'LEFT', 'RIGHT', 'MID', 'LEN', 'FIND', 'SUBSTITUTE', 'TRIM', 'TEXT', 'UPPER', 'LOWER']],
  ['逻辑', 'logic', ['IF', 'IFS', 'AND', 'OR', 'NOT', 'IFERROR', 'XOR', 'TRUE', 'FALSE']],
  ['信息', 'info', ['ISBLANK', 'ISNUMBER', 'ISTEXT', 'ISERROR', 'ISNA', 'TYPE', 'N', 'NA']],
  ['工程', 'engineering', ['CONVERT', 'DEC2BIN', 'BIN2DEC', 'DEC2HEX', 'HEX2DEC', 'DELTA']],
  ['数据库', 'database', ['DSUM', 'DAVERAGE', 'DCOUNT', 'DMAX', 'DMIN', 'DGET']],
  ['兼容性', 'compat', ['STDEV', 'VAR', 'PERCENTILE', 'QUARTILE', 'RANK', 'MODE']],
];
const fnItem = name => it('fn-' + name, name, null, {do: {fn: name}});
export const FORMULA_MENU = [
  ...FUNCTION_GROUPS.map(([label, icon, names], i) => sub('fn-group-' + i, label, icon, names.map(fnItem))),
  sub('fn-special', '特色函数', 'special', [soon('fn-special-none', '暂无', null)]),
  SEP,
  soon('fn-names', '名称管理', 'names'), soon('fn-quick', '快速创建', 'quick'),
  SEP,
  sub('fn-calc', '计算选项', 'calc', [uno('fn-recalc', '立即重新计算', null, '.uno:Calculate'), soon('fn-manual', '手动计算', null)]),
];

// ---- menus ----
export const ROWCOL_MENU = [
  uno('ins-row-above', '在上方插入1行', null, '.uno:InsertRowsBefore'), uno('ins-row-below', '在下方插入1行', null, '.uno:InsertRowsAfter'),
  SEP,
  uno('ins-col-left', '在左侧插入1列', null, '.uno:InsertColumnsBefore'), uno('ins-col-right', '在右侧插入1列', null, '.uno:InsertColumnsAfter'),
  SEP,
  sub('rowcol-size', '行高列宽', null, [it('row-height', '行高…', null, {do: {ui: 'size', axis: 'row'}}), it('col-width', '列宽…', null, {do: {ui: 'size', axis: 'column'}})]),
];
export const CELL_MENU = [
  uno('ins-cell-right', '插入单元格，现有单元格右移', null, '.uno:InsertCell', {args: {Flags: '>'}}),
  uno('ins-cell-down', '插入单元格，现有单元格下移', null, '.uno:InsertCell', {args: {Flags: 'V'}}),
];
export const DELETE_MENU = [
  uno('del-rows', '删除整行', null, '.uno:DeleteRows'), uno('del-cols', '删除整列', null, '.uno:DeleteColumns'),
  SEP,
  uno('del-cell-up', '删除单元格，下方单元格上移', null, '.uno:DeleteCell', {args: {Flags: 'U'}}),
  uno('del-cell-left', '删除单元格，右侧单元格左移', null, '.uno:DeleteCell', {args: {Flags: 'L'}}),
];
export const INSERT_MENU = [
  sub('ins-image', '图片', 'image', [it('ins-image-local', '本地图片', null, {do: {ui: 'pickImage'}}), soon('ins-image-cell', '单元格图片', null)]),
  soon('ins-chart', '图表', 'chart', {hint: '柱状图/地图'}),
  sub('ins-sparkline', '迷你图', 'sparkline', [soon('spark-line', '折线图', null), soon('spark-column', '柱形图', null), soon('spark-win', '盈亏图', null)]),
  {id: 'ins-shapes', label: '形状', icon: 'shapes', kind: 'menu', panel: 'shapes'},
  soon('ins-link', '链接', 'link', {hint: '单元格/工作表'}),
  soon('ins-pivot', '数据透视表', 'pivot'),
  soon('ins-slicer', '创建切片器', 'slicer'),
  SEP,
  sub('ins-rowcol', '行列', 'row-col', ROWCOL_MENU),
  sub('ins-cells', '单元格', 'cell-insert', CELL_MENU),
];
export const SORT_MENU = [uno('sort-asc', '升序', 'sort-asc', '.uno:SortAscending'), uno('sort-desc', '降序', 'sort-desc', '.uno:SortDescending')];
export const SUM_MENU = [
  uno('sum-auto', '求和', 'sum', '.uno:AutoSum'),
  it('sum-avg', '平均值', null, {do: {fn: 'AVERAGE'}}), it('sum-count', '计数', null, {do: {fn: 'COUNT'}}),
  it('sum-max', '最大值', null, {do: {fn: 'MAX'}}), it('sum-min', '最小值', null, {do: {fn: 'MIN'}}),
  SEP, sub('sum-more', '更多函数', null, FORMULA_MENU),
];
export const CLEAR_MENU = [
  it('clear-content', '清除内容', null, {do: {op: 'sheet_key', key: 'Delete'}}),
  uno('clear-format-only', '清除格式', null, '.uno:ResetAttributes'),
];
export const GROUP_ITEMS = ctx => [
  uno('group-cols', '将 [' + ctx.colLabel + '] 列分为一组', null, '.uno:Group', {args: {RowOrCol: 'C'}}),
  uno('ungroup-cols', '取消 [' + ctx.colLabel + '] 列分组', null, '.uno:Ungroup', {args: {RowOrCol: 'C'}}),
  SEP,
  uno('group-rows', '将 [' + ctx.rowLabel + '] 行分为一组', null, '.uno:Group', {args: {RowOrCol: 'R'}}),
  uno('ungroup-rows', '取消 [' + ctx.rowLabel + '] 行分组', null, '.uno:Ungroup', {args: {RowOrCol: 'R'}}),
];
export const DATA_MENU = ctx => [
  ...SORT_MENU,
  uno('data-filter', '筛选', 'filter', '.uno:DataFilterAutoFilter', {state: 'filter'}),
  SEP,
  sub('data-validate', '数据验证', 'validate', [soon('validate-list', '下拉列表', null), soon('validate-rules', '验证规则', null)]),
  sub('data-condition', '条件格式', 'condition', [soon('cond-highlight', '突出显示单元格规则', null), soon('cond-bars', '数据条', null), soon('cond-scale', '色阶', null)]),
  sub('data-split', '分列', 'text-to-cols', [soon('split-sep', '按分隔符分列', null), soon('split-width', '按固定宽度分列', null)]),
  SEP,
  ...GROUP_ITEMS(ctx),
];
export const FREEZE_MENU = ctx => [
  it('freeze-row', '冻结首行', null, {do: {ui: 'freeze', rows: 1, cols: 0}}),
  it('freeze-col', '冻结首列', null, {do: {ui: 'freeze', rows: 0, cols: 1}}),
  it('freeze-here', ctx.freezeLabel, null, {do: {ui: 'freezeHere'}, enabled: !ctx.frozen}),
  SEP,
  it('freeze-off', '取消冻结', null, {do: {ui: 'freeze', rows: 0, cols: 0}, enabled: ctx.frozen}),
];
export const VIEW_MENU = ctx => [
  sub('view-freeze', '冻结', 'freeze', FREEZE_MENU(ctx)),
  sub('view-zoom', '缩放', 'zoom-lens', [50, 75, 100, 125, 150, 200].map(n => it('view-zoom-' + n, n + '%', null, {do: {ui: 'zoom', percent: n}}))),
  soon('view-gridlines', '网格线', null),
];
export const MAIN_MENU = ctx => [
  sub('menu-insert', '插入', null, INSERT_MENU),
  sub('menu-data', '数据', null, DATA_MENU(ctx)),
  sub('menu-formula', '公式', null, FORMULA_MENU),
  sub('menu-view', '视图', null, VIEW_MENU(ctx)),
];
export const MORE_MENU = ctx => [
  {id: 'more-row', kind: 'iconrow', items: [
    {id: 'more-sort', icon: 'sort-asc', label: '排序', kind: 'menu', menu: SORT_MENU},
    {id: 'more-sum', icon: 'sum', label: '求和', kind: 'menu', menu: SUM_MENU},
    {id: 'more-clear', icon: 'clear', label: '清除', kind: 'menu', menu: CLEAR_MENU},
    soon('more-print', '打印', 'print')]},
  SEP,
  sub('data-validate', '数据验证', 'validate', [soon('validate-list', '下拉列表', null), soon('validate-rules', '验证规则', null)]),
  sub('data-condition', '条件格式', 'condition', [soon('cond-highlight', '突出显示单元格规则', null), soon('cond-bars', '数据条', null)]),
  sub('data-split', '分列', 'text-to-cols', [soon('split-sep', '按分隔符分列', null)]),
  SEP,
  ...GROUP_ITEMS(ctx),
];
export const NUMBER_FORMATS = [
  {id: 'nf-general', label: '常规', command: '.uno:NumberFormatStandard', state: 'general'},
  {id: 'nf-text', label: '文本', soon: true},
  SEP,
  {id: 'nf-number', label: '数值', sample: '0.95', command: '.uno:NumberFormatDecimal', state: 'number'},
  {id: 'nf-percent', label: '百分比', sample: '90.00%', command: '.uno:NumberFormatPercent', state: 'percent'},
  {id: 'nf-fraction', label: '分数', sample: '1/2', soon: true},
  {id: 'nf-sci', label: '科学记数', sample: '9.50E-01', command: '.uno:NumberFormatScientific', state: 'scientific'},
  SEP,
  {id: 'nf-currency', label: '货币', sample: '¤5.00', command: '.uno:NumberFormatCurrency', state: 'currency'},
  {id: 'nf-hkd', label: '港币', sample: 'HK$5.00', soon: true},
  {id: 'nf-usd', label: '美元', sample: '$5.00', soon: true},
  {id: 'nf-accounting', label: '会计专用', sample: '¥ 5.00', soon: true},
  SEP,
  {id: 'nf-date', label: '日期', sample: '2018/4/18', command: '.uno:NumberFormatDate', state: 'date'},
  {id: 'nf-date-md', label: '日期', sample: '4月18日', soon: true},
  {id: 'nf-date-ym', label: '日期', sample: '2018年4月', soon: true},
  {id: 'nf-time', label: '时间', sample: '14:30:30', command: '.uno:NumberFormatTime', state: 'time'},
  SEP,
  {id: 'nf-more', label: '更多格式', soon: true},
];
export const BORDER_GRID = [
  ['border-all', 'all', '所有框线'], ['border-outer', 'outer', '外侧框线'], ['border-inner', 'inner', '内部框线'], ['border-thick', 'thick-outer', '粗外侧框线'], ['border-none', 'none', '无框线'],
  ['border-top', 'top', '上框线'], ['border-bottom', 'bottom', '下框线'], ['border-left', 'left', '左框线'], ['border-right', 'right', '右框线'], ['border-h', 'horizontal', '内部横框线'],
];
export const BORDER_STYLE_LIST = [['solid', '实线'], ['dashed', '虚线'], ['dotted', '点线'], ['double', '双线']];

/** Toolbar (left to right). 'prio' decides what collapses into "…" first on narrow windows (higher collapses first). */
export const TOOLBAR = [
  {id: 'menu', label: '菜单', icon: 'menu', kind: 'menu', showLabel: true, menu: 'main', prio: 0},
  SEP,
  it('undo', '撤销 (⌘Z)', 'undo', {do: {legacy: '.uno:Undo'}, when: 'undo', prio: 0}),
  it('redo', '重做 (⌘⇧Z)', 'redo', {do: {legacy: '.uno:Redo'}, when: 'redo', prio: 0}),
  uno('painter', '格式刷', 'format-painter', '.uno:FormatPaintbrush', {prio: 1}),
  uno('clear-format', '清除格式', 'eraser', '.uno:ResetAttributes', {prio: 1}),
  SEP,
  {id: 'insert', label: '插入', icon: 'insert-circle', kind: 'menu', showLabel: true, menu: INSERT_MENU, prio: 0},
  SEP,
  {id: 'font-name', label: '字体', kind: 'select', options: FONTS, width: 92, state: 'font', placeholder: '默认字体', prio: 2},
  {id: 'font-size', label: '字号', kind: 'select', options: SIZES, width: 52, state: 'size', placeholder: '10', prio: 2},
  {id: 'bold', label: '加粗 (⌘B)', icon: 'bold', kind: 'split', do: {legacy: '.uno:Bold'}, state: 'bold', prio: 0,
    menu: [it('italic', '斜体 (⌘I)', 'italic', {do: {legacy: '.uno:Italic'}, state: 'italic'}), it('underline', '下划线 (⌘U)', 'underline', {do: {legacy: '.uno:Underline'}, state: 'underline'}),
      uno('strike', '删除线', 'strike', '.uno:Strikeout', {state: 'strike'})]},
  {id: 'font-color', label: '字体颜色', icon: 'font-color', kind: 'color', command: '.uno:Color', argKey: 'Color', initial: '#000000', prio: 1},
  {id: 'fill', label: '填充颜色', icon: 'fill', kind: 'color', command: '.uno:BackgroundColor', argKey: 'BackgroundColor', initial: '#FFEB3B', prio: 1, none: true},
  {id: 'border', label: '边框', icon: 'border-all', kind: 'border', prio: 1},
  SEP,
  {id: 'cells', label: '单元格', icon: 'cell-insert', kind: 'menu', menu: [...CELL_MENU, SEP, ...DELETE_MENU], prio: 3},
  {id: 'rowcol', label: '行和列', icon: 'row-col', kind: 'menu', menu: ROWCOL_MENU, prio: 3},
  SEP,
  {id: 'halign', label: '水平对齐', icon: 'align-left', kind: 'menu', state: 'halign', prio: 2, menu: [
    uno('ha-left', '左对齐', 'align-left', '.uno:AlignLeft', {check: ['halign', 'left']}),
    uno('ha-center', '居中对齐', 'align-center', '.uno:AlignHorizontalCenter', {check: ['halign', 'center']}),
    uno('ha-right', '右对齐', 'align-right', '.uno:AlignRight', {check: ['halign', 'right']}),
    uno('ha-justify', '两端对齐', 'align-justify', '.uno:AlignBlock', {check: ['halign', 'justify']})]},
  {id: 'valign', label: '垂直对齐', icon: 'valign-bottom', kind: 'menu', state: 'valign', prio: 2, menu: [
    uno('va-top', '顶端对齐', 'valign-top', '.uno:AlignTop', {check: ['valign', 'top']}),
    uno('va-middle', '居中对齐', 'valign-middle', '.uno:AlignVCenter', {check: ['valign', 'middle']}),
    uno('va-bottom', '底端对齐', 'valign-bottom', '.uno:AlignBottom', {check: ['valign', 'bottom']})]},
  {id: 'rotate', label: '文字方向', icon: 'text-rotate', kind: 'menu', prio: 3, menu: [
    soon('rot-ccw', '逆时针斜排', 'rotate-ccw'), soon('rot-cw', '顺时针斜排', 'rotate-cw'), soon('rot-vertical', '竖排文字', 'text-vertical'),
    soon('rot-up', '向上旋转文字', 'text-up'), soon('rot-down', '向下旋转文字', 'text-down'), SEP, soon('rot-more', '更多单元格对齐方式', null)]},
  uno('wrap', '自动换行', 'wrap', '.uno:WrapText', {state: 'wrap', prio: 1}),
  {id: 'merge', label: '合并单元格', icon: 'merge', kind: 'split', do: {uno: '.uno:ToggleMergeCells'}, state: 'merge', prio: 2, menu: [
    uno('merge-all', '合并单元格', 'merge', '.uno:MergeCells'), uno('merge-off', '取消合并', 'merge-split', '.uno:ToggleMergeCells', {when: 'merged'})]},
  SEP,
  {id: 'numfmt', label: '数字格式', kind: 'numfmt', width: 104, prio: 2},
  uno('percent', '百分比样式', 'percent', '.uno:NumberFormatPercent', {state: 'percent', prio: 2}),
  uno('thousands', '千位分隔样式', 'thousands', '.uno:NumberFormatThousands', {prio: 3}),
  uno('dec-inc', '增加小数位数', 'dec-inc', '.uno:NumberFormatIncDecimals', {prio: 3}),
  uno('dec-dec', '减少小数位数', 'dec-dec', '.uno:NumberFormatDecDecimals', {prio: 3}),
  SEP,
  {id: 'filter', label: '筛选', icon: 'filter', kind: 'split', do: {uno: '.uno:DataFilterAutoFilter'}, state: 'filter', prio: 2, menu: [
    uno('filter-data', '筛选数据', null, '.uno:DataFilterAutoFilter', {state: 'filter'}), SEP, soon('filter-color', '按颜色筛选', null), soon('filter-cond', '按条件筛选', null)]},
  {id: 'freeze', label: '冻结', icon: 'freeze', kind: 'menu', menu: 'freeze', state: 'frozen', prio: 2},
  {id: 'more', label: '更多', icon: 'more', kind: 'menu', menu: 'more', prio: 0},
];

// ---- pure state mapping (unit tested) ----------------------------------------------
const truthy = v => v === 'true';
/** '.uno:FreezePanesRow' state 'tab / index' -> index. */
export const frozenIndex = v => { const m = String(v ?? '').match(/(\d+)\s*$/); return m ? +m[1] : 0; };
/** Calc STATE_CHANGED dictionary -> toolbar state. */
export function mapSheetStates(states = {}) {
  const s = states && typeof states === 'object' ? states : {};
  const halign = truthy(s['.uno:AlignHorizontalCenter']) ? 'center' : truthy(s['.uno:AlignRight']) ? 'right' : truthy(s['.uno:AlignBlock']) ? 'justify' : truthy(s['.uno:AlignLeft']) ? 'left' : 'general';
  const valign = truthy(s['.uno:AlignTop']) || truthy(s['.uno:AlignUp']) ? 'top' : truthy(s['.uno:AlignVCenter']) || truthy(s['.uno:AlignMiddle']) ? 'middle' : truthy(s['.uno:AlignBottom']) || truthy(s['.uno:AlignDown']) ? 'bottom' : 'standard';
  const numfmt = truthy(s['.uno:NumberFormatPercent']) ? 'percent' : truthy(s['.uno:NumberFormatCurrency']) ? 'currency' : truthy(s['.uno:NumberFormatDate']) ? 'date'
    : truthy(s['.uno:NumberFormatTime']) ? 'time' : truthy(s['.uno:NumberFormatScientific']) ? 'scientific' : truthy(s['.uno:NumberFormatDecimal']) ? 'number' : 'general';
  const h = parseFloat(s['.uno:FontHeight']);
  return {
    bold: truthy(s['.uno:Bold']), italic: truthy(s['.uno:Italic']), underline: truthy(s['.uno:Underline']), strike: truthy(s['.uno:Strikeout']),
    halign, valign, numfmt, percent: numfmt === 'percent',
    wrap: truthy(s['.uno:WrapText']), merge: truthy(s['.uno:ToggleMergeCells']), merged: truthy(s['.uno:ToggleMergeCells']),
    filter: truthy(s['.uno:DataFilterAutoFilter']), frozen: truthy(s['.uno:FreezePanes']) || frozenIndex(s['.uno:FreezePanesRow']) > 0 || frozenIndex(s['.uno:FreezePanesColumn']) > 0,
    font: typeof s['.uno:CharFontName'] === 'string' ? displayFontName(s['.uno:CharFontName']) : '',
    size: Number.isFinite(h) && h > 0 ? String(Math.round(h * 10) / 10) : '',
    modified: truthy(s['.uno:ModifiedStatus']),
  };
}
export const HALIGN_ICON = {left: 'align-left', general: 'align-left', center: 'align-center', right: 'align-right', justify: 'align-justify'};
export const VALIGN_ICON = {top: 'valign-top', middle: 'valign-middle', bottom: 'valign-bottom', standard: 'valign-bottom'};
export function numberFormatLabel(key) { return (NUMBER_FORMATS.find(f => f !== SEP && f.state === key) || NUMBER_FORMATS[0]).label; }
/** Context for dynamic menu labels from the active cell (0-based col/row) and the selection. */
export function menuContext({col = 0, row = 0, c1 = col, c2 = col, r1 = row, r2 = row, frozen = false} = {}) {
  return {
    freezeLabel: '冻结至第' + (row + 1) + '行' + colName(col) + '列', frozen,
    colLabel: colName(c1) + ' – ' + colName(c2), rowLabel: (r1 + 1) + ' – ' + (r2 + 1),
  };
}
/** Every item reachable from the toolbar (menus resolved with a default context). */
export function allSheetItems(ctx = menuContext()) {
  const out = [], seen = new Set();
  const resolve = m => (m === 'main' ? MAIN_MENU(ctx) : m === 'more' ? MORE_MENU(ctx) : m === 'freeze' ? FREEZE_MENU(ctx) : m) || [];
  const walk = x => { if (!x || x === SEP || seen.has(x)) return; seen.add(x); out.push(x); resolve(x.menu).forEach(walk); (x.items || []).forEach(walk); };
  TOOLBAR.forEach(walk);
  return out;
}
