# -*- coding: utf-8 -*-
"""Core drawing primitives shared by all themes.

All public geometry is expressed in INCHES (float) on a 13.333 x 7.5 in (16:9) canvas.
Colors are 6-digit hex strings ("2F62F5").  Python 3.6+ compatible.
"""
from __future__ import division
import copy
import math
import os
import re
import base64
import hashlib
import tempfile

from pptx import Presentation
from pptx.util import Emu, Pt
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from lxml import etree

EMU_IN = 914400
SLIDE_W = 13.333333
SLIDE_H = 7.5
HERE = os.path.dirname(os.path.abspath(__file__))
DECK_ROOT = os.path.dirname(HERE)
ASSET_DIR = os.path.join(DECK_ROOT, "assets")
_TMP = os.path.join(tempfile.gettempdir(), "deckkit_assets")

WARNINGS = []


def warn(msg):
    WARNINGS.append(msg)


def E(v):
    """inches -> EMU (int)."""
    return int(round(float(v) * EMU_IN))


def hexc(c, default="000000"):
    if c is None:
        return default
    c = str(c).strip().lstrip("#").upper()
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    if not re.match(r"^[0-9A-F]{6}$", c):
        return default
    return c


def mix(c1, c2, t):
    """blend two hex colors, t=0 -> c1, t=1 -> c2"""
    a = [int(hexc(c1)[i:i + 2], 16) for i in (0, 2, 4)]
    b = [int(hexc(c2)[i:i + 2], 16) for i in (0, 2, 4)]
    return "".join("%02X" % int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


# ----------------------------------------------------------------------------
# presentation
# ----------------------------------------------------------------------------
def new_presentation():
    prs = Presentation()
    prs.slide_width = Emu(12192000)
    prs.slide_height = Emu(6858000)
    return prs


def blank_slide(prs):
    layout = prs.slide_layouts[6]
    s = prs.slides.add_slide(layout)
    for ph in list(s.placeholders):
        ph._element.getparent().remove(ph._element)
    return s


# ----------------------------------------------------------------------------
# assets / images
# ----------------------------------------------------------------------------
def asset_path(name):
    """Return the path of a binary asset shipped inside the repo (assets/<name>)."""
    path = os.path.join(ASSET_DIR, name)
    if not os.path.isfile(path):
        return None
    return path


def resolve_image(ref, base_dir=None):
    """ref may be: local path | http(s) url | 'asset:<name>' | None."""
    if not ref:
        return None
    ref = str(ref)
    if ref.startswith("asset:"):
        p = asset_path(ref[6:])
        if not p:
            warn("asset not found: %s" % ref)
        return p
    if ref.startswith("http://") or ref.startswith("https://"):
        try:
            try:
                from urllib.request import urlopen, Request
            except ImportError:  # pragma: no cover
                from urllib2 import urlopen, Request
            if not os.path.isdir(_TMP):
                os.makedirs(_TMP)
            ext = os.path.splitext(ref.split("?")[0])[1][:5] or ".img"
            dst = os.path.join(_TMP, hashlib.md5(ref.encode("utf8")).hexdigest() + ext)
            if not os.path.exists(dst):
                req = Request(ref, headers={"User-Agent": "Mozilla/5.0 deckkit"})
                data = urlopen(req, timeout=20).read()
                with open(dst, "wb") as f:
                    f.write(data)
            return dst
        except Exception as e:  # noqa
            warn("image download failed (%s): %s" % (ref, e))
            return None
    p = ref
    if not os.path.isabs(p) and base_dir:
        cand = os.path.join(base_dir, p)
        if os.path.exists(cand):
            p = cand
    if os.path.exists(p):
        return p
    warn("image not found: %s" % ref)
    return None


def image_size(path):
    try:
        from PIL import Image
        with Image.open(path) as im:
            return im.size
    except Exception:
        return None


def add_picture_cover(slide, path, x, y, w, h, geom=None, radius=None):
    """Add picture filling (x,y,w,h) with center-crop (object-fit: cover)."""
    pic = slide.shapes.add_picture(path, E(x), E(y), E(w), E(h))
    sz = image_size(path)
    if sz:
        iw, ih = sz
        box_r = float(w) / float(h)
        img_r = float(iw) / float(ih)
        if img_r > box_r:  # image wider -> crop left/right
            keep = box_r / img_r
            c = (1 - keep) / 2.0
            pic.crop_left = c
            pic.crop_right = c
        elif img_r < box_r:
            keep = img_r / box_r
            c = (1 - keep) / 2.0
            pic.crop_top = c
            pic.crop_bottom = c
    if geom:
        prst = pic._element.spPr.find(qn("a:prstGeom"))
        if prst is not None:
            prst.set("prst", geom)
            if radius is not None:
                av = prst.find(qn("a:avLst"))
                if av is None:
                    av = etree.SubElement(prst, qn("a:avLst"))
                gd = etree.SubElement(av, qn("a:gd"))
                gd.set("name", "adj")
                gd.set("fmla", "val %d" % int(radius))
    return pic


def add_picture_fit(slide, path, x, y, w, h, align="center"):
    """Add picture contained in box keeping aspect ratio (object-fit: contain)."""
    sz = image_size(path)
    if not sz:
        return slide.shapes.add_picture(path, E(x), E(y), E(w), E(h))
    iw, ih = sz
    r = min(float(w) / iw, float(h) / ih)
    pw, ph = iw * r, ih * r
    px = x + (w - pw) / 2.0 if align == "center" else (x if align == "left" else x + w - pw)
    py = y + (h - ph) / 2.0
    return slide.shapes.add_picture(path, E(px), E(py), E(pw), E(ph))


# ----------------------------------------------------------------------------
# fill / line XML helpers
# ----------------------------------------------------------------------------
def _spPr(shape):
    el = shape._element
    sp = el.find(qn("p:spPr"))
    if sp is None:
        sp = el.spPr
    return sp


def _clear_fill(spPr):
    for tag in ("a:noFill", "a:solidFill", "a:gradFill", "a:blipFill", "a:pattFill", "a:grpFill"):
        for n in spPr.findall(qn(tag)):
            spPr.remove(n)


def _insert_fill(spPr, node):
    # fill must come after prstGeom/custGeom and before a:ln
    ln = spPr.find(qn("a:ln"))
    if ln is not None:
        ln.addprevious(node)
    else:
        eff = spPr.find(qn("a:effectLst"))
        if eff is not None:
            eff.addprevious(node)
        else:
            spPr.append(node)


def _clr(parent, color, alpha=None, tag="a:srgbClr"):
    c = etree.SubElement(parent, qn(tag))
    c.set("val", hexc(color))
    if alpha is not None and float(alpha) < 1:
        a = etree.SubElement(c, qn("a:alpha"))
        a.set("val", str(int(round(float(alpha) * 100000))))
    return c


def fill_solid(shape, color, alpha=None):
    spPr = _spPr(shape)
    _clear_fill(spPr)
    sf = etree.Element(qn("a:solidFill"))
    _clr(sf, color, alpha)
    _insert_fill(spPr, sf)


def fill_none(shape):
    spPr = _spPr(shape)
    _clear_fill(spPr)
    _insert_fill(spPr, etree.Element(qn("a:noFill")))


def _grad_node(stops, angle=90, path=None, rot_with_shape=True):
    g = etree.Element(qn("a:gradFill"))
    g.set("rotWithShape", "1" if rot_with_shape else "0")
    lst = etree.SubElement(g, qn("a:gsLst"))
    for st in stops:
        pos, color = st[0], st[1]
        alpha = st[2] if len(st) > 2 else None
        gs = etree.SubElement(lst, qn("a:gs"))
        gs.set("pos", str(int(round(float(pos) * 1000))))
        _clr(gs, color, alpha)
    if path:
        p = etree.SubElement(g, qn("a:path"))
        p.set("path", path)  # circle | rect | shape
        f = etree.SubElement(p, qn("a:fillToRect"))
        cx, cy = (50, 50) if path is True or not isinstance(path, str) else (50, 50)
        f.set("l", "50000")
        f.set("t", "50000")
        f.set("r", "50000")
        f.set("b", "50000")
    else:
        lin = etree.SubElement(g, qn("a:lin"))
        lin.set("ang", str(int(round(float(angle) * 60000)) % 21600000))
        lin.set("scaled", "0")
    return g


def fill_grad(shape, stops, angle=90, path=None, focus=None):
    """stops: [(pos_percent 0-100, hex, alpha 0-1 optional), ...]
    angle: degrees, 0 = left->right, 90 = top->bottom.
    path: None | 'circle' | 'rect' for radial gradients. focus=(l,t,r,b) percents for fillToRect."""
    spPr = _spPr(shape)
    _clear_fill(spPr)
    g = _grad_node(stops, angle, path)
    if path and focus:
        ftr = g.find(qn("a:path")).find(qn("a:fillToRect"))
        for k, v in zip(("l", "t", "r", "b"), focus):
            ftr.set(k, str(int(v * 1000)))
    _insert_fill(spPr, g)


def line_set(shape, color=None, width=0.75, dash=None, alpha=None, head=None, tail=None, cap=None):
    """width in pt. dash: 'dash','sysDash','sysDot','lgDash'... head/tail: 'triangle','stealth','oval','arrow'."""
    spPr = _spPr(shape)
    ln = spPr.find(qn("a:ln"))
    if ln is None:
        ln = etree.SubElement(spPr, qn("a:ln"))
    for ch in list(ln):
        ln.remove(ch)
    if color is None:
        etree.SubElement(ln, qn("a:noFill"))
        return
    ln.set("w", str(int(round(float(width) * 12700))))
    if cap:
        ln.set("cap", cap)
    sf = etree.SubElement(ln, qn("a:solidFill"))
    _clr(sf, color, alpha)
    if dash:
        d = etree.SubElement(ln, qn("a:prstDash"))
        d.set("val", dash)
    if head:
        h = etree.SubElement(ln, qn("a:headEnd"))
        h.set("type", head)
        h.set("w", "med")
        h.set("len", "med")
    if tail:
        t = etree.SubElement(ln, qn("a:tailEnd"))
        t.set("type", tail)
        t.set("w", "med")
        t.set("len", "med")


def line_none(shape):
    line_set(shape, None)


def line_grad(shape, stops, width=1.0, angle=0):
    spPr = _spPr(shape)
    ln = spPr.find(qn("a:ln"))
    if ln is None:
        ln = etree.SubElement(spPr, qn("a:ln"))
    for ch in list(ln):
        ln.remove(ch)
    ln.set("w", str(int(round(float(width) * 12700))))
    ln.append(_grad_node(stops, angle))


def no_shadow(shape):
    spPr = _spPr(shape)
    if spPr.find(qn("a:effectLst")) is None:
        etree.SubElement(spPr, qn("a:effectLst"))


def effects(shape, glow=None, shadow=None, soft=None):
    """glow=(hex, radius_pt, alpha) ; shadow=(hex, blur_pt, dist_pt, dir_deg, alpha); soft=radius_pt"""
    spPr = _spPr(shape)
    old = spPr.find(qn("a:effectLst"))
    if old is not None:
        spPr.remove(old)
    eff = etree.SubElement(spPr, qn("a:effectLst"))
    if glow:
        g = etree.SubElement(eff, qn("a:glow"))
        g.set("rad", str(int(glow[1] * 12700)))
        _clr(g, glow[0], glow[2] if len(glow) > 2 else 0.4)
    if shadow:
        s = etree.SubElement(eff, qn("a:outerShdw"))
        s.set("blurRad", str(int(shadow[1] * 12700)))
        s.set("dist", str(int(shadow[2] * 12700)))
        s.set("dir", str(int(shadow[3] * 60000)))
        s.set("algn", "ctr")
        s.set("rotWithShape", "0")
        _clr(s, shadow[0], shadow[4] if len(shadow) > 4 else 0.35)
    if soft:
        s = etree.SubElement(eff, qn("a:softEdge"))
        s.set("rad", str(int(soft * 12700)))
    # effectLst must precede scene3d/sp3d; move if needed
    for tag in ("a:scene3d", "a:sp3d"):
        n = spPr.find(qn(tag))
        if n is not None:
            n.addprevious(eff)
            break


def camera_3d(shape, preset="perspectiveContrastingRightFacing", fov=None, rot=None):
    """Apply a 3D camera (perspective tilt) to a shape, PowerPoint renders it natively."""
    spPr = _spPr(shape)
    for tag in ("a:scene3d",):
        n = spPr.find(qn(tag))
        if n is not None:
            spPr.remove(n)
    sc = etree.SubElement(spPr, qn("a:scene3d"))
    cam = etree.SubElement(sc, qn("a:camera"))
    cam.set("prst", preset)
    if fov:
        cam.set("fov", str(int(fov * 60000)))
    if rot:
        r = etree.SubElement(cam, qn("a:rot"))
        r.set("lat", str(int(rot[0] * 60000)))
        r.set("lon", str(int(rot[1] * 60000)))
        r.set("rev", str(int(rot[2] * 60000)))
    lr = etree.SubElement(sc, qn("a:lightRig"))
    lr.set("rig", "threePt")
    lr.set("dir", "t")


def set_adj(shape, *vals):
    """Set preset geometry adjustments (raw values, e.g. 50000 = 50%)."""
    for i, v in enumerate(vals):
        if v is None:
            continue
        try:
            shape.adjustments[i] = float(v) / 100000.0
        except Exception:
            pass


def rotate(shape, deg):
    shape.rotation = float(deg)


# ----------------------------------------------------------------------------
# slide background
# ----------------------------------------------------------------------------
def _bg_pr(slide):
    cSld = slide._element.find(qn("p:cSld"))
    bg = cSld.find(qn("p:bg"))
    if bg is not None:
        cSld.remove(bg)
    bg = etree.Element(qn("p:bg"))
    cSld.insert(0, bg)
    bgPr = etree.SubElement(bg, qn("p:bgPr"))
    return bgPr


def bg_solid(slide, color):
    bgPr = _bg_pr(slide)
    sf = etree.SubElement(bgPr, qn("a:solidFill"))
    _clr(sf, color)
    etree.SubElement(bgPr, qn("a:effectLst"))


def bg_grad(slide, stops, angle=90, path=None):
    bgPr = _bg_pr(slide)
    bgPr.append(_grad_node(stops, angle, path))
    etree.SubElement(bgPr, qn("a:effectLst"))


# ----------------------------------------------------------------------------
# text measurement
# ----------------------------------------------------------------------------
_CJK = re.compile(u"[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f\u2460-\u24ff\u25a0-\u27bf]")


def char_w(ch):
    if _CJK.match(ch):
        return 1.0
    if ch == " ":
        return 0.28
    if ch in "il.,:;|!'`":
        return 0.28
    if ch in "mwMW":
        return 0.85
    if ch.isupper():
        return 0.66
    if ch.isdigit():
        return 0.56
    if ord(ch) > 0x2000:
        return 1.0
    return 0.52


def text_w_pt(s, size):
    return sum(char_w(c) for c in s) * float(size)


def count_lines(text, width_pt, size):
    if width_pt <= 0:
        return 99
    total = 0
    for para in str(text).split("\n"):
        if para == "":
            total += 1
            continue
        line_w = 0.0
        n = 1
        for ch in para:
            cw = char_w(ch) * size
            if line_w + cw > width_pt and line_w > 0:
                n += 1
                line_w = cw
            else:
                line_w += cw
        total += n
    return total


def fit_size(paras, w_in, h_in, size, min_size=7, spacing=1.18, ins=(0.04, 0.03), gap_pt=0):
    """Largest font size (step 0.5) <= size such that paragraphs fit (w,h)."""
    width_pt = (w_in - 2 * ins[0]) * 72.0
    height_pt = (h_in - 2 * ins[1]) * 72.0
    s = float(size)
    while s >= min_size:
        tot = 0.0
        for p in paras:
            ps = p.get("size_ratio", 1.0) * s if isinstance(p, dict) else s
            txt = p.get("text", "") if isinstance(p, dict) else p
            ind = 0.18 * 72 if (isinstance(p, dict) and p.get("bullet")) else 0
            tot += count_lines(strip_markup(txt), width_pt - ind, ps) * ps * spacing + gap_pt
        if tot <= height_pt:
            return s
        s -= 0.5
    warn("text may overflow (min size %.1f reached): %s" % (min_size, (strip_markup(paras[0]["text"] if isinstance(paras[0], dict) else paras[0]) if paras else "")[:30]))
    return float(min_size)


# ----------------------------------------------------------------------------
# rich text
# ----------------------------------------------------------------------------
_MARK = re.compile(r"(\*\*.+?\*\*|==.+?==|\{\{[0-9A-Fa-f]{6}\|.+?\}\})")


def strip_markup(s):
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", str(s))
    s = re.sub(r"==(.+?)==", r"\1", s)
    s = re.sub(r"\{\{[0-9A-Fa-f]{6}\|(.+?)\}\}", r"\1", s)
    return s


def parse_markup(s):
    """'**x**' -> bold+emphasis color, '==x==' -> highlight color (red), '{{RRGGBB|x}}' -> custom color."""
    out = []
    for part in _MARK.split(str(s)):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) > 4:
            out.append((part[2:-2], {"bold": True, "em": True}))
        elif part.startswith("==") and part.endswith("==") and len(part) > 4:
            out.append((part[2:-2], {"bold": True, "hl": True}))
        elif part.startswith("{{") and part.endswith("}}"):
            m = re.match(r"\{\{([0-9A-Fa-f]{6})\|(.+)\}\}", part)
            out.append((m.group(2), {"color": m.group(1)}))
        else:
            out.append((part, {}))
    return out


