// textEdit round-trips: plain text ↔ contentEditable DOM ↔ spec rich-text subset.
import { describe, expect, it } from 'bun:test'
import { escapeHtml, fromEditableDOM, toEditableHTML, type EditNode } from '../src/Deck/textEdit'

// minimal DOM fakes — fromEditableDOM only consumes this shape
const t = (s: string): EditNode => ({ nodeType: 3, textContent: s })
const e = (tagName: string, children: EditNode[] = [], attrs: Record<string, string> = {}): EditNode => ({
  nodeType: 1,
  tagName,
  childNodes: children,
  getAttribute: k => attrs[k] ?? null,
})
const root = (children: EditNode[]): EditNode => ({ nodeType: 1, tagName: 'DIV', childNodes: children })

describe('textEdit', () => {
  it('escapeHtml escapes markup-significant chars', () => {
    expect(escapeHtml('a<b>&c')).toBe('a&lt;b&gt;&amp;c')
  })

  it('toEditableHTML: plain text gets <br> breaks; markup passes through (stray \n stays, spec: formatting)', () => {
    expect(toEditableHTML('a\nb\nc')).toBe('a<br>b<br>c')
    expect(toEditableHTML('a\n<b>b</b>')).toBe('a\n<b>b</b>')
    expect(toEditableHTML('<p style="text-align:center">x</p>')).toBe('<p style="text-align:center">x</p>')
  })

  it('plain round trip: top-level text + <br> → \\n-separated', () => {
    const out = fromEditableDOM(root([t('hello'), e('BR'), t('world')]))
    expect(out).toBe('hello\nworld')
  })

  it('plain round trip: browser divs collapse to \\n-separated', () => {
    const out = fromEditableDOM(root([e('DIV', [t('a')]), e('DIV', [t('b')])]))
    expect(out).toBe('a\nb')
  })

  it('escapes literal < typed by the user, stays plain', () => {
    const out = fromEditableDOM(root([t('3 < 5 & ok')]))
    expect(out).toBe('3 &lt; 5 &amp; ok')
  })

  it('bold/italic browser tags map to spec tags', () => {
    const out = fromEditableDOM(root([e('DIV', [e('B', [t('hi')]), e('I', [t('x')])])]))
    expect(out).toBe('<p><strong>hi</strong><em>x</em></p>')
  })

  it('u/s/sup/sub/a preserved, a keeps href only', () => {
    const out = fromEditableDOM(root([e('DIV', [e('U', [t('u')]), e('S', [t('s')]), e('SUP', [t('sup')]), e('A', [t('link')], { href: 'https://x' })])]))
    expect(out).toBe('<p><u>u</u><s>s</s><sup>sup</sup><a href="https://x">link</a></p>')
  })

  it('span keeps only spec decls', () => {
    const out = fromEditableDOM(root([e('SPAN', [t('red')], { style: 'color: #f00; z-index: 9; font-size: 20px' })]))
    expect(out).toBe('<p><span style="color: #f00; font-size: 20px">red</span></p>')
  })

  it('span without spec decls is unwrapped', () => {
    const out = fromEditableDOM(root([e('SPAN', [t('x')], { style: 'display: block' })]))
    expect(out).toBe('x')
  })

  it('paragraph style keeps only spec decls, joins without \\n', () => {
    const out = fromEditableDOM(root([e('P', [t('a')], { style: 'text-align: center; border: 1px' }), e('P', [t('b')])]))
    expect(out).toBe('<p style="text-align: center">a</p><p>b</p>')
  })

  it('empty content serializes to empty string', () => {
    expect(fromEditableDOM(root([]))).toBe('')
    expect(fromEditableDOM(root([e('DIV', [])]))).toBe('')
  })
})
