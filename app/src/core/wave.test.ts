import { describe, expect, it } from 'vitest'
import { compileCue } from './compile.ts'
import { jobToLua, makeJob, waveKey, waveSig } from './job.ts'
import { analyze, bandsAt, DEFAULT_WAVE, waveUnder, envFromText, envMs, envToText, peaksOf, smoothEnv, WAVE_N, type WaveClip } from './wave.ts'

const SR = 22050
/** A tone of this pitch, loud from `on` to `off` seconds, in a sound this long */
function tone(hz: number, secs: number, on = 0, off = secs): Float32Array {
  const out = new Float32Array(Math.round(SR * secs))
  for (let i = 0; i < out.length; i++) {
    const t = i / SR
    out[i] = t >= on && t < off ? 0.5 * Math.sin(2 * Math.PI * hz * t) : 0
  }
  return out
}
const mean = (a: Uint8Array, from: number, to: number) => { let s = 0; for (let i = from; i < to; i++) s += a[i]!; return s / (to - from) }

describe('reading sound into an envelope', () => {
  it('has 100 steps a second', () => {
    const env = analyze(tone(440, 2), SR)
    expect(env.low.length).toBe(200)
    expect(envMs(env)).toBe(2000)
  })

  it('puts a low hum in the low part and a hiss in the high part', () => {
    const lowEnv = analyze(tone(80, 1), SR)
    expect(mean(lowEnv.low, 10, 90)).toBeGreaterThan(mean(lowEnv.high, 10, 90) * 3)
    // Each part is scaled to its own loud moments; a pure low tone leaves the high part near silence
    const highEnv = analyze(tone(6000, 1), SR)
    expect(mean(highEnv.high, 10, 90)).toBeGreaterThan(200)
    expect(mean(highEnv.low, 10, 90)).toBeLessThan(mean(highEnv.high, 10, 90))
  })

  it('keeps peaks louder than the usual loud moments apart, below the top (no flat tops)', () => {
    // Mostly a steady tone, with a short part twice as loud
    const pcm = tone(300, 4)
    for (let i = Math.round(SR * 3.6); i < pcm.length; i++) pcm[i]! *= 2
    const env = analyze(pcm, SR)
    const usual = mean(env.mid, 50, 300)
    const peak = mean(env.mid, 370, 395)
    expect(peak).toBeGreaterThan(usual + 15)
    expect(peak).toBeLessThan(255)
  })

  it('is silent where the sound is', () => {
    const env = analyze(tone(300, 2, 0.5, 1.5), SR)
    expect(mean(env.mid, 5, 45)).toBe(0)
    expect(mean(env.mid, 60, 140)).toBeGreaterThan(150)
    expect(mean(env.mid, 160, 200)).toBe(0)
  })

  it('keeps an envelope as text and back', () => {
    const env = analyze(tone(300, 1.37, 0.2, 1), SR)
    const back = envFromText(envToText(env))!
    expect(back.rate).toBe(100)
    expect(Array.from(back.low)).toEqual(Array.from(env.low))
    expect(Array.from(back.mid)).toEqual(Array.from(env.mid))
    expect(Array.from(back.high)).toEqual(Array.from(env.high))
    expect(envFromText('junk')).toBeNull()
  })

  it('rises at once with no smoothing, and slower with it', () => {
    const env = analyze(tone(300, 1, 0.5, 1), SR)
    const sharp = smoothEnv(env, 0)
    const soft = smoothEnv(env, 0.9)
    expect(sharp[1][52]).toBeGreaterThan(0.5)
    expect(soft[1][52]!).toBeLessThan(sharp[1][52]!)
    // and falls back slowly after the sound stops
    const stop = analyze(tone(300, 1, 0, 0.5), SR)
    expect(smoothEnv(stop, 0.9)[1][53]!).toBeGreaterThan(smoothEnv(stop, 0)[1][53]!)
  })

  it('reads between steps in a straight line, and nothing outside the sound', () => {
    const sm = [new Float32Array([0, 1]), new Float32Array([0, 0]), new Float32Array([1, 1])]
    expect(bandsAt(sm, 100, 0.005)).toEqual([0.5, 0, 1])
    expect(bandsAt(sm, 100, -1)).toEqual([0, 0, 0])
    expect(bandsAt(sm, 100, 5)).toEqual([0, 0, 0])
  })

  it('gives the loudest part per point for the timeline', () => {
    const env = { rate: 100, low: new Uint8Array([0, 255, 0, 0]), mid: new Uint8Array([0, 0, 0, 51]), high: new Uint8Array(4) }
    expect(peaksOf(env, 2)).toEqual([1, 0.2])
  })
})

