import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeOcrDocument,ocrSourceForRange} from '../runtime/ocr-provenance.mjs';
import {createHash} from 'node:crypto';
import {searchKnowledge} from '../runtime/knowledge-search.mjs';
import {recordKnowledgeEvidence} from '../services/knowledge-evidence.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
function document(){const original={name:'report.pdf',sha256:'a'.repeat(64)},made=makeOcrDocument(original,[{page:2,text:'alpha '.repeat(350)},{page:3,text:'beta '.repeat(350)}]);return {id:'d',name:'OCR',format:'md',revision:1,sha256:sha(made.text),text:made.text,ocrProvenance:made.provenance};}
test('long OCR page chunks retain the real original PDF page and hash',()=>{const d=document(),r=searchKnowledge([d],'beta');const m=r.matches.find(x=>x.offset>d.text.indexOf('## 第 3 页'));assert.ok(m);assert.deepEqual(ocrSourceForRange(d,m.offset,m.endOffset),{name:'report.pdf',sha256:'a'.repeat(64),pages:[3]});const boundary=d.text.indexOf('## 第 3 页');assert.deepEqual(ocrSourceForRange(d,boundary-10,boundary+10).pages,[2,3]);});
test('changed text, altered hash, invalid ranges and non OCR sources cannot assert a page',()=>{const d=document(),i=d.text.indexOf('alpha');assert.equal(ocrSourceForRange({...d,text:d.text+'x'},i,i+5),null);assert.equal(ocrSourceForRange({...d,sha256:'b'.repeat(64)},i,i+5),null);const bad=structuredClone(d);bad.ocrProvenance.ranges[0].end=999999;assert.equal(ocrSourceForRange(bad,i,i+5),null);assert.equal(ocrSourceForRange({...d,ocrProvenance:undefined},i,i+5),null);});
test('evidence derives PDF pages from the live OCR record, ignoring forged model claims',()=>{const d=document(),r=searchKnowledge([d],'beta'),m=r.matches[0];m.ocrSource={name:'forged',sha256:'f'.repeat(64),pages:[99]};const chat={};recordKnowledgeEvidence(chat,'r',r,[d]);const row=chat.knowledgeEvidence[0].matches[0];assert.equal(row.ocrSource.name,'report.pdf');assert.ok(!row.ocrSource.pages.includes(99));assert.deepEqual(row.ocrSource,ocrSourceForRange(d,m.offset,m.endOffset));});
test('evidence page labels escape persisted source fields in the UI',async()=>{const {knowledgeEvidence}=await import('../src/ui/knowledge-evidence.js');const chat={knowledgeEvidence:[{runId:'r',time:0,sources:[],matches:[{source:{id:'d',name:'x',revision:1,sha256:'z'},line:1,endLine:1,offset:0,endOffset:1,text:'x',ocrSource:{name:'<img>',sha256:'" onload=',pages:['<svg>']}}]}]};const html=knowledgeEvidence(chat,'r',[]);assert.ok(!html.includes('<img>'));assert.ok(!html.includes('<svg>'));assert.ok(html.includes('&lt;img&gt;'));assert.ok(html.includes('&lt;svg&gt;'));});
test('provenance changed during an approved read rejects the whole search',async()=>{const {createAgentSession}=await import('../services/agent-session.mjs');const d=document(),agent={id:'a',name:'test',prompt:'test',knowledge:[d.id],tools:[]},store={data:{agents:[agent],documents:[d]},save:async()=>{},log:()=>{}};const session=await createAgentSession({agent,store,runId:'r',executeTool:async()=>{const snapshot=structuredClone(d);d.ocrProvenance.name='changed.pdf';return {status:'succeeded',document:snapshot};}});try{await assert.rejects(session.execute('knowledge_search',{query:'alpha'}),/已变化/);}finally{await session.close();}});
test('forged OCR excerpt cannot become a historical page citation',()=>{const d=document(),r=searchKnowledge([d],'alpha');r.matches[0].text='X'.repeat(r.matches[0].text.length);const chat={};assert.throws(()=>recordKnowledgeEvidence(chat,'r',r,[d]),/摘录与来源不一致/);assert.equal(chat.knowledgeEvidence,undefined);});
test('corrupt null provenance ranges and boxes do not crash retrieval',()=>{const d=document(),i=d.text.indexOf('alpha');d.ocrProvenance.ranges[0]=null;assert.equal(ocrSourceForRange(d,i,i+5),null);});
test('PDF renderer identity survives source evidence and is bound to geometry',()=>{
 const source={name:'x.pdf',sha256:'a'.repeat(64),renderer:'pdfium-wasm-v1'};
 const made=makeOcrDocument(source,[{page:1,text:'alpha',coordinateSpace:{unit:'pixel',origin:'top-left',width:10,height:10,rasterSha256:'b'.repeat(64)},boxes:[{text:'alpha',textStart:0,textEnd:5,x:1,y:1,w:3,h:4}]}]);
 const doc={format:'md',text:made.text,sha256:sha(made.text),ocrProvenance:made.provenance},start=made.text.indexOf('alpha');
 assert.equal(ocrSourceForRange(doc,start,start+5).renderer,'pdfium-wasm-v1');
 assert.equal(ocrSourceForRange(doc,start,start+5).regions[0].rasterSha256,'b'.repeat(64));
 doc.ocrProvenance.ranges[0].coordinateSpace.rasterSha256='c'.repeat(64);assert.equal(ocrSourceForRange(doc,start,start+5),null);
 doc.ocrProvenance.ranges[0].coordinateSpace.rasterSha256='b'.repeat(64);
 doc.ocrProvenance.renderer='poppler-v1';assert.equal(ocrSourceForRange(doc,start,start+5),null);
 doc.ocrProvenance.renderer='invented';assert.equal(ocrSourceForRange(doc,start,start+5),null);
 assert.throws(()=>makeOcrDocument({...source,renderer:'invented'},[]),/渲染来源/);
});
test('PDF filename is escaped in Markdown without changing its stored identity',()=>{
 const name='source[link](https://example.com)_#<x>.pdf';
 const made=makeOcrDocument({name,sha256:'a'.repeat(64),renderer:'poppler-v1'},[{page:1,text:'alpha'}]);
 assert.equal(made.provenance.name,name);
 assert.ok(made.text.includes('source\\[link\\](https://example.com)\\_\\#\\<x\\>.pdf'));
 const doc={format:'md',text:made.text,sha256:sha(made.text),ocrProvenance:made.provenance},start=made.text.indexOf('alpha');
 assert.equal(ocrSourceForRange(doc,start,start+5).name,name);
});
