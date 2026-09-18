"""Rich-text parser: pptd subset of HTML -> paragraph/run model.

Also handles: plain-text shorthand (multi-line -> <p> per line), <br/>,
LaTeX \\(...\\) segments, list styles, span/p/li style attributes.
"""
import html.parser
import re

from .style import css_px

MATH_RE = re.compile(r"\\\((.+?)\\\)", re.S)
STYLE_RE = re.finditer  # alias used inline


def _parse_style(s):
    """'color:#f00; font-size:24px' -> dict."""
    out = {}
    for m in re.finditer(r"([\w-]+)\s*:\s*([^;]+)", s or ""):
        out[m.group(1).strip().lower()] = m.group(2).strip()
    return out


LIST_TYPES = {
    "decimal": "arabicPeriod", "disc": "\u2022", "circle": "\u25E6",
    "square": "\u25AA", "none": None,
    "lower-alpha": "alphaLcPeriod", "upper-alpha": "alphaUcPeriod",
    "lower-roman": "romanLcPeriod", "upper-roman": "romanUcPeriod",
}


class Run:
    __slots__ = ("text", "span", "bold", "italic", "underline", "strike",
                 "sub", "sup", "link", "math")

    def __init__(self, text, span=None, bold=False, italic=False,
                 underline=False, strike=False, sub=False, sup=False,
                 link=None, math=None):
        self.text = text
        self.span = span or {}
        self.bold = bold
        self.italic = italic
        self.underline = underline
        self.strike = strike
        self.sub = sub
        self.sup = sup
        self.link = link
        self.math = math


class Para:
    def __init__(self, bullet=False, ordered=False):
        self.bullet = bullet
        self.ordered = ordered
        self.align = None      # from p/li style
        self.lh = None         # line-height (mult) or px
        self.lh_px = None
        self.mt = None         # margin-top px
        self.ml = None         # margin-left px
        self.mr = None         # margin-right px
        self.ls = None         # letter-spacing (li only)
        self.list_style = None  # list-style-type key or char
        self.runs = []
        self.br_pending = False


class _Parser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.paras = []
        self.cur = None
        self.spans = []
        self.bold = self.italic = self.underline = self.strike = 0
        self.sub = self.sup = 0
        self.link = None
        self._in_ol = False

    def new_para(self, bullet=False, ordered=False):
        self.cur = Para(bullet, ordered)
        self.paras.append(self.cur)
        return self.cur

    def _li_style(self, p, attrs):
        for k, v in attrs.items():
            if k == "text-align":
                p.align = v
            elif k == "line-height":
                if str(v).endswith("px"):
                    p.lh_px = css_px(v)
                else:
                    p.lh = float(v)
            elif k == "margin-top":
                p.mt = css_px(v)
            elif k == "margin-left":
                p.ml = css_px(v)
            elif k == "margin-right":
                p.mr = css_px(v)
            elif k == "letter-spacing":
                p.ls = css_px(v)
            elif k in ("list-style-type", "list-style"):
                key = v.split()[0] if v else "disc"
                p.list_style = key

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("p", "li"):
            p = self.new_para(bullet=(tag == "li"))
            if tag == "li":
                p.ordered = self._in_ol
            self._li_style(p, _parse_style(a.get("style", "")))
        elif tag in ("ul", "ol"):
            self._in_ol = tag == "ol"
        elif tag == "span":
            self.spans.append(_parse_style(a.get("style", "")))
        elif tag in ("strong", "b"):
            self.bold += 1
        elif tag in ("em", "i"):
            self.italic += 1
        elif tag == "u":
            self.underline += 1
        elif tag == "s":
            self.strike += 1
        elif tag == "sup":
            self.sup += 1
        elif tag == "sub":
            self.sub += 1
        elif tag == "a":
            self.link = a.get("href")
        elif tag == "br":
            if self.cur is not None and self.cur.runs:
                self.cur.runs.append(Run("\n"))

    def handle_startendtag(self, tag, attrs):
        if tag == "br":
            self.handle_starttag("br", attrs)
            return
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in ("p", "li"):
            self.cur = None
        elif tag in ("ul", "ol"):
            self._in_ol = False
        elif tag == "span":
            if self.spans:
                self.spans.pop()
        elif tag in ("strong", "b"):
            self.bold -= 1
        elif tag in ("em", "i"):
            self.italic -= 1
        elif tag == "u":
            self.underline -= 1
        elif tag == "s":
            self.strike -= 1
        elif tag == "sup":
            self.sup -= 1
        elif tag == "sub":
            self.sub -= 1
        elif tag == "a":
            self.link = None

    def handle_data(self, data):
        if self.cur is None:
            if not data.strip():
                return
            self.new_para()
        # split LaTeX out of text runs
        pos = 0
        for m in MATH_RE.finditer(data):
            self._emit_text(data[pos:m.start()])
            span = {}
            for st in self.spans:
                span.update(st)
            self.cur.runs.append(Run("", span=span, math=m.group(1).strip()))
            pos = m.end()
        self._emit_text(data[pos:])

    def _emit_text(self, text):
        if not text:
            return
        text = re.sub(r"\s+", " ", text)
        if not text.strip():
            if not self.cur.runs and text == " ":
                return  # leading whitespace before first run
            if not self.cur.runs:
                return
        span = {}
        for st in self.spans:
            span.update(st)
        self.cur.runs.append(Run(
            text, span,
            self.bold > 0, self.italic > 0, self.underline > 0,
            self.strike > 0, self.sub > 0, self.sup > 0, self.link))


def parse_rich(text):
    """Parse pptd rich text -> list[Para]."""
    text = str(text or "")
    if "<" not in text:
        # plain-text shorthand: lines -> paragraphs
        paras = []
        for line in text.split("\n"):
            p = Para()
            if line:
                p.runs.append(Run(re.sub(r"\s+", " ", line)))
            paras.append(p)
        return paras
    p = _Parser()
    p.feed(text)
    p.close()
    if not p.paras:
        p.new_para()
    return p.paras
