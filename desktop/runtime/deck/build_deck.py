#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""QuankSight deck engine: JSON spec -> native editable .pptx (python-pptx + lxml).

usage:
  python3 build_deck.py --spec deck.json --out out.pptx
  python3 build_deck.py --spec deck.json --check
  python3 build_deck.py --spec deck.json --data data.json --json
  python3 build_deck.py --example research > deck.json
  python3 build_deck.py --outline outline.json --theme research --json > deck.json
  python3 build_deck.py --catalog
"""
from __future__ import print_function
import argparse
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

try:
    import pptx  # noqa
    from lxml import etree  # noqa
except ImportError:
    sys.stderr.write("[QuankSight deck] 缺少内置 Python 依赖 python-pptx / lxml，请在「设置 → 运行环境」修复内置 Python 后重试。\n")
    sys.exit(3)

from deckkit import core as C  # noqa: E402
from deckkit.report import ReportTheme  # noqa: E402
from deckkit.product import ProductTheme  # noqa: E402
from deckkit.research import ResearchTheme, DISCLAIMER_TEXT  # noqa: E402
from deckkit.data import DataBinder, ResolvedList  # noqa: E402
from deckkit.icons import ICON_NAMES  # noqa: E402
from deckkit import VERSION  # noqa: E402

THEMES = {"report": ReportTheme, "product": ProductTheme, "research": ResearchTheme}
REPORT_LAYOUTS = ["cover", "toc", "part", "content", "image", "thanks"]
REPORT_BLOCKS = ["row", "col", "panel", "section", "steps", "pipeline", "cards", "text", "bullets", "note", "kpis", "table",
                 "layers", "matrix", "swimlane", "loop", "hierarchy", "problem_solution", "chevrons", "timeline", "gantt",
                 "flow", "strategy", "image", "images"]
PRODUCT_LAYOUTS = ["cover", "toc", "section", "scenarios", "split", "stats", "media", "feature", "compare", "closing"]
PRODUCT_PANELS = ["bars3d", "area", "line", "tiles", "stats", "bullets", "text", "image", "icons", "compare"]
RESEARCH_LAYOUTS = ["cover", "summary", "company", "financials", "valuation", "chart",
                    "signals", "catalysts_risks", "event", "disclaimer"]

DEFAULT_BRAND = {
    "name": "QuankSight",
    "font": u"PingFang SC",
    "security_label": u"",
    "tag": "",
    "page_numbers": True,
}


def load_spec(path):
    if path == "-":
        return json.loads(sys.stdin.read())
    with io.open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def validate(spec):
    errs = []
    theme = spec.get("theme", "report")
    if theme not in THEMES:
        errs.append("theme must be one of %s" % list(THEMES))
    slides = spec.get("slides")
    if not isinstance(slides, list) or not slides:
        errs.append("'slides' must be a non-empty list")
        return errs
    for i, sl in enumerate(slides, 1):
        if not isinstance(sl, dict):
            errs.append("slide %d is not an object" % i)
            continue
        th = sl.get("theme", theme)
        lay = sl.get("layout")
        if th == "report":
            lay = lay or "content"
            if lay not in REPORT_LAYOUTS:
                errs.append("slide %d: unknown report layout '%s' (allowed: %s)" % (i, lay, ", ".join(REPORT_LAYOUTS)))
            if lay == "content":
                _check_blocks(sl.get("body") or {"type": "col", "items": sl.get("blocks", [])}, i, errs)
        elif th == "product":
            lay = lay or "split"
            if lay not in PRODUCT_LAYOUTS:
                errs.append("slide %d: unknown product layout '%s' (allowed: %s)" % (i, lay, ", ".join(PRODUCT_LAYOUTS)))
            for p in sl.get("panels", []) or []:
                if p.get("type", "bullets") not in PRODUCT_PANELS:
                    errs.append("slide %d: unknown panel type '%s'" % (i, p.get("type")))
        elif th == "research":
            if lay not in RESEARCH_LAYOUTS:
                errs.append("slide %d: unknown research layout '%s' (allowed: %s)" % (i, lay, ", ".join(RESEARCH_LAYOUTS)))
    return errs


def _check_blocks(b, i, errs):
    if b is None:
        return
    if isinstance(b, str):
        return
    t = b.get("type", "text")
    if t not in REPORT_BLOCKS:
        errs.append("slide %d: unknown block type '%s' (allowed: %s)" % (i, t, ", ".join(REPORT_BLOCKS)))
    for it in b.get("items", []) if t in ("row", "col") else []:
        _check_blocks(it, i, errs)
    if t == "panel" and b.get("content"):
        _check_blocks(b["content"], i, errs)


def post_check(prs):
    """bounds check: text shapes that leave the slide canvas."""
    issues = []
    W, H = prs.slide_width, prs.slide_height
    tol = 45720
    for n, s in enumerate(prs.slides, 1):
        for sh in s.shapes:
            try:
                if sh.rotation or sh.left is None:
                    continue
                if not (sh.has_text_frame and sh.text_frame.text.strip()):
                    continue
                if sh.left < -tol or sh.top < -tol or sh.left + sh.width > W + tol or sh.top + sh.height > H + tol:
                    issues.append("slide %d: text '%s' exceeds canvas" % (n, sh.text_frame.text.strip()[:20]))
            except Exception:
                pass
    return issues


def strip_unknown_forecast(spec, warnings=None):
    """No forecast source: blank every 20xxE column and retitle the financials page."""
    import re
    for sl in spec.get("slides", []):
        if sl.get("layout") != "financials" or spec.get("forecastSource"):
            continue
        rows = _rows(sl.get("rows") or sl.get("table"))
        if not rows:
            continue
        head = rows[0]
        idx = [i for i, cell in enumerate(head) if re.match(r"^\d{4}E$", str(cell).strip())]
        if not idx:
            continue
        for row in rows[1:]:
            for i in idx:
                if i < len(row):
                    row[i] = "—"
        original = sl.get("rows") if sl.get("rows") is not None else sl.get("table")
        key = "rows" if sl.get("rows") is not None else "table"
        wrapped = ResolvedList(rows, getattr(original, "text", ""), getattr(original, "as_of", None))
        wrapped.source = getattr(original, "source", None)
        sl[key] = wrapped
        title = str(sl.get("title", ""))
        sl["title"] = title.replace("（近 5 年 + 预测）", "（近 5 年）").replace("（含预测）", "（近 5 年）")
        if warnings is not None:
            warnings.append("预测列无来源，整列显示 —；标题已改为（近 5 年）")
    # even when no financial rows were resolved at all, drop the forecast claim
    for sl in spec.get("slides", []):
        if sl.get("layout") == "financials" and not spec.get("forecastSource"):
            sl["title"] = str(sl.get("title", "")).replace("（近 5 年 + 预测）", "（近 5 年）").replace("（含预测）", "（近 5 年）")
    return spec


def _rows(v):
    if v is None:
        return []
    if isinstance(v, dict):
        return v.get("rows") or []
    if isinstance(v, (list, tuple)):
        return [list(r) if isinstance(r, (list, tuple)) else [r] for r in v]
    return [[str(v)]]


def page_data_context(slide):
    """Sources / as-of actually used by this slide (only resolved $data slots count)."""
    found = []
    def walk(v):
        src = getattr(v, "source", None) or (v.get("source") if isinstance(v, dict) else None)
        asof = getattr(v, "as_of", None) or (v.get("asOf") or v.get("sourceAsOf") if isinstance(v, dict) else None)
        if src:
            found.append((str(src), str(asof) if asof else None))
        if isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, (list, tuple)):
            for x in v:
                walk(x)
    walk(slide)
    if not found:
        return [], None
    sources = list(dict.fromkeys(s[0] for s in found if s[0]))
    asofs = sorted(set(s[1] for s in found if s[1]))
    return sources, (asofs[-1] if asofs else None)


def strip_chart_embeddings(path):
    """QuankSight document service rejects embedded workbooks; charts keep their cached data."""
    import zipfile, os
    from lxml import etree
    from pptx.oxml.ns import qn
    tmp = path + '.tmp'
    with zipfile.ZipFile(path) as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
        for name in zin.namelist():
            if name.startswith('ppt/embeddings/'):
                continue
            data = zin.read(name)
            if name == '[Content_Types].xml' or name.endswith('.rels'):
                try:
                    root = etree.fromstring(data)
                    changed = False
                    for node in list(root):
                        target = node.get('PartName') or node.get('Target') or ''
                        if 'embeddings/' in target:
                            root.remove(node); changed = True
                    if changed:
                        data = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
                except Exception:
                    pass
            zout.writestr(name, data)
    os.replace(tmp, path)


def outline_to_spec(outline, theme, title):
    """Turn a confirmed outline into a sketch spec. Each item: {layout,title,...} or a string."""
    slides = []
    for item in outline if isinstance(outline, list) else []:
        if isinstance(item, str):
            slides.append({"layout": "summary", "title": item, "points": []})
        elif isinstance(item, dict):
            lay = item.get("layout") or ("cover" if not slides else "summary")
            d = dict(item)
            d.setdefault("layout", lay)
            slides.append(d)
    if not slides:
        slides.append({"layout": "cover", "title": title or "投研报告"})
    if not any(s.get("layout") == "disclaimer" for s in slides):
        slides.append({"layout": "disclaimer", "text": DISCLAIMER_TEXT})
    spec = {"theme": theme or "research", "title": title or "投研报告", "slides": slides, "brand": {"name": "QuankSight"}}
    return spec


def _service_from_data(data_map, kind):
    def svc(*args):
        ref = ":".join([kind] + [str(a) for a in args])
        if ref in data_map:
            return data_map[ref]
        # fallback: single ref of this kind supplied under the bare kind key
        return data_map.get(kind)
    return svc


def build(spec, out, base_dir, warnings=None, mask_amounts=False, source_as_of=None, data_map=None):
    brand = dict(DEFAULT_BRAND)
    brand.update(spec.get("brand") or {})
    theme_name = spec.get("theme", "report")
    if data_map:
        binder = DataBinder(services={kind: _service_from_data(data_map, kind)
                                      for kind in ("quote", "financials", "kline", "backtest", "signals", "valuation")},
                            warnings=warnings if warnings is not None else [],
                            mask_amounts=mask_amounts, source_as_of=source_as_of)
        spec = binder.bind(spec)
    elif source_as_of:
        spec = dict(spec)
        spec["sourceAsOf"] = source_as_of
    # research: disclaimer is mandatory and always the last page
    if theme_name == "research":
        slides = list(spec.get("slides", []))
        dis = [s for s in slides if s.get("layout") == "disclaimer"]
        if not dis:
            slides.append({"layout": "disclaimer", "text": DISCLAIMER_TEXT})
            if warnings is not None:
                warnings.append("已自动追加免责声明页（research 主题必备）")
        else:
            slides = [s for s in slides if s.get("layout") != "disclaimer"] + [dis[-1]]
            if len(dis) > 1 and warnings is not None:
                warnings.append("存在多张免责声明页，仅保留最后一张")
        spec = dict(spec)
        spec["slides"] = slides
    if theme_name == "research":
        spec = strip_unknown_forecast(spec, warnings)
    themes = {}

    def get_theme(name):
        if name not in themes:
            if name == "research":
                themes[name] = THEMES[name](brand, base_dir,
                                            source_as_of=spec.get("sourceAsOf") or source_as_of or "数据读取时间",
                                            warnings=warnings if warnings is not None else [], mask_amounts=mask_amounts,
                                            sources=spec.get("sources"), watermark=spec.get("watermark"))
            else:
                themes[name] = THEMES[name](brand, base_dir)
        return themes[name]

    prs = C.new_presentation()
    layouts = []
    total = len(spec["slides"])
    for sl in spec["slides"]:
        th = get_theme(sl.get("theme", theme_name))
        th.page = len(layouts)
        if th.name == "research":
            sources, asof = page_data_context(sl)
            sl["_sources"] = sources
            sl["_sourceAsOf"] = asof
            th.page_sources = sources
            th.page_as_of = asof
            th.render(prs, sl, total)
        else:
            th.render(prs, sl)
        layouts.append("%s:%s" % (th.name, sl.get("layout", "content" if th.name == "report" else "split")))
    meta = spec.get("meta") or {}
    cp = prs.core_properties
    cp.title = meta.get("title") or spec.get("title") or ""
    cp.author = meta.get("author", brand.get("name", ""))
    cp.subject = meta.get("subject", "")
    out_dir = os.path.dirname(os.path.abspath(out))
    if out_dir and not os.path.isdir(out_dir):
        os.makedirs(out_dir)
    prs.save(out)
    strip_chart_embeddings(out)
    return prs, layouts, spec


def main(argv=None):
    ap = argparse.ArgumentParser(description="QuankSight deck %s - JSON spec to native editable PPTX" % VERSION)
    ap.add_argument("--spec", "-s", help="deck spec JSON file ('-' = stdin)")
    ap.add_argument("--outline", help="confirmed outline JSON file; builds a spec (use with --theme/--title)")
    ap.add_argument("--data", help="resolved data map JSON (ref -> value); fills {\"$data\"} fields")
    ap.add_argument("--out", "-o", help="output .pptx path (default: <spec name>.pptx in cwd)")
    ap.add_argument("--theme", help="override spec theme: research | report | product")
    ap.add_argument("--title", help="title when building from --outline")
    ap.add_argument("--source-as-of", help="source as-of text printed on every research page")
    ap.add_argument("--mask-amounts", action="store_true", help="mask holding amounts (privacy mode)")
    ap.add_argument("--spec-out", help="write the resolved spec JSON and exit (outline -> spec)")
    ap.add_argument("--check", action="store_true", help="validate spec only, no file written")
    ap.add_argument("--example", choices=["research", "report", "product"], help="print example spec")
    ap.add_argument("--catalog", action="store_true", help="list layouts, blocks, panels, icons")
    ap.add_argument("--json", action="store_true", help="emit JSON result (for the app runtime)")
    a = ap.parse_args(argv)

    if a.catalog:
        print(json.dumps({"report_layouts": REPORT_LAYOUTS, "report_blocks": REPORT_BLOCKS, "product_layouts": PRODUCT_LAYOUTS,
                          "product_panels": PRODUCT_PANELS, "research_layouts": RESEARCH_LAYOUTS,
                          "icons": ICON_NAMES}, ensure_ascii=False, indent=1))
        return 0
    if a.example:
        p = os.path.join(HERE, "examples", "%s_demo.json" % a.example)
        with io.open(p, "r", encoding="utf-8") as f:
            sys.stdout.write(f.read())
        return 0

    warnings = []
    data_map = load_spec(a.data) if a.data else None
    if a.outline:
        spec = outline_to_spec(load_spec(a.outline), a.theme or "research", a.title)
    elif a.spec:
        spec = load_spec(a.spec)
    else:
        ap.print_help()
        return 2
    if a.theme:
        spec["theme"] = a.theme
    errs = validate(spec)
    if errs:
        result = {"ok": False, "errors": errs}
        print(json.dumps(result, ensure_ascii=False) if a.json else "[QuankSight deck] SPEC ERRORS:\n" + "\n".join("  - " + e for e in errs))
        return 2
    if a.spec_out:
        with io.open(a.spec_out, "w", encoding="utf-8") as f:
            json.dump(spec, f, ensure_ascii=False, indent=1)
        print(json.dumps({"ok": True, "spec": spec}, ensure_ascii=False) if a.json else "[QuankSight deck] spec -> %s" % a.spec_out)
        return 0
    if a.check:
        msg = "[QuankSight deck] spec OK (%d slides)" % len(spec["slides"])
        print(json.dumps({"ok": True, "slides": len(spec["slides"])}, ensure_ascii=False) if a.json else msg)
        return 0
    base_dir = os.path.dirname(os.path.abspath(a.spec)) if a.spec and a.spec != "-" else os.getcwd()
    out = a.out or (os.path.splitext(os.path.basename(a.spec or "deck"))[0] + ".pptx")
    prs, layouts, spec = build(spec, out, base_dir, warnings=warnings, mask_amounts=a.mask_amounts,
                               source_as_of=a.source_as_of, data_map=data_map)
    issues = post_check(prs)
    ws = list(dict.fromkeys(warnings + C.WARNINGS + issues))
    result = {"ok": True, "file": os.path.abspath(out), "slides": len(layouts), "layouts": layouts,
              "warnings": ws, "sourceAsOf": spec.get("sourceAsOf")}
    if a.json:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print("[QuankSight deck] OK -> %s" % result["file"])
        print("  slides: %d" % result["slides"])
        for i, l in enumerate(layouts, 1):
            print("   %2d  %s" % (i, l))
        if ws:
            print("  warnings (%d):" % len(ws))
            for w in ws[:40]:
                print("   ! " + w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
