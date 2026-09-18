"""Native editable pptx charts for: bar/line/area/scatter/bubble/pie/radar.

Strategy: python-pptx add_chart() creates the chart part + embedded workbook
with all series data; then we replace c:chart's plotArea/legend/title with
hand-built XML (full control: grouping, secondary axes, styling, labels).

Workbook layout (python-pptx writer):
  CategoryChartData: cats A2:An; series i name at {L_i}1, values {L_i}2:{L_i}n+1
  XyChartData: series i -> name B{off+1}; x A{off+2}:A{...}; y B{...}
  BubbleChartData: same + size C{...}; each table = len+2 rows (title+data+spacer)
"""
import math

from lxml import etree
from pptx.chart.data import (BubbleChartData, CategoryChartData,
                             XyChartData)
from pptx.enum.chart import XL_CHART_TYPE
from pptx.oxml.ns import qn
from pptx.util import Pt

from .style import color_el
from .xmlutil import sub

RASTER_ONLY = {"candlestick", "waterfall", "heatmap", "treemap", "sunburst",
               "sankey"}
NATIVE_TYPES = {"bar", "line", "area", "scatter", "bubble", "pie", "radar"}

DEFAULT_CYCLE = ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5",
                 "#70AD47"]

DL_POS = {"bar": "outEnd", "line": "t", "area": "ctr", "scatter": "r",
          "bubble": "r", "pie": "bestFit", "radar": "r"}


def col_letter(n):  # 0 -> A
    s = ""
    n += 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def _num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def merge_series_defaults(series, defaults):
    """pptd 3.4 one-level deep merge of seriesDefaults[type] into each series."""
    out = []
    for s in series:
        d = (defaults or {}).get(s.get("type")) or {}
        m = dict(s)
        for k, v in d.items():
            if k in ("type", "encode") or v is None:
                continue
            if k not in m or m[k] is None:
                m[k] = v
            elif isinstance(v, dict) and isinstance(m.get(k), dict):
                merged = dict(v)
                merged.update(m[k])
                m[k] = merged
        out.append(m)
    return out


def can_render_native(el):
    series = merge_series_defaults(el.get("series", []), el.get("seriesDefaults"))
    types = {s.get("type") for s in series}
    if not types or not types <= NATIVE_TYPES or types & RASTER_ONLY:
        return False
    if any(s.get("symbol") for s in series if s.get("type") == "bar"):
        return False
    if any(s.get("stack") == "stream" for s in series):
        return False
    stacks = {s.get("stack") for s in series if s.get("type") == "area" and s.get("stack")}
    if len(stacks) > 1:
        return False
    if types & {"scatter", "bubble"} and types & {"bar", "line", "area"}:
        return False
    if types & {"pie", "radar"} and len(types) > 1:
        return False
    if types == {"pie"} and len(series) > 1:
        return False
    if types & {"scatter", "bubble"} and any(
            (s.get("yAxisIndex") or 0) > 0 or (s.get("xAxisIndex") or 0) > 0
            for s in series):
        return False
    return True


def _vals(rows, i):
    return [r[i] if i < len(r) else None for r in rows]


def _theme_cycle(theme):
    colors = list((theme.get("colors") or {}).values())
    return colors or list(DEFAULT_CYCLE)


def _font(ff):
    if isinstance(ff, dict):
        return ff.get("latin"), ff.get("ea")
    return ff, ff


# ------------------------------------------------------------- xml helpers

def _txpr(parent, style, theme, tag="c:txPr", default_sz=12):
    txPr = sub(parent, tag)
    sub(txPr, "a:bodyPr")
    sub(txPr, "a:lstStyle")
    p = sub(txPr, "a:p")
    pPr = sub(p, "a:pPr")
    defRPr = sub(pPr, "a:defRPr")
    sz = style.get("fontSize")
    defRPr.set("sz", str(int(sz if sz is not None else default_sz)))
    if style.get("bold"):
        defRPr.set("b", "1")
    if style.get("color"):
        sf = sub(defRPr, "a:solidFill")
        color_el(sf, style["color"], theme)
    latin, ea = _font(style.get("fontFamily"))
    if latin:
        sub(defRPr, "a:latin", {"typeface": str(latin)})
    if ea:
        sub(defRPr, "a:ea", {"typeface": str(ea)})
    sub(p, "a:endParaRPr", {"lang": "en-US"})
    return txPr


