import { describe, expect, it } from 'vitest'
import { compileCue, roughMeasure, withMotion } from './compile.ts'
import { applyCase, autoWords, centerOf, DEFAULT_LOOK, layout, type Look } from './look.ts'
import type { Cue } from './srt.ts'

const cue = (text: string, startMs = 0, endMs = 2400): Cue => ({ n: 1, index: 1, startMs, endMs, raw: text, text, line: 1 })
const L = (o: Partial<Look> = {}): Look => ({ ...DEFAULT_LOOK, ...o })
const TEXT = 'Most people wait for the right time'

describe('layout', () => {
  it('keeps a short caption on one line', () => {
    expect(layout('Make it count', L(), [], roughMeasure, 9 / 16).lineCount).toBe(1)
  })

  it('breaks a long caption into two balanced lines', () => {
    const r = layout(TEXT, L({ maxWidth: 0.6 }), [], roughMeasure, 9 / 16)
    expect(r.lineCount).toBe(2)
    const [a, b] = r.text.split('\n')
    expect(Math.abs(a!.length - b!.length)).toBeLessThan(10)
  })

  it('never breaks with one line, and keeps subtitle breaks with keep', () => {
    expect(layout(TEXT, L({ maxWidth: 0.3, lines: '1' }), [], roughMeasure, 9 / 16).text).toBe(TEXT)
    expect(layout('One line\nand another', L({ lines: 'keep' }), [], roughMeasure, 16 / 9).text).toBe('One line\nand another')
  })

  it('wraps onto as many lines as needed with auto', () => {
    expect(layout(TEXT, L({ maxWidth: 0.3, lines: 'auto' }), [], roughMeasure, 9 / 16).lineCount).toBeGreaterThan(2)
  })

  it('leaves blank room for a bigger word and says where it goes', () => {
    const r = layout('But the right time is now', L(), [1, 1, 1, 1, 1, 1.6], roughMeasure, 16 / 9)
    expect(r.ranges[5]).toBeNull()
    expect(r.solos[5]).toMatchObject({ text: 'now' })
    expect(r.text).toMatch(/is {3,}$/)
    expect(r.solos[5]!.dx).toBeGreaterThan(0) // right of centre: last word of a centred line
    for (const [i, w] of ['But', 'the', 'right', 'time', 'is'].entries()) {
      const g = r.ranges[i]!
      expect(r.text.slice(g.first, g.last + 1)).toBe(w)
    }
  })

  it('puts the second line below the first', () => {
    const r = layout('aaa bbb', L({ lines: 'keep' }), [1.5, 1.5], roughMeasure, 16 / 9)
    expect(r.solos[0]!.dy).toBe(0)
    const two = layout('aaa\nbbb', L({ lines: 'keep' }), [1.5, 1.5], roughMeasure, 16 / 9)
    expect(two.solos[0]!.dy).toBeGreaterThan(0)
    expect(two.solos[1]!.dy).toBeLessThan(0)
  })

  it('applies text case before measuring', () => {
    expect(applyCase('hello big world', 'title')).toBe('Hello Big World')
    expect(layout('hello', L({ textCase: 'upper' }), [], roughMeasure, 1).text).toBe('HELLO')
  })
})

describe('centerOf', () => {
  it('places by the 9-point anchor and nudges', () => {
    expect(centerOf(L({ anchor: 4 }), 0.5, 0.1)).toEqual([0.5, 0.5])
    const [x, y] = centerOf(L({ anchor: 6, x: 0.02 }), 0.4, 0.1)
    expect(x).toBeCloseTo(0.07 + 0.2 + 0.02)
    expect(y).toBeCloseTo(0.21)
    expect(centerOf(L({ anchor: 2 }), 0.4, 0.1)[0]).toBeCloseTo(0.73)
  })
})

