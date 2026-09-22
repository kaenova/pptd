/**
 * DeckRoot — smart root: owns scale/play/editor state, provides context.
 */
import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import type { LoadedProject } from '../types'
import type { ComponentSelection } from '../select'
import type { Command } from './commands'
import { Ctx, type Tool } from './context'
import { editorReducer, initialEditorState } from './editorState'

/** Feature flags for DeckRoot. */
export interface DeckFeatures {
  /** 'read' disables editing UI/commands; default 'edit' */
  mode?: 'read' | 'edit'
  /** highlight hovered elements on the canvas; default false */
  highlightHover?: boolean
}

export function DeckRoot({ project, index, present = false, features = {}, onSelect, onSlideChange, onProjectChange, onComment, children }: {
  project: LoadedProject
  index: number
  present?: boolean
  features?: DeckFeatures
  onComment?: (componentRef: string, comment?: string) => void
  onSelect?: (selection: ComponentSelection) => void
  onSlideChange?: (index: number) => void
  onProjectChange?: (fn: (p: LoadedProject) => LoadedProject) => void
  children: ReactNode
}) {
  const [scale, setScale] = useState(1)
  const [thumbW, setThumbW] = useState(112)
  const [playing, setPlaying] = useState(false)
  const [playToken, setPlayToken] = useState(0)
  const [tool, setTool] = useState<Tool>('select')
  const [shapeName, setShapeName] = useState('rect')
  const [iconName, setIconName] = useState('star')
  const [grid, setGrid] = useState(false)
  const [editor, dispatch] = useReducer(editorReducer, initialEditorState)

  // slide change / present toggle → back to static final; next stage click replays
  useEffect(() => { setPlaying(false) }, [index, present])
  // slide change → drop selection / editing (editor unmount commits text first)
  useEffect(() => { dispatch({ type: 'clear' }) }, [index])

  const replay = useCallback(() => { setPlayToken(t => t + 1); setPlaying(true) }, [])

  const runCommand = useCallback((cmd: Command) => {
    onProjectChange?.(cmd.do)
    dispatch({ type: 'commit', command: cmd })
  }, [onProjectChange])
  const undo = useCallback(() => {
    const cmd = editor.undoStack[editor.undoStack.length - 1]
    if (!cmd) return
    onProjectChange?.(cmd.undo)
    dispatch({ type: 'undo' })
  }, [editor.undoStack, onProjectChange])
  const redo = useCallback(() => {
    const cmd = editor.redoStack[editor.redoStack.length - 1]
    if (!cmd) return
    onProjectChange?.(cmd.do)
    dispatch({ type: 'redo' })
  }, [editor.redoStack, onProjectChange])

  const { mode = 'edit', highlightHover = false } = features
  const ctx = useMemo(() => ({
    project, index, present, scale, playing, playToken, thumbW, tool, shapeName, iconName, editor, grid, mode, highlightHover,
    setScale, setGrid,
    setThumbW,
    setTool,
    setShapeName,
    setIconName,
    dispatch,
    runCommand,
    undo,
    redo,
    patchProject: onProjectChange,
    replay,
    selectSlide: (i: number) => onSlideChange?.(i),
    onSelect,
    onComment,
  }), [project, index, present, scale, playing, playToken, thumbW, tool, shapeName, iconName, editor, grid, mode, highlightHover, runCommand, undo, redo, replay, onSlideChange, onProjectChange, onSelect, onComment])

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>
}
