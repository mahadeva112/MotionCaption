// Writes a request for the app's frame drawing (main/render.ts) and prints how to run it:
//   node scripts/render-test.mts <out.json>
//   npm run build && set MC_RENDER_TEST=<out.json> && npx electron .
// The app draws the captions into %APPDATA%\MotionCaption\renders-test, writes
// <out.json>.out.json with where each one went and how long it took, and quits.
import { writeFileSync } from 'node:fs'
import { compileCue } from '../src/core/compile.ts'
import { DEFAULT_LOOK } from '../src/core/look.ts'
import type { Cue } from '../src/core/srt.ts'

const out = process.argv[2]
if (!out) throw new Error('Give the request file to write')

const cue = (n: number, text: string, ms: number): Cue => ({ n, index: n, startMs: 0, endMs: ms, raw: text, text, line: 0 })
const W = 1080
const H = 1920
const aspect = W / H

const cues = [
  // A super with letters rising one by one and a word that pops in another colour
  compileCue(cue(1, 'ये बात कोई नहीं बताएगा', 3000), 'letterRise', {
    aspect, look: { ...DEFAULT_LOOK, font: 'Nirmala UI', size: 0.09, anchor: 1 },
    words: { 2: { color: [1, 0.82, 0.25], effect: 'pop' } },
  }),
  // A keyword that bounces in, with an outline
  compileCue(cue(2, 'ध्यान', 2000), 'bouncePop', {
    aspect, look: { ...DEFAULT_LOOK, font: 'Nirmala UI', size: 0.16, anchor: 4, fill: [1, 0.82, 0.25], outline: { on: true, width: 0.06, color: [0, 0, 0] } },
  }),
  // A lower third in a box, out of a blur
  compileCue(cue(3, 'राहुल शर्मा · फ़िटनेस कोच', 2400), 'blurRise', {
    aspect, look: { ...DEFAULT_LOOK, font: 'Nirmala UI', size: 0.05, y: 0.05, box: { on: true, color: [0, 0, 0], opacity: 0.7, round: 0.3, pad: 0.4 } },
  }),
]

writeFileSync(out, JSON.stringify({ width: W, height: H, fps: 25, cues }))
console.log(`Wrote ${cues.length} captions to ${out}`)
