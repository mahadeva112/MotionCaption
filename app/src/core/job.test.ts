import { describe, expect, it } from 'vitest'
import { compileCue } from './compile.ts'
import { jobToLua, makeJob, makePreviewJob, renderKey, sendSig, sigOf } from './job.ts'
import type { Cue } from './srt.ts'

const cue = (text: string, startMs = 1000, endMs = 3000): Cue => ({ n: 1, index: 1, startMs, endMs, raw: text, text, line: 0 })

describe('drawn captions in a job', () => {
  const c = compileCue(cue('ये बात कोई नहीं बताएगा'), 'letterRise', { aspect: 9 / 16 })
  const frames = { dir: 'C:\\MC\\renders\\abc', frames: 51, width: 1080, height: 1920 }

  it('carries where the frames are, for the bridge', () => {
    const job = makeJob('Supers', [c], undefined, new Date(0), { renders: [frames] })
    expect(job.cues[0]!.render).toEqual(frames)
    expect(jobToLua(job)).toContain('dir = "C:\\\\MC\\\\renders\\\\abc"')
  })

  it('signs a drawn caption apart from the same caption as Text+', () => {
    const drawn = makeJob('Supers', [c], undefined, new Date(0), { renders: [frames] }).cues[0]!.sig
    const text = makeJob('Supers', [c], undefined, new Date(0)).cues[0]!.sig
    expect(text).toBe(sigOf(c))
    expect(drawn).toBe(sendSig(c, true))
    expect(drawn).not.toBe(text)
  })

  it('reuses frames for the same caption, size and rate, wherever it sits', () => {
    const later = compileCue(cue('ये बात कोई नहीं बताएगा', 9000, 11000), 'letterRise', { aspect: 9 / 16 })
    expect(renderKey(later, 1080, 1920, 25)).toBe(renderKey(c, 1080, 1920, 25))
    expect(renderKey(c, 1080, 1920, 30)).not.toBe(renderKey(c, 1080, 1920, 25))
    const longer = compileCue(cue('ये बात कोई नहीं बताएगा', 1000, 3500), 'letterRise', { aspect: 9 / 16 })
    expect(renderKey(longer, 1080, 1920, 25)).not.toBe(renderKey(c, 1080, 1920, 25))
  })
})

describe('timeline video job', () => {
  it('asks the bridge for a render, with no captions to place', () => {
    const job = makePreviewJob({ dir: 'C:\\MC\\preview\\', maxSide: 960, hideClips: [{ track: 2, at: 86400 }] },
      { project: 'P', timeline: 'Timeline 1' }, new Date(0))
    expect(job.cues).toEqual([])
    expect(job.preview!.name).toBe('timeline_' + job.id)
    const lua = jobToLua(job)
    expect(lua).toContain('preview = {')
    expect(lua).toContain('dir = "C:\\\\MC\\\\preview\\\\"')
    expect(lua).toContain('hideClips = {')
    expect(lua).toContain('timeline = "Timeline 1"')
  })
})
