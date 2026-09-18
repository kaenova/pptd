"""Icon element: Font Awesome 6/7 free (fas/far/fab) rasterized via Pillow.

Supports solid + gradient fills, outline (border), drop shadow, opacity.
"""
import json
import math
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from pptx.util import Pt

from .style import resolve_color, hex_to_rgba
from .xmlutil import set_xfrm_flip_rot

CACHE = Path.home() / ".cache" / "pptd_utils" / "fa"
FA_URLS = {
    "fas": ("fa-solid-900.ttf", "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/webfonts/fa-solid-900.ttf"),
    "far": ("fa-regular-400.ttf", "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/webfonts/fa-regular-400.ttf"),
    "fab": ("fa-brands-400.ttf", "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/webfonts/fa-brands-400.ttf"),
}
FA_META_URL = ("https://raw.githubusercontent.com/FortAwesome/"
               "Font-Awesome/6.x/metadata/icons.json")

_META = None


def fa_meta():
    global _META
    if _META is None:
        CACHE.mkdir(parents=True, exist_ok=True)
        meta_path = CACHE / "icons.json"
        if not meta_path.exists():
            urllib.request.urlretrieve(FA_META_URL, meta_path)
        _META = json.loads(meta_path.read_text())
    return _META


def fa_ttf(style):
    fname, url = FA_URLS[style]
    path = CACHE / fname
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, path)
    return path


def _gradient_image(size, stops, angle, theme):
    """RGB gradient image (size) from stops [(pos, (r,g,b))]."""
    c0 = hex_to_rgba(stops[0]["color"], theme)[:3] if len(stops) > 1 else (0, 0, 0)
    c1 = hex_to_rgba(stops[-1]["color"], theme)[:3] if len(stops) > 1 else (255, 255, 255)
    t = Image.linear_gradient("L").rotate(90 - (angle % 360), expand=True)
    t = t.resize(size)
    r = t.point(lambda v: int(c0[0] + (c1[0] - c0[0]) * v / 255))
    g = t.point(lambda v: int(c0[1] + (c1[1] - c0[1]) * v / 255))
    b = t.point(lambda v: int(c0[2] + (c1[2] - c0[2]) * v / 255))
    return Image.merge("RGB", (r, g, b))


def render_icon(slide, el, theme):
    style, name = str(el["iconName"]).split(":", 1)
    if style not in FA_URLS:
        raise ValueError(f"icon style {style!r} unsupported (fas/far/fab)")
    meta = fa_meta()
    m = meta.get(name)
    if not m or "unicode" not in m:
        raise ValueError(f"unknown FA icon {name!r}")
    x, y, w, h = el["bounds"]
    w, h = int(round(w)), int(round(h))
    fill = el.get("fill") or {"type": "solid", "color": "#000000"}
    ftype = fill.get("type", "solid")
    opacity = float(el.get("opacity", 1.0))
    glyph = chr(int(m["unicode"], 16))
    border = el.get("border")
    shadow = el.get("shadow")

    rgb, _ = resolve_color(fill.get("color", "#000000"), theme, opacity)
    parts = [style, name, str(rgb), f"{opacity:.3f}", f"{w}x{h}"]
    if ftype == "gradient":
        parts.append("g%s" % ",".join(s["color"] for s in fill.get("stops", [])) + f"@{fill.get('angle', 0)}")
    if border:
        bc, _ = resolve_color(border.get("color", "#000000"), theme)
        parts.append(f"b{bc}_{border.get('width', 1)}")
    if shadow:
        sc, _ = resolve_color(shadow.get("color", "#000000"), theme)
        off = shadow.get("offset") or [0, 0]
        parts.append(f"s{sc}_{shadow.get('blur', 0)}_{off[0]},{off[1]}")
    png = CACHE / ("icon_" + "_".join(str(p).replace("/", ".") for p in parts) + ".png")

    if not png.exists():
        S = 3
        W, H = w * S, h * S
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        font = ImageFont.truetype(str(fa_ttf(style)), int(max(w, h) * S * 0.82))
        anchor = (W // 2, H // 2)
        stroke_w = int(border.get("width", 1) * S) if border else 0
        if shadow:
            sc_rgb, _ = resolve_color(shadow.get("color", "#000000"), theme)
            soff = shadow.get("offset") or [0, 0]
            lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            ImageDraw.Draw(lay).text(
                (anchor[0] + int(soff[0] * S), anchor[1] + int(soff[1] * S)),
                glyph, font=font,
                fill=(*sc_rgb, int(255 * opacity)),
                stroke_width=stroke_w,
                stroke_fill=(*sc_rgb, int(255 * opacity)))
            lay = lay.filter(ImageFilter.GaussianBlur(max(1, int(shadow.get("blur", 4) * S / 2))))
            img.alpha_composite(lay)
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).text(anchor, glyph, font=font, fill=255,
                                  stroke_width=stroke_w, stroke_fill=255)
        if ftype == "gradient":
            col = _gradient_image((W, H), fill.get("stops", []), float(fill.get("angle", 0)), theme).convert("RGBA")
        else:
            col = Image.new("RGBA", (W, H), (*rgb, int(255 * opacity)))
        alpha_mask = mask if opacity >= 1 else mask.point(lambda v: int(v * opacity))
        body = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        body.paste(col, (0, 0), alpha_mask)
        img.alpha_composite(body)
        if border:
            bc, _ = resolve_color(border.get("color", "#000000"), theme, opacity)
            inner = Image.new("L", (W, H), 0)
            ImageDraw.Draw(inner).text(anchor, glyph, font=font, fill=255)
            ring = Image.new("L", (W, H), 0)
            ring.paste(mask, (0, 0))
            ring.paste(0, (0, 0), inner)
            ring_col = Image.new("RGBA", (W, H), (*bc, 255))
            outl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            outl.paste(ring_col, (0, 0), ring if opacity >= 1 else ring.point(lambda v: int(v * opacity)))
            img.alpha_composite(outl)
        img.resize((w, h), Image.LANCZOS).save(png)

    pic = slide.shapes.add_picture(str(png), Pt(x), Pt(y), Pt(w), Pt(h))
    set_xfrm_flip_rot(pic, el.get("rotation") or 0, el.get("flip"))
    return pic
