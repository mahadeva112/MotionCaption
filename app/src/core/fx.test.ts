import { describe, expect, it } from 'vitest'
import { EASE } from './anim.ts'
import { compileCue } from './compile.ts'
import { compileFx, delays, fxAt, hasHeadline, phaseLength, splitUnits, unitFor, type Fx } from './fx.ts'
import { sigOf } from './job.ts'
import type { Cue } from './srt.ts'
import { PRESETS } from './presets.ts'

const cue = (text: string): Cue => ({ n: 1, index: 1, startMs: 0, endMs: 3000, raw: text, text, line: 1 })

describe('splitting text into units', () => {
  it('keeps conjuncts and vowel signs with their letter', () => {
    const u = splitUnits('क्षमा करें')
    expect(u.glyphs.map((g) => g.ch)).toEqual(['क्ष', 'मा', ' ', 'क', 'रें'])
    expect(u.letters).toBe(4)
    expect(u.words).toBe(2)
  })

  it('counts words and lines across line breaks', () => {
    const u = splitUnits('one two\nthree')
    expect(u.words).toBe(3)
    expect(u.lines).toBe(2)
    expect(u.glyphs.find((g) => g.ch === 't' && g.line === 1)?.word).toBe(2)
  })

  it('handles Bangla, Tamil and Telugu', () => {
    expect(splitUnits('ক্ষমা').letters).toBe(2)
    expect(splitUnits('வணக்கம்').words).toBe(1)
    expect(splitUnits('నమస్తే అందరికీ').words).toBe(2)
  })
})

describe('scripts with a top line', () => {
  it('finds Devanagari, Bangla and Gurmukhi, not Tamil or Latin', () => {
    expect(hasHeadline('नमस्ते')).toBe(true)
    expect(hasHeadline('নমস্কার')).toBe(true)
    expect(hasHeadline('ਸਤ ਸ੍ਰੀ ਅਕਾਲ')).toBe(true)
    expect(hasHeadline('வணக்கம்')).toBe(false)
    expect(hasHeadline('hello')).toBe(false)
  })

  it('runs letter effects by word on them, unless told to keep letters', () => {
    expect(unitFor('letter', 'नमस्ते दुनिया')).toBe('word')
    expect(unitFor('letter', 'नमस्ते', true)).toBe('letter')
    expect(unitFor('letter', 'வணக்கம்')).toBe('letter')
    expect(unitFor('line', 'नमस्ते')).toBe('line')
  })
})

describe('stagger orders', () => {
  it('orders left to right, right to left, from the centre and from the edges', () => {
    expect(delays(5, 'ltr', 1)).toEqual([0, 1, 2, 3, 4])
    expect(delays(5, 'rtl', 1)).toEqual([4, 3, 2, 1, 0])
    expect(delays(5, 'center', 1)).toEqual([2, 1, 0, 1, 2])
    expect(delays(5, 'edges', 1)).toEqual([0, 1, 2, 1, 0])
  })

  it('random order is a fixed shuffle of the seed', () => {
    const a = delays(8, 'random', 7)
    expect([...a].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(delays(8, 'random', 7)).toEqual(a)
    expect(delays(8, 'random', 8)).not.toEqual(a)
  })
})

const WORDS: Fx = {
  in: { unit: 'word', order: 'ltr', stepMs: 200, ms: 400, ease: EASE.linear, state: { opacity: 0, y: 1 } },
  out: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 300, ease: EASE.linear, state: { opacity: 0 } },
}

