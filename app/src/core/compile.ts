import { EASE, type Fixed, type Key, type Letters, type Target, type Track, type Value } from './anim.ts'
import { compileFx, type CompiledFx } from './fx.ts'
import type { Cue } from './srt.ts'
import { presetById, wordFxById } from './presets.ts'
import {
  autoWords, centerOf, DEFAULT_HIGHLIGHT, DEFAULT_LOOK, DEFAULT_MOTION, layout, letters as lettersOf,
  type Highlight, type ImagePlace, type Look, type Measure, type Motion, type Rgb, type WordLook,
} from './look.ts'

export type { Rgb } from './look.ts'

/** A key with its time resolved to ms from the caption's start */
export interface TimedKey {
  ms: number
  v: Value
  ease: readonly [number, number, number, number]
}

export interface TimedTrack {
  target: Target
  input: string
  keys: TimedKey[]
}

/** The caption's Text+ values, ready for Resolve */
export interface TextLook {
  font: string
  style: string
  size: number
  tracking: number
  lineSpacing: number
  /** 0 left, 1 centre, 2 right */
  align: 0 | 1 | 2
  fill: Rgb
  /** Text+ Center, 0–1 with y up */
  center: readonly [number, number]
  rotation: number
  outline?: { width: number; color: Rgb }
  shadow?: { blur: number; distance: number; opacity: number; color: Rgb }
  box?: { color: Rgb; opacity: number; round: number; pad: number }
  /** Drawn by the app only (Finished clips); a Text+ caption has the first colour, no picture, the final numbers */
  gradient?: { color: Rgb; angle: number }
  image?: { src: string; size: number; place: ImagePlace }
  count?: { from: number; ms: number }
}

export interface CompiledWord {
  /** Which word of the caption (0-based) */
  index: number
  /** 0-based character range, counted in grapheme clusters (as Text+ counts) */
  first: number
  last: number
  color: Rgb
  tracks: TimedTrack[]
  /** A soft copy of the word in its colour behind it */
  glow?: boolean
  /** Box colour behind the word */
  box?: Rgb
  /** A word with its own size: drawn as its own Text+ here, in blank room the caption
   *  leaves for it. first/last then say where that room starts, for letter timing. */
  solo?: { text: string; size: number; center: readonly [number, number] }
  /** Test runs only: Follower settings to compare in Resolve */
  probe?: { order?: number; noShift?: boolean }
}

export interface CompiledCue {
  n: number
  startMs: number
  endMs: number
  /** The text Text+ gets: cased, broken into lines, with room around bigger words */
  text: string
  look: TextLook
  preset: string
  tracks: TimedTrack[]
  fixed: Fixed[]
  letters?: Letters
  words: CompiledWord[]
  /** Every word's range in text (null: a bigger word drawn on its own). For the preview. */
  ranges: ({ first: number; last: number } | null)[]
  /** An advanced effect, drawn by the app only (Finished clips); Text+ leaves it out */
  fx?: CompiledFx
}

export interface CompileOpts {
  look: Look
  /** Word index (in the caption's own text) → that word's look */
  words: Record<number, WordLook>
  highlight: Highlight
  motion: Motion
  measure: Measure
  /** Frame width ÷ height of the timeline */
  aspect: number
  /** Asks the real font whether it has the caption's letters (see fontFor) */
  hasGlyphs?: HasGlyphs
}