def _fill_solid(spPr, fill, theme, alpha=1.0):
    """Color|GradientFill under a chart spPr (solid default)."""
    if isinstance(fill, str):
        sf = sub(spPr, "a:solidFill")
        color_el(sf, fill, theme, alpha)
    elif isinstance(fill, dict):
        gf = sub(spPr, "a:gradFill", {"rotWithShape": "1"})
        gsLst = sub(gf, "a:gsLst")
        for stop in fill.get("stops", []):
            gs = sub(gsLst, "a:gs", {"pos": str(int(stop.get("position", 0) * 100000))})
            color_el(gs, stop.get("color", "#000"), theme, alpha)
        if fill.get("gradientType") == "radial":
            path = sub(gf, "a:path", {"path": "circle"})
            sub(path, "a:fillToRect", {"l": "50000", "t": "50000", "r": "50000", "b": "50000"})
        else:
            sub(gf, "a:lin", {"ang": str(int(fill.get("angle", 0) * 60000)), "scaled": "1"})
    else:
        sub(spPr, "a:noFill")


def _ln(el, parent, color, width, theme, dash=None):
    lnel = sub(parent, el, {"w": str(int(Pt(width if width is not None else 2)))})
    if color is None:
        sub(lnel, "a:noFill")
    else:
        sf = sub(lnel, "a:solidFill")
        color_el(sf, str(color), theme)
        if dash in ("dash", "dot"):
            sub(lnel, "a:prstDash", {"val": "dash" if dash == "dash" else "sysDot"})
    return lnel


def _ref_cache(parent, ref, values, numeric):
    tag = "c:numRef" if numeric else "c:strRef"
    r = sub(parent, tag)
    sub(r, "c:f", text=ref)
    cache = sub(r, "c:numCache" if numeric else "c:strCache")
    if numeric:
        sub(cache, "c:formatCode", text="General")
    sub(cache, "c:ptCount", {"val": str(len(values))})
    for i, v in enumerate(values):
        if v is None:
            continue
        pt = sub(cache, "c:pt", {"idx": str(i)})
        sub(pt, "c:v", text=(_fmt(v) if numeric else str(v)))


def _fmt(v):
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def _ser_head(ser, i, name, name_ref):
    sub(ser, "c:idx", {"val": str(i)})
    sub(ser, "c:order", {"val": str(i)})
    tx = sub(ser, "c:tx")
    sref = sub(tx, "c:strRef")
    sub(sref, "c:f", text=name_ref)
    sc = sub(sref, "c:strCache")
    sub(sc, "c:ptCount", {"val": "1"})
    pt = sub(sc, "c:pt", {"idx": "0"})
    sub(pt, "c:v", text=name)


def _dlbls(ser, dl, theme, typ):
    """DataLabelConfig -> c:dLbls (child of ser, before cat/val)."""
    d = sub(ser, "c:dLbls")
    content = dl.get("content", "value")
    if dl.get("numberFormat"):
        sub(d, "c:numFmt", {"formatCode": str(dl["numberFormat"]), "sourceLinked": "0"})
    pos = DL_POS.get(typ)
    if pos and typ in ("bar", "pie", "line"):
        sub(d, "c:dLblPos", {"val": pos})
    sub(d, "c:showLegendKey", {"val": "0"})
    sub(d, "c:showVal", {"val": "1" if content in ("value", None) else "0"})
    sub(d, "c:showCatName", {"val": "1" if content == "category" else "0"})
    sub(d, "c:showSerName", {"val": "0"})
    sub(d, "c:showPercent", {"val": "1" if content == "percentage" else "0"})
    sub(d, "c:showBubbleSize", {"val": "0"})
    _txpr(d, dl, theme, default_sz=10)


def _merged_dlbls(series_dl, chart_dl):
    merged = {}
    if isinstance(chart_dl, dict):
        merged.update({k: v for k, v in chart_dl.items() if v is not None})
    if isinstance(series_dl, dict):
        merged.update({k: v for k, v in series_dl.items() if v is not None})
    return merged


def _marker_cfg(s):
    marker = s.get("marker")
    if marker is False:
        return None
    if marker is True or marker is None:
        marker = {}
    return marker


def _emit_marker(ser, marker, fill, border, theme):
    mk = sub(ser, "c:marker")
    if marker is None:
        sub(mk, "c:symbol", {"val": "none"})
        return
    shape = {"circle": "circle", "rect": "square", "diamond": "diamond",
             "triangle": "triangle"}.get(marker.get("shape", "circle"), "circle")
    sub(mk, "c:symbol", {"val": shape})
    sub(mk, "c:size", {"val": str(int(marker.get("size", 6)))})
    spPr = sub(mk, "c:spPr")
    _fill_solid(spPr, marker.get("fill") or fill, theme)
    mb = marker.get("border") or border
    _ln("a:ln", spPr, mb.get("color") if mb else None,
        mb.get("width", 1) if mb else None, theme)


def _emit_ln_style(ser, s, color, theme, default_w=2):
    spPr = sub(ser, "c:spPr")
    return spPr


