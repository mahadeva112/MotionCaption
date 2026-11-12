import { EASE, type Fixed, type Letters, type Track } from './anim.ts'
import { blur, fadeBoth, SOFT_FILL } from './presetKit.ts'
import type { Fx } from './fx.ts'
import { MORE_PRESETS } from './presetsMore.ts'
import { FX_PRESETS } from './presetsFx.ts'

// Status is honest: 'verified' only after the look was checked in Resolve output.
export type PresetStatus = 'verified' | 'testing'

export const FAMILIES = ['Cinematic', 'Social', 'Elegant', 'Basic', 'Letters', 'Continuous', 'Advanced'] as const
export type Family = (typeof FAMILIES)[number]

export interface Preset {
  id: string
  name: string
  family: Family
  desc: string
  tracks: Track[]
  fixed?: Fixed[]
  letters?: Letters
  /** An advanced effect, drawn by the app only (Finished clips); Text+ gets `tracks` */
  fx?: Fx
  status: PresetStatus
}

const FIRST_PRESETS: Preset[] = [
  {
    id: 'fade', name: 'Fade', family: 'Basic', status: 'verified',
    desc: 'Soft fade in and out.',
    tracks: [fadeBoth(300, 250)],
  },
  {
    id: 'pop', name: 'Pop', family: 'Basic', status: 'verified',
    desc: 'Grows in, overshoots a little, settles.',
    tracks: [
      { target: 'move', input: 'Size', keys: [{ at: 0, v: 0.6, ease: EASE.out }, { at: 180, v: 1.08, ease: EASE.inOut }, { at: 320, v: 1 }] },
      fadeBoth(120, 200),
    ],
  },
  {
    id: 'rise', name: 'Rise', family: 'Basic', status: 'verified',
    desc: 'Slides up into place as it fades in.',
    tracks: [
      { target: 'move', input: 'Center', keys: [{ at: 0, v: [0.5, 0.44], ease: EASE.out }, { at: 420, v: [0.5, 0.5] }] },
      fadeBoth(300, 200),
    ],
  },
  {
    id: 'punch', name: 'Punch In', family: 'Basic', status: 'verified',
    desc: 'Starts big and lands at size.',
    tracks: [
      { target: 'move', input: 'Size', keys: [{ at: 0, v: 1.4, ease: EASE.out }, { at: 350, v: 1 }] },
      fadeBoth(150, 200),
    ],
  },
  {
    id: 'typewriter', name: 'Typewriter', family: 'Letters', status: 'verified',
    desc: 'Letters appear one by one.',
    letters: { order: 'ltr', stepMs: 45 },
    tracks: [{ target: 'letters', input: 'Opacity1', keys: [{ at: 0, v: 0 }, { at: 40, v: 1 }] }],
  },
  {
    id: 'cascade', name: 'Letter Cascade', family: 'Letters', status: 'verified',
    desc: 'Each letter fades in, one after another.',
    letters: { order: 'ltr', stepMs: 30 },
    tracks: [{ target: 'letters', input: 'Opacity1', keys: [{ at: 0, v: 0, ease: EASE.out }, { at: 250, v: 1 }] }],
  },
  {
    id: 'drop', name: 'Drop In', family: 'Letters', status: 'verified',
    desc: 'Letters drop into place one by one.',
    letters: { order: 'ltr', stepMs: 25 },
    tracks: [
      { target: 'letters', input: 'CharacterOffset', keys: [{ at: 0, v: [0, 0.06], ease: EASE.back }, { at: 350, v: [0, 0] }] },
      { target: 'letters', input: 'Opacity1', keys: [{ at: 0, v: 0, ease: EASE.out }, { at: 150, v: 1 }] },
    ],
  },
  {
    id: 'tracking', name: 'Subtle Tracking', family: 'Cinematic', status: 'verified',
    desc: 'Letter spacing slowly closes in.',
    tracks: [
      { target: 'text', input: 'CharacterSpacing', keys: [{ at: 0, v: 1.1, ease: EASE.out }, { at: 1200, v: 1 }] },
      fadeBoth(500, 300),
    ],
  },
  {
    id: 'push', name: 'Slow Push', family: 'Cinematic', status: 'verified',
    desc: 'Grows very slowly for the whole caption.',
    tracks: [
      { target: 'move', input: 'Size', keys: [{ at: 0, v: 1 }, { at: 0, from: 'end', v: 1.06 }] },
      fadeBoth(400, 300),
    ],
  },
  {
    id: 'slam', name: 'Trailer Slam', family: 'Cinematic', status: 'verified',
    desc: 'Slams down from huge, spacing settles after.',
    tracks: [
      { target: 'move', input: 'Size', keys: [{ at: 0, v: 2.2, ease: EASE.in }, { at: 220, v: 1 }] },
      { target: 'text', input: 'CharacterSpacing', keys: [{ at: 0, v: 1.08, ease: EASE.out }, { at: 700, v: 1 }] },
      fadeBoth(80, 200),
    ],
  },
  {
    id: 'focus', name: 'Rack Focus', family: 'Cinematic', status: 'verified',
    desc: 'Comes into focus from a blur.',
    fixed: [{ target: 'text', input: 'SoftnessOnFillColorToo1', v: 1 }],
    tracks: [
      { target: 'text', input: 'SoftnessX1', keys: [{ at: 0, v: 20, ease: EASE.out }, { at: 600, v: 0 }] },
      { target: 'text', input: 'SoftnessY1', keys: [{ at: 0, v: 20, ease: EASE.out }, { at: 600, v: 0 }] },
      fadeBoth(300, 300),
    ],
  },
  {
    id: 'tilt', name: 'Tilt Settle', family: 'Cinematic', status: 'verified',
    desc: 'Turns gently level as it appears.',
    tracks: [
      { target: 'move', input: 'Angle', keys: [{ at: 0, v: -6, ease: EASE.out }, { at: 500, v: 0 }] },
      fadeBoth(250, 250),
    ],
  },

  // ── More cinematic looks, built only from inputs already proven in Resolve stills:
  // blur (SoftnessX1/Y1), spacing, opacity, Transform size/position/angle, Follower letters.
  {
    id: 'blurRise', name: 'Blur Rise', family: 'Cinematic', status: 'verified',
    desc: 'Rises into place as it comes into focus.',
    fixed: [SOFT_FILL],
    tracks: [
      ...blur([{ at: 0, v: 12, ease: EASE.out }, { at: 600, v: 0 }]),
      { target: 'move', input: 'Center', keys: [{ at: 0, v: [0.5, 0.46], ease: EASE.out }, { at: 700, v: [0.5, 0.5] }] },
      fadeBoth(400, 300),
    ],
  },
  {
    id: 'wideReveal', name: 'Wide Reveal', family: 'Cinematic', status: 'verified',
    desc: 'Wide, soft letters gather into a sharp title.',
    fixed: [SOFT_FILL],
    tracks: [
      { target: 'text', input: 'CharacterSpacing', keys: [{ at: 0, v: 1.18, ease: EASE.out }, { at: 1500, v: 1 }] },
      ...blur([{ at: 0, v: 6, ease: EASE.out }, { at: 800, v: 0 }]),
      fadeBoth(600, 300),
    ],
  },
  {
    id: 'dream', name: 'Dream Blur', family: 'Cinematic', status: 'verified',
    desc: 'Drifts in from a blur and dissolves back into one.',
    fixed: [SOFT_FILL],
    tracks: [
      ...blur([
        { at: 0, v: 16, ease: EASE.out }, { at: 700, v: 0 },
        { at: -600, from: 'end', v: 0, ease: EASE.in }, { at: 0, from: 'end', v: 16 },
      ]),
      fadeBoth(500, 500),
    ],
  },
  {
    id: 'impact', name: 'Impact', family: 'Cinematic', status: 'verified',
    desc: 'Hits hard out of a blur and settles.',
    fixed: [SOFT_FILL],
    tracks: [
      { target: 'move', input: 'Size', keys: [{ at: 0, v: 1.5, ease: EASE.in }, { at: 160, v: 0.97, ease: EASE.out }, { at: 380, v: 1 }] },
      ...blur([{ at: 0, v: 10, ease: EASE.out }, { at: 200, v: 0 }]),
      fadeBoth(60, 200),
    ],
  },
  {
    id: 'zoomThrough', name: 'Zoom Through', family: 'Cinematic', status: 'verified',
    desc: 'Grows in from small and flies past the camera on the way out.',
    tracks: [
      {
        target: 'move', input: 'Size',
        keys: [{ at: 0, v: 0.85, ease: EASE.out }, { at: 450, v: 1 }, { at: -350, from: 'end', v: 1, ease: EASE.in }, { at: 0, from: 'end', v: 1.25 }],
      },
      fadeBoth(300, 350),
    ],
  },
  {
    id: 'drift', name: 'Title Drift', family: 'Cinematic', status: 'verified',
    desc: 'Slides slowly sideways for the whole caption, like a film title.',
    tracks: [
      { target: 'move', input: 'Center', keys: [{ at: 0, v: [0.485, 0.5] }, { at: 0, from: 'end', v: [0.515, 0.5] }] },
      fadeBoth(600, 400),
    ],
  },
  {
    id: 'settle', name: 'Drop Settle', family: 'Cinematic', status: 'verified',
    desc: 'Drops from above and settles with a small bounce.',
    tracks: [
      { target: 'move', input: 'Center', keys: [{ at: 0, v: [0.5, 0.54], ease: EASE.back }, { at: 500, v: [0.5, 0.5] }] },
      fadeBoth(250, 250),
    ],
  },
  {
    id: 'expand', name: 'Slow Expand', family: 'Cinematic', status: 'verified',
    desc: 'Letters spread apart slowly, then blur away at the end.',
    fixed: [SOFT_FILL],
    tracks: [
      { target: 'text', input: 'CharacterSpacing', keys: [{ at: 0, v: 1 }, { at: 0, from: 'end', v: 1.06 }] },
      ...blur([{ at: -500, from: 'end', v: 0, ease: EASE.in }, { at: 0, from: 'end', v: 10 }]),
      fadeBoth(500, 400),
    ],
  },
  {
    id: 'swing', name: 'Soft Swing', family: 'Cinematic', status: 'verified',
    desc: 'Leans in from the side and turns level while it grows.',
    tracks: [
      { target: 'move', input: 'Angle', keys: [{ at: 0, v: 4, ease: EASE.out }, { at: 700, v: 0 }] },
      { target: 'move', input: 'Size', keys: [{ at: 0, v: 0.92, ease: EASE.out }, { at: 700, v: 1 }] },
      fadeBoth(400, 300),
    ],
  },
  {
    id: 'fadeThrough', name: 'Long Fade', family: 'Cinematic', status: 'verified',
    desc: 'A slow fade in and out with a gentle push, for quiet moments.',
    tracks: [
      { target: 'move', input: 'Size', keys: [{ at: 0, v: 0.98 }, { at: 0, from: 'end', v: 1.02 }] },
      fadeBoth(900, 700),
    ],
  },
  {
    id: 'letterRise', name: 'Letter Rise', family: 'Cinematic', status: 'verified',
    desc: 'Letters float up into place one by one.',
    letters: { order: 'ltr', stepMs: 28 },
    tracks: [
      { target: 'letters', input: 'CharacterOffset', keys: [{ at: 0, v: [0, -0.03], ease: EASE.out }, { at: 450, v: [0, 0] }] },
      { target: 'letters', input: 'Opacity1', keys: [{ at: 0, v: 0, ease: EASE.out }, { at: 350, v: 1 }] },
    ],
  },
  {
    id: 'spotlight', name: 'Spotlight', family: 'Cinematic', status: 'verified',
    desc: 'Letters glow in slowly from left to right.',
    letters: { order: 'ltr', stepMs: 40 },
    tracks: [{ target: 'letters', input: 'Opacity1', keys: [{ at: 0, v: 0, ease: EASE.inOut }, { at: 650, v: 1 }] }],
  },
  {
    id: 'letterZoom', name: 'Letter Zoom', family: 'Cinematic', status: 'verified',
    desc: 'Each letter shrinks into place from large, one after another.',
    letters: { order: 'ltr', stepMs: 30 },
    tracks: [
      { target: 'letters', input: 'CharacterSizeX', keys: [{ at: 0, v: 1.8, ease: EASE.out }, { at: 300, v: 1 }] },
      { target: 'letters', input: 'CharacterSizeY', keys: [{ at: 0, v: 1.8, ease: EASE.out }, { at: 300, v: 1 }] },
      { target: 'letters', input: 'Opacity1', keys: [{ at: 0, v: 0, ease: EASE.out }, { at: 180, v: 1 }] },
    ],
  },
]

