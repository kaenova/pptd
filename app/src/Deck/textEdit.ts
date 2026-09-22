// Round-trip between TextContent.text (spec rich-text subset / plain text) and contentEditable DOM.
// Spec markup: <p style>/<span style>/<strong>/<em>/<u>/<s>/<sup>/<sub>/<a>/<br>; plain text = \n-separated.
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }
export const escapeHtml = (s: string) => s.replace(/[&<>]/g, c => ESC[c])

const P_DECLS = ['text-align', 'line-height', 'margin-top', 'margin-left', 'margin-right']
const SPAN_DECLS = ['color', 'background-color', 'font-size', 'font-family', 'font-weight']

/** style attr decls → filtered "k: v; k: v" string (spec subset only). */
function pickDecls(style: string, keys: string[]): string {
  return style
    .split(';')
    .map(d => d.trim())
    .filter(Boolean)
    .filter(d => keys.some(k => d.toLowerCase().startsWith(k + ':')))
    .join('; ')
}

/** Minimal DOM shape we consume — real elements or test fakes. */
export interface EditNode {
  nodeType: number
  textContent?: string | null
  tagName?: string
  childNodes?: Iterable<EditNode>
  getAttribute?: (name: string) => string | null
}

function serializeInline(n: EditNode): string {
  if (n.nodeType === 3) return escapeHtml(n.textContent ?? '')
  if (n.nodeType !== 1) return ''
  const kids = [...(n.childNodes ?? [])].map(serializeInline).join('')
  switch (n.tagName) {
    case 'BR': return '<br>'
    case 'B': case 'STRONG': return `<strong>${kids}</strong>`
    case 'I': case 'EM': return `<em>${kids}</em>`
    case 'U': return `<u>${kids}</u>`
    case 'S': case 'STRIKE': case 'DEL': return `<s>${kids}</s>`
    case 'SUP': return `<sup>${kids}</sup>`
    case 'SUB': return `<sub>${kids}</sub>`
    case 'A': return `<a href="${escapeHtml(n.getAttribute?.('href') ?? '')}">${kids}</a>`
    case 'SPAN': {
      const style = pickDecls(n.getAttribute?.('style') ?? '', SPAN_DECLS)
      return style ? `<span style="${style}">${kids}</span>` : kids
    }
    default: return kids
  }
}

/** contentEditable root → TextContent.text. Plain in, plain out; markup kept as spec subset. */
export function fromEditableDOM(root: EditNode): string {
  const paras: { html: string; pStyle: string }[] = []
  let cur: { html: string; pStyle: string } | null = null
  for (const n of root.childNodes ?? []) {
    if (n.nodeType === 1 && (n.tagName === 'DIV' || n.tagName === 'P')) {
      if (cur && cur.html) paras.push(cur)
      cur = null
      paras.push({ html: [...(n.childNodes ?? [])].map(serializeInline).join(''), pStyle: pickDecls(n.getAttribute?.('style') ?? '', P_DECLS) })
    } else {
      cur ??= { html: '', pStyle: '' }
      cur.html += serializeInline(n)
    }
  }
  if (cur && cur.html) paras.push(cur)
  const rich = paras.some(p => p.pStyle || /<(?!br[>\s/])[a-z]/.test(p.html))
  if (!rich) return paras.map(p => p.html.replace(/<br\s*\/?>/g, '\n')).join('\n')
  return paras.map(p => `<p${p.pStyle ? ` style="${p.pStyle}"` : ''}>${p.html}</p>`).join('')
}

/** TextContent.text → contentEditable innerHTML. Markup renders as-is; plain text uses <br> per line. */
export function toEditableHTML(text: string): string {
  if (/<[a-z]/.test(text)) return text
  return escapeHtml(text).replace(/\n/g, '<br>')
}
