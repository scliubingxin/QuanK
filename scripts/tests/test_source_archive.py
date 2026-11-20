import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('source_package', Path(__file__).resolve().parents[1] / 'package-desktop-source.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class AtomicSourceTests(unittest.TestCase):
    def setup_source(self, root):
        (root / 'desktop').mkdir()
        (root / 'desktop/package.json').write_text(json.dumps({'productName': 'QuanK', 'version': '0.14.0'}))
        (root / 'RELEASE_STATUS.json').write_text('{}')
        (root / 'README.md').write_text('Complete source')

    def test_final_name_remains_old_until_zip_is_complete_and_verified(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / 'source'; root.mkdir(); self.setup_source(root)
            output = Path(d) / 'release.zip'; output.write_bytes(b'previous complete release')
            original = zipfile.ZipFile.writestr
            def inspect_writer(z, *args, **kwargs):
                self.assertEqual(output.read_bytes(), b'previous complete release')
                return original(z, *args, **kwargs)
            with patch.object(module, 'root', root), patch.object(zipfile.ZipFile, 'writestr', inspect_writer), contextlib.redirect_stdout(io.StringIO()):
                module.package(output)
            with zipfile.ZipFile(output) as z:
                self.assertIsNone(z.testzip())
                self.assertEqual(len(z.namelist()), 4)
            self.assertEqual(list(Path(d).glob('.*.tmp')), [])

    def test_failed_zip_write_preserves_old_release_and_removes_temp(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / 'source'; root.mkdir(); self.setup_source(root)
            output = Path(d) / 'release.zip'; output.write_bytes(b'previous complete release')
            with patch.object(module, 'root', root), patch.object(zipfile.ZipFile, 'writestr', side_effect=OSError('disk full')):
                with self.assertRaisesRegex(OSError, 'disk full'):
                    module.package(output)
            self.assertEqual(output.read_bytes(), b'previous complete release')
            self.assertEqual(list(Path(d).glob('.*.tmp')), [])

    def test_ocr_binaries_and_data_are_excluded_but_adapter_source_and_manifest_remain(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)/'source';root.mkdir();self.setup_source(root)
            vendor=root/'desktop/runtime/vendor/ocr-wasm'
            for name in ['deps/tesseract.js-core/tesseract-core.js','deps/tesseract.js-core/tesseract-core.wasm','data/eng.traineddata','data/chi_sim.traineddata','deps/tesseract.js/src/index.js','MANIFEST.json','recognize.cjs']:
                p=vendor/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'test fixture')
            out=Path(d)/'source.zip'
            with patch.object(module,'root',root),contextlib.redirect_stdout(io.StringIO()):module.package(out)
            with zipfile.ZipFile(out) as z:
                names=set(z.namelist());prefix='muyun-ai/desktop/runtime/vendor/ocr-wasm/'
                for n in ['deps/tesseract.js-core/tesseract-core.js','deps/tesseract.js-core/tesseract-core.wasm','data/eng.traineddata','data/chi_sim.traineddata']:self.assertNotIn(prefix+n,names)
                for n in ['deps/tesseract.js/src/index.js','MANIFEST.json','recognize.cjs']:self.assertIn(prefix+n,names)
    def test_pdf_renderer_binaries_are_excluded_but_owned_adapter_and_license_remain(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)/'source';root.mkdir();self.setup_source(root);vendor=root/'desktop/runtime/vendor/pdf-raster-wasm'
            for name in ['index.cjs','pdfium.wasm','render.cjs','WRAPPER-LICENSE.txt']:
                p=vendor/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'fixture')
            out=Path(d)/'source.zip'
            with patch.object(module,'root',root),contextlib.redirect_stdout(io.StringIO()):module.package(out)
            with zipfile.ZipFile(out) as z:
                names=set(z.namelist());prefix='muyun-ai/desktop/runtime/vendor/pdf-raster-wasm/'
                for n in ['index.cjs','pdfium.wasm']:self.assertNotIn(prefix+n,names)
                for n in ['render.cjs','WRAPPER-LICENSE.txt']:self.assertIn(prefix+n,names)
