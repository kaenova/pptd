import { describe, it } from 'bun:test'
import { strict as assert } from 'assert'
import { editorReducer, initialEditorState } from '../src/Deck/editorState'
import { patchTextCmd, moveCmd, addElementCmd, snapshotCmd } from '../src/Deck/commands'
import { newTextElement } from '../src/Deck/helpers'
import type { Element, LoadedProject } from '../src/types'

const el = (id: string, x = 0, y = 0): Element => ({ elementId: id, elementType: 'text', bounds: [x, y, 100, 50], content: { text: 'hi' } } as Element)
const page = (...els: Element[]) => ({ pageId: 'p1', pageType: 'cover', elements: els, animations: [] } as LoadedProject['pages'][number])
const project = (...els: Element[]): LoadedProject => ({ title: 't', size: [960, 540], theme: { colors: {} } as never, pages: [page(...els)] } as LoadedProject)

describe('editorReducer', () => {
  it('select/toggle/deselect/clear', () => {
    let s = editorReducer(initialEditorState, { type: 'select', ids: ['a'] })
    assert.deepEqual(s.selection, ['a'])
    s = editorReducer(s, { type: 'select', ids: ['b'], toggle: true })
    assert.deepEqual(s.selection, ['a', 'b'])
    s = editorReducer(s, { type: 'select', ids: ['a'], toggle: true })
    assert.deepEqual(s.selection, ['b'])
    s = editorReducer(s, { type: 'deselect' })
    assert.deepEqual(s.selection, [])
    s = editorReducer(s, { type: 'select', ids: ['a'] })
    s = editorReducer(s, { type: 'clear' })
    assert.deepEqual(s.selection, [])
    assert.equal(s.editingId, null)
  })
  it('multi-select clears editingId; single keeps', () => {
    let s = editorReducer(initialEditorState, { type: 'startEdit', id: 'a' })
    assert.equal(s.editingId, 'a')
    s = editorReducer(s, { type: 'select', ids: ['a', 'b'] })
    assert.equal(s.editingId, null)
    s = editorReducer(s, { type: 'startEdit', id: 'a' })
    s = editorReducer(s, { type: 'select', ids: ['a'] })
    assert.equal(s.editingId, 'a')
  })
})

describe('command history', () => {
  it('commit/undo/redo cycle restores project', () => {
    const cmd = moveCmd(0, ['a'], 10, 5)
    let s = editorReducer(initialEditorState, { type: 'commit', command: cmd })
    assert.equal(s.undoStack.length, 1)
    assert.equal(s.redoStack.length, 0)
    s = editorReducer(s, { type: 'undo' })
    assert.equal(s.undoStack.length, 0)
    assert.equal(s.redoStack.length, 1)
    s = editorReducer(s, { type: 'redo' })
    assert.equal(s.undoStack.length, 1)
    assert.equal(s.redoStack.length, 0)
  })
  it('commit clears redo stack', () => {
    let s = editorReducer(initialEditorState, { type: 'commit', command: moveCmd(0, ['a'], 1, 1) })
    s = editorReducer(s, { type: 'undo' })
    s = editorReducer(s, { type: 'commit', command: moveCmd(0, ['a'], 2, 2) })
    assert.equal(s.redoStack.length, 0)
  })
  it('undo/redo on empty stacks is a no-op', () => {
    const s = editorReducer(initialEditorState, { type: 'undo' })
    assert.equal(s, initialEditorState)
  })
})

describe('commands', () => {
  it('moveCmd moves and inverts', () => {
    const cmd = moveCmd(0, ['a', 'b'], 10, -5)
    const after = cmd.do(project(el('a'), el('b', 50, 50), el('c')))
    assert.deepEqual(after.pages[0].elements[0].bounds, [10, -5, 100, 50])
    assert.deepEqual(after.pages[0].elements[1].bounds, [60, 45, 100, 50])
    assert.deepEqual(after.pages[0].elements[2].bounds, [0, 0, 100, 50]) // untouched
    const back = cmd.undo(after)
    assert.deepEqual(back.pages[0].elements[0].bounds, [0, 0, 100, 50])
  })
  it('addElementCmd adds then removes', () => {
    const t = newTextElement(100, 100)
    const cmd = addElementCmd(0, t)
    const after = cmd.do(project(el('a')))
    assert.equal(after.pages[0].elements.length, 2)
    assert.equal(after.pages[0].elements[1].elementId, t.elementId)
    const back = cmd.undo(after)
    assert.equal(back.pages[0].elements.length, 1)
  })
  it('patchTextCmd round-trips text', () => {
    const e = el('a') as Extract<Element, { elementType: 'text' }>
    const cmd = patchTextCmd(0, e, 'new text')
    const after = cmd.do(project(el('a')))
    const t = after.pages[0].elements[0] as typeof e
    assert.equal(t.content.text, 'new text')
    assert.equal((cmd.undo(after).pages[0].elements[0] as typeof e).content.text, 'hi')
  })
  it('snapshotCmd swaps by id', () => {
    const before = el('a')
    const after = { ...before, bounds: [5, 6, 7, 8] as [number, number, number, number] }
    const cmd = snapshotCmd(0, before, after, 'resize')
    const p1 = cmd.do(project(before, el('z')))
    assert.deepEqual(p1.pages[0].elements[0].bounds, [5, 6, 7, 8])
    assert.deepEqual(p1.pages[0].elements[1].bounds, [0, 0, 100, 50])
    assert.deepEqual(cmd.undo(p1).pages[0].elements[0].bounds, [0, 0, 100, 50])
  })
})
