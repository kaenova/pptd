"""Orchestration: load .pptd project, render pages, verify, CLI."""
import argparse
import subprocess
import sys
import zipfile
from pathlib import Path

import yaml
from lxml import etree
from pptx import Presentation
from pptx.oxml.ns import qn
from pptx.util import Pt

from . import charts_native, charts_raster
from .anim import build_timing
from .fonts import embed_fonts, fetch_custom_fonts
from .images import render_image
from .icons import render_icon
from .lines import render_line
from .render_text import render_text
from .shapes import render_shape
from .style import fill_xml
from .tables import render_table
from .xmlutil import sub

RENDERERS = ("text", "shape", "line", "image", "icon", "table", "chart")


def _load_yaml(path):
    return yaml.safe_load(Path(path).read_text())


def _set_background(slide, bg, theme, root, prs):
    if not bg:
        bg = {"type": "solid", "color": "#FFFFFF"}
    cSld = slide._element.find(qn("p:cSld"))
    for e in cSld.findall(qn("p:bg")):
        cSld.remove(e)
    bgel = etree.Element(qn("p:bg"))
    cSld.insert(0, bgel)
    bgPr = sub(bgel, "p:bgPr")

    def ipf(path):
        path = Path(path)
        if not path.is_absolute() and not path.exists():
            cand = root / path
            if cand.exists():
                path = cand
        part, rid = slide.part.get_or_add_image_part(str(path))
        return rid
    fill_xml(bgPr, bg, theme, image_part_fn=ipf)
    if bg.get("type") == "image":
        src = bg.get("src")
        from .style import fetch_url, cover_src_rect
        path = fetch_url(src) if str(src).startswith("http") else (
            root / src if not Path(src).exists() else Path(src))
        bf = bgPr.find(qn("a:blipFill"))
        if bf is not None and bf.find(qn("a:srcRect")) is None:
            rect = cover_src_rect(path, prs.slide_width / 12700,
                                  prs.slide_height / 12700)
            if rect:
                st = bf.find(qn("a:stretch"))
                sr = sub(bf, "a:srcRect", rect)
                if st is not None:
                    st.addprevious(sr)
    sub(bgPr, "a:effectLst")


def _add_fade(slide, speed="fast"):
    sld = slide._element
    for e in sld.findall(qn("p:transition")):
        sld.remove(e)
    tr = etree.Element(qn("p:transition"), {"spd": speed, "advClick": "1"})
    tr.append(etree.Element(qn("p:fade")))
    clr = sld.find(qn("p:clrMapOvr"))
    if clr is not None:
        clr.addnext(tr)
    else:
        sld.find(qn("p:cSld")).addnext(tr)


def _render_element(slide, el, theme, root):
    typ = el.get("elementType")
    if typ == "text":
        return render_text(slide, el, theme)
    if typ == "shape":
        return render_shape(slide, el, theme)
    if typ == "line":
        return render_line(slide, el, theme)
    if typ == "image":
        return render_image(slide, el, theme, root)
    if typ == "icon":
        return render_icon(slide, el, theme)
    if typ == "table":
        return render_table(slide, el, theme, root)
    if typ == "chart":
        if charts_native.can_render_native(el):
            return charts_native.render_chart(slide, el, theme)
        return charts_raster.render_chart(slide, el, theme, root)
    raise ValueError(f"unsupported elementType: {typ}")


def build(pptd_path, out_path):
    pptd_path = Path(pptd_path)
    out_path = Path(out_path)
    root = pptd_path.parent
    deck = _load_yaml(pptd_path)
    if str(deck.get("version")) != "v2":
        raise ValueError("only PPTD v2 supported")
    theme = deck.get("theme") or {}
    prs = Presentation()
    prs.slide_width = Pt(deck["size"][0])
    prs.slide_height = Pt(deck["size"][1])
    if deck.get("title"):
        prs.core_properties.title = deck["title"]

    for page_rel in deck["pages"]:
        page = _load_yaml(root / page_rel)
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        _set_background(slide, page.get("background"), theme, root, prs)
        shape_ids = {}
        for el in page.get("elements", []):
            shape = _render_element(slide, el, theme, root)
            if shape is not None:
                shape_ids[el.get("elementId")] = (
                    shape.shape_id if hasattr(shape, "shape_id") else None)
        if page.get("notes"):
            slide.notes_slide.notes_text_frame.text = str(page["notes"])
        _add_fade(slide)
        if page.get("animations"):
            build_timing(slide, page["animations"], shape_ids,
                         prs.slide_width / 12700, prs.slide_height / 12700)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    prs.save(out_path)

    n_fonts = 0
    if deck.get("customFonts"):
        fonts = fetch_custom_fonts(deck["customFonts"])
        n_fonts = embed_fonts(out_path, fonts)
    return len(deck["pages"]), n_fonts


