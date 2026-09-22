/**
 * DeckSlideList + DeckSlide — thumbnail sidebar.
 */
import { useEffect, useRef, useState } from 'react'
import { DeckView } from '../Renderer'
import { useDeckCtx } from './context'
import { thumbScale } from './helpers'
import { useDragResize } from '../useDragResize'

// --- sidebar -----------------------------------------------------------------

export function DeckSlideList() {
  const { project, index, present, mode, selectSlide, thumbW } = useDeckCtx()
  const [width, onResize] = useDragResize(176, 'x', 128, 480) // handle on right edge — drag right = wider
  if (present || mode !== 'edit') return null
  return (
    <aside style={{ width }} className="relative flex flex-none flex-col gap-2 border-r border-line-soft bg-panel p-3 select-none" aria-label="Slide previews">
      <div className="group absolute inset-y-0 right-0 w-1.5 cursor-col-resize translate-x-1/2" onPointerDown={onResize} role="separator" aria-orientation="vertical">
        <div className="absolute inset-y-0 left-0 w-px bg-line group-hover:bg-accent" />
      </div>
      <h2 className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted">Slides</h2>
      <div className="flex flex-col gap-2 overflow-auto">
        {project.pages.map((_, i) => (
          <DeckSlide key={i} slideIndex={i} thumbW={thumbW} active={i === index} onClick={() => selectSlide(i)} />
        ))}
      </div>
    </aside>
  )
}

function DeckSlide({ slideIndex, thumbW, active, onClick }: {
  slideIndex: number
  thumbW: number
  active: boolean
  onClick: () => void
}) {
  const { project } = useDeckCtx()
  const btnRef = useRef<HTMLButtonElement>(null)
  const [measured, setMeasured] = useState(thumbW)
  const setThumbW = useDeckCtx().setThumbW
  // measure own width (RO) — every thumb measures itself; first one seeds thumbW
  useEffect(() => {
    const el = btnRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) {
        setMeasured(el.clientWidth)
        setThumbW(el.clientWidth) // shared fallback while RO warms up
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [w, h] = project.size
  return (
    <button
      ref={btnRef}
      type="button"
      data-slide={slideIndex}
      className={`relative cursor-pointer rounded-lg border-2 bg-panel-raised p-1.5${active ? ' border-accent' : ' border-thumb'}`}
      onClick={e => { e.stopPropagation(); onClick() }}
    >
      <span className="relative block w-full overflow-hidden rounded" style={{ aspectRatio: `${w} / ${h}` }}>
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 block overflow-hidden bg-white"
          style={{ width: w, height: h, transform: `scale(${thumbScale(measured || thumbW, w)})`, transformOrigin: 'top left' }}
        >
          <DeckView project={project} index={slideIndex} static />
        </span>
      </span>
      <span className="z-[2] block px-1.5 pb-1 pt-[3px] text-center text-[10px] text-dim">{slideIndex + 1}</span>
    </button>
  )
}
