/**
 * EditorOverlay — canvas-coordinate layer owning ALL editor pointer interaction:
 * hover box, selection box + resize handles + rotation handle, click-select,
 * drag-move, marquee, double-click-to-edit. Renderers stay dumb.
 */
import { useRef, useState } from 'react'
import type { Element, TextElement } from '../types'
import { useDeckCtx } from './context'
import { moveCmd, multiSnapshotCmd } from './commands'
import { localDelta, resizeBounds, snapAngle, normAngle, resizedElement, type Bounds, type Handle } from './helpers'

const MIN_DRAG = 2 // px (screen) before a pointer press counts as a drag
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
}
const HANDLE_POS: Record<Handle, { left: string; top: string }> = {
  nw: { left: '0%', top: '0%' }, n: { left: '50%', top: '0%' }, ne: { left: '100%', top: '0%' },
  e: { left: '100%', top: '50%' }, se: { left: '100%', top: '100%' }, s: { left: '50%', top: '100%' },
  sw: { left: '0%', top: '100%' }, w: { left: '0%', top: '50%' },
}

type Gesture =
  | { kind: 'move'; ids: string[]; dx: number; dy: number }
  | { kind: 'resize'; id: string; bounds: Bounds }
  | { kind: 'rotate'; id: string; angle: number }
interface MarqueeState { x0: number; y0: number; x1: number; y1: number }

export function EditorOverlay() {
  const { project, index, scale, editor, dispatch, runCommand, tool } = useDeckCtx()
  const page = project.pages[index]
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const selection = editor.selection
  const editingId = editor.editingId
  const hit = (e: { clientX: number; clientY: number }): Element | undefined => {
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

  // --- resize / rotate (single selection) --------------------------------------
  // ponytail: resize math is element-local — correct for rotation=0; rotated
  // elements resize in their local frame with slight anchor drift. Fix by
  // anchoring the screen-space opposite corner if it ever matters.

  const startResize = (e: React.PointerEvent, el: Element, handle: Handle) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const sx = e.clientX
    const sy = e.clientY
    const rot = (el as { rotation?: number }).rotation ?? 0
    let last = el.bounds
    const onMove = (ev: PointerEvent) => {
      const [ldx, ldy] = localDelta((ev.clientX - sx) / scale, (ev.clientY - sy) / scale, rot)
      last = resizeBounds(el.bounds, handle, ldx, ldy, { ratio: ev.shiftKey })
      setGesture({ kind: 'resize', id: el.elementId, bounds: last })
    }
    const onUp = () => {
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
      setGesture(null)
      const after = resizedElement(el, last)
      if (after !== el && (after.bounds !== el.bounds)) runCommand(multiSnapshotCmd(index, [el], [after], 'resize'))
    }
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)
  }

  const startRotate = (e: React.PointerEvent, el: Element) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const r = wrapRef.current!.getBoundingClientRect()
    const cx = r.left + (el.bounds[0] + el.bounds[2] / 2) * scale
    const cy = r.top + (el.bounds[1] + el.bounds[3] / 2) * scale
    const start = Math.atan2(e.clientY - cy, e.clientX - cx)
    const base = (el as { rotation?: number }).rotation ?? 0
    let last = base
    const deg = (ev: PointerEvent) => {
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx)
      const d = base + ((a - start) * 180) / Math.PI
      return Math.round(ev.shiftKey ? snapAngle(d) : normAngle(d))
    }
    const onMove = (ev: PointerEvent) => {
      last = deg(ev)
      setGesture({ kind: 'rotate', id: el.elementId, angle: last })
    }
    const onUp = () => {
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
      setGesture(null)
      if (last !== base) runCommand(multiSnapshotCmd(index, [el], [{ ...el, rotation: last }], 'rotate'))
    }
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)
  }

  // --- move / marquee -----------------------------------------------------------
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
        setGesture({ kind: 'move', ids, dx, dy })
      }
      const onUp = (ev: PointerEvent) => {
        removeEventListener('pointermove', onMove)
        removeEventListener('pointerup', onUp)
        setGesture(null)
        if (moved) {
          const dx = Math.round((ev.clientX - sx) / scale)
          const dy = Math.round((ev.clientY - sy) / scale)
          if (dx || dy) runCommand(moveCmd(index, ids, dx, dy))
        }
      }
      addEventListener('pointermove', onMove)
      addEventListener('pointerup', onUp)
    } else {
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

  // hover tracking; suppressed while something is selected
  const hovered = !selection.length ? page.elements.find(el => el.elementId === hoveredId) : undefined
  const selEls = page.elements.filter(el => selection.includes(el.elementId))
  const single = selEls.length === 1 && selEls[0].elementId !== editingId ? selEls[0] : undefined
  const busy = gesture !== null

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 z-10"
      data-overlay="bg"
      style={{ cursor: busy ? 'grabbing' : tool === 'text' ? 'text' : hovered ? 'pointer' : 'default' }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onMouseMove={e => { const el = hit(e); setHoveredId(el?.elementId ?? null) }}
      onMouseLeave={() => setHoveredId(null)}
    >
      {/* move live preview: translated outlines */}
      {gesture?.kind === 'move' && page.elements
        .filter(el => gesture.ids.includes(el.elementId))
        .map(el => (
          <div key={`drag-${el.elementId}`} className="pointer-events-none absolute border-2 border-accent" style={{ left: el.bounds[0], top: el.bounds[1], width: el.bounds[2], height: el.bounds[3], transform: `translate(${gesture.dx}px, ${gesture.dy}px)` }} aria-hidden="true" />
        ))}
      {/* multi-selection: per-element outlines, no handles */}
      {(single ? [] : selEls).map(el => (
        <div key={`sel-${el.elementId}`} className="pointer-events-none absolute border-2 border-accent" style={{ left: el.bounds[0], top: el.bounds[1], width: el.bounds[2], height: el.bounds[3] }} aria-hidden="true" />
      ))}
      {/* single selection: box + 8 resize handles + rotation handle (text: no rotation per spec) */}
      {single && (() => {
        const g = gesture?.kind === 'resize' && gesture.id === single.elementId ? gesture
          : gesture?.kind === 'rotate' && gesture.id === single.elementId ? gesture : null
        const b = g?.kind === 'resize' ? g.bounds : single.bounds
        const rot = g?.kind === 'rotate' ? g.angle : ((single as { rotation?: number }).rotation ?? 0)
        const isText = single.elementType === 'text'
        return (
          <div className="absolute" style={{ left: b[0], top: b[1], width: b[2], height: b[3], transform: `rotate(${rot}deg)`, transformOrigin: 'center' }}>
            <div className="pointer-events-none absolute inset-0 border-2 border-accent" aria-hidden="true" />
            {HANDLES.map(h => (
              <div
                key={h}
                role="presentation"
                aria-label={`Resize ${h}`}
                className="absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-accent bg-white"
                style={{ ...HANDLE_POS[h], cursor: HANDLE_CURSOR[h], left: `calc(${HANDLE_POS[h].left})` }}
                onPointerDown={e => startResize(e, single, h)}
              />
            ))}
            {!isText && (
              <>
                <div className="pointer-events-none absolute left-1/2 top-0 h-[18px] w-px -translate-x-1/2 -translate-y-full bg-accent" aria-hidden="true" />
                <div
                  role="presentation"
                  aria-label="Rotate"
                  className="absolute left-1/2 size-[11px] -translate-x-1/2 rounded-full border border-accent bg-white"
                  style={{ top: -24, cursor: 'grab' }}
                  onPointerDown={e => startRotate(e, single)}
                />
              </>
            )}
          </div>
        )
      })()}
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
