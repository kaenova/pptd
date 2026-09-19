// Rotation/flip/opacity shared by shape, line, image, icon (spec: Text has none).
import type { CSSProperties } from 'react'

export interface Transformable {
  rotation?: number
  opacity?: number
  flip?: [boolean, boolean]
}

export function fx(el: Transformable): CSSProperties {
  const [fh, fv] = el.flip ?? []
  return {
    transform: `rotate(${el.rotation ?? 0}deg) scaleX(${fh ? -1 : 1}) scaleY(${fv ? -1 : 1})`,
    opacity: el.opacity,
  }
}
