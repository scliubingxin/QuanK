# -*- coding: utf-8 -*-
"""Theme `report` - light solution-report style.

Re-creates the visual grammar of the sample deck "QuanK 基于大模型的知识管理体系与平台项目 详细方案报告 V3.3":
  * soft radial blue-grey page background, orange corner tag, 24pt numbered title, logo + security label top-right
  * section header bars (top-rounded, solid colour, white 10.5pt bold) over tinted rounded panels
  * numbered step cards with arrows, pill pipelines (①②③), layered architecture with dashed containers,
    swim-lanes, closed-loop lifecycle, hierarchy columns, KPI cards, tables, screenshots with captions
  * photo based cover / TOC / PART divider / THANKS pages
Geometry measured from the sample (EMU -> inch).
"""
from __future__ import division
import math
from . import core as C
from .icons import draw_icon

# main, tint, border
PALETTE = {
    "blue": ("4080FF", "E8F3FF", "B0CCFF"),
    "arco": ("165DFF", "E8F3FF", "94BFFF"),
    "navy": ("163AD3", "E8EEFF", "9DB4FF"),
    "steel": ("5B9BD5", "E8F4FF", "B3D9FF"),
    "orange": ("E87722", "FFF2E8", "FFD8BF"),
    "amber": ("FA8C16", "FFF7E6", "FFD591"),
    "red": ("C8102E", "FFECE8", "FDCDC5"),
    "brand": ("2F62F5", "EEF2FF", "B4C6FF"),
    "green": ("00B42A", "E8FFEA", "AFF0B5"),
    "lime": ("52C41A", "F6FFED", "B7EB8F"),
    "purple": ("722ED1", "F9F0FF", "D3ADF7"),
    "gold": ("CC9900", "FFF7E6", "FFE58F"),
    "cyan": ("0FC6C2", "E8FFFB", "86E8DD"),
    "gray": ("4E5969", "F2F3F5", "C9CDD4"),
    "dark": ("1D2129", "F2F3F5", "C9CDD4"),
}
CYCLE = ["blue", "orange", "green", "purple", "steel", "red", "gold", "cyan"]
TXT = "333333"
TXT2 = "666666"
CAP = "595959"
MUTED = "86909C"
GAP = 0.16


def cset(c, i=0):
    """colour spec -> (main, tint, border). accepts palette name, hex, or None (cycled)."""
    if c is None:
        c = CYCLE[i % len(CYCLE)]
    if isinstance(c, (list, tuple)):
        return tuple(C.hexc(x) for x in c)
    if c in PALETTE:
        return PALETTE[c]
    h = C.hexc(c, "4080FF")
    return (h, C.mix(h, "FFFFFF", 0.90), C.mix(h, "FFFFFF", 0.62))


def _lines(item):
    """normalise item text -> list of paragraphs"""
    if item is None:
        return []
    if isinstance(item, (list, tuple)):
        return list(item)
    return str(item).split("\n")


