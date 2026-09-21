import { useEffect, useRef, useState } from 'react'
import type { FileSource } from './load'
import type { LoadedProject } from './types'
import { loadProject } from './load'
import { Viewer } from './Viewer'
import { selectionLabel, type ComponentSelection, type SelectFeature } from './select'
import { SelectPopover } from './SelectPopover'
import './index.css'
export type PptdMode = 'view' | 'edit' | 'present'
export type PptdSource = LoadedProject | FileSource

export interface PptdProps {
  source?: PptdSource
  mode?: PptdMode
  onSave?: (project: LoadedProject) => void | Promise<void>
  features?: { select?: SelectFeature }
  className?: string
}

function isLoadedProject(source: PptdSource): source is LoadedProject {
  return 'pages' in source && Array.isArray(source.pages)
}

/** Reusable PPTD renderer. Editing hooks are reserved; current edit mode renders normally. */
export function Pptd({ source, onSave: _onSave, features, className }: PptdProps) {
  const [project, setProject] = useState<LoadedProject | null>(() => (source && isLoadedProject(source) ? source : null))
  const [index, setIndex] = useState(0)
  const [selection, setSelection] = useState<ComponentSelection | null>(null)
  const [comment, setComment] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    if (!source) {
      setProject(null)
      return () => { active = false }
    }
    if (isLoadedProject(source)) {
      setProject(source)
      setIndex(0)
      return () => { active = false }
    }
    void loadProject(source).then(p => {
      if (active) {
        setProject(p)
        setIndex(0)
      }
    })
    return () => { active = false }
  }, [source])

  if (!project) return null
  const select = features?.select
  const submit = () => {
    if (!selection || !select) return
    select.handleOnSelect(selectionLabel(selection), comment)
    setSelection(null)
    setComment('')
  }
  return (
    <div ref={rootRef} className={`relative h-full w-full overflow-hidden text-fg${className ? ` ${className}` : ''}`}>
      <Viewer project={project} index={index} onSlideChange={setIndex} onSelect={select ? selection => {
        const root = rootRef.current?.getBoundingClientRect()
        setSelection(root ? { ...selection, x: selection.x - root.left, y: selection.y - root.top } : selection)
      } : undefined} />
      {selection && select && <SelectPopover selection={selection} comment={comment} onCommentChange={setComment} onSubmit={submit} />}
    </div>
  )
}
