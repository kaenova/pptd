# pptd_utils

Offline PPTD toolkit — full-spec `.pptd` → `.pptx` converter + slide image export (collage / single slide). Pure Python, no browser required.

Built against the PPTD v2 spec (`skills/cowork-ppt/reference/pptd.md`, relative to the repo root).

## Install / dependencies

```
pip install python-pptx Pillow PyYAML
```

Optional (graceful fallback if missing):

| Package | Unlocks | Fallback |
|---|---|---|
| `latex2mathml` + `mathml2omml` | native equations (OMML) from `\( ... \)` | literal text |
| `fontTools` | customFonts (Google Fonts woff2 → embedded TTF) | fonts skipped |

Slide images additionally need **LibreOffice** (`soffice` on PATH).

## CLI

Install from PyPI:

```bash
python -m pip install pptd-utils
```

Commands write beside the input path. `all` is the default; selections accept comma-separated 1-based slide numbers.

```bash
pptd check deck.pptd
pptd pptx deck.pptd
pptd png deck.pptd                 # all slides -> deck-png/
pptd png 1,2,3 deck.pptd           # selected slides -> deck-png/
pptd png collage deck.pptd         # contact sheet -> deck-collage.png
pptd pdf deck.pptd                 # all slides -> deck.pdf
pptd pdf 1,2,3 deck.pptd            # selected slides -> deck.pdf
```

PNG and PDF export require LibreOffice (`soffice` on `PATH`).

## Python API

```python
from pptd_utils import convert, build, verify
from pptd_utils import slides_image

convert("deck.pptd", "out.pptx")          # build + verify + print summary
build("deck.pptd", "out.pptx")            # -> (n_slides, n_fonts)
verify("deck.pptd", "out.pptx")           # structural self-check (asserts)

slides_image.render_collage("deck.pptd", "collage.png",
                            tile_w=480, gap=20, bg="#1F2430")
slides_image.render_slide("deck.pptd", 3, "slide3.png")
slides_image.render_slide_images("deck.pptd", "outdir/",
                                 slides=[1, 3, 5])   # -> [(n, Path), ...]
```

## Supported features (PPTD v2)

| Area | Coverage |
|---|---|
| text | full HTML tag set (strong/em/u/s/sup/sub/a/br/ul/ol/span style attrs), LaTeX runs, gradient + shadow text, letterSpacing, lineHeight / lineHeightPx, bullets/numbering, vertical text, hyperlinks, highlight |
| shapes | all 130 preset shapeNames (adjustments), custom SVG paths (`M/L/H/V/C/S/Q/A/Z`, multi-subpath holes), rotation/flip/opacity, gradient/radial fills |
| lines | sharp / smooth / round (fillet) curves, arrows (head/tail), dash styles |
| images | fit cover/contain/fill, crop (inset + negative outset padding), cropShape (any preset or custom path), opacity, border, shadow |
| icons | Font Awesome 6/7 free (fas/far/fab), solid + gradient fill, outline, shadow |
| tables | rowSpan/colSpan merges, theme tableStyles + inline, per-cell style chains, BorderSpec (per-side / null-clear), gradient cell fills, fontSize auto-fit |
| charts — native (editable) | bar (stacked/clustered/horizontal), line (smooth/dash/markers), area, scatter, bubble, pie/donut, radar, secondary axes, dataLabels + numberFormat, embedded workbooks |
| charts — raster (Pillow PNG) | candlestick, waterfall, heatmap (linear/diverging + colorbar), treemap, sunburst, sankey, stream stacks, mixed scatter+cartesian |
| animations | 21 effects (entrance/emphasis/exit incl. motion-path) → full `p:timing` tree, click/withPrevious/afterPrevious, repeat, easing |
| transitions | fade |
| fonts | customFonts embedding (see optional deps) |
| misc | page backgrounds (solid/gradient/image), notes, themes ($refs), elementId → animation targeting |

## How it works

- `pptx` generation: python-pptx + hand-built DrawingML for fills/effects/ordering; charts created via real chart parts (editable in PowerPoint) then plot XML rewritten; unsupported chart types rasterized at 2× and placed as pictures.
- images: each slide isolated into a one-slide pptx, rendered by LibreOffice headless, composed by Pillow.
  (`ponytail:` one soffice run per slide — switch to single PDF + PyMuPDF for large decks.)

## Test

```bash
python3 tests/run.py   # converts full-spec fixture + minimal + ml-smp, asserts structure
```

Fixture `tests/fixtures/full/` exercises every feature area — use it as a syntax reference for your own decks.

## Notes

- Downloads (FA fonts, URL images/fonts) cache under `~/.cache/pptd_utils/`.
- Defaults follow the spec: MiSans font family, 18pt body, black text.
