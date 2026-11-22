import type { Look, Rgb } from './look.ts'

// The audio wave: a shape that moves with the sound, drawn by the app and placed in Resolve
// as one finished clip (like a drawn caption). The sound is read once into an envelope: how
// loud its low, middle and high parts are, 100 times a second. Everything after that (the
// preview, the frames for Resolve) draws from the envelope, so both show the same wave.

export type WaveStyle =
  | 'siri' | 'soft' | 'aura' | 'aurora'
  | 'bars' | 'pill' | 'thin' | 'spectrum' | 'blocks' | 'scroll' | 'glassbars' | 'spikes' | 'dashes' | 'echo'
  | 'line' | 'multi' | 'smooth' | 'classic' | 'scope' | 'neon' | 'ribbon'
  | 'ring' | 'pulse' | 'dotring' | 'orb' | 'radial' | 'ripple'
  | 'dots' | 'bounce' | 'particles' | 'matrix'
  | 'hills' | 'history' | 'blob'
  | 'beam' | 'capsule' | 'mirroreq' | 'mesh' | 'horizon' | 'bokeh' | 'orbit' | 'burst'

export type WaveGroup = 'Glow' | 'Bars' | 'Line' | 'Circle' | 'Dots' | 'Shape'
export const WAVE_GROUPS: WaveGroup[] = ['Glow', 'Bars', 'Line', 'Circle', 'Dots', 'Shape']

export interface WaveStyleInfo {
  id: WaveStyle
  name: string
  group: WaveGroup
  /** Simple: clean, one layer; Advanced: layered, glowing, or following the sound's past */
  level: 'Simple' | 'Advanced'
  /** Mirror / top only / bottom applies */
  shape: boolean
  /** Grows from the thin line (Line: white / colour / off applies) */
  base: boolean
}

const S = (id: WaveStyle, name: string, group: WaveGroup, level: WaveStyleInfo['level'], shape: boolean, base: boolean): WaveStyleInfo =>
  ({ id, name, group, level, shape, base })

export const WAVE_STYLES: WaveStyleInfo[] = [
  S('siri', 'Siri glow', 'Glow', 'Advanced', true, true),
  S('soft', 'Soft glow', 'Glow', 'Simple', true, true),
  S('aura', 'Aura', 'Glow', 'Advanced', true, true),
  S('aurora', 'Aurora', 'Glow', 'Advanced', true, true),
  S('beam', 'Light beam', 'Glow', 'Advanced', false, false),
  S('bars', 'Bars', 'Bars', 'Simple', true, true),
  S('pill', 'Pill bars', 'Bars', 'Simple', true, true),
  S('thin', 'Thin bars', 'Bars', 'Simple', true, true),
  S('spectrum', 'Spectrum', 'Bars', 'Simple', true, true),
  S('blocks', 'Studio meter', 'Bars', 'Advanced', true, false),
  S('scroll', 'Voice memo', 'Bars', 'Simple', true, false),
  S('glassbars', 'Glass bars', 'Bars', 'Advanced', true, false),
  S('spikes', 'Minimal spikes', 'Bars', 'Simple', true, false),
  S('dashes', 'Soft dashes', 'Bars', 'Simple', true, false),
  S('echo', 'Echo dashes', 'Bars', 'Advanced', true, false),
  S('mirroreq', 'Mirror EQ', 'Bars', 'Advanced', false, false),
  S('capsule', 'Frosted pill', 'Bars', 'Advanced', false, false),
  S('line', 'Line', 'Line', 'Simple', false, false),
  S('multi', 'Multi line', 'Line', 'Simple', false, false),
  S('smooth', 'Smooth curve', 'Line', 'Simple', false, false),
  S('classic', 'Thin waves', 'Line', 'Simple', false, false),
  S('scope', 'Heartbeat', 'Line', 'Simple', false, false),
  S('neon', 'Neon', 'Line', 'Advanced', false, false),
  S('ribbon', 'Silk ribbon', 'Line', 'Advanced', false, false),
  S('mesh', 'Silk mesh', 'Line', 'Advanced', false, false),
  S('ring', 'Ring', 'Circle', 'Simple', false, false),
  S('pulse', 'Pulse', 'Circle', 'Simple', false, false),
  S('dotring', 'Dot circle', 'Circle', 'Simple', false, false),
  S('orb', 'Orb', 'Circle', 'Advanced', false, false),
  S('radial', 'Radial bars', 'Circle', 'Advanced', false, false),
  S('ripple', 'Ripples', 'Circle', 'Advanced', false, false),
  S('orbit', 'Orbit', 'Circle', 'Advanced', false, false),
  S('burst', 'Sunburst', 'Circle', 'Advanced', false, false),
  S('dots', 'Dot row', 'Dots', 'Simple', false, false),
  S('bounce', 'Four dots', 'Dots', 'Simple', true, false),
  S('particles', 'Particles', 'Dots', 'Advanced', true, true),
  S('matrix', 'Dot matrix', 'Dots', 'Advanced', true, false),
  S('bokeh', 'Bokeh', 'Dots', 'Advanced', false, false),
  S('hills', 'Sound hills', 'Shape', 'Simple', true, true),
  S('history', 'Sound shape', 'Shape', 'Advanced', true, true),
  S('blob', 'Liquid blob', 'Shape', 'Advanced', false, false),
  S('horizon', 'Glow horizon', 'Shape', 'Advanced', true, true),
]

