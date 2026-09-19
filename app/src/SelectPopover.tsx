import { useEffect, useRef } from 'react'
import { selectionLabel, type ComponentSelection } from './select'

interface SelectPopoverProps {
  selection: ComponentSelection
  comment: string
  onCommentChange: (comment: string) => void
  onSubmit: () => void
}

/** shadcn-style anchored popover: local primitive, no UI dependency for four controls. */
export function SelectPopover({ selection, comment, onCommentChange, onSubmit }: SelectPopoverProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  return (
    <div className="pptd-select-popup" style={{ left: selection.x, top: selection.y }} onClick={e => e.stopPropagation()}>
      <div className="pptd-select-label">{selectionLabel(selection)}</div>
      <textarea ref={inputRef} value={comment} onChange={e => onCommentChange(e.target.value)} placeholder="Add a comment" rows={3} />
      <button type="button" onClick={onSubmit}>Send</button>
    </div>
  )
}
