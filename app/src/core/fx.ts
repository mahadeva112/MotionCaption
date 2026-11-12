import { EASE, type Bezier } from './anim.ts'
import type { Rgb } from './look.ts'
import { bezierAt } from './sample.ts'

// Advanced effects: drawn by the app only (Finished clips). Text+ has no node for them,
// so a caption sent as editable Text+ shows the preset's plain tracks instead.
//
// The model follows an After Effects text animator: an effect says how far each unit
// (letter, word, line or the whole caption) sits from its resting look, and a stagger says
// when each unit starts moving. On top of that a caption may have a mask, a light sweep
// and a warp. Everything here is plain numbers, so the preview and the drawn frames get
// the same values at the same ms.

export type FxUnit = 'letter' | 'word' | 'line' | 'whole'
export type FxOrder = 'ltr' | 'rtl' | 'center' | 'edges' | 'random'
export type RevealFrom = 'bottom' | 'top' | 'left' | 'right'

/** A unit's look away from rest. Anything left out is at rest. Lengths are in em. */
export interface FxState {
  /** Multiplies the unit's opacity (rest 1) */
  opacity?: number
  /** Shift right / down (rest 0) */
  x?: number
  y?: number
  /** Multiplies the size (rest 1) */
  scale?: number
  scaleX?: number
  scaleY?: number
  /** Degrees clockwise (rest 0) */
  rotate?: number
  skewX?: number
  /** Blur radius (rest 0) */
  blur?: number
  /** Glow radius in the accent colour (rest 0) */
  glow?: number
  /** 0–1 mix of the fill toward the accent colour (rest 0) */
  tint?: number
  /** 0–1 share of the unit shown, cut from the phase's revealFrom side (rest 1) */
  reveal?: number
}

export const REST: Required<FxState> = {
  opacity: 1, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, skewX: 0, blur: 0, glow: 0, tint: 0, reveal: 1,
}

/** One way in or out: every unit goes between `state` and rest, one after another */
export interface FxPhase {
  unit: FxUnit
  order: FxOrder
  /** ms between one unit starting and the next */
  stepMs: number
  /** ms each unit takes */
  ms: number
  /** ms before the first unit starts */
  delayMs?: number
  ease: Bezier
  /** Way in: where each unit starts. Way out: where it ends. */
  state: FxState
  revealFrom?: RevealFrom
  /** Each unit moves inside its own window, cut at the bottom of its line: it rises out of
   *  (or sinks into) an edge instead of floating over the text below */
  masked?: boolean
  /** Hindi, Marathi, Bangla and Punjabi letters hang from one top line (shirorekha). Pulled
   *  apart they read as broken, so a letter effect runs word by word on them unless this is set. */
  keepLetters?: boolean
}

/** Keeps moving while the caption is up: each value swings ± its amount around rest */
export interface FxLoop {
  unit: FxUnit
  periodMs: number
  /** ms each unit runs behind the one before it, which makes a wave */
  stepMs: number
  /** Swing amounts; scale is ± around 1 */
  amp: Pick<FxState, 'x' | 'y' | 'rotate' | 'scale' | 'glow' | 'tint' | 'blur'>
  keepLetters?: boolean
}

/** The whole caption shown through a moving mask */
export interface FxMask {
  /** blinds: thin horizontal strips that each open from the top */
  kind: 'wipe' | 'iris' | 'split' | 'blinds'
  /** wipe only: the direction it opens, CSS degrees (90 = left to right) */
  angle?: number
  /** Share of the mask's travel that is a soft edge (0 hard) */
  soft: number
  inMs: number
  /** Closes the same way at the end; 0 or left out: stays open */
  outMs?: number
  ease?: Bezier
  /** blinds only: strip height, em */
  bandEm?: number
  /** A bright line riding the wipe's edge (wipe left to right and split only) */
  edge?: { widthEm: number; color?: Rgb }
}