def _axis_common(ax, cfg, theme, ax_pos, is_val):
    """catAx/valAx shared children in schema order (crossAx added by caller)."""
    cfg = cfg or {}
    scaling = sub(ax, "c:scaling")
    sub(scaling, "c:orientation",
        {"val": "maxMin" if cfg.get("reverse") else "minMax"})
    if is_val:
        if cfg.get("min") is not None:
            sub(scaling, "c:min", {"val": str(cfg["min"])})
        if cfg.get("max") is not None:
            sub(scaling, "c:max", {"val": str(cfg["max"])})
    sub(ax, "c:delete", {"val": "0" if cfg.get("show", True) else "1"})
    sub(ax, "c:axPos", {"val": ax_pos})
    gl = cfg.get("gridLine")
    if gl is not False and gl is not None:
        mg = sub(ax, "c:majorGridlines")
        if isinstance(gl, dict):
            spPr = sub(mg, "c:spPr")
            _ln("a:ln", spPr, gl.get("color"), gl.get("width", 1), theme,
                gl.get("style"))
    title = cfg.get("title")
    if title:
        tcfg = title if isinstance(title, dict) else {"text": title}
        t = sub(ax, "c:title")
        sub(t, "c:overlay", {"val": "0"})
        tx = sub(t, "c:tx")
        rich = sub(tx, "c:rich")
        sub(rich, "a:bodyPr")
        sub(rich, "a:lstStyle")
        ap = sub(rich, "a:p")
        ar = sub(ap, "a:r")
        rPr = sub(ar, "a:rPr", {"lang": "en-US"})
        if tcfg.get("fontSize"):
            rPr.set("sz", str(int(tcfg["fontSize"])))
        if tcfg.get("color"):
            sf = sub(rPr, "a:solidFill")
            color_el(sf, tcfg["color"], theme)
        if tcfg.get("bold"):
            rPr.set("b", "1")
        sub(ar, "a:t", text=str(tcfg.get("text", "")))
    label = cfg.get("label", True)
    if is_val and isinstance(label, dict) and label.get("numberFormat"):
        sub(ax, "c:numFmt", {"formatCode": str(label["numberFormat"]),
                             "sourceLinked": "0"})
    al = cfg.get("axisLine")
    tick = "out" if al is not False else "none"
    sub(ax, "c:majorTickMark", {"val": tick})
    sub(ax, "c:minorTickMark", {"val": "none"})
    sub(ax, "c:tickLblPos", {"val": "none" if label is False else "nextTo"})
    spPr = sub(ax, "c:spPr")
    if al is False:
        sub(spPr, "a:ln").append(sub(spPr, "a:noFill"))
    else:
        a = al if isinstance(al, dict) else {}
        ln = _ln("a:ln", spPr, a.get("color", "#000000"), a.get("width", 1), theme)
        arrow = a.get("arrow")
        if arrow in (True, "end", "both"):
            sub(ln, "a:tailEnd", {"type": "triangle", "w": "med", "len": "med"})
        if arrow in ("start", "both"):
            sub(ln, "a:headEnd", {"type": "triangle", "w": "med", "len": "med"})
    if isinstance(label, dict) and label:
        _txpr(ax, label, theme, default_sz=10)


def _axis_cfg(cfg, index=0):
    if isinstance(cfg, list):
        cfg = cfg[index] if index < len(cfg) else {}
    if cfg is True:
        return {}
    if cfg is False:
        return {"show": False}
    return cfg if isinstance(cfg, dict) else {}


# ------------------------------------------------------------- main entry

