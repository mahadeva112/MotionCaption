import { useEffect, useState } from 'react'
import type { JobProgress, JobResult, ResolveStatus } from '../../preload'

interface Props {
  captions: number
  where: string
  timeline: string | null
  /** The Link window is open in Resolve: Send is the only step */
  linked: boolean
  build: () => { id: string; lua: string }
  /** Set when these captions were sent before: this send only makes the changed ones
   *  again. `changed` is how many the app counts, null while it does not know. */
  update: { changed: number | null } | null
  /** The job went in with no problems */
  onDone: (jobId: string) => void
  onClose: () => void
}

type Phase = 'ready' | 'sending' | 'waiting' | 'done'

/** Placing all captions is one Resolve call; animating them is most of the work */
function percent(p: JobProgress | null, r: JobResult | null): number | null {
  if (r) return 100
  if (!p) return null
  if (p.phase === 'animating' && p.total > 0) return Math.round(8 + (92 * p.done) / p.total)
  return p.phase === 'placing' ? 5 : 2
}

export function SendDialog({ captions, where, timeline, linked, build, update: updateNow, onDone, onClose }: Props) {
  // What this dialog was opened for: a first send stays worded as one after it has gone in
  const [update] = useState(updateNow)
  const [status, setStatus] = useState<ResolveStatus | null>(null)
  const [phase, setPhase] = useState<Phase>('ready')
  const [jobId, setJobId] = useState<string | null>(null)
  const [result, setResult] = useState<JobResult | null>(null)
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Could the app press MotionCaption in Resolve's menu itself? null before trying */
  const [direct, setDirect] = useState<boolean | null>(null)
  const [why, setWhy] = useState<string | null>(null)

  useEffect(() => { window.mc.resolveStatus().then(setStatus) }, [])

  // Follow the Resolve script: its progress file while it works, then its report
  useEffect(() => {
    if (phase !== 'waiting' || !jobId) return
    const t = setInterval(async () => {
      const [r, p] = await Promise.all([window.mc.jobResult(jobId), window.mc.jobProgress(jobId)])
      if (p) setProgress(p)
      if (r) { setResult(r); setPhase('done'); if (r.ok) onDone(r.jobId) }
    }, 400)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, jobId])

  async function send() {
    setPhase('sending'); setError(null); setResult(null); setProgress(null)
    try {
      const job = build()
      await window.mc.sendJob(job.lua)
      setJobId(job.id)
      // The Link window (Studio) takes it by itself; otherwise press the menu in Resolve
      if (!linked) {
        const r = await window.mc.runInResolve()
        setDirect(r === 'OK')
        setWhy(r === 'OK' ? null : r === 'NO_RESOLVE' ? 'DaVinci Resolve is not open.'
          : r.startsWith('NO_MENU') ? `Resolve's menu has no ${r.slice(8)} entry.` : 'Resolve did not answer.')
      } else setDirect(true)
      setStatus(await window.mc.resolveStatus())
      setPhase('waiting')
    } catch (e) {
      setError(String(e)); setPhase('ready')
    }
  }

  const pct = percent(progress, result)
  const label = result
    ? (result.ok ? 'Finished' : 'Finished with problems')
    : !progress
      ? (direct !== false ? 'Placing in Resolve…' : <>Waiting for Resolve… click <kbd>Workspace → Scripts → MotionCaption</kbd></>)
      : progress.phase === 'animating'
        ? `Animating caption ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`
        : progress.phase === 'placing'
          ? (progress.total > 0 ? `Placing ${progress.total} captions on the timeline` : 'Checking the captions in Resolve')
          : 'Starting in Resolve'
  const s = (n: number) => (n === 1 ? '' : 's')
  const kept = result?.kept ?? 0

  return (
    <div className="modal" onMouseDown={(e) => { if (e.target === e.currentTarget && phase !== 'waiting') onClose() }}>
      <div className="dlg2">
        <div className="dlg2-t"><b>{update ? 'Update in Resolve' : 'Send to Resolve'}</b><button className="x" onClick={onClose} title="Close">✕</button></div>
        <div className="dlg2-b">
          {!update ? (
            <p className="lead">{captions} captions go on <b>{where}</b>{timeline ? <> in <b>{timeline}</b></> : ''}. Clips already on the timeline are not moved or replaced.</p>
          ) : update.changed === 0 ? (
            <p className="lead">Nothing has changed since the last send. Update checks {timeline ? <b>{timeline}</b> : 'the timeline'} and puts back any caption that is missing there; the others are not touched.</p>
          ) : (
            <p className="lead">{update.changed === null ? 'Only the captions you changed are' : <><b>{update.changed}</b> changed caption{s(update.changed)} {update.changed === 1 ? 'is' : 'are'}</>} made
              again{timeline ? <> in <b>{timeline}</b></> : ''}. Every other caption stays in Resolve exactly as it is, with anything you adjusted there.</p>
          )}
          {status && !status.resolveFound && <p className="warn">DaVinci Resolve was not found on this computer. Install Resolve (Free or Studio), then come back.</p>}
          {direct === false ? (
            <p className="warn">{why} Open Resolve with {timeline ? <b>{timeline}</b> : 'the timeline'}'s project, then click <kbd>Workspace → Scripts → MotionCaption</kbd> there, or press Send again.</p>
          ) : (
            <p className="how1"><i className="dot" /> Press {update ? 'Update' : 'Send'} and the captions go straight onto {timeline ? <b>{timeline}</b> : 'the open timeline'} in Resolve. Keep Resolve open.</p>
          )}
          <div className="btnrow">
            <button className="go big" disabled={phase === 'sending' || (status !== null && !status.resolveFound)} onClick={send}>
              {(update ? 'Update' : 'Send') + (phase === 'ready' ? '' : ' again')}
            </button>
            <button className="mini" onClick={onClose}>{phase === 'done' ? 'Close' : 'Cancel'}</button>
          </div>
          {error && <p className="warn">{error}</p>}
          {(phase === 'waiting' || phase === 'done') && (
            <div className="progress">
              <div className="ptext"><span>{label}</span>{pct !== null && <b>{pct}%</b>}</div>
              <div className={'pbar2' + (pct === null ? ' idle' : '') + (result && !result.ok ? ' bad' : '')}><i style={pct === null ? undefined : { width: `${pct}%` }} /></div>
            </div>
          )}
          {result && (
            <div className={'result ' + (result.ok ? 'ok' : 'bad')}>
              {result.ok && kept > 0 && result.placed === 0
                ? <p><b>Up to date.</b> All {kept} caption{s(kept)} in “{result.timeline}” were already as they are here. Nothing was changed.</p>
                : result.ok && kept > 0
                ? <p><b>Done.</b> {result.placed} caption{s(result.placed)} made again on {result.tracks?.join(', ')} in “{result.timeline}”. The other {kept} {kept === 1 ? 'was' : 'were'} left as {kept === 1 ? 'it was' : 'they were'}.</p>
                : result.ok
                ? <p><b>Done.</b> {result.placed} captions placed on {result.tracks?.join(', ')} in “{result.timeline}” ({result.fps} fps).</p>
                : <p><b>Finished with problems.</b> {result.placed} placed, {result.failed} failed.</p>}
              {(result.skipped ?? 0) > 0 && <p className="sub">{result.skipped} caption{result.skipped === 1 ? ' was' : 's were'} shorter than one frame and left out.</p>}
              {result.errors.length > 0 && <ul>{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
