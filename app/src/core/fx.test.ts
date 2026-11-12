import { describe, expect, it } from 'vitest'
import { EASE } from './anim.ts'
import { compileCue } from './compile.ts'
import { compileFx, delays, easeAt, fxAt, hasHeadline, keyWord, particlesAt, phaseLength, scrambleChar, spokenTimes, splitUnits, unitFor, type Fx } from './fx.ts'
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

  it('are in their own families, testing, with no Text+ tracks', () => {
    expect(advanced.length).toBe(100)
    expect(advanced.filter((p) => p.family === 'Trailer')).toHaveLength(10)
    expect(advanced.filter((p) => p.family === 'Distort')).toHaveLength(10)
    expect(advanced.filter((p) => p.family === 'Elastic')).toHaveLength(10)
    expect(advanced.filter((p) => p.family === 'Scramble')).toHaveLength(10)
    expect(advanced.filter((p) => p.family === 'Stroke')).toHaveLength(10)
    expect(advanced.filter((p) => p.family === 'Kinetic')).toHaveLength(10)
    expect(advanced.filter((p) => p.family === 'Light & Glow')).toHaveLength(10)
    expect(advanced.filter((p) => p.family === 'Mask & Wipe')).toHaveLength(10)
    expect(advanced.filter((p) => p.family === 'Calm')).toHaveLength(10)
    expect(advanced.filter((p) => p.family === 'Indic Flow')).toHaveLength(10)
    for (const p of advanced) {
      expect(['Indic Flow', 'Calm', 'Mask & Wipe', 'Light & Glow', 'Kinetic', 'Stroke', 'Scramble', 'Elastic', 'Distort', 'Trailer']).toContain(p.family)
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
      // Only an effect that asks to keep letters (typing, letter blur) runs them one by one on Hindi
      if (a.fx!.in && !p.fx!.in?.keepLetters) expect(a.fx!.in.unit).not.toBe('letter')
    }
  })

  it('change the signature, while a caption without one keeps it', () => {
    const plain = compileCue(cue('hello there'), 'fade')
    expect(plain.fx).toBeUndefined()
    expect(sigOf(plain)).toBe(sigOf({ ...plain }))
    expect(sigOf(compileCue(cue('hello there'), 'wordBloom'))).not.toBe(sigOf(compileCue(cue('hello there'), 'glowPulse')))
  })
})

const NL = String.fromCharCode(10)

describe('Indic Word Flow pieces', () => {
  const u = splitUnits('आज की सबसे महत्वपूर्ण बात')

  it('picks the longest word as the key word', () => {
    expect(keyWord(u)).toBe(3)
    expect(keyWord(splitUnits('a bb cc'))).toBe(1)
  })

  it('shares the spoken time by letters, after the way in and before the way out', () => {
    const fx = compileFx({ in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 300, ease: EASE.linear, state: { opacity: 0 } } }, 'ab abcd', 3000)
    const at = spokenTimes(fx, splitUnits('ab abcd'), 3000)
    expect(at[0]).toBe(300)
    expect(at[2]).toBe(2800)
    expect(at[1]).toBeCloseTo(300 + 2500 / 3)
  })

  it('fills each word in turn', () => {
    const fx = compileFx({ fill: {} }, 'ab abcd', 3000)
    const ux = splitUnits('ab abcd')
    const at = spokenTimes(fx, ux, 3000)
    const f = fxAt(fx, ux, (at[0]! + at[1]!) / 2, 3000)
    expect(f.fill![0]).toBeCloseTo(0.5)
    expect(f.fill![1]).toBe(0)
    expect(fxAt(fx, ux, 3000, 3000).fill).toEqual([1, 1])
  })

  it('keeps only the spoken word in focus', () => {
    const fx = compileFx({ focus: { state: { opacity: 0.5 }, fadeMs: 100 } }, 'ab abcd', 3000)
    const ux = splitUnits('ab abcd')
    const at = spokenTimes(fx, ux, 3000)
    const f = fxAt(fx, ux, at[1]! + 500, 3000)
    expect(f.word![1]!.opacity).toBe(1)
    expect(f.word![0]!.opacity).toBe(0.5)
  })

  it('draws each line’s top line before its letters come down', () => {
    const fx = compileFx({ headline: { delayMs: 0, stepMs: 400, drawMs: 600, dropMs: 500 } }, 'एक' + NL + 'दो', 4000)
    const ux = splitUnits('एक' + NL + 'दो')
    const early = fxAt(fx, ux, 300, 4000).headline!
    expect(early[0]!.draw).toBeGreaterThan(0)
    expect(early[0]!.drop).toBe(0)
    expect(early[1]!.draw).toBe(0)
    const done = fxAt(fx, ux, 2000, 4000).headline!
    expect(done.every((h) => h.draw === 1 && h.drop === 1)).toBe(true)
  })

  it('squeezes the top line draw into a short caption', () => {
    const fx = compileFx({ headline: { delayMs: 100, stepMs: 400, drawMs: 650, dropMs: 520 } }, 'एक' + NL + 'दो' + NL + 'तीन', 1000)
    const h = fx.headline!
    expect(h.delayMs + 2 * h.stepMs + h.drawMs * 0.6 + h.dropMs).toBeLessThanOrEqual(750 + 1e-6)
  })

  it('marks and colours only the key word', () => {
    const fx = compileFx({
      marker: { unit: 'word', pick: 'key', order: 'ltr', delayMs: 0, stepMs: 0, ms: 400, opacity: 1 },
      emphasis: { delayMs: 0, ms: 400, ease: EASE.linear, state: { tint: 1 } },
    }, 'आज की सबसे महत्वपूर्ण बात', 3000)
    const f = fxAt(fx, u, 1000, 3000)
    expect(f.marker).toEqual([0, 0, 0, 1, 0])
    expect(f.word![3]!.tint).toBe(1)
    expect(f.word![0]!.tint).toBeUndefined()
  })
})

