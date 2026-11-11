import { useState, type CSSProperties, type ReactNode } from 'react'
import { DEFAULT_HIGHLIGHT, DEFAULT_MOTION, type Highlight, type Look, type Motion, type Rgb, type WordLook } from '@core/look'
import type { Pattern } from '@core/pattern'
import type { Mood, Smart } from '@core/smart'
import { EASE } from '@core/anim'
import { hasOwnOut } from '@core/compile'
import { FAMILIES, PRESETS, presetById } from '@core/presets'
import { CurveEdit } from './Curve'
import type { FontFamily } from './fonts'
import { hex, rgb, SWATCHES, timecode, type SafeArea, type Scope } from './model'

/** Animations with a way out that any caption can take (Out › From…) */
const OUTS = PRESETS.filter((x) => hasOwnOut(x.id))

export type Tab = 'Caption' | 'Look' | 'Position' | 'Words' | 'Animation'
const TABS: Tab[] = ['Caption', 'Look', 'Position', 'Words', 'Animation']

/** Ready-made looks; Save adds the current one under a name (kept on this computer) */
export const BUILT_IN_STYLES: { name: string; look: Partial<Look> }[] = [
  { name: 'Clean', look: { font: 'Open Sans', style: 'Bold', size: 0.07, textCase: 'as', fill: [1, 1, 1], outline: { on: false, width: 0.05, color: [0, 0, 0] }, shadow: { on: true, blur: 0.5, distance: 0.3, opacity: 0.6, color: [0, 0, 0] }, box: { on: false, color: [0, 0, 0], opacity: 0.55, round: 0.3, pad: 0.3 } } },
  { name: 'Reels Bold', look: { font: 'Arial Black', style: 'Regular', size: 0.08, textCase: 'upper', fill: [1, 1, 1], outline: { on: true, width: 0.08, color: [0, 0, 0] }, shadow: { on: false, blur: 0.5, distance: 0.3, opacity: 0.6, color: [0, 0, 0] }, box: { on: false, color: [0, 0, 0], opacity: 0.55, round: 0.3, pad: 0.3 } } },
  { name: 'Podcast Box', look: { font: 'Segoe UI', style: 'Bold', size: 0.06, textCase: 'as', fill: [1, 1, 1], outline: { on: false, width: 0.05, color: [0, 0, 0] }, shadow: { on: false, blur: 0.5, distance: 0.3, opacity: 0.6, color: [0, 0, 0] }, box: { on: true, color: [0.08, 0.08, 0.1], opacity: 0.8, round: 0.4, pad: 0.45 } } },
  { name: 'Cinematic', look: { font: 'Georgia', style: 'Regular', size: 0.055, textCase: 'as', tracking: 1.12, fill: [0.96, 0.94, 0.9], outline: { on: false, width: 0.05, color: [0, 0, 0] }, shadow: { on: true, blur: 1, distance: 0.1, opacity: 0.7, color: [0, 0, 0] }, box: { on: false, color: [0, 0, 0], opacity: 0.55, round: 0.3, pad: 0.3 } } },
]

interface Props {
  tab: Tab
  onTab: (t: Tab) => void
  scope: Scope
  onScope: (s: Scope) => void
  selected: number
  total: number
  look: Look
  onLook: (l: Partial<Look>) => void
  styles: { name: string; look: Partial<Look> }[]
  /** The picked Style's look over the app's defaults: where the ↺ buttons go back to */
  base: Look
  styleName: string | null
  onPickStyle: (s: { name: string; look: Partial<Look> }) => void
  onSaveStyle: (name: string) => void
  fonts: FontFamily[]
  /** The font this caption really gets, when the chosen one lacks its letters; else null */
  fontUsed: string | null
  // Caption tab
  caption: { n: number; text: string; startMs: number; endMs: number; edited: boolean } | null
  /** The caption's times, set here or on the timeline; a super is made here, other captions keep their own times
   *  as an edit (onReset puts those back) */
  timeEdit: { isSuper: boolean; onStart: (ms: number) => void; onEnd: (ms: number) => void; onDelete: () => void; onReset: (() => void) | null } | null
  fps: number
  onText: (text: string | null) => void
  // Words tab
  words: string[]
  selWord: number | null
  onSelWord: (i: number | null) => void
  wordLook: WordLook | null
  styledWords: Set<number>
  onWordLook: (w: Partial<WordLook> | null) => void
  everywhere: boolean
  onEverywhere: (b: boolean) => void
  highlight: Highlight
  onHighlight: (h: Partial<Highlight>) => void
  // Animation tab
  preset: string
  onPreset: (id: string) => void
  /** Keep this animation with the Animation tab's settings as one of My Animations */
  onSaveMine: (name: string) => void
  pattern: Pattern
  onPattern: (p: Partial<Pattern>) => void
  /** The pattern runs over all captions */
  patternOn: boolean
  onApplyPattern: () => void
  onStopPattern: () => void
  smart: Smart
  onSmart: (s: Partial<Smart>) => void
  /** What Smart Auto saw in the captions, while it is on */
  smartNote: string
  /** Library clicks add to the pattern */
  patternPick: boolean
  onPatternPick: (b: boolean) => void
  motion: Motion
  onMotion: (m: Partial<Motion>) => void
  safe: SafeArea
  onSafe: (s: SafeArea) => void
  /** Captions go in as Finished clips (drawn by the app): gradient, picture and counting show in Resolve */
  drawn: boolean
  /** Clicks in the viewer add points to the caption's path */
  pathDraw: boolean
  onPathDraw: (on: boolean) => void
}

