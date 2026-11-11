import { cuesOfLayers, lookOfLayer, usableLayers, type LayerLike } from '@core/layers'
import type { Look, Rgb, WordLook } from '@core/look'
import type { Cue } from '@core/srt'
import type { TimelineData } from '../../preload'

/** What the user changed on one caption. The subtitles themselves are never edited. */
export interface CueEdit {
  preset?: string
  /** Text typed in the Caption tab, replacing the subtitle's for this caption only */
  text?: string
  /** Look settings changed for this caption only */
  look?: Partial<Look>
  /** Word index → that word's own look */
  words: Record<number, WordLook>
  /** Times moved or trimmed on the app's timeline, for this caption only */
  startMs?: number
  endMs?: number
  /** Left out: deleted, or joined into the caption before it */
  off?: boolean
}

/** Captions added to a source in the app (a cut or a copy) are numbered from here, apart
 *  from the source's own (subtitle i is n = i, Text+ layer i is n = i) */
export const EXTRA_N = 100000

export type Edits = Record<number, CueEdit>

/** Which captions of a timeline: a subtitle track (its number), every Text+ layer on its
 *  video tracks ('text'), only the Text+ on one video track ('text:2' for V2, e.g. a super),
 *  or the supers made in this app for this timeline ('supers') */
export type SrcTrack = number | 'text' | `text:${number}` | 'supers'

/** Where captions come from: a timeline read from Resolve (see SrcTrack), or an SRT file */
export type Source =
  | { kind: 'timeline'; data: TimelineData; track: SrcTrack; supers?: Cue[]; extra?: Cue[] }
  | { kind: 'srt'; name: string; cues: Cue[]; notes: string[]; extra?: Cue[] }

export const isTextSrc = (t: SrcTrack | null | undefined): t is 'text' | `text:${number}` => typeof t === 'string' && t !== 'supers'
/** Supers made in the app: text, timing, look and animation all live here, not in Resolve */
export const isSupersSrc = (src: Source | null | undefined): boolean => src?.kind === 'timeline' && src.track === 'supers'
/** The video track a 'text:N' source reads, or null for every track */
export const textTrackOf = (t: SrcTrack): number | null => (typeof t === 'string' && t.startsWith('text:') ? Number(t.slice(5)) : null)
/** A Read from value back from a <select> */
export const srcTrackOf = (v: string): SrcTrack => (v === 'text' || v === 'supers' || v.startsWith('text:') ? (v as SrcTrack) : Number(v))


/** Text+ layers a source reads, from a timeline's layers */
export function layersIn<T extends LayerLike>(texts: T[] | undefined, t: SrcTrack): T[] {
  if (!isTextSrc(t)) return []
  const only = textTrackOf(t)
  return usableLayers(texts).filter((x) => only === null || x.track === only)
}

/** Text+ layers of a timeline that can be animated, in caption order (caption n = layers[n - 1]) */
export const layersOf = (src: Source | null) => (src?.kind === 'timeline' ? layersIn(src.data.texts, src.track) : [])

/** The Read from choices for a timeline: each subtitle track, the Text+ on each video track
 *  on its own, and every Text+ layer together when they sit on more than one track (or when
 *  that is the current choice) */
export function srcChoices(data: TimelineData | null | undefined, current?: SrcTrack | null, supers = 0): { value: SrcTrack; label: string }[] {
  const subs = (data?.subtitle ?? []).map((s) => ({ value: s.index as SrcTrack, label: `ST${s.index} · ${s.name} · ${s.cues.length}` }))
  const layers = usableLayers(data?.texts)
  const tracks = [...new Set(layers.map((t) => t.track))].sort((a, b) => a - b)
  const name = (i: number) => data?.video?.find((v) => v.index === i)?.name ?? ''
  const one = tracks.map((i) => ({ value: `text:${i}` as SrcTrack, label: `Text+ on V${i} · ${name(i)} · ${layers.filter((t) => t.track === i).length}` }))
  const all = tracks.length > 1 || (current === 'text' && tracks.length) ? [{ value: 'text' as SrcTrack, label: `Text+ on ${tracks.map((i) => 'V' + i).join(', ')} · ${layers.length}` }] : []
  const made = data?.timeline ? [{ value: 'supers' as SrcTrack, label: `Supers made here · ${supers}` }] : []
  return [...subs, ...one, ...all, ...made]
}

