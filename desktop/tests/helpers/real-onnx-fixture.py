"""Development-only loopback fixture; no model weights are distributed here."""
import hashlib,json,os,sys
from http.server import BaseHTTPRequestHandler,HTTPServer
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer
root=os.environ['WB_ONNX_MODEL_DIR']
expected={'model_int8.onnx':'b9837c19ce154ff0726d398ee77abbc03a7faf0476c6f93016c84e531be7ebb5','tokenizer.json':'48cea5d44424912a6fd1ea647bf4fe50b55ab8b1e5879c3275f80e339e8fae26'}
for name,digest in expected.items():
 with open(os.path.join(root,name),'rb') as f:
  if hashlib.sha256(f.read()).hexdigest()!=digest:raise RuntimeError('fixture model SHA mismatch: '+name)
tokenizer=Tokenizer.from_file(os.path.join(root,'tokenizer.json'));tokenizer.enable_truncation(max_length=512);tokenizer.enable_padding()
options=ort.SessionOptions();options.intra_op_num_threads=1;options.inter_op_num_threads=1
model=ort.InferenceSession(os.path.join(root,'model_int8.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def respond(self,obj):
  data=json.dumps(obj,separators=(',',':')).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_GET(self):
  if self.path!='/api/tags':self.send_error(404);return
  self.respond({'models':[{'name':'local-embed','digest':expected['model_int8.onnx']}]})
 def do_POST(self):
  if self.path!='/api/embed':self.send_error(404);return
  length=int(self.headers.get('Content-Length','0'))
  if not 0<length<=65536:self.send_error(413);return
  payload=json.loads(self.rfile.read(length));items=payload.get('input')
  if payload.get('model')!='local-embed' or not isinstance(items,list) or not 1<=len(items)<=8 or any(not isinstance(x,str) or len(x)>10000 for x in items):self.send_error(400);return
  e=tokenizer.encode_batch(items);batch={'input_ids':np.asarray([x.ids for x in e],dtype='int64'),'attention_mask':np.asarray([x.attention_mask for x in e],dtype='int64'),'token_type_ids':np.asarray([x.type_ids for x in e],dtype='int64')}
  vectors=model.run(None,batch)[0][:,0,:];vectors=vectors/np.linalg.norm(vectors,axis=1,keepdims=True);self.respond({'embeddings':vectors.tolist()})
server=HTTPServer(('127.0.0.1',11434),Handler);print('READY',flush=True);server.serve_forever()
