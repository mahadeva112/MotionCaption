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
