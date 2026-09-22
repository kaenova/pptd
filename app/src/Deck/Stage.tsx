/**
 * DeckStage — centers canvas, RO → fitScale, click = replay (edit mode).
 */
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { useDeckCtx } from './context'
import { fitScale, newTextElement } from './helpers'
import { addElementCmd } from './commands'
import { DeckTool } from './Tool'

export function DeckStage({ children }: { children: ReactNode }) {
  const { project, index, present, replay, onSelect, scale, tool, setTool, editor, dispatch, runCommand, setScale: setCtxScale } = useDeckCtx()
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
    if (!wrap) return
    const r = wrap.getBoundingClientRect()
    const x = (e.clientX - r.left) / scale
    const y = (e.clientY - r.top) / scale
    const el = newTextElement(x, y)
    runCommand(addElementCmd(index, el))
    dispatch({ type: 'select', ids: [el.elementId] })
    dispatch({ type: 'startEdit', id: el.elementId })
    setTool('select')
  }

  // Esc (outside the text editor, which stops its own keys) → drop selection
  useEffect(() => {
    if (present || !editor.selection.length || editor.editingId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch({ type: 'deselect' })
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [present, editor, dispatch])

  return (
    <div
      ref={stageRef}
      className={`relative flex h-full min-w-0 flex-1 items-center justify-center${tool === 'text' ? ' cursor-text' : ''}${!present ? ' select-none' : ''}`}
      onClick={e => {
        if (tool === 'text') addTextAt(e)
        // overlay handles deselect; replay only when nothing is selected
        else if (!editor.selection.length && !onSelect && !present) replay()
      }}
    >
      <DeckTool />
      {children}
    </div>
  )
}
