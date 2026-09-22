/**
 * Deck pure helpers — exported for testing and reuse.
 */
import type { Element, LineElement } from '../types'
// --- pure helpers (testable) -------------------------------------------------

/** Fit scale: present covers the box; edit fits inside with margin (max 1.5×). */
export function fitScale(size: readonly [number, number], box: { width: number; height: number }, present: boolean): number {
  const [w, h] = size
  if (box.width <= 0 || box.height <= 0) return 1
  if (present) return Math.max(box.width / w, box.height / h)
  return Math.min((box.width - 40) / w, (box.height - 40) / h, 1.5)
}

/** Thumbnail scale: usable width = thumb button width minus p-1.5 (12px) padding. */
export function thumbScale(thumbWidth: number, pageW: number): number {
  return thumbWidth > 0 ? (thumbWidth - 12) / pageW : 0
}

/** New default text element anchored at (x, y) top-left (Figma-style). */
export function newTextElement(x: number, y: number): import('../types').TextElement {
  return {
    elementId: `text-${crypto.randomUUID().slice(0, 8)}`,
    elementType: 'text',
    bounds: [Math.round(x), Math.round(y), 200, 32],
    content: { text: 'Text', fontSize: 24 },
  }
}

const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`

/** Normalize a drag rect (any corner direction) to [x, y, w, h]. */
export function rectBounds(x0: number, y0: number, x1: number, y1: number): [number, number, number, number] {
  return [Math.round(Math.min(x0, x1)), Math.round(Math.min(y0, y1)), Math.round(Math.abs(x1 - x0)), Math.round(Math.abs(y1 - y0))]
}

/** New shape element (default theme-primary fill, no border). */
export function newShapeElement(shapeName: string, bounds: [number, number, number, number]): import('../types').ShapeElement {
  return { elementId: uid('shape'), elementType: 'shape', shapeName, bounds, fill: { type: 'solid', color: '$primary' } }
}

/** New line element from drag endpoints (any direction): bounds = normalized rect, endpoints mapped into it. */
export function newLineElement(x0: number, y0: number, x1: number, y1: number): import('../types').LineElement {
  const b = rectBounds(x0, y0, x1, y1)
  const w = Math.max(1, b[2]), h = Math.max(1, b[3]) // nonzero viewBox — degenerate w/h=0 breaks the svg
  return { elementId: uid('line'), elementType: 'line', bounds: [b[0], b[1], w, h], viewBox: [w, h], points: `${r2(x0 - b[0])},${r2(y0 - b[1])} ${r2(x1 - b[0])},${r2(y1 - b[1])}`, border: { color: '#333333', width: 2 } }
}

/** New image element (blob/object URL) with cover fit. */
export function newImageElement(src: string, bounds: [number, number, number, number]): import('../types').ImageElement {
  return { elementId: uid('image'), elementType: 'image', src, bounds, fit: { mode: 'cover' } }
}

/** New icon element filling `bounds` (lucide kebab name). */
export function newIconElement(iconName: string, bounds: [number, number, number, number]): import('../types').IconElement {
  return { elementId: uid('icon'), elementType: 'icon', iconName, bounds, fill: { type: 'solid', color: '#333333' } }
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Bounds moved by (dx, dy) canvas px. */
export function moveBounds(b: [number, number, number, number], dx: number, dy: number): [number, number, number, number] {
  return [b[0] + dx, b[1] + dy, b[2], b[3]]
}

// --- resize / rotate (E2) ---------------------------------------------------

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const MIN_SIZE = 4
export type Bounds = [number, number, number, number]

/** Screen delta → element-local delta (element rotated `rotationDeg` clockwise). */
export function localDelta(dx: number, dy: number, rotationDeg: number): [number, number] {
  const t = (rotationDeg * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  return [dx * c + dy * s, -dx * s + dy * c]
}

/** Resize bounds by dragging `handle` by local (dx, dy). ratio locks corners to the original aspect. */
export function resizeBounds(b: Bounds, handle: Handle, dx: number, dy: number, opts: { ratio?: boolean; min?: number } = {}): Bounds {
  const min = opts.min ?? MIN_SIZE
  const [x0, y0, w0, h0] = b
  if (opts.ratio && handle.length === 2) {
    // corner + ratio: scale both axes by the dominant factor, anchored at the opposite corner
    const fx = handle.includes('e') ? (w0 + dx) / w0 : (w0 - dx) / w0
    const fy = handle.includes('s') ? (h0 + dy) / h0 : (h0 - dy) / h0
    const f = Math.abs(dx) > Math.abs(dy) ? fx : fy
    let w = Math.max(min, w0 * f)
    let h = Math.max(min, w / (w0 / h0)) // keep original aspect; min clamps width first
    w = Math.max(min, h * (w0 / h0))
    const x = handle.includes('w') ? x0 + w0 - w : x0
    const y = handle.includes('n') ? y0 + h0 - h : y0
    return [Math.round(x), Math.round(y), Math.round(w), Math.round(h)]
  }
  let [x, y, w, h] = b
  if (handle.includes('w')) { const nx = Math.min(x0 + dx, x0 + w0 - min); w = x0 + w0 - nx; x = nx }
  if (handle.includes('e')) w = Math.max(min, w0 + dx)
  if (handle.includes('n')) { const ny = Math.min(y0 + dy, y0 + h0 - min); h = y0 + h0 - ny; y = ny }
  if (handle.includes('s')) h = Math.max(min, h0 + dy)
  return [Math.round(x), Math.round(y), Math.round(w), Math.round(h)]
}

/** Snap degrees to a step (Shift while rotating). */
export function snapAngle(deg: number, step = 15): number {
  const r = Math.round(deg / step) * step
  return r === 0 ? 0 : r // avoid -0
}

/** Normalize to (-180, 180]. */
export function normAngle(deg: number): number {
  let a = deg % 360
  if (a <= -180) a += 360
  if (a > 180) a -= 360
  return a
}


/** Resize an element: new bounds; line viewBox scales so the path stretches with the box. */
export function resizedElement(el: Element, nb: Bounds): Element {
  if (el.elementType === 'line') {
    const l = el as LineElement
    const [vw, vh] = l.viewBox
    return { ...l, bounds: nb, viewBox: [Math.round(vw * (nb[2] / el.bounds[2])), Math.round(vh * (nb[3] / el.bounds[3]))] }
  }
  return { ...el, bounds: nb }
}

/** E6 snapping -------------------------------------------------------------- */

export type Guide = { axis: 'x' | 'y'; at: number }

const SNAP_PX = 6

/**
 * Snap correction for a moving box vs targets (other elements + page bounds).
 * Compares moving edges/center to target edges/center; returns the smallest
 * [dx, dy] within threshold plus the matched guide lines to render.
 */
export function snapDelta(
  box: Bounds,
  targets: Bounds[],
  threshold = SNAP_PX,
): { dx: number; dy: number; guides: Guide[] } {
  const mov = {
    x: [box[0], box[0] + box[2] / 2, box[0] + box[2]],
    y: [box[1], box[1] + box[3] / 2, box[1] + box[3]],
  }
  const best = { x: { d: threshold, at: [] as number[] }, y: { d: threshold, at: [] as number[] } }
  for (const t of targets) {
    const tgt = {
      x: [t[0], t[0] + t[2] / 2, t[0] + t[2]],
      y: [t[1], t[1] + t[3] / 2, t[1] + t[3]],
    }
    for (const ax of ['x', 'y'] as const) {
      for (const m of mov[ax]) for (const g of tgt[ax]) {
        const d = g - m
        if (Math.abs(d) < Math.abs(best[ax].d)) { best[ax] = { d: Math.abs(d), at: [g] } }
        else if (Math.abs(d) === Math.abs(best[ax].d) && !best[ax].at.includes(g)) best[ax].at.push(g)
      }
    }
  }
  let sdx = 0, sdy = 0
  if (best.x.d < threshold) sdx = best.x.at[0] - nearest(mov.x, best.x.at[0])
  if (best.y.d < threshold) sdy = best.y.at[0] - nearest(mov.y, best.y.at[0])
  const guides: Guide[] = []
  if (sdx) for (const at of best.x.at) guides.push({ axis: 'x', at })
  if (sdy) for (const at of best.y.at) guides.push({ axis: 'y', at })
  return { dx: sdx, dy: sdy, guides }
}

function nearest(vals: number[], target: number): number {
  return vals.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a))
}
