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
  ease: Bezier
  /** Way in: where each unit starts. Way out: where it ends. */
  state: FxState
  revealFrom?: RevealFrom
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
  kind: 'wipe' | 'iris' | 'split'
  /** wipe only: the direction it opens, CSS degrees (90 = left to right) */
  angle?: number
  /** Share of the mask's travel that is a soft edge (0 hard) */
  soft: number
  inMs: number
  /** Closes the same way at the end; 0 or left out: stays open */
  outMs?: number
  ease?: Bezier
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
  /** Colour for glow and tint; left out: warm gold */
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
  return Math.max(...delays(n, p.order, seed)) * p.stepMs + p.ms
}

/** Share of the caption that the way in and the way out may take together */
const MAX_SHARE = 0.9
/** Share of the caption by which the last unit must have finished arriving */
const IN_DONE_BY = 0.75

const scalePhase = (p: FxPhase, f: number): FxPhase => ({ ...p, stepMs: p.stepMs * f, ms: p.ms * f })

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
  return {
    ...(inP ? { in: inP } : {}), ...(outP ? { out: outP } : {}), ...(loop ? { loop } : {}),
    ...(mask ? { mask } : {}), ...(sweep ? { sweep } : {}), ...(warp ? { warp } : {}),
    accent: fx.accent ?? GOLD, seed,
  }
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
}

function phaseStates(p: FxPhase, n: number, ms: number, startMs: number, out: boolean, seed: number): FxState[] {
  const d = delays(n, p.order, seed)
  return d.map((k) => {
    const raw = p.ms <= 0 ? (ms >= startMs + k * p.stepMs ? 1 : 0) : (ms - startMs - k * p.stepMs) / p.ms
    return between(p.state, ease(p.ease, raw), out)
  })
}

/** Every unit's look at ms into a caption of durMs */
export function fxAt(fx: CompiledFx, units: Units, ms: number, durMs: number): FxFrame {
  const frame: FxFrame = { revealFrom: {} }
  const add = (unit: FxUnit, states: FxState[]) => {
    if (unit === 'whole') { frame.whole = combine(frame.whole ?? {}, states[0] ?? {}); return }
    const have = frame[unit]
    frame[unit] = have ? have.map((s, i) => combine(s, states[i] ?? {})) : states
  }
  if (fx.in) {
    const n = countOf(units, fx.in.unit)
    add(fx.in.unit, phaseStates(fx.in, n, ms, 0, false, fx.seed))
    if (fx.in.revealFrom) frame.revealFrom[fx.in.unit] = fx.in.revealFrom
  }
  if (fx.out) {
    const n = countOf(units, fx.out.unit)
    const start = durMs - phaseLength(fx.out, n, fx.seed + 1)
    add(fx.out.unit, phaseStates(fx.out, n, ms, start, true, fx.seed + 1))
    if (fx.out.revealFrom) frame.revealFrom[fx.out.unit] ??= fx.out.revealFrom
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
  return frame
}
