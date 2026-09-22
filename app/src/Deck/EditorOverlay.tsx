/**
 * EditorOverlay — canvas-coordinate layer owning ALL editor pointer interaction:
 * hover box, selection box, click-select, drag-move, marquee, double-click-to-edit.
 * Renderers stay dumb; overlay hit-tests element bounds itself.
 */
import { useRef, useState } from 'react'
import type { Element, TextElement } from '../types'
import { useDeckCtx } from './context'
import { moveCmd } from './commands'

const MIN_DRAG = 2 // px (screen) before a pointer press counts as a drag

interface DragState {
  kind: 'move'
  ids: string[]
  sx: number
  sy: number
  dx: number
  dy: number
}
interface MarqueeState { x0: number; y0: number; x1: number; y1: number }

export function EditorOverlay() {
  const { project, index, scale, editor, dispatch, runCommand, tool } = useDeckCtx()
  const page = project.pages[index]
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const selection = editor.selection
  const editingId = editor.editingId
  const hit = (e: { clientX: number; clientY: number; target: EventTarget | null }): Element | undefined => {
    // topmost element whose bounds contain the point; skip the one being edited
    const r = wrapRef.current!.getBoundingClientRect()
    const x = (e.clientX - r.left) / scale
    const y = (e.clientY - r.top) / scale
    for (let i = page.elements.length - 1; i >= 0; i--) {
      const el = page.elements[i]
      if (el.elementId === editingId) continue
      const [bx, by, bw, bh] = el.bounds
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) return el
    }
    return undefined
  }

  // pointer interactions live here; PageView no longer carries editor handlers
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const el = hit(e)
    if (el) {
      const additive = e.shiftKey
      if (!additive && !selection.includes(el.elementId)) dispatch({ type: 'select', ids: [el.elementId] })
      else if (additive && selection.includes(el.elementId)) dispatch({ type: 'select', ids: [el.elementId], toggle: true })
      const ids = additive
        ? (selection.includes(el.elementId) ? selection.filter(id => id !== el.elementId) : [...selection, el.elementId])
        : (selection.includes(el.elementId) ? selection : [el.elementId])
      if (!ids.length) return
      const sx = e.clientX
      const sy = e.clientY
      let moved = false
      const onMove = (ev: PointerEvent) => {
        const dx = (ev.clientX - sx) / scale
        const dy = (ev.clientY - sy) / scale
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < MIN_DRAG) return
        moved = true
        setDrag({ kind: 'move', ids, sx, sy, dx, dy })
      }
      const onUp = (ev: PointerEvent) => {
        removeEventListener('pointermove', onMove)
        removeEventListener('pointerup', onUp)
        setDrag(null)
        if (moved) {
          const dx = Math.round((ev.clientX - sx) / scale)
          const dy = Math.round((ev.clientY - sy) / scale)
          if (dx || dy) runCommand(moveCmd(index, ids, dx, dy))
        }
      }
      addEventListener('pointermove', onMove)
      addEventListener('pointerup', onUp)
    } else if (e.target === wrapRef.current || (e.target as HTMLElement).dataset?.overlay === 'bg') {
      // marquee on empty canvas
      const r = wrapRef.current!.getBoundingClientRect()
      const x0 = (e.clientX - r.left) / scale
      const y0 = (e.clientY - r.top) / scale
      const onMove = (ev: PointerEvent) =>
        setMarquee({ x0, y0, x1: (ev.clientX - r.left) / scale, y1: (ev.clientY - r.top) / scale })
      const onUp = (ev: PointerEvent) => {
        removeEventListener('pointermove', onMove)
        removeEventListener('pointerup', onUp)
        setMarquee(null)
        const x1 = (ev.clientX - r.left) / scale
        const y1 = (ev.clientY - r.top) / scale
        if (Math.abs(x1 - x0) > MIN_DRAG || Math.abs(y1 - y0) > MIN_DRAG) {
          const [lx, rx] = [Math.min(x0, x1), Math.max(x0, x1)]
          const [ty, by] = [Math.min(y0, y1), Math.max(y0, y1)]
          const ids = page.elements
            .filter(el => el.elementId !== editingId && el.bounds[0] < rx && el.bounds[0] + el.bounds[2] > lx && el.bounds[1] < by && el.bounds[1] + el.bounds[3] > ty)
            .map(el => el.elementId)
          if (ids.length) dispatch({ type: 'select', ids })
          return
        }
        // plain click on empty canvas → deselect (replay handled by Stage)
        if (selection.length) dispatch({ type: 'deselect' })
      }
      addEventListener('pointermove', onMove)
      addEventListener('pointerup', onUp)
    }
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const el = hit(e)
    if (el) {
      dispatch({ type: 'select', ids: [el.elementId] })
      if (el.elementType === 'text') dispatch({ type: 'startEdit', id: el.elementId })
    }
  }

  // hover tracking (screen-space, canvas-px boxes scale with the wrapper)
  const hovered = !selection.length ? page.elements.find(el => el.elementId === hoveredId) : undefined
  const selEls = page.elements.filter(el => selection.includes(el.elementId))
  const dragPreview = (id: string) => (drag && drag.ids.includes(id) ? { dx: drag.dx, dy: drag.dy } : undefined)

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 z-10"
      data-overlay="bg"
      style={{ cursor: drag ? 'grabbing' : tool === 'text' ? 'text' : hovered ? 'pointer' : 'default' }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onMouseMove={e => { const el = hit(e); setHoveredId(el?.elementId ?? null) }}
      onMouseLeave={() => setHoveredId(null)}
    >
      {/* drag live preview: translate outlines (elements stay in place until commit) */}
      {selEls.map(el => {
        const p = dragPreview(el.elementId)
        return p ? <div key={`drag-${el.elementId}`} className="pointer-events-none absolute border-2 border-accent" style={{ left: el.bounds[0], top: el.bounds[1], width: el.bounds[2], height: el.bounds[3], transform: `translate(${p.dx}px, ${p.dy}px)` }} aria-hidden="true" /> : null
      })}
      {selEls.map(el => (
        <div key={`sel-${el.elementId}`} className="pointer-events-none absolute border-2 border-accent" style={{ left: el.bounds[0], top: el.bounds[1], width: el.bounds[2], height: el.bounds[3] }} aria-hidden="true" />
      ))}
      {hovered && <div className="pointer-events-none absolute border-2 border-[#ff6900] bg-[#ff69001a]" style={{ left: hovered.bounds[0], top: hovered.bounds[1], width: hovered.bounds[2], height: hovered.bounds[3] }} aria-hidden="true" />}
      {/* marquee */}
      {marquee && (
        <div
          className="pointer-events-none absolute border border-accent bg-[#ff69001a]"
          style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}

/** TextEditor mount helper — keeps Canvas.tsx thin. */
export function editingTextEl(page: { elements: Element[] }, editingId: string | null): TextElement | undefined {
  if (!editingId) return undefined
  const el = page.elements.find(e => e.elementId === editingId)
  return el && el.elementType === 'text' ? (el as TextElement) : undefined
}
