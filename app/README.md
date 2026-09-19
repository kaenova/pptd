# pptd-viewer

Browser viewer for [PPTD](../../skills/cowork-ppt/reference/pptd.md) slide decks (.pptd folder format). Renders text, shapes, lines, images, icons, tables and all 13 chart types (ECharts), with entrance/exit/emphasis animations, speaker notes and a fullscreen present mode. No server, no build step for decks — just a folder.

Stack: Vite + React + TypeScript, `js-yaml`, `echarts`. No state/UI libraries.

## Run

```sh
cd app
bun install
bun run dev      # http://localhost:5173
bun run build    # tsc -b && vite build
bun run test     # bun test
bun run lint     # oxlint src test
```

A static file server on port 5174 serving `skills/cowork-ppt/example/` enables the built-in example decks (Vite dev proxy `/example`).

## Usage

- **Upload** — pick or drop a deck folder (root must contain the `.pptd` file). Everything stays local; media loads via blob URLs.
- **Example decks** — `?deck=<folder>`, e.g. `http://localhost:5173/?deck=yu7-ppt` or `?deck=xiaomi-yu7-ppt-animation`.
- **Navigate** — thumbnail rail, `←`/`→`, or click (a click also advances animation groups on animated pages).
- **Notes** — toolbar `notes` toggles the speaker-notes panel.
- **Present** — toolbar `present` or `f`: fullscreen, chrome hidden.
- **Poster sizes** — deck `size` is honored verbatim (e.g. `[720, 1280]` 9:16); the canvas scales to fit any aspect.

## Animations

Page-level `animations` arrays follow the spec: `onClick` starts a click group, `withPrevious` joins it, `afterPrevious` chains. The first group auto-plays on slide enter when it starts with `withPrevious`/`afterPrevious`. Effects map to CSS keyframes; `motion-path` uses native `offset-path`. Thumbnails don't play animations.

## QA mode (dev-only)

Side-by-side viewer vs. LibreOffice reference render, per slide:

```sh
python3 -m pptd_utils png all skills/cowork-ppt/example/yu7-ppt/yu7.pptd
# -> skills/cowork-ppt/example/yu7-ppt/yu7-png/slide_NN.png
bun run dev &
open "http://localhost:5173/?deck=yu7-ppt&qa=yu7-ppt"
```

Reference PNGs are gitignored (regenerable).
