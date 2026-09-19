// Shape geometry: shapeName + adjustments → SVG path d (in 0,0,w,h space).
// Adjustments are OOXML-style [0,100000] fractions. Exact PowerPoint formulas are only
// approximated for uncommon shapes — the example decks use rect/roundRect/ellipse only.
// ponytail: presets cover the "common shapes" table (pptd.md) + a few trivial polygons;
// add more (pie/arc/chord/bracePair angle math) when a real deck needs them.
export interface ShapeGeom {
  d: string
  fillRule?: 'evenodd' // hollow shapes (donut, custom with reversed inner contour)
}

const A = 100000
const adj = (a: number[] | undefined, i: number, dflt: number) => (a?.[i] ?? dflt) / A

function poly(pts: [number, number][]): string {
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${r(x)},${r(y)}`).join(' ') + ' Z'
}
const r = (n: number) => Math.round(n * 100) / 100

/** Regular n-gon (point-up), fit inside w×h. */
function ngon(n: number, w: number, h: number, rotDeg = -90): string {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = ((rotDeg + (360 / n) * i) * Math.PI) / 180
    pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)])
  }
  return poly(pts)
}

function star(n: number, innerRatio: number, w: number, h: number): string {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2
  const pts: [number, number][] = []
  for (let i = 0; i < 2 * n; i++) {
    const rad = i % 2 ? R * innerRatio : R
    const a = ((-90 + (360 / (2 * n)) * i) * Math.PI) / 180
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)])
  }
  return poly(pts)
}

function circle(cx: number, cy: number, rad: number, cw = true): string {
  const s = cw ? 1 : 0
  return `M${r(cx - rad)},${r(cy)} A${r(rad)},${r(rad)} 0 1 ${s} ${r(cx + rad)},${r(cy)} A${r(rad)},${r(rad)} 0 1 ${s} ${r(cx - rad)},${r(cy)} Z`
}

export function shapeGeom(shapeName: string, w: number, h: number, adjustments?: number[]): ShapeGeom {
  const a = adjustments
  switch (shapeName) {
    case 'rect':
      return { d: `M0,0 H${r(w)} V${r(h)} H0 Z` }
    case 'roundRect': {
      const rad = Math.min(w, h) * Math.min(adj(a, 0, 16667), 0.5)
      const rr = r(rad)
      return { d: `M${rr},0 H${r(w - rad)} A${rr},${rr} 0 0 1 ${r(w)},${rr} V${r(h - rad)} A${rr},${rr} 0 0 1 ${r(w - rad)},${r(h)} H${rr} A${rr},${rr} 0 0 1 0,${r(h - rad)} V${rr} A${rr},${rr} 0 0 1 ${rr},0 Z` }
    }
    case 'ellipse':
      return { d: `M0,${r(h / 2)} A${r(w / 2)},${r(h / 2)} 0 1 1 ${r(w)},${r(h / 2)} A${r(w / 2)},${r(h / 2)} 0 1 1 0,${r(h / 2)} Z` }
    case 'triangle': {
      const apex = w * adj(a, 0, 50000)
      return { d: poly([[apex, 0], [w, h], [0, h]]) }
    }
    case 'rtTriangle':
      return { d: poly([[0, 0], [0, h], [w, h]]) }
    case 'diamond':
      return { d: poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]) }
    case 'parallelogram': {
      const dx = Math.min(h * adj(a, 0, 25000), w / 2)
      return { d: poly([[dx, 0], [w, 0], [w - dx, h], [0, h]]) }
    }
    case 'trapezoid': {
      const dx = Math.min((w * adj(a, 0, 25000)) / 2, w / 2)
      return { d: poly([[dx, 0], [w - dx, 0], [w, h], [0, h]]) }
    }
    case 'pentagon':
      return { d: ngon(5, w, h) }
    case 'hexagon': {
      const dx = (w * adj(a, 0, 25000)) / 2
      return { d: poly([[dx, 0], [w - dx, 0], [w, h / 2], [w - dx, h], [dx, h], [0, h / 2]]) }
    }
    case 'octagon': {
      const c = (Math.min(w, h) * adj(a, 0, 29289)) / 2
      return { d: poly([[c, 0], [w - c, 0], [w, c], [w, h - c], [w - c, h], [c, h], [0, h - c], [0, c]]) }
    }
    case 'plus': {
      const t = Math.min((Math.min(w, h) * adj(a, 0, 25000)) / 2, Math.min(w, h) / 2)
      return { d: poly([[w / 2 - t, 0], [w / 2 + t, 0], [w / 2 + t, h / 2 - t], [w, h / 2 - t], [w, h / 2 + t], [w / 2 + t, h / 2 + t], [w / 2 + t, h], [w / 2 - t, h], [w / 2 - t, h / 2 + t], [0, h / 2 + t], [0, h / 2 - t], [w / 2 - t, h / 2 - t]]) }
    }
    case 'homePlate': {
      const dx = Math.min(Math.min(w, h) * adj(a, 0, 50000), w)
      return { d: poly([[0, 0], [w - dx, 0], [w, h / 2], [w - dx, h], [0, h]]) }
    }
    case 'chevron': {
      const dx = Math.min(Math.min(w, h) * adj(a, 0, 50000), w / 2)
      return { d: poly([[0, 0], [w - dx, 0], [w, h / 2], [w - dx, h], [0, h], [dx, h / 2]]) }
    }
    case 'donut': {
      // ring width = min(w,h) × adj/100000; hole radius = outer − ring
      const ring = Math.min(w, h) * adj(a, 0, 25000)
      const inner = Math.max(Math.min(w, h) / 2 - ring, 0)
      return { d: `${circle(w / 2, h / 2, Math.min(w, h) / 2)} ${circle(w / 2, h / 2, inner, false)}`, fillRule: 'evenodd' }
    }
    case 'star4':
      return { d: star(4, adj(a, 0, 12500) * 2, w, h) }
    case 'star5':
      return { d: star(5, adj(a, 0, 19098) * 2, w, h) }
    case 'rightArrow': {
      const sh = Math.min(h * adj(a, 0, 50000), h)
      const head = Math.min(Math.min(w, h) * adj(a, 1, 50000), w)
      return { d: poly([[0, (h - sh) / 2], [w - head, (h - sh) / 2], [w - head, 0], [w, h / 2], [w - head, h], [w - head, (h + sh) / 2], [0, (h + sh) / 2]]) }
    }
    case 'leftArrow': {
      const sh = Math.min(h * adj(a, 0, 50000), h)
      const head = Math.min(Math.min(w, h) * adj(a, 1, 50000), w)
      return { d: poly([[w, (h - sh) / 2], [head, (h - sh) / 2], [head, 0], [0, h / 2], [head, h], [head, (h + sh) / 2], [w, (h + sh) / 2]]) }
    }
    case 'wedgeRectCallout': {
      const tx = w * (0.5 + adj(a, 0, -20833))
      const ty = h * (0.5 + adj(a, 1, 62500))
      const d = Math.min(w, h) * 0.12
      return { d: poly([[0, 0], [w, 0], [w, h], [tx + d, h], [tx, ty], [tx - d, h], [0, h]]) }
    }
    case 'heart':
      return { d: `M${r(w / 2)},${r(h * 0.29)} C${r(w * 0.42)},${r(h * 0.02)} ${r(w * 0.02)},${r(h * 0.1)} ${r(w * 0.02)},${r(h * 0.38)} C${r(w * 0.02)},${r(h * 0.66)} ${r(w * 0.34)},${r(h * 0.84)} ${r(w / 2)},${r(h)} C${r(w * 0.66)},${r(h * 0.84)} ${r(w * 0.98)},${r(h * 0.66)} ${r(w * 0.98)},${r(h * 0.38)} C${r(w * 0.98)},${r(h * 0.1)} ${r(w * 0.58)},${r(h * 0.02)} ${r(w / 2)},${r(h * 0.29)} Z` }
    case 'lightningBolt':
      return { d: poly([[w * 0.52, 0], [w * 0.06, h * 0.56], [w * 0.4, h * 0.56], [w * 0.33, h], [w * 0.94, h * 0.4], [w * 0.55, h * 0.4]]) }
    default: {
      console.warn(`pptd-viewer: unknown shapeName "${shapeName}", rendering as rect`)
      return { d: `M0,0 H${r(w)} V${r(h)} H0 Z` }
    }
  }
}

/** Resolve a ShapeDef (shape element or image cropShape) to geometry in bounds coords. */
export function resolveShapeDef(def: { shapeName: string; adjustments?: number[]; viewBox?: [number, number]; path?: string }, w: number, h: number): ShapeGeom {
  if (def.shapeName === 'custom') {
    if (!def.viewBox || !def.path) {
      console.warn('pptd-viewer: custom shape missing viewBox/path')
      return { d: '' }
    }
    return { d: def.path, fillRule: 'evenodd' } // outer CW + inner CCW ⇒ hollow via evenodd
  }
  return shapeGeom(def.shapeName, w, h, def.adjustments)
}
