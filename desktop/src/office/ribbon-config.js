// [lane:ribbon] Declarative description of the 7 ribbon tabs.
// Item: {id,label,icon,type:'button|split|dropdown|select|checkbox|swatch|gallery|number', size:'lg|sm|inline',
//   uno?,args?  -> bus `command`{id,uno,args};  event?:{type,detail} -> any other bus event;
//   enabledWhen:'always|doc|text|object|undo|redo|master-off', soon?:true -> greyed with tooltip 「即将支持」,
//   menu?:[items], menuType?:'list|color|table-grid|zoom', argKey?, colorKey?, defaultColor?, stateKey?}
// Layout: group.items is a sequence of blocks: a plain item (large button) or {rows:[[item...],[item...]]}.
export const SOON_TIP = '即将支持';
const it = (id, label, icon, o = {}) => ({id, label, icon, type: 'button', size: 'sm', enabledWhen: 'always', ...o});
const lg = (id, label, icon, o = {}) => it(id, label, icon, {size: 'lg', ...o});
const cmd = (id, label, icon, uno, o = {}) => it(id, label, icon, {uno, ...o});
const soon = (id, label, icon, o = {}) => it(id, label, icon, {soon: true, ...o});
const rows = (...r) => ({rows: r});
const grp = (id, ...items) => ({id, items});

export const COLORS = ['#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC', '#D9D9D9', '#EFEFEF', '#F3F3F3', '#FFFFFF',
  '#E53935', '#FF9800', '#FFEB3B', '#4CAF50', '#00BCD4', '#1E88E5', '#3949AB', '#8E24AA', '#D81B60', '#795548'];
export const FONTS = ['微软雅黑', '宋体', '黑体', '楷体', '仿宋', 'PingFang SC', 'Arial', 'Calibri', 'Times New Roman', 'Courier New'];
export const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 72, 88, 96];
export const ZOOMS = [25, 50, 75, 100, 125, 150, 200, 300];
export const RATIOS = {'16:9': [28000, 15750], '4:3': [28000, 21000]};

const textboxMenu = p => [cmd(p + '-textbox-h', '横向文本框', 'text-box', '.uno:Text', {enabledWhen: 'doc'}), soon(p + '-textbox-v', '竖向文本框', 'text-box')];
const shapeMenu = p => [
  cmd(p + '-shape-rect', '矩形', 'shapes', '.uno:BasicShapes.rectangle', {enabledWhen: 'doc'}),
  cmd(p + '-shape-round', '圆角矩形', 'shapes', '.uno:BasicShapes.round-rectangle', {enabledWhen: 'doc'}),
  cmd(p + '-shape-ellipse', '椭圆', 'shapes', '.uno:BasicShapes.ellipse', {enabledWhen: 'doc'}),
  cmd(p + '-shape-line', '直线', 'shapes', '.uno:Line', {enabledWhen: 'doc'}),
  cmd(p + '-shape-arrow', '箭头', 'shapes', '.uno:LineArrowEnd', {enabledWhen: 'doc'}),
  soon(p + '-shape-more', '更多形状…', 'shapes')];
const insertMenu = [
  cmd('home-insert-image', '图片', 'image', null, {enabledWhen: 'doc', pickImage: true}),
  it('home-insert-table', '表格', 'table', {type: 'dropdown', menuType: 'table-grid', uno: '.uno:InsertTable', enabledWhen: 'doc'}),
  soon('home-insert-audio', '音频', 'audio'), soon('home-insert-video', '视频', 'video'), soon('home-insert-link', '链接', 'link'), soon('home-insert-chart', '图表', 'chart')];
