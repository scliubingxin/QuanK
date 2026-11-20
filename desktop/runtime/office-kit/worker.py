"""Private one-document LibreOfficeKit worker; no socket server or arbitrary UNO."""
import ctypes as C, sys, os, json, pathlib, base64, io, re, html, hashlib, unicodedata, time
from html.parser import HTMLParser
from PIL import Image
P=C.c_void_p
ABI=json.loads(pathlib.Path(__file__).with_name('ABI.json').read_text())['classes']
class Handle(C.Structure):_fields_=[('pClass',P)]
def method(obj,cls,name,ret,*args):
 vt=C.cast(obj,C.POINTER(Handle)).contents.pClass;idx=ABI[cls].index(name)+1
 if (idx+1)*C.sizeof(P)>C.c_size_t.from_address(vt).value:raise ValueError('Office engine ABI unavailable')
 ptr=P.from_address(vt+idx*C.sizeof(P)).value
 if not ptr:raise ValueError('Office engine method unavailable')
 return C.CFUNCTYPE(ret,P,*args)(ptr)
def reply(i,**data):print('WBKIT '+json.dumps({'id':i,**data},ensure_ascii=False),flush=True)
def num(v,lo,hi):
 if type(v) is not int or not lo<=v<=hi:raise ValueError('Invalid coordinate/limit')
 return v
base=pathlib.Path(sys.argv[1]).resolve();job=pathlib.Path(sys.argv[2]).resolve();fmt=sys.argv[3]
standby=fmt=='standby' # [p2-ux2] start the engine before a document is chosen
if not standby and fmt not in ['docx','xlsx','pptx']:raise ValueError('Format unavailable')
os.environ['SAL_USE_VCLPLUGIN']='svp';os.environ['SAL_LOG']='-WARN'
libfile=base/'../Frameworks/libmergedlo.dylib' if sys.platform=='darwin' else base/'libsofficeapp.so'
lib=C.CDLL(str(libfile.resolve()),mode=C.RTLD_GLOBAL);hook=lib.libreofficekit_hook_2;hook.argtypes=[C.c_char_p,C.c_char_p];hook.restype=P
kit=hook(str(base).encode(),(job/'profile').as_uri().encode())
if not kit:raise RuntimeError('Office engine initialization failed')
if standby:
 reply(0,ready=True)
 try:fmt=json.loads(sys.stdin.readline()).get('format')
 except Exception:os._exit(2)
 if fmt not in ['docx','xlsx','pptx']:os._exit(2)
def office(name,ret,*args):return method(kit,'LibreOfficeKitClass',name,ret,*args)
doc=office('documentLoad',P,C.c_char_p)(kit,(job/('document.'+fmt)).as_uri().encode())
if not doc:raise RuntimeError('Office engine could not open the document')
def call(name,ret,*types):return method(doc,'LibreOfficeKitDocumentClass',name,ret,*types)
call('initializeForRendering',None,C.c_char_p)(doc,b'{}')
events={};states={};command_result=None;ppt_text_active=False;dialogs=set()
@C.CFUNCTYPE(None,C.c_int,C.c_char_p,P)
def callback(kind,payload,data):
 global command_result
 if kind==16 and payload:command_result=payload[:4096].decode('utf8','replace')
 if kind in [1,2,5,6,7,8,34] and payload:events[str(kind)]=payload[:4096].decode('utf8','replace')
 # [excel] Calc: 13 size, 17 cell cursor, 19 formula bar, 39 context, 42 selection area; 36 tracks native dialogs to close.
 if kind in [13,17,19,39,42] and payload:events[str(kind)]=payload[:4096].decode('utf8','replace')
 if kind==36 and payload:
  try:
   win=json.loads(payload[:4096].decode('utf8','replace'))
   if win.get('action')=='created' and win.get('type') in ['dialog','child','dropdown','deck']:dialogs.add(int(win['id']))
   elif win.get('action')=='close':dialogs.discard(int(win.get('id',-1)))
  except Exception:pass
 # [lane:ribbon] append-only: LOK_CALLBACK_STATE_CHANGED (8) payload is '.uno:Name=value'.
 if kind==8 and payload:
  text=payload[:300].decode('utf8','replace');key,eq,val=text.partition('=')
  if eq and re.fullmatch(r'\.uno:[A-Za-z][A-Za-z0-9.\-]{0,63}',key) and (key in states or len(states)<400):states[key]=val
call('registerCallback',None,type(callback),P)(doc,callback,None)
def selection():
 used=P();ptr=call('getTextSelection',P,C.c_char_p,C.POINTER(P))(doc,b'text/plain;charset=utf-8',C.byref(used))
 try:return C.string_at(ptr).decode('utf8','replace')[:12001] if ptr else ''
 finally:
  free=office('freeError',None)
  if ptr:free(ptr)
  if used.value:free(used)
def table_context():
 if fmt!='docx':return None
 used=P();ptr=call('getTextSelection',P,C.c_char_p,C.POINTER(P))(doc,b'text/html',C.byref(used))
 try:source=C.string_at(ptr) if ptr else b''
 finally:
  if ptr:office('freeError',None)(ptr)
  if used.value:office('freeError',None)(used)
 if not source or len(source)>256000:return None
 class TableSelection(HTMLParser):
  def __init__(self):super().__init__();self.tables=0;self.depth=0;self.rows=[];self.bad=False;self.ignore=0
  def handle_starttag(self,tag,attrs):
   if tag in ['style','head']:self.ignore+=1
   if tag=='table':
    self.tables+=1;self.depth+=1
    if self.depth!=1:self.bad=True
   if tag=='tr' and self.depth:self.rows.append(0)
   if tag in ['td','th'] and self.depth:
    if not self.rows:self.bad=True;return
    self.rows[-1]+=1
    if any(k in ['colspan','rowspan'] and v!='1' for k,v in attrs):self.bad=True
  def handle_endtag(self,tag):
   if tag=='table':self.depth-=1
   if tag in ['style','head']:self.ignore=max(0,self.ignore-1)
  def handle_data(self,data):
   if not self.depth and not self.ignore and data.strip():self.bad=True
 parser=TableSelection()
 try:parser.feed(source.decode('utf8'));parser.close()
 except Exception:return None
 if parser.bad or parser.tables!=1 or parser.depth or not 1<=len(parser.rows)<=30 or not parser.rows or not 1<=max(parser.rows)<=16 or len(set(parser.rows))!=1 or sum(parser.rows)>200:return None
 return {'rows':len(parser.rows),'columns':parser.rows[0],'fingerprint':hashlib.sha256(source).hexdigest()}
def cells_context():
 if fmt!='xlsx':return None
 ref=events.get('34','');match=re.fullmatch(r'([A-Z]{1,2})([1-9][0-9]{0,3})(?::([A-Z]{1,2})([1-9][0-9]{0,3}))?',ref)
 if not match:return None
 def col(t):
  n=0
  for c in t:n=n*26+ord(c)-64
  return n
 left=col(match[1]);top=int(match[2]);right=col(match[3] or match[1]);bottom=int(match[4] or match[2]);rows=bottom-top+1;columns=right-left+1
 if min(rows,columns)<1 or right>128 or bottom>5000 or rows>30 or columns>16 or rows*columns>200:return None
 # Confirm the native active cell agrees with the rectangle's top-left. Unknown/drag-end cursors fail closed.
 ptr=call('getCommandValues',P,C.c_char_p)(doc,b'.uno:CellCursor')
 try:cursor=json.loads(C.string_at(ptr)) if ptr else {}
 except Exception:return None
 finally:
  if ptr:office('freeError',None)(ptr)
 try:coords=[int(x.strip()) for x in cursor['commandValues'].split(',')]
 except Exception:return None
 if len(coords)!=6 or coords[-2:]!=[left-1,top-1]:return None
 used=P();ptr=call('getTextSelection',P,C.c_char_p,C.POINTER(P))(doc,b'text/html',C.byref(used))
 try:source=C.string_at(ptr) if ptr else b''
 finally:
  if ptr:office('freeError',None)(ptr)
  if used.value:office('freeError',None)(used)
 if not source or len(source)>256000:return None
 class Shape(HTMLParser):
  def __init__(self):super().__init__();self.tables=0;self.depth=0;self.rows=[];self.bad=False
  def handle_starttag(self,tag,attrs):
   if tag=='table':
    self.tables+=1;self.depth+=1
    if self.depth!=1:self.bad=True
   if tag=='tr' and self.depth:self.rows.append(0)
   if tag in ['td','th'] and self.depth:
    if not self.rows:self.bad=True;return
    self.rows[-1]+=1
    if any(k in ['colspan','rowspan'] and v!='1' for k,v in attrs):self.bad=True
  def handle_endtag(self,tag):
   if tag=='table':self.depth-=1
 parser=Shape()
 try:parser.feed(source.decode('utf8'));parser.close()
 except Exception:return None
 if parser.bad or parser.depth or parser.tables!=1 or parser.rows!=[columns]*rows:return None
 part=call('getPart',C.c_int)(doc)
 if not 0<=part<=99:return None
 canonical=match[1]+match[2]+('' if rows==1 and columns==1 else ':'+(match[3] or match[1])+(match[4] or match[2]))
 return {'ref':canonical,'part':part,'rows':rows,'columns':columns,'fingerprint':hashlib.sha256(str(part).encode()+b'|'+canonical.encode()+b'|'+source).hexdigest()}
