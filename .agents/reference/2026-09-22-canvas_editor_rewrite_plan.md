# Canvas Editor Rewrite Plan

**Goal:** in-app direct manipulation editing of a loaded PPTD deck (Figma-style), covering the full element surface of the PPTD v2 spec (text, shape, line, image, icon, table, chart) plus page-level ops. Spec: `skills/cowork-ppt/reference/pptd.md`.

**What exists (keep):** immutable `patchProject` pipeline (Shell owns state), deck ctx (`tool/selectedId/editingId`), `DeckTool` palette, text in-place editing with spec-subset serializer, drag-move with live preview, selection/hover affordances in `PageView`, animation playback.

**Rewrite drivers:**
1. Editing logic is scattered across `PageView` (hover/drag/selection), `Stage` (gestures), `Canvas` (wiring) — adding resize/rotate/multi-select multiplies the tangle.
2. Every edit feature re-plumbs props through `Renderer` → `DeckView` → `PageView`. One `EditorOverlay` component should own ALL pointer interaction; renderers stay dumb.
3. Interaction math (screen↔canvas, scale, snap) needs one home.

---

## Architecture

### Single interaction layer

```
DeckStage
├─ DeckTool            (palette: V/T/R/… shortcuts)
├─ DeckCanvas          (scaled #canvasWrap, renders DeckView + EditorOverlay)
│   ├─ DeckView        (pure render: elements, animations, theme. NO pointer handlers beyond stopPropagation)
│   ├─ EditorOverlay   (absolute inset-0, canvas-coordinate children; owns ALL editor pointer interaction)
│   │   ├─ HoverBox / SelectionBox (outline, 8 resize handles, rotation handle)
│   │   ├─ SnapGuides (smart guides while dragging/resizing)
│   │   └─ TextEditor (existing contentEditable overlay, now a child of overlay)
│   └─ (chart/table live edit popovers)
└─ SlideList / StatusBar
```

- `DeckView` keeps only presentational props. Selection/hover/`onElementMove` props **deleted**; overlay handles hit-testing by computing element boxes itself (data already in ctx).
- Overlay renders in the same scaled coordinate space as the canvas (`width/height` = page size, children positioned in canvas px; parent `#canvasWrap` already scales).

### State

```ts
// ctx additions
type Selection = { ids: string[] } | null        // multi-select foundation
interface EditorState {
  tool: Tool                                    // 'select' | 'text' | 'shape' | 'line' | 'pan'?
  selection: string[]
  editingId: string | null                       // in-place text edit
  // history
  undoStack: Patch[]                             // see Persistence
  redoStack: Patch[]
}
```

- One `EditorState` reducer in Root instead of scattered `useState`s. Commands dispatch intents (`SELECT`, `MOVE`, `RESIZE`, `PATCH_TEXT`, `ADD_ELEMENT`, `DELETE`, `REORDER`, `UNDO`…); reducers produce the immutable `patchProject` calls **and** history entries.

### Persistence (new, do before properties panels)

Currently edits are memory-only; refresh loses them.

- `history.ts`: command pattern. Each command = `{ do: (p) => p, undo: (p) => p, label }`. Root keeps stacks; Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z.
- Autosave: serialize project back to PPTD YAML (use existing types + `js-yaml` dump) → `File System Access API` (`showSaveFilePicker`) when available, else download as zip (folder structure: `.pptd` + `pages/*.page` + `media/`). `media/` for new uploads only; existing media URLs stay untouched.
- Mark dirty state in Shell title/status bar.

---

## Phases

### Phase E1 — Refactor onto EditorOverlay (pure move of existing behavior)
- New `EditorOverlay` owns hover box, selection box, click-to-select, empty-click deselect, drag-move, double-click-to-edit dispatch. `PageView` loses all editor pointer props.
- Selection state moves from `selectedId` to `selection: string[]`; every consumer updated.
- Commands: `MOVE`, `SELECT`, `DESELECT`, `ADD_TEXT` via reducer + history stacks (undo wired from day one — every subsequent phase gets undo for free).
- **Exit:** current behaviors identical; `bun test` + new reducer tests green; present mode & Pptd.tsx embed unaffected (overlay unmounted).