class Font(object):
    """Font context for a text box."""

    def __init__(self, face="微软雅黑", latin=None, size=12, color="333333", bold=False,
                 em_color=None, hl_color="2F62F5", italic=False):
        self.face = face
        self.latin = latin or face
        self.size = size
        self.color = color
        self.bold = bold
        self.em_color = em_color
        self.hl_color = hl_color
        self.italic = italic

    def copy(self, **kw):
        f = copy.copy(self)
        for k, v in kw.items():
            setattr(f, k, v)
        return f


def _apply_run(run, font, size, color, bold, italic=False, spacing=None, grad=None, outline=None, shadow=None):
    rPr = run._r.get_or_add_rPr()
    rPr.set("lang", "zh-CN")
    rPr.set("altLang", "en-US")
    rPr.set("sz", str(int(round(size * 100))))
    rPr.set("b", "1" if bold else "0")
    if italic:
        rPr.set("i", "1")
    if spacing is not None:
        rPr.set("spc", str(int(spacing * 100)))
    for ch in list(rPr):
        rPr.remove(ch)
    if outline:
        ln = etree.SubElement(rPr, qn("a:ln"))
        ln.set("w", str(int(outline[1] * 12700)))
        if len(outline) > 2 and outline[2]:
            ln.append(_grad_node(outline[2], 90))
        else:
            sf = etree.SubElement(ln, qn("a:solidFill"))
            _clr(sf, outline[0])
    if grad:
        rPr.append(_grad_node(grad[0], grad[1] if len(grad) > 1 else 90))
    elif color == "none":
        etree.SubElement(rPr, qn("a:noFill"))
    else:
        sf = etree.SubElement(rPr, qn("a:solidFill"))
        _clr(sf, color)
    if shadow:
        eff = etree.SubElement(rPr, qn("a:effectLst"))
        s = etree.SubElement(eff, qn("a:outerShdw"))
        s.set("blurRad", str(int(shadow[1] * 12700)))
        s.set("dist", str(int(shadow[2] * 12700)))
        s.set("dir", "5400000")
        s.set("algn", "ctr")
        s.set("rotWithShape", "0")
        _clr(s, shadow[0], shadow[3] if len(shadow) > 3 else 0.5)
    lat = etree.SubElement(rPr, qn("a:latin"))
    lat.set("typeface", font.latin)
    ea = etree.SubElement(rPr, qn("a:ea"))
    ea.set("typeface", font.face)
    cs = etree.SubElement(rPr, qn("a:cs"))
    cs.set("typeface", font.latin)