// ── Small controls ──
/** A ↺ button: changed (lit) or as the style has it (dim), and how to put it back */
type R = { dirty: boolean; reset: () => void }
/** Same value, ignoring float noise from colour pickers and sliders */
const same = (a: unknown, b: unknown) => {
  const r = (_: string, v: unknown) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v)
  return JSON.stringify(a, r) === JSON.stringify(b, r)
}
function Rst({ r }: { r?: R }) {
  if (!r) return <i className="rst" />
  return (
    <button className={'rst' + (r.dirty ? ' on' : '')} disabled={!r.dirty} onClick={r.reset}
      title={r.dirty ? 'Back to the style' : 'As the style has it'}>↺</button>
  )
}
function Row({ label, children, wide, r }: { label: string; children: ReactNode; wide?: boolean; r?: R }) {
  return <div className={'irow' + (wide ? ' wide' : '')}><span>{label}</span>{children}<Rst r={r} /></div>
}
function Slider({ label, value, min, max, step = 0.01, fmt, onChange, r }: {
  label: string; value: number; min: number; max: number; step?: number; fmt?: (v: number) => string; onChange: (v: number) => void; r?: R
}) {
  return (
    <Row label={label} r={r}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--p': `${((value - min) / (max - min || 1)) * 100}%` } as CSSProperties} />
      <input className="num" type="number" min={min} max={max} step={step} value={Number(value.toFixed(4))}
        onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v))) }}
        title={fmt ? fmt(value) : undefined} />
    </Row>
  )
}
function Seg<T extends string>({ label, value, opts, onChange, r }: { label: string; value: T; opts: [T, string][]; onChange: (v: T) => void; r?: R }) {
  return (
    <Row label={label} wide r={r}>
      <div className="seg">{opts.map(([v, t]) => <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{t}</button>)}</div>
    </Row>
  )
}
function Color({ label, value, onChange, r }: { label: string; value: Rgb; onChange: (c: Rgb) => void; r?: R }) {
  return (
    <Row label={label} wide r={r}>
      <div className="colrow">
        <input type="color" value={hex(value)} onChange={(e) => onChange(rgb(e.target.value))} />
        {SWATCHES.map((c) => <b key={hex(c)} style={{ background: hex(c) }} className={hex(c) === hex(value) ? 'on' : ''} onClick={() => onChange(c)} />)}
      </div>
    </Row>
  )
}
function Toggle({ on, onChange, children }: { on: boolean; onChange: (b: boolean) => void; children: ReactNode }) {
  return <button className={'tg' + (on ? ' on' : '')} onClick={() => onChange(!on)}><i>✓</i>{children}</button>
}
function Section({ title, right, off, r, children }: { title: ReactNode; right?: ReactNode; off?: boolean; r?: R; children: ReactNode }) {
  return <section className={'isec' + (off ? ' off' : '')}><h6>{title}{right && <span>{right}</span>}{r && <Rst r={r} />}</h6>{children}</section>
}

