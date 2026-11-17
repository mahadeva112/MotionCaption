import type { CSSProperties, ReactNode } from 'react'
import type { Deco, DecoIn, Rgb } from '@core/look'

// Shapes drawn with a caption (core/look.ts Deco): bars, lines, plates, corner frames, dots,
// meters, a light across the letters and cinema bars. They sit in the caption's block, so
// they follow its size, place and animation; each comes in on its own timing. The preview
// and the drawn frames both use these, so what goes into Resolve is what the preview showed.

const css = (c: Rgb, a = 1) => `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${a})`
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
/** A long soft ease-out: quick to start, then a slow glide into place */
const easeOut = (t: number) => 1 - (1 - t) ** 4
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
/** A gentle overshoot, just enough to feel alive */
const backOut = (t: number) => { const c1 = 1.1; return 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2 }

/** How long a shape takes to leave, and how far apart shapes leave (the last one in leaves first) */
const LEAVE_MS = 450
const LEAVE_STEP = 70

/** How far in a shape is at ms: 0 before it starts, 1 once in (pop overshoots a little) */
export function decoIn(d: Deco, ms: number): number {
  if ((d.in ?? 'fade') === 'none') return 1
  const from = d.delay ?? 0
  const dur = d.ms ?? 450
  const t = dur > 0 ? clamp01((ms - from) / dur) : ms >= from ? 1 : 0
  return d.in === 'pop' ? (t >= 1 ? 1 : backOut(t)) : easeOut(t)
}

/** How much of shape i (of n) is still there as the caption ends: 1 until it starts to leave, 0 once gone.
 *  Shapes leave in turn, the last one in first, and are gone just before the caption. */
export function decoLeave(i: number, n: number, ms: number, durMs: number): number {
  if (!durMs) return 1
  const end = durMs - 60 - Math.min(i, n - 1) * LEAVE_STEP
  const t = clamp01((ms - (end - LEAVE_MS)) / LEAVE_MS)
  return 1 - easeInOut(t)
}

const defaultIn: Record<Deco['kind'], DecoIn> = {
  bar: 'grow', line: 'grow', panel: 'wipe', frame: 'pop', dot: 'pop', meter: 'fade', sweep: 'none', letterbox: 'grow',
}

/** The way in as styles, on top of the shape's own transform (base) */
function enter(how: DecoIn, p: number, axis: 'x' | 'y', origin: string, base = ''): CSSProperties {
  const t = (s: string) => (base + ' ' + s).trim() || undefined
  switch (how) {
    case 'none': return { transform: t('') }
    case 'fade': return { opacity: clamp01(p), transform: t('') }
    case 'grow': return { transform: t(`scale${axis.toUpperCase()}(${Math.max(0, p)})`), transformOrigin: origin, opacity: clamp01(p * 2.5) }
    case 'wipe': {
      // A feathered edge that runs across, so the wipe has no hard line
      const a = clamp01(p) * 125 - 25
      const dir = origin.startsWith('right') ? 'to left' : axis === 'y' ? 'to top' : 'to right'
      const mask = `linear-gradient(${dir}, #000 ${a}%, transparent ${a + 25}%)`
      return { transform: t(''), maskImage: mask, WebkitMaskImage: mask }
    }
    case 'pop': return { transform: t(`scale(${Math.max(0, p)})`), opacity: clamp01(p * 2), transformOrigin: origin }
    case 'slide': return { transform: t(`translateX(${(p - 1) * 1.4}em)`), opacity: clamp01(p * 1.5) }
  }
}