_ALIGN = {"left": PP_ALIGN.LEFT, "center": PP_ALIGN.CENTER, "right": PP_ALIGN.RIGHT, "justify": PP_ALIGN.JUSTIFY}
_ANCHOR = {"top": MSO_ANCHOR.TOP, "middle": MSO_ANCHOR.MIDDLE, "bottom": MSO_ANCHOR.BOTTOM}


def _bullet(p, char=u"\u2022", color=None, indent_in=0.16, level=0, size_pct=100):
    pPr = p._p.get_or_add_pPr()
    mar = indent_in * (level + 1)
    pPr.set("marL", str(E(mar)))
    pPr.set("indent", str(-E(indent_in)))
    for tag in ("a:buNone", "a:buChar", "a:buAutoNum", "a:buClr", "a:buSzPct", "a:buFont"):
        for n in pPr.findall(qn(tag)):
            pPr.remove(n)
    if color:
        bc = etree.SubElement(pPr, qn("a:buClr"))
        _clr(bc, color)
    bs = etree.SubElement(pPr, qn("a:buSzPct"))
    bs.set("val", str(int(size_pct * 1000)))
    bf = etree.SubElement(pPr, qn("a:buFont"))
    bf.set("typeface", "Arial")
    bu = etree.SubElement(pPr, qn("a:buChar"))
    bu.set("char", char)


