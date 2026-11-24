import type { Look, Rgb, WordLook } from '@core/look'
import {
  bar, BOX, box, DARK, dot, firstLine, frame, glass, GOLD, GREEN, GREY, lastWord, letterbox, line, lineWords, matching, merge,
  meter, NO_BOX, NO_SHADOW, ORANGE, panel, RED, SAFFRON, secondLine, SOFT_SHADOW, SOFT_WHITE, stroke, sweep, TEAL, WHITE, YELLOW,
  type SuperTemplate, type TemplateGroup, type TemplateLevel,
} from './templateKit'

// The other 156 templates: 70 simple (the text's own look) and 86 advanced, which draw
// shapes around the text (bars, plates, frames, meters, a light sweep, cinema bars) that
// come in on their own timing. Shapes show in Resolve with Finished clips (see Deco.tsx).

type Words = (t: string) => Record<number, WordLook>
const T = (level: TemplateLevel) => (id: string, name: string, group: TemplateGroup, desc: string, text: string,
  look: Partial<Look>, preset: string, ms: number, words?: Words): SuperTemplate => ({ id, name, group, level, desc, text, look, preset, ms, words })
const s = T('simple')
const a = T('advanced')

const NAME = 'Name Surname\nTitle or role'
const LEFT = { anchor: 6, align: 'left', lines: 'keep' } as const
const MID = { anchor: 4, align: 'center' } as const
const LOW = { anchor: 7, align: 'center' } as const
const SILVER: Rgb = [0.8, 0.82, 0.86]
const BRONZE: Rgb = [0.8, 0.52, 0.3]
const bg = (color: Rgb, color2: Rgb, angle = 135): NonNullable<Look['backdrop']> => ({
  on: true, mode: 'gradient', color, color2, angle, opacity: 1, src: '', fit: 'cover',
})
const solidBg = (color: Rgb): NonNullable<Look['backdrop']> => ({
  on: true, mode: 'solid', color, color2: color, angle: 135, opacity: 1, src: '', fit: 'cover',
})
const ticks: Words = (t) => merge(matching(t, /^✓$/, { color: GREEN }), matching(t, /^✕$/, { color: RED }))

const LOWER_THIRD_PALETTES: { id: string; name: string; base: Rgb; accent: Rgb; detail: Rgb }[] = [
  { id: 'midnight-teal', name: 'Midnight Teal', base: [0.035, 0.07, 0.1], accent: [0.15, 0.8, 0.72], detail: [0.64, 0.92, 0.88] },
  { id: 'navy-gold', name: 'Navy Gold', base: [0.035, 0.05, 0.14], accent: [1, 0.76, 0.3], detail: [0.96, 0.83, 0.53] },
  { id: 'plum-rose', name: 'Plum Rose', base: [0.13, 0.045, 0.12], accent: [1, 0.42, 0.62], detail: [1, 0.74, 0.82] },
  { id: 'forest-mint', name: 'Forest Mint', base: [0.025, 0.09, 0.075], accent: [0.38, 0.92, 0.68], detail: [0.71, 0.91, 0.8] },
  { id: 'burgundy-cream', name: 'Burgundy Cream', base: [0.15, 0.025, 0.055], accent: [1, 0.82, 0.62], detail: [1, 0.89, 0.74] },
  { id: 'indigo-cyan', name: 'Indigo Cyan', base: [0.055, 0.045, 0.16], accent: [0.28, 0.82, 1], detail: [0.68, 0.9, 1] },
  { id: 'charcoal-lime', name: 'Charcoal Lime', base: [0.055, 0.06, 0.065], accent: [0.72, 0.96, 0.24], detail: [0.81, 0.86, 0.7] },
  { id: 'cobalt-ice', name: 'Cobalt Ice', base: [0.025, 0.075, 0.2], accent: [0.55, 0.83, 1], detail: [0.78, 0.9, 1] },
  { id: 'aubergine-peach', name: 'Aubergine Peach', base: [0.12, 0.045, 0.13], accent: [1, 0.62, 0.42], detail: [1, 0.8, 0.7] },
  { id: 'olive-champagne', name: 'Olive Champagne', base: [0.09, 0.09, 0.035], accent: [0.94, 0.82, 0.43], detail: [0.9, 0.86, 0.67] },
  { id: 'brick-ivory', name: 'Brick Ivory', base: [0.16, 0.045, 0.035], accent: [1, 0.9, 0.76], detail: [1, 0.77, 0.62] },
  { id: 'ocean-coral', name: 'Ocean Coral', base: [0.02, 0.09, 0.13], accent: [1, 0.43, 0.37], detail: [0.75, 0.87, 0.92] },
  { id: 'graphite-violet', name: 'Graphite Violet', base: [0.055, 0.055, 0.09], accent: [0.72, 0.58, 1], detail: [0.84, 0.8, 0.94] },
  { id: 'pine-copper', name: 'Pine Copper', base: [0.035, 0.08, 0.07], accent: [0.91, 0.5, 0.27], detail: [0.81, 0.88, 0.82] },
  { id: 'sapphire-silver', name: 'Sapphire Silver', base: [0.025, 0.045, 0.13], accent: [0.78, 0.84, 0.94], detail: [0.64, 0.76, 0.91] },
  { id: 'magenta-slate', name: 'Magenta Slate', base: [0.075, 0.045, 0.09], accent: [1, 0.35, 0.77], detail: [0.92, 0.72, 0.88] },
  { id: 'espresso-sand', name: 'Espresso Sand', base: [0.1, 0.055, 0.035], accent: [0.96, 0.75, 0.48], detail: [0.91, 0.82, 0.69] },
  { id: 'steel-blue', name: 'Steel Blue', base: [0.045, 0.075, 0.11], accent: [0.42, 0.71, 0.89], detail: [0.73, 0.84, 0.92] },
  { id: 'ruby-white', name: 'Ruby White', base: [0.15, 0.025, 0.045], accent: [1, 1, 1], detail: [1, 0.7, 0.75] },
  { id: 'petrol-orange', name: 'Petrol Orange', base: [0.025, 0.09, 0.1], accent: [1, 0.55, 0.2], detail: [0.72, 0.88, 0.84] },
  { id: 'moss-gold', name: 'Moss Gold', base: [0.055, 0.075, 0.045], accent: [0.95, 0.78, 0.25], detail: [0.82, 0.88, 0.67] },
  { id: 'ink-lavender', name: 'Ink Lavender', base: [0.045, 0.04, 0.1], accent: [0.78, 0.72, 1], detail: [0.86, 0.83, 0.96] },
  { id: 'cocoa-blush', name: 'Cocoa Blush', base: [0.1, 0.045, 0.05], accent: [1, 0.63, 0.62], detail: [0.94, 0.79, 0.74] },
  { id: 'twilight-aqua', name: 'Twilight Aqua', base: [0.035, 0.055, 0.11], accent: [0.37, 0.94, 0.88], detail: [0.72, 0.88, 0.93] },
  { id: 'onyx-amber', name: 'Onyx Amber', base: [0.045, 0.045, 0.05], accent: [1, 0.64, 0.14], detail: [0.92, 0.83, 0.67] },
]
const PAPER_ORANGE_PALETTES: { id: string; name: string; accent: Rgb; round: number; pad: number }[] = [
  { id: 'paper-tangerine', name: 'Paper Tangerine', accent: [1, 0.36, 0.12], round: 0.08, pad: 0.52 },
  { id: 'porcelain-amber', name: 'Porcelain Amber', accent: [0.93, 0.39, 0.12], round: 0.12, pad: 0.58 },
  { id: 'gallery-orange', name: 'Gallery Orange', accent: [0.96, 0.3, 0.08], round: 0.04, pad: 0.5 },
  { id: 'editorial-orange', name: 'Editorial Orange', accent: [0.88, 0.31, 0.1], round: 0.16, pad: 0.54 },
  { id: 'studio-orange', name: 'Studio Orange', accent: [1, 0.42, 0.16], round: 0.1, pad: 0.62 },
  { id: 'soft-saffron', name: 'Soft Saffron', accent: [0.88, 0.43, 0.12], round: 0.2, pad: 0.55 },
  { id: 'modern-persimmon', name: 'Modern Persimmon', accent: [0.94, 0.32, 0.14], round: 0.03, pad: 0.58 },
  { id: 'minimal-tangerine', name: 'Minimal Tangerine', accent: [1, 0.38, 0.1], round: 0.06, pad: 0.48 },
  { id: 'signature-orange', name: 'Signature Orange', accent: [0.91, 0.35, 0.11], round: 0.14, pad: 0.6 },
  { id: 'white-and-flame', name: 'White & Flame', accent: [0.86, 0.25, 0.08], round: 0.1, pad: 0.56 },
]