describe('Calm pieces', () => {
  const u = splitUnits('शांत मन')

  it('starts a phase after its delay', () => {
    const fx = compileFx({ in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 400, delayMs: 400, ease: EASE.linear, state: { opacity: 0 } } }, 'शांत मन', 4000)
    expect(fxAt(fx, u, 300, 4000).whole!.opacity).toBe(0)
    expect(fxAt(fx, u, 600, 4000).whole!.opacity).toBeCloseTo(0.5)
    expect(phaseLength(fx.in!, 1)).toBe(800)
  })

  it('lands every grain of dust on the text, the same each time', () => {
    const P = { kind: 'dust' as const, count: 12, delayMs: 0, ms: 800, sizeEm: 0.1, spreadEm: 2 }
    expect(particlesAt(P, 4, 300)).toEqual(particlesAt(P, 4, 300))
    const early = particlesAt(P, 4, 100)
    expect(early.some((q) => Math.hypot(q.dx, q.dy) > 0.5)).toBe(true)
    for (const q of particlesAt(P, 4, 5000)) {
      expect(Math.hypot(q.dx, q.dy)).toBeCloseTo(0)
      expect(q.opacity).toBe(0)
      expect(q.left).toBeGreaterThanOrEqual(0)
      expect(q.left).toBeLessThanOrEqual(1)
    }
  })

  it('keeps petals drifting across, faded at the edges', () => {
    const P = { kind: 'petal' as const, count: 6, delayMs: 0, ms: 4000, sizeEm: 0.2 }
    for (const ms of [800, 2000, 7000]) for (const q of particlesAt(P, 2, ms)) {
      expect(q.left).toBeGreaterThanOrEqual(-0.15)
      expect(q.left).toBeLessThanOrEqual(1.15)
      expect(q.opacity).toBeGreaterThanOrEqual(0)
      expect(q.opacity).toBeLessThanOrEqual(1)
    }
    expect(particlesAt(P, 2, 0).every((q) => q.opacity === 0)).toBe(true)
  })

  it('clears a dissolve in and closes it out', () => {
    const fx = compileFx({ dissolve: { sizeEm: 1, soft: 0.4, inMs: 1000, outMs: 500 } }, 'a', 4000)
    const ua = splitUnits('a')
    expect(fxAt(fx, ua, 0, 4000).dissolve).toBe(0)
    expect(fxAt(fx, ua, 2000, 4000).dissolve).toBe(1)
    expect(fxAt(fx, ua, 4000, 4000).dissolve).toBe(0)
  })

  it('holds a sweep once it has passed', () => {
    const fx = compileFx({ sweep: { delayMs: 0, ms: 1000, width: 0.4, angle: 0, strength: 1, hold: true } }, 'a', 4000)
    const ua = splitUnits('a')
    expect(fxAt(fx, ua, 500, 4000).sweep).toBeCloseTo(0.5)
    expect(fxAt(fx, ua, 3000, 4000).sweep).toBe(1.5)
  })
})

