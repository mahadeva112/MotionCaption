// An animation pattern: a few presets that take turns over the captions, a chunk at a time.
// "Fade, Pop, Rise" every 2 captions gives captions 1–2 Fade, 3–4 Pop, 5–6 Rise, 7–8 Fade…
// Random order picks from the same list, never the same one twice in a row, and the same
// seed always gives the same picks, so the preview and Resolve agree.

export type PatternOrder = 'seq' | 'random'

export interface Pattern {
  /** Preset ids in turn; one may be listed more than once to come up more often */
  ids: string[]
  /** Captions in one chunk: how many in a row get the same animation */
  every: number
  order: PatternOrder
  /** Random order only: a new seed is a new draw */
  seed: number
}

export const EMPTY_PATTERN: Pattern = { ids: [], every: 1, order: 'seq', seed: 1 }

/** Small seeded random numbers (mulberry32), 0 ≤ r < 1 */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The animation of each of `count` captions in a row, from the first; [] for an empty pattern */
export function patternList(p: Pattern, count: number): string[] {
  const ids = p.ids
  if (!ids.length || count <= 0) return []
  const every = Math.max(1, Math.floor(p.every) || 1)
  const chunks = Math.ceil(count / every)
  const picks: string[] = []
  if (p.order === 'seq') {
    for (let k = 0; k < chunks; k++) picks.push(ids[k % ids.length]!)
  } else {
    const r = rng(p.seed)
    const distinct = new Set(ids).size
    let prev: string | undefined
    for (let k = 0; k < chunks; k++) {
      // Never the chunk before's animation again, when the list has another one
      const pool = distinct > 1 ? ids.filter((id) => id !== prev) : ids
      prev = pool[Math.floor(r() * pool.length)]!
      picks.push(prev)
    }
  }
  return Array.from({ length: count }, (_, i) => picks[Math.floor(i / every)]!)
}