export function Inspector(p: Props) {
  const L = p.look
  const [saving, setSaving] = useState<string | null>(null)
  const [savingMine, setSavingMine] = useState<string | null>(null)
  const [imgNote, setImgNote] = useState('')
  /** A picture file as a data: URL, kept with the look (so it travels with saved styles and brand kits) */
  const pickImage = (f: File | undefined) => {
    if (!f) return
    if (f.size > 1_500_000) { setImgNote('That picture is over 1.5 MB. Use a smaller PNG or SVG.'); return }
    const r = new FileReader()
    r.onload = () => { setImgNote(''); p.onLook({ image: { ...L.image, on: true, src: String(r.result) } }) }
    r.readAsDataURL(f)
  }
  const drawnNote = p.drawn ? null : <p className="hint2 warn2">Shows in Resolve only with Finished clips (Send window). Editable Text+ leaves it out.</p>
  const saveMine = () => { if (savingMine?.trim()) { p.onSaveMine(savingMine.trim()); setSavingMine(null) } }
  const fam = p.fonts.find((f) => f.family === L.font)
  const styles = fam?.styles.length ? fam.styles : ['Regular', 'Bold']

  // ↺ for Look settings: back to the picked Style (or the app's default where it says nothing)
  const B = p.base
  const lk = (...keys: (keyof Look)[]): R => ({
    dirty: keys.some((k) => !same(L[k], B[k])),
    reset: () => p.onLook(Object.fromEntries(keys.map((k) => [k, B[k]])) as Partial<Look>),
  })
  const sub = <K extends 'outline' | 'shadow' | 'box' | 'gradient' | 'image' | 'count'>(k: K, f: keyof Look[K]): R => ({
    dirty: !same(L[k][f], B[k][f]),
    reset: () => p.onLook({ [k]: { ...L[k], [f]: B[k][f] } }),
  })
  // Words go back to following the caption; highlight and motion to how the app starts
  const wd = (...keys: (keyof WordLook)[]): R => ({
    dirty: keys.some((k) => p.wordLook?.[k] !== undefined),
    reset: () => p.onWordLook(Object.fromEntries(keys.map((k) => [k, undefined]))),
  })
  const hl = (...keys: (keyof Highlight)[]): R => ({
    dirty: keys.some((k) => !same(p.highlight[k], DEFAULT_HIGHLIGHT[k])),
    reset: () => p.onHighlight(Object.fromEntries(keys.map((k) => [k, DEFAULT_HIGHLIGHT[k]]))),
  })
  const mo = (...keys: (keyof Motion)[]): R => ({
    dirty: keys.some((k) => !same(p.motion[k], DEFAULT_MOTION[k])),
    reset: () => p.onMotion(Object.fromEntries(keys.map((k) => [k, DEFAULT_MOTION[k]]))),
  })

  const scopeLabel = p.scope === 'all' ? `all ${p.total} captions` : p.scope === 'selected' ? `${p.selected} selected` : 'this caption'

  return (
    <aside className="insp">
      <div className="scope">
        <span>Apply to</span>
        <div className="seg">
          <button className={p.scope === 'all' ? 'on' : ''} onClick={() => p.onScope('all')}>All {p.total}</button>
          <button className={p.scope === 'selected' ? 'on' : ''} disabled={p.selected < 1} onClick={() => p.onScope('selected')}>Selected {p.selected}</button>
          <button className={p.scope === 'this' ? 'on' : ''} disabled={!p.caption} onClick={() => p.onScope('this')}>This caption</button>
        </div>
        <div className="style">
          {saving === null ? (
            <>
              <select className="sl" value="" title="Picking a style also sets what the ↺ buttons go back to"
                onChange={(e) => { const s = p.styles.find((x) => x.name === e.target.value); if (s) p.onPickStyle(s) }}>
                <option value="">{p.styleName ? `Style · ${p.styleName}` : 'Style…'}</option>
                {p.styles.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
              <button className="mini" onClick={() => setSaving('')}>Save</button>
            </>
          ) : (
            <>
              <input className="sl" autoFocus placeholder="Style name" value={saving} onChange={(e) => setSaving(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && saving.trim()) { p.onSaveStyle(saving.trim()); setSaving(null) } if (e.key === 'Escape') setSaving(null) }} />
              <button className="mini" disabled={!saving.trim()} onClick={() => { p.onSaveStyle(saving.trim()); setSaving(null) }}>OK</button>
            </>
          )}
        </div>
      </div>
      <div className="itabs">{TABS.map((t) => <button key={t} className={t === p.tab ? 'on' : ''} onClick={() => p.onTab(t)}>{t}</button>)}</div>
      <div className="ipane">
        {p.tab === 'Caption' && (p.caption ? (
          <>
            <Section title="Text" right={`caption ${p.caption.n}`}>
              <textarea className="textbox" value={p.caption.text} onChange={(e) => p.onText(e.target.value)} rows={3} />
              {p.timeEdit?.isSuper
                ? <p className="hint2">This super lives in the app. Send puts it in Resolve as a finished clip.</p>
                : <p className="hint2">Changes this caption only. The subtitle track in Resolve is not touched.
                  {p.caption.edited && <> <button className="link" onClick={() => p.onText(null)}>Undo my changes</button></>}</p>}
            </Section>
            {p.timeEdit && (
              <Section title="Timing" right={`${Number(p.fps.toFixed(3))} fps`}>
                <Row label="Start (s)"><SecondsInput ms={p.caption.startMs} onChange={p.timeEdit.onStart} /></Row>
                <Row label="End (s)"><SecondsInput ms={p.caption.endMs} onChange={p.timeEdit.onEnd} /></Row>
                <Row label="Length"><span className="ro">{((p.caption.endMs - p.caption.startMs) / 1000).toFixed(2)} s · {timecode(p.caption.startMs, p.fps)}</span></Row>
                {!p.timeEdit.isSuper && <p className="hint2">New times are for this caption here only; the subtitle track in Resolve is not touched.
                  {p.timeEdit.onReset && <> <button className="link" onClick={p.timeEdit.onReset}>Back to its own times</button></>}</p>}
                <button className="mini danger" onClick={p.timeEdit.onDelete}>{p.timeEdit.isSuper ? 'Delete this super' : 'Leave this caption out'}</button>
              </Section>
            )}
            <Section title="Line breaks" right={scopeLabel} r={lk('lines', 'maxWidth')}>
              <Seg label="Lines" value={L.lines} r={lk('lines')} onChange={(v) => p.onLook({ lines: v })}
                opts={[['keep', 'As in subtitles'], ['1', 'One'], ['2', 'Up to two'], ['auto', 'As needed']]} />
              <Slider label="Max width" value={L.maxWidth} r={lk('maxWidth')} min={0.3} max={1} onChange={(v) => p.onLook({ maxWidth: v })} />
            </Section>
          </>
        ) : <p className="hint2 pad">Pick a caption on the timeline.</p>)}

        {p.tab === 'Look' && (
          <>
            <Section title="Font" right={scopeLabel} r={lk('font', 'style', 'textCase', 'align')}>
              <Row label="Family" wide r={lk('font', 'style')}>
                <select className="sl" value={L.font} onChange={(e) => {
                  const f = p.fonts.find((x) => x.family === e.target.value)
                  const style = f?.styles.includes(L.style) ? L.style : (f?.styles.find((s) => /bold/i.test(s)) ?? f?.styles[0] ?? 'Regular')
                  p.onLook({ font: e.target.value, style })
                }}>
                  {!fam && <option value={L.font}>{L.font}</option>}
                  {p.fonts.map((f) => <option key={f.family} value={f.family} style={{ fontFamily: `'${f.family}'` }}>{f.family}</option>)}
                </select>
              </Row>
              <Row label="Style" wide r={lk('style')}>
                <select className="sl" value={L.style} onChange={(e) => p.onLook({ style: e.target.value })}>
                  {!styles.includes(L.style) && <option value={L.style}>{L.style}</option>}
                  {styles.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Row>
              {p.fontUsed && <p className="hint2">“{L.font}” has no letters for this caption's language, so the caption uses {p.fontUsed}, here and in Resolve.</p>}
              <Seg label="Case" value={L.textCase} r={lk('textCase')} onChange={(v) => p.onLook({ textCase: v })} opts={[['as', 'As typed'], ['upper', 'AA'], ['lower', 'aa'], ['title', 'Aa']]} />
              <Seg label="Align" value={L.align} r={lk('align')} onChange={(v) => p.onLook({ align: v })} opts={[['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]} />
            </Section>
            <Section title="Size and spacing" r={lk('size', 'tracking', 'lineSpacing')}>
              <Slider label="Size" value={L.size} r={lk('size')} min={0.02} max={0.2} step={0.001} onChange={(v) => p.onLook({ size: v })} />
              <Slider label="Letter space" value={L.tracking} r={lk('tracking')} min={0.8} max={1.6} onChange={(v) => p.onLook({ tracking: v })} />
              <Slider label="Line height" value={L.lineSpacing} r={lk('lineSpacing')} min={0.7} max={1.8} onChange={(v) => p.onLook({ lineSpacing: v })} />
            </Section>
            <Section title="Fill" r={lk('fill')}><Color label="Colour" value={L.fill} r={lk('fill')} onChange={(c) => p.onLook({ fill: c })} /></Section>
            <Section title={<>Outline <Toggle on={L.outline.on} onChange={(on) => p.onLook({ outline: { ...L.outline, on } })}>On</Toggle></>} off={!L.outline.on} r={lk('outline')}>
              <Slider label="Width" value={L.outline.width} r={sub('outline', 'width')} min={0.01} max={0.25} step={0.005} onChange={(v) => p.onLook({ outline: { ...L.outline, width: v } })} />
              <Color label="Colour" value={L.outline.color} r={sub('outline', 'color')} onChange={(c) => p.onLook({ outline: { ...L.outline, color: c } })} />
            </Section>
            <Section title={<>Shadow <Toggle on={L.shadow.on} onChange={(on) => p.onLook({ shadow: { ...L.shadow, on } })}>On</Toggle></>} off={!L.shadow.on} r={lk('shadow')}>
              <Slider label="Blur" value={L.shadow.blur} r={sub('shadow', 'blur')} min={0} max={2} onChange={(v) => p.onLook({ shadow: { ...L.shadow, blur: v } })} />
              <Slider label="Distance" value={L.shadow.distance} r={sub('shadow', 'distance')} min={0} max={2} onChange={(v) => p.onLook({ shadow: { ...L.shadow, distance: v } })} />
              <Slider label="Opacity" value={L.shadow.opacity} r={sub('shadow', 'opacity')} min={0} max={1} onChange={(v) => p.onLook({ shadow: { ...L.shadow, opacity: v } })} />
              <Color label="Colour" value={L.shadow.color} r={sub('shadow', 'color')} onChange={(c) => p.onLook({ shadow: { ...L.shadow, color: c } })} />
            </Section>
            <Section title={<>Box behind text <Toggle on={L.box.on} onChange={(on) => p.onLook({ box: { ...L.box, on } })}>On</Toggle></>} off={!L.box.on} r={lk('box')}>
              <Color label="Colour" value={L.box.color} r={sub('box', 'color')} onChange={(c) => p.onLook({ box: { ...L.box, color: c } })} />
              <Slider label="Opacity" value={L.box.opacity} r={sub('box', 'opacity')} min={0} max={1} onChange={(v) => p.onLook({ box: { ...L.box, opacity: v } })} />
              <Slider label="Corners" value={L.box.round} r={sub('box', 'round')} min={0} max={1} onChange={(v) => p.onLook({ box: { ...L.box, round: v } })} />
              <Slider label="Padding" value={L.box.pad} r={sub('box', 'pad')} min={0} max={1} onChange={(v) => p.onLook({ box: { ...L.box, pad: v } })} />
            </Section>
            <Section title={<>Gradient <Toggle on={L.gradient.on} onChange={(on) => p.onLook({ gradient: { ...L.gradient, on } })}>On</Toggle></>} off={!L.gradient.on} r={lk('gradient')}>
              <Color label="To colour" value={L.gradient.color} r={sub('gradient', 'color')} onChange={(c) => p.onLook({ gradient: { ...L.gradient, color: c } })} />
              <Slider label="Angle" value={L.gradient.angle} r={sub('gradient', 'angle')} min={0} max={360} step={5} fmt={(v) => `${v}°`}
                onChange={(v) => p.onLook({ gradient: { ...L.gradient, angle: v } })} />
              <p className="hint2">From the Fill colour to this one.</p>
              {L.gradient.on && drawnNote}
            </Section>
            <Section title={<>Picture <Toggle on={L.image.on} onChange={(on) => p.onLook({ image: { ...L.image, on } })}>On</Toggle></>} off={!L.image.on} r={lk('image')}>
              <Row label="File" wide>
                <label className="mini filebtn">{L.image.src ? 'Change…' : 'Choose a logo or picture…'}
                  <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" hidden onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = '' }} />
                </label>
                {L.image.src && <img className="imgthumb" src={L.image.src} alt="" />}
              </Row>
              {imgNote && <p className="hint2 warn2">{imgNote}</p>}
              <Slider label="Size" value={L.image.size} r={sub('image', 'size')} min={0.5} max={6} step={0.1} fmt={(v) => `${v.toFixed(1)}×`}
                onChange={(v) => p.onLook({ image: { ...L.image, size: v } })} />
              <Seg label="Place" value={L.image.place} r={sub('image', 'place')} onChange={(v) => p.onLook({ image: { ...L.image, place: v } })}
                opts={[['left', 'Left'], ['above', 'Above'], ['right', 'Right']]} />
              <p className="hint2">A PNG with a see-through background looks best. Emoji can go straight in the text.</p>
              {L.image.on && drawnNote}
            </Section>
            <Section title={<>Count up numbers <Toggle on={L.count.on} onChange={(on) => p.onLook({ count: { ...L.count, on } })}>On</Toggle></>} off={!L.count.on} r={lk('count')}>
              <Row label="Start at" r={sub('count', 'from')}>
                <input className="sl num" type="number" value={L.count.from} onChange={(e) => p.onLook({ count: { ...L.count, from: Number(e.target.value) || 0 } })} />
              </Row>
              <Slider label="Length ms" value={L.count.ms} r={sub('count', 'ms')} min={200} max={4000} step={50} onChange={(v) => p.onLook({ count: { ...L.count, ms: v } })} />
              <p className="hint2">Every number in the text counts up to its value, e.g. “1,000+ followers”.</p>
              {L.count.on && drawnNote}
            </Section>
          </>
        )}

        {p.tab === 'Position' && (
          <>
            <Section title="Place on screen" right={scopeLabel} r={lk('anchor', 'x', 'y')}>
              <div className="posrow">
                <div className="grid9">{[...Array(9)].map((_, i) => <button key={i} className={L.anchor === i ? 'on' : ''} onClick={() => p.onLook({ anchor: i })} />)}</div>
                <div>
                  <Slider label="Offset X" value={L.x} r={lk('x')} min={-0.45} max={0.45} step={0.005} onChange={(v) => p.onLook({ x: v })} />
                  <Slider label="Offset Y" value={L.y} r={lk('y')} min={-0.45} max={0.45} step={0.005} onChange={(v) => p.onLook({ y: v })} />
                </div>
              </div>
              <p className="hint2">Or drag the caption in the viewer.</p>
            </Section>
            <Section title="Transform" r={lk('rotation', 'maxWidth')}>
              <Slider label="Rotation" value={L.rotation} r={lk('rotation')} min={-30} max={30} step={0.5} onChange={(v) => p.onLook({ rotation: v })} />
              <Slider label="Max width" value={L.maxWidth} r={lk('maxWidth')} min={0.3} max={1} onChange={(v) => p.onLook({ maxWidth: v })} />
            </Section>
            <Section title="Path" right={scopeLabel} r={lk('path')}>
              <Row label="Draw" wide>
                <Toggle on={p.pathDraw} onChange={p.onPathDraw}>{p.pathDraw ? 'Click in the viewer to add points' : 'Off'}</Toggle>
              </Row>
              <Row label="Points"><span className="ro">{L.path.length ? `${L.path.length} after its place` : 'none'}</span></Row>
              <div className="btnrow">
                <button className="mini" disabled={!L.path.length} onClick={() => p.onLook({ path: L.path.slice(0, -1) })}>Remove last</button>
                <button className="mini" disabled={!L.path.length} onClick={() => p.onLook({ path: [] })}>Clear path</button>
              </div>
              <p className="hint2">The caption travels from its place through each point, over its whole time on screen. It replaces the animation's own move.</p>
            </Section>
            <Section title="Safe area" right="viewer only">
              <Row label="Show" wide>
                <select className="sl" value={p.safe} onChange={(e) => p.onSafe(e.target.value as SafeArea)}>
                  <option value="off">Off</option><option value="reels">Instagram Reels</option><option value="shorts">YouTube Shorts</option><option value="tiktok">TikTok</option>
                </select>
              </Row>
              <p className="hint2">Shows where the app puts its buttons and the account name, so captions stay readable after upload.</p>
            </Section>
          </>
        )}

        {p.tab === 'Words' && (
          <>
            <Section title="Words in this caption" right={p.caption ? `caption ${p.caption.n}` : ''}>
              <div className="chips">
                {p.words.map((w, i) => (
                  <button key={i} className={(i === p.selWord ? 'on' : '') + (p.styledWords.has(i) ? ' has' : '')} onClick={() => p.onSelWord(i === p.selWord ? null : i)}>{w}</button>
                ))}
              </div>
              <p className="hint2">Click a word here or in the viewer. Words with their own look are gold.</p>
            </Section>
            {p.selWord !== null && p.words[p.selWord] !== undefined && (() => {
              const w = p.wordLook ?? {}
              return (
                <Section title={`Word “${p.words[p.selWord]}”`} r={wd('scale', 'color', 'effect', 'raise', 'box')}>
                  <Slider label="Size" value={w.scale ?? 1} r={wd('scale')} min={0.5} max={2.5} step={0.05} onChange={(v) => p.onWordLook({ scale: v })} />
                  <Color label="Colour" value={w.color ?? L.fill} r={wd('color')} onChange={(c) => p.onWordLook({ color: c })} />
                  <Seg label="Effect" value={w.effect ?? 'none'} r={wd('effect')} onChange={(v) => p.onWordLook({ effect: v })}
                    opts={[['none', 'None'], ['pop', 'Pop'], ['shake', 'Shake'], ['bounce', 'Bounce'], ['glow', 'Glow']]} />
                  <Slider label="Raise" value={w.raise ?? 0} r={wd('raise')} min={-0.05} max={0.05} step={0.001} onChange={(v) => p.onWordLook({ raise: v })} />
                  <Row label="Box" wide r={wd('box')}>
                    <div className="colrow">
                      <Toggle on={!!w.box} onChange={(on) => p.onWordLook({ box: on ? (w.box ?? [1, 0.35, 0.21]) : undefined })}>Behind word</Toggle>
                      {w.box && <input type="color" value={hex(w.box)} onChange={(e) => p.onWordLook({ box: rgb(e.target.value) })} />}
                    </div>
                  </Row>
                  <div className="btnrow">
                    <Toggle on={p.everywhere} onChange={p.onEverywhere}>Same word in every caption</Toggle>
                  </div>
                  <div className="btnrow"><button className="mini" onClick={() => p.onWordLook(null)}>Clear word look</button></div>
                  <p className="hint2">A word's own font is not offered: Resolve's Text+ cannot mix fonts in one line.</p>
                </Section>
              )
            })()}
            <Section title="Highlight automatically" right="all captions" r={hl('rule', 'color', 'scale')}>
              <Row label="Rule" wide r={hl('rule')}>
                <select className="sl" value={p.highlight.rule} onChange={(e) => p.onHighlight({ rule: e.target.value as Highlight['rule'] })}>
                  <option value="off">Off</option><option value="last">Last word</option><option value="longest">Longest word</option>
                  <option value="numbers">Numbers</option><option value="karaoke">Word by word, as spoken</option>
                </select>
              </Row>
              <Color label="Colour" value={p.highlight.color} r={hl('color')} onChange={(c) => p.onHighlight({ color: c })} />
              {p.highlight.rule !== 'karaoke' && <Slider label="Size" value={p.highlight.scale} r={hl('scale')} min={1} max={2} step={0.05} onChange={(v) => p.onHighlight({ scale: v })} />}
              <p className="hint2">{p.highlight.rule === 'karaoke'
                ? 'Each word lights up in turn across the caption, timed by its length.'
                : 'A word with its own look wins over the rule.'}</p>
            </Section>
          </>
        )}

        {p.tab === 'Animation' && (
          <>
            <Section title="In" right={scopeLabel} r={mo('speed', 'stepMs')}>
              <Row label="Animation" wide>
                <select className="sl" value={p.preset} onChange={(e) => p.onPreset(e.target.value)}>
                  {FAMILIES.map((f) => (
                    <optgroup key={f} label={f}>{PRESETS.filter((x) => x.family === f).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
                  ))}
                </select>
              </Row>
              <Slider label="Speed" value={p.motion.speed} r={mo('speed')} min={0.5} max={2} step={0.05} onChange={(v) => p.onMotion({ speed: v })} />
              {presetById(p.preset)?.letters && (
                <Slider label="Letter gap ms" value={p.motion.stepMs ?? presetById(p.preset)!.letters!.stepMs} r={mo('stepMs')} min={5} max={150} step={1}
                  onChange={(v) => p.onMotion({ stepMs: v })} />
              )}
              {savingMine === null
                ? <button className="mini" onClick={() => setSavingMine('')} title="Keeps this animation with its speed, way out and curves under a name: Animations › Mine">
                  Save as My Animation…</button>
                : <div className="irow wide"><span>Name</span>
                  <input className="sl" autoFocus placeholder="e.g. Hook slam" value={savingMine} onChange={(e) => setSavingMine(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveMine(); if (e.key === 'Escape') setSavingMine(null) }} />
                  <button className="mini" disabled={!savingMine.trim()} onClick={saveMine}>Save</button></div>}
            </Section>
            <SmartSection {...p} />
            <PatternSection {...p} />
            <Section title="Out" right="all captions" r={mo('out', 'outMs', 'outFrom')}>
              <Seg label="Animation" value={p.motion.out} r={mo('out')} onChange={(v) => p.onMotion({ out: v, ...(v === 'other' && !p.motion.outFrom ? { outFrom: OUTS[0]?.id } : {}) })}
                opts={[['preset', 'As designed'], ['none', 'None'], ['fade', 'Fade'], ['slide', 'Slide'], ['zoom', 'Zoom'], ['other', 'From…']]} />
              {p.motion.out === 'other' && (
                <Row label="Leave like" wide r={mo('outFrom')}>
                  <select className="sl" value={p.motion.outFrom ?? ''} onChange={(e) => p.onMotion({ outFrom: e.target.value })}
                    title="Captions come in with their own animation and leave the way this one does">
                    {FAMILIES.map((f) => {
                      const list = OUTS.filter((x) => x.family === f)
                      return list.length ? <optgroup key={f} label={f}>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup> : null
                    })}
                  </select>
                </Row>
              )}
              {p.motion.out !== 'preset' && p.motion.out !== 'none' && p.motion.out !== 'other' && (
                <Slider label="Length ms" value={p.motion.outMs} r={mo('outMs')} min={80} max={1000} step={10} onChange={(v) => p.onMotion({ outMs: v })} />
              )}
            </Section>
            <Section title="Speed curves" right="all captions" r={mo('easeIn', 'easeOut')}>
              <CurveEdit label="Coming in" value={p.motion.easeIn} typical={EASE.out} onChange={(b) => p.onMotion({ easeIn: b })} />
              <CurveEdit label="Going out" value={p.motion.easeOut} typical={EASE.in} onChange={(b) => p.onMotion({ easeOut: b })} />
            </Section>
            <p className="hint2 pad">Speed, Out and the curves apply to all captions. Pick an animation for a few captions by selecting them on the timeline first.</p>
          </>
        )}
      </div>
    </aside>
  )
}

/** Smart Auto: every caption gets an animation that suits what it says and how long it shows */
function SmartSection(p: Props) {
  const S = p.smart
  return (
    <Section title={<>Smart Auto {S.on && <i className="badge">on</i>}</>} right={`all ${p.total} captions`}>
      <Seg<Mood> label="Mood" value={S.mood} onChange={(v) => p.onSmart({ mood: v })}
        opts={[['calm', 'Calm'], ['energetic', 'Energetic'], ['cinematic', 'Cinematic']]} />
      {S.on && p.smartNote && <p className="hint2">Found {p.smartNote}.</p>}
      <div className="btnrow">
        <button className="go" disabled={S.on || !p.total} onClick={() => p.onSmart({ on: true })}>{S.on ? `On for all ${p.total}` : `Turn on for all ${p.total}`}</button>
        {S.on && <button className="mini" title="Another draw from the same mood" onClick={() => p.onSmart({ seed: S.seed + 1 })}>Shuffle</button>}
        {S.on && <button className="mini" title="All captions get the one animation picked above again" onClick={() => p.onSmart({ on: false })}>Turn off</button>}
      </div>
      <p className="hint2">Each caption gets an animation that suits it: the first line comes in as a hook, short strong lines hit,
        long lines come in quietly so they can be read, never the same one twice in a row. With Highlight off, a number or the word
        with “!” lights up. A caption you then give its own animation keeps it.</p>
    </Section>
  )
}

/** Animations that take turns over the captions, chunk by chunk: pick them, how many
 *  captions share one, in order or at random, then apply */
function PatternSection(p: Props) {
  const P = p.pattern
  const ids = P.ids
  const name = (id: string) => presetById(id)?.name ?? id
  const toSel = p.scope === 'selected' && p.selected > 0
  const n = toSel ? p.selected : p.total
  // What the first chunks get, e.g. "1–2 Fade · 3–4 Pop · 5–6 Rise …"
  const every = Math.max(1, P.every)
  const shown = P.order === 'seq' ? Math.min(ids.length, Math.ceil(n / every)) : 0
  const sample = Array.from({ length: shown }, (_, k) => {
    const a = k * every + 1
    const b = Math.min(n, a + every - 1)
    return `${a === b ? a : `${a}–${b}`} ${name(ids[k]!)}`
  }).join(' · ') + (shown && shown * every < n ? ' · …' : '')
  return (
    <Section title={<>Pattern {p.patternOn && <i className="badge">on</i>}</>}
      right={toSel ? `${p.selected} selected` : `all ${p.total} captions`}>
      <div className="pchips">
        {ids.map((id, i) => (
          <span key={i} className="pchip">
            <em>{i + 1}</em>{name(id)}
            {i > 0 && <button title="Earlier" onClick={() => { const x = [...ids]; [x[i - 1], x[i]] = [x[i]!, x[i - 1]!]; p.onPattern({ ids: x }) }}>‹</button>}
            <button title="Take out" onClick={() => p.onPattern({ ids: ids.filter((_, j) => j !== i) })}>✕</button>
          </span>
        ))}
        {!ids.length && <span className="hint2">No animations yet. Add two or more.</span>}
      </div>
      <Row label="Add" wide>
        <select className="sl" value="" onChange={(e) => { if (e.target.value) p.onPattern({ ids: [...ids, e.target.value] }) }}>
          <option value="">+ Add an animation…</option>
          {FAMILIES.map((f) => (
            <optgroup key={f} label={f}>{PRESETS.filter((x) => x.family === f).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
          ))}
        </select>
      </Row>
      <div className="btnrow" style={{ marginTop: 2 }}>
        <Toggle on={p.patternPick} onChange={p.onPatternPick}>Add by clicking in the library</Toggle>
      </div>
      <Slider label="Captions per chunk" value={P.every} min={1} max={10} step={1} onChange={(v) => p.onPattern({ every: Math.max(1, Math.round(v)) })} />
      <Seg label="Order" value={P.order} onChange={(v) => p.onPattern({ order: v })} opts={[['seq', 'In turn'], ['random', 'Random']]} />
      {sample && <p className="hint2">{sample}</p>}
      {P.order === 'random' && ids.length > 1 && <p className="hint2">Never the same animation twice in a row.</p>}
      <div className="btnrow">
        <button className="go" disabled={!ids.length} onClick={p.onApplyPattern}>
          {toSel ? `Apply to ${p.selected} selected` : p.patternOn ? `On for all ${p.total}` : `Apply to all ${p.total}`}
        </button>
        {P.order === 'random' && ids.length > 1 && <button className="mini" onClick={() => p.onPattern({ seed: P.seed + 1 })}>Shuffle again</button>}
        {p.patternOn && <button className="mini" title="All captions get the one animation picked above again" onClick={p.onStopPattern}>Turn off</button>}
        {ids.length > 0 && <button className="mini" onClick={() => p.onPattern({ ids: [] })}>Clear</button>}
      </div>
      <p className="hint2">{p.patternOn
        ? 'Changes here show at once. Captions added later in Resolve get the pattern too. A caption you give its own animation keeps it.'
        : 'On all captions it stays live: new captions get it too. On selected captions each one gets its animation as its own.'}</p>
    </Section>
  )
}

/** Seconds, typed: takes the value when it is a number, and shows the real one again on leaving */
function SecondsInput({ ms, onChange }: { ms: number; onChange: (ms: number) => void }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <input className="secs" type="number" min={0} step={0.1} value={text ?? (ms / 1000).toFixed(2)}
      onChange={(e) => { setText(e.target.value); const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0) onChange(Math.round(v * 1000)) }}
      onBlur={() => setText(null)} />
  )
}
