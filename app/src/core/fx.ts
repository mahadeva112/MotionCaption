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
  /** Every other unit comes from the mirrored side (x, rotate and skew turned around) */
  alternate?: boolean
  /** Each unit takes its own share of x, y and rotate, a fixed random amount between ± the state's */
  scatter?: boolean
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
  /** Short beats out from rest instead of an even swing to both sides */
  pulse?: boolean
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
  /** Glow around the lit letters, em */
  glow?: number
  /** Left out: the accent */
  color?: Rgb
}

/** Units lighting up like a neon tube: flickering on and off before they hold */
export interface FxFlicker {
  unit: FxUnit
  /** ms one unit flickers before it holds */
  ms: number
  /** ms between one unit starting and the next */
  stepMs: number
  /** ms one flicker (on or off) lasts */
  tickMs: number
  /** Opacity while off (an unlit tube) */
  low: number
  /** Glow while on, em */
  glow: number
}

/** A soft light behind the text: a glow that grows (or a ring that spreads and fades) */
export interface FxBacklight {
  delayMs: number
  ms: number
  /** Most opacity of the light */
  opacity: number
  /** A ring spreading out and fading, instead of a glow that stays */
  ring?: boolean
  /** Left out: the accent */
  color?: Rgb
}

/** A lens flare crossing the text from left to right */
export interface FxFlare {
  delayMs: number
  ms: number
  /** Size of the bright core, em */
  sizeEm: number
  /** Left out: the accent */
  color?: Rgb
}

/** Small things moving with the text: gold dust gathering into it, or petals drifting past */
export interface FxParticles {
  /** spark: thrown off a point that moves along the text over `ms` (a sparkler writing);
   *  twinkle: small stars lighting and going out over the text, the whole time */
  kind: 'dust' | 'petal' | 'spark' | 'twinkle'
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
  /** Where the other words go meanwhile */
  others?: FxState
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
  /** A box behind the whole word, instead of a highlighter stroke */
  full?: boolean
  /** On each word only while it is spoken (words), moving from word to word */
  spoken?: boolean
  /** A bar over the text that pulls away to the right and uncovers it (redaction) */
  cover?: boolean
}

/** Letters shown as random letters of their own script before they settle into the text (in),
 *  or breaking up into them at the end (out) */
export interface FxScramble {
  /** Letters settle one by one, or a word's letters together */
  unit: 'letter' | 'word'
  order: FxOrder
  delayMs: number
  stepMs: number
  /** ms a unit keeps changing: before it settles (in), or from its start to the end (out) */
  ms: number
  /** ms between changes */
  tickMs: number
  dir: 'in' | 'out'
  /** in: a unit is hidden until its turn starts (typed in), not scrambled from the start */
  blankBefore?: boolean
  /** Each change flips like a flap on a board */
  flap?: boolean
}

/** A blinking cursor after the last letter typed by the way in */
export interface FxCursor {
  blinkMs: number
  widthEm: number
  /** Left out: the accent */
  color?: Rgb
}

/** The whole caption shaken as each unit of the way in lands */
export interface FxImpact {
  /** Most shake, em */
  amountEm: number
  /** ms a shake takes to die out */
  ms: number
}

/** The letters' outline, drawn by itself, and how their fill comes in after it */
export interface FxStroke {
  widthEm: number
  /** Left out: the accent */
  color?: Rgb
  delayMs: number
  /** ms the outline takes to draw itself from left to right; 0: there at once */
  drawMs: number
  /** Glow around the outline, em */
  glow?: number
  /** How the letters' own fill comes in: fade, wipe (left to right), rise (from the bottom),
   *  none (outline only) */
  fill: { mode: 'fade' | 'wipe' | 'rise' | 'none'; delayMs: number; ms: number; opacity?: number }
  /** The outline fades out once the fill is in */
  fadeOut?: boolean
  /** Dashes running along the outline: dash length em, and em per second */
  dash?: { sizeEm: number; speed: number }
  /** A hand-drawn shake, em */
  wobble?: number
}

/** Outlines of the text spreading out from it and fading, again and again */
export interface FxRings {
  count: number
  periodMs: number
  /** How big a ring gets before it is gone */
  scaleTo: number
  widthEm: number
  color?: Rgb
}

/** Outline copies trailing behind the text, each a step further away */
export interface FxEcho {
  count: number
  dxEm: number
  dyEm: number
  widthEm: number
  /** ms the copies take to slide out to their places */
  inMs: number
  color?: Rgb
}