def dispatch_completed(command,args,allow_unchanged=False):
 global command_result
 command_result=None
 call('postUnoCommand',None,C.c_char_p,C.c_char_p,C.c_bool)(doc,command,json.dumps(args).encode() if args is not None else None,True)
 deadline=time.monotonic()+2
 while command_result is None and time.monotonic()<deadline:time.sleep(0.002)
 result=json.loads(command_result) if command_result else {}
 if result.get('commandName')!=command.decode() or (not allow_unchanged and result.get('success') is not True) or (allow_unchanged and type(result.get('success')) is not bool):raise ValueError('Native command did not complete')
 # EnterString may report false for unchanged data; only saved XLSX verification can establish success.
def update_cells(p):
 if set(p)!=set(['id','op','cells','values']) or fmt!='xlsx':raise ValueError('Invalid cells request')
 if not isinstance(p['cells'],dict) or any(type(p['cells'].get(k)) is not int for k in ['part','rows','columns']):raise ValueError('Invalid cells metadata')
 current=cells_context()
 if not current or current!=p['cells']:raise ValueError('Native cell selection changed')
 values=p['values']
 if not isinstance(values,list) or len(values)!=current['rows'] or any(not isinstance(row,list) or len(row)!=current['columns'] for row in values):raise ValueError('Cell matrix shape mismatch')
 if len(json.dumps({'values':values},ensure_ascii=False,separators=(',',':')).encode('utf-16-le'))//2>600:raise ValueError('Cell matrix review limit')
 for row in values:
  for value in row:
   literal=isinstance(value,dict)
   if literal:
    if set(value)!=set(['text']):raise ValueError('Invalid literal text fields')
    value=value['text']
   if not isinstance(value,str) or len(value.encode('utf-16-le'))//2>400 or any(ord(c)<32 or 127<=ord(c)<=159 for c in value):raise ValueError('Invalid cell constant')
   start=unicodedata.normalize('NFKC',value).lstrip()
   if not literal and (re.match(r'^[=+@]',start) or start.startswith('-') and not re.fullmatch(r'-[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?',start)):raise ValueError('Formula input forbidden')
 return write_cells(current,values)
def write_cells(current,values):
 match=re.match(r'([A-Z]+)([0-9]+)',current['ref']);left=0
 for c in match[1]:left=left*26+ord(c)-64
 top=int(match[2])
 def label(n):
  result=''
  while n:n,k=divmod(n-1,26);result=chr(65+k)+result
  return result
 def dispatch(command,args):return dispatch_completed(command,args,command==b'.uno:EnterString')
 for y,row in enumerate(values):
  for x,value in enumerate(row):
   call('resetSelection',None)(doc)
   dispatch(b'.uno:GoToCell',{'ToPoint':{'type':'string','value':label(left+x)+str(top+y)}})
   ptr=call('getCommandValues',P,C.c_char_p)(doc,b'.uno:CellCursor')
   try:cursor=json.loads(C.string_at(ptr)) if ptr else {};coordinates=[int(v.strip()) for v in cursor.get('commandValues','').split(',')]
   finally:
    if ptr:office('freeError',None)(ptr)
   if len(coordinates)!=6 or coordinates[-2:]!=[left+x-1,top+y-1] or events.get('34')!=label(left+x)+str(top+y) or call('getPart',C.c_int)(doc)!=current['part']:raise ValueError('Native cell cursor did not reach target '+str(coordinates)+' '+events.get('34','')+' expected '+label(left+x)+str(top+y))
   dispatch(b'.uno:EnterString',{'StringName':{'type':'string','value':(('='+value['formula']) if 'formula' in value else ("'"+value['text'] if value['text'] else "")) if isinstance(value,dict) else value}})
 dispatch(b'.uno:GoToCell',{'ToPoint':{'type':'string','value':current['ref']}})
 return {}
def set_formula(p):
 if fmt!='xlsx' or set(p)!=set(['id','op','cells','formula']):raise ValueError('Invalid formula request')
 current=cells_context()
 if not isinstance(p['cells'],dict) or any(type(p['cells'].get(k)) is not int for k in ['part','rows','columns']) or not current or current!=p['cells'] or current['rows']!=1 or current['columns']!=1:raise ValueError('Native single cell selection changed')
 formula=p['formula']
 if not isinstance(formula,str) or formula.startswith('=') or not 0<len(formula)<=400 or not formula.isascii() or re.search(r'[^A-Z0-9$.()+*/^%,:<>=-]',formula):raise ValueError('Formula characters forbidden')
 tokens=re.findall(r'(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:E[+-]?[0-9]+)?|\$?[A-Z]{1,2}\$?[1-9][0-9]{0,3}|[A-Z]+|[()+*/^%,:<>=-]',formula)
 if ''.join(tokens)!=formula or len(tokens)>200:raise ValueError('Formula token budget or syntax')
 functions={'SUM','AVERAGE','MIN','MAX','COUNT','IF','ROUND'};depth=0;references=0
 def ref(t):
  m=re.fullmatch(r'\$?([A-Z]{1,2})\$?([1-9][0-9]{0,3})',t)
  if not m:return None
  col=0
  for c in m[1]:col=col*26+ord(c)-64
  row=int(m[2])
  if col>128 or row>5000:raise ValueError('Formula reference out of bounds')
  return col,row
 for i,t in enumerate(tokens):
  coord=ref(t)
  if coord:references+=1
  elif re.fullmatch('[A-Z]+',t) and not (t in functions and i+1<len(tokens) and tokens[i+1]=='(') and t not in ['TRUE','FALSE']:raise ValueError('Formula function/name forbidden')
  if t=='(':
   depth+=1
   if depth>40:raise ValueError('Formula depth')
  elif t==')':
   depth-=1
   if depth<0:raise ValueError('Formula parentheses')
  elif t==':':
   a=ref(tokens[i-1]) if i else None;b=ref(tokens[i+1]) if i+1<len(tokens) else None
   if not a or not b or b[0]<a[0] or b[1]<a[1]:raise ValueError('Formula range syntax')
   references+=(b[0]-a[0]+1)*(b[1]-a[1]+1)-2
  if references>10000:raise ValueError('Formula reference budget')
 if depth:raise ValueError('Formula parentheses')
 return write_cells(current,[[{'formula':formula}]])
