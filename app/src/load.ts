// Folder -> LoadedProject. Same contract as mockup; spec rules:
// everything is self-contained under the .pptd folder, relative paths only.
import { load as yamlLoad } from 'js-yaml'
import type { LoadedProject, Page, Presentation } from './types'

const IMG_RE = /\.(jpe?g|png|gif|webp|svg)$/i

/** webkitRelativePath includes the picked/dropped folder name; strip that first segment. */
export function stripRoot(files: File[]): Record<string, File> {
  const out: Record<string, File> = {}
  let root: string | null = null
  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
    if (root === null) root = rel.includes('/') ? rel.slice(0, rel.indexOf('/') + 1) : ''
    if (root && rel.startsWith(root)) out[rel.slice(root.length)] = f
    else out[rel] = f
  }
  return out
}

/** Rewrite every non-http `src` (background fills, image elements) to the source's URL form. */
export function resolveSrc(obj: unknown, base: string, urlOf: (path: string) => string): unknown {
  if (Array.isArray(obj)) {
    for (const o of obj) resolveSrc(o, base, urlOf)
    return obj
  }
  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>
    if (typeof o.src === 'string' && !o.src.startsWith('http')) o.src = urlOf(base + o.src)
    for (const v of Object.values(o)) resolveSrc(v, base, urlOf)
  }
  return obj
}

export interface FileSource {
  read(path: string): Promise<string>
  url(path: string): string
  list(): Promise<string[]> // relative paths, needed to find the root .pptd and blob-able media
}

/** Source backed by an uploaded/dropped folder (webkitdirectory or recursive drop). */
export function folderSource(files: Record<string, File>): FileSource {
  const urls: Record<string, string> = {}
  for (const [p, f] of Object.entries(files)) if (IMG_RE.test(p)) urls[p] = URL.createObjectURL(f)
  return {
    read: async path => {
      const f = files[path]
      if (!f) throw new Error(`missing file in folder: ${path}`)
      return f.text()
    },
    url: path => urls[path] ?? path,
    list: async () => Object.keys(files),
  }
}

/** Source backed by HTTP (dev proxy for repo example decks). */
export function httpSource(baseUrl: string): FileSource {
  const cache = new Map<string, string>()
  return {
    read: async path => {
      if (!cache.has(path)) {
        const res = await fetch(`${baseUrl}/${path}`)
        if (!res.ok) throw new Error(`fetch ${baseUrl}/${path}: ${res.status}`)
        cache.set(path, await res.text())
      }
      return cache.get(path)!
    },
    url: path => `${baseUrl}/${path}`,
    list: async () => {
      // example decks expose a manifest listing all files (see scripts/gen_example_manifest)
      const res = await fetch(`${baseUrl}/manifest.json`)
      if (!res.ok) throw new Error(`fetch ${baseUrl}/manifest.json: ${res.status}`)
      return res.json() as Promise<string[]>
    },
  }
}

export async function loadProject(src: FileSource): Promise<LoadedProject> {
  const entries = await src.list()
  const pptdPath = entries.find(p => p.endsWith('.pptd') && !p.includes('/'))
  if (!pptdPath) throw new Error('no .pptd file at folder root')
  const base = pptdPath.replace(/[^/]+$/, '')

  const pptd = yamlLoad(await src.read(pptdPath)) as Presentation
  if (!Array.isArray(pptd.pages) || pptd.pages.length === 0) throw new Error('.pptd has no pages list')

  const urlOf = (path: string) => src.url(path)
  const pages: Page[] = []
  for (const rel of pptd.pages) {
    const page = yamlLoad(await src.read(base + rel)) as Page
    if (!page || !Array.isArray(page.elements)) throw new Error(`invalid page: ${rel}`)
    pages.push(resolveSrc(page, base, urlOf) as Page)
  }
  return { title: pptd.title ?? pptdPath, size: pptd.size ?? [960, 540], theme: pptd.theme, customFonts: pptd.customFonts, pages }
}

// ---------- upload plumbing ----------

/** Recursive drop → File[]. readEntries returns ≤100 entries per call, so loop. */
export async function filesFromDrop(items: DataTransferItemList): Promise<File[]> {
  const files: File[] = []
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const fe = entry as FileSystemFileEntry
      const f = await new Promise<File>((res, rej) => fe.file(res, rej))
      Object.defineProperty(f, 'webkitRelativePath', { value: entry.fullPath.slice(1) })
      files.push(f)
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
        if (!batch.length) break
        for (const e of batch) await walk(e)
      }
    }
  }
  const entries: FileSystemEntry[] = []
  for (let i = 0; i < items.length; i++) {
    const e = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry()
    if (e) entries.push(e)
  }
  if (entries.length) {
    for (const e of entries) await walk(e)
    return files
  }
  // fallback: no entries support (some browsers)
  const out: File[] = []
  for (let i = 0; i < items.length; i++) {
    const f = items[i].getAsFile()
    if (f) out.push(f)
  }
  return out
}
