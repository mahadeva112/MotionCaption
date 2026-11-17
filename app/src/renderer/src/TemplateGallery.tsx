// The Templates button on the timeline bar and its gallery: ready-made supers in groups,
// each on a small frame drawn with its own look, so you see what you get before you add it.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

import { applyCase, DEFAULT_LOOK, type Look, type Rgb, type WordLook } from '@core/look'
import { presetById } from '@core/presets'
import { Icon } from './Icon'
import { TEMPLATE_GROUPS, TEMPLATES, type SuperTemplate, type TemplateGroup } from './templates'

const rgb = (c: Rgb, a = 1) => `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${a})`

/** Lengths in the thumbnail scale with its width (container query units) */
const cw = (share: number) => `${share * 100}cqw`
const ch = (share: number) => `${share * 56.25}cqw`
/** Same edge margins the layout uses (core/look centerOf) */
const EDGE = 0.07

/** A super drawn small with its look, roughly where Resolve puts it */
function Thumb({ t }: { t: SuperTemplate }) {
  const look: Look = { ...DEFAULT_LOOK, ...t.look }
  const words: Record<number, WordLook> = t.words?.(t.text) ?? {}
  const em = look.size * 0.74
  const col = look.anchor % 3
  const row = Math.floor(look.anchor / 3)
  const pos: CSSProperties = {}
  const tf: string[] = []
  if (col === 0) pos.left = cw(EDGE + look.x)
  else if (col === 2) pos.right = cw(EDGE - look.x)
  else { pos.left = cw(0.5 + look.x); tf.push('translateX(-50%)') }
  if (row === 0) pos.top = ch(0.1 - look.y)
  else if (row === 2) pos.bottom = ch(0.16 + look.y)
  else { pos.top = ch(0.5 - look.y); tf.push('translateY(-50%)') }

  const o = look.outline
  const text: CSSProperties = {
    fontFamily: `'${look.font}', 'Nirmala UI', sans-serif`,
    fontWeight: /bold|black|heavy/i.test(look.style) ? 700 : /light|thin/i.test(look.style) ? 300 : 400,
    fontStyle: /italic/i.test(look.style) ? 'italic' : 'normal',
    fontSize: cw(em),
    letterSpacing: `${(look.tracking - 1) * 0.6}em`,
    color: rgb(look.fill),
    textAlign: look.align,
    lineHeight: 1.2,
    textShadow: look.shadow.on ? `0 ${look.shadow.distance * 0.08}em ${look.shadow.blur * 0.3}em ${rgb(look.shadow.color, look.shadow.opacity)}` : undefined,
    WebkitTextStroke: o.on ? `${Math.max(0.05, o.width * 1.4)}em ${rgb(o.color)}` : undefined,
    paintOrder: 'stroke fill',
    maxWidth: cw(look.maxWidth),
  }
  const b = look.box
  const boxed: CSSProperties = b.on
    ? { background: rgb(b.color, b.opacity), borderRadius: `${Math.min(b.round, 1.2)}em`, padding: `${b.pad * 0.45}em ${b.pad * 0.8}em` }
    : {}

  // Lines as Text+ will break them (roughly): kept, one line, or as written
  const raw = applyCase(t.text, look.textCase)
  const lines = look.lines === 'keep' ? raw.split('\n') : [raw.replace(/\n/g, ' ')]
  let wi = 0
  return (
    <div className="tthumb" aria-hidden="true">
      <div className="tsup" style={{ ...pos, transform: tf.join(' ') || undefined, ...text, ...boxed }}>
        {lines.map((line, li) => (
          <div key={li} className="tline">
            {line.split(/\s+/).filter(Boolean).map((w, i) => {
              const wl = words[wi++]
              const s: CSSProperties = wl ? {
                fontSize: wl.scale ? `${wl.scale}em` : undefined,
                color: wl.color ? rgb(wl.color) : undefined,
                background: wl.box ? rgb(wl.box) : undefined,
                borderRadius: wl.box ? '0.18em' : undefined,
                padding: wl.box ? '0 0.22em' : undefined,
              } : {}
              return <span key={i} style={s}>{i ? ' ' : ''}{w}</span>
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

type Tab = 'All' | TemplateGroup

export function TemplateGallery({ onPick }: { onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('All')
  const [q, setQ] = useState('')
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const find = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState<CSSProperties>({})

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return TEMPLATES.filter((t) => (tab === 'All' || t.group === tab)
      && (!s || `${t.name} ${t.desc} ${t.group} ${t.text}`.toLowerCase().includes(s)))
  }, [tab, q])

  // Under the button, or above it when there is no room; inside the window
  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const width = Math.min(720, innerWidth - 16)
    const below = innerHeight - r.bottom - 12, above = r.top - 12
    const up = below < 360 && above > below
    const maxHeight = Math.min(560, up ? above : below)
    const left = Math.max(8, Math.min(r.left, innerWidth - width - 8))
    setPos({ left, width, maxHeight, ...(up ? { bottom: innerHeight - r.top + 6 } : { top: r.bottom + 6 }) })
    find.current?.focus()
  }, [open])
  // Close on a click elsewhere, Escape, or a resize
  useEffect(() => {
    if (!open) return
    const down = (e: globalThis.MouseEvent) => {
      const n = e.target as Node
      if (!pop.current?.contains(n) && !btn.current?.contains(n)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    const close = () => setOpen(false)
    addEventListener('mousedown', down)
    addEventListener('keydown', key, true)
    addEventListener('resize', close)
    return () => { removeEventListener('mousedown', down); removeEventListener('keydown', key, true); removeEventListener('resize', close) }
  }, [open])

  const pick = (id: string) => { setOpen(false); onPick(id); btn.current?.blur() }
  const count = (g: Tab) => (g === 'All' ? TEMPLATES.length : TEMPLATES.filter((t) => t.group === g).length)

  return (
    <>
      <button ref={btn} type="button" className={'mini tmplbtn' + (open ? ' open' : '')} onClick={() => setOpen((v) => !v)}
        title="Ready-made supers: pick one to add it at the playhead, then change anything">
        <Icon name="grid" />Templates
      </button>
      {open && createPortal(
        <div ref={pop} className="tgal" style={pos} role="dialog" aria-label="Super templates"
          onKeyDown={(e) => e.stopPropagation()}>
          <div className="tgal-head">
            <b>Super templates</b>
            <span className="tgal-sub">Added at the playhead · everything stays editable</span>
            <input ref={find} className="tgal-find" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && shown[0]) pick(shown[0].id) }} />
          </div>
          <div className="tgal-tabs">
            {(['All', ...TEMPLATE_GROUPS] as Tab[]).map((g) => (
              <button key={g} type="button" className={'tgal-tab' + (tab === g ? ' on' : '')} onClick={() => setTab(g)}>
                {g}<i>{count(g)}</i>
              </button>
            ))}
          </div>
          <div className="tgal-grid">
            {shown.map((t) => (
              <button key={t.id} type="button" className="tcard" onClick={() => pick(t.id)} title={t.desc}>
                <Thumb t={t} />
                <span className="tcard-name">{t.name}</span>
                <span className="tcard-desc">{t.desc}</span>
                <span className="tcard-meta">{presetById(t.preset)?.name ?? t.preset} · {(t.ms / 1000).toFixed(1)} s</span>
              </button>
            ))}
            {!shown.length && <div className="tgal-none">No template matches “{q}”.</div>}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