def format_cells(p):
 if fmt!='xlsx' or set(p)!=set(['id','op','cells','format']):raise ValueError('Invalid cells format request')
 if not isinstance(p['cells'],dict) or any(type(p['cells'].get(k)) is not int for k in ['part','rows','columns']):raise ValueError('Invalid cells metadata')
 current=cells_context()
 if not current or current!=p['cells']:raise ValueError('Native cell selection changed')
 data=p['format']
 if not isinstance(data,dict) or not data or set(data)-set(['fontSize','fontColor','backgroundColor','bold','italic']):raise ValueError('Invalid cell format properties')
 for key in ['bold','italic']:
  if key in data and type(data[key]) is not bool:raise ValueError('Invalid cell emphasis')
 for key in ['fontColor','backgroundColor']:
  if key in data and (not isinstance(data[key],str) or not re.fullmatch(r'#[0-9A-Fa-f]{6}',data[key])):raise ValueError('Invalid cell color')
 size=data.get('fontSize')
 if 'fontSize' in data and (isinstance(size,bool) or not isinstance(size,(float,int)) or not 6<=size<=96 or size*2!=int(size*2)):raise ValueError('Invalid cell font size')
 if size is not None:dispatch_completed(b'.uno:FontHeight',{'FontHeight.Height':{'type':'float','value':size}},True)
 for command,key in [('Bold','bold'),('Italic','italic')]:
  if key in data:dispatch_completed(('.uno:'+command).encode(),{command:{'type':'boolean','value':data[key]}},True)
 for command,key in [('Color','fontColor'),('BackgroundColor','backgroundColor')]:
  if key in data:dispatch_completed(('.uno:'+command).encode(),{command:{'type':'long','value':int(data[key][1:],16)}},True)
 return {}
def history():
 result={}
 for name in ['undo','redo']:
  ptr=call('getCommandValues',P,C.c_char_p)(doc,('.uno:'+name.title()+'Count').encode())
  try:
   raw=C.string_at(ptr) if ptr else b''
   result[name]=int(raw) if re.fullmatch(rb'[0-9]{1,7}',raw) and int(raw)<=1000000 else None
  finally:
   if ptr:office('freeError',None)(ptr)
 return result
def font_info():
 # [lane:render] families referenced by the document plus families the engine can see; the UI decides what was substituted.
 import zipfile
 used=set();pat=re.compile(r'(?:typeface|w:ascii|w:eastAsia|w:hAnsi|<name val)="([^"]{1,100})"')
 try:
  with zipfile.ZipFile(job/('document.'+fmt)) as z:
   for info in z.infolist()[:400]:
    if not info.filename.endswith('.xml') or info.file_size>4*1024*1024 or not re.search(r'slides/slide|theme|styles|document\.xml|slideMaster|slideLayout',info.filename):continue
    for m in pat.findall(z.read(info).decode('utf8','ignore')):
     if m[:1] not in '+#' and len(used)<300:used.add(m)
 except Exception:pass
 installed=[]
 try:
  ptr=call('getCommandValues',P,C.c_char_p)(doc,b'.uno:CharFontName')
  if ptr:installed=[n[:100] for n in list(json.loads(C.string_at(ptr).decode('utf8','replace')).get('commandValues',{}))[:3000]]
 except Exception:pass
 return {'used':sorted(used),'installed':installed}
def snapshot(p):
 global ppt_text_active
 if fmt in ['xlsx','docx'] and dialogs:close_dialogs() # [excel][docx] never leave a native dialog open behind the canvas
 if fmt=='pptx' and call('getSelectionType',C.c_int)(doc)==1:ppt_text_active=True
 # [lane:render] bitmap pixels (w,h) are independent of the document window (tw,th, twips): Retina requests pass 2x pixels for the same twips.
 w=num(p.get('width',900),1,4096);h=num(p.get('height',700),1,2560);xy=300000000 if fmt=='xlsx' else 2000000;x=num(p.get('x',0),0,xy);y=num(p.get('y',0),0,xy) # [excel] Calc grids extend far beyond a page
 if w*h>4096*2560:raise ValueError('Invalid coordinate/limit')
 if 'tileWidth' in p or 'tileHeight' in p:tw=num(p.get('tileWidth'),1,4000000);th=num(p.get('tileHeight'),1,4000000);scale=max(1,round(tw/w))
 else:scale=num(p.get('scale',15),8,30);tw=w*scale;th=h*scale
 dw=C.c_long();dh=C.c_long();call('getDocumentSize',None,C.POINTER(C.c_long),C.POINTER(C.c_long))(doc,C.byref(dw),C.byref(dh));parts=call('getParts',C.c_int)(doc)
 if not 1<=parts<=1000:raise ValueError('文档引擎没有读到任何页面，文件可能已损坏' if parts<1 else '文档超过 1000 页，暂不支持在编辑器中打开')
 buf=(C.c_ubyte*(w*h*4))();call('setClientZoom',None,*([C.c_int]*4))(doc,w,h,tw,th);call('setClientVisibleArea',None,*([C.c_int]*4))(doc,x,y,tw,th);call('paintTile',None,P,*([C.c_int]*6))(doc,buf,w,h,x,y,tw,th)
 mode=call('getTileMode',C.c_int)(doc);stream=io.BytesIO();Image.frombytes('RGBA',(w,h),bytes(buf),'raw','RGBA' if mode==0 else 'BGRA').save(stream,format='PNG',compress_level=3);names=[]
 for part in range(parts):
  ptr=call('getPartName',P,C.c_int)(doc,part)
  try:names.append(C.string_at(ptr).decode('utf8','replace')[:100] if ptr else str(part+1))
  finally:
   if ptr:office('freeError',None)(ptr)
 return {'png':base64.b64encode(stream.getvalue()).decode(),'width':w,'height':h,'x':x,'y':y,'scale':scale,'tileWidth':tw,'tileHeight':th,'documentWidth':dw.value,'documentHeight':dh.value,'parts':names,'part':call('getPart',C.c_int)(doc),'selection':selection(),'selectionType':call('getSelectionType',C.c_int)(doc),'events':dict(events),'states':dict(states),'history':history(),'table':table_context(),'cells':cells_context(),**({'fonts':font_info()} if p.get('fonts') is True else {}),**({'sheet':sheet_info()} if fmt=='xlsx' else {}),**({'doc':doc_info()} if fmt=='docx' else {})}
# [lane:pages] ooxml-begin: pure OOXML helpers (notes, animations, masters); no LibreOfficeKit dependency.
def _ox_read(z,name):return z.read(name).decode('utf8')
def _ox_rels(z,name):
 folder,base=name.rsplit('/',1) if '/' in name else ('',name);path=(folder+'/' if folder else '')+'_rels/'+base+'.rels'
 if path not in z.namelist():return []
 rows=[]
 for m in re.finditer(r'<Relationship\b([^>]*?)/?>',_ox_read(z,path)):
  a=dict(re.findall(r'(\w+)="([^"]*)"',m.group(1)))
  if 'Id' in a and 'Target' in a and 'Type' in a:rows.append(a)
 return rows
def _ox_join(folder,target):
 if target.startswith('/'):return target[1:]
 out=[x for x in folder.split('/') if x]
 for seg in target.split('/'):
  if seg=='..':
   if out:out.pop()
  elif seg and seg!='.':out.append(seg)
 return '/'.join(out)
def ox_slide_paths(z):
 xml=_ox_read(z,'ppt/presentation.xml');ids=re.findall(r'<p:sldId\b[^>]*?\br:id="([^"]+)"',xml)
 rel={r['Id']:_ox_join('ppt',r['Target']) for r in _ox_rels(z,'ppt/presentation.xml')}
 return [rel[i] for i in ids if i in rel]
def ox_notes_path(z,slide):
 for r in _ox_rels(z,slide):
  if r['Type'].endswith('/notesSlide'):return _ox_join(slide.rsplit('/',1)[0],r['Target'])
 return None
_BODY=re.compile(r'<p:sp\b(?:(?!</p:sp>).)*?<p:ph\b[^>]*\btype="body"(?:(?!</p:sp>).)*?</p:sp>',re.S)
def ox_notes_text(xml):
 m=_BODY.search(xml)
 if not m:return ''
 tx=re.search(r'<p:txBody>(.*?)</p:txBody>',m.group(0),re.S)
 if not tx:return ''
 paras=[]
 for para in re.findall(r'<a:p\b[^>]*?(?:/>|>.*?</a:p>)',tx.group(1),re.S):
  parts=[]
  for tok in re.finditer(r'<a:t(?:\s[^>]*)?>(.*?)</a:t>|<a:t\s*/>|<a:br\b[^>]*/?>',para,re.S):
   parts.append('\n' if tok.group(0).startswith('<a:br') else html.unescape(tok.group(1) or ''))
  paras.append(''.join(parts))
 return '\n'.join(paras)
