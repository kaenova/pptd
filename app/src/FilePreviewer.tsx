import { useEffect, useRef, useState } from 'react'
import Editor, { type EditorProps, type Monaco } from '@monaco-editor/react'
import type { FileSource } from './load'

interface FilePreviewerProps {
  source: FileSource | null
  selectedFile: string | null
  onClose: () => void
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
  'json': 'json', 'html': 'html', 'css': 'css', 'scss': 'scss', 'less': 'less',
  'md': 'markdown', 'mdx': 'markdown', 'yml': 'yaml', 'yaml': 'yaml', 'xml': 'xml',
  'txt': 'plaintext', 'py': 'python', 'go': 'go', 'rs': 'rust', 'php': 'php',
  'sql': 'sql', 'sh': 'shell', 'rb': 'ruby', 'c': 'c', 'cpp': 'cpp', 'h': 'c',
  'hpp': 'cpp', 'svg': 'xml', 'pptd': 'yaml', 'page': 'yaml',
}

const IMAGE_RE = /\.(jpe?g|png|gif|webp|ico)$/i
const BINARY_RE = /\.(jpe?g|png|gif|webp|ico|mp4|webm|mp3|wav|woff2?|ttf|otf|eot|pdf|zip)$/i

export function FilePreviewer({ source, selectedFile, onClose }: FilePreviewerProps) {
  const [content, setContent] = useState('')
  const [language, setLanguage] = useState('plaintext')
  const [error, setError] = useState('')
  const binary = selectedFile ? BINARY_RE.test(selectedFile) : false
  const isImage = selectedFile ? IMAGE_RE.test(selectedFile) : false
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!source || !selectedFile || !isImage) return
    setImgSrc(source.url(selectedFile))
  }, [source, selectedFile, isImage])
  const editorRef = useRef<Monaco['editor']['IStandaloneCodeEditor'] | null>(null)

  useEffect(() => {
    if (!source || !selectedFile || BINARY_RE.test(selectedFile)) return
    setContent('')
    setError('')
    source.read(selectedFile).then(text => {
      const ext = selectedFile.split('.').pop()?.toLowerCase() ?? ''
      setLanguage(LANGUAGE_BY_EXT[ext] ?? 'plaintext')
      setContent(text)
    }).catch(err => setError(err instanceof Error ? err.message : String(err)))
  }, [source, selectedFile])

  const handleBeforeMount = (monaco: Monaco) => {
    // must be defined BEFORE the editor instance mounts — defining in onMount makes
    // the first render fall back to the default light theme
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

  const handleMount: EditorProps['onMount'] = editor => {
    editorRef.current = editor
  }

  if (!selectedFile) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 animate-[fade-in_.15s_ease-out]" onClick={onClose}>
      <div
        className="flex h-[85vh] w-[min(1100px,92vw)] flex-col overflow-hidden rounded-xl border border-line bg-bg shadow-2xl animate-[slide-up_.2s_ease-out]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line-soft bg-panel px-4 py-3">
          <div className="flex items-center gap-2 text-[13px] text-fg">
            <span className="w-3.5 text-center text-[10px] text-muted">▤</span>
            <span>{selectedFile}</span>
          </div>
          <button
            className="size-7 rounded-md border border-line bg-transparent text-sm leading-none text-dim hover:bg-panel-raised hover:text-fg"
            onClick={onClose}
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>
        <div className="file-previewer-content min-h-0 flex-1">
          {error && <div className="grid h-full place-items-center p-6 text-center text-rose-300">⚠️ {error}</div>}
          {!error && isImage && imgSrc && (
            <div className="flex h-full items-center justify-center bg-[repeating-conic-gradient(#1c1c1f_0%_25%,#232326_0%_50%)] bg-[length:20px_20px] p-4">
              <img src={imgSrc} alt={selectedFile} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {!error && binary && !isImage && <div className="grid h-full place-items-center p-6 text-center text-rose-300">⚠️ binary file — no text preview</div>}
          {!error && !binary && (
            <Editor
              height="100%"
              language={language}
              value={content}
              theme="pptd-dark"
              beforeMount={handleBeforeMount}
              onMount={handleMount}
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
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-line-soft bg-panel px-4 py-2 text-[11px] text-muted">
          <span>{content.length} characters</span>
          <span>{content.split('\n').length} lines</span>
          <span className="flex-1" />
          <span>{language}</span>
        </div>
      </div>
    </div>
  )
}
