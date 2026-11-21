import { analyze, bandsAt, envFromText, smoothEnv, styleInfo, type Envelope, type WaveLook, type WaveStyle } from '@core/wave'
import type { Rgb } from '@core/look'

// Draws the audio wave on a canvas: the preview, the library's cards, and every frame the
// app makes for Resolve (render.tsx) all call drawWave, so they show the same wave.

const css = (c: Rgb, a = 1) => `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${a})`

/** A fixed number 0–1 for each bar, so bars differ from each other the same way every frame */
const jitter = (i: number) => { const v = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return v - Math.floor(v) }

/** One soft hump along the line, mirrored or on one side */
function hump(g: CanvasRenderingContext2D, cx: number, spread: number, amp: number, cy: number, shape: WaveLook['shape']) {
  if (amp < 0.3) return
  const x0 = cx - spread * 3
  const x1 = cx + spread * 3
  const step = Math.max(1, spread / 12)
  const up = shape !== 'bottom'
  const down = shape !== 'top'
  g.beginPath()
  g.moveTo(x0, cy)
  for (let x = x0; x <= x1; x += step) g.lineTo(x, cy - (up ? amp * Math.exp(-(((x - cx) / spread) ** 2)) : 0))
  for (let x = x1; x >= x0; x -= step) g.lineTo(x, cy + (down ? amp * Math.exp(-(((x - cx) / spread) ** 2)) : 0))
  g.closePath()
  g.fill()
}

const TAU = Math.PI * 2
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
/** A colour along low → middle → high (0–1) */
const mixRgb = (C: WaveLook['colors'], p: number): Rgb => {
  const q = clamp01(p)
  const [a, c, k] = q < 0.5 ? [C[0], C[1], q * 2] : [C[1], C[2], (q - 0.5) * 2]
  return [lerp(a[0], c[0], k), lerp(a[1], c[1], k), lerp(a[2], c[2], k)]
}
/** A slow wobble 0–1 of its own for each bar, so neighbours do not move together */
const wob = (i: number, t: number) => 0.5 + 0.5 * Math.sin(t * (1.7 + jitter(i) * 2.6) + jitter(i + 31) * TAU)
/** The sound at a point from low (0) to high (1) */
const spec = (b: readonly number[], p: number) => (p < 0.5 ? lerp(b[0]!, b[1]!, p * 2) : lerp(b[1]!, b[2]!, (p - 0.5) * 2))
const loud = (b: readonly number[]) => Math.max(b[0]!, b[1]!, b[2]!)

/** Everything a style needs to draw one moment */
interface Ctx {
  g: CanvasRenderingContext2D
  W: number
  H: number
  /** The three parts now, with the sensitivity (0–1) */
  b: number[]
  level: number
  /** One pixel of a 1080-pixel frame */
  u: number
  ww: number
  x0: number
  cx: number
  cy: number
  amp: number
  C: WaveLook['colors']
  thick: number
  t: number
  look: WaveLook
  /** The three parts `ago` seconds before now */
  past: (ago: number) => number[]
  /** How much of the wave shows (fades out in silence when Silence is Hide) */
  A: number
  /** Dark colours (black) can't add light: they are laid on top instead of glowing */
  blend: GlobalCompositeOperation
  /** White for bright colours, black for dark ones: cores, rims and unlit dots */
  ink: string
}

/** Top and length of a bar of height h at the line, for the shape */
const span = (K: Ctx, h: number): [number, number] =>
  [K.look.shape === 'bottom' ? K.cy : K.cy - h, K.look.shape === 'mirror' ? h * 2 : h]

/** A voice-like bar height: the middle reaches highest, each bar moves on its own */
const voiceBar = (K: Ctx, i: number, n: number) => {
  const q = (i + 0.5) / n
  return spec(K.b, Math.abs(2 * q - 1)) * (0.55 + 0.45 * wob(i, K.t)) * (0.4 + 0.6 * Math.sin(Math.PI * q))
}

const alpha = (K: Ctx, a: number) => { K.g.globalAlpha = K.A * a }

function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath()
  g.arc(x, y, Math.max(0.1, r), 0, TAU)
  g.fill()
}

// ── Glow ──

function glow(K: Ctx) {
  const { g, C, b, t, ww, x0, amp, cy, look } = K
  const style = look.style
  g.globalCompositeOperation = K.blend
  alpha(K, style === 'siri' ? 0.78 : style === 'soft' ? 0.5 : 0.42)
  C.forEach((col, i) => {
    g.fillStyle = css(col)
    if (style === 'aura') {
      const cx = x0 + ww * (0.5 + 0.12 * Math.sin(t * 0.5 + i * 2.1))
      hump(g, cx, ww * (0.16 + 0.03 * i), amp * b[i]! * 1.25, cy, look.shape)
      return
    }
    for (let k = 0; k < 3; k++) {
      const drift = (Math.sin((i + 1) * 3.1 + k * 2.2 + t * 0.6) + 1) / 2
      const cx = x0 + ww * (0.18 + 0.64 * drift)
      const spread = ww * (style === 'soft' ? 0.07 + 0.03 * k : 0.045 + 0.035 * ((k + i + 1) % 3))
      const pulse = 0.55 + 0.45 * Math.sin(t * 2.3 + k * 1.7 + i)
      hump(g, cx, spread, amp * b[i]! * pulse, cy, look.shape)
    }
  })
}

