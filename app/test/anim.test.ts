import { describe, expect, test } from 'bun:test'
import { animationDuration, animationGroups, animationStyle } from '../src/anim'

describe('animation orchestration', () => {
  test('groups click and previous triggers with expected timing', () => {
    const groups = animationGroups([
      { elementId: 'a', effect: 'fade-in', trigger: 'afterPrevious', durationMs: 100 },
      { elementId: 'b', effect: 'fade-in', trigger: 'withPrevious', durationMs: 200 },
      { elementId: 'c', effect: 'zoom-in', trigger: 'onClick', durationMs: 50 },
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].auto).toBe(true)
    expect(groups[0].steps.map(s => [s.elementId, s.start])).toEqual([['a', 0], ['b', 0]])
    expect(groups[1].steps[0].start).toBe(0)
    expect(groups[0].duration).toBe(200)
  })

  test('default durations and entrance initial state', () => {
    expect(animationDuration({ elementId: 'x', effect: 'spin' })).toBe(2000)
    expect(animationDuration({ elementId: 'x', effect: 'appear', durationMs: 900 })).toBe(1)
    expect(animationStyle({ elementId: 'x', effect: 'fade-in' }, false).visibility).toBe('hidden')
    expect(animationStyle({ elementId: 'x', effect: 'fade-in' }, true).animationName).toBe('pptd-fade-in')
  })
})
