import type { Bezier, Value } from './anim.ts'
import type { TimedKey } from './compile.ts'

// Evaluates tracks at a time, for the in-app preview. Same keys and eases as Resolve gets,
// so the preview follows the same curves; the look is an approximation of Text+.

/** y of a CSS cubic-bezier at progress x (0–1) */
export function bezierAt(e: Bezier, x: number): number {
  const [x1, y1, x2, y2] = e
  const coord = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3
  // Solve x(t) = x by bisection: the curve is monotonic in x for valid eases
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (coord(mid, x1, x2) < x) lo = mid
    else hi = mid
  }
  return coord((lo + hi) / 2, y1, y2)
}

function mix(a: Value, b: Value, p: number): Value {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * p
  const [ax, ay] = a as readonly [number, number]
  const [bx, by] = b as readonly [number, number]
  return [ax + (bx - ax) * p, ay + (by - ay) * p]
}

/** Value of a track at ms; holds the first value before the first key and the last after */
export function valueAt(keys: TimedKey[], ms: number): Value | undefined {
  if (keys.length === 0) return undefined
  if (ms <= keys[0]!.ms) return keys[0]!.v
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!
    const b = keys[i + 1]!
    if (ms <= b.ms) {
      const span = b.ms - a.ms
      return span <= 0 ? b.v : mix(a.v, b.v, bezierAt(a.ease, (ms - a.ms) / span))
    }
  }
  return keys[keys.length - 1]!.v
}

export const num = (v: Value | undefined, fallback: number): number => (typeof v === 'number' ? v : fallback)
export const pt = (v: Value | undefined, fallback: readonly [number, number]): readonly [number, number] =>
  Array.isArray(v) ? (v as readonly [number, number]) : fallback
