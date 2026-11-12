import { EASE } from './anim.ts'
import type { Fx } from './fx.ts'
import type { Family, Preset } from './presets.ts'

// Advanced effects (fx.ts): drawn by the app, so they show only with Finished clips. Sent as
// editable Text+ they come in plain, since Text+ has nothing to draw them with. They start
// as 'testing' until their look is checked in Resolve output.

function p(family: Family, id: string, name: string, desc: string, fx: Fx): Preset {
  return { id, name, family, desc: `${desc} Finished clips only.`, tracks: [], fx, status: 'testing' }
}

const fadeWhole = (ms: number): Fx['in'] => ({ unit: 'whole', order: 'ltr', stepMs: 0, ms, ease: EASE.out, state: { opacity: 0 } })
const fadeOut = (ms: number): Fx['out'] => ({ unit: 'whole', order: 'ltr', stepMs: 0, ms, ease: EASE.in, state: { opacity: 0 } })

/** Made for Indian scripts: word by word, and the shirorekha (top line) as part of the move */
const INDIC: Preset[] = [
  p('Indic Flow', 'shirorekhaDraw', 'Shirorekha Draw', 'Each line’s top line draws from left to right, then the letters come down from it.', {
    headline: { delayMs: 80, stepMs: 380, drawMs: 650, dropMs: 520 },
    out: fadeOut(300),
  }),
  p('Indic Flow', 'shirorekhaLight', 'Shirorekha Light', 'A band of light runs along the top line of each line of text.', {
    in: fadeWhole(300),
    out: fadeOut(250),
    sweep: { delayMs: 350, ms: 1100, everyMs: 2800, width: 0.26, angle: 90, strength: 1, band: 'headline' },
  }),
  p('Indic Flow', 'wordBloom', 'Word Bloom', 'Each word opens out of a soft blur, one after another.', {
    in: { unit: 'word', order: 'ltr', stepMs: 110, ms: 520, ease: EASE.out, state: { opacity: 0, scale: 0.86, blur: 0.25, y: 0.12 } },
    out: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 300, ease: EASE.in, state: { opacity: 0, blur: 0.15 } },
  }),
  p('Indic Flow', 'karaokeFill', 'Karaoke Fill', 'Each word fills with colour from left to right as it is spoken.', {
    in: fadeWhole(250),
    out: fadeOut(250),
    fill: {},
  }),
  p('Indic Flow', 'markerHighlight', 'Marker Highlight', 'A highlighter stroke is drawn behind the key word (the longest).', {
    in: fadeWhole(250),
    out: fadeOut(250),
    marker: { unit: 'word', pick: 'key', order: 'ltr', delayMs: 350, stepMs: 0, ms: 450, opacity: 0.9, color: [0.93, 0.33, 0.2] },
  }),
  p('Indic Flow', 'wordRiseSoft', 'Word Rise Soft', 'Words rise gently into place, one after another.', {
    in: { unit: 'word', order: 'ltr', stepMs: 90, ms: 620, ease: EASE.out, state: { opacity: 0, y: 0.35 } },
    out: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 300, ease: EASE.in, state: { opacity: 0, y: -0.12 } },
  }),
  p('Indic Flow', 'lineByLine', 'Line by Line', 'Each line comes in on its own, the next after the one before.', {
    in: { unit: 'line', order: 'ltr', stepMs: 480, ms: 620, ease: EASE.out, state: { opacity: 0, y: 0.4, blur: 0.08 } },
    out: fadeOut(300),
  }),
  p('Indic Flow', 'inkSpread', 'Ink Spread', 'Words spread out of a soft, inky blur.', {
    in: { unit: 'word', order: 'ltr', stepMs: 120, ms: 720, ease: EASE.out, state: { opacity: 0, blur: 0.45, scale: 1.08 } },
    out: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 300, ease: EASE.in, state: { opacity: 0, blur: 0.2 } },
    warp: { sizeEm: 0.35, amountEm: 0.25, inMs: 900 },
  }),
  p('Indic Flow', 'softFocus', 'Soft Focus Word', 'The word being spoken is sharp; the others sit softly behind it.', {
    in: fadeWhole(250),
    out: fadeOut(250),
    focus: { state: { blur: 0.06, opacity: 0.5 }, fadeMs: 180 },
  }),
  p('Indic Flow', 'keyWordColor', 'Key Word Color', 'The key word (the longest) takes the accent colour and grows a touch.', {
    in: fadeWhole(250),
    out: fadeOut(250),
    emphasis: { delayMs: 300, ms: 450, ease: EASE.back, state: { tint: 1, scale: 1.05, glow: 0.12 } },
  }),
]

/** Phase A's first effects, until their own families come */
const MORE: Preset[] = [
  p('Advanced', 'silkWipe', 'Silk Wipe', 'A soft-edged wipe opens the line from the left while it drifts into place.', {
    mask: { kind: 'wipe', angle: 90, soft: 0.35, inMs: 1000, outMs: 450, ease: EASE.inOut },
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 1000, ease: EASE.out, state: { x: -0.18 } },
  }),
  p('Advanced', 'lightSweep', 'Light Sweep', 'A band of light passes over the letters every few seconds.', {
    in: fadeWhole(300),
    out: fadeOut(250),
    sweep: { delayMs: 350, ms: 900, everyMs: 2600, width: 0.22, angle: 100, strength: 0.85 },
  }),
  p('Advanced', 'waveWarp', 'Wave Warp', 'The line comes in bent like a wave and settles straight.', {
    in: fadeWhole(450),
    out: fadeOut(300),
    warp: { sizeEm: 0.8, amountEm: 1, inMs: 1100, wave: true, drift: 0.5 },
  }),
  p('Advanced', 'glowPulse', 'Glow Pulse', 'A warm glow breathes through the words, one after another.', {
    in: fadeWhole(350),
    out: fadeOut(300),
    loop: { unit: 'word', periodMs: 1800, stepMs: 220, amp: { glow: 0.35, tint: 0.5, scale: 0.025 } },
  }),
]

export const FX_PRESETS: Preset[] = [...INDIC, ...MORE]
