import type { CSSProperties, ReactNode } from 'react'
import type { Border, BorderSpec, Cell, CellStyle, Fill, TableElement, TableStyleConfig } from '../../types'
import { RichText } from '../RichText'
import { fillStyle } from '../Fill'
import { resolveColor, useTheme, type ThemeCtx } from '../../theme'
import { boxStyle } from '../Fill'

// ---------- pure resolution logic (mirrors scripts/pptd_utils/tables.py) ----------

export interface GridCell {
  r: number
  c: number
  rowSpan: number
  colSpan: number
  cell: Cell
}

/** Normalize dji-legacy `content:{text,align}` into top-level text/align. */
export function normCell(cell: Cell): Cell {
  if (cell.content) {
    const { text, align } = cell.content
    return { ...cell, text: cell.text ?? text, align: cell.align ?? align, content: undefined }
  }
  return cell
}

/**
 * Walk rows, skipping positions occupied by earlier row/col spans
 * (spec: covered cells are omitted from the rows array, no null placeholders).
 */
export function buildGrid(rows: Cell[][]): { cells: GridCell[]; nrows: number; ncols: number } {
  const occupied = new Set<string>()
  const cells: GridCell[] = []
  let nrows = 0
  let maxCol = 0
  let r = 0
  for (const row of rows) {
    let c = 0
    for (const raw of row) {
      while (occupied.has(`${r},${c}`)) c++
      const cell = normCell(raw)
      const rs = cell.rowSpan || 1
      const cs = cell.colSpan || 1
      cells.push({ r, c, rowSpan: rs, colSpan: cs, cell })
      for (let dr = 0; dr < rs; dr++)
        for (let dc = 0; dc < cs; dc++) if (dr || dc) occupied.add(`${r + dr},${c + dc}`)
      maxCol = Math.max(maxCol, c + cs)
      c += cs
    }
    nrows = Math.max(nrows, r + 1)
    r++
  }
  // rows can be extended by spans reaching past the last declared row
  for (const k of occupied) {
    const [rr] = k.split(',').map(Number)
    nrows = Math.max(nrows, rr + 1)
  }
  return { cells, nrows, ncols: maxCol }
}

const TEXT_KEYS = ['color', 'fontSize', 'fontFamily', 'bold', 'italic', 'backgroundColor', 'lineHeight', 'lineHeightPx', 'letterSpacing', 'marginTop'] as const
const LAYOUT_KEYS = ['fill', 'border', 'align'] as const
type StyleKeys = (typeof TEXT_KEYS)[number] | (typeof LAYOUT_KEYS)[number]

type Flat = Partial<Record<StyleKeys, unknown>> & { fill?: Fill | null; border?: BorderSpec }

function mergeKeys(dst: Flat, src: unknown, keys: readonly string[]) {
  if (!src || typeof src !== 'object') return
  const o = src as Record<string, unknown>
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null) (dst as Record<string, unknown>)[k] = o[k]
  }
}

/** dji-deck legacy style keys → spec TableStyleConfig fields (ponytail: drop when deck regenerates on spec v2). */
export function normalizeTableStyle(style: TableStyleConfig): TableStyleConfig {
  const out: TableStyleConfig = { ...style }
  const legacy: Record<string, unknown> = {}
  const s = style as Record<string, unknown>
  for (const [from, to] of [
    ['fontSize', 'fontSize'],
    ['bodyColor', 'color'],
  ] as const) {
    if (s[from] !== undefined) legacy[to] = s[from]
  }
  if (s.border !== undefined) legacy.border = s.border
  if (Object.keys(legacy).length) out.cellStyle = { ...(legacy as CellStyle), ...style.cellStyle }
  return out
}

/** Legacy convenience: headerBold only touches first row; firstColumnColor only first column. */
function applyLegacyCategories(cfg: TableStyleConfig): TableStyleConfig {
  const s = cfg as Record<string, unknown>
  const cat: TableStyleConfig = { ...cfg }
  if (s.headerBold !== undefined) cat.firstRowStyle = { bold: s.headerBold as boolean, ...cfg.firstRowStyle }
  if (s.firstColumnColor !== undefined) cat.firstColumnStyle = { color: s.firstColumnColor as string, ...cfg.firstColumnStyle }
  return cat
}

const UNSET = Symbol('unset')

