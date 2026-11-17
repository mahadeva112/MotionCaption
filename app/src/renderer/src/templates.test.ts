import { describe, expect, it } from 'vitest'
import { compileCue, roughMeasure } from '@core/compile'
import { DEFAULT_LOOK } from '@core/look'
import { presetById } from '@core/presets'
import { TEMPLATE_GROUPS, TEMPLATES } from './templates'
import { lookOf } from './model'

describe('super templates', () => {
  it('has 100, half simple and half advanced, in every group', () => {
    expect(TEMPLATES).toHaveLength(100)
    expect(TEMPLATES.filter((t) => t.level === 'advanced')).toHaveLength(50)
    for (const g of TEMPLATE_GROUPS) expect(TEMPLATES.some((t) => t.group === g), g).toBe(true)
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(100)
  })

  it('uses animations that exist', () => {
    for (const t of TEMPLATES) expect(presetById(t.preset), `${t.id}: ${t.preset}`).toBeTruthy()
  })

  it('advanced ones draw shapes and simple ones do not', () => {
    for (const t of TEMPLATES) expect((t.look.deco?.length ?? 0) > 0, t.id).toBe(t.level === 'advanced')
  })

  it('word looks point at words the text has', () => {
    for (const t of TEMPLATES) {
      const n = t.text.split(/\s+/).filter(Boolean).length
      for (const k of Object.keys(t.words?.(t.text) ?? {})) expect(Number(k), t.id).toBeLessThan(n)
    }
  })

  it('compiles, and the shapes go with the caption', () => {
    for (const t of TEMPLATES) {
      const look = lookOf(DEFAULT_LOOK, { 1: { words: {}, look: t.look } }, 1)
      const c = compileCue({ n: 1, index: 1, startMs: 0, endMs: t.ms, raw: t.text, text: t.text, line: 0 }, t.preset,
        { look, words: t.words?.(t.text) ?? {}, measure: roughMeasure, aspect: 16 / 9 })
      expect(c.look.deco ?? [], t.id).toEqual(t.look.deco ?? [])
    }
  })
})
