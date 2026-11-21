import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import type { CompiledCue, Rgb, TimedTrack } from '@core/compile'
import { BOX_EXTEND, countUp, LINE_OF_SIZE, OUTLINE_REACH, SHADOW_OFFSET, SHADOW_SOFT, SOFT_W, STROKE_THICK, textPx } from '@core/look'
import { num, pt, valueAt } from '@core/sample'
import { clock, media, useClock } from './clock'
import { cssFace, fontDescent, fontHeight } from './fonts'
import { decoBack, letterbox, sweepStyle } from './Deco'
import { Icon } from './Icon'
import { css, SAFE, timecode, type SafeArea } from './model'

// A browser approximation of what Resolve will render, driven by the same keys and eases
// and the same layout (line breaks, blank room for bigger words). Text+ is the reference.

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
// Rounding an outline (Caption roundDefs): the level a gaussian of σ has at ROUND_Z σ past
// a straight edge, and how steep it is there (standard normal tail and density at 1.5)
const ROUND_Z = 1.5
const ROUND_TAIL = 0.0668072
const ROUND_PDF = 0.1295176
// A box behind one word: the bridge's ExtendHorizontal4, ExtendVertical4 and Round4 for it
const WORD_BOX = { x: 0.08, y: 0.06, round: 0.3 }

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
  /** A corner handle dragged: the caption's new size (Text+ Size) */
  onSize: (size: number) => void
  /** The turn handle dragged: the caption's new rotation, degrees counter-clockwise */
  onTurn: (deg: number) => void
  /** The caption's path, shown over the frame; with draw on, a click in the frame adds a point
   *  (as an offset from the caption's place, frame shares, y up) */
  path: { points: readonly (readonly [number, number])[]; draw: boolean; onAdd: (dx: number, dy: number) => void } | null
  /** The timeline's own picture and sound under the captions (TimelineVideo.tsx), or null */
  video?: { url: string; muted: boolean } | null
  /** Buttons for the timeline video, in the header */
  videoTools?: ReactNode
  /** Drawn over the video and under the captions (the audio wave) */
  under?: ReactNode
}