/** Soft upright streaks of light, like northern lights over the line */
function aurora(K: Ctx) {
  const { g, C, t, ww, x0, amp, cy, look } = K
  const n = 26
  const bw = ww / n
  g.globalCompositeOperation = K.blend
  for (let i = 0; i < n; i++) {
    const q = (i + 0.5) / n
    const drift = Math.sin(t * 0.4 + i * 0.5)
    const v = spec(K.b, Math.abs(2 * q - 1)) * (0.5 + 0.5 * wob(i, t * 0.6)) * (0.35 + 0.65 * Math.sin(Math.PI * q))
    const h = amp * 2.2 * v
    if (h < 1) continue
    const col = mixRgb(C, q + 0.15 * drift)
    const xc = x0 + (i + 0.5) * bw + drift * bw * 0.3
    const w = bw * 0.95
    const streak = (dir: number, len: number, a: number) => {
      g.save()
      g.translate(xc, cy)
      g.scale(w, len * dir)
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1)
      grad.addColorStop(0, css(col, a))
      grad.addColorStop(0.5, css(col, a * 0.45))
      grad.addColorStop(1, css(col, 0))
      g.fillStyle = grad
      g.fillRect(-1, 0, 2, 1)
      g.restore()
    }
    alpha(K, 1)
    if (look.shape !== 'bottom') streak(-1, h, 0.75)
    if (look.shape !== 'top') streak(1, look.shape === 'mirror' ? h * 0.6 : h, look.shape === 'mirror' ? 0.45 : 0.75)
  }
}

// ── Bars ──

function bars(K: Ctx) {
  const { g, C, t, ww, x0, amp, thick, look, b } = K
  const style = look.style
  const n = style === 'pill' ? 18 : 34
  const bw = ww / n
  for (let i = 0; i < n; i++) {
    // The middle bars reach highest, as a voice wave does
    const centre = Math.sin((Math.PI * (i + 0.5)) / n)
    const v = b[i % 3]! * (0.45 + 0.55 * jitter(i)) * (0.75 + 0.25 * Math.sin(t * 3 + i * 0.9)) * (0.4 + 0.6 * centre)
    const h = Math.max(thick / 2, amp * v)
    const w = bw * (style === 'pill' ? 0.55 : 0.6)
    const x = x0 + i * bw + (bw - w) / 2
    const [top, len] = span(K, h)
    g.fillStyle = css(C[i % 3]!)
    g.beginPath()
    if (style === 'pill') g.roundRect(x, top, w, len, w / 2)
    else g.rect(x, top, w, len)
    g.fill()
  }
}

/** Many hairline bars, coloured low to high across */
function thinBars(K: Ctx) {
  const { g, C, ww, x0, amp, thick } = K
  const n = 72
  const bw = ww / n
  const w = Math.max(1, Math.min(bw * 0.45, thick * 1.2))
  for (let i = 0; i < n; i++) {
    const h = Math.max(w / 2, amp * voiceBar(K, i, n))
    const [top, len] = span(K, h)
    g.fillStyle = css(mixRgb(C, (i + 0.5) / n))
    g.beginPath()
    g.roundRect(x0 + i * bw + (bw - w) / 2, top, w, len, w / 2)
    g.fill()
  }
}

/** An equaliser: low sounds on the left, high on the right */
function spectrum(K: Ctx) {
  const { g, C, t, ww, x0, amp, thick } = K
  const n = 40
  const bw = ww / n
  const w = bw * 0.7
  for (let i = 0; i < n; i++) {
    const q = (i + 0.5) / n
    const v = spec(K.b, q) * (0.6 + 0.4 * wob(i, t)) * (0.7 + 0.3 * Math.sin(Math.PI * q))
    const h = Math.max(thick / 2, amp * v)
    const [top, len] = span(K, h)
    g.fillStyle = css(mixRgb(C, q))
    g.beginPath()
    g.roundRect(x0 + i * bw + (bw - w) / 2, top, w, len, w * 0.2)
    g.fill()
  }
}

/** A stereo's LED meter: columns of lit blocks, the unlit ones faint */
function blocks(K: Ctx) {
  const { g, C, ww, x0, amp, cy, look } = K
  const n = 32
  const bw = ww / n
  const segs = Math.max(4, Math.min(14, Math.round(amp / (bw * 0.6))))
  const sh = amp / segs
  const s = bw * 0.72
  const bh = sh * 0.7
  const up = look.shape !== 'bottom'
  const down = look.shape !== 'top'
  for (let i = 0; i < n; i++) {
    const lit = voiceBar(K, i, n) * segs
    const x = x0 + i * bw + (bw - s) / 2
    for (let k = 0; k < segs; k++) {
      const on = k < lit
      g.fillStyle = on ? css(mixRgb(C, k / (segs - 1))) : K.ink
      alpha(K, on ? Math.min(1, lit - k + 0.35) : 0.08)
      const d = (sh - bh) / 2 + k * sh
      g.beginPath()
      if (up) g.roundRect(x, cy - d - bh, s, bh, bh * 0.25)
      if (down) g.roundRect(x, cy + d, s, bh, bh * 0.25)
      g.fill()
    }
  }
}

