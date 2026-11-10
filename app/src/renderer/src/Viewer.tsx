import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { CompiledCue, TimedTrack } from '@core/compile'
import { fontShare } from '@core/look'
import { num, pt, valueAt } from '@core/sample'
import { useClock } from './clock'
import { cssFace } from './fonts'
import { Icon } from './Icon'
import { css, SAFE, timecode, type SafeArea } from './model'

// A browser approximation of what Resolve will render, driven by the same keys and eases
// and the same layout (line breaks, blank room for bigger words). Text+ is the reference.

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function at(tracks: TimedTrack[], input: string, ms: number) {
  const t = tracks.find((x) => x.input === input)
  return t ? valueAt(t.keys, ms) : undefined
}

/** Per-letter look from Follower tracks (offset units follow the frame width) */
function follower(tracks: TimedTrack[], ms: number, W: number): { opacity?: number; transform?: string } {
  if (!tracks.length) return {}
  const [ox, oy] = pt(at(tracks, 'CharacterOffset', ms), [0, 0])
  const sx = num(at(tracks, 'CharacterSizeX', ms), 1)
  const sy = num(at(tracks, 'CharacterSizeY', ms), 1)
  const op = at(tracks, 'Opacity1', ms)
  return {
    ...(op !== undefined ? { opacity: num(op, 1) } : {}),
    transform: `translate(${ox * W}px, ${-oy * W}px) scale(${sx}, ${sy})`,
  }
}

/** Tallest the frame may get */
const MAX_H = 540
/** Share of the free room the frame takes, so it sits a little smaller with air around it */
const FILL = 0.86

interface Props {
  cue: CompiledCue | null
  aspect: number
  fps: number
  safe: SafeArea
  selWord: number | null
  playing: boolean
  /** Loop this caption on its own clock (an animation being tried on hover), not the timeline's */
  loop?: boolean
  label: string
  /** End of the last caption, for the scrub bar */
  endMs: number
  /** Move the playhead (click or drag on the scrub bar) */
  onSeek: (ms: number) => void
  onPlaying: (p: boolean) => void
  onPrev: () => void
  onNext: () => void
  onPickWord: (i: number) => void
  /** Live drag of the caption, in frame shares (x right, y up); end commits */
  onDrag: (dx: number, dy: number, end: boolean) => void
}

