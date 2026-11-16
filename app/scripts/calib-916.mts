// 9:16 calibration: the same captions as Text+ in Resolve and as the app draws them, to
// measure size, letter space, outline, shadow and box against each other.
//   node scripts/calib-916.mts job       writes job.lua and inbox.lua (Resolve 21.1+): a new
//                                        1080×1920 timeline MC_Calib916 with a still of each
//   node scripts/calib-916.mts draw <req.json>   a drawing request for the app's test hook:
//                                        npm run build && set MC_RENDER_TEST=<req.json> && npx electron .
// Add 2 at the end for the second round (Size, box start, blur), 3 for the third (1920×1080). Every caption is still (Fade, a still at 1200 ms, when it is fully in).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { compileCue, type CompiledCue } from '../src/core/compile.ts'
import { DEFAULT_LOOK, type Look } from '../src/core/look.ts'
import { jobToLua, makeJob } from '../src/core/job.ts'
import { writeInbox } from '../src/main/bridgeFiles.ts'
import type { Cue } from '../src/core/srt.ts'

const wide = process.argv.includes('3')
const W = wide ? 1920 : 1080
const H = wide ? 1080 : 1920
const aspect = W / H
const LEN = 2400
const GAP = 400
export const STILL_MS = 1200

const R = [1, 0.15, 0.1] as const
const B = [0.1, 0.35, 1] as const
const noShadow = { ...DEFAULT_LOOK.shadow, on: false }
const base: Partial<Look> = { font: 'Open Sans', style: 'Bold', size: 0.08, anchor: 4, shadow: noShadow, lines: 'keep', maxWidth: 0.95 }
const HHH = 'HHHH\nHHHH\nHHHH'

const ROUND1: [string, string, Partial<Look>][] = [
  ['Open Sans 0.08, 3 lines', HHH, {}],
  ['Vesper Libre 0.08, 3 lines', HHH, { font: 'Vesper Libre' }],
  ['Open Sans 0.04, 3 lines', HHH, { size: 0.04 }],
  ['Open Sans 0.08, letter space 1', 'HHHHHHHHHH', {}],
  ['Open Sans 0.08, letter space 1.2', 'HHHHHHHHHH', { tracking: 1.2 }],
  ['Vesper Libre Hindi 0.08', 'प्रदूषण के नाम पर', { font: 'Vesper Libre' }],
  ['Outline 0.1 red', 'HHHH', { outline: { ...DEFAULT_LOOK.outline, on: true, width: 0.1, color: R } }],
  ['Outline 0.3 red', 'HHHH', { outline: { ...DEFAULT_LOOK.outline, on: true, width: 0.3, color: R } }],
  ['Shadow red, distance 1.5, blur 0', 'HHHH', { shadow: { on: true, blur: 0, distance: 1.5, opacity: 1, color: R } }],
  ['Shadow red, distance 1.5, blur 1', 'HHHH', { shadow: { on: true, blur: 1, distance: 1.5, opacity: 1, color: R } }],
  ['Box blue, pad 0.5, round 0', 'HHHH', { box: { on: true, color: B, opacity: 1, round: 0, pad: 0.5 } }],
  ['Box blue, pad 1, round 0.5', 'HHHH', { box: { on: true, color: B, opacity: 1, round: 0.5, pad: 1 } }],
]

