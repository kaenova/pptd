"""customFonts: fetch Google Fonts CSS, download woff2, convert to ttf,
embed into the pptx package as fntdata parts.

Requires fontTools+brotli (optional). Falls back to no embedding.
"""
import re
import shutil
import urllib.request
import zipfile
from pathlib import Path

CACHE = Path.home() / ".cache" / "pptd_utils" / "fonts"

FNT_REL = ("http://schemas.openxmlformats.org/officeDocument/2006/"
           "relationships/font")


def fetch_custom_fonts(custom_fonts):
    """CustomFont[] -> [(family, ttf_bytes | None)]."""
    out = []
    for cf in custom_fonts or []:
        family = cf.get("family")
        src = cf.get("src")
        ttf = None
        try:
            css = _fetch(src).decode("utf-8", "ignore")
            # take latin subset woff2 (fallback: first woff2 found)
            urls = re.findall(r"url\((https://[^)]+\.woff2)\)", css)
            if urls:
                # prefer the last block (usually latin)
                woff2 = _fetch(urls[-1])
                ttf = _woff2_to_ttf(woff2)
        except Exception as e:
            print(f"pptd_utils: customFont {family!r} skipped: {e}")
        out.append((family, ttf))
    return out


def _fetch(url):
    h = str(abs(hash(url)))
    # cache by URL content — hash() is process-random; use sha1
    import hashlib
    h = hashlib.sha1(url.encode()).hexdigest()[:16]
    dst = CACHE / h
    if not dst.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        tmp = dst.with_suffix(".part")
        urllib.request.urlretrieve(url, tmp)
        tmp.rename(dst)
    return dst.read_bytes()


def _woff2_to_ttf(woff2):
    try:
        from fontTools.ttLib import TTFont
        import io
        font = TTFont(io.BytesIO(woff2))
        font.flavor = None
        buf = io.BytesIO()
        font.save(buf)
        return buf.getvalue()
    except ImportError:
        return None


def embed_fonts(pptx_path, fonts):
    """Post-process a saved .pptx: add fntdata parts + presentation wiring.

    fonts: [(family, ttf_bytes)] — entries with None are skipped.
    """
    fonts = [(f, b) for f, b in fonts if b]
    if not fonts:
        return 0
    src = Path(pptx_path)
    tmp = src.with_suffix(".pptx.tmp")
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(
            tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        names = zin.namelist()
        # 1. content types
        ct = zin.read("[Content_Types].xml").decode("utf-8")
        if "fntdata" not in ct:
            ct = ct.replace("</Types>",
                            '<Default Extension="fntdata" '
                            'ContentType="application/x-fontdata"/></Types>')
        zout.writestr("[Content_Types].xml", ct)
        # 2. presentation rels
        rels_name = "ppt/_rels/presentation.xml.rels"
        rels = zin.read(rels_name).decode("utf-8")
        rid_max = 1
        for m in re.finditer(r'Id="rId(\d+)"', rels):
            rid_max = max(rid_max, int(m.group(1)) + 1)
        new_rels = ""
        font_parts = []
        for i, (family, ttf) in enumerate(fonts, 1):
            part = f"ppt/fonts/font{i}.fntdata"
            font_parts.append((family, f"rId{rid_max}"))
            new_rels += (f'<Relationship Id="rId{rid_max}" Type="{FNT_REL}" '
                         f'Target="fonts/font{i}.fntdata"/>')
            rid_max += 1
            zout.writestr(part, ttf)
        rels = rels.replace("</Relationships>", new_rels + "</Relationships>")
        zout.writestr(rels_name, rels)
        # 3. presentation.xml: embeddedFontLst after notesSz (schema order)
        pres = zin.read("ppt/presentation.xml").decode("utf-8")
        if "embeddedFontLst" not in pres:
            fl = "<p:embeddedFontLst>"
            for family, rid in font_parts:
                fl += (f'<p:embeddedFont><p:font typeface="{_esc(family)}"/>'
                       f'<p:regular r:id="{rid}"/></p:embeddedFont>')
            fl += "</p:embeddedFontLst>"
            m = re.search(r"<p:notesSz[^/]*/>", pres)
            if m:
                pres = pres[:m.end()] + fl + pres[m.end():]
            else:
                pres = pres.replace("</p:presentation>", fl + "</p:presentation>")
            pres = pres.replace("<p:presentation ", '<p:presentation embedTrueTypeFonts="1" ', 1)
        zout.writestr("ppt/presentation.xml", pres)
        # 4. copy the rest
        for name in names:
            if name in ("[Content_Types].xml", rels_name,
                        "ppt/presentation.xml"):
                continue
            zout.writestr(name, zin.read(name))
    shutil.move(str(tmp), str(src))
    return len(fonts)


def _esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))