export function Viewer(p: Props) {
  const { cue, aspect } = p
  // Time inside this caption, from the timeline playhead
  const t = useClock()
  const [loopMs, setLoopMs] = useState(0)
  useEffect(() => {
    if (!p.loop || !cue) return
    const t0 = performance.now()
    const dur = cue.endMs - cue.startMs
    let raf = 0
    const tick = (now: number) => { setLoopMs((now - t0) % (dur + 500)); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); setLoopMs(0) }
  }, [p.loop, cue])
  const ms = !cue ? 0 : p.loop ? loopMs : t - cue.startMs
  const onScreen = !!cue && ms >= 0 && ms < cue.endMs - cue.startMs
  const wrap = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const block = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 560, h: 600 })
  const [warn, setWarn] = useState(false)
  const W = Math.round(Math.max(160, Math.min(box.w * FILL, Math.min(box.h * FILL, MAX_H) * aspect)))
  const H = Math.round(W / aspect)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.floor(e!.contentRect.width), h: Math.floor(e!.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Safe area: warn when the caption sits under the app's buttons or text
  useLayoutEffect(() => {
    if (p.safe === 'off' || !block.current || !frame.current) { if (warn) setWarn(false); return }
    const a = block.current.getBoundingClientRect()
    const hit = [...frame.current.querySelectorAll('.zone')].some((z) => {
      const c = z.getBoundingClientRect()
      return a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top
    })
    if (hit !== warn) setWarn(hit)
  })

  // Drag to move; a click without moving picks the word under the pointer
  const drag = useRef<{ x: number; y: number; moved: boolean; w: number | null } | null>(null)
  const down = (e: PointerEvent) => {
    const w = (e.target as HTMLElement).closest('[data-w]')?.getAttribute('data-w')
    drag.current = { x: e.clientX, y: e.clientY, moved: false, w: w == null ? null : Number(w) }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return
    d.moved = true
    p.onDrag(dx / W, -dy / H, false)
  }
  const up = (e: PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved) p.onDrag((e.clientX - d.x) / W, -(e.clientY - d.y) / H, true)
    else if (d.w !== null) p.onPickWord(d.w)
  }

  // Scrub bar: where the playhead is along all the captions; click or drag to move it
  const pct = p.endMs > 0 ? Math.min(100, Math.max(0, (t / p.endMs) * 100)) : 0
  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId)
    else if (!e.buttons) return
    const r = e.currentTarget.getBoundingClientRect()
    p.onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * p.endMs)
  }

  const fr = (
    <div className="vframe" ref={frame} style={{ width: W, height: H }}>
      <div className="vbg" />
      {cue && onScreen && <Caption cue={cue} ms={ms} W={W} H={H} aspect={aspect} selWord={p.selWord} blockRef={block} onDown={down} onMove={move} onUp={up} />}
      {p.safe !== 'off' && <Safe area={p.safe} />}
      {warn && <span className="vwarn">Under the {SAFE[p.safe as 'reels'].name} buttons: viewers may not see it</span>}
    </div>
  )

  return (
    <div className={'viewer' + (p.loop ? ' trying' : '')}>
      <div className="phead"><b>Preview</b><span className="vlabel">{p.label}</span></div>
      <div className="vstage" ref={wrap}>{fr}</div>
      <div className="transport">
        <div className="scrub" onPointerDown={scrub} onPointerMove={scrub} title="Click or drag to move the playhead">
          <i style={{ width: `${pct}%` }} /><b style={{ left: `${pct}%` }} />
        </div>
        <div className="trow">
          <span className="tc">{timecode(p.loop && cue ? cue.startMs + loopMs : t, p.fps)}</span>
          <div className="tbtns">
            <button onClick={p.onPrev} title="Previous caption (←)"><Icon name="prev" /></button>
            <button className="play" onClick={() => p.onPlaying(!p.playing)} title="Play / pause (Space)"><Icon name={p.playing ? 'pause' : 'play'} size={15} /></button>
            <button onClick={p.onNext} title="Next caption (→)"><Icon name="next" /></button>
          </div>
          <span className="tc end">{timecode(p.endMs, p.fps)}</span>
        </div>
      </div>
    </div>
  )
}

function Safe({ area }: { area: Exclude<SafeArea, 'off'> }) {
  const s = SAFE[area]
  const [r, b, w, h] = s.rail
  return (
    <div className="safe">
      <span className="lab">{s.name} buttons and text</span>
      <div className="zone rail" style={{ right: `${r}%`, bottom: `${b}%`, width: `${w}%`, height: `${h}%` }}><i /><i /><i /><i /></div>
      <div className="zone meta" style={{ left: 0, right: 0, bottom: 0, height: `${s.meta}%` }}><i style={{ width: '40%' }} /><i style={{ width: '85%' }} /></div>
    </div>
  )
}

interface CapProps {
  cue: CompiledCue
  ms: number
  W: number
  H: number
  aspect: number
  selWord: number | null
  blockRef: React.RefObject<HTMLDivElement | null>
  onDown: (e: PointerEvent) => void
  onMove: (e: PointerEvent) => void
  onUp: (e: PointerEvent) => void
}

