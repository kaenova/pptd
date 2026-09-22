/**
 * PropertyPanel — advanced property editor body, hosted in the DeckTool
 * properties dropdown. Renders nothing in present mode or with no selection
 * (page props via toggle). Each change commits an undoable snapshot command.
 */
import { useState } from 'react'
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine } from 'lucide-react'
import type { Border, Element, Fill, ImageElement, IconElement, LineElement, LoadedProject, Page, Shadow, ShapeElement, TextElement, TextContent } from '../types'
import { useDeckCtx } from './context'
import { multiSnapshotCmd, pageCmd, reorderCmd } from './commands'

const FONT_STACKS = ['inherit', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy'] as const

// ---------- tiny inputs ----------

const row = 'flex items-center justify-between gap-2 py-1'
const label = 'text-[11px] text-dim'
const input = 'w-full rounded-md border border-line bg-transparent px-1.5 py-1 text-xs text-fg outline-none focus:border-accent'

function NumField({ title, value, onChange, min, max, step = 1 }: {
  title: string; value: number | undefined; onChange: (n: number) => void; min?: number; max?: number; step?: number
}) {
  return (
    <label className={row} title={title}>
      <span className={label}>{title}</span>
      <input type="number" className="w-20 rounded-md border border-line bg-transparent px-1.5 py-0.5 text-xs text-fg outline-none focus:border-accent"
        value={value ?? ''} min={min} max={max} step={step}
        onChange={e => { const n = parseFloat(e.target.value); if (!Number.isNaN(n)) onChange(n) }} />
    </label>
  )
}

function ColorField({ title, value, onChange }: { title: string; value: string | undefined; onChange: (c: string) => void }) {
  return (
    <label className={row} title={title}>
      <span className={label}>{title}</span>
      <span className="flex items-center gap-1.5">
        <input type="color" className="size-6 cursor-pointer rounded border border-line bg-transparent p-0"
          value={/^#[0-9a-fA-F]{6}$/.test(value ?? '') ? value : '#000000'}
          onChange={e => onChange(e.target.value)} />
        <input type="text" className="w-[76px] rounded-md border border-line bg-transparent px-1 py-0.5 text-[11px] text-fg outline-none focus:border-accent"
          value={value ?? ''} placeholder="$primary" onChange={e => onChange(e.target.value)} />
      </span>
    </label>
  )
}

/** Solid-fill editor. ponytail: gradient/image fill editing — add stop list UI when a deck needs it. */
function FillEditor({ fill, onChange }: { fill: Fill | undefined; onChange: (f: Fill | undefined) => void }) {
  const color = fill?.type === 'solid' ? fill.color : '#FF6900'
  return (
    <>
      <ColorField title={fill?.type === 'solid' ? 'Fill' : 'Fill (off)'} value={fill?.type === 'solid' ? color : undefined}
        onChange={c => onChange(c ? { type: 'solid', color: c } : undefined)} />
      <div className={row}>
        <span className={label}>fill</span>
        <span className="flex gap-1">
          <button className="rounded-md border border-line px-2 py-0.5 text-[11px] hover:bg-panel-raised" onClick={() => onChange(undefined)}>none</button>
        </span>
      </div>
    </>
  )
}

function BorderEditor({ border, onChange }: { border: Border | undefined; onChange: (b: Border | undefined) => void }) {
  const set = (patch: Partial<Border>) => onChange({ style: 'solid', width: 1, color: '#000000', ...border, ...patch })
  return (
    <>
      <div className={row}>
        <span className={label}>border</span>
        <span className="flex gap-1">
          <button className={`rounded-md border px-2 py-0.5 text-[11px] ${border ? 'border-accent' : 'border-line'} hover:bg-panel-raised`}
            onClick={() => onChange(border ? undefined : { style: 'solid', width: 1, color: '#000000' })}>{border ? 'on' : 'off'}</button>
          {border && <select className="rounded-md border border-line bg-transparent px-1 text-[11px]" value={border.style ?? 'solid'}
            onChange={e => set({ style: e.target.value as Border['style'] })}>
            <option value="solid">solid</option><option value="dash">dash</option><option value="dot">dot</option>
          </select>}
        </span>
      </div>
      {border && <NumField title="width" value={border.width} onChange={n => set({ width: n })} />}
      {border && <ColorField title="color" value={border.color} onChange={c => set({ color: c })} />}
    </>
  )
}

function ShadowEditor({ shadow, onChange }: { shadow: Shadow | undefined; onChange: (s: Shadow | undefined) => void }) {
  const set = (patch: Partial<Shadow>) => onChange({ blur: 8, color: '#00000040', ...shadow, ...patch })
  return (
    <>
      <div className={row}>
        <span className={label}>shadow</span>
        <span className="flex gap-1">
          <button className={`rounded-md border px-2 py-0.5 text-[11px] ${shadow ? 'border-accent' : 'border-line'} hover:bg-panel-raised`}
            onClick={() => onChange(shadow ? undefined : { blur: 8, color: '#00000040' })}>{shadow ? 'on' : 'off'}</button>
        </span>
      </div>
      {shadow && <NumField title="blur" value={shadow.blur} onChange={n => set({ blur: n })} />}
      {shadow && <ColorField title="shadow color" value={shadow.color} onChange={c => set({ color: c })} />}
    </>
  )
}

// ---------- panel ----------

export function PropertyPanel() {
  const { project, index, present, editor, runCommand } = useDeckCtx()
  const [pageMode, setPageMode] = useState(false)
  if (present) return null

  const page = project.pages[index]
  const sel = page.elements.filter(e => editor.selection.includes(e.elementId))
  const el = sel.length === 1 ? sel[0] : undefined

  // helper: commit element patch
  const patch = (fn: (e: Element) => Element, label: string) => {
    if (!el) return
    runCommand(multiSnapshotCmd(index, [el], [fn(el)], label))
  }
  const transformable = (el?.elementType ?? '') !== 'text' && el ? el as unknown as { rotation?: number; opacity?: number } : undefined

  const LAYER_ICONS = { back: ArrowDownToLine, backward: ArrowDown, forward: ArrowUp, front: ArrowUpToLine } as const

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <b className="text-fg">{el ? `${el.elementType} · ${el.elementId.slice(0, 14)}` : 'Page'}</b>
        <button className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-dim hover:bg-panel-raised"
          onClick={() => setPageMode(p => !p)}>{el ? 'page' : 'element'}</button>
      </div>

      {el?.elementType === 'text' && <TextPanel el={el as TextElement} patch={patch} />}
      {el?.elementType === 'shape' && <ShapePanel el={el as ShapeElement} patch={patch} />}
      {el?.elementType === 'line' && <LinePanel el={el as LineElement} patch={patch} />}
      {el?.elementType === 'image' && <ImagePanel el={el as ImageElement} patch={patch} />}
      {el?.elementType === 'icon' && <IconPanel el={el as IconElement} patch={patch} />}
      {(el?.elementType === 'chart' || el?.elementType === 'table') && (
        <p className="py-2 text-[11px] text-dim">read-only (data editors out of scope)</p>
      )}

      {el && (
        <div className="mt-2 border-t border-line-soft pt-2">
          {transformable && <NumField title="opacity" value={transformable.opacity} min={0} max={1} step={0.05}
            onChange={n => patch(e => ({ ...e, opacity: n }), 'opacity')} />}
          {transformable && <NumField title="rotation°" value={transformable.rotation}
            onChange={n => patch(e => ({ ...e, rotation: n }), 'rotate')} />}
          <div className={row}>
            <span className={label}>layer</span>
            <span className="flex gap-1">
              {(['back', 'backward', 'forward', 'front'] as const).map(d => {
                const LIcon = LAYER_ICONS[d]
                return (
                  <button key={d} className="grid size-6 place-items-center rounded-md border border-line hover:bg-panel-raised"
                    title={`send ${d}`} onClick={() => runCommand(reorderCmd(index, editor.selection, d))}>
                    <LIcon aria-hidden="true" className="size-3.5" />
                  </button>
                )
              })}
            </span>
          </div>
        </div>
      )}

      {(!el || pageMode) && <PagePanel page={page} run={label => runCommand(label)} project={project} index={index} />}
    </>
  )
}

// ---------- per-type sections ----------

function TextPanel({ el, patch }: { el: TextElement; patch: (fn: (e: Element) => Element, label: string) => void }) {
  const c = el.content
  const set = (p: Partial<TextContent>) => patch(e => ({ ...(e as TextElement), content: { ...(e as TextElement).content, ...p } }), 'text style')
  return (
    <>
      <NumField title="fontSize" value={c.fontSize} min={4} onChange={n => set({ fontSize: n })} />
      <ColorField title="color" value={c.color} onChange={v => set({ color: v })} />
      <div className={row}>
        <span className={label}>B / I / U</span>
        <span className="flex gap-1">
          {([['bold', 'B', 'font-bold'], ['italic', 'I', 'italic']] as const).map(([k, t, cls]) => (
            <button key={k} className={`w-7 rounded-md border px-1 py-0.5 ${cls} ${c[k] ? 'border-accent bg-accent text-zinc-900' : 'border-line'} hover:bg-panel-raised`}
              onClick={() => set({ [k]: !c[k] } as Partial<TextContent>)}>{t}</button>
          ))}
        </span>
      </div>
      <div className={row}>
        <span className={label}>align</span>
        <span className="flex gap-1">
          {(['left', 'center', 'right', 'justify'] as const).map(a => (
            <button key={a} className={`rounded-md border px-1.5 py-0.5 text-[10px] ${(c.align?.[0] ?? 'left') === a ? 'border-accent bg-accent text-zinc-900' : 'border-line'} hover:bg-panel-raised`}
              onClick={() => set({ align: [a, c.align?.[1] ?? 'top'] })}>{a[0].toUpperCase()}</button>
          ))}
        </span>
      </div>
      <NumField title="lineHeight" value={c.lineHeight} step={0.1} onChange={n => set({ lineHeight: n })} />
      <div className={row}>
        <span className={label}>font</span>
        <select className={input} value={typeof c.fontFamily === 'string' ? c.fontFamily : 'inherit'}
          onChange={e => set({ fontFamily: e.target.value === 'inherit' ? undefined : e.target.value })}>
          {FONT_STACKS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <ColorField title="background" value={c.backgroundColor} onChange={v => set({ backgroundColor: v || undefined })} />
    </>
  )
}

function ShapePanel({ el, patch }: { el: ShapeElement; patch: (fn: (e: Element) => Element, label: string) => void }) {
  return (
    <>
      <FillEditor fill={el.fill} onChange={f => patch(e => ({ ...(e as ShapeElement), fill: f }), 'fill')} />
      <BorderEditor border={el.border} onChange={b => patch(e => ({ ...(e as ShapeElement), border: b }), 'border')} />
      <ShadowEditor shadow={el.shadow} onChange={s => patch(e => ({ ...(e as ShapeElement), shadow: s }), 'shadow')} />
    </>
  )
}

function LinePanel({ el, patch }: { el: LineElement; patch: (fn: (e: Element) => Element, label: string) => void }) {
  return (
    <>
      <BorderEditor border={el.border} onChange={b => patch(e => ({ ...(e as LineElement), border: b }), 'border')} />
      <ShadowEditor shadow={el.shadow} onChange={s => patch(e => ({ ...(e as LineElement), shadow: s }), 'shadow')} />
    </>
  )
}

function ImagePanel({ el, patch }: { el: ImageElement; patch: (fn: (e: Element) => Element, label: string) => void }) {
  return (
    <>
      <div className={row}>
        <span className={label}>fit</span>
        <select className={input} value={el.fit?.mode ?? 'cover'}
          onChange={e => patch(x => ({ ...(x as ImageElement), fit: { mode: e.target.value as 'cover' | 'contain' | 'fill' } }), 'fit')}>
          <option value="cover">cover</option><option value="contain">contain</option><option value="fill">fill</option>
        </select>
      </div>
      <BorderEditor border={el.border} onChange={b => patch(e => ({ ...(e as ImageElement), border: b }), 'border')} />
      <ShadowEditor shadow={el.shadow} onChange={s => patch(e => ({ ...(e as ImageElement), shadow: s }), 'shadow')} />
      <div className={row}>
        <span className={label}>src</span>
        <input type="text" className={input} value={el.src} onChange={e => patch(x => ({ ...(x as ImageElement), src: e.target.value }), 'src')} />
      </div>
    </>
  )
}

function IconPanel({ el, patch }: { el: IconElement; patch: (fn: (e: Element) => Element, label: string) => void }) {
  return (
    <>
      <div className={row}>
        <span className={label}>iconName</span>
        <input type="text" className={input} value={el.iconName}
          onChange={e => patch(x => ({ ...(x as IconElement), iconName: e.target.value }), 'icon')} />
      </div>
      <FillEditor fill={el.fill} onChange={f => patch(e => ({ ...(e as IconElement), fill: f }), 'fill')} />
    </>
  )
}

function PagePanel({ page, project, index, run }: {
  page: Page; project: LoadedProject; index: number; run: (cmd: ReturnType<typeof pageCmd>) => void
}) {
  const before = page
  const setBg = (color?: string) => run(pageCmd(index, before, { ...before, background: color ? { type: 'solid', color } : undefined }, 'page background'))
  const setNotes = (notes: string) => run(pageCmd(index, before, { ...before, notes }, 'page notes'))
  const bg = page.background?.type === 'solid' ? page.background.color : undefined
  return (
    <div className="mt-2 border-t border-line-soft pt-2">
      <ColorField title="page bg" value={bg} onChange={c => { if (c) setBg(c) }} />
      <div className={row}>
        <span className={label}>bg off</span>
        <button className="rounded-md border border-line px-2 py-0.5 text-[11px] hover:bg-panel-raised" onClick={() => setBg(undefined)}>reset</button>
      </div>
      <label className={row}>
        <span className={label}>notes</span>
      </label>
      <textarea className={`${input} min-h-16`} value={page.notes ?? ''} onChange={e => setNotes(e.target.value)} />
      <p className="mt-1 text-[10px] text-muted">{project.pages.length} slides · [{project.size.join('×')}]</p>
    </div>
  )
}