describe('the wave in a job', () => {
  const clip: WaveClip = { look: DEFAULT_WAVE, env: envToText(analyze(tone(300, 1), SR)), startMs: 0, endMs: 1000 }
  const render = { dir: 'C:\\MC\\renders\\wave_1', frames: 26, width: 1080, height: 1920 }
  const cue = compileCue({ n: 1, index: 1, startMs: 0, endMs: 1000, raw: 'हर पल', text: 'हर पल', line: 0 }, 'fade', { aspect: 9 / 16 })

  it('goes to the bridge first, before the captions, as a drawn clip', () => {
    const job = makeJob('ST1', [cue], undefined, new Date(0), { renders: [undefined], wave: { clip, render } })
    expect(job.cues).toHaveLength(1)
    expect(job.wave!.n).toBe(WAVE_N)
    const lua = jobToLua(job)
    expect(lua.indexOf('900000')).toBeLessThan(lua.indexOf('हर पल'))
    expect(lua).toContain('dir = "C:\\\\MC\\\\renders\\\\wave_1"')
    expect(lua).not.toContain('wave =')
  })

  it('signs the wave by look, sound and place', () => {
    expect(waveSig(clip, false)).toBe(waveSig({ ...clip }, false))
    expect(waveSig(clip, true)).not.toBe(waveSig(clip, false))
    expect(waveSig({ ...clip, look: { ...DEFAULT_WAVE, height: 0.1 } }, false)).not.toBe(waveSig(clip, false))
    expect(waveSig({ ...clip, startMs: 40, endMs: 1040 }, false)).not.toBe(waveSig(clip, false))
    expect(waveKey(clip, 1080, 1920, 25)).not.toBe(waveKey(clip, 1080, 1920, 30))
  })

  it('leaves a job without a wave as it was', () => {
    const job = makeJob('ST1', [cue], undefined, new Date(0))
    expect(job.wave).toBeUndefined()
    expect(jobToLua(job)).not.toContain('900000')
  })
})

describe('the wave under the captions', () => {
  const cap = { anchor: 7, y: 0, size: 0.084, lineSpacing: 1, lines: '2' as const }
  it('sits just below bottom captions, its top clear of them', () => {
    const y = waveUnder(cap, 9 / 16, DEFAULT_WAVE)
    // Bottom captions end 0.16 from the bottom, so 0.84 from the top
    expect(y - DEFAULT_WAVE.height).toBeGreaterThan(0.84)
    expect(y).toBeLessThan(0.97)
  })
  it('follows the captions up when they move up', () => {
    expect(waveUnder({ ...cap, y: 0.2 }, 9 / 16, DEFAULT_WAVE)).toBeCloseTo(waveUnder(cap, 9 / 16, DEFAULT_WAVE) - 0.2, 5)
  })
  it('goes lower for taller middle captions', () => {
    const mid = { ...cap, anchor: 4 }
    expect(waveUnder({ ...mid, size: 0.12 }, 9 / 16, DEFAULT_WAVE)).toBeGreaterThan(waveUnder(mid, 9 / 16, DEFAULT_WAVE))
  })
})
