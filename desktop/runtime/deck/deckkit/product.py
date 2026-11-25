# -*- coding: utf-8 -*-
"""Theme `product` - dark cinematic product deck.

Re-creates the visual grammar of the sample "示例产品 防积灰组件主打胶片 2025":
  * pure-black canvas, centred two-tier headline (20pt kicker + 30pt heavy headline), optional footnote
  * red brand block with white logo (top-left), cream parallelogram tab bar top-right with active item in red
  * full-height photo columns fading to black with cyan icon rings, dots, bold titles and grey descriptions
  * 3D cylinder bar charts (gold / magenta / cyan gradients) with reflections, dark area charts,
    dark radial info tiles, chrome outlined big numbers, perspective chapter panels on a floor, striped closing page
"""
from __future__ import division
import math
import random
from . import core as C
from .icons import draw_icon

WHITE = "FFFFFF"
GREY = "BFBFBF"
GREY2 = "8C8C8C"
CYAN = "1E9FD8"
RED = "2F62F5"  # QuankSight royal blue accent

BAR_GRADS = {
    "gold": [(0, "FFE082"), (45, "FFC04D"), (100, "F2873A")],
    "magenta": [(0, "FF4FA3"), (55, "E8287F"), (100, "A0239B")],
    "pink": [(0, "FF7AB8"), (100, "D6246E")],
    "cyan": [(0, "3FE0FF"), (100, "0A7FC4")],
    "purple": [(0, "C17DFF"), (100, "6A2BD1")],
    "red": [(0, "FF6E6E"), (100, "C00010")],
    "silver": [(0, "F2F2F2"), (100, "8C8C8C")],
    "green": [(0, "7CF29A"), (100, "1F9E5A")],
    "blue": [(0, "6FA8FF"), (100, "1F4FD6")],
}
SERIES_ORDER = ["gold", "magenta", "cyan", "purple", "silver", "green"]
SOLID = {"gold": "F5A94A", "magenta": "E8287F", "pink": "F06AA8", "cyan": "1EC8E6", "purple": "9B4DEB", "red": "C8102E",
         "silver": "BFBFBF", "green": "3CC873", "blue": "3B7BFF"}


def _lines(v):
    if v is None:
        return []
    if isinstance(v, (list, tuple)):
        return list(v)
    return str(v).split("\n")


