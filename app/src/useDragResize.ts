/**
 * useDragResize — drag a handle attached to a panel's edge; +d (drag away) grows the panel.
 */
import { useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'

export function useDragResize(initial: number, dir: 'x' | 'y', min: number, max: number, flip = 1) {
  const [size, setSize] = useState(initial)
  const start = useRef({ p: 0, size })
  const onPointerDown = (e: RPointerEvent) => {
    e.preventDefault()
    start.current = { p: dir === 'x' ? e.clientX : e.clientY, size }
    document.body.style.cursor = dir === 'x' ? 'col-resize' : 'row-resize'
    const onMove = (ev: PointerEvent) => {
      const d = (dir === 'x' ? ev.clientX : ev.clientY) - start.current.p
      setSize(Math.min(max, Math.max(min, start.current.size + flip * d)))
    }
    const onUp = () => {
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
    }
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)
  }
  return [size, onPointerDown] as const
}