def verify(pptd_path, out_path):
    """Runnable self-check: 1:1 structural round-trip."""
    pptd_path = Path(pptd_path)
    root = pptd_path.parent
    deck = _load_yaml(pptd_path)
    pages = [_load_yaml(root / p) for p in deck["pages"]]
    prs = Presentation(out_path)
    assert len(prs.slides) == len(pages), "slide count mismatch"
    n_charts = n_tables = n_media = 0
    for i, (page, slide) in enumerate(zip(pages, prs.slides), 1):
        els = page.get("elements", [])
        shapes = slide.shapes
        assert len(shapes) == len(els), (
            f"slide {i}: {len(shapes)} shapes != {len(els)} elements")
        tr = slide._element.findall(qn("p:transition"))
        assert tr and tr[0].find(qn("p:fade")) is not None, \
            f"slide {i}: no fade transition"
        if page.get("notes"):
            assert slide.has_notes_slide and \
                slide.notes_slide.notes_text_frame.text.strip() == \
                str(page["notes"]).strip(), f"slide {i}: notes mismatch"
        anims = page.get("animations")
        timing = slide._element.findall(qn("p:timing"))
        if anims:
            assert timing, f"slide {i}: animations missing timing XML"
        for el in els:
            if el.get("elementType") == "chart":
                n_charts += 1
            if el.get("elementType") == "table":
                n_tables += 1
        n_media += sum(1 for s in shapes if s.shape_type == 13)
    with zipfile.ZipFile(out_path) as z:
        assert z.testzip() is None, "zip integrity failure"
        charts = [n for n in z.namelist() if "charts/chart" in n]
        fonts = [n for n in z.namelist() if n.endswith(".fntdata")]
    native_charts = len(charts)
    raster_charts = sum(
        1 for page in pages for el in page.get("elements", [])
        if el.get("elementType") == "chart" and
        not charts_native.can_render_native(el))
    assert native_charts + raster_charts == n_charts, (
        f"chart mismatch: native {native_charts} + raster {raster_charts} "
        f"!= declared {n_charts}")
    if deck.get("customFonts"):
        assert fonts, "customFonts declared but no fonts embedded"
    print(f"verify OK: {len(pages)} slides, {n_charts} charts "
          f"({native_charts} native, {raster_charts} raster), "
          f"{n_tables} tables, {n_media} pictures, {len(fonts)} fonts")


def convert(pptd_path, out_path=None):
    src = Path(pptd_path)
    dst = Path(out_path) if out_path else src.with_suffix(".pptx")
    n, nf = build(src, dst)
    verify(src, dst)
    print(f"written: {dst} ({n} slides, {nf} fonts embedded)")
    return dst


def _slides(value, count):
    if value is None or value == "all":
        return list(range(1, count + 1))
    try:
        result = [int(n) for n in value.split(",")]
    except ValueError as exc:
        raise ValueError("slides must be 'all' or comma-separated numbers") from exc
    if not result or any(n < 1 or n > count for n in result):
        raise ValueError(f"slide numbers must be between 1 and {count}")
    return result


def _cli_export(kind, selection, src):
    from . import slides_image
    import tempfile
    src = Path(src)
    with tempfile.TemporaryDirectory(prefix="pptd-cli-") as tmp:
        pptx = Path(tmp) / "deck.pptx"
        convert(src, pptx)
        prs = Presentation(pptx)
        slides = _slides(selection, len(prs.slides))
        if kind == "png":
            if selection == "collage":
                out = src.with_name(src.stem + "-collage.png")
                slides_image.render_collage(src, out, slides=slides, tmp_pptx=pptx)
                print(f"collage: {out}")
            else:
                out_dir = src.with_name(src.stem + "-png")
                images = slides_image.render_slide_images(src, out_dir, slides=slides,
                                                          tmp_pptx=pptx)
                print(f"{len(images)} PNG files -> {out_dir}/")
        else:
            out = src.with_name(src.stem + ".pdf")
            selected = Path(tmp) / "selected.pptx"
            if slides != list(range(1, len(prs.slides) + 1)):
                keep = {id(prs.slides[n - 1]._element) for n in slides}
                for slide in list(prs.slides):
                    if id(slide._element) not in keep:
                        prs.slides._sldIdLst.remove(slide._element.getparent())
                prs.save(selected)
                pptx = selected
            subprocess.run(["soffice", "--headless", "--convert-to", "pdf",
                            "--outdir", str(tmp), str(pptx)],
                           check=True, capture_output=True, timeout=120)
            Path(tmp, f"{pptx.stem}.pdf").replace(out)
            print(f"PDF: {out}")


def main(argv=None):
    parser = argparse.ArgumentParser(prog="pptd", description="PPTD v2 CLI")
    parser.add_argument("command", choices=("check", "png", "pptx", "pdf"))
    parser.add_argument("args", nargs="+", metavar="PATH|SLIDES",
                        help="path; png/pdf optionally accept all, collage, or 1,2,3")
    parsed = parser.parse_args(sys.argv[1:] if argv is None else argv)
    values = parsed.args
    if parsed.command in ("check", "pptx"):
        if len(values) != 1:
            parser.error(f"{parsed.command} syntax: pptd {parsed.command} path")
        selection, src = "all", Path(values[0])
    else:
        if len(values) == 1:
            selection, src = "all", Path(values[0])
        elif len(values) == 2:
            selection, src = values
            src = Path(src)
        else:
            parser.error(f"{parsed.command} syntax: pptd {parsed.command} [slides] path")
    if parsed.command == "check":
        import tempfile
        with tempfile.TemporaryDirectory(prefix="pptd-check-") as tmp:
            out = Path(tmp) / "checked.pptx"
            build(src, out)
            verify(src, out)
    elif parsed.command == "pptx":
        convert(src)
    else:
        if parsed.command == "pdf" and selection == "collage":
            parser.error("pdf accepts only all or comma-separated slide numbers")
        _cli_export(parsed.command, selection, src)
    return 0


if __name__ == "__main__":
    sys.exit(main())