/** A solid bar that sweeps across the text and uncovers it as it leaves: it grows over the
 *  text in the first half, then shrinks away toward the far side */
export interface FxBar {
  delayMs: number
  ms: number
  from: 'left' | 'right'
  /** Left out: the accent */
  color?: Rgb
}

/** An outlined box around the text that opens: first a line grows from the centre, then it
 *  opens up and down into the box */
export interface FxBox {
  delayMs: number
  ms: number
  /** Border width, em */
  widthEm: number
  /** Left out: the accent */
  color?: Rgb
  /** Box fill opacity (0: outline only) */
  fill?: number
}

/** A band of light passing over the letters */
export interface FxSweep {
  /** When the first pass starts, ms from the caption's start */
  delayMs: number
  /** ms one pass takes */
  ms: number
  /** ms from one pass starting to the next; left out: one pass only */
  everyMs?: number
  /** Band width, share of the caption's width */
  width: number
  /** CSS degrees the band travels toward (90 = left to right) */
  angle: number
  /** 0–1 */
  strength: number
  /** 'headline': only along each line's top line (shirorekha), not over the whole letters */
  band?: 'headline'
  /** The light stays where the band has passed (one pass): a colour rising through the letters */
  hold?: boolean
}

/** Small things moving with the text: gold dust gathering into it, or petals drifting past */
export interface FxParticles {
  kind: 'dust' | 'petal'
  count: number
  delayMs: number
  /** dust: ms one grain takes to fly in; petal: ms one petal takes to cross */
  ms: number
  sizeEm: number
  /** dust: how far out the grains start, em */
  spreadEm?: number
  /** Left out: the accent */
  color?: Rgb
}

/** The letters coming out of (and going back into) soft noise, like mist clearing */
export interface FxDissolve {
  /** Noise size, em */
  sizeEm: number
  /** 0–1 how soft the noise's edge is */
  soft: number
  inMs: number
  outMs?: number
}

/** A mirrored copy of the text under it, as on water */
export interface FxReflect {
  /** Opacity at the top of the reflection */
  opacity: number
  /** Share of the reflection's height before it fades out */
  fade: number
  /** Ripple: most bend, em (0: still water) */
  waveEm: number
  /** Ripple size, em */
  sizeEm: number
}

/** Each line's top line (shirorekha) drawn from left to right, then the letters hang down from it */
export interface FxHeadline {
  delayMs: number
  /** ms between one line starting and the next */
  stepMs: number
  /** ms the top line takes to draw */
  drawMs: number
  /** ms the letters take to come down from it; they start when the line is 60 % drawn */
  dropMs: number
}

/** Words lit with a fill from left to right as they are spoken (each word's share of the time
 *  follows its letters), in `color` or the accent */
export interface FxFill {
  color?: Rgb
}

/** The word being spoken stays sharp; the others sit at `state` */
export interface FxFocus {
  state: FxState
  /** ms a word takes to come into focus and to leave it */
  fadeMs: number
}

/** The caption's key word (its longest) goes from rest to `state` and stays there */
export interface FxEmphasis {
  delayMs: number
  ms: number
  ease?: Bezier
  state: FxState
}

/** A highlighter stroke drawn behind words or lines, from left to right */
export interface FxMarker {
  unit: 'word' | 'line'
  /** Every unit one after another, or only the key word */
  pick: 'all' | 'key'
  order: FxOrder
  delayMs: number
  stepMs: number
  ms: number
  opacity: number
  /** Left out: the accent */
  color?: Rgb
  /** A thin underline under each line instead of a highlighter stroke (line unit) */
  thin?: boolean
}

/** The letters bent by noise: big at first and settling (in), or always a little (haze) */
export interface FxWarp {
  /** Noise size in em: bigger is broader waves */
  sizeEm: number
  /** Most bend, em */
  amountEm: number
  /** ms the bend takes to settle to `restEm` after the start; 0: it stays at amountEm */
  inMs: number
  /** Bend that stays while the caption is up, em */
  restEm?: number
  /** ms the bend takes to grow again before the end; 0 or left out: none */
  outMs?: number
  /** em per second the noise drifts sideways, back and forth */
  drift?: number
  /** Horizontal-only waves (true) or bend in every direction */
  wave?: boolean
}

