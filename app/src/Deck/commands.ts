/**
 * Editor commands — immutable project patches with an inverse (undo).
 * A command captures before/after at creation time from the current project.
 */
import type { Element, LoadedProject, Page, TextElement } from '../types'
import { moveBounds } from './helpers'

export interface Command {
  label: string
  do: (p: LoadedProject) => LoadedProject
  undo: (p: LoadedProject) => LoadedProject
}

const mapPage = (p: LoadedProject, i: number, fn: (pg: Page) => Page): LoadedProject => ({
  ...p,
  pages: p.pages.map((pg, j) => (j === i ? fn(pg) : pg)),
})

/** Replace one element with another version (same id); undo swaps back. */
export function snapshotCmd(pageIndex: number, before: Element, after: Element, label: string): Command {
  const swap = (p: LoadedProject, a: Element, b: Element) =>
    mapPage(p, pageIndex, pg => ({ ...pg, elements: pg.elements.map(e => (e.elementId === a.elementId ? b : e)) }))
  return { label, do: p => swap(p, before, after), undo: p => swap(p, after, before) }
}

/** Replace an element's text content. */
export function patchTextCmd(pageIndex: number, el: TextElement, text: string): Command {
  return snapshotCmd(pageIndex, el, { ...el, content: { ...el.content, text } }, 'edit text')
}

/** Move elements by canvas px. */
export function moveCmd(pageIndex: number, ids: string[], dx: number, dy: number): Command {
  const set = new Set(ids)
  const move = (p: LoadedProject, ddx: number, ddy: number) =>
    mapPage(p, pageIndex, pg => ({
      ...pg,
      elements: pg.elements.map(e => (set.has(e.elementId) ? { ...e, bounds: moveBounds(e.bounds, ddx, ddy) } : e)),
    }))
  return { label: 'move', do: p => move(p, dx, dy), undo: p => move(p, -dx, -dy) }
}

/** Append an element (creation); undo removes it. */
export function addElementCmd(pageIndex: number, el: Element): Command {
  return {
    label: 'add element',
    do: p => mapPage(p, pageIndex, pg => ({ ...pg, elements: [...pg.elements, el] })),
    undo: p => mapPage(p, pageIndex, pg => ({ ...pg, elements: pg.elements.filter(e => e.elementId !== el.elementId) })),
  }
}
