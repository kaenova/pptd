/**
 * DeckStage — centers canvas, RO → fitScale, click = replay (edit mode).
 */
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { useDeckCtx } from './context'
import { fitScale, newTextElement } from './helpers'
import { addElementCmd, deleteCmd, duplicateCmd, reorderCmd, moveCmd } from './commands'
import { DeckTool } from './Tool'

// internal copy/paste clipboard (elements); module-level survives re-renders
// ponytail: not a clipboard API integration — system copy of elements out of scope
let clipboard: import('../types').Element[] = []

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

  // editor keys: Esc deselect, Delete/Backspace delete, Ctrl+D duplicate, [/] layer, Ctrl+C/V copy/paste
  const selectionEls = project.pages[index]?.elements.filter(e => editor.selection.includes(e.elementId)) ?? []
  useEffect(() => {
    if (present) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
      const sel = editor.selection
      if (!sel.length) return
      if (e.key === 'Escape') dispatch({ type: 'deselect' })
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        if (dx || dy) runCommand(moveCmd(index, sel, dx, dy))
      }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); runCommand(deleteCmd(index, sel)); dispatch({ type: 'deselect' }) }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); runCommand(duplicateCmd(index, selectionEls)) }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') { clipboard = selectionEls }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        if (!clipboard.length) return
        e.preventDefault()
        runCommand(duplicateCmd(index, clipboard))
      }
      else if (e.key === ']') { e.preventDefault(); runCommand(reorderCmd(index, sel, e.shiftKey ? 'front' : 'forward')) }
      else if (e.key === '[') { e.preventDefault(); runCommand(reorderCmd(index, sel, e.shiftKey ? 'back' : 'backward')) }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [present, index, editor, dispatch, runCommand, selectionEls])

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
