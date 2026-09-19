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

export function ElementView({ el }: { el: Element }) {
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
      return <ChartBox el={el} />
    default:
      return null
  }
}

/** Page background + elements. Background Fill is rendered behind everything; opacity via ImageFill.opacity. */
export function PageView({ page, slide, onSelect }: { page: Page; slide: number; onSelect?: (selection: ComponentSelection) => void }) {
  const theme = useTheme()
  const groups = animationGroups(page.animations)
  // remount per page resets playback; group 0 auto-plays when it starts with with/afterPrevious
  const [click, setClick] = useState(() => (groups[0]?.auto ? 0 : -1))
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const visible = new Set<string>()
  for (let i = 0; i <= click; i++) for (const step of groups[i]?.steps ?? []) visible.add(step.elementId)
  const active = new Map<string, import('./anim').Animation>()
  for (let i = 0; i <= click; i++) for (const step of groups[i]?.steps ?? []) active.set(step.elementId, step)
  const bg = page.background ?? { type: 'solid', color: '#FFFFFF' }
  const bgOpacity = bg.type === 'image' ? bg.opacity : undefined
  const hovered = onSelect ? page.elements.find(el => el.elementId === hoveredId) : undefined
  return (
    <div style={{ position: 'absolute', inset: 0 }} onClick={() => groups.length && setClick(c => Math.min(c + 1, groups.length - 1))}>
      <div style={{ position: 'absolute', inset: 0, ...fillStyle(bg, theme), opacity: bgOpacity }} />
      {page.elements.map(el => {
        const anim = active.get(el.elementId)
        const hidden = groups.length > 0 && !visible.has(el.elementId) && page.animations?.some(a => a.elementId === el.elementId)
        return <div
          key={el.elementId}
          className={onSelect ? 'pptd-selectable' : undefined}
          style={anim ? animationStyle(anim, true) : hidden ? { visibility: 'hidden' } : undefined}
          onMouseEnter={onSelect ? () => setHoveredId(el.elementId) : undefined}
          onMouseLeave={onSelect ? () => setHoveredId(null) : undefined}
          onClick={onSelect ? e => { e.stopPropagation(); onSelect({ slide, componentId: el.elementId, x: e.clientX, y: e.clientY }) } : undefined}
        >
          <ElementView el={el} />
        </div>
      })}
      {hovered && (
        <div
          className="pptd-selection-highlight"
          style={{ left: hovered.bounds[0], top: hovered.bounds[1], width: hovered.bounds[2], height: hovered.bounds[3] }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}

/** Theme provider + page. Mount once per deck so $refs resolve inside every element. */
export function DeckView({ project, index, onSelect }: { project: LoadedProject; index: number; onSelect?: (selection: ComponentSelection) => void }) {
  return (
    <ThemeContext.Provider value={themeCtx(project.theme)}>
      <PageView key={index} page={project.pages[index]} slide={index} onSelect={onSelect} />
    </ThemeContext.Provider>
  )
}