export const styleInfo = (id: WaveStyle): WaveStyleInfo => WAVE_STYLES.find((s) => s.id === id) ?? WAVE_STYLES[0]!

export interface WaveLook {
  style: WaveStyle
  /** One colour for each part of the sound: low, middle, high */
  colors: [Rgb, Rgb, Rgb]
  /** The thin line the wave grows from */
  line: 'white' | 'black' | 'color' | 'off'
  /** Both sides of the line, or one */
  shape: 'mirror' | 'top' | 'bottom'
  /** Tallest the wave gets above its line, as a share of the frame's height */
  height: number
  /** How wide the wave is, as a share of the frame's width */
  width: number
  /** Thickness of the line (and of line styles), in pixels of a 1080-pixel frame */
  thickness: number
  /** Where the line sits, as a share of the frame's height from the top */
  y: number
  /** How strongly it answers the sound */
  sensitivity: number
  /** 0: follows every sound at once; near 1: rises and falls slowly */
  smooth: number
  /** In silence: the thin line stays, or everything fades away */
  silence: 'line' | 'hide'
  /** Quiet below this (0–0.5 of the loud moments) counts as silence: room noise, soft music */
  gate: number
  /** Seconds the wave takes to grow in at its start and fade out at its end */
  fade: number
  /** How much of the wave shows, 0–1 */
  opacity: number
  /** Soft light round the wave (dark colours: a soft shadow), 0–1.5 */
  glow: number
  /** 'caption': the line sits just under the captions and follows them when they move (y is ignored) */
  snap: 'free' | 'caption'
}

export const DEFAULT_WAVE: WaveLook = {
  style: 'siri',
  colors: [[1, 0.31, 0.55], [0.31, 0.64, 1], [0.24, 0.86, 0.59]],
  line: 'white',
  shape: 'mirror',
  height: 0.08,
  width: 0.92,
  thickness: 2,
  y: 0.72,
  sensitivity: 1,
  smooth: 0.6,
  silence: 'line',
  gate: 0,
  fade: 0.3,
  opacity: 1,
  glow: 0.35,
  snap: 'free',
}

/**
 * Where the wave's line goes (share of the frame height from the top) to sit just under the
 * captions. aspect: frame width / height. The captions' height is estimated from their size and
 * lines (Text+ Size is a share of the frame width), enough to keep the wave clear of them.
 */
export function waveUnder(cap: Pick<Look, 'anchor' | 'y' | 'size' | 'lineSpacing' | 'lines'>, aspect: number, wave: Pick<WaveLook, 'height' | 'shape'>): number {
  const row = Math.floor(cap.anchor / 3)
  const lines = cap.lines === '1' ? 1 : 2
  const h = cap.size * (cap.lineSpacing || 1) * 1.15 * lines * aspect
  // The captions' lowest edge, from the bottom (as in look.ts centerOf: bottom row sits 0.16 up)
  const bottomUp = row === 2 ? 0.16 + cap.y : row === 1 ? 0.5 - h / 2 + cap.y : 0.9 - h + cap.y
  const line = 1 - bottomUp + 0.015 + (wave.shape === 'bottom' ? 0 : wave.height)
  return Math.min(0.97, Math.max(0.03, line))
}

/** Steps of the envelope per second */
export const ENV_RATE = 100

/** How loud each part of the sound is at each step (0–255): low, middle, high */
export interface Envelope {
  rate: number
  low: Uint8Array
  mid: Uint8Array
  high: Uint8Array
}

/** One-pole low-pass coefficient for a cut-off frequency */
const pole = (hz: number, sampleRate: number) => Math.exp((-2 * Math.PI * hz) / sampleRate)

/**
 * Reads mono sound into an envelope. The sound is split in three with simple filters (under
 * 250 Hz, 250 Hz–2 kHz, above 2 kHz); each part's loudness over each 10 ms is measured, then
 * scaled so the part's usual loud moments reach the top (a voice and a drum both fill the wave).
 */
