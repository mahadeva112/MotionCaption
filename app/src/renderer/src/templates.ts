import {
  BOX, box, firstLine, lastWord, NO_BOX, NO_SHADOW, ORANGE, secondLine, SOFT_SHADOW, stroke, TEMPLATE_GROUPS, wordsOf, YELLOW,
  type SuperTemplate,
} from './templateKit'
import { MORE_TEMPLATES } from './templatesMore'

// Ready-made supers: text, look, animation and length to start from. Everything stays
// editable afterwards like any super; the template only fills it in. These are the first
// 25 (all simple); templatesMore.ts has the rest, simple and advanced.

export { TEMPLATE_GROUPS, type SuperTemplate, type TemplateGroup, type TemplateLevel } from './templateKit'

const FIRST: SuperTemplate[] = [
  // ── Names ──
  {
    id: 'lowerThird', name: 'Lower third', group: 'Names', level: 'simple', desc: 'A name, and a title under it, bottom left on a dark box.',
    text: 'Name Surname\nTitle or role',
    look: { anchor: 6, align: 'left', size: 0.06, lines: 'keep', x: 0.05, y: 0.14, box: BOX, shadow: NO_SHADOW },
    preset: 'glideLeft', words: (t) => secondLine(t), ms: 4000,
  },
  {
    id: 'lowerThirdRight', name: 'Lower third right', group: 'Names', level: 'simple', desc: 'The same, from the right edge.',
    text: 'Name Surname\nTitle or role',
    look: { anchor: 8, align: 'right', size: 0.06, lines: 'keep', x: -0.05, y: 0.14, box: BOX, shadow: NO_SHADOW },
    preset: 'glideRightIn', words: (t) => secondLine(t), ms: 4000,
  },
  {
    id: 'nameTag', name: 'Name tag', group: 'Names', level: 'simple', desc: 'The name on an orange tag, the role in white under it.',
    text: 'Name Surname\nTitle or role',
    look: { anchor: 6, align: 'left', size: 0.058, lines: 'keep', x: 0.05, y: 0.14, box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'swoop', words: (t) => ({ ...firstLine(t, { box: ORANGE }), ...secondLine(t, [1, 1, 1], 0.72) }), ms: 4000,
  },
  {
    id: 'cleanName', name: 'Clean name', group: 'Names', level: 'simple', desc: 'No box: a name with a soft shadow and a thin line of role.',
    text: 'Name Surname\nTitle or role',
    look: { anchor: 6, align: 'left', size: 0.062, lines: 'keep', x: 0.04, y: 0.12, box: NO_BOX, shadow: SOFT_SHADOW, style: 'Bold' },
    preset: 'smoothRise', words: (t) => secondLine(t, YELLOW, 0.62), ms: 4000,
  },
  {
    id: 'centerName', name: 'Centre name', group: 'Names', level: 'simple', desc: 'Name and role centred low, for a speaker on the middle.',
    text: 'Name Surname\nTitle or role',
    look: { anchor: 7, align: 'center', size: 0.06, lines: 'keep', y: 0.02, box: { ...BOX, opacity: 0.7, round: 0.4 }, shadow: NO_SHADOW },
    preset: 'smoothRise', words: (t) => secondLine(t), ms: 4000,
  },

  // ── Titles ──
  {
    id: 'bigTitle', name: 'Big title', group: 'Titles', level: 'simple', desc: 'One big heavy word or line, slammed in the middle.',
    text: 'BIG TITLE',
    look: { anchor: 4, align: 'center', size: 0.13, lines: '1', textCase: 'upper', style: 'Bold', tracking: 1.02, box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'lensSettle', ms: 3000,
  },
  {
    id: 'chapter', name: 'Chapter', group: 'Titles', level: 'simple', desc: 'A small chapter line over a wide spaced title.',
    text: 'Chapter One\nThe Beginning',
    look: { anchor: 4, align: 'center', size: 0.085, lines: 'keep', textCase: 'upper', tracking: 1.25, box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'cineReveal', words: (t) => ({ ...firstLine(t, { scale: 0.45, color: ORANGE }) }), ms: 4500,
  },
  {
    id: 'elegant', name: 'Elegant title', group: 'Titles', level: 'simple', desc: 'A serif title that fades in slowly; calm and clean.',
    text: 'A Quiet Morning',
    look: { anchor: 4, align: 'center', size: 0.09, lines: '2', font: 'Georgia', style: 'Regular', tracking: 1.08, box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'silkLetters', ms: 4500,
  },
  {
    id: 'quote', name: 'Quote', group: 'Quotes', level: 'simple', desc: 'A quote in serif, the speaker under it.',
    text: '“Words worth remembering\ngo right here.”\n— Speaker',
    look: { anchor: 4, align: 'center', size: 0.065, lines: 'keep', font: 'Georgia', style: 'Italic', maxWidth: 0.7, box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'floatFocus',
    words: (t) => { const n = wordsOf(t).length; return { [n - 2]: { scale: 0.7, color: YELLOW }, [n - 1]: { scale: 0.7, color: YELLOW } } },
    ms: 5500,
  },
  {
    id: 'location', name: 'Location', group: 'Titles', level: 'simple', desc: 'A place name, small, top left on a dark pill.',
    text: '📍 Rishikesh, India',
    look: { anchor: 0, align: 'left', size: 0.045, lines: '1', x: 0.02, box: { ...BOX, round: 1, pad: 0.6 }, shadow: NO_SHADOW },
    preset: 'glideLeft', ms: 3500,
  },
  {
    id: 'dateLine', name: 'Date line', group: 'Titles', level: 'simple', desc: 'A day or date, wide spaced, top centre.',
    text: 'DAY 01 · 12 MARCH',
    look: { anchor: 1, align: 'center', size: 0.042, lines: '1', textCase: 'upper', tracking: 1.4, box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'letterGlide', ms: 3500,
  },
  {
    id: 'breaking', name: 'Breaking', group: 'News', level: 'simple', desc: 'A red news flash with a headline, bottom left.',
    text: 'BREAKING\nHeadline goes here',
    look: { anchor: 6, align: 'left', size: 0.058, lines: 'keep', x: 0.04, y: 0.12, box: BOX, shadow: NO_SHADOW },
    preset: 'glideLeft', words: (t) => ({ ...firstLine(t, { box: [0.86, 0.1, 0.1] }), ...secondLine(t, [1, 1, 1], 0.85) }), ms: 4000,
  },

  // ── Social ──
  {
    id: 'cta', name: 'Call to action', group: 'Social', level: 'simple', desc: 'A short line on a bright rounded box near the bottom.',
    text: 'Link in bio 👇',
    look: { anchor: 7, align: 'center', size: 0.065, lines: '1', y: 0.16, fill: [1, 1, 1], box: { ...BOX, color: [1, 0.35, 0.21], opacity: 1, round: 1, pad: 0.7 }, shadow: NO_SHADOW },
    preset: 'softPop', ms: 3000,
  },
  {
    id: 'subscribe', name: 'Subscribe', group: 'Social', level: 'simple', desc: 'A red Subscribe button with a bell.',
    text: '🔔 Subscribe',
    look: { anchor: 7, align: 'center', size: 0.07, lines: '1', textCase: 'upper', y: 0.16, fill: [1, 1, 1], box: { ...BOX, color: [0.86, 0.1, 0.1], opacity: 1, round: 0.35, pad: 0.7 }, shadow: NO_SHADOW },
    preset: 'softPop', ms: 3000,
  },
  {
    id: 'like', name: 'Like & share', group: 'Social', level: 'simple', desc: 'A blue button that wobbles in.',
    text: '👍 Like & Share',
    look: { anchor: 7, align: 'center', size: 0.065, lines: '1', y: 0.16, fill: [1, 1, 1], box: box([0.16, 0.45, 0.95], 1, 0.7), shadow: NO_SHADOW },
    preset: 'swoop', ms: 3000,
  },
  {
    id: 'comment', name: 'Comment below', group: 'Social', level: 'simple', desc: 'A white bubble with dark text.',
    text: '💬 Comment below',
    look: { anchor: 7, align: 'center', size: 0.062, lines: '1', y: 0.16, fill: [0.08, 0.08, 0.1], box: box([1, 1, 1], 1, 0.7), shadow: NO_SHADOW },
    preset: 'smoothRise', ms: 3000,
  },
  {
    id: 'follow', name: 'Follow', group: 'Social', level: 'simple', desc: 'Yellow letters with a dark stroke, snapping up.',
    text: 'Follow for more ➜',
    look: { anchor: 7, align: 'center', size: 0.072, lines: '1', y: 0.14, fill: YELLOW, style: 'Bold', outline: stroke([0, 0, 0], 0.06), box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'smoothRise', ms: 3000,
  },
  {
    id: 'hook', name: 'Hook', group: 'Social', level: 'simple', desc: 'A big shaking line at the top to keep people watching.',
    text: 'Wait for it…',
    look: { anchor: 1, align: 'center', size: 0.095, lines: '2', fill: [1, 1, 1], style: 'Bold', outline: stroke([0, 0, 0], 0.07), box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'lensSettle', ms: 2500,
  },
  {
    id: 'keyword', name: 'Keyword', group: 'Social', level: 'simple', desc: 'A line with its last word on an orange box.',
    text: 'This changes everything',
    look: { anchor: 4, align: 'center', size: 0.08, lines: '2', style: 'Bold', box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'softPop', words: (t) => lastWord(t, { box: ORANGE, scale: 1.1 }), ms: 3000,
  },

  // ── Info ──
  {
    id: 'counter', name: 'Counter', group: 'Info', level: 'simple', desc: 'A big number that counts up, with a word or two after it.',
    text: '1,000+ followers',
    look: { anchor: 4, align: 'center', size: 0.09, lines: 'auto', count: { on: true, from: 0, ms: 1500 } },
    preset: 'lensSettle', words: () => ({ 0: { color: YELLOW, scale: 1.3 } }), ms: 3500,
  },
  {
    id: 'stat', name: 'Big stat', group: 'Info', level: 'simple', desc: 'A huge percentage over a short line that explains it.',
    text: '95%\nof people miss this',
    look: { anchor: 4, align: 'center', size: 0.07, lines: 'keep', count: { on: true, from: 0, ms: 1200 }, box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'lensSettle', words: () => ({ 0: { color: YELLOW, scale: 2.2 } }), ms: 4000,
  },
  {
    id: 'step', name: 'Step', group: 'Info', level: 'simple', desc: 'A numbered step on the left, with what to do.',
    text: 'Step 1\nDo this first',
    look: { anchor: 3, align: 'left', size: 0.062, lines: 'keep', x: 0.02, box: BOX, shadow: NO_SHADOW },
    preset: 'glideLeft', words: (t) => ({ ...firstLine(t, { color: ORANGE, scale: 0.8 }) }), ms: 4000,
  },
  {
    id: 'tip', name: 'Tip', group: 'Info', level: 'simple', desc: 'A green tip box, bottom centre.',
    text: '💡 Tip: keep it short',
    look: { anchor: 7, align: 'center', size: 0.058, lines: '2', y: 0.04, fill: [1, 1, 1], box: box([0.1, 0.55, 0.38], 0.4, 0.65), shadow: NO_SHADOW },
    preset: 'smoothRise', ms: 3500,
  },
  {
    id: 'warning', name: 'Important', group: 'Info', level: 'simple', desc: 'A yellow warning stamp with dark letters.',
    text: '⚠️ Important',
    look: { anchor: 4, align: 'center', size: 0.075, lines: '1', textCase: 'upper', style: 'Bold', fill: [0.1, 0.08, 0.04], box: box([1, 0.78, 0.15], 0.25, 0.65), shadow: NO_SHADOW },
    preset: 'softPop', ms: 3000,
  },
  {
    id: 'price', name: 'Price', group: 'Info', level: 'simple', desc: 'A price that counts up on a bold tag.',
    text: '₹999 only',
    look: { anchor: 8, align: 'right', size: 0.08, lines: '1', x: -0.04, y: 0.1, style: 'Bold', count: { on: true, from: 0, ms: 1000 }, box: NO_BOX, shadow: SOFT_SHADOW },
    preset: 'swoop', words: () => ({ 0: { box: ORANGE }, 1: { scale: 0.6, color: [0.9, 0.9, 0.92] } }), ms: 3500,
  },
]

/** All templates, by group, simple ones first */
export const TEMPLATES: SuperTemplate[] = [...FIRST, ...MORE_TEMPLATES]
  .map((t, i) => ({ t, i }))
  .sort((a, b) => TEMPLATE_GROUPS.indexOf(a.t.group) - TEMPLATE_GROUPS.indexOf(b.t.group)
    || (a.t.level === b.t.level ? 0 : a.t.level === 'simple' ? -1 : 1) || a.i - b.i)
  .map((x) => x.t)
