import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateUno,colorToLong,UNO_COMMANDS,LEGACY_COMMANDS,mapUnoStates,parseStatePayload} from '../src/shared/office-uno.js';
import {resolveCommand,statePayloads,STATE_IDS,installCommands} from '../src/office/commands.js';
import {bus} from '../src/office/bus.js';
test('whitelist rejects unknown, malformed and dangerous commands',()=>{
  for(const c of ['.uno:Open','.uno:Quit','.uno:RunMacro','.uno:Bold','Bold','.uno:','.uno:Strikeout ','.uno:Strikeout\n',null,5,'.uno:__proto__','.uno:constructor'])assert.throws(()=>validateUno(c),/UNO/,String(c));
  assert.deepEqual(validateUno('.uno:Strikeout'),{command:'.uno:Strikeout',args:null});
  for(const c of LEGACY_COMMANDS)assert.ok(!(c in UNO_COMMANDS));
});
test('arguments are strictly typed, bounded and exact',()=>{
  const f=(c,a,o)=>()=>validateUno(c,a,o);
  assert.deepEqual(validateUno('.uno:FontHeight',{'FontHeight.Height':18}).args,{'FontHeight.Height':{type:'float',value:18}});
  assert.deepEqual(validateUno('.uno:Color',{Color:16711680}).args,{Color:{type:'long',value:16711680}});
  assert.throws(f('.uno:FontHeight',{'FontHeight.Height':0}),/范围/);assert.throws(f('.uno:FontHeight',{'FontHeight.Height':'18'}),/范围/);assert.throws(f('.uno:FontHeight',{'FontHeight.Height':NaN}),/范围/);
  assert.throws(f('.uno:FontHeight',{}),/缺少/);assert.throws(f('.uno:FontHeight',{'FontHeight.Height':12,Extra:1}),/不允许/);
  assert.throws(f('.uno:Strikeout',{x:1}),/不允许/);assert.throws(f('.uno:Strikeout',[]),/对象/);
  assert.throws(f('.uno:Color',{Color:-1}),/范围/);assert.throws(f('.uno:Color',{Color:0x1000000}),/范围/);assert.throws(f('.uno:Color',{Color:1.5}),/整数/);
  assert.throws(f('.uno:CharFontName',{'CharFontName.FamilyName':'A"; rm'}),/无效/);assert.throws(f('.uno:CharFontName',{'CharFontName.FamilyName':''}),/无效/);assert.throws(f('.uno:CharFontName',{'CharFontName.FamilyName':'x'.repeat(81)}),/无效/);
  assert.doesNotThrow(f('.uno:CharFontName',{'CharFontName.FamilyName':'微软雅黑'}));assert.doesNotThrow(f('.uno:CharFontName',{'CharFontName.FamilyName':'Times New Roman'}));
  assert.throws(f('.uno:InsertTable',{Columns:9,Rows:1}),/范围/);assert.throws(f('.uno:InsertTable',{Columns:0,Rows:1}),/范围/);
  assert.deepEqual(validateUno('.uno:InsertTable',{Columns:3,Rows:2},{format:'pptx'}).args.Rows.value,2);
  assert.throws(f('.uno:InsertTable',{Columns:3,Rows:2},{format:'docx'}),/文档类型/);
  assert.throws(f('.uno:AttributePageSize',{'AttributePageSize.Width':10,'AttributePageSize.Height':15750}),/范围/);
});
test('InsertGraphic is internal-only so the renderer cannot choose a file',()=>{
  const a={FileName:'file:///tmp/x.png'};assert.throws(()=>validateUno('.uno:InsertGraphic',a,{format:'pptx'}),/内部/);assert.doesNotThrow(()=>validateUno('.uno:InsertGraphic',a,{format:'pptx',allowInternal:true}));
  assert.throws(()=>resolveCommand({uno:'.uno:InsertGraphic',args:a},'pptx'),/内部/);
});
test('colorToLong',()=>{assert.equal(colorToLong('#0078cb'),0x0078cb);for(const c of ['0078cb','#fff','#GGGGGG',5,null])assert.throws(()=>colorToLong(c),/颜色/);});
test('resolveCommand routes legacy, uno and image commands',()=>{
  assert.deepEqual(resolveCommand({id:'bold',uno:'.uno:Bold'},'pptx'),{kind:'legacy',command:'.uno:Bold'});
  assert.deepEqual(resolveCommand({id:'x',uno:'.uno:Grow'},'pptx'),{kind:'uno',command:'.uno:Grow',args:null});
  assert.deepEqual(resolveCommand({id:'i',action:'pickImage'},'pptx'),{kind:'pickImage'});
  for(const bad of [null,{},{uno:'.uno:Save'},{uno:'.uno:Color',args:{Color:'red'}}])assert.throws(()=>resolveCommand(bad,'pptx'));
});
test('STATE_CHANGED payload parsing and mapping to button state',()=>{
  assert.deepEqual(parseStatePayload('.uno:Bold=true'),{name:'.uno:Bold',value:'true'});assert.deepEqual(parseStatePayload('.uno:CharFontName=Noto Sans=x'),{name:'.uno:CharFontName',value:'Noto Sans=x'});
  for(const b of ['nope','Bold=true',5,'.uno:=1'])assert.equal(parseStatePayload(b),null);
  const m=mapUnoStates({'.uno:Bold':'true','.uno:Italic':'false','.uno:CharFontName':'微软雅黑','.uno:FontHeight':'18','.uno:LeftPara':'true'});
  assert.deepEqual(m.checked,{bold:true,italic:false,left:true});assert.equal(m.font,'微软雅黑');assert.equal(m.size,'18');
  assert.equal(mapUnoStates({'.uno:FontHeight':'10.5'}).size,'10.5');assert.equal(mapUnoStates({'.uno:FontHeight':'x'}).size,'');assert.deepEqual(mapUnoStates(null).checked,{});
  const p=statePayloads({'.uno:Bold':'true','.uno:CharFontName':'Arial','.uno:FontHeight':'12'});
  assert.deepEqual(p.find(x=>x.id==='bold'),{id:'bold',checked:true});assert.equal(p.find(x=>x.id==='font-name').value,'Arial');assert.equal(p.find(x=>x.id==='font-size').value,'12');
  assert.equal(STATE_IDS.strikeout,'strike');
  const e=mapUnoStates({'.uno:BringToFront':'enabled','.uno:FormatGroup':'disabled','.uno:Undo':'enabled'});assert.equal(e.object,true);assert.deepEqual(e.enabled,{'group-group':false,'arrange-front':true});
  assert.equal(mapUnoStates({'.uno:BringToFront':'disabled'}).object,false);
  assert.deepEqual(statePayloads({'.uno:FormatGroup':'enabled'}).find(x=>x.id==='group-group'),{id:'group-group',enabled:true});
});
test('installCommands dispatches through host and publishes command:state once per change',async()=>{
  const calls=[],host={info:()=>({format:'pptx'}),perform:async(op,p)=>{calls.push([op,p]);},serial:async fn=>fn(),status(){},draw:async()=>{}};
  const api={invoke:async op=>op==='pickImage'?{status:'cancelled'}:{}},said=[],states=[];
  const off=installCommands({host,api,bus,say:t=>said.push(t)});const offS=bus.on('command:state',d=>states.push(d));
  bus.emit('command',{id:'undo',uno:'.uno:Undo'});bus.emit('command',{id:'sz',uno:'.uno:FontHeight',args:{'FontHeight.Height':20}});bus.emit('command',{id:'bad',uno:'.uno:Quit'});bus.emit('command',{id:'img',action:'pickImage'});
  await new Promise(r=>setTimeout(r,5));
  assert.deepEqual(calls,[['command',{command:'.uno:Undo'}],['uno',{command:'.uno:FontHeight',args:{'FontHeight.Height':20}}]]);assert.equal(said.length,1);
  bus.emit('office:shot',{states:{'.uno:Bold':'true'}});const n=states.length;assert.ok(n>0);bus.emit('office:shot',{states:{'.uno:Bold':'true'}});assert.equal(states.length,n);
  off();offS();bus.emit('command',{id:'u',uno:'.uno:Grow'});assert.equal(calls.length,2);
});
