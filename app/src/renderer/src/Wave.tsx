import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from 'react'
import { DEFAULT_WAVE, styleInfo, WAVE_GROUPS, WAVE_STYLES, type Envelope, type WaveGroup, type WaveLook, type WaveStyle } from '@core/wave'
import { clock } from './clock'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'
import { Color, Section, Seg, Slider, Toggle } from './Inspector'
import { timecode } from './model'
import { bandsOf, drawWave, sampleBands, type WaveSound } from './waveDraw'

// The audio wave's parts of the studio: its tab in the library (the sound and the styles),
// the layer over the preview, and its settings in place of the Inspector.

/** A timeline's audio wave, as kept on this computer */
export interface WaveData {
  /** Goes into Resolve with the next Send */
  on: boolean
  /** Where the sound came from: the timeline's own (via the timeline video) or a file */
  src: { kind: 'timeline' | 'file'; name: string; track?: number }
  /** Where the sound starts on the timeline, in ms (on a frame) */
  startMs: number
  env: Envelope
}

/** Draws into a canvas at its own size on screen, sharp on any display */
function fitCanvas(c: HTMLCanvasElement): { g: CanvasRenderingContext2D; W: number; H: number } | null {
  const r = window.devicePixelRatio || 1
  const W = c.clientWidth
  const H = c.clientHeight
  if (!W || !H) return null
  if (c.width !== Math.round(W * r) || c.height !== Math.round(H * r)) { c.width = Math.round(W * r); c.height = Math.round(H * r) }
  const g = c.getContext('2d')
  if (!g) return null
  g.setTransform(r, 0, 0, r, 0, 0)
  return { g, W, H }
}

/** The wave over the preview, at the playhead: the same drawing the frames for Resolve get */
export function WaveLayer({ look, sound, startMs, endMs, audio, playing }: {
  look: WaveLook; sound: WaveSound; startMs: number; endMs: number
  /** A sound file picked in this session, played with the preview (the timeline video plays its own) */
  audio: string | null
  playing: boolean
}) {
  const cv = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const draw = () => {
      const c = cv.current
      const f = c && fitCanvas(c)
      if (!f) return
      const ms = clock.get()
      if (ms < startMs || ms >= endMs) { f.g.clearRect(0, 0, f.W, f.H); return }
      drawWave(f.g, f.W, f.H, (sec) => bandsOf(sound, sec * 1000, startMs), ms / 1000, look, { start: startMs / 1000, end: endMs / 1000 })
    }
    draw()
    const off = clock.sub(draw)
    const ro = new ResizeObserver(draw)
    if (cv.current) ro.observe(cv.current)
    return () => { off(); ro.disconnect() }
  }, [look, sound, startMs, endMs])

  // The picked file plays along while the preview plays, from where the playhead is in it
  const el = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const a = el.current
    if (!a || !audio) return
    if (!playing) { a.pause(); return }
    const sync = () => {
      const at = (clock.get() - startMs) / 1000
      if (at < 0 || (Number.isFinite(a.duration) && at >= a.duration)) { if (!a.paused) a.pause(); return }
      if (Math.abs(a.currentTime - at) > 0.25) a.currentTime = at
      if (a.paused) a.play().catch(() => {})
    }
    sync()
    const off = clock.sub(sync)
    return () => { off(); a.pause() }
  }, [audio, playing, startMs])

  return (
    <>
      <canvas ref={cv} className="vwave" />
      {audio && <audio ref={el} src={audio} preload="auto" />}
    </>
  )
}