/** How near (in pixels) the caption's centre must come to the frame's centre lines to stick */
const SNAP_PX = 6
const SIZE_MIN = 0.02
const SIZE_MAX = 0.2
const TURN_MAX = 30

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
  const root = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 560, h: 600 })
  const [warn, setWarn] = useState(false)

  // Full screen (Ctrl+F, as Resolve's Cinema Viewer; no button, the shortcut list names it): the
  // preview fills the monitor, its buttons stay; Esc or Ctrl+F again comes back. The frame then grows past MAX_H.
  // Where real full screen is refused (a browser that blocks it), it fills the window instead.
  const [real, setReal] = useState(false)
  const [inWindow, setInWindow] = useState(false)
  const full = real || inWindow
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else if (inWindow) setInWindow(false)
    else if (root.current?.requestFullscreen) {
      // Some browsers neither grant nor refuse (the request just waits): fill the window meanwhile
      const wait = setTimeout(() => { if (!document.fullscreenElement) setInWindow(true) }, 400)
      root.current.requestFullscreen().then(() => clearTimeout(wait), () => { clearTimeout(wait); setInWindow(true) })
    } else setInWindow(true)
  }
  useEffect(() => {
    const onChange = () => {
      const on = document.fullscreenElement === root.current
      setReal(on)
      if (on) setInWindow(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && inWindow) { setInWindow(false); return }
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'f') return
      if ((e.target as HTMLElement).closest?.('input, textarea, select')) return
      e.preventDefault()
      toggleFull()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const W = Math.round(Math.max(160, Math.min(box.w * (full ? 0.96 : FILL), Math.min(box.h * (full ? 0.96 : FILL), full ? Infinity : MAX_H) * aspect)))
  const H = Math.round(W / aspect)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.floor(e!.contentRect.width), h: Math.floor(e!.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The timeline video: while playing it leads the playhead (and plays its sound); standing
  // still it shows the playhead's frame. Trying an animation on hover keeps it still.
  const vid = useRef<HTMLVideoElement>(null)
  const url = p.video?.url
  const rolling = p.playing && !p.loop
  useEffect(() => {
    const el = vid.current
    if (!el || !url) return
    if (!rolling) { el.pause(); return }
    // Next frame: by then Play has moved the playhead to where it starts (App's effect runs after this one).
    // While it seeks or loads, the video holds the playhead still, so sound and captions start together.
    const raf = requestAnimationFrame(() => {
      el.currentTime = clock.get() / 1000
      el.play().catch(() => {})
      media.set(() => (el.paused || el.ended ? null : el.currentTime * 1000))
    })
    return () => { cancelAnimationFrame(raf); media.set(null); el.pause() }
  }, [rolling, url])
  // The playhead moved by hand (a click on a caption, the scrub bar): the video goes there too.
  // While playing, the video sets the time itself, so only a real jump counts.
  useEffect(() => {
    const el = vid.current
    if (!el || !url) return
    const past = Number.isFinite(el.duration) && t / 1000 >= el.duration
    if (Math.abs(el.currentTime * 1000 - t) > (rolling ? 300 : 20) && !(rolling && past)) el.currentTime = t / 1000
  }, [t, rolling, url])
  useEffect(() => { if (vid.current) vid.current.muted = !!p.video?.muted }, [p.video?.muted, url])

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

  // Drag to move (its centre sticks to the frame's centre lines; Alt places it freely),
  // a corner to resize, the round handle to turn it. A click without moving picks the word.
  const drag = useRef<{
    x: number; y: number; moved: boolean; w: number | null; grip: string
    /** The block's centre on screen, its centre in the frame (shares, y up), and its size and turn at the start */
    cx: number; cy: number; center: readonly [number, number]; d0: number; a0: number; size0: number; turn0: number
  } | null>(null)
  const [guides, setGuides] = useState({ v: false, h: false })
  const down = (e: PointerEvent) => {
    if (!cue) return
    const el = e.target as HTMLElement
    const w = el.closest('[data-w]')?.getAttribute('data-w')
    const grip = el.closest('[data-grip]')?.getAttribute('data-grip') ?? 'move'
    const r = block.current?.getBoundingClientRect()
    const cx = r ? r.left + r.width / 2 : e.clientX
    const cy = r ? r.top + r.height / 2 : e.clientY
    drag.current = {
      x: e.clientX, y: e.clientY, moved: false, w: w == null || grip !== 'move' ? null : Number(w), grip,
      cx, cy, center: cue.look.center, d0: Math.max(4, Math.hypot(e.clientX - cx, e.clientY - cy)),
      a0: Math.atan2(e.clientY - cy, e.clientX - cx), size0: cue.look.size, turn0: cue.look.rotation,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.stopPropagation()
  }
  /** The move so far, in frame shares, after sticking to the centre lines */
  const shift = (e: PointerEvent, d: NonNullable<typeof drag.current>) => {
    let sx = (e.clientX - d.x) / W
    let sy = -(e.clientY - d.y) / H
    const v = !e.altKey && Math.abs((d.center[0] + sx - 0.5) * W) < SNAP_PX
    const h = !e.altKey && Math.abs((d.center[1] + sy - 0.5) * H) < SNAP_PX
    if (v) sx = 0.5 - d.center[0]
    if (h) sy = 0.5 - d.center[1]
    return { sx, sy, v, h }
  }
  const move = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    if (!d.moved && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 4) return
    d.moved = true
    if (d.grip === 'size') {
      const f = Math.hypot(e.clientX - d.cx, e.clientY - d.cy) / d.d0
      p.onSize(Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, d.size0 * f)) * 1000) / 1000)
    } else if (d.grip === 'turn') {
      // Screen angles grow clockwise; Resolve's rotation grows counter-clockwise
      let deg = d.turn0 - ((Math.atan2(e.clientY - d.cy, e.clientX - d.cx) - d.a0) * 180) / Math.PI
      deg = ((deg + 540) % 360) - 180
      deg = e.shiftKey ? Math.round(deg / 15) * 15 : Math.abs(deg) < 1.5 ? 0 : Math.round(deg * 2) / 2
      p.onTurn(Math.min(TURN_MAX, Math.max(-TURN_MAX, deg)))
    } else {
      const m = shift(e, d)
      if (m.v !== guides.v || m.h !== guides.h) setGuides({ v: m.v, h: m.h })
      p.onDrag(m.sx, m.sy, false)
    }
  }
  const up = (e: PointerEvent) => {
    const d = drag.current
    drag.current = null
    setGuides({ v: false, h: false })
    if (!d) return
    if (d.moved && d.grip === 'move') { const m = shift(e, d); p.onDrag(m.sx, m.sy, true) }
    else if (!d.moved && d.w !== null) p.onPickWord(d.w)
  }

  // Scrub bar: where the playhead is along all the captions; click or drag to move it
  const pct = p.endMs > 0 ? Math.min(100, Math.max(0, (t / p.endMs) * 100)) : 0
  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId)
    else if (!e.buttons) return
    const r = e.currentTarget.getBoundingClientRect()
    p.onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * p.endMs)
  }

  // Drawing a path: a click on the frame (not on the caption) adds the next point
  const addPoint = (e: PointerEvent<HTMLDivElement>) => {
    if (!p.path?.draw || !cue || (e.target as HTMLElement).closest('.vblock, .vsolo')) return
    const r = e.currentTarget.getBoundingClientRect()
    const [cx, cy] = cue.look.center
    p.path.onAdd((e.clientX - r.left) / r.width - cx, 1 - (e.clientY - r.top) / r.height - cy)
  }
  const pathPts = p.path && cue ? [[0, 0] as const, ...p.path.points].map(([dx, dy]) => [(cue.look.center[0] + dx) * W, (1 - cue.look.center[1] - dy) * H] as const) : null

  const fr = (
    <div className={'vframe' + (p.path?.draw ? ' drawing' : '')} ref={frame} style={{ width: W, height: H }} onPointerDown={addPoint}>
      {url ? <video ref={vid} className="vvid" src={url} preload="auto" playsInline disablePictureInPicture /> : <div className="vbg" />}
      {p.under}
      {cue && onScreen && <Caption cue={cue} ms={ms} W={W} H={H} aspect={aspect} selWord={p.selWord} blockRef={block} onDown={down} onMove={move} onUp={up}
        handles={!p.playing && !p.loop} moving={p.playing || !!p.loop} />}
      {pathPts && (
        <svg className="vpath" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
          <polyline points={pathPts.map((q) => q.join(',')).join(' ')} />
          {pathPts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i ? 4 : 3} className={i ? '' : 'home'} />)}
        </svg>
      )}
      {guides.v && <i className="vguide v" />}
      {guides.h && <i className="vguide h" />}
      {p.safe !== 'off' && <Safe area={p.safe} />}
      {warn && <span className="vwarn">Under the {SAFE[p.safe as 'reels'].name} buttons: viewers may not see it</span>}
    </div>
  )

  return (
    <div className={'viewer' + (p.loop ? ' trying' : '') + (full ? ' full' : '') + (inWindow ? ' inwin' : '')} ref={root}>
      <div className="phead"><b>Preview</b><span className="grow" />{p.videoTools}</div>
      <div className="vlabel" title={p.label}>{p.label}</div>
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

export interface CapProps {
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
  /** Show the resize and turn handles (the preview while it stands still; never in drawn frames) */
  handles?: boolean
  /** Playing: the caption and its moving letters are drawn as layers the screen moves whole,
   *  so they glide by fractions of a pixel instead of stepping a pixel at a time */
  moving?: boolean
}

export function Caption({ cue, ms, W, H, aspect, selWord, blockRef, onDown, onMove, onUp, handles, moving }: CapProps) {
  const L = cue.look
  // Sizes as Text+ makes them (core/look.ts textPx), so drawn clips and Text+ match
  const fh = fontHeight(L.font, L.style)
  const sizePx = (size: number) => textPx(size, aspect, W, fh, 1, 1).font
  const fontPx = sizePx(L.size)
  const face = cssFace(L.style)
  const text = cue.tracks.filter((t) => t.target === 'text')
  const moveT = cue.tracks.filter((t) => t.target === 'move')
  const lettersT = cue.tracks.filter((t) => t.target === 'letters')
  const [cx, cy] = pt(at(moveT, 'Center', ms), [0.5, 0.5])
  const opacity = num(at(text, 'Opacity1', ms), 1)
  // Letter space is laid out once, at where its animation ends: laying the line out again
  // each frame lands every letter on a whole pixel, so letters jitter as the space changes.
  // The change is drawn as each letter moving instead (spreadOf), smooth to the pixel.
  const spaceT = text.find((t) => t.input === 'CharacterSpacing')
  const spacing = spaceT ? num(spaceT.keys[spaceT.keys.length - 1]?.v, L.tracking) : L.tracking
  const spaceNow = num(at(text, 'CharacterSpacing', ms), spacing)
  const blur = num(at(text, 'SoftnessX1', ms), 0)
  const step = cue.letters?.stepMs ?? 0
  // Numbers counting up keep their width in letters, so every letter keeps its place
  const counted = (t: string) => (L.count ? countUp(t, 1 - (1 - Math.min(1, Math.max(0, ms / L.count.ms))) ** 3, L.count.from) : t)
  const chars = Array.from(graphemes.segment(counted(cue.text)), (s) => s.segment)
  const turn = (i: number) => (cue.letters?.order === 'rtl' ? chars.length - 1 - i : i)
  // Each letter's place in its line, and the line's length, for the letter space as it changes
  const inLine: number[] = []
  const lineLen: number[] = []
  {
    let start = 0
    chars.forEach((ch, i) => {
      if (ch === '\n') { for (let j = start; j < i; j++) lineLen[j] = i - start; start = i + 1; return }
      inLine[i] = i - start
    })
    for (let j = start; j < chars.length; j++) lineLen[j] = chars.length - start
  }
  const anchor = L.align === 0 ? 0 : L.align === 1 ? 0.5 : 1
  /** The extra letter space now (em per gap), over the space the line is laid out with */
  const spreadEm = (spaceNow - spacing) * fh / LINE_OF_SIZE
  /** How far letter k of a line of n moves for that extra space, the line keeping its alignment */
  const spreadOf = (k: number, n: number, a = anchor) => (spreadEm ? `translateX(${spreadEm * (k - a * (n - 1))}em)` : '')
  const longest = Math.max(0, ...lineLen.filter((n) => n !== undefined))
  const join = (...ts: (string | undefined)[]) => ts.filter(Boolean).join(' ') || undefined
  /** Letters move on their own: letter animations, word effects or a changing letter space */
  const lettersMove = !!cue.letters || !!spaceT || cue.words.some((w) => w.tracks.length > 0)

  // Which word (and which styled word) each letter belongs to
  const wordOf: (number | null)[] = chars.map(() => null)
  cue.ranges.forEach((r, wi) => { if (r) for (let i = r.first; i <= r.last; i++) wordOf[i] = wi })
  const styled = new Map<number, CompiledCue['words'][number]>()
  for (const w of cue.words) if (!w.solo) for (let i = w.first; i <= w.last; i++) styled.set(i, w)

  // Text+'s unit (Size × frame width) for text drawn at a font size of px (core/look.ts textPx)
  const unitOf = (px: number) => (px * fh) / LINE_OF_SIZE
  const U = unitOf(fontPx)
  // Shadow as Text+ draws it (core/look.ts): moved with the Size, blurred by the frame.
  // A text shadow's blur is 2σ, a drop shadow's is σ.
  const sh = L.shadow && {
    off: L.shadow.distance * SHADOW_OFFSET * U,
    sigma: L.shadow.blur * SHADOW_SOFT * SOFT_W * W,
    color: css(L.shadow.color, L.shadow.opacity),
  }
  const shadow = sh ? `${sh.off}px ${sh.off}px ${2 * sh.sigma}px ${sh.color}` : undefined
  const shadowId = sh ? `mc-shadow-${Math.round(sh.off * 100)}-${Math.round(sh.sigma * 100)}-${L.shadow!.color.map((c) => Math.round(c * 255)).join('-')}-${Math.round(L.shadow!.opacity * 100)}` : ''
  const O = L.outline
  // Text+ adds letter space between letters only: CSS adds it after the last letter of a
  // line too, which would push a centred line off by half a space
  const letterSpace = `${(spacing - 1) * fh / LINE_OF_SIZE}em`
  const lineEnd = (i: number, cs: string[]): CSSProperties =>
    spacing !== 1 && (i === cs.length - 1 || cs[i + 1] === '\n') ? { marginRight: `calc(-1 * ${letterSpace})` } : {}
  const base: CSSProperties = {
    fontFamily: `'${L.font}', 'Nirmala UI', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif`, fontWeight: face.weight, fontStyle: face.italic ? 'italic' : 'normal',
    // Letter space in em, so a bigger word gets its own share as in Text+; a line pitch of fontHeight × Line height
    letterSpacing: letterSpace, lineHeight: fh * L.lineSpacing,
  }
  // The stroke is drawn as copies of the letters behind them, all
  // at once. A stroke on each letter would cross the letters next to it where they join
  // (the headline of Devanagari, Bengali…) and show seams. Text+ keeps the letters whole on
  // top of it, centred or not, and rounds its corners: a stroke reaches half the way (its
  // corners are sharp), and a filter (roundDefs) grows that shape the other half, rounding them.
  const reachOf = (px: number) => (O ? Math.max(0.5, OUTLINE_REACH * STROKE_THICK * O.width * unitOf(px)) : 0)
  const reach2Of = (px: number) => (O?.second ? reachOf(px) + Math.max(0.5, OUTLINE_REACH * STROKE_THICK * O.second.width * unitOf(px)) : 0)
  // A thin stroke is drawn as it is (twice the reach, centred on the edge); a wider one
  // reaches half way and the rounding filter grows it the rest
  const strokeCss = (reach: number) => `${roundFilter(reach) ? reach : 2 * reach}px`
  const line = (c: Rgb, reach: number, k: string, pad: string | number, copy: (layer: string) => ReactNode) => (
    <span key={k} className="vline" style={{ padding: pad, color: css(c), WebkitTextStroke: `${strokeCss(reach)} ${css(c)}`, filter: roundFilter(reach) }}>{copy(k)}</span>
  )
  /** The shadow, under the box and everything else, as in Text+: it falls from the letters
   *  with their stroke, all at once (a text shadow on each letter would also darken the
   *  letter before it), and only the shadow is drawn (filter shadowId) */
  const shade = (px: number, pad: string | number, copy: (layer: string) => ReactNode) => {
    if (!sh) return null
    const reach = O ? (O.second ? reach2Of(px) : reachOf(px)) : 0
    const st: CSSProperties = reach
      ? { padding: pad, WebkitTextStroke: `${strokeCss(reach)} #000`, filter: [roundFilter(reach), `url(#${shadowId})`].filter(Boolean).join(' ') }
      : { padding: pad, filter: `url(#${shadowId})` }
    return <span className="vback" aria-hidden><span className="vline" style={{ color: '#000', ...st }}>{copy('sh')}</span></span>
  }
  const behind = (px: number, pad: string | number, copy: (layer: string) => ReactNode) => {
    if (!O) return null
    const sw = reachOf(px)
    const sw2 = reach2Of(px)
    return (
      <span className="vback" aria-hidden style={{ opacity: O.opacity ?? 1, filter: O.soft ? `blur(${O.soft * px * 0.08}px)` : undefined }}>
        {O.second && line(O.second.color, sw2, 'o2', pad, copy)}
        {line(O.color, sw, 'o1', pad, copy)}
      </span>
    )
  }
  // One rounding filter per outline reach: a gaussian of the stroked letters, cut at the
  // level a straight edge reaches half the outline further out (ROUND_Z deviations)
  const roundId = (reach: number) => `mc-round-${Math.round(reach * 100)}`
  const roundFilter = (reach: number) => (reach / 2 / ROUND_Z >= 1 ? `url(#${roundId(reach)})` : undefined)
  const roundDefs = O
    ? [...new Set([fontPx, ...cue.words.filter((w) => w.solo && !w.box).map((w) => sizePx(w.solo!.size))]
      .flatMap((px) => [...(O ? [reachOf(px)] : []), ...(O?.second ? [reach2Of(px)] : [])]))]
      .filter((r) => roundFilter(r))
    : []
  // Gradient letters: a layer around the letters whose background is cut to them, so the
  // box stays behind.
  const G = L.gradient
  const gradLayer: CSSProperties | null = G ? {
    backgroundImage: `linear-gradient(${G.angle}deg, ${css(L.fill)}, ${css(G.color)})`, WebkitBackgroundClip: 'text', backgroundClip: 'text',
    color: 'transparent', textShadow: 'none',
  } : null
  const img = L.image
  const deco = L.deco ?? []
  const sweep = deco.length ? sweepStyle(deco, ms) : null
  // Boxes as Text+ draws them (core/look.ts): the line box, wider by the font's descent at each end
  const descent = fontDescent(L.font, L.style)
  const boxPad = L.box ? `${L.box.pad * BOX_EXTEND.y * U}px ${descent * fontPx + L.box.pad * BOX_EXTEND.x * U}px` : 0
  const wordBoxPad = (px: number) => `${WORD_BOX.y * unitOf(px)}px ${descent * px + WORD_BOX.x * unitOf(px)}px`

  /** One letter as drawn: its letter animation, its word's colour and effect. Behind (the
   *  outline's copy) it keeps only where it is: colours, glows and boxes are the front's. */
  const charEl = (i: number, back?: string) => {
    const ch = chars[i]!
    const w = styled.get(i)
    const own = cue.letters ? follower(lettersT, ms - turn(i) * step, W) : {}
    const shift = cue.letters && w ? w.first * step : 0
    const fx = w ? follower(w.tracks.filter((t) => t.input !== 'Opacity1'), ms - shift, W) : {}
    const lit = w ? num(at(w.tracks, 'Opacity1', ms), 1) > 0.5 : false
    const wi = wordOf[i]
    const end = lineEnd(i, chars)
    const tf = join(spreadOf(inLine[i] ?? 0, lineLen[i] ?? 1), fx.transform ?? own.transform)
    if (back) {
      // A letter fading in would show its outline's colour through it; the copy behind
      // fades in later, so the outline arrives as the letter firms up
      const bt: CSSProperties = {
        ...own, ...(own.opacity !== undefined ? { opacity: own.opacity ** 3 } : {}),
        transform: tf, ...(w?.box ? { visibility: 'hidden' } : {}), ...end,
      }
      return <span key={back + i} className="ch" style={bt}>{ch}</span>
    }
    const st: CSSProperties = {
      ...own,
      ...(w && lit ? { color: css(w.color) } : {}),
      transform: tf,
      ...(w?.glow ? { textShadow: `0 0 .35em ${css(w.color)}, 0 0 .8em ${css(w.color)}` } : {}),
      ...(w?.box ? { background: css(w.box) } : {}),
      ...end,
    }
    return <span key={i} className={'ch' + (wi !== null && wi === selWord ? ' sel' : '')} data-w={wi ?? undefined} style={st}>{ch}</span>
  }

  const pivot = `${L.center[0] * W}px ${(1 - L.center[1]) * H}px`
  const group: CSSProperties = {
    transformOrigin: pivot,
    transform: `translate(${(cx - 0.5) * W}px, ${-(cy - 0.5) * H}px) scale(${num(at(moveT, 'Size', ms), 1)}) rotate(${-num(at(moveT, 'Angle', ms), 0)}deg)`,
  }

  return (
    <>
    {deco.length > 0 && letterbox(deco, ms, cue.endMs - cue.startMs, H)}
    <div className={'vgroup' + (moving ? ' moving' : '') + (moving && lettersMove ? ' chmove' : '')} style={group}>
      {roundDefs.length > 0 && (
        <svg className="vdefs" width="0" height="0" aria-hidden>
          {roundDefs.map((r) => {
            // Blur by σ, then make the level a straight edge has ROUND_Z σ out opaque, with a one-pixel edge
            const sigma = r / 2 / ROUND_Z
            const slope = sigma / ROUND_PDF
            return (
              <filter key={r} id={roundId(r)} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
                <feGaussianBlur in="SourceGraphic" stdDeviation={sigma} />
                <feComponentTransfer>
                  <feFuncA type="linear" slope={slope} intercept={0.5 - slope * ROUND_TAIL} />
                </feComponentTransfer>
              </filter>
            )
          })}
        </svg>
      )}
      {sh && (
        <svg className="vdefs" width="0" height="0" aria-hidden>
          <filter id={shadowId} x="-100%" y="-100%" width="300%" height="300%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation={sh.sigma} />
            <feOffset dx={sh.off} dy={sh.off} result="s" />
            <feFlood floodColor={css(L.shadow!.color)} floodOpacity={L.shadow!.opacity} />
            <feComposite in2="s" operator="in" />
          </filter>
        </svg>
      )}
      <div
        ref={blockRef}
        className={'vblock' + (handles ? ' edit' : '')}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        style={{
          ...base,
          left: L.center[0] * W, top: (1 - L.center[1]) * H, fontSize: fontPx, color: css(L.fill), textAlign: (['left', 'center', 'right'] as const)[L.align],
          opacity, // Text+ softness, scaled with the frame so a drawn frame matches the preview
          filter: blur ? `blur(${blur * W * 0.0003}px)` : undefined,
          ...(L.box ? { padding: boxPad } : {}),
        }}
      >
        {deco.length > 0 && decoBack(deco, ms, L.align, cue.endMs - cue.startMs)}
        {shade(fontPx, boxPad, (k) => chars.map((ch, i) => (ch === '\n' ? <br key={k + i} /> : charEl(i, k))))}
        {L.box && <span className="vback" aria-hidden style={{
          background: css(L.box.color, L.box.opacity), borderRadius: L.box.round * U,
          // The box grows and shrinks with the letter space, as Text+'s does
          ...(spreadEm && longest > 1 ? { left: `${-anchor * (longest - 1) * spreadEm}em`, right: `${-(1 - anchor) * (longest - 1) * spreadEm}em` } : {}),
        }} />}
        {img && <img className={'vimg ' + img.place} src={img.src} alt="" draggable={false} style={{ height: img.size * fontPx }} />}
        {behind(fontPx, boxPad, (k) => chars.map((ch, i) => (ch === '\n' ? <br key={k + i} /> : charEl(i, k))))}
        <span className={G ? 'vtext grad' : 'vtext'} style={gradLayer ?? undefined}>
          {chars.map((ch, i) => (ch === '\n' ? <br key={i} /> : charEl(i)))}
        </span>
        {sweep && (
          <span className="vback" aria-hidden>
            <span className="vline clip" style={{ padding: boxPad, ...sweep }}>{chars.map((ch, i) => (ch === '\n' ? <br key={'sw' + i} /> : charEl(i, 'sw')))}</span>
          </span>
        )}
        {handles && <>
          {['c1', 'c2', 'c3', 'c4'].map((c) => <span key={c} className={'vh ' + c} data-grip="size" title="Drag to make it bigger or smaller" />)}
          <span className="vh turn" data-grip="turn" title="Drag to turn it (Shift: 15° steps)" />
        </>}
      </div>
      {cue.words.filter((w) => w.solo).map((w) => {
        const s = w.solo!
        const shift = cue.letters ? w.first * step : 0
        const fx = follower(w.tracks.filter((t) => t.input !== 'Opacity1'), ms - shift, W)
        const sc = Array.from(graphemes.segment(counted(s.text)), (x) => x.segment)
        const px = sizePx(s.size)
        const letters = (k?: string) => sc.map((c, j) => {
          const f = cue.letters ? follower(lettersT, ms - turn(w.first + j) * step, W) : undefined
          const st = { ...(k && f?.opacity !== undefined ? { ...f, opacity: f.opacity ** 3 } : f), transform: join(spreadOf(j, sc.length, 0.5), f?.transform), ...lineEnd(j, sc) }
          return <span key={(k ?? '') + j} className="ch" style={st}>{c}</span>
        })
        const inner = fx.transform ? { transform: fx.transform } : undefined
        return (
          <div key={w.index} className={'vsolo' + (w.index === selWord ? ' sel' : '')} data-w={w.index}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
            style={{
              ...base, left: s.center[0] * W, top: (1 - s.center[1]) * H, fontSize: px, color: css(w.color), opacity,
              ...(w.glow ? { textShadow: `0 0 .35em ${css(w.color)}, 0 0 .8em ${css(w.color)}` } : {}),
              ...(w.box ? { background: css(w.box), padding: wordBoxPad(px), borderRadius: WORD_BOX.round * unitOf(px), textShadow: shadow } : {}),
            }}>
            {!w.box && shade(px, 0, (k) => <span key={k} className="vsolo-in" style={inner}>{letters(k)}</span>)}
            {!w.box && behind(px, 0, (k) => <span key={k} className="vsolo-in" style={inner}>{letters(k)}</span>)}
            <span className="vsolo-in front" style={inner}>{letters()}</span>
          </div>
        )
      })}
    </div>
    </>
  )
}
