import type { CSSProperties } from 'react'
import type { Family, Preset } from '@core/presets'

// One look for an animation tile: the preset's own name, set in a type that
// hints at its feel, moving on hover (a hint; the viewer shows the real motion).

const FAMILY: Record<Family, { m: string; s: CSSProperties }> = {
  Basic: { m: 'm-fade', s: { fontFamily: "'Segoe UI', sans-serif", fontWeight: 800 } },
  Social: { m: 'm-pop', s: { fontFamily: "'Arial Black', sans-serif", color: 'var(--mc)', transform: 'rotate(-3deg)', textTransform: 'uppercase' } },
  Cinematic: { m: 'm-blur', s: { fontFamily: 'Georgia, serif', textTransform: 'uppercase', letterSpacing: '.05em', fontSize: '10.5px', color: '#f1e6d6' } },
  Elegant: { m: 'm-rise', s: { fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 600 } },
  Letters: { m: 'm-type', s: { fontFamily: 'Consolas, monospace', fontWeight: 700, textTransform: 'uppercase', fontSize: '11px' } },
  Continuous: { m: 'm-drift', s: { fontFamily: "'Segoe UI', sans-serif", fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.18em', fontSize: '10px' } },
  'Indic Flow': { m: 'm-rise', s: { fontFamily: "'Nirmala UI', 'Segoe UI', sans-serif", fontWeight: 700, color: '#ffe2b0' } },
  Calm: { m: 'm-fade', s: { fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 500, color: '#f6e7cf', letterSpacing: '.03em' } },
  'Mask & Wipe': { m: 'm-rise', s: { fontFamily: "'Segoe UI', sans-serif", fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', fontSize: '11px', color: '#bfe3ff' } },
  'Light & Glow': { m: 'm-blur', s: { fontFamily: "'Segoe UI', sans-serif", fontWeight: 800, color: '#fff3d6', textShadow: '0 0 8px rgba(255,200,120,.9), 0 0 18px rgba(255,140,60,.5)' } },
  Advanced: { m: 'm-blur', s: { fontFamily: 'Georgia, serif', fontWeight: 700, color: '#ffd27a', textShadow: '0 0 10px rgba(255,190,90,.55)' } },
}

/** A few presets get their own type, so the best-known ones read at a glance */
const OWN: Record<string, { m?: string; s: CSSProperties }> = {
  pop: { m: 'm-pop', s: { fontFamily: "'Arial Black', sans-serif", color: 'var(--mc)', transform: 'rotate(-3deg)', textTransform: 'uppercase' } },
  rise: { m: 'm-rise', s: {} },
  punch: { m: 'm-slam', s: { fontFamily: "'Arial Black', sans-serif", textTransform: 'uppercase' } },
  slam: { m: 'm-slam', s: { fontFamily: 'Impact, sans-serif', color: '#f3a456', textTransform: 'uppercase', letterSpacing: '.04em', fontSize: '15px' } },
  impact: { m: 'm-shake', s: { fontFamily: 'Impact, sans-serif', textTransform: 'uppercase', letterSpacing: '.03em', fontSize: '16px' } },
  spotlight: { m: 'm-fade', s: { fontFamily: "'Segoe UI', sans-serif", fontWeight: 700, textTransform: 'uppercase', color: '#ffd9a8', textShadow: '0 0 10px rgba(232,134,42,.9), 0 0 22px rgba(255,90,54,.6)' } },
  blurRise: { m: 'm-blur', s: { fontFamily: "'Segoe UI', sans-serif", fontWeight: 800, letterSpacing: 0, textTransform: 'none', fontSize: '14px', color: '#fff' } },
  dream: { m: 'm-blur', s: { fontFamily: 'Georgia, serif', fontStyle: 'italic', textTransform: 'none', letterSpacing: '.04em', fontSize: '13px' } },
  drift: { m: 'm-drift', s: {} },
  typewriter: { m: 'm-type', s: {} },
}

interface TileProps {
  preset: Preset
  on: boolean
  big?: boolean
  onPick: (id: string) => void
  onHover?: (id: string) => void
  /** Starred: shows under Favourites */
  fav?: boolean
  onFav?: () => void
  /** One of My Animations: its own name, and what it is made from */
  label?: string
  sub?: string
  onRemove?: () => void
}

export function PresetTile({ preset, on, big, onPick, onHover, fav, onFav, label, sub, onRemove }: TileProps) {
  const f = FAMILY[preset.family]
  const own = OWN[preset.id]
  const style: CSSProperties = { ...f.s, ...own?.s }
  if (big && style.fontSize) style.fontSize = `calc(${style.fontSize} * 1.25)`
  return (
    <button className={'ptile' + (on ? ' on' : '') + (big ? ' big' : '')} title={label ? `${label}: ${preset.name}. ${preset.desc}` : preset.desc}
      onClick={() => onPick(preset.id)} onMouseEnter={() => onHover?.(preset.id)}>
      <span className="pthumb"><b className={own?.m ?? f.m} style={style}>{label ?? preset.name}{!label && preset.id === 'typewriter' ? '_' : ''}</b></span>
      <span className="pmeta"><em>{sub ?? preset.family}</em>{preset.status === 'testing' && <i>Testing</i>}</span>
      {onFav && <span className={'pfav' + (fav ? ' on' : '')} role="button" title={fav ? 'Take out of Favourites' : 'Add to Favourites'}
        onClick={(e) => { e.stopPropagation(); onFav() }}>{fav ? '★' : '☆'}</span>}
      {onRemove && <span className="pfav x" role="button" title="Delete this one of My Animations"
        onClick={(e) => { e.stopPropagation(); onRemove() }}>✕</span>}
    </button>
  )
}