### Phase E2 — Resize + rotate
- 8 handles on SelectionBox (canvas-px aware, `dragScale` division stays). Corner = free resize with Shift = keep ratio; edges = single axis. Rotation handle above box (15° steps with Shift).
- Bounds-only resize for `text/shape/image/icon/table/chart`; `line` scales `viewBox` proportionally (spec: keep `viewBoxW:H = bounds.w:h`).
- Text resize does NOT auto-grow content (spec has no autofit); plain reflow.
- Minimum sizes; drag from handle replaces selection-drag during resize.

### Phase E3 — Element creation tools
- Tool palette grows: rectangle/ellipse/roundRect/arrow/line (R, O, then a shape picker popover listing common `shapeName`s from shapes.md — start with ~12, full 177 later or searchable).
- Drag on empty canvas → live preview box → pointer-up commits element (shape with default `fill` = theme primary; line with 2-point `viewBox`-normalized path).
- Image tool: click → file picker (also paste + drag-drop onto canvas) → uploads into `media/` (blob URL → saved on export; filesystem writes when FSA available) → `Image` element with `fit: cover`.
- Icon tool: search popover (iconify/FA7 free list) → places `Icon` element.
- Double-click on empty canvas → create text at point (Figma behavior), in edit mode.

### Phase E4 — Properties editing
- Floating context panel (right side, or floating toolbar above selection — pick at implementation time based on space) shown when selection non-empty and not editing:
  - text: fontSize, color, bold/italic/underline, align, lineHeight, fontFamily (fonts.md list), backgroundColor
  - shape/line: fill (solid/gradient editor), border (style/width/color), shadow
  - image: fit mode, crop, border, shadow, replace
  - icon: iconName, fill
  - chart/table: data editor (small grid editor; chart = series/data table editor per spec encode rules — biggest single item, can ship read-only first)
  - common: opacity, rotation, layer order (front/back buttons), elementId display
- Rich text: extend `textEdit.ts` serializer to full spec tag set already supported (`<ul>/<ol>/<li>` parsing, `<a href>`, list styles) + a mini inline format toolbar (B/I/U/S, color, font-size) driven by `document.execCommand` or manual `Selection` range surgery → serialize.
- Page properties: background fill editor (solid/gradient/image), notes textarea (speaker notes), pageType label.

### Phase E5 — Element/page management
- Delete/Backspace = delete selection (when not editing text); Ctrl+D duplicate (offset +16,+16); layer reorder shortcuts (`]`/`[`).
- Copy/paste (Ctrl+C/V) internal clipboard; paste external image from OS clipboard → new Image element.
- Drag elements between pages via SlideList (drop on thumbnail).
- Multi-select: Shift+click add/remove, marquee (drag on empty canvas with select tool = marquee, hold to distinguish from click), group move/resize (resize = shared delta only).

### Phase E6 — Undo/history polish + snapping
- Smart guides: while move/resize, align to other elements' edges/centers + page center; show magenta guides, snap within 6 canvas px.
- Optional grid (10px) with toggle.
- Arrow keys nudge 1px (Shift = 10px) when selection non-empty and not editing.
- History UI: undo/redo buttons in toolbar with disabled states.

---

## Non-goals (explicit)

- PPTX export/import — cowork-ppt CLI already does lossless conversion; the editor saves PPTD only.
- Collaborative editing, comments, multiplayer.
- Animation timeline editor (animations render/play; editing the `animations` array can come via a later YAML-ish side panel — not in these phases).
- `distributed` align, LaTeX editing UI (renders fine; edit via text).

## Testing strategy

- Pure logic (reducer, command/undo, snapping math, serializer extensions, viewBox line math) → unit tests like existing `textEdit.test.ts`.
- Interaction (pointer flows) → keep minimal; overlay hit-test box computation is pure → tested.
- Every phase ends: `bun test`, `bunx tsc -b`, existing decks render unchanged in present + embed modes.

## Order rationale

Undo (E1) first so no phase ever ships destructive edits without escape. Resize before creation tools because resize is the highest-value single interaction after move. Creation before properties because empty-canvas → element flows unlock testing property panels on real elements. Chart/table data editors last (E4 tail) since they're the largest isolated chunk and can degrade to read-only.
