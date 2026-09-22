/**
 * DeckCanvas — scaled canvas wrap + DeckView + EditorOverlay + TextEditor.
 */
import { DeckView } from '../Renderer'
import { useDeckCtx } from './context'
import { patchTextCmd } from './commands'
import { TextEditor } from './TextEditor'
import { EditorOverlay, editingTextEl } from './EditorOverlay'

export function DeckCanvas() {
  const { project, index, present, scale, playing, playToken, onSelect, editor, dispatch, runCommand } = useDeckCtx()
  const [w, h] = project.size
  if (!project.pages[index]) return null
  const editActive = !present // overlay handles all tools (select + creation); playing only affects animation playback
  const editingEl = editActive ? editingTextEl(project.pages[index], editor.editingId) : undefined
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
        editingId={editingEl ? editor.editingId ?? undefined : undefined}
      />
      {editActive && !editingEl && <EditorOverlay />}
      {editingEl && (
        <TextEditor el={editingEl} onCommit={text => runCommand(patchTextCmd(index, editingEl, text))} onExit={() => dispatch({ type: 'startEdit', id: null })} />
      )}
    </div>
  )
}