function Caption({ cue, ms, W, H, aspect, selWord, blockRef, onDown, onMove, onUp }: CapProps) {
  const L = cue.look
  const share = fontShare(aspect)
  const fontPx = L.size * W * share
  const face = cssFace(L.style)
  const text = cue.tracks.filter((t) => t.target === 'text')
  const moveT = cue.tracks.filter((t) => t.target === 'move')
  const lettersT = cue.tracks.filter((t) => t.target === 'letters')
  const [cx, cy] = pt(at(moveT, 'Center', ms), [0.5, 0.5])
  const opacity = num(at(text, 'Opacity1', ms), 1)
  const spacing = num(at(text, 'CharacterSpacing', ms), L.tracking)
  const blur = num(at(text, 'SoftnessX1', ms), 0)
  const step = cue.letters?.stepMs ?? 0
  const chars = Array.from(graphemes.segment(cue.text), (s) => s.segment)
  const turn = (i: number) => (cue.letters?.order === 'rtl' ? chars.length - 1 - i : i)

  // Which word (and which styled word) each letter belongs to
  const wordOf: (number | null)[] = chars.map(() => null)
  cue.ranges.forEach((r, wi) => { if (r) for (let i = r.first; i <= r.last; i++) wordOf[i] = wi })
  const styled = new Map<number, CompiledCue['words'][number]>()
  for (const w of cue.words) if (!w.solo) for (let i = w.first; i <= w.last; i++) styled.set(i, w)

  const shadow = L.shadow
    ? `${L.shadow.distance * fontPx * 0.12}px ${L.shadow.distance * fontPx * 0.12}px ${L.shadow.blur * fontPx * 0.35}px ${css(L.shadow.color, L.shadow.opacity)}`
    : undefined
  const outline = L.outline ? `${Math.max(0.5, L.outline.width * fontPx * 0.5)}px ${css(L.outline.color)}` : undefined
  const base: CSSProperties = {
    fontFamily: `'${L.font}', 'Nirmala UI', sans-serif`, fontWeight: face.weight, fontStyle: face.italic ? 'italic' : 'normal',
    letterSpacing: `${(spacing - 1) * 0.5}em`, lineHeight: 1.2 * L.lineSpacing,
    textShadow: shadow, WebkitTextStroke: outline, paintOrder: 'stroke fill',
  }

  const pivot = `${L.center[0] * W}px ${(1 - L.center[1]) * H}px`
  const group: CSSProperties = {
    transformOrigin: pivot,
    transform: `translate(${(cx - 0.5) * W}px, ${-(cy - 0.5) * H}px) scale(${num(at(moveT, 'Size', ms), 1)}) rotate(${-num(at(moveT, 'Angle', ms), 0)}deg)`,
  }

  return (
    <div className="vgroup" style={group}>
      <div
        ref={blockRef}
        className="vblock"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        style={{
          ...base,
          left: L.center[0] * W, top: (1 - L.center[1]) * H, fontSize: fontPx, color: css(L.fill), textAlign: (['left', 'center', 'right'] as const)[L.align],
          opacity, filter: blur ? `blur(${blur * 0.12}px)` : undefined,
          ...(L.box ? { background: css(L.box.color, L.box.opacity), padding: `${L.box.pad * 0.25}em ${L.box.pad * 0.5}em`, borderRadius: `${L.box.round * 0.6}em` } : {}),
        }}
      >
        {chars.map((ch, i) => {
          if (ch === '\n') return <br key={i} />
          const w = styled.get(i)
          const own = cue.letters ? follower(lettersT, ms - turn(i) * step, W) : {}
          const shift = cue.letters && w ? w.first * step : 0
          const fx = w ? follower(w.tracks.filter((t) => t.input !== 'Opacity1'), ms - shift, W) : {}
          const lit = w ? num(at(w.tracks, 'Opacity1', ms), 1) > 0.5 : false
          const wi = wordOf[i]
          const st: CSSProperties = {
            ...own,
            ...(w && lit ? { color: css(w.color) } : {}),
            ...(fx.transform ? { transform: fx.transform } : {}),
            ...(w?.glow ? { textShadow: `0 0 .35em ${css(w.color)}, 0 0 .8em ${css(w.color)}` } : {}),
            ...(w?.box ? { background: css(w.box), WebkitTextStroke: '0' } : {}),
          }
          return <span key={i} className={'ch' + (wi !== null && wi === selWord ? ' sel' : '')} data-w={wi ?? undefined} style={st}>{ch}</span>
        })}
      </div>
      {cue.words.filter((w) => w.solo).map((w) => {
        const s = w.solo!
        const shift = cue.letters ? w.first * step : 0
        const fx = follower(w.tracks.filter((t) => t.input !== 'Opacity1'), ms - shift, W)
        const sc = Array.from(graphemes.segment(s.text), (x) => x.segment)
        return (
          <div key={w.index} className={'vsolo' + (w.index === selWord ? ' sel' : '')} data-w={w.index}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
            style={{
              ...base, left: s.center[0] * W, top: (1 - s.center[1]) * H, fontSize: s.size * W * share, color: css(w.color), opacity,
              ...(w.glow ? { textShadow: `0 0 .35em ${css(w.color)}, 0 0 .8em ${css(w.color)}` } : {}),
              ...(w.box ? { background: css(w.box), padding: '0 .15em', borderRadius: '.18em', WebkitTextStroke: '0' } : {}),
            }}>
            <span className="vsolo-in" style={fx.transform ? { transform: fx.transform } : undefined}>
              {sc.map((c, j) => <span key={j} className="ch" style={cue.letters ? follower(lettersT, ms - turn(w.first + j) * step, W) : undefined}>{c}</span>)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
