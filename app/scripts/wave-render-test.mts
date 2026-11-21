// Writes a drawing request with an audio wave for the app's test hook, like render-test.mts:
//   node scripts/wave-render-test.mts <sound or video file> <out.json> [seconds]
//   npm run build && set MC_RENDER_TEST=<out.json> && npx electron . --user-data-dir=<scratch>
// The sound is read with the bundled ffmpeg (the app itself reads it with the browser's decoder).
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { analyze, DEFAULT_WAVE, envToText, type WaveClip } from '../src/core/wave.ts'

const [file, out, secs = '8'] = process.argv.slice(2)
if (!file || !out) throw new Error('Give the sound file and the request file to write')

const ffmpeg = createRequire(import.meta.url)('ffmpeg-static') as string
const SR = 22050
const raw = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-t', secs, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 })
const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)
const env = analyze(pcm, SR)
const wave: WaveClip = { look: DEFAULT_WAVE, env: envToText(env), startMs: 0, endMs: Math.round((pcm.length / SR) * 1000) }

writeFileSync(out, JSON.stringify({ width: 1080, height: 1920, fps: 25, cues: [], mov: true, wave }))
console.log(`Wave of ${(wave.endMs / 1000).toFixed(2)} s (${env.low.length} steps) → ${out}`)
