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

/** Masks and wipes: the line uncovered by a moving edge, a shape, a bar or a box */
const MASK: Preset[] = [
  p('Mask & Wipe', 'lineWipe', 'Line Wipe', 'A crisp wipe uncovers the line from left to right, a bright line riding its edge.', {
    mask: { kind: 'wipe', angle: 90, soft: 0.06, inMs: 800, outMs: 400, ease: EASE.inOut, edge: { widthEm: 0.05 } },
  }),
  p('Mask & Wipe', 'diagonalReveal', 'Diagonal Reveal', 'A slanted wipe uncovers the line from the top left corner.', {
    mask: { kind: 'wipe', angle: 135, soft: 0.25, inMs: 900, outMs: 400, ease: EASE.inOut },
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 900, ease: EASE.out, state: { x: -0.06, y: -0.04 } },
  }),
  p('Mask & Wipe', 'circleIris', 'Circle Iris', 'The line opens out of a growing circle and closes into one at the end.', {
    mask: { kind: 'iris', soft: 0.15, inMs: 800, outMs: 500, ease: EASE.inOut },
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 800, ease: EASE.out, state: { scale: 1.06 } },
  }),
  p('Mask & Wipe', 'splitCenter', 'Split Center', 'The line splits open from its centre, a bright line on each edge.', {
    mask: { kind: 'split', soft: 0.04, inMs: 700, outMs: 400, ease: EASE.inOut, edge: { widthEm: 0.05 } },
  }),
  p('Mask & Wipe', 'barReveal', 'Bar Reveal', 'A coloured bar sweeps across and leaves the line behind it.', {
    bar: { delayMs: 0, ms: 900, from: 'left', color: [0.95, 0.42, 0.2] },
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 1, delayMs: 450, ease: EASE.linear, state: { opacity: 0 } },
    out: fadeOut(300),
  }),
  p('Mask & Wipe', 'venetianBlinds', 'Venetian Blinds', 'The line opens through thin strips, like blinds turning.', {
    mask: { kind: 'blinds', soft: 0.3, inMs: 900, outMs: 450, ease: EASE.inOut, bandEm: 0.22 },
  }),
  p('Mask & Wipe', 'softGradientWipe', 'Soft Gradient Wipe', 'A very soft wipe rises from the bottom of the line.', {
    mask: { kind: 'wipe', angle: 0, soft: 0.7, inMs: 1200, outMs: 500, ease: EASE.inOut },
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 1200, ease: EASE.out, state: { y: 0.08 } },
  }),
  p('Mask & Wipe', 'underlineReveal', 'Underline Reveal', 'An underline draws itself, then the words rise up out of it.', {
    marker: { unit: 'line', pick: 'all', order: 'ltr', delayMs: 0, stepMs: 300, ms: 500, opacity: 1, thin: true },
    in: { unit: 'word', order: 'ltr', stepMs: 70, ms: 600, delayMs: 350, ease: EASE.out, state: { y: 1.1 }, masked: true },
    out: fadeOut(300),
  }),
  p('Mask & Wipe', 'boxUnfold', 'Box Unfold', 'A line grows and opens into a box, and the words appear inside it.', {
    box: { delayMs: 0, ms: 800, widthEm: 0.05 },
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 500, delayMs: 550, ease: EASE.out, state: { opacity: 0, scale: 0.94 } },
    out: fadeOut(300),
  }),
  p('Mask & Wipe', 'letterMaskRise', 'Letter Mask Rise', 'Each letter rises out of its own edge, one after another (word by word in Hindi and Bangla).', {
    in: { unit: 'letter', order: 'ltr', stepMs: 35, ms: 520, ease: EASE.out, state: { y: 1.1 }, masked: true },
    out: fadeOut(300),
  }),
]

