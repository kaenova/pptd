import type { CSSProperties } from 'react'

export type AnimationEffect =
  | 'appear' | 'fade-in' | 'fly-in' | 'zoom-in' | 'wipe-in' | 'float-in' | 'peek-in' | 'rise-in'
  | 'pulse' | 'grow-shrink' | 'spin' | 'teeter' | 'fill-color' | 'transparency' | 'color-pulse'
  | 'disappear' | 'fade-out' | 'fly-out' | 'zoom-out' | 'wipe-out' | 'float-out' | 'motion-path'
export type AnimationTrigger = 'onClick' | 'withPrevious' | 'afterPrevious'
export type AnimationDirection = 'up' | 'down' | 'left' | 'right'
export type AnimationEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'

export interface Animation {
  elementId: string
  effect: AnimationEffect
  trigger?: AnimationTrigger
  direction?: AnimationDirection
  durationMs?: number
  delayMs?: number
  easing?: AnimationEasing
  repeat?: number
  path?: string
  color?: string
  amount?: number
}

export interface AnimationStep extends Animation {
  start: number
  duration: number
}

export interface AnimationGroup {
  auto: boolean
  steps: AnimationStep[]
  duration: number
}

const DEFAULT_DUR: Partial<Record<AnimationEffect, number>> = {
  'fade-in': 500, 'fade-out': 500, 'fly-in': 500, 'fly-out': 500,
  'zoom-in': 500, 'zoom-out': 500, 'wipe-in': 500, 'wipe-out': 500,
  'float-in': 500, 'float-out': 500, 'peek-in': 500, pulse: 600,
  'grow-shrink': 2000, spin: 2000, teeter: 1000, 'fill-color': 2000,
  transparency: 2000, 'color-pulse': 2000, 'motion-path': 2000, 'rise-in': 1000,
}

export function animationDuration(a: Animation): number {
  return a.effect === 'appear' || a.effect === 'disappear' ? 1 : Math.max(1, a.durationMs ?? DEFAULT_DUR[a.effect] ?? 500)
}

/** Convert array-order triggers into click groups and relative start times. */
export function animationGroups(animations: Animation[] = []): AnimationGroup[] {
  const groups: AnimationGroup[] = []
  let group: AnimationGroup | undefined
  let step: AnimationStep | undefined
  for (const a of animations) {
    const trigger = a.trigger ?? 'onClick'
    if (!group || trigger === 'onClick') {
      group = { auto: groups.length === 0 && trigger !== 'onClick', steps: [], duration: 0 }
      groups.push(group)
      step = undefined
    }
    const duration = animationDuration(a)
    const delay = Math.max(0, a.delayMs ?? 0)
    if (!step || trigger === 'onClick' || trigger === 'afterPrevious') {
      const start = (step?.start ?? 0) + (step?.duration ?? 0) + delay
      step = { ...a, start, duration }
      group.steps.push(step)
    } else {
      const start = step.start + delay
      step = { ...a, start, duration }
      // withPrevious belongs to the same time step, but remains independently targetable.
      group.steps.push(step)
    }
    group.duration = Math.max(group.duration, step.start + duration)
  }
  return groups
}

function directionTransform(direction: AnimationDirection, distance: string): string {
  return direction === 'left' ? `translateX(-${distance})` : direction === 'right' ? `translateX(${distance})` : direction === 'down' ? `translateY(-${distance})` : `translateY(${distance})`
}

function keyframes(a: Animation): string {
  const d = a.direction ?? 'up'
  switch (a.effect) {
    case 'fade-in': return 'pptd-fade-in'
    case 'fade-out': return 'pptd-fade-out'
    case 'fly-in': case 'rise-in': return `pptd-fly-in-${d}`
    case 'fly-out': return `pptd-fly-out-${d}`
    case 'float-in': return `pptd-float-in-${d}`
    case 'float-out': return `pptd-float-out-${d}`
    case 'zoom-in': return 'pptd-zoom-in'
    case 'zoom-out': return 'pptd-zoom-out'
    case 'wipe-in': case 'peek-in': return `pptd-wipe-in-${d}`
    case 'wipe-out': return `pptd-wipe-out-${d}`
    case 'pulse': return 'pptd-pulse'
    case 'grow-shrink': return 'pptd-grow-shrink'
    case 'spin': return 'pptd-spin'
    case 'teeter': return 'pptd-teeter'
    case 'fill-color': return 'pptd-fill-color'
    case 'color-pulse': return 'pptd-color-pulse'
    case 'transparency': return 'pptd-transparency'
    case 'motion-path': return 'pptd-motion-path'
    default: return ''
  }
}

const entrance = new Set<AnimationEffect>(['appear', 'fade-in', 'fly-in', 'zoom-in', 'wipe-in', 'float-in', 'peek-in', 'rise-in'])
const exit = new Set<AnimationEffect>(['disappear', 'fade-out', 'fly-out', 'zoom-out', 'wipe-out', 'float-out'])

/** Styles the full-page element layer; keeps element-local transforms intact. */
export function animationStyle(a: Animation, active: boolean): CSSProperties {
  const style: CSSProperties = { pointerEvents: 'none' }
  if (!active) {
    if (entrance.has(a.effect)) style.visibility = 'hidden'
    return style
  }
  if (a.effect === 'appear') return style
  if (a.effect === 'disappear') return { ...style, visibility: 'hidden' }
  const name = keyframes(a)
  if (!name) return style
  style.animationName = name
  style.animationDuration = `${animationDuration(a)}ms`
  style.animationDelay = `${Math.max(0, 'start' in a ? (a as AnimationStep).start : (a.delayMs ?? 0))}ms`
  style.animationTimingFunction = a.easing ?? 'linear'
  style.animationIterationCount = a.repeat ?? 1
  style.animationFillMode = 'both'
  if (a.effect === 'fill-color' || a.effect === 'color-pulse') (style as CSSProperties & Record<string, string>)['--pptd-to-fill'] = a.color ?? '#FF0000'
  if (a.effect === 'transparency') (style as CSSProperties & Record<string, string>)['--pptd-opacity'] = String(a.amount ?? 0)
  if (a.effect === 'motion-path' && a.path) style.offsetPath = `path("${a.path.replaceAll('"', '\\"')}")`
  return style
}

export function animationIsExit(a: Animation): boolean { return exit.has(a.effect) }
export function animationIsEntrance(a: Animation): boolean { return entrance.has(a.effect) }
export { directionTransform }
