import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react'

import type { Cue } from '@core/srt'
import type { TimelineData } from '../../preload'
import { lanesOf, retime, type Grip, type Span } from '@core/retime'
import { clock, useClock } from './clock'
import { Icon } from './Icon'
import { TEMPLATES } from './templates'
import { isTextSrc, layersIn, srcChoices, srcTrackOf, timecode, type SrcTrack, type Target } from './model'
import { Dropdown } from './Dropdown'

interface Props {
  data: TimelineData | null
  /** Subtitle track or Text+ layers the captions come from (timeline sources only) */
  srcTrack: SrcTrack | null
  onSrcTrack: (t: SrcTrack) => void
  srcName: string
  cues: Cue[]
  presetName: (n: number) => string
  ownLook: (n: number) => boolean
  active: number
  sel: Set<number>
  onCue: (n: number, mode: 'set' | 'toggle' | 'range') => void
  target: Target
  onTarget: (t: Partial<Target>) => void
  fps: number
  /** The timeline's length in Resolve (0 for an SRT) */
  lengthMs: number
  playing: boolean
  /** Move the playhead (click or drag on the ruler) */
  onSeek: (ms: number) => void
  /** Goes up when the playhead jumps (Home / End): scroll so it shows */
  reveal: number
  /** How many supers this timeline has (made in the app) */
  supers: number
  /** Adds a super at the playhead; set while the supers are shown */
  onAddSuper: (() => void) | null
  /** Adds a ready-made super (templates.ts) at the playhead; set while the supers are shown */
  onTemplate: ((id: string) => void) | null
  /** Move or trim blocks by dragging them or their edges: the dragged one first, then the
   *  other selected ones moving with it; end: the drag is over */
  onRetime: ((list: { n: number; span: Span }[], end: boolean) => void) | null
}

/** How near (in pixels) an edge must come to the playhead or another block to stick */
const SNAP_PX = 8

const HEAD = 200

/** What the timeline does, for the Shortcuts hint */
const KEYS = [
  'Drag a caption to move it; drag its edge to make it shorter or longer.',
  'Select a few (Ctrl+click, Shift+click) and drag one: they move together.',
  'Edges stick to the playhead and to other captions. Hold Alt to place freely.',
  'Captions that overlap go on rows below; in Resolve each row is its own track.',
  '',
  'S or Ctrl+B: cut at the playhead (a subtitle\'s words are shared out)',
  'Ctrl+J: join the selected captions, or this one and the next',
  'Delete: delete the selected (subtitles are left out, never changed in Resolve)',
  'Ctrl+C / Ctrl+V: copy, and paste at the playhead',
  'Ctrl+D: duplicate right after',
  ', and . : move one frame (with Shift: 10 frames)',
  'Ctrl+Z / Ctrl+Y: undo / redo',
  '',
  'Home / End: playhead to the start / end',
  'Shift+Z: fit the whole timeline in view, and back',
  'Alt+mouse wheel: zoom in / out where the mouse is',
  'Ctrl+mouse wheel: scroll the timeline left / right',
].join('\n')

/** Zoom limits, in pixels per second */
const PPS_MIN = 1
const PPS_MAX = 400

/** Heights of the two lanes and their rows: one row as before, more when captions overlap */
function rows(count: number) {
  if (count <= 1) return { cap: { h: 46, top: 6, row: 34, gap: 0 }, st: { h: 36, top: 4, row: 28, gap: 0 } }
  return {
    cap: { h: 12 + count * 26 + (count - 1) * 4, top: 6, row: 26, gap: 4 },
    st: { h: 8 + count * 22 + (count - 1) * 3, top: 4, row: 22, gap: 3 },
  }
}

