/**
 * pickers — themed ColorPicker + Dropdown replacing native <input type="color">
 * and <select>, so popover chrome matches the app (dark panel, accent).
 */
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

// common deck palette (grayscale + accent + saturated hues)
const PALETTE = [
  '#000000', '#ffffff', '#71717a', '#a1a1aa', '#18181b',
  '#f97316', '#f59e0b', '#facc15', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#6366f1', '#8b5cf6',
  '#d946ef', '#ec4899', '#f43f5e', '#78716c', '#f4f4f5',
]

const isHex = (c: string | undefined) => /^#[0-9a-fA-F]{6}$/.test(c ?? '')

/** useOutsideClose — closes popover on pointerdown outside its ref. */
function useOutsideClose(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    addEventListener('pointerdown', close)
    return () => removeEventListener('pointerdown', close)
  }, [open, onClose])
  return ref
}

export function ColorPicker({ title, value, onChange, size = 'md' }: {
  title: string
  value: string | undefined
  onChange: (c: string) => void
  size?: 'md' | 'sm'
}) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  const shown = isHex(value) ? value! : undefined
  const sw = size === 'sm' ? 'size-5' : 'size-7'
  return (
    <div ref={ref} className="relative" data-picker={title}>
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        className={`${sw} cursor-pointer rounded-md border border-line transition-colors hover:border-accent ${shown ? '' : 'bg-[linear-gradient(135deg,#3f3f46_45%,#f4f4f5_55%)]'}`}
        style={shown ? { background: shown } : undefined}
        onClick={() => setOpen(o => !o)}
      />
      {open && (
        <div
          role="dialog"
          aria-label={`${title} picker`}
          className="absolute left-0 top-[calc(100%+4px)] z-40 w-44 rounded-lg border border-line bg-panel p-2 shadow-xl"
        >
          <div className="grid grid-cols-5 gap-1">
            {PALETTE.map(c => (
              <button
                key={c}
                type="button"
                title={c}
                className="grid size-6 place-items-center rounded-md border border-line transition-transform hover:scale-110"
                style={{ background: c }}
                onClick={() => { onChange(c); setOpen(false) }}
              >
                {value === c && <Check className="size-3 text-white mix-blend-difference" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-1.5 border-t border-line-soft pt-2">
            <input
              type="color"
              aria-label={`${title} custom`}
              className="size-5 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
              value={shown ?? '#000000'}
              onChange={e => onChange(e.target.value)}
            />
            <input
              type="text"
              aria-label={`${title} value`}
              className="w-full rounded-md border border-line bg-transparent px-1 py-0.5 text-[11px] text-fg outline-none focus:border-accent"
              value={value ?? ''}
              placeholder="$primary"
              onChange={e => onChange(e.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  )
}

export function Dropdown<T extends string>({ title, value, options, onChange, className = '' }: {
  title: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  const current = options.find(o => o.value === value)?.label ?? value
  return (
    <div ref={ref} className={`relative ${className}`} data-picker={title}>
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        className="flex h-7 items-center gap-1 rounded-md border border-line bg-panel px-1.5 text-xs text-fg outline-none transition-colors hover:border-accent"
        onClick={() => setOpen(o => !o)}
      >
        <span className="max-w-24 truncate">{current}</span>
        <ChevronDown className={`size-3 shrink-0 text-dim transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div role="listbox" aria-label={title} className="absolute left-0 top-[calc(100%+4px)] z-40 min-w-full rounded-lg border border-line bg-panel p-1 shadow-xl">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-md px-2 py-1 text-left text-xs ${o.value === value ? 'bg-accent-soft text-fg' : 'text-dim hover:bg-panel-raised hover:text-fg'}`}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check className="size-3 shrink-0 text-accent" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
