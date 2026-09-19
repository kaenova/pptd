// Rich text: TextContent.text → React nodes.
// Spec rules (§5 "Rich Text Rules"): <p>/<span>/<strong>/<em>/<u>/<s>/<sup>/<sub>/<a>/<br>;
// plain text splits on \n into paragraphs; <p style> paragraph props; <span style> inline props;
// theme refs ($primary) allowed in style attrs.
import type { CSSProperties, ReactNode } from 'react'
import type { TextContent } from '../types'
import type { ThemeCtx } from '../theme'
import { resolveColor, resolveTextStyle, useTheme } from '../theme'

// ---------- parsing ----------

interface Seg {
  text: string
  tags: string[] // open tag stack at this segment, outermost first
  span?: Record<string, string> // decls from enclosing <span style="...">
}
interface Para {
  segs: Seg[]
  pStyle?: Record<string, string> // decls from <p style="...">
}

const INLINE_RE = /<(\/?)(strong|em|u|s|sup|sub|a|span|br)\b([^>]*)>/g

/** Walk inline markup; segments carry the open-tag stack. Not recursive — a single pass. */
export function parseInline(src: string): Seg[] {
  const segs: Seg[] = []
  const stack: string[] = []
  let spanDecls: Record<string, string> | undefined
  let last = 0
  for (const m of src.matchAll(INLINE_RE)) {
    if (m.index > last) segs.push({ text: src.slice(last, m.index), tags: [...stack], span: spanDecls })
    const [, close, tag, attrs] = m
    if (tag === 'br') {
      segs.push({ text: '\n', tags: [...stack], span: spanDecls })
    } else if (close) {
      const i = stack.lastIndexOf(tag)
      if (i >= 0) stack.splice(i, 1)
      if (tag === 'span') spanDecls = undefined
    } else {
      stack.push(tag)
      if (tag === 'span') spanDecls = parseDecls(parseAttrs(attrs).style ?? '')
    }
    last = m.index + m[0].length
  }
  if (last < src.length) segs.push({ text: src.slice(last), tags: [...stack], span: spanDecls })
  return segs
}

export function parseAttrs(attrs: string): Record<string, string> {
  const o: Record<string, string> = {}
  for (const m of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) o[m[1]] = m[2]
  return o
}

/** style="color:#f00; font-size:24px" → {color:'#f00', 'font-size':'24px'} */
export function parseDecls(s: string): Record<string, string> {
  const o: Record<string, string> = {}
  for (const d of s.split(';')) {
    const i = d.indexOf(':')
    if (i > 0) o[d.slice(0, i).trim()] = d.slice(i + 1).trim()
  }
  return o
}

/**
 * Whole text → paragraphs. <p>…</p> parsed with their attrs; stray text outside <p>
 * forms its own paragraph; plain text (no markup) splits on \n (spec block-scalar shorthand).
 */
export function parseRichText(text: string): Para[] {
  const paras: Para[] = []
  const push = (segs: Seg[], pStyle?: Record<string, string>) => {
    if (segs.some(s => s.text.length)) paras.push({ segs, pStyle })
  }
  if (!/<[a-z]/.test(text)) {
    for (const line of text.split('\n')) push([{ text: line, tags: [] }])
    return paras
  }
  const flat = text.replace(/\n/g, ' ') // newlines between tags are formatting, not breaks
  const pRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/g
  let last = 0
  for (const m of flat.matchAll(pRe)) {
    if (m.index > last) push(parseInline(flat.slice(last, m.index)))
    const attrSrc = m[1].match(/style="([^"]*)"/)?.[1]
    push(parseInline(m[2]), attrSrc ? parseDecls(attrSrc) : undefined)
    last = m.index + m[0].length
  }
  if (last < flat.length) push(parseInline(flat.slice(last)))
  return paras
}

// ---------- decl → CSS ----------

const num = (v: string) => parseFloat(v) || 0

/** <span style> decls → CSS. Spec: color/font-size/font-family/background-color (+font-weight seen in real decks). */
function spanCss(decls: Record<string, string> | undefined, theme: ThemeCtx): CSSProperties {
  if (!decls) return {}
  const css: CSSProperties = {}
  for (const [k, raw] of Object.entries(decls)) {
    const v = raw.trim()
    if (k === 'color') css.color = resolveColor(v, theme)
    else if (k === 'background-color') css.backgroundColor = resolveColor(v, theme)
    else if (k === 'font-size') css.fontSize = num(v)
    else if (k === 'font-family') css.fontFamily = v
    else if (k === 'font-weight') css.fontWeight = v as CSSProperties['fontWeight']
  }
  return css
}

/** <p style> decls → paragraph CSS. Spec: text-align / line-height / margin-top|left|right. */
function pCss(decls: Record<string, string> | undefined): CSSProperties {
  if (!decls) return {}
  const css: CSSProperties = {}
  for (const [k, raw] of Object.entries(decls)) {
    const v = raw.trim()
    if (k === 'text-align') css.textAlign = v === 'distributed' ? 'justify' : (v as CSSProperties['textAlign'])
    else if (k === 'line-height') css.lineHeight = v.endsWith('px') ? num(v) : parseFloat(v) || undefined
    else if (k === 'margin-top') css.marginTop = num(v)
    else if (k === 'margin-left') css.marginLeft = num(v)
    else if (k === 'margin-right') css.marginRight = num(v)
  }
  return css
}

/** Semantic tags — highest priority per spec chain. */
function tagCss(tags: string[]): CSSProperties {
  const css: CSSProperties = {}
  for (const t of tags) {
    if (t === 'strong') css.fontWeight = 700
    else if (t === 'em') css.fontStyle = 'italic'
    else if (t === 'u') css.textDecoration = 'underline'
    else if (t === 's') css.textDecoration = 'line-through'
    else if (t === 'sup') { css.verticalAlign = 'super'; css.fontSize = '0.75em' }
    else if (t === 'sub') { css.verticalAlign = 'sub'; css.fontSize = '0.75em' }
    else if (t === 'a') { css.color = '#06c'; css.textDecoration = 'underline' }
  }
  return css
}

// ---------- component ----------

/**
 * Paragraph stream for a TextContent. Base (content>theme>defaults) styles the container;
 * per-segment CSS = tagCss > spanCss (spec priority chain 1–2); container carries levels 3–5.
 */
export function RichText({ content, base }: { content: TextContent; base?: CSSProperties }): ReactNode {
  const theme = useTheme()
  const s = resolveTextStyle(content, theme)
  const rootStyle: CSSProperties = {
    fontSize: s.fontSize,
    fontFamily: s.fontFamily,
    color: s.color,
    fontWeight: s.bold ? 700 : undefined,
    fontStyle: s.italic ? 'italic' : undefined,
    letterSpacing: s.letterSpacing || undefined,
    lineHeight: s.lineHeight,
    backgroundColor: content.backgroundColor ? resolveColor(content.backgroundColor, theme) : undefined,
    ...base,
  }
  const paras = parseRichText(content.text)
  return (
    <div style={rootStyle}>
      {paras.map((p, i) => (
        <div key={i} style={pCss(p.pStyle)}>
          {p.segs.map((seg, j) => (
            <span key={j} style={{ ...tagCss(seg.tags), ...spanCss(seg.span, theme) }}>
              {seg.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
