/**
 * DeckTool — floating select/text palette over the stage (Figma-style).
 */
import { useEffect } from 'react'
import { useDeckCtx } from './context'

export function DeckTool() {
  const { present, tool, setTool } = useDeckCtx()

  // shortcuts: V select, T text
  useEffect(() => {
    if (present) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement
      if (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      if (e.key === 'v') setTool('select')
      if (e.key === 't') setTool('text')
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [present, setTool])

  if (present) return null
  const btn = (active: boolean) =>
    `grid size-8 place-items-center rounded-lg transition-colors ${active ? 'bg-accent text-zinc-900' : 'text-fg hover:bg-panel-raised'}`
  return (
    <div
      role="toolbar"
      aria-label="Deck tools"
      className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-line bg-panel p-1 shadow-lg"
    >
      <button className={btn(tool === 'select')} title="Select (V)" aria-pressed={tool === 'select'} onClick={() => setTool('select')}>
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
          <path d="M5 3l14 7.5-6.2 1.2 3.3 6.6-2.5 1.2-3.3-6.6L5 17.5z" />
        </svg>
      </button>
      <button className={btn(tool === 'text')} title="Text (T)" aria-pressed={tool === 'text'} onClick={() => setTool('text')}>
        <span className="text-sm font-bold leading-none">T</span>
      </button>
    </div>
  )
}
