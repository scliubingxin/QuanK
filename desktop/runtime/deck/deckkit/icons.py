# -*- coding: utf-8 -*-
"""Native vector line icons (polylines + preset shapes).  draw_icon(slide, name, cx, cy, size, color)."""
from __future__ import division
import math
from . import core as C


def _P(cx, cy, s, pts):
    return [(cx + u * s, cy + v * s) for (u, v) in pts]


def _circle(slide, cx, cy, r, color, w, fill=None):
    shp = C.shape(slide, "ellipse", cx - r, cy - r, 2 * r, 2 * r, fill=fill, line=color, line_w=w)
    return shp


def _pl(slide, cx, cy, s, pts, color, w, close=False, fill=None):
    return C.polyline(slide, _P(cx, cy, s, pts), color=color, width=w, close=close, fill=fill)


def _arc(slide, cx, cy, s, u, v, r, a0, a1, color, w, n=16):
    pts = C.arc_pts(cx + u * s, cy + v * s, r * s, a0, a1, n)
    return C.polyline(slide, pts, color=color, width=w)


def _preset(slide, kind, cx, cy, s, color, w, scale=0.8, adj=None, fill=None, rot=None):
    d = s * scale
    return C.shape(slide, kind, cx - d / 2, cy - d / 2, d, d, fill=fill, line=color, line_w=w, adj=adj, rot=rot)


