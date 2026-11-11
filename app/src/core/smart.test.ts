import { describe, expect, it } from 'vitest'
import { presetById } from './presets.ts'
import { emphasisOf, fits, kindOf, MOODS, smartList, type Mood } from './smart.ts'

const at = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs })

// A short reel in Hindi, back to back, like real subtitles
const REEL = [
  at('ये बात कोई नहीं बताएगा', 0, 2400),
  at('ज़्यादातर लोग सही समय का इंतज़ार करते हैं, लेकिन वो समय कभी नहीं आता', 2500, 5200),
  at('कभी नहीं!', 5300, 6400),
  at('सिर्फ़ 5 मिनट रोज़', 6500, 8300),
  at('क्या तुम तैयार हो?', 8400, 10200),
  at('हर दिन छोटे कदम', 10300, 12300),
  at('ऐसे ही सब बदलता है', 12400, 14400),
  at('तुम्हारी ज़िंदगी तुम्हारे हाथ में है', 14500, 16900),
]

describe('Smart Auto', () => {
  it('only uses presets that exist and were checked in Resolve', () => {
    for (const mood of Object.values(MOODS)) {
      for (const ids of Object.values(mood)) {
        for (const id of ids) {
          expect(presetById(id), id).toBeDefined()
          expect(presetById(id)!.status, id).toBe('verified')
        }
      }
    }
  })

  it('reads what kind of line a caption is', () => {
    expect(REEL.map((c, i) => kindOf(c, i))).toEqual(['hook', 'long', 'punch', 'number', 'question', 'line', 'line', 'line'])
  })

  it('lights the number, or the word with the "!"', () => {
    expect(emphasisOf(REEL[3]!)).toBe(1)
    expect(emphasisOf(REEL[2]!)).toBe(1)
    expect(emphasisOf(REEL[5]!)).toBeNull()
  })

  it('picks from the mood, never the same twice in a row, the same every time', () => {
    for (const mood of ['calm', 'energetic', 'cinematic'] as Mood[]) {
      const a = smartList(REEL, mood, 3)
      expect(a).toEqual(smartList(REEL, mood, 3))
      a.forEach((p, i) => {
        if (i > 0) expect(p.preset, `${mood} ${i}`).not.toBe(a[i - 1]!.preset)
        expect(fits(p.preset, REEL[i]!), `${mood} ${p.preset} on ${i}`).toBe(true)
      })
      expect(MOODS[mood].hook).toContain(a[0]!.preset)
      expect(MOODS[mood].long).toContain(a[1]!.preset)
    }
  })

  it('a new seed is a new draw', () => {
    const draws = new Set([1, 2, 3, 4, 5].map((s) => smartList(REEL, 'energetic', s).map((p) => p.preset).join()))
    expect(draws.size).toBeGreaterThan(1)
  })

  it('gives letter animations only to captions with time for every letter', () => {
    expect(fits('letterRise', at('ये बात कोई नहीं बताएगा', 0, 2400))).toBe(true)
    expect(fits('letterRise', at('ये बात कोई नहीं बताएगा', 0, 1200))).toBe(false)
    expect(fits('scope', at('छोटा', 0, 1500))).toBe(false)
  })

  it('gives a short hook a lively entry, not a plain fade', () => {
    const hook = smartList([at('हर पल एक संभावना है', 0, 1750), at('जो कर सकते हो, करो', 1900, 3650)], 'cinematic', 1)[0]!
    expect(hook.kind).toBe('hook')
    expect(MOODS.cinematic.long).not.toContain(hook.preset)
  })
})
