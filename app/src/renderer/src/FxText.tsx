import { useId, type CSSProperties, type ReactNode } from 'react'
import { fxAt, splitUnits, type CompiledFx, type FxFrame, type FxMask, type FxState, type RevealFrom, type Units } from '@core/fx'
import type { Rgb } from '@core/look'
import { css } from './model'

// Draws a caption's text with an advanced effect (core/fx.ts). The text is nested
// line › word › letter, each level an inline-block that can move on its own, inside a
// layer that takes the mask and the warp. The light sweep and the karaoke fill are copies
// of the same text on top: the sweep shown only through a moving band, the fill cut word
// by word. Lengths are in em, so the preview and the drawn frames (a different size) look the same.

export interface FxFont {
  family: string
  weight: number
  italic: boolean
}

interface Props {
  fx: CompiledFx
  /** The text as drawn (count-up already applied): grapheme for grapheme the same as the caption's */
  text: string
  ms: number
  durMs: number
  fontPx: number
  fill: Rgb
  /** The look's font, for finding where the top line (shirorekha) sits */
  font: FxFont
  /** Line height in em */
  lineEm: number
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

const pc = (v: number) => `${(v * 100).toFixed(2)}%`

/** The mask at this openness, as CSS */
function maskStyle(m: FxMask, open: number): CSSProperties | undefined {
  if (open >= 1 - NEAR) return undefined
  const s = Math.max(0.001, m.soft)
  if (m.kind === 'blinds') {
    // Each strip open from its top down to `open`
    const o = open * (1 + s)
    return { maskImage: `linear-gradient(180deg, #000 ${pc(o - s)}, transparent ${pc(o)})`, maskSize: `100% ${(m.bandEm ?? 0.3).toFixed(3)}em`, maskRepeat: 'repeat' }
  }
  const img = maskImage(m, open, s)
  return img ? { maskImage: img } : undefined
}

/** Where the wipe's edge is, as shares across the padded box (two for split) */
function edgesAt(m: FxMask, open: number): number[] {
  const s = Math.max(0.001, m.soft)
  const e = open * (1 + s) - s / 2
  if (m.kind === 'split') return [0.5 - e / 2, 0.5 + e / 2]
  if (m.kind === 'wipe' && (m.angle ?? 90) === 90) return [e]
  return []
}

function maskImage(m: FxMask, open: number, s: number): string | undefined {
  const edge = open * (1 + s)
  if (m.kind === 'iris') return `radial-gradient(ellipse farthest-corner at 50% 50%, #000 ${pc(edge - s)}, transparent ${pc(edge)})`
  if (m.kind === 'split') {
    const h = edge / 2
    const soft = s / 2
    return `linear-gradient(90deg, transparent ${pc(0.5 - h)}, #000 ${pc(0.5 - h + soft)}, #000 ${pc(0.5 + h - soft)}, transparent ${pc(0.5 + h)})`
  }
  return `linear-gradient(${m.angle ?? 90}deg, #000 ${pc(edge - s)}, transparent ${pc(edge)})`
}

// ── The top line (shirorekha) ──────────────────────────────────────────────

const bands = new Map<string, readonly [number, number]>()
let ctx: CanvasRenderingContext2D | null | undefined

/**
 * Where the top line sits in a line of text, in em from the line's top: from just above it
 * to just under it. Asked of the font itself (the top of क, ক or ਕ, which have no sign
 * above them), so it fits any font. Text without those scripts gets the top of 'x'.
 */
export function headlineBand(text: string, font: FxFont, lineEm: number): readonly [number, number] {
  const ch = /[ঀ-৿]/.test(text) ? 'ক' : /[਀-੿]/.test(text) ? 'ਕ' : /[ऀ-ॿ]/.test(text) ? 'क' : 'x'
  const spec = `${font.italic ? 'italic ' : ''}${font.weight} 100px '${font.family}', 'Nirmala UI', sans-serif`
  const key = `${spec}|${ch}|${lineEm}`
  const have = bands.get(key)
  if (have) return have
  if (ctx === undefined) ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  // No canvas: a fair place for most Devanagari fonts
  if (!ctx) return [lineEm / 2 - 0.42, lineEm / 2 - 0.22]
  ctx.font = spec
  const m = ctx.measureText(ch)
  const asc = m.fontBoundingBoxAscent
  const desc = m.fontBoundingBoxDescent
  const baseline = (lineEm * 100 - (asc + desc)) / 2 + asc
  const top = baseline - m.actualBoundingBoxAscent
  const band = [(top - 5) / 100, (top + 15) / 100] as const
  // Measured before the font loaded, the numbers are the fallback's: ask again next frame
  if (document.fonts.check(spec, ch)) bands.set(key, band)
  return band
}

/** A line's mask while its top line draws and its letters come down. Layers, top first:
 *  the letters coming down (added) over the drawn part of the top line (wipe ∩ band). */
function headlineMask(draw: number, drop: number, band: readonly [number, number], lineEm: number): CSSProperties | undefined {
  if (draw >= 1 - NEAR && drop >= 1 - NEAR) return undefined
  const [a, b] = band.map((v) => v + PAD) as [number, number]
  const tall = lineEm + 2 * PAD
  const soft = 0.3
  const d = -soft + drop * (tall + soft)
  const downs = `linear-gradient(180deg, #000 ${d.toFixed(3)}em, transparent ${(d + soft).toFixed(3)}em)`
  const e = draw * 1.08
  const wipe = `linear-gradient(90deg, #000 ${pc(e - 0.08)}, transparent ${pc(e)})`
  const line = `linear-gradient(180deg, transparent ${a.toFixed(3)}em, #000 ${a.toFixed(3)}em, #000 ${b.toFixed(3)}em, transparent ${b.toFixed(3)}em)`
  return { maskImage: `${downs}, ${wipe}, ${line}`, maskComposite: 'add, intersect, add' }
}

// ── Text ────────────────────────────────────────────────────────────────────

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

type Copy = false | 'sweep' | 'fill' | 'mirror'

/** One unit: moving on its own, or (masked) moving inside a still window cut at its line's bottom */
function unit(cls: string, key: string | number, st: CSSProperties | undefined, masked: boolean | undefined, children: ReactNode, pre?: ReactNode) {
  return masked
    ? <span key={key} className={cls + ' fxk'}>{pre}<span className="fxi" style={st}>{children}</span></span>
    : <span key={key} className={cls} style={st}>{pre}{children}</span>
}

export function FxText({ fx, text, ms, durMs, fontPx, fill, font, lineEm, shadow, charEl }: Props) {
  const id = 'fxw' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const units = splitUnits(text)
  const f: FxFrame = fxAt(fx, units, ms, durMs)
  const lines = group(units)
  const A = fx.accent
  const band = f.headline || fx.sweep?.band === 'headline' ? headlineBand(text, font, lineEm) : null
  const M = fx.marker
  const markerColor = M ? css(M.color ?? A, M.opacity) : ''
  /** A highlighter stroke behind a word or line, drawn to p */
  const stroke = (p: number | undefined) => (p && p > NEAR
    ? <span className="fxmk" style={{ background: markerColor, transform: `scaleX(${p.toFixed(4)})` }} />
    : null)

  const tree = (copy: Copy) => lines.map((line, li) => {
    const words = new Map(line.words.map((w) => [w.word, w]))
    const hl = !copy && f.headline && band ? headlineMask(f.headline[li]!.draw, f.headline[li]!.drop, band, lineEm) : undefined
    const lineStyle = { ...stateStyle(f.line?.[li], f.revealFrom.line, A, fill, shadow), ...(hl ? { ...hl, padding: `${PAD}em`, margin: `-${PAD}em` } : {}) }
    return [
      li > 0 ? <br key={`b${li}`} /> : null,
      unit('fxl' + (M?.unit === 'line' ? ' mk' : '') + (M?.thin ? ' thin' : ''), `l${li}`, lineStyle, f.masked.line && !hl, line.items.map((it) => {
          if (typeof it === 'number') return <span key={`s${it}`} className="fxsp">{copy ? units.glyphs[it]!.ch : charEl(it)}</span>
          const w = words.get(it.word)!
          let ws = stateStyle(f.word?.[it.word], f.revealFrom.word, A, fill, shadow)
          if (copy === 'fill') {
            // The fill copy: each word shown from its left edge up to how far it has been spoken
            const p = f.fill?.[it.word] ?? 0
            ws = { ...ws, clipPath: `inset(-40% ${pc(1 - p)} -40% -40%)` }
          }
          return unit('fxu' + (M?.unit === 'word' ? ' mk' : ''), `w${it.word}`, ws, f.masked.word,
            w.glyphs.map((gi) => {
              const g = units.glyphs[gi]!
              const ls = f.letter ? stateStyle(f.letter[g.letter], f.revealFrom.letter, A, fill, shadow) : undefined
              return unit('fxc', gi, ls, f.masked.letter, copy ? g.ch : charEl(gi))
            }),
            !copy && M?.unit === 'word' ? stroke(f.marker?.[it.word]) : null)
        }), !copy && M?.unit === 'line' ? stroke(f.marker?.[li]) : null),
    ]
  })

  // Karaoke fill: the text again in the fill colour, each word cut to how far it is spoken
  const fillCopy = fx.fill && f.fill?.some((p) => p > 0)
    ? <span className="fxs" aria-hidden style={{ color: css(fx.fill.color ?? A) }}>{tree('fill')}</span>
    : null

  // Light sweep: a band moving across, as a mask on a bright copy of the text; on the
  // top lines only (each line's shirorekha) when it asks for that
  let sweep: ReactNode = null
  if (fx.sweep && f.sweep !== undefined) {
    const c = f.sweep
    const w = fx.sweep.width / 2
    const lit = `rgba(0,0,0,${fx.sweep.strength})`
    // Held: lit all the way behind the band, as a colour rising through the letters
    const moving = fx.sweep.hold
      ? `linear-gradient(${fx.sweep.angle}deg, ${lit} ${pc(c - w)}, transparent ${pc(c + w)})`
      : `linear-gradient(${fx.sweep.angle}deg, transparent ${pc(c - w)}, ${lit} ${pc(c)}, transparent ${pc(c + w)})`
    const st: CSSProperties = { color: css(A), maskImage: moving }
    if (fx.sweep.band === 'headline' && band) {
      const [a, b] = band
      const tops = `linear-gradient(180deg, transparent ${a.toFixed(3)}em, #000 ${a.toFixed(3)}em, #000 ${b.toFixed(3)}em, transparent ${b.toFixed(3)}em)`
      Object.assign(st, {
        maskImage: `${moving}, ${tops}`, maskComposite: 'intersect, add', maskSize: `100% 100%, 100% ${lineEm}em`,
        maskRepeat: 'no-repeat, repeat-y', maskPosition: '0 0, 0 0',
      })
    }
    sweep = <span className="fxs" aria-hidden style={st}>{tree('sweep')}</span>
  }

  // Water: the text mirrored under itself, fading, with its own ripple
  let mirror: ReactNode = null
  if (fx.reflect) {
    const R = fx.reflect
    const fade = `linear-gradient(0deg, rgba(0,0,0,${R.opacity}) 0%, transparent ${pc(R.fade)})`
    const ripple = R.waveEm * fontPx > 0.05
    mirror = <span className="fxr" aria-hidden style={{ maskImage: fade, ...(ripple ? { filter: `url(#${id}r)` } : {}) }}>{tree('mirror')}</span>
  }

  // Gold dust and petals, placed over the text's box
  const A2 = css(fx.particles?.color ?? A)
  const bits = f.particles?.filter((q) => q.opacity > NEAR).map((q, i) => (
    <span key={i} className={'fxp ' + fx.particles!.kind} style={{
      left: pc(q.left), top: pc(q.top), width: `${q.size.toFixed(3)}em`, height: `${(q.size * (fx.particles!.kind === 'petal' ? 0.62 : 1)).toFixed(3)}em`,
      opacity: q.opacity, background: A2, ...(fx.particles!.kind === 'dust' ? { boxShadow: `0 0 ${(q.size * 2).toFixed(3)}em ${A2}` } : {}),
      transform: `translate(-50%, -50%) translate(${q.dx.toFixed(3)}em, ${q.dy.toFixed(3)}em) rotate(${q.rotate.toFixed(1)}deg)`,
    }} />
  ))

  const mask = fx.mask && f.mask !== undefined ? maskStyle(fx.mask, f.mask) : undefined
  // The bright line riding the wipe's edge, while it moves
  const edges = fx.mask?.edge && f.mask !== undefined && f.mask > NEAR && f.mask < 1 - NEAR ? edgesAt(fx.mask, f.mask) : []
  const edgeColor = css(fx.mask?.edge?.color ?? A)
  const bend = (f.warp ?? 0) * fontPx
  const warp = !!fx.warp && bend > 0.05
  const dissolve = fx.dissolve && f.dissolve !== undefined && f.dissolve < 1 - NEAR ? f.dissolve : undefined
  const outer: CSSProperties = {
    padding: `${PAD}em`, margin: `-${PAD}em`,
    ...(mask ?? {}),
    ...(warp || dissolve !== undefined ? { filter: `url(#${id})` } : {}),
  }

  // Bar and box: drawn before the text shows, so on their own layers, as the particles
  const outFade = ms > durMs / 2 && (f.whole?.opacity ?? 1) < 1 ? { opacity: f.whole!.opacity } : {}
  const X = fx.box
  const boxEl = X && f.box ? (
    <span className="fxpl back" style={{ inset: `${PAD}em`, ...outFade }}>
      <span className="fxbox" style={{
        border: `${X.widthEm}em solid ${css(X.color ?? A)}`, background: X.fill ? css(X.color ?? A, X.fill) : undefined,
        transform: `scale(${f.box.sx.toFixed(4)}, ${f.box.sy.toFixed(4)})`,
      }} />
    </span>
  ) : null
  const barEl = fx.bar && f.bar ? (
    <span className="fxbar" style={{ inset: `${PAD - 0.16}em ${PAD - 0.08}em`, background: css(fx.bar.color ?? A), transform: `scaleX(${f.bar.scale.toFixed(4)})`, transformOrigin: `${f.bar.origin} center` }} />
  ) : null

  return (
    <span className="fxm" style={outer}>
      {boxEl}
      <span className="fxw" style={stateStyle(f.whole, f.revealFrom.whole, A, fill, shadow)}>
        {mirror}
        {tree(false)}
        {fillCopy}
        {sweep}
      </span>
      {bits?.length ? (
        // Its own layer over the text: the text's way in must not hide the dust that builds it,
        // but its way out takes the particles with it
        <span className="fxpl" style={{ inset: `${PAD}em`, ...outFade }}>{bits}</span>
      ) : null}
      {barEl}
      {edges.map((x, i) => (
        <span key={`e${i}`} className="fxedge" style={{ left: pc(x), top: `${PAD * 0.6}em`, bottom: `${PAD * 0.6}em`, width: `${fx.mask!.edge!.widthEm}em`, background: edgeColor, boxShadow: `0 0 .3em ${edgeColor}` }} />
      ))}
      {(warp || dissolve !== undefined || mirror) && (
        <svg className="fxsvg" width="0" height="0" aria-hidden>
          {(warp || dissolve !== undefined) && (
            <filter id={id} x="-25%" y="-50%" width="150%" height="200%" colorInterpolationFilters="sRGB">
              {warp && bendNodes(fx.warp!.sizeEm * fontPx, !!fx.warp!.wave, fx.seed, (f.drift ?? 0) * fontPx, bend, 'SourceGraphic', 'bent')}
              {dissolve !== undefined && <>
                <feTurbulence type="fractalNoise" seed={(fx.seed + 17) % 1000} baseFrequency={(1 / (fx.dissolve!.sizeEm * fontPx)).toFixed(5)} numOctaves={3} result="dn" />
                {/* Alpha from the noise: shown where it is below the threshold, with a soft edge */}
                <feColorMatrix in="dn" type="matrix" result="da" values={dissolveMatrix(dissolve, fx.dissolve!.soft)} />
                <feComposite in={warp ? 'bent' : 'SourceGraphic'} in2="da" operator="in" />
              </>}
            </filter>
          )}
          {mirror && (
            <filter id={`${id}r`} x="-10%" y="-20%" width="120%" height="140%" colorInterpolationFilters="sRGB">
              {bendNodes(fx.reflect!.sizeEm * fontPx, true, fx.seed + 5, (f.ripple ?? 0) * fontPx, fx.reflect!.waveEm * fontPx, 'SourceGraphic', 'rip')}
            </filter>
          )}
        </svg>
      )}
    </span>
  )
}

/** Noise that bends what comes in: broad horizontal waves (wave) or bends in every direction */
function bendNodes(size: number, wave: boolean, seed: number, drift: number, scale: number, input: string, result: string) {
  return <>
    <feTurbulence type="fractalNoise" seed={seed % 1000}
      baseFrequency={wave ? `${(0.12 / size).toFixed(5)} ${(1 / size).toFixed(5)}` : `${(1 / size).toFixed(5)}`} numOctaves={2} result={`${result}n`} />
    {/* Solid noise; a wave bends sideways only (green held at the middle: no up or down) */}
    <feColorMatrix in={`${result}n`} type="matrix" result={`${result}c`}
      values={wave ? '1 0 0 0 0  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 1' : '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1'} />
    <feOffset in={`${result}c`} dx={drift.toFixed(2)} dy="0" result={`${result}m`} />
    <feDisplacementMap in={input} in2={`${result}m`} scale={scale.toFixed(2)} xChannelSelector="R" yChannelSelector="G" result={result} />
  </>
}

/** Alpha = clamp((t − noise) / soft): nothing shows at open 0, everything at open 1 */
function dissolveMatrix(open: number, soft: number): string {
  const s = Math.max(0.02, soft)
  const t = open * (1 + s)
  return `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${(-1 / s).toFixed(4)} 0 0 0 ${(t / s).toFixed(4)}`
}
