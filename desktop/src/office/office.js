import {createCanvasView} from './canvas-view.js';// [lane:render]
import {bus} from './bus.js';import './pages.js'; // [lane:pages]
import {fitOfficePage,stepOfficeZoom,officeSlideTileSize} from '../shared/office-zoom.js';
import {officeNavigationEvent,officeTypingEvent} from '../shared/office-navigation.js';
import {officeTsvMatrix} from '../shared/office-tsv.js';
import {officeHistory,historyCommandAvailable} from '../shared/office-history.js';
const api=window.willbuddyOffice,$=s=>document.querySelector(s),canvas=$('#document');let shot,info,busy=false,drag,queue=Promise.resolve();
let editingBusy=false,manualSelection=null,editGeneration=0,promptGeneration=0;
$('#edit-text').addEventListener('input',()=>editGeneration++);
$('#prompt').addEventListener('input',()=>promptGeneration++);
function historyButtons(){for(const b of document.querySelectorAll('[data-command]'))if(['.uno:Undo','.uno:Redo'].includes(b.dataset.command)){b.disabled=editingBusy||!historyCommandAvailable(shot?.history,b.dataset.command);const key=b.dataset.command==='.uno:Undo'?'undo':'redo',n=officeHistory(shot?.history)[key];b.title=n===null?'内核历史状态尚不可用':n===0?'当前没有可'+(key==='undo'?'撤销':'重做')+'的操作':'可'+(key==='undo'?'撤销':'重做')+' '+n+' 步';}}
historyButtons();
function error(e){let text=String(e.message||e);if(text.includes('PPT text edit selection required'))text='请先双击幻灯片文字进入编辑状态，再选择文字。';$('#error').hidden=false;$('#error').textContent=text;$('#status').textContent='操作未完成';void api.invoke('info').then(s=>{$('#discard').disabled=!s.dirty;}).catch(()=>{});}
function status(s){$('#discard').disabled=!s.dirty;if(info&&info.revision!==s.revision)$('#action-status').textContent='';info=s;$('#name').textContent=s.name+'.'+s.format;$('#status').textContent=s.dirty?'尚未保存 · 请重试保存':'已保存 · v'+s.revision;}
function messages(rows=[]){$('#messages').replaceChildren(...rows.map(m=>{const p=document.createElement('div');p.className='message '+m.role+(m.error?' error':'');p.textContent=m.content;return p;}));$('#messages').scrollTop=$('#messages').scrollHeight;}
async function draw(){const s=await view.render();shot=s;bus.emit('office:shot',s);syncPan();historyButtons();status(s);$('#selection').textContent=s.selection?'当前选区：'+s.selection+(s.cells?' · Excel区域 '+s.cells.ref+'（'+s.cells.rows+'×'+s.cells.columns+'）':s.table?' · 表格区域 '+s.table.rows+'×'+s.table.columns:''):'点击或拖选正文；也可先全选';$('#parts').replaceChildren(...s.parts.map((name,i)=>{const b=document.createElement('button');b.textContent=name||'第'+(i+1)+'页';b.className=i===s.part?'active':'';b.addEventListener('click',()=>perform('part',{part:i}));return b;}));emitPages(s);}
function serial(fn){const p=queue.then(async()=>{editingBusy=true;historyButtons();$('#error').hidden=true;try{return await fn();}catch(e){if(shot)shot={...shot,history:null};error(e);}finally{editingBusy=false;historyButtons();}});queue=p;return p;}
function perform(op,p){return serial(async()=>{status(await api.invoke('operation',{...p,op}));if(op==='part')view.resetPan();await draw();});}
for(const b of document.querySelectorAll('[data-command]'))b.addEventListener('click',()=>perform('command',{command:b.dataset.command}));
let saving=false;
$('#discard').onclick=()=>{void serial(async()=>{const result=await api.invoke('discardDraft');if(result.status==='denied')$('#action-status').textContent='已取消放弃草稿';});};$('#save').onclick=()=>{if(saving)return;saving=true;const b=$('#save');b.disabled=true;b.textContent='保存中…';$('#action-status').textContent='正在检查并保存当前文档…';void serial(async()=>{try{const saved=await api.invoke('save');status(saved);await draw();$('#action-status').textContent='已保存到成果中心 · v'+saved.revision+' · '+new Date().toLocaleTimeString();}catch(e){$('#action-status').textContent='保存未完成，请保留文档窗口后重试';throw e;}finally{saving=false;b.disabled=false;b.textContent='保存';}});};$('#edit-selection').onclick=()=>{if(!shot?.selection||(info.format==='pptx'&&shot.selectionType!==1)){error(Error('请先选择要修改的文字；PPT请双击普通文本框'));return;}manualSelection={sequence:shot.sequence,selection:shot.selection};editGeneration++;$('#cancel-selection').hidden=false;$('#edit-text').value=shot.selection;$('#edit-text').focus();$('#insert').textContent='保存选区修改';$('#action-status').textContent='已载入选区，修改下方文字后保存；切换选区会要求重新载入。';};$('#insert').onclick=()=>{if(info?.format==='xlsx'){writeExcelCells();return;}const text=$('#edit-text').value,generation=editGeneration;if(!text&&!manualSelection)return;if(manualSelection){const target=manualSelection,bound={...target,text};void serial(async()=>{const saved=await api.invoke('manualReplaceSelection',bound);status(saved);await draw();if(manualSelection===target){manualSelection=null;$('#cancel-selection').hidden=true;if(editGeneration===generation&&$('#edit-text').value===text)$('#edit-text').value='';$('#insert').textContent='写入文档';}$('#action-status').textContent='选区已保存到成果中心 · v'+saved.revision;});return;}void perform('paste',{text}).then(()=>{if($('#error').hidden&&editGeneration===generation&&$('#edit-text').value===text)$('#edit-text').value='';});};
function writeExcelCells(){if(!shot?.cells){error(Error('请先定位一个受支持的单元格区域'));return;}const text=$('#edit-text').value,generation=editGeneration,literal=$('#literal-cells').checked,bound={sequence:shot.sequence,selection:shot.selection,cells:{...shot.cells}};void serial(async()=>{const values=officeTsvMatrix(text,bound.cells,{literal});const saved=await api.invoke('manualUpdateCells',{...bound,values});status(saved);await draw();if(editGeneration===generation&&$('#edit-text').value===text)$('#edit-text').value='';$('#action-status').textContent='选中单元格已保存到成果中心 · v'+saved.revision;});};
$('#cancel-selection').onclick=()=>{editGeneration++;manualSelection=null;$('#cancel-selection').hidden=true;$('#edit-text').value='';$('#insert').textContent='写入文档';$('#action-status').textContent='已取消选区修改';};
// [lane:render] page-external clicks are not forwarded; drags may end outside the page (clamped).
// pointermove during a drag is forwarded so ribbon draw-mode can receive continuous coordinates.
canvas.addEventListener('pointerdown',e=>{if(!shot||busy)return;const p=view.point(e);if(!p)return;e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture?.(e.pointerId);drag=p;void serial(()=>api.invoke('operation',{op:'mouse',type:0,...p}));});
// [integ] 阶段1：按下期间把 pointermove 以内核鼠标移动类型转发（LOK_MOUSEEVENT_MOUSEMOVE=2，与白名单 type<=2 一致），
// 同一帧只发一次（requestAnimationFrame 节流，只保留最新坐标），pointerup 清空挂起状态后即停止。
let dragMovePoint=null,dragMoveFrame=false;
function flushDragMove(){dragMoveFrame=false;const p=dragMovePoint;dragMovePoint=null;if(!drag||!shot||!p)return;void api.invoke('operation',{op:'mouse',type:2,...p}).catch(()=>{});}
canvas.addEventListener('pointermove',e=>{if(!drag||!shot){dragMovePoint=null;return;}const p=view.point(e,{clamp:true});if(!p)return;dragMovePoint=p;if(dragMoveFrame)return;dragMoveFrame=true;if(typeof requestAnimationFrame==='function')requestAnimationFrame(flushDragMove);else setTimeout(flushDragMove,16);});
canvas.addEventListener('pointerup',e=>{if(!drag||!shot)return;const p=view.point(e,{clamp:true});drag=null;dragMovePoint=null;dragMoveFrame=false;if(!p)return;void serial(async()=>{await api.invoke('operation',{op:'mouse',type:2,...p});await api.invoke('operation',{op:'mouse',type:1,...p});await draw();});});
// [lane:render] claim zoom ownership so other scripts do not create a redundant zoom control
// [integ] 阶段1：模块顶层即置位 window.wbZoomOwner，外壳（shell）据此把缩放交给画布视图，不再注入重复缩放控件
window.wbZoomOwner = true;
// [lane:render] viewport/zoom/pan are handled by canvas-view.js; renders are coalesced into one serialized draw.
let renderQueued=false;function scheduleRender(){if(renderQueued)return;renderQueued=true;void serial(async()=>{renderQueued=false;await draw();});}
const view=createCanvasView({api,canvas,viewport:$('#viewport'),getFormat:()=>info?.format,schedule:scheduleRender});
function syncPan(){const slider=$('#pan-y'),max=Math.ceil(view.layout?.maxPanY||0);slider.max=String(max);slider.value=String(Math.max(0,Math.min(max,Math.round(view.layout?.panY||0))));slider.hidden=max===0;slider.setAttribute('aria-valuetext',max?Math.round(100*Number(slider.value)/max)+'%':'顶部');}
$('#pan-y').addEventListener('input',e=>view.panTo(Number(e.target.value)));
$('#up').onclick=()=>view.panBy(0,-0.9*($('#viewport').clientHeight||700));$('#down').onclick=()=>view.panBy(0,0.9*($('#viewport').clientHeight||700));
function showAI(){ $('#ai').hidden=false;$('#toggle-ai').setAttribute('aria-expanded','true');$('#prompt').focus();}$('#toggle-ai').onclick=()=>{$('#ai').hidden?showAI():($('#ai').hidden=true);};$('#close-ai').onclick=()=>$('#ai').hidden=true;$('#selection-ai').onclick=()=>{showAI();if(shot?.selection)$('#prompt').placeholder='如何修改当前选区？';};
$('#cancel').onclick=()=>api.invoke('cancel').catch(error);$('#ask').onsubmit=e=>{e.preventDefault();if(busy)return;busy=true;$('#send').disabled=true;$('#cancel').hidden=false;$('#status').textContent='AI 正在处理…';const prompt=$('#prompt').value,generation=promptGeneration;
 // [p2-ux2] show the request and a thinking bubble at once; restore the text if the request fails
 const log=$('#messages'),mine=document.createElement('div'),wait=document.createElement('div');mine.className='message user';mine.textContent=prompt;wait.className='message assistant pending';wait.textContent='正在思考…';log.append(mine,wait);log.scrollTop=log.scrollHeight;$('#prompt').value='';const restore=()=>{if(!$('#prompt').value)$('#prompt').value=prompt;};
 void serial(async()=>{try{const result=await api.invoke('chat',{prompt,modelChoice:$('#model').value,shareDocument:true,documentConsent:{documentId:info.documentId,revision:info.revision,sha256:info.sha256,sequence:info.sequence}});messages(result.messages);if(result.error){error(result.error);restore();}else if(promptGeneration===generation&&$('#prompt').value===prompt)$('#prompt').value='';await draw();}catch(err){mine.remove();wait.remove();restore();throw err;}finally{busy=false;$('#send').disabled=false;$('#cancel').hidden=true;}});};