/** Light and glow: neon, shine, light behind and across the text */
const LIGHT: Preset[] = [
  p('Light & Glow', 'neonFlicker', 'Neon Flicker', 'Each word flickers on like a neon tube warming up, then holds with a glow.', {
    flicker: { unit: 'word', ms: 700, stepMs: 180, tickMs: 60, low: 0.12, glow: 0.18 },
    out: fadeOut(250),
    accent: [1, 0.36, 0.62],
  }),
  p('Light & Glow', 'lightSweep', 'Light Sweep', 'A band of light passes over the letters every few seconds.', {
    in: fadeWhole(300),
    out: fadeOut(250),
    sweep: { delayMs: 350, ms: 900, everyMs: 2600, width: 0.22, angle: 100, strength: 0.85 },
  }),
  p('Light & Glow', 'shinePass', 'Shine Pass', 'A narrow glossy shine passes over the letters again and again.', {
    in: fadeWhole(300),
    out: fadeOut(250),
    sweep: { delayMs: 500, ms: 650, everyMs: 2200, width: 0.18, angle: 110, strength: 1, glow: 0.22, color: [1, 0.97, 0.88] },
  }),
  p('Light & Glow', 'bloomPop', 'Bloom Pop', 'The line pops in with a bright flash of light that settles.', {
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 550, ease: EASE.back, state: { opacity: 0, scale: 0.85, glow: 1.1, tint: 0.8 } },
    out: fadeOut(250),
  }),
  p('Light & Glow', 'glowPulse', 'Glow Pulse', 'A warm glow breathes through the words, one after another.', {
    in: fadeWhole(350),
    out: fadeOut(300),
    loop: { unit: 'word', periodMs: 1800, stepMs: 220, amp: { glow: 0.35, tint: 0.5, scale: 0.025 } },
  }),
  p('Light & Glow', 'backlightRise', 'Backlight Rise', 'A soft light comes up behind the text and the line rises in front of it.', {
    backlight: { delayMs: 0, ms: 900, opacity: 0.55 },
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 800, delayMs: 250, ease: EASE.out, state: { opacity: 0, y: 0.2 } },
    out: fadeOut(350),
  }),
  p('Light & Glow', 'sparkTrail', 'Spark Trail', 'A sparkler writes the line from left to right, throwing sparks.', {
    particles: { kind: 'spark', count: 70, delayMs: 0, ms: 1000, sizeEm: 0.11, color: [1, 0.86, 0.5] },
    mask: { kind: 'wipe', angle: 90, soft: 0.08, inMs: 1000, outMs: 0, ease: EASE.linear },
    out: fadeOut(300),
  }),
  p('Light & Glow', 'haloFade', 'Halo Fade', 'A ring of light spreads out from behind the line as it fades in.', {
    backlight: { delayMs: 0, ms: 1200, opacity: 0.7, ring: true },
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 900, ease: EASE.inOut, state: { opacity: 0, glow: 0.3 } },
    out: fadeOut(350),
  }),
  p('Light & Glow', 'flareReveal', 'Lens Flare Reveal', 'A lens flare crosses the line and leaves it behind.', {
    flare: { delayMs: 0, ms: 1000, sizeEm: 0.85 },
    mask: { kind: 'wipe', angle: 90, soft: 0.25, inMs: 1000, outMs: 0, ease: EASE.inOut },
    out: fadeOut(300),
  }),
  p('Light & Glow', 'goldShimmer', 'Gold Shimmer', 'The line turns gold and small stars glint over it the whole time.', {
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 500, ease: EASE.out, state: { opacity: 0 } },
    out: fadeOut(300),
    particles: { kind: 'twinkle', count: 10, delayMs: 300, ms: 0, sizeEm: 0.36, color: [1, 1, 0.94] },
    loop: { unit: 'whole', periodMs: 3000, stepMs: 0, amp: { glow: 0.12 } },
    base: { tint: 0.85 },
  }),
]

