/**
 * Previewer — building blocks (Radix-style compound component).
 *
 * Smart Root owns all state (fetch, kind detection, language, image URL);
 * the parts below are dumb composable consumers of that context. Compose
 * them into a preset (see FilePreviewer.tsx) or arrange your own layout:
 *
 *   <Previewer.Root source={src} file={path} onClose={close}>
 *     <Previewer.Panel>
 *       <Previewer.Body><Previewer.Code /></Previewer.Body>
 *     </Previewer.Panel>
 *   </Previewer.Root>
 *
 * ponytail: parts take no className prop yet — one consumer today; add a
 * cn() merge when a second preset needs to override styling.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import Editor, { type Monaco } from '@monaco-editor/react'
import type { FileSource } from './load'

export const LANGUAGE_BY_EXT: Record<string, string> = {
  'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
  'json': 'json', 'html': 'html', 'css': 'css', 'scss': 'scss', 'less': 'less',
  'md': 'markdown', 'mdx': 'markdown', 'yml': 'yaml', 'yaml': 'yaml', 'xml': 'xml',
  'txt': 'plaintext', 'py': 'python', 'go': 'go', 'rs': 'rust', 'php': 'php',
  'sql': 'sql', 'sh': 'shell', 'rb': 'ruby', 'c': 'c', 'cpp': 'cpp', 'h': 'c',
  'hpp': 'cpp', 'svg': 'xml', 'pptd': 'yaml', 'page': 'yaml',
}

const IMAGE_RE = /\.(jpe?g|png|gif|webp|ico)$/i
const BINARY_RE = /\.(jpe?g|png|gif|webp|ico|mp4|webm|mp3|wav|woff2?|ttf|otf|eot|pdf|zip)$/i

export type PreviewKind = 'text' | 'image' | 'binary'

export function kindOf(file: string): PreviewKind {
  if (IMAGE_RE.test(file)) return 'image'
  if (BINARY_RE.test(file)) return 'binary'
  return 'text'
}

export function langOf(file: string): string {
  return LANGUAGE_BY_EXT[file.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext'
}

// --- context ----------------------------------------------------------------

interface PreviewCtx {
  file: string
  kind: PreviewKind
  content: string
  error: string
  language: string
  imgSrc: string | null
  close: () => void
}

const Ctx = createContext<PreviewCtx | null>(null)

function useCtx(): PreviewCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('Previewer parts must be used inside <Previewer.Root>')
  return ctx
}

// --- Root -------------------------------------------------------------------

export function PreviewerRoot({ source, file, onClose, children }: {
  source: FileSource | null
  file: string | null
  onClose: () => void
  children: ReactNode
}) {
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const kind = file ? kindOf(file) : null
  const language = file ? langOf(file) : 'plaintext'

  useEffect(() => {
    if (!source || !file) return
    setContent('')
    setError('')
    if (kind === 'image') { setImgSrc(source.url(file)); return }
    if (kind === 'binary') return
    source.read(file).then(setContent)
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
  }, [source, file, kind])

  useEffect(() => {
    if (!file) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [file, onClose])

  if (!source || !file || !kind) return null

  return (
    <Ctx.Provider value={{ file, kind, content, error, language, imgSrc, close: onClose }}>
      {children}
    </Ctx.Provider>
  )
}

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
      <span>{file}</span>
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

// --- content parts (self-guarding: render null unless their kind matches) ---

const CENTERED = 'grid h-full place-items-center p-6 text-center text-rose-300'

export function PreviewerError() {
  const { error } = useCtx()
  if (!error) return null
  return <div className={CENTERED}>⚠️ {error}</div>
}

export function PreviewerImage() {
  const { file, kind, imgSrc } = useCtx()
  if (kind !== 'image' || !imgSrc) return null
  return (
    <div className="flex h-full items-center justify-center bg-[repeating-conic-gradient(#1c1c1f_0%_25%,#232326_0%_50%)] bg-[length:20px_20px] p-4">
      <img src={imgSrc} alt={file} className="max-h-full max-w-full object-contain" />
    </div>
  )
}

export function PreviewerBinary() {
  const { kind } = useCtx()
  if (kind !== 'binary') return null
  return <div className={CENTERED}>⚠️ binary file — no text preview</div>
}

// Monaco theme must be defined BEFORE the editor instance mounts — defining it
// in onMount makes the first render fall back to the default light theme.
let themeDefined = false
function ensureTheme(monaco: Monaco) {
  if (themeDefined) return
  themeDefined = true
  monaco.editor.defineTheme('pptd-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '71717a', fontStyle: 'italic' },
      { token: 'string', foreground: '22c55e' },
      { token: 'number', foreground: 'f97316' },
      { token: 'keyword', foreground: '60a5fa', fontStyle: 'bold' },
      { token: 'type', foreground: 'fb923c' },
      { token: 'class', foreground: 'fb923c', fontStyle: 'bold' },
      { token: 'function', foreground: '60a5fa' },
      { token: 'variable', foreground: 'f4f4f5' },
    ],
    colors: {
      'editor.background': '#09090b',
      'editor.foreground': '#f4f4f5',
      'editor.lineHighlightBackground': '#18181b',
      'editor.selectionBackground': '#3f3f46',
      'editor.inactiveSelectionBackground': '#3f3f4633',
      'editorCursor.foreground': '#f97316',
      'editor.lineNumberForeground': '#71717a',
      'editor.lineNumberActiveForeground': '#a1a1aa',
    },
  })
}

export function PreviewerCode() {
  const { kind, content, language } = useCtx()
  const editorRef = useRef<Monaco['editor']['IStandaloneCodeEditor'] | null>(null)
  if (kind !== 'text') return null
  return (
    <Editor
      height="100%"
      language={language}
      value={content}
      theme="pptd-dark"
      beforeMount={ensureTheme}
      onMount={editor => { editorRef.current = editor }}
      options={{
        minimap: { enabled: true },
        fontSize: 14,
        lineNumbers: 'on',
        wordWrap: 'on',
        formatOnPaste: true,
        formatOnType: true,
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        suggest: { showKeywords: true },
        tabSize: 2,
        insertSpaces: true,
        scrollBeyondLastLine: false,
        fixedOverflowWidgets: true,
        hideCursorInOverviewRuler: true,
        renderLineHighlight: 'all',
        selectOnLineNumbers: true,
        mouseWheelZoom: true,
      }}
    />
  )
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
