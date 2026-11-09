import { describe, expect, it } from 'vitest'
import { EASE } from './anim.ts'
import { bezierAt, valueAt } from './sample.ts'

describe('bezierAt', () => {
  it('is linear for the linear ease and hits both ends', () => {
    expect(bezierAt(EASE.linear, 0.3)).toBeCloseTo(0.3, 4)
    expect(bezierAt(EASE.out, 0)).toBeCloseTo(0, 4)
    expect(bezierAt(EASE.out, 1)).toBeCloseTo(1, 4)
  })

  it('runs ahead for ease-out and overshoots for back', () => {
    expect(bezierAt(EASE.out, 0.3)).toBeGreaterThan(0.6)
    const peak = Math.max(...Array.from({ length: 50 }, (_, i) => bezierAt(EASE.back, i / 49)))
    expect(peak).toBeGreaterThan(1)
  })
})

describe('valueAt', () => {
  const keys = [
    { ms: 0, v: 0, ease: EASE.linear },
    { ms: 100, v: 1, ease: EASE.linear },
    { ms: 200, v: [0.5, 0.5] as const, ease: EASE.linear },
  ]

  it('holds before the first and after the last key', () => {
    expect(valueAt(keys.slice(0, 2), -50)).toBe(0)
    expect(valueAt(keys.slice(0, 2), 500)).toBe(1)
  })

  it('interpolates numbers', () => {
    expect(valueAt(keys.slice(0, 2), 25)).toBeCloseTo(0.25, 3)
  })

  it('interpolates points', () => {
    const pts = [{ ms: 0, v: [0, 0] as const, ease: EASE.linear }, { ms: 100, v: [1, 2] as const, ease: EASE.linear }]
    const v = valueAt(pts, 50) as readonly [number, number]
    expect(v[0]).toBeCloseTo(0.5, 3)
    expect(v[1]).toBeCloseTo(1, 3)
  })

  it('is empty for no keys', () => {
    expect(valueAt([], 10)).toBeUndefined()
  })
})
