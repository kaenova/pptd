// PPTD v2 format types — subset needed for rendering. Spec: skills/cowork-ppt/reference/pptd.md
// ponytail: extend per phase, don't spec-dump. Phase 2 adds Border/Shadow/fontFamily/theme/customFonts.

// ---------- Table (Phase 4) ----------

export interface CellStyle {
  color?: Color
  fontSize?: number
  fontFamily?: FontFamily
  bold?: boolean
  italic?: boolean
  backgroundColor?: Color
  lineHeight?: number
  lineHeightPx?: number
  letterSpacing?: number
  marginTop?: number
  fill?: Fill
  border?: BorderSpec
  align?: Alignment
}

export interface TableStyleConfig {
  cellStyle?: CellStyle
  firstRowStyle?: CellStyle
  lastRowStyle?: CellStyle
  firstColumnStyle?: CellStyle
  lastColumnStyle?: CellStyle
  bodyStyles?: CellStyle[]
  rowOverColumn?: boolean
}

/** null clears all four sides; [tb, lr]; [t, r, b, l] clockwise */
export type BorderSpec = null | Border | [Border | null, Border | null] | [Border | null, Border | null, Border | null, Border | null]

export type Alignment = [string, string] // [horizontal, vertical]

/** dji-deck legacy cell shape: {content: {text, align}} — normalized to text/align */
export interface Cell {
  text?: string
  content?: { text?: string; align?: Alignment }
  textStyle?: string
  color?: Color
  fontSize?: number
  fontFamily?: FontFamily
  bold?: boolean
  italic?: boolean
  backgroundColor?: Color
  lineHeight?: number
  lineHeightPx?: number
  letterSpacing?: number
  marginTop?: number
  fill?: Fill
  border?: BorderSpec
  align?: Alignment
  rowSpan?: number
  colSpan?: number
}

export interface TableElement extends ElementBase {
  elementType: 'table'
  columnWidths: number[]
  rowHeights: number[]
  rows: Cell[][]
  style?: string | TableStyleConfig
  fill?: Fill
  shadow?: Shadow
}

/** "#RRGGBB" | "#RRGGBBAA" | "$themeRef" */
export type Color = string

export type FontFamily = string | { latin: string; ea: string }

export type LineStyle = 'solid' | 'dash' | 'dot'

export interface Border {
  style?: LineStyle // default "solid"
  width?: number // default 1
  color?: Color // default "#000000"
}

export interface Shadow {
  blur: number
  color: Color
  offset?: [number, number] // default [0,0]
}

export interface SolidFill { type: 'solid'; color: Color }
export interface GradientStop { position: number; color: Color }
export interface GradientFill {
  type: 'gradient'
  gradientType: 'linear' | 'radial'
  angle?: number // degrees, 0 = left→right, clockwise; default 0
  stops: GradientStop[]
}
export interface ImageFill { type: 'image'; src: string; fit?: ImageFit; opacity?: number }
export interface ImageFit { mode: 'cover' | 'contain' | 'fill' }
export type Fill = SolidFill | GradientFill | ImageFill

export interface ElementBase {
  elementId: string
  elementType: 'text' | 'shape' | 'line' | 'image' | 'icon' | 'table' | 'chart'
  bounds: [number, number, number, number] // [x, y, w, h] px, origin top-left
}

export interface TextContent {
  style?: string // $ref into theme.textStyles
  fontSize?: number
  fontFamily?: FontFamily
  color?: Color
  bold?: boolean
  italic?: boolean
  backgroundColor?: Color
  letterSpacing?: number
  lineHeight?: number
  lineHeightPx?: number
  marginTop?: number
  align?: [string, string] // [h, v]
  textDirection?: 'horizontal' | 'vertical'
  wrap?: boolean
  gradient?: GradientFill // applied to the text itself
  shadow?: Shadow
  text: string
}

export interface TextElement extends ElementBase {
  elementType: 'text'
  content: TextContent
}

export interface ShapeElement extends ElementBase {
  elementType: 'shape'
  shapeName: string
  rotation?: number // degrees, clockwise
  opacity?: number
  flip?: [boolean, boolean] // [horizontal, vertical]
  adjustments?: number[]
  viewBox?: [number, number] // shapeName=custom only
  path?: string // shapeName=custom only
  fill?: Fill
  border?: Border
  shadow?: Shadow
}

export type ArrowType = 'arrow' | 'stealth' | 'diamond' | 'oval'

export interface ShapeDef {
  shapeName: string
  adjustments?: number[]
  viewBox?: [number, number]
  path?: string
}

export interface LineElement extends ElementBase {
  elementType: 'line'
  rotation?: number
  opacity?: number
  flip?: [boolean, boolean]
  viewBox: [number, number]
  points: string // "x1,y1 x2,y2 ..."; first/last anchors, middle bezier controls
  curve?: 'sharp' | 'round' | 'smooth' // default round
  arrow?: [ArrowType | null, ArrowType | null]
  border?: Border
  shadow?: Shadow
}

export interface ImageElement extends ElementBase {
  elementType: 'image'
  src: string
  rotation?: number
  flip?: [boolean, boolean]
  cropShape?: ShapeDef
  crop?: { left?: number; top?: number; right?: number; bottom?: number } // source fractions, +/-
  fit?: ImageFit
  opacity?: number
  border?: Border
  shadow?: Shadow
}

export interface ChartElement extends ElementBase {
  elementType: 'chart'
  data: Record<string, unknown>
  series: Record<string, unknown>[]
  seriesDefaults?: Record<string, unknown>
  xAxis?: unknown
  yAxis?: unknown
  barWidth?: number
  barGap?: number
  categoryGap?: number
  spokeAxis?: Record<string, unknown>
  title?: string | Record<string, unknown>
  legend?: boolean | Record<string, unknown>
  dataLabels?: Record<string, unknown>
  fontFamily?: FontFamily
  fill?: Fill
  border?: Border
  shadow?: Shadow
}

export interface IconElement extends ElementBase {
  elementType: 'icon'
  rotation?: number
  opacity?: number
  flip?: [boolean, boolean]
  iconName: string // "fas:house"
  fill?: Fill
  border?: Border
  shadow?: Shadow
}

export type Element = TextElement | ShapeElement | LineElement | ImageElement | IconElement | TableElement | ChartElement

export interface Page {
  pageType?: string
  background?: Fill
  notes?: string
  elements: Element[]
  animations?: import('./anim').Animation[]
}

export interface TextStyleConfig {
  color?: Color
  fontSize?: number
  fontFamily?: FontFamily
  bold?: boolean
  italic?: boolean
  backgroundColor?: Color
  lineHeight?: number
  lineHeightPx?: number
  letterSpacing?: number
  marginTop?: number
}

export interface Theme {
  colors?: Record<string, Color>
  textStyles?: Record<string, TextStyleConfig>
  tableStyles?: Record<string, unknown> // resolved in phase 4 (TableStyleConfig)
}

export interface CustomFont {
  family: string
  src: string // Google Fonts CSS URL
}

export interface Presentation {
  version: 'v2'
  title?: string
  size: [number, number]
  theme?: Theme
  customFonts?: CustomFont[]
  pages: string[]
}

export interface LoadedProject {
  title: string
  size: [number, number]
  theme?: Theme
  customFonts?: CustomFont[]
  pages: Page[]
  media?: string[] // image assets in the deck, for the file explorer/preview
  pagePaths?: string[] // storage paths of pages, parallel to pages
  pptdPath?: string // e.g. "yu7.pptd"; QA mode derives soffice reference PNG dir from its stem
}