describe('Mask & Wipe pieces', () => {
  const u = splitUnits('ढक्कन खोलो')

  it('grows a bar over the text, then shrinks it away toward the far side', () => {
    const fx = compileFx({ bar: { delayMs: 0, ms: 1000, from: 'left' } }, 'ढक्कन खोलो', 4000)
    expect(fxAt(fx, u, 0, 4000).bar).toBeUndefined()
    const grow = fxAt(fx, u, 250, 4000).bar!
    expect(grow.origin).toBe('left')
    expect(grow.scale).toBeCloseTo(0.5)
    const leave = fxAt(fx, u, 750, 4000).bar!
    expect(leave.origin).toBe('right')
    expect(leave.scale).toBeCloseTo(0.5)
    expect(fxAt(fx, u, 1200, 4000).bar).toBeUndefined()
  })

  it('opens a box: wide first, then tall', () => {
    const fx = compileFx({ box: { delayMs: 0, ms: 1000, widthEm: 0.05 } }, 'ढक्कन खोलो', 4000)
    const early = fxAt(fx, u, 300, 4000).box!
    expect(early.sx).toBeGreaterThan(0.5)
    expect(early.sy).toBeCloseTo(0.04)
    expect(fxAt(fx, u, 2000, 4000).box).toEqual({ sx: 1, sy: 1 })
  })

  it('marks masked levels, on the unit the script allows', () => {
    const fx = compileFx({ in: { unit: 'letter', order: 'ltr', stepMs: 30, ms: 400, ease: EASE.out, state: { y: 1 }, masked: true } }, 'ढक्कन खोलो', 4000)
    const f = fxAt(fx, u, 100, 4000)
    expect(f.masked).toEqual({ word: true })
    expect(f.word).toHaveLength(2)
  })
})

describe('Light & Glow pieces', () => {
  const u = splitUnits('रोशनी आई')

  it('flickers each word before it holds, the same every time', () => {
    const fx = compileFx({ flicker: { unit: 'word', ms: 600, stepMs: 200, tickMs: 50, low: 0.1, glow: 0.2 } }, 'रोशनी आई', 4000)
    const before = fxAt(fx, u, 100, 4000)
    expect(before.word![1]!.opacity).toBe(0.1)
    const during = Array.from({ length: 12 }, (_, k) => fxAt(fx, u, k * 50, 4000).word![0]!)
    expect(during.some((s) => s.opacity === 0.1)).toBe(true)
    expect(during.some((s) => s.glow === 0.2)).toBe(true)
    expect(fxAt(fx, u, 300, 4000)).toEqual(fxAt(fx, u, 300, 4000))
    expect(fxAt(fx, u, 2000, 4000).word!.every((s) => s.glow === 0.2 && s.opacity === undefined)).toBe(true)
  })

  it('keeps a glow behind, but lets a ring spread and go', () => {
    const glow = compileFx({ backlight: { delayMs: 0, ms: 1000, opacity: 0.5 } }, 'a', 4000)
    const ring = compileFx({ backlight: { delayMs: 0, ms: 1000, opacity: 0.5, ring: true } }, 'a', 4000)
    const ua = splitUnits('a')
    expect(fxAt(glow, ua, 3000, 4000).backlight!.opacity).toBeCloseTo(0.5)
    expect(fxAt(ring, ua, 300, 4000).backlight!.opacity).toBeGreaterThan(0)
    expect(fxAt(ring, ua, 3000, 4000).backlight!.opacity).toBeCloseTo(0)
  })

  it('moves a flare across once', () => {
    const fx = compileFx({ flare: { delayMs: 0, ms: 1000, sizeEm: 0.5 } }, 'a', 4000)
    const ua = splitUnits('a')
    expect(fxAt(fx, ua, 500, 4000).flare!.at).toBeCloseTo(0.5)
    expect(fxAt(fx, ua, 1500, 4000).flare).toBeUndefined()
  })

  it('throws sparks from the moving point and lets them die out', () => {
    const P = { kind: 'spark' as const, count: 10, delayMs: 0, ms: 1000, sizeEm: 0.1 }
    const now = particlesAt(P, 3, 450).filter((q) => q.opacity > 0)
    expect(now.length).toBeGreaterThan(0)
    expect(now.every((q) => q.left <= 0.45 + 1e-9)).toBe(true)
    expect(particlesAt(P, 3, 3000).every((q) => q.opacity === 0)).toBe(true)
  })

  it('lights stars on and off over the text', () => {
    const P = { kind: 'twinkle' as const, count: 6, delayMs: 0, ms: 0, sizeEm: 0.2 }
    const seen = Array.from({ length: 20 }, (_, k) => particlesAt(P, 1, k * 100)).flat()
    expect(seen.some((q) => q.opacity > 0.5)).toBe(true)
    expect(seen.some((q) => q.opacity < 0.05)).toBe(true)
    expect(seen.every((q) => q.left >= 0 && q.left <= 1)).toBe(true)
  })

  it('keeps a base look the whole time', () => {
    const fx = compileFx({ base: { tint: 0.8 } }, 'a', 4000)
    expect(fxAt(fx, splitUnits('a'), 2000, 4000).whole!.tint).toBe(0.8)
  })
})