export interface Fx {
  in?: FxPhase
  out?: FxPhase
  loop?: FxLoop
  mask?: FxMask
  sweep?: FxSweep
  warp?: FxWarp
  headline?: FxHeadline
  fill?: FxFill
  focus?: FxFocus
  emphasis?: FxEmphasis
  marker?: FxMarker
  particles?: FxParticles
  dissolve?: FxDissolve
  reflect?: FxReflect
  bar?: FxBar
  box?: FxBox
  /** Colour for glow, tint, fill and marker; left out: warm gold */
  accent?: Rgb
}

/** An effect fitted to one caption: its units chosen for the script, its times for the caption's length */
export interface CompiledFx extends Fx {
  accent: Rgb
  /** Seeds the random order and the warp's noise, so every draw of a caption is the same */
  seed: number
}

export const GOLD: Rgb = [1, 0.8, 0.38]

// ── Text into units ─────────────────────────────────────────────────────────

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Scripts whose letters hang from a top line: Devanagari, Bangla, Gurmukhi */
const HEADLINE = /[ऀ-੿]/

export const hasHeadline = (text: string) => HEADLINE.test(text)

/** The unit an effect really runs on for this text */
export function unitFor(unit: FxUnit, text: string, keepLetters = false): FxUnit {
  return unit === 'letter' && !keepLetters && hasHeadline(text) ? 'word' : unit
}

export interface Glyph {
  ch: string
  /** Index among letters (no spaces or line breaks); -1 for those */
  letter: number
  /** Index of the word it is in; -1 for spaces and line breaks */
  word: number
  line: number
}

export interface Units {
  glyphs: Glyph[]
  letters: number
  words: number
  lines: number
}

/** The caption's text by grapheme (a conjunct or a vowel sign stays with its letter), with
 *  each one's letter, word and line */
export function splitUnits(text: string): Units {
  const glyphs: Glyph[] = []
  let letter = 0
  let word = 0
  let line = 0
  let inWord = false
  for (const { segment: ch } of graphemes.segment(text)) {
    if (ch === '\n' || ch === '\r\n') {
      if (inWord) word++
      inWord = false
      glyphs.push({ ch, letter: -1, word: -1, line })
      line++
    } else if (/^\s+$/.test(ch)) {
      if (inWord) word++
      inWord = false
      glyphs.push({ ch, letter: -1, word: -1, line })
    } else {
      inWord = true
      glyphs.push({ ch, letter: letter++, word, line })
    }
  }
  return { glyphs, letters: letter, words: word + (inWord ? 1 : 0), lines: line + 1 }
}

export const countOf = (u: Units, unit: FxUnit) =>
  unit === 'letter' ? u.letters : unit === 'word' ? u.words : unit === 'line' ? u.lines : 1

// ── Timing ─────────────────────────────────────────────────────────────────

/** A small fixed-seed random number source (mulberry32), the same on every computer */
export function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** How many steps late each of n units starts, in the given order */
export function delays(n: number, order: FxOrder, seed: number): number[] {
  const mid = (n - 1) / 2
  switch (order) {
    case 'ltr': return Array.from({ length: n }, (_, i) => i)
    case 'rtl': return Array.from({ length: n }, (_, i) => n - 1 - i)
    case 'center': return Array.from({ length: n }, (_, i) => Math.abs(i - mid))
    case 'edges': return Array.from({ length: n }, (_, i) => mid - Math.abs(i - mid))
    case 'random': {
      const rnd = random(seed)
      const order = Array.from({ length: n }, (_, i) => i)
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1))
        ;[order[i], order[j]] = [order[j]!, order[i]!]
      }
      const out = new Array<number>(n)
      order.forEach((unit, k) => { out[unit] = k })
      return out
    }
  }
}

