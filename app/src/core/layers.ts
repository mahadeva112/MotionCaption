// Text+ layers already on the Resolve timeline, as captions. The bridge reads each
// layer's Text+ input values (timeline.json `texts`); this turns them back into the app's
// Look, so an animated layer keeps the font, size, colour and place it was given in Resolve.
//
// The conversions undo what the bridge writes (MotionCaption.lua style_text / shade):
// outline Thickness2 = width, SoftnessX2 = soft × 8, shadow SoftnessX3 = blur × 16 and Offset3 = distance × 0.02,
// box ExtendHorizontal4 = pad × 0.4.

import { outlineOf, type Align, type Look, type Rgb } from './look.ts'
import type { Cue } from './srt.ts'

export type RawInputs = Record<string, number | string | readonly [number, number]>

export interface LayerLike {
  track: number
  at: number
  start: number
  end: number
  text: string
  enabled: boolean
  mc: boolean
  raw: RawInputs
}

const num = (raw: RawInputs, id: string, fallback: number) => {
  const v = raw[id]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
const pair = (raw: RawInputs, id: string): readonly [number, number] | null => {
  const v = raw[id]
  return Array.isArray(v) && v.length === 2 ? (v as readonly [number, number]) : null
}
const color = (raw: RawInputs, n: number, fallback: Rgb): Rgb =>
  [num(raw, 'Red' + n, fallback[0]), num(raw, 'Green' + n, fallback[1]), num(raw, 'Blue' + n, fallback[2])]
const on = (raw: RawInputs, n: number) => num(raw, 'Enabled' + n, 0) > 0.5
const round = (v: number, places = 4) => Math.round(v * 10 ** places) / 10 ** places

/** The look a Text+ layer has, in the app's terms. Anything Resolve did not report stays unset. */
export function lookOfLayer(raw: RawInputs): Partial<Look> {
  const look: Partial<Look> = {
    // Placed by its Text+ Center: the middle anchor puts the block's centre at 0.5 + x, 0.5 + y
    anchor: 4, textCase: 'as', lines: 'keep', maxWidth: 1,
    fill: color(raw, 1, [1, 1, 1]),
  }
  if (typeof raw.Font === 'string' && raw.Font) look.font = raw.Font
  if (typeof raw.Style === 'string' && raw.Style) look.style = raw.Style
  if (typeof raw.Size === 'number') look.size = round(raw.Size)
  if (typeof raw.CharacterSpacing === 'number') look.tracking = round(raw.CharacterSpacing)
  if (typeof raw.LineSpacing === 'number') look.lineSpacing = round(raw.LineSpacing)
  const j = raw.HorizontalJustificationNew
  if (typeof j === 'number') look.align = (j === 0 ? 'left' : j === 2 ? 'right' : 'center') as Align
  const c = pair(raw, 'Center')
  look.x = c ? round(c[0] - 0.5) : 0
  look.y = c ? round(c[1] - 0.5) : 0
  look.rotation = round(num(raw, 'AngleZ', 0), 2)

  look.outline = outlineOf({
    on: on(raw, 2), width: round(num(raw, 'Thickness2', 0.05)), color: color(raw, 2, [0, 0, 0]),
    outside: num(raw, 'OutsideOnly2', 1) > 0.5, opacity: round(num(raw, 'Opacity2', 1), 3), soft: round(num(raw, 'SoftnessX2', 0) / 8, 3),
  })
  const off = pair(raw, 'Offset3')
  look.shadow = {
    on: on(raw, 3),
    blur: round(num(raw, 'SoftnessX3', 8) / 16, 3),
    distance: round(off ? Math.abs(off[0]) / 0.02 : 0.3, 3),
    opacity: round(num(raw, 'Opacity3', 0.6), 3),
    color: color(raw, 3, [0, 0, 0]),
  }
  look.box = {
    on: on(raw, 4),
    color: color(raw, 4, [0, 0, 0]),
    opacity: round(num(raw, 'Opacity4', 0.55), 3),
    round: round(num(raw, 'Round4', 0.3), 3),
    pad: round(num(raw, 'ExtendHorizontal4', 0.12) / 0.4, 3),
  }
  return look
}

/** Layers that can be animated: not MotionCaption's own captions, with some text, in time order */
export function usableLayers<T extends LayerLike>(texts: T[] | undefined): T[] {
  return (texts ?? [])
    .filter((t) => !t.mc && t.text.trim() !== '' && t.end > t.start)
    .sort((a, b) => a.start - b.start || a.track - b.track)
}

/** Layers as captions, numbered from 1 in time order */
export function cuesOfLayers(layers: LayerLike[]): Cue[] {
  return layers.map((t, i) => ({
    n: i + 1, index: i + 1, startMs: Math.round(t.start), endMs: Math.round(t.end), raw: t.text, text: t.text.replace(/\r/g, ''), line: 0,
  }))
}
