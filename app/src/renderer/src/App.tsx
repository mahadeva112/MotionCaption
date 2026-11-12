import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { compileCue, type CompileOpts } from '@core/compile'
import { jobToLua, makeJob, sendSig, type Rendered } from '@core/job'
import { DEFAULT_HIGHLIGHT, DEFAULT_LOOK, DEFAULT_MOTION, type Highlight, type Look, type Motion, type WordLook } from '@core/look'
import { EMPTY_PATTERN, patternList, type Pattern } from '@core/pattern'
import { presetById } from '@core/presets'
import { DEFAULT_SMART, KIND_NAMES, smartList, type Kind, type Smart } from '@core/smart'
import { nudge, onFrame, splitAt, splitText, type Span } from '@core/retime'
import { parseSrt } from '@core/srt'
import type { Cue } from '@core/srt'
import type { LinkStatus, RenderProgress, TimelineData } from '../../preload'
import { hasGlyphs, loadFonts, measure, type FontFamily } from './fonts'
import { clock, media } from './clock'
import { CaptionCard } from './CaptionCard'
import { BUILT_IN_STYLES, Inspector, type Tab } from './Inspector'
import { Icon } from './Icon'
import { LibraryD, type MyAnimation } from './LibraryD'
import { usableLayers } from '@core/layers'
import {
  cuesOf, editedCues, editsByStart, editsOf, editsOnto, EXTRA_N, FRAMES, isSupersSrc, isTextSrc, layersIn, layersOf, lookOf, lookPart, norm,
  sentKey, sourceKey, srcNameOf, superCue, supersKey, timelineLength, wordsIn,
  type CueEdit, type Edits, type EditsByStart, type SafeArea, type SavedSuper, type Scope, type Source, type SrcTrack, type Target,
} from './model'
import { SendDialog } from './SendDialog'
import { TimelineD } from './TimelineD'
import { useTimelineVideo } from './TimelineVideo'
import { TEMPLATES } from './templates'
import { Viewer } from './Viewer'
import { Dropdown } from './Dropdown'
import { AppMenu, UpdateDialog, UpdateStrip, useUpdates } from './Updates'

// Per-computer conveniences: they survive restarts when storage works, and the app works without them
function saved<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? { ...fallback, ...JSON.parse(v) } : fallback
  } catch { return fallback }
}
function store(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* not kept; still applies now */ }
}

/** A source's caption changes as last kept on this computer (closing the app does not lose
 *  them), on top of the looks its Text+ layers have in Resolve */
const keptEdits = (src: Source): Edits =>
  editsOnto(saved('mc.edits.' + sourceKey(src), { list: [] as EditsByStart }).list, cuesOf(src), editsOf(src))

/** Look keys a whole-script change takes back from captions that had their own */
const DEFAULT_PRESET = 'fade'

/** Supers keep their own look, animation and highlight, apart from the subtitles' ones.
 *  They start near the top, bigger, coming in out of a blur. */
const SUPER_LOOK: Look = { ...DEFAULT_LOOK, size: 0.085, anchor: 1, lines: 'auto' }
const SUPER_PRESET = 'blurRise'
/** A new super: this long, from the playhead */
const SUPER_MS = 3000

/** How captions go into Resolve: drawn by the app as clips (works the same in Resolve Free),
 *  or as editable Text+ titles animated in Resolve's Fusion */
export type Delivery = 'drawn' | 'textplus'

/** A super, or a caption added in the app, as kept on this computer */
const keepable = (c: Cue): SavedSuper => ({ n: c.n, startMs: c.startMs, endMs: c.endMs, text: c.text })
/** A source with the captions added to it in the app (a cut or a copy), as kept on this computer */
const withExtras = (src: Source): Source =>
  isSupersSrc(src) ? src : { ...src, extra: saved('mc.extra.' + sourceKey(src), { list: [] as SavedSuper[] }).list.map(superCue) }

/** A timeline's supers as kept on this computer */
const savedSupers = (d: TimelineData) => saved(supersKey(d), { list: [] as SavedSuper[] }).list.map(superCue)
const DEFAULT_TARGET: Target = { track: 'new', turnOffSource: true, replace: true }

type StyleBase = { name: string | null; look: Partial<Look> }
const NO_STYLE: StyleBase = { name: null, look: {} }

const without = (o: Partial<Look> | undefined, keys: string[]) => {
  if (!o) return o
  const c: Record<string, unknown> = { ...o }
  for (const k of keys) delete c[k]
  return Object.keys(c).length ? (c as Partial<Look>) : undefined
}

