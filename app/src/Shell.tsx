import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LoadedProject } from './types'
import { folderSource, loadProject, stripRoot, type FileSource } from './load'
import { Viewer } from './Viewer'
import { FileExplorer } from './FileExplorer'
import { FilePreviewer } from './FilePreviewer'
import { useDragResize } from './useDragResize'

const param = (k: string) => new URLSearchParams(window.location.search).get(k)

export function Shell() {
  const [project, setProject] = useState<LoadedProject | null>(null)
  const [source, setSource] = useState<FileSource | null>(null)
  const [cur, setCur] = useState(0)
  const [status, setStatus] = useState<{ msg: string; err: boolean } | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [present, setPresent] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [notesH, onNotesResize] = useDragResize(120, 'y', 48, 480) // px
  const qaDeck = useMemo(() => param('qa'), [])

  const show = useCallback((p: LoadedProject, src: FileSource) => {
    setPresent(false)
    setProject(p)
    setSource(src)
    setCur(0)
  }, [])

  const handleFiles = useCallback(async (files: File[]) => {
    try {
      setStatus({ msg: 'loading…', err: false })
      const src = folderSource(stripRoot(files))
      show(await loadProject(src), src)
      setStatus(null)
    } catch (e) {
      setStatus({ msg: e instanceof Error ? e.message : String(e), err: true })
    }
  }, [show])


  // inject deck-supplied fonts (spec: CustomFont.src is a Google Fonts CSS URL)
  useEffect(() => {
    if (!project?.customFonts) return
    for (const f of project.customFonts) {
      if ([...document.head.querySelectorAll('link[data-pptd-font]')].some(l => l.getAttribute('href') === f.src)) continue
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = f.src
      link.setAttribute('data-pptd-font', f.family)
      document.head.appendChild(link)
    }
  }, [project])

  // keyboard nav; in present mode arrows navigate, Esc exits
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCur(c => Math.min(c + 1, (project?.pages.length ?? 1) - 1))
      if (e.key === 'ArrowLeft') setCur(c => Math.max(c - 1, 0))
      if (!present && e.key === 'f' && !e.metaKey && !e.ctrlKey) setPresent(p => !p)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [project, present])

  // success toasts auto-dismiss; errors persist until the next action
  useEffect(() => {
    if (!status || status.err) return
    const t = setTimeout(() => setStatus(null), 2500)
    return () => clearTimeout(t)
  }, [status])

  // present mode = fullscreen; browser Esc exits fullscreen → sync present=false
  useEffect(() => {
    if (present) {
      void document.documentElement.requestFullscreen?.().catch(() => {})
    } else if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
    }
    const onFsChange = () => {
      if (!document.fullscreenElement) setPresent(false)
    }
    addEventListener('fullscreenchange', onFsChange)
    return () => removeEventListener('fullscreenchange', onFsChange)
  }, [present])

  const n = project?.pages.length ?? 0
  const notes = project && showNotes ? project.pages[cur]?.notes : undefined
  const refSrc =
    project && qaDeck && project.pptdPath
      ? `/example/${qaDeck}/${project.pptdPath.replace(/.*\//, '').replace(/\.pptd$/, '')}-png/slide_${String(cur + 1).padStart(2, '0')}.png`
      : null

  return (
    <div className="flex h-dvh">
      {!present && (
        <FileExplorer
          project={project}
          onFiles={files => void handleFiles(files)}
          currentSlide={cur}
          onSlideChange={setCur}
          onFileSelect={setSelectedFile}
        />
      )}
      <main className="flex min-w-0 flex-1 flex-col">
        {!present && (
          <div className="flex items-center gap-2 border-b border-line bg-panel px-4 py-2 text-xs">
            {project && <b className="text-fg">{project.title}</b>}
            {n > 0 && <span className="text-dim">slide {cur + 1} / {n}</span>}
            {status && (
              <span className={status.err ? 'text-rose-300' : 'animate-[fade-in_.2s] text-green-300'}>{status.msg}</span>
            )}
            <span className="flex-1" />
            {project && (
              <>
                <button className="rounded-md border border-line bg-transparent px-[11px] py-1.5 text-xs font-medium text-fg hover:border-zinc-700 hover:bg-panel-raised" onClick={() => setShowNotes(s => !s)}>{showNotes ? 'Hide notes' : 'Notes'}</button>
                <button className="rounded-md border border-accent bg-accent px-[11px] py-1.5 text-xs font-medium text-zinc-900 hover:bg-orange-400" onClick={() => setPresent(true)}>{present ? 'Exit present' : 'Present'}</button>
              </>
            )}
            <span className="text-dim">←/→ navigate</span>
          </div>
        )}

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto">
          {project ? (
            <div className="flex h-full min-w-0 w-full">
              <Viewer project={project} index={cur} onSlideChange={setCur} present={present} onProjectChange={fn => setProject(p => (p ? fn(p) : p))} onComment={(componentRef, comment) => { void navigator.clipboard?.writeText(comment ? `${componentRef}: ${comment}` : componentRef); setStatus({ msg: 'Comments Copied', err: false }) }} />
              {refSrc && (
                <figure className="flex h-full min-h-0 min-w-0 flex-1 flex-col items-center justify-center">
                  <img src={refSrc} alt={`soffice reference, slide ${cur + 1}`} className="min-h-0 max-h-full max-w-full flex-1 rounded-lg border border-line object-contain" />
                  <figcaption className="mt-2 text-[11px] text-muted">reference (soffice)</figcaption>
                </figure>
              )}
            </div>
          ) : (
            <div className="grid min-h-[200px] place-items-center p-10 text-dim">
              <p>
                <b>Open a PPTD project folder</b>
              </p>
              <p className="mt-2 text-center text-xs">
                expected layout:
                <br />
                <code className="text-fg">my_deck.pptd / pages/*.page / media/*</code>
              </p>
            </div>
          )}
        </div>

        {!present && notes && (
          <>
            <div className="group relative h-2 cursor-row-resize" onPointerDown={onNotesResize} role="separator" aria-orientation="horizontal">
              <div className="absolute inset-x-0 top-0 h-px bg-line group-hover:bg-accent" />
            </div>
            <div className="border-t border-line bg-panel-raised overflow-auto px-5 py-3 whitespace-pre-wrap text-dim" style={{ height: notesH }}>{notes}</div>
          </>
        )}

      </main>
      {selectedFile && (
        <FilePreviewer source={source} selectedFile={selectedFile} onClose={() => setSelectedFile(null)} />
      )}
    </div>
  )
}
