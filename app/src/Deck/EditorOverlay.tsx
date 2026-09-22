/**
 * EditorOverlay — canvas-coordinate layer owning ALL editor pointer interaction:
 * hover box, selection box + resize handles + rotation handle, click-select,
 * drag-move, marquee, double-click-to-edit. Renderers stay dumb.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { icons, type LucideIcon } from 'lucide-react'
import type { Element, TextElement } from '../types'
import { useDeckCtx } from './context'
import { addElementCmd, moveCmd, multiSnapshotCmd } from './commands'
import { localDelta, resizeBounds, snapAngle, normAngle, resizedElement, rectBounds, newTextElement, newShapeElement, newLineElement, newImageElement, newIconElement, MIN_SIZE, snapDelta, type Guide, type Bounds, type Handle } from './helpers'

const MIN_DRAG = 2 // px (screen) before a pointer press counts as a drag

/** Kebab lucide name → rendered glyph (icon picker). */
function IconPreview({ name }: { name: string }) {
  const Cmp = (icons as Record<string, LucideIcon>)[name.replace(/(^|[-])([a-z0-9])/g, (_, _s, c: string) => c.toUpperCase())]
  return Cmp ? <Cmp aria-hidden="true" className="size-4" /> : null
}
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
  const { project, index, scale, editor, dispatch, runCommand, tool, shapeName, setTool } = useDeckCtx()
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
  const [iconPick, setIconPick] = useState<{ x: number; y: number } | null>(null)
  const [iconQuery, setIconQuery] = useState('')
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

  const pickIcon = (name: string) => {
    const el = newIconElement(name, iconPick!.x, iconPick!.y)
    runCommand(addElementCmd(index, el))
    dispatch({ type: 'select', ids: [el.elementId] })
    setIconPick(null)
    setTool('select')
  }

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

  // shape/line: drag to draw (live preview via `create` state)
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
      if (b[2] < MIN_DRAG || b[3] < MIN_DRAG) return // too tiny — treat as nothing
      const el = tool === 'shape' ? newShapeElement(shapeName, b) : newLineElement(b)
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

  // --- move / marquee -----------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    if (tool === 'shape' || tool === 'line') return startCreate(e)
    if (tool === 'image') return startImagePick(e)
    if (tool === 'icon') {
      const r = wrapRef.current!.getBoundingClientRect()
      setIconQuery('')
      setIconPick({ x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale })
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
      style={{ cursor: busy ? 'grabbing' : tool === 'text' ? 'text' : tool !== 'select' ? 'crosshair' : hovered ? 'pointer' : 'default' }}
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
      onMouseMove={e => { const el = hit(e); setHoveredId(el?.elementId ?? null) }}
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
            draggable onDragStart={e => { e.dataTransfer.setData('application/x-pptd-ids', JSON.stringify(selection)); e.dataTransfer.effectAllowed = 'move' }}>
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
            draggable
            onDragStart={e => { e.dataTransfer.setData('application/x-pptd-ids', JSON.stringify(selection)); e.dataTransfer.effectAllowed = 'move' }}
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
        <div
          className="pointer-events-none absolute border-2 border-accent bg-[#ff69001a]"
          style={{ left: Math.min(create.x0, create.x1), top: Math.min(create.y0, create.y1), width: Math.abs(create.x1 - create.x0), height: Math.abs(create.y1 - create.y0) }}
          aria-hidden="true"
        />
      )}
      {/* icon search popover */}
      {iconPick && (
        <div
          role="dialog"
          aria-label="Pick an icon"
          className="absolute z-30 w-64 rounded-xl border border-line bg-panel p-2 shadow-lg"
          style={{ left: Math.min(iconPick.x, project.size[0] - 270), top: Math.min(iconPick.y, project.size[1] - 220) }}
        >
          <input
            autoFocus
            type="search"
            placeholder="Search icons…"
            className="mb-2 w-full rounded-md border border-line bg-transparent px-2 py-1 text-xs text-fg outline-none"
            value={iconQuery}
            onChange={e => setIconQuery(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Escape') setIconPick(null)
              if (e.key === 'Enter') {
                const first = ICONS.filter(n => n.includes(iconQuery.trim().toLowerCase()))[0]
                if (first) pickIcon(first)
              }
            }}
          />
          <div className="grid max-h-40 grid-cols-6 gap-1 overflow-auto">
            {ICONS.filter(n => n.includes(iconQuery.trim().toLowerCase())).slice(0, 48).map(n => (
              <button
                key={n}
                title={n}
                className="grid size-8 place-items-center rounded-md text-fg hover:bg-accent hover:text-zinc-900"
                onClick={() => pickIcon(n)}
              >
                <IconPreview name={n} />
              </button>
            ))}
          </div>
        </div>
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

// Common lucide icon names for the icon tool picker.
// ponytail: static ~60-name list; swap to live lucide metadata search if users need more.
const ICONS = [
  'house', 'user', 'users', 'settings', 'star', 'heart', 'search', 'mail',
  'phone', 'shopping-cart', 'truck', 'globe', 'calendar', 'clock', 'map-pin', 'bookmark',
  'flag', 'tag', 'bell', 'message-circle', 'send', 'link', 'lock', 'key',
  'shield-half', 'circle-check', 'circle-x', 'info', 'triangle-alert', 'plus', 'minus',
  'check', 'x', 'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down',
  'chart-line', 'chart-column', 'chart-pie', 'file', 'folder', 'image', 'video',
  'camera', 'music', 'play', 'code', 'bot', 'lightbulb', 'flame', 'trophy',
  'medal', 'gift', 'sun', 'moon', 'cloud', 'zap', 'leaf', 'car', 'plane',
  'rocket', 'wrench', 'briefcase', 'building', 'school', 'book', 'pen-line', 'pencil', 'trash', 'thumbs-up',
]
