import { describe, expect, it } from 'vitest'
import { QUICK_MS, WorkHistory } from './history'

type S = { look: number; preset: string }
const a: S = { look: 1, preset: 'fade' }

describe('undo and redo', () => {
  it('makes each change a step, and goes back and forward', () => {
    const h = new WorkHistory<S>()
    h.see(a, 'src', [], 0)
    const b = { ...a, preset: 'glideLeft' }
    h.cut(); h.see(b, 'src', [], 1000)
    const c = { ...b, look: 2 }
    h.cut(); h.see(c, 'src', [], 2000)
    expect(h.undo).toEqual([a, b])
    expect(h.restore(false)).toBe(b)
    h.see(b, 'src', [], 2100); h.settle()
    expect(h.restore(true)).toBe(c)
  })

  it('makes a drag one step, and quick changes one step', () => {
    const h = new WorkHistory<S>()
    h.see(a, 'src', [], 0)
    h.press()
    for (let i = 1; i <= 20; i++) h.see({ ...a, look: 1 + i / 10 }, 'src', [], i * 2000)
    h.release()
    expect(h.undo).toEqual([a])
    const typed = { ...a, look: 9 }
    h.see(typed, 'src', [], 100000)
    h.see({ ...typed, look: 10 }, 'src', [], 100000 + QUICK_MS / 2)
    expect(h.undo.length).toBe(2)
  })

  it('does not count changes that are not the user\'s', () => {
    const h = new WorkHistory<S>()
    h.see(a, 'src', ['kit', 1], 0)
    h.see({ ...a, look: 5 }, 'src', ['supers kit', 1], 1000) // the other kit's settings came in
    h.see({ ...a, look: 6 }, 'src', ['supers kit', 2], 2000) // a new read from Resolve
    expect(h.undo).toEqual([])
    h.see({ ...a, look: 7 }, 'src', ['supers kit', 2], 3000)
    expect(h.undo.length).toBe(1)
    h.see(a, 'other', [], 4000) // another source: its own history
    expect(h.canUndo).toBe(false)
  })

  it('does not make an undo a step, and a new change clears redo', () => {
    const h = new WorkHistory<S>()
    h.see(a, 'src', [], 0)
    const b = { ...a, look: 2 }
    h.see(b, 'src', [], 1000)
    const back = h.restore(false)!
    h.see(back, 'src', [], 1100)
    h.settle()
    expect(h.undo).toEqual([])
    expect(h.canRedo).toBe(true)
    h.cut(); h.see({ ...a, look: 3 }, 'src', [], 5000)
    expect(h.canRedo).toBe(false)
  })
})
