"""Rasterized (Pillow) charts: candlestick, waterfall, heatmap, treemap,
sunburst, sankey + generic cartesian fallback for combos the native path
rejects (stream stacks, scatter mixed with bar/line/area, pictograph bars).

All drawn at 2x supersample, emitted as a PNG picture; chart frame
fill/border/shadow are applied to the picture's spPr.
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from pptx.oxml.ns import qn
from pptx.util import Pt

from .charts_native import (_num, _vals, merge_series_defaults,
                            _theme_cycle)
from .style import resolve_color, color_el, fetch_url
from .xmlutil import sub

CACHE = Path.home() / ".cache" / "pptd_utils"
FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
]
_FONTS = {}


def _font(size):
    key = int(size)
    if key not in _FONTS:
        for p in FONT_CANDIDATES:
            try:
                _FONTS[key] = ImageFont.truetype(p, key)
                break
            except Exception:
                continue
        else:
            try:
                _FONTS[key] = ImageFont.load_default()
            except Exception:
                _FONTS[key] = None
    return _FONTS[key]


def _fmt_value(v, fmt):
    if v is None:
        return ""
    if not fmt:
        if isinstance(v, float) and v.is_integer():
            return str(int(v))
        return str(round(v, 2))
    try:
        if fmt == "0":
            return str(int(round(v)))
        if fmt == "0.0":
            return f"{v:.1f}"
        if fmt == "0%":
            return f"{v * 100:.0f}%"
        if fmt == "0.0%":
            return f"{v * 100:.1f}%"
        if fmt == "#,##0":
            return f"{int(round(v)):,}"
        if fmt == "0.0E+00":
            return f"{v:.1E}"
    except Exception:
        pass
    return str(v)


def _rgb(color, theme, alpha=1.0):
    rgb, a = resolve_color(color, theme, alpha)
    return (*rgb, int(a * 255))


def _lerp(c0, c1, t):
    return tuple(int(round(a + (b - a) * t)) for a, b in zip(c0, c1))


def render_chart(slide, el, theme, root):
    series = merge_series_defaults(el.get("series", []), el.get("seriesDefaults"))
    x, y, w, h = el["bounds"]
    S = 2
    img = Image.new("RGBA", (int(w) * S, int(h) * S), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    ctx = {"img": img, "draw": draw, "S": S, "w": int(w), "h": int(h),
           "theme": theme, "el": el}
    _title(ctx, el)
    _legend(ctx, merge_series_defaults(el.get("series", []), el.get("seriesDefaults")),
            el, series[0].get("type"))
    t0 = series[0].get("type")
    if t0 == "candlestick":
        _candlestick(ctx, series, el)
    elif t0 == "waterfall":
        _waterfall(ctx, series[0], el)
    elif t0 == "heatmap":
        _heatmap(ctx, series[0], el)
    elif t0 == "treemap":
        _treemap(ctx, series[0], el)
    elif t0 == "sunburst":
        _sunburst(ctx, series[0], el)
    elif t0 == "sankey":
        _sankey(ctx, series[0], el)
    else:
        _cartesian_raster(ctx, series, el)
    png = CACHE / _chart_png_name(el, series)
    CACHE.mkdir(parents=True, exist_ok=True)
    img.resize((int(w), int(h)), Image.LANCZOS).save(png)
    pic = slide.shapes.add_picture(str(png), Pt(x), Pt(y), Pt(w), Pt(h))
    _frame_style(pic, el, theme)
    return pic


def _chart_png_name(el, series):
    import hashlib
    payload = repr(sorted(el.items(), key=lambda kv: kv[0])) + repr(series)
    return "chart_" + hashlib.sha1(payload.encode()).hexdigest()[:20] + ".png"


def _frame_style(pic, el, theme):
    spPr = pic._element.spPr
    if el.get("fill"):
        f = el["fill"]
        if f.get("type") == "solid":
            sf = sub(spPr, "a:solidFill")
            color_el(sf, f.get("color"), theme)
        elif f.get("type") == "gradient":
            gf = sub(spPr, "a:gradFill", {"rotWithShape": "1"})
            gsLst = sub(gf, "a:gsLst")
            for stop in f.get("stops", []):
                gs = sub(gsLst, "a:gs", {"pos": str(int(stop.get("position", 0) * 100000))})
                color_el(gs, stop.get("color"), theme)
            if f.get("gradientType") == "radial":
                path = sub(gf, "a:path", {"path": "circle"})
                sub(path, "a:fillToRect", {"l": "50000", "t": "50000", "r": "50000", "b": "50000"})
            else:
                sub(gf, "a:lin", {"ang": str(int(f.get("angle", 0) * 60000))})
    b = el.get("border")
    if b:
        ln = sub(spPr, "a:ln", {"w": str(int(Pt(b.get("width", 1))))})
        sf = sub(ln, "a:solidFill")
        color_el(sf, b.get("color", "#000000"), theme)
        if b.get("style") in ("dash", "dot"):
            sub(ln, "a:prstDash", {"val": "dash" if b.get("style") == "dash" else "sysDot"})
    sh = el.get("shadow")
    if sh:
        eff = sub(spPr, "a:effectLst")
        off = sh.get("offset") or [0, 0]
        dist = int(Pt(math.hypot(off[0], off[1])))
        dirn = int(math.degrees(math.atan2(off[1], off[0])) % 360 * 60000)
        os_ = sub(eff, "a:outerShdw", {
            "blurRad": str(int(Pt(sh.get("blur", 4)))), "dist": str(dist),
            "dir": str(dirn), "rotWithShape": "0"})
        color_el(os_, sh.get("color", "#000000"), theme)


# ------------------------------------------------------------- scaffolding

def _title(ctx, el):
    title = el.get("title")
    if not title:
        return
    text = title if isinstance(title, str) else title.get("text", "")
    color = title.get("color") if isinstance(title, dict) else None
    size = (title.get("fontSize") if isinstance(title, dict) else None) or 16
    d = ctx["draw"]
    S = ctx["S"]
    f = _font(size * S)
    bb = d.textbbox((0, 0), text, font=f)
    tw = bb[2] - bb[0]
    d.text(((ctx["w"] * S - tw) // 2, 8 * S), text, font=f,
           fill=_rgb(color or "#333333", ctx["theme"]))
    ctx["title_h"] = (bb[3] + 12) * S


def _legend(ctx, series, el, typ):
    show = el.get("legend")
    show = (True if show is None else bool(show) if isinstance(show, bool)
            else show.get("show", True))
    if not show:
        return
    names = [s.get("name") or _default_name(s) for s in series]
    if typ in ("waterfall", "treemap", "sunburst", "sankey", "heatmap",
               "candlestick"):
        if typ == "candlestick" and len(series) > 1:
            names = [s.get("name") or _default_name(s) for s in series[1:]]
        else:
            names = []
    if not names:
        return
    d = ctx["draw"]
    S = ctx["S"]
    f = _font(10 * S)
    theme = ctx["theme"]
    cycle = _theme_cycle(theme)
    entries = []
    x = 10 * S
    lh = 0
    for i, name in enumerate(names):
        color = _series_color(series[i + 1] if typ == "candlestick" else series[i],
                              i, cycle, theme, typ)
        bb = d.textbbox((0, 0), name, font=f)
        entries.append((x, name, color))
        x += (bb[2] - bb[0]) + 14 * S + 18 * S
        lh = max(lh, bb[3] - bb[1])
    if x > ctx["w"] * S:  # wrap not supported: shrink
        pass
    y = ctx["h"] * S - lh - 10 * S
    for ex, name, color in entries:
        d.rectangle([ex, y, ex + 10 * S, y + 10 * S], fill=color)
        d.text((ex + 14 * S, y - 2 * S), name, font=f,
               fill=_rgb("#333333", theme))
    ctx["legend_h"] = lh + 14 * S


def _series_color(s, i, cycle, theme, typ):
    if typ in ("waterfall", "sankey", "treemap", "sunburst", "heatmap"):
        pass
    c = s.get("fill") or s.get("lineColor") or s.get("areaColor") or cycle[i % len(cycle)]
    if isinstance(c, dict):
        stops = c.get("stops", [])
        c = stops[0].get("color") if stops else cycle[i % len(cycle)]
    return _rgb(c, theme)


def _default_name(s):
    enc = s.get("encode") or {}
    return str(enc.get("y") or enc.get("value") or enc.get("flow") or
               enc.get("close") or "series")


def _plot_rect(ctx, el):
    S = ctx["S"]
    left = 46 * S
    right = ctx["w"] * S - 10 * S
    top = ctx.get("title_h", 0) + 8 * S
    bottom = ctx["h"] * S - ctx.get("legend_h", 0) - 30 * S
    return (left, top, right, bottom)


def _nice_ticks(vmin, vmax, n=5):
    if vmax <= vmin:
        vmax = vmin + 1
    span = vmax - vmin
    step = 10 ** math.floor(math.log10(span / n))
    for m in (1, 2, 2.5, 5, 10):
        if span / (m * step) <= n:
            step *= m
            break
    start = math.floor(vmin / step) * step
    ticks = []
    v = start
    while v <= vmax + 1e-9:
        ticks.append(round(v, 10))
        v += step
    return ticks


def _axis_frame(ctx, rect, ticks, cat_labels, el, horizontal=False,
                tick_fmt=None, grid=True):
    d, S, theme = ctx["draw"], ctx["S"], ctx["theme"]
    l, t, r, b = rect
    d.rectangle([l, t, r, b], outline=_rgb("#666666", theme), width=S)
    f = _font(9 * S)
    for v in ticks:
        yy = b - (v - ticks[0]) / (ticks[-1] - ticks[0]) * (b - t)
        if grid:
            d.line([l, yy, r, yy], fill=_rgb("#e5e7eb", theme), width=S)
        d.text((l - 6 * S, yy - 5 * S), _fmt_value(v, tick_fmt),
               font=f, fill=_rgb("#333333", theme), anchor="ra")
    if cat_labels:
        n = len(cat_labels)
        step = (r - l) / n
        for i, lab in enumerate(cat_labels):
            cx = l + step * (i + 0.5)
            d.text((cx, b + 4 * S), str(lab), font=f,
                   fill=_rgb("#333333", theme), anchor="ma")
    xaxis = el.get("xAxis")
    if isinstance(xaxis, dict) and xaxis.get("title"):
        tf = _font(10 * S)
        d.text(((l + r) // 2, b + 18 * S), str(xaxis["title"]),
               font=tf, fill=_rgb("#333333", theme), anchor="ma")
    yaxis = el.get("yAxis")
    if isinstance(yaxis, dict) and yaxis.get("title"):
        tf = _font(10 * S)
        bb = d.textbbox((0, 0), str(yaxis["title"]), font=tf)
        d.text((l - (bb[2] - bb[0]) - 8 * S, (t + b) // 2), str(yaxis["title"]),
               font=tf, fill=_rgb("#333333", theme))


# ------------------------------------------------------------- candlestick

def _candlestick(ctx, series, el):
    d, S, theme = ctx["draw"], ctx["S"], ctx["theme"]
    cs = series[0]
    enc = cs["encode"]
    cols, rows, colidx = _cols(el)
    cats = _vals(rows, colidx[enc["x"]])
    highs = [_num(v) for v in _vals(rows, colidx[enc["high"]])]
    lows = [_num(v) for v in _vals(rows, colidx[enc["low"]])]
    closes = [_num(v) for v in _vals(rows, colidx[enc["close"]])]
    opens = ([_num(v) for v in _vals(rows, colidx[enc["open"]])]
             if enc.get("open") else None)
    rect = _plot_rect(ctx, el)
    l, t, r, b = rect
    vmin = min(v for v in lows if v is not None)
    vmax = max(v for v in highs if v is not None)
    ticks = _nice_ticks(vmin, vmax)
    def yv(v):
        return b - (v - ticks[0]) / (ticks[-1] - ticks[0]) * (b - t)
    _axis_frame(ctx, rect, ticks, cats, el)
    up = (cs.get("upBars") or {}).get("fill", "#ef4444")
    down = (cs.get("downBars") or {}).get("fill", "#22c55e")
    wick = (cs.get("wickStyle") or {})
    wick_c = wick.get("color", "#6b7280")
    wick_w = wick.get("width", 1)
    n = len(cats)
    slot = (r - l) / n
    bw = min(slot * 0.6, 18 * S)
    for i in range(n):
        cx = l + slot * (i + 0.5)
        if highs[i] is None or closes[i] is None:
            continue
        d.line([cx, yv(highs[i]), cx, yv(lows[i])],
               fill=_rgb(wick_c, theme), width=max(1, int(wick_w * S)))
        if opens is not None and opens[i] is not None:
            color = up if closes[i] >= opens[i] else down
            y0, y1 = yv(max(opens[i], closes[i])), yv(min(opens[i], closes[i]))
            d.rectangle([cx - bw / 2, y0, cx + bw / 2, y1],
                        fill=_rgb(color, theme), outline=_rgb(wick_c, theme))
        else:
            d.ellipse([cx - 3 * S, yv(closes[i]) - 3 * S,
                       cx + 3 * S, yv(closes[i]) + 3 * S],
                      fill=_rgb(down, theme))
    # overlay line series
    for s in series[1:]:
        vals = [_num(v) for v in _vals(rows, colidx[s["encode"]["y"]])]
        pts = [(l + slot * (i + 0.5), yv(v)) for i, v in enumerate(vals)
               if v is not None and v <= ticks[-1]]
        if len(pts) >= 2:
            color = s.get("lineColor") or "#f59e0b"
            d.line(pts, fill=_rgb(color, theme), width=int(s.get("width", 2) * S),
                   joint="curve")


def _cols(el):
    data = el.get("data") or {}
    cols = [str(c) for c in data.get("cols", [])]
    rows = data.get("rows", [])
    return cols, rows, {c: i for i, c in enumerate(cols)}


# ------------------------------------------------------------- waterfall

def _waterfall(ctx, s, el):
    d, S, theme = ctx["draw"], ctx["S"], ctx["theme"]
    enc = s["encode"]
    cols, rows, colidx = _cols(el)
    cats = _vals(rows, colidx[enc["x"]])
    vals = [_num(v) for v in _vals(rows, colidx[enc["y"]])]
    istotal = ([bool(v) for v in _vals(rows, colidx[enc["isTotal"]])]
               if enc.get("isTotal") else [False] * len(vals))
    rect = _plot_rect(ctx, el)
    l, t, r, b = rect
    cum = 0.0
    bars = []  # (label, y0, y1, class)
    for cat, v, tot in zip(cats, vals, istotal):
        if v is None:
            bars.append((cat, None, None, "total"))
            continue
        if tot:
            bars.append((cat, 0.0, v, "total"))
            cum = v
        else:
            bars.append((cat, cum, cum + v, "inc" if v > 0 else "dec"))
            cum += v
    vmax = max(max(abs(y0), abs(y1)) for _, y0, y1, _ in bars if y0 is not None)
    vmin = min(min(y0, y1) for _, y0, y1, _ in bars if y0 is not None)
    ticks = _nice_ticks(vmin, vmax)
    def yv(v):
        return b - (v - ticks[0]) / (ticks[-1] - ticks[0]) * (b - t)
    _axis_frame(ctx, rect, ticks, cats, el)
    colors = {"total": (s.get("totalBars") or {}).get("fill", "#3b82f6"),
              "inc": (s.get("increaseBars") or {}).get("fill", "#22c55e"),
              "dec": (s.get("decreaseBars") or {}).get("fill", "#ef4444")}
    n = len(bars)
    slot = (r - l) / n
    bw = min(slot * 0.6, 24 * S)
    dl = _dl_config(s, el)
    f = _font(9 * S)
    for i, (cat, y0, y1, cls) in enumerate(bars):
        if y0 is None:
            continue
        cx = l + slot * (i + 0.5)
        ya, yb = yv(max(y0, y1)), yv(min(y0, y1))
        if abs(ya - yb) < S:
            yb = ya + S
        d.rectangle([cx - bw / 2, ya, cx + bw / 2, yb],
                    fill=_rgb(colors[cls], theme))
        if dl.get("show"):
            txt = _fmt_value(y1 if cls == "total" else (y1 - y0),
                             dl.get("numberFormat"))
            bb = d.textbbox((0, 0), txt, font=f)
            d.text((cx - (bb[2] - bb[0]) / 2, ya - 12 * S), txt, font=f,
                   fill=_rgb("#333333", theme))


def _dl_config(s, el):
    merged = {}
    if isinstance(el.get("dataLabels"), dict):
        merged.update(el["dataLabels"])
    if isinstance(s.get("dataLabels"), dict):
        merged.update(s["dataLabels"])
    return merged


# ------------------------------------------------------------- heatmap

def _heatmap(ctx, s, el):
    d, S, theme = ctx["draw"], ctx["S"], ctx["theme"]
    enc = s["encode"]
    cols, rows, colidx = _cols(el)
    xs, ys, vs = [], [], []
    for row in rows:
        xv, yv_, vv = (row[colidx[enc["x"]]] if colidx[enc["x"]] < len(row) else None,
                       row[colidx[enc["y"]]] if colidx[enc["y"]] < len(row) else None,
                       row[colidx[enc["value"]]] if colidx[enc["value"]] < len(row) else None)
        xs.append(str(xv))
        ys.append(str(yv_))
        vs.append(_num(vv))
    xcats = list(dict.fromkeys(xs))
    ycats = list(dict.fromkeys(ys))
    scheme = s.get("colorScheme") or ["#ffffff", "#3b82f6"]
    scale = s.get("colorScale") or {}
    stype = scale.get("type", "linear")
    vals = [v for v in vs if v is not None]
    domain = scale.get("domain")
    if domain:
        lo, hi = domain
    elif stype == "diverging":
        m = max(abs(v) for v in vals) if vals else 1
        lo, hi = -m, m
    else:
        lo, hi = (min(vals), max(vals)) if vals else (0, 1)
    cs = [_rgb(c, theme)[:3] for c in scheme]
    rect = _plot_rect(ctx, el)
    l, t, r, b = rect
    f = _font(9 * S)
    # cell grid
    cw = (r - l) / len(xcats)
    chh = (b - t) / len(ycats)
    for xi, xv in enumerate(xcats):
        for yi, yv_ in enumerate(ycats):
            v = None
            for k in range(len(vs)):
                if xs[k] == xv and ys[k] == yv_:
                    v = vs[k]
                    break
            if v is None:
                continue
            if hi > lo:
                tt = (v - lo) / (hi - lo)
            else:
                tt = 0.5
            tt = max(0.0, min(1.0, tt))
            if stype == "diverging" and len(cs) >= 3:
                if tt < 0.5:
                    color = _lerp(cs[0], cs[1], tt * 2)
                else:
                    color = _lerp(cs[1], cs[2], (tt - 0.5) * 2)
            else:
                if len(cs) >= 2:
                    color = _lerp(cs[0], cs[-1], tt)
                else:
                    color = cs[0]
            x0 = l + xi * cw
            y0 = t + yi * chh
            d.rectangle([x0, y0, x0 + cw, y0 + chh], fill=(*color, 255))
            dl = _dl_config(s, el)
            if dl.get("show"):
                txt = _fmt_value(v, dl.get("numberFormat"))
                bb = d.textbbox((0, 0), txt, font=f)
                d.text((x0 + cw / 2 - (bb[2] - bb[0]) / 2,
                        y0 + chh / 2 - (bb[3] - bb[1]) / 2), txt, font=f,
                       fill=_rgb("#333333", theme))
    d.rectangle([l, t, r, b], outline=_rgb("#666666", theme), width=S)
    for xi, xv in enumerate(xcats):
        d.text((l + xi * cw + cw / 2, b + 4 * S), xv, font=f,
               fill=_rgb("#333333", theme), anchor="ma")
    for yi, yv_ in enumerate(ycats):
        d.text((l - 4 * S, t + yi * chh + chh / 2), yv_, font=f,
               fill=_rgb("#333333", theme), anchor="rm")
    # colorbar
    cb = s.get("colorbar", True)
    if cb is not False:
        cbl = r + 14 * S
        cbt, cbb = t, b - 20 * S
        for yy in range(int(cbt), int(cbb)):
            tt = (yy - cbt) / max(1, cbb - cbt)
            if stype == "diverging" and len(cs) >= 3:
                color = (_lerp(cs[2], cs[1], tt * 2) if tt < 0.5
                         else _lerp(cs[1], cs[0], (tt - 0.5) * 2))
            else:
                color = _lerp(cs[-1], cs[0], tt)
            d.line([cbl, yy, cbl + 10 * S, yy], fill=(*color, 255))
        d.text((cbl, cbb + 2 * S), _fmt_value(lo, None), font=f,
               fill=_rgb("#333333", theme))
        d.text((cbl, cbt - 12 * S), _fmt_value(hi, None), font=f,
               fill=_rgb("#333333", theme))


# ------------------------------------------------------------- treemap

def _squarify(sizes, x, y, w, h):
    """Classic squarify; sizes: weights (any positive numbers). -> [rect4]*"""
    if not sizes or w <= 0 or h <= 0:
        return []
    total = sum(sizes)
    if total <= 0:
        return []
    rem = [s / total for s in sizes]
    cx, cy, cw, ch = x, y, w, h
    rects = []
    while rem:
        row = []
        row_worst = None
        length = min(cw, ch)
        while rem:
            cand = row + [rem[0]]
            s = sum(cand)
            worst_r = max(cand) * length ** 2 / s ** 2 if s else 1e9
            if row and row_worst is not None and worst_r > row_worst:
                break
            row_worst = worst_r
            row.append(rem.pop(0))
        s = sum(row)
        if s <= 0:
            break
        if cw >= ch:  # vertical strip of width s*cw
            rw = s * cw
            ry = cy
            for f in row:
                rr = f / s * ch
                rects.append((cx, ry, rw, rr))
                ry += rr
            cx += rw
            cw -= rw
        else:  # horizontal strip of height s*ch
            rh = s * ch
            rx = cx
            for f in row:
                rr = f / s * cw
                rects.append((rx, cy, rr, rh))
                rx += rr
            cy += rh
            ch -= rh
    return rects


def _hsl_shift(rgb, dl):
    """Decrease lightness by dl (fraction) in HSL space."""
    r, g, b = (v / 255 for v in rgb)
    mx, mn = max(r, g, b), min(r, g, b)
    l = (mx + mn) / 2
    l = max(0.0, l - dl)
    h = s = 0.0
    if mx != mn:
        d = mx - mn
        s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
        if mx == r:
            h = ((g - b) / d + (6 if g < b else 0)) / 6
        elif mx == g:
            h = ((b - r) / d + 2) / 6
        else:
            h = ((r - g) / d + 4) / 6
    def f(n):
        k = (n + h * 12) % 12
        a = s * min(l, 1 - l)
        return int(round(255 * (l - a * max(-1, min(k - 3, 9 - k, 1)))))
    return (f(0), f(8), f(4))


def _treemap(ctx, s, el):
    d, S, theme = ctx["draw"], ctx["S"], ctx["theme"]
    enc = s["encode"]
    cols, rows, colidx = _cols(el)
    nodes = {}
    for row in rows:
        name = str(row[colidx[enc["category"]]])
        parent = (row[colidx[enc["parent"]]] if enc.get("parent") and
                  colidx[enc["parent"]] < len(row) else None)
        val = _num(row[colidx[enc["value"]]])
        nodes.setdefault(name, {"name": name, "parent": None, "value": 0,
                                "children": []})
        nodes[name]["value"] += val or 0
        if parent is not None:
            nodes[name]["parent"] = str(parent)
    for n in list(nodes.values()):
        if n["parent"] and n["parent"] in nodes:
            nodes[n["parent"]]["children"].append(n)
    roots = [n for n in nodes.values() if not n["parent"] or n["parent"] not in nodes]
    total = sum(n["value"] for n in roots) or 1
    rect = _plot_rect(ctx, el)
    l, t, r, b = rect
    fills = s.get("fill")
    if isinstance(fills, (str, dict)):
        fills = [fills]
    elif fills is None:
        fills = []
    cycle = _theme_cycle(theme)
    dl = _dl_config(s, el)
    content = dl.get("content", "category") if dl.get("show") else None
    f = _font(10 * S)
    fs = _font(8 * S)
    d.rectangle([l, t, r, b], fill=(255, 255, 255, 0))

    def base_color(i):
        if fills and i < len(fills):
            c = fills[i % len(fills)]
        elif fills:
            c = fills[i % len(fills)]
        else:
            c = cycle[i % len(cycle)]
        if isinstance(c, dict):
            stops = c.get("stops", [])
            c = stops[0].get("color") if stops else cycle[i % len(cycle)]
        return _rgb(c, theme)[:3]

    def draw_node(n, rect_, level, color, ri):
        x, y, w_, h_ = rect_
        if w_ <= 0 or h_ <= 0:
            return
        d.rectangle([x, y, x + w_, y + h_], fill=(*color, 235),
                    outline=(255, 255, 255, 255), width=2 * S)
        label = n["name"]
        if content == "value":
            label = _fmt_value(n["value"], dl.get("numberFormat"))
        elif content == "category" and dl.get("show"):
            label = n["name"]
        if w_ > 30 * S and h_ > 14 * S:
            d.text((x + 4 * S, y + 3 * S), label, font=f,
                   fill=_contrast(color))
        kids = sorted(n["children"], key=lambda c: -c["value"])
        if not kids:
            return
        child_total = sum(k["value"] for k in kids) or 1
        sizes = [k["value"] / child_total for k in kids]
        pad = 2 * S
        inner = (x + pad, y + pad, w_ - 2 * pad, h_ - 2 * pad)
        rects = _squarify(sizes, *inner)
        for k, (rx, ry, rw, rh) in zip(kids, rects):
            draw_node(k, (rx, ry, rw, rh), level + 1,
                      _hsl_shift(color, 0.10), ri)

    lv = s.get("levels")
    for ri, root in enumerate(sorted(roots, key=lambda n: -n["value"])):
        frac = root["value"] / total
        rects = _squarify([frac], l, t, r - l, b - t)
        if not rects:
            continue
        rx, ry, rw, rh = rects[0]
        draw_node(root, (rx, ry, rw, rh), 0, base_color(ri), ri)


def _contrast(rgb):
    lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]
    return (255, 255, 255, 255) if lum < 128 else (17, 24, 39, 255)


# ------------------------------------------------------------- sunburst

def _sunburst(ctx, s, el):
    d, S, theme = ctx["draw"], ctx["S"], ctx["theme"]
    enc = s["encode"]
    cols, rows, colidx = _cols(el)
    nodes = {}
    for row in rows:
        name = str(row[colidx[enc["category"]]])
        parent = (str(row[colidx[enc["parent"]]]) if enc.get("parent") and
                  colidx[enc.get("parent")] < len(row) and
                  row[colidx[enc["parent"]]] is not None else None)
        val = _num(row[colidx[enc["value"]]]) or 0
        nodes.setdefault(name, {"name": name, "parent": None, "value": 0,
                                "children": []})
        nodes[name]["value"] += val
        nodes[name]["parent"] = parent
    for n in list(nodes.values()):
        if n["parent"] and n["parent"] in nodes:
            nodes[n["parent"]]["children"].append(n)
    roots = [n for n in nodes.values() if not n["parent"] or n["parent"] not in nodes]
    total = sum(n["value"] for n in roots) or 1
    rect = _plot_rect(ctx, el)
    l, t, r, b = rect
    cx, cy = (l + r) / 2, (t + b) / 2
    max_r = min(r - l, b - t) / 2 - 4 * S
    ring = max_r / max(1, _depth(roots) or 1)
    fills = s.get("fill")
    if isinstance(fills, (str, dict)):
        fills = [fills]
    elif fills is None:
        fills = []
    cycle = _theme_cycle(theme)
    dl = _dl_config(s, el)
    f = _font(9 * S)

    def base_color(i):
        c = (fills[i % len(fills)] if fills else cycle[i % len(cycle)])
        if isinstance(c, dict):
            stops = c.get("stops", [])
            c = stops[0].get("color") if stops else cycle[i % len(cycle)]
        return _rgb(c, theme)[:3]

    def draw_ring(node, a0, a1, depth, color):
        if a1 - a0 < 0.005:
            return
        r0, r1 = depth * ring + 2 * S, (depth + 1) * ring - 2 * S
        d.pieslice([cx - r1, cy - r1, cx + r1, cy + r1],
                   math.degrees(a0 - math.pi / 2),
                   math.degrees(a1 - math.pi / 2),
                   fill=(*color, 235), outline=(255, 255, 255, 255))
        if dl.get("show") and (a1 - a0) > 0.15 and r1 - r0 > 9 * S:
            am = (a0 + a1) / 2
            rm = (r0 + r1) / 2
            txt = node["name"]
            content = dl.get("content", "category")
            if content == "value":
                txt = _fmt_value(node["value"], dl.get("numberFormat"))
            bb = d.textbbox((0, 0), txt, font=f)
            if (a1 - a0) * rm > (bb[2] - bb[0]) + 6 * S:
                d.text((cx + math.cos(am) * rm, cy + math.sin(am) * rm), txt,
                       font=f, fill=_contrast(color), anchor="mm")
        kids = sorted(node["children"], key=lambda c: -c["value"])
        vt = node["value"] or 1
        a = a0
        for k in kids:
            span = (a1 - a0) * (k["value"] / vt)
            draw_ring(k, a, a + span, depth + 1, _hsl_shift(color, 0.10))
            a += span

    a = 0.0
    for i, rootn in enumerate(sorted(roots, key=lambda n: -n["value"])):
        span = 2 * math.pi * (rootn["value"] / total)
        draw_ring(rootn, a, a + span, 0, base_color(i))
        a += span


def _depth(nodes):
    if not nodes:
        return 0
    return 1 + max(_depth(n["children"]) for n in nodes)


# ------------------------------------------------------------- sankey

def _sankey(ctx, s, el):
    d, S, theme = ctx["draw"], ctx["S"], ctx["theme"]
    enc = s["encode"]
    cols, rows, colidx = _cols(el)
    flows = []
    nodes = {}
    for row in rows:
        src = str(row[colidx[enc["source"]]])
        dst = str(row[colidx[enc["target"]]])
        val = _num(row[colidx[enc["flow"]]]) or 0
        flows.append((src, dst, val))
        nodes.setdefault(src, {"name": src, "out": 0, "in": 0})
        nodes.setdefault(dst, {"name": dst, "out": 0, "in": 0})
        nodes[src]["out"] += val
        nodes[dst]["in"] += val
    # layer via longest path
    layer = {n: 0 for n in nodes}
    changed = True
    while changed:
        changed = False
        for src, dst, v in flows:
            if layer[dst] <= layer[src]:
                layer[dst] = layer[src] + 1
                changed = True
    layers = {}
    for n, ln in layer.items():
        layers.setdefault(ln, []).append(nodes[n])
    rect = _plot_rect(ctx, el)
    l, t, r, b = rect
    n_layers = max(layers) + 1 if layers else 1
    node_w = 14 * S
    gap = (r - l - node_w) / max(1, n_layers - 1) if n_layers > 1 else 0
    total_max = max((max(n["out"], n["in"]) for n in nodes.values()), default=1) or 1
    scale = (b - t - 10 * S) / total_max
    # node positions
    pos = {}
    for ln, ns in layers.items():
        x = l + ln * gap
        ycur = t + 5 * S
        for n in sorted(ns, key=lambda n: -(max(n["out"], n["in"]))):
            size = max(n["out"], n["in"]) * scale
            pos[n["name"]] = (x, ycur, node_w, size)
            ycur += size + 6 * S
    fills = s.get("fill")
    fill_map = {}
    if isinstance(fills, dict):
        fill_map = {k: v for k, v in fills.items()}
    elif isinstance(fills, (str, dict)):
        fills = [fills] if isinstance(fills, str) else [fills]
    elif fills is None:
        fills = []
    cycle = _theme_cycle(theme)
    dl = _dl_config(s, el)
    f = _font(9 * S)
    fsmall = _font(8 * S)
    # ribbons
    for src, dst, v in flows:
        if v <= 0 or src not in pos or dst not in pos:
            continue
        sx, sy, sw, sh = pos[src]
        tx, ty, tw, th = pos[dst]
        thickness = v * scale
        # track used offsets
        key = (src, dst)
        so = ctx.setdefault("_sankey_off", {}).get(src, 0)
        to = ctx["_sankey_off"].get(dst, 0)
        x0 = sx + sw
        x1 = tx
        y0 = sy + so
        y1 = ty + to
        ctx["_sankey_off"][src] = so + thickness
        ctx["_sankey_off"][dst] = to + thickness
        c = fill_map.get(src) or (fills[len(ctx["_sankey_seen"])] if fills else
                                  cycle[len(ctx.setdefault("_sankey_seen", [])) % len(cycle)])
        if isinstance(c, dict):
            stops = c.get("stops", [])
            c = stops[0].get("color") if stops else "#94a3b8"
        rgb = _rgb(c, theme)
        mx = (x0 + x1) / 2
        ribbon = [(x0, y0), (mx, y0), (mx, y1), (x1, y1),
                  (x1, y1 + thickness), (mx, y1 + thickness),
                  (mx, y0 + thickness), (x0, y0 + thickness)]
        d.polygon(ribbon, fill=(*rgb[:3], 120))
        ctx["_sankey_seen"].append(src)
        if dl.get("show"):
            txt = _fmt_value(v, dl.get("numberFormat"))
            bb = d.textbbox((0, 0), txt, font=fsmall)
            d.text((mx - (bb[2] - bb[0]) / 2, (y0 + y1) / 2), txt, font=fsmall,
                   fill=_rgb("#333333", theme))
    # nodes + labels
    for name, (nx, ny, nw, nh) in pos.items():
        c = fill_map.get(name) or cycle[0]
        rgb = _rgb(c, theme)
        d.rectangle([nx, ny, nx + nw, ny + nh], fill=rgb)
        out_v = nodes[name]["out"] or nodes[name]["in"]
        label = name
        if dl.get("show") and dl.get("content", "value") == "value":
            label = f"{name} {_fmt_value(out_v, dl.get('numberFormat'))}"
        if layer[name] == 0:
            d.text((nx - 4 * S, ny + nh / 2), label, font=f,
                   fill=_rgb("#333333", theme), anchor="rm")
        else:
            d.text((nx + nw + 4 * S, ny + nh / 2), label, font=f,
                   fill=_rgb("#333333", theme), anchor="lm")


# ------------------------------------------------------------- generic cartesian

def _cartesian_raster(ctx, series, el):
    d, S, theme = ctx["draw"], ctx["S"], ctx["theme"]
    cols, rows, colidx = _cols(el)
    s0 = series[0]
    enc0 = s0["encode"]
    catcol = enc0.get("x") or enc0.get("category")
    cats = _vals(rows, colidx[catcol])
    n = len(cats)
    # gather all values
    all_vals = []
    per_series = []
    stacked = any(s.get("stack") for s in series if s.get("type") == "area")
    stream = any(s.get("stack") == "stream" for s in series)
    for s in series:
        vcol = s["encode"].get("y") or s["encode"].get("value")
        vals = [_num(v) for v in _vals(rows, colidx[vcol])]
        per_series.append(vals)
        all_vals.extend(v for v in vals if v is not None)
    vmin = min(all_vals, default=0)
    vmax = max(all_vals, default=1)
    if stacked or stream:
        # totals per category
        for i in range(n):
            tot = sum(sv[i] or 0 for sv in per_series
                      if sv[i] is not None)
            vmax = max(vmax, tot)
            vmin = min(vmin, 0 if not stream else -tot / 2)
    ticks = _nice_ticks(vmin, vmax)
    rect = _plot_rect(ctx, el)
    l, t, r, b = rect
    _axis_frame(ctx, rect, ticks, cats, el)
    slot = (r - l) / max(1, n)
    cycle = _theme_cycle(theme)
    f = _font(9 * S)
    # compute stacking
    cum = [0.0] * n
    if stream:
        totals = [sum((sv[i] or 0) for sv in per_series) for i in range(n)]
        cum = [-(tot / 2) for tot in totals]
    def yv(v):
        return b - (v - ticks[0]) / (ticks[-1] - ticks[0]) * (b - t)
    for si, s in enumerate(series):
        vals = per_series[si]
        stype = s.get("type")
        color = (s.get("fill") or s.get("lineColor") or s.get("areaColor")
                 or cycle[si % len(cycle)])
        if isinstance(color, dict):
            stops = color.get("stops", [])
            color = stops[0].get("color") if stops else cycle[si % len(cycle)]
        rgb = _rgb(color, theme)
        dl = _dl_config(s, el)
        if stype in ("bar",):
            bw = min(slot * 0.6, 26 * S)
            for i, v in enumerate(vals):
                if v is None:
                    continue
                cx = l + slot * (i + 0.5)
                if s.get("stack"):
                    y0, y1 = cum[i], cum[i] + v
                    cum[i] = y1
                else:
                    y0, y1 = 0, v
                d.rectangle([cx - bw / 2, yv(max(y0, y1)),
                             cx + bw / 2, yv(min(y0, y1))], fill=rgb)
                if dl.get("show"):
                    txt = _fmt_value(v, dl.get("numberFormat"))
                    d.text((cx, yv(max(y0, y1)) - 11 * S), txt, font=f,
                           fill=_rgb("#333333", theme), anchor="ma")
        elif stype in ("line", "area"):
            pts = [(l + slot * (i + 0.5), yv(v if not s.get("stack") else cum[i] + v))
                   for i, v in enumerate(vals) if v is not None]
            if s.get("stack"):
                for i, v in enumerate(vals):
                    if v is not None:
                        cum[i] += v
                pts = [(l + slot * (i + 0.5), yv(cum[i] - v))
                       for i, v in enumerate(vals) if v is not None]
            if stype == "area":
                if len(pts) >= 2:
                    poly = pts + [(pts[-1][0], yv(0)), (pts[0][0], yv(0))]
                    overlay = Image.new("RGBA", ctx["img"].size, (0, 0, 0, 0))
                    od = ImageDraw.Draw(overlay)
                    od.polygon(poly, fill=(*rgb[:3], 140))
                    ctx["img"].alpha_composite(overlay)
                    d = ImageDraw.Draw(ctx["img"])
                    ctx["draw"] = d
            if len(pts) >= 2:
                wdt = max(1, int(s.get("width", 2) * S))
                if s.get("smooth") and len(pts) > 2:
                    pts = _smooth_pts(pts)
                d.line(pts, fill=rgb, width=wdt, joint="curve")
            marker = s.get("marker")
            if marker is not False:
                msize = int((marker or {}).get("size", 5) * S) if marker else 3 * S
                for px, py in pts:
                    shape = (marker or {}).get("shape", "circle")
                    if shape == "rect":
                        d.rectangle([px - msize, py - msize, px + msize, py + msize],
                                    fill=rgb)
                    else:
                        d.ellipse([px - msize, py - msize, px + msize, py + msize],
                                  fill=rgb)
            if dl.get("show") and pts:
                for i, (px, py) in enumerate(pts):
                    txt = _fmt_value(vals[i], dl.get("numberFormat"))
                    d.text((px, py - 10 * S), txt, font=f,
                           fill=_rgb("#333333", theme), anchor="ma")
        elif stype in ("scatter", "bubble"):
            xcol = s["encode"]["x"]
            xs = [_num(v) for v in _vals(rows, colidx[xcol])]
            xs_all = [v for v in xs if v is not None]
            if xs_all:
                xlo, xhi = min(xs_all), max(xs_all)
            else:
                xlo, xhi = 0, 1
            scol = s["encode"].get("size")
            sizes = ([_num(v) for v in _vals(rows, colidx[scol])] if scol
                     else [None] * n)
            smax = max((v for v in sizes if v is not None), default=1) or 1
            for xv, yv_, sv in zip(xs, vals, sizes):
                if xv is None or yv_ is None:
                    continue
                px = l + (xv - xlo) / max(1e-9, xhi - xlo) * (r - l)
                py = yv(yv_)
                if stype == "bubble":
                    rr = math.sqrt(max(0, sv or 0) / smax) * 14 * S + 2 * S
                else:
                    rr = ((marker or {}).get("size", 6) if marker else 6) * S / 2
                d.ellipse([px - rr, py - rr, px + rr, py + rr], fill=rgb)
    if stream:
        pass  # already drawn via stacked areas


def _smooth_pts(pts):
    """Catmull-Rom smoothing for polyline."""
    if len(pts) < 3:
        return pts
    out = [pts[0]]
    for i in range(len(pts) - 1):
        p0 = pts[max(0, i - 1)]
        p1 = pts[i]
        p2 = pts[i + 1]
        p3 = pts[min(len(pts) - 1, i + 2)]
        for t in range(1, 21):
            tt = t / 20
            x = _cr(p0[0], p1[0], p2[0], p3[0], tt)
            y = _cr(p0[1], p1[1], p2[1], p3[1], tt)
            out.append((x, y))
    out.append(pts[-1])
    return out


def _cr(p0, p1, p2, p3, t):
    return (0.5 * ((2 * p1) + (-p0 + p2) * t +
                   (2 * p0 - 5 * p1 + 4 * p2 - p3) * t ** 2 +
                   (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
