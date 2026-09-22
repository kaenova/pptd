// Page renderer. Later element in page.elements = higher layer (spec), no z-index.
// Editor interaction lives in Deck/EditorOverlay; this file only renders.
import type { Element, Page } from './types'
import type { LoadedProject } from './types'
import { animationGroups, animationStyle } from './anim'
import { useState } from 'react'
import type { ComponentSelection } from './select'
import { ThemeContext, themeCtx, useTheme } from './theme'
import { fillStyle } from './render/Fill'
import { TextBlock } from './render/elements/Text'
import { ShapeBox } from './render/elements/Shape'
import { LineBox } from './render/elements/Line'
import { ImageBox } from './render/elements/Image'
import { IconBox } from './render/elements/Icon'
import { TableBox } from './render/elements/Table'
import { ChartBox } from './render/elements/Chart'

export function ElementView({ el, static: isStatic = false }: { el: Element; static?: boolean }) {
  switch (el.elementType) {
    case 'text':
      return <TextBlock {...el} />
    case 'shape':
      return <ShapeBox {...el} />
    case 'line':
      return <LineBox {...el} />
    case 'image':
      return <ImageBox {...el} />
    case 'icon':
      return <IconBox {...el} />
    case 'table':
      return <TableBox el={el} />
    case 'chart':
      return <ChartBox el={el} static={isStatic} />
    default:
      return null
  }
}

/** Page background + elements. Background Fill is rendered behind everything; opacity via ImageFill.opacity. */
export function PageView({ page, slide, onSelect, static: isStatic = false, editingId }: { page: Page; slide: number; onSelect?: (selection: ComponentSelection) => void; static?: boolean; editingId?: string }) {
  const theme = useTheme()
  const groups = isStatic ? [] : animationGroups(page.animations)
  // remount per page resets playback; group 0 auto-plays when it starts with with/afterPrevious
  const [click, setClick] = useState(() => (groups[0]?.auto ? 0 : -1))
  const visible = new Set<string>()
  for (let i = 0; i <= click; i++) for (const step of groups[i]?.steps ?? []) visible.add(step.elementId)
  const active = new Map<string, import('./anim').Animation>()
  for (let i = 0; i <= click; i++) for (const step of groups[i]?.steps ?? []) active.set(step.elementId, step)
  const bg = page.background ?? { type: 'solid', color: '#FFFFFF' }
  const bgOpacity = bg.type === 'image' ? bg.opacity : undefined
  const act = !!onSelect // select-feature affordances; also blocks native text/image drag
  return (
    <div
      style={{ position: 'absolute', inset: 0, ...(act ? { userSelect: 'none' } : null) }}
      onDragStart={act ? e => e.preventDefault() : undefined}
      onClick={() => groups.length && setClick(c => Math.min(c + 1, groups.length - 1))}
    >
      <div style={{ position: 'absolute', inset: 0, ...fillStyle(bg, theme), opacity: bgOpacity }} />
      {page.elements.map(el => {
        const anim = active.get(el.elementId)
        const hidden = groups.length > 0 && !visible.has(el.elementId) && page.animations?.some(a => a.elementId === el.elementId)
        if (editingId === el.elementId) return null // editor overlay replaces it
        return <div
          key={el.elementId}
          className={act ? 'cursor-crosshair' : undefined}
          style={{
            ...(anim ? animationStyle(anim, true) : hidden ? { visibility: 'hidden' } : undefined),
          }}
          onClick={onSelect ? e => { e.stopPropagation(); onSelect({ slide, componentId: el.elementId, x: e.clientX, y: e.clientY }) } : undefined}
        >
          <ElementView el={el} static={isStatic} />
        </div>
      })}
    </div>
  )
}

/** Theme provider + page. Mount once per deck so $refs resolve inside every element. */
export function DeckView({ project, index, onSelect, static: isStatic = false, editingId }: { project: LoadedProject; index: number; onSelect?: (selection: ComponentSelection) => void; static?: boolean; editingId?: string }) {
  return (
    <ThemeContext.Provider value={themeCtx(project.theme)}>
      <PageView key={index} page={project.pages[index]} slide={index} onSelect={onSelect} static={isStatic} editingId={editingId} />
    </ThemeContext.Provider>
  )
}
