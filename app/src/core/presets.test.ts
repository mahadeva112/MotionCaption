import { describe, expect, it } from 'vitest'
import { compileCue } from './compile.ts'
import { FAMILIES, PRESETS } from './presets.ts'

// Inputs checked in Resolve stills, per node. A preset may only animate these.
const PROVEN: Record<string, string[]> = {
  text: ['Opacity1', 'CharacterSpacing', 'SoftnessX1', 'SoftnessY1'],
  move: ['Size', 'Center', 'Angle'],
  letters: ['Opacity1', 'CharacterOffset', 'CharacterSizeX', 'CharacterSizeY'],
}

describe('preset library', () => {
  it('has 218 presets with unique ids and names', () => {
    expect(PRESETS).toHaveLength(218)
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(218)
    expect(new Set(PRESETS.map((p) => p.name)).size).toBe(218)
  })

  it('uses only known families, each with presets', () => {
    for (const f of FAMILIES) expect(PRESETS.filter((p) => p.family === f).length).toBeGreaterThan(0)
    for (const p of PRESETS) expect(FAMILIES).toContain(p.family)
  })

  it('animates only inputs proven in Resolve', () => {
    for (const p of PRESETS) {
      for (const t of p.tracks) expect(PROVEN[t.target], `${p.id} ${t.target}`).toContain(t.input)
      if (p.tracks.some((t) => t.target === 'letters')) expect(p.letters, `${p.id} needs letters`).toBeDefined()
    }
  })

  it('compiles every preset, ending visible keys inside the caption', () => {
    for (const len of [400, 1500, 6000]) {
      const cue = { n: 1, index: 1, startMs: 1000, endMs: 1000 + len, raw: 'Every moment is a possibility', text: 'Every moment is a possibility', line: 1 }
      for (const p of PRESETS) {
        const c = compileCue(cue, p.id)
        for (const t of c.tracks) {
          for (const k of t.keys) {
            expect(k.ms, `${p.id} ${t.input} at ${len}`).toBeGreaterThanOrEqual(0)
            expect(k.ms, `${p.id} ${t.input} at ${len}`).toBeLessThanOrEqual(len)
          }
        }
      }
    }
  })
})

describe('letter presets on long lines', () => {
  it('finish every letter within the caption', () => {
    const text = 'Stillness is not the end of motion, it is the source of the story'
    for (const len of [1200, 2400, 6000]) {
      const cue = { n: 1, index: 1, startMs: 0, endMs: len, raw: text, text, line: 1 }
      for (const p of PRESETS.filter((x) => x.letters)) {
        const c = compileCue(cue, p.id)
        const anim = Math.max(...c.tracks.filter((t) => t.target === 'letters').flatMap((t) => t.keys.map((k) => k.ms)))
        const lastStarts = (Array.from(new Intl.Segmenter().segment(text)).length - 1) * c.letters!.stepMs
        expect(lastStarts + anim, `${p.id} at ${len} ms`).toBeLessThanOrEqual(len * 0.75 + 1)
      }
    }
  })

  it('keep the preset step when it already fits', () => {
    const cue = { n: 1, index: 1, startMs: 0, endMs: 5000, raw: 'Short line', text: 'Short line', line: 1 }
    expect(compileCue(cue, 'cascade').letters!.stepMs).toBe(30)
  })
})
