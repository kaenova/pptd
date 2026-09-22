/**
 * EditorOverlay — canvas-coordinate layer owning ALL editor pointer interaction:
 * hover box, selection box + resize handles + rotation handle, click-select,
 * drag-move, marquee, double-click-to-edit. Renderers stay dumb.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Element, TextElement } from '../types'
import { ArrowRight } from 'lucide-react'
import { useDeckCtx } from './context'
import { addElementCmd, crossPageMoveCmd, moveCmd, multiSnapshotCmd } from './commands'
import { localDelta, resizeBounds, snapAngle, normAngle, resizedElement, rectBounds, newTextElement, newShapeElement, newLineElement, newImageElement, newIconElement, MIN_SIZE, snapDelta, type Guide, type Bounds, type Handle } from './helpers'
import { linePath } from '../render/elements/Line'

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
  | { kind: 'move'; ids: string[]; dx: number; dy: number; guides: Guide[] }
  | { kind: 'resize'; id: string; bounds: Bounds }
  | { kind: 'rotate'; id: string; angle: number }
interface MarqueeState { x0: number; y0: number; x1: number; y1: number }

export function EditorOverlay() {
  const { project, index, scale, editor, dispatch, runCommand, tool, shapeName, iconName, setTool, onComment, mode } = useDeckCtx()
  const canEdit = mode === 'edit'
  const page = project.pages[index]
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // comment tool: element awaiting a comment (Figma-style popover)
  const [commentEl, setCommentEl] = useState<Element | null>(null)
  const [commentText, setCommentText] = useState('')
  const [commentedIds, setCommentedIds] = useState<string[]>([])
  const [commentAt, setCommentAt] = useState<[number, number] | null>(null) // popover anchor: click point (screen coords; portal to body so it can't overflow the canvas)
  // clear hover when the pointer leaves the app window (deck) entirely
  useEffect(() => {
    const clear = () => setHoveredId(null)
    window.addEventListener('blur', clear)
    document.documentElement.addEventListener('mouseleave', clear)
    return () => {
      window.removeEventListener('blur', clear)
      document.documentElement.removeEventListener('mouseleave', clear)
    }
  }, [])
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

  // group resize: drag corner of the multi-selection bounding box; every element scales by the same factor (anchored at the opposite corner)
  const startGroupResize = (e: React.PointerEvent, handle: Handle) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const box: [number, number] = selEls.reduce((acc, el) => [Math.min(acc[0], el.bounds[0]), Math.min(acc[1], el.bounds[1])], [Infinity, Infinity] as [number, number])
    const x1 = Math.max(...selEls.map(el => el.bounds[0] + el.bounds[2]))
    const y1 = Math.max(...selEls.map(el => el.bounds[1] + el.bounds[3]))
    const g0: Bounds = [box[0], box[1], x1 - box[0], y1 - box[1]]
    const sx = e.clientX
    const sy = e.clientY
    let last = g0
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / scale
      const dy = (ev.clientY - sy) / scale
      last = resizeBounds(g0, handle, dx, dy, { ratio: false })
      setGesture({ kind: 'resize', id: '__group__', bounds: last })
    }
    const onUp = () => {
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
      setGesture(null)
      if (last === g0) return
      const fx = last[2] / g0[2]
      const fy = last[3] / g0[3]
      if (fx === 1 && fy === 1) return
      const before = selEls
      const after = before.map(el => resizedElement(el, [
        Math.round(g0[0] + (el.bounds[0] - g0[0]) * fx),
        Math.round(g0[1] + (el.bounds[1] - g0[1]) * fy),
        Math.max(MIN_SIZE, Math.round(el.bounds[2] * fx)),
        Math.max(MIN_SIZE, Math.round(el.bounds[3] * fy)),
      ]))
      runCommand(multiSnapshotCmd(index, before, after, 'group resize'))
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
      if (last !== base) runCommand(multiSnapshotCmd(index, [el], [{ ...el, rotation: last } as Element], 'rotate'))
    }
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)
  }

  // --- creation (E3) --------------------------------------------------------

  const [create, setCreate] = useState<MarqueeState | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageAt = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const placeImage = useCallback((file: File, x: number, y: number) => {
    if (!file.type.startsWith('image/')) return
    const src = URL.createObjectURL(file)
    const el = newImageElement(src, [Math.round(x - 150), Math.round(y - 100), 300, 200])
    runCommand(addElementCmd(index, el))
    dispatch({ type: 'select', ids: [el.elementId] })
    setTool('select') // Figma-style: return to Move after committing
  }, [index, runCommand, dispatch, setTool])


  // paste image → new element at canvas center
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find(f => f.type.startsWith('image/'))
      if (!file) return
      e.preventDefault()
      placeImage(file, project.size[0] / 2, project.size[1] / 2)
    }
    addEventListener('paste', onPaste)
    return () => removeEventListener('paste', onPaste)
  }, [placeImage, project.size])

  // shape/line/icon: drag to draw (live preview via `create` state); icon click = default 64px box
  const startCreate = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect()
    const x0 = (e.clientX - r.left) / scale
    const y0 = (e.clientY - r.top) / scale
    let x1 = x0, y1 = y0
    const onMove = (ev: PointerEvent) => {
      x1 = (ev.clientX - r.left) / scale
      y1 = (ev.clientY - r.top) / scale
      setCreate({ x0, y0, x1, y1 })
    }
    const onUp = () => {
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
      setCreate(null)
      const b = rectBounds(x0, y0, x1, y1)
      let el: Element | undefined
      if (tool === 'icon') {
        el = newIconElement(iconName, b[2] < MIN_DRAG || b[3] < MIN_DRAG ? [Math.round(x0) - 32, Math.round(y0) - 32, 64, 64] : b)
      } else if (b[2] >= MIN_DRAG || b[3] >= MIN_DRAG) { // line: horizontal/vertical drag counts too; shape needs both axes
        el = tool === 'shape' ? newShapeElement(shapeName, b) : newLineElement(x0, y0, x1, y1)
      }
      if (!el) return // too tiny — treat as nothing
      runCommand(addElementCmd(index, el))
      dispatch({ type: 'select', ids: [el.elementId] })
      setTool('select')
    }
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)
  }

  const startImagePick = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect()
    imageAt.current = { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
    fileRef.current?.click()
  }

  // comment tool: submit/cancel the popover
  const closeComment = useCallback(() => { setCommentEl(null); setCommentText(''); setCommentedIds([]); setCommentAt(null) }, [])
  const submitComment = () => {
    if (!commentEl) return
    const fileName = project.pagePaths?.[index]?.split('/').pop() ?? `${index}.page`
    onComment?.(`${fileName}>${commentEl.elementId}`, commentText.trim() || undefined)
    setCommentedIds(ids => ids.includes(commentEl.elementId) ? ids : [...ids, commentEl.elementId])
    closeComment()
    setTool('select')
  }
  // leaving the comment tool closes any open popover
  useEffect(() => { if (tool !== 'comment') closeComment() }, [tool, closeComment])

  // --- move / marquee -----------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !canEdit) return
    if (tool === 'shape' || tool === 'line' || tool === 'icon') return startCreate(e)
    if (tool === 'image') return startImagePick(e)
    // comment tool: click a component → open comment popover (Figma-style)
    if (tool === 'comment') {
      const el = hit(e)
      setCommentEl(el ?? null)
      setCommentText('')
      setCommentAt(el ? [e.clientX, e.clientY] : null)
      return
    }
    const el = hit(e)
    if (el) {
      const additive = e.shiftKey
      if (additive) dispatch({ type: 'select', ids: [el.elementId], toggle: true }) // reducer: absent → add, present → remove
      else if (!selection.includes(el.elementId)) dispatch({ type: 'select', ids: [el.elementId] })
      const ids = additive
        ? (selection.includes(el.elementId) ? selection.filter(id => id !== el.elementId) : [...selection, el.elementId])
        : (selection.includes(el.elementId) ? selection : [el.elementId])
      if (!ids.length) return
      const sx = e.clientX
      const sy = e.clientY
      let moved = false
      const dragged = page.elements.filter(el => ids.includes(el.elementId))
      const others = page.elements.filter(el => !ids.includes(el.elementId))
      const targets = [...others.map(el => el.bounds), [0, 0, project.size[0], project.size[1]] as [number, number, number, number]]
      const onMove = (ev: PointerEvent) => {
        const dx = (ev.clientX - sx) / scale
        const dy = (ev.clientY - sy) / scale
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < MIN_DRAG) return
        moved = true
        // snap: union box of the dragged set vs other elements + page bounds
        const x0 = Math.min(...dragged.map(el => el.bounds[0] + dx))
        const y0 = Math.min(...dragged.map(el => el.bounds[1] + dy))
        const x1 = Math.max(...dragged.map(el => el.bounds[0] + el.bounds[2] + dx))
        const y1 = Math.max(...dragged.map(el => el.bounds[1] + el.bounds[3] + dy))
        const s = snapDelta([x0, y0, x1 - x0, y1 - y0], targets)
        setGesture({ kind: 'move', ids, dx: dx + s.dx, dy: dy + s.dy, guides: s.guides })
      }
      const onUp = (ev: PointerEvent) => {
        removeEventListener('pointermove', onMove)
        removeEventListener('pointerup', onUp)
        setGesture(null)
        if (moved) {
          // drop on a slide thumbnail → cross-page move
          const drop = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-slide]')
          const target = drop ? Number((drop as HTMLElement).dataset.slide) : NaN
          if (!Number.isNaN(target) && target !== index) {
            runCommand(crossPageMoveCmd(index, target, ids))
            dispatch({ type: 'deselect' })
            return
          }
          const dx = (ev.clientX - sx) / scale
          const dy = (ev.clientY - sy) / scale
          const x0 = Math.min(...dragged.map(el => el.bounds[0] + dx))
          const y0 = Math.min(...dragged.map(el => el.bounds[1] + dy))
          const x1 = Math.max(...dragged.map(el => el.bounds[0] + el.bounds[2] + dx))
          const y1 = Math.max(...dragged.map(el => el.bounds[1] + el.bounds[3] + dy))
          const s = snapDelta([x0, y0, x1 - x0, y1 - y0], targets)
          const rdx = Math.round(dx + s.dx)
          const rdy = Math.round(dy + s.dy)
          if (rdx || rdy) runCommand(moveCmd(index, ids, rdx, rdy))
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
    if (!canEdit) return
    const el = hit(e)
    if (el) {
      dispatch({ type: 'select', ids: [el.elementId] })
      if (el.elementType === 'text') dispatch({ type: 'startEdit', id: el.elementId })
    } else if (tool === 'select') {
      // double-click empty canvas → new text at point, in edit mode (Figma)
      const r = wrapRef.current!.getBoundingClientRect()
      const t = newTextElement((e.clientX - r.left) / scale, (e.clientY - r.top) / scale)
      runCommand(addElementCmd(index, t))
      dispatch({ type: 'select', ids: [t.elementId] })
      dispatch({ type: 'startEdit', id: t.elementId })
    }
  }

  // hover tracking; suppressed while something is selected or highlightHover is off
  const { highlightHover } = useDeckCtx()
  const hoverOn = highlightHover || (tool === 'comment' && !commentEl) // comment tool highlights while picking; once an object is picked, defer to the feature flag again
  const commentedOn = new Set([...commentedIds, commentEl?.elementId ?? ''])
  const hovered = hoverOn && !selection.length ? page.elements.find(el => el.elementId === hoveredId && !commentedOn.has(el.elementId)) : undefined
  const selEls = page.elements.filter(el => selection.includes(el.elementId))
  const single = selEls.length === 1 && selEls[0].elementId !== editingId ? selEls[0] : undefined
  const busy = gesture !== null

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 z-10"
      data-overlay="bg"
      style={{ cursor: busy ? 'grabbing' : !canEdit ? 'default' : tool === 'text' ? 'text' : tool !== 'select' ? 'crosshair' : hovered ? 'pointer' : 'default' }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        e.preventDefault()
        const file = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'))
        if (!file) return
        const r = wrapRef.current!.getBoundingClientRect()
        placeImage(file, (e.clientX - r.left) / scale, (e.clientY - r.top) / scale)
      }}
      onMouseMove={e => { if (!hoverOn) return; const el = hit(e); setHoveredId(el?.elementId ?? null) }}
      onMouseLeave={() => setHoveredId(null)}
    >
      {/* move live preview: translated outlines */}
      {gesture?.kind === 'move' && page.elements
        .filter(el => gesture.ids.includes(el.elementId))
        .map(el => (
          <div key={`drag-${el.elementId}`} className="pointer-events-none absolute border-2 border-accent" style={{ left: el.bounds[0], top: el.bounds[1], width: el.bounds[2], height: el.bounds[3], transform: `translate(${gesture.dx}px, ${gesture.dy}px)` }} aria-hidden="true" />
        ))}
      {/* smart guides (magenta) during snapped move */}
      {gesture?.kind === 'move' && gesture.guides.map((g, i) => g.axis === 'x'
        ? <div key={`gx${i}`} aria-hidden="true" className="pointer-events-none absolute top-0 h-full w-px bg-fuchsia-500" style={{ left: g.at }} />
        : <div key={`gy${i}`} aria-hidden="true" className="pointer-events-none absolute left-0 w-full h-px bg-fuchsia-500" style={{ top: g.at }} />)}
      {/* multi-selection: per-element outlines + group bounding box with 4 corner handles */}
      {(single ? [] : selEls).map(el => (
        <div key={`sel-${el.elementId}`} className="pointer-events-none absolute border-2 border-accent" style={{ left: el.bounds[0], top: el.bounds[1], width: el.bounds[2], height: el.bounds[3] }} aria-hidden="true" />
      ))}
      {!single && selEls.length > 1 && (() => {
        const b = selEls.reduce((acc, el) => [
          Math.min(acc[0], el.bounds[0]), Math.min(acc[1], el.bounds[1]),
          0, 0,
        ] as Bounds, [Infinity, Infinity, 0, 0])
        const x1 = Math.max(...selEls.map(e => e.bounds[0] + e.bounds[2]))
        const y1 = Math.max(...selEls.map(e => e.bounds[1] + e.bounds[3]))
        const gb: Bounds = gesture?.kind === 'resize' && gesture.id === '__group__'
          ? gesture.bounds : [b[0], b[1], x1 - b[0], y1 - b[1]]
        return (
          <div className="absolute" style={{ left: gb[0], top: gb[1], width: gb[2], height: gb[3] }}
            onPointerDownCapture={() => {}}>
            <div className="pointer-events-none absolute inset-0 border border-accent border-dashed" aria-hidden="true" />
            {(['nw', 'ne', 'se', 'sw'] as Handle[]).map(h => (
              <div key={h} role="presentation" aria-label={`Resize ${h}`}
                className="absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-accent bg-white"
                style={{ left: HANDLE_POS[h].left, top: HANDLE_POS[h].top, cursor: HANDLE_CURSOR[h] }}
                onPointerDown={e => startGroupResize(e, h)} />
            ))}
          </div>
        )
      })()}
      {/* single selection: box + 8 resize handles + rotation handle (text: no rotation per spec) */}
      {single && (() => {
        const g = gesture?.kind === 'resize' && gesture.id === single.elementId ? gesture
          : gesture?.kind === 'rotate' && gesture.id === single.elementId ? gesture : null
        const b = g?.kind === 'resize' ? g.bounds : single.bounds
        const rot = g?.kind === 'rotate' ? g.angle : ((single as { rotation?: number }).rotation ?? 0)
        const isText = single.elementType === 'text'
        return (
          <div
            className="absolute"
            style={{ left: b[0], top: b[1], width: b[2], height: b[3], transform: `rotate(${rot}deg)`, transformOrigin: 'center' }}
          >
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
      {/* persistent highlight: open popover target + already-commented elements */}
      {[...new Set([commentEl?.elementId, ...(tool === 'comment' ? commentedIds : [])])].map(id => id && page.elements.find(el => el.elementId === id)).filter((el): el is Element => !!el).map(el => (
        <div key={el.elementId} className="pointer-events-none absolute border-2 border-[#ff6900] bg-[#ff69001a]" style={{ left: el.bounds[0], top: el.bounds[1], width: el.bounds[2], height: el.bounds[3] }} aria-hidden="true" />
      ))}
      {/* marquee */}
      {marquee && (
        <div
          className="pointer-events-none absolute border border-accent bg-[#ff69001a]"
          style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }}
          aria-hidden="true"
        />
      )}
      {/* creation live preview (shape/line drag) */}
      {create && (
        <svg
          className="pointer-events-none absolute overflow-visible"
          style={{
            left: Math.min(create.x0, create.x1), top: Math.min(create.y0, create.y1),
            width: Math.max(1, Math.abs(create.x1 - create.x0)), height: Math.max(1, Math.abs(create.y1 - create.y0)),
          }}
          viewBox={`0 0 ${Math.max(1, Math.abs(create.x1 - create.x0))} ${Math.max(1, Math.abs(create.y1 - create.y0))}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {tool === 'line' ? (() => {
            const w = Math.abs(create.x1 - create.x0), h = Math.abs(create.y1 - create.y0)
            const sx = create.x1 < create.x0 ? w : 0, sy = create.y1 < create.y0 ? h : 0
            return <path d={linePath(`${sx},${sy} ${w - sx},${h - sy}`, undefined)} stroke="#f97316" strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" />
          })() : (
            <rect x={0.5} y={0.5} width={Math.max(1, Math.abs(create.x1 - create.x0)) - 1} height={Math.max(1, Math.abs(create.y1 - create.y0)) - 1} fill="#f973161f" stroke="#f97316" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      )}
      {/* comment popover (comment tool): portal to body, anchored at the click point; outside canvasWrap so its autofocus can't scroll/overflow the scaled canvas */}
      {commentEl && createPortal(
        <div
          className="fixed z-50 w-44 rounded-md border border-line bg-panel p-1.5 text-xs shadow-lg"
          style={{ left: commentAt?.[0], top: (commentAt?.[1] ?? 0) + 8 }}
          aria-label="Add comment"
          onPointerDown={e => e.stopPropagation()}
        >
          <div className="flex items-start gap-1">
            <textarea
              autoFocus
              className="h-8 min-w-0 flex-1 resize-none bg-transparent py-0.5 text-[11px] text-fg outline-none placeholder:text-muted"
              placeholder="Comment…"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() }
                if (e.key === 'Escape') { e.preventDefault(); closeComment() }
              }}
            />
            <button className="grid size-6 shrink-0 place-items-center rounded-md text-accent hover:bg-panel-raised" title="Post comment" onClick={submitComment}>
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>,
        document.body
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => {
        const f = e.target.files?.[0]
        if (f) placeImage(f, imageAt.current.x, imageAt.current.y)
        e.target.value = ''
      }} />
    </div>
  )
}

/** TextEditor mount helper — keeps Canvas.tsx thin. */
export function editingTextEl(page: { elements: Element[] }, editingId: string | null): TextElement | undefined {
  if (!editingId) return undefined
  const el = page.elements.find(e => e.elementId === editingId)
  return el && el.elementType === 'text' ? (el as TextElement) : undefined
}