/** ms from a phase's first unit starting to its last one finishing */
export function phaseLength(p: FxPhase, n: number, seed = 0): number {
  if (n <= 0) return 0
  return (p.delayMs ?? 0) + Math.max(...delays(n, p.order, seed)) * p.stepMs + p.ms
}

/** Share of the caption that the way in and the way out may take together */
const MAX_SHARE = 0.9
/** Share of the caption by which the last unit must have finished arriving */
const IN_DONE_BY = 0.75

const scalePhase = (p: FxPhase, f: number): FxPhase => ({ ...p, stepMs: p.stepMs * f, ms: p.ms * f, ...(p.delayMs ? { delayMs: p.delayMs * f } : {}) })

/**
 * Fit an effect to one caption: the units its script allows, times divided by the speed,
 * and squeezed when the caption is too short (the way in done by 75 %, in and out never
 * overlapping), the same rule Text+ presets follow.
 */
export function compileFx(fx: Fx, text: string, durMs: number, opts: { speed?: number; keepOut?: boolean; seed?: number } = {}): CompiledFx {
  const speed = opts.speed ?? 1
  const seed = opts.seed ?? 1
  const units = splitUnits(text)
  const fit = (p: FxPhase | undefined): FxPhase | undefined => p && scalePhase({ ...p, unit: unitFor(p.unit, text, p.keepLetters) }, 1 / speed)
  let inP = fit(fx.in)
  let outP = opts.keepOut === false ? undefined : fit(fx.out)
  const inLen = inP ? phaseLength(inP, countOf(units, inP.unit), seed) : 0
  const outLen = outP ? phaseLength(outP, countOf(units, outP.unit), seed + 1) : 0
  let f = 1
  if (inLen + outLen > durMs * MAX_SHARE) f = (durMs * MAX_SHARE) / (inLen + outLen)
  if (inLen * f > durMs * IN_DONE_BY) f = (durMs * IN_DONE_BY) / inLen
  if (f < 1) {
    inP = inP && scalePhase(inP, f)
    outP = outP && scalePhase(outP, f)
  }
  const loop = fx.loop && { ...fx.loop, unit: unitFor(fx.loop.unit, text, fx.loop.keepLetters), periodMs: fx.loop.periodMs / speed, stepMs: fx.loop.stepMs / speed }
  const mask = fx.mask && {
    ...fx.mask, inMs: Math.min(fx.mask.inMs / speed, durMs * IN_DONE_BY),
    ...(fx.mask.outMs && opts.keepOut !== false ? { outMs: Math.min(fx.mask.outMs / speed, durMs * (1 - IN_DONE_BY)) } : { outMs: 0 }),
  }
  const sweep = fx.sweep && { ...fx.sweep, delayMs: fx.sweep.delayMs / speed, ms: fx.sweep.ms / speed, ...(fx.sweep.everyMs ? { everyMs: fx.sweep.everyMs / speed } : {}) }
  const warp = fx.warp && {
    ...fx.warp, inMs: Math.min(fx.warp.inMs / speed, durMs * IN_DONE_BY),
    ...(fx.warp.outMs && opts.keepOut !== false ? { outMs: Math.min(fx.warp.outMs / speed, durMs * (1 - IN_DONE_BY)) } : { outMs: 0 }),
  }
  // The top lines are drawn and the letters down by 75 % of the caption, like any way in
  let headline: FxHeadline | undefined
  if (fx.headline) {
    const h = fx.headline
    const len = (h.delayMs + (units.lines - 1) * h.stepMs + h.drawMs * HEAD_DROP_AT + h.dropMs) / speed
    const g = len > durMs * IN_DONE_BY ? (durMs * IN_DONE_BY) / len : 1
    const k = g / speed
    headline = { delayMs: h.delayMs * k, stepMs: h.stepMs * k, drawMs: h.drawMs * k, dropMs: h.dropMs * k }
  }
  const marker = fx.marker && { ...fx.marker, delayMs: fx.marker.delayMs / speed, stepMs: fx.marker.stepMs / speed, ms: fx.marker.ms / speed }
  const emphasis = fx.emphasis && { ...fx.emphasis, delayMs: fx.emphasis.delayMs / speed, ms: fx.emphasis.ms / speed }
  const focus = fx.focus && { ...fx.focus, fadeMs: fx.focus.fadeMs / speed }
  const bar = fx.bar && { ...fx.bar, delayMs: fx.bar.delayMs / speed, ms: Math.min(fx.bar.ms / speed, durMs * IN_DONE_BY) }
  const box = fx.box && { ...fx.box, delayMs: fx.box.delayMs / speed, ms: Math.min(fx.box.ms / speed, durMs * IN_DONE_BY) }
  const particles = fx.particles && { ...fx.particles, delayMs: fx.particles.delayMs / speed, ms: fx.particles.ms / speed }
  const dissolve = fx.dissolve && {
    ...fx.dissolve, inMs: Math.min(fx.dissolve.inMs / speed, durMs * IN_DONE_BY),
    ...(fx.dissolve.outMs && opts.keepOut !== false ? { outMs: Math.min(fx.dissolve.outMs / speed, durMs * (1 - IN_DONE_BY)) } : { outMs: 0 }),
  }
  return {
    ...(inP ? { in: inP } : {}), ...(outP ? { out: outP } : {}), ...(loop ? { loop } : {}),
    ...(mask ? { mask } : {}), ...(sweep ? { sweep } : {}), ...(warp ? { warp } : {}),
    ...(headline ? { headline } : {}), ...(fx.fill ? { fill: fx.fill } : {}), ...(focus ? { focus } : {}),
    ...(emphasis ? { emphasis } : {}), ...(marker ? { marker } : {}),
    ...(bar ? { bar } : {}), ...(box ? { box } : {}),
    ...(particles ? { particles } : {}), ...(dissolve ? { dissolve } : {}), ...(fx.reflect ? { reflect: fx.reflect } : {}),
    accent: fx.accent ?? GOLD, seed,
  }
}

