/** Fixed Word outline preset. Interior borders are cleared; padding is explicit. */
export function normalizeTableOutline(p) {
 if(!p||Object.keys(p).some(k=>!['color','width','padding'].includes(k))||typeof p.color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(p.color))throw Error('边框颜色须为#RRGGBB');
 if(typeof p.width!=='number'||!Number.isFinite(p.width)||p.width<0.5||p.width>3||!Number.isInteger(p.width*4))throw Error('外框线宽限0.5–3pt，步长0.25pt');
 if(typeof p.padding!=='number'||!Number.isFinite(p.padding)||p.padding<0||p.padding>12||!Number.isInteger(p.padding*2))throw Error('请明确指定0–12pt单元格内边距，步长0.5pt');
 return {color:p.color.toUpperCase(),width:p.width,padding:p.padding};
}
export const officeTableOutlineDefinition={type:'function',function:{name:'office_table_outline',description:'经单独批准给当前Word简单矩形表格选区设置实线外框颜色/线宽，清除选区内部线并明确设置四边单元格内边距；不是全部网格线。不改正文。仅支持正文唯一顶层完整表格，最多30行16列200格，不支持合并/嵌套表格。一轮与其他修改共用一次额度。',parameters:{type:'object',properties:{color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},width:{type:'number',minimum:0.5,maximum:3},padding:{type:'number',minimum:0,maximum:12}},required:['color','width','padding'],additionalProperties:false}}};

// Fail closed if the native command did not produce the requested bounded result.
// Restrict verification to one whole, unmerged body table so selection cannot be
// confused with a similarly shaped table elsewhere in the document.
import office from './vendor/office.cjs';
import {inspectDocument,openPackage} from './documents.mjs';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const elems=(n,name)=>Array.from(n?.childNodes||[]).filter(x=>x.nodeType===1&&x.namespaceURI===W&&x.localName===name);
function outlineTable(bytes,table){
 inspectDocument('docx',bytes);const files=openPackage(bytes);if(Object.keys(files).some(n=>n.toLowerCase().startsWith('_xmlsignatures/')))throw Error('带签名Word不支持外框修改');const xml=new office.DOMParser({onError:()=>{throw Error('Word表格XML无效');}}).parseFromString(new TextDecoder('utf-8',{fatal:true}).decode(files['word/document.xml']),'application/xml');
 for(const [name,part] of Object.entries(files)){if(name==='word/document.xml'||!/^word\/.*\.xml$/i.test(name))continue;const other=new office.DOMParser({onError:()=>{throw Error('Word部件XML无效');}}).parseFromString(new TextDecoder('utf-8',{fatal:true}).decode(part),'application/xml');if(other.getElementsByTagNameNS(W,'tbl').length)throw Error('外框验收不支持其他部件中的表格');}
 const tables=Array.from(xml.getElementsByTagNameNS(W,'tbl')),body=xml.getElementsByTagNameNS(W,'body')[0];
 if(tables.length!==1||tables[0].parentNode!==body)throw Error('外框验收仅支持正文唯一顶层完整表格');
 const t=tables[0],rows=elems(t,'tr').map(r=>elems(r,'tc'));
 if(!table||rows.length!==table.rows||rows.some(r=>r.length!==table.columns)||['gridSpan','vMerge','hMerge','gridBefore','gridAfter'].some(n=>t.getElementsByTagNameNS(W,n).length))throw Error('外框验收需要完整无合并表格');
 const children=n=>Array.from(n.childNodes||[]).filter(x=>x.nodeType===1);
 for(const row of rows)for(const cell of row){if(children(cell).some(n=>n.namespaceURI!==W||!['tcPr','p'].includes(n.localName)))throw Error('外框不支持复杂单元格');for(const para of elems(cell,'p')){if(children(para).some(n=>n.namespaceURI!==W||!['pPr','r'].includes(n.localName)))throw Error('外框不支持复杂段落');for(const run of elems(para,'r'))if(children(run).some(n=>n.namespaceURI!==W||!['rPr','t'].includes(n.localName)))throw Error('外框不支持复杂文字');}}
 return {t,rows};
}
export function outlineOutputVerifier(bytes,table,border){
 border=normalizeTableOutline(border);const original=outlineTable(bytes,table);
 const text=original.rows.map(r=>r.map(c=>Array.from(c.getElementsByTagNameNS(W,'t')).map(n=>n.textContent).join('')));
 return output=>{
  const {t,rows}=outlineTable(output,table);const next=rows.map(r=>r.map(c=>Array.from(c.getElementsByTagNameNS(W,'t')).map(n=>n.textContent).join('')));
  if(JSON.stringify(next)!==JSON.stringify(text))throw Error('外框保存验收失败：表格正文已变化');
  const props=elems(t,'tblPr');if(props.length!==1)throw Error('外框保存验收失败：表格属性不可用');
  if(elems(props[0],'tblBorders').some(b=>Array.from(b.childNodes).some(n=>n.nodeType===1&&!['nil','none'].includes(n.getAttributeNS(W,'val')))))throw Error('外框保存验收失败：存在表格级边框');
  const margins=elems(props[0],'tblCellMar');if(margins.length!==1)throw Error('外框保存验收失败：缺少内边距');
  if(['tblStyle','tblPrEx','tblCellSpacing'].some(n=>t.getElementsByTagNameNS(W,n).length))throw Error('外框保存验收失败：存在可能覆盖样式的表格属性');
  const names=['top','start','bottom','end'];
  for(const name of names){const n=elems(margins[0],name);if(n.length!==1||n[0].getAttributeNS(W,'w')!==String(border.padding*20)||n[0].getAttributeNS(W,'type')!=='dxa')throw Error('外框保存验收失败：内边距不匹配');}
  rows.forEach((row,y)=>row.forEach((cell,x)=>{
   const cp=elems(cell,'tcPr'),bp=cp.length===1?elems(cp[0],'tcBorders'):[];if(cp.length===1&&elems(cp[0],'tcMar').length)throw Error('外框保存验收失败：存在单元格内边距覆盖');if(bp.length===1&&Array.from(bp[0].childNodes).some(n=>n.nodeType===1&&n.namespaceURI===W&&!names.includes(n.localName)&&!['nil','none'].includes(n.getAttributeNS(W,'val'))))throw Error('外框保存验收失败：存在其他边框');if(bp.length!==1)throw Error('外框保存验收失败：单元格边框不可用');
   for(const name of names){const nodes=elems(bp[0],name),edge=name==='top'?y===0:name==='bottom'?y===rows.length-1:name==='start'?x===0:x===row.length-1;
    if(edge){if(nodes.length!==1||nodes[0].getAttributeNS(W,'val')!=='single'||nodes[0].getAttributeNS(W,'color').toUpperCase()!==border.color.slice(1)||nodes[0].getAttributeNS(W,'sz')!==String(border.width*8))throw Error('外框保存验收失败：边框样式不匹配');}
    else if(nodes.some(n=>!['nil','none'].includes(n.getAttributeNS(W,'val'))))throw Error('外框保存验收失败：内部边框未清除');
   }
  }));
 };
}