function normBorderSpec(spec: BorderSpec): Record<'t' | 'r' | 'b' | 'l', Border | null> | null {
  if (spec === null) return { t: null, r: null, b: null, l: null }
  if (Array.isArray(spec)) {
    const arr = spec as unknown[]
    if (arr.length === 2) {
      const [tb, lr] = arr
      return { t: tb as Border | null, b: tb as Border | null, l: lr as Border | null, r: lr as Border | null }
    }
    if (arr.length === 3) {
      // dji-deck legacy 3-form [t, lr, b] (ponytail: converter rejects it; drop when deck regenerates)
      const [t, lr, b] = arr
      return { t: t as Border | null, b: b as Border | null, l: lr as Border | null, r: lr as Border | null }
    }
    const [t, r, b, l] = arr
    return { t: t as Border | null, r: r as Border | null, b: b as Border | null, l: l as Border | null }
  }
  return { t: spec, r: spec, b: spec, l: spec }
}

/** Per-side border chain: cell > category(rowOverColumn) > bodyStyles > cellStyle; explicit null clears. */
export function resolveCellBorders(
  r: number,
  c: number,
  nrows: number,
  ncols: number,
  cfg: TableStyleConfig,
  cell: Cell,
): { t: Border | null; r: Border | null; b: Border | null; l: Border | null } {
  const specs: unknown[] = [cell.border ?? UNSET]
  const rowStyle = r === 0 ? cfg.firstRowStyle : r === nrows - 1 && nrows > 1 ? cfg.lastRowStyle : undefined
  const colStyle = c === 0 ? cfg.firstColumnStyle : c === ncols - 1 && ncols > 1 ? cfg.lastColumnStyle : undefined
  const rowWins = cfg.rowOverColumn !== false
  const loser = rowWins ? colStyle : rowStyle
  const winner = rowWins ? rowStyle : colStyle
  if (loser) specs.push(loser.border ?? UNSET)
  if (winner) specs.push(winner.border ?? UNSET)
  const body = cfg.bodyStyles
  if (body && r !== 0 && r !== nrows - 1) {
    const di = nrows > 2 ? r - 1 : r
    specs.push(body[di % body.length]?.border ?? UNSET)
  }
  if (cfg.cellStyle) specs.push(cfg.cellStyle.border ?? UNSET)

  const resolved: Record<string, Border | null> = {}
  for (const spec of specs) {
    if (spec === UNSET) continue
    const norm = normBorderSpec(spec as BorderSpec)
    for (const side of ['t', 'r', 'b', 'l'] as const) if (!(side in resolved)) resolved[side] = norm![side]
  }
  const out: Record<string, Border | null> = {}
  for (const side of ['t', 'r', 'b', 'l'] as const) {
    const v = resolved[side]
    out[side] = v === undefined ? { style: 'solid', width: 1, color: '#000000' } : v === null ? null : v
  }
  return out as { t: Border | null; r: Border | null; b: Border | null; l: Border | null }
}

/** Full cell style chain → flat style dict + per-side borders. */
export function resolveCellStyle(
  r: number,
  c: number,
  nrows: number,
  ncols: number,
  cfg: TableStyleConfig,
  cell: Cell,
  theme: ThemeCtx,
  tableFill: Fill | undefined,
): { flat: Flat; borders: ReturnType<typeof resolveCellBorders> } {
  const flat: Flat = {
    color: '#000000',
    fontSize: 14,
    fontFamily: 'MiSans',
    bold: false,
    italic: false,
    lineHeight: 1,
    letterSpacing: 0,
    marginTop: 0,
    fill: undefined,
    align: ['center', 'middle'],
  }
  mergeKeys(flat, cfg.cellStyle, [...TEXT_KEYS, ...LAYOUT_KEYS])
  const body = cfg.bodyStyles
  if (body && r !== 0 && r !== nrows - 1) {
    const di = nrows > 2 ? r - 1 : r
    mergeKeys(flat, body[di % body.length], [...TEXT_KEYS, ...LAYOUT_KEYS])
  }
  const rowStyle = r === 0 ? cfg.firstRowStyle : r === nrows - 1 && nrows > 1 ? cfg.lastRowStyle : undefined
  const colStyle = c === 0 ? cfg.firstColumnStyle : c === ncols - 1 && ncols > 1 ? cfg.lastColumnStyle : undefined
  const rowWins = cfg.rowOverColumn !== false
  mergeKeys(flat, rowWins ? colStyle : rowStyle, [...TEXT_KEYS, ...LAYOUT_KEYS])
  mergeKeys(flat, rowWins ? rowStyle : colStyle, [...TEXT_KEYS, ...LAYOUT_KEYS])
  if (cell.textStyle) {
    const ref = theme.textStyles[String(cell.textStyle).replace(/^\$/, '')] as Record<string, unknown> | undefined
    mergeKeys(flat, ref, TEXT_KEYS)
  }
  mergeKeys(flat, cell as Record<string, unknown>, [...TEXT_KEYS, ...LAYOUT_KEYS])
  if (flat.fill === undefined && tableFill !== undefined) flat.fill = tableFill
  return { flat, borders: resolveCellBorders(r, c, nrows, ncols, cfg, cell) }
}

