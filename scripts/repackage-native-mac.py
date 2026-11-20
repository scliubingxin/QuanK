#!/usr/bin/env python3
"""Upgrade application sources in the previously verified complete native bundle.
Build-time only. Reject unknown base bytes; never download on the installation host.
"""
import sys
import argparse,hashlib,json,plistlib,shutil,subprocess,struct,importlib.util
from pathlib import Path
from offline_bundle import copy_source_tree, validate_archive,inventory,write_archive,capture_staging_paths,verify_staging_paths
ROOT=Path(__file__).resolve().parent.parent
ENGINE='WillBuddyEngine';LEGACY_ENGINE='LibreOffice.app'
# Vendor bundles inside the engine that macOS would otherwise register (Finder "Open With", Quick Look, Spotlight).
# None of them is used by the embedded document engine; the engine itself and its libraries stay byte-identical.
ENGINE_DROP=('Contents/PlugIns','Contents/Library/Spotlight','Contents/Frameworks/LibreOfficePython.framework/Versions/*/Resources/Python.app')
def engine_dropped(rel):
 """True when a path relative to the engine folder lies inside one of the dropped bundles."""
 parts=rel.split('/')
 for d in ENGINE_DROP:
  dp=d.split('/')
  if len(parts)>=len(dp) and all(x=='*' or x==y for x,y in zip(dp,parts)):return True
 return False
def drop_engine_bundles(engine):
 # Versions/Current is a symlink to the real version folder, so a glob can reach one bundle twice:
 # remove each real target once and skip aliases whose target is already gone.
 for d in ENGINE_DROP:
  seen=set()
  for p in sorted(engine.glob(d)):
   if p.is_symlink() or p.is_file():p.unlink();continue
   if not p.exists():continue
   real=p.resolve()
   if real in seen:continue
   seen.add(real);shutil.rmtree(real)

def migrate_engine(resources):
 """Move the vendor office engine out of .app bundle form so LaunchServices never offers it under \"Open With\".
 Bytes stay identical (only the folder is renamed); nested vendor bundles in ENGINE_DROP are removed."""
 rt=resources/'runtimes';old=rt/LEGACY_ENGINE;new=rt/ENGINE
 if new.exists() or not old.is_dir():raise ValueError('unexpected engine layout in base bundle')
 old.rename(new);drop_engine_bundles(new)
 mf=rt/'RUNTIMES.json';m=json.loads(mf.read_text())
 m['files']={(ENGINE+k[len(LEGACY_ENGINE):] if k.startswith(LEGACY_ENGINE+'/') else k):v for k,v in m.get('files',{}).items() if not (k.startswith(LEGACY_ENGINE+'/') and engine_dropped(k[len(LEGACY_ENGINE)+1:]))}
 mf.write_text(json.dumps(m,indent=2)+'\n')
 return new