api.onError?.(error);void serial(async()=>{info=await api.invoke('info');status(info);$('#editor').setAttribute('data-format',info.format);$('#cell-nav').hidden=info.format!=='xlsx';$('#literal-cells-option').hidden=info.format!=='xlsx';$('#excel-edit-hint').hidden=info.format!=='xlsx';if(info.format==='xlsx'){$('#insert').textContent='写入选中单元格';$('#insert').title='写入当前同尺寸选区，覆盖原内容';}$('#edit-selection').hidden=!['pptx','docx'].includes(info.format);if(info.format==='xlsx')document.querySelector('[data-command=".uno:SelectAll"]').disabled=true;messages(info.messages);for(const m of info.models||[]){if(!m.enabled)continue;const o=document.createElement('option');o.value=m.id;o.textContent=m.name;$('#model').append(o);}await draw();});

canvas.addEventListener('dblclick',e=>{if(!shot||busy)return;const p=view.point(e);if(!p)return;void serial(async()=>{await api.invoke('operation',{op:'mouse',type:0,count:2,...p});await api.invoke('operation',{op:'mouse',type:1,count:2,...p});await draw();});});

$('#goto-cell').onclick=()=>perform('range',{ref:$('#cell-ref').value.trim().toUpperCase()});

$('#prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();if(!busy&&$('#prompt').value.trim())$('#ask').requestSubmit();}});

// Bound the repeat backlog; each accepted key is serialized with edits and AI consent.
let pendingNavigation=0;
canvas.addEventListener('keydown',e=>{
 if(!['docx','pptx'].includes(info?.format))return;
 const navigation=officeNavigationEvent(e);
 if(!navigation){
  const typed=officeTypingEvent(e);if(!typed||busy||editingBusy||pendingNavigation||!shot)return;
  e.preventDefault();const input=$('#edit-text');
  // Preserve an existing draft. An existing target is never rebound by a
  // later canvas key; its sequence check remains active until save/cancel.
  if(!manualSelection&&!input.value&&shot.selection&&(info.format==='docx'||shot.selectionType===1)){manualSelection={sequence:shot.sequence,selection:shot.selection};$('#cancel-selection').hidden=false;$('#insert').textContent='保存选区修改';}
  input.focus();input.setRangeText(typed,input.selectionStart,input.selectionEnd,'end');editGeneration++;
  $('#action-status').textContent='请在输入框继续编辑，完成后点击写入文档；内容暂未保存。';return;
 }
 e.preventDefault();
 if(busy||pendingNavigation>=16)return;
 pendingNavigation++;
 void perform('navigate',navigation).finally(()=>{pendingNavigation--;});
});
// [lane:pages] slide navigation + page events. slide:goto replaces the old bottom "Slide 1…N" button handler (those buttons still work).
let pagesLast={part:null,count:null};
function emitPages(s){if(info?.format!=='pptx')return;bus.emit('doc:drawn',{part:s.part,count:s.parts.length,names:s.parts,revision:info.revision,sequence:info.sequence});if(pagesLast.count!==null&&pagesLast.count!==s.parts.length)bus.emit('slides:changed',{count:s.parts.length});if(pagesLast.part!==s.part||pagesLast.count!==s.parts.length)bus.emit('slide:changed',{index:s.part,count:s.parts.length});pagesLast={part:s.part,count:s.parts.length};}
bus.on('slide:goto',({index}={})=>{if(!shot||!Number.isInteger(index)||index<0||index>=shot.parts.length||index===shot.part)return;void perform('part',{part:index});});
bus.on('doc:refresh',()=>{void serial(()=>draw());});


// [lane:ribbon] host handle for commands.js/ribbon.js: serialized operations, status and the latest snapshot.
window.wbOfficeHost={serial,perform,draw,status,shot:()=>shot,info:()=>info,view,error};// [excel] view/error for the sheet UIwindow.dispatchEvent?.(new Event('wb-office-host'));
