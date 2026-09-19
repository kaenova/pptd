import type { CSSProperties } from 'react'
import type { TextElement } from '../../types'
import { useTheme, textStyleProps } from '../../theme'
import { fillStyle } from '../Fill'
import { RichText } from '../RichText'

function boundsStyle(b: [number, number, number, number]): CSSProperties {
  const [x, y, w, h] = b
  return { position: 'absolute', left: x, top: y, width: w, height: h }
}

export function TextBlock(el: TextElement) {
  const theme = useTheme()
  const c = el.content
  const style: CSSProperties = {
    ...boundsStyle(el.bounds),
    overflow: 'hidden',
    ...textStyleProps(c, theme),
    // wrap=false: single line, overflow visible beyond bounds (spec)
    ...(c.wrap === false ? { whiteSpace: 'nowrap' as const, overflow: 'visible' as const } : {}),
    // vertical text: vertical-rl stacks columns right→left, glyphs upright for CJK
    ...(c.textDirection === 'vertical' ? { writingMode: 'vertical-rl' as const } : {}),
    // text gradient applies to the glyphs, not the box
    ...(c.gradient
      ? {
          backgroundImage: fillStyle(c.gradient, theme).background as string,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }
      : {}),
    ...(c.shadow
      ? { filter: `drop-shadow(${c.shadow.offset?.[0] ?? 0}px ${c.shadow.offset?.[1] ?? 0}px ${c.shadow.blur}px ${c.shadow.color})` }
      : {}),
  }
  return (
    <div className="el" data-id={el.elementId} style={style}>
      <RichText content={c} base={c.gradient ? { color: 'transparent' } : undefined} />
    </div>
  )
}
