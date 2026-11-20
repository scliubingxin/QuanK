import test from 'node:test';
import assert from 'node:assert/strict';
import {embedLongTexts} from '../runtime/long-embedding.mjs';
function fake(limit,seen){return async batch=>{seen.push([...batch]);if(batch.some(t=>Array.from(t).length>limit)){let e=Error('token limit');e.code='WB_EMBED_TOKEN_LIMIT';throw e;}return batch.map(t=>[t.includes('中')?1:0,t.includes('文')?1:0,1]);};}
test('long text is split without losing Chinese or surrogate pairs and original order is kept',async()=>{const seen=[];const result=await embedLongTexts(['中文😀中文😀中文😀','短文'],fake(3,seen));assert.equal(result.length,2);assert.equal(result[0].length,3);assert.ok(result[0].every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...result[0])-1)<1e-10);const complete=seen.filter(b=>b.every(t=>Array.from(t).length<=3)).flat();assert.equal(complete.join(''),'中文😀中文😀中文😀短文');});
test('non token errors are not retried',async()=>{let count=0;await assert.rejects(embedLongTexts(['test'],async()=>{count++;throw Error('offline');}),/offline/);assert.equal(count,1);});
test('cancellation stops before next part',async()=>{const c=new AbortController(), seen=[];const f=fake(3,seen);await assert.rejects(embedLongTexts(['中文文字中文'],async batch=>{const x=await f(batch);c.abort(Error('stop'));return x;},c.signal),/stop/);assert.ok(seen.length<8);});
test('bounded subdivision fails instead of truncating',async()=>{const f=async()=>{const e=Error('token');e.code='WB_EMBED_TOKEN_LIMIT';throw e;};await assert.rejects(embedLongTexts(['x'],f),/无法安全分段/);});
test('ordinary short batches use a single model call unchanged',async()=>{const seen=[];const x=await embedLongTexts(['中','文'],fake(2,seen));assert.deepEqual(x,[[1,0,1],[0,1,1]]);assert.equal(seen.length,1);});
test('weighted aggregation uses every leaf exactly once independent of tree shape',async()=>{const model=async batch=>{if(batch.some(t=>Array.from(t).length>1)){const e=Error('limit');e.code='WB_EMBED_TOKEN_LIMIT';throw e;}return batch.map(t=>t==='a'?[1,0]:[0,1]);};const [v]=await embedLongTexts(['aaabb'],model);assert.ok(Math.abs(v[0]-3/Math.sqrt(13))<1e-12);assert.ok(Math.abs(v[1]-2/Math.sqrt(13))<1e-12);});
test('excessive subdivisions fail closed at 128 model invocations',async()=>{let n=0;const model=async batch=>{n++;if(batch.some(t=>Array.from(t).length>1)){const e=Error('limit');e.code='WB_EMBED_TOKEN_LIMIT';throw e;}return batch.map(()=>[1,0]);};await assert.rejects(embedLongTexts(['x'.repeat(128)],model),/分段次数超限/);assert.equal(n,128);});
test('eight long passages use batched segments and retain every original character',async()=>{const texts=Array.from({length:8},(_,i)=>String.fromCodePoint(0x4e00+i).repeat(1000));let calls=0;const successful=[];const model=async batch=>{calls++;if(batch.some(t=>Array.from(t).length>256)){const e=Error('limit');e.code='WB_EMBED_TOKEN_LIMIT';throw e;}successful.push(...batch);return batch.map(()=>[1,0]);};const vectors=await embedLongTexts(texts,model);assert.equal(calls,5);assert.equal(successful.join(''),texts.join(''));assert.equal(vectors.length,8);assert.ok(vectors.every(v=>v[0]===1&&v[1]===0));});
test('later failing group rejects whole request',async()=>{let calls=0;const model=async batch=>{calls++;if(calls===1){const e=Error('limit');e.code='WB_EMBED_TOKEN_LIMIT';throw e;}if(calls===3)throw Error('model stopped');return batch.map(()=>[1,0]);};await assert.rejects(embedLongTexts(['x'.repeat(3000)],model),/model stopped/);assert.equal(calls,3);});
test('long fallback never splits combining marks or joined emoji graphemes',async()=>{
 const seen=[],text='a'.repeat(255)+'e\u0301'+'👩‍👩‍👧‍👦'+'end';
 const model=async batch=>{if(batch.some(t=>Array.from(t).length>256)){const e=Error('limit');e.code='WB_EMBED_TOKEN_LIMIT';throw e;}seen.push(...batch);return batch.map(()=>[1,0]);};
 await embedLongTexts([text],model);
 assert.equal(seen.join(''),text);
 for(const segment of seen){assert.doesNotMatch(segment,/^[\u0301\u200d]/u);assert.doesNotMatch(segment,/\u200d$/u);}
});
test('recursive splitting preserves complete graphemes and weights original code points',async()=>{
 const seen=[],text='e\u0301👩‍👩‍👧‍👦z';
 const model=async batch=>{if(batch.some(t=>[...new Intl.Segmenter('und',{granularity:'grapheme'}).segment(t)].length>1)){const e=Error('limit');e.code='WB_EMBED_TOKEN_LIMIT';throw e;}seen.push(...batch);return batch.map(t=>t==='z'?[0,1]:[1,0]);};
 const [vector]=await embedLongTexts([text],model);
 assert.deepEqual(seen,['e\u0301','👩‍👩‍👧‍👦','z']);
 assert.ok(Math.abs(vector[0]-9/Math.sqrt(82))<1e-12);
 assert.ok(Math.abs(vector[1]-1/Math.sqrt(82))<1e-12);
});
test('an oversized single grapheme fails closed instead of splitting it',async()=>{
 const text='e'+'\u0301'.repeat(300), seen=[];
 const model=async batch=>{seen.push(...batch);const e=Error('limit');e.code='WB_EMBED_TOKEN_LIMIT';throw e;};
 await assert.rejects(embedLongTexts([text],model),/无法安全分段/);
 assert.ok(seen.every(x=>x===text));
});
test('mixed multilingual inputs retain grapheme boundaries across batch subdivision',async()=>{
 const grapheme=new Intl.Segmenter('und',{granularity:'grapheme'}),units=['中','a','e\u0301','👩‍👩‍👧‍👦','🇨🇳','क\u093f','文'];
 for(let seed=1;seed<=12;seed++){
  let state=seed,text='';for(let i=0;i<90;i++){state=(state*1103515245+12345)>>>0;text+=units[state%units.length];}
  const expected=Array.from(grapheme.segment(text),x=>x.segment),accepted=[];
  const model=async batch=>{if(batch.some(t=>Array.from(t).length>32)){const e=Error('limit');e.code='WB_EMBED_TOKEN_LIMIT';throw e;}accepted.push(...batch);return batch.map(()=>[1,0]);};
  await embedLongTexts([text],model);
  const actual=accepted.flatMap(part=>Array.from(grapheme.segment(part),x=>x.segment));
  assert.deepEqual(actual,expected);
 }
});
test('cancellation accompanying token overflow skips all segmentation work',async()=>{
 const original=Intl.Segmenter,controller=new AbortController();let constructed=0;
 try{
  Intl.Segmenter=class extends original{constructor(...args){super(...args);constructed++;}};
  await assert.rejects(embedLongTexts(['中'.repeat(10000)],async()=>{controller.abort(Error('stopped before splitting'));const e=Error('limit');e.code='WB_EMBED_TOKEN_LIMIT';throw e;},controller.signal),/stopped before splitting/);
  assert.equal(constructed,0);
 }finally{Intl.Segmenter=original;}
});
test('missing grapheme segmentation capability fails closed on overflow',async()=>{
 const original=Intl.Segmenter;
 try{
  Intl.Segmenter=undefined;
  const model=async()=>{const e=Error('limit');e.code='WB_EMBED_TOKEN_LIMIT';throw e;};
  await assert.rejects(embedLongTexts(['e\u0301'],model),/缺少Unicode安全分段/);
 }finally{Intl.Segmenter=original;}
});
