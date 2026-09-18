"""pptd_utils — offline PPTD toolkit: .pptd -> .pptx converter + slide images (PPTD v2 spec).

python-pptx + Pillow only; optional: latex2mathml+mathml2omml (LaTeX->OMML),
fontTools+brotli (customFont embedding).
"""
__version__ = "0.1.0"

from .main import build, verify, convert

__all__ = ["__version__", "build", "verify", "convert"]