/** Share of the top line drawn when the letters start to come down from it */
const HEAD_DROP_AT = 0.6

/** The word read as the key word: the longest (the first of equals) */
export function keyWord(u: Units): number {
  const len = new Array<number>(u.words).fill(0)
  for (const g of u.glyphs) if (g.word >= 0) len[g.word]!++
  let best = 0
  len.forEach((l, i) => { if (l > len[best]!) best = i })
  return best
}

/**
 * When each word is spoken: words share the time between the way in and the way out by
 * their letters (as the Look tab's karaoke does). Returns words + 1 times, the last being
 * when the last word ends.
 */
export function spokenTimes(fx: CompiledFx, u: Units, durMs: number): number[] {
  const inLen = fx.in ? phaseLength(fx.in, countOf(u, fx.in.unit), fx.seed) : 0
  const outLen = fx.out ? phaseLength(fx.out, countOf(u, fx.out.unit), fx.seed + 1) : 0
  const start = Math.min(inLen, durMs * 0.3)
  const end = Math.max(start, durMs - outLen - Math.min(200, durMs * 0.08))
  const len = new Array<number>(u.words).fill(0)
  for (const g of u.glyphs) if (g.word >= 0) len[g.word]!++
  const total = len.reduce((s, x) => s + x, 0) || 1
  const out = [start]
  let acc = 0
  for (const l of len) { acc += l; out.push(start + ((end - start) * acc) / total) }
  return out
}

// ── Sampling ───────────────────────────────────────────────────────────────

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** An ease at x, exact at both ends (the curve solver is only close there) */
const ease = (e: Bezier, x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : bezierAt(e, x))

