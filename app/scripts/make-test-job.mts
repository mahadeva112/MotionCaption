// Writes a test job with still frames to %APPDATA%\MotionCaption\job.lua.
//   node scripts/make-test-job.mts          every preset and word effect
//   node scripts/make-test-job.mts words    word effects only, with dense stills
//   node scripts/make-test-job.mts testing  presets not yet verified in Resolve
//   node scripts/make-test-job.mts fps      a mixed set on one new timeline per frame rate,
//                                           checking exact caption frames and every key
//   node scripts/make-test-job.mts cascadeword  a word pop under Letter Cascade, Follower variants
//   node scripts/make-test-job.mts looks    Inspector looks: outline, shadow, box, places, big words, highlights
//   node scripts/make-test-job.mts indic    Hindi letter gaps: outline, blending, level, ligature and font variants
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { compileCue, type CompiledCue, type CompileOpts } from '../src/core/compile.ts'
import { DEFAULT_LOOK, type Look, type WordLook } from '../src/core/look.ts'
import { jobToLua, makeJob } from '../src/core/job.ts'
import { PRESETS } from '../src/core/presets.ts'
import type { Cue } from '../src/core/srt.ts'

const LEN = 2400
const GAP = 400
const cues: CompiledCue[] = []
const stills: { n: number; ms: number }[] = []
const wordsOnly = process.argv[2] === 'words'
const testingOnly = process.argv[2] === 'testing'
const fpsTest = process.argv[2] === 'fps'
const cascadeWord = process.argv[2] === 'cascadeword'
const looks = process.argv[2] === 'looks'
const indic = process.argv[2] === 'indic'
const SHOTS = wordsOnly ? [200, 260, 330, 400, 1500] : testingOnly ? [250, 1200, 2250] : fpsTest ? [400, 1500]
  : cascadeWord ? [300, 450, 600, 750, 900, 1500] : looks || indic ? [1200] : [120, 400, 1500]

// Frame rates people cut reels and films at, including both NTSC timecode kinds
const FRAME_RATES = [
  { rate: '23.976' }, { rate: '25' }, { rate: '29.97' }, { rate: '29.97', dropFrame: true },
  { rate: '30' }, { rate: '50' }, { rate: '59.94' }, { rate: '60' },
]

let nextStart = 1000
// The looks test is laid out for a 9:16 timeline; others keep the old 16:9 sizes
const ASPECT = looks || indic ? 9 / 16 : 16 / 9
type Pick = { word: number; fx: string; color: readonly [number, number, number] }
function add(text: string, preset: string, words: Pick[] | Record<number, WordLook> = [],
  opt: { len?: number; overlap?: number; stills?: boolean; shots?: number[]; extra?: Partial<CompileOpts>; look?: Partial<Look> } = {}) {
  const n = cues.length + 1
  const startMs = nextStart - (opt.overlap ?? 0)
  const endMs = startMs + (opt.len ?? LEN)
  nextStart = endMs + GAP
  const cue: Cue = { n, index: n, startMs, endMs, raw: text, text, line: 0 }
  const w: Record<number, WordLook> = Array.isArray(words)
    ? Object.fromEntries(words.map((x) => [x.word, { effect: x.fx === 'color' ? 'none' : x.fx, color: x.color } as WordLook]))
    : words
  cues.push(compileCue(cue, preset, { aspect: ASPECT, ...opt.extra, words: w, look: { ...DEFAULT_LOOK, ...opt.look } }))
  if (opt.stills ?? true) for (const ms of opt.shots ?? SHOTS) stills.push({ n, ms })
}

const YELLOW = [1, 0.82, 0.2] as const
const BLUE = [0.4, 0.85, 1] as const

