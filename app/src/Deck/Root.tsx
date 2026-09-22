/**
 * DeckRoot — smart root: owns scale/play/thumb state, provides context.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { LoadedProject } from '../types'
import type { ComponentSelection } from '../select'
import type { Tool } from './context'
import { Ctx } from './context'

export function DeckRoot({ project, index, present = false, onSelect, onSlideChange, onProjectChange, children }: {
  project: LoadedProject
  index: number
  present?: boolean
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  // slide change / present toggle → back to static final; next stage click replays
  useEffect(() => { setPlaying(false) }, [index, present])
  // slide change → drop selection / editing (editor unmount commits text first)
  useEffect(() => { setSelectedId(null); setEditingId(null) }, [index])

  const replay = useCallback(() => { setPlayToken(t => t + 1); setPlaying(true) }, [])

  const ctx = useMemo(() => ({
    project, index, present, scale, playing, playToken, thumbW, tool, selectedId, editingId,
    setScale,
    setThumbW,
    setTool,
    setSelectedId,
    setEditingId,
    patchProject: onProjectChange,
    replay,
    selectSlide: (i: number) => onSlideChange?.(i),
    onSelect,
  }), [project, index, present, scale, playing, playToken, thumbW, tool, selectedId, editingId, replay, onSlideChange, onProjectChange, onSelect])

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>
}
