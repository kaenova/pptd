import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LoadedProject } from './types'
import { folderSource, filesFromDrop, httpSource, loadProject, stripRoot } from './load'
import { Viewer } from './Viewer'
import { DeckView } from './Renderer'

const EXAMPLE_BASE = '/example/yu7-ppt' // dev proxy into the repo's example decks
// ?deck=xiaomi-yu7-ppt-animation loads another example deck; ?qa=<folder> = dev-only
// side-by-side QA: viewer vs soffice reference PNGs (python -m pptd_utils png all <deck>.pptd)
const param = (k: string) => new URLSearchParams(window.location.search).get(k)
const exampleBase = () => param('deck') ? `/example/${param('deck')}` : EXAMPLE_BASE

export function Shell() {
  const [project, setProject] = useState<LoadedProject | null>(null)
  const [cur, setCur] = useState(0)
  const [status, setStatus] = useState<{ msg: string; err: boolean } | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [present, setPresent] = useState(false)
  const qaDeck = useMemo(() => param('qa'), [])

  const show = useCallback((p: LoadedProject) => {
    setProject(p)
    setCur(0)
  }, [])

  const handleFiles = useCallback(
    async (files: File[]) => {
      try {
        setStatus({ msg: 'loading…', err: false })
        show(await loadProject(folderSource(stripRoot(files))))
        setStatus(null)
      } catch (e) {
        setStatus({ msg: e instanceof Error ? e.message : String(e), err: true })
      }
    },
    [show],
  )

  const loadExample = useCallback(async () => {
    try {
      setStatus({ msg: 'loading example…', err: false })
      show(await loadProject(httpSource(exampleBase())))
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

  // keyboard nav + present toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCur(c => Math.min(c + 1, (project?.pages.length ?? 1) - 1))
      if (e.key === 'ArrowLeft') setCur(c => Math.max(c - 1, 0))
      if (e.key === 'f' && !e.metaKey && !e.ctrlKey) setPresent(p => !p)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [project])

  // success toasts auto-dismiss; errors persist until the next action
  useEffect(() => {
    if (!status || status.err) return
    const t = setTimeout(() => setStatus(null), 2500)
    return () => clearTimeout(t)
  }, [status])

  // present mode = fullscreen stage, rail hidden
  useEffect(() => {
    if (present) void document.documentElement.requestFullscreen?.().catch(() => {})
    else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  }, [present])

  const n = project?.pages.length ?? 0
  const notes = project && showNotes ? project.pages[cur]?.notes : undefined
  const refSrc =
    project && qaDeck && project.pptdPath
      ? `/example/${qaDeck}/${project.pptdPath.replace(/.*\//, '').replace(/\.pptd$/, '')}-png/slide_${String(cur + 1).padStart(2, '0')}.png`
      : null

  return (
    <div className={`shell${present ? ' presenting' : ''}`}>
      <aside className="rail">
        <h1>Slides</h1>
        <div className="thumbs">
          {project?.pages.map((_, i) => (
            <div
              key={i}
              className={`thumb${i === cur ? ' active' : ''}`}
              style={{ height: (112 * project.size[1]) / project.size[0] }}
              onClick={() => setCur(i)}
            >
              <div
                className="mini"
                style={{
                  width: project.size[0],
                  height: project.size[1],
                  transform: `scale(${112 / project.size[0]})`,
                  transformOrigin: 'top left',
                  position: 'absolute',
                  overflow: 'hidden',
                  background: '#fff',
                }}
              >
                <DeckView project={project} index={i} />
              </div>
              <span className="no">{i + 1}</span>
            </div>
          ))}
        </div>
        {!project && <p className="hint">upload a folder, or load the example deck</p>}
      </aside>

      <main className="main">
        <div className="bar">
          <label className="btn">
            📁 Upload .pptd folder
            <input
              type="file"
              hidden
              multiple
              // @ts-expect-error non-standard but universal
              webkitdirectory=""
              onChange={e => e.target.files && handleFiles([...e.target.files])}
            />
          </label>
          <button className="ghost" onClick={loadExample}>
            load example
          </button>
          <b>{project?.title ?? 'PPTD Viewer'}</b>
          {n > 0 && (
            <span className="dim">
              slide {cur + 1} / {n}
            </span>
          )}
          {status && <span style={{ color: status.err ? '#f85' : '#7ee787' }}>{status.msg}</span>}
          <span className="spacer" />
          {project && (
            <>
              <button className="ghost" onClick={() => setShowNotes(s => !s)}>{showNotes ? 'hide notes' : 'notes'}</button>
              <button className="ghost" onClick={() => setPresent(p => !p)}>{present ? 'exit present' : 'present (f)'}</button>
            </>
          )}
          <span className="dim">←/→ navigate</span>
        </div>

        {notes && <div className="notes">{notes}</div>}

        <div
          className="stage-wrap"
          onDragOver={e => {
            e.preventDefault()
            e.currentTarget.classList.add('dragover')
          }}
          onDragLeave={e => e.currentTarget.classList.remove('dragover')}
          onDrop={async e => {
            e.preventDefault()
            e.currentTarget.classList.remove('dragover')
            handleFiles(await filesFromDrop(e.dataTransfer.items))
          }}
        >
          {project ? (
            <div className={refSrc ? 'qa-split' : undefined}>
              <Viewer project={project} index={cur} />
              {refSrc && (
                <figure className="qa-ref">
                  <img src={refSrc} alt={`soffice reference, slide ${cur + 1}`} />
                  <figcaption>reference (soffice)</figcaption>
                </figure>
              )}
            </div>
          ) : (
            <div className="empty">
              <p>
                <b>Drop a PPTD project folder here</b>
              </p>
              <p className="hint">
                expected layout:
                <br />
                <code>my_deck.pptd / pages/*.page / media/*</code>
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
