import { BrowserWindow, screen } from 'electron'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CompiledCue } from '../core/compile.ts'
import { renderKey, type Rendered } from '../core/job.ts'

// Draws captions as PNG frames with a see-through background, for Resolve to place as
// plain clips. A hidden off-screen window shows the app's own preview of one caption
// (renderer/src/render.tsx); each frame is a picture of it at that moment. Resolve then
// has nothing to build: no Text+, no Fusion, the same in Resolve Free and Studio.

export interface RenderRequest {
  width: number
  height: number
  /** Frames per second of the timeline, exact (24000/1001 for 23.976) */
  fps: number
  cues: CompiledCue[]
}

type Progress = (done: number, total: number, note: string) => void

let stage: { win: BrowserWindow; W: number; H: number; scale: number } | null = null

/** Frame numbers as the bridge counts them (MotionCaption.lua, frames) */
const frameOf = (ms: number, fps: number) => Math.floor((ms * fps) / 1000 + 0.5)

/** How many frames a caption is drawn as: its length on the timeline, plus one blank frame
 *  at the end so a clip of exactly its length can be cut from the images */
export const framesFor = (cue: { startMs: number; endMs: number }, fps: number) =>
  Math.max(1, frameOf(cue.endMs, fps) - frameOf(cue.startMs, fps)) + 1

/**
 * Windows keeps a window inside the screen, even a hidden one, so a 1080×1920 frame cannot
 * be a 1080×1920 window. The window is the frame's size divided by a whole scale that fits
 * the screen, and draws at that many device pixels per CSS pixel: the picture is the full size.
 */
function scaleFor(W: number, H: number): number {
  const area = screen.getPrimaryDisplay().workAreaSize
  return Math.max(1, Math.ceil(Math.max(W / (area.width - 40), H / (area.height - 40))))
}

async function openStage(url: { dev?: string; file: string }, W: number, H: number): Promise<{ win: BrowserWindow; scale: number }> {
  if (stage && !stage.win.isDestroyed() && stage.W === W && stage.H === H) return stage
  closeStage()
  const scale = scaleFor(W, H)
  const win = new BrowserWindow({
    show: false, width: Math.round(W / scale), height: Math.round(H / scale), useContentSize: true, frame: false, transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: { deviceScaleFactor: scale }, contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  })
  win.webContents.setFrameRate(60)
  const loaded = new Promise<void>((ok) => win.webContents.once('did-finish-load', () => ok()))
  if (url.dev) await win.loadURL(url.dev + '#render')
  else await win.loadFile(url.file, { hash: 'render' })
  await loaded.catch(() => {})
  for (let i = 0; i < 100; i++) {
    if (await win.webContents.executeJavaScript('!!window.__mcRender').catch(() => false)) break
    await new Promise((r) => setTimeout(r, 100))
  }
  stage = { win, W, H, scale }
  return stage
}

export function closeStage() {
  if (stage && !stage.win.isDestroyed()) stage.win.destroy()
  stage = null
}

/**
 * Draws every caption that has no frames yet into <root>\<key>\f_00000.png …, and returns
 * where each one's frames are. Frames already drawn for the same caption, size and rate are
 * used again. One caption's frames are written to a .part folder first, so a folder that
 * exists is always whole.
 */
export async function renderCues(root: string, url: { dev?: string; file: string }, req: RenderRequest, progress: Progress): Promise<Rendered[]> {
  const { width: W, height: H, fps } = req
  const jobs = req.cues.map((cue) => ({ cue, key: renderKey(cue, W, H, fps), frames: framesFor(cue, fps) }))
  const out: Rendered[] = []
  const todo: typeof jobs = []
  for (const j of jobs) {
    const dir = join(root, j.key)
    const have = await readFile(join(dir, 'done.json'), 'utf8').then((s) => JSON.parse(s) as { frames?: number }, () => null)
    if (!have || have.frames !== j.frames) todo.push(j)
    out.push({ dir, frames: j.frames, width: W, height: H })
  }
  const total = todo.reduce((s, j) => s + j.frames, 0)
  let done = 0
  progress(0, total, todo.length ? 'drawing' : 'ready')
  if (!todo.length) return out

  await mkdir(root, { recursive: true })
  const { win, scale } = await openStage(url, W, H)
  const wc = win.webContents
  // The page lays the caption out at the window's size; the scale makes up the rest
  const cw = Math.round(W / scale)
  const ch = Math.round(H / scale)
  for (const j of todo) {
    const dir = join(root, j.key)
    const part = dir + '.part'
    await rm(part, { recursive: true, force: true })
    await mkdir(part, { recursive: true })
    await wc.executeJavaScript(`window.__mcRender.show(${JSON.stringify(j.cue)}, ${cw}, ${ch}, 0)`)
    const writes: Promise<void>[] = []
    for (let i = 0; i < j.frames; i++) {
      await wc.executeJavaScript(`window.__mcRender.seek(${(i * 1000) / fps})`)
      let img = await wc.capturePage()
      const size = img.getSize()
      if (size.width !== W || size.height !== H) img = img.resize({ width: W, height: H, quality: 'best' })
      writes.push(writeFile(join(part, `f_${String(i).padStart(5, '0')}.png`), img.toPNG()))
      if (writes.length >= 16) await Promise.all(writes.splice(0))
      done++
      if (done % 5 === 0 || done === total) progress(done, total, 'drawing')
    }
    await Promise.all(writes)
    await writeFile(join(part, 'done.json'), JSON.stringify({ frames: j.frames, width: W, height: H, fps, n: j.cue.n }), 'utf8')
    await rm(dir, { recursive: true, force: true })
    await rename(part, dir)
  }
  return out
}