class ReportTheme(object):
    name = "report"

    def __init__(self, brand, base_dir=None):
        self.b = brand
        self.base_dir = base_dir
        self.font = C.Font(face=brand.get("font", u"微软雅黑"), latin=brand.get("latin_font"), size=9, color=TXT)
        self.page = 0

    # ------------------------------------------------------------------ utils
    def F(self, **kw):
        return self.font.copy(**kw)

    def img(self, ref):
        return C.resolve_image(ref, self.base_dir)

    def logo(self, variant="red"):
        custom = self.b.get("logo_" + variant) or (self.b.get("logo") if variant == "red" else None)
        if custom == "none" or self.b.get("logo") == "none":
            return None
        if custom:
            return self.img(custom)
        return C.asset_path("quank_logo.png")

    # ------------------------------------------------------------------ chrome
    def page_bg(self, s):
        C.bg_grad(s, [(0, "F8FCFF"), (55, "F1F6FB"), (100, "E6ECF3")], path="circle")

    def chrome(self, s, title, page_no=True):
        self.page_bg(s)
        tag = self.b.get("tag", "")
        if tag:
            C.shape(s, "rect", 0, 0, 0.329, 0.26, fill="ED7D31", text_content=tag, font=self.F(), size=7,
                    color="FFFFFF", autofit=False, ins=(0, 0, 0, 0))
        if title:
            paras = self._title_runs(title)
            C.text(s, 0.234, 0.126, 10.2, 0.52, [paras], font=self.F(size=24, color="000000"),
                   autofit=True, min_size=16, ins=(0.04, 0.02, 0.04, 0.02), anchor="middle", name="Title")
        lg = self.logo("red")
        if lg:
            C.add_picture_fit(s, lg, 11.62, 0.115, 0.62, 0.25, align="left")
        sec = self.b.get("security_label", u"")
        if sec:
            C.text(s, 12.21, 0.085, 1.10, 0.32, sec, font=self.F(size=12, color="FF0000", bold=True),
                   autofit=False, wrap=False, ins=(0, 0, 0, 0), anchor="middle")
        if page_no and self.b.get("page_numbers", True):
            C.text(s, 12.35, 7.13, 0.8, 0.25, str(self.page), font=self.F(size=9, color=MUTED), align="right",
                   autofit=False, ins=(0, 0, 0, 0))
        foot = self.b.get("footer")
        if foot:
            C.text(s, 0.35, 7.13, 6, 0.25, foot, font=self.F(size=8, color=MUTED), autofit=False, ins=(0, 0, 0, 0))

    def _title_runs(self, title):
        """'2.3 知识管理：质量评审' -> number / main black, subtitle after colon 333333"""
        t = str(title)
        parts = t.split(u"：", 1)
        if len(parts) == 2:
            return {"text": parts[0] + u"：" + "{{333333|%s}}" % parts[1]}
        return {"text": t}

    def lead(self, s, text_, y=0.70):
        C.text(s, 0.30, y, 12.70, 0.34, [{"text": text_}], font=self.F(size=12, color=TXT, bold=True),
               min_size=9, anchor="middle")

    # ------------------------------------------------------------------ pages
    def render(self, prs, spec):
        lay = spec.get("layout", "content")
        s = C.blank_slide(prs)
        self.page += 1
        fn = getattr(self, "page_" + lay, None)
        if fn is None:
            C.warn("unknown report layout '%s', rendered as content" % lay)
            fn = self.page_content
        fn(s, spec)
        if spec.get("notes"):
            s.notes_slide.notes_text_frame.text = spec["notes"]
        return s

    def _bracket(self, s, x, y, w, h, color="FFFFFF", wpt=3):
        # white open frame like the "目录 CONTENTS" bracket (gap on the right side)
        C.line(s, x, y, x + w, y, color=color, width=wpt)
        C.line(s, x, y + h, x + w, y + h, color=color, width=wpt)
        C.line(s, x, y, x, y + h, color=color, width=wpt)
        C.line(s, x + w, y, x + w, y + h * 0.25, color=color, width=wpt)
        C.line(s, x + w, y + h * 0.75, x + w, y + h, color=color, width=wpt)

    def page_cover(self, s, d):
        # QuanK brand-native cover: blue gradient + translucent panels, no third-party photos.
        C.bg_grad(s, [(0, "F5F8FF"), (45, "E3ECFF"), (100, "C9D8FF")], path="circle")
        C.shape(s, "rect", 0, 0, 5.55, 7.5, grad=[(0, "0B2BA6"), (60, "2F62F5"), (100, "5A8DFF")], grad_angle=115)
        C.shape(s, "rect", 4.95, 0, 0.10, 7.5, fill="8C7CFF", alpha=0.65)
        self._bracket(s, 0.60, 0.85, 1.40, 2.85, color="FFFFFF", wpt=2.5)
        C.text(s, 0.95, 1.55, 3.9, 0.62, d.get("kicker", u"方 案 汇 报"), font=self.F(size=26, color="FFFFFF"),
               autofit=False, wrap=False, ins=(0, 0, 0, 0))
        C.text(s, 0.95, 2.20, 4.6, 0.40, d.get("kicker_en", "QUANK SOLUTION REPORT"), font=self.F(size=14, color="C7D2FE"),
               autofit=False, wrap=False, ins=(0, 0, 0, 0))
        C.shape(s, "round", 6.72, 1.82, 6.02, 4.62, fill="FFFFFF", alpha=0.88, line="DCE3F5", line_w=1, adj=[5000])
        C.text(s, 7.02, 2.08, 5.45, 1.62, [{"text": d.get("title", "")}], font=self.F(size=30, color="14213D", bold=True),
               min_size=20, anchor="bottom", spacing=1.12)
        if d.get("subtitle"):
            C.text(s, 7.04, 3.82, 5.45, 0.72, [{"text": d["subtitle"]}], font=self.F(size=15, color="6B7599"), min_size=11)
        C.line(s, 7.04, 4.72, 9.24, 4.72, color="DCE3F5", width=0.75)
        C.line(s, 7.04, 4.72, 7.60, 4.72, color="2F62F5", width=2.0)
        meta = d.get("meta")
        if meta:
            if not isinstance(meta, (list, tuple)):
                meta = [meta]
            C.text(s, 7.04, 4.94, 5.45, 1.22, [{"text": m} for m in meta], font=self.F(size=12, color="4E5969"),
                   spacing=1.35, min_size=9)
        C.shape(s, "rect", 11.35, 0.40, 1.48, 0.56, fill="2F62F5")
        lg = C.asset_path("quank_logo.png")
        if lg:
            C.add_picture_fit(s, lg, 11.42, 0.46, 0.44, 0.44, align="left")
        C.text(s, 0.92, 6.92, 4.6, 0.34, u"QuanK · 仅供研究，不构成投资建议", font=self.F(size=9, color="C7D2FE"),
               autofit=False, ins=(0, 0, 0, 0))
        sec = self.b.get("security_label", "")
        if sec:
            C.text(s, 11.30, 7.0, 1.8, 0.3, sec, font=self.F(size=11, color="FF4D4F", bold=True), align="right",
                   autofit=False, ins=(0, 0, 0, 0))

    def page_toc(self, s, d):
        C.bg_grad(s, [(0, "F5F8FF"), (45, "E3ECFF"), (100, "C9D8FF")], path="circle")
        C.shape(s, "rect", 0, 0, 6.05, 7.5, grad=[(0, "0B2BA6"), (65, "2F62F5"), (100, "5A8DFF")], grad_angle=115)
        C.shape(s, "rect", 5.50, 0, 0.10, 7.5, fill="8C7CFF", alpha=0.65)
        self._bracket(s, 0.60, 0.85, 1.386, 2.868, color="FFFFFF", wpt=2.5)
        C.text(s, 0.95, 1.60, 3.0, 0.75, u"目 录", font=self.F(size=36, color="FFFFFF"), autofit=False, wrap=False,
               ins=(0, 0, 0, 0))
        C.text(s, 0.95, 2.36, 4.6, 0.45, "CONTENTS", font=self.F(size=20, color="C7D2FE"), autofit=False, wrap=False,
               ins=(0, 0, 0, 0))
        lg = C.asset_path("quank_logo.png")
        if lg:
            C.add_picture_fit(s, lg, 11.62, 0.115, 0.36, 0.36, align="left")
        items = d.get("items", [])
        paras = []
        for it in items:
            if not isinstance(it, dict):
                txt = str(it)
                lvl = 2 if (len(txt) > 1 and txt[0].isdigit() and "." in txt[:4]) else 1
                it = {"text": txt, "level": lvl}
            lvl = it.get("level", 1)
            paras.append({"text": it["text"], "bold": lvl == 1, "color": "14213D" if lvl == 1 else "333333",
                          "size_ratio": 1.0 if lvl == 1 else 0.93, "space_before": 6 if lvl == 1 and paras else 0})
        two = len(paras) > 20
        if two:
            half = (len(paras) + 1) // 2
            cols = [paras[:half], paras[half:]]
            for i, ps in enumerate(cols):
                C.text(s, 6.95 + i * 3.05, 0.75, 2.95, 6.1, ps, font=self.F(size=13), spacing=1.5, min_size=8, anchor="middle")
        else:
            C.text(s, 7.47, 0.67, 5.36, 6.0, paras, font=self.F(size=14), spacing=1.55, min_size=9, anchor="middle")

    def page_part(self, s, d):
        # Native-gradient part divider (no photographic background).
        C.bg_grad(s, [(0, "0B2BA6"), (55, "163AD3"), (100, "060B1C")], 115)
        C.shape(s, "rect", 0, 0, 9.258, 7.5, grad=[(0, "0B2BA6", 0.0), (48, "060B1C", 0.28), (100, "000000", 0.55)], grad_angle=180)
        C.shape(s, "rect", 8.90, 0, 0.09, 7.5, fill="8C7CFF", alpha=0.55)
        no = str(d.get("no", d.get("number", 1)))
        C.text(s, 1.338, 2.781, 3.47, 1.58, [{"text": "PART", "grad": ([(0, "FFFFFF", 0.5), (82, "FFFFFF", 0.0)], 90)}],
               font=self.F(size=88, bold=True), autofit=False, wrap=False, ins=(0.1, 0.05, 0.1, 0.05))
        C.text(s, 1.244, 2.538, 3.13, 2.42, [{"text": no}], font=self.F(size=138, bold=True, color="8C7CFF"),
               autofit=False, wrap=False, ins=(0.1, 0.05, 0.1, 0.05))
        C.text(s, 2.558, 3.572, 7.0, 0.64, [{"text": d.get("title", "")}], font=self.F(size=32, bold=True, color="FFFFFF"),
               min_size=20, wrap=True, ins=(0.1, 0.05, 0.1, 0.05))
        en = d.get("en") or ("PART " + _num_en(no))
        C.text(s, 2.558, 4.218, 4.0, 0.34, en, font=self.F(size=14, color="C7D2FE"), autofit=False, wrap=False,
               ins=(0.1, 0.08, 0.1, 0.02))
        C.line(s, 2.684, 4.214, 4.534, 4.214, color="C7D2FE", width=0.75)
        C.line(s, 2.684, 4.214, 3.08, 4.214, color="8C7CFF", width=1.5)
        if d.get("subtitle"):
            C.text(s, 2.558, 4.62, 6.4, 0.8, [{"text": d["subtitle"]}], font=self.F(size=13, color="E5E6EB"), min_size=10)

    def page_thanks(self, s, d):
        C.bg_grad(s, [(0, "0B2BA6"), (45, "101A38"), (100, "02060F")], 90)
        C.shape(s, "ellipse", 7.4, -2.4, 9.0, 8.0, grad=[(0, "2F62F5", 0.30), (60, "2F62F5", 0.04), (100, "2F62F5", 0.0)],
                grad_path="circle")
        C.shape(s, "rect", 12.62, 0, 0.10, 7.5, fill="8C7CFF", alpha=0.55)
        lg = C.asset_path("quank_logo.png")
        if lg:
            C.add_picture_fit(s, lg, 0.70, 0.323, 0.50, 0.50, align="left")
        sec = self.b.get("security_label", "")
        if sec:
            C.text(s, 11.6, 0.12, 1.6, 0.3, sec, font=self.F(size=10, color="FF4D4F", bold=True), align="right",
                   autofit=False, ins=(0, 0, 0, 0))
        C.text(s, 8.62, 5.61, 4.3, 1.11, [{"text": d.get("text", "THANKS"), "shadow": ("000000", 2, 2, 0.3)}],
               font=self.F(size=58, color="FFFFFF"), autofit=False, wrap=False, ins=(0.1, 0.05, 0.1, 0.05))
        C.line(s, 9.184, 6.724, 12.40, 6.724, color="FFFFFF", width=1.0)
        C.line(s, 9.184, 6.724, 10.87, 6.724, color="8C7CFF", width=1.5)
        if d.get("subtitle"):
            C.text(s, 9.02, 6.80, 4.0, 0.4, d["subtitle"], font=self.F(size=11, color="E5E6EB"), autofit=False,
                   ins=(0.1, 0.02, 0.1, 0.02))

    def page_content(self, s, d):
        self.chrome(s, d.get("title", ""))
        y0 = 0.80
        if d.get("lead"):
            self.lead(s, d["lead"], y=0.70)
            y0 = 1.12
        body = d.get("body")
        if body is None:
            blocks = d.get("blocks", [])
            body = {"type": "col", "items": blocks} if len(blocks) != 1 else blocks[0]
        x, w = 0.32, 12.68
        bottom = 7.08 if self.b.get("page_numbers", True) else 7.22
        self.block(s, body, x, y0, w, bottom - y0)

    # image-only content page (e.g. full screenshot / exported diagram)
    def page_image(self, s, d):
        self.chrome(s, d.get("title", ""))
        y0 = 0.80
        if d.get("lead"):
            self.lead(s, d["lead"])
            y0 = 1.12
        self.b_image(s, d, 0.32, y0, 12.68, 7.05 - y0)

    # ------------------------------------------------------------------ blocks
    def block(self, s, b, x, y, w, h):
        if b is None:
            return
        if isinstance(b, (str,)):
            b = {"type": "text", "text": b}
        t = b.get("type", "text")
        fn = getattr(self, "b_" + t, None)
        if fn is None:
            C.warn("unknown block type '%s'" % t)
            return
        if b.get("frame"):  # optional big light container like sample (FAFAFA + D9D9D9)
            C.shape(s, "round", x, y, w, h, fill="FAFAFA", line="D9D9D9", line_w=1, adj=[3000])
            pad = 0.12
            if b.get("frame_title"):
                C.text(s, x + 0.15, y + 0.06, w - 0.3, 0.3, [{"text": b["frame_title"]}],
                       font=self.F(size=12, bold=True, color=TXT), autofit=True, anchor="middle")
                x, y, w, h = x + pad, y + 0.40, w - 2 * pad, h - 0.40 - pad
            else:
                x, y, w, h = x + pad, y + pad, w - 2 * pad, h - 2 * pad
        fn(s, b, x, y, w, h)

    def _split(self, items, total, gap, key):
        ws = [float(it.get(key, 1)) if isinstance(it, dict) else 1.0 for it in items]
        avail = total - gap * (len(items) - 1)
        sw = sum(ws) or 1
        return [avail * v / sw for v in ws]

    def b_row(self, s, b, x, y, w, h):
        items = b.get("items", [])
        if not items:
            return
        gap = b.get("gap", GAP + 0.04)
        ws = self._split(items, w, gap, "w")
        cx = x
        for it, iw in zip(items, ws):
            self.block(s, it, cx, y, iw, h)
            if b.get("arrows") and it is not items[-1]:
                ay = y + h / 2.0
                C.shape(s, "rightarrow", cx + iw + gap * 0.18, ay - 0.12, gap * 0.64, 0.24, fill=b.get("arrow_color", "4080FF"))
            cx += iw + gap

    def b_col(self, s, b, x, y, w, h):
        items = b.get("items", [])
        if not items:
            return
        gap = b.get("gap", GAP)
        hs = self._split(items, h, gap, "h")
        cy = y
        for it, ih in zip(items, hs):
            self.block(s, it, x, cy, w, ih)
            if b.get("arrows") and it is not items[-1]:
                C.shape(s, "downarrow", x + w / 2 - 0.13, cy + ih + gap * 0.12, 0.26, gap * 0.76, fill=b.get("arrow_color", "C00000"))
            cy += ih + gap

    # -- header bar (top-rounded) -------------------------------------------
    def header_bar(self, s, x, y, w, title, color, h=0.29, icon=None, size=10.5, align="center", number=None):
        main = cset(color)[0]
        C.shape(s, "round2", x, y, w, h, fill=main, adj=[22000, 0])
        tx = x
        tw = w
        if icon:
            draw_icon(s, icon, x + 0.20, y + h / 2, h * 0.62, "FFFFFF", 1.0)
            tx, tw = x + 0.34, w - 0.40
        if number is not None:
            C.shape(s, "ellipse", x + 0.08, y + (h - 0.2) / 2, 0.2, 0.2, fill="FFFFFF", text_content=str(number),
                    font=self.F(), size=8, color=main, bold=True, autofit=False, ins=(0, 0, 0, 0))
            tx, tw = x + 0.32, w - 0.36
        C.text(s, tx, y, tw, h, [{"text": title}], font=self.F(size=size, bold=True, color="FFFFFF"), align=align,
               anchor="middle", min_size=7.5, ins=(0.05, 0, 0.05, 0))

    def bullets_box(self, s, x, y, w, h, items, color, size=9, bullet=True, anchor="top", align="left", spacing=1.25, grow=True):
        main = cset(color)[0]
        paras = []
        for it in items or []:
            if isinstance(it, dict):
                tt = it.get("title")
                tx = it.get("text", "")
                txt = ("**%s** %s" % (tt, tx)) if tt else tx
                paras.append({"text": txt, "bullet": bullet and it.get("bullet", True)})
            else:
                paras.append({"text": str(it), "bullet": bullet})
        if not paras:
            return
        C.text(s, x, y, w, h, paras, font=self.F(size=size, color=TXT, em_color=main), spacing=spacing,
               anchor=anchor, align=align, min_size=6.5, space_after=2,
               max_size=(min(12.0, size * 1.3) if grow and self.b.get("auto_grow", True) else None))

    # -- panel ---------------------------------------------------------------
    def b_panel(self, s, b, x, y, w, h):
        main, tint, border = cset(b.get("color"), b.get("_i", 0))
        style = b.get("style", "tint")
        hh = 0.29 if b.get("title") else 0
        body_fill = {"tint": tint, "white": "FFFFFF", "plain": None, "gray": "F7F8FA"}.get(style, tint)
        body_line = border if style != "plain" else None
        C.shape(s, "round", x, y, w, h, fill=body_fill, line=body_line, line_w=1.0, adj=[min(6000, int(0.08 / max(0.3, min(w, h)) * 100000))])
        if b.get("title"):
            self.header_bar(s, x, y, w, b["title"], main, h=hh, icon=b.get("icon"), align=b.get("title_align", "center"),
                            number=b.get("number"))
        ix, iy, iw, ih = x + 0.12, y + hh + 0.08, w - 0.24, h - hh - 0.14
        if b.get("subtitle"):
            C.text(s, ix, iy, iw, 0.26, [{"text": b["subtitle"]}], font=self.F(size=10, bold=True, color=main), anchor="middle")
            iy += 0.28
            ih -= 0.28
        if b.get("content"):
            self.block(s, b["content"], ix, iy, iw, ih)
        elif b.get("items") is not None:
            self.bullets_box(s, ix, iy, iw, ih, b["items"], main, size=b.get("size", 9), bullet=b.get("bullet", True),
                             anchor=b.get("anchor", "top"))
        elif b.get("text"):
            C.text(s, ix, iy, iw, ih, _lines(b["text"]), font=self.F(size=b.get("size", 9), em_color=main), spacing=1.3,
                   anchor=b.get("anchor", "top"), max_size=min(12.0, b.get("size", 9) * 1.3))

    def b_section(self, s, b, x, y, w, h):
        """thin header bar only (used as group title)"""
        self.header_bar(s, x, y, w, b.get("title", ""), b.get("color", "orange"), h=min(h, 0.29), icon=b.get("icon"))

    # -- steps (numbered cards + arrows) -------------------------------------
    def b_steps(self, s, b, x, y, w, h):
        items = b.get("items", [])
        n = len(items)
        if not n:
            return
        if b.get("title"):
            self.header_bar(s, x, y, w, b["title"], b.get("color", "orange"))
            y += 0.37
            h -= 0.37
        gap = b.get("gap", 0.17)
        cw = (w - gap * (n - 1)) / n
        for i, it in enumerate(items):
            it = it if isinstance(it, dict) else {"title": str(it)}
            colr = it.get("color") or b.get("color") or "orange"
            if b.get("last_color") and i == n - 1 and not it.get("color"):
                colr = b["last_color"]
            main, tint, border = cset(colr, i)
            cx = x + i * (cw + gap)
            C.shape(s, "round", cx, y, cw, h, fill=tint, line=border, line_w=1.0, adj=[6000])
            d = 0.29
            C.shape(s, "ellipse", cx + 0.08, y + 0.07, d, d, fill=main, text_content=str(it.get("no", i + 1)),
                    font=self.F(), size=10.5, color="FFFFFF", autofit=False, ins=(0, 0, 0, 0))
            paras = [{"text": it.get("title", ""), "bold": True, "color": main, "size_ratio": 1.08}]
            for ln in _lines(it.get("lines", it.get("text"))):
                paras.append({"text": ln, "color": TXT2})
            tx = cx + 0.43
            C.text(s, tx, y + 0.05, cw - 0.48, h - 0.10, paras, font=self.F(size=b.get("size", 9.5)), spacing=1.2,
                   min_size=6.5, max_size=min(12.0, b.get("size", 9.5) * 1.3))
            if i < n - 1:
                C.line(s, cx + cw + 0.01, y + h / 2, cx + cw + gap - 0.01, y + h / 2, color=main, width=2.0, tail="triangle")

    # -- pipeline (pills ①②③ + optional detail cards) -----------------------
    def b_pipeline(self, s, b, x, y, w, h):
        items = b.get("items", [])
        n = len(items)
        if not n:
            return
        gap = b.get("gap", 0.30)
        pw = (w - gap * (n - 1)) / n
        ph = 0.30
        main = cset(b.get("color", "blue"))[0]
        hl = cset(b.get("highlight_color", "amber"))[0]
        nums = u"①②③④⑤⑥⑦⑧⑨⑩"
        has_detail = any(isinstance(it, dict) and (it.get("items") or it.get("text") or it.get("content")) for it in items)
        for i, it in enumerate(items):
            it = it if isinstance(it, dict) else {"title": str(it)}
            px = x + i * (pw + gap)
            last = (i == n - 1 and b.get("highlight_last", True)) or it.get("highlight")
            col = cset(it.get("color"))[0] if it.get("color") else (hl if last else main)
            label = (nums[i] + " " if b.get("numbered", True) and i < 10 else "") + it.get("title", "")
            C.shape(s, "round", px, y, pw, ph, fill=col, adj=[50000], text_content=[{"text": label}], font=self.F(),
                    size=11, color="FFFFFF", bold=True, min_size=7)
            if i < n - 1:
                C.line(s, px + pw, y + ph / 2, px + pw + gap, y + ph / 2, color=main, width=1.2, tail="triangle")
            if has_detail:
                dy = y + ph + 0.18
                dh = h - ph - 0.18
                if it.get("content"):
                    self.block(s, it["content"], px, dy, pw, dh)
                else:
                    self.b_panel(s, {"title": it.get("detail_title", it.get("system", it.get("title", ""))),
                                     "items": it.get("items") or _lines(it.get("text")), "color": col,
                                     "style": "white", "icon": it.get("icon"), "size": b.get("size", 8.5)},
                                 px, dy, pw, dh)

    # -- cards grid ----------------------------------------------------------
    def b_cards(self, s, b, x, y, w, h):
        items = b.get("items", [])
        n = len(items)
        if not n:
            return
        cols = int(b.get("cols", min(n, 4)))
        rows = int(math.ceil(n / float(cols)))
        gx, gy = b.get("gap", 0.16), b.get("gap_y", 0.16)
        cw = (w - gx * (cols - 1)) / cols
        ch = (h - gy * (rows - 1)) / rows
        style = b.get("style", "header")
        for i, it in enumerate(items):
            it = it if isinstance(it, dict) else {"title": str(it)}
            r, c = divmod(i, cols)
            cx, cy = x + c * (cw + gx), y + r * (ch + gy)
            colr = it.get("color") or b.get("color")
            main, tint, border = cset(colr, i if not b.get("color") else 0)
            body = it.get("items") or _lines(it.get("text"))
            if style == "header":
                self.b_panel(s, {"title": it.get("title", ""), "items": body, "color": main, "style": b.get("body", "white"),
                                 "icon": it.get("icon"), "size": b.get("size", 9), "number": it.get("number"),
                                 "content": it.get("content")}, cx, cy, cw, ch)
            elif style == "icon":  # icon on top, centred (pilot-strategy style)
                isz = min(0.62, ch * 0.3)
                draw_icon(s, it.get("icon", "target"), cx + cw / 2, cy + isz / 2 + 0.05, isz, main, 2.0)
                C.text(s, cx, cy + isz + 0.15, cw, 0.36, [{"text": it.get("title", "")}],
                       font=self.F(size=14, color="595959"), align="center", anchor="middle")
                C.line(s, cx + cw * 0.2, cy + isz + 0.55, cx + cw * 0.8, cy + isz + 0.55, color="D9D9D9", width=0.75)
                self.bullets_box(s, cx + 0.05, cy + isz + 0.62, cw - 0.1, ch - isz - 0.65, body, main, size=b.get("size", 10))
            else:  # tint card with icon circle
                C.shape(s, "round", cx, cy, cw, ch, fill=tint, line=border, line_w=1.0, adj=[6000])
                d = 0.42
                C.shape(s, "ellipse", cx + 0.12, cy + 0.12, d, d, fill=main)
                if it.get("icon"):
                    draw_icon(s, it["icon"], cx + 0.12 + d / 2, cy + 0.12 + d / 2, d * 0.62, "FFFFFF", 1.1)
                else:
                    C.text(s, cx + 0.12, cy + 0.12, d, d, str(i + 1), font=self.F(size=12, bold=True, color="FFFFFF"),
                           align="center", anchor="middle", autofit=False, ins=(0, 0, 0, 0))
                C.text(s, cx + 0.62, cy + 0.12, cw - 0.70, d, [{"text": it.get("title", "")}],
                       font=self.F(size=11, bold=True, color=main), anchor="middle", min_size=8)
                self.bullets_box(s, cx + 0.12, cy + 0.62, cw - 0.22, ch - 0.70, body, main, size=b.get("size", 9))

    # -- generic text / bullets ---------------------------------------------
    def b_text(self, s, b, x, y, w, h):
        main = cset(b.get("color", "blue"))[0]
        paras = _lines(b.get("text", ""))
        C.text(s, x, y, w, h, [{"text": p} for p in paras], font=self.F(size=b.get("size", 10.5), em_color=main,
               bold=b.get("bold", False), color=b.get("text_color", TXT)), align=b.get("align", "left"),
               anchor=b.get("anchor", "top"), spacing=b.get("spacing", 1.35), min_size=7)

    def b_bullets(self, s, b, x, y, w, h):
        main = cset(b.get("color", "blue"))[0]
        if b.get("title"):
            C.text(s, x, y, w, 0.3, [{"text": b["title"]}], font=self.F(size=11, bold=True, color=main), anchor="middle")
            y += 0.32
            h -= 0.32
        self.bullets_box(s, x, y, w, h, b.get("items", []), main, size=b.get("size", 10.5), spacing=1.35)

    def b_note(self, s, b, x, y, w, h):
        main = cset(b.get("color", "brand"))[0]
        C.shape(s, "rect", x, y, w, h, fill="FFFFFF", line=main, line_w=1.0)
        paras = []
        if b.get("title"):
            paras.append({"text": u"【%s】" % b["title"], "bold": True, "color": "000000"})
        paras += [{"text": t} for t in _lines(b.get("text"))]
        C.text(s, x + 0.08, y + 0.06, w - 0.16, h - 0.12, paras, font=self.F(size=b.get("size", 10), em_color=main),
               spacing=1.3)

    # -- KPI cards -----------------------------------------------------------
    def b_kpis(self, s, b, x, y, w, h):
        items = b.get("items", [])
        n = len(items)
        if not n:
            return
        gap = b.get("gap", 0.18)
        cw = (w - gap * (n - 1)) / n
        for i, it in enumerate(items):
            main, tint, border = cset(it.get("color") or b.get("color"), i)
            cx = x + i * (cw + gap)
            C.shape(s, "round", cx, y, cw, h, fill="FFFFFF", line=border, line_w=1.0, adj=[6000],
                    shadow=("1D2129", 6, 1.5, 90, 0.08))
            C.shape(s, "rect", cx + 0.02, y, cw - 0.04, 0.05, fill=main)
            vh = min(0.75, h * 0.45)
            if it.get("icon"):
                draw_icon(s, it["icon"], cx + 0.36, y + 0.40, 0.36, main, 1.4)
            vtxt = str(it.get("value", "")) + (("{{%s| %s}}" % (MUTED, it["unit"])) if it.get("unit") else "")
            C.text(s, cx + 0.1, y + 0.12, cw - 0.2, vh, [{"text": vtxt}],
                   font=self.F(size=b.get("size", 28), bold=True, color=main), align="center", anchor="bottom", min_size=12)
            C.text(s, cx + 0.1, y + 0.14 + vh, cw - 0.2, 0.32, [{"text": it.get("label", "")}],
                   font=self.F(size=11, bold=True, color=TXT), align="center", anchor="middle", min_size=8)
            if it.get("note"):
                C.text(s, cx + 0.12, y + 0.48 + vh, cw - 0.24, h - vh - 0.55, [{"text": it["note"]}],
                       font=self.F(size=8.5, color=MUTED), align="center", min_size=6.5)

    # -- table ---------------------------------------------------------------
    def b_table(self, s, b, x, y, w, h):
        cols = b.get("columns", [])
        rows = b.get("rows", [])
        if not cols:
            return
        if b.get("title"):
            self.header_bar(s, x, y, w, b["title"], b.get("title_color", "blue"))
            y += 0.33
            h -= 0.33
        nr = len(rows) + 1
        nc = len(cols)
        rh = min(0.42, h / nr)
        gs = s.shapes.add_table(nr, nc, C.E(x), C.E(y), C.E(w), C.E(rh * nr))
        tbl = gs.table
        # strip default style banding
        tblPr = tbl._tbl.tblPr
        tblPr.set("firstRow", "1")
        tblPr.set("bandRow", "0")
        cw = b.get("col_widths")
        if cw and len(cw) == nc:
            tot = float(sum(cw))
            for i, v in enumerate(cw):
                tbl.columns[i].width = C.E(w * v / tot)
        else:
            for i in range(nc):
                tbl.columns[i].width = C.E(w / nc)
        hdr = C.hexc(cset(b.get("header_color", "dark"))[0])
        size = b.get("size", 9)
        hl_col = b.get("highlight_col")
        for r in range(nr):
            tbl.rows[r].height = C.E(rh)
            for c in range(nc):
                cell = tbl.cell(r, c)
                val = cols[c] if r == 0 else (rows[r - 1][c] if c < len(rows[r - 1]) else "")
                cell.margin_left = cell.margin_right = C.E(0.06)
                cell.margin_top = cell.margin_bottom = C.E(0.03)
                tf = cell.text_frame
                tf.word_wrap = True
                fill = hdr if r == 0 else ("F7F8FA" if (r % 2 == 0 and b.get("zebra", True)) else "FFFFFF")
                if r > 0 and hl_col is not None and c == hl_col:
                    fill = cset(b.get("highlight_color", "blue"))[1]
                cell.fill.solid()
                cell.fill.fore_color.rgb = _rgb(fill)
                f = self.F(size=size, color="FFFFFF" if r == 0 else TXT, bold=(r == 0) or (c == 0 and b.get("first_col_bold", True)),
                           em_color=cset(b.get("em_color", "blue"))[0])
                al = b.get("align", "center" if r == 0 else "left")
                # clear existing paragraph
                for p in list(tf.paragraphs)[1:]:
                    p._p.getparent().remove(p._p)
                tf.paragraphs[0].text = ""
                C.write_paras(tf, [{"text": str(val)}], f, align=al if r > 0 else "center", spacing=1.1)
                from pptx.enum.text import MSO_ANCHOR
                cell.vertical_anchor = MSO_ANCHOR.MIDDLE
                _cell_border(cell, "D9D9D9")

    # -- layered architecture ------------------------------------------------
    def b_layers(self, s, b, x, y, w, h):
        layers = b.get("layers", [])
        n = len(layers)
        if not n:
            return
        lw = b.get("label_w", 0.95) if any(l.get("label") for l in layers) else 0
        gap = b.get("gap", 0.22)
        hs = self._split(layers, h, gap, "h")
        cy = y
        for i, L in enumerate(layers):
            lh = hs[i]
            style = L.get("style", b.get("style", "white"))
            main, tint, border = cset(L.get("color", "navy"))
            if lw:
                C.shape(s, "rect", x, cy, lw - 0.08, lh, grad=[(0, C.mix(main, "FFFFFF", 0.15)), (100, main)], grad_angle=90,
                        text_content=[{"text": L.get("label", "")}], font=self.F(), size=11, color="FFFFFF", bold=True,
                        ins=(0.05, 0.04, 0.05, 0.04))
            bx, bw = x + lw, w - lw
            C.shape(s, "rect", bx, cy, bw, lh, fill=L.get("fill", tint if style == "tint" else None),
                    line=L.get("line", "595959"), line_w=0.75, dash="dash")
            groups = L.get("groups")
            if groups:
                ng = len(groups)
                gg = 0.14
                gws = self._split(groups, bw - 0.2 - gg * (ng - 1) + gg * (ng - 1), gg, "w")
                gx = bx + 0.1
                for gi, G in enumerate(groups):
                    gwid = gws[gi]
                    gm = cset(G.get("color", L.get("color", "navy")))[0]
                    C.shape(s, "round", gx, cy + 0.22, gwid, lh - 0.30, fill="FFFFFF" if style != "white" else "F7F9FC",
                            line=C.mix(gm, "FFFFFF", 0.55), line_w=0.75, adj=[4000])
                    C.shape(s, "rect", gx + 0.12, cy + 0.08, min(gwid - 0.24, max(1.2, len(G.get("title", "")) * 0.15 + 0.3)), 0.27,
                            grad=[(35, "3B80FD"), (100, "163AD3")], grad_angle=45, text_content=[{"text": G.get("title", "")}],
                            font=self.F(), size=10, color="FFFFFF", bold=True)
                    self._item_grid(s, G.get("items", []), gx + 0.1, cy + 0.42, gwid - 0.2, lh - 0.58,
                                    G.get("style", style), G.get("cols"), gm, G.get("dashed", []))
                    gx += gwid + gg
            else:
                self._item_grid(s, L.get("items", []), bx + 0.12, cy + 0.10, bw - 0.24, lh - 0.20, style, L.get("cols"), main,
                                L.get("dashed", []))
            if i < n - 1 and b.get("arrows", "up"):
                kind = "uparrow" if b.get("arrows", "up") == "up" else ("downarrow" if b.get("arrows") == "down" else "updown")
                ax = bx + bw / 2
                C.shape(s, kind, ax - 0.17, cy + lh + 0.03, 0.34, gap - 0.06, fill=b.get("arrow_color", "C00000"))
            cy += lh + gap

    def _item_grid(self, s, items, x, y, w, h, style, cols, main, dashed=()):
        n = len(items)
        if not n:
            return
        if not cols:
            cols = n if n <= 8 else int(math.ceil(n / math.ceil(n / 8.0)))
        rows = int(math.ceil(n / float(cols)))
        gx, gy = 0.10, 0.08
        iw = (w - gx * (cols - 1)) / cols
        ih = min(0.48, (h - gy * (rows - 1)) / rows)
        oy = y + (h - (ih * rows + gy * (rows - 1))) / 2.0
        for i, it in enumerate(items):
            r, c = divmod(i, cols)
            ix, iy = x + c * (iw + gx), oy + r * (ih + gy)
            label = it if not isinstance(it, dict) else it.get("text", it.get("title", ""))
            st = style if not isinstance(it, dict) else it.get("style", style)
            dash = "dash" if (i in dashed or (isinstance(it, dict) and it.get("dashed"))) else None
            self._item(s, st, ix, iy, iw, ih, label, main, dash)

    def _item(self, s, st, x, y, w, h, label, main, dash=None):
        f = self.F()
        if st == "blue":
            C.shape(s, "rect", x, y, w, h, grad=[(35, "3B80FD"), (100, "163AD3")], grad_angle=45, text_content=[{"text": label}],
                    font=f, size=10.5, color="FFFFFF", bold=True, min_size=7)
        elif st == "orange":
            C.shape(s, "rect", x, y, w, h, grad=[(0, "FFFFFF", 0.3), (100, "F96907", 0.5)], grad_angle=45,
                    line="F96907", line_w=0.5, line_alpha=0.6, text_content=[{"text": label}], font=f, size=11,
                    color="F96907", bold=True, min_size=7)
        elif st == "solid":
            C.shape(s, "round", x, y, w, h, fill=main, adj=[12000], text_content=[{"text": label}], font=f, size=10,
                    color="FFFFFF", bold=True, min_size=7)
        elif st == "tint":
            m, t, bd = cset(main)
            C.shape(s, "round", x, y, w, h, fill=t, line=bd, line_w=0.75, adj=[12000], text_content=[{"text": label}],
                    font=f, size=9.5, color=m, bold=True, min_size=7)
        elif st == "gray":
            C.shape(s, "round", x, y, w, h, fill="F2F2F2", adj=[10000], text_content=[{"text": label}], font=f, size=10,
                    color="000000", bold=True, min_size=7)
        else:  # white
            C.shape(s, "round", x, y, w, h, fill="FFFFFF", line="BFBFBF", line_w=0.75, dash=dash, adj=[8000],
                    text_content=[{"text": label}], font=f, size=10, color="000000", min_size=7,
                    shadow=("000000", 3, 1, 90, 0.08))

    # -- matrix (row labels x cells) ----------------------------------------
    def b_matrix(self, s, b, x, y, w, h):
        rows = b.get("rows", [])
        if not rows:
            return
        lw = b.get("label_w", 0.42)
        gap = 0.08
        hs = self._split(rows, h, gap, "h")
        cy = y
        for ri, R in enumerate(rows):
            rh = hs[ri]
            main = cset(R.get("color", "arco"))[0]
            C.shape(s, "rect", x, cy, lw, rh, grad=[(0, C.mix(main, "FFFFFF", 0.2)), (100, main)], grad_angle=90)
            C.text(s, x, cy, lw, rh, "\n".join(list(R.get("label", ""))) if b.get("vertical_label", True) else R.get("label", ""),
                   font=self.F(size=10, bold=True, color="FFFFFF"), align="center", anchor="middle", spacing=1.0, min_size=6)
            cells = R.get("cells", [])
            if cells:
                cg = 0.07
                cws = self._split(cells, w - lw - 0.06, cg, "w")
                cx = x + lw + 0.06
                for ci, cell in enumerate(cells):
                    cwid = cws[ci]
                    cm = cset(cell.get("color", R.get("cell_color", main)))[0]
                    C.shape(s, "rect", cx, cy, cwid, rh, fill="FFFFFF", line=C.mix(cm, "FFFFFF", 0.4), line_w=0.75)
                    th = 0.22 if cell.get("title") else 0
                    if th:
                        C.shape(s, "rect", cx, cy, cwid, th, fill=cm, text_content=[{"text": cell["title"]}], font=self.F(),
                                size=8.5, color="FFFFFF", bold=True, min_size=6)
                    its = cell.get("items", [])
                    hlset = set(cell.get("highlight", []))
                    if its:
                        ncol = cell.get("cols", 1)
                        nrow = int(math.ceil(len(its) / float(ncol)))
                        ig = 0.04
                        iw = (cwid - 0.08 - ig * (ncol - 1)) / ncol
                        ih = min(0.30, (rh - th - 0.08 - ig * (nrow - 1)) / max(1, nrow))
                        for ii, it in enumerate(its):
                            r_, c_ = divmod(ii, ncol)
                            fx = cx + 0.04 + c_ * (iw + ig)
                            fy = cy + th + 0.04 + r_ * (ih + ig)
                            hl = ii in hlset
                            C.shape(s, "rect", fx, fy, iw, ih, fill="FFC000" if hl else C.mix(cm, "FFFFFF", 0.92),
                                    line=C.mix(cm, "FFFFFF", 0.5), line_w=0.5, text_content=[{"text": str(it)}], font=self.F(),
                                    size=7.5, color="000000" if hl else TXT, bold=hl, min_size=5.5, ins=(0.02, 0, 0.02, 0))
                    cx += cwid + cg
            cy += rh + gap

    # -- swimlane ------------------------------------------------------------
    def b_swimlane(self, s, b, x, y, w, h):
        lanes = b.get("lanes", [])
        stages = b.get("stages", [])
        tasks = b.get("tasks", [])
        if not lanes:
            return
        lw = b.get("label_w", 1.0)
        hh = 0.34 if stages else 0
        nL = len(lanes)
        nS = max(1, len(stages))
        # header
        if stages:
            C.shape(s, "rect", x, y, lw - 0.06, hh, fill="BFBFBF", text_content=b.get("corner", u"角色"), font=self.F(), size=10,
                    color="FFFFFF", bold=True)
            sw = (w - lw) / nS
            for j, st in enumerate(stages):
                kind = "pentagon" if j == 0 else "chevron"
                C.shape(s, kind, x + lw + j * sw - (0 if j == 0 else 0.08), y, sw + (0.0 if j == 0 else 0.08), hh,
                        fill="262626" if j % 2 == 0 else "404040", adj=[30000], text_content=[{"text": st}], font=self.F(),
                        size=10, color="FFFFFF", bold=True)
        ly = y + hh + 0.08
        lh = (h - hh - 0.08) / nL
        sw = (w - lw) / nS
        for i, ln in enumerate(lanes):
            C.shape(s, "rect", x, ly + i * lh + 0.04, lw - 0.06, lh - 0.08, fill="BFBFBF", text_content=[{"text": ln}],
                    font=self.F(), size=10, color="FFFFFF", bold=True)
            if i > 0:
                C.line(s, x, ly + i * lh, x + w, ly + i * lh, color="BFBFBF", width=0.75, dash="dash")
        for j in range(1, nS):
            C.line(s, x + lw + j * sw, ly, x + lw + j * sw, ly + nL * lh, color="D9D9D9", width=0.5, dash="sysDot")
        # place tasks
        cells = {}
        for t in tasks:
            cells.setdefault((t.get("lane", 0), t.get("stage", 0)), []).append(t)
        pos = {}
        for (li, sj), ts in cells.items():
            k = len(ts)
            for q, t in enumerate(ts):
                cw = sw / k
                tw = min(cw - 0.16, 1.7)
                th = min(lh - 0.24, 0.62)
                tx = x + lw + sj * sw + q * cw + (cw - tw) / 2
                ty = ly + li * lh + (lh - th) / 2
                kind = t.get("kind", "task")
                if kind == "decision":
                    shp_kind, fill, col = "diamond", "FFFFFF", "000000"
                    tw = th = min(lh - 0.2, 0.55)
                    tx = x + lw + sj * sw + q * cw + (cw - tw) / 2
                    ty = ly + li * lh + (lh - th) / 2
                elif kind in ("start", "end"):
                    shp_kind, fill, col = "round", "F2F2F2", "000000"
                else:
                    shp_kind, fill, col = "round", t.get("fill", "F2F2F2"), "000000"
                C.shape(s, shp_kind, tx, ty, tw, th, fill=fill, line="7F7F7F" if kind != "task" else "A6A6A6", line_w=0.75,
                        adj=[50000] if kind in ("start", "end") else [12000], text_content=[{"text": t.get("text", "")}],
                        font=self.F(), size=9, color=col, min_size=6, dash="dash" if t.get("dashed") else None)
                pos[t.get("id", "%d-%d-%d" % (li, sj, q))] = (tx, ty, tw, th)
                t["_id"] = t.get("id", "%d-%d-%d" % (li, sj, q))
        flows = b.get("flows")
        if flows is None:
            ids = [t["_id"] for t in tasks]
            flows = [[ids[i], ids[i + 1]] for i in range(len(ids) - 1)]
        for f in flows:
            a, z = f[0], f[1]
            if a not in pos or z not in pos:
                continue
            self._orth_arrow(s, pos[a], pos[z], label=f[2] if len(f) > 2 else None)

    def _orth_arrow(self, s, A, Z, label=None, color="595959"):
        ax, ay, aw, ah = A
        zx, zy, zw, zh = Z
        acx, acy = ax + aw / 2, ay + ah / 2
        zcx, zcy = zx + zw / 2, zy + zh / 2
        if abs(acy - zcy) < 0.05:  # same row
            if zcx > acx:
                pts = [(ax + aw, acy), (zx, zcy)]
            else:
                pts = [(ax, acy), (zx + zw, zcy)]
        elif abs(acx - zcx) < 0.05:
            pts = [(acx, ay + ah), (zcx, zy)] if zcy > acy else [(acx, ay), (zcx, zy + zh)]
        else:
            if zcx > acx + 0.05:
                pts = [(ax + aw, acy), (zcx, acy), (zcx, zy if zcy > acy else zy + zh)]
            else:
                y1 = ay + ah if zcy > acy else ay
                pts = [(acx, y1), (acx, zcy), (zx + zw if zcx < acx else zx, zcy)]
        shp = C.polyline(s, pts, color=color, width=1.0)
        if shp is not None:
            C.line_set(shp, color, 1.0, tail="triangle")
        if label:
            mx = (pts[0][0] + pts[-1][0]) / 2
            my = (pts[0][1] + pts[-1][1]) / 2
            C.text(s, mx - 0.4, my - 0.22, 0.8, 0.2, label, font=self.F(size=7.5, color=CAP), align="center", autofit=False,
                   ins=(0, 0, 0, 0))

    # -- closed loop ---------------------------------------------------------
    def b_loop(self, s, b, x, y, w, h):
        nodes = b.get("nodes", [])
        n = len(nodes)
        if n < 2:
            return
        C.shape(s, "round", x, y, w, h, fill=b.get("fill", "FFF2CC"), line=b.get("border", "FFD966"), line_w=1.0, adj=[3000])
        top = int(math.ceil(n / 2.0))
        bot = n - top
        pad = 0.30
        nw = min(2.25, (w - 2 * pad - (top - 1) * 0.9) / top)
        nh = min(1.25, (h - 0.9) / 2.0)
        slots = []
        for i in range(top):
            cx = x + pad + i * ((w - 2 * pad - nw) / max(1, top - 1)) if top > 1 else x + (w - nw) / 2
            slots.append((cx, y + 0.28))
        for i in range(bot):
            cx = x + pad + (bot - 1 - i) * ((w - 2 * pad - nw) / max(1, bot - 1)) if bot > 1 else x + (w - nw) / 2
            if bot < top and bot > 0:
                cx = x + pad + (top - 1 - i - (top - bot)) * ((w - 2 * pad - nw) / max(1, top - 1)) + (w - 2 * pad - nw) / max(1, top - 1) * (top - bot) / 2.0 if top > 1 else cx
            slots.append((cx, y + h - nh - 0.28))
        main_line = cset(b.get("arrow_color", "blue"))[0]
        for i, nd in enumerate(nodes):
            nd = nd if isinstance(nd, dict) else {"title": str(nd)}
            m, t, bd = cset(nd.get("color"), i)
            nx, ny = slots[i]
            C.shape(s, "round", nx, ny, nw, nh, fill="FFFFFF", line=bd, line_w=1.0, adj=[8000])
            self.header_bar(s, nx, ny, nw, nd.get("title", ""), m, h=0.34, icon=nd.get("icon"), size=12)
            C.text(s, nx + 0.08, ny + 0.38, nw - 0.16, nh - 0.42, [{"text": l} for l in _lines(nd.get("text") or nd.get("items"))],
                   font=self.F(size=9.5, color=m), align="center", anchor="middle", spacing=1.25, min_size=6.5, max_size=12.5)
        # arrows
        labels = b.get("edge_labels", [])
        for i in range(n):
            a, z = slots[i], slots[(i + 1) % n]
            ax, ay = a
            zx, zy = z
            lab = labels[i] if i < len(labels) else None
            if abs(ay - zy) < 0.01:  # same row
                if zx > ax:
                    p1, p2 = (ax + nw, ay + nh / 2), (zx, zy + nh / 2)
                else:
                    p1, p2 = (ax, ay + nh / 2), (zx + nw, zy + nh / 2)
                C.line(s, p1[0] + 0.05, p1[1], p2[0] - 0.05 if p2[0] > p1[0] else p2[0] + 0.05, p2[1], color=main_line,
                       width=1.5, tail="triangle", dash="dash" if b.get("dashed") else None)
                if lab:
                    C.text(s, min(p1[0], p2[0]), p1[1] - 0.30, abs(p2[0] - p1[0]), 0.26, lab,
                           font=self.F(size=8.5, color=main_line), align="center", autofit=True, ins=(0, 0, 0, 0))
            else:  # vertical turn
                xx = (ax + nw / 2) if i == top - 1 else (ax + nw / 2)
                if i == top - 1:
                    p1, p2 = (ax + nw / 2, ay + nh), (zx + nw / 2, zy)
                else:
                    p1, p2 = (ax + nw / 2, ay), (zx + nw / 2, zy + nh)
                C.line(s, p1[0], p1[1] + (0.05 if p2[1] > p1[1] else -0.05), p2[0], p2[1] - (0.05 if p2[1] > p1[1] else -0.05),
                       color=main_line, width=1.5, tail="triangle")
                if lab:
                    C.text(s, p1[0] + 0.06, (p1[1] + p2[1]) / 2 - 0.13, 1.4, 0.26, lab, font=self.F(size=8.5, color=main_line),
                           autofit=True, ins=(0, 0, 0, 0))
        if b.get("center"):
            C.text(s, x + w * 0.3, y + h / 2 - 0.3, w * 0.4, 0.6, [{"text": b["center"]}],
                   font=self.F(size=b.get("center_size", 20), bold=True, color=main_line), align="center", anchor="middle")

    # -- hierarchy columns ---------------------------------------------------
    def b_hierarchy(self, s, b, x, y, w, h):
        cols = b.get("columns", [])
        defs = b.get("definitions")
        if not cols:
            return
        n = len(cols) + (1 if defs else 0)
        gap = 0.18
        ws = [1.0] * len(cols) + ([b.get("definition_w", 1.6)] if defs else [])
        tot = sum(ws)
        avail = w - gap * (n - 1)
        hl = b.get("highlight")
        rows = max(len(c.get("levels", [])) for c in cols)
        cx = x
        th = 0.30
        for i, col in enumerate(cols):
            cw = avail * ws[i] / tot
            if hl is not None and i == hl:
                C.shape(s, "rect", cx - 0.05, y, cw + 0.10, h, fill="D6E0F0", alpha=0.75)
            C.text(s, cx, y, cw, th, [{"text": col.get("title", "")}], font=self.F(size=10.5, bold=True, color="000000"),
                   align="center", anchor="middle")
            C.line(s, cx, y + th, cx + cw, y + th, color="000000", width=1.0)
            levels = col.get("levels", [])
            lh = (h - th - 0.2) / max(1, rows)
            bh = min(0.36, lh * 0.62)
            bw = cw * 0.72
            for j, lv in enumerate(levels):
                by = y + th + 0.12 + j * lh + (lh - bh) / 2
                C.shape(s, "rect", cx + (cw - bw) / 2, by, bw, bh, fill="FFFFFF", line="7F7F7F", line_w=0.75,
                        text_content=[{"text": lv}], font=self.F(), size=9.5, color="000000", min_size=6.5)
                if j < len(levels) - 1:
                    C.line(s, cx + cw / 2, by + bh, cx + cw / 2, by + lh, color="7F7F7F", width=0.75)
            cx += cw + gap
        if defs:
            cw = avail * ws[-1] / tot
            C.shape(s, "rect", cx - 0.05, y, cw + 0.05, h, fill="D6E0F0", alpha=0.75)
            C.text(s, cx, y, cw, th, [{"text": b.get("definition_title", u"定义")}], font=self.F(size=10.5, bold=True, color="000000"),
                   align="center", anchor="middle")
            C.line(s, cx, y + th, cx + cw, y + th, color="000000", width=1.0)
            lh = (h - th - 0.2) / max(1, rows)
            for j, dtext in enumerate(defs):
                C.text(s, cx + 0.04, y + th + 0.12 + j * lh, cw - 0.08, lh, [{"text": dtext}], font=self.F(size=8.5, color="595959"),
                       anchor="middle", min_size=6, spacing=1.15)
        if b.get("side_note"):
            C.text(s, x + w - 1.2, y + th + 0.2, 1.2, 1.2, [{"text": b["side_note"]}], font=self.F(size=9, bold=True, color="2F62F5"),
                   min_size=6.5)

    # -- problem / solution --------------------------------------------------
    def b_problem_solution(self, s, b, x, y, w, h):
        aw = 0.6
        pw = (w - aw - 0.2) / 2
        for i, key in enumerate(("problem", "solution")):
            blk = b.get(key) or {}
            px = x + i * (pw + aw + 0.2)
            C.text(s, px, y, pw, 0.3, [{"text": blk.get("title", u"问题" if i == 0 else u"解决方案")}],
                   font=self.F(size=11, bold=True, color="000000"), anchor="middle")
            self.bullets_box(s, px, y + 0.32, pw, h - 0.32, blk.get("items", []), "C00000" if i == 0 else "4080FF", size=10)
        C.shape(s, "rightarrow", x + pw + 0.1, y + h / 2 - 0.18, aw, 0.36, fill="000000", adj=[50000, 50000])

    # -- chevron process -----------------------------------------------------
    def b_chevrons(self, s, b, x, y, w, h):
        items = b.get("items", [])
        n = len(items)
        if not n:
            return
        ch = min(0.55, h * 0.3)
        overlap = 0.10
        cw = (w + overlap * (n - 1)) / n
        base = b.get("color", "arco")
        for i, it in enumerate(items):
            it = it if isinstance(it, dict) else {"title": str(it)}
            main = cset(it.get("color") or (base if not b.get("gradient", True) else C.mix(cset(base)[0], "0E2A6B", 0.55 * i / max(1, n - 1))))[0]
            cx = x + i * (cw - overlap)
            C.shape(s, "pentagon" if i == 0 else "chevron", cx, y, cw, ch, fill=main, adj=[28000], text_content=[{"text": it.get("title", "")}],
                    font=self.F(), size=11, color="FFFFFF", bold=True, min_size=7)
            body = it.get("items") or _lines(it.get("text"))
            if body and h > ch + 0.3:
                self.bullets_box(s, cx + 0.12, y + ch + 0.12, cw - 0.34, h - ch - 0.14, body, main, size=b.get("size", 9.5))

    # -- timeline ------------------------------------------------------------
    def b_timeline(self, s, b, x, y, w, h):
        items = b.get("items", [])
        n = len(items)
        if not n:
            return
        main = cset(b.get("color", "arco"))[0]
        ly = y + h / 2
        C.line(s, x, ly, x + w, ly, color=main, width=2.0, tail="triangle")
        step = w / n
        for i, it in enumerate(items):
            it = it if isinstance(it, dict) else {"title": str(it)}
            cx = x + step * (i + 0.5)
            m = cset(it.get("color") or main)[0]
            C.shape(s, "ellipse", cx - 0.11, ly - 0.11, 0.22, 0.22, fill="FFFFFF", line=m, line_w=2.5)
            up = (i % 2 == 0)
            C.text(s, cx - step / 2 + 0.05, ly + (-0.48 if up else 0.18), step - 0.1, 0.30, [{"text": it.get("date", "")}],
                   font=self.F(size=12, bold=True, color=m), align="center", anchor="middle")
            ty = ly - 0.55 - (h / 2 - 0.65) if up else ly + 0.52
            C.text(s, cx - step / 2 + 0.05, ty, step - 0.1, h / 2 - 0.65,
                   [{"text": it.get("title", ""), "bold": True, "color": TXT}] + [{"text": l, "color": TXT2} for l in _lines(it.get("text"))],
                   font=self.F(size=9.5), align="center", anchor="bottom" if up else "top", min_size=6.5, spacing=1.2)

    # -- gantt ---------------------------------------------------------------
    def b_gantt(self, s, b, x, y, w, h):
        periods = b.get("periods", [])
        tasks = b.get("tasks", [])
        if not periods or not tasks:
            return
        lw = b.get("label_w", 2.4)
        hh = 0.32
        np_ = len(periods)
        pw = (w - lw) / np_
        C.shape(s, "rect", x, y, lw, hh, fill="1D2129", text_content=b.get("corner", u"工作任务"), font=self.F(), size=10, color="FFFFFF", bold=True)
        for j, p in enumerate(periods):
            C.shape(s, "rect", x + lw + j * pw, y, pw - 0.01, hh, fill="165DFF" if j % 2 == 0 else "4080FF", text_content=[{"text": p}],
                    font=self.F(), size=9.5, color="FFFFFF", bold=True, min_size=6)
        rh = min(0.62, (h - hh - 0.05) / len(tasks))
        for i, t in enumerate(tasks):
            ty = y + hh + 0.05 + i * rh
            if i % 2 == 0:
                C.shape(s, "rect", x, ty, w, rh, fill="F7F8FA")
            C.text(s, x + 0.05, ty, lw - 0.1, rh, [{"text": t.get("name", "")}], font=self.F(size=9.5, color=TXT, bold=t.get("bold", False)),
                   anchor="middle", min_size=6.5)
            st, en = float(t.get("start", 0)), float(t.get("end", 1))
            m = cset(t.get("color"), i)[0]
            C.shape(s, "round", x + lw + st * pw + 0.03, ty + rh * 0.22, max(0.1, (en - st) * pw - 0.06), rh * 0.56, fill=m, adj=[50000],
                    text_content=[{"text": t.get("label", "")}] if t.get("label") else None, font=self.F(), size=8, color="FFFFFF", min_size=6)
            if t.get("milestone"):
                C.shape(s, "diamond", x + lw + en * pw - 0.1, ty + rh / 2 - 0.1, 0.2, 0.2, fill="2F62F5")
        for j in range(np_ + 1):
            C.line(s, x + lw + j * pw, y + hh, x + lw + j * pw, y + hh + 0.05 + rh * len(tasks), color="E5E6EB", width=0.5)

    # -- free flow diagram ---------------------------------------------------
    def b_flow(self, s, b, x, y, w, h):
        nodes = b.get("nodes", [])
        pos = {}
        for nd in nodes:
            nx, ny = x + nd.get("x", 0) * w, y + nd.get("y", 0) * h
            nw, nh = nd.get("w", 0.15) * w, nd.get("h", 0.1) * h
            st = nd.get("style", "white")
            main = cset(nd.get("color", "blue"))[0]
            lbl = nd.get("text", "")
            if st == "container":
                C.shape(s, "rect", nx, ny, nw, nh, fill=nd.get("fill"), line=nd.get("line", "595959"), line_w=0.75, dash="dash")
                if lbl:
                    C.text(s, nx + 0.05, ny + 0.02, nw - 0.1, 0.28, [{"text": lbl}], font=self.F(size=10, bold=True, color=main), anchor="middle")
            elif st == "panel":
                self.b_panel(s, {"title": lbl, "items": nd.get("items", []), "color": main, "style": "white", "icon": nd.get("icon")}, nx, ny, nw, nh)
            elif st == "db":
                C.shape(s, "can", nx, ny, nw, nh, fill=cset(main)[1], line=main, line_w=1, adj=[18000], text_content=[{"text": lbl}],
                        font=self.F(), size=9, color=main, bold=True)
            elif st == "decision":
                C.shape(s, "diamond", nx, ny, nw, nh, fill="FFFFFF", line="7F7F7F", text_content=[{"text": lbl}], font=self.F(), size=9)
            elif st == "circle":
                C.shape(s, "ellipse", nx, ny, nw, nh, fill=main, text_content=[{"text": lbl}], font=self.F(), size=10, color="FFFFFF", bold=True)
            elif st == "icon":
                draw_icon(s, nd.get("icon", "server"), nx + nw / 2, ny + nh * 0.4, min(nw, nh) * 0.6, main, 1.4)
                C.text(s, nx - 0.2, ny + nh * 0.78, nw + 0.4, 0.26, [{"text": lbl}], font=self.F(size=9, color=TXT), align="center", autofit=True)
            elif st == "label":
                C.text(s, nx, ny, nw, nh, [{"text": lbl}], font=self.F(size=nd.get("size", 9), color=nd.get("text_color", CAP),
                       bold=nd.get("bold", False)), align=nd.get("align", "center"), anchor="middle")
            else:
                self._item(s, st, nx, ny, nw, nh, lbl, main, "dash" if nd.get("dashed") else None)
            pos[nd.get("id", lbl)] = (nx, ny, nw, nh)
        for e in b.get("edges", []):
            a, z = e.get("from"), e.get("to")
            if a not in pos or z not in pos:
                C.warn("flow edge refers to unknown node: %s -> %s" % (a, z))
                continue
            col = cset(e.get("color", "gray"))[0] if e.get("color") else "595959"
            if e.get("style", "orth") == "orth":
                self._orth_arrow(s, pos[a], pos[z], e.get("label"), color=col)
            else:
                A, Z = pos[a], pos[z]
                p1 = _edge_point(A, Z)
                p2 = _edge_point(Z, A)
                C.line(s, p1[0], p1[1], p2[0], p2[1], color=col, width=e.get("width", 1.0), tail="triangle",
                       head="triangle" if e.get("both") else None, dash="dash" if e.get("dashed") else None)
                if e.get("label"):
                    C.text(s, (p1[0] + p2[0]) / 2 - 0.6, (p1[1] + p2[1]) / 2 - 0.24, 1.2, 0.22, e["label"],
                           font=self.F(size=7.5, color=CAP), align="center", ins=(0, 0, 0, 0))

    # -- strategy (badge + icon columns) ------------------------------------
    def b_strategy(self, s, b, x, y, w, h):
        main = cset(b.get("color", "C00000"))[0]
        bw = 1.15
        C.shape(s, "hexagon", x + 0.05, y + 0.05, bw, bw * 0.88, fill=main, adj=[25000], text_content=[{"text": b.get("badge", u"策略")}],
                font=self.F(), size=13, color="FFFFFF", bold=True)
        if b.get("desc"):
            C.text(s, x + bw + 0.35, y + 0.10, w - bw - 0.4, 0.7, [{"text": b["desc"]}], font=self.F(size=10, color=TXT), anchor="middle")
        self.b_cards(s, {"style": "icon", "items": b.get("columns", []), "color": main, "cols": len(b.get("columns", [])) or 1,
                         "size": b.get("size", 10)}, x + 0.2, y + bw + 0.25, w - 0.2, h - bw - 0.25)

    # -- image ---------------------------------------------------------------
    def b_image(self, s, b, x, y, w, h):
        cap_h = 0.24 if b.get("caption") else 0
        p = self.img(b.get("image") or b.get("path"))
        ih = h - cap_h
        if p:
            if b.get("fit", "contain") == "cover":
                C.add_picture_cover(s, p, x, y, w, ih, geom="roundRect", radius=3000)
            else:
                C.add_picture_fit(s, p, x, y, w, ih)
        else:
            C.shape(s, "round", x, y, w, ih, fill="F2F3F5", line="C9CDD4", line_w=1, dash="dash", adj=[3000])
            draw_icon(s, b.get("icon", "eye"), x + w / 2, y + ih / 2 - 0.22, 0.5, "A9AEB8", 1.4)
            C.text(s, x + 0.1, y + ih / 2 + 0.12, w - 0.2, 0.5, [{"text": b.get("placeholder", u"截图 / 示意图占位")}],
                   font=self.F(size=10, color="86909C"), align="center", anchor="top")
        if cap_h:
            C.text(s, x, y + ih + 0.02, w, cap_h - 0.02, [{"text": b["caption"]}], font=self.F(size=8.25, color=CAP), align="center",
                   anchor="middle")

    def b_images(self, s, b, x, y, w, h):
        items = b.get("items", [])
        n = len(items)
        if not n:
            return
        cols = int(b.get("cols", n))
        rows = int(math.ceil(n / float(cols)))
        g = 0.14
        cw = (w - g * (cols - 1)) / cols
        ch = (h - g * (rows - 1)) / rows
        for i, it in enumerate(items):
            r, c = divmod(i, cols)
            it = it if isinstance(it, dict) else {"image": it}
            self.b_image(s, dict(it, fit=b.get("fit", "cover")), x + c * (cw + g), y + r * (ch + g), cw, ch)