export const PRESETS: Preset[] = [...FIRST_PRESETS, ...MORE_PRESETS, ...FX_PRESETS]

/** Effects for selected words (Super Select). Colour comes from the word's own setting. */
export interface WordFx {
  id: string
  name: string
  tracks: Track[]
  status: PresetStatus
}

export const WORD_FX: WordFx[] = [
  { id: 'color', name: 'Colour only', status: 'verified', tracks: [] },
  {
    id: 'pop', name: 'Pop', status: 'verified',
    tracks: [
      // Kept small: bigger letters overlap. Spacing is not animated: on a centred line it
      // re-centres the whole copy and pushes the word sideways (word test 2).
      { target: 'word', input: 'CharacterSizeX', keys: [{ at: 150, v: 1, ease: EASE.out }, { at: 330, v: 1.12, ease: EASE.inOut }, { at: 520, v: 1 }] },
      { target: 'word', input: 'CharacterSizeY', keys: [{ at: 150, v: 1, ease: EASE.out }, { at: 330, v: 1.12, ease: EASE.inOut }, { at: 520, v: 1 }] },
      { target: 'word', input: 'CharacterOffset', keys: [{ at: 150, v: [0, 0], ease: EASE.out }, { at: 330, v: [0, 0.003], ease: EASE.inOut }, { at: 520, v: [0, 0] }] },
    ],
  },
  {
    // Sideways jitter. Follower CharacterAngleZ animated but showed no rotation in stills.
    id: 'shake', name: 'Shake', status: 'verified',
    tracks: [{
      target: 'word', input: 'CharacterOffset',
      keys: [
        { at: 150, v: [0, 0] }, { at: 200, v: [0.004, 0] }, { at: 250, v: [-0.004, 0] }, { at: 300, v: [0.003, 0] },
        { at: 350, v: [-0.002, 0] }, { at: 400, v: [0.001, 0] }, { at: 450, v: [0, 0] },
      ],
    }],
  },
]

export const presetById = (id: string) => PRESETS.find((p) => p.id === id)
export const wordFxById = (id: string) => WORD_FX.find((w) => w.id === id)
