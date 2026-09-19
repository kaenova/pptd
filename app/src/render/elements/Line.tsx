import type { LineElement } from '../../types'
import { useTheme } from '../../theme'
import { strokeAttrs, shadowFilter } from './Shape'
import { fx } from './fx'

/** Points string → SVG path. First/last = anchors; middle = bezier controls (spec).
 * smooth = Catmull-Rom through all points; sharp/round = polyline (join style differs). */
export function linePath(points: string, curve: string | undefined): string {
  const pts = points
    .trim()
    .split(/\s+/)
    .map(p => p.split(',').map(Number) as [number, number])
  if (pts.length < 2) return ''
  if (pts.length === 2 || curve === 'sharp' || curve === 'round')
    return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ')
  // Catmull-Rom → cubic bezier (uniform, tension 1/6)
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`
  }
  return d
}

function marker(el: LineElement, color: string, which: 0 | 1): React.ReactNode | undefined {
  const type = el.arrow?.[which]
  if (!type) return undefined
  const id = `${el.elementId}-m${which}`
  // 5×strokeWidth viewport (PowerPoint-like); content drawn in a 10×10 box, scaled 0.5 via viewBox
  const common = { markerUnits: 'strokeWidth', markerWidth: 5, markerHeight: 5, viewBox: '0 0 10 10', refX: which === 0 ? 10 : 0, refY: 5, orient: which === 0 ? 'auto-start-reverse' : 'auto' }
  let body: React.ReactNode
  switch (type) {
    case 'arrow':
      body = <path d="M0,0 L10,5 L0,10" fill="none" stroke={color} strokeWidth={2} />
      break
    case 'stealth':
      body = <path d="M0,0 L12,5 L0,10 L4,5 Z" fill={color} />
      break
    case 'diamond':
      body = <path d="M0,5 L5,0 L10,5 L5,10 Z" fill={color} />
      break
    case 'oval':
      body = <circle cx={5} cy={5} r={5} fill={color} />
      break
  }
  return (
    <marker id={id} {...common}>
      {body}
    </marker>
  )
}

export function LineBox(el: LineElement) {
  const theme = useTheme()
  const stroke = strokeAttrs(el.border, theme)
  const color = stroke.stroke ?? '#000000'
  const [vw, vh] = el.viewBox
  return (
    <div className="el" data-id={el.elementId} style={{ position: 'absolute', left: el.bounds[0], top: el.bounds[1], width: el.bounds[2], height: el.bounds[3], ...fx(el), pointerEvents: 'none' }}>
      <svg
        viewBox={`0 0 ${vw} ${vh}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', filter: shadowFilter(el.shadow, theme) }}
      >
        <defs>
          {marker(el, color, 0)}
          {marker(el, color, 1)}
        </defs>
        <path
          d={linePath(el.points, el.curve)}
          fill="none"
          {...stroke}
          strokeLinejoin={el.curve === 'sharp' ? 'miter' : 'round'}
          markerStart={el.arrow?.[0] ? `url(#${el.elementId}-m0)` : undefined}
          markerEnd={el.arrow?.[1] ? `url(#${el.elementId}-m1)` : undefined}
          // stroke width stays constant even when viewBox is stretched to a very flat bounds (all example lines: 840×1)
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}
