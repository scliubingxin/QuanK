// [v1.0.7] Tabs of the Office edit-window toolbar (开始 / 插入 / 设计 / 数据 / 视图). Pure data: every command
// here must pass validateUno for the document format (tests/v107-office-tabs.test.mjs checks it), so a
// button can never be offered that the engine would refuse.
const b = (cmd, label, o = {}) => ({type: 'button', cmd, label, ...o});
const tg = (cmd, label, o = {}) => ({type: 'toggle', cmd, label, ...o});
const menu = (label, items, o = {}) => ({type: 'menu', label, items, ...o});
const view = (label, fn, arg, o = {}) => ({type: 'view', label, fn, arg, ...o});
const g = (priority, ...items) => ({priority, items});

const lineSpacing = menu('行距', [b('.uno:SpacePara1', '1.0 倍'), b('.uno:SpacePara15', '1.5 倍'), b('.uno:SpacePara2', '2.0 倍')], {text: '行距'});
const shapes = menu('形状', [
  b('.uno:BasicShapes.rectangle', '矩形'), b('.uno:BasicShapes.round-rectangle', '圆角矩形'),
  b('.uno:BasicShapes.ellipse', '椭圆'), b('.uno:Line', '直线'), b('.uno:LineArrowEnd', '箭头'),
  b('.uno:ArrowShapes.right-arrow', '右箭头'), b('.uno:StarShapes.star5', '五角星'),
], {text: '形状', icon: 'insert'});
const history = g(0, b('.uno:Undo', '撤销', {icon: 'undo'}), b('.uno:Redo', '重做', {icon: 'redo'}));
const tools = g(2, b('.uno:FormatPaintbrush', '格式刷', {text: '格式刷'}), b('.uno:ResetAttributes', '清除格式', {icon: 'clear'}));
const emphasis = (cell = false) => g(0, {type: 'emphasis'}, tg('.uno:Strikeout', '删除线', {icon: 'strike'}),
  ...(cell ? [] : [tg('.uno:SuperScript', '上标', {text: 'x²'}), tg('.uno:SubScript', '下标', {text: 'x₂'})]), {type: 'colors', cell});
const textParagraph = g(1,
  tg('.uno:LeftPara', '左对齐', {icon: 'left'}), tg('.uno:CenterPara', '居中', {icon: 'center'}),
  tg('.uno:RightPara', '右对齐', {icon: 'right'}), tg('.uno:JustifyPara', '两端对齐', {icon: 'justify'}),
  {type: 'lists'}, b('.uno:DecrementIndent', '减少缩进', {text: '⇤'}), b('.uno:IncrementIndent', '增加缩进', {text: '⇥'}), lineSpacing);
const zoom = g(0, view('缩小', 'zoomBy', -1, {icon: 'minus'}), view('放大', 'zoomBy', 1, {icon: 'plus'}),
  view('适合页面', 'zoomTo', 'page', {text: '适合页面'}), view('适合宽度', 'zoomTo', 'width', {text: '适合宽度'}));
const pageSize = (label, w, h) => b('.uno:AttributePageSize', label, {args: {'AttributePageSize.Width': w, 'AttributePageSize.Height': h}});
const style = (s, label) => b('.uno:StyleApply', label, {text: label, args: {Style: s, FamilyName: 'ParagraphStyles'}});

