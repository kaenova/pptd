/**
 * Deck context — owned by Root, consumed by parts.
 */
import { createContext, useContext } from 'react'
import type { LoadedProject } from '../types'
import type { ComponentSelection } from '../select'
import type { Command } from './commands'
import type { EditorAction, EditorState } from './editorState'

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
  editor: EditorState
  setScale: (s: number) => void
  setThumbW: (w: number) => void
  setTool: (t: Tool) => void
  dispatch: (a: EditorAction) => void
  /** Apply a command to the project and push it onto history. No-op in read-only decks. */
  runCommand: (cmd: Command) => void
  undo: () => void
  redo: () => void
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
