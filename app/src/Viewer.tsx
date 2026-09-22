/**
 * Viewer — preset composition of the Deck building blocks.
 * Styling and part arrangement live here; logic lives in Deck.tsx.
 */
import { DeckRoot, DeckSlideList, DeckStage, DeckCanvas } from './Deck'
import type { LoadedProject } from './types'
import type { ComponentSelection } from './select'

export function Viewer({ project, index, onSelect, onSlideChange, onProjectChange, onComment, present = false }: {
  project: LoadedProject
  index: number
  onSelect?: (selection: ComponentSelection) => void
  onComment?: (componentRef: string, comment?: string) => void
  onSlideChange?: (index: number) => void
  onProjectChange?: (fn: (p: LoadedProject) => LoadedProject) => void
  present?: boolean
}) {
  return (
    <DeckRoot project={project} index={index} present={present} onSelect={onSelect} onSlideChange={onSlideChange} onProjectChange={onProjectChange} onComment={onComment}>
      <DeckSlideList />
      <DeckStage>
        <DeckCanvas />
      </DeckStage>
    </DeckRoot>
  )
}
