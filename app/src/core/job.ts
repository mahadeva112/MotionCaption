import type { CompiledCue } from './compile.ts'

// The job is how the app hands work to Resolve. Resolve Free cannot be driven from
// outside, so the app writes this file and the bridge script (run from
// Workspace → Scripts → MotionCaption) reads it. It is Lua table text because the
// bridge can load that with no parser; it is loaded with no globals, so it can only be data.

export interface JobTest {
  /** Build on a new timeline with this name prefix instead of the current one */
  newTimeline?: string
  /** Still frames to save: caption number and ms into it */
  stills?: { n: number; ms: number }[]
  openLog?: boolean
  /** Check that every key sits on its frame with its value */
  probe?: boolean
  /** Build the same captions on one new timeline per frame rate (needs newTimeline) */
  frameRates?: { rate: string; dropFrame?: boolean }[]
  /** Frame size of the new test timeline (needs newTimeline) */
  size?: { width: number; height: number }
  /** Turn subtitle track 1 of the open timeline off and back on, and log it */
  toggle?: boolean
}

/** Where the captions go (the app's "Put on") */
export interface JobTarget {
  /** A video track number, or 'new' for a new track above everything */
  track: number | 'new'
  /** Remove the last send's captions on this timeline first, and reuse their tracks */
  replace: boolean
  /** Subtitle track to turn off after placing, so the words do not show twice */
  disableSubtitle?: number
  /** Text+ layers the captions were made from, turned off after placing (by track and first frame) */
  disableClips?: { track: number; at: number }[]
}

export interface Job {
  version: 1
  id: string
  createdAt: string
  source: string
  trackName: string
  /** The project and timeline these captions were made for; the bridge places them on
   *  that timeline whichever one is open, and refuses another project */
  project?: string
  timeline?: string
  target?: JobTarget
  cues: CompiledCue[]
  test?: JobTest
}

export function makeJob(source: string, cues: CompiledCue[], test?: JobTest, now = new Date(),
  extra: { project?: string; timeline?: string; target?: JobTarget } = {}): Job {
  const stamp = now.toISOString()
  return {
    version: 1,
    id: `${stamp.replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: stamp,
    source,
    trackName: `MC ${source.replace(/\.[^.]+$/, '')}`.slice(0, 40),
    ...extra,
    cues,
    ...(test ? { test } : {}),
  }
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/
const LUA_WORDS = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in',
  'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while'])

export function luaString(s: string): string {
  let out = '"'
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (ch === '\\') out += '\\\\'
    else if (ch === '"') out += '\\"'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (c < 32 || c === 127) out += '\\' + String(c).padStart(3, '0')
    else out += ch // UTF-8 goes through as bytes; Lua strings are byte strings
  }
  return out + '"'
}

function luaNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Cannot write ${n} to a job`)
  return String(Math.round(n * 1e6) / 1e6)
}

export function toLua(v: unknown, indent = ''): string {
  if (v === null || v === undefined) return 'nil'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return luaNumber(v)
  if (typeof v === 'string') return luaString(v)
  const inner = indent + '  '
  if (Array.isArray(v)) {
    if (v.length === 0) return '{}'
    const flat = v.every((x) => typeof x === 'number')
    if (flat) return '{ ' + v.map((x) => luaNumber(x as number)).join(', ') + ' }'
    return '{\n' + v.map((x) => inner + toLua(x, inner)).join(',\n') + '\n' + indent + '}'
  }
  if (typeof v === 'object') {
    const parts = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => inner + (IDENT.test(k) && !LUA_WORDS.has(k) ? k : `[${luaString(k)}]`) + ' = ' + toLua(x, inner))
    return parts.length ? '{\n' + parts.join(',\n') + '\n' + indent + '}' : '{}'
  }
  throw new Error(`Cannot write a ${typeof v} to a job`)
}

export function jobToLua(job: Job): string {
  return '-- MotionCaption job. Written by the app; read by Workspace → Scripts → MotionCaption.\nreturn ' + toLua(job) + '\n'
}
