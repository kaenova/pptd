/**
 * Previewer context — owned by Root, consumed by parts.
 */
import { createContext, useContext } from 'react'
import type { PreviewKind } from './helpers'

interface PreviewCtx {
  file: string
  kind: PreviewKind
  content: string
  error: string
  language: string
  imgSrc: string | null
  close: () => void
}

const Ctx = createContext<PreviewCtx | null>(null)

function useCtx(): PreviewCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('Previewer parts must be used inside <Previewer.Root>')
  return ctx
}

export type { PreviewCtx }
export { Ctx, useCtx }
