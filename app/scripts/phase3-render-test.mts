// Writes a drawing request with the Phase 3 looks (gradient, picture, counting, path) for
// the app's test hook, like render-test.mts:
//   node scripts/phase3-render-test.mts <out.json>
//   npm run build && set MC_RENDER_TEST=<out.json> && npx electron .
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
const LOGO = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#ff7a3d"/><path d="M22 18l26 14-26 14z" fill="#fff"/></svg>',
).toString('base64')
const look = { ...DEFAULT_LOOK, font: 'Nirmala UI' }

const cues = [
  compileCue(cue(1, 'ये बात कोई नहीं बताएगा', 2000), 'blurRise', {
    aspect, look: { ...look, size: 0.09, anchor: 1, gradient: { on: true, color: [1, 0.35, 0.21], angle: 90 },
      box: { on: true, color: [0.08, 0.08, 0.1], opacity: 0.7, round: 0.4, pad: 0.5 } },
  }),
  compileCue(cue(2, 'मेरा चैनल', 2000), 'pop', {
    aspect, look: { ...look, size: 0.08, anchor: 4, image: { on: true, src: LOGO, size: 1.4, place: 'left' } },
  }),
  compileCue(cue(3, '1,000+ followers', 2000), 'pop', {
    aspect, look: { ...look, size: 0.1, anchor: 4, count: { on: true, from: 0, ms: 1200 } },
  }),
  compileCue(cue(4, 'ध्यान 👇', 2000), 'fade', {
    aspect, look: { ...look, size: 0.1, anchor: 4, path: [[0.2, 0.1], [-0.2, 0.2]] },
  }),
]

writeFileSync(out, JSON.stringify({ width: W, height: H, fps: 25, cues }))
console.log(`${cues.length} captions, ${cues.reduce((s, c) => s + Math.round((c.endMs - c.startMs) / 40) + 1, 0)} frames → ${out}`)
