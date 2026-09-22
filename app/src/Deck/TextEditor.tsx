/**
 * TextEditor — contentEditable overlay for in-place text editing (Figma-style double-click).
 */
import { useEffect, useRef } from 'react'
import type { TextElement } from '../types'
import { useTheme } from '../theme'
import { textBlockStyle } from '../render/elements/Text'
import { fromEditableDOM, toEditableHTML } from './textEdit'

export function TextEditor({ el, onCommit, onExit }: {
  el: TextElement
  onCommit: (text: string) => void
  onExit: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const theme = useTheme()
  const committed = useRef(false)

  const commit = () => {
    if (committed.current || !ref.current) return
    committed.current = true
    const text = fromEditableDOM(ref.current)
    if (text !== el.content.text) onCommit(text)
  }

  // mount: seed HTML, focus, caret at end. Unmount (slide/tool change) commits too.
  // committed resets here so StrictMode's double effect doesn't eat the real commit.
  useEffect(() => {
    committed.current = false
    const div = ref.current!
    div.innerHTML = toEditableHTML(el.content.text)
    div.focus()
    const sel = getSelection()
    const range = document.createRange()
    range.selectNodeContents(div)
    range.collapse(false)
    sel?.removeAllRanges()
    sel?.addRange(range)
    return commit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.elementId])

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Edit text"
      className="absolute z-20 outline-none"
      style={{ ...textBlockStyle(el, theme), overflow: 'visible', cursor: 'text', userSelect: 'text' }}
      onKeyDown={e => {
        e.stopPropagation() // arrows/esc are text editing here, not slide nav
        if (e.key === 'Escape') {
          commit()
          onExit()
        }
      }}
      onBlur={() => {
        commit()
        onExit()
      }}
    />
  )
}
