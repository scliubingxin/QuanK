#!/usr/bin/env python3
"""Copy separately supplied OCR assets after exact pinned verification; never downloads.
Build-only experimental helper. Publication still requires complete upstream notices.
"""
import argparse,hashlib,json,os,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'desktop/runtime/vendor/ocr-wasm'
MANIFEST_SHA='6e737c59628d063bd4197ade001862c31f80f6b115076db8f2131efdeafc7870'
EXPECTED={'data/eng.traineddata','data/chi_sim.traineddata'}|{'deps/tesseract.js-core/'+name+ext for name in ('tesseract-core','tesseract-core-simd','tesseract-core-relaxedsimd') for ext in ('.js','.wasm')}
def check_parents(root,rel):
 current=root
 for part in Path(rel).parts[:-1]:
  current=current/part
  if current.is_symlink():raise ValueError('linked asset directory: '+rel)
 return root/rel

def stage_assets(root, assets):
 """Stage precisely pinned assets under a fresh application tree.

 The caller must keep the target private and discard it on any failure. This
 function never fetches data, and refuses symlinked roots and parent directories.
 """
 root=Path(root);assets=Path(assets)
 if root.is_symlink() or assets.is_symlink() or not root.is_dir() or not assets.is_dir():raise ValueError('invalid or linked OCR root')
 raw=(root/'MANIFEST.json').read_bytes()
 if hashlib.sha256(raw).hexdigest()!=MANIFEST_SHA:raise ValueError('untrusted OCR manifest')
 entries={x['path']:x for x in json.loads(raw)['files']};staged=[]
 for rel in sorted(EXPECTED):
  entry=entries[rel];src=check_parents(assets,rel)
  if src.is_symlink() or not src.is_file():raise ValueError('missing or linked asset: '+rel)
  b=src.read_bytes()
  if len(b)!=entry['size'] or hashlib.sha256(b).hexdigest()!=entry['sha256']:raise ValueError('asset mismatch: '+rel)
  target=check_parents(root,rel)
  if target.is_symlink() or (target.exists() and target.read_bytes()!=b):raise ValueError('refuse to overwrite different asset: '+rel)
  staged.append((target,b))
 for target,b in staged:
  target.parent.mkdir(parents=True,exist_ok=True)
  if target.is_symlink():raise ValueError('linked destination appeared: '+str(target))
  if target.exists():
   if not target.is_file() or target.read_bytes()!=b:raise ValueError('destination changed during staging: '+str(target))
   continue
  fd,temp=tempfile.mkstemp(prefix='.ocr-',dir=target.parent)
  try:
   with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
   try:os.link(temp,target)
   except FileExistsError:raise ValueError('asset appeared during staging: '+str(target))
  finally:
   if os.path.exists(temp):os.unlink(temp)
 return len(staged)

def main():
 p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True,help='directory containing the pinned relative paths');a=p.parse_args()
 count=stage_assets(ROOT,a.assets)
 print(json.dumps({'verified_assets':count,'publication':'blocked pending complete third-party notices'}))
if __name__=='__main__':main()
