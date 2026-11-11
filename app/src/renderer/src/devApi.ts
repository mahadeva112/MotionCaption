// Lets the UI run in a plain browser during development (no Electron preload there).
// Only installed when window.mc is missing and Vite is in dev mode.
import type { Api, RenderProgress, TimelineData } from '../../preload'

const SAMPLE = `1
00:00:01,000 --> 00:00:03,200
Every moment is a possibility

2
00:00:03,400 --> 00:00:05,600
The story begins with a single step

3
00:00:05,800 --> 00:00:08,000
জীবনকে পূর্ণভাবে অনুভব করুন

4
00:00:08,200 --> 00:00:10,400
Stillness is not the end of motion,
it is the source of the story
`

// A 9:16 reel timeline as the Resolve script would read it (ms from the timeline start)
const LINES = [
  'Every moment is a possibility', 'Most people wait for the right time', 'But the right time is now',
  'Do what you can with what you have', 'Start where you are', 'Small steps, every single day',
  'That is how everything changes', 'Not someday. Today.', 'Your life is in your hands', 'Make it count',
]
const HINDI = ['हर पल एक संभावना है', 'ज़्यादातर लोग सही समय का इंतज़ार करते हैं', 'लेकिन सही समय अभी है', 'जो कर सकते हो, करो',
  'जहाँ हो, वहीं से शुरू करो', 'हर दिन छोटे कदम', 'ऐसे ही सब बदलता है', 'कभी नहीं, आज', 'तुम्हारी ज़िंदगी तुम्हारे हाथ में', 'इसे यादगार बनाओ']
const cueTimes = LINES.map((_, i) => ({ start: 400 + i * 1900, end: 400 + i * 1900 + 1750 }))
export const DEV_TIMELINE: TimelineData = {
  readAt: new Date().toISOString(), project: 'Reel_Project',
  timeline: { name: 'Reel_Final', fps: '23.976', rate: 24000 / 1001, dropFrame: false, width: 1080, height: 1920 },
  video: [
    { index: 1, name: 'Interview', enabled: true, clips: [{ start: 0, end: 19500, name: 'Interview.mp4' }] },
    { index: 2, name: 'B-roll', enabled: true, clips: [{ start: 3800, end: 6300, name: 'city_drone.mp4' }, { start: 11000, end: 12900, name: 'hands.mp4' }] },
    { index: 3, name: 'Titles', enabled: true, clips: [{ start: 0, end: 3500, name: 'Text+' }, { start: 8000, end: 11000, name: 'Text+' }] },
    { index: 4, name: 'Video 4', enabled: true, clips: [{ start: 15000, end: 18500, name: 'Lower Third' }] },
    { index: 5, name: 'MC English', enabled: true, clips: [{ start: 400, end: 2150, name: 'Text+' }] },
  ],
  subtitle: [
    { index: 1, name: 'English', enabled: true, cues: LINES.map((text, i) => ({ ...cueTimes[i]!, text })) },
    { index: 2, name: 'Hindi', enabled: true, cues: HINDI.map((text, i) => ({ ...cueTimes[i]!, text })) },
  ],
  // Text+ titles made by hand in Resolve (V3), plus one of MotionCaption's own captions, which the app leaves out
  texts: [
    { track: 3, at: 86400, start: 0, end: 3500, text: 'HOW TO\nSTART TODAY', name: 'Text+', enabled: true, mc: false, tools: 1,
      raw: { Font: 'Arial', Style: 'Black', Size: 0.12, CharacterSpacing: 1, LineSpacing: 1, Red1: 1, Green1: 0.82, Blue1: 0.25, Center: [0.5, 0.78],
        HorizontalJustificationNew: 1, AngleZ: 0, Enabled2: 1, Thickness2: 0.06, Red2: 0, Green2: 0, Blue2: 0, Enabled3: 0, Enabled4: 0 } },
    { track: 3, at: 86592, start: 8000, end: 11000, text: 'Step 1', name: 'Text+', enabled: true, mc: false, tools: 1,
      raw: { Font: 'Georgia', Style: 'Bold', Size: 0.09, Red1: 1, Green1: 1, Blue1: 1, Center: [0.3, 0.6], AngleZ: -6,
        Enabled2: 0, Enabled3: 0, Enabled4: 1, Red4: 0.9, Green4: 0.2, Blue4: 0.3, Opacity4: 1, Round4: 0.3, ExtendHorizontal4: 0.12 } },
    { track: 4, at: 86760, start: 15000, end: 18500, text: 'Follow for more', name: 'Lower Third', enabled: true, mc: false, tools: 2,
      raw: { Font: 'Open Sans', Style: 'Bold', Size: 0.06, Red1: 1, Green1: 1, Blue1: 1, Center: [0.5, 0.2], Enabled3: 1, SoftnessX3: 8, Offset3: [0.006, -0.006], Opacity3: 0.6 } },
    { track: 5, at: 86410, start: 400, end: 2150, text: 'Every moment is a possibility', name: 'Text+', enabled: true, mc: true, tools: 1, raw: {} },
  ],
}

