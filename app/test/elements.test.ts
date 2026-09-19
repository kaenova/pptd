// Phase 3 checks: shape geometry, line paths, image crop frame math.
// Run: bun test
import { describe, expect, test } from 'bun:test'
import { shapeGeom, resolveShapeDef } from '../src/render/elements/geometry'
import { linePath } from '../src/render/elements/Line'
import { cropFrame } from '../src/render/elements/Image'
import { fx } from '../src/render/elements/fx'

describe('shape geometry', () => {
  test('rect: 4 corners', () => {
    expect(shapeGeom('rect', 100, 50).d).toBe('M0,0 H100 V50 H0 Z')
  })

  test('roundRect: radius = min(w,h) × adj/100000', () => {
    // 200×100, adj 20000 → r = 100 × 0.2 = 20
    const { d } = shapeGeom('roundRect', 200, 100, [20000])
    expect(d).toContain('A20,20')
    // default adj 16667 → r = 100 × 0.16667 = 16.67 (matches spec default [16667])
    const dflt = shapeGeom('roundRect', 200, 100)
    expect(dflt.d).toContain('A16.67,16.67')
  })

  test('triangle: apex x from adjustments', () => {
    const { d } = shapeGeom('triangle', 100, 80, [75000])
    expect(d.startsWith('M75,0')).toBe(true)
  })

  test('donut: two circles, evenodd', () => {
    const g = shapeGeom('donut', 100, 100, [25000])
    expect(g.fillRule).toBe('evenodd')
    // outer r=50, inner r=100×0.25×0.5=12.5
    expect(g.d).toContain('A50,50')
    expect(g.d).toContain('A25,25')
  })

  test('star5: 10 vertices', () => {
    expect(shapeGeom('star5', 100, 100).d.match(/L/g)!.length).toBe(9)
  })

  test('custom path: passes through with evenodd (hollow winding)', () => {
    const g = resolveShapeDef({ shapeName: 'custom', viewBox: [1000, 1000], path: 'M500,0 A500,500 0 1 1 499,0 Z M500,200 A300,300 0 1 0 499,200 Z' }, 150, 150)
    expect(g.d.startsWith('M500,0')).toBe(true)
    expect(g.fillRule).toBe('evenodd')
  })

  test('unknown shapeName falls back to rect', () => {
    expect(shapeGeom('nonexistentShape', 10, 10).d).toBe('M0,0 H10 V10 H0 Z')
  })
})

describe('line paths', () => {
  test('2 points → straight line', () => {
    expect(linePath('0,0.5 840,0.5', undefined)).toBe('M0,0.5 L840,0.5')
  })

  test('sharp curve → polyline through anchors', () => {
    const d = linePath('0,0 50,50 100,0', 'sharp')
    expect(d).toBe('M0,0 L50,50 L100,0')
  })

  test('smooth curve → cubic segments through anchors (catmull-rom)', () => {
    const d = linePath('0,0 50,50 100,0', 'smooth')
    expect((d.match(/C/g) ?? []).length).toBe(2)
    expect(d.endsWith('100,0')).toBe(true)
  })
})

describe('image crop frame', () => {
  test('positive insets shrink frame, offset sub-rect into view', () => {
    // left 10% off, right 20% off → sub-rect is 70% of source; frame = 100/70 = 142.86% wide, shifted left by 10/70
    const f = cropFrame({ left: 0.1, right: 0.2 })
    expect(f.width).toBe('142.8571%')
    expect(f.left).toBe('-14.2857%')
  })

  test('negative insets expand frame with transparent pad', () => {
    const f = cropFrame({ top: -0.25 })
    expect(f.height).toBe('80.0000%') // 1/1.25
    expect(f.top).toBe('20.0000%') // 0.25/1.25
  })

  test('no crop → full frame', () => {
    expect(cropFrame(undefined)).toEqual({ width: '100.0000%', height: '100.0000%', left: '0.0000%', top: '0.0000%' })
  })
})

describe('element frame transform', () => {
  test('rotation + flip compose', () => {
    expect(fx({ rotation: 90, flip: [true, false] }).transform).toBe('rotate(90deg) scaleX(-1) scaleY(1)')
    expect(fx({})).toEqual({ transform: 'rotate(0deg) scaleX(1) scaleY(1)', opacity: undefined })
  })
})
