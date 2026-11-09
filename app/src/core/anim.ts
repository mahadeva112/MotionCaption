// The animation model shared by the preview and by Resolve.
// A preset is a list of tracks; each track animates one input of one Fusion node.
// Times are milliseconds (from the caption's start or end), never frames: the Resolve
// bridge turns them into frames with the timeline's own frame rate.

/** CSS-style cubic-bezier (x1, y1, x2, y2). Fusion splines use the same shape as handles. */
export type Bezier = readonly [number, number, number, number]

export const EASE = {
  linear: [0, 0, 1, 1],
  out: [0.22, 1, 0.36, 1],
  in: [0.64, 0, 0.78, 0],
  inOut: [0.65, 0, 0.35, 1],
  /** Overshoots past the target before settling */
  back: [0.34, 1.56, 0.64, 1],
} as const satisfies Record<string, Bezier>

/**
 * Where a track lives in the caption's Fusion comp:
 * - text    the caption's Text+ (whole caption, re-laid out: size, spacing, opacity…)
 * - move    a Transform after the Text+ (position / scale / rotation of the finished caption)
 * - letters a Follower on the Text+ (the same curve runs on every letter, one after another)
 * - word    a Follower limited to the selected characters (Super Select)
 */
export type Target = 'text' | 'move' | 'letters' | 'word'

export type Value = number | readonly [number, number]

export interface Key {
  /** ms from the caption's start (from: 'start') or, negative, from its end (from: 'end') */
  at: number
  from?: 'start' | 'end'
  v: Value
  /** Easing from this key to the next one */
  ease?: Bezier
}

export interface Track {
  target: Target
  /** Fusion input ID on that node, e.g. Size, CharacterSpacing, Opacity1, Center */
  input: string
  keys: Key[]
}

/** Inputs set once (not animated) to make a track work, e.g. softness on the fill */
export interface Fixed {
  target: Target
  input: string
  v: Value
}

export type LetterOrder = 'ltr' | 'rtl'

export interface Letters {
  order: LetterOrder
  /** ms between one letter starting and the next */
  stepMs: number
}