describe('Kinetic pieces', () => {
  const u = splitUnits('एक दो तीन')

  it('shakes the caption as each word lands, then stops', () => {
    const fx = compileFx({
      in: { unit: 'word', order: 'ltr', stepMs: 200, ms: 200, ease: EASE.in, state: { scale: 2 } },
      impact: { amountEm: 0.1, ms: 200 },
    }, 'एक दो तीन', 4000)
    expect(fxAt(fx, u, 100, 4000).whole).toBeUndefined()
    const hit = fxAt(fx, u, 230, 4000).whole!
    expect(Math.hypot(hit.x ?? 0, hit.y ?? 0)).toBeGreaterThan(0)
    expect(fxAt(fx, u, 2000, 4000).whole).toBeUndefined()
  })

  it('brings every other unit from the other side', () => {
    const fx = compileFx({ in: { unit: 'word', order: 'ltr', stepMs: 0, ms: 400, ease: EASE.linear, state: { x: -1, rotate: -5 }, alternate: true } }, 'एक दो तीन', 4000)
    const f = fxAt(fx, u, 0, 4000)
    expect(f.word!.map((s) => s.x)).toEqual([-1, 1, -1])
    expect(f.word![1]!.rotate).toBe(5)
  })

  it('beats a pulse out from rest only', () => {
    const fx = compileFx({ loop: { unit: 'word', periodMs: 1000, stepMs: 0, amp: { scale: 0.1 }, pulse: true } }, 'a', 4000)
    const ua = splitUnits('a')
    const scales = Array.from({ length: 20 }, (_, k) => fxAt(fx, ua, k * 50, 4000).word![0]!.scale!)
    expect(Math.min(...scales)).toBeCloseTo(1)
    expect(Math.max(...scales)).toBeCloseTo(1.1)
  })

  it('moves a highlight box from word to word as they are spoken', () => {
    const fx = compileFx({ marker: { unit: 'word', pick: 'all', order: 'ltr', delayMs: 0, stepMs: 0, ms: 50, opacity: 1, full: true, spoken: true } }, 'एक दो तीन', 4000)
    const at = spokenTimes(fx, u, 4000)
    expect(fxAt(fx, u, (at[1]! + at[2]!) / 2, 4000).marker).toEqual([0, 1, 0])
    expect(fxAt(fx, u, 4000, 4000).marker).toEqual([0, 0, 1])
  })

  it('swaps one word at a time, keeping the last', () => {
    const fx = compileFx({ swap: { ms: 100, travelEm: 0.5 } }, 'एक दो तीन', 4000)
    const at = spokenTimes(fx, u, 4000)
    const mid = fxAt(fx, u, (at[1]! + at[2]!) / 2, 4000)
    expect(mid.swap).toBe(true)
    expect(mid.word!.map((s) => s.opacity)).toEqual([0, 1, 0])
    expect(fxAt(fx, u, 4000, 4000).word!.map((s) => s.opacity)).toEqual([0, 0, 1])
  })

  it('sends the other words back while the key word comes forward', () => {
    const fx = compileFx({ emphasis: { delayMs: 0, ms: 100, state: { scale: 1.1 }, others: { opacity: 0.5 } } }, 'एक दो तीनचार', 4000)
    const f = fxAt(fx, splitUnits('एक दो तीनचार'), 1000, 4000)
    expect(f.word![2]!.scale).toBe(1.1)
    expect(f.word![0]!.opacity).toBe(0.5)
  })
})

