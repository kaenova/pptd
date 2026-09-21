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
    <div
      className="absolute z-10 w-64 rounded-lg border border-line bg-panel-raised p-3 text-[13px] text-fg shadow-xl animate-[pptd-fade-in_.15s_ease-out]"
      style={{ left: selection.x, top: selection.y }}
      onClick={e => e.stopPropagation()}
    >
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.12em] text-accent">{selectionLabel(selection)}</div>
      <textarea
        ref={inputRef}
        value={comment}
        onChange={e => onCommentChange(e.target.value)}
        placeholder="Add a comment"
        rows={3}
        className="w-full resize-none rounded-md border border-line bg-bg p-2 text-[13px] text-fg outline-none placeholder:text-muted focus:border-accent"
      />
      <button type="button" onClick={onSubmit} className="mt-2 rounded-md bg-accent px-3 py-1.5 text-[13px] font-semibold text-white hover:brightness-110">
        Send
      </button>
    </div>
  )
}