/** The last few seconds as bars moving left, like a phone's voice recorder */
function scrollBars(K: Ctx) {
  const { g, C, ww, x0, amp } = K
  const n = 56
  const dt = 0.06
  const bw = ww / n
  const w = bw * 0.5
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1)
    const h = Math.max(w / 2, amp * loud(K.past((n - 1 - i) * dt)))
    const [top, len] = span(K, h)
    alpha(K, 0.25 + 0.75 * p)
    g.fillStyle = css(mixRgb(C, p))
    g.beginPath()
    g.roundRect(x0 + i * bw + (bw - w) / 2, top, w, len, w / 2)
    g.fill()
  }
}

/** Rounded bars filled low → high colour, a soft glow behind and a shine on the side */
function glassBars(K: Ctx) {
  const { g, C, ww, x0, amp, cy, look } = K
  const n = 26
  const bw = ww / n
  const w = bw * 0.62
  for (let i = 0; i < n; i++) {
    const h = Math.max(w / 2, amp * voiceBar(K, i, n))
    const [top, len] = span(K, h)
    const x = x0 + i * bw + (bw - w) / 2
    const grad = g.createLinearGradient(0, top, 0, top + len)
    if (look.shape === 'mirror') {
      grad.addColorStop(0, css(C[2]))
      grad.addColorStop(0.5, css(C[0]))
      grad.addColorStop(1, css(C[2]))
    } else {
      const [a, c] = look.shape === 'top' ? [C[2], C[0]] : [C[0], C[2]]
      grad.addColorStop(0, css(a))
      grad.addColorStop(1, css(c))
    }
    g.globalCompositeOperation = K.blend
    alpha(K, 0.16)
    g.fillStyle = grad
    g.beginPath()
    g.roundRect(x - w * 0.45, top - w * 0.3, w * 1.9, len + w * 0.6, w)
    g.fill()
    g.globalCompositeOperation = 'source-over'
    alpha(K, 1)
    g.beginPath()
    g.roundRect(x, top, w, len, w / 2)
    g.fill()
    alpha(K, 0.28)
    g.fillStyle = '#fff'
    g.beginPath()
    g.roundRect(x + w * 0.16, top + w * 0.25, w * 0.2, Math.max(0, len - w * 0.5), w * 0.1)
    g.fill()
    // A faint reflection under bars that only go up
    if (look.shape === 'top') {
      const rg = g.createLinearGradient(0, cy, 0, cy + len * 0.45)
      rg.addColorStop(0, css(C[0], 0.3))
      rg.addColorStop(1, css(C[0], 0))
      alpha(K, 1)
      g.fillStyle = rg
      g.beginPath()
      g.roundRect(x, cy + 2 * K.u, w, len * 0.45, w / 2)
      g.fill()
    }
  }
}

// ── Lines ──

function lines(K: Ctx) {
  const { g, C, t, ww, x0, amp, cy, thick, look, b } = K
  const list = look.style === 'line' ? [0] : [0, 1, 2]
  g.lineWidth = thick * 1.4
  for (const i of list) {
    const v = look.style === 'line' ? (b[0]! + b[1]! + b[2]!) / 2 : b[i]!
    g.strokeStyle = css(C[i]!)
    g.beginPath()
    for (let x = x0; x <= x0 + ww; x += Math.max(1, ww / 240)) {
      const p = (x - x0) / ww
      const y = cy + Math.sin(p * (12 + i * 3) + t * (4 + i)) * amp * Math.min(1, v) * Math.sin(Math.PI * p)
      if (x === x0) g.moveTo(x, y); else g.lineTo(x, y)
    }
    g.stroke()
  }
}

/** A path along the width: y(p) for p 0–1 */
function along(K: Ctx, y: (p: number) => number, steps = 240) {
  const path = new Path2D()
  for (let j = 0; j <= steps; j++) {
    const p = j / steps
    const x = K.x0 + K.ww * p
    if (j === 0) path.moveTo(x, y(p)); else path.lineTo(x, y(p))
  }
  return path
}

const across = (K: Ctx, a = 1) => {
  const grad = K.g.createLinearGradient(K.x0, 0, K.x0 + K.ww, 0)
  K.C.forEach((c, i) => grad.addColorStop(i / 2, css(c, a)))
  return grad
}

/** One smooth curve made of the three parts, a faint fill under it */
function smoothCurve(K: Ctx) {
  const { g, b, t, amp, cy, thick } = K
  const y = (p: number) => cy - amp * Math.sin(Math.PI * p) ** 2 * 1.3 *
    (b[0]! * Math.sin(p * 6.3 + t * 1.8) * 0.9 + b[1]! * Math.sin(p * 11 - t * 2.6 + 1) * 0.6 + b[2]! * Math.sin(p * 19 + t * 3.7 + 2) * 0.35)
  const path = along(K, y)
  const fill = new Path2D(path)
  fill.lineTo(K.x0 + K.ww, cy)
  fill.lineTo(K.x0, cy)
  fill.closePath()
  alpha(K, 0.2)
  g.fillStyle = across(K)
  g.fill(fill)
  alpha(K, 1)
  g.strokeStyle = across(K)
  g.lineWidth = thick * 1.6
  g.stroke(path)
}

