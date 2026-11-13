// How captions look: the Inspector's Look, Position and Words settings, and the layout
// work that turns them into Text+ values. Shared by the preview and by Resolve.
//
// Text+ cannot style one word differently inside a line. Word colours and effects use a
// copy of the caption whose Follower shows only that word; a word with its own size is
// drawn as its own Text+ in blank room left in the caption (see layout).

import type { Bezier } from './anim.ts'

export type Rgb = readonly [number, number, number]
export type TextCase = 'as' | 'upper' | 'lower' | 'title'
export type Align = 'left' | 'center' | 'right'
/** keep: line breaks as in the subtitles; 1: never break; 2: up to two, balanced; auto: as many as needed */
export type Lines = 'keep' | '1' | '2' | 'auto'

export interface Look {
  font: string
  /** Text+ Style, e.g. Regular, Bold, ExtraBold, Black */
  style: string
  /** Text+ Size (0.084 is the default caption) */
  size: number
  /** Text+ CharacterSpacing, 1 = as the font has it */
  tracking: number
  /** Text+ LineSpacing, 1 = as the font has it */
  lineSpacing: number
  textCase: TextCase
  align: Align
  fill: Rgb
  outline: Outline
  shadow: { on: boolean; blur: number; distance: number; opacity: number; color: Rgb }
  box: { on: boolean; color: Rgb; opacity: number; round: number; pad: number }
  /** 0–8, rows top to bottom: 0 top-left … 4 middle … 7 bottom-centre */
  anchor: number
  /** Nudge from the anchor, as a share of the frame (x right, y up) */
  x: number
  y: number
  /** Degrees, counter-clockwise like Resolve */
  rotation: number
  /** Widest a line may be, as a share of the frame width */
  maxWidth: number
  lines: Lines
  /** A second fill colour: the letters run from fill to this one, at this angle (Finished clips) */
  gradient: { on: boolean; color: Rgb; angle: number }
  /** A picture with the text, e.g. a logo, as a data: URL; size is its height in letter heights (Finished clips) */
  image: { on: boolean; src: string; size: number; place: ImagePlace }
  /** Numbers in the text count up to their value, from `from`, over `ms` (Finished clips) */
  count: { on: boolean; from: number; ms: number }
  /** A way the caption travels while it is on screen: points as offsets from its place,
   *  shares of the frame (x right, y up), reached one after another over its time */
  path: readonly (readonly [number, number])[]
}

export type ImagePlace = 'left' | 'right' | 'above'

/** The line around the letters. It is drawn behind all of them at once, so letters that
 *  touch or overlap (the headline of Devanagari, Bengali and the like) show no seams. */
export interface Outline {
  on: boolean
  width: number
  color: Rgb
  /** Only outside the letters, which keep their full weight; off, it is centred on the edge and eats into them */
  outside: boolean
  opacity: number
  /** Soft edge, 0–1 */
  soft: number
  /** A second line around the first */
  second: boolean
  width2: number
  color2: Rgb
}

export const DEFAULT_LOOK: Look = {
  font: 'Open Sans', style: 'Bold', size: 0.084, tracking: 1, lineSpacing: 1, textCase: 'as', align: 'center',
  fill: [1, 1, 1],
  outline: { on: false, width: 0.05, color: [0, 0, 0], outside: true, opacity: 1, soft: 0, second: false, width2: 0.05, color2: [1, 1, 1] },
  shadow: { on: true, blur: 0.5, distance: 0.3, opacity: 0.6, color: [0, 0, 0] },
  box: { on: false, color: [0, 0, 0], opacity: 0.55, round: 0.3, pad: 0.3 },
  anchor: 7, x: 0, y: 0, rotation: 0, maxWidth: 0.8, lines: '2',
  gradient: { on: false, color: [1, 0.55, 0.2], angle: 90 },
  image: { on: false, src: '', size: 1.6, place: 'left' },
  count: { on: false, from: 0, ms: 1200 },
  path: [],
}

export type WordEffect = 'none' | 'pop' | 'shake' | 'glow' | 'bounce'

/** One word's own look (Words tab). Unset fields follow the caption. */
export interface WordLook {
  scale?: number
  color?: Rgb
  effect?: WordEffect
  /** Lift, as a share of the frame height (negative lowers it) */
  raise?: number
  /** Box colour behind the word, or unset for none */
  box?: Rgb
}

export type HighlightRule = 'off' | 'last' | 'longest' | 'numbers' | 'karaoke'

export interface Highlight {
  rule: HighlightRule
  color: Rgb
  scale: number
}

