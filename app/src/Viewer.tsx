import { useCallback, useEffect, useRef, useState } from 'react'
import type { LoadedProject } from './types'
import { DeckView } from './Renderer'

// Canvas: fixed-size page, scaled to fit the stage. Coordinates stay raw px
// (origin top-left); scale is pure CSS transform, zero coordinate math.
export function Viewer({ project, index }: { project: LoadedProject; index: number }) {
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
    <div ref={stageRef} className="stage">
      <div
        id="canvasWrap"
        style={{ width: w, height: h, transform: `scale(${scale})`, position: 'relative', overflow: 'hidden', background: '#fff', boxShadow: '0 8px 40px #000a' }}
      >
        <DeckView project={project} index={index} />
      </div>
    </div>
  )
}
