// Page renderer. Later element in page.elements = higher layer (spec), no z-index.
import type { Element, Page } from './types'
import type { LoadedProject } from './types'
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
export function PageView({ page }: { page: Page }) {
  const theme = useTheme()
  const bg = page.background ?? { type: 'solid', color: '#FFFFFF' }
  const bgOpacity = bg.type === 'image' ? bg.opacity : undefined
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, ...fillStyle(bg, theme), opacity: bgOpacity }} />
      {page.elements.map(el => (
        <ElementView key={el.elementId} el={el} />
      ))}
    </div>
  )
}

/** Theme provider + page. Mount once per deck so $refs resolve inside every element. */
export function DeckView({ project, index }: { project: LoadedProject; index: number }) {
  return (
    <ThemeContext.Provider value={themeCtx(project.theme)}>
      <PageView page={project.pages[index]} />
    </ThemeContext.Provider>
  )
}
