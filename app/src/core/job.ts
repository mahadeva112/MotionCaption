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
  cues: SentCue[]
  test?: JobTest
  /** Instead of placing captions: render the timeline as a small video for the app's preview */
  preview?: JobPreview
}

/** A timeline video for the preview: picture and sound, without what the app draws itself */
export interface JobPreview {
  /** Folder for the file, ending in a backslash */
  dir: string
  /** File name without .mp4 */
  name: string
  /** Longest side in pixels; the timeline's shape is kept */
  maxSide: number
  /** Text+ layers the captions come from, left out of the video (by track and first frame) */
  hideClips: { track: number; at: number }[]
}

/** A job that only renders the timeline video (no captions are placed) */
export function makePreviewJob(preview: Omit<JobPreview, 'name'>, extra: { project?: string; timeline?: string } = {}, now = new Date()): Job {
  const job = makeJob('Timeline video', [], undefined, now, extra)
  return { ...job, preview: { ...preview, name: 'timeline_' + job.id } }
}

/**
 * A caption the app drew itself, frame by frame, as PNG images with transparency. The
 * bridge only imports them and places the clip: no Text+, no Fusion, so nothing in
 * Resolve Free can change how it looks or moves.
 */
export interface Rendered {
  /** Folder of the frames: f_00000.png … */
  dir: string
  /** How many frames there are: the caption's length plus one blank frame at the end */
  frames: number
  width: number
  height: number
  /** The same frames as one MOV file (ProRes 4444 with transparency), when asked for */
  file?: string
}

/** A caption in a job, with the signature of what the bridge builds from it */
export type SentCue = CompiledCue & { sig: string; render?: Rendered }

/** Goes into every signature. Raise it when the bridge builds a caption differently, so
 *  captions already in Resolve are made again by the next update. */
const BUILD = 1

/** 64-bit string hash (cyrb53's two halves), as 16 hex digits */
function hash(s: string): string {
  let a = 0xdeadbeef
  let b = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    a = Math.imul(a ^ c, 2654435761)
    b = Math.imul(b ^ c, 1597334677)
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909)
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909)
  return (b >>> 0).toString(16).padStart(8, '0') + (a >>> 0).toString(16).padStart(8, '0')
}

/**
 * Signature of everything the bridge turns into a caption: its text, look and animation.
 * Not its number or its place in time: the bridge compares frames itself. Two captions
 * with the same signature at the same frames are the same caption in Resolve, so an
 * update leaves that one alone (MotionCaption.lua, "What was sent").
 */
export function sigOf(cue: CompiledCue): string {
  const { text, look, tracks, fixed, letters, words } = cue
  return hash(JSON.stringify([BUILD, text, look, tracks, fixed, letters ?? null, words]))
}

/** The signature a caption is sent with: a drawn caption and a Text+ caption of the same
 *  look are different clips in Resolve, so switching between them makes it again */
export const sendSig = (cue: CompiledCue, rendered: boolean, mov = false): string => sigOf(cue) + (rendered ? (mov ? 'm' : 'r') : '')

/** A frame rate as ffmpeg takes it: the NTSC rates exactly (24000/1001), others as they are */
export function fpsText(fps: number): string {
  const n = Math.round(fps * 1.001)
  return Math.abs(fps - (n * 1000) / 1001) < 1e-6 && Math.abs(fps - n) > 1e-3 ? `${n * 1000}/1001` : String(Math.round(fps * 1e6) / 1e6)
}

/** Bump when the app draws frames differently, so frames drawn before are not reused */
export const RENDER_VERSION = 1

/** Names the frames of one caption at one frame size and rate: the same key, the same images */
export const renderKey = (cue: CompiledCue, width: number, height: number, fps: number): string =>
  hash(JSON.stringify([RENDER_VERSION, sigOf(cue), cue.endMs - cue.startMs, width, height, fps]))

export function makeJob(source: string, cues: CompiledCue[], test?: JobTest, now = new Date(),
  extra: { project?: string; timeline?: string; target?: JobTarget; renders?: (Rendered | undefined)[] } = {}): Job {
  const stamp = now.toISOString()
  const { renders, ...rest } = extra
  return {
    version: 1,
    id: `${stamp.replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: stamp,
    source,
    trackName: `MC ${source.replace(/\.[^.]+$/, '')}`.slice(0, 40),
    ...rest,
    cues: cues.map((c, i) => {
      const render = renders?.[i]
      const look = c.look.image ? { ...c.look, image: { ...c.look.image, src: '' } } : c.look
      return { ...c, look, sig: sendSig(c, !!render, !!render?.file), ...(render ? { render } : {}) }
    }),
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
