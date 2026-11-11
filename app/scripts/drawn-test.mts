// End-to-end test of drawn captions: the app draws frames, the bridge places them on a new
// test timeline in Resolve and saves stills.
//   node scripts/drawn-test.mts request <req.json>   captions to draw, at the size and rate of
//                                                    the timeline last read (timeline.json)
//   set MC_RENDER_TEST=<req.json> && npx electron .  draws them (after npm run build)
//   node scripts/drawn-test.mts job <req.json>       writes job.lua from <req.json>.out.json
// Then click Workspace → Scripts → MotionCaption in Resolve (or resources/run-in-resolve.ps1).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { compileCue, type CompiledCue } from '../src/core/compile.ts'
import { DEFAULT_LOOK } from '../src/core/look.ts'
import { jobToLua, makeJob, type Rendered } from '../src/core/job.ts'
import type { Cue } from '../src/core/srt.ts'

const [mode, req] = process.argv.slice(2)
if (!req || (mode !== 'request' && mode !== 'job')) throw new Error('node scripts/drawn-test.mts request|job <req.json>')
const MC = join(process.env['APPDATA'] ?? '', 'MotionCaption')

if (mode === 'request') {
  let size = { width: 1080, height: 1920 }
  let fps = 25
  try {
    const t = JSON.parse(readFileSync(join(MC, 'timeline.json'), 'utf8')) as { timeline?: { width: number; height: number; rate: number } }
    if (t.timeline) { size = { width: t.timeline.width, height: t.timeline.height }; fps = t.timeline.rate }
  } catch { /* defaults */ }
  const aspect = size.width / size.height
  // Back to back, as supers on one timeline: a letter animation, a bouncing word, a lower third in a box
  const cue = (n: number, text: string, start: number, end: number): Cue => ({ n, index: n, startMs: start, endMs: end, raw: text, text, line: 0 })
  const cues: CompiledCue[] = [
    compileCue(cue(1, 'ये बात कोई नहीं बताएगा', 500, 3500), 'letterRise', {
      aspect, look: { ...DEFAULT_LOOK, font: 'Nirmala UI', size: 0.09, anchor: 1 }, words: { 2: { color: [1, 0.82, 0.25] } },
    }),
    compileCue(cue(2, 'ध्यान', 3500, 5500), 'bouncePop', {
      aspect, look: { ...DEFAULT_LOOK, font: 'Nirmala UI', size: 0.16, anchor: 4, fill: [1, 0.82, 0.25], outline: { on: true, width: 0.06, color: [0, 0, 0] } },
    }),
    compileCue(cue(3, 'राहुल शर्मा · फ़िटनेस कोच', 4000, 6400), 'blurRise', {
      aspect, look: { ...DEFAULT_LOOK, font: 'Nirmala UI', size: 0.05, y: 0.05, box: { on: true, color: [0, 0, 0], opacity: 0.7, round: 0.3, pad: 0.4 } },
    }),
  ]
  writeFileSync(req, JSON.stringify({ ...size, fps, cues }))
  console.log(`${cues.length} captions at ${size.width}×${size.height}, ${fps} fps → ${req}`)
} else {
  const { cues, width, height } = JSON.parse(readFileSync(req, 'utf8')) as { cues: CompiledCue[]; width: number; height: number }
  const out = JSON.parse(readFileSync(req + '.out.json', 'utf8')) as { ok: boolean; renders: Rendered[]; error?: string }
  if (!out.ok) throw new Error('Drawing failed: ' + out.error)
  const job = makeJob('Drawn test', cues, {
    newTimeline: 'MC_Drawn_Test', openLog: false, size: { width, height },
    stills: [{ n: 1, ms: 200 }, { n: 1, ms: 1500 }, { n: 2, ms: 150 }, { n: 2, ms: 1000 }, { n: 3, ms: 1200 }],
  }, new Date(), { target: { track: 'new', replace: false }, renders: out.renders })
  writeFileSync(join(MC, 'job.lua'), jobToLua(job))
  console.log(`Job ${job.id}: ${job.cues.length} drawn captions → ${join(MC, 'job.lua')}`)
}