/** What a timeline source is called: the subtitle track's name, or which Text+ layers.
 *  Captions made from it go on a track named after it ("MC Text+ V2"). */
export function srcNameOf(data: TimelineData, t: SrcTrack): string {
  if (t === 'supers') return 'Supers'
  if (!isTextSrc(t)) return data.subtitle?.find((s) => s.index === t)?.name ?? 'Subtitles'
  const only = textTrackOf(t)
  return only === null ? 'Text+ layers' : `Text+ V${only}`
}

/** Each Text+ layer's own look, as caption edits, so a layer keeps its look when animated */
export function editsOf(src: Source | null): Edits {
  return Object.fromEntries(layersOf(src).map((t, i) => [i + 1, { words: {}, look: lookOfLayer(t.raw) }]))
}

/** Names a source for what the app keeps about it on this computer: which project,
 *  timeline and track (or which SRT file) */
export const sourceKey = (src: Source | null): string | null =>
  !src ? null
    : src.kind === 'srt' ? `srt|${src.name}`
      : `${src.data.project ?? ''}|${src.data.timeline ? src.data.timeline.name : ''}|${src.track}`

/** Caption changes listed by the caption's start time rather than its number, so they
 *  stay with their caption when captions are added or removed before it */
export type EditsByStart = [startMs: number, edit: CueEdit][]

export const editsByStart = (edits: Edits, cues: Cue[]): EditsByStart =>
  cues.flatMap((c) => (edits[c.n] ? [[c.startMs, edits[c.n]!] as [number, CueEdit]] : []))

/** Puts listed changes back on the captions that start at the same time, over `base` */
export function editsOnto(list: EditsByStart, cues: Cue[], base: Edits = {}): Edits {
  const at = new Map(list)
  const out: Edits = { ...base }
  for (const c of cues) {
    const e = at.get(c.startMs)
    if (e) out[c.n] = { ...e, words: e.words ?? {} }
  }
  return out
}

/** How the app names a caption when it compares with what it last sent: by its time */
export const sentKey = (c: { startMs: number; endMs: number }) => `${c.startMs}-${c.endMs}`

/** Where captions go and what happens around them */
export interface Target {
  track: number | 'new'
  turnOffSource: boolean
  replace: boolean
}

export type Scope = 'all' | 'selected' | 'this'

export type SafeArea = 'off' | 'reels' | 'shorts' | 'tiktok'

/** Rough share of a 9:16 frame each app covers with its buttons (right) and text (bottom) */
export const SAFE: Record<Exclude<SafeArea, 'off'>, { name: string; rail: [number, number, number, number]; meta: number }> = {
  reels: { name: 'Instagram Reels', rail: [2, 19, 13, 38], meta: 17 },
  shorts: { name: 'YouTube Shorts', rail: [2, 16, 13, 40], meta: 15 },
  tiktok: { name: 'TikTok', rail: [1.5, 18, 14, 42], meta: 19 },
}

/** A source's captions as they come (subtitle cues, Text+ layers, SRT, supers), then the
 *  ones added in the app; caption edits go on top of these */
