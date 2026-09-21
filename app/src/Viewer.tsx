import { useCallback, useEffect, useRef, useState } from 'react'
import type { LoadedProject } from './types'
import { DeckView } from './Renderer'
import type { ComponentSelection } from './select'

// Canvas: fixed-size page, scaled to fit the stage. Coordinates stay raw px.
export function Viewer({ project, index, onSelect, onSlideChange }: { project: LoadedProject; index: number; onSelect?: (selection: ComponentSelection) => void; onSlideChange?: (index: number) => void }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  const fit = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    const [w, h] = project.size
    setScale(Math.min((stage.clientWidth - 40) / w, (stage.clientHeight - 40) / h, 1.5))
  }, [project.size])

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
    <div className="pptd-preview">
      <aside className="slide-rail" aria-label="Slide previews">
        <h2 className="slide-rail-heading">Slides</h2>
        <div className="thumbs">
          {project.pages.map((_, slideIndex) => (
            <button
              key={slideIndex}
              type="button"
              className={`thumb${slideIndex === index ? ' active' : ''}`}
              onClick={event => {
                event.stopPropagation()
                onSlideChange?.(slideIndex)
              }}
            >
              <span
                className="thumb-canvas"
                style={{ height: (112 * h) / w }}
              >
                <div
                  className="mini"
                  aria-hidden="true"
                  style={{
                    width: w,
                    height: h,
                    transform: `scale(${112 / w})`,
                    transformOrigin: 'top left',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    overflow: 'hidden',
                    background: '#fff',
                  }}
                >
                  <DeckView project={project} index={slideIndex} />
                </div>
              </span>
              <span className="no">{slideIndex + 1}</span>
            </button>
          ))}
        </div>
      </aside>

      <div ref={stageRef} className="stage">
        <div
          id="canvasWrap"
          style={{
            width: w,
            height: h,
            transform: `scale(${scale})`,
            position: 'relative',
            overflow: 'hidden',
            background: '#fff',
            boxShadow: '0 8px 40px #000a',
          }}
        >
          <DeckView project={project} index={index} onSelect={onSelect} />
        </div>
      </div>
    </div>
  )
}
