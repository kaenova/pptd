import { useEffect } from 'react'
import type { IconElement } from '../../types'
import { useTheme } from '../../theme'
import type { ThemeCtx } from '../../theme'
import { borderStyle, shadowStyle } from '../Fill'
import { fx } from './fx'

const FA_CSS = 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@7.1.0/css/all.min.css'
const STYLE_PREFIX = { fas: 'fa-solid', far: 'fa-regular', fab: 'fa-brands' } as const

// ponytail: FA loaded from CDN (like customFonts' Google Fonts); swap to bundled
// @fortawesome/fontawesome-free when offline rendering (soffice QA) needs it.
function useFontAwesome() {
  useEffect(() => {
    if (document.querySelector(`link[data-pptd-fa]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FA_CSS
    link.setAttribute('data-pptd-fa', '1')
    document.head.appendChild(link)
  }, [])
}

function iconColor(fill: IconElement['fill'], theme: ThemeCtx): string | undefined {
  if (!fill) return undefined // FA default (currentColor → inherits black)
  if (fill.type === 'solid') return fill.color.startsWith('$') ? (theme.colors[fill.color.slice(1)] ?? '#FF00FF') : fill.color
  return undefined // ponytail: gradient/image icon fills → inherit; add background-clip when a deck uses it
}

export function IconBox(el: IconElement) {
  useFontAwesome()
  const theme = useTheme()
  const [style, name] = el.iconName.split(':')
  const cls = `${STYLE_PREFIX[style as keyof typeof STYLE_PREFIX] ?? 'fa-solid'} fa-${name}`
  const [w, h] = [el.bounds[2], el.bounds[3]]
  const color = iconColor(el.fill, theme)
  return (
    <div
      className="el"
      data-id={el.elementId}
      style={{
        position: 'absolute',
        left: el.bounds[0],
        top: el.bounds[1],
        width: w,
        height: h,
        ...fx(el),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        fontSize: Math.min(w, h),
        lineHeight: 1,
        ...borderStyle(el.border, theme),
        ...shadowStyle(el.shadow, theme),
      }}
    >
      <i className={cls} />
    </div>
  )
}