// Round 2: do outline, shadow and box follow Size, and what does the box start from
const shadow = (distance: number, blur: number) => ({ shadow: { on: true, blur, distance, opacity: 1, color: R } })
const box = (pad: number, round: number) => ({ box: { on: true, color: B, opacity: 1, round, pad } })
const ROUND2: [string, string, Partial<Look>][] = [
  ['Shadow distance 5, blur 0', 'HHHH', shadow(5, 0)],
  ['Shadow distance 5, blur 0, size 0.04', 'HHHH', { ...shadow(5, 0), size: 0.04 }],
  ['Outline 0.3, size 0.04', 'HHHH', { size: 0.04, outline: { ...DEFAULT_LOOK.outline, on: true, width: 0.3, color: R } }],
  ['Box pad 1, round 0.5, size 0.04', 'HHHH', { ...box(1, 0.5), size: 0.04 }],
  ['Box pad 0, round 0', 'HHHH', box(0, 0)],
  ['Box pad 0, round 1', 'HHHH', box(0, 1)],
  ['Box pad 0, Vesper Libre', 'HHHH', { ...box(0, 0), font: 'Vesper Libre' }],
  ['Box pad 0, longer', 'HHHH HHHH', box(0, 0)],
  ['Shadow distance 0, blur 1', 'HHHH', shadow(0, 1)],
  ['Shadow distance 0, blur 0.3', 'HHHH', shadow(0, 0.3)],
  ['Shadow distance 0, blur 1, size 0.04', 'HHHH', { ...shadow(0, 1), size: 0.04 }],
  ['Outline 0.3 centred', 'HHHH', { outline: { ...DEFAULT_LOOK.outline, on: true, width: 0.3, color: R, outside: false } }],
  ['Box pad 0, two lines', 'HHHH\nHH', box(0, 0)],
]
// Round 3, on 1920×1080: blur by frame or by pixels, and the rest still right on 16:9
const ROUND3: [string, string, Partial<Look>][] = [
  ['16:9 Open Sans 0.08, 3 lines', HHH, {}],
  ['16:9 Shadow distance 0, blur 1', 'HHHH', shadow(0, 1)],
  ['16:9 Shadow distance 5, blur 0', 'HHHH', shadow(5, 0)],
  ['16:9 Outline 0.3', 'HHHH', { outline: { ...DEFAULT_LOOK.outline, on: true, width: 0.3, color: R } }],
  ['16:9 Box pad 1, round 0.5', 'HHHH', box(1, 0.5)],
  ['16:9 Vesper Libre Hindi, outline 0.2, default shadow', 'प्रदूषण के नाम पर', { font: 'Vesper Libre', outline: { ...DEFAULT_LOOK.outline, on: true, width: 0.2, color: [0, 0, 0] }, shadow: DEFAULT_LOOK.shadow }],
]
export const CASES = wide ? ROUND3 : process.argv.includes('2') ? ROUND2 : ROUND1
const tag = wide ? 'calib169' : process.argv.includes('2') ? 'calib916b' : 'calib916'

const cues: CompiledCue[] = []
let next = 1000
CASES.forEach(([, text, look], i) => {
  const n = i + 1
  const cue: Cue = { n, index: n, startMs: next, endMs: next + LEN, raw: text, text, line: 0 }
  next += LEN + GAP
  cues.push(compileCue(cue, 'fade', { aspect, look: { ...DEFAULT_LOOK, ...base, ...look }, hasGlyphs: () => true }))
})

const [mode, req] = process.argv.slice(2)
const MC = join(process.env['APPDATA'] ?? '.', 'MotionCaption')
if (mode === 'job') {
  mkdirSync(join(MC, 'stills'), { recursive: true })
  const job = makeJob('Calibration 9x16.srt', cues, {
    newTimeline: wide ? 'MC_Calib169' : process.argv.includes('2') ? 'MC_Calib916b' : 'MC_Calib916', size: { width: W, height: H }, openLog: true,
    stills: cues.map((c) => ({ n: c.n, ms: STILL_MS })),
  })
  writeFileSync(join(MC, 'job.lua'), jobToLua(job), 'utf8')
  await writeInbox(MC)
  writeFileSync(join(MC, 'stills', `${tag}_legend.txt`), CASES.map(([name], i) => `c${i + 1}: ${name}`).join('\n') + '\n', 'utf8')
  console.log(`Wrote ${cues.length} captions → job.lua and inbox.lua`)
} else if (mode === 'draw' && req) {
  writeFileSync(req, JSON.stringify({ width: W, height: H, fps: 25, cues }))
  console.log(`Wrote a drawing request for ${cues.length} captions → ${req}`)
} else {
  throw new Error('node scripts/calib-916.mts job | draw <req.json>')
}
