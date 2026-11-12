import { useEffect, useRef, useState } from 'react'
import { jobToLua, makePreviewJob } from '@core/job'
import type { PreviewVideo } from '../../preload'
import { Icon } from './Icon'

// The timeline's own picture and sound under the preview, to check where the captions sit
// and how they move with the audio. Resolve renders it (a small MP4 of the whole timeline,
// without MotionCaption's tracks and the Text+ layers the captions come from) when asked.

/** Longest side of the video in pixels: sharp enough to judge placement, quick to render */
const MAX_SIDE = 960

const load = (k: string, d: boolean) => { try { const v = localStorage.getItem(k); return v === null ? d : v === '1' } catch { return d } }
const keep = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? '1' : '0') } catch { /* private window */ } }

export interface TimelineVideo {
  /** The video to show under the captions, or null (none yet, or turned off) */
  shown: { url: string; muted: boolean } | null
  tools: React.ReactNode
}

interface Args {
  /** The timeline read from Resolve; null for an SRT */
  project: string | undefined
  timeline: string | null
  /** Text+ layers the captions come from, left out of the video so they do not show twice */
  hideClips: () => { track: number; at: number }[]
  linked: boolean
}

/** pct: Resolve's own count, when it gives one (while the bridge waits it stays at 0); at: when it was asked for */
type Task = { jobId: string; pct: number | null; hint: string | null; at: number }

export function useTimelineVideo({ project, timeline, hideClips, linked }: Args): TimelineVideo {
  const key = timeline ? `${project ?? ''}/${timeline}` : null
  const [video, setVideo] = useState<PreviewVideo | null>(null)
  const [on, setOn] = useState(() => load('mc.video.on', true))
  const [muted, setMuted] = useState(() => load('mc.video.muted', false))
  const [task, setTask] = useState<Task | null>(null)
  const [error, setError] = useState<string | null>(null)

  // This timeline's last video, if one was made
  useEffect(() => {
    setVideo(null); setError(null); setTask(null)
    if (!key) return
    let live = true
    window.mc.previewGet(key).then((v) => { if (live) setVideo(v) }).catch(() => {})
    return () => { live = false }
  }, [key])

  // Follow the render in Resolve
  const jobId = task?.jobId
  const keyNow = useRef(key)
  keyNow.current = key
  useEffect(() => {
    if (!jobId || !key) return
    const t = setInterval(async () => {
      const [r, p] = await Promise.all([window.mc.jobResult(jobId), window.mc.jobProgress(jobId)])
      if (r) {
        clearInterval(t)
        const v = r.ok && r.preview ? await window.mc.previewKeep(key, r.preview.file) : null
        if (keyNow.current !== key) return
        setTask(null)
        if (v) { setVideo(v); setOn(true); keep('mc.video.on', true) } else setError(r.errors[0] ?? 'Resolve could not make the timeline video.')
      } else if (p) {
        setTask((x) => (x && x.jobId === jobId ? { ...x, pct: p.phase === 'rendering' ? p.done : x.pct, hint: null } : x))
      } else {
        setTask((x) => (x && x.jobId === jobId ? { ...x } : x)) // the seconds count on
      }
    }, 500)
    return () => clearInterval(t)
  }, [jobId, key])

  async function make() {
    if (!key || !timeline) return
    setError(null)
    try {
      const dir = await window.mc.previewDir()
      const job = makePreviewJob({ dir, maxSide: MAX_SIDE, hideClips: hideClips() }, { project, timeline })
      await window.mc.sendJob(jobToLua(job))
      setTask({ jobId: job.id, pct: null, hint: null, at: Date.now() })
      // The Link window (Studio) takes it by itself; otherwise press the menu in Resolve
      if (!linked) {
        const r = await window.mc.runInResolve()
        if (r !== 'OK') {
          setTask((x) => (x && x.jobId === job.id ? {
            ...x, hint: r === 'NO_RESOLVE' ? 'Open DaVinci Resolve, then click Workspace → Scripts → MotionCaption.'
              : 'Click Workspace → Scripts → MotionCaption in Resolve.',
          } : x))
        }
      }
    } catch (e) {
      setTask(null)
      setError(String((e as Error)?.message ?? e))
    }
  }

  const made = video ? new Date(video.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  const tools = !key ? null : task ? (
    <span className="vtools busy" title={task.hint ?? 'Resolve is rendering the timeline (picture and sound)'}>
      <i className="spin" />{task.hint ? 'Waiting for Resolve' : task.pct === null ? 'Starting render…' : task.pct > 0 ? `Rendering ${Math.round(task.pct)}%` : `Rendering… ${Math.round((Date.now() - task.at) / 1000)} s`}
      <button className="vt" title="Stop waiting (Resolve finishes its render)" onClick={() => setTask(null)}><Icon name="close" size={12} /></button>
      {task.hint && <span className="vhint">{task.hint}</span>}
    </span>
  ) : !video ? (
    <span className="vtools">
      <button className="vt label" onClick={make} title="Resolve renders a small copy of the timeline, picture and sound, to play under the captions">
        <Icon name="film" size={13} />Timeline video
      </button>
      {error && <span className="vhint err" title={error}>{error}</span>}
    </span>
  ) : (
    <span className="vtools">
      <button className={'vt label' + (on ? ' on' : '')} onClick={() => { setOn(!on); keep('mc.video.on', !on) }}
        title={on ? 'Hide the timeline video' : 'Show the timeline video under the captions'}>
        <Icon name="film" size={13} />Video
      </button>
      {on && <button className="vt" onClick={() => { setMuted(!muted); keep('mc.video.muted', !muted) }} title={muted ? 'Sound on' : 'Sound off'}>
        <Icon name={muted ? 'mute' : 'sound'} size={13} />
      </button>}
      <button className="vt" onClick={make} title={`Made ${made}. Render it again after changing the edit in Resolve`}><Icon name="refresh" size={12} /></button>
      {error && <span className="vhint err" title={error}>{error}</span>}
    </span>
  )

  return { shown: video && on ? { url: video.url, muted } : null, tools }
}
