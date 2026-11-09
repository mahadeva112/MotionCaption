// SRT reading. Never throws on bad content: everything odd becomes an Issue the UI can show.
// Times stay in milliseconds here; frames are worked out in Resolve from the timeline's own rate.

export interface Cue {
  /** Position in the file, 1-based, after skipping broken blocks */
  n: number
  /** The index number written in the file, if any */
  index: number | null
  startMs: number
  endMs: number
  /** Text exactly as in the file (tags kept), lines joined with \n */
  raw: string
  /** Text with <i>-style tags and {\an8}-style overrides removed */
  text: string
  /** 1-based line where the block starts */
  line: number
}

export type Severity = 'error' | 'warning' | 'info'

export interface Issue {
  severity: Severity
  line: number
  message: string
}

export type Encoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252'

export interface ParsedSrt {
  cues: Cue[]
  issues: Issue[]
  encoding: Encoding
}

export function decode(bytes: Uint8Array): { text: string; encoding: Encoding; lossy: boolean } {
  const b = bytes
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(b.subarray(3)), encoding: 'utf-8', lossy: false }
  }
  if (b[0] === 0xff && b[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), encoding: 'utf-16le', lossy: false }
  }
  if (b[0] === 0xfe && b[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), encoding: 'utf-16be', lossy: false }
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), encoding: 'utf-8', lossy: false }
  } catch {
    // Not valid UTF-8: most likely an old Windows file. Readable, but special letters may be wrong.
    return { text: new TextDecoder('windows-1252').decode(b), encoding: 'windows-1252', lossy: true }
  }
}

// 00:01:02,345 --> 00:01:04,000   (also accepts '.', 1–3 digit fractions, and a missing hours field)
const TIME = String.raw`(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})`
const TIMING = new RegExp(`^\\s*${TIME}\\s*-->\\s*${TIME}(?:\\s.*)?$`)

function toMs(h: string | undefined, m: string, s: string, frac: string): number {
  // A fraction is a decimal part of a second: ",5" means 500 ms, not 5 ms
  const ms = Number(frac.padEnd(3, '0'))
  return ((Number(h ?? 0) * 60 + Number(m)) * 60 + Number(s)) * 1000 + ms
}

export function stripTags(raw: string): string {
  return raw
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

export function parseSrt(bytes: Uint8Array): ParsedSrt {
  const { text, encoding, lossy } = decode(bytes)
  const issues: Issue[] = []
  if (lossy) {
    issues.push({
      severity: 'warning',
      line: 1,
      message: 'This file is not UTF-8, so it was read as Windows-1252. Check that special letters look right.',
    })
  }

  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const cues: Cue[] = []
  let i = 0

  while (i < lines.length) {
    while (i < lines.length && lines[i]!.trim() === '') i++
    if (i >= lines.length) break

    const blockStart = i
    const block: string[] = []
    while (i < lines.length && lines[i]!.trim() !== '') block.push(lines[i++]!)

    // Optional index line, then the timing line
    let t = 0
    let index: number | null = null
    if (/^\s*\d+\s*$/.test(block[0]!) && block.length > 1) {
      index = Number(block[0]!.trim())
      t = 1
    }
    const m = TIMING.exec(block[t]!)
    if (!m) {
      issues.push({ severity: 'error', line: blockStart + 1, message: `No timing line found, so this block was skipped: “${block[0]!.trim().slice(0, 60)}”` })
      continue
    }

    const startMs = toMs(m[1], m[2]!, m[3]!, m[4]!)
    const endMs = toMs(m[5], m[6]!, m[7]!, m[8]!)
    const raw = block.slice(t + 1).join('\n')
    const cue: Cue = { n: cues.length + 1, index, startMs, endMs, raw, text: stripTags(raw), line: blockStart + 1 }

    if (endMs <= startMs) {
      issues.push({ severity: 'error', line: blockStart + 1, message: `Caption ${cue.n} ends before it starts.` })
    }
    if (cue.text === '') {
      issues.push({ severity: 'warning', line: blockStart + 1, message: `Caption ${cue.n} has no text.` })
    }
    cues.push(cue)
  }

  for (let k = 1; k < cues.length; k++) {
    const prev = cues[k - 1]!
    const cur = cues[k]!
    if (cur.startMs < prev.endMs) {
      issues.push({ severity: 'warning', line: cur.line, message: `Caption ${cur.n} starts before caption ${prev.n} ends.` })
    }
    if (prev.index !== null && cur.index !== null && cur.index !== prev.index + 1) {
      issues.push({ severity: 'info', line: cur.line, message: `Numbering jumps from ${prev.index} to ${cur.index}.` })
    }
  }

  if (cues.length === 0 && issues.every((x) => x.severity !== 'error')) {
    issues.push({ severity: 'error', line: 1, message: 'No captions found in this file.' })
  }

  return { cues, issues, encoding }
}

export function formatTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor(ms / 60_000) % 60
  const s = Math.floor(ms / 1000) % 60
  const f = ms % 1000
  const p = (v: number, w = 2) => String(v).padStart(w, '0')
  return `${p(h)}:${p(m)}:${p(s)},${p(f, 3)}`
}
