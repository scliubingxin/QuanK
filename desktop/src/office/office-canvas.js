const emptySelection = () => ({kind:'none', text:'', rects:[], anchor:null, token:null});

export function unoProperties(args = {}) {
    return Object.fromEntries(Object.entries(args).map(([key, value]) => {
        const type = typeof value;
        if (type === 'boolean' || type === 'string') return [key, {type, value}];
        if (Number.isFinite(value)) {
            const unoType = {Rows:'short', Columns:'short', Height:'float', 'FontHeight.Height':'float', Color:'long'}[key];
            return [key, {type:unoType ?? (Number.isInteger(value) ? 'long' : 'double'), value}];
        }
        throw new TypeError('Unsupported UNO property: ' + key);
    }));
}

export function unoState(value) {
    if (value === 'disabled') return {enabled:false, checked:false, value:null};
    return {enabled:true, checked:value === true || value === 'true', value:value === undefined || value === 'enabled' ? null : String(value)};
}

export function createSessionView({docId, kind, readOnly, request, toScreen = rect => rect}) {
    const listeners = new Map();
    const view = {
        docId, kind, readOnly, state:new Map(), selection:emptySelection(), toScreen,
        on(event, callback) {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event).add(callback);
            return () => view.off(event, callback);
        },
        off(event, callback) { listeners.get(event)?.delete(callback); },
        uno(command, args) {
            if (command === '.uno:FontHeight') {
                const height = args?.['FontHeight.Height'] ?? args?.FontHeight ?? args?.Height;
                if (height != null) args = {'FontHeight.Height':height};
            }
            if (command === '.uno:TrackChanges' && args == null) args = {TrackChanges:!view.state.get(command)?.checked};
            if (command === '.uno:InsertTable' && Array.isArray(args?.rows)) return request('insertTable', {rows:args.rows});
            return request('uno', {command, args:unoProperties(args)});
        },
        getSelection({context = 2} = {}) { return request('selection', {context}); },
        replaceSelection(text, {track = false, token = view.selection.token, accept = false} = {}) {
            return request('replaceSelection', {text, track, token, accept});
        },
        async setTrackChanges(on) {
            const state = view.state.get('.uno:TrackChanges');
            if (state?.checked !== Boolean(on)) return view.uno('.uno:TrackChanges', {TrackChanges:Boolean(on)});
        },
        acceptAll() { return view.uno('.uno:AcceptAllTrackedChanges'); },
        rejectAll() { return view.uno('.uno:RejectAllTrackedChanges'); },
        acceptChange(id) { return request('change', {id, accept:true}); },
        rejectChange(id) { return request('change', {id, accept:false}); },
        undo() { return view.uno('.uno:Undo'); },
        redo() { return view.uno('.uno:Redo'); },
        save(options = {}) { return request('save', options); },
        reload(options = {}) { return request('reload', options); },
    };
    function publish(event, payload) {
        if (event === 'state' && Object.keys(payload).length) {
            let changed = false;
            for (const [command, value] of Object.entries(payload)) {
                const next = unoState(value), previous = view.state.get(command);
                if (previous?.enabled === next.enabled && previous.checked === next.checked && previous.value === next.value) continue;
                view.state.set(command,next);
                changed = true;
            }
            if (!changed) return;
        }
        if (event === 'selection') view.selection = payload;
        if (event === 'reloaded') {
            view.state.clear();
            view.selection = emptySelection();
            publish('state', {});
            publish('selection', view.selection);
        }
        for (const listener of [...(listeners.get(event) ?? [])]) listener(payload);
    }
    return {view, publish};
}

const pixels = 256;
const navigation = {ArrowDown:1024, ArrowUp:1025, ArrowLeft:1026, ArrowRight:1027, Home:1028, End:1029,
    Enter:1280, Escape:1281, Tab:1282, Backspace:1283, Delete:1286};

