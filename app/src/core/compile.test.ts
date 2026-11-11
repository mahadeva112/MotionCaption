import { describe, expect, it } from 'vitest'
import { EASE } from './anim.ts'
import { compileCue, fallbackStyle, fontFor, hasOwnOut, timeTracks, withMotion, wordRange } from './compile.ts'
import { presetById } from './presets.ts'
import { jobToLua, luaString, makeJob, sigOf, toLua } from './job.ts'
import { DEFAULT_LOOK } from './look.ts'
import type { Cue } from './srt.ts'

const cue = (text: string, startMs = 1000, endMs = 3000): Cue => ({ n: 1, index: 1, startMs, endMs, raw: text, text, line: 1 })

describe('timeTracks', () => {
  const tracks = [{
    target: 'text' as const, input: 'Opacity1',
    keys: [
      { at: 0, v: 0, ease: EASE.out }, { at: 300, v: 1 },
      { at: -200, from: 'end' as const, v: 1 }, { at: 0, from: 'end' as const, v: 0 },
    ],
  }]

  it('turns end-relative keys into ms from the start', () => {
    expect(timeTracks(tracks, 2000)[0]!.keys.map((k) => k.ms)).toEqual([0, 300, 1800, 2000])
  })

  it('keeps the ease and fills linear where none is given', () => {
    const k = timeTracks(tracks, 2000)[0]!.keys
    expect(k[0]!.ease).toEqual(EASE.out)
    expect(k[1]!.ease).toEqual(EASE.linear)
  })

  it('squeezes in and out animations to fit a short caption', () => {
    // 500 ms of animation into a 400 ms caption: room is 360 ms, factor 0.72
    expect(timeTracks(tracks, 400)[0]!.keys.map((k) => k.ms)).toEqual([0, 216, 256, 400])
  })
})

describe('wordRange', () => {
  it('counts letters from 0 and skips extra spaces', () => {
    expect(wordRange('Every moment is a possibility', 4)).toEqual({ first: 18, last: 28 })
    expect(wordRange('  two  words ', 1)).toEqual({ first: 7, last: 11 })
    expect(wordRange('one', 3)).toBeNull()
  })

  it('counts Bangla the way Text+ does: পূ and র্ণ are one letter each', () => {
    // জী ব ন কে · পূ র্ণ ভা বে  → the second word is letters 5–8 (seen in Resolve stills)
    expect(wordRange('জীবনকে পূর্ণভাবে অনুভব করুন', 1)).toEqual({ first: 5, last: 8 })
  })
})

describe('fontFor', () => {
  it('switches to an Indian-script font for Bangla and Hindi only', () => {
    expect(fontFor('जीवन', 'Arial Black')).toBe('Nirmala UI')
    expect(fontFor('जीवन', 'Mukta')).toBe('Mukta')
    expect(fontFor('জীবন', 'Open Sans')).toBe('Nirmala UI')
    expect(fontFor('जीवन', 'Open Sans')).toBe('Nirmala UI')
    expect(fontFor('Life', 'Open Sans')).toBe('Open Sans')
    expect(fontFor('জীবন', 'Kalpurush')).toBe('Kalpurush')
  })

  it('keeps the chosen font when the font itself has the letters, whatever its name', () => {
    const asked: string[] = []
    const has = (text: string, font: string) => { asked.push(text); return font === 'Vesper Libre' }
    expect(fontFor('अगर कोई अपने', 'Vesper Libre', 'Medium', has)).toBe('Vesper Libre')
    expect(fontFor('अगर कोई अपने', 'Mukta', 'Medium', has)).toBe('Nirmala UI')
    expect(fontFor('வாழ்க்கை', 'Open Sans', 'Bold', has)).toBe('Nirmala UI')
    expect(fontFor('Life', 'Open Sans', 'Bold', has)).toBe('Open Sans')
    // Only the Indian-script letters are asked about, so Latin words cannot hide a missing script
    expect(fontFor('Hello जीवन now', 'Open Sans', 'Bold', has)).toBe('Nirmala UI')
    expect(asked.at(-1)).toBe('जीवन')
  })
})

describe('fallbackStyle', () => {
  it('gives a swapped font a weight Nirmala UI has', () => {
    expect(['Thin', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'Black', 'Bold Italic'].map(fallbackStyle))
      .toEqual(['Semilight', 'Semilight', 'Regular', 'Regular', 'Bold', 'Bold', 'Bold', 'Bold'])
  })
})

describe('compileCue', () => {
  it('keeps the caption times and resolves word picks', () => {
    const c = compileCue(cue('Every moment is a possibility'), 'pop', { words: { 4: { effect: 'pop', color: [1, 0.8, 0.2] } } })
    expect(c).toMatchObject({ startMs: 1000, endMs: 3000, preset: 'pop' })
    expect(c.words).toHaveLength(1)
    expect(c.words[0]).toMatchObject({ first: 18, last: 28 })
    expect(c.tracks.map((t) => `${t.target}.${t.input}`)).toEqual(['move.Size', 'text.Opacity1'])
  })

  it('sends the chosen font and style when the font has the letters, and a matching style when it is swapped', () => {
    const look = { ...DEFAULT_LOOK, font: 'Vesper Libre', style: 'Medium' }
    const kept = compileCue(cue('अगर कोई अपने'), 'fade', { look, hasGlyphs: () => true })
    expect(kept.look).toMatchObject({ font: 'Vesper Libre', style: 'Medium' })
    const swapped = compileCue(cue('अगर कोई अपने'), 'fade', { look, hasGlyphs: () => false })
    expect(swapped.look).toMatchObject({ font: 'Nirmala UI', style: 'Regular' })
  })

  it('refuses an unknown preset', () => {
    expect(() => compileCue(cue('x'), 'nope')).toThrow('Unknown preset')
  })
})

