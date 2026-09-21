/**
 * Viewer — preset composition of the Deck building blocks.
 * Styling and part arrangement live here; logic lives in Deck.tsx.
 */
import { DeckRoot, DeckSlideList, DeckStage, DeckCanvas } from './Deck'
import type { LoadedProject } from './types'
import type { ComponentSelection } from './select'

export function Viewer({ project, index, onSelect, onSlideChange, present = false }: {
  project: LoadedProject
  index: number
  onSelect?: (selection: ComponentSelection) => void
  onSlideChange?: (index: number) => void
  present?: boolean
}) {
  return (
    <DeckRoot project={project} index={index} present={present} onSelect={onSelect} onSlideChange={onSlideChange}>
      <DeckSlideList />
      <DeckStage>
        <DeckCanvas />
      </DeckStage>
    </DeckRoot>
  )
}