/** One word at a time in the same place, each in turn as it is spoken: in from below, out above */
export interface FxSwap {
  /** ms a word takes to come in or go out */
  ms: number
  /** How far it travels, em */
  travelEm: number
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
  flicker?: FxFlicker
  backlight?: FxBacklight
  /** A look the whole caption keeps the whole time, e.g. a gold tint */
  base?: FxState
  impact?: FxImpact
  swap?: FxSwap
  stroke?: FxStroke
  rings?: FxRings
  echo?: FxEcho
  scramble?: FxScramble
  cursor?: FxCursor
  flare?: FxFlare
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
  const flicker = fx.flicker && { ...fx.flicker, unit: unitFor(fx.flicker.unit, text), ms: fx.flicker.ms / speed, stepMs: fx.flicker.stepMs / speed, tickMs: fx.flicker.tickMs / speed }
  const backlight = fx.backlight && { ...fx.backlight, delayMs: fx.backlight.delayMs / speed, ms: fx.backlight.ms / speed }
  const flare = fx.flare && { ...fx.flare, delayMs: fx.flare.delayMs / speed, ms: Math.min(fx.flare.ms / speed, durMs * IN_DONE_BY) }
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
    ...(fx.base ? { base: fx.base } : {}), ...(fx.impact ? { impact: { ...fx.impact, ms: fx.impact.ms / speed } } : {}),
    ...(fx.swap ? { swap: { ...fx.swap, ms: fx.swap.ms / speed } } : {}),
    ...(fx.stroke ? { stroke: {
      ...fx.stroke, delayMs: fx.stroke.delayMs / speed, drawMs: fx.stroke.drawMs / speed,
      fill: { ...fx.stroke.fill, delayMs: fx.stroke.fill.delayMs / speed, ms: fx.stroke.fill.ms / speed },
    } } : {}),
    ...(fx.rings ? { rings: { ...fx.rings, periodMs: fx.rings.periodMs / speed } } : {}),
    ...(fx.echo ? { echo: { ...fx.echo, inMs: fx.echo.inMs / speed } } : {}),
    ...(fx.scramble ? { scramble: fitScramble(fx.scramble, units, durMs, speed, seed) } : {}),
    ...(fx.cursor ? { cursor: { ...fx.cursor, blinkMs: fx.cursor.blinkMs / speed } } : {}), ...(flicker ? { flicker } : {}), ...(backlight ? { backlight } : {}), ...(flare ? { flare } : {}),
    ...(particles ? { particles } : {}), ...(dissolve ? { dissolve } : {}), ...(fx.reflect ? { reflect: fx.reflect } : {}),
    accent: fx.accent ?? GOLD, seed,
  }
}

/** A scramble at the speed, squeezed so the way in settles by 75 % (or the way out fits) */
function fitScramble(S: FxScramble, u: Units, durMs: number, speed: number, seed: number): FxScramble {
  const n = S.unit === 'word' ? u.words : u.letters
  const len = (S.delayMs + Math.max(0, ...delays(n, S.order, seed)) * S.stepMs + S.ms) / speed
  const room = S.dir === 'in' ? durMs * IN_DONE_BY : durMs * (1 - IN_DONE_BY)
  const k = (len > room ? room / len : 1) / speed
  return { ...S, delayMs: S.delayMs * k, stepMs: S.stepMs * k, ms: S.ms * k, tickMs: S.tickMs / speed }
}

