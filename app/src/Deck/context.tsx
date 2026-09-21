/**
 * Deck context — owned by Root, consumed by parts.
 */
import { createContext, useContext } from 'react'
import type { LoadedProject } from '../types'
import type { ComponentSelection } from '../select'

interface DeckCtx {
  project: LoadedProject
  index: number
  present: boolean
  scale: number
  playing: boolean
  playToken: number
  thumbW: number
  setScale: (s: number) => void
  setThumbW: (w: number) => void
  replay: () => void
  selectSlide: (i: number) => void
  onSelect?: (selection: ComponentSelection) => void
}

const Ctx = createContext<DeckCtx | null>(null)

function useDeckCtx(): DeckCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('Deck parts must be used inside <Deck.Root>')
  return ctx
}

export type { DeckCtx }
export { Ctx, useDeckCtx }
