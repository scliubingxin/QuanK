import {createHash} from 'node:crypto';
const sha = value => createHash('sha256').update(value, 'utf8').digest('hex');

// Construct only from a host-held OCR receipt, never from model-supplied text.
export function makeOcrDocument(source, pages) {
  if(source?.renderer!==undefined && !['pdfium-wasm-v1','poppler-v1'].includes(source.renderer))throw Error('OCR渲染来源无效');
  if(!source || typeof source.name!=='string' || !source.name.trim() || source.name.length>255 || !/^[a-f0-9]{64}$/.test(source.sha256||'') || !Array.isArray(pages) || pages.length<1 || pages.length>5 || (source.totalPages!==undefined && (!Number.isInteger(source.totalPages)||source.totalPages<1||source.totalPages>100)))throw Error('OCR来源或页码无效');
  let lastPage=0,totalText=0;
  for(const p of pages){
    if(!p || !Number.isInteger(p.page) || p.page<=lastPage || p.page>100 || (source.totalPages!==undefined && p.page>source.totalPages) || typeof p.text!=='string' || (totalText+=p.text.length)>30000 || ((p.coordinateSpace===undefined)!==(p.boxes===undefined)) || (p.coordinateSpace!==undefined && (!p.coordinateSpace||typeof p.coordinateSpace!=='object'||!Array.isArray(p.boxes))))throw Error('OCR来源或页码无效');
    lastPage=p.page;
  }
  const name=source.name.replace(/[\u0000-\u001f]/g,' ');
  const safeName=name.replace(/[\\\[\]*_`#<>]/g,'\\$&');
  let text='# PDF OCR 识别成果\n\n来源：'+safeName+'\nSHA-256：'+source.sha256+'\n说明：机器识别可能有误，需对照原PDF核验。\n\n';
  if (Number.isInteger(source.totalPages) && source.totalPages>0 && source.totalPages<=100) text+='识别范围：第 '+pages.map(p=>p.page).join('、')+' 页（原文件共 '+source.totalPages+' 页）；未列出的页面未识别。\n\n';
  const ranges=[];
  for (const p of pages) {
    if (ranges.length) text+='\n\n';
    const start=text.length;
    const heading='## 第 '+p.page+' 页\n\n';
    text+=heading+(p.text||'（本页未识别出文字，不能证明原页为空）');
    const range={page:p.page,start,end:text.length};
    if (p.coordinateSpace && Array.isArray(p.boxes)) {
      const c=p.coordinateSpace;
      if (c.unit!=='pixel' || c.origin!=='top-left' || !Number.isInteger(c.width) || !Number.isInteger(c.height) || c.width<1 || c.width>1600 || c.height<1 || c.height>1600 || p.boxes.length>64 || (source.renderer && !/^[a-f0-9]{64}$/.test(c.rasterSha256||''))) throw Error('OCR位置数据无效');
      range.coordinateSpace={unit:'pixel',origin:'top-left',width:c.width,height:c.height,...(c.rasterSha256?{rasterSha256:c.rasterSha256}:{})};
      let lastBoxEnd=0;
      range.boxes=p.boxes.map(b=>{
        if (!b||!Number.isInteger(b.textStart)||!Number.isInteger(b.textEnd)||b.textStart<lastBoxEnd||b.textEnd<=b.textStart||b.textEnd>p.text.length||p.text.slice(b.textStart,b.textEnd)!==b.text||![b.x,b.y,b.w,b.h].every(Number.isInteger)||b.x<0||b.y<0||b.w<1||b.h<1||b.x+b.w>c.width||b.y+b.h>c.height) throw Error('OCR位置数据无效');
        lastBoxEnd=b.textEnd;
        return {start:start+heading.length+b.textStart,end:start+heading.length+b.textEnd,x:b.x,y:b.y,w:b.w,h:b.h};
      });
      range.boxesTruncated=p.boxesTruncated===true;
    }
    ranges.push(range);
  }
  if(source.renderer!==undefined && !['pdfium-wasm-v1','poppler-v1'].includes(source.renderer))throw Error('OCR渲染来源无效');
  const provenance={version:1,name,sha256:source.sha256,textSha256:sha(text),ranges,...(source.renderer?{renderer:source.renderer}:{})};
  if(ranges.some(r=>r.boxes))provenance.geometrySha256=sha(JSON.stringify(source.renderer?{renderer:source.renderer,ranges}:ranges));
  return {text,provenance};
}

// Invalid or edited metadata must never produce an asserted PDF page number.
export function ocrSourceForRange(document, start, end) {
  const p=document?.ocrProvenance, text=document?.text;
  if (!p || p.version!==1 || document.format!=='md' || typeof text!=='string' ||
      typeof p.name!=='string' || !p.name || p.name.length>255 || /[\u0000-\u001f]/.test(p.name) ||
      !/^[a-f0-9]{64}$/.test(p.sha256||'') || p.textSha256!==sha(text) ||
      p.textSha256!==document.sha256 || !Array.isArray(p.ranges) || p.ranges.length<1 || p.ranges.length>5 ||
      !Number.isInteger(start) || !Number.isInteger(end) || start<0 || end<=start || end>text.length) return null;
  if (p.ranges.some(r=>!r || typeof r!=='object' || Array.isArray(r))) return null;
  if(p.renderer!==undefined && !['pdfium-wasm-v1','poppler-v1'].includes(p.renderer))return null;
  if ((p.geometrySha256!==undefined || p.ranges.some(r=>r.boxes!==undefined)) && p.geometrySha256!==sha(JSON.stringify(p.renderer?{renderer:p.renderer,ranges:p.ranges}:p.ranges))) return null;
  let lastEnd=0, lastPage=0;
  for (const r of p.ranges) {
    if (!Number.isInteger(r.page) || r.page<=lastPage || r.page>100 || !Number.isInteger(r.start) ||
        !Number.isInteger(r.end) || r.start<lastEnd || r.end<=r.start || r.end>text.length ||
        !text.startsWith('## 第 '+r.page+' 页\n\n',r.start)) return null;
    if(r.boxes!==undefined){
      const c=r.coordinateSpace;
      if(!Array.isArray(r.boxes)||r.boxes.length>64||!c||c.unit!=='pixel'||c.origin!=='top-left'||!Number.isInteger(c.width)||!Number.isInteger(c.height)||c.width<1||c.width>1600||c.height<1||c.height>1600||(p.renderer&&!/^[a-f0-9]{64}$/.test(c.rasterSha256||''))) return null;
      let lastBoxEnd=r.start;
      for(const b of r.boxes){if(!b||typeof b!=='object'||!Number.isInteger(b.start)||!Number.isInteger(b.end)||b.start<lastBoxEnd||b.end<=b.start||b.end>r.end||![b.x,b.y,b.w,b.h].every(Number.isInteger)||b.x<0||b.y<0||b.w<1||b.h<1||b.x+b.w>c.width||b.y+b.h>c.height)return null;lastBoxEnd=b.end;}
    }
    lastEnd=r.end; lastPage=r.page;
  }
  const pages=p.ranges.filter(r=>r.start<end && start<r.end).map(r=>r.page);
  if(!pages.length)return null;
  const hits=[];let omitted=false;
  for(const r of p.ranges){if(!r.boxes||r.start>=end||start>=r.end)continue;for(const b of r.boxes){if(b.start<end&&start<b.end){if(hits.length<16)hits.push({page:r.page,start:b.start,end:b.end,x:b.x,y:b.y,w:b.w,h:b.h,width:r.coordinateSpace.width,height:r.coordinateSpace.height,...(r.coordinateSpace.rasterSha256?{rasterSha256:r.coordinateSpace.rasterSha256}:{})});else omitted=true;}}if(r.boxesTruncated)omitted=true;}
  return {name:p.name,sha256:p.sha256,pages,...(p.renderer?{renderer:p.renderer}:{}),...(hits.length?{regions:hits,regionsTruncated:omitted,coordinateSpace:'rendered-page-pixel-top-left'}:{})};
}

/** Create image evidence only from the host-held OCR receipt. */
export function makeImageOcrDocument(source, result) {
  const name=String(source.name||'图片').replace(/[\u0000-\u001f]/g,' ').slice(0,255);
  const safeName=name.replace(/[\\\[\]*_`#<>]/g,'\\$&');
  const header='# 图片OCR识别成果\n\n来源：'+safeName+'\nSHA-256：'+source.sha256+'\n说明：机器识别可能有误，需对照原图片核验。\n\n';
  const text=header+result.text+'\n',c=result.coordinateSpace;
  if(!/^[a-f0-9]{64}$/.test(source.sha256)||typeof result.text!=='string'||!c||c.unit!=='pixel'||c.origin!=='top-left'||!Number.isInteger(c.width)||!Number.isInteger(c.height)||c.width<1||c.width>4096||c.height<1||c.height>4096||c.width*c.height>16777216||!Array.isArray(result.boxes)||result.boxes.length>64) throw Error('图片OCR来源无效');
  let last=0;
  const boxes=result.boxes.map(b=>{
    if(!Number.isInteger(b.textStart)||!Number.isInteger(b.textEnd)||b.textStart<last||b.textEnd<=b.textStart||b.textEnd>result.text.length||result.text.slice(b.textStart,b.textEnd)!==b.text||![b.x,b.y,b.w,b.h].every(Number.isInteger)||b.x<0||b.y<0||b.w<1||b.h<1||b.x+b.w>c.width||b.y+b.h>c.height)throw Error('图片OCR位置数据无效');
    last=b.textEnd;return {start:header.length+b.textStart,end:header.length+b.textEnd,x:b.x,y:b.y,w:b.w,h:b.h};
  });
  const geometry={width:c.width,height:c.height,boxes,boxesTruncated:result.boxesTruncated===true};
  return {text,provenance:{kind:'image',version:1,name,sha256:source.sha256,textSha256:sha(text),start:header.length,end:header.length+result.text.length,geometry,geometrySha256:sha(JSON.stringify(geometry))}};
}

/** Return only validated original-image facts for a matched text range. */
export function imageOcrSourceForRange(document,start,end) {
  const p=document?.ocrProvenance,text=document?.text,g=p?.geometry;
  if(!p||p.kind!=='image'||p.version!==1||document.format!=='md'||typeof text!=='string'||typeof p.name!=='string'||!p.name||p.name.length>255||/[\u0000-\u001f]/.test(p.name)||!/^[a-f0-9]{64}$/.test(p.sha256||'')||p.textSha256!==sha(text)||p.textSha256!==document.sha256||!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<0||p.end<=p.start||p.end>text.length||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>text.length||!g||!Number.isInteger(g.width)||!Number.isInteger(g.height)||g.width<1||g.width>4096||g.height<1||g.height>4096||g.width*g.height>16777216||!Array.isArray(g.boxes)||g.boxes.length>64||p.geometrySha256!==sha(JSON.stringify(g)))return null;
  let last=p.start;
  for(const b of g.boxes){
    if(!b||!Number.isInteger(b.start)||!Number.isInteger(b.end)||b.start<last||b.end<=b.start||b.end>p.end||![b.x,b.y,b.w,b.h].every(Number.isInteger)||b.x<0||b.y<0||b.w<1||b.h<1||b.x+b.w>g.width||b.y+b.h>g.height)return null;
    last=b.end;
  }
  if(start>=p.end||end<=p.start)return null;
  const matched=g.boxes.filter(b=>b.start<end&&start<b.end);
  return {name:p.name,sha256:p.sha256,width:g.width,height:g.height,coordinateSpace:'image-pixel-top-left',regions:matched.slice(0,16),regionsTruncated:g.boxesTruncated===true||matched.length>16};
}
