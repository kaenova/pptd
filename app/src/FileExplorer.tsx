import { useRef } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import type { LoadedProject } from './types'
import { filesFromDrop } from './load'

interface FileExplorerProps {
  project: LoadedProject | null
  onFiles: (files: File[]) => void
  currentSlide: number
  onSlideChange: (index: number) => void
}

export function FileExplorer({ project, onFiles, currentSlide, onSlideChange }: FileExplorerProps) {
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
    <aside className="file-explorer" onDragOver={event => event.preventDefault()} onDrop={onDrop}>
      <div className="file-explorer-header">
        <div>
          <div className="eyebrow">Workspace</div>
          <h1>File Explorer</h1>
        </div>
        <button className="icon-button" type="button" onClick={chooseFolder} aria-label="Open PPTD folder">＋</button>
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
      <div className="file-explorer-body">
        <button className="folder-row folder-row-action" type="button" onClick={chooseFolder}>
          <span className="folder-icon">⌁</span>
          <span>Open .pptd folder</span>
        </button>
        {project ? (
          <div className="file-tree">
            <div className="folder-row active"><span className="folder-icon">▾</span><span>{project.title}</span></div>
            <div className="tree-file"><span className="file-icon">◆</span><span>{project.pptdPath ?? 'presentation.pptd'}</span></div>
            <div className="tree-group"><span className="folder-icon">▾</span><span>pages</span></div>
            {project.pages.map((_, index) => (
              <button className={`tree-file nested${index === currentSlide ? ' selected' : ''}`} type="button" key={index} onClick={() => onSlideChange(index)}><span className="file-icon page">▤</span><span>slide-{String(index + 1).padStart(2, '0')}.page</span></button>
            ))}
            <div className="tree-group"><span className="folder-icon">▸</span><span>media</span><span className="tree-count">assets</span></div>
          </div>
        ) : (
          <div className="explorer-empty"><span className="empty-icon">⌂</span><p>No presentation loaded</p><span>Drop a folder here</span></div>
        )}
      </div>
      <div className="file-explorer-footer"><span className={`status-dot${project ? ' ready' : ''}`} />{project ? 'Ready' : 'Waiting for a file'}</div>
    </aside>
  )
}
