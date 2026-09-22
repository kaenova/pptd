import { describe, it } from 'bun:test'
import { strict as assert } from 'assert'
import { resizeBounds, localDelta, snapAngle, normAngle, MIN_SIZE } from '../src/Deck/helpers'
import { multiSnapshotCmd } from '../src/Deck/commands'
import type { Element, LoadedProject } from '../src/types'

const b = [10, 20, 100, 50] as [number, number, number, number]

describe('localDelta', () => {
  it('identity at rotation 0', () => {
    assert.deepEqual(localDelta(10, -5, 0), [10, -5])
  })
  it('90deg: screen +x is local -y (element rotated clockwise)', () => {
    const [dx, dy] = localDelta(10, 0, 90)
    assert.ok(Math.abs(dx) < 1e-9)
    assert.ok(Math.abs(dy + 10) < 1e-9)
  })
  it('round-trips with inverse rotation', () => {
    const [dx, dy] = localDelta(13, -7, 33)
    const [rx, ry] = localDelta(dx, dy, -33)
    assert.ok(Math.abs(rx - 13) < 1e-9 && Math.abs(ry + 7) < 1e-9)
  })
})

describe('resizeBounds', () => {
  it('se corner grows both axes', () => {
    assert.deepEqual(resizeBounds(b, 'se', 30, 10), [10, 20, 130, 60])
  })
  it('nw corner outward drag grows (x may go off-canvas)', () => {
    assert.deepEqual(resizeBounds(b, 'nw', -30, -10), [-20, 10, 130, 60])
  })
  it('nw corner inward drag moves x/y and shrinks', () => {
    assert.deepEqual(resizeBounds(b, 'nw', 30, 10), [40, 30, 70, 40])
  })
  it('e edge single-axis only', () => {
    assert.deepEqual(resizeBounds(b, 'e', 40, 99), [10, 20, 140, 50])
  })
  it('n edge single-axis only', () => {
    assert.deepEqual(resizeBounds(b, 'n', 99, 25), [10, 45, 100, 25])
  })
  it('enforces min size from any handle', () => {
    const shrunk = resizeBounds(b, 'se', -500, -500)
    assert.ok(shrunk[2] >= MIN_SIZE && shrunk[3] >= MIN_SIZE)
    const nw = resizeBounds(b, 'nw', 500, 500)
    assert.ok(nw[2] >= MIN_SIZE && nw[3] >= MIN_SIZE)
  })
  it('ratio lock keeps aspect on corners', () => {
    const out = resizeBounds(b, 'se', 50, 0, { ratio: true })
    assert.ok(Math.abs(out[2] / out[3] - 2) < 1e-9) // 100/50 = 2
  })
  it('ratio lock anchored at opposite corner', () => {
    const out = resizeBounds(b, 'nw', -50, -25, { ratio: true })
    assert.equal(out[0] + out[2], 110) // right edge fixed
    assert.equal(out[1] + out[3], 70) // bottom edge fixed
  })
  it('ratio lock respects min size', () => {
    const out = resizeBounds(b, 'se', -500, -500, { ratio: true })
    assert.ok(out[2] >= MIN_SIZE && out[3] >= MIN_SIZE)
  })
})

describe('angles', () => {
  it('snapAngle rounds to step', () => {
    assert.equal(snapAngle(22), 15)
    assert.equal(snapAngle(23), 30)
    assert.equal(snapAngle(-7), 0)
  })
  it('normAngle wraps to (-180, 180]', () => {
    assert.equal(normAngle(190), -170)
    assert.equal(normAngle(-190), 170)
    assert.equal(normAngle(360), 0)
    assert.equal(normAngle(180), 180)
  })
})

describe('multiSnapshotCmd', () => {
  const el = (id: string): Element => ({ elementId: id, elementType: 'shape', bounds: [0, 0, 10, 10], shapeName: 'rect' } as Element)
  const project = (): LoadedProject => ({ title: 't', size: [960, 540], theme: {} as never, pages: [{ pageId: 'p', pageType: 'content', elements: [el('a'), el('b')], animations: [] }] } as LoadedProject)
  it('swaps multiple and restores', () => {
    const cmd = multiSnapshotCmd(0, [el('a'), el('b')], [
      { ...el('a'), bounds: [1, 2, 3, 4] },
      { ...el('b'), rotation: 45 },
    ], 'resize')
    const after = cmd.do(project())
    assert.deepEqual(after.pages[0].elements[0].bounds, [1, 2, 3, 4])
    assert.equal((after.pages[0].elements[1] as { rotation?: number }).rotation, 45)
    const back = cmd.undo(after)
    assert.deepEqual(back.pages[0].elements[0].bounds, [0, 0, 10, 10])
    assert.equal((back.pages[0].elements[1] as { rotation?: number }).rotation, undefined)
  })
})

import { resizedElement } from '../src/Deck/helpers'
import type { LineElement } from '../src/types'

describe('resizedElement', () => {
  it('line scales viewBox proportionally with bounds', () => {
    const line: LineElement = { elementId: 'l', elementType: 'line', bounds: [0, 0, 100, 50], viewBox: [100, 50], points: '0,0 100,50' } as LineElement
    const out = resizedElement(line, [10, 10, 200, 100]) as LineElement
    assert.deepEqual(out.viewBox, [200, 100])
    assert.deepEqual(out.bounds, [10, 10, 200, 100])
  })
  it('non-line elements just get new bounds', () => {
    const shape = { elementId: 's', elementType: 'shape', bounds: [0, 0, 10, 10], shapeName: 'rect' } as Element
    const out = resizedElement(shape, [1, 2, 3, 4])
    assert.deepEqual(out.bounds, [1, 2, 3, 4])
  })
})

import { rectBounds, newShapeElement, newLineElement, newImageElement, newIconElement } from '../src/Deck/helpers'

describe('creation factories', () => {
  it('rectBounds normalizes any drag direction', () => {
    assert.deepEqual(rectBounds(100, 50, 20, 10), [20, 10, 80, 40])
    assert.deepEqual(rectBounds(20, 10, 100, 50), [20, 10, 80, 40])
  })
  it('newShapeElement: primary fill, unique ids', () => {
    const s = newShapeElement('ellipse', [0, 0, 50, 50])
    assert.equal(s.shapeName, 'ellipse')
    assert.deepEqual(s.fill, { type: 'solid', color: '$primary' })
    assert.notEqual(s.elementId, newShapeElement('rect', [0, 0, 1, 1]).elementId)
  })
  it('newLineElement: viewBox = bounds size, diagonal path', () => {
    const l = newLineElement([10, 20, 100, 50])
    assert.deepEqual(l.viewBox, [100, 50])
    assert.equal(l.points, '0,0 100,50')
  })
  it('newImageElement/newIconElement defaults', () => {
    assert.deepEqual(newImageElement('blob:x', [0, 0, 10, 10]).fit, { mode: 'cover' })
    const i = newIconElement('fas:house', 100, 100)
    assert.equal(i.iconName, 'fas:house')
    assert.deepEqual(i.bounds, [68, 68, 64, 64])
  })
})
