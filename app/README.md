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

## Architecture

```
src/
├── main.tsx                # entry
├── Shell.tsx               # app chrome: top bar, drag&drop, keyboard nav, owns all top-level state
├── Renderer.tsx            # page → element dispatch (DeckView/PageView)
├── load.ts                 # FileSource (folder/http), loadProject, path helpers
├── types.ts                # Presentation/Page/Element/Fill/LoadedProject
├── theme.ts / anim.ts / select.ts
├── render/                 # element renderers (elements/, Fill, RichText, charts)
└── test/                   # bun test
```

### Compound components (Radix-style building blocks)

Two component systems follow a two-layer pattern: smart **blocks** own state and expose it via context;
dumb **parts** consume it. A thin **preset** composes them for the app. Logic is testable in isolation,
and consumers can rearrange parts without touching internals.

#### Previewer — file preview dialog

`src/Previewer/` (blocks) + `src/FilePreviewer.tsx` (preset used by Shell).

| Part | Role |
|---|---|
| `Previewer.Root` | smart: fetches content via `FileSource`, detects `kindOf` (text/image/binary), Escape-to-close, provides context |
| `Overlay` / `Panel` | backdrop + `role="dialog"` container (backdrop click closes) |
| `Header` / `Title` / `Close` | chrome |
| `Body` + `Error` `Image` `Binary` `Code` | content parts, **self-guarding**: each renders `null` unless its kind matches |
| `Footer` + `Stats` `Language` | meta bar |

```tsx
<Previewer.Root source={source} file={selectedFile} onClose={close}>
  <Previewer.Overlay />
  <Previewer.Panel>
    <Previewer.Header><Previewer.Title /><Previewer.Close /></Previewer.Header>
    <Previewer.Body>
      <Previewer.Error /><Previewer.Image /><Previewer.Binary /><Previewer.Code />
    </Previewer.Body>
    <Previewer.Footer><Previewer.Stats /><Previewer.Language /></Previewer.Footer>
  </Previewer.Panel>
</Previewer.Root>
```

Minimal custom composition (no footer, no overlay):

```tsx
<Previewer.Root source={s} file={f} onClose={close}>
  <Previewer.Panel><Previewer.Body><Previewer.Code /></Previewer.Body></Previewer.Panel>
</Previewer.Root>
```

#### Deck — slide viewer with sidebar

`src/Deck/` (blocks) + `src/Viewer.tsx` (preset used by Shell). `present` is a **controlled prop** —
Shell owns the toggle (toolbar button / `f` key); blocks only consume it, Radix `Dialog open` style.

| Part | Role |
|---|---|
| `Deck.Root` | smart: scale/play/thumbnail-width state, context provider |
| `SlideList` | thumbnail sidebar (hidden in present mode) |
| `Slide` | one thumbnail; measures itself (RO), active ring |
| `Stage` | centers canvas; ResizeObserver → `fitScale`; click = replay animations (edit mode) |
| `Canvas` | scaled canvas wrap + `DeckView` |

```tsx
<Deck.Root project={p} index={cur} present={present} onSlideChange={setCur} onSelect={...}>
  <Deck.SlideList />
  <Deck.Stage><Deck.Canvas /></Deck.Stage>
</Deck.Root>
```

Pure helpers exported for testing: `fitScale` (cover in present, fit-with-margin capped 1.5× in edit),
`thumbScale`; Previewer exports `kindOf`, `langOf`, `LANGUAGE_BY_EXT`.

#### Conventions

- Blocks live in a folder per system with an `index.ts` re-export barrel — consumers import from
  `./Previewer` / `./Deck` and never reach into internal files. Layout: `helpers.ts` (pure fns),
  `context.tsx` (Ctx + `useCtx`), `Root.tsx` (smart), one file per part group (`Layout.tsx`,
  `Content.tsx`, `SlideList.tsx`, `Stage.tsx`, `Canvas.tsx`).
- Styling baked into parts (Tailwind). No `className` override prop yet — add a `cn()` merge when a
  second preset needs different styling.
- File preview: double-click a slide/media file in the explorer → `FilePreviewer` overlay (Monaco for
  text, `<img>` for images, warning for binaries).
