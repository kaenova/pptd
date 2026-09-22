/**
 * Deck context — owned by Root, consumed by parts.
 */
import { createContext, useContext } from 'react'
import type { LoadedProject } from '../types'
import type { ComponentSelection } from '../select'

/** Active edit tool (Figma-style). */
export type Tool = 'select' | 'text'

interface DeckCtx {
  project: LoadedProject
  index: number
  present: boolean
  scale: number
  playing: boolean
  playToken: number
  thumbW: number
  tool: Tool
  selectedId: string | null
  editingId: string | null
  setScale: (s: number) => void
  setThumbW: (w: number) => void
  setTool: (t: Tool) => void
  setSelectedId: (id: string | null) => void
  setEditingId: (id: string | null) => void
  /** Patch the loaded project (page/element edits). Undefined in read-only decks. */
  patchProject?: (fn: (p: LoadedProject) => LoadedProject) => void
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
