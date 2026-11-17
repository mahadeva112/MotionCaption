import { describe, expect, it } from 'vitest'
import { nextTime } from './clock'

describe('the playhead while playing', () => {
  it('runs on the wall clock with no video', () => {
    expect(nextTime(1000, 16, null, false)).toBe(1016)
  })

  it('moves evenly while the video time comes in uneven steps', () => {
    // The video's time moves 0, 0, 40, 40, 80… (in steps), the screen draws every 20 ms
    let t = 0
    const steps: number[] = []
    for (let i = 1; i <= 50; i++) {
      const video = Math.floor((i * 20) / 40) * 40
      const next = nextTime(t, 20, video, false)
      steps.push(next - t)
      t = next
    }
    // Never back, never a big leap, and it keeps up with the video
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...steps)).toBeLessThan(30)
    expect(Math.abs(t - 1000)).toBeLessThan(40)
  })

  it('jumps to the video on a seek, and holds while the video stands still', () => {
    expect(nextTime(1000, 16, 5000, false)).toBe(5000)
    expect(nextTime(1000, 16, 990, true)).toBe(990)
  })
})
