"""Shape element: 130 OOXML presets + custom SVG-path geometry (custGeom)."""
import math
import re

from lxml import etree
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
from pptx.util import Pt

from ._shape_data import SHAPES
from .style import fill_xml, ln_xml, shadow_xml
from .xmlutil import sub, insert_ordered, SPPR_ORDER, set_xfrm_flip_rot

_PRESSET = {m.xml_value: m for m in MSO_SHAPE}


def apply_preset_geometry(shape, shape_name, adjustments):
    """Set prstGeom preset + avLst adjustments on an autoshape."""
    enum = _PRESSET.get(shape_name)
    if enum is None:
        raise ValueError(f"unknown shapeName {shape_name!r}")
    spPr = shape._element.spPr
    geom = spPr.find(qn("a:prstGeom"))
    geom.set("prst", shape_name)
    avLst = geom.find(qn("a:avLst"))
    for gd in list(avLst):
        avLst.remove(gd)
    defaults = SHAPES.get(shape_name, [])
    values = adjustments if adjustments is not None else defaults
    for i, v in enumerate(values[:len(defaults)] if defaults else values):
        val = int(v)
        gd = sub(avLst, "a:gd", {"name": f"adj{i + 1}", "fmla": f"val {val}"})


# ------------------------------------------------------------- SVG path

_NUM = r"[-+]?(?:\d*\.\d+|\d+\.?)"
_PATH_TOKEN = re.compile(
    r"([MLHVCSQAZmlhvcsqaz])|(" + _NUM + ")")


def _tokens(d):
    cmd = None
    for m in _PATH_TOKEN.finditer(d):
        if m.group(1):
            cmd = m.group(1)
            yield (cmd, None)
        else:
            yield (cmd, float(m.group(0)))


def parse_svg_path(d, vw, vh):
    """SVG path string -> list of custGeom path elements (a:lnTo etc.).

    Returns list of (tag, values) tuples with absolute coords:
      ("M",[x,y]) ("L",[x,y]) ("C",[x1,y1,x2,y2,x,y]) ("Q",[x1,y1,x,y])
      ("Z",[]) — arcs pre-converted to beziers.
    """
    out = []
    cur = (0.0, 0.0)
    start = (0.0, 0.0)
    last_c2 = None
    last_q = None
    i = 0
    toks = list(_tokens(d))
    n = len(toks)
    rel = False
    cmd = None
    args = []

    def nxt(k):
        nonlocal i
        vals = []
        for _ in range(k):
            if i >= n:
                raise ValueError("svg path: missing parameters")
            vals.append(toks[i][1])
            i += 1
        return vals

    def emit(tag, vals):
        out.append((tag, vals))

    while i < n:
        t = toks[i]
        if t[0] is not None:
            cmd = t[0]
            rel = cmd.islower()
            cmdU = cmd.upper()
            i += 1
            args = []
        if cmdU is None:
            break
        if cmdU == "M":
            x, y = nxt(2)
            if rel:
                x += cur[0]
                y += cur[1]
            emit("M", [x, y])
            cur = (x, y)
            start = cur
            cmd = "l" if rel else "L"  # subsequent implicit lineTo
            cmdU = "L"
        elif cmdU == "L":
            x, y = nxt(2)
            if rel:
                x += cur[0]
                y += cur[1]
            emit("L", [x, y])
            cur = (x, y)
        elif cmdU == "H":
            (x,) = nxt(1)
            if rel:
                x += cur[0]
            emit("L", [x, cur[1]])
            cur = (x, cur[1])
        elif cmdU == "V":
            (y,) = nxt(1)
            if rel:
                y += cur[1]
            emit("L", [cur[0], y])
            cur = (cur[0], y)
        elif cmdU in ("C", "S"):
            if cmdU == "C":
                x1, y1, x2, y2, x, y = nxt(6)
                if rel:
                    x1 += cur[0]; y1 += cur[1]; x2 += cur[0]; y2 += cur[1]
                    x += cur[0]; y += cur[1]
            else:  # S: reflect previous control
                x2, y2, x, y = nxt(4)
                if rel:
                    x2 += cur[0]; y2 += cur[1]; x += cur[0]; y += cur[1]
                if last_c2 is None:
                    x1, y1 = cur
                else:
                    x1, y1 = (2 * cur[0] - last_c2[0], 2 * cur[1] - last_c2[1])
            emit("C", [x1, y1, x2, y2, x, y])
            last_c2 = (x2, y2)
            cur = (x, y)
        elif cmdU in ("Q", "T"):
            if cmdU == "Q":
                x1, y1, x, y = nxt(4)
                if rel:
                    x1 += cur[0]; y1 += cur[1]; x += cur[0]; y += cur[1]
            else:
                x, y = nxt(2)
                if rel:
                    x += cur[0]; y += cur[1]
                if last_q is None:
                    x1, y1 = cur
                else:
                    x1, y1 = (2 * cur[0] - last_q[0], 2 * cur[1] - last_q[1])
            # promote quadratic to cubic
            cx1 = cur[0] + 2 / 3 * (x1 - cur[0])
            cy1 = cur[1] + 2 / 3 * (y1 - cur[1])
            cx2 = x + 2 / 3 * (x1 - x)
            cy2 = y + 2 / 3 * (y1 - y)
            emit("C", [cx1, cy1, cx2, cy2, x, y])
            last_q = (x1, y1)
            cur = (x, y)
        elif cmdU == "A":
            rx, ry, rot, laf, sf, x, y = nxt(7)
            if rel:
                x += cur[0]
                y += cur[1]
            for seg in _arc_to_cubics(cur[0], cur[1], rx, ry, rot, bool(laf), bool(sf), x, y):
                emit("C", seg)
                cur = (seg[4], seg[5])
        elif cmdU == "Z":
            emit("Z", [])
            cur = start
        else:
            raise ValueError(f"unsupported svg command {cmd!r}")
    return out


