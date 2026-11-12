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

/** Quiet and graceful: slow moves, soft light, nothing sudden */
const CALM: Preset[] = [
  p('Calm', 'warmGlowRise', 'Warm Glow Rise', 'The line rises out of a warm glow that fades as it settles.', {
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 1300, ease: EASE.inOut, state: { opacity: 0, y: 0.25, glow: 0.9, tint: 0.7 } },
    out: fadeOut(400),
  }),
  p('Calm', 'breathFade', 'Breath Fade', 'A slow fade in and out, the line breathing gently in between.', {
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 900, ease: EASE.inOut, state: { opacity: 0 } },
    out: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 700, ease: EASE.inOut, state: { opacity: 0 } },
    loop: { unit: 'whole', periodMs: 4000, stepMs: 0, amp: { scale: 0.015 } },
  }),
  p('Calm', 'goldenDust', 'Golden Dust', 'Grains of gold gather into the line, which glows into place.', {
    particles: { kind: 'dust', count: 50, delayMs: 0, ms: 900, sizeEm: 0.1, spreadEm: 2.4 },
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 600, delayMs: 450, ease: EASE.out, state: { opacity: 0, blur: 0.12, glow: 0.4 } },
    out: fadeOut(350),
  }),
  p('Calm', 'silkWipe', 'Silk Wipe', 'A soft-edged wipe opens the line from the left while it drifts into place.', {
    mask: { kind: 'wipe', angle: 90, soft: 0.35, inMs: 1000, outMs: 450, ease: EASE.inOut },
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 1000, ease: EASE.out, state: { x: -0.18 } },
  }),
  p('Calm', 'mistReveal', 'Mist Reveal', 'The line comes through as if a mist were clearing.', {
    dissolve: { sizeEm: 0.7, soft: 0.45, inMs: 1300, outMs: 600 },
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 1300, ease: EASE.out, state: { blur: 0.12, y: 0.05 } },
  }),
  p('Calm', 'sunriseGradient', 'Sunrise Gradient', 'Gold rises through the letters from the bottom, like first light.', {
    in: fadeWhole(350),
    out: fadeOut(350),
    sweep: { delayMs: 200, ms: 1400, width: 0.5, angle: 0, strength: 0.9, hold: true },
    accent: [1, 0.72, 0.32],
  }),
  p('Calm', 'calmFloat', 'Calm Float', 'Words float gently up and down, one after another.', {
    in: fadeWhole(600),
    out: fadeOut(500),
    loop: { unit: 'word', periodMs: 3600, stepMs: 300, amp: { y: 0.05 } },
  }),
  p('Calm', 'waterReflection', 'Water Reflection', 'The line is mirrored under itself, as on still water with a slow ripple.', {
    in: fadeWhole(500),
    out: fadeOut(400),
    reflect: { opacity: 0.35, fade: 0.75, waveEm: 0.06, sizeEm: 0.5 },
  }),
  p('Calm', 'centerBloom', 'Center Bloom', 'The line opens softly from its centre out to both sides.', {
    mask: { kind: 'split', soft: 0.4, inMs: 1000, outMs: 400, ease: EASE.inOut },
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 1000, ease: EASE.out, state: { scale: 0.96, blur: 0.08 } },
  }),
  p('Calm', 'petalDrift', 'Petal Drift', 'Petals drift past while the line fades in.', {
    particles: { kind: 'petal', count: 12, delayMs: 0, ms: 5000, sizeEm: 0.32, color: [1, 0.72, 0.78] },
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 900, ease: EASE.out, state: { opacity: 0, y: 0.1 } },
    out: fadeOut(400),
  }),
]

/** Phase A's first effects, until their own families come */
const MORE: Preset[] = [
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

export const FX_PRESETS: Preset[] = [...INDIC, ...CALM, ...MORE]
