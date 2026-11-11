// Moving and trimming timed blocks (supers) on the app's timeline: whole frames only,
// sticking to the playhead and to the other blocks' edges like Resolve's snapping.

/** What a drag holds: the whole block, or one of its edges */
export type Grip = 'move' | 'start' | 'end'

export interface Span { startMs: number; endMs: number }

export interface RetimeOpts {
  fps: number
  /** Times an edge sticks to: the playhead, the other blocks' starts and ends */
  snaps: number[]
  /** How near an edge must come to stick, in ms (0: no sticking) */
  snapMs: number
}

export interface Retimed extends Span {
  /** The time an edge stuck to, for a guide line; null when nothing did */
  snap: number | null
}

/** One frame, in ms */
export const frameMs = (fps: number) => 1000 / fps

/** The nearest whole frame, in whole ms */
export const onFrame = (ms: number, fps: number) => Math.round((Math.round((ms * fps) / 1000) * 1000) / fps)

/** How far to shift so one of the edges lands on the nearest snap time in reach */
function pull(edges: number[], o: RetimeOpts): { by: number; at: number } | null {
  let best: { by: number; at: number } | null = null
  if (o.snapMs <= 0) return null
  for (const t of o.snaps) {
    for (const e of edges) {
      const by = t - e
      if (Math.abs(by) <= o.snapMs && (!best || Math.abs(by) < Math.abs(best.by))) best = { by, at: t }
    }
  }
  return best
}

/**
 * A block after dragging `grip` by `dms`. Moving keeps its length; trimming keeps at least
 * one frame. Nothing goes before 0.
 */
export function retime(span: Span, grip: Grip, dms: number, o: RetimeOpts): Retimed {
  const min = Math.max(1, Math.round(frameMs(o.fps)))
  if (grip === 'move') {
    const len = span.endMs - span.startMs
    let s = span.startMs + dms
    const p = pull([s, s + len], o)
    if (p) s += p.by
    s = Math.max(0, onFrame(s, o.fps))
    const e = onFrame(s + len, o.fps)
    return { startMs: s, endMs: e, snap: p && (p.at === s || p.at === e) ? p.at : null }
  }
  if (grip === 'start') {
    let s = span.startMs + dms
    const p = pull([s], o)
    if (p) s += p.by
    s = Math.max(0, Math.min(onFrame(s, o.fps), span.endMs - min))
    return { startMs: s, endMs: span.endMs, snap: p && p.at === s ? p.at : null }
  }
  let e = span.endMs + dms
  const p = pull([e], o)
  if (p) e += p.by
  e = Math.max(onFrame(e, o.fps), span.startMs + min)
  return { startMs: span.startMs, endMs: e, snap: p && p.at === e ? p.at : null }
}

/** The two halves of a block cut at `ms` (on its frame), or null unless both get a frame */
export function splitAt(span: Span, ms: number, fps: number): [Span, Span] | null {
  const t = onFrame(ms, fps)
  const min = frameMs(fps) - 0.5
  if (t - span.startMs < min || span.endMs - t < min) return null
  return [{ startMs: span.startMs, endMs: t }, { startMs: t, endMs: span.endMs }]
}

/** A block moved by whole frames, never before 0 */
export function nudge(span: Span, frames: number, fps: number): Span {
  const len = span.endMs - span.startMs
  const s = Math.max(0, onFrame(span.startMs + frames * frameMs(fps), fps))
  return { startMs: s, endMs: s + len }
}

/**
 * A lane for each block, 0 at the top: the first lane where it covers nothing, taking the
 * blocks by start time. Resolve gets them the same way: each lane is its own video track.
 */
export function lanesOf(spans: Span[]): number[] {
  const order = spans.map((s, i) => i).sort((a, b) => spans[a]!.startMs - spans[b]!.startMs || a - b)
  const ends: number[] = []
  const lane: number[] = new Array(spans.length).fill(0)
  for (const i of order) {
    const s = spans[i]!
    let l = ends.findIndex((e) => e <= s.startMs)
    if (l < 0) { l = ends.length; ends.push(0) }
    ends[l] = s.endMs
    lane[i] = l
  }
  return lane
}

/** A caption's words in two parts near `share` of its letters; each part keeps a word.
 *  One word stays whole in both. */
export function splitText(text: string, share: number): [string, string] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 2) return [text, text]
  const total = words.reduce((n, w) => n + w.length, 0)
  let k = 1
  let best = Infinity
  let run = 0
  for (let i = 1; i < words.length; i++) {
    run += words[i - 1]!.length
    const d = Math.abs(run / total - share)
    if (d < best) { best = d; k = i }
  }
  return [words.slice(0, k).join(' '), words.slice(k).join(' ')]
}
