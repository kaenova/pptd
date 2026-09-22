import { describe, it } from 'bun:test'
import { strict as assert } from 'assert'
import { fitScale, thumbScale, newTextElement, moveBounds } from '../src/Deck'

describe('Deck helpers', () => {
  const size = [1280, 720] as const
  it('fitScale: edit mode fits inside with 40px margin, capped at 1.5x', () => {
    assert.equal(fitScale(size, { width: 1320, height: 760 }, false), 1) // exactly fits after margin
    assert.equal(fitScale(size, { width: 2640, height: 1480 }, false), 1.5) // capped
    assert.ok(fitScale(size, { width: 640, height: 480 }, false) < 0.5)
  })
  it('fitScale: present covers the box (no margin, no cap)', () => {
    assert.equal(fitScale(size, { width: 1280, height: 720 }, true), 1)
    assert.ok(fitScale(size, { width: 1920, height: 720 }, true) > 1) // cover: match the larger ratio
  })
  it('fitScale: zero-size box falls back to 1', () => {
    assert.equal(fitScale(size, { width: 0, height: 0 }, false), 1)
  })
  it('thumbScale: subtracts 12px padding, guards zero', () => {
    assert.equal(thumbScale(112, 1280), (112 - 12) / 1280)
    assert.equal(thumbScale(0, 1280), 0)
  })
  it('newTextElement: anchored top-left on point, sane defaults, unique ids', () => {
    const a = newTextElement(300, 200)
    assert.deepEqual(a.bounds, [300, 200, 200, 32])
    assert.equal(a.elementType, 'text')
    assert.equal(a.content.text, 'Text')
    assert.notEqual(a.elementId, newTextElement(0, 0).elementId)
  })
  it('moveBounds: shifts x/y, keeps w/h', () => {
    assert.deepEqual(moveBounds([10, 20, 100, 50], 5, -3), [15, 17, 100, 50])
  })
})