/** Letters a scrambled letter may show: consonants of its own script, so it reads as that script */
const POOLS: [RegExp, string][] = [
  [/[\u0900-\u097F]/, 'कखगघचछजझटठडढणतथदधनपफबभमयरलवशषसह'],
  [/[\u0980-\u09FF]/, 'কখগঘচছজঝটঠডঢণতথদধনপফবভমযরলশষসহ'],
  [/[\u0A00-\u0A7F]/, 'ਕਖਗਘਚਛਜਝਟਠਡਢਣਤਥਦਧਨਪਫਬਭਮਯਰਲਵਸਹ'],
  [/[\u0A80-\u0AFF]/, 'કખગઘચછજઝટઠડઢણતથદધનપફબભમયરલવશષસહ'],
  [/[\u0B00-\u0B7F]/, 'କଖଗଘଚଛଜଝଟଠଡଢଣତଥଦଧନପଫବଭମଯରଲଶଷସହ'],
  [/[\u0B80-\u0BFF]/, 'கஙசஞடணதநபமயரலவழளறன'],
  [/[\u0C00-\u0C7F]/, 'కఖగఘచఛజఝటఠడఢణతథదధనపఫబభమయరలవశషసహ'],
  [/[\u0C80-\u0CFF]/, 'ಕಖಗಘಚಛಜಝಟಠಡಢಣತಥದಧನಪಫಬಭಮಯರಲವಶಷಸಹ'],
  [/[\u0D00-\u0D7F]/, 'കഖഗഘചഛജഝടഠഡഢണതഥദധനപഫബഭമയരലവശഷസഹ'],
  [/[0-9]/, '0123456789'],
  [/[A-Z]/, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
]

/** A random letter of the same script as ch, the same for the same draw */
export function scrambleChar(ch: string, draw: number): string {
  const pool = POOLS.find(([re]) => re.test(ch))?.[1] ?? 'abcdefghijklmnopqrstuvwxyz'
  const letters = Array.from(pool)
  return letters[Math.floor(draw * letters.length) % letters.length]!
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
  /** Per letter: a random letter shown over it now, or null once it has settled */
  scramble?: (string | null)[]
  /** Letter the cursor sits after (−1: before the first), and whether it is lit */
  cursor?: { letter: number; on: boolean }
  /** One word at a time, all in one place (swap) */
  swap?: boolean
  /** The outline now: how far drawn, its opacity, the dashes' shift (em) and its shake (em) */
  stroke?: { draw: number; opacity: number; dash: number; dx: number; dy: number; turn: number }
  /** The letters' own fill now (with an outline effect): opacity, and how far a wipe or rise has gone */
  body?: { opacity: number; wipe?: number; rise?: number }
  /** Each ring now: its scale and opacity */
  rings?: { scale: number; opacity: number }[]
  /** How far the echo copies have slid out, 0–1 */
  echo?: number
  /** The light behind: 0–1 how far it has grown, and its opacity now */
  backlight?: { grow: number; opacity: number }
  /** The flare now: where it is across the text (−0.2…1.2) and how bright */
  flare?: { at: number; opacity: number }
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
  return d.map((k, i) => {
    let state = p.alternate && i % 2 ? mirrored(p.state) : p.state
    if (p.scatter) state = scattered(state, random(seed * 17 + i * 101 + 3))
    const raw = p.ms <= 0 ? (ms >= startMs + k * p.stepMs ? 1 : 0) : (ms - startMs - k * p.stepMs) / p.ms
    return between(state, ease(p.ease, raw), out)
  })
}

/** The state with its own random share of x, y and rotate */
function scattered(s: FxState, rnd: () => number): FxState {
  const [a, b, c] = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]
  return { ...s, ...(s.x !== undefined ? { x: s.x * a } : {}), ...(s.y !== undefined ? { y: s.y * b } : {}), ...(s.rotate !== undefined ? { rotate: s.rotate * c } : {}) }
}

/** The same state from the other side */
const mirrored = (s: FxState): FxState => ({
  ...s, ...(s.x !== undefined ? { x: -s.x } : {}), ...(s.rotate !== undefined ? { rotate: -s.rotate } : {}), ...(s.skewX !== undefined ? { skewX: -s.skewX } : {}),
})

