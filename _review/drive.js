const q=new URLSearchParams(location.search).get('s');
const go=()=>{const b=window.wbBus,$=s=>document.querySelector(s);
 if(q==='menu')$('#wb-btn-more').click();
 if(q==='panel'){b.emit('ribbon:tab',{name:'insert'});b.emit('panel:open',{name:'animation'});}
 if(q==='master'){b.emit('view:set',{mode:'master',name:'自定义设计方案'});b.emit('ribbon:tab',{name:'view'});}
 if(q==='zoom')$('#wb-zoom-label').click();
 if(q==='ai'){b.emit('panel:open',{name:'ai'});}
 if(q==='collapse')$('#wb-ribbon-collapse').click();};
setTimeout(go,800);
