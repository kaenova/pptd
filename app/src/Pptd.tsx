import { useEffect, useState } from 'react'
import type { FileSource } from './load'
import type { LoadedProject } from './types'
import { loadProject } from './load'
import { Viewer } from './Viewer'
export type PptdMode = 'view' | 'edit' | 'present'
export type PptdSource = LoadedProject | FileSource

export interface PptdProps {
  source?: PptdSource
  mode?: PptdMode
  onSave?: (project: LoadedProject) => void | Promise<void>
  feature?: { componentGrabber?: boolean }
  className?: string
}

function isLoadedProject(source: PptdSource): source is LoadedProject {
  return 'pages' in source && Array.isArray(source.pages)
}

/** Reusable PPTD renderer. Editing hooks are reserved; current edit mode renders normally. */
export function Pptd({ source, mode = 'view', onSave: _onSave, feature: _feature, className }: PptdProps) {
  const [project, setProject] = useState<LoadedProject | null>(() => (source && isLoadedProject(source) ? source : null))
  const [index, setIndex] = useState(0)

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
  return (
    <div className={`pptd${mode === 'present' ? ' pptd-present' : ''}${className ? ` ${className}` : ''}`}>
      <Viewer project={project} index={index} />
    </div>
  )
}