if (wordsOnly) {
  add('Every moment is a possibility', 'fade', [{ word: 4, fx: 'pop', color: YELLOW }])
  add('Every moment is a possibility', 'fade', [{ word: 1, fx: 'shake', color: BLUE }])
  add('Every moment is a possibility', 'fade', [{ word: 1, fx: 'pop', color: BLUE }, { word: 4, fx: 'color', color: YELLOW }])
  add('জীবনকে পূর্ণভাবে অনুভব করুন', 'fade', [{ word: 1, fx: 'pop', color: YELLOW }])
  add('Every moment is a possibility', 'cascade', [{ word: 4, fx: 'pop', color: YELLOW }])
} else if (looks) {
  // One caption per Inspector setting; a still in the middle of each. Bright colours so
  // outline, shadow and box show on the test timeline's black (bridge test 4 used black).
  const R = [1, 0.15, 0.1] as const
  const Bl = [0.1, 0.35, 1] as const
  const noShadow = { ...DEFAULT_LOOK.shadow, on: false }
  add('All three · outline shadow box', 'fade', [], { look: { outline: { on: true, width: 0.1, color: R }, shadow: { on: true, blur: 0.3, distance: 1.5, opacity: 1, color: [1, 0.85, 0.1] }, box: { on: true, color: Bl, opacity: 0.9, round: 0.5, pad: 0.5 } } })
  add('Red outline · every moment', 'fade', [], { look: { outline: { on: true, width: 0.1, color: R }, shadow: noShadow } })
  add('Red shadow · every moment', 'fade', [], { look: { shadow: { on: true, blur: 0.3, distance: 1.5, opacity: 1, color: R } } })
  add('Blue box · every moment', 'fade', [], { look: { box: { on: true, color: Bl, opacity: 0.9, round: 0.5, pad: 0.5 }, shadow: noShadow } })
  add('Left aligned · a longer first line and short', 'fade', [], { look: { anchor: 3, align: 'left', maxWidth: 0.55, lines: '2' } })
  add('Right aligned · a longer first line and short', 'fade', [], { look: { anchor: 5, align: 'right', maxWidth: 0.55, lines: '2' } })
  add('But the right time is now', 'fade', { 1: { box: R }, 5: { scale: 1.5, color: [1, 0.82, 0.25], effect: 'pop' } })
  add('Glow on one word', 'fade', { 1: { effect: 'glow', color: [0.4, 0.85, 1] } })
  add('Word by word as it is spoken', 'fade', [], { len: 3000, shots: [900, 1700], extra: { highlight: { rule: 'karaoke', color: [1, 0.82, 0.25], scale: 1 } } })
  add('Shake and lift one word', 'fade', { 1: { effect: 'shake', color: [0.45, 0.95, 0.65] }, 3: { raise: 0.015 } })
} else if (indic) {
  // Gaps between joined Devanagari letters in Resolve (2026-11-09 send: Noto Serif
  // Devanagari Bold, size 0.147, outline 0.25). Same line, one setting changed per caption.
  const HI = 'प्रदूषण के नाम पर'
  const user: Partial<Look> = {
    font: 'Noto Serif Devanagari', style: 'Bold', size: 0.147, lineSpacing: 1.6, fill: [0.25, 0.81, 0.56],
    outline: { on: true, width: 0.25, color: [0, 0, 0] },
  }
  // Round 1 (black outline on black, so outline variants were unreadable): the top line
  // broke between letters with no outline at all; ligature and kerning inputs changed nothing.
  // Round 2: tracking just under 1, a red outline that shows, and whether the per-user font loads.
  const none = { on: false, width: 0.05, color: [0, 0, 0] as [number, number, number] }
  const red = { on: true, width: 0.25, color: [1, 0.15, 0.1] as [number, number, number] }
  const noShadow = { ...DEFAULT_LOOK.shadow, on: false }
  const plain: Partial<Look> = { outline: none, shadow: noShadow }
  const variants: [string, Partial<Look>, [string, number][]][] = [
    ['Noto Serif Devanagari, tracking 1', { ...plain }, []],
    ['tracking 0.98', { ...plain, tracking: 0.98 }, []],
    ['tracking 0.96', { ...plain, tracking: 0.96 }, []],
    ['tracking 0.94', { ...plain, tracking: 0.94 }, []],
    ['tracking 0.92', { ...plain, tracking: 0.92 }, []],
    ['Nirmala UI, tracking 1', { ...plain, font: 'Nirmala UI' }, []],
    ['Nirmala UI, tracking 0.96', { ...plain, font: 'Nirmala UI', tracking: 0.96 }, []],
    ['Nirmala UI, tracking 0.92', { ...plain, font: 'Nirmala UI', tracking: 0.92 }, []],
    ['red outline 0.25, tracking 1', { shadow: noShadow, outline: red }, []],
    ['red outline 0.25, tracking 0.95', { shadow: noShadow, outline: red, tracking: 0.95 }, []],
    ['red outline 0.25, Overlap2=0', { shadow: noShadow, outline: red }, [['Overlap2', 0]]],
    ['red outline 0.25, Overlap2=1', { shadow: noShadow, outline: red }, [['Overlap2', 1]]],
    ['red outline 0.25, Level2=0', { shadow: noShadow, outline: red }, [['Level2', 0]]],
    ['Hind Bold (per-user font), tracking 1', { ...plain, font: 'Hind' }, []],
  ]
  for (const [, look, fixed] of variants) {
    add(HI, 'fade', [], { look: { ...user, ...look } })
    for (const [input, v] of fixed) cues[cues.length - 1]!.fixed.push({ target: 'text', input, v })
  }
  const legend = variants.map(([name], i) => `c${i + 1}: ${name}`).join('\n')
  writeFileSync(join(process.env['APPDATA'] ?? '.', 'MotionCaption', 'stills', 'indic_legend.txt'), legend + '\n', 'utf8')
} else if (cascadeWord) {
  // A word pop under Letter Cascade showed the word before the cascade reached it,
  // brightest at its right end (frame rate test stills). Same caption, Follower variants.
  add('Every moment is a possibility', 'cascade')
  const variants: { order?: number; noShift?: boolean }[] = [{}, { noShift: true }, { order: 1 }, { order: 1, noShift: true }]
  for (const probe of variants) {
    add('Every moment is a possibility', 'cascade', [{ word: 4, fx: 'pop', color: YELLOW }])
    cues[cues.length - 1]!.words[0]!.probe = probe
  }
} else if (fpsTest) {
  // One of each kind of animation: Text+ keys, a Transform move, an XY path, letter
  // delays (in frames, so rate-dependent), word overlays, Bangla. Stills only where
  // timing shows by eye: the letter and word ones.
  const no = { stills: false }
  add('Fade · the story begins here', 'fade', [], no)
  add('Pop · the story begins here', 'pop', [], no)
  add('Rise · the story begins here', 'rise', [], no)
  add('Slow Push · the story begins here', 'push', [], no)
  add('Typewriter · the story begins here', 'typewriter')
  add('Letter Cascade · the story begins here', 'cascade')
  add('Every moment is a possibility', 'fade', [{ word: 4, fx: 'pop', color: YELLOW }])
  add('Every moment is a possibility', 'cascade', [{ word: 4, fx: 'pop', color: YELLOW }])
  add('জীবনকে পূর্ণভাবে অনুভব করুন', 'fade', [{ word: 1, fx: 'shake', color: BLUE }], no)
  // Times that fall between frames at every rate, and a caption a few frames long
  nextStart += 37
  add('Odd times · 1 234 ms long', 'impact', [], { len: 1234, stills: false })
  add('Short', 'fade', [], { len: 130, stills: false })
  // Two captions overlapping by half a second: the second goes on a second track
  add('Overlap A', 'fade', [], { len: 1500, stills: false })
  add('Overlap B', 'pop', [], { len: 1500, overlap: 500, stills: false })
} else if (testingOnly) {
  // Presets not yet checked in Resolve output
  for (const p of PRESETS.filter((x) => x.status === 'testing')) add(`${p.name} · the story begins here`, p.id)
} else {
  for (const p of PRESETS) add(`${p.name} · the story begins here`, p.id)
  add('Every moment is a possibility', 'fade', [{ word: 4, fx: 'color', color: YELLOW }])
  add('Every moment is a possibility', 'fade', [{ word: 4, fx: 'pop', color: YELLOW }])
  add('Every moment is a possibility', 'fade', [{ word: 1, fx: 'shake', color: BLUE }])
  add('জীবনকে পূর্ণভাবে অনুভব করুন', 'cascade')
  add('জীবনকে পূর্ণভাবে অনুভব করুন', 'fade', [{ word: 1, fx: 'color', color: YELLOW }])
}

const dir = join(process.env['APPDATA'] ?? '.', 'MotionCaption')
mkdirSync(join(dir, 'stills'), { recursive: true })
const job = makeJob(fpsTest ? 'Frame rate test.srt' : 'Bridge test.srt', cues, {
  newTimeline: wordsOnly ? 'MC_WordTest' : testingOnly ? 'MC_NewPresets' : fpsTest ? 'MC_FPS' : cascadeWord ? 'MC_CascadeWord' : looks ? 'MC_Looks' : indic ? 'MC_Indic' : 'MC_BridgeTest',
  stills, openLog: true, probe: true,
  ...(fpsTest ? { frameRates: FRAME_RATES } : {}),
  ...(looks ? { size: { width: 1080, height: 1920 }, toggle: true } : {}),
  ...(indic ? { size: { width: 1080, height: 1920 } } : {}),
})
writeFileSync(join(dir, 'job.lua'), jobToLua(job), 'utf8')
console.log(`Wrote ${cues.length} captions, ${stills.length} stills → ${join(dir, 'job.lua')}`)
