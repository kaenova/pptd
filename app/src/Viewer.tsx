import { useCallback, useEffect, useRef, useState } from 'react'
import type { LoadedProject } from './types'
import { DeckView } from './Renderer'
import type { ComponentSelection } from './select'

// Canvas: fixed-size page, scaled to fit the stage. Coordinates stay raw px.
export function Viewer({ project, index, onSelect, onSlideChange, present = false }: { project: LoadedProject; index: number; onSelect?: (selection: ComponentSelection) => void; onSlideChange?: (index: number) => void; present?: boolean }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLButtonElement>(null)
  const [scale, setScale] = useState(1)
  const [thumbW, setThumbW] = useState(112)

  const fit = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    const [w, h] = project.size
    // present: fill the screen edge-to-edge (cover); normal: fit with margin
    if (present) setScale(Math.max(stage.clientWidth / w, stage.clientHeight / h))
    else setScale(Math.min((stage.clientWidth - 40) / w, (stage.clientHeight - 40) / h, 1.5))
  }, [project.size, present])

  // re-observe after present mode unmounts/remounts the aside; guard the 0-width final RO event on unmount
  useEffect(() => {
    const el = thumbRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) setThumbW(el.clientWidth - 16) // minus p-1.5 + border-2
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [present])

  const [playToken, setPlayToken] = useState(0)
  const [playing, setPlaying] = useState(false)

  // slide change / present toggle → back to static final; next stage click replays animations
  useEffect(() => {
    setPlaying(false)
  }, [index, present])

  useEffect(() => {
    fit()
    const ro = new ResizeObserver(fit)
    if (stageRef.current) ro.observe(stageRef.current)
    return () => ro.disconnect()
  }, [fit])

  const page = project.pages[index]
  if (!page) return null
  const [w, h] = project.size

  return (
    <div className="flex h-full min-w-0 flex-1">
      {!present && (
        <aside className="flex w-[176px] max-sm:w-[128px] flex-none flex-col gap-2 border-r border-line-soft bg-panel p-3" aria-label="Slide previews">
        <h2 className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted">Slides</h2>
        <div className="flex flex-col gap-2 overflow-auto">
          {project.pages.map((_, slideIndex) => (
            <button
              key={slideIndex}
              ref={slideIndex === 0 ? thumbRef : undefined}
              type="button"
              className={`relative cursor-pointer rounded-lg border-2 bg-panel-raised p-1.5${slideIndex === index ? ' border-accent' : ' border-transparent hover:border-line'}`}
              onClick={event => {
                event.stopPropagation()
                onSlideChange?.(slideIndex)
              }}
            >
              <span
                className="relative block w-full overflow-hidden rounded"
                style={{ aspectRatio: `${w} / ${h}` }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    width: w,
                    height: h,
                    transform: `scale(${thumbW / w})`,
                    transformOrigin: 'top left',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    overflow: 'hidden',
                    background: '#fff',
                  }}
                >
                  <DeckView project={project} index={slideIndex} static />
                </div>
              </span>
              <span className="z-[2] block px-1.5 pb-1 pt-[3px] text-center text-[10px] text-dim">{slideIndex + 1}</span>
            </button>
          ))}
        </div>
        </aside>
      )}

      <div
        ref={stageRef}
        className="flex h-full min-w-0 flex-1 items-center justify-center"
        onClick={() => {
          // click stage in edit mode → replay slide animations from the start (PowerPoint-style preview)
          if (!onSelect && !present && !playing) {
            setPlayToken(t => t + 1)
            setPlaying(true)
          }
        }}
      >
        <div
          id="canvasWrap"
          className={present ? 'flex-none overflow-hidden bg-white' : 'flex-none rounded-lg border border-zinc-700 shadow-[0_24px_70px_#0009]'}
          style={{
            width: w,
            height: h,
            transform: `scale(${scale})`,
            position: 'relative',
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          <DeckView key={`${present}-${playToken}`} project={project} index={index} onSelect={onSelect} static={!present && !playing} />
        </div>
      </div>
    </div>
  )
}
