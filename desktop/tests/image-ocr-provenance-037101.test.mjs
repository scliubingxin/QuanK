import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeImageOcrDocument,imageOcrSourceForRange,ocrSourceForRange} from '../runtime/ocr-provenance.mjs';
import {recordKnowledgeEvidence} from '../services/knowledge-evidence.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const src={name:'原始图片.png',sha256:'a'.repeat(64)};
const result={text:'ALPHA 12345',coordinateSpace:{unit:'pixel',origin:'top-left',width:500,height:100},boxesTruncated:false,boxes:[{text:'ALPHA',textStart:0,textEnd:5,x:10,y:20,w:50,h:20},{text:'12345',textStart:6,textEnd:11,x:65,y:20,w:50,h:20}]};
function fixture(){const {text,provenance}=makeImageOcrDocument(src,result);return {id:'doc',name:'识别',format:'md',revision:1,text,sha256:sha(text),ocrProvenance:provenance};}
test('validated image OCR metadata identifies exact original image pixel boxes',()=>{
 const doc=fixture(),start=doc.text.indexOf('12345'),source=imageOcrSourceForRange(doc,start,start+5);
 assert.equal(source.sha256,src.sha256);assert.equal(source.name,src.name);assert.equal(source.coordinateSpace,'image-pixel-top-left');
 assert.deepEqual(source.regions,[{start,end:start+5,x:65,y:20,w:50,h:20}]);assert.equal(ocrSourceForRange(doc,start,start+5),null);
});
test('changed OCR text, geometry or document metadata never yield image citations',()=>{
 for(const mutate of [
  d=>d.text+='x',
  d=>d.ocrProvenance.geometry.boxes[0].x=9999,
  d=>d.ocrProvenance.geometrySha256='broken',
  d=>d.ocrProvenance.textSha256='broken',
  d=>d.sha256='b'.repeat(64),
  d=>d.ocrProvenance.kind='other',
 ]){
  const doc=fixture(),start=doc.text.indexOf('12345');mutate(doc);assert.equal(imageOcrSourceForRange(doc,start,start+5),null);
 }
});
test('forged model source is discarded and snapshots recompute live provenance',()=>{
 const doc=fixture(),start=doc.text.indexOf('12345'),match={source:{id:doc.id,name:doc.name,revision:1,sha256:doc.sha256},text:'12345',offset:start,endOffset:start+5,line:1,endLine:1,imageOcrSource:{name:'forged'}};
 const chat={};recordKnowledgeEvidence(chat,'r',{status:'succeeded',matches:[match],sources:[match.source]},[doc]);
 assert.equal(chat.knowledgeEvidence[0].matches[0].imageOcrSource.name,src.name);
 match.text='XXXXX';assert.throws(()=>recordKnowledgeEvidence({},'r',{status:'succeeded',matches:[match],sources:[match.source]},[doc]),/不一致/);
});
test('invalid bounds and mismatched OCR word text are rejected before document creation',()=>{
 for(const bad of [{...result,boxes:[{...result.boxes[0],x:500}]},{...result,boxes:[{...result.boxes[0],text:'wrong'}]}])assert.throws(()=>makeImageOcrDocument(src,bad),/位置/);
});