/** A card's wave: its look with a made-up voice, always moving */
function useCards(looks: WaveLook[]) {
  const refs = useRef<(HTMLCanvasElement | null)[]>([])
  useEffect(() => {
    let raf = 0
    const tick = (now: number) => {
      const t = now / 1000
      looks.forEach((look, i) => {
        const c = refs.current[i]
        const f = c && fitCanvas(c)
        if (f) drawWave(f.g, f.W, f.H, (sec) => sampleBands(sec + i * 0.37).map((v) => Math.max(v, 0.18)), t, {
          ...look, y: 0.5, height: styleInfo(look.style).group === 'Circle' || look.style === 'blob' ? 0.2 : 0.3, width: 0.9,
          sensitivity: 1, silence: 'line', gate: 0, opacity: 1,
          thickness: Math.max(look.thickness, 2) * (1080 / Math.max(60, f.H)) * 0.5,
        })
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [looks])
  return refs
}

// ── Recent styles, favourite styles and saved looks (on this computer, for every timeline) ──

export interface SavedWave { id: string; name: string; look: WaveLook }
interface Kept { recent: WaveStyle[]; favs: WaveStyle[]; saved: SavedWave[] }
const KEPT_KEY = 'mc.waveKept'
let kept: Kept = (() => {
  try {
    const k = JSON.parse(localStorage.getItem(KEPT_KEY) ?? '{}') as Partial<Kept>
    const known = (l: unknown) => (Array.isArray(l) ? l.filter((x): x is WaveStyle => WAVE_STYLES.some((s) => s.id === x)) : [])
    return { recent: known(k.recent), favs: known(k.favs), saved: Array.isArray(k.saved) ? k.saved : [] }
  } catch { return { recent: [], favs: [], saved: [] } }
})()
const keptSubs = new Set<() => void>()
function setKept(f: (k: Kept) => Kept) {
  kept = f(kept)
  try { localStorage.setItem(KEPT_KEY, JSON.stringify(kept)) } catch { /* private window */ }
  keptSubs.forEach((s) => s())
}
const subKept = (s: () => void) => { keptSubs.add(s); return () => { keptSubs.delete(s) } }
const useKept = () => useSyncExternalStore(subKept, () => kept)
/** A style was picked: it goes to the front of Recent */
export const noteRecent = (style: WaveStyle) => setKept((k) => ({ ...k, recent: [style, ...k.recent.filter((x) => x !== style)].slice(0, 8) }))
const toggleFav = (style: WaveStyle) => setKept((k) => ({ ...k, favs: k.favs.includes(style) ? k.favs.filter((x) => x !== style) : [...k.favs, style] }))
const saveLook = (name: string, look: WaveLook) =>
  setKept((k) => ({ ...k, saved: [{ id: Date.now().toString(36), name, look }, ...k.saved.filter((x) => x.name !== name)] }))
const removeSaved = (id: string) => setKept((k) => ({ ...k, saved: k.saved.filter((x) => x.id !== id) }))

const LEVELS = ['All', 'Simple', 'Advanced'] as const
const BINS = ['Recent', 'Favourites', 'Saved'] as const
type Bin = (typeof LEVELS)[number] | (typeof BINS)[number]

/** Mostly dark colours: the cards turn light so a black wave shows */
const darkLook = (l: WaveLook) => l.colors.reduce((s, c) => s + 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], 0) / 3 < 0.3

/** An audio track of the timeline the wave can follow on its own */
export interface WaveTrack { index: number; name: string }

interface Tile { key: string; name: string; sub: string; adv: boolean; style: WaveStyle | null; saved: SavedWave | null; look: WaveLook; on: boolean }

/** The Audio wave tab of the library: the sound it follows, and the styles */
export function WaveLibrary(p: {
  data: WaveData | null
  look: WaveLook
  onStyle: (s: WaveStyle) => void
  /** A saved look, all of it */
  onLook: (l: WaveLook) => void
  /** The timeline's own sound (track 0: all of it, or one audio track): null for an SRT (no timeline) */
  onTimeline: ((track: number, fresh: boolean) => void) | null
  /** The timeline's audio tracks (empty when the Resolve script is older and does not list them) */
  tracks: WaveTrack[]
  onFile: (f: File) => void
  /** Reading the sound, or waiting for Resolve to render it */
  busy: string | null
  error: string | null
  fps: number
  durMs: number
  /** Show the wave's settings */
  onOpen: () => void
}) {
  const [bin, setBin] = useState<Bin>('All')
  const [group, setGroup] = useState<WaveGroup | null>(null)
  const [over, setOver] = useState(false)
  const k = useKept()
  const isLevel = (LEVELS as readonly string[]).includes(bin)
  const ofLevel = WAVE_STYLES.filter((s) => !isLevel || bin === 'All' || s.level === bin)

  /** The cards to show: styles in the current look, or saved looks as they were saved */
  const tiles = useMemo<Tile[]>(() => {
    if (bin === 'Saved') {
      return k.saved.map((v) => ({ key: v.id, name: v.name, sub: styleInfo(v.look.style).name, adv: false, style: null, saved: v,
        look: { ...DEFAULT_WAVE, ...v.look }, on: false }))
    }
    const list = bin === 'Recent' ? k.recent.map((id) => styleInfo(id))
      : bin === 'Favourites' ? WAVE_STYLES.filter((s) => k.favs.includes(s.id))
        : ofLevel.filter((s) => !group || s.group === group)
    return list.map((s) => ({ key: s.id, name: s.name, sub: s.group, adv: s.level === 'Advanced', style: s.id, saved: null,
      look: { ...p.look, style: s.id }, on: s.id === p.look.style }))
  }, [bin, group, k, p.look]) // eslint-disable-line react-hooks/exhaustive-deps
  const looks = useMemo(() => tiles.map((t) => t.look), [tiles])
  const refs = useCards(looks)
  const peaks = useRef<HTMLCanvasElement>(null)
  const track = p.data?.src.kind === 'timeline' ? p.data.src.track ?? 0 : 0

  // The sound's shape in the card, like Resolve's audio clip
  useEffect(() => {
    const c = peaks.current
    const f = c && fitCanvas(c)
    if (!f) return
    f.g.clearRect(0, 0, f.W, f.H)
    if (!p.data) return
    const env = p.data.env
    f.g.fillStyle = '#ff9a62'
    for (let x = 0; x < f.W; x += 2) {
      const a = Math.floor((x / f.W) * env.low.length)
      const b = Math.max(a + 1, Math.floor(((x + 2) / f.W) * env.low.length))
      let m = 0
      for (let i = a; i < b && i < env.low.length; i++) m = Math.max(m, env.low[i]!, env.mid[i]!, env.high[i]!)
      const h = Math.max(1, (m / 255) * f.H * 0.9)
      f.g.fillRect(x, (f.H - h) / 2, 1.2, h)
    }
  }, [p.data])

  const drop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) p.onFile(f)
  }
  const empty = bin === 'Recent' ? 'Styles you pick show here.' : bin === 'Favourites' ? 'Click ☆ on a style to keep it here.'
    : bin === 'Saved' ? 'Save a look from the wave’s settings (Save style) to keep it here.' : 'No style matches.'

  return (
    <div className="wavelib">
      <div className={'wsrc' + (over ? ' over' : '')} onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)} onDrop={drop}>
        <span className="bub"><Icon name="music" size={18} /></span>
        <span className="meta">
          <b>{p.busy ?? (p.data ? p.data.src.name : 'Add the sound the wave follows')}</b>
          <span>{p.error ? <em className="err">{p.error}</em>
            : p.data ? `${timecode(p.durMs, p.fps).slice(3, 8)} · ${p.data.src.kind === 'timeline' ? (track ? 'one audio track of the timeline' : 'the timeline’s own sound') : 'a sound file'} · starts at ${timecode(p.data.startMs, p.fps)}`
              : 'The timeline’s own sound, or a file: wav, mp3, m4a, or a video'}</span>
        </span>
        <canvas ref={peaks} className="wpeaks" />
        <span className="wbtns">
          {p.onTimeline && p.tracks.length > 0 && (
            <Dropdown className="sl wfrom" value={track} title="Which sound the wave follows: all of the timeline's sound, or one audio track"
              onChange={(v) => p.onTimeline?.(Number(v), false)}>
              <option value={0}>All tracks</option>
              {p.tracks.map((t) => <option key={t.index} value={t.index}>{`A${t.index} · ${t.name}`}</option>)}
            </Dropdown>
          )}
          {p.onTimeline && <button className="mini" disabled={!!p.busy} onClick={() => p.onTimeline?.(track, true)}
            title="Resolve renders the timeline's sound once; the wave follows it"><Icon name="film" />Timeline audio</button>}
          <label className={'mini filebtn' + (p.busy ? ' off' : '')} title="A sound file; it starts at the start of the timeline (change it in the wave's settings)">
            <Icon name="upload" />Audio file…
            <input type="file" accept="audio/*,video/*" hidden disabled={!!p.busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onFile(f); e.target.value = '' }} />
          </label>
        </span>
      </div>
      <div className="libtop"><div className="chips">
        {LEVELS.map((l) => (
          <button key={l} className={l === bin ? 'on' : ''} onClick={() => setBin(l)}>{l}
            <span>{l === 'All' ? WAVE_STYLES.length : WAVE_STYLES.filter((s) => s.level === l).length}</span></button>
        ))}
        <i className="sep" />
        {WAVE_GROUPS.map((g) => (
          <button key={g} className={isLevel && g === group ? 'on' : ''}
            onClick={() => { if (!isLevel) { setBin('All'); setGroup(g) } else setGroup(g === group ? null : g) }}
            title={isLevel && g === group ? 'Show every type' : `Only ${g.toLowerCase()} styles`}>{g}
            <span>{ofLevel.filter((s) => s.group === g).length}</span></button>
        ))}
        <i className="sep" />
        {BINS.map((b) => (
          <button key={b} className={b === bin ? 'on' : ''} onClick={() => setBin(b)}>{b}
            <span>{b === 'Recent' ? k.recent.length : b === 'Favourites' ? k.favs.length : k.saved.length}</span></button>
        ))}
      </div></div>
      <div className={'wtiles' + (darkLook(p.look) && bin !== 'Saved' ? ' lite' : '')}>
        {tiles.map((t, i) => (
          <button key={t.key} className={'wtile' + (t.on ? ' on' : '') + (t.saved && darkLook(t.look) ? ' lite' : '')}
            onClick={() => {
              if (t.saved) p.onLook(t.look)
              else if (t.style) { noteRecent(t.style); p.onStyle(t.style) }
              p.onOpen()
            }}>
            <canvas ref={(el) => { refs.current[i] = el }} />
            {t.adv && <i className="lv">Advanced</i>}
            {t.style && (
              <span className={'pfav' + (k.favs.includes(t.style) ? ' on' : '')} role="button"
                title={k.favs.includes(t.style) ? 'Take out of Favourites' : 'Add to Favourites'}
                onClick={(e) => { e.stopPropagation(); toggleFav(t.style!) }}>{k.favs.includes(t.style) ? '★' : '☆'}</span>
            )}
            {t.saved && (
              <span className="pfav x" role="button" title="Remove this saved look"
                onClick={(e) => { e.stopPropagation(); removeSaved(t.saved!.id) }}>✕</span>
            )}
            <span className="nm"><b>{t.name}</b><small>{t.sub}</small></span>
          </button>
        ))}
        {!tiles.length && <p className="hint2 pad wempty">{empty}</p>}
      </div>
    </div>
  )
}

