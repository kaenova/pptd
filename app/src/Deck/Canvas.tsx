/**
 * DeckCanvas — scaled canvas wrap + DeckView.
 */
import { DeckView } from '../Renderer'
import type { LoadedProject, TextElement } from '../types'
import { useDeckCtx } from './context'
import { TextEditor } from './TextEditor'

/** Immutable patch: replace an element's text content. */
export function patchText(pageIndex: number, elementId: string, text: string) {
  return (p: LoadedProject): LoadedProject => ({
    ...p,
    pages: p.pages.map((pg, i) =>
      i !== pageIndex ? pg : { ...pg, elements: pg.elements.map(e => (e.elementId === elementId && e.elementType === 'text' ? { ...e, content: { ...e.content, text } } : e)) }),
  })
}

// --- canvas ------------------------------------------------------------------

export function DeckCanvas() {
  const { project, index, present, scale, playing, playToken, onSelect, tool, selectedId, editingId, setSelectedId, setEditingId, patchProject } = useDeckCtx()
  const [w, h] = project.size
  if (!project.pages[index]) return null
  const editActive = !present && tool === 'select' // playing only affects animation playback, not interaction
  const editingEl = editActive
    ? (project.pages[index].elements.find(e => e.elementId === editingId && e.elementType === 'text') as TextElement | undefined)
    : undefined
  return (
    <div
      id="canvasWrap"
      className={present ? 'flex-none overflow-hidden bg-white' : 'flex-none rounded-lg border border-zinc-700 shadow-[0_24px_70px_#0009]'}
      style={{ width: w, height: h, transform: `scale(${scale})`, position: 'relative', overflow: 'hidden', background: '#fff' }}
    >
      <DeckView
        key={`${present}-${playToken}`}
        project={project}
        index={index}
        onSelect={onSelect}
        static={!present && !playing}
        interactive={editActive}
        selectedId={editActive ? (selectedId ?? undefined) : undefined}
        editingId={editingEl ? (editingId ?? undefined) : undefined}
        onElementSelect={editActive && !editingEl ? el => setSelectedId(el.elementId) : undefined}
        onElementEdit={editActive && !editingEl ? el => {
          setSelectedId(el.elementId)
          if (el.elementType === 'text') setEditingId(el.elementId)
        } : undefined}
      />
      {editingEl && patchProject && (
        <TextEditor el={editingEl} onCommit={text => patchProject(patchText(index, editingEl.elementId, text))} onExit={() => setEditingId(null)} />
      )}
    </div>
  )
}