/** Fine sine waves that swell in the middle: a bright one and fainter ones around it */
function classic(K: Ctx) {
  const { g, C, t, amp, cy, thick, level } = K
  const att = (x: number) => (4 / (4 + x ** 4)) ** 4
  const L = amp * 1.3 * level
  const set: [number, number, number][] = [[-0.5, 0.25, 2], [-0.2, 0.35, 0], [0.4, 0.45, 2], [0.65, 0.65, 0], [1, 1, 1]]
  for (const [k, a, ci] of set) {
    alpha(K, a)
    g.strokeStyle = css(C[ci]!)
    g.lineWidth = Math.max(1, thick * (k === 1 ? 1.5 : 0.8))
    g.stroke(along(K, (p) => { const x = p * 4 - 2; return cy + L * k * att(x) * Math.sin(6 * x - t * 6) }))
  }
}

/** A trace moving left, like a heart monitor: the last seconds of the sound */
function scope(K: Ctx) {
  const { g, C, t, amp, cy, thick } = K
  const win = 2.5
  const y = (p: number) => {
    const ago = (1 - p) * win
    const at = t - ago
    const v = K.past(ago)
    return cy - amp * 1.1 * (v[0]! * Math.sin(at * 17) * 0.8 + v[1]! * Math.sin(at * 29 + 1) * 0.45 + v[2]! * Math.sin(at * 43 + 2) * 0.25)
  }
  const grad = g.createLinearGradient(K.x0, 0, K.x0 + K.ww, 0)
  grad.addColorStop(0, css(C[1], 0))
  grad.addColorStop(0.6, css(C[1], 0.7))
  grad.addColorStop(1, css(C[2], 1))
  g.strokeStyle = grad
  g.lineWidth = thick * 1.3
  g.stroke(along(K, y, 360))
  const hx = K.x0 + K.ww
  const hy = y(1)
  g.globalCompositeOperation = K.blend
  g.fillStyle = css(C[2], 0.35)
  circle(g, hx, hy, thick * 4)
  g.fillStyle = K.ink
  circle(g, hx, hy, thick * 1.4)
}

/** Three lines with a wide soft glow and a white-hot core */
function neon(K: Ctx) {
  const { g, C, t, amp, cy, thick, b } = K
  g.globalCompositeOperation = K.blend
  for (let i = 0; i < 3; i++) {
    const path = along(K, (p) => cy + Math.sin(p * (10 + i * 3) + t * (3 + i)) * amp * b[i]! * Math.sin(Math.PI * p))
    const layers: [number, number, string][] = [[10, 0.12, css(C[i]!)], [4.5, 0.3, css(C[i]!)], [1.8, 0.95, css(C[i]!)], [0.7, 0.75, K.ink]]
    for (const [w, a, col] of layers) {
      alpha(K, a)
      g.strokeStyle = col
      g.lineWidth = Math.max(1, thick * w)
      g.stroke(path)
    }
  }
}

/** Many fine lines blending between two waves: a twisting ribbon of colour */
function ribbon(K: Ctx) {
  const { g, C, t, amp, cy, thick, b } = K
  const n = 18
  const v0 = b[0]! * 0.9 + b[1]! * 0.5
  const v1 = b[1]! * 0.6 + b[2]! * 0.7
  g.globalCompositeOperation = K.blend
  g.lineWidth = Math.max(1, thick * 0.6)
  for (let j = 0; j < n; j++) {
    const s = j / (n - 1)
    alpha(K, 0.55)
    g.strokeStyle = css(mixRgb(C, s))
    g.stroke(along(K, (p) => cy + amp * 1.2 * Math.sin(Math.PI * p) ** 1.6 *
      (v0 * Math.sin(p * 8 + t * 2.2) * (1 - s) + v1 * Math.sin(p * 6.5 - t * 1.7 + 1.3) * s + 0.25 * (s - 0.5) * v0 * Math.sin(p * 3 + t))))
  }
}

// ── Circles ──

function ring(K: Ctx) {
  const { g, C, t, amp, cy, cx, thick, u, b } = K
  const R = Math.max(8 * u, amp * 0.9)
  g.lineWidth = thick * 1.2
  g.globalCompositeOperation = K.blend
  C.forEach((col, i) => {
    g.strokeStyle = css(col, 0.9)
    g.beginPath()
    for (let a = 0; a <= TAU + 0.001; a += Math.PI / 90) {
      const r = R + Math.sin(a * 6 + t * 3 + i * 2) * amp * 0.45 * b[i]!
      const px = cx + Math.cos(a) * r
      const py = cy + Math.sin(a) * r
      if (a === 0) g.moveTo(px, py); else g.lineTo(px, py)
    }
    g.closePath()
    g.stroke()
  })
}