BASE_SHA='a516de81b28d37ebff5dae6d70cf304ac9fa6190b958da8776bf1e2f7c42dfc1'
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def module(name,file):
 s=importlib.util.spec_from_file_location(name,file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def verify_expected_tree(stage,app,entries):
 expected={e['path']:e for e in entries}
 actual={e['path']:e for e in inventory(stage,app)}
 if actual.keys()!=expected.keys():raise ValueError('extracted runtime paths differ from verified archive: added='+repr(sorted(actual.keys()-expected.keys()))+' missing='+repr(sorted(expected.keys()-actual.keys())))
 for name,e in expected.items():
  if actual[name]!=e:raise ValueError('extracted runtime bytes, symlink or mode differ from verified archive: '+name)
 return True

def sign_new_bundle(signing_tool,source_app,output_app,entitlements,run=subprocess.run):
 source_app=source_app.resolve();output_app=output_app.resolve()
 if source_app==output_app or source_app.is_relative_to(output_app) or output_app.is_relative_to(source_app):raise ValueError('signing input and output must be disjoint')
 if output_app.exists():raise ValueError('signing output already exists')
 expected=capture_staging_paths(source_app)
 before=inventory(source_app.parent,source_app)
 run([str(signing_tool.resolve()),'sign','--exclude','Contents/Resources/runtimes/'+ENGINE,'--exclude','Contents/Resources/runtimes/'+ENGINE+'/**','--entitlements-xml-file',str(entitlements),str(source_app),str(output_app)],check=True)
 if inventory(source_app.parent,source_app)!=before:raise ValueError('signer modified its read-only input tree')
 verify_staging_paths(output_app,expected)
 return expected

def main():
 subprocess.run([sys.executable,str(ROOT/'scripts/bundle-office-worker.py'),'--check'],check=True)
 p=argparse.ArgumentParser();p.add_argument('--base',type=Path,required=True);p.add_argument('--work-dir',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--signing-tool',type=Path,required=True);p.add_argument('--experimental-ocr-assets',type=Path,help='pinned offline OCR assets; experimental, not release approval');p.add_argument('--experimental-pdf-raster-assets',type=Path,help='pinned PDFium renderer assets; experimental, not release approval');a=p.parse_args()
 if digest(a.base)!=BASE_SHA:raise ValueError('unknown native base bundle SHA')
 validate_archive(a.base);stage=a.work_dir.resolve()
 if stage.exists():raise ValueError('choose a new private work directory')
 stage.mkdir(mode=0o700,parents=True)
 pkg=module('native_pack',ROOT/'scripts/package-offline-mac.py');input_stage=stage/'signing-input';input_stage.mkdir(mode=0o700)
 pkg.extract_runtime(a.base,input_stage)
 app=input_stage/'QuanK.app';resources=app/'Contents/Resources';prior=json.loads((input_stage/'OFFLINE-MANIFEST.json').read_text());metadata=json.loads((ROOT/'desktop/package.json').read_text());version=metadata['version']
 if prior['version']!='0.37.15' or prior['architecture']!='arm64':raise ValueError('base version/architecture mismatch')
 verify_expected_tree(input_stage,app,prior['files'])
 migrate_engine(resources)
 info=app/'Contents/Info.plist';d=plistlib.loads(info.read_bytes());d.update(CFBundleVersion=version,CFBundleShortVersionString=version);info.write_bytes(plistlib.dumps(d))
 source=stage/'app-source';source.mkdir()
 for name in ['main.mjs','preload.cjs','office-preload.cjs','core.mjs','src','runtime','assets','main','services']:
  f=ROOT/'desktop'/name
  if f.is_dir():copy_source_tree(f,source/name)
  else:shutil.copy2(f,source/name)
 if a.experimental_ocr_assets:
  ocr=module('prepare_ocr',ROOT/'scripts/prepare-ocr-wasm.py')
  if ocr.stage_assets(source/'runtime/vendor/ocr-wasm',a.experimental_ocr_assets)!=len(ocr.EXPECTED):raise ValueError('OCR asset count mismatch')
 if a.experimental_pdf_raster_assets:
  raster=module('prepare_pdf_raster',ROOT/'scripts/prepare-pdf-raster-wasm.py')
  if raster.stage_assets(source/'runtime/vendor/pdf-raster-wasm',a.experimental_pdf_raster_assets)!=len(raster.FILES):raise ValueError('PDF renderer asset count mismatch')
 (source/'package.json').write_text(json.dumps({k:metadata[k] for k in ['name','productName','version','description','author','license','type','main']},indent=2)+'\n')
 subprocess.run(['node',str(ROOT/'desktop/node_modules/@electron/asar/bin/asar.js'),'pack',str(source),str(resources/'app.asar')],check=True)
 signed_app=stage/'QuanK.app'
 expected=sign_new_bundle(a.signing_tool,app,signed_app,ROOT/'desktop/installer/entitlements.mac.plist')
 app=signed_app;resources=app/'Contents/Resources'
 for name in ['ELECTRON-LICENSE.txt','LICENSES.chromium.html']:shutil.copy2(input_stage/name,stage/name)
 for e in prior['files']:
  if '/runtimes/'+LEGACY_ENGINE+'/' in e['path'] and 'sha256' in e and not engine_dropped(e['path'].split('/runtimes/'+LEGACY_ENGINE+'/',1)[1]):
   if digest(stage/e['path'].replace('/runtimes/'+LEGACY_ENGINE+'/','/runtimes/'+ENGINE+'/'))!=e['sha256']:raise ValueError('upstream engine bytes changed')
 verifier=module('pages',ROOT/'scripts/verify-macho-pages.py');binaries=pages=0
 for f in app.rglob('*'):
  if not f.is_file() or f.is_symlink():continue
  with f.open('rb') as stream:head=stream.read(16)
  if head[:4] not in [bytes.fromhex('cffaedfe'),bytes.fromhex('cafebabe')]:continue
  if head[:4]==bytes.fromhex('cffaedfe') and struct.unpack_from('<I',head,12)[0]==1:continue
  if head[:4]==bytes.fromhex('cafebabe') and struct.unpack_from('>I',head,4)[0]>16:continue
  pages+=verifier.verify(f.read_bytes(),require_adhoc=not f.is_relative_to(resources/'runtimes'/ENGINE));binaries+=1
 manifest={**prior,'experimental_ocr_assets':bool(a.experimental_ocr_assets),'experimental_pdf_raster_assets':bool(a.experimental_pdf_raster_assets),'version':version,'base_bundle_sha256':BASE_SHA,'app_asar_sha256':digest(resources/'app.asar'),'verified_macho_binaries':binaries,'verified_code_pages':pages,'files':inventory(stage,app),'native_mac_tested':False}
 (stage/'OFFLINE-MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');shutil.copy2(ROOT/'desktop/installer/README-Mac.txt',stage/'READ-ME.txt');shutil.copy2(ROOT/'desktop/installer/Install-QuanK.command',stage/'Install-QuanK.command');(stage/'Install-QuanK.command').chmod(0o755);verify_staging_paths(app,expected)
 result=write_archive(stage,manifest['files'],a.output.resolve());print(json.dumps({'version':version,'file':str(a.output.resolve()),'bytes':a.output.stat().st_size,'sha256':digest(a.output),'app_asar_sha256':manifest['app_asar_sha256'],'verified_macho_binaries':binaries,'verified_code_pages':pages,'archive_check':result}))
if __name__=='__main__':main()