/** Shapes that sit behind the text, inside the caption's block (align: 0 left, 1 centre, 2 right) */
export function decoBack(deco: readonly Deco[], ms: number, align: 0 | 1 | 2, durMs = 0): ReactNode[] {
  return deco.map((d, i) => {
    if (d.kind === 'sweep' || d.kind === 'letterbox') return null
    const p = Math.min(decoIn(d, ms), decoLeave(i, deco.length, ms, durMs))
    if (p <= 0) return null
    const how = d.in ?? defaultIn[d.kind]
    const col = css(d.color, d.opacity ?? 1)
    const g = d.gap ?? 0.35
    const s = d.size ?? 0.12
    const nudge = d.dx || d.dy ? `translate(${d.dx ?? 0}em, ${d.dy ?? 0}em)` : ''
    const at: CSSProperties = { position: 'absolute', pointerEvents: 'none' }
    const right = d.side === 'right'
    switch (d.kind) {
      case 'bar':
        return <span key={i} style={{
          ...at, top: 0, bottom: 0, width: `${s}em`, background: col, borderRadius: `${s / 2}em`,
          ...(right ? { left: `calc(100% + ${g}em)` } : { right: `calc(100% + ${g}em)` }),
          ...enter(how, p, 'y', 'bottom', nudge),
        }} />
      case 'line': {
        const len = (d.amount ?? 1) * 100
        const o = align === 0 ? 'left' : align === 2 ? 'right' : 'center'
        return <span key={i} style={{
          ...at, width: `${len}%`, height: `${s}em`, background: col, borderRadius: `${s / 2}em`,
          ...(align === 0 ? { left: 0 } : align === 2 ? { right: 0 } : { left: `${(100 - len) / 2}%` }),
          ...(d.side === 'above' ? { bottom: `calc(100% + ${g}em)` } : { top: `calc(100% + ${g}em)` }),
          ...enter(how, p, 'x', o, nudge),
        }} />
      }
      case 'panel': {
        const gx = d.gapX ?? g * 1.5
        return <span key={i} style={{
          ...at, top: `${-g}em`, bottom: `${-g}em`, left: `${-gx}em`, right: `${-gx}em`, background: col,
          borderRadius: `${d.round ?? 0}em`,
          ...(d.border ? { border: `${d.borderWidth ?? 0.06}em solid ${css(d.border, 0.9)}`, boxSizing: 'border-box' } : {}),
          ...enter(how, p, 'x', d.side === 'right' ? 'right' : 'left', [nudge, d.skew ? `skewX(${-d.skew}deg)` : ''].join(' ').trim()),
        }} />
      }
      case 'frame': {
        const gx = d.gapX ?? g * 1.5
        const L = `${d.amount ?? 0.6}em`
        const w = `${s}em`
        const corner = (k: string, st: CSSProperties) => <span key={k} style={{ position: 'absolute', width: L, height: L, borderStyle: 'solid', borderColor: col, borderWidth: 0, ...st }} />
        return <span key={i} style={{ ...at, top: `${-g}em`, bottom: `${-g}em`, left: `${-gx}em`, right: `${-gx}em`, ...enter(how, p, 'x', 'center', nudge) }}>
          {corner('a', { top: 0, left: 0, borderTopWidth: w, borderLeftWidth: w })}
          {corner('b', { top: 0, right: 0, borderTopWidth: w, borderRightWidth: w })}
          {corner('c', { bottom: 0, left: 0, borderBottomWidth: w, borderLeftWidth: w })}
          {corner('d', { bottom: 0, right: 0, borderBottomWidth: w, borderRightWidth: w })}
        </span>
      }
      case 'dot': {
        const dia = d.size ?? 0.5
        return <span key={i} style={{
          ...at, top: '50%', width: `${dia}em`, height: `${dia}em`, marginTop: `${-dia / 2}em`, borderRadius: '50%', background: col,
          ...(right ? { left: `calc(100% + ${g}em)` } : { right: `calc(100% + ${g}em)` }),
          ...enter(how, p, 'x', 'center', nudge),
        }} />
      }
      case 'meter': {
        const fill = d.amount ?? 0.7
        // The track shows first, then fills over the same time
        const q = clamp01(p)
        return <span key={i} style={{
          ...at, left: 0, right: 0, top: `calc(100% + ${g}em)`, height: `${s}em`, borderRadius: `${s / 2}em`,
          background: css(d.color, 0.25), opacity: clamp01(q * 3), transform: nudge || undefined,
        }}>
          <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${fill * q * 100}%`, background: col, borderRadius: 'inherit' }} />
        </span>
      }
    }
  }).filter(Boolean)
}

/** The light running across the letters: a band of the colour cut to the letters' shapes */
export function sweepStyle(deco: readonly Deco[], ms: number): CSSProperties | null {
  const d = deco.find((x) => x.kind === 'sweep')
  if (!d) return null
  const from = d.delay ?? 500
  const dur = d.ms ?? 900
  const t = (ms - from) / dur
  if (t <= 0 || t >= 1) return null
  const x = -25 + 150 * easeInOut(t)
  const c = css(d.color, d.opacity ?? 0.85)
  return {
    backgroundImage: `linear-gradient(105deg, transparent ${x - 18}%, ${c} ${x}%, transparent ${x + 18}%)`,
    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', textShadow: 'none', WebkitTextStroke: '0',
  }
}

/** Cinema bars over the whole frame: they close in, and open again over the caption's last 400 ms */
export function letterbox(deco: readonly Deco[], ms: number, durMs: number, H: number): ReactNode {
  const d = deco.find((x) => x.kind === 'letterbox')
  if (!d) return null
  const out = easeInOut(clamp01((durMs - ms) / 600))
  const h = (d.amount ?? 0.1) * H * Math.min(decoIn({ ...d, in: d.in === 'none' ? 'none' : 'grow' }, ms), out)
  if (h <= 0) return null
  const col = css(d.color, d.opacity ?? 1)
  const bar: CSSProperties = { position: 'absolute', left: 0, right: 0, height: h, background: col, pointerEvents: 'none' }
  return <div className="vletterbox" aria-hidden><div style={{ ...bar, top: 0 }} /><div style={{ ...bar, bottom: 0 }} /></div>
}
