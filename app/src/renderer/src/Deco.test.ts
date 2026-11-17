import { describe, expect, it } from 'vitest'
import { decoIn, decoLeave } from './Deco'
import { bar, line, panel } from './templateKit'

describe('shapes around a super', () => {
  it('come in smoothly: nothing before the delay, all there once in, no jump at the start', () => {
    const d = line([1, 1, 1], { delay: 300, ms: 800 })
    expect(decoIn(d, 0)).toBe(0)
    expect(decoIn(d, 300)).toBe(0)
    expect(decoIn(d, 340)).toBeLessThan(0.25)
    expect(decoIn(d, 700)).toBeGreaterThan(0.8)
    expect(decoIn(d, 1100)).toBe(1)
  })

  it('leave before the caption ends, the last one in first', () => {
    const dur = 4000
    const shapes = [panel([0, 0, 0]), bar([1, 0.4, 0.2]), line([1, 1, 1])]
    const at = (ms: number) => shapes.map((_, i) => decoLeave(i, shapes.length, ms, dur))
    expect(at(2000)).toEqual([1, 1, 1])
    const leaving = at(3600)
    expect(leaving[2]).toBeLessThan(leaving[1]!)
    expect(leaving[1]).toBeLessThan(leaving[0]!)
    expect(at(dur - 60)).toEqual([0, 0, 0])
  })
})
