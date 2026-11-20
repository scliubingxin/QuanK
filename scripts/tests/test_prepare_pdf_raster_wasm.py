import hashlib,importlib.util,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('prepare_pdf_raster',Path(__file__).resolve().parents[1]/'prepare-pdf-raster-wasm.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class PdfRasterAssets(unittest.TestCase):
 def setup_assets(self,d):
  d=Path(d);root=d/'root';source=d/'assets';root.mkdir();source.mkdir();files={}
  for n in ('index.cjs','pdfium.wasm'):
   b=('fixture '+n).encode();(source/n).write_bytes(b);files[n]=(len(b),hashlib.sha256(b).hexdigest())
  return root,source,files
 def test_verified_assets_staged_and_idempotent(self):
  with tempfile.TemporaryDirectory() as d:
   root,source,files=self.setup_assets(d)
   with patch.object(m,'FILES',files):
    self.assertEqual(m.stage_assets(root,source),2);self.assertEqual(m.stage_assets(root,source),2)
   for n in files:self.assertEqual((root/n).read_bytes(),(source/n).read_bytes())
 def test_bad_second_asset_rejects_without_publishing_first(self):
  with tempfile.TemporaryDirectory() as d:
   root,source,files=self.setup_assets(d);(source/'pdfium.wasm').write_bytes(b'bad')
   with patch.object(m,'FILES',files),self.assertRaisesRegex(ValueError,'mismatch'):m.stage_assets(root,source)
   self.assertFalse((root/'index.cjs').exists())
 def test_symlink_source_and_existing_changed_destination_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   root,source,files=self.setup_assets(d);(source/'index.cjs').unlink();(source/'index.cjs').symlink_to('/dev/null')
   with patch.object(m,'FILES',files),self.assertRaisesRegex(ValueError,'linked'):m.stage_assets(root,source)
  with tempfile.TemporaryDirectory() as d:
   root,source,files=self.setup_assets(d);(root/'index.cjs').write_bytes(b'existing')
   with patch.object(m,'FILES',files),self.assertRaisesRegex(ValueError,'overwrite'):m.stage_assets(root,source)
   self.assertEqual((root/'index.cjs').read_bytes(),b'existing')
 def test_racing_destination_does_not_overwrite_existing_file(self):
  with tempfile.TemporaryDirectory() as d:
   root,source,files=self.setup_assets(d);original=m.os.link
   def race(temp,target):Path(target).write_bytes(b'concurrent');return original(temp,target)
   with patch.object(m,'FILES',files),patch.object(m.os,'link',side_effect=race),self.assertRaisesRegex(ValueError,'appeared'):m.stage_assets(root,source)
   self.assertEqual((root/'index.cjs').read_bytes(),b'concurrent')