def render_chart(slide, el, theme):
    series = merge_series_defaults(el.get("series", []), el.get("seriesDefaults"))
    if not series:
        raise ValueError("chart needs >= 1 series")
    types = {s["type"] for s in series}
    cols, rows, colidx = _cols(el)
    x, y, w, h = el["bounds"]

    horizontal = (types <= {"bar", "line", "area"} and
                  _is_horizontal(series, rows, colidx, el))
    cd, template, sdata = _chart_data(series, types, rows, colidx, horizontal)
    gf = slide.shapes.add_chart(template, Pt(x), Pt(y), Pt(w), Pt(h), cd)
    chart = gf.chart
    cs = chart._chartSpace
    ch = cs.find(qn("c:chart"))
    for tag in ("c:title", "c:autoTitleDeleted", "c:plotArea", "c:legend",
                "c:plotVisOnly", "c:dispBlanksAs"):
        for e in ch.findall(qn(tag)):
            ch.remove(e)
    for e in cs.findall(qn("c:spPr")):
        cs.remove(e)
    for e in cs.findall(qn("c:txPr")):
        cs.remove(e)

    # chartSpace frame styling (spPr right after c:chart) + global font txPr
    spPr = None
    if el.get("fill") or el.get("border") or el.get("shadow"):
        spPr = etree.Element(qn("c:spPr"))
        ch.addnext(spPr)
        if el.get("fill"):
            _fill_solid(spPr, el["fill"], theme)
        else:
            sub(spPr, "a:noFill")
        b = el.get("border")
        _ln("a:ln", spPr, b.get("color") if b else None,
            b.get("width", 1) if b else None, theme,
            b.get("style") if b else None)
        sh = el.get("shadow")
        if sh:
            eff = sub(spPr, "a:effectLst")
            off = sh.get("offset") or [0, 0]
            dist = int(Pt(math.hypot(off[0], off[1]))) if (off[0] or off[1]) else 0
            dirn = int(math.degrees(math.atan2(off[1], off[0])) % 360 * 60000) if (off[0] or off[1]) else 2700000
            os_ = sub(eff, "a:outerShdw", {
                "blurRad": str(int(Pt(sh.get("blur", 4)))),
                "dist": str(dist), "dir": str(dirn), "rotWithShape": "0"})
            color_el(os_, sh.get("color", "#000000"), theme)
    if el.get("fontFamily"):
        txPr = etree.Element(qn("c:txPr"))
        (spPr if spPr is not None else ch).addnext(txPr)
        _txpr_into(txPr, el, theme)

    plotArea = etree.SubElement(ch, qn("c:plotArea"))
    sub(plotArea, "c:layout")
    theme_cycle = _theme_cycle(theme)

    if types == {"pie"}:
        _build_pie(plotArea, series[0], rows, colidx, theme, theme_cycle,
                   el.get("dataLabels"))
    elif types == {"radar"}:
        _build_radar(plotArea, series, rows, colidx, theme, theme_cycle,
                     el.get("spokeAxis") or {}, el.get("dataLabels"))
    elif types == {"scatter"}:
        _build_scatter(plotArea, series, sdata, theme, theme_cycle,
                       el.get("dataLabels"))
        _build_val_axes(plotArea, _axis_cfg(el.get("xAxis")),
                        _axis_cfg(el.get("yAxis")), theme)
    elif types == {"bubble"}:
        _build_bubble(plotArea, series, sdata, theme, theme_cycle, el, el.get("dataLabels"))
        _build_val_axes(plotArea, _axis_cfg(el.get("xAxis")),
                        _axis_cfg(el.get("yAxis")), theme)
    else:
        horizontal = _is_horizontal(series, rows, colidx, el)
        _build_cartesian(plotArea, series, rows, colidx, theme, theme_cycle,
                         el, horizontal)

    # title (first child of c:chart)
    title = el.get("title")
    if title:
        tcfg = title if isinstance(title, dict) else {"text": title}
        t = etree.Element(qn("c:title"))
        ch.insert(0, t)
        sub(t, "c:overlay", {"val": "0"})
        tx = sub(t, "c:tx")
        rich = sub(tx, "c:rich")
        sub(rich, "a:bodyPr")
        sub(rich, "a:lstStyle")
        ap = sub(rich, "a:p")
        apPr = sub(ap, "a:pPr")
        defRPr = sub(apPr, "a:defRPr")
        defRPr.set("sz", str(int(tcfg.get("fontSize") or 14)))
        if tcfg.get("color"):
            sf = sub(defRPr, "a:solidFill")
            color_el(sf, tcfg["color"], theme)
        if tcfg.get("bold"):
            defRPr.set("b", "1")
        latin, ea = _font(tcfg.get("fontFamily"))
        if latin:
            sub(defRPr, "a:latin", {"typeface": str(latin)})
        ar = sub(ap, "a:r")
        rPr = sub(ar, "a:rPr", {"lang": "en-US"})
        sub(ar, "a:t", text=str(tcfg.get("text", "")))
    else:
        ch.insert(0, etree.Element(qn("c:autoTitleDeleted")))
        ch.find(qn("c:autoTitleDeleted")).set("val", "1")

    legend = el.get("legend")
    show = (True if legend is None else bool(legend) if isinstance(legend, bool)
            else legend.get("show", True))
    if show:
        leg = etree.SubElement(ch, qn("c:legend"))
        pos = {"top": "t", "bottom": "b", "left": "l", "right": "r"}
        lpos = (legend.get("position", "bottom") if isinstance(legend, dict)
                else "bottom")
        sub(leg, "c:legendPos", {"val": pos.get(lpos, "b")})
        sub(leg, "c:overlay", {"val": "0"})
        if isinstance(legend, dict):
            _txpr(leg, legend, theme, default_sz=10)

    sub(ch, "c:plotVisOnly", {"val": "1"})
    nb = "gap"
    for s in series:
        if s.get("nullHandling"):
            nb = {"zero": "zero", "gap": "gap", "connect": "span"}.get(
                s["nullHandling"], "gap")
            break
    sub(ch, "c:dispBlanksAs", {"val": nb})
    return gf