/** Rough widths for when no real font is at hand (tests, scripts): average Latin letters */
export const roughMeasure: Measure = (text) => {
  let em = 0
  for (const ch of lettersOf(text)) em += ch === ' ' ? 0.28 : /[ilI.,'!|]/.test(ch) ? 0.3 : /[mwMW]/.test(ch) ? 0.85 : 0.58
  return em
}

/** Longest part of a caption that in + out animations may take together */
const MAX_ANIM_SHARE = 0.9

/**
 * Resolve every key to ms from the caption start. When the caption is too short for the
 * in and out animations, both are squeezed by the same factor so they never overlap.
 */
export function timeTracks(tracks: Track[], durMs: number): TimedTrack[] {
  let inMs = 0
  let outMs = 0
  for (const t of tracks) {
    for (const k of t.keys) {
      if ((k.from ?? 'start') === 'start') inMs = Math.max(inMs, k.at)
      else if (k.at !== 0) outMs = Math.max(outMs, -k.at)
    }
  }
  const room = durMs * MAX_ANIM_SHARE
  const f = inMs + outMs > room ? room / (inMs + outMs) : 1

  return tracks.map((t) => ({
    target: t.target,
    input: t.input,
    keys: t.keys
      .map((k) => ({
        ms: Math.round((k.from ?? 'start') === 'start' ? k.at * f : durMs + k.at * f),
        v: k.v,
        ease: k.ease ?? EASE.linear,
      }))
      .sort((a, b) => a.ms - b.ms),
  }))
}

const BENGALI = /[ঀ-৿]/
const DEVANAGARI = /[ऀ-ॿ]/

/** Fonts known to have Bangla or Devanagari letters */
const INDIC_FONTS = /nirmala|mangal|kokila|aparajita|utsaah|vrinda|shonar|kalpurush|solaiman|siyam|bangla|bengali|devanagari|hind|mukta|poppins|baloo|tiro|lohit|akshar|yatra|kohinoor/i

/** Windows' own font for Indian scripts, used when the chosen font lacks the caption's letters */
export const FALLBACK_FONT = 'Nirmala UI'

/** Letters of the scripts Nirmala UI draws: Devanagari through Sinhala */
const INDIC_RUN = /[ऀ-෿]+/g

/** Does this font draw this text itself? The app asks the real font (renderer fonts.ts). */
export type HasGlyphs = (text: string, font: string, style: string) => boolean

/**
 * Pick a font that has the caption's letters: most Latin fonts have no Indian scripts,
 * and Text+ draws empty boxes for letters its font lacks. The chosen font stays whenever
 * it can draw them; `has` asks the font itself. Without it (tests, scripts) the font's
 * name is all there is to go by.
 */
export function fontFor(text: string, wanted: string, style = 'Regular', has?: HasGlyphs): string {
  if (wanted === FALLBACK_FONT) return wanted
  if (has) {
    const indic = text.match(INDIC_RUN)
    return indic && !has(indic.join(''), wanted, style) ? FALLBACK_FONT : wanted
  }
  if ((BENGALI.test(text) || DEVANAGARI.test(text)) && !INDIC_FONTS.test(wanted)) return FALLBACK_FONT
  return wanted
}

/** Nirmala UI comes in three weights: the nearest to the style that was asked for */
export function fallbackStyle(style: string): string {
  const s = style.replace(/\s/g, '').toLowerCase()
  if (/thin|light/.test(s)) return 'Semilight'
  if (/bold|black|heavy/.test(s)) return 'Bold'
  return 'Regular'
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/**
 * Character range of a word, counting from 0 the way Text+ does: by grapheme cluster
 * (what a reader sees as one letter). Bridge test stills showed Text+ treats পূ and the
 * conjunct র্ণ as one character each, which matches Unicode 15.1 grapheme rules.
 */
export function wordRange(text: string, word: number): { first: number; last: number } | null {
  const chars = Array.from(graphemes.segment(text), (s) => s.segment)
  let i = 0
  let w = -1
  while (i < chars.length) {
    while (i < chars.length && /\s/.test(chars[i]!)) i++
    if (i >= chars.length) break
    const start = i
    while (i < chars.length && !/\s/.test(chars[i]!)) i++
    if (++w === word) return { first: start, last: i - 1 }
  }
  return null
}

/** Share of the caption by which the last letter must have finished arriving */
const LETTERS_DONE_BY = 0.75

/**
 * A letter preset's step suits a short line. On a long line in a short caption the last
 * letters would still be arriving when it ends (Resolve stills, 2026-11-08: Slow Letters
 * never finished on a 2.4 s caption), so the step shrinks to fit.
 */
export function fitLetters(letters: Letters | undefined, tracks: TimedTrack[], text: string, durMs: number): Letters | undefined {
  if (!letters) return undefined
  // Text+ counts every character, spaces and line breaks too
  const count = Array.from(graphemes.segment(text)).length
  if (count < 2) return letters
  const anim = Math.max(0, ...tracks.filter((t) => t.target === 'letters').flatMap((t) => t.keys.map((k) => k.ms)))
  const most = (durMs * LETTERS_DONE_BY - anim) / (count - 1)
  return letters.stepMs > most ? { ...letters, stepMs: Math.max(2, Math.floor(most)) } : letters
}

// ── Animation tab ──────────────────────────────────────────────────────────

const scaleKeys = (keys: Key[], speed: number): Key[] => keys.map((k) => ({ ...k, at: k.at / speed }))

/** Keys held at one value, for an input that must not move */
const hold = (target: Target, input: string, v: Value): Track => ({ target, input, keys: [{ at: 0, v }] })

const isOut = (k: Key) => (k.from ?? 'start') === 'end'

/** Tracks of a preset's way out that can go on any caption: the whole caption's, not per letter */
const outTracks = (tracks: Track[]) =>
  tracks.filter((t) => (t.target === 'text' || t.target === 'move') && t.keys.some((k) => isOut(k) && k.at < 0))

/** Does this animation have a way out another one can borrow (Animation tab › Out › From)? */
export const hasOwnOut = (presetId: string) => outTracks(presetById(presetId)?.tracks ?? []).length > 0

/** The preset's tracks with the Animation tab's speed, way out and speed curves applied */
export function withMotion(tracks: Track[], motion: Motion): Track[] {
  let out = tracks.map((t) => ({ ...t, keys: scaleKeys(t.keys, motion.speed) }))
  const borrowed = motion.out === 'other' && motion.outFrom ? outTracks(presetById(motion.outFrom)?.tracks ?? []) : []
  if (motion.out !== 'preset' && !(motion.out === 'other' && !borrowed.length)) {
    // Drop the preset's own way out, then add the chosen one
    out = out.map((t) => ({ ...t, keys: t.keys.filter((k) => !isOut(k)) })).filter((t) => t.keys.length)
    const ms = motion.outMs
    const append = (target: Target, input: string, from: Value, to: Value) => {
      let t = out.find((x) => x.target === target && x.input === input)
      if (!t) { t = hold(target, input, from); out.push(t) }
      t.keys = [...t.keys, { at: -ms, from: 'end', v: from, ease: EASE.in }, { at: 0, from: 'end', v: to }]
    }
    if (motion.out === 'other') {
      // Another animation's way out, at this one's speed. An input the caption does not
      // animate on its way in holds where that way out starts.
      for (const b of borrowed) {
        const keys = scaleKeys(b.keys.filter(isOut), motion.speed)
        let t = out.find((x) => x.target === b.target && x.input === b.input)
        if (!t) { t = hold(b.target, b.input, keys[0]!.v); out.push(t) }
        t.keys = [...t.keys, ...keys]
      }
    } else if (motion.out !== 'none') {
      append('text', 'Opacity1', 1, 0)
      if (motion.out === 'slide') append('move', 'Center', [0.5, 0.5], [0.5, 0.44])
      if (motion.out === 'zoom') append('move', 'Size', 1, 1.3)
    }
  }
  // Own speed curves: every step of the way in, every step of the way out
  const { easeIn, easeOut } = motion
  if (easeIn || easeOut) {
    out = out.map((t) => ({
      ...t,
      keys: t.keys.map((k) => (isOut(k) ? (easeOut ? { ...k, ease: easeOut } : k) : easeIn ? { ...k, ease: easeIn } : k)),
    }))
  }
  return out
}

// ── Words ──────────────────────────────────────────────────────────────────

const BOUNCE: Track = {
  target: 'word', input: 'CharacterOffset',
  keys: [{ at: 150, v: [0, 0], ease: EASE.out }, { at: 300, v: [0, 0.012], ease: EASE.in }, { at: 450, v: [0, 0], ease: EASE.out },
    { at: 540, v: [0, 0.004], ease: EASE.in }, { at: 620, v: [0, 0] }],
}

/** Follower tracks for a word: its size and lift held, its effect on top */
function wordTracks(w: WordLook): Track[] {
  const scale = w.scale ?? 1
  const raise = w.raise ?? 0
  const fx = w.effect === 'pop' ? wordFxById('pop')!.tracks : w.effect === 'shake' ? wordFxById('shake')!.tracks : w.effect === 'bounce' ? [BOUNCE] : []
  const tracks: Track[] = fx.map((t) => ({
    ...t,
    keys: t.keys.map((k) => ({
      ...k,
      v: t.input.startsWith('CharacterSize') ? (k.v as number) * scale
        : t.input === 'CharacterOffset' ? [(k.v as readonly [number, number])[0], (k.v as readonly [number, number])[1] + raise] as const : k.v,
    })),
  }))
  const has = (input: string) => tracks.some((t) => t.input === input)
  if (scale !== 1) {
    if (!has('CharacterSizeX')) tracks.push(hold('word', 'CharacterSizeX', scale))
    if (!has('CharacterSizeY')) tracks.push(hold('word', 'CharacterSizeY', scale))
  }
  if (raise !== 0 && !has('CharacterOffset')) tracks.push(hold('word', 'CharacterOffset', [0, raise]))
  return tracks
}

/**
 * Words drawn as their own Text+ (solo) rather than a Follower copy of the caption: any
 * that move, lift, grow or have a box. A copy's outline, shadow and box ignore its
 * Follower's opacity and draw for every hidden letter (bridge test 4), so a copy can only
 * add colour on top of the caption's own word; a moving word needs the real thing.
 */
const ownText = (w: WordLook) => Math.abs((w.scale ?? 1) - 1) > 0.02 || (w.raise ?? 0) !== 0 || !!w.box
  || w.effect === 'pop' || w.effect === 'shake' || w.effect === 'bounce'

const shows = (w: WordLook) => (w.scale ?? 1) !== 1 || w.color || (w.effect && w.effect !== 'none') || w.box || (w.raise ?? 0) !== 0

// ── Caption ────────────────────────────────────────────────────────────────

const ALIGN = { left: 0, center: 1, right: 2 } as const

export function compileCue(cue: Cue, presetId: string, opts: Partial<CompileOpts> = {}): CompiledCue {
  const preset = presetById(presetId)
  if (!preset) throw new Error(`Unknown preset “${presetId}”`)
  const look = opts.look ?? DEFAULT_LOOK
  const highlight = opts.highlight ?? DEFAULT_HIGHLIGHT
  const motion = opts.motion ?? DEFAULT_MOTION
  const measure = opts.measure ?? roughMeasure
  const aspect = opts.aspect ?? 16 / 9
  const dur = cue.endMs - cue.startMs

  // Each word's final look: its own, else the highlight rule's
  const srcWords = cue.text.split(/\s+/).filter(Boolean)
  const own = opts.words ?? {}
  const picked = new Set(autoWords(srcWords, highlight.rule))
  const final: (WordLook | null)[] = srcWords.map((_, i) =>
    own[i] ?? (picked.has(i) ? { color: highlight.color, scale: highlight.scale } : null))
  const font = fontFor(cue.text, look.font, look.style, opts.hasGlyphs)
  // A swapped font takes a style it has: Text+ has no "Nirmala UI Medium"
  const style = font === look.font ? look.style : fallbackStyle(look.style)
  const laid = layout(cue.text, { ...look, font, style }, final.map((w) => w?.scale ?? 1), measure, aspect, final.map((w) => !!w && ownText(w)))
  const center = centerOf(look, laid.width, laid.height)

  const tracks = timeTracks(withMotion(preset.tracks, motion), dur)
  // A path takes the caption's position over: from its place through each point, evenly over its time
  if (look.path.length) {
    const pts: (readonly [number, number])[] = [[0, 0], ...look.path]
    const keys: TimedKey[] = pts.map(([dx, dy], i) => ({
      ms: Math.round((dur * i) / (pts.length - 1)), v: [0.5 + dx, 0.5 + dy] as const, ease: EASE.inOut,
    }))
    const at = tracks.findIndex((t) => t.target === 'move' && t.input === 'Center')
    const track: TimedTrack = { target: 'move', input: 'Center', keys }
    if (at >= 0) tracks[at] = track
    else tracks.push(track)
  }
  if (look.rotation && !tracks.some((t) => t.target === 'move' && t.input === 'Angle')) {
    tracks.push({ target: 'move', input: 'Angle', keys: [{ ms: 0, v: look.rotation, ease: EASE.linear }] })
  } else if (look.rotation) {
    for (const t of tracks) if (t.target === 'move' && t.input === 'Angle') t.keys = t.keys.map((k) => ({ ...k, v: (k.v as number) + look.rotation }))
  }

  const words: CompiledWord[] = []
  final.forEach((w, i) => {
    if (!w || !shows(w)) return
    const extra = { ...(w.effect === 'glow' ? { glow: true } : {}), ...(w.box ? { box: w.box } : {}) }
    const solo = laid.solos[i]
    const r = laid.ranges[i]
    if (solo) {
      // Its size goes on its own Text+, its lift on its centre; the effect stays on top
      words.push({
        index: i, first: solo.first, last: solo.first + lettersOf(solo.text).length - 1, color: w.color ?? look.fill,
        tracks: timeTracks(wordTracks({ ...w, scale: 1, raise: 0 }), dur),
        solo: { text: solo.text, size: look.size * (w.scale ?? 1), center: [center[0] + solo.dx, center[1] + solo.dy + (w.raise ?? 0)] },
        ...extra,
      })
    } else if (r) {
      words.push({ index: i, ...r, color: w.color ?? look.fill, tracks: timeTracks(wordTracks(w), dur), ...extra })
    }
  })

  // Word by word, as spoken: each word lit in turn, timed by its share of the letters
  if (highlight.rule === 'karaoke' && srcWords.length) {
    const inEnd = Math.min(dur * 0.3, Math.max(0, ...tracks.flatMap((t) => t.keys.filter((k) => k.ms < dur / 2).map((k) => k.ms))))
    const outStart = dur - Math.min(dur * 0.2, motion.out === 'none' ? 0 : motion.outMs)
    const len = srcWords.map((x) => lettersOf(x).length)
    const total = len.reduce((s, x) => s + x, 0)
    let acc = 0
    const at = len.map((l) => { const t = inEnd + ((outStart - inEnd) * acc) / total; acc += l; return Math.round(t) })
    srcWords.forEach((_, i) => {
      if (own[i]) return
      const r = laid.ranges[i]
      if (!r) return
      const on = at[i]!
      const off = i + 1 < at.length ? at[i + 1]! : outStart
      const step = 40
      const keys: TimedKey[] = [
        { ms: 0, v: 0, ease: EASE.linear }, { ms: Math.max(0, on - step), v: 0, ease: EASE.linear }, { ms: on, v: 1, ease: EASE.linear },
        { ms: Math.max(on, off - step), v: 1, ease: EASE.linear }, { ms: Math.max(on + 1, off), v: i + 1 < at.length ? 0 : 1, ease: EASE.linear },
      ]
      if (i + 1 >= at.length) keys.push({ ms: dur, v: 0, ease: EASE.linear })
      words.push({ index: i, ...r, color: highlight.color, tracks: [{ target: 'word', input: 'Opacity1', keys }] })
    })
  }

  const step = motion.stepMs ?? preset.letters?.stepMs
  const lettersIn = preset.letters && step !== undefined ? { ...preset.letters, stepMs: step / motion.speed } : undefined

  return {
    n: cue.n,
    startMs: cue.startMs,
    endMs: cue.endMs,
    text: laid.text,
    look: {
      font, style, size: look.size, tracking: look.tracking, lineSpacing: look.lineSpacing,
      align: ALIGN[look.align], fill: look.fill, center, rotation: look.rotation,
      ...(look.outline.on ? { outline: { width: look.outline.width, color: look.outline.color } } : {}),
      ...(look.shadow.on ? { shadow: { blur: look.shadow.blur, distance: look.shadow.distance, opacity: look.shadow.opacity, color: look.shadow.color } } : {}),
      ...(look.box.on ? { box: { color: look.box.color, opacity: look.box.opacity, round: look.box.round, pad: look.box.pad } } : {}),
      ...(look.gradient.on ? { gradient: { color: look.gradient.color, angle: look.gradient.angle } } : {}),
      ...(look.image.on && look.image.src ? { image: { src: look.image.src, size: look.image.size, place: look.image.place } } : {}),
      ...(look.count.on ? { count: { from: look.count.from, ms: look.count.ms } } : {}),
    },
    preset: preset.id,
    tracks,
    fixed: preset.fixed ?? [],
    letters: fitLetters(lettersIn, tracks, laid.text, dur),
    words,
    ranges: laid.ranges,
    // The Animation tab's own way out replaces the effect's
    ...(preset.fx ? { fx: compileFx(preset.fx, laid.text, dur, { speed: motion.speed, keepOut: motion.out === 'preset', seed: cue.n }) } : {}),
  }
}
