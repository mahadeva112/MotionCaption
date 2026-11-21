import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CompiledCue } from '@core/compile'
import { envFromText, type WaveClip } from '@core/wave'
import { Caption } from './Viewer'
import { bandsOf, drawWave, waveSound } from './waveDraw'

// The page the app draws captions with, frame by frame, for Resolve. It runs in a hidden
// window with a see-through background (main/index.ts, render:cues) and shows one caption
// at one moment; the main process takes a picture of it. It uses the preview's own Caption,
// so what goes into Resolve is what the preview showed.

interface Shot { cue: CompiledCue; W: number; H: number; aspect: number; ms: number }

export interface RenderApi {
  /** Show this caption at this ms; resolves once it is on screen */
  show: (cue: CompiledCue, W: number, H: number, ms: number) => Promise<boolean>
  /** Move the shown caption to another ms */
  seek: (ms: number) => Promise<boolean>
  /** Get ready to draw the audio wave at this frame size and rate; false if its sound cannot be read */
  wave: (clip: WaveClip, W: number, H: number, fps: number) => boolean
  /** Frame i of the wave clip (from its first frame on the timeline) as a PNG data: URL; the
   *  frame after its last is blank */
  waveFrame: (i: number, frames: number) => string
}

const noop = () => {}

/** The wave being drawn in this window */
let waveRun: {
  clip: WaveClip; canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; sound: ReturnType<typeof waveSound>
  first: number; fps: number; W: number; H: number
} | null = null

export function RenderStage() {
  const [shot, setShot] = useState<Shot | null>(null)
  const done = useRef<((ok: boolean) => void) | null>(null)
  const block = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    for (const el of [document.documentElement, document.body]) {
      el.style.background = 'transparent'
      el.style.margin = '0'
      el.style.overflow = 'hidden'
    }
    const api: RenderApi = {
      show: (cue, W, H, ms) => new Promise((ok) => { done.current = ok; setShot({ cue, W, H, aspect: W / H, ms }) }),
      seek: (ms) => new Promise((ok) => { done.current = ok; setShot((s) => (s ? { ...s, ms } : s)) }),
      // The wave is drawn straight onto a canvas of the full frame size: no layout, no picture of the window
      wave: (clip, W, H, fps) => {
        const env = envFromText(clip.env)
        if (!env) return false
        const canvas = document.createElement('canvas')
        canvas.width = W
        canvas.height = H
        const g = canvas.getContext('2d')
        if (!g) return false
        const sound = waveSound(env, clip.look.smooth)
        const first = Math.floor((clip.startMs * fps) / 1000 + 0.5)
        waveRun = { clip, canvas, g, sound, first, fps, W, H }
        return true
      },
      waveFrame: (i, frames) => {
        const r = waveRun
        if (!r) return ''
        const ms = ((r.first + i) * 1000) / r.fps
        if (i >= frames - 1) r.g.clearRect(0, 0, r.W, r.H)
        else drawWave(r.g, r.W, r.H, (sec) => bandsOf(r.sound, sec * 1000, r.clip.startMs), ms / 1000, r.clip.look,
          { start: r.clip.startMs / 1000, end: r.clip.endMs / 1000 })
        return r.canvas.toDataURL('image/png')
      },
    }
    ;(window as unknown as { __mcRender?: RenderApi }).__mcRender = api
  }, [])

  // Answer once the frame is painted: fonts ready, then two frames for layout and paint
  useEffect(() => {
    const ok = done.current
    if (!ok) return
    done.current = null
    document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => ok(true))))
  }, [shot])

  if (!shot) return null
  const dur = shot.cue.endMs - shot.cue.startMs
  return (
    <div style={{ position: 'relative', width: shot.W, height: shot.H, overflow: 'hidden' }}>
      {shot.ms >= 0 && shot.ms < dur && (
        <Caption cue={shot.cue} ms={shot.ms} W={shot.W} H={shot.H} aspect={shot.aspect} selWord={null} blockRef={block}
          onDown={noop} onMove={noop} onUp={noop} />
      )}
    </div>
  )
}
