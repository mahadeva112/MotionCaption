import { memo, useEffect, useMemo, useRef, useState } from 'react'

import { compileCue, type CompiledCue } from '@core/compile'
import type { Look } from '@core/look'
import { presetById } from '@core/presets'
import { fontHeight, hasGlyphs, measure } from './fonts'
import { lookOf } from './model'
import { TEMPLATE_GROUPS, TEMPLATES, type SuperTemplate, type TemplateGroup, type TemplateLevel } from './templates'
import { Caption } from './Viewer'

// The Templates tab of the library: ready-made supers in groups, simple and advanced. Each
// card is the template drawn by the preview itself (Viewer's Caption), so it shows exactly
// what is added; the pointer on a card plays it.

type Group = 'All' | TemplateGroup
type Level = 'all' | TemplateLevel

const noop = () => {}
/** Cards are drawn on a wide frame: the templates are laid out for one, and a tall card is too small to read */
const THUMB_ASPECT = 16 / 9

/** A template as a caption from 0 ms, on the supers' look */
export function compileTemplate(t: SuperTemplate, base: Look, aspect: number): CompiledCue | null {
  try {
    return compileCue({ n: 1, index: 1, startMs: 0, endMs: t.ms, raw: t.text, text: t.text, line: 0 }, t.preset, {
      look: lookOf(base, { 1: { words: {}, look: t.look } }, 1), words: t.words?.(t.text) ?? {}, measure, aspect, hasGlyphs, fontHeight,
    })
  } catch {
    return null
  }
}

/** Where a card rests: after every part has come in, before the way out */
const restMs = (ms: number) => Math.min(ms * 0.6, 2600)

/** One template drawn at the card's size; it plays while the pointer is on it */
const Thumb = memo(function Thumb({ t, base, aspect, playing }: { t: SuperTemplate; base: Look; aspect: number; playing: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const block = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(0)
  const [ms, setMs] = useState(() => restMs(t.ms))
  const cue = useMemo(() => compileTemplate(t, base, aspect), [t, base, aspect])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (!playing) { setMs(restMs(t.ms)); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => { setMs((now - t0) % (t.ms + 400)); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, t.ms])

  const H = W / aspect
  return (
    <div ref={box} className="tthumb" style={{ aspectRatio: String(aspect) }} aria-hidden="true">
      {cue && W > 0 && ms < t.ms && (
        <Caption cue={cue} ms={ms} W={W} H={H} aspect={aspect} selWord={null} blockRef={block} onDown={noop} onMove={noop} onUp={noop} moving={playing} />
      )}
    </div>
  )
})

export function TemplateLibrary({ onPick, base }: {
  /** Adds the template as a super at the playhead; null when supers are not what is being edited */
  onPick: ((id: string) => void) | null
  base: Look
}) {
  const [level, setLevel] = useState<Level>('all')
  const [group, setGroup] = useState<Group>('All')
  const [q, setQ] = useState('')
  const [hover, setHover] = useState<string | null>(null)

  const query = q.trim().toLowerCase()
  const byLevel = TEMPLATES.filter((t) => level === 'all' || t.level === level)
  const shown = byLevel.filter((t) => (group === 'All' || t.group === group)
    && (!query || `${t.name} ${t.desc} ${t.group} ${t.text} ${t.level}`.toLowerCase().includes(query)))
  const count = (g: Group) => (g === 'All' ? byLevel.length : byLevel.filter((t) => t.group === g).length)

  return (
    <>
      <div className="libtop">
        <input className="search" type="search" placeholder={`Search ${TEMPLATES.length} templates`} value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && shown[0] && onPick) onPick(shown[0].id) }} />
        <div className="chips lvl">
          {([['all', 'All'], ['simple', 'Simple'], ['advanced', 'Advanced']] as [Level, string][]).map(([v, label]) => (
            <button key={v} className={level === v ? 'on' : ''} onClick={() => setLevel(v)}
              title={v === 'advanced' ? 'Shapes around the text (bars, plates, frames, light) that come in on their own. Shown in Resolve with Finished clips.' : undefined}>
              {label}<span>{v === 'all' ? TEMPLATES.length : TEMPLATES.filter((t) => t.level === v).length}</span>
            </button>
          ))}
        </div>
        <div className="chips">
          {(['All', ...TEMPLATE_GROUPS] as Group[]).map((g) => (
            <button key={g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>{g}<span>{count(g)}</span></button>
          ))}
        </div>
      </div>
      {!onPick && <p className="hint2 pad warn2">Templates add supers: pick “Supers made here” in Read from, on the timeline bar, to use them.</p>}
      <div className="ttiles" onMouseLeave={() => setHover(null)}>
        {shown.map((t) => (
          <button key={t.id} type="button" className="tcard" aria-disabled={!onPick}
            title={t.desc + (t.look.backdrop?.on ? ' Full-frame background is included in Finished clips.' : '')}
            onClick={() => onPick?.(t.id)} onMouseEnter={() => setHover(t.id)}>
            <Thumb t={t} base={base} aspect={THUMB_ASPECT} playing={hover === t.id} />
            <span className="tcard-name">{t.name}</span>
            <span className="tcard-meta">
              <i className={t.level === 'advanced' ? 'adv' : ''}>{t.level === 'advanced' ? 'Advanced' : 'Simple'}</i>
              {t.look.backdrop?.on && <i className="adv">Background</i>}
              {t.group} · {presetById(t.preset)?.name ?? t.preset} · {(t.ms / 1000).toFixed(1)} s
            </span>
          </button>
        ))}
        {!shown.length && <p className="hint2">No template matches “{q}”.</p>}
      </div>
    </>
  )
}
