/** [p4-m4] Trusted bootstrap for mini apps. The app runs in a second opaque sandbox with no network; its localStorage
 * is an in-memory copy of the app's saved data, and every change is relayed (through this frame) to the host, which
 * enforces the quota and writes it to the app's own local store. */
(() => {
  const token = location.hash.slice(1);
  let used = false, child = null, sent = 0, windowStart = 0;
  const CSP =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; worker-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
  const shim = (initial) => `(()=>{const saved=${JSON.stringify(initial).replace(/</g, '\\u003c')};const post=m=>{try{parent.postMessage(Object.assign({kind:'wb-storage'},m),'*')}catch{}};
const make=(persist,seed)=>{const m=new Map(Object.entries(seed||{}));return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.has(String(k))?m.get(String(k)):null,
setItem:(k,v)=>{k=String(k);v=String(v);if(k.length>200)throw Error('存储键过长');if(!m.has(k)&&m.size>=200)throw Error('小应用最多保存 200 项数据');let n=0;for(const [a,b] of m)if(a!==k)n+=a.length+b.length;if((n+k.length+v.length)*2>1048576)throw Error('小应用数据超过 1 MB');m.set(k,v);if(persist)post({op:'set',key:k,value:v})},
removeItem:k=>{k=String(k);if(m.delete(k)&&persist)post({op:'remove',key:k})},clear:()=>{const had=m.size;m.clear();if(had&&persist)post({op:'clear'})}}};
try{Object.defineProperty(window,'localStorage',{value:make(true,saved)});Object.defineProperty(window,'sessionStorage',{value:make(false)})}catch{}
window.addEventListener('error',e=>post({op:'error',key:'error',value:String(e.message||'脚本错误').slice(0,300)}));
document.addEventListener('click',e=>{const a=e.target.closest?.('a');if(a&&!a.getAttribute('href')?.startsWith('#'))e.preventDefault()},true);document.addEventListener('submit',e=>e.preventDefault(),true);})();`;
  addEventListener('message', (e) => {
    if (child && e.source === child.contentWindow && e.data?.kind === 'wb-storage') {
      const now = Date.now();
      if (now - windowStart > 1000) { windowStart = now; sent = 0; }
      if (++sent > 200) return; // a runaway loop cannot flood the host
      const {op, key, value} = e.data;
      if (!['set', 'remove', 'clear', 'error'].includes(op)) return;
      parent.postMessage({kind: op === 'error' ? 'app-error' : 'app-storage', token, op, key: typeof key === 'string' ? key.slice(0, 200) : '', value: typeof value === 'string' ? value : ''}, '*');
      return;
    }
    if (used || e.source !== parent || e.data?.token !== token || e.data.kind !== 'app-document') return;
    used = true;
    if (typeof e.data.source !== 'string' || e.data.source.length > 262144) { document.querySelector('#status').textContent = '小应用代码超出 256 KB。'; return; }
    const storage = e.data.storage && typeof e.data.storage === 'object' ? e.data.storage : {};
    const parsed = new DOMParser().parseFromString(e.data.source, 'text/html');
    parsed.querySelectorAll('base,meta[http-equiv]').forEach((el) => el.remove());
    const policy = parsed.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = CSP;
    parsed.head.prepend(policy);
    const referrer = parsed.createElement('meta');
    referrer.name = 'referrer';
    referrer.content = 'no-referrer';
    policy.after(referrer);
    const init = parsed.createElement('script');
    init.textContent = shim(storage);
    referrer.after(init);
    child = document.createElement('iframe');
    child.title = '小应用';
    child.setAttribute('sandbox', 'allow-scripts allow-modals');
    child.referrerPolicy = 'no-referrer';
    child.addEventListener('load', () => parent.postMessage({kind: 'app-complete', token}, '*'), {once: true});
    child.srcdoc = '<!doctype html>' + parsed.documentElement.outerHTML;
    document.querySelector('#status').remove();
    document.body.append(child);
  });
  parent.postMessage({kind: 'app-ready', token}, '*');
})();
