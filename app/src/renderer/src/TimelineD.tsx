import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react'

import type { Cue } from '@core/srt'
import type { TimelineData } from '../../preload'
import { useClock } from './clock'
import { Icon } from './Icon'
import { isTextSrc, layersIn, srcChoices, srcTrackOf, timecode, type SrcTrack, type Target } from './model'

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
  /** How many supers this timeline has (made in the app) */
  supers: number
  /** Adds a super at the playhead; set while the supers are shown */
  onAddSuper: (() => void) | null
}

const HEAD = 200

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

  // Keep the caption in view when it changes
  useEffect(() => {
    const el = lanes.current
    if (!el || !activeCue || p.playing) return
    const left = x(activeCue.startMs)
    if (left < el.scrollLeft + 20 || left > el.scrollLeft + el.clientWidth - 80) el.scrollLeft = Math.max(0, left - el.clientWidth / 3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.active, pps])

  // Click or drag on the ruler to move the playhead
  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId)
    else if (!e.buttons) return
    const r = e.currentTarget.getBoundingClientRect()
    p.onSeek(Math.max(0, ((e.clientX - r.left) / pps) * 1000))
  }
  const click = (n: number) => (e: MouseEvent) => p.onCue(n, e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'set')
  const step = pps > 120 ? 1 : pps > 50 ? 2 : pps > 20 ? 5 : 10
  const marks = Array.from({ length: Math.ceil(endMs / 1000 / step) + 1 }, (_, i) => i * step)
  const newTrack = p.target.track === 'new'
  const placed = p.cues.filter((c) => c.endMs > c.startMs && c.text.trim()).length

  return (
    <section className="tl2">
      <div className="sendbar">
        <b className="ttl">Timeline</b>
        <span>Read from</span>
        {choices.length > 0 ? (
          <select className="sl" value={String(p.srcTrack ?? '')} onChange={(e) => p.onSrcTrack(srcTrackOf(e.target.value))}
            title="A super or title on its own track: pick that track's Text+ here, animate it and send it. It gets its own MC track and leaves other captions alone.">
            {choices.map((c) => <option key={String(c.value)} value={String(c.value)}>{c.label}</option>)}
          </select>
        ) : <b className="ro">{p.srcName}</b>}
        {p.onAddSuper && <button className="mini addsuper" onClick={p.onAddSuper} title="A new super at the playhead, 3 s long. Write it, time it and animate it here; Send places it in Resolve.">
          <Icon name="plus" />Add super</button>}
        <span className="arrow">→</span>
        <span>Put on</span>
        <select className="sl" value={String(p.target.track)} onChange={(e) => p.onTarget({ track: e.target.value === 'new' ? 'new' : Number(e.target.value) })}>
          <option value="new">New track above everything</option>
          {video.map((v) => <option key={v.index} value={v.index}>V{v.index} · {v.name} (empty spots only)</option>)}
        </select>
        {p.srcTrack !== null && !supersOn && (
          <button className={'tg' + (p.target.turnOffSource ? ' on' : '')} onClick={() => p.onTarget({ turnOffSource: !p.target.turnOffSource })}
            title={fromText ? 'Your Text+ layers are turned off in Resolve, never deleted, so the words do not show twice' : undefined}>
            <i>✓</i>{fromText ? 'Turn off the original Text+ after' : `Turn off ST${p.srcTrack} after`}
          </button>
        )}
        <button className={'tg' + (p.target.replace ? ' on' : '')} onClick={() => p.onTarget({ replace: !p.target.replace })}
          title="On: sending again only makes the captions you changed again; the others stay as they are in Resolve. Off: every send adds another copy on a new track."><i>✓</i>Update last send</button>
        <span className="zoom" title="Zoom">
          <button onClick={() => setPps((v) => Math.max(10, v / 1.5))} title="Zoom out"><Icon name="minus" /></button>
          <button onClick={() => setPps((v) => Math.min(400, v * 1.5))} title="Zoom in"><Icon name="plus" /></button>
        </span>
      </div>
      <div className="tracks">
        <div className="heads" style={{ width: HEAD }}>
          <div className="rhead"><Tc fps={p.fps} /></div>
          {newTrack
            ? <div className="th tgt"><b>V{video.length + 1}</b><span>Text+ captions<small>new track · {placed} clips</small></span><i className="tag t">TARGET</i></div>
            : <div className="th tgt"><b>V{p.target.track}</b><span>Text+ on {tgtTrack?.name ?? 'track'}<small>empty spots · {placed} clips</small></span><i className="tag t">TARGET</i></div>}
          {supersOn
            ? <div className="th st src" title="Supers live in this app: add them with Add super"><b>SUP</b><span>Supers<small>made here · {p.cues.length}</small></span><i className="tag s">SOURCE</i></div>
            : fromText
            ? <div className="th st src" title="Change it under Read from"><b>T+</b><span>Text+ on {layerTracks}<small>{layers.length} layers</small></span><i className="tag s">SOURCE</i></div>
            : srcSub
            ? <div className="th st src" title="Change it under Read from"><b>ST{srcSub.index}</b><span>{srcSub.name}<small>subtitles · {srcSub.cues.length}</small></span><i className="tag s">SOURCE</i></div>
            : <div className="th st src"><b>SRT</b><span>{p.srcName}<small>{p.cues.length} captions</small></span><i className="tag s">SOURCE</i></div>}
        </div>
        <div className="lanes" ref={lanes}>
          <div style={{ width, position: 'relative' }}>
            <div className="ruler" onPointerDown={scrub} onPointerMove={scrub} title="Click or drag to move the playhead">{marks.map((s) => <span key={s} style={{ left: x(s * 1000) }}>{timecode(s * 1000, p.fps).slice(3, 8)}</span>)}</div>
            <div className="lane cap">
              {tgtTrack?.clips.map((c, i) => <i key={'o' + i} className="occ" style={{ left: x(c.start), width: Math.max(2, x(c.end - c.start) - 1) }} title={`Already on V${tgtTrack.index}: ${c.name}`}>{c.name}</i>)}
              {p.cues.map((c) => (
                <i key={c.n} className={(c.n === p.active ? 'cur ' : '') + (p.sel.has(c.n) ? 'sel ' : '') + (p.ownLook(c.n) ? 'own' : '')}
                  style={{ left: x(c.startMs), width: Math.max(2, x(c.endMs - c.startMs) - 1) }} onClick={click(c.n)} title={c.text}><b>{c.text}</b><small>{p.presetName(c.n)}</small></i>
              ))}
            </div>
            <div className="lane st src">
              {p.cues.map((c) => (
                <i key={c.n} className={(c.n === p.active ? 'cur ' : '') + (p.sel.has(c.n) ? 'sel' : '')}
                  style={{ left: x(c.startMs), width: Math.max(2, x(c.endMs - c.startMs) - 1) }} onClick={click(c.n)} title={c.text}>{c.text}</i>
              ))}
            </div>
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
