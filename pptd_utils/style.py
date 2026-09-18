"""Colors, fills (solid/gradient/image), borders, shadows -> DrawingML XML."""
import hashlib
import urllib.request
from pathlib import Path

from lxml import etree
from pptx.dml.color import RGBColor
from pptx.oxml.ns import qn
from pptx.util import Pt

from .xmlutil import sub, insert_ordered, SPPR_ORDER, TCPR_ORDER

URL_CACHE = Path.home() / ".cache" / "pptd_utils" / "urls"


# ----------------------------------------------------------------- colors

def resolve_color(c, theme=None, alpha=None):
    """'$primary' / '#RRGGBB' / '#RRGGBBAA' -> (RGBColor, alpha 0..1)."""
    if c is None:
        return None, 1.0
    c = str(c).strip()
    if c.startswith("$"):
        colors = (theme or {}).get("colors") or {}
        key = c[1:]
        if key not in colors:
            raise KeyError(f"unknown theme color {c!r}")
        c = str(colors[key])
    a = 1.0 if alpha is None else alpha
    if c.startswith("#"):
        hexpart = c[1:]
        if len(hexpart) == 8:
            a *= int(hexpart[6:8], 16) / 255.0
            hexpart = hexpart[:6]
        if len(hexpart) != 6:
            raise ValueError(f"bad color {c!r}")
        return RGBColor.from_string(hexpart.upper()), max(0.0, min(1.0, a))
    raise ValueError(f"unsupported color {c!r}")


def color_el(parent, color, theme, alpha=1.0, tag="a:srgbClr"):
    """Append a color element (with optional alpha) under parent; return it."""
    rgb, a = resolve_color(color, theme, alpha)
    el = sub(parent, tag, {"val": str(rgb)})
    if a < 1.0:
        sub(el, "a:alpha", {"val": str(int(a * 100000))})
    return el


def hex_to_rgba(color, theme, alpha=1.0):
    """Pillow helper: '#xxx'/$ref -> (r, g, b, a_int)."""
    rgb, a = resolve_color(color, theme, alpha)
    return (rgb[0], rgb[1], rgb[2], int(a * 255))


def css_px(value):
    if value is None:
        return None
    return float(str(value).replace("px", "").replace("PX", "").strip() or 0)


# ----------------------------------------------------------------- fills

def fetch_url(url):
    """Download url to cache, return local Path. jpg/jpeg/png/gif only."""
    if not url.startswith(("http://", "https://")):
        return Path(url)
    ext = ".bin"
    for e in (".jpg", ".jpeg", ".png", ".gif"):
        if e in url.lower():
            ext = e
            break
    h = hashlib.sha1(url.encode()).hexdigest()[:16]
    dst = URL_CACHE / (h + ext)
    if not dst.exists():
        URL_CACHE.mkdir(parents=True, exist_ok=True)
        tmp = dst.with_suffix(".part")
        urllib.request.urlretrieve(url, tmp)
        tmp.rename(dst)
    return dst


def image_size(src):
    from PIL import Image
    with Image.open(src) as im:
        return im.size


def cover_src_rect(src, w, h, crop=None):
    """Compute a:srcRect attrs (l,t,r,b in 1/1000 %) for 'cover' fit of an
    image into a w x h box, optionally after proportional crop."""
    try:
        iw, ih = image_size(src)
    except Exception:
        return None
    if w <= 0 or h <= 0:
        return None
    crop = crop or {}
    l0 = max(0.0, crop.get("left", 0) or 0)
    t0 = max(0.0, crop.get("top", 0) or 0)
    r0 = 1.0 - max(0.0, crop.get("right", 0) or 0)
    b0 = 1.0 - max(0.0, crop.get("bottom", 0) or 0)
    sw, sh = r0 - l0, b0 - t0
    if sw <= 0 or sh <= 0:
        return None
    src_ar, box_ar = (sw * iw) / (sh * ih), w / h
    if src_ar > box_ar:  # too wide -> crop sides
        keep = box_ar / src_ar
        cx = (l0 + r0) / 2
        l, r, t, b = cx - keep * sw / 2, cx + keep * sw / 2, t0, b0
    else:  # too tall -> crop top/bottom
        keep = src_ar / box_ar
        cy = (t0 + b0) / 2
        t, b, l, r = cy - keep * sh / 2, cy + keep * sh / 2, l0, r0
    out = {}
    if l > 0.0001:
        out["l"] = str(int(round(l * 100000)))
    if t > 0.0001:
        out["t"] = str(int(round(t * 100000)))
    if 1 - r > 0.0001:
        out["r"] = str(int(round((1 - r) * 100000)))
    if 1 - b > 0.0001:
        out["b"] = str(int(round((1 - b) * 100000)))
    return out or None


FILL_TAGS = ("a:noFill", "a:solidFill", "a:gradFill", "a:blipFill",
             "a:pattFill", "a:grpFill")


def _clear_fill(container):
    for t in FILL_TAGS:
        for e in container.findall(qn(t)):
            container.remove(e)