/** The wave's settings, in place of the Inspector while the wave is picked */
export function WaveInspector(p: {
  look: WaveLook
  onLook: (x: Partial<WaveLook>) => void
  data: WaveData | null
  onOn: (on: boolean) => void
  fps: number
  onStart: (ms: number) => void
  onRemove: () => void
  onClose: () => void
  /** Where the line is drawn (with Under caption, it follows the captions) */
  drawnY: number
}) {
  const L = p.look
  const [saving, setSaving] = useState<string | null>(null)
  const save = () => { const n = saving?.trim(); if (n) saveLook(n, L); setSaving(null) }
  const info = styleInfo(L.style)
  const name = info.name
  const setColor = (i: number) => (c: WaveLook['colors'][number]) => {
    const colors = [...L.colors] as WaveLook['colors']
    colors[i] = c
    p.onLook({ colors })
  }
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return (
    <aside className="insp">
      <div className="whead">
        <span className="wic"><Icon name="wave" size={17} /></span>
        <span className="wt"><b>Audio wave</b><small>{name}{p.data ? ` · follows ${p.data.src.name}` : ' · no sound yet'}</small></span>
        <button className="mini" onClick={() => setSaving(saving === null ? name : null)}
          title="Keep this look (style, colours, size, reaction) under a name; it shows in the library's Saved"><Icon name="download" />Save style</button>
        <button className="mini" onClick={p.onClose} title="Back to the captions' settings (Esc)">Captions</button>
      </div>
      {saving !== null && (
        <div className="wsave">
          <input autoFocus value={saving} maxLength={40} placeholder="Name of the look" onChange={(e) => setSaving(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { e.stopPropagation(); setSaving(null) } }} />
          <button className="mini on" disabled={!saving.trim()} onClick={save}>Save</button>
          <button className="mini" onClick={() => setSaving(null)}>Cancel</button>
        </div>
      )}
      <div className="ipane">
        {!p.data && <p className="hint2 pad">Add the sound in the library's Audio wave tab: the timeline's own sound, or a file.</p>}
        {p.data && (
          <Section title="In Resolve" right={<Toggle on={p.data.on} onChange={p.onOn}>Send with the captions</Toggle>}>
            <div className="irow wide"><span>Starts at</span>
              <span className="wstart"><b>{timecode(p.data.startMs, p.fps)}</b>
                <button className="mini" onClick={() => p.onStart(clock.get())} title="The sound starts where the playhead is">At playhead</button>
                <button className="mini" onClick={() => p.onStart(0)} title="The sound starts with the timeline">At start</button>
              </span><i className="rst" /></div>
            <div className="irow wide"><span /><span><button className="mini" onClick={p.onRemove}><Icon name="trash" />Remove the wave</button></span><i className="rst" /></div>
          </Section>
        )}
        <Section title="Style">
          <div className="irow wide"><span>Look</span>
            <Dropdown value={L.style} onChange={(v) => { noteRecent(v as WaveStyle); p.onLook({ style: v as WaveStyle }) }}>
              {WAVE_GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {WAVE_STYLES.filter((s) => s.group === g).map((s) => <option key={s.id} value={s.id}>{s.name}{s.level === 'Advanced' ? ' ✦' : ''}</option>)}
                </optgroup>
              ))}
            </Dropdown><i className="rst" /></div>
          {info.shape && (
            <Seg label="Shape" value={L.shape} opts={[['mirror', 'Mirror'], ['top', 'Top only'], ['bottom', 'Bottom']]} onChange={(v) => p.onLook({ shape: v })} />
          )}
        </Section>
        <Section title="Colour" right={
          <span className="wmono">
            <button className="mini" onClick={() => p.onLook({ colors: DEFAULT_WAVE.colors, line: L.line === 'off' ? 'off' : DEFAULT_WAVE.line })}
              title="Back to the wave's own colours: pink, blue and green"><i className="tri" />Colour</button>
            <button className="mini" onClick={() => p.onLook({ colors: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], line: L.line === 'off' ? 'off' : 'white' })}
              title="The whole wave white"><i style={{ background: '#fff' }} />White</button>
            <button className="mini" onClick={() => p.onLook({ colors: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], line: L.line === 'off' ? 'off' : 'black' })}
              title="The whole wave black, for bright videos"><i style={{ background: '#000' }} />Black</button>
          </span>}>
          <Color label="Low" value={L.colors[0]} onChange={setColor(0)} />
          <Color label="Middle" value={L.colors[1]} onChange={setColor(1)} />
          <Color label="High" value={L.colors[2]} onChange={setColor(2)} />
          {info.base && <Seg label="Line" value={L.line} opts={[['white', 'White'], ['black', 'Black'], ['color', 'Colour'], ['off', 'Off']]} onChange={(v) => p.onLook({ line: v })} />}
          <Slider label="Opacity" value={L.opacity} min={0.05} max={1} step={0.01} fmt={pct} onChange={(v) => p.onLook({ opacity: v })} />
          <Slider label="Glow" value={L.glow} min={0} max={1.5} step={0.01} fmt={pct} onChange={(v) => p.onLook({ glow: v })} />
        </Section>
        <Section title="Size">
          <Slider label="Height" value={L.height} min={0.01} max={0.25} step={0.005} fmt={pct} onChange={(v) => p.onLook({ height: v })} />
          <Slider label="Width" value={L.width} min={0.2} max={1} step={0.01} fmt={pct} onChange={(v) => p.onLook({ width: v })} />
          <Slider label="Thickness" value={L.thickness} min={0} max={12} step={0.5} onChange={(v) => p.onLook({ thickness: v })} />
        </Section>
        <Section title="Position">
          <Slider label="Y" value={p.drawnY} min={0.03} max={0.97} step={0.005} fmt={pct} onChange={(v) => p.onLook({ y: v, snap: 'free' })} />
          <Seg label="Place" value={L.snap === 'caption' ? 'cap' : L.y < 0.3 ? 'top' : L.y > 0.62 ? 'low' : 'mid'}
            opts={[['top', 'Top'], ['mid', 'Middle'], ['low', 'Lower'], ['cap', 'Under caption']]}
            onChange={(v) => p.onLook(v === 'cap' ? { snap: 'caption' } : { snap: 'free', y: v === 'top' ? 0.2 : v === 'mid' ? 0.5 : 0.72 })} />
          {L.snap === 'caption' && <p className="hint2 pad">The wave sits just under the captions and moves with them when you change their place or size.</p>}
        </Section>
        <Section title="Start and end">
          <Slider label="Fade" value={L.fade} min={0} max={2} step={0.05} fmt={(v) => (v < 0.01 ? 'Off' : `${v.toFixed(2)} s`)} onChange={(v) => p.onLook({ fade: v })} />
        </Section>
        <Section title="Reaction" right="how it follows the sound">
          <Slider label="Sensitivity" value={L.sensitivity} min={0.2} max={3} step={0.05} onChange={(v) => p.onLook({ sensitivity: v })} />
          <Slider label="Smooth" value={L.smooth} min={0} max={0.95} step={0.01} onChange={(v) => p.onLook({ smooth: v })} />
          <Slider label="Noise gate" value={L.gate} min={0} max={0.5} step={0.01} fmt={(v) => (v < 0.005 ? 'Off' : pct(v))} onChange={(v) => p.onLook({ gate: v })} />
          <p className="hint2 pad">Noise gate: sounds quieter than this stay still, like room noise or soft music under a voice.</p>
          <Seg label="Silence" value={L.silence} opts={[['line', 'Thin line'], ['hide', 'Hide']]} onChange={(v) => p.onLook({ silence: v })} />
        </Section>
      </div>
    </aside>
  )
}
