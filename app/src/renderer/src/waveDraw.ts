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
  /** The colours are mostly dark (black) */
  dark: boolean
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

/** A colour moved towards white by k (0–1) */
const lighten = (c: Rgb, k: number): Rgb => [lerp(c[0], 1, k), lerp(c[1], 1, k), lerp(c[2], 1, k)]
/** Soft at both ends of the width: 0 at the edges, 1 in the middle */
const tp = (p: number, k = 1) => Math.sin(Math.PI * clamp01(p)) ** k

/**
 * A line with light round it: a wide faint glow, a closer one, the line itself and (with
 * core) a thin white-hot middle. add: the line too adds light, so crossing lines brighten.
 */
function glowLine(K: Ctx, path: Path2D, style: string | CanvasGradient, w: number, core = true, add = false) {
  const { g } = K
  g.globalCompositeOperation = K.blend
  g.strokeStyle = style
  for (const [m, a] of [[7, 0.045], [3.6, 0.1], [1.9, 0.3]] as const) {
    alpha(K, a)
    g.lineWidth = w * m
    g.stroke(path)
  }
  if (!add) g.globalCompositeOperation = 'source-over'
  alpha(K, 1)
  g.lineWidth = w
  g.stroke(path)
  if (core) {
    g.globalCompositeOperation = K.blend
    alpha(K, 0.5)
    g.strokeStyle = K.ink
    g.lineWidth = Math.max(0.6, w * 0.32)
    g.stroke(path)
  }
  g.globalCompositeOperation = 'source-over'
  alpha(K, 1)
}

/** A colour wheel round a centre: low → middle → high and back, turning slowly */
const wheel = (K: Ctx, cx: number, cy: number, turn = 0) => {
  const grad = K.g.createConicGradient(turn - Math.PI / 2, cx, cy)
  grad.addColorStop(0, css(K.C[0]))
  grad.addColorStop(1 / 3, css(K.C[1]))
  grad.addColorStop(2 / 3, css(K.C[2]))
  grad.addColorStop(1, css(K.C[0]))
  return grad
}

/** Each value with its neighbours, so a row of bars reads as one smooth shape (ring: the ends meet) */
const smoothRow = (v: number[], ring = false) => v.map((x, i) => {
  const a = v[i - 1] ?? (ring ? v[v.length - 1]! : x)
  const c = v[i + 1] ?? (ring ? v[0]! : x)
  return 0.25 * a + 0.5 * x + 0.25 * c
})

/** A soft round light: full colour in the middle, gone at r */
function softDot(K: Ctx, x: number, y: number, r: number, col: Rgb, a: number) {
  if (r <= 0.2 || a <= 0.005) return
  const grad = K.g.createRadialGradient(x, y, 0, x, y, r)
  grad.addColorStop(0, css(col, a))
  grad.addColorStop(0.4, css(col, a * 0.45))
  grad.addColorStop(1, css(col, 0))
  K.g.fillStyle = grad
  K.g.fillRect(x - r, y - r, r * 2, r * 2)
}

/** A light stretched into an ellipse (w across, h up and down), brightest in the middle */
function streak(K: Ctx, x: number, y: number, w: number, h: number, col: Rgb, a: number) {
  if (w <= 0.2 || h <= 0.2 || a <= 0.005) return
  const { g } = K
  g.save()
  g.translate(x, y)
  g.scale(w, h)
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1)
  grad.addColorStop(0, css(col, a))
  grad.addColorStop(0.35, css(col, a * 0.5))
  grad.addColorStop(1, css(col, 0))
  g.fillStyle = grad
  g.fillRect(-1, -1, 2, 2)
  g.restore()
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

/**
 * Clean rounded bars shaped like a voice (tallest in the middle), each in its colour along
 * low → high, full at the line and lighter at the tip, with a soft glow behind. Pill bars:
 * fewer, wider capsules that rest as round dots.
 */