def write_paras(tf, paras, font, align="left", spacing=1.15, space_after=0, fit=None):
    """paras: list of str | dict(text, size, color, bold, bullet, align, level, space_before, space_after, em_color)."""
    tf.word_wrap = True
    first = True
    expanded = []
    for p in paras:
        if not isinstance(p, dict):
            p = {"text": p}
        parts = str(p.get("text", "")).split("\n")
        for k, part in enumerate(parts):
            q = dict(p)
            q["text"] = part
            if k > 0:
                q.pop("space_before", None)
            expanded.append(q)
    for p in expanded:
        para = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        size = p.get("size") or font.size
        if fit is not None and not p.get("size"):
            size = fit * p.get("size_ratio", 1.0)
        para.alignment = _ALIGN.get(p.get("align", align), PP_ALIGN.LEFT)
        para.line_spacing = p.get("spacing", spacing)
        sa = p.get("space_after", space_after)
        if sa:
            para.space_after = Pt(sa)
        sb = p.get("space_before")
        if sb:
            para.space_before = Pt(sb)
        if p.get("bullet"):
            b = p.get("bullet")
            _bullet(para, char=b if isinstance(b, str) and len(b) == 1 else u"\u2022",
                    color=p.get("bullet_color") or font.em_color or font.color, level=p.get("level", 0))
        base_color = p.get("color", font.color)
        base_bold = p.get("bold", font.bold)
        for txt, st in parse_markup(p.get("text", "")):
            r = para.add_run()
            r.text = txt
            col = base_color
            bold = base_bold
            if st.get("em"):
                col = p.get("em_color") or font.em_color or base_color
                bold = True
            if st.get("hl"):
                col = font.hl_color
                bold = True
            if st.get("color"):
                col = st["color"]
            _apply_run(r, font, size, col, bold, italic=font.italic,
                       spacing=p.get("char_spacing"), grad=p.get("grad"), outline=p.get("outline"),
                       shadow=p.get("shadow"))
    return tf


