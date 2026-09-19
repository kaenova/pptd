// Fill / Border / Shadow → CSS. Shared by every element renderer.
import type { CSSProperties } from 'react'
import type { Border, Fill, ImageFit, Shadow } from '../types'
import { resolveColor } from '../theme'
import type { ThemeCtx } from '../theme'

const pct = (n: number) => `${n * 100}%`

/**
 * Fill → CSS background props. Caller owns positioning (absolute box) and opacity:
 * page backgrounds + shapes can just spread this; for text use `color`/`background` fields instead.
 * ImageFill ignores `opacity` here — callers wrap the box (see PageView) since CSS background can't.
 */
export function fillStyle(f: Fill | undefined, theme: ThemeCtx): CSSProperties {
  switch (f?.type) {
    case 'solid':
      return { background: resolveColor(f.color, theme) }
    case 'gradient': {
      const stops = f.stops.map(s => `${resolveColor(s.color, theme)} ${pct(s.position)}`).join(', ')
      if (f.gradientType === 'radial')
        return { background: `radial-gradient(${stops})` }
      // spec: angle 0 = left→right, clockwise; CSS 0deg = bottom→top, 90deg = left→right ⇒ CSS = spec + 90
      return { background: `linear-gradient(${(f.angle ?? 0) + 90}deg, ${stops})` }
    }
    case 'image': {
      const mode = f.fit?.mode ?? 'cover'
      return {
        backgroundImage: `url("${f.src}")`,
        backgroundSize: mode === 'contain' ? 'contain' : mode === 'fill' ? '100% 100%' : 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    }
    default:
      return {}
  }
}

/** LineStyle → CSS border-style; page-level dashed/dotted borders need explicit style per side. */
function borderCss(b: Border | undefined, theme: ThemeCtx): CSSProperties {
  if (!b) return {}
  const width = b.width ?? 1
  const style = b.style === 'dash' ? 'dashed' : b.style === 'dot' ? 'dotted' : 'solid'
  const color = resolveColor(b.color, theme) ?? '#000000'
  return { border: `${width}px ${style} ${color}` }
}

/** Element border (uniform Border). Table BorderSpec (per-side arrays) is handled by Table (phase 4). */
export function borderStyle(b: Border | undefined, theme: ThemeCtx): CSSProperties {
  return borderCss(b, theme)
}

/** Shadow → box-shadow. */
export function shadowStyle(s: Shadow | undefined, theme: ThemeCtx): CSSProperties {
  if (!s) return {}
  const [x, y] = s.offset ?? [0, 0]
  return { boxShadow: `${x}px ${y}px ${s.blur}px ${resolveColor(s.color, theme)}` }
}

/** Merge fill+border+shadow for element-style boxes (shape, image wrapper). */
export function boxStyle(
  f: Fill | undefined,
  b: Border | undefined,
  s: Shadow | undefined,
  theme: ThemeCtx,
): CSSProperties {
  return { ...fillStyle(f, theme), ...borderStyle(b, theme), ...shadowStyle(s, theme) }
}

export const imageFitProps = (fit: ImageFit | undefined) =>
  fit?.mode === 'contain' ? 'contain' : fit?.mode === 'fill' ? 'fill' : 'cover'