def ox_notes_all(data):
 import zipfile
 with zipfile.ZipFile(io.BytesIO(data) if isinstance(data,(bytes,bytearray)) else data) as z:
  out=[]
  for slide in ox_slide_paths(z):
   n=ox_notes_path(z,slide);out.append(ox_notes_text(_ox_read(z,n)) if n and n in z.namelist() else '')
  return out
def _ox_body(text):
 paras=''.join('<a:p><a:r><a:rPr lang="zh-CN" dirty="0"/><a:t>'+html.escape(line,quote=False)+'</a:t></a:r></a:p>' for line in text.split('\n')) if text else '<a:p><a:endParaRPr lang="zh-CN"/></a:p>'
 return paras
def ox_set_notes_xml(xml,text):
 m=_BODY.search(xml)
 if not m:raise ValueError('Notes body placeholder missing')
 block=m.group(0);tx=re.search(r'<p:txBody>(.*?)</p:txBody>',block,re.S)
 head=''
 if tx:
  for tag in ('bodyPr','lstStyle'):
   h=re.search(r'<a:'+tag+r'\b[^>]*?(?:/>|>.*?</a:'+tag+'>)',tx.group(1),re.S);head+=h.group(0) if h else ('<a:'+tag+'/>')
 else:head='<a:bodyPr/><a:lstStyle/>'
 new='<p:txBody>'+head+_ox_body(text)+'</p:txBody>'
 block=block[:tx.start()]+new+block[tx.end():] if tx else block.replace('</p:sp>',new+'</p:sp>')
 return xml[:m.start()]+block+xml[m.end():]
