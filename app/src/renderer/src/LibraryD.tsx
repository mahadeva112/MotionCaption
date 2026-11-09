import { useState } from 'react'
import { FAMILIES, PRESETS, type Family } from '@core/presets'
import { PresetTile } from './PresetTile'

type Bin = Family | 'All' | 'Recent'

interface Props {
  /** The animation of the caption in view */
  current: string
  /** What a click changes, e.g. "all 142 captions" */
  target: string
  recent: string[]
  onPick: (id: string) => void
  /** Pointer over a tile: try it on the preview; null when it leaves the grid */
  onHover: (id: string | null) => void
}

/** The big middle area of Pro: search, groups as chips, and a wide grid of tiles */
export function LibraryD({ current, target, recent, onPick, onHover }: Props) {
  const [bin, setBin] = useState<Bin>('All')
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const shown = PRESETS.filter((p) => (query
    ? (p.name + ' ' + p.desc + ' ' + p.family).toLowerCase().includes(query)
    : bin === 'All' ? true : bin === 'Recent' ? recent.includes(p.id) : p.family === bin))
  const bins: [Bin, number][] = [['All', PRESETS.length], ...FAMILIES.map((f) => [f, PRESETS.filter((p) => p.family === f).length] as [Bin, number]), ['Recent', recent.length]]

  return (
    <section className="lib2">
      <div className="phead"><b>Animations</b><span className="r">{PRESETS.length} presets · click to use on <b>{target}</b></span></div>
      <div className="libtop">
        <input className="search" type="search" placeholder={`Search ${PRESETS.length} animations`} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          {bins.map(([b, n]) => (
            <button key={b} className={!query && bin === b ? 'on' : ''} onClick={() => { setBin(b); setQ('') }}>{b}<span>{n}</span></button>
          ))}
        </div>
      </div>
      <div className="tiles" onMouseLeave={() => onHover(null)}>
        {shown.map((p) => <PresetTile key={p.id} preset={p} on={p.id === current} big onPick={onPick} onHover={onHover} />)}
        {shown.length === 0 && <p className="hint2">{bin === 'Recent' ? 'Animations you use show here.' : 'No animation matches.'}</p>}
      </div>
    </section>
  )
}
