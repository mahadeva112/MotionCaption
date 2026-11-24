import { DEFAULT_LOOK, type Deco, type Look, type Outline, type Rgb, type WordLook } from '@core/look'

// Building blocks for the super templates (templates.ts, templatesMore.ts): the template
// shape, colours, looks, word looks and the shapes advanced templates draw around the text.

export const TEMPLATE_GROUPS = ['Lower thirds', 'Names', 'Titles', 'Quotes', 'Social', 'Info', 'News', 'Lists', 'Cinematic', 'Devotional'] as const
export type TemplateGroup = (typeof TEMPLATE_GROUPS)[number]
/** Simple: the text's own look. Advanced: shapes around it (bars, frames, plates…) that come in on their own. */
export type TemplateLevel = 'simple' | 'advanced'

export interface SuperTemplate {
  id: string
  name: string
  group: TemplateGroup
  level: TemplateLevel
  desc: string
  text: string
  /** This super's own look, over the supers' look */
  look: Partial<Look>
  preset: string
  /** Word looks for the text as written (word index → look) */
  words?: (text: string) => Record<number, WordLook>
  ms: number
}

// ── Colours ──
export const DARK: Rgb = [0.08, 0.08, 0.1]
export const WHITE: Rgb = [1, 1, 1]
export const SOFT_WHITE: Rgb = [0.85, 0.85, 0.88]
export const ORANGE: Rgb = [1, 0.42, 0.2]
export const YELLOW: Rgb = [1, 0.82, 0.25]
export const RED: Rgb = [0.86, 0.1, 0.1]
export const GOLD: Rgb = [0.93, 0.72, 0.32]
export const SAFFRON: Rgb = [1, 0.56, 0.12]
export const TEAL: Rgb = [0.15, 0.78, 0.68]
export const BLUE: Rgb = [0.2, 0.5, 0.95]
export const GREEN: Rgb = [0.2, 0.75, 0.45]
export const GREY: Rgb = [0.55, 0.57, 0.62]

// ── Looks ──
export const BOX = { on: true, color: DARK, opacity: 0.82, round: 0.25, pad: 0.55 }
export const NO_BOX = { ...DEFAULT_LOOK.box, on: false }
export const NO_SHADOW = { on: false, blur: 0.5, distance: 0.3, opacity: 0.6, color: [0, 0, 0] as const }
export const SOFT_SHADOW = { on: true, blur: 0.6, distance: 0.25, opacity: 0.7, color: [0, 0, 0] as const }
export const stroke = (color: Rgb, width = 0.05): Outline => ({ ...DEFAULT_LOOK.outline, on: true, color, width })
export const box = (color: Rgb, round = 0.3, pad = 0.6, opacity = 1) => ({ on: true, color, opacity, round, pad })

// ── Word looks ──
export const wordsOf = (s: string) => s.split(/\s+/).filter(Boolean)

/** Every word after the first line, smaller and softer: the title under a name */
export function secondLine(text: string, color: Rgb = [0.8, 0.8, 0.82], scale = 0.7): Record<number, WordLook> {
  const [first = '', ...rest] = text.split('\n')
  const firstWords = wordsOf(first).length
  const restWords = wordsOf(rest.join(' ')).length
  const out: Record<number, WordLook> = {}
  for (let i = 0; i < restWords; i++) out[firstWords + i] = { scale, color }
  return out
}
/** Every word of the first line in its own look */
export function firstLine(text: string, look: WordLook): Record<number, WordLook> {
  const n = wordsOf(text.split('\n')[0] ?? '').length
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [i, look]))
}
/** Every word of one line (0-based) in its own look */
export function lineWords(text: string, line: number, look: WordLook): Record<number, WordLook> {
  const lines = text.split('\n')
  const before = wordsOf(lines.slice(0, line).join(' ')).length
  const n = wordsOf(lines[line] ?? '').length
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [before + i, look]))
}
/** The last word in its own look */
export function lastWord(text: string, look: WordLook): Record<number, WordLook> {
  const n = wordsOf(text).length
  return n ? { [n - 1]: look } : {}
}
/** Every word that matches, in its own look (or a look picked by the word) */
export function matching(text: string, re: RegExp, look: WordLook | ((w: string) => WordLook)): Record<number, WordLook> {
  const out: Record<number, WordLook> = {}
  wordsOf(text).forEach((w, i) => { if (re.test(w)) out[i] = typeof look === 'function' ? look(w) : look })
  return out
}
/** Several word looks together; later ones win */
export const merge = (...xs: Record<number, WordLook>[]): Record<number, WordLook> => Object.assign({}, ...xs)

// ── Shapes (core/look.ts Deco) ──
export const bar = (color: Rgb, o: Partial<Deco> = {}): Deco => ({ kind: 'bar', color, side: 'left', size: 0.14, gap: 0.35, in: 'grow', delay: 0, ms: 700, ...o })
export const line = (color: Rgb, o: Partial<Deco> = {}): Deco => ({ kind: 'line', color, side: 'below', size: 0.07, gap: 0.25, amount: 0.6, in: 'grow', delay: 350, ms: 800, ...o })
export const panel = (color: Rgb, o: Partial<Deco> = {}): Deco => ({ kind: 'panel', color, opacity: 1, gap: 0.3, round: 0.1, in: 'wipe', delay: 0, ms: 700, ...o })
export const frame = (color: Rgb, o: Partial<Deco> = {}): Deco => ({ kind: 'frame', color, size: 0.07, gap: 0.45, amount: 0.7, in: 'pop', delay: 0, ms: 800, ...o })
export const dot = (color: Rgb, o: Partial<Deco> = {}): Deco => ({ kind: 'dot', color, size: 0.5, gap: 0.4, in: 'pop', delay: 300, ms: 550, ...o })
export const meter = (color: Rgb, o: Partial<Deco> = {}): Deco => ({ kind: 'meter', color, size: 0.22, gap: 0.35, amount: 0.72, delay: 300, ms: 1200, ...o })
export const sweep = (o: Partial<Deco> = {}): Deco => ({ kind: 'sweep', color: WHITE, opacity: 0.9, delay: 900, ms: 1100, ...o })
export const letterbox = (o: Partial<Deco> = {}): Deco => ({ kind: 'letterbox', color: [0, 0, 0], amount: 0.11, in: 'grow', delay: 0, ms: 700, ...o })
/** A see-through glass plate with a light border */
export const glass = (o: Partial<Deco> = {}): Deco => panel(WHITE, { opacity: 0.14, border: WHITE, borderWidth: 0.05, round: 0.35, gap: 0.4, in: 'fade', ms: 700, ...o })