function bars(K: Ctx) {
  const { g, C, ww, x0, amp, u, look } = K
  const pill = look.style === 'pill'
  const n = pill ? 16 : 30
  const bw = ww / n
  const w = bw * (pill ? 0.6 : 0.46)
  const r = pill ? w / 2 : Math.min(w * 0.32, 6 * u)
  const rest = pill ? w : Math.max(2 * u, w * 0.55)
  for (let i = 0; i < n; i++) {
    const q = (i + 0.5) / n
    const h = rest / 2 + amp * 1.5 * voiceBar(K, i, n)
    const [top, len] = span(K, h)
    const x = x0 + i * bw + (bw - w) / 2
    const col = mixRgb(C, q)
    const tip = lighten(col, 0.22)
    const grad = g.createLinearGradient(0, top, 0, top + len)
    if (look.shape === 'mirror') { grad.addColorStop(0, css(tip)); grad.addColorStop(0.5, css(col)); grad.addColorStop(1, css(tip)) }
    else if (look.shape === 'top') { grad.addColorStop(0, css(tip)); grad.addColorStop(1, css(col)) }
    else { grad.addColorStop(0, css(col)); grad.addColorStop(1, css(tip)) }
    const grow = w * 0.35
    g.globalCompositeOperation = K.blend
    alpha(K, pill ? 0.08 : 0.12)
    g.fillStyle = css(col)
    g.beginPath()
    g.roundRect(x - grow, top - grow, w + grow * 2, len + grow * 2, r + grow)
    g.fill()
    g.globalCompositeOperation = 'source-over'
    alpha(K, 1)
    g.fillStyle = grad
    g.beginPath()
    g.roundRect(x, top, w, len, Math.min(r, len / 2))
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

/**
 * An equaliser: low sounds on the left, high on the right, as one smooth shape of slim
 * rounded bars, with a small cap on each that holds at the top and then falls.
 */
function spectrum(K: Ctx) {
  const { g, C, t, ww, x0, amp, cy, u, look, ink } = K
  const n = 40
  const bw = ww / n
  const w = bw * 0.58
  const row = (b: readonly number[], tt: number) => smoothRow(Array.from({ length: n }, (_, i) => {
    const q = (i + 0.5) / n
    return spec(b, q) * (0.3 + 0.7 * wob(i, tt)) * (0.45 + 0.55 * Math.sin(Math.PI * q))
  }))
  const now = row(K.b, t)
  const peak = [...now]
  for (let a = 0.06; a <= 0.84; a += 0.06) {
    const was = row(K.past(a), t - a)
    for (let i = 0; i < n; i++) peak[i] = Math.max(peak[i]!, was[i]! - 1.5 * a * a)
  }
  const rest = Math.max(1.5 * u, w * 0.5)
  const gap = 3 * u
  const capH = Math.max(1.5 * u, w * 0.22)
  for (let i = 0; i < n; i++) {
    const q = (i + 0.5) / n
    const col = mixRgb(C, q)
    const h = rest / 2 + amp * 2 * now[i]!
    const [top, len] = span(K, h)
    const x = x0 + i * bw + (bw - w) / 2
    g.globalCompositeOperation = K.blend
    alpha(K, 0.1)
    g.fillStyle = css(col)
    g.beginPath()
    g.roundRect(x - w * 0.35, top - w * 0.35, w * 1.7, len + w * 0.7, w)
    g.fill()
    g.globalCompositeOperation = 'source-over'
    alpha(K, 1)
    g.fillStyle = css(col)
    g.beginPath()
    g.roundRect(x, top, w, len, Math.min(w / 2, len / 2))
    g.fill()
    // The cap: up where the bar was lately, a little above it (none on bars at rest, and
    // none when mirrored, where caps on both sides read as dashed lines)
    const hp = Math.max(h, rest / 2 + amp * 2 * peak[i]!) + gap
    if (peak[i]! < 0.06 || look.shape === 'mirror') continue
    alpha(K, 0.7)
    g.fillStyle = ink
    if (look.shape !== 'bottom') { g.beginPath(); g.roundRect(x, cy - hp - capH, w, capH, capH / 2); g.fill() }
    if (look.shape !== 'top') { g.beginPath(); g.roundRect(x, cy + hp, w, capH, capH / 2); g.fill() }
  }
}

/** A column's height (0–1) for meters and glass bars: louder in the middle, each column with its own wobble */
const columnAt = (b: readonly number[], i: number, n: number, t: number) => {
  const d = Math.abs(2 * ((i + 0.5) / n) - 1)
  return Math.min(1, spec(b, d) * 1.2 * (0.35 + 0.65 * Math.cos(d * 1.3)) * (0.78 + 0.22 * Math.sin(t * 3 + i * 1.7)))
}

/**
 * A studio meter: wide columns of rounded blocks lit low → high colour with a soft glow, a white
 * peak cap that holds at the top and then falls, nearly invisible unlit blocks, and a faint
 * reflection under the line.
 */
function blocks(K: Ctx) {
  const { g, C, t, ww, x0, amp, cy, u, look, ink } = K
  const n = 18
  const segs = 9
  const bw = ww / n
  const s = bw * 0.72
  const total = amp * 1.7
  const sh = total / segs
  const bh = sh * 0.72
  const dir = look.shape === 'bottom' ? 1 : -1
  const r = Math.min(bh, s) * 0.22
  for (let i = 0; i < n; i++) {
    const lit = columnAt(K.b, i, n, t) * segs
    // The peak cap: the highest the column reached lately, falling faster the longer ago
    let peak = 0
    for (let a = 0; a <= 0.9; a += 0.05) peak = Math.max(peak, columnAt(K.past(a), i, n, t - a) - 1.6 * a * a)
    const x = x0 + i * bw + (bw - s) / 2
    for (let k = 0; k < segs; k++) {
      const on = clamp01(lit - k)
      const near = cy + dir * ((sh - bh) / 2 + k * sh)
      const y = dir < 0 ? near - bh : near
      const col = mixRgb(C, k / (segs - 1))
      if (on > 0) {
        g.globalCompositeOperation = K.blend
        alpha(K, 0.28 * on)
        g.fillStyle = css(col)
        g.beginPath()
        g.roundRect(x - 2.5 * u, y - 2.5 * u, s + 5 * u, bh + 5 * u, r * 1.6)
        g.fill()
        g.globalCompositeOperation = 'source-over'
        // Reflection under the line (when the meter stands up)
        if (look.shape === 'mirror') {
          alpha(K, 0.13 * on * (1 - k / segs))
          g.beginPath()
          g.roundRect(x, cy + 4 * u + k * sh * 0.55, s, bh * 0.5, r)
          g.fill()
        }
      }
      alpha(K, on > 0 ? 0.35 + 0.65 * on : 0.05)
      g.fillStyle = on > 0 ? css(col) : ink
      g.beginPath()
      g.roundRect(x, y, s, bh, r)
      g.fill()
    }
    const pk = Math.round(Math.max(lit, peak * segs))
    if (pk > 0) {
      alpha(K, 0.92)
      g.fillStyle = ink
      const near = cy + dir * (pk * sh + 3 * u)
      g.beginPath()
      g.roundRect(x, dir < 0 ? near - 2.6 * u : near, s, 2.6 * u, 1.3 * u)
      g.fill()
    }
  }
}

/**
 * A phone's voice recorder: a playhead in the middle, the sound that has played to its left in
 * colour, the sound still to come to its right in grey. The bars glide left, one slot at a time.
 */
function scrollBars(K: Ctx) {
  const { g, t, ww, x0, cx, amp, cy, u, C, dark, ink } = K
  const n = 56
  const gap = ww / n
  const w = Math.max(1.5 * u, gap * 0.45)
  const rate = 12.5 // bars a second
  const now = t * rate
  const first = Math.floor(now)
  const off = (now - first) * gap
  const bar = (x: number, v: number, col: string, a: number) => {
    if (a <= 0.01) return
    const [top, len] = span(K, Math.max(w / 2, amp * 1.25 * v))
    alpha(K, a)
    g.fillStyle = col
    g.beginPath()
    g.roundRect(x - w / 2, top, w, len, w / 2)
    g.fill()
  }
  const edge = (x: number) => clamp01(Math.min(x - x0, x0 + ww - x) / (ww * 0.12))
  const half = Math.ceil(n / 2) + 1
  for (let j = 0; j <= half; j++) {
    // Played: slot first - j sits j slots left of the playhead (and slides with it)
    const xp = cx - off - j * gap
    bar(xp, loud(K.past(t - (first - j) / rate)), css(mixRgb(C, 0.5)), 0.95 * edge(xp))
    // Still to come: grey
    const xn = cx - off + (j + 1) * gap
    bar(xn, loud(K.past(t - (first + j + 1) / rate)), dark ? 'rgba(40, 40, 48, 1)' : 'rgba(150, 155, 170, 1)', 0.34 * edge(xn))
  }
  // The playhead
  alpha(K, 0.95)
  g.fillStyle = ink
  g.fillRect(cx - 0.9 * u, cy - amp * 1.5, 1.8 * u, amp * 3)
  circle(g, cx, cy - amp * 1.5, 4 * u)
}

/** Wide glass capsules: low → high colour inside, a white shine and rim, a soft glow and a reflection */
function glassBars(K: Ctx) {
  const { g, C, t, ww, x0, amp, cy, u, look } = K
  const n = 11
  const bw = ww / n
  const w = bw * 0.5
  for (let i = 0; i < n; i++) {
    const v = columnAt(K.b, i, n, t) * (0.75 + 0.25 * jitter(i))
    const h = Math.max(w, amp * 1.9 * v)
    const x = x0 + i * bw + (bw - w) / 2
    const top = look.shape === 'mirror' ? cy - h / 2 : look.shape === 'top' ? cy - h : cy
    const grad = g.createLinearGradient(0, top, 0, top + h)
    if (look.shape === 'mirror') {
      grad.addColorStop(0, css(C[2])); grad.addColorStop(0.5, css(C[0])); grad.addColorStop(1, css(C[2]))
    } else {
      const [a, c] = look.shape === 'top' ? [C[2], C[0]] : [C[0], C[2]]
      grad.addColorStop(0, css(a)); grad.addColorStop(0.55, css(C[1])); grad.addColorStop(1, css(c))
    }
    // Soft glow: two wider, fainter capsules behind
    g.globalCompositeOperation = K.blend
    g.fillStyle = grad
    for (const [grow, a] of [[0.35, 0.12]] as const) {
      alpha(K, a)
      g.beginPath()
      g.roundRect(x - w * grow / 2, top - w * grow / 2, w * (1 + grow), h + w * grow, w)
      g.fill()
    }
    g.globalCompositeOperation = 'source-over'
    alpha(K, 1)
    g.beginPath()
    g.roundRect(x, top, w, h, w / 2)
    g.fill()
    // The shine down the left side, and a thin rim
    const shine = g.createLinearGradient(x, 0, x + w, 0)
    shine.addColorStop(0, 'rgba(255, 255, 255, 0.55)')
    shine.addColorStop(0.35, 'rgba(255, 255, 255, 0.08)')
    shine.addColorStop(1, 'rgba(255, 255, 255, 0)')
    g.fillStyle = shine
    g.beginPath()
    g.roundRect(x + w * 0.08, top + w * 0.12, w * 0.45, Math.max(0, h - w * 0.24), w / 3)
    g.fill()
    alpha(K, 0.35)
    g.strokeStyle = '#fff'
    g.lineWidth = Math.max(1, u)
    g.beginPath()
    g.roundRect(x + 0.5, top + 0.5, w - 1, h - 1, w / 2)
    g.stroke()
    // Reflection under bars that stand up
    if (look.shape === 'top') {
      const rg = g.createLinearGradient(0, cy + 4 * u, 0, cy + 4 * u + h * 0.5)
      rg.addColorStop(0, css(C[0], 0.28))
      rg.addColorStop(1, css(C[0], 0))
      alpha(K, 1)
      g.fillStyle = rg
      g.beginPath()
      g.roundRect(x, cy + 4 * u, w, h * 0.5, w / 2)
      g.fill()
    }
  }
}

// ── Dashes: a row of short rounded dashes that is always there, rising with the sound ──

/** Width of one dash and the height it rests at (its length in silence) */
function dashSize(K: Ctx, n: number) {
  const bw = K.ww / n
  // Thickness 2 (the default) gives dashes a little over a third of their spacing
  const w = Math.max(1.2 * K.u, Math.min(bw * 0.8, bw * 0.19 * Math.max(0.5, K.look.thickness)))
  return { bw, w, rest: w * 2.6 }
}

function dash(K: Ctx, x: number, w: number, h: number, col: Rgb) {
  const [top, len] = span(K, h / (K.look.shape === 'mirror' ? 2 : 1))
  K.g.fillStyle = css(col)
  K.g.beginPath()
  K.g.roundRect(x, top, w, len, w / 2)
  K.g.fill()
}

/**
 * A plain row of dashes with a few tall, thin spikes that jump up in the middle as the voice
 * speaks: clean and minimal. The spikes change place about ten times a second.
 */
function spikes(K: Ctx) {
  const { t, ww, x0, amp, C } = K
  const n = 84
  const { bw, w, rest } = dashSize(K, n)
  const step = t * 10
  const slot = Math.floor(step)
  const f = step - slot
  const mixT = f * f * (3 - 2 * f)
  for (let i = 0; i < n; i++) {
    const q = (i + 0.5) / n
    const d = (q - 0.5) / 0.5
    const near = Math.exp(-((d / 0.42) ** 2))
    const core = Math.exp(-((d / 0.22) ** 2))
    const v = spec(K.b, Math.abs(d))
    // The same random number for a bar until its slot changes, then a quick blend to the next
    const rnd = (s: number) => jitter(i * 7.31 + s * 13.17)
    const r = lerp(rnd(slot), rnd(slot + 1), mixT)
    const small = v * near * 0.22 * (0.35 + 0.65 * r)
    const spike = v * core * Math.pow(r, 7) * 1.9
    const h = rest + amp * 2 * (small + spike)
    dash(K, x0 + i * bw + (bw - w) / 2, w, h, mixRgb(C, q))
  }
}

/** Dashes that rise together into a smooth hill where the sound is loud */
function softDashes(K: Ctx) {
  const { ww, x0, amp, C } = K
  const n = 64
  const { bw, w, rest } = dashSize(K, n)
  for (let i = 0; i < n; i++) {
    const d = Math.abs(2 * ((i + 0.5) / n) - 1)
    // A hill in the middle; the ends stay near their resting length
    dash(K, x0 + i * bw + (bw - w) / 2, w, rest + amp * 2 * voiceBar(K, i, n) * Math.exp(-((d / 0.5) ** 2)), mixRgb(C, (i + 0.5) / n))
  }
}

/** Each loud moment leaves the middle and runs out to both ends along the dashes, fading as it goes */
function echoDashes(K: Ctx) {
  const { ww, x0, amp, C } = K
  const n = 84
  const { bw, w, rest } = dashSize(K, n)
  const speed = 0.55 // of the half width a second
  const life = 1 / speed
  const ages: number[] = []
  const lv: number[] = []
  for (let a = 0; a <= life; a += 0.04) { ages.push(a); lv.push(loud(K.past(a))) }
  for (let i = 0; i < n; i++) {
    const q = (i + 0.5) / n
    const d = Math.abs(2 * q - 1)
    let v = 0
    for (let k = 0; k < ages.length; k++) {
      const off = d - ages[k]! * speed
      if (off > -0.08 && off < 0.08) v = Math.max(v, lv[k]! * Math.exp(-((off / 0.035) ** 2)) * (1 - ages[k]! / life))
    }
    v = Math.max(v, K.level * Math.exp(-((d / 0.06) ** 2)))
    dash(K, x0 + i * bw + (bw - w) / 2, w, rest + amp * 2 * v * (0.75 + 0.25 * jitter(i)), mixRgb(C, q))
  }
}

// ── Lines ──

/**
 * Line: one smooth wave in colour across, soft at both ends, with light round it.
 * Multi line: three waves, one for each part of the sound, adding light where they cross.
 */
function lines(K: Ctx) {
  const { C, t, amp, cy, thick, look, b } = K
  if (look.style === 'line') {
    const v = Math.min(1, (b[0]! + b[1]! + b[2]!) / 1.8)
    const path = along(K, (p) => cy + amp * 1.1 * v * tp(p, 1.6) * (Math.sin(p * 11 + t * 3.2) * 0.75 + Math.sin(p * 5 - t * 1.7) * 0.25), 260)
    glowLine(K, path, across(K), thick * 1.3)
    return
  }
  for (let i = 0; i < 3; i++) {
    const path = along(K, (p) => cy + amp * 1.15 * b[i]! * tp(p, 1.8) * Math.sin(p * (7 + 3 * i) + t * (2.2 + 0.8 * i) + i * 2.1), 260)
    glowLine(K, path, css(C[i]!), thick * 1.1, false, true)
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

/** One heartbeat: a small bump, the sharp spike and a slow wave after it, as a monitor draws (x 0–1) */
const beat = (x: number) => 0.12 * Math.exp(-(((x - 0.15) / 0.035) ** 2)) - 0.14 * Math.exp(-(((x - 0.3) / 0.012) ** 2))
  + Math.exp(-(((x - 0.33) / 0.013) ** 2)) - 0.28 * Math.exp(-(((x - 0.36) / 0.014) ** 2)) + 0.22 * Math.exp(-(((x - 0.58) / 0.055) ** 2))

/**
 * A heart monitor: a glowing trace moving left, beating as tall as the sound was loud at that
 * moment, flat in silence. Its tail fades away and a bright dot leads it.
 */
function scope(K: Ctx) {
  const { g, C, t, amp, cy, thick } = K
  const win = 2.6
  const period = 0.8
  const y = (p: number) => {
    const ago = (1 - p) * win
    const at = t - ago
    const ph = ((at / period) % 1 + 1) % 1
    return cy - amp * 2 * loud(K.past(ago)) * beat(ph)
  }
  const grad = g.createLinearGradient(K.x0, 0, K.x0 + K.ww, 0)
  grad.addColorStop(0, css(C[0], 0))
  grad.addColorStop(0.35, css(C[0], 0.5))
  grad.addColorStop(0.75, css(C[1], 0.9))
  grad.addColorStop(1, css(C[2], 1))
  glowLine(K, along(K, y, 480), grad, thick * 1.2, false)
  const hx = K.x0 + K.ww
  const hy = y(1)
  g.globalCompositeOperation = K.blend
  softDot(K, hx, hy, thick * 9, C[2], 0.6)
  alpha(K, 1)
  g.fillStyle = K.ink
  circle(g, hx, hy, thick * 1.3)
  g.globalCompositeOperation = 'source-over'
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

/** A ring of light in a slow colour wheel, gently breathing out of round with the sound */
function ring(K: Ctx) {
  const { g, t, amp, cx, cy, u, thick, level, b, C } = K
  const R = Math.max(18 * u, amp * 1.15)
  const path = new Path2D()
  for (let s = 0; s <= 180; s++) {
    const a = (s / 180) * TAU
    const d = b[0]! * 0.5 * Math.sin(2 * a + t * 0.9) + b[1]! * 0.35 * Math.sin(3 * a - t * 1.3 + 1) + b[2]! * 0.25 * Math.sin(5 * a + t * 1.9 + 2)
    const r = R * (1 + 0.11 * d + 0.05 * level)
    const px = cx + Math.cos(a) * r
    const py = cy + Math.sin(a) * r
    if (s === 0) path.moveTo(px, py); else path.lineTo(px, py)
  }
  path.closePath()
  g.globalCompositeOperation = K.blend
  softDot(K, cx, cy, R * 1.05, C[1], 0.1 + 0.18 * level)
  glowLine(K, path, wheel(K, cx, cy, t * 0.25), thick * 1.3)
}

/** A glowing disc that swells with the sound, thin rings of the moments before round it */
function pulse(K: Ctx) {
  const { g, C, amp, cx, cy, u, thick, level } = K
  const R0 = Math.max(14 * u, amp * 0.5)
  const R = R0 * (1 + 0.28 * level)
  g.globalCompositeOperation = K.blend
  softDot(K, cx, cy, R * (2.4 + level), C[1], 0.18 + 0.25 * level)
  for (let j = 1; j <= 3; j++) {
    const rr = R + j * R0 * 0.3 * (0.35 + loud(K.past(j * 0.1)))
    alpha(K, 0.32 / j)
    g.strokeStyle = css(C[j % 3]!)
    g.lineWidth = Math.max(1, thick * 0.8)
    g.beginPath()
    g.arc(cx, cy, rr, 0, TAU)
    g.stroke()
  }
  g.globalCompositeOperation = 'source-over'
  const grad = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, 0, cx, cy, R)
  grad.addColorStop(0, css(lighten(C[2], 0.3)))
  grad.addColorStop(0.5, css(C[1]))
  grad.addColorStop(1, css(C[0]))
  alpha(K, 1)
  g.fillStyle = grad
  circle(g, cx, cy, R)
  alpha(K, 0.4)
  g.strokeStyle = K.ink
  g.lineWidth = Math.max(1, thick * 0.7)
  g.beginPath()
  g.arc(cx, cy, R * 0.8, Math.PI * 1.1, Math.PI * 1.45)
  g.stroke()
}

/** Evenly spaced dots round a circle, each pushed out and grown by the sound, softly lit */
function dotRing(K: Ctx) {
  const { g, C, t, amp, cx, cy, u, thick } = K
  const n = 48
  const R = Math.max(18 * u, amp * 1.1)
  alpha(K, 0.12)
  g.strokeStyle = K.ink
  g.lineWidth = Math.max(1, u)
  g.beginPath()
  g.arc(cx, cy, R, 0, TAU)
  g.stroke()
  const vs = smoothRow(Array.from({ length: n }, (_, i) => spec(K.b, 1 - Math.abs(1 - (2 * i) / n)) * (0.6 + 0.4 * wob(i, t))), true)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2
    const q = 1 - Math.abs(1 - (2 * i) / n)
    const v = vs[i]!
    const rr = R + v * amp * 0.45
    const r = Math.max(2 * u, thick * 1.5) * (1 + v * 1.3)
    const col = mixRgb(C, q)
    const x = cx + Math.cos(a) * rr
    const y = cy + Math.sin(a) * rr
    g.globalCompositeOperation = K.blend
    softDot(K, x, y, r * 3.2, col, 0.35)
    g.globalCompositeOperation = 'source-over'
    alpha(K, 1)
    g.fillStyle = css(col)
    circle(g, x, y, r)
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

/** A circle of slim bars standing out from a thin ring, mirrored left and right, with a soft glow */
function radialBars(K: Ctx) {
  const { g, C, t, amp, cx, cy, u, thick, level } = K
  const n = 90
  const R = Math.max(20 * u, amp * 0.95)
  const vs = smoothRow(Array.from({ length: n }, (_, i) => spec(K.b, 1 - Math.abs(1 - (2 * i) / n)) * (0.5 + 0.5 * wob(Math.min(i, n - i), t))), true)
  const lw = Math.max(1.5 * u, Math.min(((TAU * R) / n) * 0.5, thick * 1.6))
  g.globalCompositeOperation = K.blend
  softDot(K, cx, cy, R * 1.1, C[1], 0.08 + 0.2 * level)
  g.lineCap = 'round'
  for (const [m, a] of [[3, 0.14], [1, 1]] as const) {
    g.globalCompositeOperation = m > 1 ? K.blend : 'source-over'
    g.lineWidth = lw * m
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU - Math.PI / 2
      const q = 1 - Math.abs(1 - (2 * i) / n)
      const len = 3 * u + vs[i]! * amp * 1.1
      const cs = Math.cos(ang)
      const sn = Math.sin(ang)
      alpha(K, a)
      g.strokeStyle = css(mixRgb(C, q))
      g.beginPath()
      g.moveTo(cx + cs * R, cy + sn * R)
      g.lineTo(cx + cs * (R + len), cy + sn * (R + len))
      g.stroke()
    }
  }
  g.globalCompositeOperation = 'source-over'
  alpha(K, 0.4)
  g.strokeStyle = wheel(K, cx, cy)
  g.lineWidth = Math.max(1, thick * 0.6)
  g.beginPath()
  g.arc(cx, cy, R * 0.9, 0, TAU)
  g.stroke()
}

/** Soft rings leaving a glowing centre, as strong as the sound was when they left, slowing as they spread */
function ripple(K: Ctx) {
  const { g, C, t, amp, cx, cy, u, thick, level } = K
  const P = 0.28
  const n = 8
  const life = n * P
  const R0 = Math.max(10 * u, amp * 0.3)
  const Rmax = amp * 2.2
  const phase = ((t % P) + P) % P
  g.globalCompositeOperation = K.blend
  for (let k = n - 1; k >= 0; k--) {
    const age = phase + k * P
    const f = age / life
    const s = loud(K.past(age))
    if (s < 0.02) continue
    const r = R0 + (1 - (1 - f) ** 2) * (Rmax - R0)
    const col = css(mixRgb(C, f))
    const a = s * (1 - f) ** 1.6
    g.strokeStyle = col
    for (const [m, k2] of [[4, 0.15], [1, 1]] as const) {
      alpha(K, a * k2)
      g.lineWidth = Math.max(1, thick * (1.4 - 0.8 * f) * m)
      g.beginPath()
      g.arc(cx, cy, r, 0, TAU)
      g.stroke()
    }
  }
  const Rc = R0 * (0.7 + 0.4 * level)
  softDot(K, cx, cy, Rc * 2.6, C[1], 0.3 + 0.3 * level)
  g.globalCompositeOperation = 'source-over'
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, Rc)
  grad.addColorStop(0, css(lighten(C[1], 0.4)))
  grad.addColorStop(1, css(C[0]))
  alpha(K, 1)
  g.fillStyle = grad
  circle(g, cx, cy, Rc)
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

/**
 * Fine glowing dust rising from the line where the sound is (more in the middle), each speck
 * as bright as the sound was when it left, easing up and fading out.
 */
function particles(K: Ctx) {
  const { g, C, t, ww, x0, amp, cy, u, thick, look } = K
  const N = 300
  const L = 2.8
  g.globalCompositeOperation = K.blend
  for (let i = 0; i < N; i++) {
    const ph0 = jitter(i * 3 + 1)
    const c = Math.floor(t / L + ph0)
    const ph = t / L + ph0 - c
    const u1 = jitter(i * 7 + c * 13.7)
    const xq = 0.5 + 0.47 * Math.sign(u1 - 0.5) * Math.abs(2 * u1 - 1) ** 1.5
    const s = spec(K.past(ph * L), Math.abs(2 * xq - 1))
    if (s < 0.03) continue
    const dir = look.shape === 'top' ? -1 : look.shape === 'bottom' ? 1 : jitter(i * 5 + c) < 0.5 ? -1 : 1
    const rise = 1 - (1 - ph) ** 2
    const y = cy + dir * rise * amp * (0.9 + 1.6 * jitter(i * 11 + c)) * (0.4 + 0.6 * s)
    const x = x0 + ww * xq + Math.sin(t * 0.9 + i) * ww * 0.012 * ph
    const r = Math.max(1.5 * u, thick * 0.9) * (0.6 + 1.2 * jitter(i * 17 + c))
    const a = Math.min(1, s * 2.2) * clamp01(ph / 0.12) * (1 - ph) ** 1.2
    const col = css(mixRgb(C, xq))
    g.fillStyle = col
    alpha(K, a * 0.22)
    circle(g, x, y, r * 3)
    alpha(K, a)
    circle(g, x, y, r)
  }
  g.globalCompositeOperation = 'source-over'
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

/** A drop of liquid light: one smooth shape lit from inside, a soft glow round it and a shine on top */
function blob(K: Ctx) {
  const { g, C, t, amp, cx, cy, u, thick, level, b } = K
  const R = Math.max(16 * u, amp * 0.8) * (1 + 0.1 * level)
  const shape = (rad: number, ph: number) => {
    const p = new Path2D()
    for (let s = 0; s <= 160; s++) {
      const a = (s / 160) * TAU
      const r = rad * (1 + b[0]! * 0.14 * Math.sin(2 * a + t * 0.8 + ph) + b[1]! * 0.1 * Math.sin(3 * a - t * 1.1 + ph * 2)
        + b[2]! * 0.07 * Math.sin(4 * a + t * 1.6 + ph * 3) + 0.03 * Math.sin(a + t * 0.5))
      const px = cx + Math.cos(a) * r
      const py = cy + Math.sin(a) * r
      if (s === 0) p.moveTo(px, py); else p.lineTo(px, py)
    }
    p.closePath()
    return p
  }
  g.globalCompositeOperation = K.blend
  softDot(K, cx, cy, R * 1.9, C[1], 0.16 + 0.2 * level)
  g.globalCompositeOperation = 'source-over'
  const body = g.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R * 1.15)
  body.addColorStop(0, css(lighten(C[2], 0.25)))
  body.addColorStop(0.5, css(C[1]))
  body.addColorStop(1, css(C[0]))
  alpha(K, 0.95)
  g.fillStyle = body
  g.fill(shape(R, 0))
  g.globalCompositeOperation = K.blend
  const inner = g.createRadialGradient(cx + R * 0.15, cy + R * 0.1, 0, cx + R * 0.15, cy + R * 0.1, R * 0.7)
  inner.addColorStop(0, css(C[2], 0.45))
  inner.addColorStop(1, css(C[2], 0))
  alpha(K, 1)
  g.fillStyle = inner
  g.fill(shape(R * 0.62, 2))
  g.globalCompositeOperation = 'source-over'
  alpha(K, 0.45)
  g.strokeStyle = K.ink
  g.lineWidth = Math.max(1, thick * 0.8)
  g.beginPath()
  g.arc(cx, cy, R * 0.78, Math.PI * 1.12, Math.PI * 1.42)
  g.stroke()
}

// ── Light beam, frosted pill, mirror EQ, silk mesh, glow horizon, bokeh, orbit, sunburst ──

/** A beam of light along the line: a hot core, coloured light spreading from it, brighter with the sound */
function beam(K: Ctx) {
  const { g, C, t, ww, x0, cx, cy, amp, thick, level, b } = K
  g.globalCompositeOperation = K.blend
  streak(K, cx, cy, ww * 0.55, amp * (0.2 + 1.1 * level), C[1], 0.35 + 0.35 * level)
  for (let i = 0; i < 3; i++) {
    const x = x0 + ww * (0.25 + 0.25 * i) + Math.sin(t * 0.4 + i * 2) * ww * 0.04
    streak(K, x, cy, ww * 0.2, amp * (0.12 + 0.95 * b[i]!), C[i]!, 0.55)
  }
  // The core: thin and white, thicker when loud
  const h = thick * (0.8 + 2.4 * level)
  const core = g.createLinearGradient(x0, 0, x0 + ww, 0)
  core.addColorStop(0, 'rgba(255, 255, 255, 0)')
  core.addColorStop(0.5, K.dark ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.95)')
  core.addColorStop(1, 'rgba(255, 255, 255, 0)')
  alpha(K, 0.7)
  g.fillStyle = across(K)
  g.fillRect(x0, cy - h * 1.4, ww, h * 2.8)
  alpha(K, 1)
  g.fillStyle = core
  g.fillRect(x0, cy - h / 2, ww, h)
  softDot(K, cx, cy, amp * (0.25 + 0.4 * level), lighten(C[1], 0.6), 0.6 * (0.3 + level))
  g.globalCompositeOperation = 'source-over'
}

/** A frosted glass pill, like a podcast clip, with slim bars moving inside it */
function capsule(K: Ctx) {
  const { g, C, ww, x0, cy, amp, u, dark } = K
  const H = Math.max(24 * u, amp * 1.6)
  const top = cy - H / 2
  const rad = H / 2
  const pill = () => { g.beginPath(); g.roundRect(x0, top, ww, H, rad) }
  alpha(K, 1)
  g.fillStyle = dark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.09)'
  pill(); g.fill()
  const shine = g.createLinearGradient(0, top, 0, top + H)
  shine.addColorStop(0, dark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.16)')
  shine.addColorStop(0.5, 'rgba(255, 255, 255, 0)')
  g.fillStyle = shine
  pill(); g.fill()
  g.strokeStyle = dark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.3)'
  g.lineWidth = Math.max(1, u)
  pill(); g.stroke()
  g.save()
  pill(); g.clip()
  const inL = x0 + rad * 0.9
  const inW = ww - rad * 1.8
  const n = 46
  const bw = inW / n
  const w = Math.max(1.5 * u, bw * 0.42)
  for (let i = 0; i < n; i++) {
    const q = (i + 0.5) / n
    const h = Math.max(w, H * 0.72 * voiceBar(K, i, n) * 1.3)
    const col = mixRgb(C, q)
    const x = inL + i * bw + (bw - w) / 2
    g.globalCompositeOperation = K.blend
    alpha(K, 0.18)
    g.fillStyle = css(col)
    g.beginPath(); g.roundRect(x - w * 0.5, cy - h / 2 - w * 0.5, w * 2, h + w, w); g.fill()
    g.globalCompositeOperation = 'source-over'
    alpha(K, 1)
    g.beginPath(); g.roundRect(x, cy - h / 2, w, h, w / 2); g.fill()
  }
  g.restore()
}

/** Many fine lines one behind the other, like silk in the wind, nearer ones brighter */
function mesh(K: Ctx) {
  const { g, C, t, amp, cy, thick, b } = K
  const n = 28
  g.globalCompositeOperation = K.blend
  g.lineWidth = Math.max(0.8, thick * 0.5)
  for (let j = 0; j < n; j++) {
    const s = j / (n - 1)
    const off = (s - 0.5) * amp * 1.3
    alpha(K, 0.12 + 0.5 * (1 - Math.abs(s - 0.5) * 2))
    g.strokeStyle = css(mixRgb(C, s))
    g.stroke(along(K, (p) => cy + off * (0.4 + 0.6 * tp(p)) + amp * 1.05 * tp(p, 1.4) *
      1.3 * (b[0]! * Math.sin(p * 5 + t * 1.2 + s * 1.5) * 0.8 + b[1]! * Math.sin(p * 9 - t * 1.8 + s * 2.4) * 0.45 + b[2]! * Math.sin(p * 14 + t * 2.6 + s * 3) * 0.25), 200))
  }
  g.globalCompositeOperation = 'source-over'
}

/** A smooth hill of light rising from the line, in colour across, fading to nothing at its foot */
function horizon(K: Ctx) {
  const { g, t, amp, cy, thick, look, b } = K
  const up = look.shape !== 'bottom'
  const down = look.shape !== 'top'
  const hAt = (p: number) => amp * 1.5 * tp(p, 1.2) * spec(b, Math.abs(2 * p - 1)) * (0.65 + 0.35 * Math.sin(p * 9 + t * 1.4)) * (0.7 + 0.3 * Math.sin(p * 4 - t * 0.8))
  const side = (dir: number, a: number) => {
    const edge = along(K, (p) => cy + dir * hAt(p), 200)
    const area = new Path2D(edge)
    area.lineTo(K.x0 + K.ww, cy)
    area.lineTo(K.x0, cy)
    area.closePath()
    alpha(K, 0.8 * a)
    g.fillStyle = across(K)
    g.fill(area)
    // Bright at the edge, gone at the line
    g.save()
    g.clip(area)
    g.globalCompositeOperation = 'destination-in'
    const fade = g.createLinearGradient(0, cy + dir * amp * 1.5, 0, cy)
    fade.addColorStop(0, 'rgba(0, 0, 0, 1)')
    fade.addColorStop(1, 'rgba(0, 0, 0, 0.12)')
    g.globalAlpha = 1
    g.fillStyle = fade
    g.fillRect(K.x0, Math.min(cy, cy + dir * amp * 1.6), K.ww, amp * 1.6)
    g.restore()
    K.g.globalAlpha = K.A * a
    const keep = K.A
    K.A = keep * a
    glowLine(K, edge, across(K), thick * 1.1, false)
    K.A = keep
  }
  if (up) side(-1, 1)
  if (down) side(1, up ? 0.45 : 1)
}

/** Soft round lights out of focus drifting near the line, brighter where the sound is */
function bokeh(K: Ctx) {
  const { g, C, t, ww, x0, amp, cy, b } = K
  const N = 28
  g.globalCompositeOperation = K.blend
  for (let i = 0; i < N; i++) {
    const x = x0 + ww * (0.05 + 0.9 * jitter(i * 5 + 2)) + Math.sin(t * 0.15 * (1 + jitter(i)) + i) * ww * 0.03
    const y = cy + (jitter(i * 9 + 4) - 0.5) * amp * 2.2 + Math.sin(t * 0.2 + i * 1.7) * amp * 0.15
    const q = clamp01((x - x0) / ww)
    const v = spec(b, Math.abs(2 * q - 1))
    const R = amp * (0.12 + 0.3 * jitter(i * 13 + 7)) * (0.85 + 0.3 * v)
    const a = 0.06 + 0.5 * v
    const col = mixRgb(C, q)
    const grad = g.createRadialGradient(x, y, 0, x, y, R)
    grad.addColorStop(0, css(col, a * 0.5))
    grad.addColorStop(0.82, css(col, a * 0.7))
    grad.addColorStop(0.95, css(col, a * 0.95))
    grad.addColorStop(1, css(col, 0))
    alpha(K, 1)
    g.fillStyle = grad
    circle(g, x, y, R)
  }
  g.globalCompositeOperation = 'source-over'
}

/** Wide bars standing on the line with a soft mirror image under it and caps that fall */
function mirrorEq(K: Ctx) {
  const { g, C, t, ww, x0, amp, cy, u, ink } = K
  const n = 22
  const bw = ww / n
  const w = bw * 0.56
  const r = Math.min(w * 0.28, 8 * u)
  const total = amp * 2.3
  const gap = 2 * u
  for (let i = 0; i < n; i++) {
    const v = columnAt(K.b, i, n, t)
    let peak = v
    for (let a = 0.06; a <= 0.84; a += 0.06) peak = Math.max(peak, columnAt(K.past(a), i, n, t - a) - 1.5 * a * a)
    const h = Math.max(w * 0.4, total * v)
    const x = x0 + i * bw + (bw - w) / 2
    const grad = g.createLinearGradient(0, cy, 0, cy - total)
    grad.addColorStop(0, css(C[0]))
    grad.addColorStop(0.5, css(C[1]))
    grad.addColorStop(1, css(C[2]))
    g.globalCompositeOperation = K.blend
    alpha(K, 0.14)
    g.fillStyle = grad
    g.beginPath(); g.roundRect(x - w * 0.3, cy - gap - h - w * 0.3, w * 1.6, h + w * 0.6, r + w * 0.3); g.fill()
    g.globalCompositeOperation = 'source-over'
    alpha(K, 1)
    g.beginPath(); g.roundRect(x, cy - gap - h, w, h, Math.min(r, h / 2)); g.fill()
    // The mirror image, fading down
    const rg = g.createLinearGradient(0, cy + gap, 0, cy + gap + h * 0.6)
    rg.addColorStop(0, css(C[0], 0.3))
    rg.addColorStop(1, css(C[0], 0))
    g.fillStyle = rg
    g.beginPath(); g.roundRect(x, cy + gap, w, h * 0.6, Math.min(r, h * 0.3)); g.fill()
    const capH = Math.max(1.5 * u, w * 0.14)
    alpha(K, 0.85)
    g.fillStyle = ink
    g.beginPath(); g.roundRect(x, cy - gap - Math.max(h, total * peak) - 3 * u - capH, w, capH, capH / 2); g.fill()
  }
}

/** Three lights circling round a faint ring, each with a fading tail, longer and brighter when its part of the sound is loud */
function orbit(K: Ctx) {
  const { g, C, t, amp, cx, cy, u, thick, level, b } = K
  const R = Math.max(20 * u, amp * 1.4)
  alpha(K, 0.18)
  g.strokeStyle = K.ink
  g.lineWidth = Math.max(1, u)
  g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke()
  g.globalCompositeOperation = K.blend
  softDot(K, cx, cy, R * 0.8, C[1], 0.06 + 0.2 * level)
  g.lineCap = 'round'
  for (let i = 0; i < 3; i++) {
    const v = b[i]!
    const a0 = t * (0.9 + 0.4 * i) + i * 2.1
    const rr = R * (1 + 0.06 * (i - 1))
    const steps = 24
    const len = 0.05 * (1 + v * 2.2)
    const at = (k: number) => { const a = a0 - k * len; return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as const }
    for (let k = 0; k < steps; k++) {
      const [ax, ay] = at(k)
      const [bx, by] = at(k + 1)
      alpha(K, (1 - k / steps) ** 1.6 * (0.45 + 0.55 * v))
      g.strokeStyle = css(C[i]!)
      g.lineWidth = Math.max(1.5 * u, thick * (3.4 - (2.4 * k) / steps))
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke()
    }
    const [hx, hy] = at(0)
    const hr = Math.max(3 * u, thick * 2) * (1 + v * 1.2)
    softDot(K, hx, hy, hr * 5, C[i]!, 0.6)
    alpha(K, 1)
    g.fillStyle = css(lighten(C[i]!, 0.6))
    circle(g, hx, hy, hr * 0.7)
  }
  g.globalCompositeOperation = 'source-over'
}

/** Soft rays of light out of a glowing centre, longer where the sound is, turning slowly */
function burst(K: Ctx) {
  const { g, C, t, amp, cx, cy, u, thick, level } = K
  const n = 60
  const R0 = Math.max(10 * u, amp * 0.35)
  const rot = t * 0.12
  const vs = smoothRow(Array.from({ length: n }, (_, i) => spec(K.b, 1 - Math.abs(1 - (2 * i) / n)) * (0.55 + 0.45 * wob(Math.min(i, n - i), t))), true)
  g.globalCompositeOperation = K.blend
  g.lineCap = 'round'
  g.lineWidth = Math.max(1.2 * u, thick * 1.1)
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU - Math.PI / 2
    const len = amp * (0.4 + 2.2 * vs[i]!)
    const col = mixRgb(C, 1 - Math.abs(1 - (2 * i) / n))
    const sx = cx + Math.cos(a) * R0
    const sy = cy + Math.sin(a) * R0
    const ex = cx + Math.cos(a) * (R0 + len)
    const ey = cy + Math.sin(a) * (R0 + len)
    const grad = g.createLinearGradient(sx, sy, ex, ey)
    grad.addColorStop(0, css(col, 0.85))
    grad.addColorStop(1, css(col, 0))
    alpha(K, 1)
    g.strokeStyle = grad
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke()
  }
  softDot(K, cx, cy, R0 * 2.4 * (1 + 0.3 * level), C[1], 0.5)
  softDot(K, cx, cy, R0 * 1.1 * (1 + 0.3 * level), lighten(C[1], 0.7), 0.9)
  g.globalCompositeOperation = 'source-over'
}

const DRAW: Record<WaveStyle, (K: Ctx) => void> = {
  siri: glow, soft: glow, aura: glow, aurora,
  bars, pill: bars, thin: thinBars, spectrum, blocks, scroll: scrollBars, glassbars: glassBars,
  spikes, dashes: softDashes, echo: echoDashes,
  line: lines, multi: lines, smooth: smoothCurve, classic, scope, neon, ribbon,
  ring, pulse, dotring: dotRing, orb, radial: radialBars, ripple,
  dots: dotRow, bounce, particles, matrix,
  hills, history, blob,
  beam, capsule, mirroreq: mirrorEq, mesh, horizon, bokeh, orbit, burst,
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
    dark,
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