describe('Stroke pieces', () => {
  const u = splitUnits('लिखो')

  it('draws the outline, then brings the fill in, then lets the outline go', () => {
    const fx = compileFx({ stroke: { widthEm: 0.03, delayMs: 0, drawMs: 1000, fill: { mode: 'wipe', delayMs: 800, ms: 400 }, fadeOut: true } }, 'लिखो', 4000)
    const early = fxAt(fx, u, 500, 4000)
    expect(early.stroke!.draw).toBeCloseTo(0.5)
    expect(early.body).toEqual({ opacity: 1, wipe: 0 })
    const mid = fxAt(fx, u, 1000, 4000)
    expect(mid.body!.wipe).toBeCloseTo(0.5)
    expect(mid.stroke!.opacity).toBe(1)
    expect(fxAt(fx, u, 3000, 4000).stroke!.opacity).toBe(0)
  })

  it('keeps an outline-only effect without fill, or with a faint one', () => {
    const none = compileFx({ stroke: { widthEm: 0.03, delayMs: 0, drawMs: 0, fill: { mode: 'none', delayMs: 0, ms: 0 } } }, 'a', 4000)
    expect(fxAt(none, splitUnits('a'), 2000, 4000).body).toEqual({ opacity: 0 })
    const faint = compileFx({ stroke: { widthEm: 0.03, delayMs: 0, drawMs: 0, fill: { mode: 'none', delayMs: 0, ms: 0, opacity: 0.3 } } }, 'a', 4000)
    expect(fxAt(faint, splitUnits('a'), 2000, 4000).body).toEqual({ opacity: 0.3 })
  })

  it('moves dashes along and shakes a sketch, the same each time', () => {
    const fx = compileFx({ stroke: { widthEm: 0.03, delayMs: 0, drawMs: 0, dash: { sizeEm: 0.1, speed: 1 }, wobble: 0.02, fill: { mode: 'none', delayMs: 0, ms: 0 } } }, 'a', 4000)
    const ua = splitUnits('a')
    expect(fxAt(fx, ua, 1500, 4000).stroke!.dash).toBeCloseTo(1.5)
    const a = fxAt(fx, ua, 1000, 4000).stroke!
    expect(fxAt(fx, ua, 1000, 4000).stroke).toEqual(a)
    expect(Math.abs(a.dx)).toBeLessThanOrEqual(0.02)
  })

  it('spreads rings out and fades them, and slides echoes out', () => {
    const fx = compileFx({ rings: { count: 2, periodMs: 1000, scaleTo: 1.3, widthEm: 0.02 }, echo: { count: 3, dxEm: 0.05, dyEm: 0.05, widthEm: 0.02, inMs: 500 } }, 'a', 4000)
    const f = fxAt(fx, splitUnits('a'), 1250, 4000)
    expect(f.rings).toHaveLength(2)
    for (const q of f.rings!) {
      expect(q.scale).toBeGreaterThanOrEqual(1)
      expect(q.scale).toBeLessThanOrEqual(1.3)
    }
    expect(f.echo).toBe(1)
  })
})

