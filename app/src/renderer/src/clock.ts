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

/** How far the video may drift from the playhead before the playhead jumps to it (a seek) */
const JUMP_MS = 250
/** Share of the drift taken back each frame */
const PULL = 0.1

/** The playhead's next time while playing, dt ms after prev. The video's own time moves in
 *  uneven steps (it follows the sound card), and captions drawn from it judder; so the wall
 *  clock moves the playhead and the video only steers it. A big gap (a seek) jumps; a video
 *  that has stopped moving (still loading) holds it; no video, the wall clock alone. */
export function nextTime(prev: number, dt: number, video: number | null, stalled: boolean): number {
  if (video === null) return prev + dt
  if (stalled) return video
  const t = prev + dt
  const drift = video - t
  return Math.abs(drift) > JUMP_MS ? video : Math.max(prev, t + drift * PULL)
}
