import { describe, it } from 'bun:test'
import { strict as assert } from 'assert'

const IMAGE_RE = /\.(jpe?g|png|gif|webp|ico)$/i
const BINARY_RE = /\.(jpe?g|png|gif|webp|ico|mp4|webm|mp3|wav|woff2?|ttf|otf|eot|pdf|zip)$/i
const LANGUAGE_BY_EXT: Record<string, string> = {
  js: 'javascript', ts: 'typescript', tsx: 'typescript', json: 'json', html: 'html',
  css: 'css', md: 'markdown', yml: 'yaml', yaml: 'yaml', xml: 'xml', svg: 'xml', page: 'yaml',
}
const langOf = (f: string) => LANGUAGE_BY_EXT[f.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext'

describe('FilePreviewer helpers', () => {
  it('detects binary files case-insensitively', () => {
    assert(BINARY_RE.test('media/photo.png'))
    assert(BINARY_RE.test('media/photo.JPG'))
    assert(!BINARY_RE.test('yu7.pptd/pages/slide-01.page'))
    assert(!BINARY_RE.test('README.md'))
  })
  it('treats images as image-preview, not text', () => {
    assert(IMAGE_RE.test('media/logo.png'))
    assert(!IMAGE_RE.test('media/video.mp4'))
    assert(BINARY_RE.test('media/logo.png'))
  })
  it('infers language from extension', () => {
    assert.equal(langOf('pages/slide-01.page'), 'yaml')
    assert.equal(langOf('theme.css'), 'css')
    assert.equal(langOf('notes.txt'), 'plaintext')
    assert.equal(langOf('data.weird'), 'plaintext')
  })
})
