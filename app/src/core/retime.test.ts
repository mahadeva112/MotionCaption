import { describe, expect, it } from 'vitest'
import { nudge, onFrame, retime, splitAt } from './retime'

const o = (snaps: number[] = [], snapMs = 0) => ({ fps: 25, snaps, snapMs })

describe('retime', () => {
  it('moves a block by whole frames and keeps its length', () => {
    const r = retime({ startMs: 1000, endMs: 4000 }, 'move', 510, o())
    expect(r).toEqual({ startMs: 1520, endMs: 4520, snap: null })
  })

  it('never moves a block before 0', () => {
    expect(retime({ startMs: 1000, endMs: 4000 }, 'move', -5000, o())).toMatchObject({ startMs: 0, endMs: 3000 })
  })

  it('sticks the start or the end to the nearest snap time in reach', () => {
    // End would be 6100; the playhead at 6000 is in reach
    expect(retime({ startMs: 1000, endMs: 4000 }, 'move', 2100, o([6000], 200))).toEqual({ startMs: 3000, endMs: 6000, snap: 6000 })
    // Start would be 2950; another block ends at 3000
    expect(retime({ startMs: 1000, endMs: 4000 }, 'move', 1950, o([3000, 6000], 200))).toEqual({ startMs: 3000, endMs: 6000, snap: 3000 })
    // Out of reach: no sticking
    expect(retime({ startMs: 1000, endMs: 4000 }, 'move', 1500, o([3000], 200)).snap).toBeNull()
  })

  it('trims the start and keeps at least one frame', () => {
    expect(retime({ startMs: 1000, endMs: 4000 }, 'start', 1000, o())).toMatchObject({ startMs: 2000, endMs: 4000 })
    expect(retime({ startMs: 1000, endMs: 4000 }, 'start', 9000, o())).toMatchObject({ startMs: 3960, endMs: 4000 })
    expect(retime({ startMs: 1000, endMs: 4000 }, 'start', -3000, o())).toMatchObject({ startMs: 0 })
  })

  it('trims the end and sticks it', () => {
    expect(retime({ startMs: 1000, endMs: 4000 }, 'end', 1930, o([6000], 100))).toEqual({ startMs: 1000, endMs: 6000, snap: 6000 })
    expect(retime({ startMs: 1000, endMs: 4000 }, 'end', -9000, o())).toMatchObject({ endMs: 1040 })
  })
})

describe('frames', () => {
  it('rounds to a frame at 29.97', () => {
    const f = 30000 / 1001
    expect(onFrame(1000, f)).toBe(1001)
    expect(onFrame(onFrame(1234, f), f)).toBe(onFrame(1234, f))
  })

  it('splits only where both halves keep a frame', () => {
    expect(splitAt({ startMs: 1000, endMs: 4000 }, 2010, 25)).toEqual([{ startMs: 1000, endMs: 2000 }, { startMs: 2000, endMs: 4000 }])
    expect(splitAt({ startMs: 1000, endMs: 4000 }, 1000, 25)).toBeNull()
    expect(splitAt({ startMs: 1000, endMs: 4000 }, 4000, 25)).toBeNull()
  })

  it('nudges by frames', () => {
    expect(nudge({ startMs: 1000, endMs: 4000 }, 1, 25)).toEqual({ startMs: 1040, endMs: 4040 })
    expect(nudge({ startMs: 20, endMs: 3020 }, -10, 25)).toEqual({ startMs: 0, endMs: 3000 })
  })
})
