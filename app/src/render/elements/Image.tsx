import type { CSSProperties } from 'react'
import type { ImageElement } from '../../types'
import { useTheme } from '../../theme'
import { borderStyle, shadowStyle } from '../Fill'
import { resolveShapeDef } from './geometry'
import { fx } from './fx'

/** crop insets → inner-img frame (padded source mapped so the sub-rect fills the box). */
export function cropFrame(crop: ImageElement['crop']): { width: string; height: string; left: string; top: string } {
  const l = crop?.left ?? 0, t = crop?.top ?? 0
  const cw = 1 - l - (crop?.right ?? 0)
  const ch = 1 - t - (crop?.bottom ?? 0)
  const pct = (n: number) => `${(n * 100).toFixed(4)}%`
  return { width: pct(1 / cw), height: pct(1 / ch), left: pct(-l / cw), top: pct(-t / ch) }
}

/**
 * crop → fit → cropShape (spec order).
 * crop: inner img is sized to the "padded frame" (source padded to 1−l−r × 1−t−b fractions)
 * and offset so the cropped sub-rect lands exactly in bounds; negative insets pad transparent.
 * fit: object-fit on the padded frame. cropShape: clip-path from shape geometry.
 */
export function ImageBox(el: ImageElement) {
  const theme = useTheme()
  const [w, h] = [el.bounds[2], el.bounds[3]]
  let clipPath: string | undefined
  if (el.cropShape) {
    // ponytail: hollow cropShapes (evenodd inner contours) clip as solid — CSS path() has no fill-rule; switch to <clipPath> SVG when needed
    const geom = resolveShapeDef(el.cropShape, w, h)
    if (geom.d) clipPath = `path('${geom.d}')`
  }
  const wrapperStyle: CSSProperties = {
    position: 'absolute',
    left: el.bounds[0],
    top: el.bounds[1],
    width: w,
    height: h,
    overflow: 'hidden',
    clipPath,
    ...fx(el),
    ...borderStyle(el.border, theme),
    ...shadowStyle(el.shadow, theme),
  }
  const imgStyle: CSSProperties = {
    position: 'absolute',
    ...cropFrame(el.crop),
    objectFit: el.fit?.mode ?? 'cover',
  }
  return (
    <div className="absolute" data-id={el.elementId} style={wrapperStyle}>
      <img src={el.src} alt="" style={imgStyle} />
    </div>
  )
}
