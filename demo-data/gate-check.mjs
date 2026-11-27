import { spawn, execSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, rmSync, readdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
const APP='/Users/liubingxin/wb-par/QuanK-wt/v106/desktop', ELECTRON=path.join(APP,'node_modules/.bin/electron');
const UD='/private/tmp/shots106-ud', SEED='/private/tmp/shots106-seed.json', PORT=9275;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUTJ='/private/tmp/shots106-gate.json';
const PH='暂无数据|还没有|没有数据|加载中|空成果|（空文档）|未计算|— 综合分';
try{execSync(`pkill -9 -f 'user-data-dir=${UD}' || true`)}catch{}
rmSync(UD,{recursive:true,force:true}); mkdirSync(UD,{recursive:true});
writeFileSync(path.join(UD,'workspace.json'),readFileSync(SEED));
const child=spawn(ELECTRON,['.',`--user-data-dir=${UD}`,`--remote-debugging-port=${PORT}`,'--remote-debugging-address=127.0.0.1'],{cwd:APP,stdio:['ignore','pipe','pipe'],detached:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',QUANK_SELFTEST:'1',QUANK_USER_DATA:UD}});
child.stdout.on('data',()=>{}); child.stderr.on('data',()=>{});
async function json(u,t=300){for(let i=0;i<t;i++){try{const r=await fetch(u);if(r.ok)return await r.json()}catch{}await sleep(500)}throw Error('CDP not ready')}
function cdp(url){const ws=new WebSocket(url);let id=0;const w=new Map();let dead=false;
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&w.has(m.id)){const{res,rej}=w.get(m.id);w.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result)}};
 ws.onclose=()=>{dead=true;for(const{rej}of w.values())rej(new Error('WS closed'));w.clear()};
 const ready=new Promise((a,b)=>{ws.onopen=a;ws.onerror=()=>b(new Error('ws fail'))});
 const send=(method,params={})=>ready.then(()=>new Promise((res,rej)=>{const n=++id;w.set(n,{res,rej});ws.send(JSON.stringify({id:n,method,params}))}));
 const ev=async(expr,ms=8000)=>{const p=send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});const r=await Promise.race([p,new Promise((_,rj)=>setTimeout(()=>rj(new Error('EVAL TIMEOUT')),ms))]);if(r.exceptionDetails)throw new Error('EVAL EXC');return r.result.value};
 return {send,ev,close:()=>ws.close(),dead:()=>dead}}
const A=(a,id)=>{const sel='[data-action="'+a+'"]'+(id?'[data-id="'+id+'"]':'');const q=JSON.stringify(sel);return '(()=>{const b=[...document.querySelectorAll('+q+')].find(x=>x.offsetParent!==null)||document.querySelector('+q+');if(b){b.click();return true}return false})()'};
const PG=p=>'(()=>{const el=[...document.querySelectorAll(\'[data-page="'+p+'"]\')];const b=el.find(x=>x.offsetParent!==null)||el[0];const g=b&&b.closest(".nav-group");if(g)g.dispatchEvent(new MouseEvent("mouseenter",{bubbles:true}));if(b){b.click();return true}return false})()';
const SCROLL=sel=>'(()=>{const e=document.querySelector('+JSON.stringify(sel)+');if(!e)return false;e.scrollIntoView({block:"start"});return true})()';
const TXT=t=>'(()=>{const h=[...document.querySelectorAll("h1,h2,h3")].find(x=>(x.innerText||"").includes('+JSON.stringify(t)+'));if(!h)return false;const s=h.closest("section,.q-box")||h;s.scrollIntoView({block:"start"});return true})()';
const GATE=`(()=>{const re=new RegExp(${JSON.stringify(PH)},'g');const t=document.body.innerText;const hits=[...new Set(t.match(re)||[])];
 const ctx=hits.map(h=>{const i=t.indexOf(h);return t.slice(Math.max(0,i-28),i+h.length+16).split(String.fromCharCode(10)).join('/')});
 return {hits,ctx,head:t.replace(/\\s+/g,' ').slice(0,160)}})()`;
