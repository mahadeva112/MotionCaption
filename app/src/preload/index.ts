import { contextBridge, ipcRenderer } from 'electron'
import type { CompiledCue } from '../core/compile.ts'
import type { Rendered } from '../core/job.ts'

export interface OpenedFile {
  path: string
  name: string
  bytes: Uint8Array
}

export interface ResolveStatus {
  resolveFound: boolean
  scriptInstalled: boolean
  /** The installed script matches the one this app ships */
  scriptCurrent: boolean
}

/** What the Resolve script reports back (result.json) */
export interface JobResult {
  jobId: string
  ok: boolean
  /** Captions made by this send */
  placed: number
  /** Captions of the last send that had not changed and were left as they are */
  kept?: number
  failed: number
  errors: string[]
  /** Captions shorter than one frame at the timeline's rate, left out */
  skipped?: number
  timeline?: string
  tracks?: string[]
  fps?: number
  finishedAt?: string
  /** A timeline video job: the file Resolve rendered */
  preview?: { file: string; width: number; height: number; timeline: string; project: string }
}

/** A timeline video ready to play: its address for the page, and when it was made */
export interface PreviewVideo {
  url: string
  at: string
}

/** Written by the Resolve script while it works (progress.json) */
export interface JobProgress {
  jobId: string
  phase: 'starting' | 'placing' | 'animating' | 'rendering'
  done: number
  total: number
}

/** What the Resolve script read from the open timeline (timeline.json). Times are ms from the timeline start. */
export interface TimelineData {
  readAt: string
  project?: string
  /** length: the whole timeline in ms (missing in reads by an older script) */
  timeline: false | { name: string; fps: string; rate: number; dropFrame: boolean; width: number; height: number; length?: number }
  video?: { index: number; name: string; enabled: boolean; clips: { start: number; end: number; name: string }[] }[]
  subtitle?: { index: number; name: string; enabled: boolean; cues: { start: number; end: number; text: string }[] }[]
  /** Text+ layers already on the video tracks */
  texts?: TextLayer[]
}

/** A Text+ clip on a video track, with the text and look of its Text+ */
export interface TextLayer {
  /** Video track number */
  track: number
  /** First frame on the timeline, exactly as Resolve gives it (to find the clip again) */
  at: number
  start: number
  end: number
  text: string
  /** Clip name, e.g. "Text+" */
  name: string
  /** False once turned off (for example after MotionCaption animated it) */
  enabled: boolean
  /** On a track MotionCaption made ("MC …"): one of its own captions */
  mc: boolean
  /** How many Text+ the clip has (the longest text is used) */
  tools: number
  /** Text+ input values, by input id (see core/layers.ts) */
  raw: Record<string, number | string | [number, number]>
}

/** How far drawing the captions' frames has got */
export interface RenderProgress {
  done: number
  total: number
  note: 'drawing' | 'encoding' | 'ready'
}

/** The Link window in Resolve (open: a Send goes straight in) */
export interface LinkStatus {
  alive: boolean
  timeline: string | null
}

const api = {
  linkStatus: (): Promise<LinkStatus> => ipcRenderer.invoke('link:status'),
  /** Asks the Link window to read the open timeline again */
  refreshTimeline: (): Promise<boolean> => ipcRenderer.invoke('timeline:refresh'),
  /** Presses Workspace → Scripts → MotionCaption in Resolve: OK, NO_RESOLVE, NO_MENU … or ERROR … */
  runInResolve: (): Promise<string> => ipcRenderer.invoke('resolve:run'),
  timeline: (): Promise<TimelineData | null> => ipcRenderer.invoke('timeline:get'),
  /** Calls back whenever the Resolve script writes a new timeline.json; returns an unsubscribe */
  onTimeline: (cb: () => void): (() => void) => {
    const f = () => cb()
    ipcRenderer.on('timeline:changed', f)
    return () => { ipcRenderer.removeListener('timeline:changed', f) }
  },
  openSrt: (): Promise<OpenedFile | null> => ipcRenderer.invoke('srt:open'),
  resolveStatus: (): Promise<ResolveStatus> => ipcRenderer.invoke('resolve:status'),
  installScript: (): Promise<boolean> => ipcRenderer.invoke('resolve:install'),
  sendJob: (lua: string): Promise<string> => ipcRenderer.invoke('job:send', lua),
  jobResult: (jobId: string): Promise<JobResult | null> => ipcRenderer.invoke('job:result', jobId),
  jobProgress: (jobId: string): Promise<JobProgress | null> => ipcRenderer.invoke('job:progress', jobId),
  /** Draws captions as PNG frames with transparency, for Resolve to place as plain clips */
  renderCues: (req: { width: number; height: number; fps: number; cues: CompiledCue[]; mov?: boolean }): Promise<Rendered[]> =>
    ipcRenderer.invoke('render:cues', req),
  /** Folder the bridge renders timeline videos into */
  previewDir: (): Promise<string> => ipcRenderer.invoke('preview:dir'),
  /** The latest timeline video for a timeline ("project/timeline"), or null */
  previewGet: (key: string): Promise<PreviewVideo | null> => ipcRenderer.invoke('preview:get', key),
  /** Keeps a just-rendered timeline video as that timeline's latest */
  previewKeep: (key: string, file: string): Promise<PreviewVideo | null> => ipcRenderer.invoke('preview:keep', key, file),
  onRenderProgress: (cb: (p: RenderProgress) => void): (() => void) => {
    const f = (_e: unknown, p: RenderProgress) => cb(p)
    ipcRenderer.on('render:progress', f)
    return () => { ipcRenderer.removeListener('render:progress', f) }
  },
}

export type Api = typeof api

contextBridge.exposeInMainWorld('mc', api)