describe('sampling', () => {
  it('moves each word from its start state to rest in turn', () => {
    const fx = compileFx(WORDS, 'a b c', 3000)
    const u = splitUnits('a b c')
    const f = fxAt(fx, u, 300, 3000)
    expect(f.word![0]!.opacity).toBeCloseTo(0.75)
    expect(f.word![1]!.opacity).toBeCloseTo(0.25)
    expect(f.word![2]!.opacity).toBeCloseTo(0)
    const done = fxAt(fx, u, 1500, 3000)
    expect(done.word!.every((s) => s.opacity === 1 && s.y === 0)).toBe(true)
    expect(done.whole!.opacity).toBe(1)
  })

  it('goes out at the end', () => {
    const fx = compileFx(WORDS, 'a b', 3000)
    const u = splitUnits('a b')
    expect(fxAt(fx, u, 2850, 3000).whole!.opacity).toBeCloseTo(0.5)
    expect(fxAt(fx, u, 3000, 3000).whole!.opacity).toBe(0)
  })

  it('squeezes a short caption so the way in ends by 75 % and in and out never overlap', () => {
    const text = 'one two three four five six'
    const fx = compileFx(WORDS, text, 1000)
    const inLen = phaseLength(fx.in!, 6)
    const outLen = phaseLength(fx.out!, 1)
    expect(inLen).toBeLessThanOrEqual(750 + 1e-6)
    expect(inLen + outLen).toBeLessThanOrEqual(900 + 1e-6)
  })

  it('takes the speed and can drop its own way out', () => {
    const fx = compileFx(WORDS, 'a', 5000, { speed: 2, keepOut: false })
    expect(fx.in!.ms).toBe(200)
    expect(fx.out).toBeUndefined()
  })

  it('swings a loop around rest, glow only upward', () => {
    const fx = compileFx({ loop: { unit: 'word', periodMs: 1000, stepMs: 0, amp: { y: 0.2, glow: 0.4 } } }, 'a b', 5000)
    const f = fxAt(fx, splitUnits('a b'), 250, 5000)
    expect(f.word![0]!.y).toBeCloseTo(0.2)
    expect(f.word![0]!.glow).toBeCloseTo(0.4)
    const g = fxAt(fx, splitUnits('a b'), 750, 5000)
    expect(g.word![0]!.y).toBeCloseTo(-0.2)
    expect(g.word![0]!.glow).toBeCloseTo(0)
  })

  it('opens and closes a mask, and passes a sweep', () => {
    const fx = compileFx({ mask: { kind: 'wipe', soft: 0.2, inMs: 1000, outMs: 500, ease: EASE.linear },
      sweep: { delayMs: 1000, ms: 1000, width: 0.2, angle: 90, strength: 1 } }, 'a', 4000)
    const u = splitUnits('a')
    expect(fxAt(fx, u, 500, 4000).mask).toBeCloseTo(0.5)
    expect(fxAt(fx, u, 2000, 4000).mask).toBe(1)
    expect(fxAt(fx, u, 3750, 4000).mask).toBeCloseTo(0.5)
    expect(fxAt(fx, u, 500, 4000).sweep).toBeUndefined()
    expect(fxAt(fx, u, 1500, 4000).sweep).toBeCloseTo(0.5)
  })

  it('settles a warp from its full bend to rest', () => {
    const fx = compileFx({ warp: { sizeEm: 1, amountEm: 0.4, inMs: 1000 } }, 'a', 4000)
    const u = splitUnits('a')
    expect(fxAt(fx, u, 0, 4000).warp).toBeCloseTo(0.4)
    expect(fxAt(fx, u, 1200, 4000).warp).toBeCloseTo(0)
  })
})

describe('advanced presets', () => {
  const advanced = PRESETS.filter((p) => p.fx)

  it('are in the Advanced family, testing, with no Text+ tracks', () => {
    expect(advanced.length).toBeGreaterThanOrEqual(5)
    for (const p of advanced) {
      expect(p.family).toBe('Advanced')
      expect(p.status).toBe('testing')
      expect(p.tracks).toEqual([])
    }
  })

  it('compile onto a Hindi caption, word by word, the same every time', () => {
    for (const p of advanced) {
      const a = compileCue(cue('नमस्ते दुनिया, कैसे हो'), p.id)
      const b = compileCue(cue('नमस्ते दुनिया, कैसे हो'), p.id)
      expect(a.fx, p.id).toBeDefined()
      expect(a.fx).toEqual(b.fx)
      if (a.fx!.in) expect(a.fx!.in.unit).not.toBe('letter')
    }
  })

  it('change the signature, while a caption without one keeps it', () => {
    const plain = compileCue(cue('hello there'), 'fade')
    expect(plain.fx).toBeUndefined()
    expect(sigOf(plain)).toBe(sigOf({ ...plain }))
    expect(sigOf(compileCue(cue('hello there'), 'wordBloom'))).not.toBe(sigOf(compileCue(cue('hello there'), 'glowPulse')))
  })
})
