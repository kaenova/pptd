// Page renderer. Later element in page.elements = higher layer (spec), no z-index.
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
export function PageView({ page, slide, onSelect, static: isStatic = false, interactive = false, selectedId, editingId, onElementSelect, onElementEdit }: { page: Page; slide: number; onSelect?: (selection: ComponentSelection) => void; static?: boolean; interactive?: boolean; selectedId?: string; editingId?: string; onElementSelect?: (el: Element) => void; onElementEdit?: (el: Element) => void }) {
  const theme = useTheme()
  const groups = isStatic ? [] : animationGroups(page.animations)
  // remount per page resets playback; group 0 auto-plays when it starts with with/afterPrevious
  const [click, setClick] = useState(() => (groups[0]?.auto ? 0 : -1))
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const visible = new Set<string>()
  for (let i = 0; i <= click; i++) for (const step of groups[i]?.steps ?? []) visible.add(step.elementId)
  const active = new Map<string, import('./anim').Animation>()
  for (let i = 0; i <= click; i++) for (const step of groups[i]?.steps ?? []) active.set(step.elementId, step)
  const bg = page.background ?? { type: 'solid', color: '#FFFFFF' }
  const bgOpacity = bg.type === 'image' ? bg.opacity : undefined
  const hovered = (interactive || onSelect) && !selectedId ? page.elements.find(el => el.elementId === hoveredId) : undefined
  const sel = selectedId ? page.elements.find(el => el.elementId === selectedId) : undefined
  const act = interactive || !!onSelect // hover/click affordances; blocks native text/image drag too
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
          className={act ? (onSelect ? 'cursor-crosshair' : 'cursor-pointer') : undefined}
          style={anim ? animationStyle(anim, true) : hidden ? { visibility: 'hidden' } : undefined}
          onMouseEnter={act ? () => setHoveredId(el.elementId) : undefined}
          onMouseLeave={act ? () => setHoveredId(null) : undefined}
          onClick={onSelect ? e => { e.stopPropagation(); onSelect({ slide, componentId: el.elementId, x: e.clientX, y: e.clientY }) } : onElementSelect ? e => { e.stopPropagation(); onElementSelect(el) } : undefined}
          onDoubleClick={onElementEdit ? e => { e.stopPropagation(); onElementEdit(el) } : undefined}
        >
          <ElementView el={el} static={isStatic} />
        </div>
      })}
      {sel && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border-2 border-accent"
          style={{ left: sel.bounds[0], top: sel.bounds[1], width: sel.bounds[2], height: sel.bounds[3] }}
          aria-hidden="true"
        />
      )}
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border-2 border-[#ff6900] bg-[#ff69001a] shadow-[0_0_0_1px_#fff8,0_0_12px_#ff690066]"
          style={{ left: hovered.bounds[0], top: hovered.bounds[1], width: hovered.bounds[2], height: hovered.bounds[3] }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}

/** Theme provider + page. Mount once per deck so $refs resolve inside every element. */
export function DeckView({ project, index, onSelect, static: isStatic = false, interactive = false, selectedId, editingId, onElementSelect, onElementEdit }: { project: LoadedProject; index: number; onSelect?: (selection: ComponentSelection) => void; static?: boolean; interactive?: boolean; selectedId?: string; editingId?: string; onElementSelect?: (el: Element) => void; onElementEdit?: (el: Element) => void }) {
  return (
    <ThemeContext.Provider value={themeCtx(project.theme)}>
      <PageView key={index} page={project.pages[index]} slide={index} onSelect={onSelect} static={isStatic} interactive={interactive} selectedId={selectedId} editingId={editingId} onElementSelect={onElementSelect} onElementEdit={onElementEdit} />
    </ThemeContext.Provider>
  )
}
