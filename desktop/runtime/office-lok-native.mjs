export const nativeWorker = String.raw`
import base64, ctypes as C, io, json, os, pathlib, re, sys, time, uuid, zipfile
from urllib.parse import unquote
from xml.etree import ElementTree as XML

P, I, S = C.c_void_p, C.c_int, C.c_char_p
engine, root = map(pathlib.Path, sys.argv[1:3])
ABI = json.loads((root / 'ABI.json').read_text())['classes']
os.umask(0o077)
os.environ.update(SAL_USE_VCLPLUGIN='svp', SAL_LOG='-WARN')
libfile = engine.parent / 'Frameworks/libmergedlo.dylib' if sys.platform == 'darwin' else engine / 'libsofficeapp.so'
lib = C.CDLL(str(libfile), mode=C.RTLD_GLOBAL)
hook = lib.libreofficekit_hook_2
hook.argtypes, hook.restype = [S, S], P
kit = hook(os.fsencode(engine), (root / 'profile').as_uri().encode())
if not kit:
    raise RuntimeError('LibreOfficeKit initialization failed')
docs = {}
bindings = {}
Callback = C.CFUNCTYPE(None, I, S, P)

def call(obj, cls, name, ret, types, *args):
    table = P.from_address(obj).value
    key = (table, name)
    fn = bindings.get(key)
    if fn is None:
        offset = (ABI[cls].index(name) + 1) * C.sizeof(P)
        if offset + C.sizeof(P) > C.c_size_t.from_address(table).value:
            raise RuntimeError('Unsupported LibreOfficeKit method: ' + name)
        ptr = P.from_address(table + offset).value
        if not ptr:
            raise RuntimeError('Unavailable LibreOfficeKit method: ' + name)
        fn = bindings[key] = C.CFUNCTYPE(ret, P, *types)(ptr)
    return fn(obj, *args)

def office(name, ret, types=(), *args):
    return call(kit, 'LibreOfficeKitClass', name, ret, types, *args)

def free(pointer):
    if pointer:
        table = P.from_address(kit).value
        index = ABI['LibreOfficeKitClass'].index('freeError') + 1
        C.CFUNCTYPE(None, P)(P.from_address(table + index*C.sizeof(P)).value)(pointer)

def rectangles(value):
    if value.startswith('{'):
        value = json.loads(value).get('rectangle', '')
    result = []
    for rect in value.split(';'):
        items = rect.split(',')[:4]
        if len(items) == 4 and all(re.fullmatch(r'\s*-?\d+\s*', item) for item in items):
            result.append(dict(zip(('x', 'y', 'w', 'h'), map(int, items))))
    return result

class View:
    def __init__(self, document):
        self.document = document
        self.events = []
        self.token = None
        self.rects = []
        self.kind = 'none'
        self.selection_changed = False
        self.command_result = None
        self.states = {}
        self.callback = Callback(self.receive)

    def receive(self, kind, payload, _):
        value = (payload or b'').decode(errors='replace')
        if kind == 16:
            self.command_result = value
        elif kind == 8:
            command, sep, state = value.partition('=')
            if sep and command.startswith('.uno:'):
                self.states[command] = state
                self.events.append(('state', {command:state}))
        elif kind in (2, 6, 17, 42):
            self.kind = {2:'text', 6:'graphic', 17:'cell', 42:'cell'}[kind]
            self.rects = rectangles(value)
            if not self.rects:
                self.kind = 'none'
            self.selection_changed = True
        elif kind in (0, 1, 5, 13, 14, 19):
            name = {0:'invalidate', 1:'cursor', 5:'cursorVisible', 13:'size', 14:'part', 19:'formula'}[kind]
            if kind in (0, 1):
                value = rectangles(value)
            self.events.append((name, value))

    def selection(self):
        text = self.document.text()
        if self.selection_changed:
            self.token = uuid.uuid4().hex
            self.selection_changed = False
        return dict(kind=self.kind, rects=self.rects, anchor=self.rects[0] if self.rects else None, token=self.token, text=text)

    def drain(self):
        if self.selection_changed:
            self.events.append(('selection', self.selection()))
        events, self.events = self.events, []
        states = {}
        latest = {}
        for name, value in events:
            if name == 'state':
                states.update(value)
            elif name in ('cursor', 'cursorVisible', 'formula'):
                latest.pop(name, None)
                latest[name] = value
        events = [(name, value) for name, value in events if name != 'state' and name not in latest]
        if states:
            events.insert(0, ('state', states))
        events.extend(latest.items())
        return events

class Document:
    def __init__(self, source, fmt, read_only, ephemeral_source=False):
        self.source, self.fmt, self.read_only = source, fmt, read_only
        self.ephemeral_source = ephemeral_source
        self.views = {}
        self.changes = {}
        self.handle = office('documentLoad', P, (S,), source.as_uri().encode())
        if not self.handle:
            raise RuntimeError('Office document load failed')
        try:
            self.call('initializeForRendering', None, (S,), b'{}')
            self.initial = self.call('getView', I)
            if ephemeral_source:
                source.unlink()
        except Exception:
            self.destroy()
            raise

    def call(self, name, ret, types=(), *args):
        return call(self.handle, 'LibreOfficeKitDocumentClass', name, ret, types, *args)

    def numbers(self, name, *args):
        return self.call(name, None, (I,) * len(args), *args)

    def string(self, pointer):
        try:
            return C.string_at(pointer).decode(errors='replace') if pointer else ''
        finally:
            if pointer:
                free(pointer)

    def metadata(self):
        width, height = C.c_long(), C.c_long()
        self.call('getDocumentSize', None, (P,P), C.byref(width), C.byref(height))
        count = self.call('getParts', I)
        if self.fmt != 'docx' and getattr(self,'part_count',None) != count:
            self.part_count = count
            self.part_names = [self.string(self.call('getPartName', P, (I,), index)) for index in range(count)]
        names = [] if self.fmt == 'docx' else self.part_names
        metadata = dict(width=width.value, height=height.value, parts=names, part=self.call('getPart', I))
        if self.fmt == 'docx':
            pages = rectangles(self.string(self.call('getPartPageRectangles', P)) or '')
            if pages:
                metadata['pageHeight'] = pages[0]['h']
        return metadata

    def attach(self, preferred=None):
        if preferred is not None:
            self.numbers('setView', preferred)
            view_id = preferred
        elif self.initial not in self.views:
            self.numbers('setView', self.initial)
            view_id = self.initial
        else:
            view_id = self.call('createView', I)
            if view_id < 0:
                raise RuntimeError('Office view creation failed')
            self.numbers('setView', view_id)
            self.call('initializeForRendering', None, (S,), b'{}')
        view = View(self)
        self.views[view_id] = view
        if self.read_only:
            self.call('setViewReadOnly', None, (I,C.c_bool), view_id, True)
        self.call('registerCallback', None, (P,P), C.cast(view.callback,P), None)
        return view_id, view

    def detach(self, view_id):
        if view_id == self.initial:
            self.numbers('setView', view_id)
            self.call('registerCallback', None, (P,P), None, None)
        else:
            self.numbers('destroyView', view_id)
        self.views.pop(view_id, None)

    def destroy(self):
        self.call('destroy', None)
        self.views.clear()

    def text(self):
        used = P()
        ptr = self.call('getTextSelection', P, (S,P), b'text/plain;charset=utf-8', C.byref(used))
        if used.value:
            free(used.value)
        return self.string(ptr)

    def paste(self, mime, data):
        if not self.call('paste', C.c_bool, (S,P,C.c_size_t), mime.encode(), data, len(data)):
            raise RuntimeError('Office paste failed')

    def export_file(self):
        output = root / (uuid.uuid4().hex + '.' + self.fmt)
        try:
            if not self.call('saveAs', I, (S,S,S), output.as_uri().encode(), self.fmt.encode(), None):
                raise RuntimeError('Office export failed')
            if output.stat().st_size > 64 * 1024**2:
                raise RuntimeError('Office export is too large')
            with output.open('rb') as stream:
                output.unlink()
                return stream.read()
        finally:
            output.unlink(missing_ok=True)

    def model(self):
        # Read the edited model from a private copy; saveAs leaves ownership and
        # the current document revision unchanged.
        with zipfile.ZipFile(io.BytesIO(self.export_file())) as package:
            return read_model(self.fmt, package)

    def values(self, command):
        value = self.string(self.call('getCommandValues',P,(S,),command.encode()))
        return json.loads(value) if value else {}

    def redlines(self):
        return self.values('.uno:AcceptTrackedChanges').get('redlines', [])

    def undo_count(self):
        value = self.values('.uno:UndoCount')
        if not isinstance(value,int) or value < 0:
            raise ValueError('Office undo history unavailable')
        return value

    def track(self, view, enabled):
        command = '.uno:TrackChanges'
        want = str(enabled).lower()
        if view.states.get(command) != want:
            self.dispatch(view,command,typed(TrackChanges=enabled))
            deadline = time.monotonic()+.3
            while view.states.get(command) != want and time.monotonic() < deadline:
                time.sleep(.002)
            if view.states.get(command) != want:
                raise ValueError('Writer tracking state could not be verified')

    def dispatch(self, view, command, args=None, timeout=1):
        view.command_result = None
        self.call('postUnoCommand', None, (S,S,C.c_bool), command.encode(),
                  json.dumps(args).encode() if args else None, True)
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if view.command_result:
                result = json.loads(view.command_result)
                if result.get('commandName') == command:
                    return result
            time.sleep(.002)
        return dict(success=False)

    def tile(self, request):
        x, y, span, part = (int(request[k]) for k in ('x','y','span','part'))
        pixels = int(request.get('pixels', 256))
        if pixels not in (96, 256) or min(x,y,part) < 0 or not 1 <= span <= 10000000:
            raise ValueError('Invalid tile')
        data = (C.c_ubyte * (pixels * pixels * 4))()
        start = time.perf_counter()
        if self.fmt == 'docx':
            self.call('paintTile', None, (P,) + (I,)*6, data, pixels,pixels,x,y,span,span)
        else:
            self.call('paintPartTile', None, (P,) + (I,)*8, data, part,0,pixels,pixels,x,y,span,span)
        return dict(ms=(time.perf_counter()-start)*1000, mode=self.call('getTileMode', I),
                    binary=bytes(data), pixels=pixels)

def read_model(fmt, package):
    def file(name):
        return XML.fromstring(package.read(name))
    def text(node, tag):
        return ''.join(item.text or '' for item in node.findall('.//{*}'+tag))
    def ordered(pattern):
        by_number = []
        for name in package.namelist():
            match = re.fullmatch(pattern, name)
            if match:
                by_number.append((int(match[1]), name))
        return [file(name) for _, name in sorted(by_number)]
    if fmt == 'docx':
        body = file('word/document.xml')
        paragraphs = []
        for node in body.findall('.//{*}p'):
            style = node.find('./{*}pPr/{*}pStyle')
            value = next(iter(style.attrib.values()), None) if style is not None else None
            paragraphs.append(dict(paragraph=len(paragraphs), text=text(node,'t'), style=value))
        charts = sum(bool(re.fullmatch(r'word/charts/chart[0-9]+\.xml',name)) for name in package.namelist())
        tables = [[[text(cell,'t') for cell in row.findall('./{*}tc')] for row in table.findall('./{*}tr')]
                  for table in body.findall('.//{*}tbl')]
        return dict(paragraphs=paragraphs, tables=tables, charts=charts)
    if fmt == 'pptx':
        slides = []
        for node in ordered(r'ppt/slides/slide([0-9]+)\.xml'):
            shapes = []
            for shape in node.findall('.//{*}sp'):
                prop = shape.find('./{*}nvSpPr/{*}cNvPr')
                if prop is not None:
                    shapes.append(dict(shape=prop.get('id'), name=prop.get('name'), text=text(shape,'t')))
            slides.append(dict(slide=len(slides), shapes=shapes))
        charts = sum(bool(re.fullmatch(r'ppt/charts/chart[0-9]+\.xml',name)) for name in package.namelist())
        return dict(slides=slides, charts=charts)
    names = [node.get('name') for node in file('xl/workbook.xml').findall('.//{*}sheet')]
    shared = [text(item,'t') for item in file('xl/sharedStrings.xml')] if 'xl/sharedStrings.xml' in package.namelist() else []
    sheets = []
    for node in ordered(r'xl/worksheets/sheet([0-9]+)\.xml'):
        cells = {}
        for cell in node.findall('.//{*}c'):
            value = cell.findtext('{*}v')
            if cell.get('t') == 's' and value is not None:
                value = shared[int(value)]
            if cell.get('t') == 'inlineStr':
                value = text(cell,'t')
            cells[cell.get('r')] = dict(value=value, formula=cell.findtext('{*}f'), style=cell.get('s'))
        sheets.append(dict(sheet=names[len(sheets)], cells=cells))
    return dict(sheets=sheets)

def typed(**args):
    return {key:dict(type='boolean' if isinstance(value,bool) else 'long' if isinstance(value,int)
                     else 'double' if isinstance(value,float) else 'string', value=value) for key,value in args.items()}

def select_text(d, v, text):
    if not text:
        raise ValueError('Missing Office text target')
    d.dispatch(v, '.uno:ExecuteSearch', typed(**{'SearchItem.SearchString':text, 'SearchItem.Command':0,
                                                'SearchItem.Backward':False, 'SearchItem.SearchFlags':0}))
    if d.text() != text:
        raise ValueError('Office text target could not be selected')

def apply_operation(d, v, operation):
    name = operation['op']
    before = d.model()
    after = None
    if name == 'update_table' and d.fmt == 'docx':
        index = int(operation['target']['table'])
        rows = operation['rows']
        original = before['tables'][index]
        if len(original) != len(rows) or any(len(a) != len(b) for a, b in zip(original, rows)):
            raise ValueError('Writer table resizing is unavailable')
        if operation.get('fetchedAt'):
            raise ValueError('Native table provenance annotations are unavailable')
        for old_row, new_row in zip(original, rows):
            for old, new in zip(old_row, new_row):
                if old == new:
                    continue
                current = d.model()
                if not old or sum(item['text'].count(old) for item in current['paragraphs']) != 1:
                    raise ValueError('Writer table cell text is empty or ambiguous')
                select_text(d, v, old)
                d.paste('text/plain;charset=utf-8', new.encode())
        if d.model()['tables'][index] != rows:
            raise ValueError('Writer table verification failed')
        after = d.model()
    elif name in ('replace_text','insert_paragraph','set_style','insert_table','insert_chart') and d.fmt == 'docx':
        target = operation.get('target',{})
        if 'paragraph' not in target and operation.get('after') is not None:
            anchor = operation['after']
            target = anchor if isinstance(anchor,dict) else dict(paragraph=anchor)
        paragraph = target.get('paragraph')
        search = target.get('find')
        if paragraph is not None:
            search = before['paragraphs'][int(paragraph)]['text']
        if search:
            if sum(item['text'].count(search) for item in before['paragraphs']) != 1:
                raise ValueError('Writer text target is ambiguous')
            select_text(d,v,search)
        if name == 'replace_text':
            if not search:
                raise ValueError('Writer text target required')
            d.paste('text/plain;charset=utf-8',operation['text'].encode())
            after = d.model()
            expected = [item['text'].replace(search,operation['text'],1) for item in before['paragraphs']]
            if [item['text'] for item in after['paragraphs']] != expected:
                raise ValueError('Writer replacement verification failed')
        elif name == 'insert_paragraph':
            if not search or operation.get('style'):
                raise ValueError('A unique Writer paragraph anchor and plain text are required')
            d.paste('text/plain;charset=utf-8',(search+'\n'+operation['text']).encode())
            after = d.model()
            if len(after['paragraphs']) != len(before['paragraphs'])+1 or operation['text'] not in [item['text'] for item in after['paragraphs']]:
                raise ValueError('Writer paragraph verification failed')
        elif name == 'set_style':
            style = operation['style']
            commands = {'bold':('Bold','Bold'), 'italic':('Italic','Italic'), 'color':('Color','Color'),
                        'size':('FontHeight','FontHeight.Height')}
            if not search or not style or set(style) - commands.keys():
                raise ValueError('Office style is unavailable')
            for key,value in style.items():
                command, property_name = commands[key]
                args = typed(**{property_name:value})
                if key == 'size':
                    args[property_name]['type'] = 'float'
                completed = d.dispatch(v,'.uno:'+command,args)
                if not completed.get('success') and v.states.get('.uno:'+command) != str(value).lower():
                    raise ValueError('Writer style verification failed')
            after = d.model()
        elif name == 'insert_table':
            from html import escape
            if not search:
                raise ValueError('Writer table anchor required')
            rows = operation['rows']
            d.dispatch(v,'.uno:GoToEndOfPara')
            cells = []
            for index,row in enumerate(rows):
                tag = 'th' if index == 0 and operation.get('header') else 'td'
                cells.append('<tr>'+''.join('<'+tag+'>'+escape(value)+'</'+tag+'>' for value in row)+'</tr>')
            d.paste('text/html',('<html><body><table>'+''.join(cells)+'</table></body></html>').encode())
            after = d.model()
            if len(after['tables']) != len(before['tables'])+1 or rows not in after['tables']:
                raise ValueError('Writer table verification failed')
        else:
            raise ValueError('Chart data binding unavailable')
    elif name in ('set_shape_text','replace_text') and d.fmt == 'pptx':
        target = operation.get('target') or operation
        index = int(target['slide'])
        shapes = before['slides'][index]['shapes']
        shape = next(item for item in shapes if item['shape'] == str(target['shape']))
        search = shape['text']
        if not search or any(item is not shape and search in item['text'] for item in shapes):
            raise ValueError('Impress shape needs a unique nonempty text target')
        d.numbers('setPart',index)
        select_text(d,v,search)
        if d.call('getPart',I) != index:
            raise ValueError('Impress search moved outside the target slide')
        d.paste('text/plain;charset=utf-8',operation['text'].encode())
        after = d.model()
        updated = next(item for item in after['slides'][index]['shapes'] if item['shape'] == shape['shape'])
        if updated['text'] != operation['text']:
            raise ValueError('Impress shape text verification failed')
    elif name == 'add_slide' and d.fmt == 'pptx':
        if operation.get('title') or operation.get('bullets') or operation.get('layout') not in (None,'blank'):
            raise ValueError('Only empty slides are supported')
        count = d.call('getParts', I)
        d.dispatch(v,'.uno:InsertPage')
        if d.call('getParts', I) != count + 1:
            raise ValueError('Slide insertion verification failed')
    elif name == 'set_cell' and d.fmt == 'xlsx':
        sheets = [sheet['sheet'] for sheet in before['sheets']]
        sheet = str(operation['sheet'])
        index = sheets.index(sheet) if sheet in sheets else int(sheet)
        if not 0 <= index < len(sheets):
            raise ValueError('Calc sheet out of range')
        cell = operation['cell']
        if not re.fullmatch(r'[A-Z]{1,3}[1-9][0-9]{0,6}',cell):
            raise ValueError('Invalid Calc cell reference')
        formula = operation.get('formula')
        value = operation.get('value')
        if formula is not None:
            formula = formula.removeprefix('=')
            if not re.fullmatch(r'[A-Z0-9$.()+*/%,:<>^=-]{1,400}',formula) or any(
                function not in ('SUM','AVERAGE','MIN','MAX','COUNT','IF','ROUND')
                for function in re.findall(r'([A-Z][A-Z0-9]*)\(',formula)
            ):
                raise ValueError('Unsupported internal Calc formula')
            literal = '='+formula
        else:
            if isinstance(value,bool) or not isinstance(value,(int,float,str)):
                raise ValueError('Invalid Calc value')
            literal = "'"+value if isinstance(value,str) else str(value)
        d.numbers('setPart',index)
        d.dispatch(v,'.uno:GoToCell',typed(ToPoint=cell))
        d.dispatch(v,'.uno:EnterString',typed(StringName=literal))
        after = d.model()
        written = after['sheets'][index]['cells'].get(cell,{})
        if (formula is not None and written.get('formula') != formula) or (
            formula is None and written.get('value') != str(value)
        ):
            raise ValueError('Calc cell verification failed')
    else:
        raise ValueError('Unsupported document operation: '+name)
    return dict(op=name, target=operation.get('target'), verified=True), (after if after is not None else d.model())

def load(source, data):
    with source.open('xb') as stream:
        stream.write(base64.b64decode(data, validate=True))

# Property names accepted by the commands whose arguments come from the UI; anything else is
# rejected before it is handed to LibreOfficeKit.
UNO_ARGS = {'.uno:AttributePageSize': {'AttributePageSize.Width', 'AttributePageSize.Height'}, '.uno:BackgroundColor': {'BackgroundColor'}, '.uno:CharBackColor': {'CharBackColor'}, '.uno:CharFontName': {'CharFontName.FamilyName'}, '.uno:Color': {'Color'}, '.uno:DeleteCell': {'Flags'}, '.uno:ExecuteSearch': {'SearchItem.Backward', 'SearchItem.Command', 'SearchItem.SearchString'}, '.uno:FillColor': {'FillColor'}, '.uno:FontHeight': {'FontHeight.Height'}, '.uno:FreezePanesColumn': {'Index'}, '.uno:FreezePanesRow': {'Index'}, '.uno:Group': {'RowOrCol'}, '.uno:InsertAnnotation': {'Text'}, '.uno:InsertBookmark': {'Bookmark'}, '.uno:InsertCell': {'Flags'}, '.uno:InsertGraphic': {'FileName'}, '.uno:InsertPageFooter': {'PageStyle', 'On'}, '.uno:InsertPageHeader': {'PageStyle', 'On'}, '.uno:InsertTable': {'Columns', 'Rows'}, '.uno:StyleApply': {'Style', 'FamilyName'}, '.uno:TrackChanges': {'TrackChanges'}, '.uno:Ungroup': {'RowOrCol'}, '.uno:XLineColor': {'XLineColor'}}

def run(p):
    op, key = p['op'], p['sessionId']
    if op == 'open':
        if key in docs or p['format'] not in ('docx','pptx','xlsx'):
            raise ValueError('Invalid Office document')
        source = root / (uuid.uuid4().hex + '.' + p['format'])
        load(source, p['bytes'])
        try:
            docs[key] = Document(source, p['format'], p['readOnly'], p.get('ephemeralSource',False))
        except Exception:
            source.unlink(missing_ok=True)
            raise
        return {}
    d = docs[key]
    if op == 'close':
        d.destroy()
        d.source.unlink(missing_ok=True)
        del docs[key]
        return {}
    if op == 'attach':
        view_id, view = d.attach()
        return dict(viewId=view_id, metadata=d.metadata(), events=view.drain())
    if op == 'detach':
        d.detach(p['viewId'])
        return {}
    view_id = p.get('viewId', next(iter(d.views), d.initial))
    if op == 'reload':
        source = root / (uuid.uuid4().hex + '.' + d.fmt)
        load(source, p['bytes'])
        candidate = None
        try:
            candidate = Document(source, d.fmt, d.read_only, d.ephemeral_source)
            view_ids = {}
            for old_id in d.views:
                d.numbers('setView',old_id)
                part = d.call('getPart',I)
                new_id, _ = candidate.attach()
                if candidate.fmt != 'docx':
                    candidate.numbers('setPart',min(part,candidate.call('getParts',I)-1))
                view_ids[old_id] = new_id
            metadata = candidate.metadata()
        except Exception:
            if candidate:
                candidate.destroy()
            source.unlink(missing_ok=True)
            raise
        d.destroy()
        d.source.unlink(missing_ok=True)
        docs[key] = candidate
        return dict(metadata=metadata, viewIds=view_ids)
    d.numbers('setView', view_id)
    v = d.views.get(view_id)
    result = {}
    if op == 'tile':
        result = d.tile(p)
    elif op in ('thumbnail','thumbnails') and d.fmt == 'pptx':
        width, height = (d.metadata()[key] for key in ('width','height'))
        parts = [p['part']] if op == 'thumbnail' else p['parts']
        if not 1 <= len(parts) <= 4 or any(type(part) is not int or not 0 <= part < d.call('getParts',I) for part in parts):
            raise ValueError('Invalid Office thumbnail batch')
        tiles = [d.tile(dict(part=part, x=0, y=0, span=max(width,height), pixels=96)) for part in parts]
        result = dict(mode=tiles[0]['mode'], binary=b''.join(tile['binary'] for tile in tiles))
    elif op == 'viewport':
        d.numbers('setClientZoom', 256,256,p['span'],p['span'])
        d.numbers('setClientVisibleArea', *p['rect'])
    elif op == 'mouse':
        args = p['args']
        if len(args) != 6 or any(type(arg) is not int for arg in args) or args[0] not in (0,1,2) or any(
            not 0 <= arg <= 300000000 for arg in args[1:3]
        ) or args[3] not in (1,2) or args[4] not in (0,1) or args[5] not in (0,4096):
            raise ValueError('Invalid Office pointer event')
        d.numbers('postMouseEvent', *args)
    elif op == 'part':
        d.numbers('setPart', int(p['part']))
        result = d.metadata()
    elif op == 'fonts':
        # Families the engine can actually render, straight from the family-list command.
        families = d.values('.uno:CharFontName').get('commandValues') or {}
        result = dict(fonts=sorted(str(name) for name in families)[:4000])
    elif op == 'locate':
        target = p['target']
        model = d.model()
        kind = target['kind']
        if kind in ('shape','cell') and '/' in target.get('id',''):
            parent, child = map(unquote,target['id'].split('/',1))
            target = dict(target, id=child)
            target['slide' if kind == 'shape' else 'sheet'] = parent
            if kind == 'cell':
                target['cell'] = child
        index = int(target.get('slide', target.get('sheet', target.get('index', target.get('id','0')))))
        if kind in ('slide','shape') and d.fmt == 'pptx':
            d.numbers('setPart', int(target.get('slide', index)))
            if kind == 'shape':
                shape_id = str(target.get('id', ''))
                shapes = model['slides'][int(target['slide'])]['shapes']
                shape = next((shape for shape in shapes if shape['shape'] == shape_id), None)
                if shape and shape['text']:
                    select_text(d,v,shape['text'])
        elif kind in ('sheet','cell','range') and d.fmt == 'xlsx':
            d.numbers('setPart',int(target.get('sheet',index)))
            if kind != 'sheet':
                cell = target.get('cell') or target.get('from')
                if not cell or not re.fullmatch(r'[A-Z]{1,3}[1-9][0-9]{0,6}',cell):
                    raise ValueError('Invalid Calc cell')
                d.dispatch(v,'.uno:GoToCell',typed(ToPoint=cell))
        elif d.fmt == 'docx' and kind in ('paragraph','table'):
            if kind == 'paragraph':
                candidates = [model['paragraphs'][index]['text']]
            else:
                candidates = [text for row in model['tables'][index] for text in row]
            target_text = next((text for text in candidates if text and sum(row['text'].count(text) for row in model['paragraphs']) == 1), None)
            select_text(d,v,target_text)
        else:
            raise ValueError('Office location unavailable')
        result = d.metadata()
        selected = v.selection()
        result['rects'] = selected['rects']
        v.events.append(('selection', selected))
    elif op == 'selection':
        current = v.selection()
        result = dict(text=current['text'], before=[], after=[], style=None, token=current['token'])
        context = p.get('context',2)
        if d.fmt == 'docx' and current['text'] and type(context) is int and 0 <= context <= 10:
            paragraphs = d.model()['paragraphs']
            candidates = [row for row in paragraphs if current['text'] in row['text']]
            if len(candidates) == 1:
                index = candidates[0]['paragraph']
                result.update(before=[row['text'] for row in paragraphs[max(0,index-context):index]],
                              after=[row['text'] for row in paragraphs[index+1:index+1+context]],
                              style=candidates[0]['style'])
    elif op in ('exportFile', 'snapshot'):
        result['binary'] = d.export_file()
    elif op == 'poll':
        pass
    elif op == 'outline':
        model = d.model()
        result = dict(kind=d.fmt, parts=d.metadata()['parts'])
        if d.fmt == 'docx':
            result['headings'] = [p for p in model['paragraphs'] if (p['style'] or '').lower().startswith('heading')]
    elif op == 'read':
        model = d.model()
        requested = p.get('range') or {}
        for key in ('paragraph','slide','sheet'):
            if key in requested:
                rows = model[{'paragraph':'paragraphs','slide':'slides','sheet':'sheets'}[key]]
                target = requested[key]
                result[key] = rows[target] if isinstance(target,int) else next(row for row in rows if row.get(key) == target)
                break
        else:
            result = model
    elif op == 'find':
        model = d.model()
        query = p.get('query')
        if not isinstance(query,str) or not query:
            raise ValueError('Office search requires a string')
        if d.fmt == 'docx':
            candidates = model['paragraphs']
        elif d.fmt == 'pptx':
            candidates = [dict(shape, slide=slide['slide']) for slide in model['slides'] for shape in slide['shapes']]
        else:
            candidates = [dict(cell=address, sheet=sheet['sheet'], text=cell.get('value') or '')
                          for sheet in model['sheets'] for address,cell in sheet['cells'].items()]
        result['matches'] = [item for item in candidates if query.casefold() in item['text'].casefold()]
    elif d.read_only:
        raise RuntimeError('Office document is read-only')
    elif op == 'graphic' and d.fmt == 'pptx':
        phase = p['phase']
        if phase not in (0,1):
            raise ValueError('Invalid graphic selection phase')
        d.numbers('setGraphicSelection',phase,int(p['x']),int(p['y']))
        result['changed'] = phase == 1
    elif op == 'apply':
        if not v or not 1 <= len(p['ops']) <= 30 or p.get('track') and d.fmt != 'docx':
            raise ValueError('Office apply requires an active view and untracked operations')
        undo_start = d.undo_count()
        initial_part = d.call('getPart',I)
        changes = []
        was_tracking = v.states.get('.uno:TrackChanges') == 'true'
        if p.get('track'):
            d.track(v,True)
        try:
            for operation in p['ops']:
                change, preview = apply_operation(d,v,operation)
                changes.append(change)
        except Exception:
            # Revert native edits if a later operation or its readback fails.
            # Refuse to loop on a stalled undo count.
            while (current := d.undo_count()) > undo_start:
                d.dispatch(v,'.uno:Undo')
                if d.undo_count() >= current:
                    raise RuntimeError('Office operation rollback failed')
            raise
        finally:
            if p.get('track'):
                d.track(v,was_tracking)
            if d.fmt != 'docx':
                d.numbers('setPart',initial_part)
        result = dict(changes=changes, preview=preview, changed=True)
    elif op == 'ime':
        d.call('postWindowExtTextInputEvent', None, (C.c_uint,I,S), 0,0,p['text'].encode())
        d.call('postWindowExtTextInputEvent', None, (C.c_uint,I,S), 0,2,b'')
        result['changed'] = True
    elif op == 'key':
        for kind in (0,1):
            d.numbers('postKeyEvent', kind, int(p['char']),int(p['code']))
        result['changed'] = bool(p.get('edit'))
    elif op == 'paste':
        mime = p.get('mime','text/plain;charset=utf-8')
        if mime not in ('text/plain;charset=utf-8','text/html','image/png','image/jpeg'):
            raise ValueError('Unsupported clipboard type')
        data = base64.b64decode(p['binary'], validate=True) if 'binary' in p else p['text'].encode()
        d.paste(mime, data)
        result['changed'] = True
    elif op == 'replaceSelection':
        current = v.selection()
        if not p.get('token') or p['token'] != current['token'] or current['kind'] != 'text':
            return dict(ok=False, reason='selection_changed', events=v.drain())
        changeset = dict(before=current['text'], after=p['text'])
        accept = bool(p.get('accept'))
        track = bool(p['track']) and not accept
        change_id = None
        if track and d.fmt != 'docx':
            raise ValueError('Tracked selection replacement is unavailable for this format')
        if d.fmt == 'docx' and (track or accept):
            was_tracking = v.states.get('.uno:TrackChanges') == 'true'
            before = d.redlines() if track else []
            d.track(v,track)
            try:
                if d.text() != current['text'] or v.selection()['token'] != current['token']:
                    return dict(ok=False,reason='selection_changed',events=v.drain())
                d.paste('text/plain;charset=utf-8',p['text'].encode())
            finally:
                d.track(v,was_tracking)
            if track:
                after = d.redlines()
                created = [item['index'] for item in after if item.get('index') is not None and item not in before]
                if created:
                    change_id = uuid.uuid4().hex
                    d.changes[change_id] = (created,after)
                v.events.append(('changes',after))
        else:
            d.paste('text/plain;charset=utf-8',p['text'].encode())
        v.selection_changed = True
        result = dict(ok=True, changeId=change_id, changeset=changeset, changed=True)
    elif op == 'change' and d.fmt == 'docx':
        changes = d.changes.get(p['id'])
        if not changes or d.redlines() != changes[1]:
            raise ValueError('Writer revisions changed before confirmation')
        command = 'AcceptTrackedChange' if p['accept'] else 'RejectTrackedChange'
        before_count = len(changes[1])
        for index in sorted(changes[0],reverse=True):
            d.dispatch(v,'.uno:'+command,{command:dict(type='unsigned long',value=index)})
        after = d.redlines()
        if len(after) >= before_count:
            raise ValueError('Writer revision verification failed')
        del d.changes[p['id']]
        v.events.append(('changes',after))
        result = dict(ok=True,changed=True)
    elif op == 'insertTable' and d.fmt == 'docx':
        from html import escape
        rows = p['rows']
        if not rows or len(rows) > 100 or not rows[0] or len(rows[0]) > 30 or any(
            len(row) != len(rows[0]) or any(type(value) is not str or len(value) > 4000 for value in row) for row in rows
        ):
            raise ValueError('Invalid Office table')
        before = len(d.model()['tables'])
        html = '<html><body><table>' + ''.join(
            '<tr>'+''.join('<td>'+escape(value)+'</td>' for value in row)+'</tr>' for row in rows
        ) + '</table></body></html>'
        d.paste('text/html',html.encode())
        after = d.model()['tables']
        if len(after) != before + 1 or rows not in after:
            raise ValueError('Office table insertion verification failed')
        result = dict(ok=True,changed=True)
    elif op == 'uno':
        name = p['command']
        allowed = {'AcceptAllTrackedChanges','AlignBlock','AlignBottom','AlignHorizontalCenter','AlignLeft','AlignRight','AlignTop','AlignVCenter','ArrowShapes.4-way-arrow','ArrowShapes.chevron','ArrowShapes.down-arrow','ArrowShapes.left-arrow','ArrowShapes.left-right-arrow','ArrowShapes.pentagon-right','ArrowShapes.right-arrow','ArrowShapes.up-arrow','ArrowShapes.up-down-arrow','AttributePageSize','AutoSum','BackColor','BackgroundColor','Backward','BasicShapes.can','BasicShapes.circle','BasicShapes.cross','BasicShapes.cube','BasicShapes.diamond','BasicShapes.ellipse','BasicShapes.frame','BasicShapes.hexagon','BasicShapes.isosceles-triangle','BasicShapes.octagon','BasicShapes.parallelogram','BasicShapes.pentagon','BasicShapes.rectangle','BasicShapes.right-triangle','BasicShapes.ring','BasicShapes.round-rectangle','BasicShapes.trapezoid','Bold','BringToFront','BrowseView','Calculate','CenterPara','CharBackColor','CharFontName','Color','Copy','Cut','DataFilterAutoFilter','DecrementIndent','DefaultBullet','DefaultFormatting','DefaultNumbering','DeleteCell','DeleteColumns','DeleteRows','ExecuteSearch','FillColor','FontColor','FontHeight','FormatGroup','FormatPaintbrush','FormatUngroup','Forward','FreezePanesColumn','FreezePanesRow','Group','Grow','IncrementIndent','InsertAnnotation','InsertBookmark','InsertCell','InsertColumnBreak','InsertColumnsAfter','InsertColumnsBefore','InsertEndnote','InsertFootnote','InsertGraphic','InsertObjectChart','InsertPage','InsertPageCountField','InsertPageFooter','InsertPageHeader','InsertPageNumberField','InsertPagebreak','InsertRowsAfter','InsertRowsBefore','InsertTable','Italic','JustifyPara','LeftPara','Line','LineArrowEnd','MergeCells','NumberFormatCurrency','NumberFormatDate','NumberFormatDecDecimals','NumberFormatDecimal','NumberFormatIncDecimals','NumberFormatPercent','NumberFormatScientific','NumberFormatStandard','NumberFormatThousands','NumberFormatTime','ParaspaceDecrease','ParaspaceIncrease','Paste','Redo','RejectAllTrackedChanges','ResetAttributes','RightPara','SelectAll','SendToBack','Shrink','SortAscending','SortDescending','SpacePara1','SpacePara15','SpacePara2','SplitCell','StarShapes.star5','Strikeout','StyleApply','SubScript','SuperScript','SymbolShapes.brace-pair','SymbolShapes.bracket-pair','SymbolShapes.cloud','SymbolShapes.heart','SymbolShapes.lightning','SymbolShapes.moon','SymbolShapes.smiley','SymbolShapes.sun','Text','ToggleMergeCells','TrackChanges','Underline','UnderlineDouble','Undo','Ungroup','WrapText','XLineColor'}
        if not name.startswith('.uno:') or name[5:] not in allowed:
            raise ValueError('Office command is unavailable')
        # LOK aborts the whole process on an unknown property name, so the shape of every
        # argument bag is checked here before it reaches postUnoCommand.
        properties = UNO_ARGS.get(name)
        if properties is not None and any(key not in properties for key in (p.get('args') or {})):
            return dict(events=v.drain(), ok=False, reason='invalid_input')
        if name in ('.uno:AcceptAllTrackedChanges','.uno:RejectAllTrackedChanges'):
            d.dispatch(v,name,p['args'])
            after = d.redlines()
            if after:
                raise ValueError('Writer revisions remain after command')
            d.changes.clear()
            v.events.append(('changes',after))
        elif name in ('.uno:InsertTable','.uno:InsertObjectChart'):
            if name == '.uno:InsertTable' and d.fmt != 'docx' or d.fmt not in ('docx','pptx'):
                raise ValueError('Office command unavailable for this format')
            field = 'tables' if name == '.uno:InsertTable' else 'charts'
            count = (lambda value:len(value)) if field == 'tables' else (lambda value:value)
            before = count(d.model()[field])
            d.dispatch(v,name,p['args'])
            after = count(d.model()[field])
            if after != before+1:
                raise ValueError('Office object insertion verification failed')
            result['success'] = True
        elif name == '.uno:TrackChanges':
            d.track(v,bool(p['args']['TrackChanges']['value']))
        else:
            d.call('postUnoCommand', None, (S,S,C.c_bool), name.encode(), json.dumps(p['args']).encode(), True)
        result['changed'] = name not in ('.uno:SelectAll', '.uno:TrackChanges')
    else:
        raise ValueError('Unsupported Office operation: ' + op)
    return dict(events=v.drain() if v else [], **result)

def send(record, binary=b''):
    header = json.dumps(dict(record, size=len(binary)), separators=(',', ':')).encode()
    sys.stdout.buffer.write(b'QKLOK ' + header + b'\n')
    sys.stdout.buffer.write(binary)
    sys.stdout.buffer.flush()

send(dict(id=0, result={}))
for line in sys.stdin.buffer:
    if len(line) > 100 * 1024**2:
        break
    request = json.loads(line)
    try:
        result = run(request)
        send(dict(id=request['id'], result=result), result.pop('binary', b''))
    except Exception as error:
        send(dict(id=request['id'], error=str(error)))
os._exit(0)
`;