export function analyze(pcm: Float32Array, sampleRate: number, rate = ENV_RATE): Envelope {
  const win = sampleRate / rate
  const steps = Math.max(1, Math.ceil(pcm.length / win))
  const sums = [new Float64Array(steps), new Float64Array(steps), new Float64Array(steps)]
  const counts = new Uint32Array(steps)
  const a1 = pole(250, sampleRate)
  const a2 = pole(2000, sampleRate)
  let lp1 = 0
  let lp2 = 0
  for (let i = 0; i < pcm.length; i++) {
    const x = pcm[i]!
    lp1 += (1 - a1) * (x - lp1)
    lp2 += (1 - a2) * (x - lp2)
    const s = Math.min(steps - 1, Math.floor(i / win))
    sums[0]![s]! += lp1 * lp1
    sums[1]![s]! += (lp2 - lp1) * (lp2 - lp1)
    sums[2]![s]! += (x - lp2) * (x - lp2)
    counts[s]!++
  }
  // The level loud moments reach: high in the sorted loud steps, so a single click does not set it
  const loudOf = (rms: Float64Array) => {
    const loud = Array.from(rms).filter((v) => v > 1e-4).sort((a, b) => a - b)
    return loud.length ? Math.max(1e-4, loud[Math.floor(loud.length * 0.97)]!) : 1e-4
  }
  const rmsOf = (sum: Float64Array) => {
    const rms = new Float64Array(steps)
    for (let s = 0; s < steps; s++) rms[s] = counts[s] ? Math.sqrt(sum[s]! / counts[s]!) : 0
    return rms
  }
  const all = new Float64Array(steps)
  for (let s = 0; s < steps; s++) all[s] = sums[0]![s]! + sums[1]![s]! + sums[2]![s]!
  const allRef = loudOf(rmsOf(all))
  const bands = sums.map((sum) => {
    const rms = rmsOf(sum)
    // Each part fills the wave by its own loud moments, but a part that is only a trace of
    // the whole sound (what the filters let through of the others) stays small
    const ref = Math.max(loudOf(rms), allRef * 0.15)
    const out = new Uint8Array(steps)
    for (let s = 0; s < steps; s++) {
      const v = rms[s]! / ref
      // Quieter than about -40 dB below the loud moments is silence. The usual loud moments sit
      // at 0.85, louder ones bend softly towards the top, so peaks keep their shape (no flat tops)
      const x = Math.pow(v, 0.7) * 0.85
      out[s] = v < 0.01 ? 0 : Math.round((x <= 0.7 ? x : 0.7 + 0.3 * (1 - Math.exp(-(x - 0.7) / 0.3))) * 255)
    }
    return out
  })
  return { rate, low: bands[0]!, mid: bands[1]!, high: bands[2]! }
}

/** The envelope's length in ms */
export const envMs = (env: Envelope) => (env.low.length * 1000) / env.rate

/**
 * The envelope as the wave follows it: each part rises quicker than it falls, both slower
 * as smooth goes up. 0–1 values, one array per part.
 */
export function smoothEnv(env: Envelope, smooth: number): [Float32Array, Float32Array, Float32Array] {
  const s = Math.min(0.97, Math.max(0, smooth))
  const up = 1 - 0.6 * s
  const down = 1 - 0.93 * s
  return [env.low, env.mid, env.high].map((band) => {
    const out = new Float32Array(band.length)
    let y = 0
    for (let i = 0; i < band.length; i++) {
      const x = band[i]! / 255
      y += (x > y ? up : down) * (x - y)
      out[i] = y
    }
    return out
  }) as [Float32Array, Float32Array, Float32Array]
}

/** The three parts at a moment (seconds into the sound), between steps in a straight line */
export function bandsAt(sm: readonly Float32Array[], rate: number, sec: number): [number, number, number] {
  const f = sec * rate
  const i = Math.floor(f)
  const k = f - i
  const at = (b: Float32Array) => {
    if (i < 0 || i >= b.length) return 0
    const a = b[i]!
    const c = i + 1 < b.length ? b[i + 1]! : a
    return a + (c - a) * k
  }
  return [at(sm[0]!), at(sm[1]!), at(sm[2]!)]
}

/** The loudest part at each of n points along the sound (0–1), for drawing it on the timeline */
export function peaksOf(env: Envelope, n: number): number[] {
  const len = env.low.length
  const out: number[] = []
  for (let p = 0; p < n; p++) {
    const a = Math.floor((p * len) / n)
    const b = Math.max(a + 1, Math.floor(((p + 1) * len) / n))
    let m = 0
    for (let i = a; i < b && i < len; i++) m = Math.max(m, env.low[i]!, env.mid[i]!, env.high[i]!)
    out.push(m / 255)
  }
  return out
}

// ── Keeping an envelope as text (localStorage, the render page) ──

const toB64 = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const fromB64 = (t: string) => {
  const s = atob(t)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** An envelope as text: its rate, then the three parts one after another */
export function envToText(env: Envelope): string {
  const all = new Uint8Array(env.low.length * 3)
  all.set(env.low, 0)
  all.set(env.mid, env.low.length)
  all.set(env.high, env.low.length * 2)
  return `${env.rate}:${toB64(all)}`
}

export function envFromText(t: string): Envelope | null {
  const m = /^(\d+):(.*)$/s.exec(t)
  if (!m) return null
  try {
    const all = fromB64(m[2]!)
    const n = Math.floor(all.length / 3)
    return { rate: Number(m[1]), low: all.slice(0, n), mid: all.slice(n, 2 * n), high: all.slice(2 * n, 3 * n) }
  } catch {
    return null
  }
}

/** The wave clip for Resolve: the look and the sound it follows, and where it sits */
export interface WaveClip {
  look: WaveLook
  /** envToText of the envelope */
  env: string
  /** Where the sound starts on the timeline (ms); the clip starts there */
  startMs: number
  endMs: number
}

/** Caption number the wave goes by in a job (the bridge's log names it) */
export const WAVE_N = 900000
