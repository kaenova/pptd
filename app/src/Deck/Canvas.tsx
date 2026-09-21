/**
 * DeckCanvas — scaled canvas wrap + DeckView.
 */
import { DeckView } from '../Renderer'
import { useDeckCtx } from './context'

// --- canvas ------------------------------------------------------------------

export function DeckCanvas() {
  const { project, index, present, scale, playing, playToken, onSelect } = useDeckCtx()
  const [w, h] = project.size
  if (!project.pages[index]) return null
  return (
    <div
      id="canvasWrap"
      className={present ? 'flex-none overflow-hidden bg-white' : 'flex-none rounded-lg border border-zinc-700 shadow-[0_24px_70px_#0009]'}
      style={{ width: w, height: h, transform: `scale(${scale})`, position: 'relative', overflow: 'hidden', background: '#fff' }}
    >
      <DeckView key={`${present}-${playToken}`} project={project} index={index} onSelect={onSelect} static={!present && !playing} />
    </div>
  )
}
