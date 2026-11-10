import { contextBridge, ipcRenderer } from 'electron'

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
}

/** Written by the Resolve script while it works (progress.json) */
export interface JobProgress {
  jobId: string
  phase: 'starting' | 'placing' | 'animating'
  done: number
  total: number
}

/** What the Resolve script read from the open timeline (timeline.json). Times are ms from the timeline start. */
export interface TimelineData {
  readAt: string
  project?: string
  timeline: false | { name: string; fps: string; rate: number; dropFrame: boolean; width: number; height: number }
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
}

export type Api = typeof api

contextBridge.exposeInMainWorld('mc', api)
