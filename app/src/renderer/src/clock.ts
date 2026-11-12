import { useSyncExternalStore } from 'react'

// The playhead position on the timeline, in ms. Kept outside React state so playback only
// re-renders what shows the time (viewer, playhead, timecodes), not the whole studio.

let now = 0
const subs = new Set<() => void>()

export const clock = {
  get: () => now,
  set(ms: number) {
    const v = Math.max(0, ms)
    if (v === now) return
    now = v
    subs.forEach((f) => f())
  },
  sub(f: () => void) {
    subs.add(f)
    return () => { subs.delete(f) }
  },
}

export const useClock = () => useSyncExternalStore(clock.sub, clock.get)

// While the timeline video plays, its time leads the playhead, so picture, sound and
// captions stay together. null: nothing playing (paused, ended, none), the playhead runs on its own.
let mediaNow: (() => number | null) | null = null
export const media = {
  set(f: (() => number | null) | null) { mediaNow = f },
  now: (): number | null => (mediaNow ? mediaNow() : null),
}
