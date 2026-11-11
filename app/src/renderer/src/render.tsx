import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CompiledCue } from '@core/compile'
import { Caption } from './Viewer'

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
}

const noop = () => {}

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