/** A disc that swells with the sound; rings of the moments before spread out behind it */
function pulse(K: Ctx) {
  const { g, C, amp, cx, cy, u, level } = K
  const R0 = Math.max(10 * u, amp * 0.45)
  for (let j = 3; j >= 1; j--) {
    const rr = R0 * (1 + 0.35 * loud(K.past(j * 0.12))) + j * R0 * 0.28 * (0.4 + 0.6 * level)
    alpha(K, 0.3 / j)
    g.fillStyle = css(C[j % 3]!)
    circle(g, cx, cy, rr)
  }
  const R = R0 * (1 + 0.35 * level)
  const grad = g.createRadialGradient(cx - R * 0.35, cy - R * 0.35, 0, cx, cy, R)
  grad.addColorStop(0, css(C[2]))
  grad.addColorStop(0.55, css(C[1]))
  grad.addColorStop(1, css(C[0]))
  alpha(K, 1)
  g.fillStyle = grad
  circle(g, cx, cy, R)
}

/** Dots round a circle, pushed out by the sound */
function dotRing(K: Ctx) {
  const { g, C, t, amp, cx, cy, u, thick } = K
  const n = 40
  const R = Math.max(12 * u, amp * 0.7)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2
    const q = 1 - Math.abs(1 - (2 * i) / n)
    const v = spec(K.b, q) * (0.55 + 0.45 * wob(i, t))
    const rr = R + v * amp * 0.5
    g.fillStyle = css(mixRgb(C, q))
    circle(g, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, Math.max(R * 0.035, thick * 1.1) * (1 + v * 1.8))
  }
}

/** A glass ball with coloured light moving inside it */
function orb(K: Ctx) {
  const { g, C, t, amp, cx, cy, u, thick, level, b } = K
  const R = Math.max(14 * u, amp * 0.75) * (1 + 0.18 * level)
  // The glow round it, brighter when loud
  const halo = g.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.9)
  halo.addColorStop(0, css(C[1], 0.35 * (0.3 + level)))
  halo.addColorStop(1, css(C[1], 0))
  alpha(K, 1)
  g.fillStyle = halo
  circle(g, cx, cy, R * 1.9)
  g.save()
  g.beginPath()
  g.arc(cx, cy, R, 0, TAU)
  g.clip()
  const base = g.createRadialGradient(cx, cy, 0, cx, cy, R)
  base.addColorStop(0, css(C[1], 0.25))
  base.addColorStop(1, css(C[0], 0.5))
  g.fillStyle = base
  g.fillRect(cx - R, cy - R, R * 2, R * 2)
  g.globalCompositeOperation = K.blend
  C.forEach((col, i) => {
    const bx = cx + Math.cos(t * (0.7 + i * 0.31) + i * 2.1) * R * 0.45
    const by = cy + Math.sin(t * (0.9 + i * 0.23) + i * 1.3) * R * 0.45
    const r = R * (0.55 + 0.5 * b[i]!)
    const grad = g.createRadialGradient(bx, by, 0, bx, by, r)
    grad.addColorStop(0, css(col, 0.9))
    grad.addColorStop(1, css(col, 0))
    g.fillStyle = grad
    g.fillRect(bx - r, by - r, r * 2, r * 2)
  })
  g.restore()
  g.globalCompositeOperation = 'source-over'
  alpha(K, 0.35)
  g.strokeStyle = K.ink
  g.lineWidth = Math.max(1, thick * 0.6)
  g.beginPath()
  g.arc(cx, cy, R, 0, TAU)
  g.stroke()
  alpha(K, 0.5)
  g.lineWidth = Math.max(1, thick)
  g.beginPath()
  g.arc(cx, cy, R * 0.82, Math.PI * 1.1, Math.PI * 1.45)
  g.stroke()
}

/** Bars standing out round a circle, low sounds at the top */
function radialBars(K: Ctx) {
  const { g, C, t, amp, cx, cy, u, thick } = K
  const n = 64
  const R = Math.max(12 * u, amp * 0.55)
  g.lineCap = 'round'
  g.lineWidth = Math.max(1.5 * u, Math.min(((TAU * R) / n) * 0.55, thick * 2.2))
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2
    const q = 1 - Math.abs(1 - (2 * i) / n)
    const v = spec(K.b, q) * (0.5 + 0.5 * wob(i, t))
    const len = 2 * u + v * amp * 0.8
    g.strokeStyle = css(mixRgb(C, q))
    g.beginPath()
    g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
    g.lineTo(cx + Math.cos(a) * (R + len), cy + Math.sin(a) * (R + len))
    g.stroke()
  }
  alpha(K, 0.5)
  g.strokeStyle = css(C[1])
  g.lineWidth = Math.max(1, thick * 0.5)
  g.beginPath()
  g.arc(cx, cy, R * 0.86, 0, TAU)
  g.stroke()
}

/** Rings that leave the middle every moment, as strong as the sound was then */
function ripple(K: Ctx) {
  const { g, C, t, amp, cx, cy, u, thick, level } = K
  const P = 0.32
  const n = 7
  const life = n * P
  const R0 = Math.max(8 * u, amp * 0.25)
  const phase = ((t % P) + P) % P
  for (let k = n - 1; k >= 0; k--) {
    const age = phase + k * P
    const f = age / life
    const s = loud(K.past(age))
    if (s < 0.02) continue
    const idx = Math.round((t - age) / P)
    alpha(K, s * (1 - f) ** 1.5)
    g.strokeStyle = css(C[((idx % 3) + 3) % 3]!)
    g.lineWidth = Math.max(1, thick * (1.6 - f))
    g.beginPath()
    g.arc(cx, cy, R0 + f * amp * 1.5, 0, TAU)
    g.stroke()
  }
  alpha(K, 1)
  g.fillStyle = css(mixRgb(C, level))
  circle(g, cx, cy, R0 * (0.5 + 0.5 * level))
}

