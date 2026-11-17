import { DEFAULT_LOOK, type Look, type Outline, type Rgb, type WordLook } from '@core/look'

// Ready-made supers: text, look, animation and length to start from. Everything stays
// editable afterwards like any super; the template only fills it in.

export const TEMPLATE_GROUPS = ['Names', 'Titles', 'Social', 'Info'] as const
export type TemplateGroup = (typeof TEMPLATE_GROUPS)[number]

export interface SuperTemplate {
  id: string
  name: string
  group: TemplateGroup
  desc: string
  text: string
  /** This super's own look, over the supers' look */
  look: Partial<Look>
  preset: string
  /** Word looks for the text as written (word index → look) */
  words?: (text: string) => Record<number, WordLook>
  ms: number
}

const DARK: Rgb = [0.08, 0.08, 0.1]
const ORANGE: Rgb = [1, 0.42, 0.2]
const YELLOW: Rgb = [1, 0.82, 0.25]
const BOX = { on: true, color: DARK, opacity: 0.82, round: 0.25, pad: 0.55 }
const NO_BOX = { ...DEFAULT_LOOK.box, on: false }
const NO_SHADOW = { on: false, blur: 0.5, distance: 0.3, opacity: 0.6, color: [0, 0, 0] as const }
const SOFT_SHADOW = { on: true, blur: 0.6, distance: 0.25, opacity: 0.7, color: [0, 0, 0] as const }
const stroke = (color: Rgb, width = 0.05): Outline => ({ ...DEFAULT_LOOK.outline, on: true, color, width })
const box = (color: Rgb, round = 0.3, pad = 0.6, opacity = 1) => ({ on: true, color, opacity, round, pad })

const wordsOf = (s: string) => s.split(/\s+/).filter(Boolean)

/** Every word after the first line, smaller and softer: the title under a name */
function secondLine(text: string, color: Rgb = [0.8, 0.8, 0.82], scale = 0.7): Record<number, WordLook> {
  const [first = '', ...rest] = text.split('\n')
  const firstWords = wordsOf(first).length
  const restWords = wordsOf(rest.join(' ')).length
  const out: Record<number, WordLook> = {}
  for (let i = 0; i < restWords; i++) out[firstWords + i] = { scale, color }
  return out
}
/** Every word of the first line in its own look */
function firstLine(text: string, look: WordLook): Record<number, WordLook> {
  const n = wordsOf(text.split('\n')[0] ?? '').length
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [i, look]))
}
/** The last word in its own look */
function lastWord(text: string, look: WordLook): Record<number, WordLook> {
  const n = wordsOf(text).length
  return n ? { [n - 1]: look } : {}
}

