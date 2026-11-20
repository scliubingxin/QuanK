import {createHash} from 'node:crypto';
import {imageFromBase64,imageInfo} from '../src/shared/image-bytes.js';

// Renderer supplies only a stored evidence reference. Image bytes are selected
// by the recorded digest, never a path or arbitrary image ID from the page.
export function previewImageOcrEvidence({store,reference}) {
 const {chatId,row,match,runId,time,expectedHash}=reference||{};
 if(typeof chatId!=='string'||chatId.length>128||!Number.isInteger(row)||row<0||!Number.isInteger(match)||match<0)throw Error('证据位置无效');
 const group=store.data.chats?.find(c=>c.id===chatId)?.knowledgeEvidence?.[row];
 const source=group?.matches?.[match]?.imageOcrSource;
 if(!source||group.runId!==runId||group.time!==time||source.sha256!==expectedHash||!/^[a-f0-9]{64}$/.test(source.sha256||'')||source.coordinateSpace!=='image-pixel-top-left')throw Error('图片证据不存在或已变化');
 const {width,height,regions}=source;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096||width*height>16777216||!Array.isArray(regions)||!regions.length||regions.length>16||regions.some(b=>!b||![b.x,b.y,b.w,b.h].every(Number.isInteger)||b.x<0||b.y<0||b.w<1||b.h<1||b.x+b.w>width||b.y+b.h>height))throw Error('图片证据坐标无效');
 const attachment=store.data.imageAttachments?.find(i=>i.sha256===source.sha256);
 if(!attachment)throw Error('原识别图片已移除，无法显示；历史文字证据仍可查看');
 const bytes=imageFromBase64(attachment.base64),info=imageInfo(bytes,{pngOnly:true});
 if(bytes.length!==attachment.bytes||createHash('sha256').update(bytes).digest('hex')!==source.sha256||info.width!==width||info.height!==height)throw Error('图片完整性或尺寸与证据不一致');
 return {width,height,base64:attachment.base64,boxes:regions.map(({x,y,w,h})=>({x,y,w,h})),regionsTruncated:source.regionsTruncated===true};
}
