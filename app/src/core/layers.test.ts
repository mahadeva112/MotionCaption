import { describe, expect, it } from 'vitest'
import { compileCue } from './compile.ts'
import { DEFAULT_LOOK } from './look.ts'
import { cuesOfLayers, lookOfLayer, usableLayers, type LayerLike } from './layers.ts'

const layer = (x: Partial<LayerLike>): LayerLike => ({ track: 2, at: 86400, start: 0, end: 2000, text: 'Hello', enabled: true, mc: false, raw: {}, ...x })

describe('Text+ layers', () => {
  it('keeps font, size, colour and place', () => {
    const l = lookOfLayer({ Font: 'Montserrat', Style: 'Black', Size: 0.11, CharacterSpacing: 1.05, Red1: 1, Green1: 0.8, Blue1: 0.2, Center: [0.3, 0.72], AngleZ: 5 })
    expect(l).toMatchObject({ font: 'Montserrat', style: 'Black', size: 0.11, tracking: 1.05, fill: [1, 0.8, 0.2], anchor: 4, x: -0.2, y: 0.22, rotation: 5, lines: 'keep' })
    expect(l.outline?.on).toBe(false)
    expect(l.shadow?.on).toBe(false)
    expect(l.box?.on).toBe(false)
  })

  it('puts the caption back on the layer’s own Center', () => {
    const look = { ...DEFAULT_LOOK, ...lookOfLayer({ Size: 0.08, Center: [0.3, 0.72] }) }
    const c = compileCue({ n: 1, index: 1, startMs: 0, endMs: 2000, raw: 'Hi', text: 'Hi', line: 0 }, 'fade', { look })
    expect(c.look.center[0]).toBeCloseTo(0.3)
    expect(c.look.center[1]).toBeCloseTo(0.72)
  })

  it('undoes the bridge’s outline, shadow and box values', () => {
    const l = lookOfLayer({ Enabled2: 1, Thickness2: 0.08, Red2: 1, Green2: 0, Blue2: 0,
      Enabled3: 1, SoftnessX3: 8, Offset3: [0.006, -0.006], Opacity3: 0.5,
      Enabled4: 1, Opacity4: 0.7, Round4: 0.2, ExtendHorizontal4: 0.12, HorizontalJustificationNew: 0 })
    expect(l.outline).toEqual({ on: true, width: 0.08, color: [1, 0, 0] })
    expect(l.shadow).toMatchObject({ on: true, blur: 0.5, distance: 0.3, opacity: 0.5 })
    expect(l.box).toMatchObject({ on: true, opacity: 0.7, round: 0.2, pad: 0.3 })
    expect(l.align).toBe('left')
  })

  it('leaves out MotionCaption’s own captions and empty layers, in time order', () => {
    const got = usableLayers([
      layer({ start: 3000, end: 4000, text: 'second' }),
      layer({ start: 1000, end: 2000, text: 'first' }),
      layer({ start: 500, end: 900, text: 'mine', mc: true }),
      layer({ start: 0, end: 900, text: '  ' }),
    ])
    expect(got.map((t) => t.text)).toEqual(['first', 'second'])
    expect(cuesOfLayers(got).map((c) => [c.n, c.startMs])).toEqual([[1, 1000], [2, 3000]])
  })
})
