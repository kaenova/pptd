// Phase-1 exit check: loader round-trips the real yu7 deck from disk.
// Run: bun run test/smoke.test.ts (or bun test)
import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadProject, folderSource, stripRoot } from '../src/load'

const DECK = path.join(import.meta.dir, '../../skills/cowork-ppt/example/yu7-ppt')

function diskSource(root: string) {
  const rel = (p: string) => path.join(root, p)
  return {
    read: async (p: string) => fs.readFileSync(rel(p), 'utf8'),
    url: (p: string) => 'file://' + rel(p),
    list: async () => {
      const out: string[] = []
      const walk = (d: string) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const r = path.join(d, e.name)
          if (e.isDirectory()) walk(r)
          else out.push(path.relative(root, r))
        }
      }
      walk(root)
      return out
    },
  }
}

describe('loadProject', () => {
  test('loads yu7 deck from disk', async () => {
    const proj = await loadProject(diskSource(DECK))
    expect(proj.title).toContain('YU7')
    expect(proj.size).toEqual([960, 540])
    expect(proj.pages.length).toBe(8)
    for (const p of proj.pages) expect(p.elements.length).toBeGreaterThan(0)
  })

  test('resolves page src refs to source URLs', async () => {
    const proj = await loadProject(diskSource(DECK))
    const bg = proj.pages[0].background as { src?: string }
    expect(bg?.src).toMatch(/^file:\/.*bg_cover\.jpg$/)
  })

  test('stripRoot strips the single picked folder name', () => {
    const fake = (rel: string) => ({ name: 'x', webkitRelativePath: rel }) as unknown as File
    const map = stripRoot([fake('yu7-ppt/yu7.pptd'), fake('yu7-ppt/pages/1_cover.page')])
    expect(Object.keys(map).sort()).toEqual(['pages/1_cover.page', 'yu7.pptd'])
  })
})

describe('upload path smoke (folderSource)', () => {
  test('loads deck via folderSource File map', async () => {
    const files: Record<string, File> = {}
    for (const rel of ['yu7.pptd', 'pages/1_cover.page']) {
      const abs = path.join(DECK, rel)
      files[rel] = new File([fs.readFileSync(abs)], rel)
    }
    // only load one page: point a scratch .pptd at it
    files['single.pptd'] = new File(['version: v2\nsize: [960, 540]\npages: [pages/1_cover.page]'], 'single.pptd')
    delete files['yu7.pptd']
    const proj = await loadProject(folderSource(files))
    expect(proj.pages.length).toBe(1)
    expect(proj.pages[0].elements.length).toBeGreaterThan(0)
  })

  test('throws on missing page file', async () => {
    const files: Record<string, File> = {
      'deck.pptd': new File(['version: v2\nsize: [960, 540]\npages: [pages/gone.page]'], 'deck.pptd'),
    }
    await expect(loadProject(folderSource(files))).rejects.toThrow('missing file in folder')
  })
})
