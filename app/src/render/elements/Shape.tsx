import type { CSSProperties } from 'react'
import type { Border, Fill, GradientFill, Shadow, ShapeElement } from '../../types'
import { useTheme } from '../../theme'
import type { ThemeCtx } from '../../theme'
import { resolveShapeDef } from './geometry'
import { fx } from './fx'

/** Fill → SVG paint. Gradient def id must be unique per element. */
export function svgFill(fill: Fill | undefined, theme: ThemeCtx, id: string): { attr: string | undefined; defs?: React.ReactNode } {
  if (!fill || fill.type === 'image')
    return { attr: fill?.type === 'image' ? undefined : undefined } // ponytail: image fill on shapes → none; add SVG pattern when a deck uses it
  if (fill.type === 'solid') return { attr: resolveColor(fill.color, theme) }
  const g = fill as GradientFill
  const stops = g.stops.map((s, i) => <stop key={i} offset={`${s.position * 100}%`} stopColor={resolveColor(s.color, theme)} />)
  if (g.gradientType === 'radial')
    return {
      attr: `url(#${id})`,
      defs: (
        <radialGradient id={id}>
          {stops}
        </radialGradient>
      ),
    }
  // spec angle 0 = left→right (CSS 90deg); CSS dir = (sinθ, −cosθ) in y-down bbox space
  const t = (((g.angle ?? 0) + 90) * Math.PI) / 180
  const dx = Math.sin(t) / 2, dy = -Math.cos(t) / 2
  return {
    attr: `url(#${id})`,
    defs: (
      <linearGradient id={id} x1={0.5 - dx} y1={0.5 - dy} x2={0.5 + dx} y2={0.5 + dy}>
        {stops}
      </linearGradient>
    ),
  }
}

function resolveColor(c: string, theme: ThemeCtx): string {
  return c.startsWith('$') ? (theme.colors[c.slice(1)] ?? '#FF00FF') : c
}

export function strokeAttrs(b: Border | undefined, theme: ThemeCtx): { stroke?: string; strokeWidth?: number; strokeDasharray?: string; strokeLinecap?: 'round' } {
  if (!b) return {}
  return {
    stroke: resolveColor(b.color ?? '#000000', theme),
    strokeWidth: b.width ?? 1,
    strokeDasharray: b.style === 'dot' ? '0.1 4' : b.style === 'dash' ? '8 5' : undefined,
    strokeLinecap: b.style === 'dot' ? 'round' : undefined,
  }
}

export function shadowFilter(s: Shadow | undefined, theme: ThemeCtx): string | undefined {
  if (!s) return undefined
  const [x, y] = s.offset ?? [0, 0]
  return `drop-shadow(${x}px ${y}px ${s.blur}px ${resolveColor(s.color, theme)})`
}

export function ShapeBox(el: ShapeElement) {
  const theme = useTheme()
  const [w, h] = [el.bounds[2], el.bounds[3]]
  const geom = resolveShapeDef(el, w, h)
  // custom shapes: path lives in the user-supplied viewBox, stretched to bounds (spec)
  const [vw, vh] = el.shapeName === 'custom' ? (el.viewBox ?? [w, h]) : [w, h]
  const fill = svgFill(el.fill, theme, `fill-${el.elementId}`)
  const svgStyle: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }
  return (
    <div className="absolute" data-id={el.elementId} style={{ position: 'absolute', left: el.bounds[0], top: el.bounds[1], width: w, height: h, ...fx(el), pointerEvents: 'none' }}>
      <svg viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none" style={svgStyle}>
        {fill.defs}
        <path
          d={geom.d}
          fillRule={geom.fillRule}
          fill={fill.attr}
          {...strokeAttrs(el.border, theme)}
          strokeLinejoin="round"
          filter={shadowFilter(el.shadow, theme)}
        />
      </svg>
    </div>
  )
}
