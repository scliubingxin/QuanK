import assert from 'node:assert/strict';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {pretendToBeVisual:true});
for (const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','MouseEvent',
  'HTMLCanvasElement','AbortController','AbortSignal','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) {
  Object.defineProperty(globalThis,k,{value:k==='window'?dom.window:dom.window[k],configurable:true,writable:true});
}
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.devicePixelRatio = 2;
globalThis.ResizeObserver = class {observe(){} disconnect(){}};
dom.window.Element.prototype.scrollTo = function(){};
dom.window.Element.prototype.setPointerCapture = function(){};
dom.window.HTMLCanvasElement.prototype.getContext = () => ({
  setTransform(){},clearRect(){},drawImage(){},fillRect(){},save(){},restore(){},
  beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},
});
const {mountOfficeCanvas} = await import('../src/office/office-canvas.js');

function makeView(imeRequest) {
  const calls = [];
  const session = {
    kind:'writer', readOnly:false, selection:{kind:'none',rects:[]}, state:new Map(), text:'x',
    on(){}, off(){}, toScreen:r=>r,
    interaction:v => calls.push(v),
    async save(){ return Buffer.from('x'); },
  };
  const host = document.getElementById('host');
  host.innerHTML = '';
  const view = mountOfficeCanvas(host, {
    session,
    metadata:{width:1000,height:1400,part:'p1',parts:['p1'],tiles:[]},
    request: async (op,args) => op === 'ime' && imeRequest ? imeRequest(args) : ({}),
    preview: async () => ({}),
  });
  return {calls, view, sheet:host.querySelector('.qk-office-paper'),
    input:document.querySelector('textarea[aria-label="Office 文档输入"]')};
}
function pointerEvent(type, target, {pointerId=1, button=0}={}) {
  const ev = new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,button,clientX:12,clientY:12});
  Object.defineProperty(ev,'pointerId',{value:pointerId});
  Object.defineProperty(ev,'pointerType',{value:'mouse'});
  target.dispatchEvent(ev);
  return ev;
}

test('(a) setPointerCapture 抛异常时 drag 最终复位', () => {
  const {calls, view, sheet} = makeView();
  sheet.setPointerCapture = () => { throw Error('capture unavailable'); };
  pointerEvent('pointerdown', sheet);
  assert.ok(calls.some(v => v.drag === true), 'drag 应被标记');
  pointerEvent('pointerup', document);
  assert.ok(calls.some(v => v.drag === false), 'document 级 pointerup 必须复位 drag');
  view.destroy();
});

test('(b) pointerup 落在 document 而不是 sheet 上时 drag 复位', () => {
  const {calls, view, sheet} = makeView();
  pointerEvent('pointerdown', sheet);
  pointerEvent('pointerup', document.body);
  assert.ok(calls.some(v => v.drag === true));
  assert.equal(calls.at(-1).drag, false);
  view.destroy();
});

test('(c) compositionend 后 ime 立即为 false，即使 ime.end 不 resolve', () => {
  const {calls, view, input} = makeView(() => new Promise(() => {}));
  input.dispatchEvent(new dom.window.Event('compositionstart'));
  assert.ok(calls.some(v => v.ime === true));
  const end = new dom.window.Event('compositionend');
  end.data = '中文';
  input.dispatchEvent(end);
  assert.deepEqual(calls.at(-1), {ime:false}, 'ime 复位不能等 Promise');
  view.destroy();
});

test('(d) window blur 时 drag 与 ime 都复位', () => {
  const {calls, view, sheet, input} = makeView(() => new Promise(() => {}));
  pointerEvent('pointerdown', sheet);
  input.dispatchEvent(new dom.window.Event('compositionstart'));
  dom.window.dispatchEvent(new dom.window.Event('blur'));
  assert.ok(calls.some(v => v.drag === false));
  assert.ok(calls.some(v => v.ime === false));
  view.destroy();
});
