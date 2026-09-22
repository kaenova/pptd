/**
 * Deck pure helpers — exported for testing and reuse.
 */
// --- pure helpers (testable) -------------------------------------------------

/** Fit scale: present covers the box; edit fits inside with margin (max 1.5×). */
export function fitScale(size: readonly [number, number], box: { width: number; height: number }, present: boolean): number {
  const [w, h] = size
  if (box.width <= 0 || box.height <= 0) return 1
  if (present) return Math.max(box.width / w, box.height / h)
  return Math.min((box.width - 40) / w, (box.height - 40) / h, 1.5)
}

/** Thumbnail scale: usable width = thumb button width minus p-1.5 (12px) padding. */
export function thumbScale(thumbWidth: number, pageW: number): number {
  return thumbWidth > 0 ? (thumbWidth - 12) / pageW : 0
}

/** New default text element centered on (x, y) canvas coordinates. */
export function newTextElement(x: number, y: number): import('../types').TextElement {
  return {
    elementId: `text-${crypto.randomUUID().slice(0, 8)}`,
    elementType: 'text',
    bounds: [Math.round(x - 100), Math.round(y - 16), 200, 32],
    content: { text: 'Text', fontSize: 24 },
  }
}