let c=null; const rows=[];
const PAGES=[
 {n:'01 工作台',s:[PG('home')],cnt:()=>`(()=>({chats:document.querySelectorAll('[data-action="openChat"]').length,poolRows:[...document.querySelectorAll('[data-action="quantOpen"]')].filter(e=>e.offsetParent!==null).length}))()`},
 {n:'02 行情',s:['(()=>{const b=[...document.querySelectorAll("button,div,span,a")].filter(x=>x.offsetParent!==null&&/查看行情/.test(x.innerText||"")).pop();if(b){b.click();return true}return false})()'],cnt:()=>`(()=>{const t=document.body.innerText;return {indices:(t.match(/上证指数|深证成指|创业板指/g)||[]).length,stocks:document.querySelectorAll('[data-action="mkStock"]').length}})()`},
 {n:'03 量化',s:[PG('home'),A('quantHome'),A('quantStart'),A('quantRefresh'),A('quantAdd')],w:20000,ev:1,cnt:()=>`(()=>({poolRows:[...document.querySelectorAll('[data-action="quantOpen"]')].filter(e=>e.offsetParent!==null).length,scores:(document.body.innerText.match(/综合分/g)||[]).length}))()`},
 {n:'04 600438 详情',s:[A('quantOpen','600438')],cnt:()=>`(()=>{const t=document.body.innerText;return {svgs:document.querySelectorAll('svg').length,research:!!document.querySelector('#researchBox')?1:0,kn:!!document.querySelector('#knowledgeBox')?1:0}})()`},
 {n:'05 财务与单季趋势',s:[`(()=>{const b=document.querySelector('[data-kn="finance"]');if(b)b.click();return !!b})()`,SCROLL('#knowledgeBox')],w:9000,cnt:()=>`(()=>({tables:document.querySelectorAll('#knowledgeBox table').length,svg:document.querySelectorAll('#knowledgeBox svg').length}))()`},
 {n:'06 公司关系图',s:[`(()=>{const b=document.querySelector('[data-kn="graph"]');if(b)b.click();return !!b})()`,SCROLL('#knowledgeBox')],w:9000,cnt:()=>`(()=>({svg:document.querySelectorAll('#knowledgeBox svg').length,nodes:document.querySelectorAll('#knowledgeBox svg text, #knowledgeBox svg g').length}))()`},
 {n:'07 投研资料(个股)',s:[SCROLL('#researchBox')],cnt:()=>`(()=>({items:document.querySelectorAll('#researchBox [data-action^="research"]').length}))()`},
 {n:'08 持仓与定投',s:[SCROLL('.q-holdings')],cnt:()=>`(()=>({rows:document.querySelectorAll('.q-holdings tr').length,plans:(document.querySelector('.q-holdings')?.innerText.match(/定投/g)||[]).length}))()`},
 {n:'09 组合与风控',s:[SCROLL('#portfolioBox')],w:6000,cnt:()=>`(()=>({total:/总资产/.test(document.querySelector('#portfolioBox')?.innerText||'')?1:0}))()`},
 {n:'10 风险指标/压力测试',s:[`(()=>{const b=document.querySelector('[data-pf="risk"]');if(b)b.click();return !!b})()`,SCROLL('#portfolioBox')],w:14000,cnt:()=>`(()=>({charts:document.querySelectorAll('#portfolioBox svg,#portfolioBox canvas').length}))()`},
 {n:'11 成果中心',s:[PG('library')],cnt:()=>`(()=>({docs:document.querySelectorAll('[data-action="documentView"]').length}))()`},
 {n:'12 文档预览 doc1',s:[A('documentView','doc1')],w:7000,cnt:()=>`(()=>({err:/无法读取/.test(document.body.innerText)?1:0,outline:document.querySelectorAll('[data-outline]').length}))()`},
 {n:'13 投研资料库',s:[PG('research')],cnt:()=>`(()=>({items:document.querySelectorAll('[data-action="researchOpen"]').length}))()`},
 {n:'14 知识库检索',s:[`(()=>{const i=document.querySelector('#knQuery');if(!i)return false;i.value='通威';i.dispatchEvent(new Event('input',{bubbles:true}));return true})()`,A('knSearch')],w:4000,cnt:()=>`(()=>{const r=document.querySelector('#knResults');return {len:r?r.innerText.length:0,hits:(r?.innerText.match(/共 \\d+ 处匹配/)||['0'])[0]}})()`},
 {n:'15 智能体',s:[PG('agents')],cnt:()=>`(()=>({agents:document.querySelectorAll('[data-action="useAgent"]').length}))()`},
 {n:'16 技能',s:[A('capabilityTab','skills')],cnt:()=>`(()=>({skills:document.querySelectorAll('[data-action^="skill"],[data-action^="pkg"],[data-action^="capab"]').length}))()`},
 {n:'17 连接·数据源',s:[PG('connectors')],cnt:()=>`(()=>({conns:document.querySelectorAll('[data-action="connectorSync"]').length}))()`},
 {n:'18 MCP',s:[PG('agents'),A('capabilityTab','mcp')],cnt:()=>`(()=>({mcp:document.querySelectorAll('[data-action^="mcp"],[data-action^="newMcp"]').length}))()`},
 {n:'19 定时任务',s:[PG('tasks'),A('taskTab','tasks')],cnt:()=>`(()=>({tasks:document.querySelectorAll('[data-action^="task"]').length}))()`},
 {n:'20 运行记录',s:[A('taskTab','runs')],cnt:()=>`(()=>({runs:document.querySelectorAll('[data-action^="run"],[data-action^="job"]').length,len:document.body.innerText.length}))()`},
 {n:'21 动态',s:[PG('feed')],cnt:()=>`(()=>({items:(document.body.innerText.match(/信号|委托单|行情提醒|定时任务|研报|风控提醒/g)||[]).length}))()`},
 {n:'22 知识图谱',s:[PG('graph')],w:7000,cnt:()=>`(()=>({svg:document.querySelectorAll('svg').length,nodes:document.querySelectorAll('svg circle,svg ellipse,svg text').length}))()`},
 {n:'23 记忆库',s:[PG('context')],cnt:()=>`(()=>({mems:document.querySelectorAll('[data-action="editMemory"]').length}))()`},
 {n:'24 安全与合规',s:[PG('security')],w:5000,cnt:()=>`(()=>{const t=document.body.innerText;return {audit:(t.match(/审计/g)||[]).length,egress:(t.match(/外发/g)||[]).length,len:t.length}})()`}];
