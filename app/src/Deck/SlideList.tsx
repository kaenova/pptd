/**
 * DeckSlideList + DeckSlide — thumbnail sidebar.
 */
import { useEffect, useRef, useState } from 'react'
import { DeckView } from '../Renderer'
import { useDeckCtx } from './context'
import { thumbScale } from './helpers'
import { crossPageMoveCmd } from './commands'

// --- sidebar -----------------------------------------------------------------

export function DeckSlideList() {
  const { project, index, present, selectSlide, thumbW } = useDeckCtx()
  if (present) return null
  return (
    <aside className="flex w-[176px] max-sm:w-[128px] flex-none flex-col gap-2 border-r border-line-soft bg-panel p-3 select-none" aria-label="Slide previews">
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
  const { project, index, runCommand, dispatch } = useDeckCtx()
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
      className={`relative cursor-pointer rounded-lg border-2 bg-panel-raised p-1.5${active ? ' border-accent' : ' border-thumb'}`}
      onClick={e => { e.stopPropagation(); onClick() }}
      onDragOver={e => { if (e.dataTransfer.types.includes('application/x-pptd-ids') && slideIndex !== index) e.preventDefault() }}
      onDrop={e => {
        const ids = e.dataTransfer.getData('application/x-pptd-ids')
        if (!ids || slideIndex === index) return
        e.preventDefault(); e.stopPropagation()
        runCommand(crossPageMoveCmd(index, slideIndex, JSON.parse(ids)))
        dispatch({ type: 'deselect' })
      }}
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
