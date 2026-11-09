import { describe, expect, it } from 'vitest'
import { formatTime, parseSrt } from './srt'

const enc = (s: string) => new TextEncoder().encode(s)

function utf16le(s: string, bom = true): Uint8Array {
  const out = new Uint8Array((bom ? 2 : 0) + s.length * 2)
  let o = 0
  if (bom) { out[o++] = 0xff; out[o++] = 0xfe }
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    out[o++] = c & 0xff
    out[o++] = c >> 8
  }
  return out
}

const BASIC = `1
00:00:01,000 --> 00:00:02,500
Hello <i>world</i>

2
00:00:03,000 --> 00:00:04,000
{\\an8}Second line
two
`

describe('parseSrt', () => {
  it('reads cues, times and text', () => {
    const r = parseSrt(enc(BASIC))
    expect(r.cues).toHaveLength(2)
    expect(r.cues[0]).toMatchObject({ n: 1, index: 1, startMs: 1000, endMs: 2500, text: 'Hello world', raw: 'Hello <i>world</i>' })
    expect(r.cues[1]!.text).toBe('Second line\ntwo')
    expect(r.issues).toEqual([])
    expect(r.encoding).toBe('utf-8')
  })

  it('handles CRLF, a UTF-8 BOM and trailing spaces', () => {
    const r = parseSrt(enc('﻿' + BASIC.replace(/\n/g, '\r\n')))
    expect(r.cues).toHaveLength(2)
    expect(r.cues[0]!.startMs).toBe(1000)
  })

  it('reads UTF-16 LE with Bangla text', () => {
    const r = parseSrt(utf16le('1\n00:00:01,000 --> 00:00:02,000\nজীবনকে পূর্ণভাবে অনুভব করুন\n'))
    expect(r.encoding).toBe('utf-16le')
    expect(r.cues[0]!.text).toBe('জীবনকে পূর্ণভাবে অনুভব করুন')
  })

  it('falls back to Windows-1252 and says so', () => {
    const bytes = new Uint8Array([...enc('1\n00:00:01,000 --> 00:00:02,000\nCaf'), 0xe9, 0x0a])
    const r = parseSrt(bytes)
    expect(r.encoding).toBe('windows-1252')
    expect(r.cues[0]!.text).toBe('Café')
    expect(r.issues[0]!.severity).toBe('warning')
  })

  it('accepts dots, short fractions, no hours and missing index lines', () => {
    const r = parseSrt(enc('00:01.5 --> 00:02,25\nNo index\n\n1:00:00.000 --> 1:00:01.000 X1:10 X2:20\nPositioned\n'))
    expect(r.cues.map((c) => [c.startMs, c.endMs])).toEqual([[1500, 2250], [3_600_000, 3_601_000]])
    expect(r.cues[0]!.index).toBeNull()
  })

  it('skips broken blocks and keeps going', () => {
    const r = parseSrt(enc('1\nnot a time\nText\n\n2\n00:00:05,000 --> 00:00:06,000\nGood\n'))
    expect(r.cues).toHaveLength(1)
    expect(r.cues[0]!.text).toBe('Good')
    expect(r.issues).toEqual([expect.objectContaining({ severity: 'error', line: 1 })])
  })

  it('reports reversed times, empty text, overlaps and numbering gaps', () => {
    const r = parseSrt(enc(
      '1\n00:00:02,000 --> 00:00:01,000\nBackwards\n\n' +
      '2\n00:00:03,000 --> 00:00:05,000\n<i></i>\n\n' +
      '5\n00:00:04,000 --> 00:00:06,000\nOverlap\n'))
    const msgs = r.issues.map((x) => `${x.severity}: ${x.message}`)
    expect(msgs).toEqual([
      'error: Caption 1 ends before it starts.',
      'warning: Caption 2 has no text.',
      'warning: Caption 3 starts before caption 2 ends.',
      'info: Numbering jumps from 2 to 5.',
    ])
  })

  it('says when there is nothing to read', () => {
    expect(parseSrt(enc('')).issues[0]!.message).toBe('No captions found in this file.')
  })
})

describe('formatTime', () => {
  it('pads every field', () => {
    expect(formatTime(3_723_045)).toBe('01:02:03,045')
  })
})
