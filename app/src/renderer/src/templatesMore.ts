import type { Look, Rgb, WordLook } from '@core/look'
import {
  bar, BOX, box, DARK, dot, firstLine, frame, glass, GOLD, GREEN, GREY, lastWord, letterbox, line, lineWords, matching, merge,
  meter, NO_BOX, NO_SHADOW, ORANGE, panel, RED, SAFFRON, secondLine, SOFT_SHADOW, SOFT_WHITE, stroke, sweep, TEAL, WHITE, YELLOW,
  type SuperTemplate, type TemplateGroup, type TemplateLevel,
} from './templateKit'

// The other 75 templates: 25 simple (the text's own look) and all 50 advanced, which draw
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
const ticks: Words = (t) => merge(matching(t, /^✓$/, { color: GREEN }), matching(t, /^✕$/, { color: RED }))

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