/** state → rest at p = 1 (way in), rest → state at p = 1 (way out) */
function between(state: FxState, p: number, out: boolean): FxState {
  const k = out ? p : 1 - p // how far from rest
  const s: FxState = {}
  for (const key of Object.keys(state) as (keyof FxState)[]) {
    const v = state[key]!
    s[key] = REST[key] + (v - REST[key]) * k
  }
  return s
}

/** Put b on top of a: sizes and opacity multiply, the rest add, reveal takes the smaller */
export function combine(a: FxState, b: FxState): FxState {
  const s: FxState = { ...a }
  for (const key of Object.keys(b) as (keyof FxState)[]) {
    const v = b[key]!
    const have = s[key]
    if (have === undefined) s[key] = v
    else if (key === 'opacity' || key === 'scale' || key === 'scaleX' || key === 'scaleY') s[key] = have * v
    else if (key === 'reveal') s[key] = Math.min(have, v)
    else s[key] = have + v
  }
  return s
}

export interface FxFrame {
  /** Each level's state per unit; a level no part of the effect uses is left out */
  letter?: FxState[]
  word?: FxState[]
  line?: FxState[]
  whole?: FxState
  /** reveal sides per level, from the phase that set them */
  revealFrom: Partial<Record<FxUnit, RevealFrom>>
  /** 0–1 how open the mask is */
  mask?: number
  /** Where the sweep band's centre is, −0.5…1.5 across the caption; undefined: no band now */
  sweep?: number
  /** Bend now, em */
  warp?: number
  /** Noise drift now, em */
  drift?: number
  /** Per line: 0–1 how far its top line is drawn, and how far the letters have come down */
  headline?: { draw: number; drop: number }[]
  /** Per word: 0–1 how far its fill has gone */
  fill?: number[]
  /** Per word or line (the marker's unit): 0–1 how far its stroke is drawn */
  marker?: number[]
  /** Where each grain or petal is now: left/top as shares of the text's box, then em on top */
  particles?: Particle[]
  /** 0–1 how much of the noise lets the letters through */
  dissolve?: number
  /** Ripple drift now, em */
  ripple?: number
  /** Levels whose units move inside their own window */
  masked: Partial<Record<FxUnit, boolean>>
  /** The bar now: how much of the text's width it covers and which side it holds to */
  bar?: { scale: number; origin: 'left' | 'right' }
  /** The box now: its width and height as shares of the full box */
  box?: { sx: number; sy: number }
}

export interface Particle {
  left: number
  top: number
  dx: number
  dy: number
  size: number
  rotate: number
  opacity: number
}

function phaseStates(p: FxPhase, n: number, ms: number, from: number, out: boolean, seed: number): FxState[] {
  const d = delays(n, p.order, seed)
  const startMs = from + (p.delayMs ?? 0)
  return d.map((k) => {
    const raw = p.ms <= 0 ? (ms >= startMs + k * p.stepMs ? 1 : 0) : (ms - startMs - k * p.stepMs) / p.ms
    return between(p.state, ease(p.ease, raw), out)
  })
}

