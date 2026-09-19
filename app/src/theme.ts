// Theme $ref resolution + text style defaults (spec §1 "Style Priority and Default Values").
// A theme ctx travels down the render tree via React context; elements read it in `resolve()`.
import { createContext, useContext } from 'react'
import type { CSSProperties } from 'react'
import type { Color, FontFamily, TextContent, TextStyleConfig, Theme } from './types'

export interface ThemeCtx {
  colors: Record<string, Color>
  textStyles: Record<string, TextStyleConfig>
  tableStyles: Record<string, unknown>
}

export const emptyTheme: ThemeCtx = { colors: {}, textStyles: {}, tableStyles: {} }
export const ThemeContext = createContext<ThemeCtx>(emptyTheme)
export const useTheme = () => useContext(ThemeContext)

export function themeCtx(t?: Theme): ThemeCtx {
  return {
    colors: t?.colors ?? {},
    textStyles: t?.textStyles ?? {},
    tableStyles: (t?.tableStyles ?? {}) as Record<string, unknown>,
  }
}

/** "$primary" → "#FF6900"; non-refs pass through. Unknown refs → magenta so misses are visible. */
export function resolveColor(c: Color | undefined, theme: ThemeCtx): Color | undefined {
  if (c === undefined) return undefined
  if (!c.startsWith('$')) return c
  return theme.colors[c.slice(1)] ?? '#FF00FF'
}

/** fontFamily: string | {latin, ea} → CSS font-family (ea first: CJK glyphs resolve from ea, latin from latin). */
export function resolveFontFamily(ff: FontFamily | undefined): string | undefined {
  if (ff === undefined) return undefined
  if (typeof ff === 'string') return ff
  return `${ff.ea}, ${ff.latin}`
}

/** Defaults per spec §1 text style table. */
export const textDefaults = {
  color: '#000000',
  fontSize: 18,
  fontFamily: 'MiSans',
  bold: false,
  italic: false,
  lineHeight: 1,
  letterSpacing: 0,
  marginTop: 0,
} as const

/**
 * Merge a TextContent's effective style: content fields beat the theme style they reference.
 * Priority (spec §1.1): content direct fields > theme textStyle > defaults.
 */
export function resolveTextStyle(c: TextContent, theme: ThemeCtx): Required<
  Pick<TextStyleConfig, 'color' | 'fontSize' | 'bold' | 'italic' | 'letterSpacing' | 'marginTop'>
> & { fontFamily: string; lineHeight: number; lineHeightPx?: number } {
  const ts: TextStyleConfig = c.style ? (theme.textStyles[c.style.replace(/^\$/, '')] ?? {}) : {}
  const pick = <K extends keyof TextStyleConfig>(k: K): TextStyleConfig[K] =>
    (c[k] ?? ts[k]) as TextStyleConfig[K]
  const color = pick('color') ?? textDefaults.color
  return {
    color: color.startsWith('$') ? (theme.colors[color.slice(1)] ?? '#FF00FF') : color,
    fontSize: pick('fontSize') ?? textDefaults.fontSize,
    fontFamily: resolveFontFamily(pick('fontFamily')) ?? textDefaults.fontFamily,
    bold: pick('bold') ?? textDefaults.bold,
    italic: pick('italic') ?? textDefaults.italic,
    letterSpacing: pick('letterSpacing') ?? textDefaults.letterSpacing,
    marginTop: pick('marginTop') ?? textDefaults.marginTop,
    lineHeight: c.lineHeight ?? ts.lineHeight ?? textDefaults.lineHeight,
    lineHeightPx: c.lineHeightPx ?? ts.lineHeightPx,
  }
}

/** Text element CSS from resolved content style. Rich-text/inline span styles layer on top in RichText. */
export function textStyleProps(c: TextContent, theme: ThemeCtx): CSSProperties {
  const s = resolveTextStyle(c, theme)
  const [ha, va] = c.align ?? []
  return {
    fontSize: s.fontSize,
    fontFamily: s.fontFamily,
    color: s.color,
    fontWeight: s.bold ? 700 : undefined,
    fontStyle: s.italic ? 'italic' : undefined,
    letterSpacing: s.letterSpacing || undefined,
    lineHeight: s.lineHeightPx != null ? `${s.lineHeightPx}px` : s.lineHeight,
    marginTop: s.marginTop || undefined,
    backgroundColor: c.backgroundColor
      ? resolveColor(c.backgroundColor, theme)
      : undefined,
    textAlign: ha === 'center' ? 'center' : ha === 'right' ? 'right' : ha === 'justify' ? 'justify' : ha === 'distributed' ? 'justify' : undefined,
    // vertical align: middle/bottom via flex on the box
    display: va === 'middle' || va === 'bottom' ? 'flex' : undefined,
    flexDirection: 'column',
    justifyContent: va === 'middle' ? 'center' : va === 'bottom' ? 'flex-end' : undefined,
  }
}
