import { expect, test } from 'bun:test'
import { loadProject } from '../src/load'

function load(elements: unknown[]) {
  const files: Record<string, string> = {
    'deck.pptd': JSON.stringify({ pages: ['slide.page'] }),
    'slide.page': JSON.stringify({ elements }),
  }
  return loadProject({ list: async () => Object.keys(files), read: async p => files[p], url: p => p })
}

test('requires nonempty string element IDs, unique per page', async () => {
  for (const elementId of [undefined, null, '', '  ', 42])
    await expect(load([{ elementId }])).rejects.toThrow('elementId must be a nonempty string')
  await expect(load([{ elementId: 'title' }, { elementId: 'title' }])).rejects.toThrow('duplicate elementId: title')
  expect((await load([{ elementId: 'title' }, { elementId: 'body' }])).pages).toHaveLength(1)
})