const renderListeners = new Set<(p: RenderProgress) => void>()

export function installDevApi() {
  if (window.mc || !import.meta.env.DEV) return
  let sentId: string | null = null
  let sentAt = 0
  // Pretend Resolve starts 1.5 s after sending and takes 3 s for 40 captions
  const elapsed = () => (performance.now() - sentAt - 1500) / 3000
  const api: Api = {
    // ?empty in the address shows the first-run screen
    timeline: async () => (location.search.includes('empty') ? null : DEV_TIMELINE),
    // ?nolink in the address shows the app as if the Link window were closed
    linkStatus: async () => (location.search.includes('nolink') ? { alive: false, timeline: null } : { alive: true, timeline: 'Reel_Final' }),
    refreshTimeline: async () => true,
    // ?noresolve in the address acts as if Resolve were closed
    runInResolve: async () => (location.search.includes('noresolve') ? 'NO_RESOLVE' : 'OK'),
    onTimeline: () => () => {},
    // A test can put a real file here first (window.mcDevSrt = { name, bytes }) to open it instead
    openSrt: async () => window.mcDevSrt
      ? { path: window.mcDevSrt.name, name: window.mcDevSrt.name, bytes: window.mcDevSrt.bytes }
      : { path: 'sample.srt', name: 'Sample talk.srt', bytes: new TextEncoder().encode(SAMPLE) },
    resolveStatus: async () => ({ resolveFound: true, scriptInstalled: true, scriptCurrent: true }),
    installScript: async () => true,
    sendJob: async (lua) => {
      sentId = /id = "([^"]+)"/.exec(lua)?.[1] ?? null
      sentAt = performance.now()
      console.log(lua)
      return 'job.lua'
    },
    jobResult: async (jobId) => (jobId === sentId && elapsed() >= 1
      ? { jobId, ok: true, placed: 40, failed: 0, errors: [], timeline: 'Timeline 1', tracks: ['V2 MC Sample talk'], fps: 24 }
      : null),
    jobProgress: async (jobId) => {
      const t = elapsed()
      if (jobId !== sentId || t < 0) return null
      return t < 0.1 ? { jobId, phase: 'placing', done: 0, total: 40 } : { jobId, phase: 'animating', done: Math.floor(Math.min(1, t) * 40), total: 40 }
    },
    // Pretends to draw: 1 s for all the frames, reported as it goes
    renderCues: async (req) => {
      const total = req.cues.reduce((s, c) => s + Math.round(((c.endMs - c.startMs) * req.fps) / 1000) + 1, 0)
      for (let i = 1; i <= 10; i++) {
        await new Promise((r) => setTimeout(r, 100))
        renderListeners.forEach((f) => f({ done: Math.round((total * i) / 10), total, note: 'drawing' }))
      }
      return req.cues.map((c, i) => ({ dir: `C:\\dev\\renders\\${i}`, frames: Math.round(((c.endMs - c.startMs) * req.fps) / 1000) + 1, width: req.width, height: req.height }))
    },
    onRenderProgress: (cb) => { renderListeners.add(cb); return () => { renderListeners.delete(cb) } },
  }
  ;(window as unknown as { mc: Api }).mc = api
}
