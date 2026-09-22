/**
 * Previewer layout parts — overlay, panel chrome, body/footer containers.
 */
import type { ReactNode } from 'react'
import { useCtx } from './context'

// --- layout parts -----------------------------------------------------------

export function PreviewerOverlay() {
  const { close } = useCtx()
  return <div className="fixed inset-0 z-50 bg-black/60 animate-[fade-in_.15s_ease-out]" onClick={close} />
}

export function PreviewerPanel({ children }: { children: ReactNode }) {
  const { close } = useCtx()
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center"
      onClick={close}
    >
      <div
        className="flex h-[85vh] w-[min(1100px,92vw)] flex-col overflow-hidden rounded-xl border border-line bg-bg shadow-2xl animate-[slide-up_.2s_ease-out]"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export function PreviewerHeader({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between border-b border-line-soft bg-panel px-4 py-3">{children}</div>
}

export function PreviewerTitle() {
  const { file } = useCtx()
  return (
    <div className="flex items-center gap-2 text-[13px] text-fg">
      <span className="w-3.5 text-center text-[10px] text-muted">▤</span>
      <span>{file?.split('/').pop()}</span>
    </div>
  )
}

export function PreviewerClose() {
  const { close } = useCtx()
  return (
    <button
      className="size-7 rounded-md border border-line bg-transparent text-sm leading-none text-dim hover:bg-panel-raised hover:text-fg"
      onClick={close}
      aria-label="Close preview"
    >
      ✕
    </button>
  )
}

export function PreviewerBody({ children }: { children: ReactNode }) {
  return <div className="file-previewer-content min-h-0 flex-1">{children}</div>
}

// --- footer parts -----------------------------------------------------------

export function PreviewerFooter({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-3 border-t border-line-soft bg-panel px-4 py-2 text-[11px] text-muted">{children}</div>
}

export function PreviewerStats() {
  const { content } = useCtx()
  return (<>
    <span>{content.length} characters</span>
    <span>{content.split('\n').length} lines</span>
    <span className="flex-1" />
  </>)
}

export function PreviewerLanguage() {
  const { language } = useCtx()
  return <span>{language}</span>
}
