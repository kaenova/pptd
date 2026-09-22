/**
 * DeckStage — centers canvas, RO → fitScale, click = replay (edit mode).
 */
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { useDeckCtx } from './context'
import { fitScale, newTextElement } from './helpers'
import { DeckTool } from './Tool'

// --- stage -------------------------------------------------------------------

export function DeckStage({ children }: { children: ReactNode }) {
  const { project, index, present, replay, onSelect, scale, tool, setTool, selectedId, setSelectedId, editingId, setEditingId, patchProject, setScale: setCtxScale } = useDeckCtx()
  const stageRef = useRef<HTMLDivElement>(null)

  // RO → fit(); scale lives in Root context so Canvas (and anything else) reads it
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const apply = () => {
      const box = { width: stage.clientWidth, height: stage.clientHeight }
      setCtxScale(fitScale(project.size, box, present))
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [project, present, setCtxScale])

  // text tool: click on canvas → new text element at click point (canvas coords), select + edit it
  const addTextAt = (e: MouseEvent) => {
    const wrap = (e.target as Element).closest('#canvasWrap')
    if (!wrap || !patchProject) return
    const r = wrap.getBoundingClientRect()
    const x = (e.clientX - r.left) / scale
    const y = (e.clientY - r.top) / scale
    const el = newTextElement(x, y)
    patchProject(p => ({
      ...p,
      pages: p.pages.map((pg, i) => (i === index ? { ...pg, elements: [...pg.elements, el] } : pg)),
    }))
    setSelectedId(el.elementId)
    setEditingId(el.elementId)
    setTool('select')
  }

  // Esc (outside the text editor, which stops its own keys) → drop selection
  useEffect(() => {
    if (present || !selectedId || editingId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [present, selectedId, editingId, setSelectedId])

  return (
    <div
      ref={stageRef}
      className={`relative flex h-full min-w-0 flex-1 items-center justify-center${tool === 'text' ? ' cursor-text' : ''}${!present ? ' select-none' : ''}`}
      onClick={e => {
        if (tool === 'text') addTextAt(e)
        // empty canvas with a selection → deselect; otherwise (re)start slide animations
        else if (selectedId && !editingId) setSelectedId(null)
        else if (!onSelect && !present) replay()
      }}
    >
      <DeckTool />
      {children}
    </div>
  )
}
