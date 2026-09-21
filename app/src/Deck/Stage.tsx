/**
 * DeckStage — centers canvas, RO → fitScale, click = replay (edit mode).
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { useDeckCtx } from './context'
import { fitScale } from './helpers'

// --- stage -------------------------------------------------------------------

export function DeckStage({ children }: { children: ReactNode }) {
  const { project, present, playing, replay, onSelect, setScale: setCtxScale } = useDeckCtx()
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

  return (
    <div
      ref={stageRef}
      className="flex h-full min-w-0 flex-1 items-center justify-center"
      onClick={() => {
        // click stage in edit mode → replay slide animations (PowerPoint-style)
        if (!onSelect && !present && !playing) replay()
      }}
    >
      {children}
    </div>
  )
}
