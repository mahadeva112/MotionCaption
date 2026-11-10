import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { compileCue, type CompileOpts } from '@core/compile'
import { jobToLua, makeJob, sigOf } from '@core/job'
import { DEFAULT_HIGHLIGHT, DEFAULT_LOOK, DEFAULT_MOTION, type Highlight, type Look, type Motion, type WordLook } from '@core/look'
import { EMPTY_PATTERN, patternList, type Pattern } from '@core/pattern'
import { presetById } from '@core/presets'
import { parseSrt } from '@core/srt'
import type { Cue } from '@core/srt'
import type { LinkStatus, TimelineData } from '../../preload'
import { hasGlyphs, loadFonts, measure, type FontFamily } from './fonts'
import { clock } from './clock'
import { CaptionCard } from './CaptionCard'
import { BUILT_IN_STYLES, Inspector, type Tab } from './Inspector'
import { Icon } from './Icon'
import { LibraryD } from './LibraryD'
import { usableLayers } from '@core/layers'
import {
  cuesOf, editsByStart, editsOf, editsOnto, FRAMES, isTextSrc, layersIn, layersOf, lookOf, norm, sentKey, sourceKey, srcNameOf, wordsIn,
  type Edits, type EditsByStart, type SafeArea, type Scope, type Source, type SrcTrack, type Target,
} from './model'
import { SendDialog } from './SendDialog'
import { TimelineD } from './TimelineD'
import { Viewer } from './Viewer'

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
  /** The work just before a reset, for one Undo */
  const [undo, setUndo] = useState<{ look: Look; highlight: Highlight; motion: Motion; edits: Edits; preset: string; target: Target; safe: SafeArea; styleBase: StyleBase; pattern: Pattern; patternOn: boolean } | null>(null)
  /** Animations that take turns over the captions, a chunk at a time (core/pattern.ts);
   *  on: it runs over all captions in place of the one animation for all */
  const [pattern, setPattern] = useState<Pattern>(() => ({ ...EMPTY_PATTERN, ...saved('mc.pattern', { pattern: EMPTY_PATTERN }).pattern }))
  const [patternOn, setPatternOn] = useState(() => saved('mc.pattern', { on: false }).on)
  /** Clicks in the animation library add to the pattern instead of using the animation */
  const [patternPick, setPatternPick] = useState(false)
  useEffect(() => store('mc.pattern', { pattern, on: patternOn }), [pattern, patternOn])
  const [recent, setRecent] = useState<string[]>(() => saved('mc.misc', { recent: [] as string[] }).recent)
  const [userStyles, setUserStyles] = useState<{ name: string; look: Partial<Look> }[]>(() => saved('mc.styles', { list: [] as { name: string; look: Partial<Look> }[] }).list)
  /** The Style last picked: the Inspector's ↺ buttons put a setting back to its value */
  const [styleBase, setStyleBase] = useState<StyleBase>(() => saved('mc.styleBase', NO_STYLE))
  useEffect(() => store('mc.styleBase', styleBase), [styleBase])
  const baseLook = useMemo<Look>(() => lookOf(DEFAULT_LOOK, { 0: { words: {}, look: styleBase.look } }, 0), [styleBase])

  useEffect(() => store('mc.look', look), [look])
  useEffect(() => store('mc.highlight', highlight), [highlight])
  useEffect(() => store('mc.motion', motion), [motion])
  useEffect(() => store('mc.misc', { preset: defaultPreset, frame, recent }), [defaultPreset, frame, recent])
  useEffect(() => { loadFonts().then(setFonts) }, [])

  // The timeline the Resolve script read; again whenever it writes a new one
  const loadTimeline = useCallback(async () => {
    const d = await window.mc.timeline()
    setTimelineInfo(d)
    const subs = d?.subtitle ?? []
    const hasText = usableLayers(d?.texts).length > 0
    if (!d || !d.timeline || (!subs.length && !hasText)) return
    const tlName = d.timeline.name
    setSource((prev) => {
      const same = prev?.kind === 'timeline' && prev.data.timeline && prev.data.timeline.name === tlName
      const valid = (t: SrcTrack) => (isTextSrc(t) ? layersIn(d.texts, t).length > 0 : subs.some((s) => s.index === t))
      const keep = same && valid(prev.track) ? prev.track : null
      // Subtitles first (the usual case); a timeline with only Text+ layers opens on those
      const track: SrcTrack = keep ?? (subs.find((s) => s.cues.length) ?? subs[0])?.index ?? 'text'
      const next: Source = { kind: 'timeline', data: d, track }
      if (!same || keep === null) { setEdits(keptEdits(next)); setSel(new Set()); setSelWord(null); setActive(1) }
      // The same captions read again: each change stays with its caption, by start time,
      // even when captions were added or removed before it
      else if (prev) { const was = cuesOf(prev); setEdits((e) => editsOnto(editsByStart(e, was), cuesOf(next), editsOf(next))) }
      return next
    })
  }, [])
  useEffect(() => {
    loadTimeline()
    return window.mc.onTimeline(loadTimeline)
  }, [loadTimeline])

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
    if (!picked) return
    const parsed = parseSrt(picked.bytes)
    const next: Source = { kind: 'srt', name: picked.name, cues: parsed.cues, notes: parsed.issues.map((x) => `Line ${x.line}: ${x.message}`) }
    setSource(next)
    setEdits(keptEdits(next)); setSel(new Set()); setSelWord(null); setActive(parsed.cues[0]?.n ?? 1)
    setTarget((t) => ({ ...t, track: 'new' }))
  }

  const tl = source?.kind === 'timeline' && source.data.timeline ? source.data.timeline : null
  const aspect = tl && tl.width && tl.height ? tl.width / tl.height : FRAMES.find((f) => f.label === frame)!.aspect
  const fps = tl?.rate ?? 24

  const baseCues = useMemo(() => cuesOf(source), [source])
  const cues: Cue[] = useMemo(() => baseCues.map((c) => (edits[c.n]?.text !== undefined ? { ...c, text: edits[c.n]!.text! } : c)), [baseCues, edits])
  const cue = cues.find((c) => c.n === active) ?? cues[0] ?? null
  /** Each caption's place in the script, for the pattern's chunks */
  const order = useMemo(() => new Map(baseCues.map((c, i) => [c.n, i])), [baseCues])
  const patterned = useMemo(() => (patternOn ? patternList(pattern, baseCues.length) : []), [patternOn, pattern, baseCues.length])
  /** A caption's own animation, else the pattern's for its chunk, else the one for all */
  const presetOf = (n: number) => edits[n]?.preset ?? patterned[order.get(n) ?? -1] ?? defaultPreset
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

  const opts = useCallback((n: number): Partial<CompileOpts> => ({
    look: lookOf(look, edits, n), words: edits[n]?.words ?? {}, highlight, motion, measure, aspect, hasGlyphs,
  }), [look, edits, highlight, motion, aspect])

  const compiled = useMemo(() => {
    if (!cue || cue.endMs <= cue.startMs || !cue.text.trim()) return null
    try { return compileCue(cue, hoverPreset ?? presetOf(cue.n), opts(cue.n)) } catch { return null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue, opts, defaultPreset, patterned, hoverPreset])

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
        try { if (sent[sentKey(c)] !== sigOf(compileCue(c, presetOf(c.n), opts(c.n)))) n++ } catch { n++ }
      }
      for (const k of Object.keys(sent)) if (!seen.has(k)) n++
      setChanged(n)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent, cues, opts, defaultPreset, patterned])

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
    setEdits((e) => Object.fromEntries(Object.entries(e).map(([n, x]) => [n, { ...x, preset: undefined }])))
  }
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
  const endMs = cues.reduce((m, c) => Math.max(m, c.endMs), 0)
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
      const t = clock.get() + (now - last)
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
    setUndo({ look, highlight, motion, edits, preset: defaultPreset, target, safe, styleBase, pattern, patternOn })
    setPattern(EMPTY_PATTERN); setPatternOn(false); setPatternPick(false)
    setLook(DEFAULT_LOOK); setHighlight(DEFAULT_HIGHLIGHT); setMotion(DEFAULT_MOTION); setStyleBase(NO_STYLE)
    // Text+ layers go back to the look they have in Resolve
    setEdits(editsOf(source)); setDefaultPreset(DEFAULT_PRESET); setTarget(DEFAULT_TARGET); setSafe('off')
    setSel(new Set()); setSelWord(null); setScope('all'); setEverywhere(false); setTab('Look')
    setPlaying(false); setHoverPreset(null); setResetting(false)
    const first = baseCues[0]
    if (first) { live.current.playing = false; seekCue(first.n) }
  }
  function undoReset() {
    if (!undo) return
    setLook(undo.look); setHighlight(undo.highlight); setMotion(undo.motion); setStyleBase(undo.styleBase)
    setEdits(undo.edits); setDefaultPreset(undo.preset); setTarget(undo.target); setSafe(undo.safe)
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select')) return
      if (e.key === 'ArrowRight') { step(1); e.preventDefault() }
      else if (e.key === 'ArrowLeft') { step(-1); e.preventDefault() }
      else if (e.key === ' ') { if (!e.repeat) setPlaying((p) => !p); e.preventDefault() }
      else if (e.key === 'Home') { seek(0); e.preventDefault() }
      else if (e.key === 'End') { seek(endMs); e.preventDefault() }
      else if (e.key === 'Escape') { setSel(new Set()); setSelWord(null); if (scope === 'selected') setScope('all') }
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
    const next: Source = { ...source, track }
    setSource(next); setEdits(keptEdits(next)); setSel(new Set()); setSelWord(null); setActive(1)
  }
  /** Text+ layers the placed captions come from (caption n = layer n) */
  const fromLayers = () => {
    const layers = layersOf(source)
    return placeable.flatMap((c) => { const t = layers[c.n - 1]; return t ? [{ track: t.track, at: t.at }] : [] })
  }
  const where = target.track === 'new' ? 'a new track above everything'
    : `V${target.track} · ${timelineInfo?.video?.find((v) => v.index === target.track)?.name ?? ''} (empty spots; the rest on a new track)`
  /** The job last handed to Send: its id and each caption's signature by its time */
  const built = useRef<{ id: string; sigs: Record<string, string> } | null>(null)
  function buildJob() {
    const out = placeable.map((c) => compileCue(c, presetOf(c.n), opts(c.n)))
    const job = makeJob(srcName || 'Captions', out, undefined, new Date(), {
      project: source?.kind === 'timeline' ? source.data.project : undefined,
      timeline: tl?.name,
      target: {
        track: target.track, replace: target.replace,
        ...(source?.kind === 'timeline' && target.turnOffSource
          ? (isTextSrc(source.track) ? { disableClips: fromLayers() } : { disableSubtitle: source.track })
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
  const sendLabel = !updating ? `Send ${placeable.length} captions to Resolve`
    : changed === null ? 'Update in Resolve'
      : changed === 0 ? 'Update · nothing changed'
        : `Update ${changed} changed caption${changed === 1 ? '' : 's'}`

  const ownLook = (n: number) => !!(edits[n]?.look || edits[n]?.preset || Object.keys(edits[n]?.words ?? {}).length)
  const words = cue ? wordsIn(cue.text) : []
  const styledWords = new Set(Object.keys(edits[cue?.n ?? -1]?.words ?? {}).map(Number))
  const scopeTarget = scope === 'all' ? `all ${cues.length} captions` : scope === 'selected' ? `${sel.size} selected captions` : `caption ${cue?.n ?? ''}`

  const readAt = timelineInfo?.readAt ? new Date(timelineInfo.readAt) : null

  return (
    <div className="app2">
      <header className="menubar2">
        <i className="logo" />
        <b>MotionCaption <em>Studio</em></b>
        {source?.kind === 'timeline' && tl && (
          <span className="link"><i className="dot" />Linked <b>{tl.name}</b><i className="sep" />{tl.width}×{tl.height}<i className="sep" />{tl.fps} fps
            {readAt && <><i className="sep" />read {readAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>}</span>
        )}
        {source?.kind === 'srt' && (
          <span className="link"><i className="dot off" />{source.name}<i className="sep" />frame
            <select className="sl" value={frame} onChange={(e) => setFrame(e.target.value)}>{FRAMES.map((f) => <option key={f.label}>{f.label}</option>)}</select>
          </span>
        )}
        <span className="grow" />
        <button className="mini" title="Read the timeline open in Resolve again"
          onClick={() => (link.alive ? window.mc.refreshTimeline() : window.mc.runInResolve())}><Icon name="refresh" />Refresh from Resolve</button>
        {source && <button className="mini" title="Put every setting and caption change back to how the app starts" onClick={() => setResetting(true)}><Icon name="undo" />Reset</button>}
        <button className="mini" onClick={openSrt}><Icon name="file" />Open SRT…</button>
        {source && <button className="go cta" disabled={!placeable.length} onClick={() => setSending(true)}><Icon name="send" />{sendLabel}</button>}
      </header>

      {!source ? (
        <Welcome info={timelineInfo} onSrt={openSrt} />
      ) : (
        <div className={'studio2' + (aspect >= 1 ? ' wide' : '')}>
          <Viewer cue={compiled} aspect={aspect} fps={fps} safe={safe} selWord={selWord} playing={playing} loop={!!hoverPreset}
            endMs={endMs} onSeek={seek}
            label={tryingName !== null ? `Trying ${tryingName} · click to use` : cue ? `Caption ${cue.n} of ${cues.length} · ${presetById(presetOf(cue.n))?.name ?? ''}` : 'No captions'}
            onPlaying={setPlaying} onPrev={() => step(-1)} onNext={() => step(1)}
            onPickWord={(i) => { setSelWord(i); setTab('Words'); setPlaying(false) }} onDrag={drag} />
          <CaptionCard caption={cue} total={cues.length} words={words} selWord={selWord} styled={styledWords} fps={fps}
            onWord={(i) => { setSelWord(i); setTab('Words'); setPlaying(false) }} />
          <LibraryD current={cue ? presetOf(cue.n) : defaultPreset} target={scopeTarget} recent={recent} onHover={tryPreset}
            adding={patternPick} onPick={patternPick ? (id) => setPattern((x) => ({ ...x, ids: [...x.ids, id] })) : pickPreset} />
          <Inspector
            tab={tab} onTab={setTab} scope={scope} onScope={setScope} selected={sel.size} total={cues.length}
            look={effLook} onLook={changeLook} styles={[...BUILT_IN_STYLES, ...userStyles]}
            base={baseLook} styleName={styleBase.name}
            onPickStyle={(s) => { changeLook(s.look); setStyleBase({ name: s.name, look: s.look }) }}
            onSaveStyle={(name) => {
              const { font, style, size, tracking, lineSpacing, textCase, fill, outline, shadow, box } = effLook
              const list = [...userStyles.filter((s) => s.name !== name), { name, look: { font, style, size, tracking, lineSpacing, textCase, fill, outline, shadow, box } }]
              setUserStyles(list); store('mc.styles', { list })
            }}
            fonts={fonts} fontUsed={compiled && compiled.look.font !== effLook.font ? compiled.look.font : null}
            caption={cue ? { n: cue.n, text: cue.text, startMs: cue.startMs, endMs: cue.endMs, edited: edits[cue.n]?.text !== undefined } : null}
            fps={fps} onText={setText}
            words={words} selWord={selWord} onSelWord={(i) => { setSelWord(i); setPlaying(false) }}
            wordLook={cue && selWord !== null ? edits[cue.n]?.words[selWord] ?? null : null}
            styledWords={styledWords} onWordLook={changeWord} everywhere={everywhere} onEverywhere={setEverywhere}
            highlight={highlight} onHighlight={(h) => setHighlight((x) => ({ ...x, ...h }))}
            preset={cue ? presetOf(cue.n) : defaultPreset} onPreset={pickPreset}
            pattern={pattern} onPattern={(x) => setPattern((y) => ({ ...y, ...x }))} patternOn={patternOn}
            onApplyPattern={applyPattern} onStopPattern={() => setPatternOn(false)}
            patternPick={patternPick} onPatternPick={setPatternPick}
            motion={motion} onMotion={(m) => setMotion((x) => ({ ...x, ...m }))}
            safe={safe} onSafe={setSafe}
          />
          <TimelineD
            data={source.kind === 'timeline' ? source.data : null}
            srcTrack={source.kind === 'timeline' ? source.track : null}
            onSrcTrack={switchSource}
            srcName={srcName} cues={cues} presetName={(n) => presetById(presetOf(n))?.name ?? ''} ownLook={ownLook}
            active={cue?.n ?? 0} sel={sel} onCue={pickCue} playing={playing} onSeek={seek}
            target={target} onTarget={(t) => setTarget((x) => ({ ...x, ...t }))} fps={fps}
          />
        </div>
      )}
      {resetting && <ResetDialog onReset={resetAll} onClose={() => setResetting(false)} />}
      {undo && (
        <div className="toast">Everything is back to default.
          <button className="mini" onClick={undoReset}>Undo</button>
          <button className="x" onClick={() => setUndo(null)} title="Close">✕</button>
        </div>
      )}
      {sending && <SendDialog captions={placeable.length} where={where} timeline={tl?.name ?? null} linked={link.alive} build={buildJob}
        update={updating ? { changed } : null} onDone={sentOk} onClose={() => setSending(false)} />}
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
            <li>Every caption's own look, animation, word styles and text edits</li>
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

function Welcome({ info, onSrt }: { info: TimelineData | null; onSrt: () => void }) {
  const noSubs = info?.timeline && !info.subtitle?.length && !usableLayers(info.texts).length
  return (
    <main className="welcome">
      <div className="card2">
        <h1>Start from your timeline</h1>
        {noSubs && info?.timeline ? (
          <p className="warn">“{info.timeline.name}” has no subtitle track and no Text+ layers yet. Add your subtitles (File → Import → Subtitle) or a Text+ title in Resolve, then click MotionCaption there again.</p>
        ) : info && info.timeline === false ? (
          <p className="warn">Resolve had no timeline open. Open one, then click MotionCaption again.</p>
        ) : null}
        <ol className="how">
          <li><b>In Resolve,</b> open the timeline that has your subtitles on a subtitle track.</li>
          <li>Click <kbd>Workspace → Scripts → MotionCaption</kbd>. Its subtitle and video tracks appear here.</li>
          <li>Pick an animation and a look, then <b>Send</b>. One more click on MotionCaption in Resolve places them on a video track.</li>
        </ol>
        <p className="hint2">No subtitle track? <button className="link" onClick={onSrt}>Open an .srt file instead</button></p>
      </div>
    </main>
  )
}
