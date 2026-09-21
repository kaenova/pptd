/**
 * PreviewerRoot — smart root: fetches content, detects kind, Escape-to-close.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { FileSource } from '../load'
import { Ctx } from './context'
import { kindOf, langOf } from './helpers'

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