def text(slide, x, y, w, h, content, font=None, size=None, color=None, bold=None, align="left",
         anchor="top", ins=(0.04, 0.03, 0.04, 0.03), spacing=1.15, autofit=True, min_size=7,
         wrap=True, space_after=0, name=None, rot=None, max_size=None):
    """Add a text box. content: str (\n = paragraphs) or list of paragraphs (see write_paras)."""
    font = (font or Font()).copy()
    if size is not None:
        font.size = size
    if color is not None:
        font.color = color
    if bold is not None:
        font.bold = bold
    if isinstance(content, (list, tuple)):
        paras = list(content)
    else:
        paras = str(content).split("\n")
    tb = slide.shapes.add_textbox(E(x), E(y), E(w), E(h))
    if name:
        tb.name = name
    tf = tb.text_frame
    tf.margin_left, tf.margin_top, tf.margin_right, tf.margin_bottom = [E(v) for v in (ins[0], ins[1], ins[2], ins[3])]
    tf.vertical_anchor = _ANCHOR.get(anchor, MSO_ANCHOR.TOP)
    bodyPr = tf._txBody.find(qn("a:bodyPr"))
    for n in list(bodyPr):
        bodyPr.remove(n)
    if not wrap:
        bodyPr.set("wrap", "none")
    fit = None
    if autofit and wrap:
        plist = [p if isinstance(p, dict) else {"text": p} for p in paras]
        explicit = all(isinstance(p, dict) and p.get("size") for p in plist)
        if not explicit:
            start = max(font.size, max_size or 0)
            fit = fit_size(plist, w, h, start, min_size=min_size, spacing=spacing,
                           ins=(ins[0], ins[1]), gap_pt=space_after)
            if fit == font.size or (fit > font.size and not max_size):
                fit = None
    write_paras(tf, paras, font, align=align, spacing=spacing, space_after=space_after, fit=fit)
    if not wrap:
        tf.word_wrap = False
    if rot:
        tb.rotation = rot
    return tb


