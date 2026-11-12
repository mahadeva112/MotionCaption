// Updates from GitHub, the way the person chose (plan B): a strip says a new version is out,
// a dialog shows what's new and the download, and nothing installs until "Restart and install".
// The logo's menu shows the version, checks by hand, and turns "Update automatically" on
// (then a found update downloads by itself; installing still waits for the person).
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { UpdateState } from '../../preload'
import { Icon } from './Icon'

type Prefs = { auto: boolean; skip: string }
const KEY = 'mc.update'
const load = (): Prefs => {
  try { return { auto: false, skip: '', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return { auto: false, skip: '' } }
}
const keep = (p: Prefs) => { try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* private window */ } }
const mb = (n?: number) => (n ? Math.round(n / 1e6) : 0)

export function useUpdates() {
  const [st, setSt] = useState<UpdateState>({ state: 'idle', current: '' })
  const [prefs, setPrefs] = useState(load)
  /** Version put away with Later or ✕ until the app opens again */
  const [later, setLater] = useState<string | null>(null)
  const [dialog, setDialog] = useState(false)
  const [checked, setChecked] = useState(false) // a check by hand finished

  useEffect(() => {
    window.mc.updateState().then(setSt).catch(() => {})
    const off = window.mc.onUpdate(setSt)
    // Look a little after the app opens, so it does not slow the start
    const t = setTimeout(() => { window.mc.checkUpdate().catch(() => {}) }, 4000)
    return () => { off(); clearTimeout(t) }
  }, [])
  // "Update automatically": a found version downloads by itself (unless skipped)
  useEffect(() => {
    if (st.state === 'available' && prefs.auto && st.version && st.version !== prefs.skip) window.mc.downloadUpdate().catch(() => {})
  }, [st.state, st.version, prefs.auto, prefs.skip])

  const setP = (p: Partial<Prefs>) => setPrefs((x) => { const n = { ...x, ...p }; keep(n); return n })
  const found = !!st.version && ['available', 'downloading', 'ready', 'error'].includes(st.state)
  return {
    st, prefs, dialog, checked,
    strip: found && st.version !== prefs.skip && later !== st.version && !dialog,
    found,
    whatsNew: () => setDialog(true),
    update: () => { setDialog(true); if (st.state === 'available' || st.state === 'error') window.mc.downloadUpdate().catch(() => {}) },
    install: () => { window.mc.installUpdate().catch(() => {}) },
    skip: () => { setP({ skip: st.version ?? '' }); setDialog(false) },
    later: () => { setLater(st.version ?? null); setDialog(false) },
    close: () => setDialog(false),
    setAuto: (auto: boolean) => setP({ auto }),
    /** By hand: a found version opens the dialog, even one that was skipped */
    check: async () => {
      setChecked(false)
      const s = await window.mc.checkUpdate().catch(() => null)
      setChecked(true)
      if (s?.version && ['available', 'downloading', 'ready'].includes(s.state)) setDialog(true)
    },
  }
}
export type Updates = ReturnType<typeof useUpdates>