describe('Lua job text', () => {
  it('escapes strings and keeps UTF-8 as is', () => {
    expect(luaString('He said "go" \\ now\n')).toBe('"He said \\"go\\" \\\\ now\\n"')
    expect(luaString('জীবন')).toBe('"জীবন"')
    expect(luaString('a\u0001b')).toBe('"a\\001b"')
  })

  it('writes tables, arrays and reserved-word keys', () => {
    expect(toLua({ a: 1, end: true, 'x-y': [1, 2], list: [{ b: 'c' }] })).toBe(
      '{\n  a = 1,\n  ["end"] = true,\n  ["x-y"] = { 1, 2 },\n  list = {\n    {\n      b = "c"\n    }\n  }\n}')
  })

  it('signs each caption by what Resolve builds from it, not by its number or time', () => {
    const look = { ...DEFAULT_LOOK }
    const a = compileCue(cue('Every moment'), 'fade', { look })
    expect(sigOf(a)).toMatch(/^[0-9a-f]{16}$/)
    // The same caption again, renumbered and two seconds later: the same signature
    expect(sigOf(compileCue({ ...cue('Every moment', 3000, 5000), n: 7 }, 'fade', { look }))).toBe(sigOf(a))
    // Anything Resolve would draw differently changes it
    expect(sigOf(compileCue(cue('Every moment!'), 'fade', { look }))).not.toBe(sigOf(a))
    expect(sigOf(compileCue(cue('Every moment'), 'pop', { look }))).not.toBe(sigOf(a))
    expect(sigOf(compileCue(cue('Every moment'), 'fade', { look: { ...look, fill: [1, 0.8, 0.2] } }))).not.toBe(sigOf(a))
    expect(sigOf(compileCue(cue('Every moment'), 'fade', { look: { ...look, font: 'Arial' } }))).not.toBe(sigOf(a))
    expect(sigOf(compileCue(cue('Every moment', 1000, 3500), 'fade', { look }))).not.toBe(sigOf(a))
    const job = makeJob('My talk.srt', [a], undefined, new Date('2026-11-03T10:00:00Z'))
    expect(job.cues[0]!.sig).toBe(sigOf(a))
    expect(jobToLua(job)).toContain(`sig = "${sigOf(a)}"`)
  })

  it('makes a loadable job', () => {
    const job = makeJob('My talk.srt', [compileCue(cue('Hi'), 'fade')], undefined, new Date('2026-11-03T10:00:00Z'))
    expect(job.trackName).toBe('MC My talk')
    expect(job.id).toMatch(/^20261103100000-/)
    expect(jobToLua(job)).toMatch(/^-- MotionCaption job.*\nreturn \{\n  version = 1,/)
  })
})

describe('withMotion', () => {
  const fade = presetById('fade')!.tracks
  const M = { speed: 1, out: 'preset', outMs: 250 } as const

  it('borrows another animation’s way out', () => {
    const t = withMotion(fade, { ...M, out: 'other', outFrom: 'zoomThrough' })
    // Fade's own fade-in stays; Zoom Through's way out (fade and grow) replaces fade's
    const size = t.find((x) => x.input === 'Size')!
    expect(size.keys[0]).toMatchObject({ at: 0, v: 1 })
    expect(size.keys.filter((k) => k.from === 'end').map((k) => k.v)).toEqual([1, 1.25])
    const op = t.find((x) => x.input === 'Opacity1')!
    expect(op.keys.filter((k) => (k.from ?? 'start') === 'start').map((k) => k.v)).toEqual([0, 1])
    expect(op.keys.filter((k) => k.from === 'end').length).toBeGreaterThan(0)
  })

  it('keeps the way out when the borrowed animation has none', () => {
    expect(withMotion(fade, { ...M, out: 'other', outFrom: 'typewriter' })).toEqual(withMotion(fade, M))
    expect(hasOwnOut('typewriter')).toBe(false)
    expect(hasOwnOut('zoomThrough')).toBe(true)
  })

  it('puts its own curves on the way in and the way out', () => {
    const c = [0.1, 0.2, 0.3, 0.4] as const
    const d = [0.5, 0.6, 0.7, 0.8] as const
    const op = withMotion(fade, { ...M, easeIn: c, easeOut: d })[0]!
    expect(op.keys.map((k) => k.ease)).toEqual([c, c, d, d])
    expect(withMotion(fade, { ...M, easeIn: c })[0]!.keys.slice(2).map((k) => k.ease)).toEqual(fade[0]!.keys.slice(2).map((k) => k.ease))
  })
})
