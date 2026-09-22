import type { CSSProperties } from 'react'
import { icons, type LucideIcon } from 'lucide-react'
import type { IconElement } from '../../types'
import { useTheme } from '../../theme'
import type { ThemeCtx } from '../../theme'
import { borderStyle, shadowStyle } from '../Fill'
import { fx } from './fx'

// Old decks stored Font Awesome names ("fas:kebab-name"). lucide-react stores
// plain kebab names; FA-only names get an alias before the PascalCase lookup.
const FA_ALIAS: Record<string, string> = {
  'magnifying-glass': 'search', 'location-dot': 'map-pin', 'xmark': 'x',
  'gear': 'settings', 'paper-plane': 'send', 'shield-halved': 'shield-half',
  'triangle-exclamation': 'triangle-alert', 'cart-shopping': 'shopping-cart',
  'bolt': 'zap', 'robot': 'bot', 'trash': 'trash', 'pen': 'pen-line',
  'fire': 'flame', 'envelope': 'mail', 'circle-xmark': 'circle-x',
  'circle-info': 'info', 'comment': 'message-circle', 'pencil': 'pencil',
}

export function resolveIcon(name: string): LucideIcon {
  const base = name.includes(':') ? name.split(':')[1]! : name // strip old "fas:" prefix
  const kebab = FA_ALIAS[base] ?? base
  const pascal = kebab.replace(/(^|[-_])([a-z0-9])/g, (_, _s, c: string) => c.toUpperCase())
  return (icons as Record<string, LucideIcon>)[pascal] ?? icons.CircleQuestionMark!
}

export const FALLBACK_ICON = icons.CircleQuestionMark!

function iconColor(fill: IconElement['fill'], theme: ThemeCtx): string | undefined {
  if (!fill) return undefined
  if (fill.type === 'solid') return fill.color.startsWith('$') ? (theme.colors[fill.color.slice(1)] ?? '#FF00FF') : fill.color
  return undefined // ponytail: gradient/image icon fills → inherit; add background-clip when a deck uses it
}

export function IconBox(el: IconElement) {
  const theme = useTheme()
  const Icon = resolveIcon(el.iconName)
  const [w, h] = [el.bounds[2], el.bounds[3]]
  const color = iconColor(el.fill, theme)
  const style: CSSProperties = {
    position: 'absolute',
    left: el.bounds[0],
    top: el.bounds[1],
    width: w,
    height: h,
    ...fx(el),
    ...borderStyle(el.border, theme),
    ...shadowStyle(el.shadow, theme),
  }
  return (
    <div className="grid place-items-center" data-id={el.elementId} style={style}>
      <Icon aria-hidden="true" color={color} size={Math.min(w, h)} strokeWidth={2} />
    </div>
  )
}
