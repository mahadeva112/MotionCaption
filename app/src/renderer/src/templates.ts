import type { Look, WordLook } from '@core/look'

// Ready-made supers: text, look, animation and length to start from. Everything stays
// editable afterwards like any super; the template only fills it in.

export interface SuperTemplate {
  id: string
  name: string
  desc: string
  text: string
  /** This super's own look, over the supers' look */
  look: Partial<Look>
  preset: string
  /** Word looks for the text as written (word index → look) */
  words?: (text: string) => Record<number, WordLook>
  ms: number
}

const BOX = { on: true, color: [0.08, 0.08, 0.1] as const, opacity: 0.82, round: 0.25, pad: 0.55 }
const NO_SHADOW = { on: false, blur: 0.5, distance: 0.3, opacity: 0.6, color: [0, 0, 0] as const }

/** Every word after the first line, smaller and softer: the title under a name */
function secondLine(text: string): Record<number, WordLook> {
  const [first = '', ...rest] = text.split('\n')
  const firstWords = first.split(/\s+/).filter(Boolean).length
  const restWords = rest.join(' ').split(/\s+/).filter(Boolean).length
  const out: Record<number, WordLook> = {}
  for (let i = 0; i < restWords; i++) out[firstWords + i] = { scale: 0.7, color: [0.8, 0.8, 0.82] }
  return out
}

export const TEMPLATES: SuperTemplate[] = [
  {
    id: 'lowerThird', name: 'Lower third', desc: 'A name, and a title under it, bottom left on a dark box.',
    text: 'Name Surname\nTitle or role',
    look: { anchor: 6, align: 'left', size: 0.06, lines: 'keep', x: 0.05, y: 0.14, box: BOX, shadow: NO_SHADOW },
    preset: 'slideLeft', words: secondLine, ms: 4000,
  },
  {
    id: 'cta', name: 'Call to action', desc: 'A short line on a bright rounded box near the bottom.',
    text: 'Link in bio 👇',
    look: { anchor: 7, align: 'center', size: 0.065, lines: '1', y: 0.16, fill: [1, 1, 1], box: { ...BOX, color: [1, 0.35, 0.21], opacity: 1, round: 1, pad: 0.7 }, shadow: NO_SHADOW },
    preset: 'bouncePop', ms: 3000,
  },
  {
    id: 'subscribe', name: 'Subscribe', desc: 'A red Subscribe button with a bell.',
    text: '🔔 Subscribe',
    look: { anchor: 7, align: 'center', size: 0.07, lines: '1', textCase: 'upper', y: 0.16, fill: [1, 1, 1], box: { ...BOX, color: [0.86, 0.1, 0.1], opacity: 1, round: 0.35, pad: 0.7 }, shadow: NO_SHADOW },
    preset: 'punch', ms: 3000,
  },
  {
    id: 'counter', name: 'Counter', desc: 'A big number that counts up, with a word or two after it.',
    text: '1,000+ followers',
    look: { anchor: 4, align: 'center', size: 0.09, lines: 'auto', count: { on: true, from: 0, ms: 1500 } },
    preset: 'pop', words: () => ({ 0: { color: [1, 0.82, 0.25], scale: 1.3 } }), ms: 3500,
  },
]