_NOTES_NEW='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>'
def ox_write_notes(data,index,text):
 """Return new pptx bytes with slide `index` notes replaced; every other part is copied byte for byte."""
 import zipfile
 if not isinstance(text,str) or len(text)>8000 or '\x00' in text:raise ValueError('Notes text limit')
 text=text.replace('\r\n','\n').replace('\r','\n')
 src=zipfile.ZipFile(io.BytesIO(data));slides=ox_slide_paths(src)
 if type(index) is not int or not 0<=index<len(slides):raise ValueError('Slide out of range')
 slide=slides[index];notes=ox_notes_path(src,slide);changed={};added={}
 if notes and notes in src.namelist():changed[notes]=ox_set_notes_xml(_ox_read(src,notes),text).encode('utf8')
 else:
  master=[r for r in _ox_rels(src,'ppt/presentation.xml') if r['Type'].endswith('/notesMaster')]
  if not master:raise ValueError('Presentation has no notes master')
  n=1
  while 'ppt/notesSlides/notesSlide%d.xml'%n in src.namelist():n+=1
  notes='ppt/notesSlides/notesSlide%d.xml'%n;added[notes]=ox_set_notes_xml(_NOTES_NEW,text).encode('utf8')
  rp='ppt/notesSlides/_rels/notesSlide%d.xml.rels'%n;mt='../'+_ox_join('ppt',master[0]['Target'])[len('ppt/'):]
  added[rp]=('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="'+mt+'"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/'+slide.rsplit('/',1)[1]+'"/></Relationships>').encode()
  srp=slide.rsplit('/',1)[0]+'/_rels/'+slide.rsplit('/',1)[1]+'.rels'
  rel='<Relationship Id="rIdWbNotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide%d.xml"/>'%n
  if srp in src.namelist():changed[srp]=_ox_read(src,srp).replace('</Relationships>',rel+'</Relationships>').encode()
  else:added[srp]=('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+rel+'</Relationships>').encode()
  ct=_ox_read(src,'[Content_Types].xml')
  changed['[Content_Types].xml']=ct.replace('</Types>','<Override PartName="/'+notes+'" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/></Types>').encode()
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w') as dst:
  for item in src.infolist():
   dst.writestr(item,changed.get(item.filename,src.read(item.filename)),compress_type=item.compress_type)
  for name,blob in added.items():dst.writestr(name,blob,compress_type=zipfile.ZIP_DEFLATED)
 return out.getvalue()
def ox_animations(data,index):
 """List top-level timing effects of one slide from p:timing (read-only)."""
 import zipfile
 with zipfile.ZipFile(io.BytesIO(data)) as z:
  slides=ox_slide_paths(z)
  if type(index) is not int or not 0<=index<len(slides):raise ValueError('Slide out of range')
  xml=_ox_read(z,slides[index])
 t=re.search(r'<p:timing\b.*?</p:timing>',xml,re.S)
 if not t:return []
 names={m.group(1):html.unescape(m.group(2)) for m in re.finditer(r'<p:cNvPr\b[^>]*?\bid="(\d+)"[^>]*?\bname="([^"]*)"',xml)}
 kinds={'entr':'进入','exit':'退出','emph':'强调','path':'路径'};rows=[]
 for m in re.finditer(r'<p:cTn\b[^>]*?\bpresetClass="(entr|exit|emph|path)"[^>]*?\bpresetID="(\d+)"[^>]*?>(.*?)</p:cTn>',t.group(0),re.S):
  sp=re.search(r'<p:spTgt\b[^>]*?\bspid="(\d+)"',m.group(3));rows.append({'kind':kinds[m.group(1)],'presetId':int(m.group(2)),'target':names.get(sp.group(1),'对象 '+sp.group(1)) if sp else ''})
 return rows[:200]
def ox_masters(data):
 """Master/layout hierarchy: [{name, layouts:[names]}]."""
 import zipfile
 with zipfile.ZipFile(io.BytesIO(data)) as z:
  xml=_ox_read(z,'ppt/presentation.xml');rel={r['Id']:_ox_join('ppt',r['Target']) for r in _ox_rels(z,'ppt/presentation.xml')}
  out=[]
  for rid in re.findall(r'<p:sldMasterId\b[^>]*?\br:id="([^"]+)"',xml):
   mp=rel.get(rid)
   if not mp or mp not in z.namelist():continue
   rows=_ox_rels(z,mp);theme=next((r for r in rows if r['Type'].endswith('/theme')),None);name=''
   if theme:
    tp=_ox_join(mp.rsplit('/',1)[0],theme['Target']);m=re.search(r'<a:theme\b[^>]*?\bname="([^"]*)"',_ox_read(z,tp)) if tp in z.namelist() else None;name=html.unescape(m.group(1)) if m else ''
   mx=_ox_read(z,mp);lids=re.findall(r'<p:sldLayoutId\b[^>]*?\br:id="([^"]+)"',mx);lrel={r['Id']:r['Target'] for r in rows};layouts=[]
   for lid in lids:
    lp=_ox_join(mp.rsplit('/',1)[0],lrel.get(lid,''))
    if lp in z.namelist():
     m=re.search(r'<p:cSld\b[^>]*?\bname="([^"]*)"',_ox_read(z,lp));layouts.append(html.unescape(m.group(1)) if m else '版式')
   out.append({'name':name or '母版','layouts':layouts[:100]})
  return out[:20]
# [lane:pages] ooxml-end

# [lane:pages] lok-begin: page-level operations (append-only; whitelist, no arbitrary UNO).
SLIDE_COMMANDS={'insert':b'.uno:InsertPage','duplicate':b'.uno:DuplicatePage','delete':b'.uno:DeletePage'}
def thumbnail(p):
 if fmt!='pptx' or set(p)-set(['id','op','part','width']):raise ValueError('Invalid thumbnail request')
 parts=call('getParts',C.c_int)(doc);part=num(p['part'],0,999);w=num(p.get('width',240),48,1920)
 if part>=parts:raise ValueError('Slide out of range')
 dw=C.c_long();dh=C.c_long();call('getDocumentSize',None,C.POINTER(C.c_long),C.POINTER(C.c_long))(doc,C.byref(dw),C.byref(dh))
 if dw.value<=0 or dh.value<=0:raise ValueError('Document size unavailable')
 h=max(24,min(1200,round(w*dh.value/dw.value)));buf=(C.c_ubyte*(w*h*4))()
 call('paintPartTile',None,P,*([C.c_int]*8))(doc,buf,part,0,w,h,0,0,dw.value,dh.value)
 mode=call('getTileMode',C.c_int)(doc);stream=io.BytesIO();Image.frombytes('RGBA',(w,h),bytes(buf),'raw','RGBA' if mode==0 else 'BGRA').save(stream,format='PNG',optimize=True)
 return {'png':base64.b64encode(stream.getvalue()).decode(),'width':w,'height':h,'part':part,'count':parts}
def slide_action(p):
 if fmt!='pptx' or set(p)-set(['id','op','action','part','to']):raise ValueError('Invalid slide action')
 action=p.get('action');parts=call('getParts',C.c_int)(doc)
 if action not in ['insert','duplicate','delete','move']:raise ValueError('Slide action not allowed')
 part=num(p['part'],0,999)
 if part>=parts:raise ValueError('Slide out of range')
 if action in ['insert','duplicate'] and parts>=1000:raise ValueError('最多支持 1000 页')
 if action=='delete' and parts<=1:raise ValueError('Cannot delete the only slide')
 call('setPart',None,C.c_int)(doc,part)
 if action=='move':
  to=num(p['to'],0,999)
  if to>=parts or to==part:raise ValueError('Invalid move target')
  call('selectPart',None,C.c_int,C.c_int)(doc,part,1);call('moveSelectedParts',None,C.c_int,C.c_bool)(doc,to if to>part else to-1,False) # native position means "insert after this original index"; -1 is the front
 else:dispatch_completed(SLIDE_COMMANDS[action],None,True)
 after=call('getParts',C.c_int)(doc);want={'insert':parts+1,'duplicate':parts+1,'delete':parts-1,'move':parts}[action]
 if after!=want:raise ValueError('Native slide action did not complete')
 return {'count':after,'part':call('getPart',C.c_int)(doc)}
def reload_document(path):
 global doc,events
 new=office('documentLoad',P,C.c_char_p)(kit,path.as_uri().encode())
 if not new:raise ValueError('Reload failed')
 current=call('getPart',C.c_int)(doc);old=doc;doc=new;events={}
 call('initializeForRendering',None,C.c_char_p)(doc,b'{}');call('registerCallback',None,type(callback),P)(doc,callback,None)
 count=call('getParts',C.c_int)(doc);call('setPart',None,C.c_int)(doc,min(current,count-1))
 try:method(old,'LibreOfficeKitDocumentClass','destroy',None)(old)
 except Exception:pass
def copy_out(name):
 target=job/name
 if not call('saveAs',C.c_int,C.c_char_p,C.c_char_p,C.c_char_p)(doc,target.as_uri().encode(),b'pptx',None):raise ValueError('Office export failed')
 data=target.read_bytes()
 if len(data)>16*1024**2:raise ValueError('Office output too large')
 return target,data
def notes_get(p):
 if fmt!='pptx' or set(p)-set(['id','op']):raise ValueError('Invalid notes request')
 return {'notes':ox_notes_all(copy_out('notes-read.pptx')[1])}
notes_generation=0
def notes_set(p):
 global notes_generation
 if fmt!='pptx' or set(p)-set(['id','op','part','text']):raise ValueError('Invalid notes write')
 part=num(p['part'],0,999);target,data=copy_out('notes-write.pptx');patched=ox_write_notes(data,part,p.get('text'))
 notes_generation+=1;staged=job/('notes-load-%d.pptx'%notes_generation);staged.write_bytes(patched);reload_document(staged)
 return {'part':part}
def deck_info(p):
 if fmt!='pptx' or set(p)-set(['id','op','part']):raise ValueError('Invalid deck info request')
 data=copy_out('notes-read.pptx')[1];part=num(p['part'],0,999)
 return {'animations':ox_animations(data,part),'masters':ox_masters(data)}
def view_mode(p):
 if fmt!='pptx' or set(p)-set(['id','op','mode']) or p.get('mode') not in ['master','normal']:raise ValueError('Invalid view mode')
 dispatch_completed(b'.uno:SlideMasterPage' if p['mode']=='master' else b'.uno:NormalMultiPaneGUI',None,True)
 return {'mode':p['mode'],'count':call('getParts',C.c_int)(doc),'part':call('getPart',C.c_int)(doc)}
# [lane:pages] lok-end
# [excel] begin: Calc helpers (sheet geometry, keys, cell input, borders, sheet tabs, dialog guard).
SHEET_KEYS={'ArrowDown':1024,'ArrowUp':1025,'ArrowLeft':1026,'ArrowRight':1027,'Home':1028,'End':1029,'PageUp':1030,'PageDown':1031,'Enter':1280,'Escape':1281,'Tab':1282,'Backspace':1283,'Delete':1286,'F2':769}
FORMULA_DENY=re.compile(r'\b(?:WEBSERVICE|FILTERXML|INDIRECT|DDE|INFO|CALL|REGISTER(?:\.ID)?|EXEC|SHELL|RTD|HYPERLINK|IMPORTXML|IMPORTDATA|IMPORTHTML|IMPORTRANGE|IMAGE)\s*\(',re.I)
FORMULA_EXTERNAL=re.compile(r"(?:file:|https?:|ftp:|://|\[|'\s*#)",re.I)
SHEET_MAX_COL=16384;SHEET_MAX_ROW=1048576
def formula_ok(text):
 if not isinstance(text,str):return False
 if not re.match(r'\s*(?:[=+@]|-\s*[A-Za-z(])',text):return True
 return len(text)<=8192 and not FORMULA_DENY.search(text) and not FORMULA_EXTERNAL.search(text)
def lok_values(cmd):
 ptr=call('getCommandValues',P,C.c_char_p)(doc,cmd)
 try:return C.string_at(ptr)[:600000].decode('utf8','replace') if ptr else ''
 finally:
  if ptr:office('freeError',None)(ptr)
ACCEPT_DIALOG=set(['.uno:DataFilterAutoFilter']) # [excel] commands whose native confirmation is answered with the default button
def accept_dialogs():
 n=0
 for wid in list(dialogs):
  try:
   k=call('postWindowKeyEvent',None,C.c_uint,C.c_int,C.c_int,C.c_int);k(doc,wid,0,13,1280);k(doc,wid,1,13,1280);n+=1
  except Exception:pass
 deadline=time.monotonic()+1
 while dialogs and time.monotonic()<deadline:time.sleep(0.01)
 return n
def close_dialogs():
 closed=0
 for wid in list(dialogs):
  try:call('postWindow',None,C.c_uint,C.c_int,C.c_char_p)(doc,wid,0,None)
  except Exception:pass
  dialogs.discard(wid);closed+=1
 return closed
def sheet_info():
 if fmt!='xlsx':return None
 geo=None
 try:
  g=json.loads(lok_values(b'.uno:SheetGeometryData?columns=true&rows=true&sizes=true&hidden=true&filtered=true&groups=false') or '{}')
  geo={axis:{k:str((g.get(axis) or {}).get(k,''))[:200000] for k in ['sizes','hidden','filtered']} for axis in ['columns','rows']}
  geo['maxColumn']=int(g.get('maxtiledcolumn',SHEET_MAX_COL-1));geo['maxRow']=int(g.get('maxtiledrow',SHEET_MAX_ROW-1))
 except Exception:geo=None
 tabs=[]
 for part in range(call('getParts',C.c_int)(doc)):
  info={}
  try:
   ptr=call('getPartInfo',P,C.c_int)(doc,part)
   try:info=json.loads(C.string_at(ptr).decode('utf8','replace')) if ptr else {}
   finally:
    if ptr:office('freeError',None)(ptr)
  except Exception:info={}
  tabs.append({'visible':str(info.get('visible',1))!='0','protected':str(info.get('protected',0))=='1','lastColumn':info.get('lastcolumn') if type(info.get('lastcolumn')) is int else None,'lastRow':info.get('lastrow') if type(info.get('lastrow')) is int else None})
 context=events.get('39','')
 return {'geometry':geo,'cursor':events.get('17',''),'address':events.get('34',''),'formula':events.get('19',''),'area':events.get('42',''),'editing':context.endswith('EditCell'),'tabs':tabs,'dialogs':len(dialogs)}
def doc_info():
 # [docx] page rectangles (twips) for the page indicator; LOK only pushes .uno:StatePageNumber after a change.
 try:
  ptr=call('getPartPageRectangles',P)(doc)
  try:rects=C.string_at(ptr)[:20000].decode('utf8','replace') if ptr else ''
  finally:
   if ptr:office('freeError',None)(ptr)
 except Exception:rects=''
 return {'pageRects':rects}
def change_marker():
 h=history() # undo/redo counts move on every committed edit; sheet switches and scrolling leave them alone
 return (h.get('undo'),h.get('redo'),call('getParts',C.c_int)(doc))
def post_key(char,code):
 k=call('postKeyEvent',None,C.c_int,C.c_int,C.c_int);k(doc,0,char,code);k(doc,1,char,code)
def sheet_key(p):
 if fmt not in ['xlsx','docx'] or set(p)-set(['id','op','key','shift','control','alt']) or p.get('key') not in SHEET_KEYS or any(type(p.get(k,False)) is not bool for k in ['shift','control','alt']):raise ValueError('Invalid sheet key')
 key=p['key'];editing=events.get('39','').endswith('EditCell')
 commits=key in ['Enter','Tab','ArrowDown','ArrowUp','ArrowLeft','ArrowRight','PageUp','PageDown']
 if fmt=='xlsx' and editing and commits and not formula_ok(events.get('19','')):
  post_key(0,SHEET_KEYS['Escape']);raise ValueError('公式包含不允许的函数或外部引用，已取消输入')
 before=change_marker()
 code=SHEET_KEYS[key]+(0x1000 if p.get('shift') else 0)+(0x2000 if p.get('control') else 0)+(0x4000 if p.get('alt') else 0)
 post_key(0,code)
 if close_dialogs():raise ValueError('该操作需要确认对话框，已取消')
 return {'changed':change_marker()!=before}
def sheet_text(p):
 text=p.get('text')
 if fmt not in ['xlsx','docx'] or set(p)-set(['id','op','text']) or not isinstance(text,str) or not 0<len(text)<=200 or any(ord(c)<32 or ord(c)>0xFFFF or 0xD800<=ord(c)<=0xDFFF for c in text):raise ValueError('Invalid sheet text')
 before=change_marker()
 for c in text:post_key(ord(c),0)
 return {'changed':change_marker()!=before}
def cell_input(p):
 text=p.get('text');move=p.get('move','none')
 if fmt!='xlsx' or set(p)-set(['id','op','text','move']) or not isinstance(text,str) or len(text)>8192 or '\x00' in text or move not in ['none','down','right','up','left']:raise ValueError('Invalid cell input')
 if not formula_ok(text):raise ValueError('公式包含不允许的函数或外部引用')
 if events.get('39','').endswith('EditCell'):post_key(0,SHEET_KEYS['Escape'])
 dispatch_completed(b'.uno:EnterString',{'StringName':{'type':'string','value':text}},True)
 if move!='none':post_key(0,SHEET_KEYS[{'down':'ArrowDown','right':'ArrowRight','up':'ArrowUp','left':'ArrowLeft'}[move]])
 return {'changed':True}
def sheet_goto(p):
 ref=p.get('ref')
 if fmt!='xlsx' or set(p)-set(['id','op','ref']) or not isinstance(ref,str) or not re.fullmatch(r'[A-Z]{1,3}[1-9][0-9]{0,6}(?::[A-Z]{1,3}[1-9][0-9]{0,6})?',ref):raise ValueError('Invalid cell reference')
 if events.get('39','').endswith('EditCell'):
  if not formula_ok(events.get('19','')):post_key(0,SHEET_KEYS['Escape'])
  else:post_key(0,SHEET_KEYS['Enter'])
 call('postUnoCommand',None,C.c_char_p,C.c_char_p,C.c_bool)(doc,b'.uno:GoToCell',json.dumps({'ToPoint':{'type':'string','value':ref}}).encode(),False);return {}
def border_line(color,width,style):
 typed=lambda t,v:{'type':t,'value':v}
 outer=0 if width==0 else width;inner=0;dist=0
 if style==3 and width:outer=width;inner=width;dist=width
 return typed('com.sun.star.table.BorderLine2',{'Color':typed('com.sun.star.util.Color',color),'InnerLineWidth':typed('short',inner),'OuterLineWidth':typed('short',outer),'LineDistance':typed('short',dist),'LineStyle':typed('short',style if width else 0),'LineWidth':typed('unsigned long',0)})
def sheet_border(p):
 kinds={'all':(1,1,1,1,1,1,0x3F),'outer':(1,1,1,1,0,0,0x0F),'inner':(0,0,0,0,1,1,0x30),'none':(0,0,0,0,0,0,0x3F),'top':(0,0,0,1,0,0,0x01),'bottom':(0,0,1,0,0,0,0x02),'left':(1,0,0,0,0,0,0x04),'right':(0,1,0,0,0,0,0x08),'horizontal':(0,0,0,0,1,0,0x10),'vertical':(0,0,0,0,0,1,0x20),'thick-outer':(2,2,2,2,0,0,0x0F)}
 styles={'solid':0,'dotted':1,'dashed':2,'double':3}
 kind=p.get('kind');color=p.get('color','#000000');style=p.get('style','solid')
 if fmt!='xlsx' or set(p)-set(['id','op','kind','color','style']) or kind not in kinds or not isinstance(color,str) or not re.fullmatch(r'#[0-9A-Fa-f]{6}',color) or style not in styles:raise ValueError('Invalid border request')
 c=int(color[1:],16);s=styles[style];l,r,b,t,h,v,valid=kinds[kind]
 w=lambda on:0 if not on else (53 if on==2 else (18 if s==3 else 26))
 typed=lambda ty,val:{'type':ty,'value':val}
 outer=[border_line(c,w(x),s) for x in (l,r,b,t)]+[typed('long',0)]*5
 inner=[border_line(c,w(h),s),border_line(c,w(v),s),typed('short',0),typed('short',valid),typed('long',0)]
 dispatch_completed(b'.uno:SetBorderStyle',{'OuterBorder':typed('[]any',outer),'InnerBorder':typed('[]any',inner)},True)
 return {}
def sheet_size(p):
 axis=p.get('axis');index=p.get('index');size=p.get('size')
 if fmt!='xlsx' or set(p)-set(['id','op','axis','index','size']) or axis not in ['column','row'] or type(index) is not int or type(size) is not int or not 0<=index<(SHEET_MAX_COL if axis=='column' else SHEET_MAX_ROW) or not 30<=size<=30000:raise ValueError('Invalid sheet size')
 hmm=max(1,min(65535,round(size*2540/1440)))
 if axis=='column':dispatch_completed(b'.uno:ColumnWidth',{'ColumnWidth':{'type':'unsigned short','value':hmm},'Column':{'type':'long','value':index+1}},True)
 else:dispatch_completed(b'.uno:RowHeight',{'RowHeight':{'type':'unsigned short','value':hmm},'Row':{'type':'long','value':index+1}},True)
 return {}
def sheet_name_ok(name):
 return isinstance(name,str) and 0<len(name)<=31 and not re.search(r'[\[\]*?:/\\\x00-\x1f]',name) and not name.startswith("'") and not name.endswith("'")
def part_names():
 out=[]
 for part in range(call('getParts',C.c_int)(doc)):
  ptr=call('getPartName',P,C.c_int)(doc,part)
  try:out.append(C.string_at(ptr).decode('utf8','replace') if ptr else '')
  finally:
   if ptr:office('freeError',None)(ptr)
 return out
def sheet_tab(p):
 action=p.get('action');parts=call('getParts',C.c_int)(doc);index=p.get('index')
 if fmt!='xlsx' or set(p)-set(['id','op','action','index','name','color','to']) or action not in ['insert','rename','delete','move','copy','color'] or type(index) is not int or not 0<=index<=parts:raise ValueError('Invalid sheet tab request')
 typed=lambda t,v:{'type':t,'value':v}
 if action=='insert':
  if not sheet_name_ok(p.get('name')) or p['name'] in part_names() or parts>=100:raise ValueError('工作表名称无效或重复')
  dispatch_completed(b'.uno:Insert',{'Name':typed('string',p['name']),'Index':typed('long',index+1)},True)
 else:
  if index>=parts:raise ValueError('工作表不存在')
  call('setPart',None,C.c_int)(doc,index)
  if action=='rename':
   if not sheet_name_ok(p.get('name')) or p['name'] in [n for i,n in enumerate(part_names()) if i!=index]:raise ValueError('工作表名称无效或重复')
   dispatch_completed(b'.uno:RenameTable',{'Name':typed('string',p['name'])},True)
  elif action=='delete':
   if parts<=1:raise ValueError('至少保留一张工作表')
   dispatch_completed(b'.uno:Remove',{'Index':typed('long',index+1)},True)
  elif action in ['move','copy']:
   to=p.get('to')
   if type(to) is not int or not 0<=to<=parts:raise ValueError('目标位置无效')
   if action=='copy' and parts>=100:raise ValueError('工作表数量已达上限')
   args={'DocName':typed('string',''),'Index':typed('unsigned short',to),'Copy':typed('boolean',action=='copy'),'UseCurrentDocument':typed('boolean',True)}
   before=part_names()
   dispatch_completed(b'.uno:Move',args,True)
   after=part_names()
   if len(after)!=len(before)+(1 if action=='copy' else 0) or any(not n for n in after):raise ValueError('工作表移动/复制未完成')
  elif action=='color':
   color=p.get('color')
   if not isinstance(color,str) or not re.fullmatch(r'#[0-9A-Fa-f]{6}|none',color):raise ValueError('标签颜色无效')
   dispatch_completed(b'.uno:SetTabBgColor',{'TabBgColor':typed('long',-1 if color=='none' else int(color[1:],16))},True)
 if close_dialogs():raise ValueError('该操作需要确认对话框，已取消')
 return {'parts':part_names(),'part':call('getPart',C.c_int)(doc)}
# [excel] end
reply(0,ready=True)
for line in sys.stdin:
 if len(line)>20000:break
 p={}
 try:
  p=json.loads(line);i=p['id'];op=p['op']
  if op in ['part','command','paste']:ppt_text_active=False
  if op=='close':reply(i,closed=True);os._exit(0)
  soft=fmt in ['xlsx','docx'] and op in ['mouse','part','sheet_goto','sheet_key','sheet_text'] # [excel] report in-cell edits committed by navigation
  if soft:marker=change_marker()
  if op=='snapshot':result=snapshot(p)
  elif op=='history':result=history()
  elif op=='cells_context':result={'cells':cells_context()}
  elif op=='cells':result=update_cells(p)
  elif op=='cells_format':result=format_cells(p)
  elif op=='formula':result=set_formula(p)
  elif op=='table_context':result={'table':table_context(),'cells':cells_context()}
  elif op=='navigate':
   # include/vcl/keycodes.hxx + offapi/com/sun/star/awt/Key.idl.
   keys={'ArrowDown':1024,'ArrowUp':1025,'ArrowLeft':1026,'ArrowRight':1027,'Home':1028,'End':1029}
   if fmt not in ['docx','pptx'] or set(p)-set(['id','op','key','shift','control']) or p.get('key') not in keys or type(p.get('shift')) is not bool or type(p.get('control')) is not bool:raise ValueError('Invalid Word navigation key')
   if fmt=='pptx':
    if call('getSelectionType',C.c_int)(doc)==1:ppt_text_active=True
    if not ppt_text_active:raise ValueError('PPT text edit selection required')
   code=keys[p['key']]+(0x1000 if p['shift'] else 0)+(0x2000 if p['control'] else 0)
   # LOK_KEYEVENT_KEYINPUT=0, LOK_KEYEVENT_KEYUP=1. Always release; charCode is zero.
   key_event=call('postKeyEvent',None,C.c_int,C.c_int,C.c_int)
   key_event(doc,0,0,code);key_event(doc,1,0,code);result={}
  elif op=='mouse':
   ppt_text_active=False
   xy=300000000 if fmt=='xlsx' else 2000000
   call('postMouseEvent',None,*([C.c_int]*6))(doc,num(p['type'],0,2),num(p['x'],0,xy),num(p['y'],0,xy),num(p.get('count',1),1,2),num(p.get('buttons',1),0,1),0);result={}
  elif op=='paste':
   text=p['text']
   if fmt=='docx' and 'expectedSelection' in p:
    if set(p)-set(['id','op','text','expectedSelection']) or not p['expectedSelection'] or selection()!=p['expectedSelection']:raise ValueError('Word native text selection changed')
   if fmt=='pptx' and 'expectedSelection' in p:
    if set(p)-set(['id','op','text','expectedSelection','part']) or type(p.get('part')) is not int or call('getPart',C.c_int)(doc)!=p['part'] or call('getSelectionType',C.c_int)(doc)!=1 or not p['expectedSelection'] or selection()!=p['expectedSelection']:raise ValueError('PPT native text selection changed')
   if not isinstance(text,str) or len(text)>4000 or '\x00' in text:raise ValueError('Text limit')
   if not text:
    # Empty text is permitted only for a confirmed native text selection.
    # Never allow a bare Delete command to affect a shape, cell, or document.
    if fmt not in ['pptx','docx'] or 'expectedSelection' not in p:raise ValueError('Text limit')
    dispatch_completed(b'.uno:Delete',None,True);reply(i,result={});continue
   if fmt=='xlsx' and any(cell.lstrip().startswith('=') for row in text.split('\n') for cell in row.split('\t')):raise ValueError('Native spreadsheet formula input is not enabled; use existing bounded formula editor')
   mime=b'text/plain;charset=utf-8'
   if fmt=='xlsx' and ('\t' in text or '\n' in text):
    rows=[line.split('\t') for line in text.replace('\r\n','\n').split('\n')]
    if len(rows)>100 or max(map(len,rows))>32 or sum(map(len,rows))>1000:raise ValueError('Table input limit')
    text='<html><body><table>'+''.join('<tr>'+''.join('<td>'+html.escape(cell)+'</td>' for cell in row)+'</tr>' for row in rows)+'</table></body></html>';mime=b'text/html'
   b=text.encode()
   if not call('paste',C.c_bool,C.c_char_p,C.c_char_p,C.c_size_t)(doc,mime,b,len(b)):raise ValueError('Office rejected paste')
   result={}
  elif op=='command':
   cmd=p['command']
   if cmd not in ['.uno:Bold','.uno:Italic','.uno:Underline','.uno:Undo','.uno:Redo','.uno:SelectAll']:raise ValueError('Command not allowed')
   if cmd in ['.uno:Undo','.uno:Redo']:
    before=history();name=cmd[5:].lower();other='redo' if name=='undo' else 'undo'
    if not before.get(name) or before.get(other) is None:raise ValueError('No undo/redo action available')
    dispatch_completed(cmd.encode(),None,True)
    after=history()
    if after.get(name)!=before[name]-1 or after.get(other)!=before[other]+1:raise ValueError('Native history did not complete the requested action')
   else:call('postUnoCommand',None,C.c_char_p,C.c_char_p,C.c_bool)(doc,cmd.encode(),None,False)
   result={}
  elif op=='uno':
   # [lane:ribbon] Host already validated against the whitelist; re-check shape here (defence in depth).
   cmd=p.get('command');args=p.get('args')
   if set(p)-set(['id','op','command','args']) or not isinstance(cmd,str) or not re.fullmatch(r'\.uno:[A-Za-z][A-Za-z0-9.\-]{0,63}',cmd):raise ValueError('Invalid UNO command')
   if args is not None:
    if not isinstance(args,dict) or len(args)>4:raise ValueError('Invalid UNO args')
    for k,v in args.items():
     if not isinstance(k,str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9.]{0,63}',k) or not isinstance(v,dict) or set(v)!=set(['type','value']) or v['type'] not in ['long','float','boolean','string']:raise ValueError('Invalid UNO arg')
     if v['type']=='string' and (not isinstance(v['value'],str) or len(v['value'])>1100):raise ValueError('Invalid UNO arg')
     if v['type'] in ['long','float'] and (isinstance(v['value'],bool) or not isinstance(v['value'],(int,float))):raise ValueError('Invalid UNO arg')
     if v['type']=='boolean' and not isinstance(v['value'],bool):raise ValueError('Invalid UNO arg')
    if cmd=='.uno:InsertGraphic' and not args.get('FileName',{}).get('value','').startswith((job/'uploads').as_uri()+'/'):raise ValueError('Image must come from the controlled upload directory')
   command_result=None
   call('postUnoCommand',None,C.c_char_p,C.c_char_p,C.c_bool)(doc,cmd.encode(),json.dumps(args).encode() if args else None,True)
   deadline=time.monotonic()+3
   while command_result is None and time.monotonic()<deadline:time.sleep(0.005)
   result={'uno':json.loads(command_result) if command_result else {}}
   if fmt=='xlsx' and dialogs and cmd in ACCEPT_DIALOG:accept_dialogs() # [excel]
   if fmt=='xlsx' and close_dialogs():raise ValueError('该操作需要确认对话框，已取消；请调整选区后重试') # [excel]
   if fmt=='docx' and cmd=='.uno:InsertAnnotation':post_key(0,SHEET_KEYS['Escape']) # [docx] leave the comment editor; otherwise later inserts silently act on the comment
   if fmt=='docx' and close_dialogs():raise ValueError('该操作需要原生对话框，已取消') # [docx]
  elif op=='border':
   table=table_context();border=p.get('border',{})
   if not table or p.get('tableFingerprint')!=table['fingerprint']:raise ValueError('Real bounded Word table selection changed')
   if not isinstance(border,dict) or set(border)!=set(['color','width','padding']):raise ValueError('Invalid border properties')
   color=border['color'];width=border['width'];padding=border['padding']
   if not isinstance(color,str) or not re.fullmatch(r'#[0-9A-Fa-f]{6}',color) or isinstance(width,bool) or not isinstance(width,(int,float)) or not 0.5<=width<=3 or width*4!=int(width*4):raise ValueError('Invalid border style')
   if isinstance(padding,bool) or not isinstance(padding,(int,float)) or not 0<=padding<=12 or padding*2!=int(padding*2):raise ValueError('Invalid padding')
   def typed(t,v):return {'type':t,'value':v}
   def line():return typed('com.sun.star.table.BorderLine2',{'Color':typed('com.sun.star.util.Color',int(color[1:],16)),'InnerLineWidth':typed('short',0),'OuterLineWidth':typed('short',round(width*2540/72)),'LineDistance':typed('short',0),'LineStyle':typed('short',0),'LineWidth':typed('unsigned long',0)})
   args={'BorderOuter':typed('[]any',[line(),line(),line(),line()]+[typed('long',round(padding*2540/72)) for _ in range(5)])}
   dispatch_completed(b'.uno:BorderOuter',args,True);result={}
  elif op=='ppt_format':
   if fmt!='pptx' or set(p)-set(['id','op','part','expectedSelection','fontSize','fontColor']) or type(p.get('part')) is not int or call('getPart',C.c_int)(doc)!=p['part'] or call('getSelectionType',C.c_int)(doc)!=1 or not isinstance(p.get('expectedSelection'),str) or not p['expectedSelection'] or selection()!=p['expectedSelection']:raise ValueError('PPT native text selection changed')
   size=p.get('fontSize');color=p.get('fontColor')
   if size is None and color is None:raise ValueError('PPT format required')
   if 'fontSize' in p and (isinstance(size,bool) or not isinstance(size,(float,int)) or not 6<=size<=96 or size*2!=int(size*2)):raise ValueError('PPT font size must be 6-96 half points')
   if 'fontColor' in p and (not isinstance(color,str) or not re.fullmatch(r'#[0-9A-Fa-f]{6}',color)):raise ValueError('Invalid PPT color')
   if size is not None:dispatch_completed(b'.uno:FontHeight',{'FontHeight.Height':{'type':'float','value':size}},True)
   if color is not None:dispatch_completed(b'.uno:Color',{'Color':{'type':'long','value':int(color[1:],16)}},True)
   result={}
  elif op=='format':
   if fmt!='docx' or not isinstance(p.get('expectedSelection'),str) or not p['expectedSelection'] or selection()!=p['expectedSelection']:raise ValueError('Word native selection changed')
   name=p.get('fontName');asian=p.get('fontNameAsian');size=p.get('fontSize');color=p.get('fontColor');background=p.get('backgroundColor')
   if set(p)-set(['id','op','expectedSelection','fontName','fontNameAsian','fontSize','fontColor','backgroundColor']):raise ValueError('Invalid format properties')
   for key in ['fontColor','backgroundColor']:
    if key in p and (not isinstance(p[key],str) or not re.fullmatch(r'#[0-9A-Fa-f]{6}',p[key])):raise ValueError('Invalid format color')
   if name is None and asian is None and size is None and color is None and background is None:raise ValueError('Format required')
   for name_value in [name,asian]:
    if name_value is not None and (not isinstance(name_value,str) or not 1<=len(name_value)<=80 or name_value!=name_value.strip() or any(ord(c)<32 or ord(c)==127 for c in name_value) or any(c in name_value for c in '<>:/\\')):raise ValueError('Invalid font name')
   if size is not None and (isinstance(size,bool) or not isinstance(size,(float,int)) or not 6<=size<=96 or size*2!=int(size*2)):raise ValueError('Font size must be 6-96 pt in half points')
   if name is not None:dispatch_completed(b'.uno:CharFontName',{'CharFontName.FamilyName':{'type':'string','value':name}},True)
   if asian is not None:dispatch_completed(b'.uno:CharFontNameCJK',{'CharFontNameCJK.FamilyName':{'type':'string','value':asian}},True)
   if size is not None:dispatch_completed(b'.uno:FontHeight',{'FontHeight.Height':{'type':'float','value':size}},True)
   for command,value in [('Color',color),('CharBackColor',background)]:
    if value is not None:dispatch_completed(('.uno:'+command).encode(),{command:{'type':'long','value':int(value[1:],16)}},True)
   result={}
  elif op=='range':
   ref=p['ref']
   if not isinstance(ref,str) or not re.fullmatch(r'[A-Z]{1,2}[1-9][0-9]{0,3}(?::[A-Z]{1,2}[1-9][0-9]{0,3})?',ref):raise ValueError('Invalid cell range')
   args=json.dumps({'ToPoint':{'type':'string','value':ref}}).encode();call('postUnoCommand',None,C.c_char_p,C.c_char_p,C.c_bool)(doc,b'.uno:GoToCell',args,False);result={}
  elif op=='part':call('setPart',None,C.c_int)(doc,num(p['part'],0,min(99,call('getParts',C.c_int)(doc)-1)));result={}
  elif op=='export_pdf':
   if set(p)!=set(['id','op']):raise ValueError('PDF export takes no arguments')
   if not call('saveAs',C.c_int,C.c_char_p,C.c_char_p,C.c_char_p)(doc,(job/'output/document.pdf').as_uri().encode(),b'pdf',None):raise ValueError('Office PDF export failed')
   result={'saved':True}
  elif op=='save':
   if not call('saveAs',C.c_int,C.c_char_p,C.c_char_p,C.c_char_p)(doc,(job/('edited.'+fmt)).as_uri().encode(),fmt.encode(),None):raise ValueError('Office save failed')
   result={'saved':True}
  elif op=='thumbnail':result=thumbnail(p) # [lane:pages]
  elif op=='slide_action':result=slide_action(p) # [lane:pages]
  elif op=='notes_get':result=notes_get(p) # [lane:pages]
  elif op=='notes_set':result=notes_set(p) # [lane:pages]
  elif op=='deck_info':result=deck_info(p) # [lane:pages]
  elif op=='view_mode':result=view_mode(p) # [lane:pages]
  elif op=='sheet_key':result=sheet_key(p) # [excel]
  elif op=='sheet_text':result=sheet_text(p) # [excel]
  elif op=='cell_input':result=cell_input(p) # [excel]
  elif op=='sheet_goto':result=sheet_goto(p) # [excel]
  elif op=='sheet_border':result=sheet_border(p) # [excel]
  elif op=='sheet_size':result=sheet_size(p) # [excel]
  elif op=='sheet_tab':result=sheet_tab(p) # [excel]
  else:raise ValueError('Unknown operation')
  if soft and isinstance(result,dict):result['changed']=bool(result.get('changed')) or change_marker()!=marker # [excel]
  reply(i,result=result)
 except Exception as e:reply(p.get('id',-1),error=str(e)[:400])
os._exit(0) # owned process ends without upstream deferred clipboard atexit teardown