export function cuesOf(src: Source | null): Cue[] {
  if (!src) return []
  if (src.kind === 'srt') return [...src.cues, ...(src.extra ?? [])]
  if (src.track === 'supers') return src.supers ?? []
  if (isTextSrc(src.track)) return [...cuesOfLayers(layersOf(src)), ...(src.extra ?? [])]
  const t = src.data.subtitle?.find((x) => x.index === src.track)
  return [...(t?.cues ?? []).map((c, i) => ({
    n: i + 1, index: i + 1, startMs: Math.round(c.start), endMs: Math.round(c.end), raw: c.text, text: c.text.replace(/\r/g, ''), line: 0,
  })), ...(src.extra ?? [])]
}

/** The captions with their changes: text and times as edited, the left-out ones gone, by time */
export function editedCues(base: Cue[], edits: Edits): Cue[] {
  return base
    .filter((c) => !edits[c.n]?.off)
    .map((c) => {
      const e = edits[c.n]
      if (!e || (e.text === undefined && e.startMs === undefined && e.endMs === undefined)) return c
      return { ...c, text: e.text ?? c.text, startMs: e.startMs ?? c.startMs, endMs: e.endMs ?? c.endMs }
    })
    .sort((a, b) => a.startMs - b.startMs || a.n - b.n)
}

/** A caption's own look, animation and word looks, without its text, times or being left out:
 *  what a copy or the second half of a cut keeps */
export function lookPart(e: CueEdit | undefined): CueEdit | undefined {
  if (!e) return undefined
  const rest: CueEdit = { ...e }
  delete rest.text; delete rest.startMs; delete rest.endMs; delete rest.off
  return rest
}

/** The look one caption gets: the script's, with that caption's own changes on top */
export const lookOf = (look: Look, edits: Edits, n: number): Look => {
  const own = edits[n]?.look
  if (!own) return look
  return {
    ...look, ...own,
    outline: { ...look.outline, ...own.outline }, shadow: { ...look.shadow, ...own.shadow }, box: { ...look.box, ...own.box },
  }
}

/** Lower case, letters and digits only, so “Story,” matches “story” */
export const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '')

export const wordsIn = (text: string) => text.split(/\s+/).filter(Boolean)

export const css = (c: Rgb, a = 1) => `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${a})`
export const hex = (c: Rgb) => '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
export const rgb = (h: string): Rgb => {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export const SWATCHES: Rgb[] = [[1, 1, 1], [1, 0.82, 0.25], [1, 0.35, 0.21], [0.31, 0.82, 0.55], [0.35, 0.63, 1], [1, 0.31, 0.64], [0, 0, 0]]

/** Preview frame shapes for an SRT (a timeline brings its own size) */
export const FRAMES: { label: string; aspect: number }[] = [
  { label: '9:16', aspect: 9 / 16 }, { label: '16:9', aspect: 16 / 9 }, { label: '1:1', aspect: 1 }, { label: '4:5', aspect: 4 / 5 },
]

/** How long the timeline is in Resolve, in ms; from its clips when an older script did not say */
export function timelineLength(d: TimelineData | null | undefined): number {
  if (!d || !d.timeline) return 0
  if (d.timeline.length && d.timeline.length > 0) return d.timeline.length
  let end = 0
  for (const v of d.video ?? []) for (const c of v.clips) end = Math.max(end, c.end)
  for (const s of d.subtitle ?? []) for (const c of s.cues) end = Math.max(end, c.end)
  return end
}

export function timecode(ms: number, fps = 24): string {
  const nominal = Math.round(fps)
  const f = Math.round((ms / 1000) * fps)
  const s = Math.floor(f / nominal)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(f % nominal)}`
}

/** A super as kept on this computer */
export interface SavedSuper { n: number; startMs: number; endMs: number; text: string }

/** Where a timeline's supers are kept on this computer */
export const supersKey = (data: TimelineData): string =>
  'mc.supers.' + (data.project ?? '') + '|' + (data.timeline ? data.timeline.name : '')

export const superCue = (s: SavedSuper): Cue => ({ n: s.n, index: s.n, startMs: s.startMs, endMs: s.endMs, raw: s.text, text: s.text, line: 0 })