# ----------------------------------------------------------------------------
# shapes
# ----------------------------------------------------------------------------
_SHAPES = {
    "rect": MSO_SHAPE.RECTANGLE,
    "round": MSO_SHAPE.ROUNDED_RECTANGLE,
    "round2": MSO_SHAPE.ROUND_2_SAME_RECTANGLE,
    "ellipse": MSO_SHAPE.OVAL,
    "hexagon": MSO_SHAPE.HEXAGON,
    "chevron": MSO_SHAPE.CHEVRON,
    "pentagon": MSO_SHAPE.PENTAGON,
    "parallelogram": MSO_SHAPE.PARALLELOGRAM,
    "trapezoid": MSO_SHAPE.TRAPEZOID,
    "diamond": MSO_SHAPE.DIAMOND,
    "triangle": MSO_SHAPE.ISOSCELES_TRIANGLE,
    "rtriangle": MSO_SHAPE.RIGHT_TRIANGLE,
    "can": MSO_SHAPE.CAN,
    "uparrow": MSO_SHAPE.UP_ARROW,
    "downarrow": MSO_SHAPE.DOWN_ARROW,
    "rightarrow": MSO_SHAPE.RIGHT_ARROW,
    "leftright": MSO_SHAPE.LEFT_RIGHT_ARROW,
    "updown": MSO_SHAPE.UP_DOWN_ARROW,
    "donut": MSO_SHAPE.DONUT,
    "arc": MSO_SHAPE.ARC,
    "blockarc": MSO_SHAPE.BLOCK_ARC,
    "plaque": MSO_SHAPE.PLAQUE,
    "snip": MSO_SHAPE.SNIP_1_RECTANGLE,
    "snip2": MSO_SHAPE.SNIP_2_DIAG_RECTANGLE,
    "flow_decision": MSO_SHAPE.FLOWCHART_DECISION,
    "flow_db": MSO_SHAPE.FLOWCHART_MAGNETIC_DISK,
    "flow_doc": MSO_SHAPE.FLOWCHART_DOCUMENT,
    "cube": MSO_SHAPE.CUBE,
    "circ_arrow": MSO_SHAPE.CIRCULAR_ARROW,
    "uturn": MSO_SHAPE.U_TURN_ARROW,
    "callout": MSO_SHAPE.ROUNDED_RECTANGULAR_CALLOUT,
    "star4": MSO_SHAPE.STAR_4_POINT,
    "star5": MSO_SHAPE.STAR_5_POINT,
    "gear": MSO_SHAPE.GEAR_6,
    "cloud": MSO_SHAPE.CLOUD,
    "bolt": MSO_SHAPE.LIGHTNING_BOLT,
    "sun": MSO_SHAPE.SUN,
    "heart": MSO_SHAPE.HEART,
    "moon": MSO_SHAPE.MOON,
    "teardrop": MSO_SHAPE.TEAR,
    "frame": MSO_SHAPE.FRAME,
    "corner": MSO_SHAPE.HALF_FRAME,
}


