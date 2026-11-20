// Bounded long-passage fallback. The fixed local model reports token overflow;
// we split at grapheme boundaries without dropping content and batch the pieces.
// Version the persisted model identity whenever these aggregation rules change.
export async function embedLongTexts(texts, embedBatch, signal) {
  let calls=0;
  async function invoke(batch) {
    signal?.throwIfAborted();
    if(++calls>128)throw Error('本机嵌入分段次数超限');
    const rows=await embedBatch(batch,signal);
    signal?.throwIfAborted();
    if(!Array.isArray(rows)||rows.length!==batch.length||rows.some(v=>!Array.isArray(v)||!v.length||v.some(x=>!Number.isFinite(x))))throw Error('本机嵌入分段结果无效');
    return rows;
  }
  try{return await invoke(texts);}
  catch(e){if(e?.code!=='WB_EMBED_TOKEN_LIMIT')throw e;}
  signal?.throwIfAborted();
  if(typeof Intl.Segmenter!=='function')throw Error('本机嵌入缺少Unicode安全分段能力');
  const segmenter=new Intl.Segmenter('und',{granularity:'grapheme'});
  const graphemes=text=>Array.from(segmenter.segment(text),x=>x.segment);
  const weight=text=>Array.from(text).length;
  const sums=Array(texts.length).fill(null),pieces=[];
  for(let index=0;index<texts.length;index++){
    signal?.throwIfAborted();
    let part='',count=0;
    for(const item of graphemes(texts[index])){
      const n=weight(item);
      if(part&&count+n>256){pieces.push({index,text:part,weight:count});part='';count=0;}
      part+=item;count+=n;
    }
    if(part)pieces.push({index,text:part,weight:count});
  }
  async function process(group){
    signal?.throwIfAborted();
    let vectors;
    try{vectors=await invoke(group.map(x=>x.text));}
    catch(e){
      if(e?.code!=='WB_EMBED_TOKEN_LIMIT')throw e;
      if(group.length>1){const mid=Math.floor(group.length/2);await process(group.slice(0,mid));await process(group.slice(mid));return;}
      const chars=graphemes(group[0].text);
      if(chars.length<2)throw Error('本机嵌入文本无法安全分段');
      const mid=Math.floor(chars.length/2), index=group[0].index;
      const first=chars.slice(0,mid).join(''),second=chars.slice(mid).join('');
      await process([{index,text:first,weight:weight(first)},{index,text:second,weight:weight(second)}]);
      return;
    }
    for(let i=0;i<group.length;i++){
      const {index,weight}=group[i],v=vectors[i];
      if(!sums[index])sums[index]=Array(v.length).fill(0);
      if(sums[index].length!==v.length)throw Error('本机嵌入分段结果无效');
      for(let j=0;j<v.length;j++)sums[index][j]+=v[j]*weight;
    }
  }
  for(let i=0;i<pieces.length;i+=8)await process(pieces.slice(i,i+8));
  return sums.map(sum=>{
    if(!sum)throw Error('本机嵌入分段结果为空');
    const norm=Math.hypot(...sum);
    if(!Number.isFinite(norm)||norm<1e-12)throw Error('本机嵌入分段结果为空');
    return sum.map(x=>x/norm);
  });
}