/** Kinetic typography: words that hit, grow, stack and swap, made for short punchy lines */
const KINETIC: Preset[] = [
  p('Kinetic', 'wordSlam', 'Word Slam', 'Words slam in one after another, each landing with a small shake.', {
    in: { unit: 'word', order: 'ltr', stepMs: 170, ms: 260, ease: EASE.in, state: { opacity: 0, scale: 2.2 } },
    impact: { amountEm: 0.05, ms: 220 },
    out: fadeOut(250),
  }),
  p('Kinetic', 'wordScale', 'Word by Word Scale', 'Each word grows from small into place with a little overshoot.', {
    in: { unit: 'word', order: 'ltr', stepMs: 160, ms: 380, ease: EASE.back, state: { opacity: 0, scale: 0.4 } },
    out: { unit: 'word', order: 'ltr', stepMs: 60, ms: 220, ease: EASE.in, state: { opacity: 0, scale: 0.6 } },
  }),
  p('Kinetic', 'stomp', 'Stomp', 'The whole line drops in heavily and the frame shakes as it lands.', {
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 280, ease: EASE.in, state: { opacity: 0, scale: 1.6, y: -0.6 } },
    impact: { amountEm: 0.08, ms: 320 },
    out: fadeOut(250),
  }),
  p('Kinetic', 'emphasisZoom', 'Emphasis Zoom', 'The key word (the longest) zooms forward and lights up while the rest steps back.', {
    in: fadeWhole(250),
    out: fadeOut(250),
    emphasis: { delayMs: 350, ms: 420, ease: EASE.back, state: { scale: 1.08, tint: 0.7, y: -0.05 }, others: { opacity: 0.55, scale: 0.97 } },
  }),
  p('Kinetic', 'stackBuild', 'Stack Build', 'Words pop up from below one after another, building the line.', {
    in: { unit: 'word', order: 'ltr', stepMs: 200, ms: 450, ease: EASE.back, state: { opacity: 0, y: 1.2 } },
    out: fadeOut(250),
  }),
  p('Kinetic', 'pingPong', 'Ping-pong Words', 'Words fly in from the left and the right in turn.', {
    in: { unit: 'word', order: 'ltr', stepMs: 150, ms: 420, ease: EASE.out, state: { opacity: 0, x: -1.4, rotate: -8 }, alternate: true },
    out: fadeOut(250),
  }),
  p('Kinetic', 'beatBump', 'Beat Bump', 'Each word gives a small bump in turn, like a beat.', {
    in: fadeWhole(250),
    out: fadeOut(250),
    loop: { unit: 'word', periodMs: 700, stepMs: 175, amp: { scale: 0.09, y: -0.04 }, pulse: true },
  }),
  p('Kinetic', 'highlightBox', 'Highlight Box', 'A coloured box jumps from word to word as each is spoken.', {
    in: fadeWhole(250),
    out: fadeOut(250),
    marker: { unit: 'word', pick: 'all', order: 'ltr', delayMs: 0, stepMs: 0, ms: 140, opacity: 1, full: true, spoken: true, color: [0.93, 0.33, 0.2] },
  }),
  p('Kinetic', 'wordSwap', 'Word Swap', 'One word at a time in the same place: each rises in as it is spoken and the last stays.', {
    swap: { ms: 180, travelEm: 0.5 },
  }),
  p('Kinetic', 'punchIn', 'Camera Punch-in', 'The line punches in from close up, and the frame shakes as it lands.', {
    in: { unit: 'whole', order: 'ltr', stepMs: 0, ms: 340, ease: EASE.out, state: { opacity: 0, scale: 1.45, blur: 0.06 } },
    impact: { amountEm: 0.05, ms: 260 },
    out: fadeOut(250),
  }),
]

/** Phase A's first effects, until their own families come */
const MORE: Preset[] = [
  p('Advanced', 'waveWarp', 'Wave Warp', 'The line comes in bent like a wave and settles straight.', {
    in: fadeWhole(450),
    out: fadeOut(300),
    warp: { sizeEm: 0.8, amountEm: 1, inMs: 1100, wave: true, drift: 0.5 },
  }),
]

export const FX_PRESETS: Preset[] = [...INDIC, ...CALM, ...MASK, ...LIGHT, ...KINETIC, ...MORE]