describe('highlight rules', () => {
  it('picks last, longest and numbers', () => {
    const w = ['Only', '3', 'steps', 'to', 'everything']
    expect(autoWords(w, 'last')).toEqual([4])
    expect(autoWords(w, 'longest')).toEqual([4])
    expect(autoWords(w, 'numbers')).toEqual([1])
    expect(autoWords(w, 'off')).toEqual([])
  })

  it('a word with its own look wins over the rule', () => {
    const c = compileCue(cue('Only 3 steps'), 'fade', {
      highlight: { rule: 'last', color: [1, 0, 0], scale: 1 }, words: { 2: { color: [0, 1, 0] } },
    })
    expect(c.words).toHaveLength(1)
    expect(c.words[0]!.color).toEqual([0, 1, 0])
  })

  it('karaoke lights every word in turn, inside the caption', () => {
    const c = compileCue(cue('one two three'), 'fade', { highlight: { rule: 'karaoke', color: [1, 1, 0], scale: 1 } })
    expect(c.words).toHaveLength(3)
    const ons = c.words.map((w) => w.tracks[0]!.keys.find((k) => k.v === 1)!.ms)
    expect(ons[0]!).toBeLessThan(ons[1]!)
    expect(ons[1]!).toBeLessThan(ons[2]!)
    for (const w of c.words) for (const k of w.tracks[0]!.keys) expect(k.ms).toBeLessThanOrEqual(2400)
  })
})

describe('word looks', () => {
  it('draws moving, lifted and boxed words on their own, colour-only words as a copy', () => {
    const c = compileCue(cue('right time is now'), 'fade', {
      words: { 0: { color: [1, 0, 0] }, 1: { effect: 'shake' }, 2: { raise: 0.01 }, 3: { box: [1, 0, 0] } },
    })
    const by = new Map(c.words.map((w) => [w.index, w]))
    expect(by.get(0)!.solo).toBeUndefined()
    expect(by.get(1)!.solo).toMatchObject({ text: 'time', size: 0.07 })
    expect(by.get(2)!.solo!.center[1]).toBeGreaterThan(by.get(1)!.solo!.center[1])
    expect(by.get(3)!.solo).toMatchObject({ text: 'now' })
    expect(c.text).toMatch(/^right {4,}/)
  })

  it('draws a bigger word on its own, at its size, with its effect', () => {
    const c = compileCue(cue('right time is now'), 'fade', { words: { 3: { scale: 1.5, effect: 'pop', color: [1, 1, 0] } } })
    const w = c.words[0]!
    expect(w.solo).toMatchObject({ text: 'now', size: 0.07 * 1.5 })
    expect(Math.max(...w.tracks.find((t) => t.input === 'CharacterSizeX')!.keys.map((k) => k.v as number))).toBeCloseTo(1.12)
    expect(c.text).not.toContain('now')
  })

  it('skips words with nothing to show', () => {
    expect(compileCue(cue('a b'), 'fade', { words: { 0: { scale: 1, effect: 'none' } } }).words).toHaveLength(0)
  })
})

describe('motion', () => {
  const pop = [{ target: 'move' as const, input: 'Size', keys: [{ at: 0, v: 0.6 }, { at: 300, v: 1 }] },
    { target: 'text' as const, input: 'Opacity1', keys: [{ at: 0, v: 0 }, { at: 100, v: 1 }, { at: -200, from: 'end' as const, v: 1 }, { at: 0, from: 'end' as const, v: 0 }] }]

  it('speeds keys up', () => {
    expect(withMotion(pop, { speed: 2, out: 'preset', outMs: 250 })[0]!.keys.map((k) => k.at)).toEqual([0, 150])
  })

  it('replaces the way out', () => {
    const t = withMotion(pop, { speed: 1, out: 'zoom', outMs: 300 })
    expect(t.find((x) => x.input === 'Size')!.keys.at(-1)).toMatchObject({ at: 0, from: 'end', v: 1.3 })
    expect(t.find((x) => x.input === 'Opacity1')!.keys.filter((k) => k.from === 'end')).toHaveLength(2)
    expect(withMotion(pop, { speed: 1, out: 'none', outMs: 300 }).flatMap((x) => x.keys).some((k) => k.from === 'end')).toBe(false)
  })

  it('turns rotation into a held Angle on the caption', () => {
    const c = compileCue(cue('tilted'), 'fade', { look: L({ rotation: 5 }) })
    expect(c.tracks.find((t) => t.input === 'Angle')!.keys[0]!.v).toBe(5)
    expect(c.look.rotation).toBe(5)
  })
})
