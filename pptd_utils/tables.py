"""Table element: merges, full style-inheritance chain, per-side borders."""
from lxml import etree
from pptx.oxml.ns import qn
from pptx.util import Pt

from .render_text import emit_text, TEXTSTYLE_KEYS
from .style import fill_xml, color_el, line_style_attrs
from .xmlutil import sub, insert_ordered, TCPR_ORDER

CELL_DEFAULTS = {
    "color": "#000000", "fontSize": 14, "fontFamily": "MiSans",
    "bold": False, "italic": False, "lineHeight": 1,
    "letterSpacing": 0, "marginTop": 0,
    "fill": None, "border": None, "align": ["center", "middle"],
}
TEXT_KEYS = ("color", "fontSize", "fontFamily", "bold", "italic",
             "backgroundColor", "lineHeight", "lineHeightPx",
             "letterSpacing", "marginTop")
LAYOUT_KEYS = ("fill", "border", "align")


def _norm_border_spec(spec):
    """BorderSpec -> {side: Border|None} for t/r/b/l; None = unspecified."""
    if spec is None:
        return None
    if isinstance(spec, dict):
        b = {k: spec.get(k) for k in ("style", "width", "color")}
        return {"t": b, "r": b, "b": b, "l": b}
    if isinstance(spec, list):
        if len(spec) == 2:
            tb, lr = spec
            return {"t": tb, "b": tb, "l": lr, "r": lr}
        if len(spec) == 4:
            t, r, b, l = spec
            return {"t": t, "r": r, "b": b, "l": l}
    raise ValueError(f"bad BorderSpec {spec!r}")


def _merge(dst, src, keys):
    for k in keys:
        if src and src.get(k) is not None:
            dst[k] = src[k]


def resolve_cell_style(r, c, nrows, ncols, cfg, cell, table_fill):
    """Full pptd table style chain -> flat dict + per-side borders."""
    out = dict(CELL_DEFAULTS)
    _merge(out, cfg.get("cellStyle"), TEXT_KEYS + LAYOUT_KEYS)
    # bodyStyles: data rows (not first/last), cycled by data-row index
    body = cfg.get("bodyStyles")
    if body and r not in (0, nrows - 1):
        di = r - 1 if nrows > 2 else r
        bs = body[di % len(body)]
        _merge(out, bs, TEXT_KEYS + LAYOUT_KEYS)
    # category styles
    row_style = None
    if r == 0 and cfg.get("firstRowStyle") is not None:
        row_style = cfg["firstRowStyle"]
    elif r == nrows - 1 and nrows > 1 and cfg.get("lastRowStyle") is not None:
        row_style = cfg["lastRowStyle"]
    col_style = None
    if c == 0 and cfg.get("firstColumnStyle") is not None:
        col_style = cfg["firstColumnStyle"]
    elif c == ncols - 1 and ncols > 1 and cfg.get("lastColumnStyle") is not None:
        col_style = cfg["lastColumnStyle"]
    row_wins = cfg.get("rowOverColumn", True)
    loser, winner = (col_style, row_style) if row_wins else (row_style, col_style)
    _merge(out, loser, TEXT_KEYS + LAYOUT_KEYS)
    _merge(out, winner, TEXT_KEYS + LAYOUT_KEYS)
    # 5. cell.textStyle theme ref (text fields only)
    if cell.get("textStyle"):
        ref = cell["_theme_textstyles"].get(str(cell["textStyle"]).lstrip("$"), {})
        _merge(out, ref, TEXT_KEYS)
    # 4. cell inline
    _merge(out, cell, TEXT_KEYS + LAYOUT_KEYS)
    # table-level fill under everything
    if out.get("fill") is None and table_fill is not None:
        out["fill"] = table_fill
    return out


UNSET = object()  # distinguishes 'field absent' from 'explicit null' (clear)


def _border_sides(r, c, nrows, ncols, cfg, cell):
    """Resolve per-side Border|None from the chain (top-down per side).
    Chain: cell.border > row/col category (rowOverColumn) > bodyStyles >
    cellStyle.border. Explicit null clears all sides at that level."""
    specs = [cell.get("border", UNSET)]
    row_style = (cfg.get("firstRowStyle") if r == 0 else
                 cfg.get("lastRowStyle") if r == nrows - 1 else None)
    col_style = (cfg.get("firstColumnStyle") if c == 0 else
                 cfg.get("lastColumnStyle") if c == ncols - 1 else None)
    row_wins = cfg.get("rowOverColumn", True)
    loser, winner = (col_style, row_style) if row_wins else (row_style, col_style)
    if loser is not None:
        specs.append(loser.get("border", UNSET))
    if winner is not None:
        specs.append(winner.get("border", UNSET))
    body = cfg.get("bodyStyles")
    if body and r not in (0, nrows - 1):
        di = r - 1 if nrows > 2 else r
        specs.append(body[di % len(body)].get("border", UNSET))
    if cfg.get("cellStyle") is not None:
        specs.append(cfg["cellStyle"].get("border", UNSET))

    resolved = {}
    for spec in specs:
        if spec is UNSET:
            continue
        if spec is None:  # explicit clear-all
            for side in ("t", "r", "b", "l"):
                resolved.setdefault(side, None)
            continue
        norm = _norm_border_spec(spec)
        for side in ("t", "r", "b", "l"):
            if side not in resolved:
                resolved[side] = norm.get(side)
    default = {"style": "solid", "width": 1, "color": "#000000"}
    for side in ("t", "r", "b", "l"):
        if side not in resolved:
            resolved[side] = default
    return resolved