export function nativeToolbarTabs(kind) {
  if (kind === 'calc') return [
    {id: 'home', label: '开始', groups: [history, tools,
      g(1, {type: 'font'}, {type: 'size'}), emphasis(true),
      g(1, b('.uno:AlignLeft', '左对齐', {icon: 'left'}), b('.uno:AlignHorizontalCenter', '水平居中', {icon: 'center'}), b('.uno:AlignRight', '右对齐', {icon: 'right'}),
        b('.uno:AlignTop', '顶端对齐', {text: '⊤'}), b('.uno:AlignVCenter', '垂直居中', {text: '≡'}), b('.uno:AlignBottom', '底端对齐', {text: '⊥'}),
        tg('.uno:WrapText', '自动换行', {text: '换行'}), tg('.uno:ToggleMergeCells', '合并单元格', {icon: 'merge'})),
      g(2, {type: 'numberFormat'}, b('.uno:NumberFormatDecDecimals', '减少小数位', {text: '.0'}), b('.uno:NumberFormatIncDecimals', '增加小数位', {text: '.00'}),
        b('.uno:NumberFormatThousands', '千位分隔', {text: '千分位'}))]},
    {id: 'insert', label: '插入', groups: [
      g(0, b('.uno:InsertRowsBefore', '上方插入行', {text: '上方插入行'}), b('.uno:InsertRowsAfter', '下方插入行', {text: '下方插入行'}),
        b('.uno:InsertColumnsBefore', '左侧插入列', {text: '左侧插入列'}), b('.uno:InsertColumnsAfter', '右侧插入列', {text: '右侧插入列'})),
      g(1, b('.uno:DeleteRows', '删除行', {text: '删除行'}), b('.uno:DeleteColumns', '删除列', {text: '删除列'})), g(2, shapes)]},
    {id: 'data', label: '数据', groups: [
      g(0, b('.uno:SortAscending', '升序', {text: '升序'}), b('.uno:SortDescending', '降序', {text: '降序'}), tg('.uno:DataFilterAutoFilter', '筛选', {text: '筛选'})),
      g(1, b('.uno:AutoSum', '自动求和', {text: 'Σ 求和'}), b('.uno:Calculate', '重新计算', {text: '重新计算'}))]},
    {id: 'view', label: '视图', groups: [zoom]},
  ];
  const writer = kind === 'writer';
  const home = {id: 'home', label: '开始', groups: [history, tools,
    g(1, ...(writer ? [{type: 'style'}] : []), {type: 'font'}, {type: 'size'}, b('.uno:Grow', '增大字号', {text: 'A+'}), b('.uno:Shrink', '减小字号', {text: 'A−'})),
    emphasis(), textParagraph]};
  if (writer) return [home,
    {id: 'insert', label: '插入', groups: [
      g(0, {type: 'table'}, b('.uno:Text', '文本框', {text: '文本框'}), shapes),
      g(1, b('.uno:InsertPagebreak', '分页符', {text: '分页符'}), b('.uno:InsertPageNumberField', '页码', {text: '页码'}),
        b('.uno:InsertFootnote', '脚注', {text: '脚注'})),
      g(2, b('.uno:InsertPageHeader', '页眉', {text: '页眉', args: {PageStyle: 'Default Page Style', On: true}}),
        b('.uno:InsertPageFooter', '页脚', {text: '页脚', args: {PageStyle: 'Default Page Style', On: true}}))]},
    {id: 'design', label: '设计', groups: [
      g(0, style('Title', '标题'), style('Subtitle', '副标题'), style('Heading 1', '标题 1'), style('Heading 2', '标题 2'),
        style('Heading 3', '标题 3'), style('Standard', '正文'))]},
    {id: 'view', label: '视图', groups: [zoom, g(1, tg('.uno:TrackChanges', '修订', {icon: 'track', text: '修订'}))]},
  ];
  return [home,
    {id: 'insert', label: '插入', groups: [
      g(0, b('.uno:InsertPage', '新建幻灯片', {icon: 'slide', text: '新建幻灯片'}), b('.uno:Text', '文本框', {text: '文本框'}), shapes)]},
    {id: 'design', label: '设计', groups: [
      g(0, menu('幻灯片大小', [pageSize('宽屏 16:9', 28000, 15750), pageSize('标准 4:3', 28000, 21000)], {text: '幻灯片大小', icon: 'layout'})),
      g(1, b('.uno:BringToFront', '置于顶层', {text: '置顶'}), b('.uno:SendToBack', '置于底层', {text: '置底'}),
        b('.uno:Forward', '上移一层', {text: '上移'}), b('.uno:Backward', '下移一层', {text: '下移'})),
      g(2, b('.uno:FormatGroup', '组合', {text: '组合'}), b('.uno:FormatUngroup', '取消组合', {text: '取消组合'}))]},
    {id: 'view', label: '视图', groups: [zoom]},
  ];
}

export const NATIVE_TAB_CSS = `
.qk-office-tabs{display:flex;gap:2px;padding:4px 12px 0;border-bottom:1px solid #e6eaf3}
.qk-office-tab{border:0;background:none;padding:6px 14px;font:13px/1.2 -apple-system,"PingFang SC",sans-serif;color:#4c5a85;border-radius:8px 8px 0 0;cursor:pointer;position:relative}
.qk-office-tab:hover{background:#f3f6fd}
.qk-office-tab[aria-selected="true"]{color:#2f62f5;font-weight:600}
.qk-office-tab[aria-selected="true"]::after{content:"";position:absolute;left:12px;right:12px;bottom:-1px;height:2px;border-radius:2px;background:#2f62f5}
.qk-office-toolbar-tabbed .qk-office-group{border-right:1px solid #eef1f7;padding-right:6px;margin-right:4px}
.qk-office-toolbar-tabbed .qk-office-group:last-of-type{border-right:0}
@media (prefers-color-scheme: dark){.qk-office-tabs{border-color:#36425f}.qk-office-tab{color:#b7c3e0}.qk-office-tab:hover{background:#222b45}.qk-office-tab[aria-selected="true"]{color:#a7baff}}
`;
