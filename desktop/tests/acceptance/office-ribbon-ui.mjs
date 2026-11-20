// [lane:ribbon] Renders the ribbon in headless Chrome with a stub Office API and screenshots every tab.
// Run: CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node tests/acceptance/office-ribbon-ui.mjs [outDir]
import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {chromium} from 'playwright-core';
const root=fileURLToPath(new URL('../../src/',import.meta.url)),out=process.argv[2]||'/tmp';
const server=createServer(async(req,res)=>{try{const f=path.resolve(root,'.'+new URL(req.url,'http://l').pathname);if(!f.startsWith(root))throw Error();res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
const errors=[],calls=[];
try{const page=await browser.newPage({viewport:{width:1568,height:600}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.exposeFunction('host',async(op,p)=>{calls.push([op,p]);const meta={name:'demo',format:'pptx',revision:1,dirty:false,sequence:0};
  if(op==='info')return {...meta,messages:[],models:[]};
  if(op==='snapshot')return {...meta,png:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',width:1,height:1,x:0,y:0,scale:15,documentWidth:15875,documentHeight:8930,parts:['1'],part:0,selection:'',selectionType:1,events:{},states:{'.uno:Bold':'true','.uno:CharFontName':'微软雅黑','.uno:FontHeight':'18','.uno:CenterPara':'true'},history:{undo:1,redo:0}};
  return meta;});
 await page.addInitScript(()=>{window.willbuddyOffice={invoke:(op,p)=>window.host(op,p),onError:()=>{}};});
 await page.goto('http://127.0.0.1:'+server.address().port+'/office/index.html');await page.locator('#status').filter({hasText:'已保存'}).waitFor();
 for(const t of ['home','insert','beautify','transition','animation','show','view']){await page.evaluate(n=>window.wbBus.emit('ribbon:tab',{name:n}),t);await page.locator('#wb-tabs').screenshot({path:path.join(out,'tabs.png')});await page.locator('#wb-ribbon').screenshot({path:path.join(out,'ribbon-'+t+'.png')});}
 await page.evaluate(()=>window.wbBus.emit('view:set',{mode:'master'}));await page.locator('#wb-ribbon').screenshot({path:path.join(out,'ribbon-master.png')});
 const masterTabs=await page.locator('#wb-tabs .wb-tab').allTextContents();
 await page.evaluate(()=>window.wbBus.emit('view:set',{mode:'normal'}));await page.evaluate(()=>window.wbBus.emit('ribbon:tab',{name:'home'}));
 await page.locator('[data-id="bold"]').first().click();await page.locator('[data-id="font-size"]').first().click();await page.locator('.wb-pop .wb-menu-item',{hasText:/^24$/}).click();
 await page.locator(`[data-id="print"]`).first().click({force:true});
 await page.evaluate(()=>window.wbBus.emit('ribbon:tab',{name:'insert'}));await page.locator('[data-id="ins-table"]').first().click();await page.locator('.wb-cell[data-r="2"][data-c="3"]').hover();await page.screenshot({path:path.join(out,'table-grid.png')});await page.locator('.wb-cell[data-r="2"][data-c="3"]').click();
 await new Promise(r=>setTimeout(r,300));
 const state=await page.evaluate(()=>({bold:document.querySelector('[data-id="bold"]')?.getAttribute('aria-pressed')}));
 console.log(JSON.stringify({errors,masterTabs,ops:calls.filter(c=>c[0]==='operation').map(c=>c[1]),state},null,1));
}finally{await browser.close();server.close();}