export function officeShortcut(event) {
    if (event.isComposing || event.keyCode === 229) return;
    const {key, metaKey, ctrlKey, altKey, shiftKey} = event;
    if (metaKey || ctrlKey) {
        const command = {b:'Bold', i:'Italic', u:'Underline', z:shiftKey ? 'Redo' : 'Undo', a:'SelectAll', s:'Save'}[key.toLowerCase()];
        if (command) return {command};
    }
    if (navigation[key]) return {char:0, code:navigation[key] | (shiftKey ? 0x1000 : 0) | (metaKey || ctrlKey ? 0x2000 : 0),
        edit:['Enter','Backspace','Delete'].includes(key)};
    if (!metaKey && !ctrlKey && !altKey && [...key].length === 1 && key.codePointAt(0) <= 65535) {
        const char = key.codePointAt(0);
        const lower = key.toLowerCase().charCodeAt(0);
        const base = lower >= 97 && lower <= 122 ? 512 + lower - 97 : lower >= 48 && lower <= 57 ? 256 + lower - 48 : key === ' ' ? 1284 : 0;
        return {char, code:base | (shiftKey ? 0x1000 : 0), edit:true};
    }
}

export function createComposition(commit, display = () => {}) {
    let active = false;
    return {
        get active() { return active; },
        start() { active = true; display(''); },
        update(text) { if (active) display(text); },
        end(text) {
            if (!active) return;
            active = false;
            display('');
            if (text) return commit(text);
        },
        cancel() { active = false; display(''); },
    };
}

export function prioritizeTiles({left,top,right,bottom}, size, caret) {
    const queue = [];
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    for (let row = Math.max(0,Math.floor(top/size)); row < Math.ceil(bottom/size); row++) {
        for (let col = Math.max(0,Math.floor(left/size)); col < Math.ceil(right/size); col++) {
            queue.push({row,col,key:row + ':' + col, distance:Math.abs((col+.5)*size-centerX)+Math.abs((row+.5)*size-centerY)});
        }
    }
    const cursorRow = Math.floor(caret?.y / size);
    const cursorCol = Math.floor(caret?.x / size);
    return queue.sort((a,b) => Number(b.row === cursorRow) - Number(a.row === cursorRow) ||
        (a.row === cursorRow ? Math.abs(a.col-cursorCol) - Math.abs(b.col-cursorCol) : a.distance-b.distance));
}

function style(element, properties) {
    Object.assign(element.style, properties);
    return element;
}

function element(tag, properties, css) {
    return style(Object.assign(document.createElement(tag), properties), css);
}

function place(node, rect, scale) {
    style(node, {left:rect.x/scale+'px', top:rect.y/scale+'px', width:rect.w/scale+'px', height:rect.h/scale+'px'});
}

