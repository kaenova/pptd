/**
 * DeckTool — floating tool palette over the stage (Figma-style).
 * Shape/Icon buttons open preset pickers; chosen icon spawns via click/drag on canvas.
 * Right of the grid toggle: adaptive quick props (fontSize/color/fill) for the selection.
 */
import { useEffect, useRef, useState } from 'react'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Grid3x3, Image, Italic, List, Minus, MousePointer2, Droplet as OpacityIcon, Plus, Redo2, Slash, SlidersHorizontal, Sparkles, Square, Type, Undo2, icons, type LucideIcon } from 'lucide-react'
import { useDeckCtx } from './context'
import { multiSnapshotCmd } from './commands'
import { PropertyPanel } from './PropertyPanel'

const FONT_STACKS = ['inherit', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy'] as const
import type { Element, IconElement, ImageElement, LineElement, ShapeElement, TextElement } from '../types'

const SHAPES = [
  'rect', 'roundRect', 'ellipse', 'triangle', 'rtTriangle', 'diamond',
  'parallelogram', 'trapezoid', 'pentagon', 'hexagon', 'rightArrow', 'star5',
] as const

// Common lucide icon names for the icon tool picker.
// ponytail: static ~70-name list; swap to live lucide metadata search if users need more.
const ICONS = [
  'house', 'user', 'users', 'settings', 'star', 'heart', 'search', 'mail',
  'phone', 'shopping-cart', 'truck', 'globe', 'calendar', 'clock', 'map-pin', 'bookmark',
  'flag', 'tag', 'bell', 'message-circle', 'send', 'link', 'lock', 'key',
  'shield-half', 'circle-check', 'circle-x', 'info', 'triangle-alert', 'plus', 'minus',
  'check', 'x', 'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down',
  'chart-line', 'chart-column', 'chart-pie', 'file', 'folder', 'image', 'video',
  'camera', 'music', 'play', 'code', 'bot', 'lightbulb', 'flame', 'trophy',
  'medal', 'gift', 'sun', 'moon', 'cloud', 'zap', 'leaf', 'car', 'plane',
  'rocket', 'wrench', 'briefcase', 'building', 'school', 'book', 'pen-line', 'pencil', 'trash', 'thumbs-up',
]

/** Kebab lucide name → rendered glyph. */
function IconGlyph({ name, className = 'size-4' }: { name: string; className?: string }) {
  const Cmp = (icons as Record<string, LucideIcon>)[name.replace(/(^|[-])([a-z0-9])/g, (_, _s, c: string) => c.toUpperCase())]
  return Cmp ? <Cmp aria-hidden="true" className={className} /> : null
}

export function DeckTool() {
  const { present, tool, setTool, shapeName, setShapeName, iconName, setIconName, undo, redo, editor, grid, setGrid } = useDeckCtx()
  const [open, setOpen] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)
  const [iconQuery, setIconQuery] = useState('')
  const [propsOpen, setPropsOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const hadSelection = useRef(false)

  // auto-open the properties dropdown when a component gets selected
  useEffect(() => {
    const has = editor.selection.length > 0
    if (has && !hadSelection.current) setPropsOpen(true)
    hadSelection.current = has
  }, [editor.selection])

  // shortcuts: V select, T text, R shape, L line, I image; Ctrl/Cmd+Z undo, +Shift redo
  useEffect(() => {
    if (present) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'v') setTool('select')
      if (e.key === 't') setTool('text')
      if (e.key === 'r') { setTool('shape'); setOpen(true) }
      if (e.key === 'l') setTool('line')
      if (e.key === 'i') setTool('image')
      if (e.key === 'c') { setTool('icon'); setIconOpen(true) }
      if (e.key === 'g') setGrid(!grid)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [present, setTool, undo, redo, grid, setGrid])

  // close pickers on outside click
  useEffect(() => {
    if (!open && !iconOpen && !propsOpen) return
    const close = (e: MouseEvent) => { if (!barRef.current?.contains(e.target as Node)) { setOpen(false); setIconOpen(false) } }
    addEventListener('pointerdown', close)
    return () => removeEventListener('pointerdown', close)
  }, [open, iconOpen, propsOpen])

  if (present) return null
  const btn = (active: boolean) =>
    `grid size-8 place-items-center rounded-lg transition-colors ${active ? 'bg-accent text-zinc-900' : 'text-fg hover:bg-panel-raised'}`
  const ic = 'size-4'
  return (
    <div ref={barRef} className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 flex-col items-center gap-1">
      <div
        role="toolbar"
        aria-label="Deck tools"
        className="flex items-center gap-1 rounded-xl border border-line bg-panel p-1 shadow-lg"
      >
        <button className={btn(tool === 'select')} title="Select (V)" aria-pressed={tool === 'select'} onClick={() => setTool('select')}>
          <MousePointer2 className={ic} aria-hidden="true" />
        </button>
        <button className={btn(tool === 'text')} title="Text (T)" aria-pressed={tool === 'text'} onClick={() => setTool('text')}>
          <Type className={ic} aria-hidden="true" />
        </button>
        <button className={btn(tool === 'shape')} title="Shape (R)" aria-pressed={tool === 'shape'} onClick={() => { setTool('shape'); setOpen(o => !o) }}>
          <Square className={ic} aria-hidden="true" />
        </button>
        <button className={btn(tool === 'line')} title="Line (L)" aria-pressed={tool === 'line'} onClick={() => setTool('line')}>
          <Slash className={ic} aria-hidden="true" />
        </button>
        <button className={btn(tool === 'image')} title="Image (I)" aria-pressed={tool === 'image'} onClick={() => setTool('image')}>
          <Image className={ic} aria-hidden="true" />
        </button>
        <button className={btn(tool === 'icon')} title="Icon (C)" aria-pressed={tool === 'icon'} onClick={() => { setTool('icon'); setIconOpen(o => !o) }}>
          <Sparkles className={ic} aria-hidden="true" />
        </button>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        <button className={`${btn(false)} ${!editor.undoStack.length ? 'opacity-30' : ''}`} title="Undo (Ctrl+Z)" disabled={!editor.undoStack.length} onClick={undo}>
          <Undo2 className={ic} aria-hidden="true" />
        </button>
        <button className={`${btn(false)} ${!editor.redoStack.length ? 'opacity-30' : ''}`} title="Redo (Ctrl+Shift+Z)" disabled={!editor.redoStack.length} onClick={redo}>
          <Redo2 className={ic} aria-hidden="true" />
        </button>
        <button className={btn(grid)} title="Grid (G)" aria-pressed={grid} onClick={() => setGrid(!grid)}>
          <Grid3x3 className={ic} aria-hidden="true" />
        </button>
        <QuickProps>
          <button className={btn(propsOpen)} title="Properties" aria-pressed={propsOpen} onClick={() => setPropsOpen(o => !o)}>
            <SlidersHorizontal className={ic} aria-hidden="true" />
          </button>
        </QuickProps>
      </div>
      {propsOpen && (
        <div aria-label="Properties" className="max-h-[min(60vh,560px)] w-72 overflow-auto rounded-xl border border-line bg-panel p-3 text-xs shadow-lg">
          <PropertyPanel />
        </div>
      )}
      {open && tool === 'shape' && (
        <div role="listbox" aria-label="Shape presets" className="grid grid-cols-6 gap-1 rounded-xl border border-line bg-panel p-2 shadow-lg">
          {SHAPES.map(s => (
            <button
              key={s}
              role="option"
              aria-selected={shapeName === s}
              title={s}
              className={`size-9 rounded-lg ${shapeName === s ? 'bg-accent text-zinc-900' : 'hover:bg-panel-raised text-fg'}`}
              onClick={() => { setShapeName(s); setOpen(false) }}
            >
              <svg viewBox="0 0 20 20" className="size-full p-1" fill="currentColor" aria-hidden="true">
                {s === 'rect' && <rect x="2" y="4" width="16" height="12" />}
                {s === 'roundRect' && <rect x="2" y="4" width="16" height="12" rx="3" />}
                {s === 'ellipse' && <ellipse cx="10" cy="10" rx="8" ry="6" />}
                {s === 'triangle' && <path d="M10 3l8 14H2z" />}
                {s === 'rtTriangle' && <path d="M3 17V3l14 14z" />}
                {s === 'diamond' && <path d="M10 2l8 8-8 8-8-8z" />}
                {s === 'parallelogram' && <path d="M6 4h12l-4 12H2z" />}
                {s === 'trapezoid' && <path d="M5 5h10l3 10H2z" />}
                {s === 'pentagon' && <path d="M10 2l8 6-3 10H5L2 8z" />}
                {s === 'hexagon' && <path d="M7 3h6l4 7-4 7H7l-4-7z" />}
                {s === 'rightArrow' && <path d="M2 7h10V4l6 6-6 6v-3H2z" />}
                {s === 'star5' && <path d="M10 2l2.4 5.2L18 8l-4 3.8 1 5.2-5-2.8-5 2.8 1-5.2L2 8l5.6-.8z" />}
              </svg>
            </button>
          ))}
        </div>
      )}
      {iconOpen && tool === 'icon' && (
        <div role="listbox" aria-label="Icon presets" className="w-72 rounded-xl border border-line bg-panel p-2 shadow-lg">
          <input
            autoFocus
            type="search"
            placeholder="Search icons…"
            className="mb-2 w-full rounded-md border border-line bg-transparent px-2 py-1 text-xs text-fg outline-none focus:border-accent"
            value={iconQuery}
            onChange={e => setIconQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setIconOpen(false) }}
          />
          <div className="grid max-h-48 grid-cols-8 gap-1 overflow-auto">
            {ICONS.filter(n => n.includes(iconQuery.trim().toLowerCase())).map(n => (
              <button
                key={n}
                role="option"
                aria-selected={iconName === n}
                title={n}
                className={`grid size-8 place-items-center rounded-md ${iconName === n ? 'bg-accent text-zinc-900' : 'text-fg hover:bg-panel-raised'}`}
                onClick={() => { setIconName(n); setIconOpen(false) }}
              >
                <IconGlyph name={n} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Adaptive quick-props (mini ribbon, Word-style) for the single selection. */
function QuickProps({ children }: { children?: React.ReactNode }) {
  const { project, index, editor, runCommand } = useDeckCtx()
  const sel = project.pages[index]?.elements.filter(e => editor.selection.includes(e.elementId)) ?? []
  const el = sel.length === 1 ? sel[0] : undefined
  // no selection: host only the properties toggle
  if (!el) return children ?? null
  const patch = (fn: (e: Element) => Element, label: string) => runCommand(multiSnapshotCmd(index, [el], [fn(el)], label))
  const swatch = 'size-7 cursor-pointer rounded border border-line bg-transparent p-0'
  const num = 'h-7 w-14 rounded-md border border-line bg-panel px-1 text-xs text-fg outline-none focus:border-accent'
  const sel0 = 'h-7 rounded-md border border-line bg-panel px-1 text-xs text-fg outline-none focus:border-accent'
  const tbtn = (active: boolean) => `grid size-7 place-items-center rounded-md border text-xs ${active ? 'border-accent bg-accent text-zinc-900' : 'border-transparent text-fg hover:bg-panel-raised'}`
  const hex = (c: string | undefined, d: string) => (/^#[0-9a-fA-F]{6}$/.test(c ?? '') ? c! : d)
  const Sep = () => <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />

  if (el.elementType === 'text') {
    const t = el as TextElement
    const c = t.content
    const set = (p: Partial<TextElement['content']>, label: string) =>
      patch(x => ({ ...(x as TextElement), content: { ...(x as TextElement).content, ...p } }), label)
    const step = (d: number) => set({ fontSize: Math.max(4, Math.round((c.fontSize ?? 24) + d)) }, 'fontSize')
    return (
      <div role="group" aria-label="Quick properties" className="ml-2 flex items-center gap-1 border-l border-line pl-2">
        <select className={sel0} aria-label="font" value={typeof c.fontFamily === 'string' ? c.fontFamily : 'inherit'}
          onChange={e => set({ fontFamily: e.target.value === 'inherit' ? undefined : e.target.value }, 'font')}
          title="font">
          {FONT_STACKS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <span className="flex items-center">
          <button className={tbtn(false)} title="decrease fontSize" onClick={() => step(-2)}><Minus className="size-3.5" aria-hidden="true" /></button>
          <input type="number" className={`${num} w-12 border-x-0 rounded-none`} aria-label="fontSize" value={c.fontSize ?? 24} min={4}
            onChange={e => { const n = parseFloat(e.target.value); if (!Number.isNaN(n)) set({ fontSize: n }, 'fontSize') }} />
          <button className={tbtn(false)} title="increase fontSize" onClick={() => step(2)}><Plus className="size-3.5" aria-hidden="true" /></button>
        </span>
        <button className={tbtn(!!c.bold)} title="Bold (Ctrl+B)" aria-pressed={!!c.bold} onClick={() => set({ bold: !c.bold }, 'bold')}><Bold className="size-3.5" aria-hidden="true" /></button>
        <button className={tbtn(!!c.italic)} title="Italic (Ctrl+I)" aria-pressed={!!c.italic} onClick={() => set({ italic: !c.italic }, 'italic')}><Italic className="size-3.5" aria-hidden="true" /></button>
        <Sep />
        <input type="color" className={swatch} title="text color" aria-label="text color" value={hex(c.color, '#000000')}
          onChange={e => set({ color: e.target.value }, 'color')} />
        <input type="color" className={swatch} title="highlight" aria-label="highlight" value={hex(c.backgroundColor, '#ffe600')}
          onChange={e => set({ backgroundColor: e.target.value }, 'highlight')} />
        <Sep />
        {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight], ['justify', AlignJustify]] as const).map(([a, I]) => (
          <button key={a} className={tbtn((c.align?.[0] ?? 'left') === a)} title={`align ${a}`}
            onClick={() => set({ align: [a, c.align?.[1] ?? 'top'] }, 'align')}><I className="size-3.5" aria-hidden="true" /></button>
        ))}
        <Sep />
        <button className={tbtn((c.lineHeight ?? 1.2) > 1.45)} title="line spacing" onClick={() => set({ lineHeight: (c.lineHeight ?? 1.2) > 1.45 ? 1.2 : 1.8 }, 'lineHeight')}>
          <List className="size-3.5" aria-hidden="true" />
        </button>
        {children}
      </div>
    )
  }
  if (el.elementType === 'shape' || el.elementType === 'icon') {
    const s = el as ShapeElement | IconElement
    const solid = s.fill?.type === 'solid' ? s.fill.color : undefined
    const b = s.border
    const hasBorder = el.elementType === 'shape' && !!b
    return (
      <div role="group" aria-label="Quick properties" className="ml-2 flex items-center gap-1 border-l border-line pl-2">
        <input type="color" className={swatch} title="fill" aria-label="fill color" value={hex(solid, el.elementType === 'icon' ? '#333333' : '#FF6900')}
          onChange={e => patch(x => ({ ...(x as ShapeElement), fill: { type: 'solid', color: e.target.value } }), 'fill')} />
        {hasBorder && (
          <input type="color" className={swatch} title="border color" aria-label="border color" value={hex(b!.color, '#000000')}
            onChange={e => patch(x => ({ ...(x as ShapeElement), border: { style: 'solid', width: 1, ...(x as ShapeElement).border, color: e.target.value } }), 'border color')} />
        )}
        <button className={tbtn(hasBorder)} title="border on/off" onClick={() => patch(x => ({ ...(x as ShapeElement), border: hasBorder ? undefined : { style: 'solid', width: 1, color: '#000000' } }), 'border')}>
          <Square className="size-3.5" aria-hidden="true" />
        </button>
        <Sep />
        <label className="flex items-center gap-1 text-[11px] text-dim" title="opacity">
          <OpacityIcon className="size-3.5" aria-hidden="true" />
          <input type="number" className={`${num} w-14`} aria-label="opacity" value={s.opacity ?? 1} min={0} max={1} step={0.1}
            onChange={e => { const n = parseFloat(e.target.value); if (!Number.isNaN(n)) patch(x => ({ ...(x as ShapeElement), opacity: n }), 'opacity') }} />
        </label>
        {children}
      </div>
    )
  }
  if (el.elementType === 'line') {
    const l = el as LineElement
    return (
      <div role="group" aria-label="Quick properties" className="ml-2 flex items-center gap-1 border-l border-line pl-2">
        <input type="color" className={swatch} title="stroke" aria-label="stroke color" value={hex(l.border?.color, '#000000')}
          onChange={e => patch(x => ({ ...(x as LineElement), border: { style: 'solid', width: 1, ...(x as LineElement).border, color: e.target.value } }), 'stroke')} />
        <input type="number" className={`${num} w-12`} aria-label="stroke width" value={l.border?.width ?? 1} min={0.5} step={0.5}
          onChange={e => { const n = parseFloat(e.target.value); if (!Number.isNaN(n)) patch(x => ({ ...(x as LineElement), border: { style: 'solid', color: '#000000', ...(x as LineElement).border, width: n } }), 'stroke width') }} />
        {children}
      </div>
    )
  }
  if (el.elementType === 'image') {
    const im = el as ImageElement
    return (
      <div role="group" aria-label="Quick properties" className="ml-2 flex items-center gap-1 border-l border-line pl-2">
        <label className="flex items-center gap-1 text-[11px] text-dim" title="opacity">
          <OpacityIcon className="size-3.5" aria-hidden="true" />
          <input type="number" className={`${num} w-14`} aria-label="opacity" value={im.opacity ?? 1} min={0} max={1} step={0.1}
            onChange={e => { const n = parseFloat(e.target.value); if (!Number.isNaN(n)) patch(x => ({ ...(x as ImageElement), opacity: n }), 'opacity') }} />
        </label>
        {children}
      </div>
    )
  }
  return null // chart/table: advanced panel only
}