def _txpr_into(txPr, style, theme):
    sub(txPr, "a:bodyPr")
    sub(txPr, "a:lstStyle")
    p = sub(txPr, "a:p")
    pPr = sub(p, "a:pPr")
    defRPr = sub(pPr, "a:defRPr")
    latin, ea = _font(style.get("fontFamily"))
    if latin:
        sub(defRPr, "a:latin", {"typeface": str(latin)})
    if ea:
        sub(defRPr, "a:ea", {"typeface": str(ea)})
    sub(p, "a:endParaRPr", {"lang": "en-US"})


def _cols(el):
    data = el.get("data") or {}
    cols = [str(c) for c in data.get("cols", [])]
    rows = data.get("rows", [])
    idx = {c: i for i, c in enumerate(cols)}
    return cols, rows, idx


def _chart_data(series, types, rows, colidx, horizontal=False):
    """Build python-pptx chart data + workbook refs info (sdata)."""
    if types == {"scatter"} or types == {"bubble"}:
        sdata = []
        if types == {"bubble"}:
            cd = BubbleChartData()
        else:
            cd = XyChartData()
        for s in series:
            xs = _vals(rows, colidx[s["encode"]["x"]])
            ys = _vals(rows, colidx[s["encode"]["y"]])
            pts = [(_num(a), _num(b)) for a, b in zip(xs, ys)
                   if a is not None or b is not None]
            if types == {"bubble"}:
                ss = _vals(rows, colidx[s["encode"]["size"]])
                pts = [(_num(a), _num(b), _num(c)) for a, b, c in zip(xs, ys, ss)
                       if a is not None or b is not None]
            sd = cd.add_series(s.get("name") or s["encode"]["y"])
            for pt in pts:
                sd.add_data_point(*pt)
            sdata.append({"name": s.get("name") or s["encode"]["y"],
                          "pts": pts})
        template = XL_CHART_TYPE.BUBBLE if types == {"bubble"} else XL_CHART_TYPE.XY_SCATTER
        return cd, template, sdata

    if types == {"pie"}:
        s = series[0]
        cats = _vals(rows, colidx[s["encode"]["category"]])
        vals = [_num(v) for v in _vals(rows, colidx[s["encode"]["value"]])]
        cd = CategoryChartData()
        cd.categories = [str(c) if c is not None else "" for c in cats]
        cd.add_series(s.get("name") or s["encode"]["value"], vals)
        template = (XL_CHART_TYPE.DOUGHNUT if (s.get("innerRadius") or 0) > 0
                    else XL_CHART_TYPE.PIE)
        return cd, template, None

    # cartesian / radar
    if types == {"radar"}:
        catcol = series[0]["encode"].get("category")
    else:
        catcol = (series[0]["encode"].get("y") if horizontal
                  else series[0]["encode"].get("x")) or \
            series[0]["encode"].get("category")
    cats = _vals(rows, colidx[catcol])
    cd = CategoryChartData()
    cd.categories = [str(c) if c is not None else "" for c in cats]
    for s in series:
        if types == {"radar"}:
            vcol = s["encode"]["y"]
        else:
            vcol = s["encode"]["x"] if horizontal else s["encode"]["y"]
        vals = [_num(v) for v in _vals(rows, colidx[vcol])]
        cd.add_series(s.get("name") or vcol, vals)
    if types == {"radar"}:
        template = XL_CHART_TYPE.RADAR
    elif horizontal:
        template = XL_CHART_TYPE.BAR_CLUSTERED
    else:
        template = XL_CHART_TYPE.COLUMN_CLUSTERED
    return cd, template, None


def _is_horizontal(series, rows, colidx, chart_cfg):
    s0 = series[0]
    xax = chart_cfg.get("xAxis") if chart_cfg else None
    yax = chart_cfg.get("yAxis") if chart_cfg else None
    x_type = xax.get("type") if isinstance(xax, dict) else None
    y_type = yax.get("type") if isinstance(yax, dict) else None
    if y_type == "category" and x_type != "category":
        return True
    if x_type == "category":
        return False
    xv = _vals(rows, colidx[s0["encode"]["x"]])
    yv = _vals(rows, colidx[s0["encode"]["y"]])
    xn = all(_num(v) is not None for v in xv if v is not None)
    ys = all(_num(v) is None for v in yv if v is not None)
    return xn and ys and any(v is not None for v in yv)


# ------------------------------------------------------------- pie / radar

