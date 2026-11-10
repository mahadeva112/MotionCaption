import { describe, expect, it } from 'vitest'
import { EMPTY_PATTERN, patternList, type Pattern } from './pattern.ts'

const P = (o: Partial<Pattern>): Pattern => ({ ...EMPTY_PATTERN, ...o })

describe('patternList', () => {
  it('takes turns caption by caption', () => {
    expect(patternList(P({ ids: ['fade', 'pop', 'rise'] }), 7)).toEqual(['fade', 'pop', 'rise', 'fade', 'pop', 'rise', 'fade'])
  })

  it('keeps one animation for a whole chunk', () => {
    expect(patternList(P({ ids: ['fade', 'pop'], every: 2 }), 5)).toEqual(['fade', 'fade', 'pop', 'pop', 'fade'])
  })

  it('gives nothing for an empty pattern', () => {
    expect(patternList(P({}), 4)).toEqual([])
  })

  it('draws at random from the list, never the same chunk twice in a row, and the same seed draws the same', () => {
    const p = P({ ids: ['fade', 'pop', 'rise'], order: 'random', every: 2, seed: 7 })
    const a = patternList(p, 60)
    expect(a).toEqual(patternList(p, 60))
    for (let i = 2; i < a.length; i += 2) {
      expect(a[i]).toBe(a[i + 1] ?? a[i])
      expect(a[i]).not.toBe(a[i - 1])
    }
    expect(new Set(a)).toEqual(new Set(['fade', 'pop', 'rise']))
    expect(patternList({ ...p, seed: 8 }, 60)).not.toEqual(a)
  })

  it('repeats a one-animation list at random without getting stuck', () => {
    expect(patternList(P({ ids: ['pop', 'pop'], order: 'random' }), 3)).toEqual(['pop', 'pop', 'pop'])
  })
})
