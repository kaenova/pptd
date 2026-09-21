/**
 * Previewer content parts — self-guarding: each renders null unless its kind matches.
 */
import { useRef } from 'react'
import Editor from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import { useCtx } from './context'
import { ensureTheme } from './helpers'

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