const swatchGroup = (id, cols) => ({id, label: '配色 ' + id, colors: cols});
const view = (mode) => ({type: 'view:set', detail: {mode}});
const toggle = name => ({type: 'view:toggle', detail: {name}});
const pct = n => ({id: 'zoom-' + n, label: n + '%', event: {type: 'zoom:set', detail: {percent: n}}, enabledWhen: 'always', icon: 'zoom-lens', type: 'button'});
const trans = [['none', '无切换', 'no-transition'], ['fade', '淡出淡入', 'fade'], ['push', '推入', 'push'], ['swap', '切换', 'swap'], ['cut', '切入', 'cut-in'],
  ['reveal', '揭开', 'reveal'], ['cover', '覆盖', 'cover'], ['zoom', '缩放', 'zoom'], ['flip', '翻转', 'flip'], ['lib', '库', 'gallery']];
const anim = (kind, list) => list.map(([k, label, icon]) => soon('anim-' + kind + '-' + k, label, icon, {size: 'lg'}));

export const TABS = [
  {name: 'home', label: '开始', groups: [
    grp('history', rows([cmd('undo', '撤销', 'undo', '.uno:Undo', {enabledWhen: 'undo'}), cmd('redo', '重做', 'redo', '.uno:Redo', {enabledWhen: 'redo'})],
      [cmd('format-painter', '格式刷', 'format-painter', '.uno:FormatPaintbrush', {enabledWhen: 'text'}), cmd('clear-format', '清除格式', 'eraser', '.uno:ResetAttributes', {enabledWhen: 'text'})])),
    grp('insert',
      lg('home-insert', '插入', 'insert-circle', {type: 'dropdown', menu: insertMenu, enabledWhen: 'doc'}),
      lg('home-textbox', '文本框', 'text-box', {type: 'dropdown', menu: textboxMenu('home'), enabledWhen: 'doc'}),
      lg('home-shapes', '形状', 'shapes', {type: 'dropdown', menu: shapeMenu('home'), enabledWhen: 'doc'})),
    grp('font', rows(
      [it('font-name', '字体', null, {type: 'select', options: FONTS, argKey: 'CharFontName.FamilyName', uno: '.uno:CharFontName', placeholder: '字体', width: 176, enabledWhen: 'text'}),
        it('font-size', '字号', null, {type: 'select', options: SIZES, argKey: 'FontHeight.Height', uno: '.uno:FontHeight', numeric: true, placeholder: '字号', width: 56, enabledWhen: 'text'}),
        cmd('font-grow', '增大字号', 'font-grow', '.uno:Grow', {enabledWhen: 'text'}), cmd('font-shrink', '减小字号', 'font-shrink', '.uno:Shrink', {enabledWhen: 'text'})],
      [cmd('bold', '加粗', 'bold', '.uno:Bold', {enabledWhen: 'text'}), cmd('italic', '倾斜', 'italic', '.uno:Italic', {enabledWhen: 'text'}),
        cmd('underline', '下划线', 'underline', '.uno:Underline', {enabledWhen: 'text'}), cmd('strike', '删除线', 'strike', '.uno:Strikeout', {enabledWhen: 'text'}),
        cmd('superscript', '上标', 'superscript', '.uno:SuperScript', {enabledWhen: 'text'}), cmd('subscript', '下标', 'subscript', '.uno:SubScript', {enabledWhen: 'text'}),
        soon('char-spacing', '字间距', 'char-spacing', {type: 'dropdown'}),
        it('highlight', '高亮色', 'highlight', {type: 'split', menuType: 'color', uno: '.uno:CharBackColor', colorKey: 'CharBackColor', defaultColor: '#FFEB3B', enabledWhen: 'text'}),
        it('font-color', '字体颜色', 'font-color', {type: 'split', menuType: 'color', uno: '.uno:Color', colorKey: 'Color', defaultColor: '#E53935', enabledWhen: 'text'})])),
    grp('paragraph', rows(
      [it('bullets', '项目符号', 'bullets', {type: 'split', uno: '.uno:DefaultBullet', enabledWhen: 'text', menu: [cmd('bullets-default', '圆点项目符号', 'bullets', '.uno:DefaultBullet', {enabledWhen: 'text'})]}),
        it('numbering', '编号', 'numbering', {type: 'split', uno: '.uno:DefaultNumbering', enabledWhen: 'text', menu: [cmd('numbering-default', '数字编号', 'numbering', '.uno:DefaultNumbering', {enabledWhen: 'text'})]}),
        cmd('indent-less', '减少缩进', 'indent-less', '.uno:DecrementIndent', {enabledWhen: 'text'}), cmd('indent-more', '增加缩进', 'indent-more', '.uno:IncrementIndent', {enabledWhen: 'text'}),
        it('line-spacing', '行距', 'line-spacing', {type: 'dropdown', enabledWhen: 'text', menu: [cmd('spacing-1', '1.0 倍', 'line-spacing', '.uno:SpacePara1', {enabledWhen: 'text'}), cmd('spacing-15', '1.5 倍', 'line-spacing', '.uno:SpacePara15', {enabledWhen: 'text'}), cmd('spacing-2', '2.0 倍', 'line-spacing', '.uno:SpacePara2', {enabledWhen: 'text'})]}),
        soon('columns', '分栏', 'columns', {type: 'dropdown'})],
      [cmd('align-left', '左对齐', 'align-left', '.uno:LeftPara', {enabledWhen: 'text'}), cmd('align-center', '居中对齐', 'align-center', '.uno:CenterPara', {enabledWhen: 'text'}),
        cmd('align-right', '右对齐', 'align-right', '.uno:RightPara', {enabledWhen: 'text'}), cmd('align-justify', '两端对齐', 'align-justify', '.uno:JustifyPara', {enabledWhen: 'text'}),
        soon('align-distribute', '分散对齐', 'align-distribute'), soon('valign', '垂直对齐', 'valign-top', {type: 'dropdown'})])),
    grp('arrange',
      lg('arrange', '排列', 'arrange', {type: 'dropdown', enabledWhen: 'object', menu: [
        cmd('arrange-front', '置于顶层', 'arrange', '.uno:BringToFront', {enabledWhen: 'object'}), cmd('arrange-back', '置于底层', 'arrange', '.uno:SendToBack', {enabledWhen: 'object'}),
        cmd('arrange-forward', '上移一层', 'arrange', '.uno:Forward', {enabledWhen: 'object'}), cmd('arrange-backward', '下移一层', 'arrange', '.uno:Backward', {enabledWhen: 'object'})]}),
      rows([soon('effects', '效果', 'effects', {size: 'inline', type: 'dropdown'}), it('fill', '填充颜色', 'fill', {size: 'inline', type: 'split', menuType: 'color', uno: '.uno:FillColor', colorKey: 'FillColor', defaultColor: '#1E88E5', enabledWhen: 'object'})],
        [it('group', '组合', 'group', {size: 'inline', type: 'dropdown', enabledWhen: 'object', menu: [cmd('group-group', '组合', 'group', '.uno:FormatGroup', {enabledWhen: 'object'}), cmd('group-ungroup', '取消组合', 'group', '.uno:FormatUngroup', {enabledWhen: 'object'})]}),
          it('border', '边框设置', 'border', {size: 'inline', type: 'dropdown', menuType: 'color', uno: '.uno:XLineColor', colorKey: 'XLineColor', enabledWhen: 'object'})])),
    grp('anim', lg('home-animation', '动画', 'animation', {event: {type: 'panel:open', detail: {name: 'animation'}}})),
    grp('page', lg('home-page-setup', '页面设置', 'page-setup', {type: 'split', enabledWhen: 'doc', menu: [
      cmd('home-ratio-169', '16:9 宽屏', 'ratio', '.uno:AttributePageSize', {enabledWhen: 'doc', ratio: '16:9'}), cmd('home-ratio-43', '4:3 标准', 'ratio', '.uno:AttributePageSize', {enabledWhen: 'doc', ratio: '4:3'})]})),
    grp('print', soon('print', '打印', 'print', {size: 'lg'})),
  ]},
  {name: 'insert', label: '插入', groups: [
    grp('page', cmd('ins-blank-page', '空白页面', 'blank-page', '.uno:InsertPage', {size: 'lg', enabledWhen: 'doc'})),
    grp('objects',
      lg('ins-textbox', '文本框', 'text-box', {type: 'dropdown', menu: textboxMenu('ins'), enabledWhen: 'doc'}),
      lg('ins-shapes', '形状', 'shapes', {type: 'dropdown', menu: shapeMenu('ins'), enabledWhen: 'doc'}),
      lg('ins-image', '图片', 'image', {enabledWhen: 'doc', pickImage: true}),
      soon('ins-audio', '音频', 'audio', {size: 'lg'}), soon('ins-video', '视频', 'video', {size: 'lg'}),
      lg('ins-table', '表格', 'table', {type: 'dropdown', menuType: 'table-grid', uno: '.uno:InsertTable', enabledWhen: 'doc'}),
      soon('ins-link', '链接', 'link', {size: 'lg'}), soon('ins-chart', '图表', 'chart', {size: 'lg', type: 'dropdown'}), soon('ins-footer', '页脚', 'footer', {size: 'lg'})),
  ]},
  {name: 'beautify', label: '美化', groups: [
    {id: 'palettes', items: [{id: 'palettes-gallery', type: 'swatch', soon: true, label: '配色方案', enabledWhen: 'always', palettes: [
      ['#3B4A5A', '#1E6FE0', '#12A5E0', '#2E9A5B', '#E53935', '#FB8C00', '#FDD835', '#8E3FC4'],
      ['#44546A', '#D9D9D9', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'],
      ['#1F2A44', '#C9DDF0', '#1F5FBF', '#A8D4F5', '#8DB6DE', '#5B8CC6', '#3866B0', '#0B4DA8'],
      ['#4A3728', '#F3E5C8', '#E8A33D', '#F5C98B', '#E0B26E', '#D99A4E', '#B7A58A', '#8C8576']]}]},
    grp('more-colors', soon('more-colors', '更多配色', 'palette', {size: 'lg'})),
    grp('page', lg('ratio', '幻灯片比例', 'ratio', {type: 'dropdown', enabledWhen: 'doc', menu: [
      cmd('ratio-169', '16:9 宽屏', 'ratio', '.uno:AttributePageSize', {enabledWhen: 'doc', ratio: '16:9'}), cmd('ratio-43', '4:3 标准', 'ratio', '.uno:AttributePageSize', {enabledWhen: 'doc', ratio: '4:3'})]}),
      soon('set-background', '设置背景', 'background', {size: 'lg'}),
      lg('master-edit', '母版编辑', 'master-edit', {event: {type: 'view:set', detail: {mode: 'master'}}, enabledWhen: 'doc'})),
  ]},
  {name: 'transition', label: '切换', groups: [
    grp('preview', soon('trans-preview', '预览效果', 'preview', {size: 'lg', type: 'dropdown'})),
    {id: 'effects', items: [{id: 'trans-gallery', type: 'gallery', selected: 'trans-none', enabledWhen: 'doc', items: trans.map(([k, label, icon]) => soon('trans-' + k, label, icon, {size: 'lg'}))}]},
    grp('options', soon('trans-options', '效果选项', 'effect-options', {size: 'lg', type: 'dropdown'})),
    grp('duration', soon('trans-duration', '持续时间', 'clock', {type: 'number', value: 0, unit: 's', size: 'lg'})),
    grp('all', soon('trans-apply-all', '应用到全部', 'apply-all', {size: 'lg'})),
  ]},
  {name: 'animation', label: '动画', groups: [
    grp('preview', soon('anim-preview', '预览', 'preview', {size: 'lg', type: 'dropdown'})),
    {id: 'enter', vlabel: '进入', items: [{id: 'anim-enter', type: 'gallery', items: anim('enter', [['appear', '出现', 'anim-in'], ['blinds', '百叶窗', 'anim-blinds'], ['checker', '棋盘', 'anim-checker'], ['dissolve', '向内溶解', 'anim-dissolve']])}]},
    {id: 'emphasis', vlabel: '强调', items: [{id: 'anim-emphasis', type: 'gallery', items: anim('emph', [['fill', '填充颜色', 'anim-fill'], ['font', '字体颜色', 'anim-fontcolor']])}]},
    {id: 'exit', vlabel: '退出', items: [{id: 'anim-exit', type: 'gallery', items: anim('exit', [['vanish', '消失', 'anim-vanish'], ['blinds', '百叶窗', 'anim-blinds']])}]},
    grp('pane',
      lg('anim-pane', '动画窗格', 'animation-pane', {event: {type: 'panel:open', detail: {name: 'animation'}}, enabledWhen: 'doc'}),
      soon('anim-batch', '批量动画', 'batch-animation', {size: 'lg', type: 'dropdown'}), soon('anim-brush', '动画刷', 'anim-brush', {size: 'lg'}),
      rows([soon('anim-start', '开始方式', 'play-current', {size: 'inline', type: 'dropdown'}), soon('anim-delay', '延迟', 'clock', {size: 'inline', type: 'dropdown'})],
        [soon('anim-duration', '持续时间', 'clock', {size: 'inline', type: 'dropdown'}), soon('anim-trigger', '触发器', 'animation', {size: 'inline', type: 'dropdown'})])),
    grp('badges', soon('anim-hide-badges', '隐藏全部角标', null, {type: 'checkbox', size: 'sm'})),
  ]},
  {name: 'show', label: '放映', groups: [
    grp('play', lg('show-start', '从头演示', 'play-start', {event: {type: 'show:start', detail: {from: 'first'}}, enabledWhen: 'doc'}),
      lg('show-current', '从当前页演示', 'play-current', {event: {type: 'show:start', detail: {from: 'current'}}, enabledWhen: 'doc'})),
    grp('presenter', soon('show-presenter', '演讲者视图', 'presenter', {size: 'lg'})),
  ]},
  {name: 'view', label: '视图', groups: [
    grp('mode', lg('view-normal', '普通视图', 'view-normal', {event: view('normal'), modeKey: 'normal'}), lg('view-master', '幻灯片母版', 'view-master', {event: view('master'), modeKey: 'master', enabledWhen: 'doc'})),
    grp('aids', rows([it('view-ruler', '标尺', null, {type: 'checkbox', event: toggle('ruler'), toggleName: 'ruler'}), it('view-guides', '参考线', null, {type: 'checkbox', event: toggle('guides'), toggleName: 'guides'})],
      [it('view-grid', '网格线', null, {type: 'checkbox', event: toggle('grid'), toggleName: 'grid'}), it('view-snap', '智能吸附', null, {type: 'checkbox', event: toggle('snap'), toggleName: 'snap'})]),
      lg('view-notes', '备注', 'notes', {event: toggle('notes'), toggleName: 'notes', enabledWhen: 'master-off'})),
    grp('zoom', lg('view-zoom', '缩放', 'zoom-lens', {type: 'dropdown', menuType: 'zoom', menu: ZOOMS.map(pct)}),
      lg('view-fit', '适应窗口', 'fit-window', {event: {type: 'zoom:fit', detail: {}}})),
    {id: 'exit-master', masterOnly: true, items: [lg('view-exit-master', '退出母版', 'exit-master', {event: view('normal'), danger: true})]},
  ]},
];
export const MASTER_TABS = ['home', 'insert', 'transition', 'view'];

/** Flattens every item (including menu/gallery children) with its tab name. */
export function allItems() {
  const out = [];
  const walk = (x, tab) => {
    if (!x) return;
    if (x.rows) { x.rows.forEach(r => r.forEach(i => walk(i, tab))); return; }
    out.push({item: x, tab});
    (x.menu || []).forEach(i => walk(i, tab));
    (x.items || []).forEach(i => walk(i, tab));
  };
  for (const t of TABS) for (const g of t.groups) (g.items || []).forEach(i => walk(i, t.name));
  return out;
}
