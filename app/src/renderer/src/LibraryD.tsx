import { useState, type ReactNode } from 'react'
import { FAMILIES, PRESETS, presetById, type Family } from '@core/presets'
import type { Motion } from '@core/look'
import { PresetTile } from './PresetTile'
import { TEMPLATES } from './templates'

/** The library's tabs: animations, super templates, and the audio wave */
export type LibView = 'anim' | 'tmpl' | 'wave'

type Bin = Family | 'All' | 'Recent' | 'Favourites' | 'Mine'

/** One of My Animations: an animation kept with the Animation tab's settings under a name */
export interface MyAnimation { name: string; preset: string; motion: Motion }

interface Props {
  /** The animation of the caption in view */
  current: string
  /** What a click changes, e.g. "all 142 captions" */
  target: string
  recent: string[]
  onPick: (id: string) => void
  /** A click adds the animation to the pattern being built */
  adding?: boolean
  /** Pointer over a tile: try it on the preview; null when it leaves the grid */
  onHover: (id: string | null) => void
  favs: string[]
  onFav: (id: string) => void
  mine: MyAnimation[]
  onMine: (m: MyAnimation) => void
  onRemoveMine: (name: string) => void
  view: LibView
  onView: (v: LibView) => void
  /** The Templates tab's content (TemplateLibrary) */
  templates: ReactNode
  /** The Audio wave tab's content (Wave.tsx) */
  wave: ReactNode
}

/** The big middle area of Pro: search, groups as chips, and a wide grid of tiles */
export function LibraryD({ current, target, recent, onPick, onHover, adding, favs, onFav, mine, onMine, onRemoveMine, view, onView, templates, wave }: Props) {
  const [bin, setBin] = useState<Bin>('All')
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const shown = PRESETS.filter((p) => (query
    ? (p.name + ' ' + p.desc + ' ' + p.family).toLowerCase().includes(query)
    : bin === 'All' ? true : bin === 'Recent' ? recent.includes(p.id) : bin === 'Favourites' ? favs.includes(p.id) : p.family === bin))
  const bins: [Bin, number][] = [['All', PRESETS.length], ...FAMILIES.map((f) => [f, PRESETS.filter((p) => p.family === f).length] as [Bin, number]),
    ['Recent', recent.length], ['Favourites', favs.length], ['Mine', mine.length]]
  const showMine = !query && bin === 'Mine'

  return (
    <section className="lib2">
      <div className="phead">
        <div className="libtabs" role="tablist">
          <button role="tab" aria-selected={view === 'anim'} className={view === 'anim' ? 'on' : ''} onClick={() => onView('anim')}>Animations<i>{PRESETS.length}</i></button>
          <button role="tab" aria-selected={view === 'tmpl'} className={view === 'tmpl' ? 'on' : ''} onClick={() => onView('tmpl')}>Templates<i>{TEMPLATES.length}</i></button>
          <button role="tab" aria-selected={view === 'wave'} className={view === 'wave' ? 'on' : ''} onClick={() => onView('wave')}>Audio wave<i className="new">NEW</i></button>
        </div>
        <span className="r">{view === 'wave' ? <>a wave that moves with the sound · click a style to use it</>
          : view === 'tmpl' ? <>click to add a super at the playhead · everything stays editable</>
          : adding ? <>click to <b>add to the pattern</b></> : <>click to use on <b>{target}</b></>}</span>
      </div>
      {view === 'wave' ? wave : view === 'tmpl' ? templates : <>
      <div className="libtop">
        <input className="search" type="search" placeholder={`Search ${PRESETS.length} animations`} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          {bins.map(([b, n]) => (
            <button key={b} className={!query && bin === b ? 'on' : ''} onClick={() => { setBin(b); setQ('') }}>{b}<span>{n}</span></button>
          ))}
        </div>
      </div>
      <div className="tiles" onMouseLeave={() => onHover(null)}>
        {showMine ? mine.map((m) => {
          const p = presetById(m.preset)
          return p ? <PresetTile key={m.name} preset={p} on={false} big label={m.name} sub={`Mine · ${p.name}`}
            onPick={() => onMine(m)} onHover={onHover} onRemove={() => onRemoveMine(m.name)} /> : null
        }) : shown.map((p) => <PresetTile key={p.id} preset={p} on={p.id === current} big onPick={onPick} onHover={onHover}
          fav={favs.includes(p.id)} onFav={() => onFav(p.id)} />)}
        {(showMine ? mine.length === 0 : shown.length === 0) && <p className="hint2">{
          showMine ? 'Save an animation with its settings in the Animation tab (Save as My Animation…), and it shows here.'
            : bin === 'Recent' ? 'Animations you use show here.'
              : bin === 'Favourites' && !query ? 'Click ☆ on an animation to keep it here.' : 'No animation matches.'}</p>}
      </div>
      </>}
    </section>
  )
}
