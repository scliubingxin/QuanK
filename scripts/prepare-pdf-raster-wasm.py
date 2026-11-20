#!/usr/bin/env python3
"""Stage separately supplied pinned PDFium assets into a private build tree.
This is an experiment, not approval to redistribute PDFium or its dependencies.
"""
import argparse,hashlib,os,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'desktop/runtime/vendor/pdf-raster-wasm'
FILES={'index.cjs':(294180,'a77b527bd07187e0a4c3cab00bca8ff2b21773d0b408f9f61ac8bdc66fcdbdc2'),'pdfium.wasm':(5298237,'beeaf5bbff216d555fecec7cd486072838c4632a2272d31b52ef1fd05008fe7c')}
def stage_assets(root,assets):
 root=Path(root);assets=Path(assets)
 if root.is_symlink() or assets.is_symlink() or not root.is_dir() or not assets.is_dir():raise ValueError('invalid or linked PDF renderer root')
 staged=[]
 for name,(size,sha) in FILES.items():
  src=assets/name;dst=root/name
  if src.is_symlink() or not src.is_file():raise ValueError('missing or linked PDF renderer asset: '+name)
  b=src.read_bytes()
  if len(b)!=size or hashlib.sha256(b).hexdigest()!=sha:raise ValueError('PDF renderer asset mismatch: '+name)
  if dst.is_symlink() or (dst.exists() and dst.read_bytes()!=b):raise ValueError('refuse to overwrite PDF renderer asset: '+name)
  staged.append((dst,b))
 for dst,b in staged:
  if dst.is_symlink():raise ValueError('linked destination appeared')
  if dst.exists():
   if not dst.is_file() or dst.read_bytes()!=b:raise ValueError('destination changed during staging')
   continue
  fd,temp=tempfile.mkstemp(prefix='.pdfium-',dir=dst.parent)
  try:
   with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
   try:os.link(temp,dst)
   except FileExistsError:raise ValueError('destination appeared during staging')
  finally:
   if os.path.exists(temp):os.unlink(temp)
 return len(staged)
def main():
 p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,required=True);a=p.parse_args();print('verified PDF renderer assets:',stage_assets(ROOT,a.assets),'distribution license audit incomplete')
if __name__=='__main__':main()