export const MORE_TEMPLATES: SuperTemplate[] = [
  // ── Names ──
  s('minimalName', 'Minimal name', 'Names', 'Light letters, no box: a quiet name and role.', NAME,
    { ...LEFT, size: 0.055, x: 0.04, y: 0.1, style: 'Regular', tracking: 1.05, box: NO_BOX, shadow: SOFT_SHADOW }, 'velvet', 4000,
    (t) => secondLine(t, SOFT_WHITE, 0.75)),
  a('accentName', 'Accent bar name', 'Names', 'An orange bar grows beside the name, and a line draws in under it.', NAME,
    { ...LEFT, size: 0.062, x: 0.06, y: 0.13, box: NO_BOX, shadow: SOFT_SHADOW, deco: [bar(ORANGE), line(ORANGE, { amount: 0.45, delay: 350 })] },
    'featherRise', 4000, (t) => secondLine(t, SOFT_WHITE, 0.68)),
  a('glassName', 'Glass name card', 'Names', 'A see-through glass card with an orange dot.', NAME,
    { ...LEFT, size: 0.056, x: 0.08, y: 0.13, box: NO_BOX, shadow: NO_SHADOW, deco: [glass({ gapX: 1.25 }), dot(ORANGE, { size: 0.42, gap: 0.35 })] },
    'smoothRise', 4000, (t) => secondLine(t)),
  a('angledName', 'Angled name', 'Names', 'Two leaning plates slide in, orange over dark.', NAME,
    {
      ...LEFT, size: 0.058, x: 0.06, y: 0.13, box: NO_BOX, shadow: NO_SHADOW, deco: [
        panel(DARK, { skew: 12, gap: 0.3, gapX: 0.8, dx: 0.25, dy: 0.2, opacity: 0.85, in: 'slide', ms: 700 }),
        panel(ORANGE, { skew: 12, gap: 0.3, gapX: 0.8, in: 'slide', ms: 650 }),
      ],
    }, 'glideLeft', 4000, (t) => secondLine(t, WHITE, 0.7)),
  a('cornerName', 'Corner frame name', 'Names', 'Yellow corners close in around a centred name.', NAME,
    { ...LOW, lines: 'keep', size: 0.058, y: 0.04, box: NO_BOX, shadow: SOFT_SHADOW, deco: [frame(YELLOW)] }, 'lensBreath', 4000, (t) => secondLine(t)),
  a('twoToneName', 'Two-tone name', 'Names', 'The name on orange, the role on white, with a white bar.', NAME,
    { ...LEFT, size: 0.06, x: 0.05, y: 0.13, box: NO_BOX, shadow: NO_SHADOW, deco: [bar(WHITE, { size: 0.1, gap: 0.3 })] },
    'glideLeft', 4000, (t) => merge(firstLine(t, { box: ORANGE }), lineWords(t, 1, { box: WHITE, color: DARK, scale: 0.72 }))),
  a('underlineName', 'Underline reveal', 'Names', 'Letters come in left to right as a yellow line draws under them.', NAME,
    { ...LEFT, size: 0.064, x: 0.05, y: 0.12, box: NO_BOX, shadow: SOFT_SHADOW, deco: [line(YELLOW, { amount: 1, size: 0.08, gap: 0.2, delay: 150, ms: 700 })] },
    'letterGlide', 4000, (t) => secondLine(t, YELLOW, 0.62)),
  a('stripName', 'Double strip', 'Names', 'An orange strip and a dark one wipe in, one after the other.', NAME,
    {
      ...LEFT, size: 0.058, x: 0.06, y: 0.14, box: NO_BOX, shadow: NO_SHADOW, deco: [
        panel(ORANGE, { gap: 0.28, gapX: 0.6, dx: -0.18, dy: 0.18, round: 0, ms: 700 }),
        panel(DARK, { gap: 0.28, gapX: 0.6, round: 0, delay: 120, ms: 700, opacity: 0.92 }),
      ],
    }, 'glideLeft', 4000, (t) => secondLine(t)),
  a('barRightName', 'Side bar right', 'Names', 'From the right edge, with a teal bar and line.', NAME,
    {
      anchor: 8, align: 'right', lines: 'keep', size: 0.06, x: -0.06, y: 0.13, box: NO_BOX, shadow: SOFT_SHADOW,
      deco: [bar(TEAL, { side: 'right' }), line(TEAL, { amount: 0.5, delay: 350 })],
    }, 'glideRightIn', 4000, (t) => secondLine(t, TEAL, 0.66)),

  // ── Lower thirds ──
  s('lowerThirdSlate', 'Slate lower third', 'Lower thirds', 'A compact charcoal name card that glides in from the left.', NAME,
    { ...LEFT, size: 0.058, x: 0.055, y: 0.14, box: BOX, shadow: NO_SHADOW }, 'quietPush', 4600,
    (t) => secondLine(t, SOFT_WHITE, 0.68)),
  s('lowerThirdRightTag', 'Right tag lower third', 'Lower thirds', 'A right-aligned name with a saffron title tag, sliding in from the right.', NAME,
    { anchor: 8, align: 'right', lines: 'keep', size: 0.058, x: -0.055, y: 0.14, box: NO_BOX, shadow: SOFT_SHADOW }, 'quietPush', 4600,
    (t) => merge(firstLine(t, { color: WHITE }), lineWords(t, 1, { color: WHITE, box: ORANGE, scale: 0.68 }))),
  s('lowerThirdCenterStack', 'Centered lower third', 'Lower thirds', 'A centred two-line name card that rises gently from the bottom.', NAME,
    { ...LOW, lines: 'keep', size: 0.058, y: 0.04, box: { ...BOX, opacity: 0.76, round: 0.35 }, shadow: NO_SHADOW }, 'quietPush', 4600,
    (t) => secondLine(t, SOFT_WHITE, 0.7)),
  s('lowerThirdMinimalTag', 'Minimal lower third', 'Lower thirds', 'A clean name and small gold role with no panel.', NAME,
    { ...LEFT, size: 0.06, x: 0.05, y: 0.12, box: NO_BOX, shadow: SOFT_SHADOW }, 'quietPush', 4600,
    (t) => secondLine(t, GOLD, 0.62)),
  s('lowerThirdLive', 'Live lower third', 'Lower thirds', 'A crisp broadcast name bar with a red LIVE label.', 'LIVE  Name Surname\nTitle or role',
    { ...LEFT, size: 0.056, x: 0.05, y: 0.14, textCase: 'upper', box: BOX, shadow: NO_SHADOW }, 'quietPush', 4600,
    (t) => merge(firstLine(t, { box: RED }), secondLine(t, SOFT_WHITE, 0.65))),
  a('lowerThirdNeonLine', 'Neon line lower third', 'Lower thirds', 'A teal side bar and underline draw around the name and role.', NAME,
    { ...LEFT, size: 0.06, x: 0.065, y: 0.13, box: NO_BOX, shadow: SOFT_SHADOW, deco: [bar(TEAL, { ms: 950 }), line(TEAL, { amount: 0.5, delay: 300, ms: 1000 })] },
    'quietPush', 4600, (t) => secondLine(t, TEAL, 0.66)),
  a('lowerThirdGlass', 'Glass lower third', 'Lower thirds', 'A translucent glass name card settles into the lower left.', NAME,
    { ...LEFT, size: 0.056, x: 0.075, y: 0.13, box: NO_BOX, shadow: SOFT_SHADOW, deco: [glass({ gapX: 1.1, ms: 1000 }), dot(GOLD, { size: 0.28, gap: 0.28, delay: 250, ms: 900, in: 'fade' })] },
    'quietPush', 4600, (t) => secondLine(t, SOFT_WHITE, 0.68)),
  a('lowerThirdDoubleWipe', 'Double wipe lower third', 'Lower thirds', 'Two offset plates wipe in under a bold name and softer title.', NAME,
    { ...LEFT, size: 0.058, x: 0.065, y: 0.14, box: NO_BOX, shadow: NO_SHADOW,
      deco: [panel(ORANGE, { gap: 0.28, gapX: 0.7, dx: -0.15, dy: 0.16, round: 0, ms: 950 }), panel(DARK, { gap: 0.28, gapX: 0.7, round: 0, delay: 140, opacity: 0.94, ms: 1000 })] },
    'quietPush', 4600, (t) => secondLine(t, SOFT_WHITE, 0.68)),
  a('lowerThirdCornerFrame', 'Corner frame lower third', 'Lower thirds', 'Fine yellow corners close around a low centred name and role.', NAME,
    { ...LOW, lines: 'keep', size: 0.056, y: 0.035, box: NO_BOX, shadow: SOFT_SHADOW, deco: [frame(YELLOW, { size: 0.04, gap: 0.48, amount: 0.65, ms: 1050, in: 'fade' })] },
    'quietPush', 4600, (t) => secondLine(t, YELLOW, 0.65)),
  a('lowerThirdGoldPlate', 'Gold plate lower third', 'Lower thirds', 'A warm gold plate wipes in behind a dark name and white role.', NAME,
    { ...LEFT, size: 0.058, x: 0.06, y: 0.13, fill: DARK, box: NO_BOX, shadow: NO_SHADOW,
      deco: [panel(GOLD, { gap: 0.3, gapX: 0.75, round: 0.08, opacity: 0.96, ms: 1000 }), bar(WHITE, { size: 0.07, gap: 0.25, delay: 220, ms: 950 })] },
    'quietPush', 4600, (t) => secondLine(t, WHITE, 0.68)),

  // Fifty coordinated colour variants: 25 clean cards and 25 animated designs.
  ...LOWER_THIRD_PALETTES.map((p, i) => {
    const anchor = i % 3 === 1 ? 8 : i % 3 === 2 ? 7 : 6
    const align = anchor === 8 ? 'right' : anchor === 7 ? 'center' : 'left'
    const x = anchor === 8 ? -0.055 : anchor === 6 ? 0.055 : 0
    const y = anchor === 7 ? 0.04 : 0.13
    return s(`lt-${p.id}-card`, `${p.name} Card`, 'Lower thirds', `A ${p.name.toLowerCase()} name card with a coordinated accent and role colour.`, NAME,
      { anchor, align, lines: 'keep', size: 0.056, tracking: 1.03, x, y, fill: WHITE, box: box(p.base, 0.16, 0.52, 0.96), shadow: SOFT_SHADOW },
      'quietPush', 4600,
      (t) => merge(firstLine(t, { color: p.accent }), secondLine(t, p.detail, 0.68)))
  }),
  ...LOWER_THIRD_PALETTES.map((p, i) => {
    const anchor = i % 3 === 1 ? 8 : i % 3 === 2 ? 7 : 6
    const align = anchor === 8 ? 'right' : anchor === 7 ? 'center' : 'left'
    const x = anchor === 8 ? -0.06 : anchor === 6 ? 0.06 : 0
    const y = anchor === 7 ? 0.035 : 0.13
    const deco = i % 5 === 0
      ? [panel(p.base, { opacity: 0.94, border: p.accent, borderWidth: 0.025, round: 0.12, gap: 0.35, gapX: 0.72, ms: 1000 }), bar(p.accent, { size: 0.07, ms: 950 })]
      : i % 5 === 1
        ? [bar(p.accent, { side: 'right', size: 0.07, ms: 950 }), line(p.accent, { amount: 0.48, size: 0.04, delay: 300, ms: 1000 })]
        : i % 5 === 2
          ? [frame(p.accent, { size: 0.035, gap: 0.48, amount: 0.72, ms: 1050 })]
          : i % 5 === 3
            ? [glass({ gap: 0.35, gapX: 0.74, border: p.accent, borderWidth: 0.025, ms: 1050 }), line(p.accent, { amount: 0.4, size: 0.035, delay: 300, ms: 1000 })]
            : [panel(p.base, { opacity: 0.96, round: 0.06, gap: 0.3, gapX: 0.65, in: 'slide', ms: 1000 }), bar(p.accent, { size: 0.055, side: 'right', delay: 180, ms: 950 })]
    return a(`lt-${p.id}-motion`, `${p.name} Motion`, 'Lower thirds', `A ${p.name.toLowerCase()} lower third with animated colour accents.`, NAME,
      { anchor, align, lines: 'keep', size: 0.056, tracking: 1.03, x, y, fill: WHITE, box: NO_BOX, shadow: SOFT_SHADOW, deco },
      'quietPush', 4800,
      (t) => merge(firstLine(t, { color: p.accent }), secondLine(t, p.detail, 0.68)))
  }),
  ...PAPER_ORANGE_PALETTES.map((p, i) => {
    const anchor = i % 3 === 1 ? 8 : i % 3 === 2 ? 7 : 6
    const align = anchor === 8 ? 'right' : anchor === 7 ? 'center' : 'left'
    const x = anchor === 8 ? -0.055 : anchor === 6 ? 0.055 : 0
    const y = anchor === 7 ? 0.035 : 0.13
    return s(`lt-paper-${p.id}`, p.name, 'Lower thirds', 'A premium orange name on a clean white lower third.', NAME,
      { anchor, align, lines: 'keep', size: 0.058, tracking: 1.02, x, y, fill: DARK, box: box(WHITE, p.round, p.pad, 0.98), shadow: SOFT_SHADOW },
      'quietPush', 4800,
      (t) => merge(firstLine(t, { color: p.accent }), secondLine(t, [0.18, 0.2, 0.23], 0.68)))
  }),

  // ── Titles ──
  s('stackedTitle', 'Stacked title', 'Titles', 'A small line over a big yellow one.', 'The Art of\nLETTING GO',
    { ...MID, size: 0.07, lines: 'keep', style: 'Bold', box: NO_BOX, shadow: SOFT_SHADOW }, 'blurRise', 4000,
    (t) => lineWords(t, 1, { scale: 1.6, color: YELLOW })),
  a('kineticTitle', 'Kinetic title', 'Titles', 'Slams in, a yellow line shoots under it, then a light runs across.', 'RISE ABOVE',
    {
      ...MID, size: 0.12, lines: '1', font: 'Impact', style: 'Regular', textCase: 'upper', tracking: 1.04, box: NO_BOX, shadow: SOFT_SHADOW,
      deco: [line(YELLOW, { amount: 0.35, size: 0.06, gap: 0.15, delay: 350 }), sweep({ delay: 900 })],
    }, 'lensSettle', 3500),
  a('framedTitle', 'Framed title', 'Titles', 'A serif title inside thin white corners.', 'The Beginning\nChapter one',
    { ...MID, size: 0.08, lines: 'keep', font: 'Georgia', style: 'Regular', box: NO_BOX, shadow: SOFT_SHADOW, deco: [frame(WHITE, { size: 0.05, gap: 0.5, amount: 0.8, delay: 200, ms: 950 })] },
    'titleCard', 4500, (t) => secondLine(t, GOLD, 0.5)),
  a('sweepTitle', 'Light sweep title', 'Titles', 'A wide title pushes in, then a light runs across the letters.', 'AWAKEN',
    { ...MID, size: 0.13, lines: '1', font: 'Bahnschrift', style: 'Bold', tracking: 1.15, box: NO_BOX, shadow: SOFT_SHADOW, deco: [sweep({ delay: 600, ms: 1000 })] },
    'cineReveal', 4000),
  a('linedTitle', 'Lined title', 'Titles', 'Wide spaced letters between two lines that draw out.', 'CHAPTER ONE',
    {
      ...MID, size: 0.06, lines: '1', textCase: 'upper', tracking: 1.35, box: NO_BOX, shadow: SOFT_SHADOW,
      deco: [line(WHITE, { side: 'above', amount: 0.4, size: 0.04, gap: 0.35 }), line(WHITE, { amount: 0.4, size: 0.04, gap: 0.35 })],
    }, 'letterGlide', 4000),
  a('plateTitle', 'White plate title', 'Titles', 'Dark letters on a white plate that wipes in, with an orange edge.', 'Big Announcement',
    {
      ...MID, size: 0.08, lines: '1', fill: DARK, style: 'Bold', box: NO_BOX, shadow: NO_SHADOW,
      deco: [panel(WHITE, { gap: 0.25, gapX: 0.6, round: 0.08, ms: 700 }), bar(ORANGE, { size: 0.18, gap: 0.6 })],
    }, 'lensSettle', 3500),
  a('numberChapter', 'Numbered chapter', 'Titles', 'A big orange number over the chapter name, with a bar.', '01\nThe Beginning',
    { anchor: 3, align: 'left', lines: 'keep', size: 0.075, x: 0.05, box: NO_BOX, shadow: SOFT_SHADOW, deco: [bar(ORANGE, { size: 0.12 })] },
    'featherRise', 4500, (t) => firstLine(t, { scale: 1.8, color: ORANGE })),

  // ── Quotes ──
  s('quoteBox', 'Quote box', 'Quotes', 'A serif quote on a dark box, the speaker in yellow.', '“Words that stay with you.”\n— Speaker',
    { ...LOW, lines: 'keep', size: 0.055, y: 0.02, font: 'Georgia', style: 'Italic', maxWidth: 0.8, box: BOX, shadow: NO_SHADOW }, 'dawn', 5000,
    (t) => lineWords(t, 1, { scale: 0.7, color: YELLOW })),
  s('bigQuoteMark', 'Big quote mark', 'Quotes', 'A huge orange quote mark over the line.', '“\nWords that stay with you',
    { ...MID, size: 0.07, lines: 'keep', font: 'Georgia', style: 'Bold', box: NO_BOX, shadow: SOFT_SHADOW }, 'smoothRise', 4500,
    (t) => firstLine(t, { scale: 2.4, color: ORANGE })),
  s('highlightQuote', 'Highlighted word', 'Quotes', 'A short line with its last word on yellow.', 'Stay with the breath',
    { ...LOW, size: 0.07, lines: '2', y: 0.04, style: 'Bold', box: NO_BOX, shadow: SOFT_SHADOW }, 'softPop', 3500,
    (t) => lastWord(t, { box: YELLOW, color: DARK })),
  s('lowQuote', 'Low quote', 'Quotes', 'A serif quote low in the middle, nothing else.', '“Words that stay with you.”',
    { ...LOW, size: 0.06, lines: '2', y: 0.03, font: 'Georgia', style: 'Italic', box: NO_BOX, shadow: SOFT_SHADOW }, 'silk', 4500),
  a('glassQuote', 'Glass quote card', 'Quotes', 'The quote on a see-through glass card.', '“Words that stay with you.”\nSpeaker',
    { ...MID, size: 0.06, lines: 'keep', font: 'Georgia', style: 'Italic', maxWidth: 0.7, box: NO_BOX, shadow: NO_SHADOW, deco: [glass({ gap: 0.6, gapX: 0.9 })] },
    'velvet', 5000, (t) => lineWords(t, 1, { scale: 0.65, color: YELLOW })),
  a('barQuote', 'Quote with bar', 'Quotes', 'A yellow bar grows beside a left-set quote.', '“Words that stay\nwith you.”\n— Speaker',
    { anchor: 3, align: 'left', lines: 'keep', size: 0.062, x: 0.07, font: 'Georgia', style: 'Italic', box: NO_BOX, shadow: SOFT_SHADOW, deco: [bar(YELLOW, { size: 0.1, gap: 0.45, ms: 950 })] },
    'featherRise', 5500, (t) => lineWords(t, 2, { scale: 0.7, color: YELLOW })),
  a('typeQuote', 'Typewriter quote', 'Quotes', 'Typed letter by letter on a dark card.', 'Words that stay with you.',
    { ...LOW, size: 0.055, lines: '2', y: 0.03, font: 'Consolas', style: 'Regular', box: NO_BOX, shadow: NO_SHADOW, deco: [panel(DARK, { opacity: 0.78, gap: 0.45, gapX: 0.8, round: 0.12, in: 'fade', ms: 550 })] },
    'typewriter', 5000),
  a('signedQuote', 'Signed quote', 'Quotes', 'A short yellow line draws in before the speaker.', '“Words that stay with you.”\nSpeaker',
    { ...MID, size: 0.065, lines: 'keep', font: 'Georgia', style: 'Italic', box: NO_BOX, shadow: SOFT_SHADOW, deco: [line(YELLOW, { amount: 0.25, size: 0.05, gap: 0.3, delay: 700, ms: 950 })] },
    'silk', 5000, (t) => lineWords(t, 1, { scale: 0.7, color: YELLOW })),
  a('frameQuote', 'Golden frame quote', 'Quotes', 'Gold corners, then a gold light across the words.', 'Words that\nstay with you',
    { ...MID, size: 0.075, lines: 'keep', font: 'Georgia', style: 'Regular', box: NO_BOX, shadow: SOFT_SHADOW, deco: [frame(GOLD, { size: 0.05, amount: 0.9, gap: 0.55 }), sweep({ color: GOLD, delay: 900 })] },
    'titleCard', 5000),

  // ── Social ──
  a('subscribePop', 'Subscribe pop', 'Social', 'A red button pops in and a light runs across it.', '🔔 SUBSCRIBE',
    { ...LOW, size: 0.07, lines: '1', y: 0.14, style: 'Bold', box: NO_BOX, shadow: NO_SHADOW, deco: [panel(RED, { round: 0.3, gap: 0.4, gapX: 0.7, in: 'pop', ms: 700 }), sweep({ delay: 800 })] },
    'softPop', 3000),
  a('swipeUpCta', 'Swipe up', 'Social', 'Swipes up, with a line drawing out under it.', '⬆ Swipe up',
    { ...LOW, size: 0.065, lines: '1', y: 0.1, style: 'Bold', box: NO_BOX, shadow: SOFT_SHADOW, deco: [line(WHITE, { amount: 0.5, size: 0.06, gap: 0.3 })] },
    'smoothRise', 3000),
  a('linkBio', 'Link in bio card', 'Social', 'A glass card with an orange dot, low in the middle.', 'Link in bio\nTap to open',
    { ...LOW, align: 'left', lines: 'keep', size: 0.055, y: 0.12, box: NO_BOX, shadow: NO_SHADOW, deco: [glass({ gapX: 1.2 }), dot(ORANGE, { size: 0.42, gap: 0.35 })] },
    'swoop', 3500, (t) => secondLine(t, SOFT_WHITE, 0.72)),
  a('notification', 'Notification', 'Social', 'A white notice slides in at the top right, with a red dot.', 'New video\nTap to watch',
    {
      anchor: 2, align: 'left', lines: 'keep', size: 0.045, x: -0.01, fill: DARK, box: NO_BOX, shadow: NO_SHADOW,
      deco: [panel(WHITE, { round: 0.35, gap: 0.45, gapX: 1.3, in: 'slide', ms: 700 }), dot(RED, { size: 0.6, gap: 0.35 })],
    }, 'glideRightIn', 3500, (t) => secondLine(t, [0.35, 0.35, 0.4], 0.8)),
  a('hypePlate', 'Hype plate', 'Social', 'Heavy dark letters on a leaning yellow plate.', 'THIS IS HUGE',
    { ...MID, size: 0.1, lines: '1', font: 'Impact', style: 'Regular', fill: DARK, box: NO_BOX, shadow: NO_SHADOW, deco: [panel(YELLOW, { skew: 8, gap: 0.2, gapX: 0.5, round: 0, in: 'grow', ms: 550 })] },
    'lensSettle', 2500),

  // ── Info ──
  a('countLine', 'Counting number', 'Info', 'A big number counts up while a line fills under it.', '10,000+\npeople joined',
    { ...MID, size: 0.065, lines: 'keep', box: NO_BOX, shadow: SOFT_SHADOW, count: { on: true, from: 0, ms: 1600 }, deco: [line(YELLOW, { amount: 0.3, size: 0.06, gap: 0.3, delay: 200, ms: 1400 })] },
    'softPop', 4000, (t) => firstLine(t, { scale: 2, color: YELLOW })),
  a('progressBar', 'Progress bar', 'Info', 'A meter fills to the number as it counts up.', 'Course progress 72%',
    { ...LEFT, lines: '1', size: 0.05, x: 0.05, y: 0.14, box: NO_BOX, shadow: SOFT_SHADOW, count: { on: true, from: 0, ms: 1200 }, deco: [meter(ORANGE, { amount: 0.72, size: 0.3, gap: 0.4, delay: 0, ms: 1200 })] },
    'glideLeft', 4000, (t) => lastWord(t, { color: YELLOW })),
  a('factCard', 'Fact card', 'Info', 'A dark card with a yellow edge and dot.', 'Did you know?\nA short fact goes here',
    {
      ...LEFT, size: 0.052, x: 0.08, y: 0.13, box: NO_BOX, shadow: NO_SHADOW,
      deco: [panel(DARK, { opacity: 0.85, border: YELLOW, borderWidth: 0.05, round: 0.25, gap: 0.45, gapX: 1.25 }), dot(YELLOW, { size: 0.42, gap: 0.35 })],
    }, 'swoop', 4500, (t) => firstLine(t, { color: YELLOW })),
  a('beforeAfter', 'Before and after', 'Info', 'Two numbers count up; a green line runs under them.', '40% → 85%',
    { ...MID, size: 0.1, lines: '1', style: 'Bold', box: NO_BOX, shadow: SOFT_SHADOW, count: { on: true, from: 0, ms: 1400 }, deco: [line(GREEN, { amount: 1, size: 0.06, gap: 0.2, delay: 300, ms: 1100 })] },
    'lensSettle', 3500, (t) => merge({ 0: { color: SOFT_WHITE, scale: 0.8 } }, lastWord(t, { color: GREEN }))),
  a('checklist', 'Checklist', 'Info', 'Ticks come in one after another beside a green bar.', '✓ Ready\n✓ Set\n✓ Go',
    { anchor: 3, align: 'left', lines: 'keep', size: 0.06, x: 0.07, box: NO_BOX, shadow: SOFT_SHADOW, deco: [bar(GREEN, { size: 0.1 })] },
    'silkLetters', 4000, (t) => matching(t, /^✓$/, { color: GREEN })),
  a('timelineStep', 'Timeline step', 'Info', 'A year with an orange dot and a line drawing out under it.', '2026\nThe year it began',
    { ...LEFT, size: 0.06, x: 0.07, y: 0.13, box: NO_BOX, shadow: SOFT_SHADOW, deco: [dot(ORANGE, { size: 0.45, gap: 0.4, dy: -0.55 }), line(WHITE, { amount: 1, size: 0.04, gap: 0.25, delay: 300 })] },
    'featherRise', 4000, (t) => firstLine(t, { scale: 1.5, color: ORANGE })),

  // ── News ──
  s('headlineBar', 'Headline bar', 'News', 'Dark headline on a white bar, bottom left.', 'Headline goes here',
    { ...LEFT, lines: '1', size: 0.055, x: 0.03, y: 0.1, fill: DARK, font: 'Bahnschrift', style: 'Bold', box: box(WHITE, 0.05, 0.7), shadow: NO_SHADOW }, 'glideLeft', 4000),
  s('source', 'Source', 'News', 'A small source line, top right.', 'Source: News agency',
    { anchor: 2, align: 'right', lines: '1', size: 0.035, box: { ...BOX, opacity: 0.7, round: 0.3, pad: 0.5 }, shadow: NO_SHADOW }, 'glideLeft', 3500,
    () => ({ 0: { color: GREY } })),
  s('update', 'Update', 'News', 'An orange UPDATE tag before the line.', 'UPDATE What changed today',
    { ...LEFT, lines: '1', size: 0.052, x: 0.04, y: 0.1, font: 'Bahnschrift', style: 'Bold', box: NO_BOX, shadow: SOFT_SHADOW }, 'glideLeft', 3500,
    () => ({ 0: { box: ORANGE } })),
  s('liveTag', 'Live tag', 'News', 'A red LIVE tag, top left.', '● LIVE From the venue',
    { anchor: 0, align: 'left', lines: '1', size: 0.045, style: 'Bold', box: NO_BOX, shadow: SOFT_SHADOW }, 'glideLeft', 4000,
    () => ({ 0: { color: RED }, 1: { box: RED } })),
  a('headlinePlate', 'Headline plate', 'News', 'A white plate wipes in with a thick red edge.', 'BREAKING\nHeadline goes here',
    {
      ...LEFT, size: 0.055, x: 0.07, y: 0.12, font: 'Bahnschrift', style: 'Bold', fill: DARK, box: NO_BOX, shadow: NO_SHADOW,
      deco: [panel(WHITE, { round: 0, gap: 0.3, gapX: 0.55, ms: 700 }), bar(RED, { size: 0.3, gap: 0.55, ms: 550 })],
    }, 'glideLeft', 4500, (t) => firstLine(t, { color: RED })),
  a('newsBar', 'News bar', 'News', 'A dark bar wipes in with a red LATEST tag.', 'LATEST Headline goes here',
    { ...LEFT, lines: '1', size: 0.05, x: 0.06, y: 0.08, font: 'Bahnschrift', box: NO_BOX, shadow: NO_SHADOW, deco: [panel(DARK, { opacity: 0.9, round: 0, gap: 0.35, gapX: 0.5, ms: 800 })] },
    'glideLeft', 5000, () => ({ 0: { box: RED } })),
  a('liveFlash', 'Live flash', 'News', 'A dark pill with a red dot that pops in, top left.', 'LIVE · From the venue',
    {
      anchor: 0, align: 'left', lines: '1', size: 0.045, x: 0.02, style: 'Bold', box: NO_BOX, shadow: NO_SHADOW,
      deco: [panel(DARK, { opacity: 0.8, round: 1, gap: 0.4, gapX: 1.3, in: 'fade', ms: 550 }), dot(RED, { size: 0.45, gap: 0.35 })],
    }, 'swoop', 4000, () => ({ 0: { color: RED } })),
  a('pinLocation', 'Location pin', 'News', 'A place with a red bar and a line drawing under it.', '📍 New Delhi\nLive report',
    { ...LEFT, size: 0.06, x: 0.06, y: 0.13, box: NO_BOX, shadow: SOFT_SHADOW, deco: [bar(RED, { size: 0.1 }), line(RED, { amount: 0.5, gap: 0.3, delay: 350 })] },
    'smoothRise', 4000, (t) => secondLine(t, SOFT_WHITE, 0.65)),
  a('headlineStack', 'Headline stack', 'News', 'Three lines cascade in beside an orange bar.', 'Headline here\nMore on the story\nOne more line',
    { anchor: 3, align: 'left', lines: 'keep', size: 0.055, x: 0.07, font: 'Bahnschrift', box: NO_BOX, shadow: SOFT_SHADOW, deco: [bar(ORANGE, { size: 0.12, ms: 950 })] },
    'silkLetters', 5000, (t) => merge(firstLine(t, { scale: 1.25, color: YELLOW }), lineWords(t, 2, { scale: 0.8, color: SOFT_WHITE }))),

  // ── Lists ──
  s('numberedList', 'Numbered list', 'Lists', 'Three numbered points, numbers in yellow.', '1. First point\n2. Second point\n3. Third point',
    { anchor: 3, align: 'left', lines: 'keep', size: 0.055, x: 0.05, box: NO_BOX, shadow: SOFT_SHADOW }, 'silkLetters', 5000,
    (t) => matching(t, /^\d+\.$/, { color: YELLOW })),
  s('bullets', 'Bullet points', 'Lists', 'Three points with orange bullets.', '• First point\n• Second point\n• Third point',
    { anchor: 3, align: 'left', lines: 'keep', size: 0.055, x: 0.05, box: NO_BOX, shadow: SOFT_SHADOW }, 'letterGlide', 5000,
    (t) => matching(t, /^•$/, { color: ORANGE })),
  s('top3', 'Top 3', 'Lists', 'A yellow TOP 3 heading over three ranked lines.', 'TOP 3\n#1 First\n#2 Second\n#3 Third',
    { anchor: 3, align: 'left', lines: 'keep', size: 0.055, x: 0.05, style: 'Bold', box: NO_BOX, shadow: SOFT_SHADOW }, 'featherRise', 5000,
    (t) => merge(firstLine(t, { scale: 1.4, color: YELLOW }), matching(t, /^#\d$/, { color: ORANGE }))),
  s('doDont', 'Do and don’t', 'Lists', 'A green tick and a red cross on a dark box.', '✓ Do this\n✕ Not this',
    { ...MID, lines: 'keep', align: 'left', size: 0.065, box: BOX, shadow: NO_SHADOW }, 'softPop', 4000, ticks),
  a('listBar', 'Animated list', 'Lists', 'Numbered points cascade in beside an orange bar.', '1 First point\n2 Second point\n3 Third point',
    { anchor: 3, align: 'left', lines: 'keep', size: 0.056, x: 0.07, box: NO_BOX, shadow: SOFT_SHADOW, deco: [bar(ORANGE, { size: 0.1, ms: 700 })] },
    'silkLetters', 5000, (t) => matching(t, /^\d$/, { box: ORANGE })),
  a('ranking', 'Ranking', 'Lists', 'Gold, silver and bronze ranks on a dark plate.', '#1 First\n#2 Second\n#3 Third',
    { anchor: 3, align: 'left', lines: 'keep', size: 0.06, x: 0.07, style: 'Bold', box: NO_BOX, shadow: NO_SHADOW, deco: [panel(DARK, { opacity: 0.75, round: 0.2, gap: 0.45, gapX: 0.7, ms: 800 })] },
    'silkLetters', 5000, (t) => matching(t, /^#\d$/, (w) => ({ color: w === '#1' ? GOLD : w === '#2' ? SILVER : BRONZE }))),
  a('prosCons', 'Pros and cons', 'Lists', 'A tick and a cross on a dark plate with a green edge.', '✓ Quick to make\n✕ Costs more',
    {
      ...MID, align: 'left', lines: 'keep', size: 0.06, box: NO_BOX, shadow: NO_SHADOW,
      deco: [panel(DARK, { opacity: 0.8, round: 0.2, gap: 0.45, gapX: 0.7, in: 'fade' }), bar(GREEN, { size: 0.1, gap: 0.75 })],
    }, 'featherRise', 4500, ticks),
  a('agenda', 'Agenda', 'Lists', 'A heading and numbered items, with a yellow bar and line.', 'Today\n1 · Intro\n2 · Practice\n3 · Questions',
    {
      anchor: 3, align: 'left', lines: 'keep', size: 0.052, x: 0.07, box: NO_BOX, shadow: SOFT_SHADOW,
      deco: [bar(YELLOW, { size: 0.1 }), line(YELLOW, { amount: 0.35, size: 0.05, gap: 0.3, delay: 500 })],
    }, 'silkLetters', 6000, (t) => merge(firstLine(t, { scale: 1.4, color: YELLOW }), matching(t, /^\d$/, { color: YELLOW }))),

  // ── Cinematic ──
  s('filmTitle', 'Film title', 'Cinematic', 'A big serif title that fades slowly.', 'The Journey',
    { ...MID, size: 0.11, lines: '1', font: 'Georgia', style: 'Regular', tracking: 1.05, box: NO_BOX, shadow: SOFT_SHADOW }, 'cineReveal', 5000),
  s('spacedCaption', 'Spaced caption', 'Cinematic', 'Small, wide-spaced letters low in the frame.', 'SOMEWHERE QUIET',
    { ...LOW, size: 0.04, lines: '1', y: 0.02, textCase: 'upper', tracking: 1.6, box: NO_BOX, shadow: SOFT_SHADOW }, 'trackOut', 4000),
  s('softSerif', 'Soft serif', 'Cinematic', 'An italic line that comes out of a dreamy blur.', 'And then, silence.',
    { ...MID, size: 0.07, lines: '2', font: 'Georgia', style: 'Italic', box: NO_BOX, shadow: SOFT_SHADOW }, 'dream', 4500),
  s('credits', 'Credits', 'Cinematic', 'A small role over a name, like film credits.', 'DIRECTED BY\nName Surname',
    { ...MID, size: 0.07, lines: 'keep', tracking: 1.1, box: NO_BOX, shadow: SOFT_SHADOW }, 'titleCard', 4500,
    (t) => firstLine(t, { scale: 0.5, color: SOFT_WHITE })),
  s('endCard', 'End card', 'Cinematic', 'A closing thank-you that rises slowly.', 'Thank you\nSee you next time',
    { ...MID, size: 0.1, lines: 'keep', box: NO_BOX, shadow: SOFT_SHADOW }, 'slowRise', 5000, (t) => secondLine(t, SOFT_WHITE, 0.4)),
  s('outlineTitle', 'Outline title', 'Cinematic', 'Dark heavy letters with a white edge.', 'OUTLINE',
    { ...MID, size: 0.14, lines: '1', font: 'Impact', style: 'Regular', fill: [0.05, 0.05, 0.07], outline: stroke(WHITE, 0.06), box: NO_BOX, shadow: NO_SHADOW }, 'lensSettle', 3500),
  a('letterboxCaption', 'Letterbox caption', 'Cinematic', 'Cinema bars close in; wide letters fade up between them.', 'The journey begins',
    { ...LOW, size: 0.045, lines: '1', tracking: 1.3, box: NO_BOX, shadow: SOFT_SHADOW, deco: [letterbox()] }, 'floatFocus', 5000),
  a('lightSweep', 'Light sweep', 'Cinematic', 'A serif title fades up from black, then a light runs across it.', 'THE JOURNEY',
    { ...MID, size: 0.1, lines: '1', font: 'Georgia', style: 'Regular', tracking: 1.2, box: NO_BOX, shadow: SOFT_SHADOW, deco: [sweep({ delay: 800, ms: 1200 })] },
    'trailerFade', 5000),
  a('epicTitle', 'Epic title', 'Cinematic', 'Grows from soft and small into a sharp title over a thin line.', 'BEGIN',
    { ...MID, size: 0.15, lines: '1', font: 'Impact', style: 'Regular', tracking: 1.1, box: NO_BOX, shadow: SOFT_SHADOW, deco: [line(WHITE, { amount: 0.6, size: 0.03, gap: 0.15, delay: 900, ms: 800 })] },
    'epic', 5000),
  a('dreamTitle', 'Dream title', 'Cinematic', 'Out of a heavy blur between cinema bars, with a soft light.', 'Stillness',
    { ...MID, size: 0.1, lines: '1', font: 'Georgia', style: 'Italic', box: NO_BOX, shadow: SOFT_SHADOW, deco: [letterbox({ amount: 0.08 }), sweep({ delay: 1400, opacity: 0.6 })] },
    'ghost', 5000),
  a('lineFrame', 'Line frame', 'Cinematic', 'Long thin corners fade in around a serif title.', 'The Journey\nA film by Name',
    { ...MID, size: 0.075, lines: 'keep', font: 'Georgia', style: 'Regular', box: NO_BOX, shadow: SOFT_SHADOW, deco: [frame(WHITE, { size: 0.03, amount: 1.2, gap: 0.6, delay: 300, ms: 800, in: 'fade' })] },
    'titleCard', 5000, (t) => secondLine(t, SOFT_WHITE, 0.45)),
  a('anamorphicTitle', 'Anamorphic', 'Cinematic', 'Wide letters narrow to shape between two teal lines.', 'HORIZON',
    {
      ...MID, size: 0.09, lines: '1', font: 'Bahnschrift', style: 'Regular', tracking: 1.5, box: NO_BOX, shadow: SOFT_SHADOW,
      deco: [line(TEAL, { side: 'above', amount: 1, size: 0.025, gap: 0.3, delay: 400, ms: 900 }), line(TEAL, { amount: 1, size: 0.025, gap: 0.3, delay: 400, ms: 900 })],
    }, 'anamorphic', 5000),

  // Full-frame backdrops for clean cards and cinematic title treatments.
  s('duskChapter', 'Dusk chapter', 'Cinematic', 'A warm dusk gradient behind a quiet chapter title.', 'CHAPTER TWO\nA new beginning',
    { ...MID, size: 0.075, lines: 'keep', font: 'Georgia', style: 'Regular', tracking: 1.12, box: NO_BOX, shadow: SOFT_SHADOW,
      backdrop: bg([0.035, 0.055, 0.11], [0.34, 0.13, 0.07], 135) }, 'cineReveal', 5000,
    (t) => secondLine(t, GOLD, 0.62)),
  s('noirQuote', 'Noir quote', 'Cinematic', 'An ivory serif quote over a subtle charcoal wash.', '“The night is long.\nThe road is ours.”',
    { ...MID, size: 0.068, lines: 'keep', font: 'Georgia', style: 'Italic', maxWidth: 0.72, fill: SOFT_WHITE, box: NO_BOX, shadow: SOFT_SHADOW,
      backdrop: bg([0.025, 0.03, 0.045], [0.13, 0.15, 0.18], 90) }, 'dream', 5000),
  s('auroraTitle', 'Aurora title', 'Cinematic', 'A teal-to-indigo wash behind a wide, minimal title.', 'AFTER THE RAIN',
    { ...MID, size: 0.072, lines: '1', textCase: 'upper', tracking: 1.28, fill: SOFT_WHITE, box: NO_BOX, shadow: SOFT_SHADOW,
      backdrop: bg([0.025, 0.16, 0.2], [0.075, 0.045, 0.2], 25) }, 'slowRise', 4500),
  s('warmEndSlate', 'Warm end slate', 'Cinematic', 'A warm, simple closing card with a small second line.', 'Thank you\nFor being here',
    { ...MID, size: 0.09, lines: 'keep', font: 'Georgia', style: 'Regular', fill: [1, 0.94, 0.84], box: NO_BOX, shadow: SOFT_SHADOW,
      backdrop: bg([0.16, 0.045, 0.035], [0.38, 0.2, 0.09], 155) }, 'titleCard', 5000,
    (t) => secondLine(t, [0.94, 0.75, 0.55], 0.55)),
  s('blueHour', 'Blue hour', 'Cinematic', 'Cool blue full-frame colour with a gentle title reveal.', 'BLUE HOUR',
    { ...MID, size: 0.105, lines: '1', font: 'Bahnschrift', style: 'Regular', tracking: 1.2, fill: WHITE, box: NO_BOX, shadow: SOFT_SHADOW,
      backdrop: bg([0.018, 0.07, 0.17], [0.08, 0.19, 0.31], 100) }, 'velvet', 4500),
  a('velvetOpener', 'Velvet opener', 'Cinematic', 'A deep blue title card with letterbox bars and a gliding light sweep.', 'THE LONG WAY HOME',
    { ...MID, size: 0.095, lines: '1', font: 'Georgia', style: 'Regular', tracking: 1.16, box: NO_BOX, shadow: SOFT_SHADOW,
      backdrop: bg([0.012, 0.026, 0.07], [0.12, 0.1, 0.2], 135),
      deco: [letterbox({ amount: 0.095, opacity: 0.88 }), sweep({ color: GOLD, delay: 900, ms: 1350, opacity: 0.72 })] }, 'trailerFade', 5600),
  a('emberFrame', 'Ember frame', 'Cinematic', 'Warm full-frame gradient, fine corner frame and a slow title rise.', 'A FILM BY\nNAME SURNAME',
    { ...MID, size: 0.076, lines: 'keep', font: 'Georgia', style: 'Regular', tracking: 1.1, box: NO_BOX, shadow: SOFT_SHADOW,
      backdrop: bg([0.055, 0.025, 0.025], [0.28, 0.09, 0.035], 160),
      deco: [frame(GOLD, { size: 0.035, amount: 1.05, gap: 0.8, delay: 250, ms: 1100, in: 'fade' }), line(GOLD, { amount: 0.3, size: 0.025, gap: 0.24, delay: 850 })] }, 'slowRise', 5600,
    (t) => firstLine(t, { scale: 0.55, color: GOLD })),
  a('glassHorizon', 'Glass horizon', 'Cinematic', 'A glass plate floats over a teal horizon with a fine light line.', 'A DIFFERENT\nPOINT OF VIEW',
    { ...MID, size: 0.072, lines: 'keep', font: 'Bahnschrift', style: 'Regular', tracking: 1.08, box: NO_BOX, shadow: NO_SHADOW,
      backdrop: bg([0.018, 0.13, 0.18], [0.035, 0.035, 0.11], 90),
      deco: [glass({ gap: 0.7, gapX: 1.05, border: TEAL, borderWidth: 0.025, ms: 900 }), line(TEAL, { amount: 0.52, size: 0.025, gap: 0.38, delay: 500 })] }, 'smoothRise', 5200,
    (t) => secondLine(t, [0.7, 0.86, 0.88], 0.68)),
  a('filmNegative', 'Film negative', 'Cinematic', 'A restrained black card with letterbox bars, frame and light pass.', 'STILL\nIN MOTION',
    { ...MID, size: 0.09, lines: 'keep', font: 'Georgia', style: 'Regular', tracking: 1.12, fill: [0.96, 0.93, 0.86], box: NO_BOX, shadow: SOFT_SHADOW,
      backdrop: solidBg([0.018, 0.02, 0.026]),
      deco: [letterbox({ amount: 0.085 }), frame(SOFT_WHITE, { size: 0.026, amount: 0.92, gap: 0.72, delay: 220, in: 'fade' }), sweep({ color: GOLD, delay: 1150, ms: 1100, opacity: 0.72 })] }, 'ghost', 5600),
  a('documentarySlate', 'Documentary slate', 'Cinematic', 'A muted blue slate with a moving plate, accent bar and soft reveal.', 'FIELD NOTES\nA STORY IN THREE PARTS',
    { ...LEFT, size: 0.064, x: 0.08, y: 0.12, lines: 'keep', font: 'Bahnschrift', style: 'Regular', tracking: 1.08, box: NO_BOX, shadow: SOFT_SHADOW,
      backdrop: bg([0.025, 0.07, 0.1], [0.1, 0.18, 0.2], 15),
      deco: [panel(DARK, { opacity: 0.62, gap: 0.6, gapX: 0.9, round: 0.08, in: 'wipe', ms: 850 }), bar(TEAL, { size: 0.055, gap: 0.32, delay: 180, ms: 700 })] }, 'featherRise', 5500,
    (t) => firstLine(t, { scale: 0.58, color: TEAL })),
  a('goldenPremiere', 'Golden premiere', 'Cinematic', 'A midnight-to-gold card with a drawn frame and a bright sweep.', 'THE PREMIERE',
    { ...MID, size: 0.102, lines: '1', font: 'Georgia', style: 'Regular', tracking: 1.18, fill: [1, 0.94, 0.78], box: NO_BOX, shadow: SOFT_SHADOW,
      backdrop: bg([0.045, 0.025, 0.06], [0.24, 0.12, 0.045], 135),
      deco: [frame(GOLD, { size: 0.03, amount: 1.15, gap: 0.68, delay: 250, ms: 1050, in: 'fade' }), sweep({ color: GOLD, delay: 1000, ms: 1200 })] }, 'titleCard', 5500),

  // ── Devotional ──
  s('shloka', 'Shloka', 'Devotional', 'A line in Hindi with its meaning in gold under it.', 'शांति का संदेश\nMessage of peace',
    { ...MID, size: 0.07, lines: 'keep', font: 'Nirmala UI', style: 'Bold', box: NO_BOX, shadow: SOFT_SHADOW }, 'silk', 5000,
    (t) => secondLine(t, GOLD, 0.6)),
  s('mantraLine', 'Mantra line', 'Devotional', 'A gold mantra low in the frame.', 'ॐ नमः शिवाय',
    { ...LOW, size: 0.07, lines: '1', y: 0.03, font: 'Nirmala UI', style: 'Bold', fill: GOLD, box: NO_BOX, shadow: SOFT_SHADOW }, 'dawn', 4500),
  s('translationBox', 'Translation box', 'Devotional', 'Hindi over its English, on a dark box.', 'आज का संदेश\nToday’s message',
    { ...LOW, size: 0.055, lines: 'keep', font: 'Nirmala UI', style: 'Bold', box: BOX, shadow: NO_SHADOW }, 'smoothRise', 4500, (t) => secondLine(t)),
  s('teaching', 'Teaching', 'Devotional', 'A teaching in bold letters with a dark stroke.', 'जो है, उसे स्वीकार करें',
    { ...LOW, size: 0.065, lines: '2', y: 0.03, font: 'Nirmala UI', style: 'Bold', outline: stroke(DARK, 0.05), box: NO_BOX, shadow: SOFT_SHADOW }, 'featherRise', 4500),
  s('eventName', 'Event name', 'Devotional', 'A big saffron event name with a small LIVE under it.', 'महाशिवरात्रि\nLIVE',
    { ...MID, size: 0.1, lines: 'keep', font: 'Nirmala UI', style: 'Bold', fill: SAFFRON, box: NO_BOX, shadow: SOFT_SHADOW }, 'titleCard', 4500,
    (t) => lineWords(t, 1, { scale: 0.4, color: WHITE })),
  a('mantraSweep', 'Mantra with light', 'Devotional', 'A gold mantra comes in letter by letter; a light runs across it.', 'ॐ नमः शिवाय',
    {
      ...MID, size: 0.1, lines: '1', font: 'Nirmala UI', style: 'Bold', fill: GOLD, box: NO_BOX, shadow: SOFT_SHADOW,
      deco: [sweep({ delay: 900, ms: 1200 }), line(GOLD, { amount: 0.4, size: 0.04, gap: 0.3, delay: 600 })],
    }, 'calmLetters', 5500),
  a('shlokaMeaning', 'Shloka with meaning', 'Devotional', 'A saffron bar grows beside the line and its meaning.', 'शांति का संदेश\nMessage of peace',
    { ...LEFT, size: 0.065, x: 0.07, y: 0.13, font: 'Nirmala UI', style: 'Bold', box: NO_BOX, shadow: SOFT_SHADOW, deco: [bar(SAFFRON, { size: 0.12 })] },
    'featherRise', 5000, (t) => secondLine(t, SOFT_WHITE, 0.6)),
  a('goldenFrame', 'Golden frame', 'Devotional', 'Gold corners around a soft dark plate.', 'आज का संदेश\nToday’s message',
    {
      ...MID, size: 0.075, lines: 'keep', font: 'Nirmala UI', style: 'Bold', box: NO_BOX, shadow: SOFT_SHADOW,
      deco: [panel(DARK, { opacity: 0.45, gap: 0.55, gapX: 0.82, round: 0, in: 'fade' }), frame(GOLD, { size: 0.05, amount: 0.9, gap: 0.55 })],
    }, 'titleCard', 5000, (t) => secondLine(t, GOLD, 0.55)),
  a('satsangTitle', 'Satsang title', 'Devotional', 'Cinema bars close in on a big title with a saffron line.', 'सत्संग\nLIVE',
    { ...MID, size: 0.12, lines: 'keep', font: 'Nirmala UI', style: 'Bold', box: NO_BOX, shadow: SOFT_SHADOW, deco: [letterbox({ amount: 0.09 }), line(SAFFRON, { amount: 0.3, gap: 0.3, delay: 600 })] },
    'slowRise', 5500, (t) => lineWords(t, 1, { scale: 0.3, color: SAFFRON })),
  a('saffronPlate', 'Saffron plate', 'Devotional', 'A saffron plate pops in, then a soft light runs across.', 'आज का विचार\nThought for today',
    {
      ...LOW, size: 0.055, lines: 'keep', y: 0.03, font: 'Nirmala UI', style: 'Bold', box: NO_BOX, shadow: NO_SHADOW,
      deco: [panel(SAFFRON, { opacity: 0.92, round: 0.3, gap: 0.4, gapX: 0.8, in: 'pop', ms: 700 }), sweep({ delay: 900, opacity: 0.7 })],
    }, 'smoothRise', 4500, (t) => secondLine(t, [1, 0.93, 0.85], 0.7)),
]