def _build_pie(plotArea, s, rows, colidx, theme, cycle, chart_dl):
    donut = (s.get("innerRadius") or 0) > 0
    pie = sub(plotArea, "c:doughnutChart" if donut else "c:pieChart")
    sub(pie, "c:varyColors", {"val": "1"})
    ser = sub(pie, "c:ser")
    _ser_head(ser, 0, s.get("name") or "series", "Sheet1!$B$1")
    fills = s.get("fill")
    if isinstance(fills, (str, dict)):
        fills = [fills]
    elif fills is None:
        fills = []
    cats = _vals(rows, colidx[s["encode"]["category"]])
    vals = [_num(v) for v in _vals(rows, colidx[s["encode"]["value"]])]
    cat_numeric = all(_num(c) is not None for c in cats if c is not None)
    for i in range(len(vals)):
        dpt = sub(ser, "c:dPt")
        sub(dpt, "c:idx", {"val": str(i)})
        sub(dpt, "c:bubble3D", {"val": "0"})
        spPr = sub(dpt, "c:spPr")
        f = (fills[i % len(fills)] if fills else
             cycle[i % len(cycle)])
        _fill_solid(spPr, f, theme)
        b = s.get("border")
        _ln("a:ln", spPr, b.get("color", "#FFFFFF") if b else None,
            b.get("width", 1) if b else None, theme)
    dl = _merged_dlbls(s.get("dataLabels"), chart_dl)
    if dl.get("show"):
        _dlbls(ser, dl, theme, "pie")
    cat = sub(ser, "c:cat")
    _ref_cache(cat, "Sheet1!$A$2:$A$%d" % (len(cats) + 1), cats, cat_numeric)
    val = sub(ser, "c:val")
    _ref_cache(val, "Sheet1!$B$2:$B$%d" % (len(vals) + 1), vals, True)
    sub(pie, "c:firstSliceAng", {"val": str(int((s.get("startAngle") or 0) * 60000))})
    if donut:
        sub(pie, "c:holeSize", {"val": str(int(s["innerRadius"] * 100))})


def _build_radar(plotArea, series, rows, colidx, theme, cycle, spoke, chart_dl):
    rc = sub(plotArea, "c:radarChart")
    filled = any(s.get("areaColor") is not None for s in series)
    sub(rc, "c:radarStyle", {"val": "filled" if filled else "marker"})
    sub(rc, "c:varyColors", {"val": "0"})
    cats = _vals(rows, colidx[series[0]["encode"]["category"]])
    for i, s in enumerate(series):
        ser = sub(rc, "c:ser")
        L = col_letter(i + 1)
        _ser_head(ser, i, s.get("name") or s["encode"]["y"],
                  "Sheet1!$%s$1" % L)
        spPr = sub(ser, "c:spPr")
        color = s.get("lineColor") or s.get("areaColor") or cycle[i % len(cycle)]
        if s.get("areaColor") is not None:
            _fill_solid(spPr, s["areaColor"], theme, 0.4)
        else:
            sub(spPr, "a:noFill")
        _ln("a:ln", spPr, color, s.get("width", 2), theme, s.get("lineStyle"))
        _emit_marker(ser, _marker_cfg(s), color, s.get("border"), theme)
        dl = _merged_dlbls(s.get("dataLabels"), chart_dl)
        if dl.get("show"):
            _dlbls(ser, dl, theme, "radar")
        cat = sub(ser, "c:cat")
        _ref_cache(cat, "Sheet1!$A$2:$A$%d" % (len(cats) + 1), cats, False)
        vals = [_num(v) for v in _vals(rows, colidx[s["encode"]["y"]])]
        val = sub(ser, "c:val")
        _ref_cache(val, "Sheet1!$%s$2:$%s$%d" % (L, L, len(vals) + 1), vals, True)
        sub(ser, "c:smooth", {"val": "1" if s.get("smooth") else "0"})
    sub(rc, "c:axId", {"val": "111"})
    sub(rc, "c:axId", {"val": "112"})
    catAx = sub(plotArea, "c:catAx")
    sub(catAx, "c:axId", {"val": "111"})
    _axis_common(catAx, spoke if isinstance(spoke, dict) else {}, theme, "b", False)
    sub(catAx, "c:crossAx", {"val": "112"})
    valAx = sub(plotArea, "c:valAx")
    sub(valAx, "c:axId", {"val": "112"})
    vcfg = {"show": False,
            "min": spoke.get("min") if isinstance(spoke, dict) else None,
            "max": spoke.get("max") if isinstance(spoke, dict) else None,
            "gridLine": spoke.get("gridLine", True) if isinstance(spoke, dict) else True}
    _axis_common(valAx, vcfg, theme, "l", True)
    sub(valAx, "c:crossAx", {"val": "111"})


# ------------------------------------------------------------- scatter/bubble