/** Every unit's look at ms into a caption of durMs */
export function fxAt(fx: CompiledFx, units: Units, ms: number, durMs: number): FxFrame {
  const frame: FxFrame = { revealFrom: {}, masked: {} }
  const add = (unit: FxUnit, states: FxState[]) => {
    if (unit === 'whole') { frame.whole = combine(frame.whole ?? {}, states[0] ?? {}); return }
    const have = frame[unit]
    frame[unit] = have ? have.map((s, i) => combine(s, states[i] ?? {})) : states
  }
  if (fx.base) add('whole', [fx.base])
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
      const sw = Math.sin((2 * Math.PI * (ms - k * L.stepMs)) / L.periodMs)
      // A pulse beats out from rest and back, quick at its peak
      const w = L.pulse ? Math.max(0, sw) ** 4 : sw
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
    add('word', Array.from({ length: units.words }, (_, i) => (i === key ? between(E.state, p, true) : E.others ? between(E.others, p, true) : {})))
  }
  if (fx.impact && fx.in) {
    // Every landing of the way in shakes the whole caption, dying out
    const I = fx.impact
    const n = countOf(units, fx.in.unit)
    const landings = delays(n, fx.in.order, fx.seed).map((k) => (fx.in!.delayMs ?? 0) + k * fx.in!.stepMs + fx.in!.ms)
    let x = 0
    let y = 0
    landings.forEach((at, k) => {
      const t = ms - at
      if (t < 0 || t >= I.ms) return
      const left = 1 - t / I.ms
      x += I.amountEm * left * Math.sin(t * 0.09 + k * 1.7)
      y += I.amountEm * left * Math.cos(t * 0.13 + k * 2.3)
    })
    if (x || y) add('whole', [{ x, y }])
  }
  if (fx.swap) {
    // One word at a time: in from below as it is spoken, out above as the next comes
    const S = fx.swap
    const at = spokenTimes(fx, units, durMs)
    frame.swap = true
    add('word', Array.from({ length: units.words }, (_, i) => {
      const inP = ease(EASE.out, (ms - at[i]!) / Math.max(1, S.ms))
      const last = i === units.words - 1
      const outP = last ? 0 : ease(EASE.in, (ms - at[i + 1]!) / Math.max(1, S.ms))
      return { opacity: inP * (1 - outP), y: S.travelEm * (1 - inP) - S.travelEm * outP }
    }))
  }
  if (fx.marker?.spoken && fx.marker.unit === 'word') {
    // Moves from word to word as each is spoken; the last stays
    const M = fx.marker
    const at = spokenTimes(fx, units, durMs)
    frame.marker = Array.from({ length: units.words }, (_, i) => {
      const on = ease(EASE.out, (ms - at[i]!) / Math.max(1, M.ms))
      const off = i === units.words - 1 ? 0 : ease(EASE.in, (ms - at[i + 1]!) / Math.max(1, M.ms))
      return on * (1 - off)
    })
  } else if (fx.marker) {
    const M = fx.marker
    const key = keyWord(units)
    const n = M.unit === 'line' ? units.lines : units.words
    const d = delays(n, M.order, fx.seed)
    frame.marker = d.map((di, i) => {
      if (M.pick === 'key' && M.unit === 'word' && i !== key) return 0
      const step = M.pick === 'key' ? 0 : di
      const p = ease(EASE.inOut, (ms - M.delayMs - step * M.stepMs) / Math.max(1, M.ms))
      // A cover starts whole and pulls away
      return M.cover ? 1 - p : p
    })
  }
  if (fx.stroke) {
    const S = fx.stroke
    const draw = S.drawMs > 0 ? ease(EASE.inOut, (ms - S.delayMs) / S.drawMs) : ms >= S.delayMs ? 1 : 0
    const F = S.fill
    const fp = F.mode === 'none' ? 0 : F.ms > 0 ? ease(EASE.inOut, (ms - S.delayMs - F.delayMs) / F.ms) : ms >= S.delayMs + F.delayMs ? 1 : 0
    const gone = S.fadeOut && F.mode !== 'none' ? ease(EASE.inOut, (ms - S.delayMs - F.delayMs - F.ms) / 350) : 0
    let dx = 0
    let dy = 0
    let turn = 0
    if (S.wobble) {
      // A new hand-drawn shake every 90 ms, the same each time
      const rnd = random(fx.seed * 31 + Math.floor(ms / 90))
      dx = (rnd() - 0.5) * 2 * S.wobble
      dy = (rnd() - 0.5) * 2 * S.wobble
      turn = (rnd() - 0.5) * 1.2
    }
    frame.stroke = { draw, opacity: 1 - gone, dash: S.dash ? (ms / 1000) * S.dash.speed : 0, dx, dy, turn }
    const most = F.opacity ?? 1
    frame.body = F.mode === 'none' ? { opacity: F.opacity ?? 0 }
      : F.mode === 'fade' ? { opacity: most * fp }
      : F.mode === 'wipe' ? { opacity: most, wipe: fp }
      : { opacity: most, rise: fp }
  }
  if (fx.rings) {
    const R = fx.rings
    frame.rings = Array.from({ length: R.count }, (_, k) => {
      const t = (((ms / R.periodMs + k / R.count) % 1) + 1) % 1
      return { scale: 1 + (R.scaleTo - 1) * ease(EASE.out, t), opacity: (1 - t) * Math.min(1, ms / 400) }
    })
  }
  if (fx.echo) frame.echo = ease(EASE.out, ms / Math.max(1, fx.echo.inMs))
  if (fx.scramble) {
    const S = fx.scramble
    const n = S.unit === 'word' ? units.words : units.letters
    const d = delays(n, S.order, fx.seed)
    const total = S.delayMs + Math.max(0, ...d) * S.stepMs + S.ms
    const from = S.dir === 'in' ? 0 : durMs - total
    const letters = units.glyphs.filter((g) => g.letter >= 0)
    const tick = Math.floor(ms / Math.max(1, S.tickMs))
    const looks: FxState[] = Array.from({ length: units.letters }, () => ({}))
    frame.scramble = letters.map((g) => {
      const k = d[S.unit === 'word' ? g.word : g.letter] ?? 0
      const start = from + S.delayMs + k * S.stepMs
      const changing = S.dir === 'in' ? ms < start + S.ms : ms >= start
      if (!changing) return null
      if (S.dir === 'in' && S.blankBefore && ms < start) { looks[g.letter] = { opacity: 0 }; return null }
      if (S.flap) {
        const f = ((ms / Math.max(1, S.tickMs)) % 1 + 1) % 1
        looks[g.letter] = { scaleY: 0.2 + 0.8 * Math.abs(Math.cos(Math.PI * f)) }
      }
      return scrambleChar(g.ch, random(fx.seed * 7 + g.letter * 131 + tick * 7919)())
    })
    if (looks.some((h) => Object.keys(h).length)) add('letter', looks)
  }
  if (fx.cursor && fx.in) {
    // After the last letter the way in has started; blinking all the while
    const P = fx.in
    const d = delays(units.letters, P.order, fx.seed)
    let last = -1
    d.forEach((k, i) => { if (ms >= (P.delayMs ?? 0) + k * P.stepMs) last = Math.max(last, i) })
    frame.cursor = { letter: last, on: Math.floor(ms / fx.cursor.blinkMs) % 2 === 0 }
  }
  if (fx.particles) frame.particles = particlesAt(fx.particles, fx.seed, ms)
  if (fx.dissolve) {
    const D = fx.dissolve
    let open = D.inMs > 0 ? ease(EASE.inOut, ms / D.inMs) : 1
    if (D.outMs) open = Math.min(open, ease(EASE.inOut, (durMs - ms) / D.outMs))
    frame.dissolve = open
  }
  if (fx.flicker) {
    const F = fx.flicker
    const n = countOf(units, F.unit)
    add(F.unit, Array.from({ length: n }, (_, i) => {
      const t = ms - i * F.stepMs
      if (t < 0) return { opacity: F.low }
      if (t >= F.ms) return { glow: F.glow }
      // Each tick on or off by a fixed draw; more often on as the tube warms up
      const tick = Math.floor(t / F.tickMs)
      const on = random(fx.seed * 131 + i * 977 + tick)() > 0.75 * (1 - t / F.ms)
      return on ? { glow: F.glow } : { opacity: F.low }
    }))
  }
  if (fx.backlight) {
    const B = fx.backlight
    const t = (ms - B.delayMs) / Math.max(1, B.ms)
    if (t > 0) {
      const grow = ease(EASE.out, t)
      // A glow comes up and stays; a ring spreads and is gone by the end
      frame.backlight = { grow, opacity: B.opacity * (B.ring ? Math.min(1, t * 4) * (1 - ease(EASE.in, t)) : ease(EASE.out, t)) }
    }
  }
  if (fx.flare) {
    const L = fx.flare
    const t = (ms - L.delayMs) / Math.max(1, L.ms)
    if (t > 0 && t < 1) frame.flare = { at: -0.2 + 1.4 * ease(EASE.inOut, t), opacity: Math.min(1, t * 5, (1 - t) * 5) }
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
    } else if (P.kind === 'spark') {
      // Born at the moving point, thrown out and falling, gone after a short life
      const born = P.delayMs + (i / Math.max(1, P.count)) * P.ms
      const life = 700
      const p = (ms - born) / life
      if (p < 0 || p > 1) { out.push({ left: 0, top: 0, dx: 0, dy: 0, size, rotate: 0, opacity: 0 }); continue }
      const vx = (d - 0.5) * 2.4
      const vy = -0.8 - e * 0.9
      out.push({
        left: (born - P.delayMs) / P.ms, top: 0.35 + b * 0.3,
        dx: vx * p, dy: vy * p + 1.8 * p * p, size: size * (1 - 0.6 * p), rotate: 0, opacity: 1 - p,
      })
    } else if (P.kind === 'twinkle') {
      // Each star on its own clock: lights, peaks and goes out, then waits to light again
      const period = 900 + 900 * c
      const t = (((ms - P.delayMs) / period + d) % 1 + 1) % 1
      const on = ms < P.delayMs ? 0 : Math.max(0, Math.sin(Math.PI * Math.min(1, t * 1.4))) ** 2
      out.push({ left: a, top: 0.15 + b * 0.7, dx: 0, dy: 0, size, rotate: 45 * e, opacity: on })
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