// ── Dots ──

/** A row of dots that grow with the sound */
function dotRow(K: Ctx) {
  const { g, C, ww, x0, cy } = K
  const n = 26
  const bw = ww / n
  for (let i = 0; i < n; i++) {
    const v = voiceBar(K, i, n)
    g.fillStyle = css(mixRgb(C, (i + 0.5) / n))
    circle(g, x0 + (i + 0.5) * bw, cy, bw * (0.16 + 0.3 * v))
  }
}

/** Four round dots that stretch into pills as the voice moves them */
function bounce(K: Ctx) {
  const { g, C, t, ww, amp, cx, cy, u, look, b } = K
  const d = Math.max(10 * u, Math.min(ww / 9, amp * 0.5))
  const gap = d * 0.7
  const left = cx - (4 * d + 3 * gap) / 2
  const which = [0, 1, 2, 1]
  const cols = [C[0], C[1], C[2], C[0]]
  for (let k = 0; k < 4; k++) {
    const v = b[which[k]!]! * (0.75 + 0.25 * Math.sin(t * 5 + k * 1.3))
    const h = d + v * amp * 1.6
    const top = look.shape === 'mirror' ? cy - h / 2 : look.shape === 'top' ? cy + d / 2 - h : cy - d / 2
    g.fillStyle = css(cols[k]!)
    g.beginPath()
    g.roundRect(left + k * (d + gap), top, d, h, d / 2)
    g.fill()
  }
}

/** Sparks rising from the line where the sound is, as strong as it was when they left */
function particles(K: Ctx) {
  const { g, C, t, ww, x0, amp, cy, u, thick, look } = K
  const N = 170
  const L = 2.4
  g.globalCompositeOperation = K.blend
  for (let i = 0; i < N; i++) {
    const ph0 = jitter(i * 3 + 1)
    const c = Math.floor(t / L + ph0)
    const ph = t / L + ph0 - c
    const band = K.past(ph * L)[i % 3]!
    if (band < 0.03) continue
    const x = x0 + ww * (0.04 + 0.92 * jitter(i * 7 + c * 13.7)) + Math.sin(t * 1.5 + i) * ww * 0.012 * ph
    const dir = look.shape === 'top' ? -1 : look.shape === 'bottom' ? 1 : jitter(i * 5 + c) < 0.5 ? -1 : 1
    const y = cy + dir * ph * amp * (1.2 + 1.6 * jitter(i * 11 + c)) * (0.5 + 0.5 * band)
    const r = Math.max(1.5 * u, thick) * (0.7 + 1.6 * jitter(i * 17 + c)) * (1 - ph * 0.5)
    const a = Math.min(1, band * 1.5) * (1 - ph) * Math.min(1, ph * 8)
    g.fillStyle = css(C[i % 3]!)
    alpha(K, a * 0.3)
    circle(g, x, y, r * 3)
    alpha(K, a)
    circle(g, x, y, r)
  }
}

/** A grid of dots lit from the line out, like an LED sign */
function matrix(K: Ctx) {
  const { g, C, ww, x0, amp, cy, look } = K
  const n = 32
  const s = ww / n
  const rows = Math.max(2, Math.min(8, Math.round(amp / s)))
  const r = s * 0.28
  const from = look.shape === 'bottom' ? -rows : look.shape === 'top' ? 0 : -rows
  const to = look.shape === 'bottom' ? 0 : rows
  for (let i = 0; i < n; i++) {
    const lit = voiceBar(K, i, n) * rows
    const x = x0 + (i + 0.5) * s
    for (let k = from; k <= to; k++) {
      const d = Math.abs(k)
      const on = clamp01(lit - d + 1) * (lit > 0.05 ? 1 : 0)
      const y = cy - k * s
      if (on < 0.05) {
        alpha(K, 0.07)
        g.fillStyle = K.ink
        circle(g, x, y, r)
        continue
      }
      g.fillStyle = css(mixRgb(C, d / rows))
      alpha(K, 0.2 * on)
      circle(g, x, y, r * 2)
      alpha(K, on)
      circle(g, x, y, r)
    }
  }
}

// ── Shapes ──

/** Three soft hills, one for each part of the sound, glowing where they cross */
function hills(K: Ctx) {
  const { g, C, t, amp, cy, look, b } = K
  const up = look.shape !== 'bottom'
  const down = look.shape !== 'top'
  g.globalCompositeOperation = K.blend
  C.forEach((col, i) => {
    const h = (p: number) => {
      let v = 0
      for (let k = 0; k < 3; k++) {
        const pos = 0.2 + 0.6 * ((Math.sin(i * 2.3 + k * 1.9 + t * 0.25) + 1) / 2)
        const wdt = 0.08 + 0.05 * k
        v += Math.exp(-(((p - pos) / wdt) ** 2)) * (0.6 + 0.4 * Math.sin(t * 1.9 + k + i))
      }
      return amp * 1.1 * b[i]! * v * Math.sin(Math.PI * p)
    }
    const top = along(K, (p) => cy - (up ? h(p) : 0), 160)
    const shape = new Path2D(top)
    for (let j = 160; j >= 0; j--) shape.lineTo(K.x0 + K.ww * (j / 160), cy + (down ? h(j / 160) : 0))
    shape.closePath()
    const grad = g.createLinearGradient(0, cy - amp * 1.4, 0, cy + amp * 1.4)
    grad.addColorStop(0, css(col, up ? 0.9 : 0.25))
    grad.addColorStop(0.5, css(col, 0.25))
    grad.addColorStop(1, css(col, down ? 0.9 : 0.25))
    alpha(K, 0.8)
    g.fillStyle = grad
    g.fill(shape)
  })
}