export function mountOfficeCanvas(host, {session, metadata, request, preview, initialScroll = {}, initialZoom = 1, maxTiles = 128, onError = () => {}}) {
    let doc = {...metadata}, cursor = null, pointerAnchor = null, zoom = Math.min(2,Math.max(.25,initialZoom)), dpr = devicePixelRatio, generation = 0;
    let stopped = false, painting = false, needsPaint = false, frame = 0, inputPending = 0, viewportKey = '';
    let focused = false, hasFirstPaint = false;
    let zoomMode = session.kind === 'impress' ? 'page' : session.kind === 'writer' ? 'width' : 'manual';
    const cache = new Map();
    const root = element('div', {className:'quank-office-canvas'}, {display:'flex', flexDirection:'column', height:'100%', minHeight:'0', background:'var(--panel, #dfe4ed)'});
    const shell = element('div', {}, {display:'flex', flex:'1', minHeight:'0'});
    const bar = element('div', {}, {display:'flex', gap:'8px', alignItems:'center'});
    const slides = element('nav', {}, {width:'160px', flexShrink:'0', overflow:'auto', position:'relative'});
    const tabs = element('nav', {}, {display:'flex', overflow:'auto'});
    const formula = element('output', {textContent:'—'}, {flex:'1', whiteSpace:'pre-wrap'});
    const zoomControl = element('div',{className:'qk-office-zoom'});
    const zoomLabel = element('output');
    const zoomPicker = element('select');
    zoomPicker.setAttribute('aria-label','选择缩放');
    for (const [value,label] of [['','⌄'],['width','适合宽度'],['page','适合页面'],
        ...[50,75,100,125,150,175,200].map(n => [String(n),n+'%'])]) {
        zoomPicker.append(element('option',{value,textContent:label,hidden:!value}));
    }
    function zoomButton(text, label, step) {
        const button = element('button',{type:'button',textContent:text,title:label});
        button.setAttribute('aria-label',label);
        button.addEventListener('click',() => setZoom('manual',Math.min(2,Math.max(.5,zoom+step))));
        return button;
    }
    const zoomOut = zoomButton('−','缩小',-.1), zoomIn = zoomButton('+','放大',.1);
    zoomControl.append(zoomOut,zoomLabel,zoomIn,zoomPicker);
    zoomPicker.addEventListener('change',() => {
        const value = zoomPicker.value;
        setZoom(value === 'width' || value === 'page' ? value : 'manual',Number(value)/100);
        zoomPicker.value = '';
    });
    if (session.kind === 'calc') {
        formula.setAttribute('aria-label','公式栏');
        bar.append(element('span',{textContent:'ƒx'},{fontStyle:'italic'}),formula);
    }
    const port = element('div', {className:'qk-office-viewport'}, {overflow:'auto', flex:'1', minWidth:'0', position:'relative', overflowAnchor:'none'});
    const sheet = element('div', {className:'qk-office-paper'}, {position:'relative', overflow:'hidden', background:'#fff'});
    const backing = element('div', {}, {position:'absolute', inset:'0', pointerEvents:'none'});
    const tileLayer = element('div', {}, {position:'absolute', inset:'0', pointerEvents:'none'});
    const overlay = element('div', {}, {position:'absolute', inset:'0', pointerEvents:'none'});
    const input = element('textarea', {readOnly:session.readOnly,tabIndex:-1}, {position:'fixed', color:'transparent', caretColor:'transparent', background:'transparent', width:'1px', height:'16px', minWidth:'0', overflow:'hidden', zIndex:'4', padding:'0', border:'0', resize:'none', pointerEvents:'none'});
    input.setAttribute('aria-label','Office 文档输入');
    const composition = element('span', {}, {position:'absolute', background:'#fff', color:'#222', borderBottom:'1px solid', pointerEvents:'none'});
    composition.hidden = true;
    sheet.append(backing,tileLayer,overlay,composition);
    // Native candidate rectangles must be relative to the top-level viewport.
    host.ownerDocument.body.append(input);
    const desk = element('div',{className:'qk-office-desk'});
    desk.append(sheet);
    port.append(desk);
    if (session.kind === 'impress') shell.append(slides);
    shell.append(port);
    if (session.kind === 'calc') root.append(bar);
    root.append(shell);
    if (session.kind === 'calc') root.append(tabs);
    host.append(root);
    const scale = () => 15 / zoom;
    const span = () => Math.round(pixels * scale() / dpr);
    const cssTile = () => span() / scale();
    let ready;
    const firstPaint = new Promise(resolve => {ready = resolve;});
    const originalToScreen = session.toScreen;
    session.toScreen = rect => {
        const canvas = sheet.getBoundingClientRect(), container = port.getBoundingClientRect(), ratio = scale();
        return {x:canvas.x-container.x+rect.x/ratio, y:canvas.y-container.y+rect.y/ratio, w:rect.w/ratio, h:rect.h/ratio};
    };
    function fitZoom() {
        const width = Math.max(1,port.clientWidth-40)*15/doc.width;
        const pageHeight = session.kind === 'impress' ? doc.height : doc.pageHeight || doc.height;
        const height = Math.max(1,port.clientHeight-40)*15/pageHeight;
        return Math.min(2,Math.max(.05,zoomMode === 'page' ? Math.min(width,height) : width));
    }
    function setZoom(mode,value) {
        const previous = zoom;
        zoomMode = mode;
        zoom = mode === 'manual' ? value : fitZoom();
        const top = port.scrollTop*zoom/previous, left = port.scrollLeft*zoom/previous;
        reset();
        port.scrollTo(left,top);
        renderOverlay();
    }
    function layout() {
        if (zoomMode !== 'manual' && port.clientWidth) zoom = fitZoom();
        zoomLabel.textContent = Math.round(zoom*100)+'%';
        zoomLabel.title = zoomMode === 'width' ? '适合宽度' : zoomMode === 'page' ? '适合页面' : '';
        zoomOut.disabled = zoom <= .5;
        zoomIn.disabled = zoom >= 2;
        desk.classList.toggle('qk-office-center-page',zoomMode === 'page' || session.kind === 'impress');
        sheet.style.width = doc.width/scale()+'px';
        sheet.style.height = doc.height/scale()+'px';
        const placeholder = preview?.(doc.part, zoom);
        if (placeholder && backing.firstChild !== placeholder) backing.replaceChildren(placeholder);
    }
    function renderOverlay() {
        overlay.replaceChildren();
        const cells = session.selection.rects ?? [];
        for (const rect of cells) {
            const kind = session.selection.kind;
            const mark = element('div', {}, {position:'absolute', boxSizing:'border-box',
                border:kind === 'text' ? '0' : '1px solid #2869cb', background:kind === 'text' ? '#639cff66' : 'transparent'});
            place(mark,rect,scale());
            overlay.append(mark);
            if (kind === 'graphic') {
                for (const x of [0,rect.w]) for (const y of [0,rect.h]) {
                    const handle = element('div', {}, {position:'absolute', width:'7px', height:'7px', background:'#fff', border:'1px solid #2869cb', transform:'translate(-50%,-50%)'});
                    style(handle,{left:(rect.x+x)/scale()+'px',top:(rect.y+y)/scale()+'px'});
                    overlay.append(handle);
                }
            }
        }
        if (cursor) {
            if (focused && !cells.length) {
                const caret = element('div', {}, {position:'absolute', background:'#173b76', minWidth:'2px'});
                place(caret,cursor,scale());
                overlay.append(caret);
            }
        }
        const anchor = cursor ?? cells[0] ?? pointerAnchor ?? {x:0,y:0,h:0};
        const left = anchor.x/scale(), top = anchor.y/scale(), height = Math.max(16,anchor.h/scale());
        style(composition,{left:left+'px',top:top+'px',height:height+'px'});
        const screen = sheet.getBoundingClientRect();
        const visible = port.getBoundingClientRect();
        const inputLeft = Math.max(visible.left,Math.min(visible.right-1,screen.left+left));
        const inputTop = Math.max(visible.top,Math.min(visible.bottom-height,screen.top+top));
        style(input,{left:inputLeft+'px',top:inputTop+'px',height:height+'px'});
    }
    function refresh(rects = []) {
        const unit = span();
        for (const tile of cache.values()) {
            if (!rects.length || rects.some(r => tile.col*unit < r.x+r.w && (tile.col+1)*unit > r.x &&
                tile.row*unit < r.y+r.h && (tile.row+1)*unit > r.y)) tile.stale = true;
        }
        schedule();
    }
    function handleEvents(events = []) {
        const invalidations = events.filter(([event]) => event === 'invalidate').map(([,value]) => value);
        if (invalidations.length) refresh(invalidations.some(rects => !rects.length) ? [] : invalidations.flat());
        for (const [event,value] of events) {
            if (event === 'cursor') cursor = value[0] ?? null;
            if (event === 'cursorVisible' && value === 'false') cursor = null;
            if (event === 'formula') formula.textContent = value;
            if (event === 'size') {
                const [width,height] = value.split(',').map(Number);
                if (width > 0 && height > 0 && (width !== doc.width || height !== doc.height)) {
                    Object.assign(doc,{width,height});
                    layout();
                    schedule();
                }
            }
        }
        if (events.some(([event]) => ['cursor','cursorVisible','size'].includes(event))) renderOverlay();
    }
    function schedule() {
        if (stopped) return;
        needsPaint = true;
        if (!painting && !frame) frame = requestAnimationFrame(() => {
            frame = 0;
            void paint().catch(onError);
        });
    }
    function put(tile, result) {
        const {binary, mode} = result;
        if (binary?.byteLength !== pixels*pixels*4) throw Error('Invalid Office tile');
        const rgba = new Uint8ClampedArray(binary.buffer,binary.byteOffset,binary.byteLength);
        if (mode === 1) for (let i = 0; i < rgba.length; i += 4) [rgba[i],rgba[i+2]] = [rgba[i+2],rgba[i]];
        const previous = cache.get(tile.key);
        const canvas = previous?.canvas ?? element('canvas', {width:pixels,height:pixels}, {position:'absolute'});
        const unit = cssTile();
        place(canvas,{x:tile.col*unit,y:tile.row*unit,w:unit,h:unit},1);
        canvas.getContext('2d').putImageData(new ImageData(rgba,pixels,pixels),0,0);
        if (!previous) tileLayer.append(canvas);
        cache.delete(tile.key);
        cache.set(tile.key,{...tile,canvas,stale:false});
        while (cache.size > maxTiles) {
            const [key, entry] = cache.entries().next().value;
            cache.delete(key);
            entry.canvas.remove();
        }
    }
    function reset() {
        generation++;
        viewportKey = '';
        cache.clear();
        tileLayer.replaceChildren();
        layout();
        renderOverlay();
        schedule();
    }
    async function paint() {
        if (painting || stopped || inputPending) return;
        if (devicePixelRatio !== dpr) {
            dpr = devicePixelRatio;
            reset();
        }
        painting = true;
        needsPaint = false;
        try {
            const viewport = port.getBoundingClientRect(), surface = sheet.getBoundingClientRect();
            const bounds = {left:Math.max(0,viewport.left-surface.left), top:Math.max(0,viewport.top-surface.top),
                right:Math.min(sheet.clientWidth,viewport.right-surface.left), bottom:Math.min(sheet.clientHeight,viewport.bottom-surface.top)};
            const unit = span(), token = generation;
            const rect = [bounds.left,bounds.top,bounds.right-bounds.left,bounds.bottom-bounds.top].map(n => Math.max(0,Math.round(n*scale())));
            const key = [unit,doc.part,...rect].join(':');
            if (key !== viewportKey) {
                const view = await request('viewport',{span:unit,rect});
                viewportKey = key;
                handleEvents(view.events);
            }
            const caret = cursor && {x:cursor.x/scale(),y:cursor.y/scale()};
            const tiles = prioritizeTiles(bounds,cssTile(),caret).slice(0,maxTiles);
            let painted = 0;
            for (const tile of tiles) {
                if (stopped || inputPending || token !== generation) break;
                const hit = cache.get(tile.key);
                if (hit && !hit.stale) {
                    cache.delete(tile.key);
                    cache.set(tile.key,hit);
                } else {
                    const result = await request('tile',{part:doc.part,x:tile.col*unit,y:tile.row*unit,span:unit});
                    if (stopped || token !== generation) break;
                    handleEvents(result.events);
                    put(tile,result);
                }
                painted++;
            }
            if (tiles.length && painted === tiles.length && !hasFirstPaint) {
                hasFirstPaint = true;
                ready(true);
            }
        } finally {
            painting = false;
            if (needsPaint && !inputPending) schedule();
        }
    }
    async function action(send, edit = false, wholeView = false) {
        inputPending++;
        lastInput = performance.now();
        const before = cursor;
        try {
            const result = await send();
            if (stopped) return result;
            handleEvents(result?.events);
            if (edit) {
                if (session.kind === 'impress') scheduleThumbnailRefresh();
                const marks = [before,cursor].filter(Boolean);
                refresh(wholeView ? [] : marks.map(rect => ({
                    x:session.kind === 'writer' ? 0 : Math.max(0,rect.x-span()),
                    y:rect.y, w:session.kind === 'writer' ? doc.width : 3*span(), h:Math.max(1,rect.h),
                })));
            }
            return result;
        } catch (error) {
            onError(error);
        } finally {
            inputPending--;
            schedule();
        }
    }
    const ime = createComposition(text => action(() => request('ime',{text}),true), text => {
        composition.textContent = text;
        composition.hidden = !text;
    });
    input.addEventListener('compositionstart',() => {session.interaction?.({ime:true}); ime.start();});
    input.addEventListener('compositionupdate',event => ime.update(event.data));
    input.addEventListener('compositionend',event => {input.value = ''; void Promise.resolve(ime.end(event.data)).finally(() => session.interaction?.({ime:false}));});
    input.addEventListener('focus',() => {focused = true; renderOverlay();});
    input.addEventListener('blur',() => {focused = false; queueThumbnails(); ime.cancel(); input.value = ''; renderOverlay();});
    input.addEventListener('keydown',event => {
        if (ime.active) return;
        const key = officeShortcut(event);
        if (!key || (session.readOnly && (key.edit || (key.command && key.command !== 'SelectAll')))) return;
        event.preventDefault();
        if (key.command === 'Save') void action(() => session.save({reason:'manual'}));
        else if (key.command) void action(() => session.uno('.uno:'+key.command),key.command !== 'SelectAll',true);
        else void action(() => request('key',key),key.edit,event.key === 'Enter');
    });
    input.addEventListener('input',event => {
        if (!ime.active && !event.isComposing && event.inputType === 'insertText' && input.value) {
            const text = input.value;
            input.value = '';
            void action(() => request('paste',{text}),true);
        }
    });
    input.addEventListener('copy',event => {
        const text = session.selection.text;
        if (!text) return;
        event.preventDefault();
        event.clipboardData.setData('text/plain',text);
    });
    input.addEventListener('paste',event => {
        if (session.readOnly) return;
        event.preventDefault();
        const image = [...event.clipboardData.files].find(file => ['image/png','image/jpeg'].includes(file.type));
        const html = event.clipboardData.getData('text/html');
        const text = html || event.clipboardData.getData('text/plain');
        if (image) void action(async () => request('paste',{mime:image.type,binary:new Uint8Array(await image.arrayBuffer())}),true);
        else if (text) void action(() => request('paste',{mime:html ? 'text/html' : 'text/plain;charset=utf-8',text}),true);
    });
    function pointer(event,type) {
        const rect = sheet.getBoundingClientRect();
        const x = Math.max(0,Math.round((event.clientX-rect.left)*scale()));
        const y = Math.max(0,Math.round((event.clientY-rect.top)*scale()));
        void action(() => request('mouse',{args:[type,x,y,Math.max(1,Math.min(event.detail,2)),type === 1 ? 0 : 1,event.shiftKey ? 4096 : 0]}));
    }
    let pointerId, lastMove = 0, graphicDrag = false;
    function graphicPoint(event,phase) {
        const bounds = sheet.getBoundingClientRect();
        return request('graphic',{phase,x:Math.max(0,Math.round((event.clientX-bounds.left)*scale())),
            y:Math.max(0,Math.round((event.clientY-bounds.top)*scale()))});
    }
    // A native click on the text control seeds Chromium's marked-text rectangle on macOS.
    const nativePointerFocus = /Mac/.test(navigator.platform);
    function followPointer(event) {
        if (!nativePointerFocus || focused || event.pointerType !== 'mouse' || event.buttons) return;
        const overText = event.target === input || sheet.contains(event.target);
        input.style.pointerEvents = overText ? 'auto' : 'none';
        if (overText) {
            input.style.left = (event.clientX-.5)+'px';
            input.style.top = (event.clientY-2)+'px';
        }
    }
    const pointerLifetime = new AbortController();
    document.addEventListener('pointermove',followPointer,{capture:true,signal:pointerLifetime.signal});
    function beginPointer(event) {
        if (event.button !== 0) return;
        const nativeFocus = event.currentTarget === input;
        if (!nativeFocus) event.preventDefault();
        const bounds = sheet.getBoundingClientRect();
        pointerAnchor = {x:(event.clientX-bounds.left)*scale(), y:(event.clientY-bounds.top)*scale(), h:0};
        cursor = null;
        if (!nativeFocus) {
            renderOverlay();
            input.focus({preventScroll:true});
        }
        session.interaction?.({drag:true});
        pointerId = event.pointerId;
        sheet.setPointerCapture(pointerId);
        graphicDrag = !session.readOnly && session.kind === 'impress' && session.selection.kind === 'graphic' &&
            session.selection.rects.some(rect => {
                const bounds = sheet.getBoundingClientRect();
                const x = (event.clientX-bounds.left)*scale(), y = (event.clientY-bounds.top)*scale();
                const margin = 8*scale();
                return Math.min(Math.abs(x-rect.x),Math.abs(x-rect.x-rect.w)) <= margin &&
                    Math.min(Math.abs(y-rect.y),Math.abs(y-rect.y-rect.h)) <= margin;
            });
        if (graphicDrag) void action(() => graphicPoint(event,0));
        else pointer(event,0);
    }
    sheet.addEventListener('pointerdown',beginPointer);
    input.addEventListener('pointerdown',beginPointer);
    input.addEventListener('focus',() => {input.style.pointerEvents = 'none';});
    sheet.addEventListener('pointermove',event => {
        if (graphicDrag || pointerId !== event.pointerId || performance.now()-lastMove < 16) return;
        lastMove = performance.now();
        pointer(event,2);
    });
    function endPointer(event) {
        if (pointerId !== event.pointerId) return;
        pointerId = undefined;
        if (graphicDrag) void action(() => graphicPoint(event,1),true);
        else pointer(event,1);
        graphicDrag = false;
    }
    sheet.addEventListener('pointerup',event => {endPointer(event); session.interaction?.({drag:false});});
    sheet.addEventListener('pointercancel',() => session.interaction?.({drag:false}));
    input.addEventListener('blur',() => session.interaction?.({ime:false, drag:false}));
    sheet.addEventListener('pointercancel',endPointer);
    port.addEventListener('scroll',() => {renderOverlay(); schedule();}, {passive:true});
    let thumbObserver, thumbQueued = false;
    const thumbnails = new Map();
    const visibleThumbnails = new Set();
    let thumbnailRefresh, lastInput = 0, editedThumbnail;
    const idle = globalThis.requestIdleCallback ?? (callback => setTimeout(callback,80));
    function scheduleThumbnailRefresh() {
        clearTimeout(thumbnailRefresh);
        const part = doc.part;
        thumbnailRefresh = setTimeout(() => {
            const previous = thumbnails.get(part);
            const card = slides.querySelector('[data-part="'+part+'"]');
            if (!card || !previous) return;
            thumbnails.delete(part);
            editedThumbnail = part;
            thumbObserver?.observe(card);
            if (card.offsetTop + card.offsetHeight >= slides.scrollTop &&
                card.offsetTop <= slides.scrollTop + slides.clientHeight) visibleThumbnails.add(card);
            queueThumbnails();
        },500);
    }
    function queueThumbnails() {
        if (thumbQueued || stopped || !visibleThumbnails.size || (focused && editedThumbnail == null)) return;
        thumbQueued = true;
        idle(async () => {
            try {
                if (stopped || inputPending || performance.now()-lastInput < 120) return;
                const cards = [...visibleThumbnails].filter(card => card.isConnected &&
                    !thumbnails.has(Number(card.dataset.part)) && (!focused || Number(card.dataset.part) === editedThumbnail)).slice(0,4);
                if (focused && !cards.length) editedThumbnail = undefined;
                if (cards.some(card => Number(card.dataset.part) === editedThumbnail)) editedThumbnail = undefined;
                for (const card of cards) { visibleThumbnails.delete(card); thumbObserver?.unobserve(card); }
                if (!cards.length) return;
                const {binary,mode} = await request('thumbnails',{parts:cards.map(card => Number(card.dataset.part))});
                if (stopped || !binary) return;
                const length = 96*96*4;
                for (const [index,card] of cards.entries()) {
                    if (!card.isConnected) continue;
                    const rgba = new Uint8ClampedArray(binary.buffer,binary.byteOffset+index*length,length);
                    if (mode === 1) for (let i = 0; i < rgba.length; i+=4) [rgba[i],rgba[i+2]] = [rgba[i+2],rgba[i]];
                    const image = element('canvas',{width:96,height:Math.max(1,Math.round(96*doc.height/Math.max(doc.width,doc.height)))},{display:'block',width:'100%',height:'100%',objectFit:'contain'});
                    image.getContext('2d').putImageData(new ImageData(rgba,96,96),0,0);
                    card.querySelector('canvas')?.remove();
                    card.prepend(image);
                    thumbnails.set(Number(card.dataset.part),image);
                    if (thumbnails.size > 24) {
                        const [key,old] = thumbnails.entries().next().value;
                        const parent = old.parentElement;
                        old.remove();
                        thumbnails.delete(key);
                        if (parent) thumbObserver?.observe(parent);
                    }
                }
            } catch (error) { onError(error); }
            finally { thumbQueued = false; queueThumbnails(); }
        });
    }
    function parts() {
        thumbObserver?.disconnect();
        visibleThumbnails.clear();
        if (session.kind === 'impress') thumbObserver = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (entry.isIntersecting) visibleThumbnails.add(entry.target);
                else visibleThumbnails.delete(entry.target);
            }
            queueThumbnails();
        },{root:slides});

        const target = session.kind === 'impress' ? slides : tabs;
        target.replaceChildren(...(doc.parts ?? []).map((name,part) => {
            const button = element('button',{type:'button',textContent:session.kind === 'impress' ? '' : name}, {display:session.kind === 'impress' ? 'block' : 'inline-block'});
            button.setAttribute('aria-pressed',String(part === doc.part));
            if (thumbObserver) {
                button.dataset.part = part;
                button.className = 'qk-office-slide-card';
                button.setAttribute('aria-label',name);
                button.append(element('span',{textContent:String(part+1)}));
                if (thumbnails.has(part)) button.prepend(thumbnails.get(part));
                else thumbObserver.observe(button);
            }
            button.addEventListener('click',() => void action(async () => {
                if (part === doc.part) return;
                ime.cancel();
                Object.assign(doc,await request('part',{part}));
                cursor = null;
                reset();
                parts();
                port.scrollTo(0,0);
            }));
            return button;
        }));
    }
    const subscriptions = [
        session.on('selection',renderOverlay),
        session.on('reloaded',result => {if (result.metadata) Object.assign(doc,result.metadata); reset(); parts();}),
    ];
    const observer = new ResizeObserver(() => {
        if (zoomMode !== 'manual' && fitZoom() !== zoom) reset();
        else { renderOverlay(); schedule(); }
    });
    observer.observe(port);
    layout();
    renderOverlay();
    parts();
    if (session.kind === 'impress') void firstPaint.then(ok => {if (ok && !stopped) parts();});
    port.scrollTo(initialScroll.left ?? 0,initialScroll.top ?? 0);
    schedule();
    return {element:root, input, viewport:port, zoomControl, firstPaint, async locate(target) {
        const result = await action(() => request('locate',{target}));
        if (!result) return;
        const changed = result.part !== doc.part || result.width !== doc.width || result.height !== doc.height;
        Object.assign(doc,result);
        if (changed) { reset(); parts(); }
        else renderOverlay();
        const rect = result.rects?.[0];
        port.scrollTo(rect ? Math.max(0,rect.x/scale()-24) : 0,
            rect ? Math.max(0,rect.y/scale()-24) : 0);
    }, destroy() {
        if (stopped) return;
        stopped = true;
        ready(false);
        cancelAnimationFrame(frame);
        observer.disconnect();
        pointerLifetime.abort();
        thumbObserver?.disconnect();
        clearTimeout(thumbnailRefresh);
        thumbnails.clear();
        ime.cancel();
        for (const off of subscriptions) off?.();
        session.toScreen = originalToScreen;
        input.remove();
        root.remove();
    }};
}