class ProductTheme(object):
    name = "product"

    def __init__(self, brand, base_dir=None):
        self.b = brand
        self.base_dir = base_dir
        self.font = C.Font(face=brand.get("font", u"微软雅黑"), latin=brand.get("latin_font"), size=12, color=WHITE,
                           em_color=brand.get("accent", "FFFFFF"), hl_color=RED)
        self.page = 0
        random.seed(7)

    def F(self, **kw):
        return self.font.copy(**kw)

    def img(self, ref):
        return C.resolve_image(ref, self.base_dir)

    def logo(self, variant="white"):
        if self.b.get("logo") == "none":
            return None
        custom = self.b.get("logo_" + variant)
        if custom:
            return self.img(custom)
        return C.asset_path("quank_logo.png")

    # ------------------------------------------------------------------ chrome
    def dark_bg(self, s, style="plain"):
        C.bg_solid(s, "000000")
        if style == "glow":
            C.shape(s, "ellipse", 2.2, -3.2, 8.9, 7.2, grad=[(0, "FFFFFF", 0.13), (60, "FFFFFF", 0.03), (100, "FFFFFF", 0.0)],
                    grad_path="circle")
        elif style == "tech":
            C.shape(s, "rect", 0, 0, C.SLIDE_W, C.SLIDE_H, grad=[(0, "0E1A24"), (70, "05090D"), (100, "000000")], grad_path="circle")
            for i, r in enumerate((1.6, 2.4, 3.3, 4.3)):
                C.shape(s, "ellipse", 9.0 - r, 4.0 - r, 2 * r, 2 * r, line="2A6F8F", line_w=0.75 + (i % 2) * 2.5, line_alpha=0.18 - i * 0.03,
                        dash="dash" if i % 2 else None)
            C.shape(s, "blockarc", 6.2, 1.2, 5.6, 5.6, fill="2A6F8F", alpha=0.10, adj=[20000000 / 60000.0 * 0, 0, 6000])

    def brand_block(self, s, x=0.65, w=0.62, h=0.86):
        C.shape(s, "rect", x, 0, w, h, fill=RED)
        lg = self.logo("white")
        if lg:
            C.add_picture_fit(s, lg, x + 0.07, h * 0.42, w - 0.14, h * 0.30)

    def headline(self, s, kicker=None, title=None, note=None, y=0.78, x=0.4, w=None, align="center", tsize=30):
        w = w or (C.SLIDE_W - 2 * x)
        cy = y
        if kicker:
            C.text(s, x, cy, w, 0.45, [{"text": kicker}], font=self.F(size=20, color=WHITE), align=align, anchor="middle",
                   min_size=12)
            cy += 0.48
        if title:
            C.text(s, x, cy, w, 0.70, [{"text": title, "shadow": ("000000", 6, 2, 0.6)}], font=self.F(size=tsize, bold=True, color=WHITE,
                   hl_color=RED), align=align, anchor="middle", min_size=18)
            cy += 0.72
        if note:
            C.text(s, x, cy - 0.05, w, 0.30, [{"text": note}], font=self.F(size=9, color="D9D9D9"), align=align, anchor="middle",
                   min_size=7)
            cy += 0.30
        return cy

    def tabs(self, s, tabs, active=None, x=None, y=0.36, h=0.28):
        if not tabs:
            return
        total = sum(C.text_w_pt(t, 11) for t in tabs) / 72.0 + 0.22 * len(tabs) + 0.5
        w = max(1.8, total)
        x = x if x is not None else C.SLIDE_W - w - 0.08
        C.shape(s, "parallelogram", x, y, w, h, grad=[(0, "FFFFFF"), (55, "F4E6D2"), (100, "D9BF98")], grad_angle=0, adj=[45000])
        runs = []
        for i, t in enumerate(tabs):
            if i:
                runs.append(u" | ")
            if active is not None and (i == active or t == active):
                runs.append("{{%s|**%s**}}" % (RED, t) if False else "==%s==" % t)
            else:
                runs.append(t)
        C.text(s, x + 0.12, y, w - 0.24, h, [{"text": "".join(runs)}], font=self.F(size=11, color="262626", hl_color=RED),
               align="center", anchor="middle", autofit=False, ins=(0, 0, 0, 0))

    # ------------------------------------------------------------------ dispatcher
    def render(self, prs, spec):
        lay = spec.get("layout", "split")
        s = C.blank_slide(prs)
        self.page += 1
        fn = getattr(self, "page_" + lay, None)
        if fn is None:
            C.warn("unknown product layout '%s', rendered as split" % lay)
            fn = self.page_split
        fn(s, spec)
        if spec.get("tabs"):
            self.tabs(s, spec["tabs"], spec.get("tab_active"))
        if spec.get("notes"):
            s.notes_slide.notes_text_frame.text = spec["notes"]
        if spec.get("source"):
            C.text(s, 1.0, 6.85, 9, 0.28, spec["source"], font=self.F(size=8, color=GREY2), autofit=False, ins=(0, 0, 0, 0))
        return s

    # ------------------------------------------------------------------ pages
    def page_cover(self, s, d):
        C.bg_solid(s, "000000")
        im = self.img(d.get("image"))
        if im:
            C.add_picture_cover(s, im, 0, 0, C.SLIDE_W, C.SLIDE_H)
        else:
            self._native_scene(s, "panel")
        C.shape(s, "rect", 0, 0, 8.4, 7.5, grad=[(0, "000000", 0.70), (60, "000000", 0.30), (100, "000000", 0.0)], grad_angle=0)
        self.brand_block(s)
        y = d.get("y", 3.0)
        prod = d.get("product", "")
        hl = d.get("highlight", "")
        tag = d.get("tagline", "")
        cx = 1.15
        if prod:
            pw = C.text_w_pt(prod, 18) / 72.0 + 0.12
            C.text(s, cx, y, pw + 0.1, 0.42, [{"text": prod}], font=self.F(size=18, bold=True), autofit=False, wrap=False,
                   ins=(0, 0, 0, 0), anchor="middle")
            cx += pw
        if hl:
            hw = C.text_w_pt(hl, 14) / 72.0 + 0.16
            C.shape(s, "round", cx, y + 0.07, hw, 0.28, fill=RED, adj=[12000], text_content=hl, font=self.F(), size=14, bold=True,
                    color=WHITE, autofit=False, ins=(0, 0, 0, 0))
            cx += hw + 0.12
        if tag:
            C.text(s, cx, y, 3, 0.42, tag, font=self.F(size=12, bold=True, color="E6E6E6"), autofit=False, wrap=False,
                   ins=(0, 0, 0, 0), anchor="middle")
        C.text(s, 1.12, y + 0.42, 8.5, 0.95, [{"text": d.get("title", ""), "shadow": ("000000", 8, 2, 0.6)}],
               font=self.F(size=d.get("title_size", 34), bold=True), min_size=22, anchor="top")
        if d.get("subtitle"):
            C.text(s, 1.15, y + 1.38, 7.5, 0.6, [{"text": d["subtitle"]}], font=self.F(size=14, color="D9D9D9"), min_size=10)
        if d.get("date") or d.get("presenter"):
            C.text(s, 1.15, 6.6, 6, 0.4, "  |  ".join([v for v in (d.get("presenter"), d.get("date")) if v]),
                   font=self.F(size=11, color=GREY), autofit=False, ins=(0, 0, 0, 0))

    def _native_scene(self, s, kind="panel"):
        """Native atmospheric background when no photo is supplied."""
        C.shape(s, "rect", 0, 0, C.SLIDE_W, C.SLIDE_H, grad=[(0, "2B3138"), (55, "101317"), (100, "000000")], grad_angle=120)
        # perspective PV module grid on the right
        ox, oy = 6.0, 7.6
        for i in range(0, 15):
            t = i / 14.0
            x_top = 8.2 + t * 4.8
            x_bot = ox + t * 9.5
            C.line(s, x_top, 2.6, x_bot, oy, color="9AA4AE", width=0.6, alpha=0.18)
        for j in range(0, 9):
            t = (j / 8.0) ** 1.6
            yy = 2.6 + t * 5.0
            xl = 8.2 + (ox - 8.2) * t
            xr = 13.0 + (15.5 - 13.0) * t
            C.line(s, xl, yy, min(xr, C.SLIDE_W), yy, color="9AA4AE", width=0.6, alpha=0.16)
        C.shape(s, "ellipse", 7.5, -2.5, 8, 6, grad=[(0, "FFFFFF", 0.16), (100, "FFFFFF", 0.0)], grad_path="circle")

    def page_toc(self, s, d):
        self.dark_bg(s, "glow")
        C.text(s, 0, 0.42, C.SLIDE_W, 0.5, u"目 录", font=self.F(size=24, bold=True), align="center", anchor="middle", autofit=False)
        C.text(s, 0, 0.86, C.SLIDE_W, 0.3, [{"text": "CONTENTS", "char_spacing": 3}], font=self.F(size=12, color="D9D9D9"),
               align="center", anchor="middle", autofit=False)
        C.shape(s, "ellipse", C.SLIDE_W / 2 - 0.025, 1.2, 0.05, 0.05, fill=CYAN)
        ch = d.get("chapters", [])
        n = max(1, len(ch))
        act = d.get("active", 1 if n >= 3 else 0)
        # floor
        C.shape(s, "trapezoid", 1.3, 5.55, 10.73, 1.9, grad=[(0, "3A3A3A"), (100, "0B0B0B")], grad_angle=90, line="8C8C8C", line_w=1.0,
                line_alpha=0.6, adj=[22000])
        C.shape(s, "rect", 1.3, 7.34, 10.73, 0.06, fill="BFBFBF", alpha=0.5)
        for i in range(1, 12):
            t = i / 12.0
            C.line(s, 1.72 + t * 9.9, 5.57, 1.3 + t * 10.73, 7.34, color="7F7F7F", width=0.5, alpha=0.35)
        # wireframe city cluster
        cx0 = C.SLIDE_W / 2
        for k in range(70):
            bw = random.uniform(0.07, 0.22)
            bh = random.uniform(0.15, 1.6) * (1.0 - abs(random.gauss(0, 0.35)))
            bh = max(0.12, bh)
            bx = cx0 + random.gauss(0, 1.35) - bw / 2
            by = 6.55 + random.uniform(-0.35, 0.35)
            C.shape(s, "rect", bx, by - bh, bw, bh, fill="7FDBFF", alpha=random.uniform(0.04, 0.14), line="B8ECFF",
                    line_w=0.4, line_alpha=random.uniform(0.25, 0.6))
        # panels
        span = 8.6
        pw = min(2.25, span / n - 0.25)
        gapx = (span - pw * n) / max(1, n - 1) if n > 1 else 0
        x0 = (C.SLIDE_W - span) / 2.0 if n > 1 else (C.SLIDE_W - pw) / 2
        for i, c in enumerate(ch):
            c = c if isinstance(c, dict) else {"title": str(c)}
            active = (i == act)
            ph = 3.35 if active else 3.0
            px = x0 + i * (pw + gapx)
            py = 1.55 if active else 1.75
            im = self.img(c.get("image"))
            if im:
                pic = C.add_picture_cover(s, im, px, py, pw, ph)
                ov = C.shape(s, "rect", px, py, pw, ph, grad=[(0, "000000", 0.05), (100, "000000", 0.75)], grad_angle=90,
                             line="3FC1B9", line_w=1.25, line_alpha=0.85)
                target = [pic, ov]
            else:
                g = [(0, "9EA3A8"), (40, "4A4F55"), (100, "0D0F11")] if not active else [(0, "E8E1C8"), (35, "8E8A7A"), (100, "101214")]
                ov = C.shape(s, "rect", px, py, pw, ph, grad=g, grad_angle=90, line="3FC1B9", line_w=1.25, line_alpha=0.85)
                target = [ov]
            if not active and n > 1:
                preset = "perspectiveContrastingRightFacing" if i < act else "perspectiveContrastingLeftFacing"
                for t in target:
                    C.camera_3d(t, preset)
            if active:
                C.effects(ov, glow=("3FC1B9", 8, 0.35))
            no = c.get("no", "%02d" % (i + 1))
            C.text(s, px, py + ph * 0.24, pw, 0.55, [{"text": no, "shadow": ("000000", 4, 1, 0.6)}],
                   font=self.F(size=24, color=WHITE), align="center", anchor="middle", autofit=False)
            C.shape(s, "ellipse", px + pw / 2 - 0.025, py + ph * 0.24 + 0.58, 0.05, 0.05, fill=WHITE)
            C.text(s, px + 0.1, py + ph * 0.24 + 0.70, pw - 0.2, 0.75, [{"text": c.get("title", ""), "shadow": ("000000", 4, 1, 0.6)}],
                   font=self.F(size=14, color=WHITE), align="center", anchor="top", min_size=9, spacing=1.15)

    def page_section(self, s, d):
        C.bg_solid(s, "000000")
        im = self.img(d.get("image"))
        if im:
            C.add_picture_cover(s, im, 4.2, 0, C.SLIDE_W - 4.2, C.SLIDE_H)
            C.shape(s, "rect", 4.2, 0, 4.0, 7.5, grad=[(0, "000000"), (100, "000000", 0.0)], grad_angle=0)
        else:
            # rain streaks
            for k in range(140):
                x = random.uniform(0, C.SLIDE_W)
                y = random.uniform(-0.5, 7.5)
                L = random.uniform(0.12, 0.45)
                C.line(s, x, y, x - L * 0.25, y + L, color="FFFFFF", width=random.choice((0.5, 0.75, 1.0)), alpha=random.uniform(0.10, 0.45))
            # module corner (metal frame) - native
            fr = C.shape(s, "round", 7.0, 1.0, 8.5, 8.0, grad=[(0, "4A4F55"), (100, "15181B")], grad_angle=45, line="E6E6E6",
                         line_w=9, adj=[1500], rot=-28)
            C.shape(s, "round", 7.35, 1.35, 7.8, 7.3, line="8C8C8C", line_w=1.5, adj=[1500], rot=-28)
            for k in range(1, 4):
                pass
        self.brand_block(s)
        no = d.get("no")
        y = d.get("y", 2.85)
        if no:
            C.text(s, 1.0, y - 0.75, 3, 0.6, [{"text": "%s" % no}], font=self.F(size=28, bold=True, color=RED), autofit=False,
                   ins=(0, 0, 0, 0), anchor="bottom")
        C.text(s, 1.0, y, 5.8, 1.6, [{"text": l} for l in _lines(d.get("title", ""))], font=self.F(size=d.get("title_size", 32), color=WHITE),
               spacing=1.25, min_size=20, anchor="top")
        if d.get("subtitle"):
            C.text(s, 1.02, y + 1.65, 5.6, 0.8, [{"text": d["subtitle"]}], font=self.F(size=13, color=GREY), min_size=9)

    def page_scenarios(self, s, d):
        C.bg_solid(s, "000000")
        cols = d.get("columns", [])
        n = max(1, len(cols))
        gap = 0.16
        x0 = 0.19
        cw = (C.SLIDE_W - 2 * x0 - gap * (n - 1)) / n
        fall = [[(0, "3B4D5E"), (100, "06090C")], [(0, "1D3C7A"), (100, "04070F")], [(0, "5A4632"), (100, "080604")],
                [(0, "6E8EA8"), (100, "0A0E12")], [(0, "3A5A4A"), (100, "050807")]]
        for i, c in enumerate(cols):
            cx = x0 + i * (cw + gap)
            im = self.img(c.get("image"))
            if im:
                C.add_picture_cover(s, im, cx, 0.10, cw, 6.0)
            else:
                C.shape(s, "rect", cx, 0.10, cw, 6.0, grad=fall[i % len(fall)], grad_angle=90)
            C.shape(s, "rect", cx, 0.10, cw, 6.0, grad=[(0, "000000", 0.30), (38, "000000", 0.05), (66, "000000", 0.80), (88, "000000", 1.0)],
                    grad_angle=90)
            C.text(s, cx, 3.62, cw, 0.32, [{"text": c.get("label", "")}], font=self.F(size=12), align="center", anchor="middle")
            ry = 4.34
            C.shape(s, "ellipse", cx + cw / 2 - 0.28, ry - 0.28, 0.56, 0.56, fill="000000", alpha=0.35, line=CYAN, line_w=1.5)
            draw_icon(s, c.get("icon", "sparkle"), cx + cw / 2, ry, 0.32, WHITE, 1.1)
            C.shape(s, "ellipse", cx + cw / 2 - 0.03, 4.85, 0.06, 0.06, fill=CYAN)
            C.text(s, cx + 0.1, 5.03, cw - 0.2, 0.40, [{"text": c.get("title", "")}], font=self.F(size=16, bold=True), align="center",
                   anchor="middle", min_size=11)
            C.text(s, cx + 0.15, 5.45, cw - 0.3, 0.58, [{"text": l} for l in _lines(c.get("text"))], font=self.F(size=10, color="C8C8C8"),
                   align="center", anchor="top", min_size=7, spacing=1.35)
            if c.get("example"):
                C.text(s, cx + 0.1, 6.18, cw - 0.2, 0.34, [{"text": c["example"]}], font=self.F(size=10, color="C8C8C8"), align="center",
                       anchor="middle", min_size=7)
        self.headline(s, d.get("kicker"), d.get("title"), d.get("note"), y=0.72, x=3.0, w=C.SLIDE_W - 6.0)

    def page_split(self, s, d):
        self.dark_bg(s, d.get("bg", "plain"))
        if d.get("bg_image"):
            im = self.img(d["bg_image"])
            if im:
                C.add_picture_cover(s, im, 0, 0, C.SLIDE_W, C.SLIDE_H)
                C.shape(s, "rect", 0, 0, C.SLIDE_W, C.SLIDE_H, fill="000000", alpha=0.55)
        top = self.headline(s, d.get("kicker"), d.get("title"), d.get("note"))
        panels = d.get("panels", [])
        if not panels:
            return
        y = max(top + 0.25, d.get("body_top", 2.35))
        x, w = 0.75, C.SLIDE_W - 1.5
        h = (6.85 if d.get("source") else 7.15) - y
        gap = d.get("gap", 0.45)
        ws = [float(p.get("w", 1)) for p in panels]
        avail = w - gap * (len(panels) - 1)
        cx = x
        for i, p in enumerate(panels):
            pw = avail * ws[i] / sum(ws)
            self.panel(s, p, cx, y, pw, h)
            if i < len(panels) - 1 and d.get("divider", True):
                dx = cx + pw + gap / 2
                C.line(s, dx, y + 0.2, dx, y + h, grad=[(0, "FFFFFF", 0.0), (50, "FFFFFF", 0.45), (100, "FFFFFF", 0.0)], width=1.0)
            cx += pw + gap

    def page_stats(self, s, d):
        self.dark_bg(s, d.get("bg", "glow"))
        top = self.headline(s, d.get("kicker"), d.get("title"), d.get("note"), y=d.get("y", 1.6))
        size = d.get("size", 72)
        bh = size / 72.0 * 1.25 + 0.9
        by = top + max(0.4, (6.6 - top - bh) / 2.0)
        self.p_stats(s, {"items": d.get("items", []), "size": size}, 0.8, by, C.SLIDE_W - 1.6, bh)
        if d.get("text"):
            C.text(s, 2.0, by + bh + 0.2, C.SLIDE_W - 4.0, 0.8, [{"text": l} for l in _lines(d["text"])],
                   font=self.F(size=12, color="BFBFBF"), align="center", min_size=8, spacing=1.4)

    def page_media(self, s, d):
        C.bg_solid(s, "000000")
        poster = self.img(d.get("image") or d.get("poster"))
        vid = d.get("video")
        vp = C.resolve_image(vid, self.base_dir) if vid else None
        if vp:
            try:
                s.shapes.add_movie(vp, 0, 0, C.E(C.SLIDE_W), C.E(C.SLIDE_H), poster_frame_image=poster, mime_type="video/mp4")
            except Exception as e:
                C.warn("video embed failed: %s" % e)
                vp = None
        if not vp:
            if poster:
                C.add_picture_cover(s, poster, 0, 0, C.SLIDE_W, C.SLIDE_H)
            else:
                self._native_scene(s)
                draw_icon(s, "play", C.SLIDE_W / 2, C.SLIDE_H / 2, 1.1, WHITE, 2.0)
        C.shape(s, "rect", 0, 0, 7.5, 2.2, grad=[(0, "000000", 0.65), (100, "000000", 0.0)], grad_angle=0)
        if d.get("brand_block", True):
            self.brand_block(s)
        if d.get("title"):
            C.text(s, 1.0 if d.get("brand_block", True) else 0.6, 1.0, 9, 0.6, [{"text": d["title"], "shadow": ("000000", 6, 2, 0.6)}],
                   font=self.F(size=20, bold=True), anchor="middle")

    def page_feature(self, s, d):
        self.dark_bg(s, "plain")
        left = d.get("image_side", "left") == "left"
        im = self.img(d.get("image"))
        ix = 0 if left else C.SLIDE_W * 0.48
        iw = C.SLIDE_W * 0.52
        if im:
            C.add_picture_cover(s, im, ix, 0, iw, C.SLIDE_H)
        else:
            C.shape(s, "rect", ix, 0, iw, C.SLIDE_H, grad=[(0, "3A4048"), (100, "0A0C0E")], grad_angle=60)
            draw_icon(s, d.get("icon", "panel"), ix + iw / 2, C.SLIDE_H / 2, 2.2, "5A636D", 2.0)
        C.shape(s, "rect", ix + (iw - 2.6 if left else 0), 0, 2.6, C.SLIDE_H,
                grad=[(0, "000000", 0.0), (100, "000000", 1.0)] if left else [(0, "000000", 1.0), (100, "000000", 0.0)], grad_angle=0)
        tx = (iw + 0.3) if left else 0.8
        tw = C.SLIDE_W - iw - 1.1
        y = 1.2
        if d.get("kicker"):
            C.text(s, tx, y, tw, 0.36, [{"text": d["kicker"]}], font=self.F(size=14, color=CYAN, bold=True), autofit=True)
            y += 0.42
        C.text(s, tx, y, tw, 1.1, [{"text": d.get("title", "")}], font=self.F(size=28, bold=True), anchor="top", min_size=18, spacing=1.15)
        y += 1.25
        items = d.get("items", [])
        ih = min(1.05, (6.9 - y) / max(1, len(items)))
        for k, it in enumerate(items):
            it = it if isinstance(it, dict) else {"title": str(it)}
            cy = y + k * ih
            C.shape(s, "ellipse", tx, cy + 0.04, 0.50, 0.50, line=CYAN, line_w=1.25)
            draw_icon(s, it.get("icon", "check"), tx + 0.25, cy + 0.29, 0.28, WHITE, 1.0)
            C.text(s, tx + 0.68, cy, tw - 0.7, 0.34, [{"text": it.get("title", "")}], font=self.F(size=14, bold=True), anchor="middle")
            if it.get("text"):
                C.text(s, tx + 0.68, cy + 0.34, tw - 0.7, ih - 0.38, [{"text": it["text"]}], font=self.F(size=10.5, color="C8C8C8"),
                       spacing=1.3, min_size=7.5)

    def page_compare(self, s, d):
        self.dark_bg(s, "glow")
        top = self.headline(s, d.get("kicker"), d.get("title"), d.get("note"))
        self.p_compare(s, d, 1.0, top + 0.35, C.SLIDE_W - 2.0, 6.95 - top - 0.35)

    def page_closing(self, s, d):
        C.bg_solid(s, "000000")
        xs = [(0.0, 0.42, "101010"), (0.42, 2.0, "1A1A1A"), (2.42, 1.55, "121212"), (3.97, 2.6, "1C1C1C"), (6.57, 1.7, "141414"),
              (8.27, 2.9, "1A1A1A"), (11.17, 2.17, "0E0E0E")]
        for (x, w, c) in xs:
            C.shape(s, "rect", x, 0, w, C.SLIDE_H, grad=[(0, C.mix(c, "000000", 0.5)), (50, c), (100, C.mix(c, "000000", 0.6))], grad_angle=0)
        lg = self.logo("red")
        if lg:
            C.add_picture_fit(s, lg, 1.05, 1.55, 8.4, 3.15, align="left")
        C.shape(s, "rect", 3.97, 0, 0.55, C.SLIDE_H, grad=[(0, "000000", 0.0), (100, "000000", 0.55)], grad_angle=0)
        for k in range(3):
            C.polyline(s, [(1.56, 5.28 + k * 0.12), (1.62, 5.34 + k * 0.12), (1.68, 5.28 + k * 0.12)], color="D9D9D9", width=1.0)
        C.text(s, 1.02, 5.85, 6, 0.55, d.get("text", "Thank you"), font=self.F(size=18, color="BFBFBF"), autofit=False, ins=(0, 0, 0, 0))
        if d.get("subtitle"):
            C.text(s, 1.02, 6.4, 8, 0.4, d["subtitle"], font=self.F(size=11, color=GREY2), autofit=False, ins=(0, 0, 0, 0))

    # ------------------------------------------------------------------ panels
    def panel(self, s, p, x, y, w, h):
        t = p.get("type", "bullets")
        if p.get("title"):
            C.text(s, x, y, w, 0.36, [{"text": p["title"]}], font=self.F(size=13, bold=True), align=p.get("title_align", "center"),
                   anchor="middle", min_size=9)
            y += 0.42
            h -= 0.42
        fn = getattr(self, "p_" + t, None)
        if fn is None:
            C.warn("unknown product panel '%s'" % t)
            return
        fn(s, p, x, y, w, h)

    def _legend(self, s, series, x, y, w, size=9):
        items = []
        tot = 0
        for i, se in enumerate(series):
            nm = se.get("name", "") if isinstance(se, dict) else str(se)
            items.append(nm)
            tot += 0.22 + C.text_w_pt(nm, size) / 72.0 + 0.35
        cx = x + (w - tot) / 2
        for i, se in enumerate(series):
            nm = items[i]
            key = (se.get("color") if isinstance(se, dict) else None) or SERIES_ORDER[i % len(SERIES_ORDER)]
            C.shape(s, "rect", cx, y + 0.07, 0.11, 0.11, fill=SOLID.get(key, C.hexc(key)))
            tw = C.text_w_pt(nm, size) / 72.0 + 0.1
            C.text(s, cx + 0.16, y, tw + 0.1, 0.25, [{"text": nm}], font=self.F(size=size, color="D9D9D9"), autofit=False, wrap=False,
                   ins=(0, 0, 0, 0), anchor="middle")
            cx += 0.22 + tw + 0.35

    def p_bars3d(self, s, p, x, y, w, h):
        series = p.get("series", [{"name": "A"}, {"name": "B"}])
        groups = p.get("groups", [])
        ns = max(1, len(series))
        if p.get("legend", True):
            self._legend(s, series, x, y, w)
            y += 0.36
            h -= 0.36
        has_cap = any(g.get("title") or g.get("text") for g in groups)
        cap_h = 0.85 if has_cap else 0
        lbl_below = p.get("label_pos", "inside") == "below"
        base = y + h - cap_h - (0.32 if lbl_below else 0.12)
        top_room = 0.38 if p.get("value_labels", True) else 0.1
        chart_h = base - y - top_room
        vmax = p.get("max") or max([max([float(v) for v in g.get("values", [0])] or [0]) for g in groups] or [1]) or 1
        ng = max(1, len(groups))
        gw = w / ng
        bw = min(0.48, gw * 0.62 / ns)
        inner = p.get("bar_gap", 0.04)
        unit = p.get("unit", "")
        C.line(s, x, base, x + w, base, color="595959", width=0.75)
        for gi, g in enumerate(groups):
            gx = x + gi * gw
            total_w = ns * bw + (ns - 1) * inner
            bx0 = gx + (gw - total_w) / 2
            vals = g.get("values", [])
            for si, v in enumerate(vals[:ns]):
                se = series[si] if isinstance(series[si], dict) else {"name": str(series[si])}
                key = se.get("color") or SERIES_ORDER[si % len(SERIES_ORDER)]
                grad = BAR_GRADS.get(key) or [(0, C.mix(key, "FFFFFF", 0.35)), (100, C.hexc(key))]
                smax = float(se.get("max") or vmax)
                bh = max(0.06, chart_h * float(v) / smax * float(se.get("scale", 1.0)))
                bx = bx0 + si * (bw + inner)
                cap = min(0.09, bw * 0.28)
                C.shape(s, "can", bx, base - bh - cap / 2, bw, bh + cap / 2, grad=grad, grad_angle=90, adj=[int(cap / (bh + cap / 2) * 100000 * 1.0)] if bh > 0 else None)
                # reflection
                if p.get("reflection", True):
                    rh = min(bh * 0.55, h - (base - y) + cap_h - 0.02 if False else bh * 0.55)
                    C.shape(s, "rect", bx, base + 0.01, bw, min(rh, 0.9), grad=[(0, grad[-1][1], 0.35), (100, grad[-1][1], 0.0)], grad_angle=90)
                if p.get("value_labels", True):
                    lab = se.get("format", "{v}{u}").replace("{v}", _fmt(v)).replace("{u}", se.get("unit", unit))
                    C.text(s, bx - 0.25, base - bh - 0.34, bw + 0.5, 0.28, lab, font=self.F(size=p.get("value_size", 11), color="E6E6E6"),
                           align="center", anchor="bottom", autofit=False, ins=(0, 0, 0, 0), wrap=False)
            if g.get("label"):
                if lbl_below:
                    C.text(s, gx, base + 0.04, gw, 0.28, g["label"], font=self.F(size=11, color="D9D9D9"), align="center", anchor="middle",
                           autofit=False)
                else:
                    C.text(s, gx, base - 0.40, gw, 0.34, [{"text": g["label"], "shadow": ("000000", 4, 1, 0.6)}],
                           font=self.F(size=14, color=WHITE), align="center", anchor="middle", autofit=False)
            if has_cap:
                cy = y + h - cap_h + 0.08
                C.text(s, gx, cy, gw, 0.28, [{"text": g.get("title", "")}], font=self.F(size=11, bold=True), align="center", anchor="middle")
                C.text(s, gx + 0.05, cy + 0.30, gw - 0.1, cap_h - 0.36, [{"text": l} for l in _lines(g.get("text"))],
                       font=self.F(size=8.5, color="BFBFBF"), align="center", min_size=6.5, spacing=1.35)

    def p_area(self, s, p, x, y, w, h, kind="area"):
        from pptx.chart.data import CategoryChartData
        from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
        cats = p.get("categories", [])
        series = p.get("series", [])
        if not cats or not series:
            return
        band = kind == "area" and len(series) == 2 and p.get("band", True)
        if band:
            # robust "gain band": bottom = lower series, top = difference (stacked) -> renders identically everywhere
            s0, s1 = series[0], series[1]
            v0 = [float(v) for v in s0.get("values", [])]
            v1 = [float(v) for v in s1.get("values", [])]
            hi, lo, vh, vl = (s0, s1, v0, v1) if sum(v0) >= sum(v1) else (s1, s0, v1, v0)
            series = [dict(lo, values=vl), dict(hi, values=[a - b for a, b in zip(vh, vl)])]
            kind = "stack"
        cd = CategoryChartData()
        cd.categories = cats
        for se in series:
            cd.add_series(se.get("name", ""), [float(v) for v in se.get("values", [])])
        ct = {"area": XL_CHART_TYPE.AREA, "line": XL_CHART_TYPE.LINE_MARKERS, "stack": XL_CHART_TYPE.AREA_STACKED}[kind]
        extra_h = 0.0
        stats = p.get("stats")
        if stats:
            extra_h = min(1.35, h * 0.38)
        gf = s.shapes.add_chart(ct, C.E(x), C.E(y), C.E(w), C.E(h - extra_h), cd)
        ch = gf.chart
        ch.has_legend = p.get("legend", True)
        if ch.has_legend:
            ch.legend.position = XL_LEGEND_POSITION.BOTTOM
            ch.legend.include_in_layout = False
            ch.legend.font.size = C.Pt(9)
            ch.legend.font.color.rgb = _rgb("D9D9D9")
        ch.font.size = C.Pt(8)
        ch.font.color.rgb = _rgb("A6A6A6")
        ch.font.name = self.font.face
        va = ch.value_axis
        va.has_major_gridlines = False
        va.format.line.fill.background()
        if p.get("min") is not None:
            va.minimum_scale = float(p["min"])
        if p.get("max") is not None:
            va.maximum_scale = float(p["max"])
        va.tick_labels.font.size = C.Pt(8)
        if p.get("number_format"):
            va.tick_labels.number_format = p["number_format"]
            va.tick_labels.number_format_is_linked = False
        ca = ch.category_axis
        ca.format.line.color.rgb = _rgb("595959")
        ca.tick_labels.font.size = C.Pt(8)
        for i, se in enumerate(series):
            key = se.get("color") or SERIES_ORDER[i % len(SERIES_ORDER)]
            col = SOLID.get(key, C.hexc(key))
            ps = ch.plots[0].series[i]
            if kind in ("area", "stack"):
                ps.format.fill.solid()
                ps.format.fill.fore_color.rgb = _rgb(col)
                _alpha_fill(ps, se.get("alpha", 0.88))
                ps.format.line.color.rgb = _rgb(col)
            else:
                ps.format.line.color.rgb = _rgb(col)
                ps.format.line.width = C.Pt(2.25)
                ps.smooth = bool(se.get("smooth", False))
        # end labels
        labs = p.get("end_labels")
        if labs:
            for k, lb in enumerate(labs):
                key = lb.get("color", "cyan")
                C.text(s, x + w - 1.6, y + lb.get("y", 0.3 + k * 0.4) * (h - extra_h), 1.6, 0.36, [{"text": lb.get("text", "")}],
                       font=self.F(size=lb.get("size", 14 if k == 0 else 9), bold=k == 0, color=SOLID.get(key, C.hexc(key))),
                       align="right", anchor="middle", autofit=False, ins=(0, 0, 0, 0))
        if stats:
            self.p_stats(s, {"items": stats, "size": p.get("stats_size", 40)}, x, y + h - extra_h + 0.05, w, extra_h - 0.05)

    def p_line(self, s, p, x, y, w, h):
        self.p_area(s, p, x, y, w, h, kind="line")

    def p_tiles(self, s, p, x, y, w, h):
        items = p.get("items", [])
        cols = int(p.get("cols", 2))
        rows = int(math.ceil(len(items) / float(cols))) or 1
        g = 0.06
        tw = (w - g * (cols - 1)) / cols
        th = min(p.get("tile_h", 1.38), (h - g * (rows - 1)) / rows)
        oy = y + (h - th * rows - g * (rows - 1)) / 2
        for i, it in enumerate(items):
            r, c = divmod(i, cols)
            tx, ty = x + c * (tw + g), oy + r * (th + g)
            C.shape(s, "rect", tx, ty, tw, th, grad=[(0, "3C3C3C"), (55, "222222"), (100, "111111")], grad_path="circle", line="2A2A2A", line_w=0.5)
            C.text(s, tx, ty + th * 0.18, tw, 0.30, [{"text": it.get("label", "")}], font=self.F(size=10.5, color="A6A6A6"), align="center",
                   anchor="middle")
            C.shape(s, "ellipse", tx + tw / 2 - 0.025, ty + th * 0.18 + 0.34, 0.05, 0.05, fill=CYAN)
            C.text(s, tx + 0.05, ty + th * 0.18 + 0.44, tw - 0.1, th * 0.82 - 0.52, [{"text": l} for l in _lines(it.get("value", ""))],
                   font=self.F(size=p.get("value_size", 14)), align="center", anchor="top", min_size=8, spacing=1.2)

    def p_stats(self, s, p, x, y, w, h):
        items = p.get("items", [])
        n = max(1, len(items))
        cw = w / n
        size = p.get("size", 54)
        nh = min(h * 0.68, size / 72.0 * 1.25)
        for i, it in enumerate(items):
            cx = x + i * cw
            val = str(it.get("value", ""))
            style = it.get("style", p.get("style", "outline"))
            if style == "outline":
                para = {"text": val, "outline": ("FFFFFF", 1.25, [(0, "FFFFFF"), (100, "8C8C8C")]),
                        "grad": ([(0, "FFFFFF", 0.0), (100, "FFFFFF", 0.0)], 90)}
                C.text(s, cx, y, cw, nh, [para], font=self.F(size=size, bold=True), align="center", anchor="bottom", autofit=False,
                       wrap=False, ins=(0, 0, 0, 0))
            else:
                key = it.get("color", "gold")
                grad = BAR_GRADS.get(key, BAR_GRADS["gold"])
                C.text(s, cx, y, cw, nh, [{"text": val, "grad": (grad, 90)}], font=self.F(size=size, bold=True), align="center",
                       anchor="bottom", autofit=False, wrap=False, ins=(0, 0, 0, 0))
            C.text(s, cx + 0.05, y + nh + 0.02, cw - 0.1, max(0.3, h - nh - 0.02), [{"text": it.get("label", "")}],
                   font=self.F(size=p.get("label_size", 13), bold=True), align="center", anchor="top", min_size=8)

    def p_bullets(self, s, p, x, y, w, h):
        items = p.get("items", [])
        paras = []
        for it in items:
            if isinstance(it, dict):
                paras.append({"text": "**%s**  %s" % (it.get("title", ""), it.get("text", "")) if it.get("title") else it.get("text", ""),
                              "bullet": True, "bullet_color": CYAN})
            else:
                paras.append({"text": str(it), "bullet": True, "bullet_color": CYAN})
        C.text(s, x, y, w, h, paras, font=self.F(size=p.get("size", 13), color="D9D9D9", em_color=WHITE), spacing=1.4, space_after=6,
               anchor=p.get("anchor", "middle"), min_size=8)

    def p_text(self, s, p, x, y, w, h):
        C.text(s, x, y, w, h, [{"text": l} for l in _lines(p.get("text"))], font=self.F(size=p.get("size", 13), color="D9D9D9",
               em_color=WHITE), spacing=1.4, align=p.get("align", "left"), anchor=p.get("anchor", "middle"), min_size=8)

    def p_image(self, s, p, x, y, w, h):
        im = self.img(p.get("image"))
        cap = 0.3 if p.get("caption") else 0
        if im:
            if p.get("fit", "cover") == "cover":
                C.add_picture_cover(s, im, x, y, w, h - cap)
            else:
                C.add_picture_fit(s, im, x, y, w, h - cap)
        else:
            C.shape(s, "rect", x, y, w, h - cap, grad=[(0, "2E3338"), (100, "0D0F11")], grad_angle=90, line="3A3F45", line_w=0.75, dash="dash")
            draw_icon(s, p.get("icon", "eye"), x + w / 2, y + (h - cap) / 2 - 0.15, 0.55, "6B737B", 1.4)
            C.text(s, x, y + (h - cap) / 2 + 0.2, w, 0.4, p.get("placeholder", u"产品图 / 实拍图占位"), font=self.F(size=10, color="8C8C8C"),
                   align="center", autofit=False)
        if cap:
            C.text(s, x, y + h - cap + 0.02, w, cap, [{"text": p["caption"]}], font=self.F(size=9, color="A6A6A6"), align="center")

    def p_icons(self, s, p, x, y, w, h):
        items = p.get("items", [])
        n = max(1, len(items))
        cols = int(p.get("cols", n))
        rows = int(math.ceil(n / float(cols)))
        cw = w / cols
        ch = h / rows
        for i, it in enumerate(items):
            r, c = divmod(i, cols)
            cx, cy = x + c * cw, y + r * ch
            C.shape(s, "ellipse", cx + cw / 2 - 0.34, cy + 0.05, 0.68, 0.68, line=CYAN, line_w=1.5)
            draw_icon(s, it.get("icon", "check"), cx + cw / 2, cy + 0.39, 0.38, WHITE, 1.1)
            C.shape(s, "ellipse", cx + cw / 2 - 0.03, cy + 0.84, 0.06, 0.06, fill=CYAN)
            C.text(s, cx + 0.05, cy + 0.95, cw - 0.1, 0.36, [{"text": it.get("title", "")}], font=self.F(size=14, bold=True), align="center",
                   anchor="middle")
            C.text(s, cx + 0.1, cy + 1.33, cw - 0.2, ch - 1.4, [{"text": l} for l in _lines(it.get("text"))], font=self.F(size=10, color="BFBFBF"),
                   align="center", min_size=7, spacing=1.35)

    def p_compare(self, s, p, x, y, w, h):
        rows = p.get("rows", [])
        cols = p.get("columns", [u"对比项", u"常规方案", u"本方案"])
        if not rows:
            return
        nc = len(cols)
        lw = w * 0.28
        cw = (w - lw) / (nc - 1)
        rh = min(0.62, (h - 0.55) / len(rows))
        hl = p.get("highlight", nc - 1)
        # highlight column frame
        hx = x + lw + (hl - 1) * cw
        C.shape(s, "round", hx + 0.04, y - 0.05, cw - 0.08, 0.55 + rh * len(rows) + 0.1, fill="1A1A1A", line=RED, line_w=1.5, adj=[3000])
        for j, c in enumerate(cols):
            cx = x if j == 0 else x + lw + (j - 1) * cw
            ww = lw if j == 0 else cw
            C.text(s, cx, y, ww, 0.5, [{"text": c}], font=self.F(size=15, bold=True, color=WHITE if j == hl else ("BFBFBF" if j else GREY2)),
                   align="center" if j else "left", anchor="middle")
        for i, r in enumerate(rows):
            ry = y + 0.55 + i * rh
            C.line(s, x, ry, x + w, ry, color="333333", width=0.75)
            for j, v in enumerate(r[:nc]):
                cx = x if j == 0 else x + lw + (j - 1) * cw
                ww = lw if j == 0 else cw
                v = str(v)
                if v in ("Y", "y", u"✓", "yes", "true"):
                    draw_icon(s, "check", cx + ww / 2, ry + rh / 2, 0.3, "3CC873" if j == hl else "8C8C8C", 1.6)
                elif v in ("N", "n", u"✗", "no", "false"):
                    C.polyline(s, [(cx + ww / 2 - 0.1, ry + rh / 2 - 0.1), (cx + ww / 2 + 0.1, ry + rh / 2 + 0.1)], color="8C8C8C", width=1.5)
                    C.polyline(s, [(cx + ww / 2 + 0.1, ry + rh / 2 - 0.1), (cx + ww / 2 - 0.1, ry + rh / 2 + 0.1)], color="8C8C8C", width=1.5)
                else:
                    C.text(s, cx + 0.06, ry, ww - 0.12, rh, [{"text": v}], font=self.F(size=12 if j else 12, bold=(j == hl or j == 0),
                           color=WHITE if j == hl else ("D9D9D9" if j == 0 else "A6A6A6")), align="center" if j else "left", anchor="middle",
                           min_size=8)


def _fmt(v):
    try:
        f = float(v)
        if abs(f - int(f)) < 1e-9:
            return str(int(f))
        return ("%.2f" % f).rstrip("0").rstrip(".")
    except Exception:
        return str(v)


def _rgb(h):
    from pptx.dml.color import RGBColor
    return RGBColor.from_string(C.hexc(h))


def _alpha_fill(series, alpha):
    from pptx.oxml.ns import qn
    from lxml import etree
    spPr = series._element.find(qn("c:spPr"))
    if spPr is None:
        return
    sf = spPr.find(qn("a:solidFill"))
    if sf is None or not len(sf):
        return
    clr = sf[0]
    for a in clr.findall(qn("a:alpha")):
        clr.remove(a)
    a = etree.SubElement(clr, qn("a:alpha"))
    a.set("val", str(int(alpha * 100000)))