// ---------- component ----------

export function TableBox({ el }: { el: TableElement }): ReactNode {
  const theme = useTheme()
  const [, , w, h] = el.bounds
  const { cells, nrows, ncols } = buildGrid(el.rows)
  let cfg: TableStyleConfig = {}
  if (el.style) {
    cfg = typeof el.style === 'string' ? ((theme.tableStyles[String(el.style).replace(/^\$/, '')] as TableStyleConfig) ?? {}) : el.style
    cfg = normalizeTableStyle(cfg)
    cfg = applyLegacyCategories(cfg)
  }
  const colX: number[] = [0]
  const cols = el.columnWidths.length ? el.columnWidths : Array(ncols).fill(1 / Math.max(1, ncols))
  for (let i = 0; i < ncols; i++) colX.push(colX[i] + (cols[i] ?? 0) * w)
  const rowY: number[] = [0]
  const rh = el.rowHeights.length ? el.rowHeights : Array(nrows).fill(1 / Math.max(1, nrows))
  for (let i = 0; i < nrows; i++) rowY.push(rowY[i] + (rh[i] ?? 0) * h)

  return (
    <div className="el table" data-id={el.elementId} style={{ position: 'absolute', left: el.bounds[0], top: el.bounds[1], width: w, height: h, ...boxStyle(undefined, undefined, el.shadow, theme) }}>
      {cells.map((g) => {
        const { flat, borders } = resolveCellStyle(g.r, g.c, nrows, ncols, cfg, g.cell, theme, el.fill)
        const cellStyle: CSSProperties = {
          position: 'absolute',
          left: colX[g.c],
          top: rowY[g.r],
          width: colX[g.c + g.colSpan] - colX[g.c],
          height: rowY[g.r + g.rowSpan] - rowY[g.r],
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: ({ top: 'flex-start', middle: 'center', bottom: 'flex-end' } as Record<string, string>)[(flat.align as string[])?.[1] ?? 'middle'],
          padding: '4px 9.6px',
          boxSizing: 'border-box',
        }
        if (flat.fill) Object.assign(cellStyle, fillStyle(flat.fill, theme))
        const sideCss: Record<string, string> = { t: 'Top', r: 'Right', b: 'Bottom', l: 'Left' }
        for (const side of ['t', 'r', 'b', 'l'] as const) {
          const b = borders[side]
          if (!b) continue
          cellStyle[`border${sideCss[side]}` as keyof CSSProperties] = `${b.width ?? 1}px ${b.style ?? 'solid'} ${resolveColor(b.color, theme)}` as never
        }
        const text = g.cell.text ?? ''
        return (
          <div key={`${g.r},${g.c}`} style={cellStyle}>
            <RichText
              content={{
                text,
                color: flat.color as string | undefined,
                fontSize: flat.fontSize as number | undefined,
                fontFamily: flat.fontFamily as string | undefined,
                bold: flat.bold as boolean | undefined,
                italic: flat.italic as boolean | undefined,
                backgroundColor: flat.backgroundColor as string | undefined,
                lineHeight: flat.lineHeight as number | undefined,
                lineHeightPx: flat.lineHeightPx as number | undefined,
                letterSpacing: flat.letterSpacing as number | undefined,
                marginTop: flat.marginTop as number | undefined,
                align: flat.align as [string, string] | undefined,
              }}
              base={{ textAlign: (flat.align as string[])?.[0] ?? 'center' } as CSSProperties}
            />
          </div>
        )
      })}
    </div>
  )
}