export function App() {
  const [source, setSource] = useState<Source | null>(null)
  const [timelineInfo, setTimelineInfo] = useState<TimelineData | null>(null)
  const [link, setLink] = useState<LinkStatus>({ alive: false, timeline: null })
  const [fonts, setFonts] = useState<FontFamily[]>([])
  const [look, setLook] = useState<Look>(() => saved('mc.look', DEFAULT_LOOK))
  const [highlight, setHighlight] = useState<Highlight>(() => saved('mc.highlight', DEFAULT_HIGHLIGHT))
  const [motion, setMotion] = useState<Motion>(() => saved('mc.motion', DEFAULT_MOTION))
  const [edits, setEdits] = useState<Edits>({})
  const [defaultPreset, setDefaultPreset] = useState(() => saved('mc.misc', { preset: DEFAULT_PRESET }).preset)
  /** Whose settings the look, animation and highlight above are: '' the subtitles', '.supers' the supers' */
  const [stateKit, setStateKit] = useState('')
  const [delivery, setDelivery] = useState<Delivery>(() => saved('mc.delivery', { how: 'drawn' as Delivery }).how)
  /** Finished clips as one MOV file each (ProRes 4444 with transparency) instead of PNG frames */
  const [movOut, setMovOut] = useState(() => saved('mc.delivery', { mov: false }).mov)
  useEffect(() => store('mc.delivery', { how: delivery, mov: movOut }), [delivery, movOut])
  const [active, setActive] = useState(1)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [scope, setScope] = useState<Scope>('all')
  const [selWord, setSelWord] = useState<number | null>(null)
  const [everywhere, setEverywhere] = useState(false)
  const [tab, setTab] = useState<Tab>('Look')
  const [target, setTarget] = useState<Target>(DEFAULT_TARGET)
  const [safe, setSafe] = useState<SafeArea>('off')
  const [playing, setPlaying] = useState(false)
  /** Animation under the pointer in a library: the preview tries it without changing anything */
  const [hoverPreset, setHoverPreset] = useState<string | null>(null)
  const [frame, setFrame] = useState(() => saved('mc.misc', { frame: '9:16' }).frame)
  const [sending, setSending] = useState(false)
  const [resetting, setResetting] = useState(false)
  const updates = useUpdates()
  const [branding, setBranding] = useState(false)
  /** Clicks in the viewer add points to the caption's path (Position tab) */
  const [pathDraw, setPathDraw] = useState(false)
  /** The work just before a reset, for one Undo */
  const [undo, setUndo] = useState<{ look: Look; highlight: Highlight; motion: Motion; edits: Edits; extra?: Cue[]; preset: string; target: Target; safe: SafeArea; styleBase: StyleBase; pattern: Pattern; patternOn: boolean } | null>(null)
  /** Animations that take turns over the captions, a chunk at a time (core/pattern.ts);
   *  on: it runs over all captions in place of the one animation for all */
  const [pattern, setPattern] = useState<Pattern>(() => ({ ...EMPTY_PATTERN, ...saved('mc.pattern', { pattern: EMPTY_PATTERN }).pattern }))
  const [patternOn, setPatternOn] = useState(() => saved('mc.pattern', { on: false }).on)
  /** Smart Auto: each caption gets an animation that suits it (core/smart.ts) */
  const [smart, setSmart] = useState<Smart>(() => saved('mc.smart', DEFAULT_SMART))
  useEffect(() => store('mc.smart' + stateKit, smart), [smart, stateKit])
  /** Clicks in the animation library add to the pattern instead of using the animation */
  const [patternPick, setPatternPick] = useState(false)
  useEffect(() => store('mc.pattern' + stateKit, { pattern, on: patternOn }), [pattern, patternOn, stateKit])
  const [recent, setRecent] = useState<string[]>(() => saved('mc.misc', { recent: [] as string[] }).recent)
  /** Starred animations, and My Animations (an animation with its Animation tab settings, under a name) */
  const [favs, setFavs] = useState<string[]>(() => saved('mc.favs', { list: [] as string[] }).list)
  useEffect(() => store('mc.favs', { list: favs }), [favs])
  const [mine, setMine] = useState<MyAnimation[]>(() => saved('mc.mine', { list: [] as MyAnimation[] }).list)
  useEffect(() => store('mc.mine', { list: mine }), [mine])
  const [userStyles, setUserStyles] = useState<{ name: string; look: Partial<Look> }[]>(() => saved('mc.styles', { list: [] as { name: string; look: Partial<Look> }[] }).list)
  /** The Style last picked: the Inspector's ↺ buttons put a setting back to its value */
  const [styleBase, setStyleBase] = useState<StyleBase>(() => saved('mc.styleBase', NO_STYLE))
  useEffect(() => store('mc.styleBase' + stateKit, styleBase), [styleBase, stateKit])
  const baseLook = useMemo<Look>(() => lookOf(DEFAULT_LOOK, { 0: { words: {}, look: styleBase.look } }, 0), [styleBase])

  useEffect(() => store('mc.look' + stateKit, look), [look, stateKit])
  useEffect(() => store('mc.highlight' + stateKit, highlight), [highlight, stateKit])
  useEffect(() => store('mc.motion' + stateKit, motion), [motion, stateKit])
  useEffect(() => {
    if (stateKit) store('mc.preset' + stateKit, { preset: defaultPreset })
    store('mc.misc', { preset: stateKit ? saved('mc.misc', { preset: DEFAULT_PRESET }).preset : defaultPreset, frame, recent })
  }, [defaultPreset, frame, recent, stateKit])
  useEffect(() => { loadFonts().then(setFonts) }, [])

  /** The timeline last read, held back at start because Resolve may have another open now */
  const [last, setLast] = useState<TimelineData | null>(null)

  // The timeline the Resolve script read; again whenever it writes a new one
  const showTimeline = useCallback((d: TimelineData | null) => {
    setLast(null)
    setTimelineInfo(d)
    const subs = d?.subtitle ?? []
    if (!d || !d.timeline) return
    const tlName = d.timeline.name
    setSource((prev) => {
      const same = prev?.kind === 'timeline' && prev.data.timeline && prev.data.timeline.name === tlName
      const valid = (t: SrcTrack) => (t === 'supers' || (isTextSrc(t) ? layersIn(d.texts, t).length > 0 : subs.some((s) => s.index === t)))
      const keep = same && valid(prev.track) ? prev.track : null
      // Subtitles first (the usual case); a timeline with only Text+ layers opens on those,
      // and one with neither on the supers made here
      const track: SrcTrack = keep ?? (subs.find((s) => s.cues.length) ?? subs[0])?.index
        ?? (usableLayers(d.texts).length ? 'text' : 'supers')
      const next: Source = withExtras({ kind: 'timeline', data: d, track, supers: same && prev.supers ? prev.supers : savedSupers(d) })
      if (!same || keep === null) { setEdits(keptEdits(next)); setSel(new Set()); setSelWord(null); setActive(1) }
      // The same captions read again: each change stays with its caption, by start time,
      // even when captions were added or removed before it
      else if (prev) { const was = cuesOf(prev); setEdits((e) => editsOnto(editsByStart(e, was), cuesOf(next), editsOf(next))) }
      return next
    })
  }, [])
  useEffect(() => {
    // At start (Start menu, desktop) the file may be days old: open it only if it is
    // what Resolve has now. A new read after that is always a click in Resolve.
    window.mc.timeline().then(async (d) => {
      if (!d || (await isCurrent(d))) showTimeline(d)
      else setLast(d)
    })
    return window.mc.onTimeline(() => { window.mc.timeline().then(showTimeline) })
  }, [showTimeline])

  // Is the Link window open in Resolve? Then a Send goes straight in.
  useEffect(() => {
    let live = true
    const check = () => window.mc.linkStatus().then((l) => { if (live) setLink(l) }).catch(() => {})
    check()
    const t = setInterval(check, 1500)
    return () => { live = false; clearInterval(t) }
  }, [])

  async function openSrt() {
    const picked = await window.mc.openSrt()
    if (picked) loadSrt(picked)
  }
  function loadSrt(picked: { name: string; bytes: Uint8Array }) {
    const parsed = parseSrt(picked.bytes)
    const next: Source = withExtras({ kind: 'srt', name: picked.name, cues: parsed.cues, notes: parsed.issues.map((x) => `Line ${x.line}: ${x.message}`) })
    setSource(next)
    setEdits(keptEdits(next)); setSel(new Set()); setSelWord(null); setActive(parsed.cues[0]?.n ?? 1)
    setTarget((t) => ({ ...t, track: 'new' }))
  }

  const tl = source?.kind === 'timeline' && source.data.timeline ? source.data.timeline : null
  const aspect = tl && tl.width && tl.height ? tl.width / tl.height : FRAMES.find((f) => f.label === frame)!.aspect
  const fps = tl?.rate ?? 24
  const supersOn = isSupersSrc(source)
  const noun = supersOn ? 'supers' : 'captions'
  /** Drawing needs the timeline's own size and rate, so only a timeline read from Resolve is drawn */
  const drawn = delivery === 'drawn' && !!tl

  // Supers and subtitles each keep their own look, animation and highlight
  const kit = supersOn ? '.supers' : ''
  useEffect(() => {
    if (kit === stateKit) return
    const base = kit ? SUPER_LOOK : DEFAULT_LOOK
    setLook(saved('mc.look' + kit, base))
    setHighlight(saved('mc.highlight' + kit, DEFAULT_HIGHLIGHT))
    setMotion(saved('mc.motion' + kit, DEFAULT_MOTION))
    setDefaultPreset(kit ? saved('mc.preset' + kit, { preset: SUPER_PRESET }).preset : saved('mc.misc', { preset: DEFAULT_PRESET }).preset)
    setStyleBase(saved('mc.styleBase' + kit, NO_STYLE))
    const pt = saved('mc.pattern' + kit, { pattern: EMPTY_PATTERN, on: false })
    setPattern({ ...EMPTY_PATTERN, ...pt.pattern }); setPatternOn(pt.on); setPatternPick(false)
    setSmart(saved('mc.smart' + kit, DEFAULT_SMART))
    setStateKit(kit)
  }, [kit, stateKit])

  // ── Supers: made, timed and written here; kept on this computer per timeline ──
  function setSupers(change: (list: Cue[]) => Cue[]) {
    setSource((prev) => {
      if (prev?.kind !== 'timeline') return prev
      const list = change(prev.supers ?? []).slice().sort((a, b) => a.startMs - b.startMs || a.n - b.n)
      store(supersKey(prev.data), { list: list.map(keepable) })
      return { ...prev, supers: list }
    })
  }
  /** Captions added in the app to subtitles, Text+ layers or an SRT (a cut or a copy); kept per source */
  function setExtras(change: (list: Cue[]) => Cue[]) {
    setSource((prev) => {
      if (!prev || isSupersSrc(prev)) return prev
      const list = change(prev.extra ?? []).slice().sort((a, b) => a.startMs - b.startMs || a.n - b.n)
      store('mc.extra.' + sourceKey(prev), { list: list.map(keepable) })
      return { ...prev, extra: list }
    })
  }
  function addSuper() {
    if (source?.kind !== 'timeline') return
    const list = source.supers ?? []
    const n = Math.max(0, ...list.map((c) => c.n)) + 1
    const at = Math.max(0, Math.round(clock.get()))
    remember()
    setSupers((l) => [...l, superCue({ n, startMs: at, endMs: at + SUPER_MS, text: 'New super' })])
    setActive(n); setSel(new Set([n])); setScope('all'); setTab('Caption'); setPlaying(false)
  }
  /** A ready-made super at the playhead: its text, own look, animation and length from the template */
  function addTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id)
    if (!t || source?.kind !== 'timeline') return
    const n = Math.max(0, ...(source.supers ?? []).map((c) => c.n)) + 1
    const at = Math.max(0, Math.round(clock.get()))
    remember()
    setSupers((l) => [...l, superCue({ n, startMs: at, endMs: at + t.ms, text: t.text })])
    setEdits((e) => ({ ...e, [n]: { words: t.words?.(t.text) ?? {}, look: t.look, preset: t.preset } }))
    setActive(n); setSel(new Set([n])); setScope('this'); setTab('Caption'); setPlaying(false)
    clock.set(at + Math.min(1200, t.ms / 2))
  }
  function updateSuper(n: number, patch: Partial<SavedSuper>) {
    setSupers((l) => l.map((c) => (c.n !== n ? c : superCue({ n, startMs: c.startMs, endMs: c.endMs, text: c.text, ...patch }))))
  }

  // ── Timing on the app's timeline, for every source ──
  // Supers change themselves. Subtitles, Text+ layers and SRT captions are never changed:
  // their new times, texts and deletions are caption edits, and the captions a cut or a
  // copy adds are kept apart (extra), numbered from EXTRA_N.

  // Undo and redo for that work: times, texts, own looks, added and left-out captions
  type WorkState = { supers?: Cue[]; extra?: Cue[]; edits: Edits }
  const history = useRef<{ undo: WorkState[]; redo: WorkState[] }>({ undo: [], redo: [] })
  const workNow = (): WorkState => ({ supers: source?.kind === 'timeline' ? source.supers : undefined, extra: source?.extra, edits })
  function remember() {
    const h = history.current
    h.undo.push(workNow())
    if (h.undo.length > 60) h.undo.shift()
    h.redo = []
  }
  function undoWork(redo: boolean) {
    const h = history.current
    const s = (redo ? h.redo : h.undo).pop()
    if (!s) return
    ;(redo ? h.undo : h.redo).push(workNow())
    if (source?.kind === 'timeline') setSupers(() => s.supers ?? [])
    setExtras(() => s.extra ?? [])
    setEdits(s.edits); setSel(new Set()); setPlaying(false)
  }
  // Another source: its own history
  const workKey = sourceKey(source)
  useEffect(() => { history.current = { undo: [], redo: [] } }, [workKey])

  /** The next free number for a caption added to this source */
  const freshN = () => {
    if (!source) return 1
    const pool = supersOn ? (source.kind === 'timeline' ? source.supers ?? [] : []) : source.extra ?? []
    return Math.max(supersOn ? 0 : EXTRA_N, ...pool.map((c) => c.n)) + 1
  }
  /** A caption edit with these times, or without times when they are the caption's own */
  const timed = (cur: CueEdit | undefined, n: number, span: Span): CueEdit => {
    const x: CueEdit = { words: {}, ...cur }
    const b = baseCues.find((c) => c.n === n)
    if (b && b.startMs === span.startMs && b.endMs === span.endMs) { delete x.startMs; delete x.endMs }
    else { x.startMs = span.startMs; x.endMs = span.endMs }
    return x
  }
  /** A caption edit with this text, or without one when it is the caption's own */
  const texted = (cur: CueEdit, n: number, text: string): CueEdit => {
    const x: CueEdit = { ...cur }
    if (baseCues.find((c) => c.n === n)?.text === text) delete x.text
    else x.text = text
    return x
  }
  function setTimes(list: { n: number; span: Span }[]) {
    if (supersOn) {
      const m = new Map(list.map((x) => [x.n, x.span]))
      setSupers((l) => l.map((c) => { const s = m.get(c.n); return s ? superCue({ n: c.n, text: c.text, ...s }) : c }))
      return
    }
    setEdits((e) => { const x = { ...e }; for (const { n, span } of list) x[n] = timed(x[n], n, span); return x })
  }
  /** Take captions out: supers and added captions go; a source's own are left out */
  function removeCues(ns: number[]) {
    const gone = new Set(ns)
    if (supersOn) setSupers((l) => l.filter((c) => !gone.has(c.n)))
    else setExtras((l) => l.filter((c) => !gone.has(c.n)))
    setEdits((e) => {
      const x = { ...e }
      for (const n of ns) { if (supersOn || n > EXTRA_N) delete x[n]; else x[n] = { words: {}, ...x[n], off: true } }
      return x
    })
  }
  function deleteCues(ns: number[]) {
    if (!ns.length) return
    remember()
    const gone = new Set(ns)
    const i = cues.findIndex((c) => c.n === (cue?.n ?? ns[0]))
    const next = cues.slice(i + 1).find((c) => !gone.has(c.n)) ?? cues.slice(0, Math.max(0, i)).reverse().find((c) => !gone.has(c.n))
    removeCues(ns)
    setSel(new Set())
    if (next) setActive(next.n)
  }

  /** Captions being worked on: the selected ones, else the current one */
  const picked = () => cues.filter((c) => (sel.size ? sel.has(c.n) : c.n === cue?.n))
  /** Copies (with their own looks), the first starting at `at`, the rest as far after it as before */
  function placeCopies(list: { cue: Cue; edit?: CueEdit }[], at: number) {
    if (!list.length || !source) return
    remember()
    const from = Math.min(...list.map((x) => x.cue.startMs))
    let n = freshN() - 1
    const made = list.map((x) => ({ edit: lookPart(x.edit), text: x.cue.text, n: ++n, startMs: x.cue.startMs - from + at, endMs: x.cue.endMs - from + at }))
    const add = (l: Cue[]) => [...l, ...made.map((m) => superCue({ n: m.n, startMs: m.startMs, endMs: m.endMs, text: m.text }))]
    if (supersOn) setSupers(add)
    else setExtras(add)
    setEdits((e) => { const x = { ...e }; for (const m of made) if (m.edit) x[m.n] = m.edit; return x })
    const first = made[0]!
    setSel(new Set(made.map((m) => m.n))); setActive(first.n); setSelWord(null); setPlaying(false)
    clock.set(first.startMs + Math.min(1200, (first.endMs - first.startMs) / 2))
  }
  const clip = useRef<{ cue: Cue; edit?: CueEdit }[]>([])
  const withEdits = (list: Cue[]) => list.map((c) => ({ cue: c, edit: edits[c.n] }))
  /** Cut the current caption in two at the playhead. A super's halves both keep its text; a
   *  caption's words are shared out by time. The second half keeps the look. */
  function splitCue() {
    if (!cue || !source) return
    const halves = splitAt(cue, clock.get(), fps)
    if (!halves) return
    remember()
    const n = freshN()
    const [a, b] = halves
    const [t1, t2] = supersOn ? [cue.text, cue.text] : splitText(cue.text, (a.endMs - a.startMs) / (cue.endMs - cue.startMs))
    if (supersOn) setSupers((l) => [...l.map((c) => (c.n === cue.n ? superCue({ n: c.n, text: c.text, ...a }) : c)), superCue({ n, text: t2, ...b })])
    else setExtras((l) => [...l, superCue({ n, text: t2, ...b })])
    setEdits((e) => {
      const x = { ...e }
      if (!supersOn) x[cue.n] = texted(timed(x[cue.n], cue.n, a), cue.n, t1)
      const own = lookPart(e[cue.n])
      // Word looks count words from the start: the second half's words are others
      if (own) x[n] = supersOn ? own : { ...own, words: {} }
      return x
    })
    setActive(n); setSel(new Set([n])); setSelWord(null); setPlaying(false)
  }
  /** Join the selected captions (or this one and the next) into the first: its look, all their time and words */
  function joinCues() {
    const sorted = (sel.size > 1 ? picked() : cue ? cues.slice(cues.indexOf(cue), cues.indexOf(cue) + 2) : [])
    if (sorted.length < 2) return
    remember()
    const [first, ...rest] = sorted
    const endMs = Math.max(...sorted.map((c) => c.endMs))
    const texts = sorted.map((c) => c.text.trim())
    const text = texts.filter((t, i) => i === 0 || t !== texts[i - 1]).join(' ')
    removeCues(rest.map((c) => c.n))
    if (supersOn) updateSuper(first!.n, { endMs, text })
    else setEdits((e) => ({ ...e, [first!.n]: texted(timed(e[first!.n], first!.n, { startMs: first!.startMs, endMs }), first!.n, text) }))
    setActive(first!.n); setSel(new Set([first!.n])); setSelWord(null); setPlaying(false)
  }
  function nudgeCues(frames: number, again: boolean) {
    const list = picked()
    if (!list.length) return
    if (!again) remember()
    const moved = list.map((c) => ({ n: c.n, span: nudge(c, frames, fps) }))
    setTimes(moved)
    // The playhead goes along, so the preview keeps showing it
    const c = moved.find((x) => x.n === cue?.n)?.span
    if (c && !playing) clock.set(Math.min(c.endMs - 1, Math.max(c.startMs, clock.get() + frames * (1000 / fps))))
  }
  /** A drag on the timeline (the dragged caption first, then any others moving with it): one undo step */
  const retiming = useRef(false)
  function retimeCues(list: { n: number; span: Span }[], end: boolean) {
    if (!list.length) return
    if (!retiming.current) { remember(); retiming.current = true; setPlaying(false) }
    setTimes(list)
    if (!end) return
    retiming.current = false
    const { n, span } = list[0]!
    setActive(n); setSelWord(null)
    if (!sel.has(n)) setSel(new Set([n]))
    // Park the playhead inside it, so the preview shows it where it now is
    if (clock.get() < span.startMs || clock.get() >= span.endMs) clock.set(span.startMs + Math.min(1200, (span.endMs - span.startMs) / 2))
  }

  const baseCues = useMemo(() => cuesOf(source), [source])
  const cues: Cue[] = useMemo(() => editedCues(baseCues, edits), [baseCues, edits])
  const cue = cues.find((c) => c.n === active) ?? cues[0] ?? null
  /** Each caption's place in the script, for the pattern's chunks */
  const order = useMemo(() => new Map(baseCues.map((c, i) => [c.n, i])), [baseCues])
  const patterned = useMemo(() => (patternOn ? patternList(pattern, baseCues.length) : []), [patternOn, pattern, baseCues.length])
  /** Smart Auto's pick for each caption, by caption number */
  const smartPicks = useMemo(() => {
    if (!smart.on) return null
    const list = smartList(cues, smart.mood, smart.seed)
    return new Map(cues.map((c, i) => [c.n, list[i]!]))
  }, [smart, cues])
  /** A caption's own animation, else Smart Auto's, else the pattern's for its chunk, else the one for all */
  const presetOf = (n: number) => edits[n]?.preset ?? smartPicks?.get(n)?.preset ?? patterned[order.get(n) ?? -1] ?? defaultPreset
  const effLook = cue ? lookOf(look, edits, cue.n) : look

  // Caption changes are kept on this computer for each source as they are made
  const srcKey = sourceKey(source)
  useEffect(() => {
    if (srcKey) store('mc.edits.' + srcKey, { list: editsByStart(edits, baseCues) })
  }, [edits, srcKey, baseCues])

  /** What each caption was in the last Send from this source that went in, by its time
   *  (caption signatures, core/job.ts). null before the first: then Send places them all. */
  const [sent, setSent] = useState<Record<string, string> | null>(null)
  useEffect(() => {
    setSent(srcKey ? saved('mc.sent.' + srcKey, { sigs: null as Record<string, string> | null }).sigs : null)
  }, [srcKey])
  /** How many captions differ from that Send; null while unknown */
  const [changed, setChanged] = useState<number | null>(null)

  /** A caption's word looks: its own, else (with no highlight rule) the word Smart Auto lights */
  const wordsOf = useCallback((n: number) => {
    const own = edits[n]?.words
    if (own && Object.keys(own).length) return own
    const em = smartPicks?.get(n)?.emphasis
    return em != null && highlight.rule === 'off' ? { [em]: { color: highlight.color, scale: highlight.scale } } : {}
  }, [edits, smartPicks, highlight])
  const opts = useCallback((n: number): Partial<CompileOpts> => ({
    look: lookOf(look, edits, n), words: wordsOf(n), highlight, motion, measure, aspect, hasGlyphs,
  }), [look, edits, highlight, motion, aspect, wordsOf])

  const compiled = useMemo(() => {
    if (!cue || cue.endMs <= cue.startMs || !cue.text.trim()) return null
    try { return compileCue(cue, hoverPreset ?? presetOf(cue.n), opts(cue.n)) } catch { return null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue, opts, defaultPreset, patterned, hoverPreset, smartPicks])

  // Count the captions that differ from the last Send, a moment after the last change.
  // The count is for the button; Resolve itself decides what an update touches.
  useEffect(() => {
    if (!sent) { setChanged(null); return }
    const t = setTimeout(() => {
      let n = 0
      const seen = new Set<string>()
      for (const c of cues) {
        if (c.endMs <= c.startMs || !c.text.trim()) continue
        seen.add(sentKey(c))
        try { if (sent[sentKey(c)] !== sendSig(compileCue(c, presetOf(c.n), opts(c.n)), drawn, drawn && movOut)) n++ } catch { n++ }
      }
      for (const k of Object.keys(sent)) if (!seen.has(k)) n++
      setChanged(n)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent, cues, opts, defaultPreset, patterned, drawn, smartPicks])

  // ── Scope-aware changes ──
  const targets = (): number[] => (scope === 'selected' ? [...sel] : cue ? [cue.n] : [])
  function changeLook(partial: Partial<Look>) {
    if (scope === 'all') {
      setLook((l) => ({ ...l, ...partial }))
      const keys = Object.keys(partial)
      setEdits((e) => Object.fromEntries(Object.entries(e).map(([n, x]) => [n, { ...x, look: without(x.look, keys) }])))
      return
    }
    setEdits((e) => {
      const next = { ...e }
      for (const n of targets()) next[n] = { words: {}, ...next[n], look: { ...next[n]?.look, ...partial } }
      return next
    })
  }
  function pickPreset(id: string) {
    setRecent((r) => [id, ...r.filter((x) => x !== id)].slice(0, 12))
    if (scope === 'all') {
      setDefaultPreset(id)
      setPatternOn(false)
      setSmart((s) => ({ ...s, on: false }))
      setEdits((e) => Object.fromEntries(Object.entries(e).map(([n, x]) => [n, { ...x, preset: undefined }])))
      return
    }
    setEdits((e) => {
      const next = { ...e }
      for (const n of targets()) next[n] = { words: {}, ...next[n], preset: id }
      return next
    })
  }
  /** The pattern over all captions (each one's own animation goes), or over the selected
   *  ones in order (they get it as their own animation) */
  function applyPattern() {
    if (!pattern.ids.length) return
    setPatternPick(false)
    if (scope === 'selected' && sel.size) {
      const ns = baseCues.filter((c) => sel.has(c.n)).map((c) => c.n)
      const list = patternList(pattern, ns.length)
      setEdits((e) => {
        const next = { ...e }
        ns.forEach((n, i) => { next[n] = { words: {}, ...next[n], preset: list[i] } })
        return next
      })
      return
    }
    setPatternOn(true)
    setSmart((s) => ({ ...s, on: false }))
    setEdits((e) => Object.fromEntries(Object.entries(e).map(([n, x]) => [n, { ...x, preset: undefined }])))
  }
  /** Smart Auto on for all captions: their own animations and the pattern give way to it */
  function changeSmart(x: Partial<Smart>) {
    setSmart((s) => ({ ...s, ...x }))
    if (x.on) {
      setPatternOn(false); setPatternPick(false)
      setEdits((e) => Object.fromEntries(Object.entries(e).map(([n, v]) => [n, { ...v, preset: undefined }])))
    }
  }
  /** What Smart Auto saw, e.g. "1 opening hook · 2 short and strong · 5 lines" */
  const smartNote = useMemo(() => {
    if (!smartPicks) return ''
    const count = new Map<Kind, number>()
    for (const p of smartPicks.values()) count.set(p.kind, (count.get(p.kind) ?? 0) + 1)
    return (Object.keys(KIND_NAMES) as Kind[]).filter((k) => count.get(k)).map((k) => `${count.get(k)} ${KIND_NAMES[k]}`).join(' · ')
  }, [smartPicks])
  function changeWord(partial: Partial<WordLook> | null) {
    if (!cue || selWord === null) return
    const word = norm(wordsIn(cue.text)[selWord] ?? '')
    const hits: [number, number][] = everywhere && word
      ? cues.flatMap((c) => wordsIn(c.text).flatMap((w, i) => (norm(w) === word ? [[c.n, i] as [number, number]] : [])))
      : [[cue.n, selWord]]
    setEdits((e) => {
      const next = { ...e }
      for (const [n, i] of hits) {
        const cur = next[n] ?? { words: {} }
        const words = { ...cur.words }
        // An unset field follows the caption again; a word with nothing left has no own look
        const w: Record<string, unknown> = partial === null ? {} : { ...words[i], ...partial }
        for (const k of Object.keys(w)) if (w[k] === undefined) delete w[k]
        if (Object.keys(w).length) words[i] = w as WordLook
        else delete words[i]
        next[n] = { ...cur, words }
      }
      return next
    })
  }
  function setText(text: string | null) {
    if (!cue) return
    if (supersOn) { if (text !== null) updateSuper(cue.n, { text }); return }
    setEdits((e) => ({ ...e, [cue.n]: { words: {}, ...e[cue.n], text: text ?? undefined } }))
  }

  // Drag in the viewer moves the caption; the start position is taken when the drag begins
  const dragFrom = useRef<{ x: number; y: number } | null>(null)
  function drag(dx: number, dy: number, end: boolean) {
    if (!dragFrom.current) dragFrom.current = { x: effLook.x, y: effLook.y }
    const r = (v: number) => Math.round(v * 200) / 200
    changeLook({ x: r(dragFrom.current.x + dx), y: r(dragFrom.current.y + dy) })
    if (end) dragFrom.current = null
    setPlaying(false)
  }

  // ── Playback: Space runs the playhead along the timeline, caption after caption ──
  /** The timeline's own length in Resolve; an SRT ends with its last caption */
  const tlLength = source?.kind === 'timeline' ? timelineLength(source.data) : 0
  const endMs = cues.reduce((m, c) => Math.max(m, c.endMs), tlLength)
  const live = useRef({ cues, endMs, active: cue?.n ?? 0, playing })
  live.current = { cues, endMs, active: cue?.n ?? 0, playing }
  /** Picking a caption parks the playhead where it is fully on screen; Play then starts from the caption's start */
  const parkedFrom = useRef<number | null>(null)
  const cueAt = (ms: number) => live.current.cues.find((c) => ms >= c.startMs && ms < c.endMs)
  function seekCue(n: number) {
    const c = cues.find((x) => x.n === n)
    if (!c) return
    setActive(n)
    setSelWord(null)
    if (live.current.playing) { parkedFrom.current = null; clock.set(c.startMs); return }
    parkedFrom.current = c.startMs
    clock.set(c.startMs + Math.min(1200, (c.endMs - c.startMs) / 2))
  }
  /** Goes up when Home / End jump the playhead, so the timeline scrolls to it */
  const [reveal, setReveal] = useState(0)
  function seek(ms: number) {
    parkedFrom.current = null
    clock.set(Math.min(ms, endMs))
    const c = cueAt(ms)
    if (c && c.n !== cue?.n) { setActive(c.n); setSelWord(null) }
  }
  // A new set of captions: show the current one
  useEffect(() => {
    const c = baseCues.find((x) => x.n === active) ?? baseCues[0]
    if (c) seekCue(c.n)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseCues])
  useEffect(() => {
    if (!playing) return
    if (parkedFrom.current !== null) { clock.set(parkedFrom.current); parkedFrom.current = null }
    if (clock.get() >= live.current.endMs - 1) clock.set(0)
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      // The timeline video, while it plays, sets the time; otherwise the wall clock does
      const t = media.now() ?? clock.get() + (now - last)
      last = now
      if (t >= live.current.endMs) { clock.set(live.current.endMs); setPlaying(false); return }
      clock.set(t)
      const c = cueAt(t)
      if (c && c.n !== live.current.active) { live.current.active = c.n; setActive(c.n); setSelWord(null) }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  function tryPreset(id: string | null) {
    if (id && playing) setPlaying(false)
    setHoverPreset(id)
  }
  const tryingName = hoverPreset ? presetById(hoverPreset)?.name ?? '' : null

  // ── Reset: this project's work back to how the app starts ──
  function resetAll() {
    setUndo({ look, highlight, motion, edits, extra: source?.extra, preset: defaultPreset, target, safe, styleBase, pattern, patternOn })
    setExtras(() => [])
    setPattern(EMPTY_PATTERN); setPatternOn(false); setPatternPick(false); setSmart(DEFAULT_SMART)
    setLook(stateKit ? SUPER_LOOK : DEFAULT_LOOK); setHighlight(DEFAULT_HIGHLIGHT); setMotion(DEFAULT_MOTION); setStyleBase(NO_STYLE)
    // Text+ layers go back to the look they have in Resolve
    setEdits(editsOf(source)); setDefaultPreset(stateKit ? SUPER_PRESET : DEFAULT_PRESET); setTarget(DEFAULT_TARGET); setSafe('off')
    setSel(new Set()); setSelWord(null); setScope('all'); setEverywhere(false); setTab('Look')
    setPlaying(false); setHoverPreset(null); setResetting(false)
    const first = baseCues[0]
    if (first) { live.current.playing = false; seekCue(first.n) }
  }
  function undoReset() {
    if (!undo) return
    setLook(undo.look); setHighlight(undo.highlight); setMotion(undo.motion); setStyleBase(undo.styleBase)
    setEdits(undo.edits); setExtras(() => undo.extra ?? []); setDefaultPreset(undo.preset); setTarget(undo.target); setSafe(undo.safe)
    setPattern(undo.pattern); setPatternOn(undo.patternOn)
    setUndo(null)
  }
  // The Undo offer goes away after a while
  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), 12000)
    return () => clearTimeout(t)
  }, [undo])

  // ── Timeline selection ──
  const anchor = useRef<number | null>(null)
  // Nothing selected any more (deleted, joined, undone): changes go to all captions again
  useEffect(() => { if (!sel.size && scope === 'selected') setScope('all') }, [sel, scope])
  function pickCue(n: number, mode: 'set' | 'toggle' | 'range') {
    seekCue(n)
    if (mode === 'range' && anchor.current !== null) {
      const ns = cues.map((c) => c.n)
      const a = ns.indexOf(anchor.current)
      const b = ns.indexOf(n)
      if (a >= 0 && b >= 0) { setSel(new Set(ns.slice(Math.min(a, b), Math.max(a, b) + 1))); setScope('selected'); return }
    }
    anchor.current = n
    if (mode === 'toggle') {
      setSel((prev) => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s })
      setScope('selected')
    } else {
      setSel(new Set([n]))
    }
  }
  const step = (d: number) => {
    const i = cues.findIndex((c) => c.n === cue?.n)
    const next = cues[Math.min(cues.length - 1, Math.max(0, i + d))]
    if (next) seekCue(next.n)
  }

  /** Timeline keys (the Shortcuts hint on the timeline lists them) */
  function cueKey(e: KeyboardEvent) {
    const ctrl = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    const done = () => e.preventDefault()
    // , and . move a frame (as in Resolve); with Shift they arrive as < and >
    const back = e.code === 'Comma' || e.key === ',' || e.key === '<'
    const fwd = e.code === 'Period' || e.key === '.' || e.key === '>'
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteCues(picked().map((c) => c.n)); done() }
    else if (ctrl && k === 'z') { undoWork(e.shiftKey); done() }
    else if (ctrl && k === 'y') { undoWork(true); done() }
    else if (ctrl && k === 'c') { clip.current = withEdits(picked()); done() }
    else if (ctrl && k === 'v') { placeCopies(clip.current, onFrame(clock.get(), fps)); done() }
    else if (ctrl && k === 'd') { const l = picked(); if (l.length) placeCopies(withEdits(l), Math.max(...l.map((c) => c.endMs))); done() }
    else if (ctrl && k === 'j') { joinCues(); done() }
    else if ((k === 's' && !ctrl && !e.altKey) || (ctrl && k === 'b')) { splitCue(); done() }
    else if (!ctrl && (back || fwd)) { nudgeCues((back ? -1 : 1) * (e.shiftKey ? 10 : 1), e.repeat); done() }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select')) return
      if (e.key === 'ArrowRight') { step(1); e.preventDefault() }
      else if (e.key === 'ArrowLeft') { step(-1); e.preventDefault() }
      else if (e.key === ' ') { if (!e.repeat) setPlaying((p) => !p); e.preventDefault() }
      else if (e.key === 'Home') { seek(0); setReveal((r) => r + 1); e.preventDefault() }
      else if (e.key === 'End') { seek(endMs); setReveal((r) => r + 1); e.preventDefault() }
      else if (e.key === 'Escape') { setSel(new Set()); setSelWord(null); if (scope === 'selected') setScope('all') }
      else cueKey(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── Send ──
  const placeable = cues.filter((c) => c.endMs > c.startMs && c.text.trim() !== '')
  const srcName = source?.kind === 'timeline' ? srcNameOf(source.data, source.track)
    : source?.kind === 'srt' ? source.name : ''
  /** Read captions from another subtitle track, or from Text+ layers (all, or one track's) */
  function switchSource(track: SrcTrack) {
    if (source?.kind !== 'timeline') return
    const next: Source = withExtras({ ...source, track })
    setSource(next); setEdits(keptEdits(next)); setSel(new Set()); setSelWord(null); setActive(1)
  }
  /** Text+ layers the placed captions come from (caption n = layer n) */
  const fromLayers = () => {
    const layers = layersOf(source)
    const ns = [...placeable.map((c) => c.n), ...baseCues.filter((c) => edits[c.n]?.off).map((c) => c.n)]
    return ns.flatMap((n) => { const t = layers[n - 1]; return t ? [{ track: t.track, at: t.at }] : [] })
  }
  /** The timeline's picture and sound under the preview, without the Text+ layers these captions come from */
  const tlVideo = useTimelineVideo({
    project: source?.kind === 'timeline' ? source.data.project : undefined, timeline: tl?.name ?? null, linked: link.alive,
    hideClips: () => (source?.kind === 'timeline' && isTextSrc(source.track) ? layersOf(source).map((t) => ({ track: t.track, at: t.at })) : []),
  })
  const where = target.track === 'new' ? 'a new track above everything'
    : `V${target.track} · ${timelineInfo?.video?.find((v) => v.index === target.track)?.name ?? ''} (empty spots; the rest on a new track)`
  /** The job last handed to Send: its id and each caption's signature by its time */
  const built = useRef<{ id: string; sigs: Record<string, string> } | null>(null)
  async function buildJob(onDraw?: (p: RenderProgress) => void) {
    const out = placeable.map((c) => compileCue(c, presetOf(c.n), opts(c.n)))
    let renders: Rendered[] | undefined
    if (drawn && tl) {
      const off = onDraw ? window.mc.onRenderProgress(onDraw) : null
      try { renders = await window.mc.renderCues({ width: tl.width, height: tl.height, fps: tl.rate, cues: out, mov: movOut }) } finally { off?.() }
    }
    const job = makeJob(srcName || 'Captions', out, undefined, new Date(), {
      renders,
      project: source?.kind === 'timeline' ? source.data.project : undefined,
      timeline: tl?.name,
      target: {
        track: target.track, replace: target.replace,
        ...(source?.kind === 'timeline' && target.turnOffSource
          ? (isTextSrc(source.track) ? { disableClips: fromLayers() } : typeof source.track === 'number' ? { disableSubtitle: source.track } : {})
          : {}),
      },
    })
    built.current = { id: job.id, sigs: Object.fromEntries(job.cues.map((c) => [sentKey(c), c.sig])) }
    return { id: job.id, lua: jobToLua(job) }
  }
  /** The job went in: from here on, Send is an update of these captions */
  function sentOk(jobId: string) {
    if (!srcKey || built.current?.id !== jobId) return
    setSent(built.current.sigs)
    store('mc.sent.' + srcKey, { sigs: built.current.sigs })
  }
  const updating = sent !== null && target.replace
  const one = noun.slice(0, -1)
  const sendLabel = !updating ? `Send ${placeable.length} ${noun} to Resolve`
    : changed === null ? 'Update in Resolve'
      : changed === 0 ? 'Update · nothing changed'
        : `Update ${changed} changed ${changed === 1 ? one : noun}`

  const ownLook = (n: number) => !!(edits[n]?.look || edits[n]?.preset || Object.keys(edits[n]?.words ?? {}).length)
  const words = cue ? wordsIn(cue.text) : []
  const styledWords = new Set(Object.keys(edits[cue?.n ?? -1]?.words ?? {}).map(Number))
  const scopeTarget = scope === 'all' ? `all ${cues.length} captions` : scope === 'selected' ? `${sel.size} selected captions` : `caption ${cue?.n ?? ''}`

  const readAt = timelineInfo?.readAt ? new Date(timelineInfo.readAt) : null

  return (
    <div className="app2">
      <header className="menubar2">
        <AppMenu u={updates} />
        <b>MotionCaption <em>Studio</em></b>
        {source?.kind === 'timeline' && tl && (
          <span className="link" title={`Linked to this Resolve timeline · ${tl.width}×${tl.height} · ${tl.fps} fps`
            + (readAt ? ` · read ${readAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '')}><i className="dot" /><b>{tl.name}</b></span>
        )}
        {!source && (
          <span className="link">{link.alive
            ? <><i className="dot" />Resolve linked{link.timeline && <><i className="sep" /><b>{link.timeline}</b></>}</>
            : <><i className="dot wait" />Waiting for Resolve</>}</span>
        )}
        {source?.kind === 'srt' && (
          <span className="link"><i className="dot off" />{source.name}<i className="sep" />frame
            <Dropdown className="sl" value={frame} onChange={(v) => setFrame(v)}>{FRAMES.map((f) => <option key={f.label}>{f.label}</option>)}</Dropdown>
          </span>
        )}
        <span className="grow" />
        <button className="mini" title="Read the timeline open in Resolve again"
          onClick={() => (link.alive ? window.mc.refreshTimeline() : window.mc.runInResolve())}><Icon name="refresh" />Refresh from Resolve</button>
        <button className="mini" title="Your looks, styles, animation settings and My Animations in one file: save it, or load one" onClick={() => setBranding(true)}>Brand kit</button>
        {source && <button className="mini" title="Put every setting and caption change back to how the app starts" onClick={() => setResetting(true)}><Icon name="undo" />Reset</button>}
        {source && <button className="mini" onClick={openSrt}><Icon name="file" />Open SRT…</button>}
        {source && <button className="go cta" disabled={!placeable.length} onClick={() => setSending(true)}><Icon name="send" />{sendLabel}</button>}
      </header>
      <UpdateStrip u={updates} />

      {!source ? (
        <Welcome info={timelineInfo} last={last} link={link} onLast={() => showTimeline(last)} onSrt={openSrt} onSrtFile={loadSrt} />
      ) : (
        <div className={'studio2' + (aspect >= 1 ? ' wide' : '')}>
          <Viewer cue={compiled} aspect={aspect} fps={fps} safe={safe} selWord={selWord} playing={playing} loop={!!hoverPreset}
            endMs={endMs} onSeek={seek} video={tlVideo.shown} videoTools={tlVideo.tools}
            label={tryingName !== null ? `Trying ${tryingName} · click to use`
              : cue ? `${supersOn ? 'Super' : 'Caption'} ${cues.indexOf(cue) + 1} of ${cues.length} · ${presetById(presetOf(cue.n))?.name ?? ''}`
                : supersOn ? 'No supers yet: Add super on the timeline' : 'No captions'}
            onPlaying={setPlaying} onPrev={() => step(-1)} onNext={() => step(1)}
            onPickWord={(i) => { setSelWord(i); setTab('Words'); setPlaying(false) }} onDrag={drag}
            onSize={(size) => { changeLook({ size }); setPlaying(false) }} onTurn={(rotation) => { changeLook({ rotation }); setPlaying(false) }}
            path={cue && (pathDraw || (tab === 'Position' && effLook.path.length > 0)) ? {
              points: effLook.path, draw: pathDraw,
              onAdd: (dx, dy) => { const r = (v: number) => Math.round(v * 1000) / 1000; changeLook({ path: [...effLook.path, [r(dx), r(dy)]] }); setPlaying(false) },
            } : null} />
          <CaptionCard caption={cue} total={cues.length} words={words} selWord={selWord} styled={styledWords} fps={fps}
            onWord={(i) => { setSelWord(i); setTab('Words'); setPlaying(false) }} />
          <LibraryD current={cue ? presetOf(cue.n) : defaultPreset} target={scopeTarget} recent={recent} onHover={tryPreset}
            favs={favs} onFav={(id) => setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]))}
            mine={mine} onMine={(m) => { pickPreset(m.preset); setMotion({ ...DEFAULT_MOTION, ...m.motion }) }}
            onRemoveMine={(name) => setMine((l) => l.filter((x) => x.name !== name))}
            adding={patternPick} onPick={patternPick ? (id) => setPattern((x) => ({ ...x, ids: [...x.ids, id] })) : pickPreset} />
          <Inspector
            tab={tab} onTab={setTab} scope={scope} onScope={setScope} selected={sel.size} total={cues.length}
            look={effLook} onLook={changeLook} styles={[...BUILT_IN_STYLES, ...userStyles]}
            base={baseLook} styleName={styleBase.name}
            onPickStyle={(s) => { changeLook(s.look); setStyleBase({ name: s.name, look: s.look }) }}
            onSaveStyle={(name) => {
              const { font, style, size, tracking, lineSpacing, textCase, fill, outline, shadow, box, gradient, image } = effLook
              const list = [...userStyles.filter((s) => s.name !== name), { name, look: { font, style, size, tracking, lineSpacing, textCase, fill, outline, shadow, box, gradient, image } }]
              setUserStyles(list); store('mc.styles', { list })
            }}
            fonts={fonts} fontUsed={compiled && compiled.look.font !== effLook.font ? compiled.look.font : null}
            caption={cue ? { n: cue.n, text: cue.text, startMs: cue.startMs, endMs: cue.endMs, edited: edits[cue.n]?.text !== undefined } : null}
            timeEdit={cue ? {
              isSuper: supersOn,
              onStart: (ms) => { remember(); setTimes([{ n: cue.n, span: { startMs: Math.max(0, Math.min(ms, cue.endMs - 40)), endMs: cue.endMs } }]) },
              onEnd: (ms) => { remember(); setTimes([{ n: cue.n, span: { startMs: cue.startMs, endMs: Math.max(ms, cue.startMs + 40) } }]) },
              onDelete: () => deleteCues([cue.n]),
              onReset: !supersOn && (edits[cue.n]?.startMs !== undefined || edits[cue.n]?.endMs !== undefined) ? () => {
                const b = baseCues.find((c) => c.n === cue.n)
                if (b) { remember(); setTimes([{ n: cue.n, span: { startMs: b.startMs, endMs: b.endMs } }]) }
              } : null,
            } : null}
            fps={fps} onText={setText}
            words={words} selWord={selWord} onSelWord={(i) => { setSelWord(i); setPlaying(false) }}
            wordLook={cue && selWord !== null ? edits[cue.n]?.words[selWord] ?? null : null}
            styledWords={styledWords} onWordLook={changeWord} everywhere={everywhere} onEverywhere={setEverywhere}
            highlight={highlight} onHighlight={(h) => setHighlight((x) => ({ ...x, ...h }))}
            preset={cue ? presetOf(cue.n) : defaultPreset} onPreset={pickPreset}
            onSaveMine={(name) => {
              const m = { name, preset: cue ? presetOf(cue.n) : defaultPreset, motion }
              setMine((l) => [...l.filter((x) => x.name !== name), m])
            }}
            pattern={pattern} onPattern={(x) => setPattern((y) => ({ ...y, ...x }))} patternOn={patternOn}
            onApplyPattern={applyPattern} onStopPattern={() => setPatternOn(false)}
            smart={smart} onSmart={changeSmart} smartNote={smartNote}
            patternPick={patternPick} onPatternPick={setPatternPick}
            motion={motion} onMotion={(m) => setMotion((x) => ({ ...x, ...m }))}
            safe={safe} onSafe={setSafe}
            drawn={drawn} pathDraw={pathDraw} onPathDraw={setPathDraw}
          />
          <TimelineD
            data={source.kind === 'timeline' ? source.data : null}
            srcTrack={source.kind === 'timeline' ? source.track : null}
            onSrcTrack={switchSource}
            srcName={srcName} cues={cues} presetName={(n) => presetById(presetOf(n))?.name ?? ''} ownLook={ownLook}
            active={cue?.n ?? 0} sel={sel} onCue={pickCue} playing={playing} onSeek={seek} reveal={reveal}
            target={target} onTarget={(t) => setTarget((x) => ({ ...x, ...t }))} fps={fps} lengthMs={tlLength}
            supers={source.kind === 'timeline' ? (source.supers ?? []).length : 0} onAddSuper={supersOn ? addSuper : null}
            onRetime={retimeCues} onTemplate={supersOn ? addTemplate : null}
          />
        </div>
      )}
      <UpdateDialog u={updates} />
      {resetting && <ResetDialog onReset={resetAll} onClose={() => setResetting(false)} />}
      {branding && <BrandDialog onClose={() => setBranding(false)}
        current={() => ({ kit: stateKit, look, motion, highlight })}
        onLoaded={(k) => {
          // Styles, My Animations and Favourites are added to; the looks and settings replace these
          setUserStyles((l) => { const list = [...l.filter((s) => !k.styles.some((x) => x.name === s.name)), ...k.styles]; store('mc.styles', { list }); return list })
          setMine((l) => [...l.filter((m) => !k.mine.some((x) => x.name === m.name)), ...k.mine])
          setFavs((f) => [...new Set([...f, ...k.favs])])
          setLook(saved('mc.look' + stateKit, stateKit ? SUPER_LOOK : DEFAULT_LOOK))
          setMotion(saved('mc.motion' + stateKit, DEFAULT_MOTION))
          setHighlight(saved('mc.highlight' + stateKit, DEFAULT_HIGHLIGHT))
        }} />}
      {undo && (
        <div className="toast">Everything is back to default.
          <button className="mini" onClick={undoReset}>Undo</button>
          <button className="x" onClick={() => setUndo(null)} title="Close">✕</button>
        </div>
      )}
      {sending && <SendDialog captions={placeable.length} noun={noun} where={where} timeline={tl?.name ?? null} linked={link.alive} build={buildJob}
        delivery={drawn ? 'drawn' : 'textplus'} canDraw={!!tl} onDelivery={setDelivery} mov={movOut} onMov={setMovOut}
        update={updating ? { changed } : null} onDone={sentOk} onClose={() => setSending(false)} />}
    </div>
  )
}

/** A brand kit file: everything that makes captions look like yours, for another computer or a teammate */
interface BrandKit {
  app: 'MotionCaption'
  kind: 'brand-kit'
  version: 1
  savedAt: string
  styles: { name: string; look: Partial<Look> }[]
  captions: { look: Look; motion: Motion; highlight: Highlight }
  supers: { look: Look; motion: Motion; highlight: Highlight }
  mine: MyAnimation[]
  favs: string[]
}

function BrandDialog({ onClose, current, onLoaded }: {
  onClose: () => void
  /** The settings in use (the open kit's are newer than the ones kept) */
  current: () => { kit: string; look: Look; motion: Motion; highlight: Highlight }
  onLoaded: (k: BrandKit) => void
}) {
  const [note, setNote] = useState('')
  const kitOf = (k: string) => {
    const c = current()
    if (c.kit === k) return { look: c.look, motion: c.motion, highlight: c.highlight }
    return {
      look: saved('mc.look' + k, k ? SUPER_LOOK : DEFAULT_LOOK), motion: saved('mc.motion' + k, DEFAULT_MOTION),
      highlight: saved('mc.highlight' + k, DEFAULT_HIGHLIGHT),
    }
  }
  function save() {
    const kit: BrandKit = {
      app: 'MotionCaption', kind: 'brand-kit', version: 1, savedAt: new Date().toISOString(),
      styles: saved('mc.styles', { list: [] as BrandKit['styles'] }).list,
      captions: kitOf(''), supers: kitOf('.supers'),
      mine: saved('mc.mine', { list: [] as MyAnimation[] }).list, favs: saved('mc.favs', { list: [] as string[] }).list,
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(kit, null, 2)], { type: 'application/json' }))
    a.download = 'MotionCaption brand kit.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    setNote('Saved. Keep the file, or send it to whoever should make captions like yours.')
  }
  async function load(f: File | undefined) {
    if (!f) return
    try {
      const k = JSON.parse(await f.text()) as BrandKit
      if (k.kind !== 'brand-kit' || k.app !== 'MotionCaption') { setNote('That file is not a MotionCaption brand kit.'); return }
      for (const [key, part] of [['', k.captions], ['.supers', k.supers]] as const) {
        if (!part) continue
        store('mc.look' + key, { ...(key ? SUPER_LOOK : DEFAULT_LOOK), ...part.look })
        store('mc.motion' + key, { ...DEFAULT_MOTION, ...part.motion })
        store('mc.highlight' + key, { ...DEFAULT_HIGHLIGHT, ...part.highlight })
      }
      onLoaded({ ...k, styles: k.styles ?? [], mine: k.mine ?? [], favs: k.favs ?? [] })
      setNote(`Loaded “${f.name}”.`)
    } catch { setNote('That file could not be read as a brand kit.') }
  }
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dlg2">
        <div className="dlg2-t"><b>Brand kit</b><button className="x" onClick={onClose} title="Close">✕</button></div>
        <div className="dlg2-b">
          <p className="lead">One file with what makes your captions yours:</p>
          <ul className="how">
            <li>The look, animation settings and word highlight of subtitles, and of supers</li>
            <li>Your saved styles (with their gradient and logo), My Animations and Favourites</li>
          </ul>
          <p className="lead">Loading one replaces the looks and settings here, and adds its styles and animations to yours. Captions' own changes stay.</p>
          <div className="btnrow">
            <button className="go big" onClick={save}>Save brand kit…</button>
            <label className="mini filebtn">Load a brand kit…
              <input type="file" accept=".json,application/json" hidden onChange={(e) => { load(e.target.files?.[0]); e.target.value = '' }} />
            </label>
          </div>
          {note && <p className="hint2">{note}</p>}
        </div>
      </div>
    </div>
  )
}

function ResetDialog({ onReset, onClose }: { onReset: () => void; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dlg2">
        <div className="dlg2-t"><b>Reset to default</b><button className="x" onClick={onClose} title="Close">✕</button></div>
        <div className="dlg2-b">
          <p className="lead">This puts the app back to how it starts, for all captions:</p>
          <ul className="how">
            <li>Look, size, colours, outline, shadow, box and position</li>
            <li>Animation (back to <b>Fade</b>), animation pattern, motion and word highlight</li>
            <li>Every caption's own look, animation, word styles, text and timing edits, and captions cut or copied here</li>
            <li>Send options and safe area</li>
          </ul>
          <p className="lead">Kept: the subtitles from Resolve or your SRT, your saved styles, and anything already sent to Resolve.</p>
          <div className="btnrow">
            <button className="go big" autoFocus onClick={onReset}>Reset everything</button>
            <button className="mini" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Read just now (the app was opened from Resolve), or the Link window in Resolve is open:
 *  it reads the open timeline again whenever another is opened, so its file is current */
async function isCurrent(d: TimelineData): Promise<boolean> {
  if (Math.abs(Date.now() - Date.parse(d.readAt)) < 2 * 60_000) return true
  const l = await window.mc.linkStatus().catch(() => ({ alive: false, timeline: null }))
  if (!l.alive) return false
  window.mc.refreshTimeline().catch(() => {}) // the latest captions too, not only the latest timeline
  return !!d.timeline && l.timeline === d.timeline.name
}

/** When a timeline was read: "Today, 13:29" or "11 Nov, 13:29" */
function whenRead(iso: string): string | null {
  const at = new Date(iso)
  if (isNaN(+at)) return null
  const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return at.toDateString() === new Date().toDateString() ? `Today, ${time}`
    : `${at.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`
}

function Welcome({ info, last, link, onLast, onSrt, onSrtFile }: {
  info: TimelineData | null; last: TimelineData | null; link: LinkStatus
  onLast: () => void; onSrt: () => void; onSrtFile: (f: { name: string; bytes: Uint8Array }) => void
}) {
  const [over, setOver] = useState(false)
  const [asking, setAsking] = useState(false)
  const [why, setWhy] = useState<string | null>(null)
  const noSubs = info?.timeline && !info.subtitle?.length && !usableLayers(info.texts).length

  // A file dropped anywhere else would make the window open it as a page
  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => { window.removeEventListener('dragover', stop); window.removeEventListener('drop', stop) }
  }, [])

  async function readResolve() {
    setWhy(null); setAsking(true)
    try {
      if (link.alive) { await window.mc.refreshTimeline(); return }
      const r = await window.mc.runInResolve()
      setWhy(r === 'OK' ? null : r === 'NO_RESOLVE' ? 'DaVinci Resolve is not open. Open it with your timeline, then try again.'
        : r.startsWith('NO_MENU') ? `Resolve's menu has no ${r.slice(8)} entry. Click Workspace → Scripts → MotionCaption there.`
        : 'Resolve did not answer. Click Workspace → Scripts → MotionCaption there.')
    } finally { setAsking(false) }
  }

  async function drop(e: React.DragEvent) {
    e.preventDefault(); setOver(false)
    const f = [...e.dataTransfer.files].find((x) => /\.srt$/i.test(x.name))
    if (!f) { setWhy(e.dataTransfer.files.length ? 'Only .srt files open here.' : null); return }
    setWhy(null)
    onSrtFile({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })
  }

  const lt = last?.timeline || null
  const lastCount = last ? (last.subtitle?.find((t) => t.cues.length)?.cues.length ?? usableLayers(last.texts).length) : 0
  const lastWhen = last ? whenRead(last.readAt) : null
  const ratio = lt && lt.width && lt.height ? lt.width / lt.height : 16 / 9
  const thumb = ratio >= 1 ? { width: 58, height: Math.round(58 / ratio) } : { width: Math.round(40 * ratio), height: 40 }
  const step = (n: number) => (link.alive ? (n < 3 ? 'done' : 'now') : n === 2 ? 'now' : '')

  return (
    <main className="welcome" onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }} onDrop={drop}>
      <div className="wel">
        <h1>Bring your captions in</h1>
        <p className="sub">From a Resolve timeline, or from an .srt file.</p>

        {noSubs && info?.timeline ? (
          <p className="wwarn">“{info.timeline.name}” has no subtitle track and no Text+ layers yet. Add your subtitles (File → Import → Subtitle) or a Text+ title in Resolve, then click MotionCaption there again.</p>
        ) : info && info.timeline === false ? (
          <p className="wwarn">Resolve had no timeline open. Open one, then click MotionCaption again.</p>
        ) : null}

        <div className="wel-row">
          <section className="wcard">
            <div className="wcard-t"><Icon name="film" />From DaVinci Resolve<span className="tag">Recommended</span></div>
            <ol className="steps">
              <li className={step(1)}><span className="n">{step(1) === 'done' ? <Icon name="check" /> : 1}</span>
                <span><b>Open your timeline</b>with subtitles on a subtitle track, or Text+ titles</span></li>
              <li className={step(2)}><span className="n">{step(2) === 'done' ? <Icon name="check" /> : 2}</span>
                <span><b>{link.alive && link.timeline ? <>Linked to “{link.timeline}”</> : 'Run MotionCaption there'}</b>
                  <kbd>Workspace</kbd> › <kbd>Scripts</kbd> › <kbd>MotionCaption</kbd></span></li>
              <li className={step(3)}><span className="n">3</span>
                <span><b>Pick a look and Send</b>One more click on MotionCaption in Resolve places them on a video track</span></li>
            </ol>
            <div className="act">
              <button className="go" disabled={asking} onClick={readResolve}><Icon name="refresh" />
                {link.alive ? (link.timeline ? `Read “${link.timeline}”` : 'Read the timeline') : 'Run it in Resolve for me'}</button>
              {!link.alive && <span className="listen"><i className="dot wait" />Listening… this page fills in by itself</span>}
            </div>
          </section>

          <button className={'wcard drop' + (over ? ' over' : '')} onClick={onSrt}>
            <span className="bub"><Icon name="upload" /></span>
            <b>{over ? 'Drop to open' : 'Drop an .srt here'}</b>
            <span className="hint2">No subtitle track? Use a file.</span>
            <span className="mini">Browse…</span>
          </button>
        </div>
        {why && <p className="wwarn">{why}</p>}

        {lt && last && (
          <>
            <p className="wel-k">Continue where you left off</p>
            <div className="wcard recent">
              <span className="thumb"><i style={thumb} /></span>
              <span className="info">
                <b>{lt.name}</b>
                <span>{[last.project, lastCount ? `${lastCount} captions` : null, lt.width && lt.height ? `${lt.width}×${lt.height}` : null, lt.fps ? `${lt.fps} fps` : null].filter(Boolean).join(' · ')}</span>
                <em>{lastWhen ? `${lastWhen} · ` : ''}Resolve may have another timeline open now</em>
              </span>
              <button className="mini" onClick={onLast}>Open it</button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