/** Under the top bar while a new version is out */
export function UpdateStrip({ u }: { u: Updates }) {
  if (!u.strip) return null
  const { st } = u
  return (
    <div className="ustrip">
      <Icon name="download" size={15} />
      {st.state === 'available' && <span className="msg"><b>MotionCaption {st.version} is out.</b> {(st.notes?.[0] ?? '').replace(/^•\s*/, '')}</span>}
      {st.state === 'downloading' && <span className="msg"><b>Downloading {st.version}…</b> {Math.round(st.percent ?? 0)}%<i className="ubar"><i style={{ width: `${st.percent ?? 0}%` }} /></i></span>}
      {st.state === 'ready' && <span className="msg"><b>{st.version} is ready.</b> Restart to use it. Your looks and captions stay.</span>}
      {st.state === 'error' && <span className="msg"><b>Couldn't download {st.version}.</b> Check the internet and try again.</span>}
      <button className="mini ghost" onClick={u.whatsNew}>See what's new</button>
      {st.state === 'ready'
        ? <button className="go" onClick={u.install}>Restart and install</button>
        : st.state === 'downloading'
        ? null
        : <button className="go" onClick={u.update}>{st.state === 'error' ? 'Try again' : 'Update'}</button>}
      <button className="x" onClick={u.later} title="Hide until the app opens again"><Icon name="close" size={13} /></button>
    </div>
  )
}

/** What's new, the download, and the choice */
export function UpdateDialog({ u }: { u: Updates }) {
  const { st } = u
  useEffect(() => {
    if (!u.dialog) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') u.close() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [u])
  if (!u.dialog || !st.version) return null
  const busy = st.state === 'downloading'
  return (
    <div className="modal" onMouseDown={(e) => { if (e.target === e.currentTarget) u.close() }}>
      <div className="dlg2 udlg">
        <div className="dlg2-t"><b>Update to {st.version}</b><span className="ucur">you have {st.current}</span>
          <button className="x" onClick={u.close} title="Close">✕</button></div>
        <div className="dlg2-b">
          <div className="unotes">
            {st.notes?.length ? st.notes.map((l, i) => <div key={i}>{l}</div>) : <div>No notes for this version.</div>}
          </div>
          {(busy || st.state === 'ready') && (
            <div className="uprog">
              <div className="row"><span>{busy ? 'Downloading…' : 'Downloaded. Ready to install.'}</span>
                <span>{Math.round(st.percent ?? 0)}%{st.total ? ` · ${mb(st.transferred)} of ${mb(st.total)} MB` : ''}</span></div>
              <i className="ubar"><i style={{ width: `${st.percent ?? 0}%` }} /></i>
            </div>
          )}
          {st.state === 'error' && <p className="uerr">Couldn't download the update. Check the internet and try again.</p>}
          <div className="btnrow uact">
            <button className="mini ghost" onClick={u.skip} title="Don't show this version again">Skip this version</button>
            <span className="grow" />
            <button className="mini" onClick={u.later}>Later</button>
            {st.state === 'ready'
              ? <button className="go" autoFocus onClick={u.install}>Restart and install</button>
              : busy
              ? <button className="go" disabled>Restart and install</button>
              : <button className="go" autoFocus onClick={u.update}>{st.state === 'error' ? 'Try again' : 'Update'}</button>}
          </div>
          <p className="hint2">The app closes, installs {st.version} into the same folder and opens again. Your looks, styles and captions stay.</p>
        </div>
      </div>
    </div>
  )
}

/** The top-bar logo: a menu with the version, a check by hand and "Update automatically" */
export function AppMenu({ u }: { u: Updates }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const out = (e: Event) => { const t = e.target as Node; if (!menu.current?.contains(t) && !btn.current?.contains(t)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', out, true)
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('pointerdown', out, true); window.removeEventListener('keydown', esc) }
  }, [open])
  const { st } = u
  const status = st.state === 'checking' ? 'Checking…'
    : u.found ? `${st.version} is out`
    : st.state === 'error' && u.checked ? "Couldn't check. Try again later."
    : st.state === 'none' && u.checked ? 'Up to date'
    : ''
  const r = btn.current?.getBoundingClientRect()
  return (
    <>
      <button ref={btn} className={'logo' + (u.found && !u.strip && st.version !== u.prefs.skip ? ' dot' : '')} title="MotionCaption Studio: version and updates"
        onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} />
      {open && r && createPortal(
        <div ref={menu} className="ddm umenu" role="menu" style={{ left: r.left, top: r.bottom + 6 }}>
          <div className="uver"><b>MotionCaption Studio</b><span>Version {st.current}{status && <> · <em className={u.found ? 'new' : ''}>{status}</em></>}</span></div>
          {u.found
            ? <div className="ddo" role="menuitem" onClick={() => { setOpen(false); u.whatsNew() }}><Icon name="download" />See {st.version}</div>
            : <div className="ddo" role="menuitem" onClick={() => { void u.check() }}><Icon name="refresh" />Check for updates</div>}
          <div className="ddo uauto" role="menuitemcheckbox" aria-checked={u.prefs.auto} onClick={() => u.setAuto(!u.prefs.auto)}
            title="Download a new version as soon as it is out. Installing still waits for you.">
            <Icon name="check" />Update automatically<span className={'tg' + (u.prefs.auto ? ' on' : '')}><i>✓</i></span>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
