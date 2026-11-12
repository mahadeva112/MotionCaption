import { useId, type CSSProperties, type ReactNode } from 'react'
import { fxAt, splitUnits, type CompiledFx, type FxFrame, type FxMask, type FxState, type RevealFrom, type Units } from '@core/fx'
import type { Rgb } from '@core/look'
import { css } from './model'

// Draws a caption's text with an advanced effect (core/fx.ts). The text is nested
// line › word › letter, each level an inline-block that can move on its own, inside a
// layer that takes the mask and the warp. The light sweep is a bright copy of the same text
// on top, shown only through a moving band. Lengths are in em, so the preview and the
// drawn frames (a different size) look the same.

interface Props {
  fx: CompiledFx
  /** The text as drawn (count-up already applied): grapheme for grapheme the same as the caption's */
  text: string
  ms: number
  durMs: number
  fontPx: number
  fill: Rgb
  /** The look's own text shadow, kept under any glow */
  shadow?: string
  /** One letter of the caption as the plain preview draws it (never a line break) */
  charEl: (i: number) => ReactNode
}

/** Below these the value is rest: leave the style out */
const NEAR = 1e-3

/** Room around the text for the mask and the warp, so glow and bends are not cut at the box */
const PAD = 0.6

function stateStyle(s: FxState | undefined, from: RevealFrom | undefined, accent: Rgb, fill: Rgb, shadow?: string): CSSProperties | undefined {
  if (!s) return undefined
  const st: CSSProperties = {}
  const tf: string[] = []
  const x = s.x ?? 0
  const y = s.y ?? 0
  if (Math.abs(x) > NEAR || Math.abs(y) > NEAR) tf.push(`translate(${x.toFixed(4)}em, ${y.toFixed(4)}em)`)
  const k = s.scale ?? 1
  const sx = k * (s.scaleX ?? 1)
  const sy = k * (s.scaleY ?? 1)
  if (Math.abs(sx - 1) > NEAR || Math.abs(sy - 1) > NEAR) tf.push(`scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`)
  if (Math.abs(s.rotate ?? 0) > NEAR) tf.push(`rotate(${s.rotate!.toFixed(3)}deg)`)
  if (Math.abs(s.skewX ?? 0) > NEAR) tf.push(`skewX(${s.skewX!.toFixed(3)}deg)`)
  if (tf.length) st.transform = tf.join(' ')
  if (s.opacity !== undefined && s.opacity < 1 - NEAR) st.opacity = Math.max(0, s.opacity)
  if ((s.blur ?? 0) > NEAR) st.filter = `blur(${s.blur!.toFixed(4)}em)`
  if ((s.glow ?? 0) > NEAR) {
    const g = s.glow!
    st.textShadow = `0 0 ${(g * 0.5).toFixed(4)}em ${css(accent)}, 0 0 ${g.toFixed(4)}em ${css(accent, 0.8)}` + (shadow ? `, ${shadow}` : '')
  }
  if ((s.tint ?? 0) > NEAR) st.color = `color-mix(in srgb, ${css(fill)}, ${css(accent)} ${(Math.min(1, s.tint!) * 100).toFixed(1)}%)`
  const r = s.reveal ?? 1
  if (r < 1 - NEAR) {
    // Cut from one side; the other sides keep room for vowel signs above and below the line
    const cut = `${((1 - Math.max(0, r)) * (100 + 2 * 40)) - 40}%`
    const m = '-40%'
    st.clipPath = from === 'top' ? `inset(${m} ${m} ${cut} ${m})` : from === 'left' ? `inset(${m} ${cut} ${m} ${m})`
      : from === 'right' ? `inset(${m} ${m} ${m} ${cut})` : `inset(${cut} ${m} ${m} ${m})`
  }
  return st
}

/** The mask as a CSS mask image at this openness */
function maskImage(m: FxMask, open: number): string | undefined {
  if (open >= 1 - NEAR) return undefined
  const s = Math.max(0.001, m.soft)
  const edge = open * (1 + s)
  const pc = (v: number) => `${(v * 100).toFixed(2)}%`
  if (m.kind === 'iris') return `radial-gradient(ellipse farthest-corner at 50% 50%, #000 ${pc(edge - s)}, transparent ${pc(edge)})`
  if (m.kind === 'split') {
    const h = edge / 2
    const soft = s / 2
    return `linear-gradient(90deg, transparent ${pc(0.5 - h)}, #000 ${pc(0.5 - h + soft)}, #000 ${pc(0.5 + h - soft)}, transparent ${pc(0.5 + h)})`
  }
  return `linear-gradient(${m.angle ?? 90}deg, #000 ${pc(edge - s)}, transparent ${pc(edge)})`
}

