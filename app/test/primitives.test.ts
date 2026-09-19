// Phase 2 checks: rich-text parsing, theme resolution, fill/gradient CSS, style merge.
import { describe, expect, test } from 'bun:test'
// Run: bun test
import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseInline, parseRichText, parseDecls } from '../src/render/RichText'
import { fillStyle } from '../src/render/Fill'
import { TextBlock } from '../src/render/elements/Text'
import { resolveColor, resolveTextStyle, themeCtx, textDefaults } from '../src/theme'
import type { Theme } from '../src/types'

const theme = themeCtx({
  colors: { primary: '#FF6900', white: '#FFFFFF' },
  textStyles: {
    label: { fontSize: 12, color: '$primary', bold: true, letterSpacing: 4 },
  },
} as Theme)

describe('theme', () => {
  test('resolveColor: passthrough + $ref + unknown ref', () => {
    expect(resolveColor('#FF0000', theme)).toBe('#FF0000')
    expect(resolveColor('$primary', theme)).toBe('#FF6900')
    expect(resolveColor('$nope', theme)).toBe('#FF00FF') // visible-miss magenta
    expect(resolveColor(undefined, theme)).toBeUndefined()
  })

  test('resolveTextStyle: content beats theme beats defaults', () => {
    // theme style only
    const s1 = resolveTextStyle({ style: '$label', text: 'x' }, theme)
    expect(s1.fontSize).toBe(12)
    expect(s1.color).toBe('#FF6900')
    expect(s1.bold).toBe(true)
    expect(s1.letterSpacing).toBe(4)
    // content overrides theme
    const s2 = resolveTextStyle({ style: '$label', fontSize: 40, color: '$white', text: 'x' }, theme)
    expect(s2.fontSize).toBe(40)
    expect(s2.color).toBe('#FFFFFF')
    // theme field not overridden by content falls through
    expect(s2.bold).toBe(true)
    // defaults
    const s3 = resolveTextStyle({ text: 'x' }, theme)
    expect(s3.color).toBe(textDefaults.color)
    expect(s3.fontSize).toBe(18)
    expect(s3.lineHeight).toBe(1)
  })

  test('lineHeightPx wins over lineHeight', () => {
    const s = resolveTextStyle({ lineHeight: 2, lineHeightPx: 33, text: 'x' }, theme)
    expect(s.lineHeightPx).toBe(33)
    expect(s.lineHeight).toBe(2) // multiple kept for the unitless CSS path
  })
})

describe('fillStyle', () => {
  test('solid resolves $ref', () => {
    expect(fillStyle({ type: 'solid', color: '$primary' }, theme).background).toBe('#FF6900')
  })

  test('gradient angle: spec 0 (left→right) = css 90deg; spec 90 (top→bottom) = css 180deg', () => {
    const stops = [
      { position: 0, color: '#000' },
      { position: 1, color: '#fff' },
    ]
    expect(fillStyle({ type: 'gradient', gradientType: 'linear', angle: 0, stops }, theme).background).toBe(
      'linear-gradient(90deg, #000 0%, #fff 100%)',
    )
    expect(fillStyle({ type: 'gradient', gradientType: 'linear', angle: 90, stops }, theme).background).toBe(
      'linear-gradient(180deg, #000 0%, #fff 100%)',
    )
  })

  test('gradient: radial + default angle + fractional stops', () => {
    const stops = [
      { position: 0, color: '#F00' },
      { position: 0.5, color: '#0F0' },
      { position: 1, color: '#00F' },
    ]
    expect(fillStyle({ type: 'gradient', gradientType: 'radial', stops }, theme).background).toBe(
      'radial-gradient(#F00 0%, #0F0 50%, #00F 100%)',
    )
    // missing angle defaults to spec 0 (left→right) = css 90deg
    expect(fillStyle({ type: 'gradient', gradientType: 'linear', stops }, theme).background).toBe(
      'linear-gradient(90deg, #F00 0%, #0F0 50%, #00F 100%)',
    )
  })

  test('text gradient: glyphs transparent at every level (regression: inner RichText re-set color)', () => {
    const el = {
      elementId: 't', elementType: 'text' as const, bounds: [0, 0, 100, 40],
      content: {
        fontSize: 24,
        text: 'G',
        gradient: { type: 'gradient' as const, gradientType: 'linear' as const, angle: 45, stops: [{ position: 0, color: '#F00' }, { position: 1, color: '#00F' }] },
      },
    }
    const html = renderToStaticMarkup(createElement(TextBlock, el))
    // container clips the gradient to glyphs
    expect(html).toContain('background-clip:text')
    // inner rich-text root must not re-set an opaque color over it
    expect(html).not.toMatch(/color:(?!transparent)[^;"]+/)
  })

  test('image fill default mode cover', () => {
    const css = fillStyle({ type: 'image', src: 'blob:x' }, theme)
    expect(css.backgroundSize).toBe('cover')
    expect(css.backgroundImage).toContain('blob:x')
  })
})

describe('rich text parsing', () => {
  test('plain text: \n splits paragraphs', () => {
    const paras = parseRichText('line one\nline two')
    expect(paras.length).toBe(2)
    expect(paras[0].segs[0].text).toBe('line one')
    expect(paras[1].segs[0].text).toBe('line two')
  })

  test('<p> paragraphs with attrs', () => {
    const paras = parseRichText('<p>a</p><p style="text-align:right">b</p>')
    expect(paras.length).toBe(2)
    expect(paras[1].pStyle).toEqual({ 'text-align': 'right' })
  })

  test('spans carry inline decls', () => {
    const paras = parseRichText('<p><span style="font-size:38px; color:#FFFFFF">23.35</span><span style="font-size:16px">万起</span></p>')
    expect(paras.length).toBe(1)
    expect(paras[0].segs).toHaveLength(2)
    expect(paras[0].segs[0].span).toEqual({ 'font-size': '38px', color: '#FFFFFF' })
    expect(paras[0].segs[0].text).toBe('23.35')
    expect(paras[0].segs[1].span).toEqual({ 'font-size': '16px' })
    expect(paras[0].segs[1].text).toBe('万起')
  })

  test('nested tags tracked on stack', () => {
    const segs = parseInline('<strong>a<u>b</u>c</strong>d')
    expect(segs.map(s => [s.text, s.tags])).toEqual([
      ['a', ['strong']],
      ['b', ['strong', 'u']],
      ['c', ['strong']],
      ['d', []],
    ])
  })

  test('<br> becomes newline segment', () => {
    const segs = parseInline('a<br/>b')
    expect(segs.map(s => s.text)).toEqual(['a', '\n', 'b'])
  })

  test('parseDecls', () => {
    expect(parseDecls('color: #f00; font-size:24px')).toEqual({ color: '#f00', 'font-size': '24px' })
  })

  test('real yu7 stat line parses to two spans', () => {
    const src = '<p><span style="font-size:38px; color:#FFFFFF; font-weight:700;">835</span><span style="font-size:16px; color:#FFFFFFB3;">km</span></p>'
    const [p] = parseRichText(src)
    expect(p.segs[0].span!['font-weight']).toBe('700')
    expect(p.segs[1].text).toBe('km')
  })
})
