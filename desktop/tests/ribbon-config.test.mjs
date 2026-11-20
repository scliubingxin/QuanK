import {test} from 'node:test';import assert from 'node:assert/strict';
import {TABS,MASTER_TABS,allItems,RATIOS,SIZES} from '../src/office/ribbon-config.js';
import {ICONS} from '../src/office/ribbon-icons.js';
import {validateUno,LEGACY_COMMANDS} from '../src/shared/office-uno.js';
import {enabledFor,buildCommand,selectionKind,normalizeKind,visibleTabs,tabByName} from '../src/office/ribbon.js';

const labels=tab=>allItems().filter(x=>x.tab===tab).map(x=>x.item.label);
const TYPES=['button','split','dropdown','select','checkbox','swatch','gallery','number'];
test('seven tabs in screenshot order',()=>{assert.deepEqual(TABS.map(t=>t.label),['开始','插入','美化','切换','动画','放映','视图']);});
test('item ids are unique and every item is well formed',()=>{
  const all=allItems(),ids=all.map(x=>x.item.id);assert.equal(new Set(ids).size,ids.length);
  for(const {item} of all){assert.ok(item.id&&/^[a-z0-9-]+$/.test(item.id),item.id);assert.ok(TYPES.includes(item.type),item.id);
    if(item.type!=='gallery'&&item.type!=='swatch')assert.ok(item.label,item.id);
    if(item.icon)assert.ok(ICONS[item.icon],'missing icon '+item.icon+' for '+item.id);
    if(!['select','checkbox','gallery','swatch'].includes(item.type))assert.ok(item.icon,'icon required '+item.id);}
});
test('home tab has every button from the screenshot',()=>{
  const l=labels('home');for(const n of ['撤销','重做','格式刷','清除格式','插入','文本框','形状','字体','字号','增大字号','减小字号','加粗','倾斜','下划线','删除线','上标','下标','字间距','高亮色','字体颜色','项目符号','编号','减少缩进','增加缩进','行距','分栏','左对齐','居中对齐','右对齐','两端对齐','分散对齐','垂直对齐','排列','组合','效果','填充颜色','边框设置','动画','页面设置','打印'])assert.ok(l.includes(n),n);});
