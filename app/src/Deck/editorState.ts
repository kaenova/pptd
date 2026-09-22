/**
 * Editor state — reducer + command history (undo/redo) for selection and edits.
 * Pure logic; Root wires dispatch → onProjectChange.
 */
import type { Command } from './commands'

export interface EditorState {
  selection: string[]
  editingId: string | null
  undoStack: Command[]
  redoStack: Command[]
}

export const initialEditorState: EditorState = { selection: [], editingId: null, undoStack: [], redoStack: [] }

export type EditorAction =
  | { type: 'select'; ids: string[]; toggle?: boolean }
  | { type: 'deselect' }
  | { type: 'startEdit'; id: string | null }
  | { type: 'clear' } // slide change: drop selection+editing
  | { type: 'commit'; command: Command }
  | { type: 'undo' }
  | { type: 'redo' }

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'select': {
      if (a.toggle) {
        const next = s.selection.includes(a.ids[0])
          ? s.selection.filter(id => !a.ids.includes(id))
          : [...s.selection, ...a.ids.filter(id => !s.selection.includes(id))]
        return { ...s, selection: next, editingId: next.length === 1 ? s.editingId : null }
      }
      return { ...s, selection: a.ids, editingId: a.ids.length === 1 ? s.editingId : null }
    }
    case 'deselect':
      return { ...s, selection: [], editingId: null }
    case 'startEdit':
      return { ...s, editingId: a.id }
    case 'clear':
      return { ...s, selection: [], editingId: null }
    case 'commit':
      return { ...s, undoStack: [...s.undoStack, a.command].slice(-100), redoStack: [] }
    case 'undo': {
      const cmd = s.undoStack[s.undoStack.length - 1]
      if (!cmd) return s
      return { ...s, undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, cmd] }
    }
    case 'redo': {
      const cmd = s.redoStack[s.redoStack.length - 1]
      if (!cmd) return s
      return { ...s, redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, cmd] }
    }
  }
}