export const DEFAULT_HIGHLIGHT: Highlight = { rule: 'off', color: [1, 0.82, 0.25], scale: 1.15 }

/** How captions leave: as their animation was made, not at all, a simple move, or the way
 *  another animation leaves ('other', see outFrom) */
export type OutMove = 'preset' | 'none' | 'fade' | 'slide' | 'zoom' | 'other'

/** Animation tab settings on top of the chosen preset */
export interface Motion {
  /** 1 = as designed; 2 = twice as fast */
  speed: number
  out: OutMove
  outMs: number
  /** The animation whose way out captions take when out is 'other' */
  outFrom?: string
  /** ms between letters for letter presets, or unset to keep the preset's */
  stepMs?: number
  /** Speed curves for the way in and the way out, or unset to keep each animation's own */
  easeIn?: Bezier
  easeOut?: Bezier
}

export const DEFAULT_MOTION: Motion = { speed: 1, out: 'preset', outMs: 250 }

// ── Layout ─────────────────────────────────────────────────────────────────

/** Text width in em for a font (the app measures with the real font; tests use a stub) */
export type Measure = (text: string, font: string, style: string) => number

/**
 * CSS font size for a Text+ Size, as a share of the frame width. From Resolve stills, the
 * same Size draws letters about 17% wider (relative to frame width) on a 1080×1920 frame
 * than on 1920×1080.
 */
export const fontShare = (aspect: number) => (aspect >= 1 ? 0.5 : 0.5 + (1 - aspect) * 0.2)

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
export const letters = (s: string) => Array.from(graphemes.segment(s), (x) => x.segment)

export function applyCase(text: string, c: TextCase): string {
  if (c === 'upper') return text.toLocaleUpperCase()
  if (c === 'lower') return text.toLocaleLowerCase()
  if (c === 'title') return text.toLocaleLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase())
  return text
}

export interface Laid {
  /** The text Text+ gets: cased, broken into lines, with blank room where bigger words go */
  text: string
  /** Each word's character range in that text (grapheme clusters, from 0), or null for a
   *  bigger word, which is drawn on its own (see solos) */
  ranges: ({ first: number; last: number } | null)[]
  /** Bigger words: their text and where their centre goes, relative to the block centre,
   *  as shares of the frame (x right, y up). The caption keeps blank room for them. */
  solos: ({ text: string; dx: number; dy: number; first: number } | null)[]
  /** Size of the text block, as shares of the frame width and height */
  width: number
  height: number
  lineCount: number
}

/**
 * Breaks a caption into lines and makes room for bigger words. `scales[i]` is word i's
 * size (1 when it has none). Words are counted over the whole caption, across lines.
 *
 * A Follower can only grow letters a little before they overlap each other (word test 2),
 * so a word with its own size is left out of the caption, blank spaces keep its place,
 * and it is drawn as its own Text+ centred on that place. `solo[i]` asks for that for a
 * word at its normal size too (moving or boxed words; see compile).
 */