interface Line { words: { word: number; glyphs: number[] }[]; items: (number | { word: number })[] }

/** Glyph indices grouped into lines, and within a line into words and the spaces between */
function group(u: Units): Line[] {
  const lines: Line[] = Array.from({ length: u.lines }, () => ({ words: [], items: [] }))
  u.glyphs.forEach((g, i) => {
    if (g.ch === '\n' || g.ch === '\r\n') return
    const line = lines[g.line]!
    if (g.word < 0) { line.items.push(i); return }
    let w = line.words[line.words.length - 1]
    if (!w || w.word !== g.word) {
      w = { word: g.word, glyphs: [] }
      line.words.push(w)
      line.items.push({ word: g.word })
    }
    w.glyphs.push(i)
  })
  return lines
}

export function FxText({ fx, text, ms, durMs, fontPx, fill, shadow, charEl }: Props) {
  const id = 'fxw' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const units = splitUnits(text)
  const f: FxFrame = fxAt(fx, units, ms, durMs)
  const lines = group(units)
  const A = fx.accent

  const tree = (copy: boolean) => lines.map((line, li) => {
    const words = new Map(line.words.map((w) => [w.word, w]))
    return [
      li > 0 ? <br key={`b${li}`} /> : null,
      <span key={`l${li}`} className="fxl" style={stateStyle(f.line?.[li], f.revealFrom.line, A, fill, shadow)}>
        {line.items.map((it) => {
          if (typeof it === 'number') return <span key={`s${it}`} className="fxsp">{copy ? units.glyphs[it]!.ch : charEl(it)}</span>
          const w = words.get(it.word)!
          return (
            <span key={`w${it.word}`} className="fxu" style={stateStyle(f.word?.[it.word], f.revealFrom.word, A, fill, shadow)}>
              {w.glyphs.map((gi) => {
                const g = units.glyphs[gi]!
                const ls = f.letter ? stateStyle(f.letter[g.letter], f.revealFrom.letter, A, fill, shadow) : undefined
                const inner = copy ? g.ch : charEl(gi)
                return ls ? <span key={gi} className="fxc" style={ls}>{inner}</span> : <span key={gi} className="fxc">{inner}</span>
              })}
            </span>
          )
        })}
      </span>,
    ]
  })

  // Light sweep: a band moving across, as a mask on a white copy of the text
  let sweep: ReactNode = null
  if (fx.sweep && f.sweep !== undefined) {
    const c = f.sweep
    const w = fx.sweep.width / 2
    const pc = (v: number) => `${(v * 100).toFixed(2)}%`
    const band = `linear-gradient(${fx.sweep.angle}deg, transparent ${pc(c - w)}, rgba(0,0,0,${fx.sweep.strength}) ${pc(c)}, transparent ${pc(c + w)})`
    // Light in the accent colour, so it shows on white letters too
    sweep = <span className="fxs" aria-hidden style={{ color: css(A),WebkitMaskImage: band, maskImage: band }}>{tree(true)}</span>
  }

  const mask = fx.mask && f.mask !== undefined ? maskImage(fx.mask, f.mask) : undefined
  const bend = (f.warp ?? 0) * fontPx
  const warp = fx.warp && bend > 0.05
  const outer: CSSProperties = {
    padding: `${PAD}em`, margin: `-${PAD}em`,
    ...(mask ? { WebkitMaskImage: mask, maskImage: mask } : {}),
    ...(warp ? { filter: `url(#${id})` } : {}),
  }
  const size = (fx.warp?.sizeEm ?? 1) * fontPx

  return (
    <span className="fxm" style={outer}>
      <span className="fxw" style={stateStyle(f.whole, f.revealFrom.whole, A, fill, shadow)}>
        {tree(false)}
        {sweep}
      </span>
      {warp && (
        <svg className="fxsvg" width="0" height="0" aria-hidden>
          <filter id={id} x="-25%" y="-50%" width="150%" height="200%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" seed={fx.seed % 1000}
              baseFrequency={fx.warp!.wave ? `${(0.12 / size).toFixed(5)} ${(1 / size).toFixed(5)}` : `${(1 / size).toFixed(5)}`} numOctaves={2} result="n" />
            {/* Solid noise; a wave bends sideways only (green held at the middle: no up or down) */}
            <feColorMatrix in="n" type="matrix" result="c"
              values={fx.warp!.wave ? '1 0 0 0 0  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 1' : '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1'} />
            <feOffset in="c" dx={((f.drift ?? 0) * fontPx).toFixed(2)} dy="0" result="m" />
            <feDisplacementMap in="SourceGraphic" in2="m" scale={bend.toFixed(2)} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}
    </span>
  )
}
