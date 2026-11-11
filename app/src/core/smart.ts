import { presetById, type Preset } from './presets.ts'

// Smart Auto: an animation for every caption that suits it, picked from what the caption
// says and how long it is on screen. A short, strong line hits; a long line comes in
// quietly so it can be read; the first line is the hook; a number or a "!" gets a punch
// and that word lit. Every pick comes from the mood's own list, never the same as the
// caption before, and the same seed always gives the same picks, so preview and Resolve agree.

export type Mood = 'calm' | 'energetic' | 'cinematic'

export interface Smart {
  on: boolean
  mood: Mood
  /** A new seed is a new draw from the same lists */
  seed: number
}

export const DEFAULT_SMART: Smart = { on: false, mood: 'cinematic', seed: 1 }

/** What a caption is, for picking its animation */
export type Kind = 'hook' | 'punch' | 'number' | 'question' | 'long' | 'line'

export const KIND_NAMES: Record<Kind, string> = {
  hook: 'opening hook', punch: 'short and strong', number: 'with a number', question: 'questions', long: 'long lines', line: 'lines',
}

/** Each mood's animations for each kind of caption. Only presets checked in Resolve. */
export const MOODS: Record<Mood, Record<Kind, string[]>> = {
  calm: {
    hook: ['wideReveal', 'pullBack', 'dawn', 'breathe', 'featherRise'],
    punch: ['softPop', 'settleIn', 'grow', 'gentleGrow'],
    number: ['softPop', 'settleIn', 'punch'],
    question: ['grace', 'petal', 'gentleLeft', 'gentleRight'],
    long: ['fade', 'quickFade', 'softFade', 'linger'],
    line: ['fade', 'softFade', 'breathe', 'silk', 'featherRise', 'velvet', 'rise', 'spread'],
  },
  energetic: {
    hook: ['slamDown', 'impact', 'hypeLetters', 'zoomPunch'],
    punch: ['slamDown', 'bouncePop', 'stamp', 'jelly', 'zoomPunch', 'quickZoom'],
    number: ['punch', 'zoomPunch', 'heartbeat', 'stamp'],
    question: ['wiggle', 'kick', 'shakeIn'],
    long: ['quickFade', 'rise', 'grow', 'fade'],
    line: ['pop', 'rise', 'slideLeft', 'slideRight', 'snapUp', 'riseBounce', 'swipeUp', 'elastic'],
  },
  cinematic: {
    hook: ['wideReveal', 'epic', 'scope', 'letterRise', 'blurRise', 'pushBlur'],
    punch: ['impact', 'slam', 'heavyDrop', 'punch'],
    number: ['impact', 'punch', 'slam'],
    question: ['drift', 'orbit', 'swing'],
    long: ['fade', 'focus', 'fadeThrough', 'quickFade'],
    line: ['blurRise', 'focus', 'pushBlur', 'slowRise', 'tracking', 'featherRise', 'ghost', 'spotlight'],
  },
}

/** Picked when nothing in the mood's list fits the caption's length */
const FALLBACK = 'quickFade'

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const lettersIn = (s: string) => Array.from(graphemes.segment(s.replace(/\s+/g, ''))).length
const words = (s: string) => s.split(/\s+/).filter(Boolean)
/** Latin, Devanagari and Bengali digits */
const DIGIT = /[0-9०-९০-৯]/

export interface SmartCue { text: string; startMs: number; endMs: number }

/** What kind of caption this is. `i` is its place among all captions. */
export function kindOf(c: SmartCue, i: number): Kind {
  const text = c.text.trim()
  const dur = c.endMs - c.startMs
  const n = lettersIn(text)
  const w = words(text).length
  // Letters a viewer must read per second; past ~15 there is no time for a show
  const pace = n / Math.max(0.3, dur / 1000)
  if (i === 0 && w <= 8 && dur >= 1200) return 'hook'
  if (n >= 30 || pace > 15) return 'long'
  if (DIGIT.test(text)) return 'number'
  if (/[!！]/.test(text) || (w <= 3 && dur <= 2200)) return 'punch'
  if (/[?？]/.test(text)) return 'question'
  return 'line'
}

/** The word to light up with the highlight colour, as a word index (split on spaces), or null */
export function emphasisOf(c: SmartCue): number | null {
  const ws = words(c.text)
  const num = ws.findIndex((x) => DIGIT.test(x))
  if (num >= 0) return num
  const bang = ws.findIndex((x) => /[!！]/.test(x))
  if (bang >= 0) return bang
  return null
}

/** How long a preset's in and out take, in ms (its own keys, before any squeezing) */
function inOut(p: Preset): number {
  let a = 0
  let b = 0
  for (const t of p.tracks) {
    for (const k of t.keys) {
      if ((k.from ?? 'start') === 'start') a = Math.max(a, k.at)
      else if (k.at !== 0) b = Math.max(b, -k.at)
    }
  }
  return a + b
}

/** Does this animation have room in this caption? Letter animations need time for every letter. */
export function fits(id: string, c: SmartCue): boolean {
  const p = presetById(id)
  if (!p) return false
  const dur = c.endMs - c.startMs
  if (inOut(p) > dur * 0.7) return false
  if (p.letters) {
    const n = Array.from(graphemes.segment(c.text)).length
    if (dur < 1800 || n > 26 || (n - 1) * p.letters.stepMs > dur * 0.5) return false
  }
  return true
}

/** Small seeded random numbers (mulberry32), 0 ≤ r < 1 */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface SmartPick { preset: string; kind: Kind; emphasis: number | null }

/** An animation for each caption, in order */
export function smartList(cues: SmartCue[], mood: Mood, seed = 1): SmartPick[] {
  const r = rng(seed * 7919 + cues.length)
  const lists = MOODS[mood]
  let prev: string | undefined
  let before: string | undefined
  return cues.map((c, i) => {
    const kind = kindOf(c, i)
    // Too short for its own list: a plain line's animations, else a quiet one
    const fitting = (k: Kind) => lists[k].filter((id) => fits(id, c))
    const pool = [fitting(kind), fitting('line'), fitting('long')].find((x) => x.length) ?? []
    // Not the caption before's, and if there is room, not the one before that either
    const fresh = pool.filter((id) => id !== prev && id !== before)
    const other = pool.filter((id) => id !== prev)
    const from = fresh.length ? fresh : other.length ? other : pool
    const preset = from.length ? from[Math.floor(r() * from.length)]! : FALLBACK
    before = prev
    prev = preset
    return { preset, kind, emphasis: kind === 'number' || kind === 'punch' ? emphasisOf(c) : null }
  })
}
