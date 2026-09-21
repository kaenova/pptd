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

  const handleMount: EditorProps['onMount'] = (editor, monaco: Monaco) => {
    editorRef.current = editor
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

  if (!selectedFile) return null

  return (
    <div className="file-previewer-overlay" onClick={onClose}>
      <div className="file-previewer" onClick={e => e.stopPropagation()}>
        <div className="file-previewer-header">
          <div className="file-previewer-title">
            <span className="file-icon">▤</span>
            <span>{selectedFile}</span>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close preview">✕</button>
        </div>
        <div className="file-previewer-content">
          {error && <div className="file-previewer-error">⚠️ {error}</div>}
          {!error && isImage && imgSrc && (
            <div className="file-previewer-image">
              <img src={imgSrc} alt={selectedFile} />
            </div>
          )}
          {!error && binary && !isImage && <div className="file-previewer-error">⚠️ binary file — no text preview</div>}
          {!error && !binary && (
            <Editor
              height="100%"
              language={language}
              value={content}
              theme="pptd-dark"
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
        <div className="file-previewer-footer">
          <span>{content.length} characters</span>
          <span>{content.split('\n').length} lines</span>
          <span className="spacer" />
          <span>{language}</span>
        </div>
      </div>
    </div>
  )
}