export const TEMPLATES: SuperTemplate[] = [
  // ── Names ──
  {
    id: 'lowerThird', name: 'Lower third', group: 'Names', desc: 'A name, and a title under it, bottom left on a dark box.',
    text: 'Name Surname\nTitle or role',
    look: { anchor: 6, align: 'left', size: 0.06, lines: 'keep', x: 0.05, y: 0.14, box: BOX, shadow: NO_SHADOW },
    preset: 'slideLeft', words: (t) => secondLine(t), ms: 4000,
  },
  {
    id: 'lowerThirdRight', name: 'Lower third right', group: 'Names', desc: 'The same, from the right edge.',
    text: 'Name Surname\nTitle or role',
    look: { anchor: 8, align: 'right', size: 0.06, lines: 'keep', x: -0.05, y: 0.14, box: BOX, shadow: NO_SHADOW },
    preset: 'slideRight', words: (t) => secondLine(t), ms: 4000,
  },
  {
    id: 'nameTag', name: 'Name tag', group: 'Names', desc: 'The name on an orange tag, the role in white under it.',
    text: 'Name Surname\nTitle or role',
    look: { anchor: 6, align: 'left', size: 0.058, lines: 'keep', x: 0.05, y: 0.14, box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'snapLeft', words: (t) => ({ ...firstLine(t, { box: ORANGE }), ...secondLine(t, [1, 1, 1], 0.72) }), ms: 4000,
  },
  {
    id: 'cleanName', name: 'Clean name', group: 'Names', desc: 'No box: a name with a soft shadow and a thin line of role.',
    text: 'Name Surname\nTitle or role',
    look: { anchor: 6, align: 'left', size: 0.062, lines: 'keep', x: 0.04, y: 0.12, box: NO_BOX, shadow: SOFT_SHADOW, style: 'Bold' },
    preset: 'featherRise', words: (t) => secondLine(t, YELLOW, 0.62), ms: 4000,
  },
  {
    id: 'centerName', name: 'Centre name', group: 'Names', desc: 'Name and role centred low, for a speaker on the middle.',
    text: 'Name Surname\nTitle or role',
    look: { anchor: 7, align: 'center', size: 0.06, lines: 'keep', y: 0.02, box: { ...BOX, opacity: 0.7, round: 0.4 }, shadow: NO_SHADOW },
    preset: 'riseInOut', words: (t) => secondLine(t), ms: 4000,
  },

  // ── Titles ──
  {
    id: 'bigTitle', name: 'Big title', group: 'Titles', desc: 'One big heavy word or line, slammed in the middle.',
    text: 'BIG TITLE',
    look: { anchor: 4, align: 'center', size: 0.13, lines: '1', textCase: 'upper', style: 'Bold', tracking: 1.02, box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'slam', ms: 3000,
  },
  {
    id: 'chapter', name: 'Chapter', group: 'Titles', desc: 'A small chapter line over a wide spaced title.',
    text: 'Chapter One\nThe Beginning',
    look: { anchor: 4, align: 'center', size: 0.085, lines: 'keep', textCase: 'upper', tracking: 1.25, box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'titleCard', words: (t) => ({ ...firstLine(t, { scale: 0.45, color: ORANGE }) }), ms: 4500,
  },
  {
    id: 'elegant', name: 'Elegant title', group: 'Titles', desc: 'A serif title that fades in slowly; calm and clean.',
    text: 'A Quiet Morning',
    look: { anchor: 4, align: 'center', size: 0.09, lines: '2', font: 'Georgia', style: 'Regular', tracking: 1.08, box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'silk', ms: 4500,
  },
  {
    id: 'quote', name: 'Quote', group: 'Titles', desc: 'A quote in serif, the speaker under it.',
    text: '“Words worth remembering\ngo right here.”\n— Speaker',
    look: { anchor: 4, align: 'center', size: 0.065, lines: 'keep', font: 'Georgia', style: 'Italic', maxWidth: 0.7, box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'softFade',
    words: (t) => { const n = wordsOf(t).length; return { [n - 2]: { scale: 0.7, color: YELLOW }, [n - 1]: { scale: 0.7, color: YELLOW } } },
    ms: 5500,
  },
  {
    id: 'location', name: 'Location', group: 'Titles', desc: 'A place name, small, top left on a dark pill.',
    text: '📍 Rishikesh, India',
    look: { anchor: 0, align: 'left', size: 0.045, lines: '1', x: 0.02, box: { ...BOX, round: 1, pad: 0.6 }, shadow: NO_SHADOW },
    preset: 'gentleRight', ms: 3500,
  },
  {
    id: 'dateLine', name: 'Date line', group: 'Titles', desc: 'A day or date, wide spaced, top centre.',
    text: 'DAY 01 · 12 MARCH',
    look: { anchor: 1, align: 'center', size: 0.042, lines: '1', textCase: 'upper', tracking: 1.4, box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'tracking', ms: 3500,
  },
  {
    id: 'breaking', name: 'Breaking', group: 'Titles', desc: 'A red news flash with a headline, bottom left.',
    text: 'BREAKING\nHeadline goes here',
    look: { anchor: 6, align: 'left', size: 0.058, lines: 'keep', x: 0.04, y: 0.12, box: BOX, shadow: NO_SHADOW },
    preset: 'swipeRight', words: (t) => ({ ...firstLine(t, { box: [0.86, 0.1, 0.1] }), ...secondLine(t, [1, 1, 1], 0.85) }), ms: 4000,
  },

  // ── Social ──
  {
    id: 'cta', name: 'Call to action', group: 'Social', desc: 'A short line on a bright rounded box near the bottom.',
    text: 'Link in bio 👇',
    look: { anchor: 7, align: 'center', size: 0.065, lines: '1', y: 0.16, fill: [1, 1, 1], box: { ...BOX, color: [1, 0.35, 0.21], opacity: 1, round: 1, pad: 0.7 }, shadow: NO_SHADOW },
    preset: 'bouncePop', ms: 3000,
  },
  {
    id: 'subscribe', name: 'Subscribe', group: 'Social', desc: 'A red Subscribe button with a bell.',
    text: '🔔 Subscribe',
    look: { anchor: 7, align: 'center', size: 0.07, lines: '1', textCase: 'upper', y: 0.16, fill: [1, 1, 1], box: { ...BOX, color: [0.86, 0.1, 0.1], opacity: 1, round: 0.35, pad: 0.7 }, shadow: NO_SHADOW },
    preset: 'punch', ms: 3000,
  },
  {
    id: 'like', name: 'Like & share', group: 'Social', desc: 'A blue button that wobbles in.',
    text: '👍 Like & Share',
    look: { anchor: 7, align: 'center', size: 0.065, lines: '1', y: 0.16, fill: [1, 1, 1], box: box([0.16, 0.45, 0.95], 1, 0.7), shadow: NO_SHADOW },
    preset: 'jelly', ms: 3000,
  },
  {
    id: 'comment', name: 'Comment below', group: 'Social', desc: 'A white bubble with dark text.',
    text: '💬 Comment below',
    look: { anchor: 7, align: 'center', size: 0.062, lines: '1', y: 0.16, fill: [0.08, 0.08, 0.1], box: box([1, 1, 1], 1, 0.7), shadow: NO_SHADOW },
    preset: 'popDrop', ms: 3000,
  },
  {
    id: 'follow', name: 'Follow', group: 'Social', desc: 'Yellow letters with a dark stroke, snapping up.',
    text: 'Follow for more ➜',
    look: { anchor: 7, align: 'center', size: 0.072, lines: '1', y: 0.14, fill: YELLOW, style: 'Bold', outline: stroke([0, 0, 0], 0.06), box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'snapUp', ms: 3000,
  },
  {
    id: 'hook', name: 'Hook', group: 'Social', desc: 'A big shaking line at the top to keep people watching.',
    text: 'Wait for it…',
    look: { anchor: 1, align: 'center', size: 0.095, lines: '2', fill: [1, 1, 1], style: 'Bold', outline: stroke([0, 0, 0], 0.07), box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'shakeIn', ms: 2500,
  },
  {
    id: 'keyword', name: 'Keyword', group: 'Social', desc: 'A line with its last word on an orange box.',
    text: 'This changes everything',
    look: { anchor: 4, align: 'center', size: 0.08, lines: '2', style: 'Bold', box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'pop', words: (t) => lastWord(t, { box: ORANGE, scale: 1.1 }), ms: 3000,
  },

  // ── Info ──
  {
    id: 'counter', name: 'Counter', group: 'Info', desc: 'A big number that counts up, with a word or two after it.',
    text: '1,000+ followers',
    look: { anchor: 4, align: 'center', size: 0.09, lines: 'auto', count: { on: true, from: 0, ms: 1500 } },
    preset: 'pop', words: () => ({ 0: { color: YELLOW, scale: 1.3 } }), ms: 3500,
  },
  {
    id: 'stat', name: 'Big stat', group: 'Info', desc: 'A huge percentage over a short line that explains it.',
    text: '95%\nof people miss this',
    look: { anchor: 4, align: 'center', size: 0.07, lines: 'keep', count: { on: true, from: 0, ms: 1200 }, box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'zoomPunch', words: () => ({ 0: { color: YELLOW, scale: 2.2 } }), ms: 4000,
  },
  {
    id: 'step', name: 'Step', group: 'Info', desc: 'A numbered step on the left, with what to do.',
    text: 'Step 1\nDo this first',
    look: { anchor: 3, align: 'left', size: 0.062, lines: 'keep', x: 0.02, box: BOX, shadow: NO_SHADOW },
    preset: 'snapLeft', words: (t) => ({ ...firstLine(t, { color: ORANGE, scale: 0.8 }) }), ms: 4000,
  },
  {
    id: 'tip', name: 'Tip', group: 'Info', desc: 'A green tip box, bottom centre.',
    text: '💡 Tip: keep it short',
    look: { anchor: 7, align: 'center', size: 0.058, lines: '2', y: 0.04, fill: [1, 1, 1], box: box([0.1, 0.55, 0.38], 0.4, 0.65), shadow: NO_SHADOW },
    preset: 'riseBounce', ms: 3500,
  },
  {
    id: 'warning', name: 'Important', group: 'Info', desc: 'A yellow warning stamp with dark letters.',
    text: '⚠️ Important',
    look: { anchor: 4, align: 'center', size: 0.075, lines: '1', textCase: 'upper', style: 'Bold', fill: [0.1, 0.08, 0.04], box: box([1, 0.78, 0.15], 0.25, 0.65), shadow: NO_SHADOW },
    preset: 'stamp', ms: 3000,
  },
  {
    id: 'price', name: 'Price', group: 'Info', desc: 'A price that counts up on a bold tag.',
    text: '₹999 only',
    look: { anchor: 8, align: 'right', size: 0.08, lines: '1', x: -0.04, y: 0.1, style: 'Bold', count: { on: true, from: 0, ms: 1000 }, box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'kick', words: () => ({ 0: { box: ORANGE }, 1: { scale: 0.6, color: [0.9, 0.9, 0.92] } }), ms: 3500,
  },
]
