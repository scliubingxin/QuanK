import {test} from 'node:test';
import assert from 'node:assert/strict';
import {browserDom} from '../runtime/browser-dom.mjs';

test('click hit test uses the exact pixel sent to the browser host',()=>{
 const names=['document','location','innerWidth','innerHeight','getComputedStyle'];
 const old=Object.fromEntries(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
 const key='willbuddy_pixel_fixture';let point,occluded=false;
 const el={tagName:'BUTTON',isConnected:true,readOnly:false,textContent:'Confirm',form:null,
  getAttribute:()=>null,matches:()=>false,closest:()=>null,contains:()=>false,scrollIntoView(){},
  getBoundingClientRect:()=>({left:0.2,right:1,top:0.2,bottom:1,width:0.8,height:0.8})};
 try{
  Object.assign(globalThis,{location:{href:'https://example.test/'},innerWidth:3,innerHeight:3,
   getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'}),
   document:{title:'test',querySelectorAll:()=>[el],elementFromPoint:(x,y)=>{point=[x,y];return occluded?{}:el;}}});
  const snapshot=browserDom('snapshot',key,{snapshotId:'s'});
  assert.equal(snapshot.elements.length,1);
  assert.deepEqual(browserDom('point',key,{snapshotId:'s',ref:'e1'}),{x:1,y:1});
  assert.deepEqual(point,[1,1]);
  occluded=true;
  assert.throws(()=>browserDom('point',key,{snapshotId:'s',ref:'e1'}),/遮挡/);
  globalThis.innerWidth=1;
  assert.throws(()=>browserDom('point',key,{snapshotId:'s',ref:'e1'}),/视口/);
 }finally{
  delete globalThis[key];
  for(const name of names){if(old[name])Object.defineProperty(globalThis,name,old[name]);else delete globalThis[name];}
 }
});