describe('Scramble pieces', () => {
  it('shows letters of the same script while scrambled', () => {
    expect(/[ऀ-ॿ]/.test(scrambleChar('न', 0.3))).toBe(true)
    expect(/[ঀ-৿]/.test(scrambleChar('ক', 0.7))).toBe(true)
    expect(/[஀-௿]/.test(scrambleChar('வ', 0.5))).toBe(true)
    expect(/[ఀ-౿]/.test(scrambleChar('న', 0.1))).toBe(true)
    expect(/[A-Z]/.test(scrambleChar('Q', 0.99))).toBe(true)
    expect(/[0-9]/.test(scrambleChar('7', 0.5))).toBe(true)
  })

  it('settles letters from left to right, the same each time', () => {
    const fx = compileFx({ scramble: { unit: 'letter', order: 'ltr', delayMs: 0, stepMs: 100, ms: 300, tickMs: 50, dir: 'in' } }, 'नमस्ते', 4000)
    const u = splitUnits('नमस्ते')
    const f = fxAt(fx, u, 350, 4000)
    expect(f.scramble![0]).toBeNull()
    expect(typeof f.scramble![2]).toBe('string')
    expect(fxAt(fx, u, 350, 4000).scramble).toEqual(f.scramble)
    expect(fxAt(fx, u, 2000, 4000).scramble!.every((c) => c === null)).toBe(true)
  })

  it('settles a word’s letters together', () => {
    const fx = compileFx({ scramble: { unit: 'word', order: 'ltr', delayMs: 0, stepMs: 500, ms: 300, tickMs: 50, dir: 'in' } }, 'एक दो', 4000)
    const u = splitUnits('एक दो')
    const f = fxAt(fx, u, 400, 4000)
    expect(f.scramble!.slice(0, 2)).toEqual([null, null])
    expect(f.scramble!.slice(2).every((c) => typeof c === 'string')).toBe(true)
  })

  it('breaks up at the end on the way out', () => {
    const fx = compileFx({ scramble: { unit: 'letter', order: 'ltr', delayMs: 0, stepMs: 0, ms: 300, tickMs: 50, dir: 'out' } }, 'ab', 4000)
    const u = splitUnits('ab')
    expect(fxAt(fx, u, 1000, 4000).scramble).toEqual([null, null])
    expect(fxAt(fx, u, 3900, 4000).scramble!.every((c) => typeof c === 'string')).toBe(true)
  })

  it('keeps a typed-in letter hidden until its turn, and flaps', () => {
    const blank = compileFx({ scramble: { unit: 'letter', order: 'ltr', delayMs: 0, stepMs: 200, ms: 100, tickMs: 50, dir: 'in', blankBefore: true } }, 'ab', 4000)
    expect(fxAt(blank, splitUnits('ab'), 50, 4000).letter![1]!.opacity).toBe(0)
    const flap = compileFx({ scramble: { unit: 'letter', order: 'ltr', delayMs: 0, stepMs: 0, ms: 500, tickMs: 100, dir: 'in', flap: true } }, 'ab', 4000)
    const y = fxAt(flap, splitUnits('ab'), 50, 4000).letter![0]!.scaleY!
    expect(y).toBeGreaterThanOrEqual(0.2)
    expect(y).toBeLessThan(1)
  })

  it('puts the cursor after the last letter typed', () => {
    const fx = compileFx({
      in: { unit: 'letter', order: 'ltr', stepMs: 100, ms: 1, ease: EASE.linear, state: { opacity: 0 }, keepLetters: true },
      cursor: { blinkMs: 500, widthEm: 0.06 },
    }, 'नमस्ते', 4000)
    const u = splitUnits('नमस्ते')
    expect(fxAt(fx, u, 150, 4000).cursor).toEqual({ letter: 1, on: true })
    expect(fxAt(fx, u, 600, 4000).cursor).toEqual({ letter: 2, on: false })
  })

  it('scatters units by fixed random shares, and pulls covers away', () => {
    const fx = compileFx({
      in: { unit: 'letter', order: 'ltr', stepMs: 0, ms: 500, ease: EASE.linear, state: { x: 1 }, scatter: true },
      marker: { unit: 'word', pick: 'all', order: 'ltr', delayMs: 0, stepMs: 0, ms: 400, opacity: 1, cover: true },
    }, 'abcd', 4000)
    const u = splitUnits('abcd')
    const xs = fxAt(fx, u, 0, 4000).letter!.map((s) => s.x!)
    expect(new Set(xs.map((x) => x.toFixed(4))).size).toBeGreaterThan(1)
    for (const x of xs) expect(Math.abs(x)).toBeLessThanOrEqual(1)
    expect(fxAt(fx, u, 0, 4000).marker).toEqual([1])
    expect(fxAt(fx, u, 1000, 4000).marker).toEqual([0])
  })
})

