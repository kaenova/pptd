import { useRef } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import type { LoadedProject } from './types'
import { filesFromDrop } from './load'

interface FileExplorerProps {
  project: LoadedProject | null
  onFiles: (files: File[]) => void
  currentSlide: number
  onSlideChange: (index: number) => void
  onFileSelect?: (filePath: string) => void
}

const treeRow = 'flex min-h-8 w-full items-center gap-2 rounded-md border-0 bg-transparent px-[9px] text-left text-dim font-[inherit]'
const treeHover = 'hover:bg-panel-raised hover:text-fg'

export function FileExplorer({ project, onFiles, currentSlide, onSlideChange, onFileSelect }: FileExplorerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const chooseFolder = () => inputRef.current?.click()
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) onFiles([...event.target.files])
  }
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    void filesFromDrop(event.dataTransfer.items).then(onFiles)
  }
  return (
    <aside
      className="flex w-[264px] max-sm:w-[210px] flex-none flex-col border-r border-line bg-panel text-fg max-md:hidden"
      onDragOver={event => event.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex min-h-[72px] items-center border-b border-line-soft px-4 py-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted">Workspace</div>
          <h1 className="mt-[3px] text-[15px] tracking-tight">PPTD Viewer and Editor</h1>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        // @ts-expect-error non-standard directory picker attribute
        webkitdirectory=""
        onChange={onChange}
      />
      <div className="flex-1 overflow-auto px-2 py-3">
        <button className={`${treeRow} mb-3 cursor-pointer text-accent ${treeHover}`} type="button" onClick={chooseFolder}>
          <span className="w-3.5 text-center text-accent">⌁</span>
          <span>Open .pptd folder</span>
        </button>
        {project ? (
          <div>
            <div className={`${treeRow} font-semibold text-fg`}>
              <span className="w-3.5 text-center text-accent">▾</span>
              <span>{project.title}</span>
            </div>
            <div className={treeRow}>
              <span className="w-3.5 text-center text-[10px] text-muted">◆</span>
              <span>{project.pptdPath ?? 'presentation.pptd'}</span>
            </div>
            <div className={treeRow}>
              <span className="w-3.5 text-center text-accent">▾</span>
              <span>pages</span>
            </div>
            {project.pages.map((_, index) => (
              <button
                className={`${treeRow} cursor-pointer pl-[31px] ${treeHover}${index === currentSlide ? ' bg-accent-soft font-semibold text-fg shadow-[inset_2px_0_var(--color-accent)]' : ''}`}
                type="button"
                key={index}
                onClick={() => onSlideChange(index)}
                onDoubleClick={() => project.pagePaths?.[index] && onFileSelect?.(project.pagePaths[index])}
              >
                <span className="w-3.5 text-center text-[10px] text-sky-400">▤</span>
                <span>slide-{String(index + 1).padStart(2, '0')}.page</span>
              </button>
            ))}
            <div className={treeRow}>
              <span className="w-3.5 text-center text-accent">▾</span>
              <span>media</span>
              <span className="ml-auto text-[11px] text-muted">assets</span>
            </div>
            {project.media?.map((file: string) => (
              <button className={`${treeRow} cursor-pointer pl-[31px] ${treeHover}`} type="button" key={file} onDoubleClick={() => onFileSelect?.(file)}>
                <span className="w-3.5 text-center text-[10px] text-muted">◆</span>
                <span>{file}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid justify-items-center gap-[7px] px-3 py-14 text-center text-muted">
            <span className="text-2xl text-accent">⌂</span>
            <p className="text-dim">No presentation loaded</p>
            <span>Drop a folder here</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-line-soft px-4 py-3 text-[11px] text-muted">
        <span className={`size-[7px] rounded-full ${project ? 'bg-green-500 shadow-[0_0_8px_#22c55e88]' : 'bg-muted'}`} />
        {project ? 'Ready' : 'Waiting for a file'}
      </div>
    </aside>
  )
}
