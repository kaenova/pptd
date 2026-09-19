# Implementation Plan — `/app` PPTD Viewer

**Base:** mockup logic → Vite + React + TS. Deps: `js-yaml`, `echarts` (only). Every phase ends with the yu7 example deck rendering correctly.

## Phase 1 — Skeleton + Loader + Shell
**Deliverable:** upload folder → navigable deck.
- `app/` Vite scaffold (`react-ts`), `/` = viewer
- `src/load.ts` — port mockup loader: file map → `.pptd` parse → `pages[]` → blob URLs. Types for `Presentation/Page/ElementBase` in `src/types.ts`
- `src/Viewer.tsx` — canvas, scale-to-fit, `fit()` on resize
- `src/Shell.tsx` — toolbar (upload/drag-drop), thumb rail, ←/→, slide index
- **Exit check:** yu7 deck: cover text + bg images render, all 8 thumbs, keyboard nav

Implementation Handover Notes (Phase 1 — DONE):
- Stack: Vite 8 + React 19 + TS, bun-installed. Deps: `js-yaml@5` ONLY (echarts deliberately not yet added — phase 5).
- js-yaml v5 gotcha: **no default export in ESM build** — use `import { load as yamlLoad } from 'js-yaml'`. Cost ~20 min to find via a silent rolldown `MISSING_EXPORT`.
- `app/src/types.ts` — minimal PPTD types (only what Phase 1 consumes). Extend per phase, don't spec-dump.
- `app/src/load.ts` — `FileSource` abstraction (`read/url/list`) with 3 impls:
  - `folderSource(File[])` — upload/drop; images become `URL.createObjectURL` blob URLs at source-construction time
  - `httpSource(baseUrl)` — dev server; reads `manifest.json` (all relative paths) to find the root `.pptd`
  - disk source only exists inside `app/test/smoke.test.ts` (not shipped)
- Example decks over HTTP: `scripts/gen_example_manifest.py` emits `manifest.json` per example deck (run once; not part of npm test). Dev proxy: `/example/*` → `localhost:5174` = `python3 -m http.server 5174` rooted at `skills/cowork-ppt/example/` (see `app/vite.config.ts`). No 5174 server → "load example" fails; upload/drop still works.
- `resolveSrc()` rewrites EVERY non-http `src` string recursively (backgrounds, image elements) — keyed relative to the `.pptd` dir. Page src refs are resolved at load; don't resolve again in renderers.
- `stripRoot()` strips the picked-folder prefix from `webkitRelativePath`. Drop path uses `webkitGetAsEntry` recursion (readEntries ≤100/call, looped).
- `Renderer.tsx` — Phase-1 element coverage: text (align/letterSpacing/lineHeight), shape rect+roundRect only (radius hardcoded 16 — replace in Phase 3 shapes), image (objectFit), chart = dashed placeholder. React style prop is a CSSProperties OBJECT — not a CSS string (tsc caught this).
- z-order = JSX map order over `page.elements` (later = higher). Do NOT add z-index.
- Tests: `cd app && bun test` — 5 tests, incl. real-deck load from disk + missing-page error path. `bunx tsc -b` clean; `vite build` passes (~85KB gzip).
- Dev runbook: `cd app && bun run dev` (5173) + `python3 -m http.server 5174 -d skills/cowork-ppt/example`.
- Known gaps → next phases: theme `$refs` unhandled (Phase 2 must resolve; yu7 uses them heavily), RichText escaped-only, line/icon/table unrendered (Phase 3/4), animations none (Phase 6).

## Phase 2 — Primitives
**Deliverable:** style engine, shared by all elements.
- `src/theme.ts` — `$ref` resolution (colors/textStyles/tableStyles), priority chains, defaults table (spec §1)
- `src/render/Fill.tsx` — solid / linear+radial gradient / image fill (background + element fills)
- `src/render/Border.tsx` + `Shadow.tsx` — box-shadow mapping, per-side borders (BorderSpec in Phase 4)
- `src/render/RichText.tsx` — `<p>/<span>/<strong>/<em>/<u>/<s>/<sup>/<sub>`, inline style attrs, `\n` paragraphs
- **Exit check:** gradient overlay + `$coverTitle` + letterSpacing render pixel-close vs soffice PNG

