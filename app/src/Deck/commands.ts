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

/** Replace several elements with new versions (resize/rotate/etc.); undo swaps back. */
export function multiSnapshotCmd(pageIndex: number, before: Element[], after: Element[], label: string): Command {
  const map = new Map(after.map(e => [e.elementId, e]))
  const swap = (p: LoadedProject) =>
    mapPage(p, pageIndex, pg => ({ ...pg, elements: pg.elements.map(e => map.get(e.elementId) ?? e) }))
  const beforeMap = new Map(before.map(e => [e.elementId, e]))
  return {
    label,
    do: swap,
    undo: p => mapPage(p, pageIndex, pg => ({ ...pg, elements: pg.elements.map(e => beforeMap.get(e.elementId) ?? e) })),
  }
}

/** Layer reorder: move ids to front/back/forward/backward. Undo restores prior order. */
export function reorderCmd(pageIndex: number, ids: string[], dir: 'front' | 'back' | 'forward' | 'backward'): Command {
  const reorder = (elements: Element[]): Element[] => {
    const set = new Set(ids)
    const picked = elements.filter(e => set.has(e.elementId))
    const rest = elements.filter(e => !set.has(e.elementId))
    if (dir === 'front') return [...rest, ...picked]
    if (dir === 'back') return [...picked, ...rest]
    const next = [...elements]
    for (const el of picked) {
      const i = next.indexOf(el)
      const j = dir === 'forward' ? Math.min(next.length - 1, i + 1) : Math.max(0, i - 1)
      next.splice(i, 1)
      next.splice(j, 0, el)
    }
    return next
  }
  const undoSnapshot: Element[][] = []
  return {
    label: `reorder ${dir}`,
    do: p => {
      const before = p.pages[pageIndex].elements
      undoSnapshot.push(before)
      return mapPage(p, pageIndex, pg => ({ ...pg, elements: reorder(pg.elements) }))
    },
    undo: p => mapPage(p, pageIndex, pg => ({ ...pg, elements: undoSnapshot[0] ?? pg.elements })),
  }
}

/** Replace an entire page (background/notes edits). Undo swaps back. */
export function pageCmd(pageIndex: number, before: Page, after: Page, label: string): Command {
  const swap = (p: LoadedProject, pg: Page) => ({ ...p, pages: p.pages.map((q, i) => (i === pageIndex ? pg : q)) })
  return { label, do: p => swap(p, after), undo: p => swap(p, before) }
}
