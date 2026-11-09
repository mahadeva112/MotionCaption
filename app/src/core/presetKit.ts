import { EASE, type Bezier, type Fixed, type Key, type Track, type Value } from './anim.ts'

// Building blocks for presets. Every input used here was checked in Resolve stills:
// Text+ Opacity1, CharacterSpacing, SoftnessX1/Y1; Transform Size, Center, Angle;
// Follower Opacity1, CharacterOffset, CharacterSizeX/Y.

export const fadeIn = (ms = 250): Track => ({
  target: 'text', input: 'Opacity1',
  keys: [{ at: 0, v: 0, ease: EASE.out }, { at: ms, v: 1 }],
})

export const fadeOut = (ms = 250): Key[] => [
  { at: -ms, from: 'end', v: 1, ease: EASE.in },
  { at: 0, from: 'end', v: 0 },
]

/** Fade in at the start and out at the end, on the caption's own opacity */
export const fadeBoth = (inMs = 250, outMs = 250): Track => ({
  target: 'text', input: 'Opacity1',
  keys: [...fadeIn(inMs).keys, ...fadeOut(outMs)],
})

/** Text+ softness only blurs the letters' fill when this is on */
export const SOFT_FILL: Fixed = { target: 'text', input: 'SoftnessOnFillColorToo1', v: 1 }

/** The same blur keys on both axes */
export const blur = (keys: Key[]): Track[] => [
  { target: 'text', input: 'SoftnessX1', keys },
  { target: 'text', input: 'SoftnessY1', keys },
]

/** Keys from one value to another over ms, from the caption's start */
export const tween = (from: Value, to: Value, ms: number, ease: Bezier = EASE.out, at = 0): Key[] => [
  { at, v: from, ease }, { at: at + ms, v: to },
]

/** Keys from a value to another over the last ms of the caption */
export const exit = (from: Value, to: Value, ms: number, ease: Bezier = EASE.in): Key[] => [
  { at: -ms, from: 'end', v: from, ease }, { at: 0, from: 'end', v: to },
]

/** Keys that run for the whole caption, start to end */
export const whole = (from: Value, to: Value, ease: Bezier = EASE.linear): Key[] => [
  { at: 0, v: from, ease }, { at: 0, from: 'end', v: to },
]

/** Keys at given times from the start: [[ms, value], …], each eased into the next */
export const steps = (pairs: [number, Value][], ease: Bezier = EASE.inOut): Key[] =>
  pairs.map(([at, v]) => ({ at, v, ease }))

/** Transform (whole finished caption) tracks */
export const move = {
  size: (keys: Key[]): Track => ({ target: 'move', input: 'Size', keys }),
  /** [x, y], 0.5 0.5 = in place; y up */
  at: (keys: Key[]): Track => ({ target: 'move', input: 'Center', keys }),
  /** Degrees, counter-clockwise */
  angle: (keys: Key[]): Track => ({ target: 'move', input: 'Angle', keys }),
}

/** Text+ tracks on the whole caption */
export const text = {
  opacity: (keys: Key[]): Track => ({ target: 'text', input: 'Opacity1', keys }),
  spacing: (keys: Key[]): Track => ({ target: 'text', input: 'CharacterSpacing', keys }),
}

/** Follower tracks: the same curve runs on every letter in turn */
export const letter = {
  opacity: (keys: Key[]): Track => ({ target: 'letters', input: 'Opacity1', keys }),
  /** [x, y] offset from the letter's place, in frame widths */
  offset: (keys: Key[]): Track => ({ target: 'letters', input: 'CharacterOffset', keys }),
  size: (keys: Key[]): Track[] => [
    { target: 'letters', input: 'CharacterSizeX', keys },
    { target: 'letters', input: 'CharacterSizeY', keys },
  ],
  sizeX: (keys: Key[]): Track => ({ target: 'letters', input: 'CharacterSizeX', keys }),
  sizeY: (keys: Key[]): Track => ({ target: 'letters', input: 'CharacterSizeY', keys }),
}

export { EASE }