def fill_xml(container, fill, theme, alpha=1.0, order=SPPR_ORDER,
             image_part_fn=None, stretch=True, src_rect=None):
    """Write a Fill spec as XML under container (spPr / tcPr / bgPr / rPr...).

    image_part_fn(src_path) -> rId, required for image fills.
    stretch=True uses a:stretch; False (tile) unsupported -> stretch.
    Returns True if a fill element was written, False if fill is None.
    """
    if fill is None:
        return False
    ftype = fill.get("type", "solid")
    _clear_fill(container)
    fill_alpha = alpha * float(fill.get("opacity", 1.0))
    if ftype == "solid":
        sf = etree.SubElement(container, qn("a:solidFill"))
        insert_ordered(container, sf, order)
        color_el(sf, fill.get("color", "#000000"), theme, fill_alpha)
        return True
    if ftype == "gradient":
        gf = sub(container, "a:gradFill", {"rotWithShape": "1"})
        insert_ordered(container, gf, order)
        sub(gf, "a:gsLst")
        gslst = gf.find(qn("a:gsLst"))
        for stop in fill.get("stops", []):
            gs = sub(gslst, "a:gs", {"pos": str(int(stop.get("position", 0) * 100000))})
            color_el(gs, stop.get("color", "#000000"), theme,
                     fill_alpha * float(stop.get("opacity", 1.0)))
        gt = fill.get("gradientType", "linear")
        if gt == "radial":
            path = sub(gf, "a:path", {"path": "circle"})
            sub(path, "a:fillToRect", {"l": "50000", "t": "50000", "r": "50000", "b": "50000"})
        else:
            sub(gf, "a:lin", {"ang": str(int(fill.get("angle", 0) * 60000)), "scaled": "1"})
        return True
    if ftype == "image":
        if image_part_fn is None:
            return False
        src = fill.get("src")
        path = fetch_url(src) if str(src).startswith("http") else Path(src)
        rid = image_part_fn(path)
        bf = sub(container, "a:blipFill")
        insert_ordered(container, bf, order)
        blip = sub(bf, "a:blip")
        blip.set(qn("r:embed"), rid)
        opacity = fill.get("opacity", 1.0)
        if opacity is not None and float(opacity) < 1.0:
            sub(blip, "a:alphaModFix", {"amt": str(int(float(opacity) * 100000))})
        rect = src_rect
        if rect is None and fill.get("fit", {}).get("mode", "cover") == "cover":
            rect = cover_src_rect(path, 100, 100)
        if rect:
            sub(bf, "a:srcRect", rect)
        if stretch:
            st = sub(bf, "a:stretch")
            sub(st, "a:fillRect")
        return True
    raise ValueError(f"unsupported fill type {ftype!r}")


# ----------------------------------------------------------------- border

def line_style_attrs(border):
    return {"solid": "solid", "dash": "dash", "dot": "sysDot"}.get(
        border.get("style", "solid"), "solid")


def ln_xml(container, border, theme, alpha=1.0, order=SPPR_ORDER):
    """Write a:ln from Border spec; border None -> clear line (a:ln noFill)."""
    from pptx.enum.dml import MSO_LINE
    dash = {"solid": None, "dash": MSO_LINE.DASH, "dot": MSO_LINE.ROUND_DOT}
    if border is None:
        for e in container.findall(qn("a:ln")):
            container.remove(e)
        ln = sub(container, "a:ln", {"w": str(int(Pt(border and border.get("width", 1) or 1)))})
        insert_ordered(container, ln, order)
        sub(ln, "a:noFill")
        return ln
    for e in container.findall(qn("a:ln")):
        container.remove(e)
    w = border.get("width", 1)
    ln = sub(container, "a:ln", {"w": str(int(Pt(w)))})
    insert_ordered(container, ln, order)
    sf = sub(ln, "a:solidFill")
    color_el(sf, border.get("color", "#000000"), theme, alpha)
    if border.get("style") in ("dash", "dot"):
        sub(ln, "a:prstDash", {"val": line_style_attrs(border)})
    sub(ln, "a:round")
    return ln


# ----------------------------------------------------------------- shadow

def shadow_xml(container, shadow, theme, order=SPPR_ORDER):
    """Write a:effectLst/a:outerShdw; shadow None -> remove effectLst."""
    if shadow is None:
        for e in container.findall(qn("a:effectLst")):
            container.remove(e)
        return
    for e in container.findall(qn("a:effectLst")):
        container.remove(e)
    el = sub(container, "a:effectLst")
    insert_ordered(container, el, order)
    shdw = sub(el, "a:outerShdw", {
        "blurRad": str(int(Pt(shadow.get("blur", 4)))),
        "dist": str(int(Pt(0))),
        "dir": "2700000",
        "rotWithShape": "0",
    })
    off = shadow.get("offset") or [0, 0]
    dx, dy = float(off[0]), float(off[1])
    import math
    if dx or dy:
        dist = math.hypot(dx, dy)
        ang = math.degrees(math.atan2(dy, dx)) % 360
        shdw.set("dist", str(int(Pt(dist))))
        shdw.set("dir", str(int(ang * 60000)))
    color_el(shdw, shadow.get("color", "#000000"), theme)
