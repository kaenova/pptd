"""Low-level XML helpers: element creation in schema order, namespaces."""
from lxml import etree
from pptx.oxml.ns import qn as _qn

NSMAP = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
    "m": "http://schemas.openxmlformats.org/officeDocument/2006/math",
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
}


def qn(tag):
    return _qn(tag)


def E(tag, attrs=None, text=None):
    """Create element 'a:gradFill' style. attrs values: str|number."""
    e = etree.SubElement  # placeholder
    root = etree.Element(qn(tag), nsmap=None)
    if attrs:
        for k, v in attrs.items():
            if v is not None:
                root.set(k, str(v))
    if text is not None:
        root.text = str(text)
    return root


def sub(parent, tag, attrs=None, text=None):
    e = etree.SubElement(parent, qn(tag), nsmap=None)
    if attrs:
        for k, v in attrs.items():
            if v is not None:
                e.set(k, str(v))
    if text is not None:
        e.text = str(text)
    return e


def insert_ordered(parent, child, order):
    """Insert child into parent before the first existing element whose tag
    comes after child's tag in `order` (list of qn-style tags)."""
    try:
        idx = order.index(child.tag)
    except ValueError:
        parent.append(child)
        return child
    for existing in parent:
        try:
            eidx = order.index(existing.tag)
        except ValueError:
            continue
        if eidx > idx:
            existing.addprevious(child)
            return child
    parent.append(child)
    return child


# Schema child orders (subset used by this package)
RPR_ORDER = [qn(t) for t in (
    "a:ln", "a:noFill", "a:solidFill", "a:gradFill", "a:blipFill", "a:pattFill",
    "a:grpFill", "a:effectLst", "a:effectDag", "a:highlight", "a:uLnTx", "a:uLn",
    "a:uFillTx", "a:uFill", "a:latin", "a:ea", "a:cs", "a:sym", "a:hlinkClick",
    "a:hlinkMouseOver", "a:rtl", "a:extLst")]

PPR_ORDER = [qn(t) for t in (
    "a:lnSpc", "a:spcBef", "a:spcAft", "a:buClrTx", "a:buClr", "a:buSzTx",
    "a:buSzPct", "a:buSzPts", "a:buFontTx", "a:buFont", "a:buNone",
    "a:buAutoNum", "a:buChar", "a:buBlip", "a:tabLst", "a:defRPr", "a:extLst")]

TCPR_ORDER = [qn(t) for t in (
    "a:lnL", "a:lnR", "a:lnT", "a:lnB", "a:lnTlToBr", "a:lnBlToTr", "a:cell3D",
    "a:noFill", "a:solidFill", "a:gradFill", "a:blipFill", "a:pattFill",
    "a:grpFill", "a:headers", "a:extLst")]

SPPR_ORDER = [qn(t) for t in (
    "a:xfrm", "a:custGeom", "a:prstGeom", "a:noFill", "a:solidFill",
    "a:gradFill", "a:blipFill", "a:pattFill", "a:grpFill", "a:ln",
    "a:effectLst", "a:effectDag", "a:scene3d", "a:sp3d", "a:extLst")]


def parse_xml(xml_str):
    """Parse an XML fragment with our namespaces bound (a/p/c/r/m)."""
    wrapper = ('<root xmlns:a="%(a)s" xmlns:p="%(p)s" xmlns:r="%(r)s" '
               'xmlns:c="%(c)s" xmlns:m="%(m)s">%%s</root>') % NSMAP
    root = etree.fromstring(wrapper % xml_str)
    children = list(root)
    for ch in children:
        root.remove(ch)
    return children


def set_xfrm_flip_rot(shape, rotation=0, flip=None):
    """Apply rotation (deg cw) and flip [h,v] to an autoshape/picture."""
    spPr = shape._element.spPr
    xfrm = spPr.find(qn("a:xfrm"))
    if xfrm is None:
        return
    if rotation:
        xfrm.set("rot", str(int(round(rotation * 60000)) % 21600000))
    if flip:
        if flip[0]:
            xfrm.set("flipH", "1")
        if flip[1]:
            xfrm.set("flipV", "1")