def _build_scatter(plotArea, series, sdata, theme, cycle, chart_dl):
    sc = sub(plotArea, "c:scatterChart")
    sub(sc, "c:scatterStyle", {"val": "lineMarker"})
    offset = 0
    for i, (s, sd) in enumerate(zip(series, sdata)):
        npts = len(sd["pts"])
        top = offset + 2
        ser = sub(sc, "c:ser")
        _ser_head(ser, i, sd["name"], "Sheet1!$B$%d" % (offset + 1))
        spPr = sub(ser, "c:spPr")
        sub(spPr, "a:ln")
        spPr.find(qn("a:ln")).append(etree.Element(qn("a:noFill")))
        _emit_marker(ser, s.get("marker") or {},
                     s.get("fill") or cycle[i % len(cycle)],
                     s.get("border"), theme)
        dl = _merged_dlbls(s.get("dataLabels"), chart_dl)
        if dl.get("show"):
            _dlbls(ser, dl, theme, "scatter")
        xv = sub(ser, "c:xVal")
        _ref_cache(xv, "Sheet1!$A$%d:$A$%d" % (top, top + npts - 1),
                   [p[0] for p in sd["pts"]], True)
        yv = sub(ser, "c:yVal")
        _ref_cache(yv, "Sheet1!$B$%d:$B$%d" % (top, top + npts - 1),
                   [p[1] for p in sd["pts"]], True)
        offset += npts + 2
    sub(sc, "c:axId", {"val": "201"})
    sub(sc, "c:axId", {"val": "202"})


def _build_bubble(plotArea, series, sdata, theme, cycle, el, chart_dl):
    bc = sub(plotArea, "c:bubbleChart")
    sub(bc, "c:varyColors", {"val": "0"})
    offset = 0
    for i, (s, sd) in enumerate(zip(series, sdata)):
        npts = len(sd["pts"])
        top = offset + 2
        ser = sub(bc, "c:ser")
        _ser_head(ser, i, sd["name"], "Sheet1!$B$%d" % (offset + 1))
        spPr = sub(ser, "c:spPr")
        _fill_solid(spPr, s.get("fill") or cycle[i % len(cycle)], theme)
        b = s.get("border")
        _ln("a:ln", spPr, b.get("color") if b else None,
            b.get("width", 1) if b else None, theme)
        dl = _merged_dlbls(s.get("dataLabels"), chart_dl)
        if dl.get("show"):
            _dlbls(ser, dl, theme, "bubble")
        xv = sub(ser, "c:xVal")
        _ref_cache(xv, "Sheet1!$A$%d:$A$%d" % (top, top + npts - 1),
                   [p[0] for p in sd["pts"]], True)
        yv = sub(ser, "c:yVal")
        _ref_cache(yv, "Sheet1!$B$%d:$B$%d" % (top, top + npts - 1),
                   [p[1] for p in sd["pts"]], True)
        sv = sub(ser, "c:bubbleSize")
        _ref_cache(sv, "Sheet1!$C$%d:$C$%d" % (top, top + npts - 1),
                   [p[2] for p in sd["pts"]], True)
        offset += npts + 2
    sr = None
    for s in series:
        if s.get("sizeRange"):
            sr = s["sizeRange"]
    sub(bc, "c:scale", {"val": str(int(sr[1]) if sr else 100)})
    sub(bc, "c:axId", {"val": "201"})
    sub(bc, "c:axId", {"val": "202"})


def _build_val_axes(plotArea, xcfg, ycfg, theme):
    ax = sub(plotArea, "c:valAx")
    sub(ax, "c:axId", {"val": "201"})
    _axis_common(ax, xcfg, theme, "b", True)
    sub(ax, "c:crossAx", {"val": "202"})
    sub(ax, "c:crosses", {"val": "autoZero"})
    ax2 = sub(plotArea, "c:valAx")
    sub(ax2, "c:axId", {"val": "202"})
    _axis_common(ax2, ycfg, theme, "l", True)
    sub(ax2, "c:crossAx", {"val": "201"})
    sub(ax2, "c:crosses", {"val": "autoZero"})


# ------------------------------------------------------------- cartesian