def shape(slide, kind, x, y, w, h, fill=None, line=None, line_w=0.75, dash=None, alpha=None,
          grad=None, grad_angle=90, grad_path=None, adj=None, text_content=None, font=None, size=None,
          color=None, bold=None, align="center", anchor="middle", ins=(0.04, 0.02, 0.04, 0.02),
          autofit=True, min_size=6.5, spacing=1.1, line_alpha=None, name=None, shadow=None, rot=None,
          space_after=0):
    """Generic autoshape with optional fill/gradient/line/text."""
    mso = _SHAPES.get(kind, MSO_SHAPE.RECTANGLE)
    shp = slide.shapes.add_shape(mso, E(x), E(y), E(w), E(h))
    if name:
        shp.name = name
    # remove theme style (avoid default blue fill + shadow)
    st = shp._element.find(qn("p:style"))
    if st is not None:
        shp._element.remove(st)
    if adj is not None:
        if not isinstance(adj, (list, tuple)):
            adj = [adj]
        set_adj(shp, *adj)
    if grad:
        fill_grad(shp, grad, grad_angle, grad_path)
    elif fill:
        fill_solid(shp, fill, alpha)
    else:
        fill_none(shp)
    if line:
        line_set(shp, line, line_w, dash, alpha=line_alpha)
    else:
        line_none(shp)
    if shadow:
        effects(shp, shadow=shadow)
    if rot:
        shp.rotation = rot
    tf = shp.text_frame
    tf.margin_left, tf.margin_top, tf.margin_right, tf.margin_bottom = [E(v) for v in (ins[0], ins[1], ins[2], ins[3])]
    tf.vertical_anchor = _ANCHOR.get(anchor, MSO_ANCHOR.MIDDLE)
    tf.word_wrap = True
    if text_content not in (None, ""):
        f = (font or Font()).copy()
        if size is not None:
            f.size = size
        if color is not None:
            f.color = color
        if bold is not None:
            f.bold = bold
        paras = list(text_content) if isinstance(text_content, (list, tuple)) else str(text_content).split("\n")
        fit = None
        if autofit:
            plist = [p if isinstance(p, dict) else {"text": p} for p in paras]
            fit = fit_size(plist, w, h, f.size, min_size=min_size, spacing=spacing, ins=(ins[0], ins[1]), gap_pt=space_after)
            if fit >= f.size:
                fit = None
        write_paras(tf, paras, f, align=align, spacing=spacing, fit=fit, space_after=space_after)
    return shp


