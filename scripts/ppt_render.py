#!/usr/bin/env python3
"""pptx → PDF(soffice) → 每页 PNG → 联系表。用法: ppt_render.py in.pptx outdir [cols]
需要 PyMuPDF(fitz)+Pillow；soffice 取自 SOFFICE 环境变量或 QuanK.app 内置运行时。"""
import os, subprocess, sys, shutil, glob, atexit, tempfile
import fitz
from PIL import Image, ImageDraw
SOFFICE = os.environ.get('SOFFICE') or shutil.which('soffice') or next((p for p in ['/Applications/QuanK.app/Contents/Resources/runtimes/WillBuddyEngine/Contents/MacOS/soffice','/Applications/QuanK.app/Contents/Resources/runtimes/LibreOffice.app/Contents/MacOS/soffice'] if os.path.exists(p)),'soffice')
# 不向 QuanK.app 内置运行时写 .pyc；LibreOffice 用独立临时 profile，避免在运行目录留下配置/锁文件
os.environ.setdefault('PYTHONDONTWRITEBYTECODE', '1')
_OFFICE_PROFILE = tempfile.mkdtemp(prefix='quank-soffice-profile-')
atexit.register(shutil.rmtree, _OFFICE_PROFILE, ignore_errors=True)
def with_font(pptx, out, font):
    """仅用于预览：本机无微软雅黑时，把字体名替换为可用中文字体再渲染（不改动原文件）。"""
    import zipfile
    dst = os.path.join(out, 'fontsub-' + os.path.basename(pptx))
    with zipfile.ZipFile(pptx) as zi, zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zo:
        for it in zi.infolist():
            data = zi.read(it.filename)
            if it.filename.endswith('.xml'): data = data.replace(b'Microsoft YaHei', font.encode()).replace(b'typeface="Arial"', b'typeface="' + font.encode() + b'"')
            zo.writestr(it, data)
    return dst
def render(pptx, out, scale=1.2, font=os.environ.get('PREVIEW_FONT', 'Heiti SC')):
    os.makedirs(out, exist_ok=True)
    name = os.path.splitext(os.path.basename(pptx))[0]
    if font: pptx = with_font(pptx, out, font)
    env = dict(os.environ, FONTCONFIG_FILE=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ppt_fonts.conf'))
    profile_arg = '-env:UserInstallation=file://' + _OFFICE_PROFILE
    subprocess.run([SOFFICE, profile_arg, '--headless', '--convert-to', 'pdf', '--outdir', out, pptx], check=True, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    pdf = os.path.join(out, 'fontsub-' * bool(font) + name + '.pdf')
    paths = []
    for i, page in enumerate(fitz.open(pdf)):
        p = os.path.join(out, f'{name}-{i+1:02d}.png')
        page.get_pixmap(matrix=fitz.Matrix(scale, scale)).save(p); paths.append(p)
    return paths
def sheet(paths, dest, cols=3, w=640, label=None):
    ims = [Image.open(p).convert('RGB') for p in paths]
    h = int(ims[0].height * w / ims[0].width); rows = -(-len(ims) // cols); pad = 10
    S = Image.new('RGB', (cols * (w + pad) + pad, rows * (h + pad) + pad + (30 if label else 0)), (225, 228, 232))
    d = ImageDraw.Draw(S)
    if label: d.text((pad, 8), label, fill=(0, 0, 0))
    for i, im in enumerate(ims):
        S.paste(im.resize((w, h)), (pad + (i % cols) * (w + pad), pad + (30 if label else 0) + (i // cols) * (h + pad)))
    S.save(dest); return dest
def compare(old_paths, new_paths, dest, w=520):
    n = max(len(old_paths), len(new_paths)); pad = 10; head = 36
    a = Image.open(new_paths[0]); h = int(a.height * w / a.width)
    S = Image.new('RGB', (2 * w + 3 * pad, head + n * (h + pad) + pad), (225, 228, 232)); d = ImageDraw.Draw(S)
    d.text((pad, 10), 'OLD  (legacy: title + bullets)', fill=(160, 0, 0)); d.text((w + 2 * pad, 10), 'NEW  (structured layouts + adaptive typesetting)', fill=(0, 100, 0))
    for i in range(n):
        for j, ps in enumerate((old_paths, new_paths)):
            if i < len(ps): S.paste(Image.open(ps[i]).convert('RGB').resize((w, h)), (pad + j * (w + pad), head + i * (h + pad)))
    S.save(dest)
if __name__ == '__main__':
    if sys.argv[1] == 'compare':
        o = render(sys.argv[2], sys.argv[4]); n = render(sys.argv[3], sys.argv[4]); compare(o, n, sys.argv[5]); print('compare', len(o), len(n)); sys.exit(0)
    ps = render(sys.argv[1], sys.argv[2]); sheet(ps, os.path.join(sys.argv[2], 'sheet.png'), int(sys.argv[3]) if len(sys.argv) > 3 else 3)
    print(len(ps), 'pages')