def draw_icon(slide, name, cx, cy, s, color="FFFFFF", w=1.25):
    """Draw icon centred at (cx,cy) inside a square of side s (inches). Returns list of shapes."""
    n = (name or "").lower().strip()
    out = []
    a = out.append
    if n in ("check", "ok", "done", "pass"):
        a(_pl(slide, cx, cy, s, [(-0.32, 0.0), (-0.08, 0.24), (0.34, -0.22)], color, w * 1.3))
    elif n in ("chart", "bar", "bars", "data", "stat"):
        a(_pl(slide, cx, cy, s, [(-0.38, -0.38), (-0.38, 0.36), (0.40, 0.36)], color, w))
        for i, hgt in enumerate((0.25, 0.45, 0.62)):
            x0 = -0.22 + i * 0.22
            a(_pl(slide, cx, cy, s, [(x0, 0.30), (x0, 0.30 - hgt)], color, w * 2.2))
    elif n in ("trend", "growth", "up", "increase", "efficiency"):
        a(_pl(slide, cx, cy, s, [(-0.40, 0.28), (-0.12, 0.0), (0.06, 0.14), (0.38, -0.22)], color, w))
        a(_pl(slide, cx, cy, s, [(0.16, -0.24), (0.38, -0.22), (0.36, 0.0)], color, w))
    elif n in ("shield", "safe", "security", "reliable", "protect"):
        a(_pl(slide, cx, cy, s, [(0, -0.42), (0.34, -0.28), (0.30, 0.10), (0, 0.42), (-0.30, 0.10), (-0.34, -0.28)], color, w, close=True))
        a(_pl(slide, cx, cy, s, [(-0.14, 0.0), (-0.03, 0.12), (0.16, -0.10)], color, w))
    elif n in ("doc", "document", "file", "report", "knowledge"):
        a(_pl(slide, cx, cy, s, [(-0.28, -0.40), (0.12, -0.40), (0.30, -0.22), (0.30, 0.40), (-0.28, 0.40)], color, w, close=True))
        a(_pl(slide, cx, cy, s, [(0.12, -0.40), (0.12, -0.22), (0.30, -0.22)], color, w))
        for v in (-0.06, 0.08, 0.22):
            a(_pl(slide, cx, cy, s, [(-0.16, v), (0.18, v)], color, w * 0.8))
    elif n in ("user", "person", "people", "staff", "customer"):
        a(_circle(slide, cx, cy - 0.16 * s, 0.15 * s, color, w))
        a(_arc(slide, cx, cy, s, 0, 0.42, 0.34, 20, 160, color, w))
    elif n in ("team", "group", "users", "org"):
        a(_circle(slide, cx - 0.14 * s, cy - 0.14 * s, 0.12 * s, color, w))
        a(_circle(slide, cx + 0.16 * s, cy - 0.18 * s, 0.10 * s, color, w))
        a(_arc(slide, cx, cy, s, -0.14, 0.36, 0.26, 20, 160, color, w))
        a(_arc(slide, cx, cy, s, 0.18, 0.26, 0.20, 10, 120, color, w))
    elif n in ("gear", "settings", "config", "process", "engine"):
        a(_preset(slide, "gear", cx, cy, s, color, w, 0.86))
        a(_circle(slide, cx, cy, 0.12 * s, color, w))
    elif n in ("cloud", "platform", "saas"):
        a(_preset(slide, "cloud", cx, cy, s, color, w, 0.9))
    elif n in ("bolt", "power", "energy", "electric", "fast"):
        a(_preset(slide, "bolt", cx, cy, s, color, w, 0.82))
    elif n in ("sun", "solar", "light"):
        a(_circle(slide, cx, cy, 0.17 * s, color, w))
        for i in range(8):
            ang = math.radians(i * 45)
            a(_pl(slide, cx, cy, s, [(0.27 * math.cos(ang), 0.27 * math.sin(ang)), (0.40 * math.cos(ang), 0.40 * math.sin(ang))], color, w))
    elif n in ("drop", "water", "rain", "clean", "wash"):
        a(_pl(slide, cx, cy, s, [(0, -0.42)] + [(0.26 * math.sin(math.radians(t)), 0.14 - 0.26 * math.cos(math.radians(t))) for t in range(30, 331, 30)] + [(0, -0.42)], color, w))
    elif n in ("dust", "wind", "air", "pollution"):
        a(_pl(slide, cx, cy, s, [(-0.40, -0.16), (0.10, -0.16)] + [(0.10 + 0.12 * math.sin(math.radians(t)), -0.28 + 0.12 * math.cos(math.radians(t))) for t in range(0, 181, 30)], color, w))
        a(_pl(slide, cx, cy, s, [(-0.40, 0.02), (0.22, 0.02)], color, w))
        a(_pl(slide, cx, cy, s, [(-0.40, 0.20), (0.02, 0.20)] + [(0.02 + 0.10 * math.sin(math.radians(t)), 0.30 - 0.10 * math.cos(math.radians(t))) for t in range(0, 181, 30)], color, w))
        for (u, v) in ((0.30, 0.16), (0.38, 0.28), (0.26, 0.34)):
            a(_circle(slide, cx + u * s, cy + v * s, 0.025 * s, color, w * 0.8, fill=color))
    elif n in ("slope", "roof", "angle", "tilt"):
        a(_pl(slide, cx, cy, s, [(-0.40, 0.28), (0.40, 0.28)], color, w))
        a(_pl(slide, cx, cy, s, [(-0.40, 0.28), (0.34, -0.30)], color, w))
        a(_arc(slide, cx, cy, s, -0.40, 0.28, 0.30, 0, 38, color, w, 8))
    elif n in ("sparkle", "star", "shine", "new", "quality"):
        a(_preset(slide, "star4", cx - 0.06 * s, cy + 0.04 * s, s, color, w, 0.62, adj=[18000]))
        a(_preset(slide, "star4", cx + 0.26 * s, cy - 0.26 * s, s, color, w, 0.28, adj=[18000]))
    elif n in ("brush", "broom", "cleaning", "maintain"):
        a(_pl(slide, cx, cy, s, [(0.36, -0.40), (0.02, -0.02)], color, w))
        a(_pl(slide, cx, cy, s, [(-0.04, -0.12), (0.12, 0.04), (-0.08, 0.38), (-0.40, 0.06)], color, w, close=True))
        a(_pl(slide, cx, cy, s, [(-0.20, 0.22), (-0.04, 0.06)], color, w * 0.8))
    elif n in ("search", "find", "query", "retrieval", "rag"):
        a(_circle(slide, cx - 0.06 * s, cy - 0.06 * s, 0.24 * s, color, w))
        a(_pl(slide, cx, cy, s, [(0.12, 0.12), (0.38, 0.38)], color, w * 1.4))
    elif n in ("clock", "time", "schedule", "realtime"):
        a(_circle(slide, cx, cy, 0.38 * s, color, w))
        a(_pl(slide, cx, cy, s, [(0, -0.22), (0, 0), (0.16, 0.10)], color, w))
    elif n in ("target", "goal", "aim", "precision"):
        for r in (0.38, 0.24, 0.10):
            a(_circle(slide, cx, cy, r * s, color, w))
    elif n in ("database", "db", "storage", "warehouse"):
        a(C.shape(slide, "can", cx - 0.32 * s, cy - 0.40 * s, 0.64 * s, 0.80 * s, line=color, line_w=w, adj=[22000]))
        a(_arc(slide, cx, cy, s, 0, -0.06, 0.32, 200, 340, color, w, 12))
    elif n in ("server", "system", "it", "infra"):
        for v in (-0.32, -0.04, 0.24):
            a(C.shape(slide, "round", cx - 0.36 * s, cy + v * s, 0.72 * s, 0.20 * s, line=color, line_w=w, adj=[20000]))
            a(_circle(slide, cx + 0.22 * s, cy + (v + 0.10) * s, 0.025 * s, color, w, fill=color))
    elif n in ("lock", "permission", "auth", "privacy"):
        a(C.shape(slide, "round", cx - 0.28 * s, cy - 0.04 * s, 0.56 * s, 0.44 * s, line=color, line_w=w, adj=[12000]))
        a(_arc(slide, cx, cy, s, 0, -0.10, 0.18, 0, 180, color, w, 12))
        a(_pl(slide, cx, cy, s, [(-0.18, -0.10), (-0.18, -0.04)], color, w))
        a(_pl(slide, cx, cy, s, [(0.18, -0.10), (0.18, -0.04)], color, w))
    elif n in ("location", "pin", "map", "site", "base"):
        pts = [(0.0, 0.42)] + [(0.26 * math.cos(math.radians(t)), -0.10 - 0.26 * math.sin(math.radians(t))) for t in range(-30, 211, 20)] + [(0.0, 0.42)]
        a(_pl(slide, cx, cy, s, pts, color, w))
        a(_circle(slide, cx, cy - 0.10 * s, 0.09 * s, color, w))
    elif n in ("flow", "workflow", "integration", "pipeline", "connect"):
        a(C.shape(slide, "round", cx - 0.42 * s, cy - 0.38 * s, 0.30 * s, 0.24 * s, line=color, line_w=w, adj=[20000]))
        a(C.shape(slide, "round", cx + 0.12 * s, cy - 0.38 * s, 0.30 * s, 0.24 * s, line=color, line_w=w, adj=[20000]))
        a(C.shape(slide, "round", cx - 0.15 * s, cy + 0.14 * s, 0.30 * s, 0.24 * s, line=color, line_w=w, adj=[20000]))
        a(_pl(slide, cx, cy, s, [(-0.12, -0.26), (0.12, -0.26)], color, w))
        a(_pl(slide, cx, cy, s, [(-0.27, -0.14), (-0.27, 0.0), (0.27, 0.0), (0.27, -0.14)], color, w))
        a(_pl(slide, cx, cy, s, [(0, 0.0), (0, 0.14)], color, w))
    elif n in ("cart", "buy", "purchase", "sales", "business"):
        a(_pl(slide, cx, cy, s, [(-0.42, -0.30), (-0.28, -0.30), (-0.16, 0.16), (0.30, 0.16), (0.40, -0.18), (-0.22, -0.18)], color, w))
        a(_circle(slide, cx - 0.10 * s, cy + 0.30 * s, 0.06 * s, color, w))
        a(_circle(slide, cx + 0.24 * s, cy + 0.30 * s, 0.06 * s, color, w))
    elif n in ("award", "medal", "honor", "certified", "cert"):
        a(_circle(slide, cx, cy - 0.10 * s, 0.24 * s, color, w))
        a(_pl(slide, cx, cy, s, [(-0.14, 0.10), (-0.20, 0.42), (0, 0.32), (0.20, 0.42), (0.14, 0.10)], color, w))
        a(_preset(slide, "star5", cx, cy - 0.10 * s, s, color, w * 0.8, 0.22))
    elif n in ("factory", "industry", "manufacturing", "plant"):
        a(_pl(slide, cx, cy, s, [(-0.42, 0.36), (-0.42, -0.06), (-0.16, 0.08), (-0.16, -0.06), (0.10, 0.08), (0.10, -0.40), (0.26, -0.40), (0.26, 0.36)], color, w, close=True))
        a(_pl(slide, cx, cy, s, [(0.26, 0.36), (0.42, 0.36), (0.42, 0.02), (0.26, 0.02)], color, w))
    elif n in ("panel", "module", "pv", "photovoltaic"):
        a(_pl(slide, cx, cy, s, [(-0.30, -0.34), (0.40, -0.34), (0.30, 0.30), (-0.40, 0.30)], color, w, close=True))
        a(_pl(slide, cx, cy, s, [(0.05, -0.34), (-0.05, 0.30)], color, w * 0.8))
        a(_pl(slide, cx, cy, s, [(-0.35, -0.02), (0.35, -0.02)], color, w * 0.8))
        a(_pl(slide, cx, cy, s, [(-0.05, 0.30), (-0.05, 0.42)], color, w))
    elif n in ("book", "learn", "training", "study"):
        a(_pl(slide, cx, cy, s, [(0, -0.26), (-0.18, -0.34), (-0.42, -0.30), (-0.42, 0.30), (-0.18, 0.26), (0, 0.34), (0.18, 0.26), (0.42, 0.30), (0.42, -0.30), (0.18, -0.34), (0, -0.26), (0, 0.34)], color, w))
    elif n in ("chat", "qa", "message", "ask", "service"):
        a(C.shape(slide, "callout", cx - 0.40 * s, cy - 0.34 * s, 0.80 * s, 0.56 * s, line=color, line_w=w, adj=[-25000, 72000, 16667]))
        for u in (-0.18, 0, 0.18):
            a(_circle(slide, cx + u * s, cy - 0.06 * s, 0.035 * s, color, w * 0.8, fill=color))
    elif n in ("warning", "alert", "risk", "exception", "anomaly"):
        a(_pl(slide, cx, cy, s, [(0, -0.40), (0.42, 0.34), (-0.42, 0.34)], color, w, close=True))
        a(_pl(slide, cx, cy, s, [(0, -0.12), (0, 0.10)], color, w * 1.3))
        a(_circle(slide, cx, cy + 0.21 * s, 0.03 * s, color, w, fill=color))
    elif n in ("code", "api", "dev", "interface"):
        a(_pl(slide, cx, cy, s, [(-0.16, -0.24), (-0.40, 0.0), (-0.16, 0.24)], color, w))
        a(_pl(slide, cx, cy, s, [(0.16, -0.24), (0.40, 0.0), (0.16, 0.24)], color, w))
        a(_pl(slide, cx, cy, s, [(0.08, -0.32), (-0.08, 0.32)], color, w))
    elif n in ("layers", "stack", "architecture", "arch"):
        for v in (0.18, 0.02, -0.14):
            a(_pl(slide, cx, cy, s, [(-0.40, v), (0, v - 0.18), (0.40, v), (0, v + 0.18)], color, w, close=True))
    elif n in ("home", "house", "building"):
        a(_pl(slide, cx, cy, s, [(-0.42, -0.02), (0, -0.40), (0.42, -0.02)], color, w))
        a(_pl(slide, cx, cy, s, [(-0.30, -0.12), (-0.30, 0.38), (0.30, 0.38), (0.30, -0.12)], color, w))
        a(_pl(slide, cx, cy, s, [(-0.08, 0.38), (-0.08, 0.14), (0.08, 0.14), (0.08, 0.38)], color, w))
    elif n in ("ai", "brain", "agent", "llm", "model", "robot"):
        a(C.shape(slide, "round", cx - 0.34 * s, cy - 0.26 * s, 0.68 * s, 0.58 * s, line=color, line_w=w, adj=[22000]))
        a(_pl(slide, cx, cy, s, [(0, -0.26), (0, -0.40)], color, w))
        a(_circle(slide, cx, cy - 0.42 * s, 0.035 * s, color, w, fill=color))
        a(_circle(slide, cx - 0.14 * s, cy + 0.0 * s, 0.05 * s, color, w, fill=color))
        a(_circle(slide, cx + 0.14 * s, cy + 0.0 * s, 0.05 * s, color, w, fill=color))
        a(_pl(slide, cx, cy, s, [(-0.12, 0.16), (0.12, 0.16)], color, w))
    elif n in ("bell", "notify", "push", "remind"):
        a(_pl(slide, cx, cy, s, [(-0.30, 0.22)] + [(0.24 * math.cos(math.radians(t)), -0.06 - 0.24 * math.sin(math.radians(t))) for t in range(180, -1, -20)] + [(0.30, 0.22), (-0.30, 0.22)], color, w))
        a(_arc(slide, cx, cy, s, 0, 0.26, 0.08, 180, 360, color, w, 8))
    elif n in ("money", "cost", "roi", "revenue", "profit", "yuan"):
        a(_circle(slide, cx, cy, 0.38 * s, color, w))
        a(_pl(slide, cx, cy, s, [(-0.14, -0.20), (0, -0.04), (0.14, -0.20)], color, w))
        a(_pl(slide, cx, cy, s, [(0, -0.04), (0, 0.24)], color, w))
        a(_pl(slide, cx, cy, s, [(-0.13, 0.02), (0.13, 0.02)], color, w))
        a(_pl(slide, cx, cy, s, [(-0.13, 0.12), (0.13, 0.12)], color, w))
    elif n in ("loop", "cycle", "refresh", "iterate", "feedback"):
        a(_arc(slide, cx, cy, s, 0, 0, 0.34, 30, 300, color, w, 20))
        a(_pl(slide, cx, cy, s, [(0.30, -0.36), (0.30, -0.16), (0.10, -0.20)], color, w))
    elif n in ("eye", "view", "monitor", "visual"):
        a(_pl(slide, cx, cy, s, [(-0.42, 0)] + [(0.42 * math.cos(math.radians(t)), -0.26 * math.sin(math.radians(t))) for t in range(180, -1, -20)] + [(0.42 * math.cos(math.radians(t)), 0.26 * math.sin(math.radians(t))) for t in range(20, 181, 20)], color, w))
        a(_circle(slide, cx, cy, 0.12 * s, color, w))
    elif n in ("hail", "snow", "weather", "climate"):
        a(_preset(slide, "cloud", cx, cy - 0.10 * s, s, color, w, 0.74))
        for (u, v) in ((-0.18, 0.34), (0.02, 0.40), (0.22, 0.34)):
            a(_circle(slide, cx + u * s, cy + v * s, 0.04 * s, color, w, fill=color))
    elif n in ("temperature", "heat", "thermo"):
        a(C.shape(slide, "round", cx - 0.08 * s, cy - 0.42 * s, 0.16 * s, 0.56 * s, line=color, line_w=w, adj=[50000]))
        a(_circle(slide, cx, cy + 0.24 * s, 0.15 * s, color, w))
    elif n in ("link", "chain", "relation"):
        a(C.shape(slide, "round", cx - 0.42 * s, cy - 0.16 * s, 0.50 * s, 0.32 * s, line=color, line_w=w, adj=[50000], rot=-35))
        a(C.shape(slide, "round", cx - 0.08 * s, cy - 0.16 * s, 0.50 * s, 0.32 * s, line=color, line_w=w, adj=[50000], rot=-35))
    elif n in ("rocket", "launch", "start"):
        a(_pl(slide, cx, cy, s, [(0, -0.44), (0.14, -0.20), (0.14, 0.18), (-0.14, 0.18), (-0.14, -0.20)], color, w, close=True))
        a(_pl(slide, cx, cy, s, [(-0.14, 0.02), (-0.30, 0.22), (-0.14, 0.18)], color, w))
        a(_pl(slide, cx, cy, s, [(0.14, 0.02), (0.30, 0.22), (0.14, 0.18)], color, w))
        a(_pl(slide, cx, cy, s, [(-0.06, 0.26), (0, 0.42), (0.06, 0.26)], color, w))
    elif n in ("play", "video", "demo"):
        a(_circle(slide, cx, cy, 0.40 * s, color, w))
        a(_pl(slide, cx, cy, s, [(-0.10, -0.18), (0.20, 0.0), (-0.10, 0.18)], color, w, close=True, fill=color))
    else:
        # unknown -> monogram in a circle
        t = (name or "?")[:1]
        a(C.text(slide, cx - 0.5 * s, cy - 0.5 * s, s, s, t, size=max(8, s * 72 * 0.5), color=color, bold=True,
                 align="center", anchor="middle", autofit=False, ins=(0, 0, 0, 0)))
    return [x for x in out if x is not None]


ICON_NAMES = sorted(set("""check chart trend shield doc user team gear cloud bolt sun drop dust slope sparkle brush search
clock target database server lock location flow cart award factory panel book chat warning code layers home ai bell money
loop eye hail temperature link rocket play""".split()))