def _edge_point(A, Z):
    ax, ay, aw, ah = A
    zx, zy, zw, zh = Z
    acx, acy = ax + aw / 2, ay + ah / 2
    zcx, zcy = zx + zw / 2, zy + zh / 2
    dx, dy = zcx - acx, zcy - acy
    if dx == 0 and dy == 0:
        return acx, acy
    tx = (aw / 2) / abs(dx) if dx else 1e9
    ty = (ah / 2) / abs(dy) if dy else 1e9
    t = min(tx, ty)
    return acx + dx * t, acy + dy * t


def _num_en(no):
    m = {"1": "ONE", "2": "TWO", "3": "THREE", "4": "FOUR", "5": "FIVE", "6": "SIX", "7": "SEVEN", "8": "EIGHT", "9": "NINE", "10": "TEN"}
    return m.get(str(no), str(no))


def _rgb(h):
    from pptx.dml.color import RGBColor
    return RGBColor.from_string(C.hexc(h))


def _cell_border(cell, color, w=0.75):
    from pptx.oxml.ns import qn
    from lxml import etree
    tcPr = cell._tc.get_or_add_tcPr()
    for tag in ("a:lnL", "a:lnR", "a:lnT", "a:lnB"):
        for n in tcPr.findall(qn(tag)):
            tcPr.remove(n)
    for tag in ("a:lnB", "a:lnT", "a:lnR", "a:lnL"):  # inserted at 0 -> final order L,R,T,B
        ln = etree.Element(qn(tag))
        ln.set("w", str(int(w * 12700)))
        sf = etree.SubElement(ln, qn("a:solidFill"))
        c = etree.SubElement(sf, qn("a:srgbClr"))
        c.set("val", color)
        tcPr.insert(0, ln)