def _arc_to_cubics(x0, y0, rx, ry, rot_deg, large, sweep, x1, y1):
    """SVG A -> list of cubic bezier segments (endpoint parameterization)."""
    if rx == 0 or ry == 0:
        return [[x0, y0, x1, y1, x1, y1]]
    phi = math.radians(rot_deg % 360)
    rx, ry = abs(rx), abs(ry)
    cos_p, sin_p = math.cos(phi), math.sin(phi)
    dx2, dy2 = (x0 - x1) / 2, (y0 - y1) / 2
    x1p = cos_p * dx2 + sin_p * dy2
    y1p = -sin_p * dx2 + cos_p * dy2
    lam = (x1p / rx) ** 2 + (y1p / ry) ** 2
    if lam > 1:
        s = math.sqrt(lam)
        rx, ry = rx * s, ry * s
    num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    co = math.sqrt(max(0.0, num / den)) if den else 0.0
    if large == sweep:
        co = -co
    cxp = co * rx * y1p / ry
    cyp = -co * ry * x1p / rx
    cx = cos_p * cxp - sin_p * cyp + (x0 + x1) / 2
    cy = sin_p * cxp + cos_p * cyp + (y0 + y1) / 2

    def ang(ux, uy, vx, vy):
        d = math.hypot(ux, uy) * math.hypot(vx, vy)
        c = max(-1.0, min(1.0, (ux * vx + uy * vy) / d))
        a = math.acos(c)
        if ux * vy - uy * vx < 0:
            a = -a
        return a

    th1 = ang(1.0, 0.0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry,
              (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not sweep and dth > 0:
        dth -= 2 * math.pi
    elif sweep and dth < 0:
        dth += 2 * math.pi
    segs = []
    nseg = max(1, math.ceil(abs(dth) / (math.pi / 2)))
    delta = dth / nseg
    t = th1
    k = 4 / 3 * math.tan(delta / 4)
    px, py = x0, y0
    for _ in range(nseg):
        t2 = t + delta
        cos_t, sin_t = math.cos(t), math.sin(t)
        cos_t2, sin_t2 = math.cos(t2), math.sin(t2)
        e1x = cx + rx * (cos_t - k * sin_t)
        e1y = cy + ry * (sin_t + k * cos_t)
        e2x = cx + rx * (cos_t2 + k * sin_t2)
        e2y = cy + ry * (sin_t2 - k * cos_t2)
        ex = cx + rx * cos_t2
        ey = cy + ry * sin_t2
        if rot_deg:
            def rot(x, y):
                dx, dy = x - cx, y - cy
                return (cx + cos_p * dx - sin_p * dy,
                        cy + sin_p * dx + cos_p * dy)
            e1x, e1y = rot(e1x, e1y)
            e2x, e2y = rot(e2x, e2y)
            ex, ey = rot(ex, ey)
        segs.append([e1x, e1y, e2x, e2y, ex, ey])
        t = t2
    return segs


def build_custgeom(spPr, vw, vh, path_d):
    """Replace spPr geometry with custGeom from an SVG path."""
    for t in ("a:prstGeom", "a:custGeom"):
        e = spPr.find(qn(t))
        if e is not None:
            spPr.remove(e)
    cust = etree.Element(qn("a:custGeom"))
    xfrm = spPr.find(qn("a:xfrm"))
    if xfrm is not None:
        xfrm.addnext(cust)
    else:
        spPr.insert(0, cust)
    sub(cust, "a:avLst")
    sub(cust, "a:gdLst")
    pathLst = sub(cust, "a:pathLst")
    path = sub(pathLst, "a:path", {"w": _i(vw), "h": _i(vh)})
    cur = None
    for tag, vals in parse_svg_path(path_d, vw, vh):
        if tag == "M":
            sub(path, "a:moveTo", {}).append(
                _pt("a:pt", vals[0], vals[1]))
            cur = (vals[0], vals[1])
        elif tag == "L":
            ln = sub(path, "a:lnTo")
            ln.append(_pt("a:pt", vals[0], vals[1]))
        elif tag == "C":
            cb = sub(path, "a:cubicBezTo")
            for j in (0, 2, 4):
                cb.append(_pt("a:pt", vals[j], vals[j + 1]))
        elif tag == "Q":
            qb = sub(path, "a:quadBezTo")
            for j in (0, 2):
                qb.append(_pt("a:pt", vals[j], vals[j + 1]))
        elif tag == "Z":
            sub(path, "a:close")
    return cust


def _i(v):
    return str(int(round(float(v))))


def _pt(tag, x, y):
    e = etree.Element(qn(tag))
    e.set("x", _i(x))
    e.set("y", _i(y))
    return e


# ------------------------------------------------------------- render

def render_shape(slide, el, theme):
    name = el.get("shapeName", "rect")
    x, y, w, h = el["bounds"]
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Pt(x), Pt(y), Pt(w), Pt(h))
    shape.shadow.inherit = False
    if name == "custom":
        vw, vh = el.get("viewBox", [w, h])
        build_custgeom(shape._element.spPr, vw, vh, el.get("path", ""))
    else:
        apply_preset_geometry(shape, name, el.get("adjustments"))
    spPr = shape._element.spPr
    fill_xml(spPr, el.get("fill"), theme, alpha=1.0,
             image_part_fn=_ipf(slide), stretch=True)
    if el.get("fill") is None:
        for e in spPr.findall(qn("a:noFill")):
            spPr.remove(e)
        insert_ordered(spPr, etree.Element(qn("a:noFill")), SPPR_ORDER)
    ln_xml(spPr, el.get("border"), theme)
    shadow_xml(spPr, el.get("shadow"), theme)
    opacity = el.get("opacity", 1.0)
    if opacity is not None and float(opacity) < 1.0:
        _apply_alpha(spPr, float(opacity))
    set_xfrm_flip_rot(shape, el.get("rotation") or 0, el.get("flip"))
    return shape


def _ipf(slide):
    def fn(path):
        part, rid = slide.part.get_or_add_image_part(str(path))
        return rid
    return fn


def _apply_alpha(spPr, opacity):
    """Inject a:alpha into every srgbClr in spPr (fill + line)."""
    val = str(int(opacity * 100000))
    for srgb in spPr.iter(qn("a:srgbClr")):
        if srgb.find(qn("a:alpha")) is None:
            sub(srgb, "a:alpha", {"val": val})