export function layout(raw: string, look: Look, scales: number[], measure: Measure, aspect: number, solo: boolean[] = []): Laid {
  const share = fontShare(aspect) * look.size
  const em = (s: string) => measure(s, look.font, look.style) * look.tracking
  const text = applyCase(raw, look.textCase)
  const srcLines = look.lines === 'keep' ? text.split('\n') : [text.replace(/\s*\n\s*/g, ' ')]
  const words: { w: string; line: number }[] = []
  srcLines.forEach((l, li) => l.split(/\s+/).filter(Boolean).forEach((w) => words.push({ w, line: li })))
  const space = em(' ')
  const big = (i: number) => solo[i] === true || Math.abs((scales[i] ?? 1) - 1) > 0.02
  // Room a word takes: a bigger word takes whole spaces, so it can be blanked out exactly
  const room = (i: number) => (big(i) ? Math.max(1, Math.round((em(words[i]!.w) * (scales[i] ?? 1)) / space)) : 0)
  const wordEm = words.map((x, i) => (big(i) ? room(i) * space : em(x.w)))
  const lineEm = (a: number, b: number) => wordEm.slice(a, b).reduce((s, x) => s + x, 0) + space * Math.max(0, b - a - 1)
  const maxEm = look.maxWidth / share

  // Line starts (word indexes)
  let starts: number[] = []
  if (look.lines === 'keep') {
    words.forEach((x, i) => { if (i === 0 || x.line !== words[i - 1]!.line) starts.push(i) })
  } else if (look.lines === '1' || words.length < 2 || lineEm(0, words.length) <= maxEm) {
    starts = [0]
  } else if (look.lines === '2') {
    // The split that makes the longer line shortest
    let best = 1
    let bestW = Infinity
    for (let s = 1; s < words.length; s++) {
      const w = Math.max(lineEm(0, s), lineEm(s, words.length))
      if (w < bestW) { bestW = w; best = s }
    }
    starts = [0, best]
  } else {
    starts = [0]
    let from = 0
    for (let i = 1; i < words.length; i++) {
      if (lineEm(from, i + 1) > maxEm) { starts.push(i); from = i }
    }
  }
  if (words.length === 0) starts = [0]

  const lineCount = starts.length
  const lineWidths = starts.map((a, li) => lineEm(a, starts[li + 1] ?? words.length))
  const widest = Math.max(0, ...lineWidths)
  // One line is about 1.2 em tall; in frame-height shares
  const lineH = 1.2 * look.lineSpacing * share * aspect

  const ranges: Laid['ranges'] = []
  const solos: Laid['solos'] = []
  let out = ''
  let pos = 0
  const add = (s: string) => { out += s; pos += letters(s).length }
  for (let li = 0; li < lineCount; li++) {
    const a = starts[li]!
    const b = starts[li + 1] ?? words.length
    if (li > 0) add('\n')
    const lw = lineWidths[li]!
    // Where this line starts, from the block centre, in em
    let x = look.align === 'left' ? -widest / 2 : look.align === 'right' ? widest / 2 - lw : -lw / 2
    const dy = ((lineCount - 1) / 2 - li) * lineH
    for (let i = a; i < b; i++) {
      if (i > a) { add(' '); x += space }
      if (big(i)) {
        const n = room(i)
        solos.push({ text: words[i]!.w, dx: (x + (n * space) / 2) * share, dy, first: pos })
        ranges.push(null)
        add(' '.repeat(n))
        x += n * space
      } else {
        const first = pos
        add(words[i]!.w)
        ranges.push({ first, last: pos - 1 })
        solos.push(null)
        x += em(words[i]!.w)
      }
    }
  }
  return { text: out, ranges, solos, width: widest * share, height: lineCount * lineH, lineCount }
}

/** Margin from the frame edge for edge anchors, as a share of the frame */
const EDGE = 0.07

/** Text+ Center (0–1, y up) of a text block placed by its anchor */
export function centerOf(look: Look, width: number, height: number): readonly [number, number] {
  const col = look.anchor % 3
  const row = Math.floor(look.anchor / 3)
  const x = col === 0 ? EDGE + width / 2 : col === 2 ? 1 - EDGE - width / 2 : 0.5
  // Bottom row matches the old default (0.18) for a one-line caption
  const y = row === 0 ? 1 - 0.1 - height / 2 : row === 2 ? 0.16 + height / 2 : 0.5
  return [x + look.x, y + look.y]
}

/** Which words a highlight rule picks (karaoke is timed, not picked) */
export function autoWords(words: string[], rule: HighlightRule): number[] {
  if (rule === 'last') return words.length ? [words.length - 1] : []
  if (rule === 'longest') {
    const len = words.map((w) => letters(w.replace(/[^\p{L}\p{N}]/gu, '')).length)
    const m = Math.max(0, ...len)
    return m ? [len.indexOf(m)] : []
  }
  if (rule === 'numbers') return words.flatMap((w, i) => (/\p{N}/u.test(w) ? [i] : []))
  return []
}

/**
 * The text with every number counted part of the way up to its value: `t` 0 shows `from`,
 * 1 the number itself. Each number keeps its width in letters (padded with figure spaces)
 * and its thousands commas, so the caption's layout does not move while it counts.
 */
export function countUp(text: string, t: number, from: number): string {
  const p = Math.min(1, Math.max(0, t))
  return text.replace(/\d[\d,]*(\.\d+)?/g, (m) => {
    const target = Number(m.replace(/,/g, ''))
    if (!Number.isFinite(target)) return m
    const dec = m.includes('.') ? m.split('.')[1]!.length : 0
    const v = from + (target - from) * p
    let s = dec ? v.toFixed(dec) : String(Math.round(v))
    if (m.includes(',')) s = Number(s).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    return s.length >= m.length ? s.slice(-m.length) : ' '.repeat(m.length - s.length) + s
  })
}

/** An outline with the settings older saved looks do not have */
export const outlineOf = (o: Partial<Outline> | undefined): Outline => ({ ...DEFAULT_LOOK.outline, ...o })
