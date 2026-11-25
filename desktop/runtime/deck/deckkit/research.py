# -*- coding: utf-8 -*-
"""Theme `research` - QuanK investment-research deck (native editable shapes, charts and tables).

Page types: cover / summary / company / financials / valuation / chart / signals /
catalysts_risks / event / disclaimer.  Visual language follows the light `report`
theme (numbered titles, tinted header bars, rounded panels, zebra tables) but the
palette is QuanK: royal blue 2F62F5, deep blue 0B2BA6 / 14213D, light blue-grey EEF2FF.
No third-party logos, photos or marks are used.
"""
from __future__ import division
import re
from lxml import etree

from . import core as C

BLUE = "2F62F5"
DEEP = "0B2BA6"
NAVY = "14213D"
VIOLET = "8C7CFF"
LIGHT = "EEF2FF"
PALE = "F5F8FF"
MIST = "E3ECFF"
LINE = "DCE3F5"
TEXT = "1F2937"
MUTED = "6B7591"
RED = "C8102E"
GREEN = "0E9F6E"

DISCLAIMER_TEXT = (
    "本报告由 QuanK 依据公开数据与本机量化引擎自动生成，仅供研究与内部交流，不构成任何投资建议。"
    "报告中的数据、观点与测算可能随市场变化而调整，QuanK 不对信息的完整性、准确性或及时性作任何保证。"
    "投资者应独立判断并自行承担投资风险。历史数据与回测结果不代表未来表现。"
)


def _rows(v):
    if v is None:
        return []
    if isinstance(v, dict):
        return v.get("rows") or []
    if isinstance(v, (list, tuple)):
        return [list(r) if isinstance(r, (list, tuple)) else [r] for r in v]
    return [[str(v)]]


def _pts(v):
    if v is None:
        return []
    if isinstance(v, (list, tuple)):
        return [x if isinstance(x, dict) else {"text": str(x)} for x in v]
    return [{"text": str(v)}]


def _num(v):
    try:
        return float(str(v).replace(",", "").replace("%", "").replace("+", ""))
    except Exception:
        return None