/** The last seconds of the sound as one smooth shape moving left, like the clip in Resolve */
function history(K: Ctx) {
  const { g, C, amp, cy, thick, look } = K
  const win = 4
  const n = 160
  const up = look.shape !== 'bottom'
  const down = look.shape !== 'top'
  const hs: number[] = []
  for (let j = 0; j <= n; j++) hs.push(amp * 1.2 * loud(K.past((1 - j / n) * win)))
  const xAt = (j: number) => K.x0 + K.ww * (j / n)
  const edge = new Path2D()
  for (let j = 0; j <= n; j++) edge[j ? 'lineTo' : 'moveTo'](xAt(j), cy - (up ? hs[j]! : 0))
  const shape = new Path2D(edge)
  for (let j = n; j >= 0; j--) shape.lineTo(xAt(j), cy + (down ? hs[j]! : 0))
  shape.closePath()
  const grad = g.createLinearGradient(K.x0, 0, K.x0 + K.ww, 0)
  grad.addColorStop(0, css(C[0], 0))
  grad.addColorStop(0.5, css(C[1], 0.55))
  grad.addColorStop(1, css(C[2], 0.95))
  g.fillStyle = grad
  g.fill(shape)
  alpha(K, 0.55)
  g.strokeStyle = K.ink
  g.lineWidth = Math.max(1, thick * 0.6)
  g.stroke(edge)
  alpha(K, 1)
  g.fillStyle = css(C[2])
  circle(g, K.x0 + K.ww, cy, thick * 1.8)
}

/** Three soft shapes like drops of liquid, changing with the sound */
function blob(K: Ctx) {
  const { g, C, t, amp, cx, cy, u, level, b } = K
  const R = Math.max(14 * u, amp * 0.75) * (1 + 0.12 * level)
  g.globalCompositeOperation = K.blend
  C.forEach((col, i) => {
    g.beginPath()
    for (let s = 0; s <= 120; s++) {
      const a = (s / 120) * TAU
      const r = R * (1 + b[i]! * 0.35 * (Math.sin(3 * a + t * 1.3 + i * 2) * 0.6 + Math.sin(5 * a - t * 1.7 + i) * 0.4) + 0.08 * Math.sin(2 * a + t * 0.6 + i))
      const px = cx + Math.cos(a) * r
      const py = cy + Math.sin(a) * r
      if (s === 0) g.moveTo(px, py); else g.lineTo(px, py)
    }
    g.closePath()
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.4)
    grad.addColorStop(0, css(col, 0.55))
    grad.addColorStop(1, css(col, 0.9))
    alpha(K, 0.5)
    g.fillStyle = grad
    g.fill()
  })
}

const DRAW: Record<WaveStyle, (K: Ctx) => void> = {
  siri: glow, soft: glow, aura: glow, aurora,
  bars, pill: bars, thin: thinBars, spectrum, blocks, scroll: scrollBars, glassbars: glassBars,
  line: lines, multi: lines, smooth: smoothCurve, classic, scope, neon, ribbon,
  ring, pulse, dotring: dotRing, orb, radial: radialBars, ripple,
  dots: dotRow, bounce, particles, matrix,
  hills, history, blob,
}

/** Loudness after the sensitivity: straight up to 0.7, then bending softly towards 1 (no flat tops) */
const knee = (y: number) => (y <= 0.7 ? Math.max(0, y) : 0.7 + 0.3 * (1 - Math.exp(-(y - 0.7) / 0.3)))

/** A small canvas the glow is blurred on (blurring the full frame would be slow) */
let glowCv: HTMLCanvasElement | null = null

/** Soft light round everything drawn so far; for dark colours a soft shadow behind it */
function addGlow(g: CanvasRenderingContext2D, amount: number, dark: boolean) {
  if (amount <= 0.01 || typeof document === 'undefined') return
  const c = g.canvas as HTMLCanvasElement
  const sw = Math.max(1, Math.round(c.width / 6))
  const sh = Math.max(1, Math.round(c.height / 6))
  glowCv ??= document.createElement('canvas')
  if (glowCv.width !== sw || glowCv.height !== sh) { glowCv.width = sw; glowCv.height = sh }
  const s = glowCv.getContext('2d')
  if (!s) return
  const m = Math.min(sw, sh)
  s.clearRect(0, 0, sw, sh)
  s.globalCompositeOperation = 'lighter'
  // A close glow and a wide one
  s.filter = `blur(${Math.max(0.6, m / 140)}px)`
  s.drawImage(c, 0, 0, sw, sh)
  s.filter = `blur(${Math.max(1.5, m / 40)}px)`
  s.drawImage(c, 0, 0, sw, sh)
  s.filter = 'none'
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = dark ? 'destination-over' : 'lighter'
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  for (let a = amount; a > 0.01; a -= 1) {
    g.globalAlpha = Math.min(1, a) * 0.7
    g.drawImage(glowCv, 0, 0, c.width, c.height)
  }
  g.restore()
}