/** Every unit's look at ms into a caption of durMs */
export function fxAt(fx: CompiledFx, units: Units, ms: number, durMs: number): FxFrame {
  const frame: FxFrame = { revealFrom: {}, masked: {} }
  const add = (unit: FxUnit, states: FxState[]) => {
    if (unit === 'whole') { frame.whole = combine(frame.whole ?? {}, states[0] ?? {}); return }
    const have = frame[unit]
    frame[unit] = have ? have.map((s, i) => combine(s, states[i] ?? {})) : states
  }
  if (fx.in) {
    const n = countOf(units, fx.in.unit)
    add(fx.in.unit, phaseStates(fx.in, n, ms, 0, false, fx.seed))
    if (fx.in.revealFrom) frame.revealFrom[fx.in.unit] = fx.in.revealFrom
    if (fx.in.masked) frame.masked[fx.in.unit] = true
  }
  if (fx.out) {
    const n = countOf(units, fx.out.unit)
    const start = durMs - phaseLength(fx.out, n, fx.seed + 1)
    add(fx.out.unit, phaseStates(fx.out, n, ms, start, true, fx.seed + 1))
    if (fx.out.revealFrom) frame.revealFrom[fx.out.unit] ??= fx.out.revealFrom
    if (fx.out.masked) frame.masked[fx.out.unit] = true
  }
  if (fx.loop) {
    const L = fx.loop
    const n = countOf(units, L.unit)
    const d = delays(n, 'ltr', fx.seed)
    add(L.unit, d.map((k) => {
      const w = Math.sin((2 * Math.PI * (ms - k * L.stepMs)) / L.periodMs)
      const s: FxState = {}
      if (L.amp.x) s.x = L.amp.x * w
      if (L.amp.y) s.y = L.amp.y * w
      if (L.amp.rotate) s.rotate = L.amp.rotate * w
      if (L.amp.scale) s.scale = 1 + L.amp.scale * w
      // Glow, tint and blur cannot go below rest: they swing between 0 and their amount
      if (L.amp.glow) s.glow = (L.amp.glow * (1 + w)) / 2
      if (L.amp.tint) s.tint = (L.amp.tint * (1 + w)) / 2
      if (L.amp.blur) s.blur = (L.amp.blur * (1 + w)) / 2
      return s
    }))
  }
  if (fx.mask) {
    const m = fx.mask
    const e = m.ease ?? EASE.out
    let open = m.inMs > 0 ? ease(e, ms / m.inMs) : 1
    if (m.outMs) open = Math.min(open, ease(e, (durMs - ms) / m.outMs))
    frame.mask = open
  }
  if (fx.sweep) {
    const s = fx.sweep
    let t = ms - s.delayMs
    if (t >= 0 && s.everyMs) t %= s.everyMs
    if (t >= 0 && t <= s.ms) frame.sweep = -0.5 + 2 * ease(EASE.inOut, t / s.ms)
    // Held: once past, the light stays everywhere
    else if (s.hold && t > s.ms) frame.sweep = 1.5
  }
  if (fx.warp) {
    const w = fx.warp
    const rest = w.restEm ?? 0
    // No settling: the bend is there the whole time (haze)
    let bend = w.inMs > 0 ? rest + (w.amountEm - rest) * (1 - ease(EASE.inOut, ms / w.inMs)) : w.amountEm
    if (w.outMs) bend = Math.max(bend, rest + (w.amountEm - rest) * ease(EASE.in, 1 - (durMs - ms) / w.outMs))
    frame.warp = bend
    if (w.drift) frame.drift = Math.sin((2 * Math.PI * ms) / 4000) * w.drift * 0.6
  }
  if (fx.headline) {
    const h = fx.headline
    frame.headline = Array.from({ length: units.lines }, (_, k) => {
      const t = ms - h.delayMs - k * h.stepMs
      return { draw: ease(EASE.inOut, t / h.drawMs), drop: ease(EASE.out, (t - h.drawMs * HEAD_DROP_AT) / h.dropMs) }
    })
  }
  if (fx.fill || fx.focus) {
    const at = spokenTimes(fx, units, durMs)
    if (fx.fill) frame.fill = Array.from({ length: units.words }, (_, i) => clamp01((ms - at[i]!) / Math.max(1, at[i + 1]! - at[i]!)))
    if (fx.focus) {
      const F = fx.focus
      add('word', Array.from({ length: units.words }, (_, i) => {
        const away = Math.max(at[i]! - ms, ms - at[i + 1]!, 0)
        return between(F.state, ease(EASE.inOut, 1 - away / Math.max(1, F.fadeMs)), false)
      }))
    }
  }
  if (fx.emphasis) {
    const E = fx.emphasis
    const key = keyWord(units)
    const p = ease(E.ease ?? EASE.out, (ms - E.delayMs) / Math.max(1, E.ms))
    add('word', Array.from({ length: units.words }, (_, i) => (i === key ? between(E.state, p, true) : {})))
  }
  if (fx.marker) {
    const M = fx.marker
    const key = keyWord(units)
    const n = M.unit === 'line' ? units.lines : units.words
    const d = delays(n, M.order, fx.seed)
    frame.marker = d.map((di, i) => {
      if (M.pick === 'key' && M.unit === 'word' && i !== key) return 0
      const step = M.pick === 'key' ? 0 : di
      return ease(EASE.inOut, (ms - M.delayMs - step * M.stepMs) / Math.max(1, M.ms))
    })
  }
  if (fx.particles) frame.particles = particlesAt(fx.particles, fx.seed, ms)
  if (fx.dissolve) {
    const D = fx.dissolve
    let open = D.inMs > 0 ? ease(EASE.inOut, ms / D.inMs) : 1
    if (D.outMs) open = Math.min(open, ease(EASE.inOut, (durMs - ms) / D.outMs))
    frame.dissolve = open
  }
  if (fx.bar) {
    const B = fx.bar
    const t = (ms - B.delayMs) / Math.max(1, B.ms)
    const far = B.from === 'left' ? 'right' : 'left'
    if (t > 0 && t < 1) frame.bar = t < 0.5 ? { scale: ease(EASE.inOut, t * 2), origin: B.from } : { scale: 1 - ease(EASE.inOut, t * 2 - 1), origin: far }
  }
  if (fx.box) {
    const X = fx.box
    const t = (ms - X.delayMs) / Math.max(1, X.ms)
    if (t > 0) frame.box = { sx: ease(EASE.inOut, t / 0.45), sy: 0.04 + 0.96 * ease(EASE.inOut, (t - 0.4) / 0.6) }
  }
  if (fx.reflect) frame.ripple = Math.sin((2 * Math.PI * ms) / 3000) * 0.4
  return frame
}