/** Adapt the private port back to the public OfficeSession view. */
export function connectOfficeViewPort(port) {
    const waiters = new Map();
    let next = 0, epoch, wrapped, stopped = false;
    let initialize, fail;
    const ready = new Promise((resolve,reject) => {initialize = resolve; fail = reject;});
    const expose = {
        uno:(command,args) => call('uno',[command,args]),
        getSelection:(options) => call('getSelection',[options]),
        replaceSelection:(text,options) => call('replaceSelection',[text,options]),
        setTrackChanges:on => call('setTrackChanges',[on]),
        acceptAll:() => call('acceptAll',[]),
        rejectAll:() => call('rejectAll',[]),
        acceptChange:id => call('acceptChange',[id]),
        rejectChange:id => call('rejectChange',[id]),
        undo:() => call('undo',[]),
        redo:() => call('redo',[]),
        save:options => call('save',[options]),
        reload:() => call('reload',[]),
        resolveRecovery:choice => call('resolveRecovery',[choice]),
        resolveConflict:choice => call('resolveConflict',[choice]),
        interaction:value => { void call('interaction',[value]).catch(() => {}); },
    };
    const timeout = setTimeout(() => close(Error('Office 会话连接超时')),30_000);
    function close(error = Error('Office 视图已关闭')) {
        if (stopped) return;
        stopped = true;
        clearTimeout(timeout);
        port.close();
        fail(error);
        for (const waiter of waiters.values()) {
            clearTimeout(waiter.timer);
            waiter.reject(error);
        }
        waiters.clear();
    }
    function call(op,args) {
        if (stopped) return Promise.reject(Error('Office 视图已关闭'));
        const seq = ++next;
        return new Promise((resolve,reject) => {
            const timer = setTimeout(() => close(Error('Office 视图操作超时')),30_000);
            waiters.set(seq,{resolve,reject,timer});
            try { port.postMessage({epoch,seq,op,args}); }
            catch (error) { close(error); }
        });
    }
    port.onmessage = ({data}) => {
        if (data.type === 'ready' && !epoch) {
            clearTimeout(timeout);
            epoch = data.epoch;
            wrapped = createSessionView(data);
            const session = Object.assign(wrapped.view,expose);
            for (const [key,value] of Object.entries(data.state ?? {})) session.state.set(key,value);
            session.selection = data.selection;
            initialize({session, metadata:data.metadata,readOnlyReason:data.readOnlyReason,recovery:data.recovery,saveState:data.saveState,
                request:(op,payload = {}) => call(op,[payload]), close});
        } else if (data.epoch === epoch && data.type === 'event') {
            wrapped?.publish(data.event,data.value);
            if (data.event === 'closed') close();
        } else if (data.epoch === epoch && data.type === 'reply') {
            const waiter = waiters.get(data.seq);
            if (!waiter) return;
            waiters.delete(data.seq);
            clearTimeout(waiter.timer);
            if (data.error) waiter.reject(Error(data.error));
            else waiter.resolve(data.result);
        }
    };
    port.onmessageerror = () => close(Error('Office 视图消息无效'));
    port.start();
    return ready;
}
