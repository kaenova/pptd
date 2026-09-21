/**
 * Previewer pure helpers + Monaco theme setup.
 */
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

// Monaco theme must be defined BEFORE the editor instance mounts — defining it
// in onMount makes the first render fall back to the default light theme.
let themeDefined = false
export function ensureTheme(monaco: { editor: { defineTheme: (name: string, theme: unknown) => void } }) {
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