class ResearchTheme(object):
    name = "research"

    def __init__(self, brand, base_dir=None, source_as_of="数据读取时间", warnings=None, mask_amounts=False,
                 sources=None, watermark=None):
        self.b = brand or {}
        self.base_dir = base_dir
        self.source_as_of = source_as_of or "数据读取时间"
        self.warnings = warnings if warnings is not None else []
        self.mask_amounts = bool(mask_amounts)
        self.sources = [str(x) for x in (sources or []) if str(x).strip()]
        self.watermark = watermark
        self.font = C.Font(face=self.b.get("font", "PingFang SC"), latin=self.b.get("latin_font"),
                           size=10, color=TEXT, em_color=BLUE, hl_color=BLUE)
        self.page = 0
        self.total = 0
        self.page_sources = []
        self.page_as_of = None

    def F(self, **kw):
        return self.font.copy(**kw)

    # ---------------------------------------------------------------- chrome
    def page_bg(self, s):
        C.bg_grad(s, [(0, "FFFFFF"), (55, PALE), (100, MIST)], path="circle")

    def chrome(self, s, section=None, footnote=True):
        self.page_bg(s)
        C.shape(s, "rect", 0, 0, 13.333, 0.055, fill=BLUE)
        lg = C.asset_path("quank_logo.png")
        if lg:
            C.add_picture_fit(s, lg, 0.34, 0.18, 0.32, 0.32, align="left")
        C.text(s, 0.76, 0.19, 1.55, 0.30, "QuanK 投研", font=self.F(size=11, color=DEEP, bold=True),
               autofit=False, wrap=False, ins=(0, 0, 0, 0))
        if section:
            C.text(s, 11.10, 0.19, 1.85, 0.30, str(section), font=self.F(size=9, color=MUTED), align="right",
                   autofit=False, wrap=False, ins=(0, 0, 0, 0))
        C.line(s, 0.36, 0.61, 12.97, 0.61, color=LINE, width=0.75)
        if footnote and self.b.get("source_footnote", True) and self.page_sources:
            source = " / ".join(dict.fromkeys(self.page_sources))
            asof = self.page_as_of or self.source_as_of
            text = "数据来源：%s · 截至 %s" % (source, asof)
            C.text(s, 0.36, 7.10, 11.6, 0.24, text,
                   font=self.F(size=8, color=MUTED), autofit=False, wrap=False, ins=(0, 0, 0, 0))
        if self.b.get("page_numbers", True):
            C.text(s, 12.20, 7.08, 0.75, 0.26, "%d / %d" % (self.page, self.total),
                   font=self.F(size=8, color=MUTED), align="right", autofit=False, wrap=False, ins=(0, 0, 0, 0))

    def title(self, s, text_, y=0.74, size=21):
        C.shape(s, "rect", 0.36, y + 0.02, 0.055, 0.34, fill=BLUE)
        C.text(s, 0.55, y, 11.9, 0.42, [{"text": str(text_)}], font=self.F(size=size, color=NAVY, bold=True),
               autofit=True, min_size=14, anchor="middle", name="Title")

    def lead(self, s, text_, y=1.18):
        if not text_:
            return
        C.text(s, 0.40, y, 12.50, 0.36, [{"text": str(text_)}], font=self.F(size=10.5, color=MUTED),
               autofit=True, min_size=8, anchor="middle")

    def panel(self, s, x, y, w, h, title=None, fill="FFFFFF", bar=BLUE):
        C.shape(s, "round", x, y, w, h, fill=fill, line=LINE, line_w=0.75, adj=[5000])
        if title:
            C.shape(s, "round", x, y, w, 0.36, fill=bar, adj=[16000])
            C.text(s, x + 0.14, y + 0.02, w - 0.28, 0.32, [{"text": str(title)}],
                   font=self.F(size=10.5, color="FFFFFF", bold=True), autofit=False, anchor="middle", ins=(0, 0, 0, 0))

    def kpi(self, s, x, y, w, h, value, label, note=None, accent=BLUE):
        C.shape(s, "round", x, y, w, h, fill="FFFFFF", line=LINE, line_w=0.75, adj=[7000])
        C.shape(s, "rect", x, y + 0.10, 0.045, h - 0.20, fill=accent)
        C.text(s, x + 0.18, y + 0.10, w - 0.30, h * 0.48, [{"text": str(value)}],
               font=self.F(size=19, color=accent, bold=True), autofit=True, min_size=10, anchor="middle")
        C.text(s, x + 0.18, y + h * 0.55, w - 0.30, 0.26, [{"text": str(label)}],
               font=self.F(size=9.5, color=TEXT, bold=True), autofit=True, min_size=8, anchor="middle")
        if note:
            C.text(s, x + 0.18, y + h * 0.76, w - 0.30, h * 0.20, [{"text": str(note)}],
                   font=self.F(size=7.5, color=MUTED), autofit=True, min_size=6.5, anchor="middle")

    def table(self, s, rows, x, y, w, h, widths=None, header=True, zebra=True,
              negative="red", unit=None, font_size=9.0):
        from pptx.dml.color import RGBColor
        rows = _rows(rows)
        if not rows:
            C.text(s, x, y, w, h, "—", font=self.F(size=11, color=MUTED), anchor="middle")
            return None
        nrow, ncol = len(rows), max(len(r) for r in rows)
        rows = [list(r) + [""] * (ncol - len(r)) for r in rows]
        data_h, head_h = 0.40, 0.48  # header ~1.2x data row; table does not fill the page vertically
        total_h = head_h + data_h * max(nrow - 1, 0)
        shp = s.shapes.add_table(nrow, ncol, C.E(x), C.E(y), C.E(w), C.E(total_h))
        tbl = shp.table
        tbl.rows[0].height = C.E(head_h)
        for ri in range(1, nrow):
            tbl.rows[ri].height = C.E(data_h)
        if widths and len(widths) == ncol:
            total = float(sum(widths)) or 1
            for i, ww in enumerate(widths):
                tbl.columns[i].width = C.E(w * ww / total)
        neg_color = GREEN if str(negative).lower() == "green" else RED
        for ri, row in enumerate(rows):
            for ci, val in enumerate(row):
                cell = tbl.cell(ri, ci)
                txt = "" if val is None else str(val)
                nv = _num(txt)
                is_neg = nv is not None and nv < 0
                bg = BLUE if (header and ri == 0) else (PALE if (zebra and ri % 2 == 0) else "FFFFFF")
                cell.fill.solid()
                cell.fill.fore_color.rgb = RGBColor.from_string(bg)
                cell.margin_left = C.E(0.06); cell.margin_right = C.E(0.06)
                cell.margin_top = C.E(0.02); cell.margin_bottom = C.E(0.02)
                cell.vertical_anchor = 3
                tf = cell.text_frame
                tf.word_wrap = True
                p = tf.paragraphs[0]
                from pptx.enum.text import PP_ALIGN
                p.alignment = PP_ALIGN.LEFT if ci == 0 else PP_ALIGN.RIGHT
                r = p.add_run(); r.text = txt
                color = "FFFFFF" if (header and ri == 0) else (neg_color if is_neg else TEXT)
                bold = (header and ri == 0) or (ci == 0 and not header)
                C._apply_run(r, self.F(size=font_size), font_size, color, bold)
        return shp

    def bullets(self, s, x, y, w, h, items, size=10, marker=BLUE, numbered=False):
        items = _pts(items)
        if not items:
            C.text(s, x, y, w, h, "—", font=self.F(size=10, color=MUTED), anchor="middle")
            return
        step = h / max(len(items), 1)
        for i, it in enumerate(items[:8]):
            yy = y + i * step
            if numbered:
                C.shape(s, "ellipse", x, yy + 0.03, 0.26, 0.26, fill=marker)
                C.text(s, x, yy + 0.03, 0.26, 0.26, str(i + 1), font=self.F(size=8, color="FFFFFF", bold=True),
                       align="center", anchor="middle", autofit=False, ins=(0, 0, 0, 0))
            else:
                C.shape(s, "rect", x, yy + 0.09, 0.07, 0.07, fill=marker)
            C.text(s, x + 0.34, yy, w - 0.34, step - 0.03,
                   [{"text": it.get("text", "") if isinstance(it, dict) else str(it)}],
                   font=self.F(size=size, color=TEXT, bold=bool(it.get("bold")) if isinstance(it, dict) else False),
                   autofit=True, min_size=7.5, anchor="middle")

    # ------------------------------------------------------------------ pages
    def render(self, prs, spec, total=1):
        self.page += 1
        self.total = total
        lay = spec.get("layout", "summary")
        s = C.blank_slide(prs)
        fn = getattr(self, "page_" + lay, None)
        if fn is None:
            C.warn("unknown research layout '%s', rendered as summary" % lay)
            fn = self.page_summary
        fn(s, spec)
        wm = self.watermark or spec.get("watermark")
        if wm:
            C.text(s, 8.9, 6.74, 3.9, 0.26, str(wm), font=self.F(size=9, color="C8102E", bold=True),
                   align="right", autofit=False, wrap=False, ins=(0, 0, 0, 0))
        if spec.get("notes"):
            s.notes_slide.notes_text_frame.text = spec["notes"]
        return s

    def page_cover(self, s, d):
        C.bg_grad(s, [(0, "06133F"), (45, DEEP), (100, BLUE)], 120)
        C.shape(s, "ellipse", 7.2, -2.8, 10.2, 9.4,
                grad=[(0, BLUE, 0.16), (55, DEEP, 0.05), (100, DEEP, 0.0)], grad_path="circle")
        for i, r in enumerate((2.6, 3.5, 4.4)):
            pts = C.arc_pts(10.9, 3.5, r, 200, 340, 26)
            C.polyline(s, pts, color="6B8CFF" if i == 0 else "3D63C8", width=1.0)
        C.shape(s, "rect", 0, 0, 13.333, 0.07, fill=BLUE)
        lg = C.asset_path("quank_logo_white.png")
        if lg:
            C.add_picture_fit(s, lg, 0.65, 0.42, 0.52, 0.52, align="left")
        C.text(s, 1.32, 0.50, 3.5, 0.36, "QuanK 投研 · RESEARCH", font=self.F(size=12, color="C7D2FE", bold=True),
               autofit=False, wrap=False, ins=(0, 0, 0, 0))
        C.text(s, 0.68, 1.62, 11.9, 1.70, [{"text": d.get("title", "投资研究报告")}],
               font=self.F(size=37, color="FFFFFF", bold=True), autofit=True, min_size=24, anchor="middle", spacing=1.10)
        C.shape(s, "rect", 0.72, 3.50, 1.05, 0.05, fill="8FB0FF")
        meta = []
        if d.get("stockName"):
            meta.append("%s（%s）" % (d.get("stockName"), d.get("code", "")))
        if d.get("industry"):
            meta.append(d.get("industry"))
        if d.get("date"):
            meta.append(str(d.get("date")))
        if d.get("author"):
            meta.append("作者：" + str(d.get("author")))
        if meta:
            C.text(s, 0.72, 3.80, 11.8, 1.10, [{"text": m} for m in meta], font=self.F(size=14, color="DCE6FF"),
                   spacing=1.45, min_size=10, anchor="top")
        C.shape(s, "rect", 0, 6.72, 13.333, 0.42, fill=DEEP, alpha=0.55)
        C.text(s, 0.72, 6.80, 11.8, 0.26, d.get("disclaimer", "仅供研究，不构成投资建议"),
               font=self.F(size=9, color="FFFFFF"), autofit=False, wrap=False, ins=(0, 0, 0, 0))

    def page_summary(self, s, d):
        self.chrome(s, d.get("section") or "核心观点")
        self.title(s, d.get("title", "核心观点"))
        self.lead(s, d.get("lead"))
        pts = _pts(d.get("points"))
        if len(pts) > 5:
            self.warnings.append("核心观点超过 5 条，已截断")
            pts = pts[:5]
        y0 = 1.62 if d.get("lead") else 1.30
        self.panel(s, 0.36, y0, 8.15, 6.95 - y0, "核心结论")
        self.bullets(s, 0.62, y0 + 0.52, 7.66, 6.75 - y0, pts, size=11, numbered=True)
        kpis = d.get("kpis") or []
        if kpis:
            ky = y0
            kh = (6.95 - y0 - 0.12 * (len(kpis) - 1)) / len(kpis)
            for k in kpis:
                if isinstance(k, dict):
                    self.kpi(s, 8.72, ky, 4.25, kh, k.get("value", "—"), k.get("label", ""), k.get("note"))
                else:
                    self.kpi(s, 8.72, ky, 4.25, kh, k, "关键数据")
                ky += kh + 0.12
        else:
            self.panel(s, 8.72, y0, 4.25, 6.95 - y0, "关键数字")
            C.text(s, 8.94, y0 + 0.6, 3.8, 1.0, "—", font=self.F(size=13, color=MUTED), anchor="middle")

    def page_company(self, s, d):
        self.chrome(s, d.get("section") or "公司概况")
        self.title(s, d.get("title", "公司概况与业务结构"))
        self.lead(s, d.get("lead"))
        y0 = 1.62 if d.get("lead") else 1.30
        self.panel(s, 0.36, y0, 5.55, 6.95 - y0, "公司概况")
        self.bullets(s, 0.62, y0 + 0.52, 5.05, 6.75 - y0, _pts(d.get("profile") or d.get("points")), size=10.5)
        segs = d.get("segments") or d.get("business") or []
        self.panel(s, 6.10, y0, 6.87, 6.95 - y0, "业务结构")
        if segs:
            n = min(len(segs), 6)
            gap = 0.14
            hh = (6.95 - y0 - 0.52 - gap * (n - 1)) / n
            cy = y0 + 0.52
            for i, sg in enumerate(segs):
                if isinstance(sg, dict):
                    name, desc = sg.get("name", sg.get("title", "")), sg.get("desc", sg.get("body", ""))
                    pct = sg.get("share", "")
                else:
                    name, desc, pct = str(sg), "", ""
                C.shape(s, "round", 6.36, cy, 6.35, hh, fill=PALE, line=LINE, line_w=0.75, adj=[8000])
                C.shape(s, "rect", 6.36, cy, 0.055, hh, fill=[BLUE, VIOLET, DEEP][i % 3])
                C.text(s, 6.55, cy + 0.03, 3.0, hh - 0.06, [{"text": str(name)}],
                       font=self.F(size=11, color=NAVY, bold=True), anchor="middle", autofit=True, min_size=8)
                if desc:
                    C.text(s, 9.45, cy + 0.03, 2.35, hh - 0.06, [{"text": str(desc) + ("  " + str(pct) if pct else "")}],
                           font=self.F(size=9, color=MUTED), anchor="middle", autofit=True, min_size=7)
                cy += hh + gap
        else:
            C.text(s, 6.40, y0 + 0.7, 6.2, 1.0, "—", font=self.F(size=13, color=MUTED), anchor="middle")

    def _finance_charts(self, s, rows, x, y, w, h, negative="red"):
        from pptx.chart.data import CategoryChartData
        from pptx.dml.color import RGBColor
        from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION, XL_TICK_LABEL_POSITION
        from pptx.util import Pt

        def num(v):
            try:
                return float(str(v).replace(',', '').replace('%', '').strip())
            except Exception:
                return None

        if not rows or len(rows[0]) < 2:
            return
        cats = [str(c) for c in rows[0][1:]]

        def row(i):
            return [num(v) for v in rows[i][1:]] if len(rows) > i else []

        revenue, profit, margin = row(1), row(2), row(3)
        gap = 0.24
        cw = (w - gap * 2) / 3.0
        neg_color = RED  # page_financials 已按 negativeColor 解析；如需绿色由调用方替换常量
        money = '#,##0;-#,##0;0'
        money_label = '#,##0.0;-#,##0.0;'  # 第三段留空：0 值不显示标签（堆积柱的占位 0）
        panels = []
        if any(v is not None for v in revenue):
            panels.append(("营业收入（亿元）", XL_CHART_TYPE.COLUMN_CLUSTERED, money, money_label,
                           [("营业收入", revenue, BLUE)]))
        if any(v is not None for v in profit):
            panels.append(("归母净利润（亿元）", XL_CHART_TYPE.COLUMN_STACKED, money, money_label,
                           [("盈利", [v if (v is not None and v >= 0) else 0 for v in profit], VIOLET),
                            ("亏损", [v if (v is not None and v < 0) else 0 for v in profit], neg_color)]))
        if any(v is not None for v in margin):
            panels.append(("毛利率", XL_CHART_TYPE.LINE_MARKERS, '0%', '0.0%',
                           [("毛利率", [(v / 100.0) if v is not None else None for v in margin], "E4A854")]))
        if not panels:
            return
        cw = (w - gap * (len(panels) - 1)) / float(len(panels))

        for i, (title, kind, axis_fmt, label_fmt, series) in enumerate(panels):
            px = x + i * (cw + gap)
            C.text(s, px, y, cw, 0.24, title, font=self.F(size=9, color=NAVY, bold=True),
                   autofit=False, ins=(0, 0, 0, 0))
            cd = CategoryChartData()
            cd.categories = cats
            for name, values, _ in series:
                cd.add_series(name, values, number_format=label_fmt)
            frame = s.shapes.add_chart(kind, C.E(px), C.E(y + 0.26), C.E(cw), C.E(h - 0.26), cd)
            ch = frame.chart
            ch.has_title = False
            ch.has_legend = False
            ch.font.size = Pt(8)
            ch.font.name = self.F(size=8).get("name") if isinstance(self.F(size=8), dict) else None or ch.font.name

            va, ca = ch.value_axis, ch.category_axis
            va.has_major_gridlines = True
            va.major_gridlines.format.line.color.rgb = RGBColor.from_string("E6ECF6")
            va.format.line.fill.background()
            va.tick_labels.font.size = Pt(8)
            va.tick_labels.font.color.rgb = RGBColor.from_string(MUTED)
            va.tick_labels.number_format = axis_fmt
            va.tick_labels.number_format_is_linked = False
            ca.tick_labels.font.size = Pt(8)
            ca.tick_labels.font.color.rgb = RGBColor.from_string(MUTED)
            ca.tick_label_position = XL_TICK_LABEL_POSITION.LOW  # 年份始终在图底，负柱不压字
            ca.format.line.color.rgb = RGBColor.from_string("C9D3E3")
            if kind == XL_CHART_TYPE.LINE_MARKERS:
                va.minimum_scale = 0

            plot = ch.plots[0]
            if kind != XL_CHART_TYPE.LINE_MARKERS:
                plot.gap_width = 80
            if kind == XL_CHART_TYPE.COLUMN_STACKED:
                plot.overlap = 100
            for j, (name, _, color) in enumerate(series):
                ser = plot.series[j]
                rgb = RGBColor.from_string(color)
                if kind == XL_CHART_TYPE.LINE_MARKERS:
                    ser.format.line.color.rgb = rgb
                    ser.format.line.width = Pt(2.0)
                    ser.smooth = False
                    ser.marker.size = 6
                    ser.marker.format.fill.solid()
                    ser.marker.format.fill.fore_color.rgb = rgb
                    ser.marker.format.line.color.rgb = rgb
                else:
                    ser.format.fill.solid()
                    ser.format.fill.fore_color.rgb = rgb
                    ser.format.line.fill.background()
                    # 最小适配：Quick 原稿不写 invertIfNegative；LO 无该元素时把负值向上画。
                    # 无 dPt 的前提下显式写 0，负值回到 0 轴下方（已做像素对照实验验证）。
                    ser.invert_if_negative = False
                    if name == '亏损':
                        # 深字压在红柱上看不清；亏损系列标签单独用白字（保留 plot 级其它系列TEXT色）。
                        ser.data_labels.font.color.rgb = RGBColor.from_string('FFFFFF')
                # 不写 dPt

            plot.has_data_labels = True
            dl = plot.data_labels
            dl.font.size = Pt(8)
            dl.font.color.rgb = RGBColor.from_string(TEXT)
            dl.number_format = label_fmt
            dl.number_format_is_linked = False
            if kind == XL_CHART_TYPE.COLUMN_CLUSTERED:
                dl.position = XL_LABEL_POSITION.OUTSIDE_END
            elif kind == XL_CHART_TYPE.LINE_MARKERS:
                dl.position = XL_LABEL_POSITION.ABOVE
            # 堆积柱：用默认（居中）；0 值由 label_fmt 第三段隐藏

    def page_financials(self, s, d):
        self.chrome(s, d.get("section") or "财务摘要")
        self.title(s, d.get("title", "财务摘要"))
        unit = d.get("unit") or "亿元"
        note_parts = ["单位：%s" % unit, "2025 为年报实际值"]
        if d.get("negativeColor") in ("green", "red"):
            note_parts.append("负数：%s" % ("绿色" if d["negativeColor"] == "green" else "红色"))
        C.text(s, 0.40, 1.12, 12.4, 0.26, " · ".join(note_parts), font=self.F(size=8.5, color=MUTED),
               autofit=False, wrap=False, ins=(0, 0, 0, 0))
        rows = _rows(d.get("rows") or d.get("table"))
        if not rows or (len(rows) == 1 and len(rows[0]) == 1 and str(rows[0][0]).strip() in ("", "—")):
            C.text(s, 0.4, 2.5, 12.4, 1.0, "—（未取得财务数据）", font=self.F(size=13, color=MUTED), anchor="middle")
            return
        self.table(s, rows, 0.36, 1.48, 12.6, 3.20, negative=d.get("negativeColor", "red"), font_size=10.5)
        self._finance_charts(s, rows, 0.36, 3.86, 12.6, 2.42, negative=d.get("negativeColor", "red"))
        if d.get("takeaway"):
            C.text(s, 0.40, 6.42, 12.4, 0.30, [{"text": str(d["takeaway"])}],
                   font=self.F(size=8.5, color=MUTED), autofit=True, min_size=7, anchor="middle")

    def page_valuation(self, s, d):
        self.chrome(s, d.get("section") or "估值分析")
        self.title(s, d.get("title", "估值与可比公司"))
        self.lead(s, d.get("lead"))
        y0 = 1.62 if d.get("lead") else 1.30
        self.panel(s, 0.36, y0, 4.55, 6.95 - y0, "历史估值分位")
        pcts = d.get("percentiles") or []
        if pcts:
            cy = y0 + 0.60
            for i, it in enumerate(pcts[:5]):
                if isinstance(it, dict):
                    name = it.get("name", "")
                    raw = it.get("value", it.get("percentile"))
                    val = _num(raw)
                else:
                    name, val = str(it), None
                C.text(s, 0.62, cy, 1.5, 0.28, name, font=self.F(size=10, color=TEXT, bold=True),
                       autofit=False, ins=(0, 0, 0, 0))
                if isinstance(it, dict) and it.get("current") is not None:
                    C.text(s, 2.55, cy + 0.26, 1.72, 0.28, "%.2f" % float(it["current"]),
                           font=self.F(size=12, color=DEEP, bold=True), align="right", autofit=False, ins=(0, 0, 0, 0))
                    if it.get("note"):
                        C.text(s, 0.62, cy + 0.56, 3.6, 0.22, str(it["note"]), font=self.F(size=7.5, color=MUTED),
                               autofit=False, ins=(0, 0, 0, 0))
                elif val is None:
                    C.text(s, 3.35, cy + 0.24, 0.92, 0.28, "—", font=self.F(size=10, color=MUTED),
                           align="right", autofit=False, ins=(0, 0, 0, 0))
                else:
                    C.shape(s, "round", 0.62, cy + 0.31, 3.65, 0.20, fill="E9EEF7", adj=[40000])
                    C.shape(s, "round", 0.62, cy + 0.31, 3.65 * max(0, min(100, val)) / 100.0, 0.20,
                            fill=[BLUE, VIOLET, DEEP][i % 3], adj=[40000])
                    C.text(s, 3.95, cy, 0.32, 0.28, "%d%%" % int(val), font=self.F(size=9, color=DEEP, bold=True),
                           align="right", autofit=False, ins=(0, 0, 0, 0))
                cy += 0.92
        else:
            C.text(s, 0.60, y0 + 0.8, 3.9, 0.8, "—", font=self.F(size=13, color=MUTED), anchor="middle")
        self.panel(s, 5.10, y0, 7.87, 6.95 - y0, "可比公司")
        rows = _rows(d.get("peers") or d.get("table"))
        if rows:
            self.table(s, rows, 5.30, y0 + 0.50, 7.47, 6.20 - y0, font_size=8.8)
        else:
            C.text(s, 5.40, y0 + 0.8, 7.2, 0.8, "—", font=self.F(size=13, color=MUTED), anchor="middle")

    def _kline_shapes(self, s, series, cats, y0, up_color, down_color):
        bars = [p for p in series if isinstance(p, dict)]
        if not bars:
            C.text(s, 0.5, y0 + 1.0, 12.3, 1.0, "—（K线数据不可用）", font=self.F(size=13, color=MUTED), anchor="middle")
            return
        data = []
        for i, p in enumerate(bars):
            try:
                o, h, l, c = [float(p[k]) for k in ("open", "high", "low", "close")]
                data.append({"o": o, "h": h, "l": l, "c": c, "v": float(p.get("volume") or 0),
                             "date": str(cats[i]) if i < len(cats) else str(p.get("date") or "")})
            except Exception:
                continue
        if not data:
            C.text(s, 0.5, y0 + 1.0, 12.3, 1.0, "—（K线数据不可用）", font=self.F(size=13, color=MUTED), anchor="middle")
            return
        n = min(len(data), 120)
        data = data[:n]
        x0, x1 = 0.86, 11.78
        top, price_bottom = y0 + 0.62, 5.38
        vol_top, vol_bottom = 5.58, 6.54
        vals = [p[k] for p in data for k in ("h", "l")]
        vmax, vmin = max(vals), min(vals)
        pad = (vmax - vmin) * 0.04 or 1.0
        vmax, vmin = vmax + pad, vmin - pad
        span = vmax - vmin
        step = (x1 - x0) / max(n, 1)
        bw = max(0.022, min(0.085, step * 0.58))

        def yy(v):
            return price_bottom - (float(v) - vmin) / span * (price_bottom - top)
        def mmdd(text):
            t = str(text)
            parts = re.split(r"[-/]", t)
            if len(parts) >= 3 and len(parts[-2]) == 2 and len(parts[-1]) >= 2:
                return parts[-2] + "/" + parts[-1][:2]
            return t[-5:]

        # price axis (5 ticks) + horizontal grid
        for i in range(5):
            val = vmin + span * i / 4.0
            gy = yy(val)
            C.line(s, x0, gy, x1, gy, color="E7ECF7", width=0.6)
            C.text(s, x1 + 0.07, gy - 0.11, 0.92, 0.22, "%.2f" % val,
                   font=self.F(size=7.5, color=MUTED), autofit=False, ins=(0, 0, 0, 0))
        C.line(s, x1 + 0.02, top, x1 + 0.02, price_bottom, color=LINE, width=0.75)
        # date axis: one label per month
        last_month = None
        for i, p in enumerate(data):
            d = p["date"][:7]
            if d and d != last_month:
                last_month = d
                cx = x0 + step * (i + 0.5)
                C.line(s, cx, top, cx, vol_bottom, color="EDF1F8", width=0.5)
                C.text(s, cx - 0.34, vol_bottom + 0.05, 0.68, 0.22, mmdd(p["date"]),
                       font=self.F(size=7.5, color=MUTED), align="center", autofit=False, ins=(0, 0, 0, 0))

        # volume bars (bottom 20% of the chart area)
        maxv = max([p["v"] for p in data] + [1])
        for i, p in enumerate(data):
            cx = x0 + step * (i + 0.5)
            color = up_color if p["c"] >= p["o"] else down_color
            vh = (p["v"] / maxv) * (vol_bottom - vol_top)
            if vh > 0.01:
                C.shape(s, "rect", cx - bw / 2, vol_bottom - vh, bw, vh, fill=color, alpha=0.75)
        C.line(s, x0 - 0.05, vol_bottom, x1 + 0.02, vol_bottom, color=LINE, width=0.75)
        C.text(s, x0 - 0.30, vol_top - 0.20, 1.0, 0.20, "成交量", font=self.F(size=7.5, color=MUTED),
               autofit=False, ins=(0, 0, 0, 0))

        # candles
        for i, p in enumerate(data):
            cx = x0 + step * (i + 0.5)
            color = up_color if p["c"] >= p["o"] else down_color
            C.line(s, cx, yy(p["h"]), cx, yy(p["l"]), color=color, width=1.0)
            body_top, body_bottom = yy(max(p["o"], p["c"])), yy(min(p["o"], p["c"]))
            C.shape(s, "rect", cx - bw / 2, body_top, bw, max(0.018, body_bottom - body_top), fill=color)

        # MA5 / MA20 native polylines
        def ma_points(window):
            pts = []
            for i in range(len(data)):
                if i + 1 < window:
                    continue
                avg = sum(p["c"] for p in data[i + 1 - window:i + 1]) / float(window)
                pts.append((x0 + step * (i + 0.5), yy(avg)))
            return pts
        C.polyline(s, ma_points(5), color=BLUE, width=1.6)
        C.polyline(s, ma_points(20), color="E4A854", width=1.6)
        C.text(s, x1 - 2.30, y0 + 0.02, 1.00, 0.22, "MA5", font=self.F(size=8, color=BLUE, bold=True),
               align="right", autofit=False, ins=(0, 0, 0, 0))
        C.text(s, x1 - 1.18, y0 + 0.02, 1.12, 0.22, "MA20", font=self.F(size=8, color="E4A854", bold=True),
               align="right", autofit=False, ins=(0, 0, 0, 0))

        # last close capsule
        last = data[-1]
        cy = min(max(yy(last["c"]) - 0.13, top), price_bottom - 0.26)
        C.shape(s, "round", x1 + 0.05, cy, 0.94, 0.26, fill=BLUE, adj=[40000])
        C.text(s, x1 + 0.05, cy, 0.94, 0.26, "%.2f" % last["c"], font=self.F(size=8, color="FFFFFF", bold=True),
               align="center", anchor="middle", autofit=False, ins=(0, 0, 0, 0))
        C.text(s, x0, y0 + 0.02, 4.2, 0.22, "高 %.2f  低 %.2f" % (max(vals), min(vals)),
               font=self.F(size=8, color=MUTED), autofit=False, ins=(0, 0, 0, 0))

    def page_chart(self, s, d):
        self.chrome(s, d.get("section") or "股价走势")
        self.title(s, d.get("title", "股价走势"))
        self.lead(s, d.get("lead"))
        y0 = 1.62 if d.get("lead") else 1.30
        kind = str(d.get("chartType", d.get("type", "line"))).lower()
        series = d.get("series") or []
        cats = d.get("categories") or d.get("dates") or []
        try:
            from pptx.chart.data import CategoryChartData
            from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
            from pptx.dml.color import RGBColor
            from pptx.util import Pt
            cd = CategoryChartData()
            cd.categories = [str(x) for x in cats] or ["—"]
            if kind in ("kline", "ohlc", "candlestick"):
                # python-pptx cannot serialise STOCK_OHLC; draw a native editable
                # high-low line + open-close body combination instead.
                self._kline_shapes(s, series, cats, y0, d.get("upColor", RED), d.get("downColor", GREEN))
                return
            else:
                for sr in series:
                    nm, vals = (sr.get("name", ""), sr.get("values", [])) if isinstance(sr, dict) else ("", list(sr))
                    cd.add_series(nm or "系列", [float(v or 0) for v in vals])
                ctype = XL_CHART_TYPE.COLUMN_CLUSTERED if kind in ("bar", "column", "柱状") else XL_CHART_TYPE.LINE_MARKERS
            gf = s.shapes.add_chart(ctype, C.E(0.42), C.E(y0), C.E(12.48), C.E(6.85 - y0), cd)
            chart = gf.chart
            chart.has_legend = len(series) > 1 or kind in ("kline", "ohlc", "candlestick")
            if chart.has_legend:
                chart.legend.position = XL_LEGEND_POSITION.TOP
                chart.legend.include_in_layout = False
                chart.legend.font.size = Pt(9)
            try:
                chart.category_axis.tick_labels.font.size = Pt(8)
                chart.value_axis.tick_labels.font.size = Pt(8)
                chart.value_axis.has_major_gridlines = True
            except Exception:
                pass
            for i, sr in enumerate(chart.series):
                try:
                    col = [BLUE, VIOLET, DEEP, "E4A854"][i % 4]
                    if ctype == XL_CHART_TYPE.LINE_MARKERS:
                        sr.format.line.color.rgb = RGBColor.from_string(col)
                        sr.format.line.width = Pt(2)
                    else:
                        sr.format.fill.solid()
                        sr.format.fill.fore_color.rgb = RGBColor.from_string(col)
                except Exception:
                    pass
        except Exception as e:
            C.warn("chart render failed: %s" % e)
            C.text(s, 0.5, y0 + 1.0, 12.3, 1.0, "—（图表数据不可用）", font=self.F(size=13, color=MUTED), anchor="middle")

    def page_signals(self, s, d):
        self.chrome(s, d.get("section") or "量化信号")
        self.title(s, d.get("title", "QuanK 量化信号与回测"))
        self.lead(s, d.get("lead"))
        y0 = 1.62 if d.get("lead") else 1.30
        sigs = d.get("signals") or []
        if sigs:
            n = min(len(sigs), 4)
            ww = (12.6 - 0.12 * (n - 1)) / n
            for i, sg in enumerate(sigs[:4]):
                if isinstance(sg, dict):
                    self.kpi(s, 0.36 + i * (ww + 0.12), y0, ww, 1.28,
                             sg.get("value", sg.get("grade", "—")), sg.get("label", sg.get("name", "")),
                             sg.get("note"), [BLUE, VIOLET, DEEP, "E4A854"][i % 4])
                else:
                    self.kpi(s, 0.36 + i * (ww + 0.12), y0, ww, 1.28, str(sg), "信号")
        rows = _rows(d.get("backtest") or d.get("rows") or d.get("table"))
        self.panel(s, 0.36, y0 + 1.42, 12.6, 6.95 - y0 - 1.42, "回测对比")
        if rows and not (len(rows) == 1 and len(rows[0]) == 1 and str(rows[0][0]).strip() in ("", "—")):
            self.table(s, rows, 0.56, y0 + 1.94, 12.2, 6.75 - y0 - 1.94, font_size=9.0)
        else:
            C.text(s, 0.60, y0 + 2.0, 12.0, 0.8, "—（未取得回测数据）", font=self.F(size=13, color=MUTED), anchor="middle")

    def page_catalysts_risks(self, s, d):
        self.chrome(s, d.get("section") or "催化剂与风险")
        self.title(s, d.get("title", "催化剂与风险"))
        self.lead(s, d.get("lead"))
        y0 = 1.62 if d.get("lead") else 1.30
        self.panel(s, 0.36, y0, 6.15, 6.95 - y0, "催化剂", bar=BLUE)
        self.bullets(s, 0.62, y0 + 0.52, 5.62, 6.70 - y0, _pts(d.get("catalysts")), size=10.5, marker=BLUE)
        self.panel(s, 6.72, y0, 6.25, 6.95 - y0, "风险提示", bar=RED)
        self.bullets(s, 6.98, y0 + 0.52, 5.72, 6.70 - y0, _pts(d.get("risks")), size=10.5, marker=RED)

    def page_event(self, s, d):
        self.chrome(s, d.get("section") or "事件分析")
        self.title(s, d.get("title", "事件分析"))
        self.lead(s, d.get("lead"))
        y0 = 1.62 if d.get("lead") else 1.30
        self.panel(s, 0.36, y0, 12.6, 2.30, "事件时间线")
        evs = d.get("events") or []
        if evs:
            n = min(len(evs), 6)
            x0, x1 = 0.80, 12.45
            C.line(s, x0, y0 + 1.42, x1, y0 + 1.42, color=LINE, width=2.0)
            for i, ev in enumerate(evs[:n]):
                date, name = (ev.get("date", ""), ev.get("title", ev.get("name", ""))) if isinstance(ev, dict) else ("", str(ev))
                cx = x0 + (x1 - x0) * (i + 0.5) / n
                C.shape(s, "ellipse", cx - 0.10, y0 + 1.32, 0.20, 0.20, fill=BLUE if i % 2 == 0 else VIOLET)
                C.text(s, cx - 1.0, y0 + 0.58, 2.0, 0.32, str(date), font=self.F(size=9, color=MUTED, bold=True),
                       align="center", autofit=False, ins=(0, 0, 0, 0))
                C.text(s, cx - 1.0, y0 + 1.66, 2.0, 0.74, [{"text": str(name)}], font=self.F(size=9.5, color=NAVY),
                       align="center", anchor="top", autofit=True, min_size=7.5)
        else:
            C.text(s, 0.60, y0 + 0.9, 12.0, 0.7, "—", font=self.F(size=13, color=MUTED), anchor="middle")
        self.panel(s, 0.36, y0 + 2.48, 12.6, 6.95 - y0 - 2.48, "交易结构")
        rows = _rows(d.get("structure") or d.get("terms") or d.get("table"))
        if rows:
            self.table(s, rows, 0.56, y0 + 3.00, 12.2, 6.75 - y0 - 3.00, font_size=9.0)
        else:
            C.text(s, 0.60, y0 + 3.0, 12.0, 0.8, "—", font=self.F(size=13, color=MUTED), anchor="middle")

    def page_disclaimer(self, s, d):
        C.bg_grad(s, [(0, "FFFFFF"), (60, PALE), (100, MIST)], path="circle")
        C.shape(s, "rect", 0, 0, 13.333, 0.055, fill=BLUE)
        lg = C.asset_path("quank_logo.png")
        if lg:
            C.add_picture_fit(s, lg, 0.34, 0.18, 0.32, 0.32, align="left")
        C.text(s, 0.36, 0.84, 12.5, 0.55, "免责声明", font=self.F(size=26, color=NAVY, bold=True), autofit=False,
               ins=(0, 0, 0, 0))
        C.shape(s, "rect", 0.38, 1.48, 1.10, 0.05, fill=BLUE)
        text = d.get("text") or DISCLAIMER_TEXT
        paras = [{"text": p, "space_after": 10} for p in str(text).split("\n") if p.strip()]
        C.shape(s, "round", 0.36, 1.78, 12.6, 4.55, fill="FFFFFF", line=LINE, line_w=0.75, adj=[5000])
        C.text(s, 0.72, 1.98, 11.88, 4.15, paras, font=self.F(size=11, color=TEXT), spacing=1.45,
               autofit=True, min_size=8)
        C.text(s, 0.36, 6.62, 12.5, 0.30, "QuanK · 仅供研究，不构成投资建议", font=self.F(size=9, color=MUTED),
               autofit=False, ins=(0, 0, 0, 0))
        if self.page_sources:
            source_text = "数据来源：" + " / ".join(dict.fromkeys(self.page_sources)) + " · 截至 " + (self.page_as_of or self.source_as_of)
            C.text(s, 0.36, 7.10, 11.6, 0.24, source_text,
                   font=self.F(size=8, color=MUTED), autofit=False, ins=(0, 0, 0, 0))
