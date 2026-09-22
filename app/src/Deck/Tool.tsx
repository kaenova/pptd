/**
 * DeckTool — floating tool palette over the stage (Figma-style).
 * Shape button opens a picker of the 12 common geometry presets.
 */
import { useEffect, useRef, useState } from 'react'
import { useDeckCtx } from './context'

const SHAPES = [
  'rect', 'roundRect', 'ellipse', 'triangle', 'rtTriangle', 'diamond',
  'parallelogram', 'trapezoid', 'pentagon', 'hexagon', 'rightArrow', 'star5',
] as const

export function DeckTool() {
  const { present, tool, setTool, shapeName, setShapeName, undo, redo, editor } = useDeckCtx()
  const [open, setOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  // shortcuts: V select, T text, R shape, L line, I image; Ctrl/Cmd+Z undo, +Shift redo
  useEffect(() => {
    if (present) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'v') setTool('select')
      if (e.key === 't') setTool('text')
      if (e.key === 'r') { setTool('shape'); setOpen(true) }
      if (e.key === 'l') setTool('line')
      if (e.key === 'i') setTool('image')
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [present, setTool, undo, redo])

  // close shape picker on outside click
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!barRef.current?.contains(e.target as Node)) setOpen(false) }
    addEventListener('pointerdown', close)
    return () => removeEventListener('pointerdown', close)
  }, [open])

  if (present) return null
  const btn = (active: boolean) =>
    `grid size-8 place-items-center rounded-lg transition-colors ${active ? 'bg-accent text-zinc-900' : 'text-fg hover:bg-panel-raised'}`
  return (
    <div ref={barRef} className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 flex-col items-center gap-1">
      <div
        role="toolbar"
        aria-label="Deck tools"
        className="flex items-center gap-1 rounded-xl border border-line bg-panel p-1 shadow-lg"
      >
        <button className={btn(tool === 'select')} title="Select (V)" aria-pressed={tool === 'select'} onClick={() => setTool('select')}>
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
            <path d="M5 3l14 7.5-6.2 1.2 3.3 6.6-2.5 1.2-3.3-6.6L5 17.5z" />
          </svg>
        </button>
        <button className={btn(tool === 'text')} title="Text (T)" aria-pressed={tool === 'text'} onClick={() => setTool('text')}>
          <span className="text-sm font-bold leading-none">T</span>
        </button>
        <button className={btn(tool === 'shape')} title="Shape (R)" aria-pressed={tool === 'shape'} onClick={() => { setTool('shape'); setOpen(o => !o) }}>
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
        </button>
        <button className={btn(tool === 'line')} title="Line (L)" aria-pressed={tool === 'line'} onClick={() => setTool('line')}>
          <svg viewBox="0 0 24 24" className="size-4" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="4" y1="20" x2="20" y2="4" />
          </svg>
        </button>
        <button className={btn(tool === 'image')} title="Image (I)" aria-pressed={tool === 'image'} onClick={() => setTool('image')}>
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
            <path d="M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zm1 13h12l-3.9-5-2.9 3.8L9.5 13zM8 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
          </svg>
        </button>
        <button className={btn(tool === 'icon')} title="Icon" aria-pressed={tool === 'icon'} onClick={() => setTool('icon')}>
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 3.5a1.75 1.75 0 110 3.5 1.75 1.75 0 010-3.5zM9 11h6a1 1 0 011 1v1.5a1 1 0 01-2 0V13h-2v6a1.5 1.5 0 01-3 0v-2.2a1.3 1.3 0 010-2.6V17h1.5v-4.7A1.3 1.3 0 019 11z" />
          </svg>
        </button>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        <button className={`${btn(false)} ${!editor.undoStack.length ? 'opacity-30' : ''}`} title="Undo (Ctrl+Z)" disabled={!editor.undoStack.length} onClick={undo}>
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
            <path d="M9 7H5a8 8 0 118 8h-2v-2h2a6 6 0 10-6-6h4v2l4-3.5L9 3z" />
          </svg>
        </button>
        <button className={`${btn(false)} ${!editor.redoStack.length ? 'opacity-30' : ''}`} title="Redo (Ctrl+Shift+Z)" disabled={!editor.redoStack.length} onClick={redo}>
          <svg viewBox="0 0 24 24" className="size-4 rotate-180" fill="currentColor" aria-hidden="true">
            <path d="M9 7H5a8 8 0 118 8h-2v-2h2a6 6 0 10-6-6h4v2l4-3.5L9 3z" />
          </svg>
        </button>
      </div>
      {open && tool === 'shape' && (
        <div role="listbox" aria-label="Shape presets" className="grid grid-cols-6 gap-1 rounded-xl border border-line bg-panel p-2 shadow-lg">
          {SHAPES.map(s => (
            <button
              key={s}
              role="option"
              aria-selected={shapeName === s}
              title={s}
              className={`size-9 rounded-lg ${shapeName === s ? 'bg-accent text-zinc-900' : 'hover:bg-panel-raised text-fg'}`}
              onClick={() => { setShapeName(s); setOpen(false) }}
            >
              <svg viewBox="0 0 20 20" className="size-full p-1" fill="currentColor" aria-hidden="true">
                {s === 'rect' && <rect x="2" y="4" width="16" height="12" />}
                {s === 'roundRect' && <rect x="2" y="4" width="16" height="12" rx="3" />}
                {s === 'ellipse' && <ellipse cx="10" cy="10" rx="8" ry="6" />}
                {s === 'triangle' && <path d="M10 3l8 14H2z" />}
                {s === 'rtTriangle' && <path d="M3 17V3l14 14z" />}
                {s === 'diamond' && <path d="M10 2l8 8-8 8-8-8z" />}
                {s === 'parallelogram' && <path d="M6 4h12l-4 12H2z" />}
                {s === 'trapezoid' && <path d="M5 5h10l3 10H2z" />}
                {s === 'pentagon' && <path d="M10 2l8 6-3 10H5L2 8z" />}
                {s === 'hexagon' && <path d="M7 3h6l4 7-4 7H7l-4-7z" />}
                {s === 'rightArrow' && <path d="M2 7h10V4l6 6-6 6v-3H2z" />}
                {s === 'star5' && <path d="M10 2l2.4 5.2L18 8l-4 3.8 1 5.2-5-2.8-5 2.8 1-5.2L2 8l5.6-.8z" />}
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