async function waitPass(max=60000){const t0=Date.now();let last=null;
 while(Date.now()-t0<=max){try{last=await c.ev(GATE,6000)}catch(e){return{pass:false,waited:Math.round((Date.now()-t0)/1000),res:{hits:['EVAL:'+e.message],ctx:[]}}}
  if(!last.hits.length)return{pass:true,waited:Math.round((Date.now()-t0)/1000),res:last};await sleep(3000)}
 return{pass:false,waited:Math.round((Date.now()-t0)/1000),res:last}}
function save(){writeFileSync(OUTJ,JSON.stringify(rows,null,1))}
try{
 await json(`http://127.0.0.1:${PORT}/json/version`);
 let mk=null;for(let i=0;i<120&&!mk;i++){const f=readdirSync(UD).find(x=>/SELFTEST_USERDATA/.test(x));if(f)mk=path.join(UD,f);else await sleep(500)}
 if(!mk)throw Error('no marker');const m=JSON.parse(readFileSync(mk,'utf8'));if(m.userData!==UD)throw Error('ASSERT '+m.userData);
 let t=null;for(let i=0;i<240;i++){const l=await json(`http://127.0.0.1:${PORT}/json/list`);t=l.find(x=>x.type==='page'&&/index\.html/.test(x.url));if(t)break;await sleep(500)}
 c=cdp(t.webSocketDebuggerUrl);await c.send('Page.enable');await c.send('Runtime.enable');
 await c.send('Emulation.setDeviceMetricsOverride',{width:1192,height:777,deviceScaleFactor:1,mobile:false});
 await c.ev('new Promise(r=>setTimeout(r,6000))',15000);
 for(const p of PAGES){
  let cnt=null,note='';
  try{
   if(c.dead())throw Error('renderer gone');
   for(const s of p.s){try{await c.ev(s,6000)}catch(e){note+=(note?' ':'')+'step:'+e.message}await c.ev('new Promise(r=>setTimeout(r,1200))',8000)}
   await c.ev('new Promise(r=>setTimeout(r,'+(p.w||1800)+'))',(p.w||1800)+6000);
   const g=await waitPass();
   try{cnt=await c.ev(p.cnt(),6000)}catch(e){cnt={err:e.message}}
   rows.push({page:p.n,pass:g.pass,waited:g.waited,placeholders:g.res.hits,ctx:(g.res.ctx||[]).slice(0,3),count:cnt,note});
  }catch(e){rows.push({page:p.n,pass:false,waited:0,placeholders:['EXCEPTION'],ctx:[e.message],count:cnt,note});note=e.message}
  save();
 }
}catch(e){rows.push({page:'[FATAL]',pass:false,placeholders:['FATAL'],ctx:[e.message]});save()}
finally{if(c)try{c.close()}catch{};try{process.kill(-child.pid,'SIGKILL')}catch{};try{child.kill('SIGKILL')}catch{};setTimeout(()=>process.exit(0),600)}