export function TimelineD(p: Props) {
  const [pps, setPps] = useState(70) // pixels per second
  const lanes = useRef<HTMLDivElement>(null)
  const video = p.data?.video ?? []
  const subs = p.data?.subtitle ?? []
  // Only the two tracks you work with: where the Text+ captions go, and the subtitles they come from
  const tgtTrack = p.target.track === 'new' ? null : video.find((v) => v.index === p.target.track) ?? null
  const srcSub = subs.find((s) => s.index === p.srcTrack) ?? null
  const fromText = isTextSrc(p.srcTrack)
  const layers = fromText ? layersIn(p.data?.texts, p.srcTrack!) : []
  const choices = srcChoices(p.data, p.srcTrack, p.supers)
  const supersOn = p.srcTrack === 'supers'
  // The tracks the Text+ layers sit on, e.g. "V2, V3"
  const layerTracks = [...new Set(layers.map((t) => t.track))].sort((a, b) => a - b).map((t) => 'V' + t).join(', ')
  // As long as the timeline in Resolve; an SRT gets at least 10 s
  const endMs = Math.max(p.lengthMs || 10000, ...p.cues.map((c) => c.endMs))
  const width = (endMs / 1000) * pps + 80
  const x = (ms: number) => (ms / 1000) * pps
  const activeCue = p.cues.find((c) => c.n === p.active)

  // Zoom keeping one moment where it is on screen (the mouse, or the playhead)
  const anchor = useRef<{ ms: number; at: number } | null>(null)
  const zoomTo = (next: number, at?: number) => {
    const el = lanes.current
    const v = Math.min(PPS_MAX, Math.max(PPS_MIN, next))
    if (el) {
      const px = at ?? Math.min(el.clientWidth - 40, Math.max(0, x(clock.get()) - el.scrollLeft))
      anchor.current = { ms: ((el.scrollLeft + px) / pps) * 1000, at: px }
    }
    setPps(v)
  }
  useLayoutEffect(() => {
    const el = lanes.current, a = anchor.current
    anchor.current = null
    if (el && a) el.scrollLeft = Math.max(0, (a.ms / 1000) * pps - a.at)
  }, [pps])
  // Shift+Z, as in Resolve: the whole timeline in view, and again for the zoom you had
  const before = useRef<number | null>(null)
  const fitPps = () => Math.min(PPS_MAX, Math.max(PPS_MIN, ((lanes.current?.clientWidth ?? 800) - 100) / (endMs / 1000)))
  const fit = useRef(() => {})
  fit.current = () => {
    const f = fitPps()
    if (before.current !== null && Math.abs(pps - f) < 0.01) { zoomTo(before.current); before.current = null }
    else { before.current = pps; anchor.current = { ms: 0, at: 0 }; setPps(f) }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea, select')) return
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'KeyZ') { fit.current(); e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // Alt+wheel zooms where the mouse is, Ctrl+wheel scrolls sideways (as in Resolve)
  const wheel = useRef((_: WheelEvent) => {})
  wheel.current = (e: WheelEvent) => {
    const el = lanes.current
    if (!el || !(e.altKey || e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    const d = e.deltaY || e.deltaX
    if (e.altKey) zoomTo(pps * Math.exp(-d * 0.0015), e.clientX - el.getBoundingClientRect().left)
    else el.scrollLeft += d
  }
  useEffect(() => {
    const el = lanes.current
    if (!el) return
    const on = (e: WheelEvent) => wheel.current(e)
    el.addEventListener('wheel', on, { passive: false })
    return () => el.removeEventListener('wheel', on)
  }, [])

  // Home / End: scroll so the playhead shows, as Resolve does
  useEffect(() => {
    const el = lanes.current
    if (!el || !p.reveal) return
    const left = x(clock.get())
    if (left > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = left - el.clientWidth + 60
    else if (left < el.scrollLeft) el.scrollLeft = Math.max(0, left - 30)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.reveal])

  // Keep the caption in view when it changes
  useEffect(() => {
    const el = lanes.current
    if (!el || !activeCue || p.playing) return
    const left = x(activeCue.startMs)
    if (left < el.scrollLeft + 20 || left > el.scrollLeft + el.clientWidth - 80) el.scrollLeft = Math.max(0, left - el.clientWidth / 3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.active])

  // Click or drag on the ruler to move the playhead
  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId)
    else if (!e.buttons) return
    const r = e.currentTarget.getBoundingClientRect()
    p.onSeek(Math.max(0, ((e.clientX - r.left) / pps) * 1000))
  }
  const pickMode = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => (e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'set')
  const click = (n: number) => (e: MouseEvent) => p.onCue(n, pickMode(e))

  // Drag a block to move it, or its edge to trim it; a click without moving picks it.
  // Edges stick to the playhead and to the other blocks (hold Alt to place freely).
  const grab = useRef<{ n: number; grip: Grip; x0: number; span: Span; group: Cue[]; snaps: number[]; moved: boolean } | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [guide, setGuide] = useState<number | null>(null)
  const down = (c: Cue) => (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !p.onRetime) return
    const grip = ((e.target as HTMLElement).closest('[data-grip]')?.getAttribute('data-grip') ?? 'move') as Grip
    e.currentTarget.setPointerCapture(e.pointerId)
    // A selected caption takes the other selected ones along; an edge trims only its own
    const group = grip === 'move' && p.sel.has(c.n) && p.sel.size > 1 ? p.cues.filter((o) => p.sel.has(o.n) && o.n !== c.n) : []
    const moving = new Set([c.n, ...group.map((o) => o.n)])
    const snaps = [0, clock.get(), ...p.cues.filter((o) => !moving.has(o.n)).flatMap((o) => [o.startMs, o.endMs])]
    grab.current = { n: c.n, grip, x0: e.clientX, span: { startMs: c.startMs, endMs: c.endMs }, group, snaps, moved: false }
  }
  const drag = (e: PointerEvent<HTMLElement>, end: boolean) => {
    const g = grab.current
    if (!g || !p.onRetime) return
    const dx = e.clientX - g.x0
    if (!g.moved && Math.abs(dx) < 3) return
    if (!g.moved) { g.moved = true; setDragging(g.n) }
    const r = retime(g.span, g.grip, (dx / pps) * 1000, { fps: p.fps, snaps: g.snaps, snapMs: e.altKey ? 0 : (SNAP_PX / pps) * 1000 })
    setGuide(end ? null : r.snap)
    // The others move as far, never before 0
    const by = Math.max(r.startMs - g.span.startMs, -Math.min(g.span.startMs, ...g.group.map((o) => o.startMs)))
    p.onRetime([
      { n: g.n, span: g.group.length ? { startMs: g.span.startMs + by, endMs: g.span.endMs + by } : { startMs: r.startMs, endMs: r.endMs } },
      ...g.group.map((o) => ({ n: o.n, span: { startMs: o.startMs + by, endMs: o.endMs + by } })),
    ], end)
  }
  const up = (e: PointerEvent<HTMLElement>) => {
    const g = grab.current
    if (!g) return
    if (g.moved) drag(e, true)
    else p.onCue(g.n, pickMode(e))
    grab.current = null
    setDragging(null); setGuide(null)
  }
  /** A block's mouse handling: draggable (supers) or click to pick */
  const handlers = (c: Cue) => (p.onRetime
    ? { onPointerDown: down(c), onPointerMove: (e: PointerEvent<HTMLElement>) => drag(e, false), onPointerUp: up, onPointerCancel: up }
    : { onClick: click(c.n) })
  /** Trim handles on both edges, when the block is wide enough to keep room to move it */
  const grips = (c: Cue) => (p.onRetime && x(c.endMs - c.startMs) >= 22
    ? <><span className="grip l" data-grip="start" title="Drag to change the start" /><span className="grip r" data-grip="end" title="Drag to change the end" /></>
    : null)
  // Overlapping captions on rows below, as Resolve will put them on tracks
  const lane = useMemo(() => {
    const l = lanesOf(p.cues)
    return new Map(p.cues.map((c, i) => [c.n, l[i]!]))
  }, [p.cues])
  const R = rows(Math.max(0, ...lane.values()) + 1)
  const multi = R.cap.gap > 0
  const place = (c: Cue, r: typeof R.cap) => ({
    left: x(c.startMs), width: Math.max(2, x(c.endMs - c.startMs) - 1),
    ...(multi ? { top: r.top + (lane.get(c.n) ?? 0) * (r.row + r.gap), height: r.row, bottom: 'auto' } : {}),
  })
  const tip = (c: Cue | undefined) => (c
    ? <span className="tltip" style={{ left: x(c.startMs) }}>{timecode(c.startMs, p.fps)} · {((c.endMs - c.startMs) / 1000).toFixed(2)} s</span>
    : null)
  const step = pps > 120 ? 1 : pps > 50 ? 2 : pps > 20 ? 5 : pps > 9 ? 10 : pps > 4 ? 30 : pps > 1.5 ? 60 : 300
  const marks = Array.from({ length: Math.ceil(endMs / 1000 / step) + 1 }, (_, i) => i * step)
  const newTrack = p.target.track === 'new'
  const placed = p.cues.filter((c) => c.endMs > c.startMs && c.text.trim()).length

  return (
    <section className="tl2">
      <div className="sendbar">
        <b className="ttl">Timeline</b>
        <span>Read from</span>
        {choices.length > 0 ? (
          <Dropdown className="sl" value={String(p.srcTrack ?? '')} onChange={(v) => p.onSrcTrack(srcTrackOf(v))}
            title="A super or title on its own track: pick that track's Text+ here, animate it and send it. It gets its own MC track and leaves other captions alone.">
            {choices.map((c) => <option key={String(c.value)} value={String(c.value)}>{c.label}</option>)}
          </Dropdown>
        ) : <b className="ro">{p.srcName}</b>}
        {p.onAddSuper && <button className="mini addsuper" onClick={p.onAddSuper} title="A new super at the playhead, 3 s long. Write it, time it and animate it here; Send places it in Resolve.">
          <Icon name="plus" />Add super</button>}
        {p.onTemplate && (
          <Dropdown className="sl tmpl" value="" onChange={(v) => { if (v) p.onTemplate!(v) }} title="A ready-made super at the playhead; change anything after">
            <option value="">Template…</option>
            {TEMPLATES.map((t) => <option key={t.id} value={t.id} title={t.desc}>{t.name}</option>)}
          </Dropdown>
        )}
        {p.onRetime && <span className="khint" title={KEYS}>Shortcuts</span>}
        <span className="arrow">→</span>
        <span>Put on</span>
        <Dropdown className="sl" value={String(p.target.track)} onChange={(v) => p.onTarget({ track: v === 'new' ? 'new' : Number(v) })}>
          <option value="new">New track above everything</option>
          {video.map((v) => <option key={v.index} value={v.index}>V{v.index} · {v.name} (empty spots only)</option>)}
        </Dropdown>
        {p.srcTrack !== null && !supersOn && (
          <button className={'tg' + (p.target.turnOffSource ? ' on' : '')} onClick={() => p.onTarget({ turnOffSource: !p.target.turnOffSource })}
            title={fromText ? 'Your Text+ layers are turned off in Resolve, never deleted, so the words do not show twice' : undefined}>
            <i>✓</i>{fromText ? 'Turn off the original Text+ after' : `Turn off ST${p.srcTrack} after`}
          </button>
        )}
        <button className={'tg' + (p.target.replace ? ' on' : '')} onClick={() => p.onTarget({ replace: !p.target.replace })}
          title="On: sending again only makes the captions you changed again; the others stay as they are in Resolve. Off: every send adds another copy on a new track."><i>✓</i>Update last send</button>
        <span className="zoom" title="Zoom">
          <button onClick={() => zoomTo(pps / 1.5)} title="Zoom out (Alt+wheel; Shift+Z fits the timeline)"><Icon name="minus" /></button>
          <button onClick={() => zoomTo(pps * 1.5)} title="Zoom in (Alt+wheel)"><Icon name="plus" /></button>
        </span>
      </div>
      <div className="tracks">
        <div className="heads" style={{ width: HEAD }}>
          <div className="rhead"><Tc fps={p.fps} /></div>
          {newTrack
            ? <div className="th tgt" style={{ height: R.cap.h }}><b>V{video.length + 1}</b><span>Text+ captions<small>new track · {placed} clips</small></span><i className="tag t">TARGET</i></div>
            : <div className="th tgt" style={{ height: R.cap.h }}><b>V{p.target.track}</b><span>Text+ on {tgtTrack?.name ?? 'track'}<small>empty spots · {placed} clips</small></span><i className="tag t">TARGET</i></div>}
          {supersOn
            ? <div className="th st src" style={{ height: R.st.h }} title="Supers live in this app: add them with Add super"><b>SUP</b><span>Supers<small>made here · {p.cues.length}</small></span><i className="tag s">SOURCE</i></div>
            : fromText
            ? <div className="th st src" style={{ height: R.st.h }} title="Change it under Read from"><b>T+</b><span>Text+ on {layerTracks}<small>{layers.length} layers</small></span><i className="tag s">SOURCE</i></div>
            : srcSub
            ? <div className="th st src" style={{ height: R.st.h }} title="Change it under Read from"><b>ST{srcSub.index}</b><span>{srcSub.name}<small>subtitles · {srcSub.cues.length}</small></span><i className="tag s">SOURCE</i></div>
            : <div className="th st src" style={{ height: R.st.h }}><b>SRT</b><span>{p.srcName}<small>{p.cues.length} captions</small></span><i className="tag s">SOURCE</i></div>}
        </div>
        <div className="lanes" ref={lanes}>
          <div style={{ width, position: 'relative' }}>
            <div className="ruler" onPointerDown={scrub} onPointerMove={scrub} title="Click or drag to move the playhead">{marks.map((s) => <span key={s} style={{ left: x(s * 1000) }}>{timecode(s * 1000, p.fps).slice(3, 8)}</span>)}</div>
            <div className={'lane cap' + (p.onRetime ? ' edit' : '') + (multi ? ' multi' : '')} style={{ height: R.cap.h }}>
              {tgtTrack?.clips.map((c, i) => <i key={'o' + i} className="occ" style={{ left: x(c.start), width: Math.max(2, x(c.end - c.start) - 1) }} title={`Already on V${tgtTrack.index}: ${c.name}`}>{c.name}</i>)}
              {p.cues.map((c) => (
                <i key={c.n} className={(c.n === p.active ? 'cur ' : '') + (p.sel.has(c.n) ? 'sel ' : '') + (p.ownLook(c.n) ? 'own ' : '') + (dragging === c.n ? 'drag' : '')}
                  style={place(c, R.cap)} {...handlers(c)} title={c.text}><b>{c.text}</b><small>{p.presetName(c.n)}</small>{grips(c)}</i>
              ))}
              {tip(p.cues.find((c) => c.n === dragging))}
            </div>
            <div className={'lane st src' + (p.onRetime ? ' edit' : '')} style={{ height: R.st.h }}>
              {p.cues.map((c) => (
                <i key={c.n} className={(c.n === p.active ? 'cur ' : '') + (p.sel.has(c.n) ? 'sel ' : '') + (dragging === c.n ? 'drag' : '')}
                  style={place(c, R.st)} {...handlers(c)} title={c.text}>{c.text}{grips(c)}</i>
              ))}
            </div>
            {guide !== null && <div className="snapline" style={{ left: x(guide) }} />}
            <Playhead x={x} lanes={lanes} playing={p.playing} />
          </div>
        </div>
      </div>
    </section>
  )
}

function Tc({ fps }: { fps: number }) {
  return <>{timecode(useClock(), fps)}</>
}

/** Follows the clock; while playing it pages the view along like Resolve does */
function Playhead({ x, lanes, playing }: { x: (ms: number) => number; lanes: RefObject<HTMLDivElement | null>; playing: boolean }) {
  const left = x(useClock())
  useEffect(() => {
    const el = lanes.current
    if (!el || !playing) return
    if (left > el.scrollLeft + el.clientWidth - 30 || left < el.scrollLeft) el.scrollLeft = Math.max(0, left - 30)
  }, [left, playing, lanes])
  return <div className="playhead" style={{ left }} />
}
