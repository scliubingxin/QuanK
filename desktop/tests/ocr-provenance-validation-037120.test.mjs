import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeOcrDocument} from '../runtime/ocr-provenance.mjs';
import {importChatPdf} from '../services/pdf-chat-import.mjs';

const source={name:'scan.pdf',sha256:'a'.repeat(64),totalPages:3};
const page=n=>({page:n,text:'identified'});
test('malformed OCR provenance is rejected before creating a document',()=>{
 for(const pages of [[],[page(2),page(1)],[page(1),page(1)],[page(4)],[{page:1,text:12}],Array.from({length:6},(_,i)=>page(i+1))])
   assert.throws(()=>makeOcrDocument(source,pages),/无效/);
 assert.throws(()=>makeOcrDocument({...source,sha256:'bad'},[page(1)]),/无效/);
 assert.throws(()=>makeOcrDocument(source,[{page:1,text:'x',coordinateSpace:null,boxes:[]}]),/无效/);
 assert.throws(()=>makeOcrDocument(source,[{page:1,text:'x',boxes:[]}]),/无效/);
 assert.throws(()=>makeOcrDocument(source,[{page:1,text:'x'.repeat(30001)}]),/无效/);
});
test('overlapping OCR text boxes are rejected instead of saving unusable evidence',()=>{
 const coordinateSpace={unit:'pixel',origin:'top-left',width:100,height:100};
 const boxes=[{text:'id',textStart:0,textEnd:2,x:1,y:1,w:5,h:5},{text:'de',textStart:1,textEnd:3,x:8,y:1,w:5,h:5}];
 assert.throws(()=>makeOcrDocument(source,[{page:1,text:'identified',coordinateSpace,boxes}]),/无效/);
});
test('an invalid OCR page result never reaches document persistence',async()=>{
 let saved=0;const bytes=Buffer.from('%PDF-synthetic');
 await assert.rejects(importChatPdf({file:'/tmp/scan.pdf',read:async()=>bytes,confirm:async()=> 'eng',tools:async()=>({}),directory:'/tmp',recognize:async({source:s})=>({source:{...s,totalPages:3},pages:[page(2),page(1)]}),documents:{importFile:async()=>{saved++;}}}),/无效|范围/);
 assert.equal(saved,0);
});
test('OCR adapter cannot replace the selected PDF identity before persistence',async()=>{
 const bytes=Buffer.from('%PDF-synthetic');let saved=0;
 for(const changes of [{sha256:'f'.repeat(64)},{name:'different.pdf'}]){
  await assert.rejects(importChatPdf({file:'/tmp/scan.pdf',read:async()=>bytes,confirm:async()=> 'eng',tools:async()=>({}),directory:'/tmp',recognize:async({source:s})=>({source:{...s,...changes,totalPages:3},pages:[page(1)]}),documents:{importFile:async()=>{saved++;}}}),/来源/);
 }
 assert.equal(saved,0);
});
test('OCR adapter cannot add unapproved pages or silently return a partial range',async()=>{
 const bytes=Buffer.from('%PDF-synthetic');let saved=0;
 for(const pages of [[page(2),page(4)],[page(2)],[page(1),page(2),page(3)]]){
  await assert.rejects(importChatPdf({file:'/tmp/scan.pdf',range:{startPage:2,endPage:3},read:async()=>bytes,confirm:async()=> 'eng',tools:async()=>({}),directory:'/tmp',recognize:async({source:s})=>({source:{...s,totalPages:4},pages}),documents:{importFile:async()=>{saved++;}}}),/范围/);
 }
 assert.equal(saved,0);
});
test('default first-five consent cannot silently include additional pages',async()=>{
 const bytes=Buffer.from('%PDF-synthetic');let saved=0;
 await assert.rejects(importChatPdf({file:'/tmp/scan.pdf',read:async()=>bytes,confirm:async()=> 'eng',tools:async()=>({}),directory:'/tmp',recognize:async({source:s})=>({source:{...s,totalPages:6},pages:[1,2,3,4,5,6].map(page)}),documents:{importFile:async()=>{saved++;}}}),/范围/);
 assert.equal(saved,0);
});
