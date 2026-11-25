# -*- coding: utf-8 -*-
"""Read-only data binding for research decks.

Spec fields may use {"$data": "quote:600438"} / "financials:600438:5y" /
"kline:600438:1d:120" / "backtest:<strategy>" / "signals:pool".  QuankSight's market,
finance and quant services are injected by the caller as plain functions; this
module never fetches remotely and never invents values.  Missing data becomes
"—" and is reported through the warnings list.
"""
from __future__ import unicode_literals
import re

MISSING = "—"
AMOUNT_KEY = re.compile(r"金额|市值|持仓|盈亏|现金|成本|成交额|amount|market|holding|cost|pnl|balance|turnover", re.I)


class ResolvedDict(dict):
    def __init__(self, data, text="", as_of=None):
        super(ResolvedDict, self).__init__(data)
        self.text = text
        self.as_of = as_of

    def __str__(self):
        return self.text

    def __unicode__(self):
        return self.text


class ResolvedList(list):
    def __init__(self, data, text="", as_of=None):
        super(ResolvedList, self).__init__(data)
        self.text = text
        self.as_of = as_of

    def __str__(self):
        return self.text

    def __unicode__(self):
        return self.text


def _fmt_num(v):
    if isinstance(v, (int, float)):
        return ("%.2f" % v).rstrip("0").rstrip(".")
    return str(v)


def _mask_value(v):
    if isinstance(v, dict):
        return {k: (MISSING if AMOUNT_KEY.search(str(k)) and v[k] not in (None, "", MISSING) else _mask_value(x))
                for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_mask_value(x) for x in v]
    if isinstance(v, str):
        return re.sub(r"(?<![\w])(-?\d[\d,]*\.?\d*)\s*(万亿元|亿元|万元|元|万|亿)", lambda m: MISSING, v)
    return v


def _text_of(data, kind):
    if kind == "quote":
        bits = []
        for k, label in (("price", "现价"), ("changePct", "涨跌幅"), ("turnover", "成交额")):
            if data.get(k) not in (None, ""):
                bits.append("%s %s" % (label, _fmt_num(data[k])))
        return "，".join(bits) if bits else MISSING
    if kind in ("financials", "backtest", "kline", "signals", "valuation"):
        n = len(data.get("rows") or data.get("series") or data.get("signals") or data.get("dates") or [])
        label = {"financials": "财务数据", "backtest": "回测数据", "kline": "K线数据", "signals": "量化信号", "valuation": "估值数据"}[kind]
        return "%s %d 项" % (label, n) if n else MISSING
    return str(data) if data else MISSING


class DataBinder(object):
    def __init__(self, services=None, warnings=None, mask_amounts=False, source_as_of=None):
        self.services = services or {}
        self.warnings = warnings if warnings is not None else []
        self.mask_amounts = bool(mask_amounts)
        self.source_as_of = source_as_of
        self.as_ofs = []
        self.sources = []

    def resolve(self, ref):
        """Resolve a $data reference; never raises for missing services/data."""
        ref = str(ref or "").strip()
        parts = ref.split(":")
        kind = parts[0] if parts else ""
        fn = self.services.get(kind)
        if not callable(fn):
            self.warnings.append("数据不可用：%s（未接入行情/财务/量化服务），已显示 %s" % (ref, MISSING))
            return MISSING
        try:
            if kind == "quote":
                data = fn(parts[1] if len(parts) > 1 else "")
            elif kind == "financials":
                data = fn(parts[1] if len(parts) > 1 else "", parts[2] if len(parts) > 2 else "5y")
            elif kind == "kline":
                data = fn(*(parts[1:] or ["", "1d", "120"]))
            else:
                data = fn(":".join(parts[1:]))
        except Exception as exc:
            self.warnings.append("数据不可用：%s（%s），已显示 %s" % (ref, str(exc)[:60], MISSING))
            return MISSING
        if data is None or data == "" or data == [] or data == {}:
            self.warnings.append("数据不可用：%s，已显示 %s" % (ref, MISSING))
            return MISSING
        return self._normalise(data, kind, ref)

    def _normalise(self, data, kind, ref):
        as_of = None
        if isinstance(data, dict):
            as_of = data.get("asOf") or data.get("sourceAsOf") or data.get("date")
            src = data.get("source") or data.get("sourceName")
            if src:
                self.sources.append(str(src))
            plain = {k: v for k, v in data.items() if k not in ("asOf", "sourceAsOf")}
        else:
            plain = data
        if self.mask_amounts:
            plain = _mask_value(plain)
        if as_of:
            self.as_ofs.append(str(as_of))
        text = _text_of(plain if isinstance(plain, dict) else {}, kind)
        if text == MISSING and not isinstance(plain, dict):
            text = str(plain)[:80]
        if isinstance(plain, dict):
            out = ResolvedDict(plain, text, as_of)
            out.source = data.get("source") or data.get("sourceName")
            out.as_of = as_of
            if kind == "quote":
                out.setdefault("stockName", plain.get("name", MISSING))
            return out
        if isinstance(plain, (list, tuple)):
            out = ResolvedList(list(plain), text, as_of)
            out.source = data.get("source") or data.get("sourceName")
            out.as_of = as_of
            return out
        return text

    def bind(self, spec):
        """Deep-copy-free recursive binding of the spec structure."""
        def walk(v, slot=None):
            if isinstance(v, dict):
                if set(v.keys()) == {"$data"}:
                    got = self.resolve(v["$data"])
                    # A ref often returns a payload object (e.g. {"series": [...]}); when the
                    # spec slot expects that inner list, hand back the inner value.
                    if slot and isinstance(got, dict) and slot in got:
                        inner = got[slot]
                        src = getattr(got, "source", None)
                        asof = getattr(got, "as_of", None)
                        if isinstance(inner, (list, tuple)):
                            out = ResolvedList(list(inner), getattr(got, "text", ""), asof)
                            out.source = src
                            return out
                        if isinstance(inner, dict):
                            out = ResolvedDict(inner, getattr(got, "text", ""), asof)
                            out.source = src
                            return out
                        return inner
                    return got
                return {k: walk(x, k) for k, x in v.items()}
            if isinstance(v, (list, tuple)):
                return [walk(x, slot) for x in v]
            return v
        bound = walk(spec)
        if self.as_ofs:
            bound["sourceAsOf"] = sorted(set(self.as_ofs))[-1]
        elif self.source_as_of:
            bound["sourceAsOf"] = self.source_as_of
        if self.sources:
            bound["sources"] = list(dict.fromkeys(self.sources))
        return bound
