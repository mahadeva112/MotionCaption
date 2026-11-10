import { useState, type ReactNode } from 'react'
import { DEFAULT_HIGHLIGHT, DEFAULT_MOTION, type Highlight, type Look, type Motion, type Rgb, type WordLook } from '@core/look'
import { FAMILIES, PRESETS, presetById } from '@core/presets'
import type { FontFamily } from './fonts'
import { hex, rgb, SWATCHES, timecode, type SafeArea, type Scope } from './model'

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
  motion: Motion
  onMotion: (m: Partial<Motion>) => void
  safe: SafeArea
  onSafe: (s: SafeArea) => void
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
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
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
  const fam = p.fonts.find((f) => f.family === L.font)
  const styles = fam?.styles.length ? fam.styles : ['Regular', 'Bold']

  // ↺ for Look settings: back to the picked Style (or the app's default where it says nothing)
  const B = p.base
  const lk = (...keys: (keyof Look)[]): R => ({
    dirty: keys.some((k) => !same(L[k], B[k])),
    reset: () => p.onLook(Object.fromEntries(keys.map((k) => [k, B[k]])) as Partial<Look>),
  })
  const sub = <K extends 'outline' | 'shadow' | 'box'>(k: K, f: keyof Look[K]): R => ({
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
              <p className="hint2">Changes this caption only. The subtitle track in Resolve is not touched.
                {p.caption.edited && <> <button className="link" onClick={() => p.onText(null)}>Undo my changes</button></>}</p>
            </Section>
            <Section title="Timing" right={`${p.fps} fps`}>
              <Row label="Start"><span className="ro">{timecode(p.caption.startMs, p.fps)}</span></Row>
              <Row label="End"><span className="ro">{timecode(p.caption.endMs, p.fps)}</span></Row>
              <Row label="Length"><span className="ro">{((p.caption.endMs - p.caption.startMs) / 1000).toFixed(2)} s</span></Row>
              <p className="hint2">Times come from the subtitle track. Change them in Resolve, then click MotionCaption there to refresh.</p>
            </Section>
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
            </Section>
            <Section title="Out" right="all captions" r={mo('out', 'outMs')}>
              <Seg label="Animation" value={p.motion.out} r={mo('out')} onChange={(v) => p.onMotion({ out: v })}
                opts={[['preset', 'As designed'], ['none', 'None'], ['fade', 'Fade'], ['slide', 'Slide'], ['zoom', 'Zoom']]} />
              {p.motion.out !== 'preset' && p.motion.out !== 'none' && (
                <Slider label="Length ms" value={p.motion.outMs} r={mo('outMs')} min={80} max={1000} step={10} onChange={(v) => p.onMotion({ outMs: v })} />
              )}
            </Section>
            <p className="hint2 pad">Speed and Out apply to all captions. Pick an animation for a few captions by selecting them on the timeline first.</p>
          </>
        )}
      </div>
    </aside>
  )
}