def _build_cartesian(plotArea, series, rows, colidx, theme, cycle, el,
                     horizontal):
    groups = []
    for s in series:
        ai = (s.get("yAxisIndex") or 0) or (s.get("xAxisIndex") or 0)
        key = (s["type"], s.get("stack"), ai)
        for g in groups:
            if g["key"] == key:
                g["series"].append(s)
                break
        else:
            groups.append({"key": key, "series": [s]})
    axis_indexes = sorted({g["key"][2] for g in groups})
    ax_ids = {ai: (300 + ai * 10 + 1, 300 + ai * 10 + 2) for ai in axis_indexes}

    catcol = series[0]["encode"].get("y" if horizontal else "x") or \
        series[0]["encode"].get("category")
    cats = _vals(rows, colidx[catcol])
    cat_numeric = all(_num(c) is not None for c in cats if c is not None)

    ser_i = 0
    for g in groups:
        stype, stack, ai = g["key"]
        catId, valId = ax_ids[ai]
        if stype == "bar":
            plot = sub(plotArea, "c:barChart")
            sub(plot, "c:barDir", {"val": "bar" if horizontal else "col"})
            grouping = {"value": "stacked", "percent": "percentStacked"}.get(
                stack, "clustered")
            sub(plot, "c:grouping", {"val": grouping})
            sub(plot, "c:varyColors", {"val": "0"})
        elif stype == "line":
            plot = sub(plotArea, "c:lineChart")
            sub(plot, "c:grouping", {"val": "standard"})
            sub(plot, "c:varyColors", {"val": "0"})
        else:
            plot = sub(plotArea, "c:areaChart")
            sub(plot, "c:grouping", {"val": "stacked" if stack else "standard"})
            sub(plot, "c:varyColors", {"val": "0"})
        g["grouping"] = grouping if stype == "bar" else None
        for s in g["series"]:
            vcol = s["encode"]["x"] if horizontal else s["encode"]["y"]
            L = col_letter(ser_i + 1)
            ser = sub(plot, "c:ser")
            _ser_head(ser, ser_i, s.get("name") or vcol, "Sheet1!$%s$1" % L)
            ci = ser_i % len(cycle)
            spPr = sub(ser, "c:spPr")
            if stype == "bar":
                _fill_solid(spPr, s.get("fill") or cycle[ci], theme)
                b = s.get("border")
                _ln("a:ln", spPr, b.get("color") if b else None,
                    b.get("width", 1) if b else None, theme)
            else:
                color = s.get("lineColor") or s.get("areaColor") or cycle[ci]
                if stype == "area":
                    area = s.get("areaColor")
                    if area is None:
                        sf = sub(spPr, "a:solidFill")
                        color_el(sf, str(color), theme, 0.35)
                    else:
                        _fill_solid(spPr, area, theme)
                else:
                    sub(spPr, "a:noFill")
                _ln("a:ln", spPr, color, s.get("width", 2), theme, s.get("lineStyle"))
            if stype == "bar":
                sub(ser, "c:invertIfNegative", {"val": "0"})
            if stype in ("line", "area", "radar"):
                _emit_marker(ser, _marker_cfg(s),
                             s.get("lineColor") or cycle[ci], s.get("border"), theme)
            dl = _merged_dlbls(s.get("dataLabels"), el.get("dataLabels"))
            if dl.get("show"):
                _dlbls(ser, dl, theme, stype)
            cat = sub(ser, "c:cat")
            _ref_cache(cat, "Sheet1!$A$2:$A$%d" % (len(cats) + 1), cats, cat_numeric)
            vals = [_num(v) for v in _vals(rows, colidx[vcol])]
            val = sub(ser, "c:val")
            _ref_cache(val, "Sheet1!$%s$2:$%s$%d" % (L, L, len(vals) + 1), vals, True)
            if stype == "line":
                sub(ser, "c:smooth", {"val": "1" if s.get("smooth") else "0"})
            ser_i += 1
        if stype == "bar":
            bw = el.get("barWidth")
            cg = el.get("categoryGap", 0.2)
            gap = (1.0 / bw - 1.0) * (1.0 - cg) if bw else cg / 0.6
            sub(plot, "c:gapWidth", {"val": str(max(0, int(gap * 100)))})
            if grouping in ("stacked", "percentStacked"):
                sub(plot, "c:overlap", {"val": "100"})
            elif len(g["series"]) > 1:
                sub(plot, "c:overlap", {"val": str(-int((el.get("barGap") or 0) * 100))})
        sub(plot, "c:axId", {"val": str(catId)})
        sub(plot, "c:axId", {"val": str(valId)})

    for ai in axis_indexes:
        catId, valId = ax_ids[ai]
        xcfg = _axis_cfg(el.get("xAxis"), ai)
        ycfg = _axis_cfg(el.get("yAxis"), ai)
        if horizontal:
            cat_cfg, cat_pos = ycfg, "l"
            val_cfg, val_pos = xcfg, "b"
        else:
            cat_cfg, cat_pos = xcfg, "b"
            val_cfg, val_pos = ycfg, "l"
        if ai > 0:
            cat_cfg = dict(cat_cfg or {})
            cat_cfg["show"] = False
            val_pos = "t" if horizontal else "r"
        catAx = sub(plotArea, "c:catAx")
        sub(catAx, "c:axId", {"val": str(catId)})
        _axis_common(catAx, cat_cfg, theme, cat_pos, False)
        sub(catAx, "c:crossAx", {"val": str(valId)})
        valAx = sub(plotArea, "c:valAx")
        sub(valAx, "c:axId", {"val": str(valId)})
        _axis_common(valAx, val_cfg or {}, theme, val_pos, True)
        sub(valAx, "c:crossAx", {"val": str(catId)})
        sub(valAx, "c:crosses", {"val": "max" if ai > 0 else "autoZero"})
