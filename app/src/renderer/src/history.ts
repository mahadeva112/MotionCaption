// Undo and redo over snapshots of the work (App.tsx WorkState). The app shows every state
// it has (see); a change becomes a step. A drag (the pointer held down) or a run of quick
// changes (typing, a held key) is one step. Changes that are not the user's are not steps:
// another source has its own history, and the other kit's settings coming in, a new read
// from Resolve or an undo itself only move the present.

/** How close together changes must come, with no pointer held, to count as one step */
export const QUICK_MS = 600
/** Steps kept */
const KEEP = 100

export class WorkHistory<T extends object> {
  undo: T[] = []
  redo: T[] = []
  private now: T | null = null
  private key: string | null | undefined = undefined
  private ctx: readonly unknown[] = []
  /** A step is open: changes join it */
  private open = false
  private at = -Infinity
  private held = false
  /** An undo is being shown: what it changes is not a step */
  private quiet = false

  /** The work as it is now. key: whose work (another key, another history);
   *  ctx: what may change under the user's feet (a change there is not a step). */
  see(state: T, key: string | null, ctx: readonly unknown[], time: number): void {
    const prev = this.now
    this.now = state
    if (key !== this.key) {
      this.key = key
      this.ctx = ctx
      this.undo = []
      this.redo = []
      this.open = false
      return
    }
    const sameCtx = ctx.length === this.ctx.length && ctx.every((x, i) => x === this.ctx[i])
    this.ctx = ctx
    if (!prev || this.quiet || !sameCtx || !differs(prev, state)) return
    if (!this.open || (!this.held && time - this.at > QUICK_MS)) {
      this.undo.push(prev)
      if (this.undo.length > KEEP) this.undo.shift()
      this.redo = []
    }
    this.open = true
    this.at = time
  }

  /** The pointer went down: a new step starts, and lasts while it is held */
  press(): void { this.held = true; this.open = false }
  release(): void { this.held = false }
  /** The next change is a step of its own (a button, a key) */
  cut(): void { this.open = false }

  /** The state to go back (or forward) to, or null; the present goes on the other list.
   *  Call settle() once it is shown. */
  restore(redo: boolean): T | null {
    const s = (redo ? this.redo : this.undo).pop()
    if (!s) return null
    if (this.now) (redo ? this.undo : this.redo).push(this.now)
    this.quiet = true
    this.open = false
    return s
  }
  settle(): void { this.quiet = false }

  get canUndo(): boolean { return this.undo.length > 0 }
  get canRedo(): boolean { return this.redo.length > 0 }
}

const differs = <T extends object>(a: T, b: T): boolean =>
  (Object.keys(b) as (keyof T)[]).some((k) => a[k] !== b[k]) || Object.keys(a).length !== Object.keys(b).length