/** Every grain or petal at ms: the same for the same seed, so each frame is drawn alike */
export function particlesAt(P: FxParticles, seed: number, ms: number): Particle[] {
  const rnd = random(seed * 7919 + (P.kind === 'dust' ? 1 : 2))
  const out: Particle[] = []
  for (let i = 0; i < P.count; i++) {
    const [a, b, c, d, e] = [rnd(), rnd(), rnd(), rnd(), rnd()]
    const size = P.sizeEm * (0.55 + 0.45 * c)
    if (P.kind === 'dust') {
      // From a point out around the text to a point on it, landing one after another
      const start = P.delayMs + i * ((P.ms * 0.5) / Math.max(1, P.count))
      const p = clamp01((ms - start) / P.ms)
      const k = ease(EASE.out, p)
      const angle = d * 2 * Math.PI
      const far = (P.spreadEm ?? 2) * (0.5 + 0.5 * e)
      const op = p <= 0 ? 0 : p < 0.2 ? p / 0.2 : p < 0.8 ? 1 : (1 - p) / 0.2
      out.push({ left: a, top: b, dx: Math.cos(angle) * far * (1 - k), dy: Math.sin(angle) * far * (1 - k), size, rotate: 0, opacity: op })
    } else {
      // Drifting left to right and falling a little, each on its own clock and sway
      const period = P.ms * (0.8 + 0.4 * c)
      const t = (((ms - P.delayMs) / period + a) % 1 + 1) % 1
      const on = clamp01((ms - P.delayMs) / 600)
      out.push({
        left: -0.15 + 1.3 * t, top: b,
        dx: 0, dy: Math.sin(t * Math.PI * 3 + d * 6) * 0.5 + (t - 0.5) * 1.4,
        size, rotate: (e < 0.5 ? -1 : 1) * 360 * t + d * 180,
        opacity: on * Math.min(1, Math.sin(Math.PI * t) * 2.5),
      })
    }
  }
  return out
}