def render_table(slide, el, theme, root):
    ncols = len(el["columnWidths"])
    rows = el["rows"]
    grid = {}
    occupied = set()
    r = 0
    max_row = 0
    for row in rows:
        c = 0
        for cell in row:
            while (r, c) in occupied:
                c += 1
            rs = int(cell.get("rowSpan", 1) or 1)
            cs = int(cell.get("colSpan", 1) or 1)
            grid[(r, c)] = cell
            for dr in range(rs):
                for dc in range(cs):
                    if dr or dc:
                        occupied.add((r + dr, c + dc))
            max_row = max(max_row, r + rs)
            c += cs
        r += 1
    nrows = max(r, max_row)

    x, y, w, h = el["bounds"]
    tbl_shape = slide.shapes.add_table(nrows, ncols, Pt(x), Pt(y), Pt(w), Pt(h))
    table = tbl_shape.table
    # explicit grid geometry from ratios
    for i, ratio in enumerate(el["columnWidths"]):
        table.columns[i].width = Pt(w * ratio)
    for i, ratio in enumerate(el["rowHeights"][:nrows]):
        table.rows[i].height = Pt(h * ratio)
    if len(el["rowHeights"]) < nrows:  # rows beyond provided ratios: equal split
        rest = nrows - len(el["rowHeights"])
        per = h / max(1, nrows)
        for i in range(len(el["rowHeights"]), nrows):
            table.rows[i].height = Pt(per)
    # strip default banded style
    tbl = table._tbl
    tblPr = tbl.find(qn("a:tblPr"))
    if tblPr is not None:
        for a in ("firstRow", "lastRow", "firstCol", "lastCol", "bandRow", "bandCol"):
            tblPr.set(a, "0")
        for sid in tblPr.findall(qn("a:tableStyleId")):
            tblPr.remove(sid)

    # resolve TableStyleConfig
    style = el.get("style")
    cfg = {}
    if style:
        if isinstance(style, str):
            cfg = (theme.get("tableStyles") or {}).get(style.lstrip("$"), {})
        else:
            cfg = style
    table_fill = el.get("fill")

    # apply merges first
    for (rr, cc), cell in grid.items():
        rs = int(cell.get("rowSpan", 1) or 1)
        cs = int(cell.get("colSpan", 1) or 1)
        if rs > 1 or cs > 1:
            origin = table.cell(rr, cc)
            end = table.cell(rr + rs - 1, cc + cs - 1)
            origin.merge(end)

    for (rr, cc), cell in sorted(grid.items()):
        table_cell = table.cell(rr, cc)
        cell_env = dict(cell)
        cell_env["_theme_textstyles"] = theme.get("textStyles") or {}
        flat = resolve_cell_style(rr, cc, nrows, ncols, cfg, cell_env, table_fill)
        sides = _border_sides(rr, cc, nrows, ncols, cfg, cell)
        tcPr = table_cell._tc.get_or_add_tcPr()
        # fill
        fill_xml(tcPr, flat.get("fill"), theme, order=TCPR_ORDER,
                 image_part_fn=_ipf(slide))
        # borders: lnL lnR lnT lnB
        for side, tag in (("l", "a:lnL"), ("r", "a:lnR"), ("t", "a:lnT"), ("b", "a:lnB")):
            for e in tcPr.findall(qn(tag)):
                tcPr.remove(e)
            b = sides.get(side)
            if not b:
                continue
            ln = etree.Element(qn(tag))
            ln.set("w", str(int(Pt(b.get("width", 1)))))
            ln.set("cap", "flat")
            ln.set("cmpd", "sng")
            ln.set("algn", "ctr")
            sf = sub(ln, "a:solidFill")
            color_el(sf, b.get("color", "#000000"), theme)
            if b.get("style") in ("dash", "dot"):
                sub(ln, "a:prstDash", {"val": line_style_attrs(b)})
            insert_ordered(tcPr, ln, TCPR_ORDER)
        # text
        align = flat.get("align") or ["center", "middle"]
        tf = table_cell.text_frame
        tf.word_wrap = True
        from pptx.enum.text import MSO_ANCHOR
        tf.vertical_anchor = {"top": MSO_ANCHOR.TOP, "middle": MSO_ANCHOR.MIDDLE,
                              "bottom": MSO_ANCHOR.BOTTOM}.get(align[1], MSO_ANCHOR.MIDDLE)
        fs = flat.get("fontSize")
        if fs is None:
            rh = h * el["rowHeights"][rr] if rr < len(el["rowHeights"]) else h / nrows
            fs = max(10, min(18, rh * 0.45))
        content = {k: v for k, v in flat.items() if k in TEXT_KEYS}
        content["text"] = cell.get("text", "")
        content.setdefault("fontSize", fs)
        content["align"] = align
        emit_text(tf, content, theme, default_align=align)
    return tbl_shape


def _ipf(slide):
    def fn(path):
        part, rid = slide.part.get_or_add_image_part(str(path))
        return rid
    return fn
