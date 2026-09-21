/**
 * DeckRoot — smart root: owns scale/play/thumb state, provides context.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { LoadedProject } from '../types'
import type { ComponentSelection } from '../select'
import { Ctx } from './context'

export function DeckRoot({ project, index, present = false, onSelect, onSlideChange, children }: {
  project: LoadedProject
  index: number
  present?: boolean
  onSelect?: (selection: ComponentSelection) => void
  onSlideChange?: (index: number) => void
  children: ReactNode
}) {
  const [scale, setScale] = useState(1)
  const [thumbW, setThumbW] = useState(112)
  const [playing, setPlaying] = useState(false)
  const [playToken, setPlayToken] = useState(0)

  // slide change / present toggle → back to static final; next stage click replays
  useEffect(() => { setPlaying(false) }, [index, present])

  const replay = useCallback(() => { setPlayToken(t => t + 1); setPlaying(true) }, [])

  const ctx = useMemo(() => ({
    project, index, present, scale, playing, playToken, thumbW,
    setScale,
    setThumbW,
    replay,
    selectSlide: (i: number) => onSlideChange?.(i),
    onSelect,
  }), [project, index, present, scale, playing, playToken, thumbW, replay, onSlideChange, onSelect])

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>
}
