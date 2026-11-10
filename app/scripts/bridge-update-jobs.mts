// Writes the jobs scripts/bridge-update-test.lua runs, made with the app's own compile and job code.
//   node scripts/bridge-update-jobs.mts <app dir> <out dir>
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [app, out] = process.argv.slice(2) as [string, string]
const core = (f: string) => import(pathToFileURL(join(app, 'src', 'core', f)).href)
const { compileCue } = await core('compile.ts')
const { DEFAULT_LOOK } = await core('look.ts')
const { jobToLua, makeJob } = await core('job.ts')

interface C { start: number; end: number; text: string; look?: object; preset?: string }
const base: C[] = [0, 1, 2, 3, 4, 5].map((i) => ({ start: 1000 + i * 2000, end: 2500 + i * 2000, text: `Caption number ${i + 1}` }))

let seq = 0
function write(name: string, cues: C[], extra: { project?: string; timeline?: string; track?: number | 'new'; replace?: boolean } = {}) {
  const compiled = cues.map((c, i) => compileCue(
    { n: i + 1, index: i + 1, startMs: c.start, endMs: c.end, raw: c.text, text: c.text, line: 0 }, c.preset ?? 'fade',
    { look: { ...DEFAULT_LOOK, ...c.look } }))
  // A different id for every job, as every Send has
  const job = makeJob('Test.srt', compiled, undefined, new Date(Date.UTC(2026, 10, 10, 3, 0, seq++)), {
    project: extra.project ?? 'P', timeline: extra.timeline ?? 'Timeline 1',
    target: { track: extra.track ?? 'new', replace: extra.replace ?? true },
  })
  writeFileSync(join(out, name + '.lua'), jobToLua(job), 'utf8')
}

mkdirSync(out, { recursive: true })
const edit = (cues: C[], i: number, change: Partial<C>) => cues.map((c, j) => (j === i ? { ...c, ...change } : c))

write('first', base)
write('same', base)
const colour = edit(base, 2, { look: { fill: [1, 0.8, 0.2] } })
write('one_colour', colour)
const text = edit(colour, 4, { text: 'Caption number five, edited' })
write('one_text', text)
const font = text.map((c) => ({ ...c, look: { ...c.look, font: 'Arial' } }))
write('all_font', font)
const fewer = edit(font.filter((_, i) => i !== 1), 3, { start: 9200, end: 10700 })
write('removed_and_moved', fewer)
write('removed_and_moved_again', fewer)
// One more caption over the first: needs a second track
const overlap = [...fewer, { start: 1500, end: 2400, text: 'On top' }]
write('overlap', overlap)
write('overlap_again', overlap)
write('overlap_one_changed', edit(overlap, 0, { look: { ...overlap[0]!.look, size: 0.09 } }))
// Another project with a timeline of the same name
write('other_project', base, { project: 'Q' })
write('other_project_again', base, { project: 'Q' })
// Captions on a track of the user's own (V2), where a clip covers captions 2 and 3
write('own_track', base, { track: 2 })
write('own_track_again', base, { track: 2 })
write('own_track_one_changed', colour, { track: 2 })
write('own_to_new', colour, { track: 'new' })
// Replace off: a second copy on a new track
write('no_replace', base, { replace: false })
console.log('jobs written to', out)
