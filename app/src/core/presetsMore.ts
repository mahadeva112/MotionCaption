import type { Fixed, Letters, Track } from './anim.ts'
import type { Family, Preset } from './presets.ts'
import { blur, EASE, exit, fadeBoth, fadeOut, letter, move, SOFT_FILL, steps, text, tween, whole } from './presetKit.ts'

// The library past the first 25. Built only from inputs already proven in Resolve stills
// (see presetKit). A preset stays 'testing' until its look is checked in Resolve output.

function p(id: string, name: string, family: Family, desc: string, tracks: Track[],
  more: { letters?: Letters; fixed?: Fixed[] } = {}): Preset {
  return { id, name, family, desc, tracks, status: UNCHECKED.has(id) ? 'testing' : 'verified', ...more }
}

// Looks checked from Resolve stills on 2026-11-08 (110 presets, 3 stills each). These three
// came back with frames of other captions, so their look is not confirmed yet.
// Quiet, professional title moves added 2026-11-10: small amounts, no overshoot, no bounce.
// Not yet seen in Resolve output, so they start as 'testing'.
const SUBTLE_CINEMATIC = ['cleanCut', 'lensBreath', 'titleCard', 'horizon', 'settleDown', 'focusShift',
  'exitDrift', 'docTitle', 'trailerFade', 'fineRise', 'anamorphic', 'quietPush']
const UNCHECKED = new Set(['cascadeRtl', 'typeFast', 'bounceIn', ...SUBTLE_CINEMATIC])

const L = (stepMs: number, order: Letters['order'] = 'ltr'): { letters: Letters } => ({ letters: { order, stepMs } })
const SOFT = { fixed: [SOFT_FILL] }
const at = (x: number, y = 0.5) => [x, y] as const
const C = at(0.5)