Implementation Handover Notes (Phase 2 — DONE):
- New files: `src/theme.ts` (theme ctx + resolution), `src/render/Fill.tsx` (fill/border/shadow → CSS), `src/render/RichText.tsx` (parser + component). Renderer.tsx rewritten to consume them; Shell injects `customFonts` via `<link data-pptd-font>`.
- Theme: `ThemeContext` carries `{colors, textStyles, tableStyles}`; `useTheme()` in each element component. `resolveColor('$x')` → hex, unknown ref → `#FF00FF` (visible miss). Priority chain (spec §1.1) implemented in `resolveTextStyle`: content fields > theme textStyle > defaults; spans/tags layer on top inside RichText.
- **Gradient angle mapping: CSS deg = spec angle + 90** (spec 0 = left→right = CSS 90deg). Phase 1 had `90-angle` — wrong; test now pins both 0 and 90.
- RichText parser: single-pass stack walker (`parseInline`), top-level `<p>` split with attr extraction, plain-text `\n` → paragraphs (spec shorthand). Segment CSS precedence: `tagCss` (semantic tags) > `spanCss` (inline decls); container carries base. Supported decls: color/background-color/font-size/font-family/font-weight (spans); text-align/line-height/margin-* (paragraphs). `<a>` → blue underline. LaTeX `\(...\)` NOT handled (no deck uses it; add KaTeX when needed).
- Fast-refresh/oxlint: hooks can't live in lowercase helpers — element renderers are components (`TextBlock`, `ShapeBox`, `ImageBox`).
- textStyle vertical align via flex column + justifyContent (top/middle/bottom). `distributed` → CSS `justify`.
- MiSans not bundled: decks render in system fallback unless `customFonts` provides a Google-Fonts CSS. Bundling MiSans = later decision, needs font files.
- Tests: 18 total (13 primitives incl. yu7's real stat-line markup, 5 loader). tsc + oxlint clean, build 86KB gzip.
- Still rough (by design): shapes are boxes (radius 16 non-rect) until Phase 3 SVG; ImageFill.opacity only honored on page background, not shape fills; Border per-side arrays = Phase 4 tables.

## Phase 3 — Elements (text/shape/line/image/icon)
- `src/render/elements/Text.tsx` — align [h,v], lineHeightPx, auto overflow
- `Shape.tsx` — top-30 `shapeName`s as SVG path defs + `adjustments`, custom `viewBox`+`path`, hollow winding rule, rotation/flip/opacity
- `Line.tsx` — bezier SVG, `curve` modes, 4 arrow types
- `Image.tsx` — crop→fit→cropShape pipeline
- `Icon.tsx` — Font Awesome 7 free webfont (bundled CSS, `fas:/far:/fab:`)
- **Exit check:** yu7 slides 1–5 visually match soffice exports

Implementation Handover Notes (Phase 3 — DONE):
- **Built:** `elements/{geometry.ts, Shape.tsx, Line.tsx, Image.tsx, Icon.tsx, Text.tsx, fx.ts}`; Renderer.tsx is now a thin dispatcher. `?deck=<name>` query param on `/` loads any example deck (QA harness uses this in phase 7).
- **Geometry** (`geometry.ts`): `shapeGeom(shapeName, w, h, adjustments)` → SVG path d in bounds coords; 20 presets (common-shapes table + trivial polygons); unknown → rect + console.warn. Adjustments are OOXML [0,100000] fractions with spec defaults — PowerPoint formulas approximated for non-example shapes (donut ring = min×adj, roundRect radius = min×adj clamped ½, star inner = 2×adj ratio). `resolveShapeDef` handles `custom` (user viewBox + path, evenodd for hollow).
- **SVG gotchas hit:** (1) CSS `background` doesn't paint SVG paths — fills must be `fill` attr; gradients need `<linearGradient/radialGradient>` defs (id = `fill-${elementId}`), CSS angle → bbox vectors via (sinθ, −cosθ), θ = spec+90. (2) Custom-shape path lives in the USER viewBox — svg viewBox must switch to `el.viewBox` when shapeName=custom (was bounds → giant blob). (3) Element wrapper divs need position/size from bounds — Phase-3 first cut had bare divs (size 0×0, svg collapsed).
- **Lines:** `linePath(points, curve)` — 2 pts straight; sharp/round = polyline; smooth = Catmull-Rom→cubic (tension 1/6, endpoints duplicated). `vector-effect="non-scaling-stroke"` keeps 840×1 viewBox lines from smearing stroke. Arrows = SVG markers, 5×strokeWidth viewport with viewBox 0 0 10 10 content (10× was PowerPoint-huge); auto-start-reverse orients start arrows; dash/dot via strokeDasharray (dot needs linecap round).
- **Image crop pipeline:** `cropFrame(crop)` → padded-frame % math (width = 1/cw etc.), object-fit on the padded frame gives cover/contain/fill of the sub-rect for free; negative insets pad transparent via offsets. cropShape → CSS `clip-path: path('…')`.
- **Icon:** FA via jsDelivr CDN `<link data-pptd-fa>` injected on first icon (fas→fa-solid etc.). ponytail: swap to bundled @fortawesome/fontawesome-free if offline rendering matters.
- **fx.ts:** rotation (CSS deg, clockwise ✓)/flip/opacity wrapper transform for shape/line/image/icon (spec: Text has none). fx on wrapper means rotation applies to border+shadow+clip together — correct.
- **theme fix:** `resolveTextStyle` now returns `lineHeight` (multiple, default 1) AND `lineHeightPx` separately — Phase 2 mixed them (lineHeightPx=20 would render as 20× multiplier). textStyleProps emits `"33px"` when px set.
- **Torture deck:** `skills/cowork-ppt/example/torture/` — 3 pages exercising every Phase-3 feature (shapes incl. custom hollow ring, all 4 arrow types + curve modes, crop/cropShape/fit/rotation on images, FA icons). Loaded via `/?deck=torture`. Keep as regression fixture. NOTE: spec's custom-path example uses degenerate single-arc circles (`A r,r 0 1 1 x±ε`) — Chromium picks the wrong center for the inner contour; write circles as two half-arcs.
- Tests: 32 total (14 element/geometry, 13 primitives, 5 loader). tsc + oxlint clean; build 286KB (88.9 gzip).
- **Exit check:** verified by screenshots — yu7 8 slides, animation deck 8, dji 18 (incl. wrap:false single-lines), torture 3. soffice pixel-diff = phase 7 harness.
- Known gaps (deliberate): pie/arc/chord/bracePair geometry; image-fill on shapes (SVG pattern); hollow cropShapes (CSS path() has no fill-rule); gradient/image fills on icons. Add when a deck needs them.

## Phase 4 — Table
- `Table.tsx` — CSS grid, `rowSpan/colSpan` with omitted-cell rule, `columnWidths/rowHeights` ratios, cell fills/borders, `firstRow/lastRow/firstCol/lastCol` style overrides, `$tableStyles`
- **Exit check:** spec's merged-cell example renders correct 3×3

Implementation Handover Notes (Phase 4 — DONE):
- **Built:** `render/elements/Table.tsx` (+ `CellStyle/TableStyleConfig/BorderSpec/Cell/TableElement` in types.ts; `Element` union extended). Absolute-positioned cells over ratio-computed col/row offsets — no CSS grid (grid+rowSpan conflicts with explicit ratio sizing; absolute needs no gap-collapse logic).
- **Pure logic exported for tests:** `buildGrid` (omitted-cell walk, dji `content:{text,align}` normalization), `resolveCellStyle`/`resolveCellBorders` (chain mirrors `scripts/pptd_utils/tables.py` exactly: cell > textStyle-theme > category(rowOverColumn) > bodyStyles(cycled by data-row idx) > cellStyle; table fill only under cell fill; per-side border chain with explicit-null clears, UNSET sentinel distinguishes absent from null). 7 new tests; 39 total.
- **Defaults:** fontSize 14, align center/middle, all four borders solid 1px black — matches converter CELL_DEFAULTS.
- **Cell text = RichText** (rich tags work in cells); container flex column + justifyContent = align[1]; textAlign = align[0].
- **Legacy quirks supported (ponytail: drop when dji deck regenerates on spec v2):** (1) `content:{text,align}` cell wrapper; (2) table style convenience keys `fontSize/bodyColor/headerBold/firstColumnColor/border` — mapped to cellStyle + firstRow(firstColumn) categories; headerBold only touches row 0, firstColumnColor only col 0; (3) 3-element BorderSpec `[t, lr, b]` (spec only defines 2/4 forms).
- **Null-border semantics:** `null` side = no border (component skips); only fully-unspecified side defaults to solid 1px black.
- **Torture page 4:** spec's `table-merged` example verbatim (2×2 merge, omitted cells) + a styled table (firstRow fill/bold/align, bodyStyles band, per-cell align override). Exit check verified in browser — merged region spans cols 0–1 rows 0–1, no phantom cells.
- Verified: dji-pocket4 page 17 (real legacy table), all 4 decks zero page errors. tsc/oxlint clean, build 89.2 gzip.
- Known gaps (deliberate): image fills in cells (needs object-fit layer); table shadow applies to wrapper only.

## Phase 5 — Charts (biggest phase)
- `src/render/elements/Chart.tsx` — ECharts wrapper, resize-aware
- `src/render/charts/` — mappers: `bar line area scatter bubble candlestick pie radar waterfall heatmap treemap sunburst sankey`
  - cartesian shared: `AxisConfig` (label/axisLine/gridLine `boolean|Config`), barWidth/barGap/categoryGap
  - non-cartesian: radar→`SpokeAxisConfig`, heatmap→visualMap=`colorbar`, waterfall→stacked-transparent trick
- `seriesDefaults` merge, per-series `dataLabel/marker/legend/title` styles
- **Exit check:** one synthetic page per chart type renders w/ correct data, colors, labels

Implementation Handover Notes (Phase 5 — IN PROGRESS, resumed from this state):
- **Deps:** `echarts@6.1.0` installed (bun). Bundle: 999KB / 327KB gzip — tree-shaken via `echarts/core` + per-chart `echarts/charts` + `echarts/components` imports, registered once in `ensureRegistered()` (Chart.tsx).
- **Built:** `src/render/charts/map.ts` (pure PPTD→ECharts option mapper, entry `chartOption(el, theme)`; all 13 types) + `src/render/elements/Chart.tsx` (wrapper: init/setOption(notMerge)/dispose, fixed bounds size, frame fill/border/shadow via `boxStyle`; inner div gets the echarts canvas). Renderer dispatches `'chart'` → `ChartBox`; placeholder gone. tsc clean, build OK, existing 39 tests still green.
- **Mapper coverage:** bar/line/area (area→line+areaStyle, stream→stack `stream`), scatter, bubble (scatter + symbolSize scale sqrt/linear/log + sizeRange), candlestick (OHLC order `[open,close,low,high]`, upBars/downBars → itemStyle color/color0) + overlay line, waterfall (transparent-base stacked-bar trick, cumulative anchor on isTotal, per-bar itemStyle color total/inc/dec), pie (donut innerRadius×70%, startAngle `90−spec`), radar (indicator from category col, shared spokeAxis max/min), heatmap (category axes + continuous visualMap from colorScheme/domain, diverging→symmetric ±max), treemap/sunburst (parent-col tree build, fill array cycles by root), sankey (node dedupe first-appearance, fill map/array/cycle, nodeAlign). Axes: horizontal detection (y category or numeric-x+string-y), secondary axis arrays, AxisConfig→ECharts (label/axisLine/gridLine boolean|Config, numberFormat, arrow symbols, name/axis title), `fmtNum` for Excel-format subset (0 / 0.0 / 0% / 0.0% / #,##0 / 0.0E+00), seriesDefaults one-level merge (port of converter `merge_series_defaults`), dataLabels chain series>chart, legend default-show table per spec §LegendConfig, theme `$ref` colors everywhere, gradient fill → ECharts `{type:'linear'|'radial', colorStops}` (CSS-deg convention, spec angle+90).
- **Torture deck pages 05–08 added** (synthetic exit-check fixture): 05 cartesian (stacked bar w/ seriesDefaults, line dash/dot + null gap, area stream, donut pie + percentage labels), 06 (scatter markers, bubble sqrt, candlestick+MA overlay, waterfall totals), 07 (heatmap, treemap hierarchy, sunburst, sankey), 08 (radar, horizontal bar + #,##0 labels, bar+line secondary axis). manifest regenerated.
- **CURRENT BLOCKER (resume here):** echarts **v6 removed BubbleChart** — no `BubbleChart` export in `echarts/charts` (v5 had it); runtime `Unknown series bubble`. FIX (started, not done): emit `type: 'scatter'` for bubble series in `cartesian()` of map.ts (symbolSize scaling already correct), drop the BubbleChart import/use in Chart.tsx, then `rm -rf app/node_modules/.vite` (stale optimized dep chunk `v=7c50f778` lacks the export and breaks the module graph), restart `bun vite --port 5173` (old 5173 server was killed; a second vite sits on 5175 — kill it to restore canonical 5173), re-run `/tmp/p5i.js` (playwright, navigates 8 slides, screenshots slides 5–8 to /tmp/p5_pg*.png, prints per-slide errors).
- **Gotchas hit:** (1) vite pre-bundle cache must be cleared after changing echarts imports or page white-screens with `does not provide an export named` + `locator.click` timeouts. (2) `types.isSubsetOf` needs ES2025 lib — replaced with `every/has`. (3) Keep `Loose = Record<string, any>` for chart series; full 13-type generics not worth it.
- **TODO to finish Phase 5:** bubble→scatter fix above; pure-fn tests in `test/charts.test.ts` (fmtNum, mergeSeriesDefaults, waterfall cumulative/anchoring, horizontal detection, treemap/sunburst tree build, pie startAngle mapping, legend default table); visual verify all 8 torture slides + regression on yu7/animation/dji decks (charts only in torture); oxlint clean; plan-doc Phase 5 DONE notes; commit `feat(app): chart renderer (phase 5)`.

## Phase 6 — Animations
- `src/anim.ts` — entrance/exit/emphasis effects → CSS keyframes/WAAPI
- click-group state machine: `onClick/withPrevious/afterPrevious`, replay on slide enter
- motion-path: SVG path → `offset-path`
- **Exit check:** `xiaomi-yu7-ppt-animation` example plays groups in order

Implementation Handover Notes:
...

## Phase 7 — QA harness + polish
- Dev-only route: side-by-side viewer vs `soffice` PNG (from existing `slides_image.py`), per-slide diff
- Speaker notes panel, fullscreen/present mode, poster sizes, error toasts
- README + npm scripts (`dev/build/test`)

**Order fixed:** 2 before 3 (all elements consume primitives), 4/5 parallelizable, 6 last (needs stable render tree).

Implementation Handover Notes:
...

---

Progress Tracker
- [x] Phase 1 — DONE (Vite+React scaffold, FileSource loader, upload/drop/example-deck, thumb rail, scale-to-fit canvas, 5 smoke tests green)
- [x] Phase 2 — DONE (theme ctx + $ref resolution, Fill/Border/Shadow primitives, RichText parser+renderer, customFonts injection, 18 tests green, yu7 slides verified in browser)
- [x] Phase 3 — DONE (Shape/Line/Image/Icon/Text element components, 20 shape presets + custom paths, arrows + curve lines, crop→fit→cropShape, FA icons via CDN, 32 tests, all example decks + torture deck verified in browser)
- [x] Phase 4 — DONE (Table.tsx: omitted-cell grid walk, full style chain mirroring converter, per-side BorderSpec chain, dji legacy compat, 39 tests, spec merged-cell example + dji real table verified)
- [ ] Phase 5
- [ ] Phase 6
- [ ] Phase 7