def line(slide, x1, y1, x2, y2, color="999999", width=1.0, dash=None, head=None, tail=None, alpha=None,
         kind="straight", grad=None):
    ct = {"straight": MSO_CONNECTOR.STRAIGHT, "elbow": MSO_CONNECTOR.ELBOW, "curve": MSO_CONNECTOR.CURVE}[kind]
    c = slide.shapes.add_connector(ct, E(x1), E(y1), E(x2), E(y2))
    st = c._element.find(qn("p:style"))
    if st is not None:
        c._element.remove(st)
    if grad:
        line_grad(c, grad, width)
    else:
        line_set(c, color, width, dash, alpha=alpha, head=head, tail=tail)
    return c


def polyline(slide, pts, color="FFFFFF", width=1.25, close=False, fill=None, alpha=None, cap="rnd"):
    """pts in inches [(x,y),...]"""
    if len(pts) < 2:
        return None
    scale = 10000.0
    fb = slide.shapes.build_freeform(int(pts[0][0] * scale), int(pts[0][1] * scale), scale=EMU_IN / scale)
    fb.add_line_segments([(int(px * scale), int(py * scale)) for (px, py) in pts[1:]], close=close)
    shp = fb.convert_to_shape()
    st = shp._element.find(qn("p:style"))
    if st is not None:
        shp._element.remove(st)
    if fill:
        fill_solid(shp, fill, alpha)
    else:
        fill_none(shp)
    if color:
        line_set(shp, color, width, cap=cap)
    else:
        line_none(shp)
    return shp


def arc_pts(cx, cy, r, a0, a1, n=18):
    """points on a circle arc; angles in degrees, 0 = east, counter-clockwise visually (y down)."""
    pts = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / float(n))
        pts.append((cx + r * math.cos(a), cy - r * math.sin(a)))
    return pts


def group(slide, shapes_list):
    """Group already-created shapes (python-pptx >= 0.6.22); silently no-op otherwise."""
    try:
        grp = slide.shapes.add_group_shape(shapes_list)
        return grp
    except Exception:
        return None


def send_to_back(slide, shp):
    tree = slide.shapes._spTree
    el = shp._element
    tree.remove(el)
    tree.insert(2, el)