export const MORE_PRESETS: Preset[] = [
  // ── Basic ────────────────────────────────────────────────────────────────
  p('plain', 'Plain', 'Basic', 'No animation. The caption simply appears.', []),
  p('quickFade', 'Quick Fade', 'Basic', 'A fast fade in and out.', [fadeBoth(100, 100)]),
  p('slideLeft', 'Slide In Left', 'Basic', 'Slides in from the left.', [move.at(tween(at(0.44), C, 400)), fadeBoth(250, 200)]),
  p('slideRight', 'Slide In Right', 'Basic', 'Slides in from the right.', [move.at(tween(at(0.56), C, 400)), fadeBoth(250, 200)]),
  p('fall', 'Fall In', 'Basic', 'Comes down from above into place.', [move.at(tween(at(0.5, 0.56), C, 400)), fadeBoth(250, 200)]),
  p('grow', 'Grow', 'Basic', 'Grows from a little smaller.', [move.size(tween(0.8, 1, 350)), fadeBoth(200, 200)]),
  p('settleIn', 'Settle In', 'Basic', 'Starts a little large and eases down to size.', [move.size(tween(1.12, 1, 600)), fadeBoth(300, 200)]),
  p('gentleGrow', 'Gentle Grow', 'Basic', 'A slow, small grow with a soft fade.', [move.size(tween(0.95, 1, 600, EASE.inOut)), fadeBoth(400, 250)]),
  p('bounceIn', 'Bounce In', 'Basic', 'Grows in with a springy overshoot.', [move.size(tween(0.5, 1, 500, EASE.back)), fadeBoth(150, 200)]),
  p('popInOut', 'Pop In & Out', 'Basic', 'Pops in, and pops away at the end.', [
    move.size([...steps([[0, 0.6], [180, 1.08], [320, 1]], EASE.out), ...exit(1, 0.6, 200)]), fadeBoth(120, 200)]),
  p('riseInOut', 'Rise In & Out', 'Basic', 'Rises into place, then keeps rising as it leaves.', [
    move.at([...tween(at(0.5, 0.46), C, 400), ...exit(C, at(0.5, 0.54), 300)]), fadeBoth(300, 300)]),
  p('slideThrough', 'Slide Through', 'Basic', 'Enters from the left and leaves to the right.', [
    move.at([...tween(at(0.45), C, 400), ...exit(C, at(0.55), 300)]), fadeBoth(250, 250)]),
  p('tiltLeft', 'Tilt In Left', 'Basic', 'Turns level from a left tilt.', [move.angle(tween(8, 0, 400)), fadeBoth(250, 200)]),
  p('tiltRight', 'Tilt In Right', 'Basic', 'Turns level from a right tilt.', [move.angle(tween(-8, 0, 400)), fadeBoth(250, 200)]),
  p('blink', 'Blink In', 'Basic', 'Flickers on like a light.', [text.opacity([
    ...steps([[0, 0], [60, 1], [120, 0.2], [200, 1]], EASE.linear), ...fadeOut(150)])]),
  p('fadeUpOut', 'Fade Out Up', 'Basic', 'Fades in, and drifts up as it fades out.', [move.at(exit(C, at(0.5, 0.53), 300)), fadeBoth(250, 300)]),

  // ── Letters ──────────────────────────────────────────────────────────────
  p('cascadeRtl', 'Cascade Right to Left', 'Letters', 'Letters fade in from the last to the first.', [
    letter.opacity(tween(0, 1, 250))], L(30, 'rtl')),
  p('typeFast', 'Fast Type', 'Letters', 'A quick typewriter.', [letter.opacity(tween(0, 1, 30))], L(25)),
  p('typeSlow', 'Slow Type', 'Letters', 'A slow, deliberate typewriter.', [letter.opacity(tween(0, 1, 40))], L(80)),
  p('typeFade', 'Type & Fade', 'Letters', 'Types on, then the whole line fades away.', [
    letter.opacity(tween(0, 1, 40)), text.opacity(fadeOut(400))], L(45)),
  p('letterPop', 'Letter Pop', 'Letters', 'Each letter pops up from small.', [
    ...letter.size(steps([[0, 0.3], [150, 1.15], [260, 1]], EASE.out)), letter.opacity(tween(0, 1, 120))], L(30)),
  p('letterFallSoft', 'Soft Letter Fall', 'Letters', 'Letters float down into place.', [
    letter.offset(tween(at(0, 0.025), at(0, 0), 400)), letter.opacity(tween(0, 1, 300))], L(35)),
  p('quickRise', 'Quick Rise', 'Letters', 'Letters flick up into place, fast.', [
    letter.offset(tween(at(0, -0.02), at(0, 0), 250)), letter.opacity(tween(0, 1, 200))], L(18)),
  p('lettersLeft', 'Letters From Left', 'Letters', 'Letters slide in from the left, one by one.', [
    letter.offset(tween(at(-0.03, 0), at(0, 0), 350)), letter.opacity(tween(0, 1, 250))], L(25)),
  p('lettersRight', 'Letters From Right', 'Letters', 'Letters slide in from the right, last first.', [
    letter.offset(tween(at(0.03, 0), at(0, 0), 350)), letter.opacity(tween(0, 1, 250))], L(25, 'rtl')),
  p('letterSquash', 'Letter Squash', 'Letters', 'Letters spring up from flat.', [
    letter.sizeY(tween(0, 1, 250, EASE.back)), letter.opacity(tween(0, 1, 80))], L(30)),
  p('letterStretch', 'Letter Stretch', 'Letters', 'Wide letters pull in to shape.', [
    letter.sizeX(tween(2.2, 1, 300)), letter.opacity(tween(0, 1, 200))], L(25)),
  p('letterWave', 'Letter Wave', 'Letters', 'Letters bob up as they arrive, like a wave.', [
    letter.offset(steps([[0, at(0, 0)], [150, at(0, 0.012)], [300, at(0, 0)]])), letter.opacity(tween(0, 1, 150))], L(40)),
  p('letterGrow', 'Letter Grow', 'Letters', 'Each letter grows from nothing.', [...letter.size(tween(0, 1, 300))], L(30)),
  p('letterSlam', 'Letter Slam', 'Letters', 'Big letters slam down one at a time.', [
    ...letter.size(tween(2, 1, 200, EASE.in)), letter.opacity(tween(0, 1, 60))], L(45)),
  p('letterFlicker', 'Letter Flicker', 'Letters', 'Letters flicker on one by one.', [
    letter.opacity(steps([[0, 0], [40, 1], [80, 0.3], [140, 1]], EASE.linear))], L(35)),
  p('riseRtl', 'Rise Right to Left', 'Letters', 'Letters float up, from the last to the first.', [
    letter.offset(tween(at(0, -0.03), at(0, 0), 450)), letter.opacity(tween(0, 1, 350))], L(28, 'rtl')),
  p('letterBounce', 'Letter Bounce', 'Letters', 'Letters drop in and bounce.', [
    letter.offset(tween(at(0, 0.03), at(0, 0), 450, EASE.back)), letter.opacity(tween(0, 1, 150))], L(30)),
  p('longReveal', 'Long Reveal', 'Letters', 'A slow left-to-right reveal for long lines.', [
    letter.opacity(tween(0, 1, 500, EASE.inOut))], L(70)),
  p('dropRtl', 'Drop Right to Left', 'Letters', 'Letters drop into place from the last one.', [
    letter.offset(tween(at(0, 0.06), at(0, 0), 350, EASE.back)), letter.opacity(tween(0, 1, 150))], L(25, 'rtl')),
  p('cascadeDissolve', 'Cascade Dissolve', 'Letters', 'Letters fade in one by one; the line blurs away.', [
    letter.opacity(tween(0, 1, 250)), ...blur(exit(0, 10, 500)), text.opacity(fadeOut(400))], { ...L(30), ...SOFT }),
  p('hypeLetters', 'Hype Letters', 'Social', 'Big letters snap down quickly.', [
    ...letter.size(tween(2, 1, 150)), letter.opacity(tween(0, 1, 80))], L(20)),
  p('hopLetters', 'Hop Letters', 'Social', 'Each letter hops once as it lands.', [
    letter.offset(steps([[0, at(0, 0)], [100, at(0, 0.02)], [220, at(0, 0)]], EASE.out)), letter.opacity(tween(0, 1, 60))], L(25)),
  p('calmLetters', 'Calm Letters', 'Letters', 'A slow, quiet letter fade.', [letter.opacity(tween(0, 1, 700, EASE.inOut))], L(55)),
  p('ink', 'Ink', 'Letters', 'Letters settle in like wet ink.', [
    letter.opacity(tween(0, 1, 300)), letter.sizeY(tween(1.15, 1, 300))], L(20)),

  // ── Cinematic ────────────────────────────────────────────────────────────
  p('pushBlur', 'Push In Blur', 'Cinematic', 'Pushes in to size as it comes into focus.', [
    move.size(tween(1.08, 1, 900)), ...blur(tween(8, 0, 600)), fadeBoth(500, 300)], SOFT),
  p('pullBack', 'Pull Back', 'Cinematic', 'The camera pulls back slowly to the title.', [
    move.size(tween(1.15, 1, 1200)), fadeBoth(600, 300)]),
  p('focusOut', 'Rack Focus Out', 'Cinematic', 'Sharp on screen, then drifts out of focus as it leaves.', [
    ...blur(exit(0, 12, 700)), fadeBoth(400, 600)], SOFT),
  p('slowRise', 'Slow Rise', 'Cinematic', 'Rises slowly into place.', [move.at(tween(at(0.5, 0.47), C, 1500)), fadeBoth(700, 300)]),
  p('descend', 'Descend', 'Cinematic', 'Comes down slowly into place.', [move.at(tween(at(0.5, 0.53), C, 1200)), fadeBoth(600, 300)]),
  p('trackOut', 'Wide Tracking Out', 'Cinematic', 'Letters spread apart as it fades out.', [
    text.spacing(exit(1, 1.06, 800)), fadeBoth(400, 600)]),
  p('scope', 'Cinema Scope', 'Cinematic', 'Very wide letters close in slowly, like an epic title.', [
    text.spacing(tween(1.12, 1, 2000)), fadeBoth(900, 400)]),
  p('ghost', 'Ghost In', 'Cinematic', 'Appears slowly out of a heavy blur.', [
    ...blur(tween(20, 0, 1200, EASE.inOut)), fadeBoth(1200, 500)], SOFT),
  p('heavyDrop', 'Heavy Drop', 'Cinematic', 'Drops in fast and lands with weight.', [
    move.at(tween(at(0.5, 0.56), C, 260, EASE.in)), move.size(steps([[260, 1], [340, 0.98], [460, 1]])),
    ...blur(tween(6, 0, 260)), fadeBoth(80, 250)], SOFT),
  p('orbit', 'Orbit In', 'Cinematic', 'Swings in on a slow curve and turns level.', [
    move.angle(tween(-3, 0, 900)), move.at(tween(at(0.47, 0.49), C, 900)), fadeBoth(500, 300)]),
  p('epic', 'Epic Reveal', 'Cinematic', 'Wide, soft and small, it grows into a sharp title.', [
    move.size(tween(0.9, 1, 2000)), text.spacing(tween(1.08, 1, 2000)), ...blur(tween(8, 0, 900)), fadeBoth(900, 400)], SOFT),
  p('finalFrame', 'Final Frame', 'Cinematic', 'A slow fade up and push, then it blurs away.', [
    move.size(whole(1, 1.04)), ...blur(exit(0, 8, 400)), fadeBoth(1200, 400)], SOFT),

  // Subtle set: the kind of moves used on film and documentary titles. Small distances,
  // smooth eases, nothing that jumps.
  p('cleanCut', 'Clean Cut', 'Cinematic', 'A crisp, quick fade through a light blur. Calm, no movement.', [
    ...blur([...tween(3, 0, 220), ...exit(0, 3, 200)]), fadeBoth(160, 160)], SOFT),
  p('lensBreath', 'Lens Breath', 'Cinematic', 'Eases a touch smaller as it comes into focus, like a lens settling.', [
    move.size(tween(1.03, 1, 1000, EASE.inOut)), ...blur(tween(4, 0, 800)), fadeBoth(500, 350)], SOFT),
  p('titleCard', 'Title Card', 'Cinematic', 'A slow fade up while the letters close in by a hair.', [
    text.spacing(tween(1.035, 1, 2400, EASE.inOut)), move.size(whole(1, 1.015)), fadeBoth(900, 600)]),
  p('horizon', 'Horizon', 'Cinematic', 'Lifts a little into place out of a soft blur.', [
    move.at(tween(at(0.5, 0.488), C, 1200, EASE.inOut)), text.spacing(tween(1.025, 1, 1200)),
    ...blur(tween(3, 0, 900)), fadeBoth(700, 400)], SOFT),
  p('settleDown', 'Settle Down', 'Cinematic', 'Lowers gently into place, no bounce.', [
    move.at(tween(at(0.5, 0.512), C, 1000, EASE.inOut)), fadeBoth(600, 350)]),
  p('focusShift', 'Focus Shift', 'Cinematic', 'Pulls into focus, holds sharp, then softens away.', [
    ...blur([...tween(5, 0, 700, EASE.inOut), ...exit(0, 5, 600, EASE.inOut)]), fadeBoth(500, 550)], SOFT),
  p('exitDrift', 'Exit Drift', 'Cinematic', 'Holds still, then drifts left and softens as it leaves.', [
    move.at(exit(C, at(0.49), 700, EASE.inOut)), ...blur(exit(0, 3, 600)), fadeBoth(400, 600)], SOFT),
  p('docTitle', 'Documentary', 'Cinematic', 'A slow sideways drift while the letters open slightly.', [
    move.at(whole(at(0.496), at(0.504))), text.spacing(whole(1, 1.015)), fadeBoth(700, 500)]),
  p('trailerFade', 'Trailer Fade', 'Cinematic', 'Fades up from black while easing back to size.', [
    move.size(tween(1.04, 1, 1600, EASE.inOut)), text.opacity([...tween(0, 1, 1000, EASE.inOut), ...fadeOut(500)])]),
  p('fineRise', 'Fine Letter Rise', 'Cinematic', 'Letters lift a hair into place, quickly and evenly.', [
    letter.offset(tween(at(0, -0.008), at(0, 0), 420)), letter.opacity(tween(0, 1, 380, EASE.inOut))], L(18)),
  p('anamorphic', 'Anamorphic', 'Cinematic', 'Letters come in slightly wide and narrow to shape, soft and even.', [
    letter.sizeX(tween(1.25, 1, 450, EASE.inOut)), letter.opacity(tween(0, 1, 350, EASE.inOut))], L(16)),
  p('quietPush', 'Quiet Push', 'Cinematic', 'Comes into focus, then pushes in very slowly for the rest of the shot.', [
    move.size(whole(1, 1.025)), ...blur(tween(3, 0, 600)), fadeBoth(500, 400)], SOFT),

  // ── Social ───────────────────────────────────────────────────────────────
  p('bouncePop', 'Bounce Pop', 'Social', 'Pops in big, bounces, settles.', [
    move.size(steps([[0, 0], [150, 1.2], [250, 0.9], [350, 1]], EASE.out)), fadeBoth(80, 150)]),
  p('jelly', 'Jelly', 'Social', 'Wobbles into size like jelly.', [
    move.size(steps([[0, 0.7], [120, 1.1], [220, 0.95], [320, 1.03], [420, 1]], EASE.inOut)), fadeBoth(80, 150)]),
  p('swipeUp', 'Swipe Up', 'Social', 'Swipes up in, and swipes up out.', [
    move.at([...tween(at(0.5, 0.4), C, 250), ...exit(C, at(0.5, 0.6), 200)]), fadeBoth(120, 150)]),
  p('swipeLeft', 'Swipe Left', 'Social', 'Swipes in from the right and out to the left.', [
    move.at([...tween(at(0.6), C, 250), ...exit(C, at(0.4), 200)]), fadeBoth(120, 150)]),
  p('swipeRight', 'Swipe Right', 'Social', 'Swipes in from the left and out to the right.', [
    move.at([...tween(at(0.4), C, 250), ...exit(C, at(0.6), 200)]), fadeBoth(120, 150)]),
  p('slamDown', 'Slam Down', 'Social', 'Slams onto the screen with a twist.', [
    move.size(tween(2, 1, 180, EASE.in)), move.angle(tween(-4, 0, 180, EASE.in)), fadeBoth(60, 150)]),
  p('zoomPunch', 'Zoom Punch', 'Social', 'Zooms up from tiny and punches past size.', [
    move.size(steps([[0, 0.3], [140, 1.15], [260, 1]], EASE.out)), fadeBoth(60, 150)]),
  p('shakeIn', 'Shake In', 'Social', 'Lands with a quick shake.', [
    move.at(steps([[0, at(0.51)], [40, at(0.49)], [80, at(0.508)], [120, at(0.494)], [160, at(0.503)], [200, C]], EASE.linear)),
    fadeBoth(60, 150)]),
  p('wiggle', 'Wiggle', 'Social', 'Wiggles side to side as it grows in.', [
    move.angle(steps([[0, -6], [80, 5], [160, -3], [240, 2], [320, 0]])), move.size(tween(0.8, 1, 200)), fadeBoth(80, 150)]),
  p('heartbeat', 'Heartbeat', 'Social', 'Beats twice like a heart.', [
    move.size(steps([[0, 1], [100, 1.1], [200, 1], [300, 1.06], [420, 1]])), fadeBoth(100, 150)]),
  p('spinIn', 'Spin In', 'Social', 'Spins in from small.', [move.angle(tween(25, 0, 350)), move.size(tween(0.5, 1, 350)), fadeBoth(150, 150)]),
  p('snapLeft', 'Snap From Left', 'Social', 'Snaps in from the left with a kick.', [move.at(tween(at(0.42), C, 150, EASE.back)), fadeBoth(50, 150)]),
  p('snapUp', 'Snap Up', 'Social', 'Snaps up into place with a kick.', [move.at(tween(at(0.5, 0.45), C, 150, EASE.back)), fadeBoth(50, 150)]),
  p('popDrop', 'Pop & Drop', 'Social', 'Pops in, then falls off the bottom.', [
    move.size(steps([[0, 0.6], [180, 1.08], [320, 1]], EASE.out)), move.at(exit(C, at(0.5, 0.45), 250)), fadeBoth(100, 200)]),
  p('elastic', 'Elastic', 'Social', 'Stretches past size and springs back.', [
    move.size(steps([[0, 0.4], [180, 1.18], [300, 0.92], [420, 1.05], [550, 1]], EASE.inOut)), fadeBoth(80, 150)]),
  p('quickZoom', 'Quick Zoom', 'Social', 'A short, sharp zoom in.', [move.size(tween(1.3, 1, 120)), fadeBoth(40, 120)]),
  p('stamp', 'Stamp', 'Social', 'Stamps down at an angle and straightens.', [
    move.size(steps([[0, 1.6], [150, 0.95], [260, 1]], EASE.out)), move.angle(tween(-8, 0, 150)), ...blur(tween(4, 0, 150)), fadeBoth(40, 150)], SOFT),
  p('pulseTwice', 'Double Pulse', 'Social', 'Pulses twice to grab attention.', [
    move.size(steps([[0, 1], [200, 1.08], [400, 1], [600, 1.08], [800, 1]])), fadeBoth(120, 150)]),
  p('riseBounce', 'Rise Bounce', 'Social', 'Jumps up into place and bounces.', [move.at(tween(at(0.5, 0.45), C, 450, EASE.back)), fadeBoth(120, 150)]),
  p('kick', 'Kick', 'Social', 'Kicks sideways once as it lands.', [
    move.at(steps([[0, C], [120, at(0.52)], [300, C]])), move.angle(steps([[0, 0], [120, -3], [300, 0]])), fadeBoth(100, 150)]),
  p('zoomAway', 'Zoom Away', 'Social', 'Appears fast, shrinks away at the end.', [move.size(exit(1, 0.3, 250)), fadeBoth(120, 200)]),
  p('blastOut', 'Blast Out', 'Social', 'Pops in, and blasts out toward the camera.', [
    move.size([...steps([[0, 0.6], [180, 1.08], [320, 1]], EASE.out), ...exit(1, 1.8, 200)]), ...blur(exit(0, 10, 200)), fadeBoth(100, 200)], SOFT),
  p('fallOff', 'Fall Off', 'Social', 'Tips over and falls away at the end.', [
    move.at(exit(C, at(0.5, 0.42), 350)), move.angle(exit(0, 8, 350)), fadeBoth(100, 300)]),

  // ── Elegant ──────────────────────────────────────────────────────────────
  p('softFade', 'Soft Fade', 'Elegant', 'A long, gentle fade in and out.', [fadeBoth(700, 600)]),
  p('breathe', 'Breathe', 'Elegant', 'Grows a touch as it fades in, like a breath.', [move.size(tween(0.97, 1, 1200, EASE.inOut)), fadeBoth(800, 400)]),
  p('silk', 'Silk', 'Elegant', 'Letters ease closer as it fades in.', [text.spacing(tween(1.06, 1, 1200)), fadeBoth(700, 400)]),
  p('featherRise', 'Feather Rise', 'Elegant', 'Rises a little and comes into focus.', [
    move.at(tween(at(0.5, 0.48), C, 900)), ...blur(tween(4, 0, 700)), fadeBoth(600, 400)], SOFT),
  p('mist', 'Mist', 'Elegant', 'Comes out of a soft mist and goes back into it.', [
    ...blur([...tween(6, 0, 1000), ...exit(0, 6, 800)]), fadeBoth(900, 800)], SOFT),
  p('gentleLeft', 'Gentle Drift Left', 'Elegant', 'Drifts a little to the left as it settles.', [move.at(tween(at(0.51), C, 1000)), fadeBoth(600, 400)]),
  p('gentleRight', 'Gentle Drift Right', 'Elegant', 'Drifts a little to the right as it settles.', [move.at(tween(at(0.49), C, 1000)), fadeBoth(600, 400)]),
  p('grace', 'Grace', 'Elegant', 'Turns level from a slight lean.', [move.angle(tween(1.5, 0, 1200)), fadeBoth(700, 400)]),
  p('petal', 'Petal', 'Elegant', 'Floats down and turns level, like a petal.', [
    move.at(tween(at(0.5, 0.515), C, 1200)), move.angle(tween(-1.5, 0, 1200)), fadeBoth(700, 400)]),
  p('spread', 'Elegant Spread', 'Elegant', 'Letters open out to their place.', [text.spacing(tween(0.96, 1, 1000)), fadeBoth(700, 400)]),
  p('velvet', 'Velvet', 'Elegant', 'A soft, slow settle into focus.', [
    ...blur(tween(3, 0, 1400)), move.size(tween(1.02, 1, 1400)), fadeBoth(1000, 500)], SOFT),
  p('linger', 'Linger', 'Elegant', 'Appears quickly and fades away slowly.', [fadeBoth(400, 1200)]),
  p('sereneRise', 'Serene Rise', 'Elegant', 'Rises very slowly the whole time it is on screen.', [move.at(whole(at(0.5, 0.495), at(0.5, 0.505))), fadeBoth(700, 700)]),
  p('glowIn', 'Glow In', 'Elegant', 'Letters glow in through a soft blur.', [
    letter.opacity(tween(0, 1, 500, EASE.inOut)), ...blur(tween(5, 0, 900))], { ...L(30), ...SOFT }),
  p('satin', 'Satin Slide', 'Elegant', 'A long, smooth slide in from the left.', [move.at(tween(at(0.47), C, 1400)), fadeBoth(900, 400)]),
  p('hush', 'Hush', 'Elegant', 'Letters close in as it fades in, and open as it fades out.', [
    text.spacing([...tween(1.03, 1, 1000), ...exit(1, 1.03, 1000)]), fadeBoth(1000, 1000)]),
  p('dawn', 'Dawn', 'Elegant', 'Rises slowly out of a blur, like first light.', [
    move.at(tween(at(0.5, 0.49), C, 1500)), ...blur(tween(5, 0, 1500)), text.opacity([...tween(0, 1, 1500, EASE.inOut), ...fadeOut(500)])], SOFT),
  p('softPop', 'Soft Pop', 'Elegant', 'A small, gentle pop.', [move.size(tween(0.94, 1, 450, EASE.back)), fadeBoth(300, 300)]),
  p('slowLetters', 'Slow Letters', 'Elegant', 'Letters appear one by one, slowly and evenly.', [letter.opacity(tween(0, 1, 400, EASE.inOut))], L(90)),
  p('quietFocus', 'Quiet Focus', 'Elegant', 'Comes slowly into focus, without moving.', [...blur(tween(6, 0, 1600, EASE.inOut)), fadeBoth(600, 500)], SOFT),

  // ── Continuous: moves the whole time the caption is on screen ─────────────
  p('floatUp', 'Float Up', 'Continuous', 'Floats slowly upward the whole time.', [move.at(whole(at(0.5, 0.49), at(0.5, 0.51))), fadeBoth(250, 250)]),
  p('sink', 'Sink', 'Continuous', 'Sinks slowly the whole time.', [move.at(whole(at(0.5, 0.51), at(0.5, 0.49))), fadeBoth(250, 250)]),
  p('panLeft', 'Pan Left', 'Continuous', 'Slides slowly to the left the whole time.', [move.at(whole(at(0.52), at(0.48))), fadeBoth(300, 300)]),
  p('glideRight', 'Glide Right', 'Continuous', 'Glides to the right the whole time.', [move.at(whole(at(0.47), at(0.53))), fadeBoth(300, 300)]),
  p('zoomInSlow', 'Slow Zoom In', 'Continuous', 'Grows slowly the whole time.', [move.size(whole(1, 1.06)), fadeBoth(300, 300)]),
  p('zoomOutSlow', 'Slow Zoom Out', 'Continuous', 'Shrinks slowly the whole time.', [move.size(whole(1.06, 1)), fadeBoth(300, 300)]),
  p('sway', 'Sway', 'Continuous', 'Leans slowly from one side to the other.', [move.angle(whole(-1.5, 1.5)), fadeBoth(300, 300)]),
  p('openUp', 'Open Up', 'Continuous', 'Letters spread apart slowly the whole time.', [text.spacing(whole(1, 1.04)), fadeBoth(300, 300)]),
  p('closeIn', 'Close In', 'Continuous', 'Letters draw together slowly the whole time.', [text.spacing(whole(1.05, 1)), fadeBoth(300, 300)]),
  p('riseGrow', 'Rise & Grow', 'Continuous', 'Rises and grows a little the whole time.', [
    move.at(whole(at(0.5, 0.495), at(0.5, 0.505))), move.size(whole(1, 1.03)), fadeBoth(300, 300)]),
  p('dollyLeft', 'Dolly Left', 'Continuous', 'Moves left and closer, like a dolly shot.', [
    move.at(whole(at(0.51), at(0.49))), move.size(whole(1, 1.04)), fadeBoth(300, 300)]),
  p('tiltDrift', 'Tilt Drift', 'Continuous', 'Drifts right and tilts a little.', [move.angle(whole(0, 2)), move.at(whole(at(0.49), at(0.51))), fadeBoth(300, 300)]),
  p('focusPull', 'Focus Pull', 'Continuous', 'Starts soft and sharpens over the whole caption.', [...blur(whole(4, 0)), fadeBoth(300, 300)], SOFT),
  p('slowBurn', 'Slow Burn', 'Continuous', 'Brightens from nothing across the whole caption.', [
    text.opacity([{ at: 0, v: 0, ease: EASE.inOut }, { at: -300, from: 'end', v: 1, ease: EASE.in }, { at: 0, from: 'end', v: 0 }])]),
  p('kenBurns', 'Ken Burns', 'Continuous', 'A slow push and pan, like a photo documentary.', [
    move.size(whole(1, 1.05)), move.at(whole(at(0.49, 0.495), at(0.51, 0.505))), fadeBoth(300, 300)]),
]