/**
 * The wave at one moment. at(sec): how loud the low, middle and high parts are (0–1, before
 * sensitivity) at a timeline time, so styles can show the moments before; t: the time now.
 * span: where the wave clip starts and ends (seconds), for its fade in and out.
 */
export function drawWave(g: CanvasRenderingContext2D, W: number, H: number, at: (sec: number) => readonly number[], t: number, look: WaveLook,
  span?: { start: number; end: number }) {
  g.clearRect(0, 0, W, H)
  const gate = Math.min(0.9, Math.max(0, look.gate ?? 0))
  const sens = (v: readonly number[]) => v.map((x) => knee((Math.max(0, x - gate) / (1 - gate)) * look.sensitivity))
  // Grows in at the start, fades out at the end
  const fd = look.fade ?? 0
  const k = span && fd > 0 ? clamp01(Math.min((t - span.start) / fd, (span.end - t) / fd)) : 1
  const ease = k * k * (3 - 2 * k)
  const show = ease * Math.min(1, Math.max(0, look.opacity ?? 1))
  if (show <= 0.001) return
  const b = sens(at(t)).map((x) => x * ease)
  const level = Math.max(...b)
  const u = Math.min(W, H) / 1080
  const ww = W * look.width
  const info = styleInfo(look.style)
  // Mostly dark colours: how bright the three are on average
  const dark = look.colors.reduce((s, c) => s + 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], 0) / 3 < 0.3
  // In silence the line stays, or fades out with the sound
  const fade = look.silence === 'hide' ? Math.min(1, level * 6) : 1
  const K: Ctx = {
    g, W, H, b, level, u, ww, x0: (W - ww) / 2, cx: W / 2, cy: H * look.y, amp: H * look.height,
    C: look.colors, thick: Math.max(1, look.thickness * u), t, look,
    past: (ago) => sens(at(t - ago)),
    A: (info.base ? 1 : fade) * show,
    blend: dark ? 'source-over' : 'lighter',
    ink: dark ? '#000' : '#fff',
  }
  g.save()
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.globalAlpha = K.A
  ;(DRAW[look.style] ?? glow)(K)
  g.restore()
  // The thin line the wave grows from
  if (look.line !== 'off' && info.base && fade > 0.01) {
    const { x0, cy, thick, C } = K
    const c = look.line === 'white' ? [255, 255, 255] : look.line === 'black' ? [0, 0, 0] : C[1].map((v) => Math.round(v * 255))
    const rgba = (a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a * fade * show})`
    const line = g.createLinearGradient(x0, 0, x0 + ww, 0)
    line.addColorStop(0, rgba(0))
    line.addColorStop(0.06, rgba(0.92))
    line.addColorStop(0.94, rgba(0.92))
    line.addColorStop(1, rgba(0))
    g.fillStyle = line
    g.fillRect(x0, cy - thick / 2, ww, thick)
  }
  addGlow(g, look.glow ?? 0, dark)
}

/** A made-up voice for cards and for a wave with no sound yet: syllables in phrases, with pauses */
export function sampleBands(t: number): [number, number, number] {
  const phrase = Math.sin(t * 0.7) > -0.55 ? 1 : 0.05
  const swell = Math.sin(t * 1.3) * 0.5 + 0.5
  const syl = Math.max(0, Math.sin(t * 9.1 + Math.sin(t * 2.3) * 2))
  return [
    phrase * syl * (0.5 + 0.5 * swell),
    phrase * Math.max(0, Math.sin(t * 12.7 + 1)) * (0.4 + 0.5 * (1 - swell)),
    phrase * Math.max(0, Math.sin(t * 15.3 + 2)) * 0.6 * swell,
  ]
}

/** An envelope smoothed once, for drawing it again and again */
export interface WaveSound { env: Envelope; sm: [Float32Array, Float32Array, Float32Array]; smooth: number }

export function waveSound(env: Envelope, smooth: number): WaveSound {
  return { env, sm: smoothEnv(env, smooth), smooth }
}

/** The wave's three parts at a timeline time (ms) for a sound starting at startMs */
export const bandsOf = (s: WaveSound, ms: number, startMs: number) => bandsAt(s.sm, s.env.rate, (ms - startMs) / 1000)

/** Reads a sound file (any the browser can play: wav, mp3, m4a, mp4…) into an envelope */
export async function readSound(bytes: ArrayBuffer): Promise<Envelope> {
  // An offline context decodes straight to one rate; 22050 Hz is plenty for loudness
  const ctx = new OfflineAudioContext(1, 1, 22050)
  const buf = await ctx.decodeAudioData(bytes)
  const n = buf.length
  const mono = new Float32Array(n)
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < n; i++) mono[i]! += d[i]! / buf.numberOfChannels
  }
  return analyze(mono, buf.sampleRate)
}

export { envFromText }
