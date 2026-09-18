# pptd

Unofficial PPTD v2 toolkit for creating, editing, and exporting editable PowerPoint presentations. This is enhancement from [Open Kimi PPT Skills](https://github.com/acnlie/open-kimi-ppt-skill) with its reverse engineering, spec to presentation CLI.

## Install the CLI

```bash
python -m pip install pptd-utils
```

The `pptd` and `pptd-utils` commands convert PPTD v2 projects offline. Slide image export additionally needs LibreOffice (`soffice`) on `PATH`.

## CLI

```bash
pptd check deck/deck.pptd
pptd pptx deck/deck.pptd
pptd png deck/deck.pptd
pptd png 1,2,3 deck/deck.pptd
pptd png collage deck/deck.pptd
pptd pdf deck/deck.pptd
pptd pdf 1,2,3 deck/deck.pptd
```

`all` is the default. PNG/PDF export requires LibreOffice (`soffice`).

The converter verifies slide count, fade transitions, supported content, and ZIP integrity.

## Supported PPTD features

- Editable text, shapes, images, icons, tables, and charts
- Linear and radial gradients
- Fill, shape, image, icon, and per-gradient-stop opacity
- Borders, shadows, arrows, and dash styles
- Native PowerPoint connectors for ordinary two-point lines
- Custom SVG-path shapes
- Embedded custom fonts
- Fade slide transitions
- Optional on-slide animations
- PPTD-to-PPTX conversion without a browser

PPTD reference:

```text
skills/cowork-ppt/reference/pptd.md
```

Toolkit documentation:

```text
pptd_utils/README.md
```

## Local development

```bash
npm install
npm test
npm run sync:pptd
npm run pack:check
```

`pptd_utils/` is the source copy. `skills/cowork-ppt/scripts/pptd_utils/` is the synchronized packaged copy.

## Project layout

```text
project/
  deck.pptd
  pages/
  media/
```

## Scope

This project is not an official cowork, Kimi, or Moonshot AI SDK. PowerPoint, WPS, and Keynote may render unsupported or advanced OOXML features differently.