describe('Elastic pieces', () => {
  it('runs springy moves from 0 to 1, going past 1 on the way', () => {
    for (const e of ['bounce', 'spring', 'elastic', 'jelly'] as const) {
      expect(easeAt(e, 0)).toBe(0)
      expect(easeAt(e, 1)).toBe(1)
      expect(Math.abs(easeAt(e, 0.999) - 1)).toBeLessThan(0.02)
    }
    const peak = (e: 'spring' | 'elastic' | 'jelly') => Math.max(...Array.from({ length: 100 }, (_, i) => easeAt(e, i / 100)))
    expect(peak('spring')).toBeGreaterThan(1.05)
    expect(peak('elastic')).toBeGreaterThan(1.05)
    expect(peak('jelly')).toBeGreaterThan(1.05)
    // A bounce never goes past the ground
    expect(Math.max(...Array.from({ length: 100 }, (_, i) => easeAt('bounce', i / 100)))).toBeLessThanOrEqual(1)
  })

  it('fades straight in under a springy move, without flicker', () => {
    const fx = compileFx({ in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 1000, ease: 'elastic', state: { opacity: 0, x: -2 } } }, 'a', 4000)
    const u = splitUnits('a')
    const ops = Array.from({ length: 21 }, (_, i) => fxAt(fx, u, i * 50, 4000).whole!.opacity!)
    for (let i = 1; i < ops.length; i++) expect(ops[i]!).toBeGreaterThanOrEqual(ops[i - 1]!)
    expect(ops[ops.length - 1]).toBe(1)
  })

  it('squashes each unit as it lands and lets it wobble back', () => {
    const fx = compileFx({
      in: { unit: 'word', order: 'ltr', stepMs: 300, ms: 200, ease: EASE.in, state: { y: -1 } },
      land: { squash: 0.3, ms: 400 },
    }, 'एक दो', 4000)
    const u = splitUnits('एक दो')
    const hit = fxAt(fx, u, 201, 4000).word!
    expect(hit[0]!.scaleY!).toBeCloseTo(0.7, 1)
    expect(hit[0]!.scaleX!).toBeGreaterThan(1.2)
    expect(hit[1]!.scaleY).toBeUndefined()
    expect(fxAt(fx, u, 2000, 4000).word!.every((s) => s.scaleY === undefined)).toBe(true)
  })
})

describe('Distort pieces', () => {
  it('firms gooey blobs up into the text', () => {
    const fx = compileFx({ goo: { blurEm: 0.2, inMs: 1000 } }, 'a', 4000)
    const u = splitUnits('a')
    expect(fxAt(fx, u, 0, 4000).goo).toBeCloseTo(0.2)
    expect(fxAt(fx, u, 500, 4000).goo).toBeCloseTo(0.1)
    expect(fxAt(fx, u, 2000, 4000).goo).toBe(0)
  })

  it('swells the words under the passing lens', () => {
    const fx = compileFx({ lens: { periodMs: 1000, amount: 0.3, width: 0.2 } }, 'एक दो तीन चार', 4000)
    const u = splitUnits('एक दो तीन चार')
    // A third of the way: the lens is over the second word
    const scales = fxAt(fx, u, (1000 * (0.375 + 0.2)) / 1.4, 4000).word!.map((s) => s.scale!)
    expect(scales[1]).toBeGreaterThan(1.25)
    expect(scales[3]).toBeLessThan(1.05)
  })

  it('grows a melting letter from its top', () => {
    const fx = compileFx({ out: { unit: 'letter', order: 'ltr', stepMs: 0, ms: 500, ease: EASE.in, state: { scaleY: 2 }, origin: 'top' } }, 'ab', 4000)
    expect(fxAt(fx, splitUnits('ab'), 3800, 4000).origin).toEqual({ letter: 'top' })
  })

  it('holds a warp at its rest until the way out', () => {
    const fx = compileFx({ warp: { sizeEm: 0.4, amountEm: 0.4, inMs: 0, restEm: 0, outMs: 500 } }, 'a', 4000)
    const u = splitUnits('a')
    expect(fxAt(fx, u, 0, 4000).warp).toBe(0)
    expect(fxAt(fx, u, 2000, 4000).warp).toBe(0)
    expect(fxAt(fx, u, 4000, 4000).warp).toBeCloseTo(0.4)
    const haze = compileFx({ warp: { sizeEm: 0.3, amountEm: 0.07, inMs: 0 } }, 'a', 4000)
    expect(fxAt(haze, u, 2000, 4000).warp).toBeCloseTo(0.07)
  })
})

describe('Trailer pieces', () => {
  it('spreads letters out from the middle as tracking would, and draws them together', () => {
    const fx = compileFx({ in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 1000, ease: EASE.linear, state: { spread: 0.4 } } }, 'abcde', 4000)
    const u = splitUnits('abcde')
    const f = fxAt(fx, u, 0, 4000)
    expect(f.letter!.map((s) => s.x)).toEqual([-0.8, -0.4, 0, 0.4, 0.8])
    expect(f.whole!.spread).toBeUndefined()
    const done = fxAt(fx, u, 2000, 4000)
    expect(done.letter).toBeUndefined()
  })
})
