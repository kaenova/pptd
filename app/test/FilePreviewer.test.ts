import { describe, it } from 'bun:test'
import { strict as assert } from 'assert'
import { kindOf, langOf, type PreviewKind } from '../src/Previewer'

describe('Previewer helpers', () => {
  it('detects binary files case-insensitively', () => {
    assert.equal(kindOf('media/photo.png'), 'image')
    assert.equal(kindOf('media/photo.JPG'), 'image')
    assert.equal(kindOf('media/video.mp4'), 'binary')
    assert.equal(kindOf('font.woff2'), 'binary')
    assert.notEqual(kindOf('yu7.pptd/pages/slide-01.page'), 'binary')
    assert.equal(kindOf('README.md'), 'text')
  })
  it('treats images as image-preview, not text/binary', () => {
    assert.equal(kindOf('media/logo.png'), 'image')
    assert.notEqual(kindOf('media/logo.png'), 'binary')
    assert.notEqual(kindOf('media/logo.png'), 'text')
  })
  it('infers language from extension', () => {
    assert.equal(langOf('pages/slide-01.page'), 'yaml')
    assert.equal(langOf('theme.css'), 'css')
    assert.equal(langOf('notes.txt'), 'plaintext')
    assert.equal(langOf('data.weird'), 'plaintext')
  })
  it('every kind is a valid PreviewKind', () => {
    const kinds: PreviewKind[] = ['text', 'image', 'binary']
    assert(kinds.includes(kindOf('a.page')))
    assert(kinds.includes(kindOf('a.png')))
    assert(kinds.includes(kindOf('a.mp4')))
  })
})