test('insert/beautify/transition/animation/show/view buttons',()=>{
  for(const n of ['空白页面','文本框','形状','图片','音频','视频','表格','链接','图表','页脚'])assert.ok(labels('insert').includes(n),n);
  for(const n of ['更多配色','幻灯片比例','设置背景','母版编辑'])assert.ok(labels('beautify').includes(n),n);
  const pal=allItems().find(x=>x.item.type==='swatch').item;assert.equal(pal.palettes.length,4);for(const p of pal.palettes)assert.equal(p.length,8);
  for(const n of ['预览效果','无切换','淡出淡入','推入','切换','切入','揭开','覆盖','缩放','翻转','库','效果选项','持续时间','应用到全部'])assert.ok(labels('transition').includes(n),n);
  for(const n of ['预览','出现','百叶窗','棋盘','向内溶解','填充颜色','字体颜色','消失','动画窗格','批量动画','动画刷','开始方式','持续时间','延迟','触发器','隐藏全部角标'])assert.ok(labels('animation').includes(n),n);
  assert.deepEqual(labels('show'),['从头演示','从当前页演示','演讲者视图']);
  for(const n of ['普通视图','幻灯片母版','标尺','参考线','网格线','智能吸附','备注','缩放','适应窗口','退出母版'])assert.ok(labels('view').includes(n),n);
  assert.deepEqual(MASTER_TABS,['home','insert','transition','view']);
  assert.deepEqual(visibleTabs('master').map(t=>t.label),['开始','插入','切换','视图']);assert.equal(visibleTabs('normal').length,7);
});
test('transition gallery selects 无切换 by default; exit-master group only in master',()=>{
  const g=allItems().find(x=>x.item.id==='trans-gallery').item;assert.equal(g.selected,'trans-none');assert.equal(g.items.length,10);
  assert.ok(tabByName('view').groups.find(x=>x.id==='exit-master').masterOnly);assert.equal(tabByName('视图').name,'view');
});
test('every uno item passes the command whitelist with representative arguments',()=>{
  const sample={'.uno:CharFontName':{'CharFontName.FamilyName':'Arial'},'.uno:FontHeight':{'FontHeight.Height':18},'.uno:Color':{Color:255},'.uno:CharBackColor':{CharBackColor:255},'.uno:FillColor':{FillColor:1},'.uno:XLineColor':{XLineColor:1},'.uno:InsertTable':{Columns:3,Rows:2},'.uno:AttributePageSize':{'AttributePageSize.Width':28000,'AttributePageSize.Height':15750}};
  for(const {item} of allItems()){if(!item.uno||LEGACY_COMMANDS.includes(item.uno))continue;assert.ok(!item.soon,item.id+' soon with uno');assert.doesNotThrow(()=>validateUno(item.uno,item.ratio?buildCommand(item).args:sample[item.uno],{format:'pptx'}),item.id+' '+item.uno);}
  for(const r of Object.values(RATIOS))assert.ok(r[0]>r[1]);assert.ok(SIZES.every(n=>n>=1&&n<=400));
});
test('soon items are never enabled and carry no command',()=>{
  const ctx={ready:true,kind:'object',history:{undo:1,redo:1},mode:'normal'};
  for(const {item} of allItems())if(item.soon){assert.equal(enabledFor(item,ctx),false,item.id);assert.ok(!item.uno&&!item.event,item.id);}
  for(const id of ['print','trans-fade','anim-enter-appear','effects','columns','more-colors'])assert.ok(allItems().find(x=>x.item.id===id).item.soon,id);
});
test('enabledWhen follows selection, history and master mode',()=>{
  const get=id=>allItems().find(x=>x.item.id===id).item;const mk=o=>({ready:true,kind:'none',history:{undo:0,redo:0},mode:'normal',...o});
  assert.equal(enabledFor(get('bold'),mk()),false);assert.equal(enabledFor(get('bold'),mk({kind:'text'})),true);
  assert.equal(enabledFor(get('fill'),mk({kind:'text'})),false);assert.equal(enabledFor(get('fill'),mk({kind:'object'})),true);
  assert.equal(enabledFor(get('undo'),mk()),false);assert.equal(enabledFor(get('undo'),mk({history:{undo:2,redo:0}})),true);assert.equal(enabledFor(get('redo'),mk({history:{undo:2,redo:0}})),false);
  assert.equal(enabledFor(get('home-textbox'),mk()),true);assert.equal(enabledFor(get('home-textbox'),mk({ready:false})),false);
  assert.equal(enabledFor(get('view-notes'),mk()),true);assert.equal(enabledFor(get('view-notes'),mk({mode:'master'})),false);
  assert.equal(selectionKind({selectionType:1}),'text');assert.equal(selectionKind({selectionType:3}),'object');assert.equal(selectionKind({selectionType:0,states:{'.uno:BringToFront':'enabled'}}),'object');assert.equal(selectionKind({selectionType:2}),'text');assert.equal(selectionKind({}),'none');assert.equal(normalizeKind('shape'),'object');assert.equal(normalizeKind('x'),'none');
});
test('buildCommand produces typed arguments',()=>{
  const get=id=>allItems().find(x=>x.item.id===id).item;
  assert.deepEqual(buildCommand(get('font-size'),'18'),{id:'font-size',uno:'.uno:FontHeight',args:{'FontHeight.Height':18}});
  assert.deepEqual(buildCommand(get('font-color'),'#FF0000'),{id:'font-color',uno:'.uno:Color',args:{Color:0xFF0000}});
  assert.deepEqual(buildCommand(get('ins-table'),{rows:2,columns:5}).args,{Columns:5,Rows:2});
  assert.deepEqual(buildCommand(get('ratio-43')).args,{'AttributePageSize.Width':28000,'AttributePageSize.Height':21000});
  assert.deepEqual(buildCommand(get('ins-image')),{id:'ins-image',action:'pickImage'});
  assert.throws(()=>buildCommand(get('font-color'),'red'),/颜色/);
});
