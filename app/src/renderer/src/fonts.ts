import { FALLBACK_FONT, type HasGlyphs } from '@core/compile'
import { roughFontHeight, type FontHeight, type Measure } from '@core/look'

// Fonts on this computer, for the Look tab. Resolve's Text+ takes a family (Font) and a
// style name (Style), which is what Local Font Access gives too.

export interface FontFamily {
  family: string
  styles: string[]
}

const FALLBACK: FontFamily[] = [
  'Open Sans', 'Segoe UI', 'Arial', 'Arial Black', 'Impact', 'Bahnschrift', 'Calibri', 'Georgia', 'Trebuchet MS',
  'Verdana', 'Tahoma', 'Consolas', 'Nirmala UI',
].map((family) => ({ family, styles: ['Regular', 'Bold'] }))

const ORDER = ['Thin', 'ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black']
const rank = (s: string) => {
  const i = ORDER.findIndex((o) => s.replace(/\s|Italic/gi, '').toLowerCase() === o.toLowerCase())
  return (i < 0 ? 4 : i) * 2 + (/italic/i.test(s) ? 1 : 0)
}

interface LocalFont { family: string; style: string }

export async function loadFonts(): Promise<FontFamily[]> {
  try {
    const q = (window as unknown as { queryLocalFonts?: () => Promise<LocalFont[]> }).queryLocalFonts
    if (!q) return FALLBACK
    const list = await q()
    const by = new Map<string, Set<string>>()
    for (const f of list) {
      if (!by.has(f.family)) by.set(f.family, new Set())
      by.get(f.family)!.add(f.style)
    }
    if (!by.size) return FALLBACK
    return [...by.entries()]
      .map(([family, s]) => ({ family, styles: [...s].sort((a, b) => rank(a) - rank(b)) }))
      .sort((a, b) => a.family.localeCompare(b.family))
  } catch {
    return FALLBACK
  }
}

/** CSS weight and slant for a Text+ style name */
export function cssFace(style: string): { weight: number; italic: boolean } {
  const s = style.replace(/\s/g, '').toLowerCase()
  const weight = s.includes('thin') ? 100 : s.includes('extralight') || s.includes('ultralight') ? 200 : s.includes('light') ? 300
    : s.includes('medium') ? 500 : s.includes('semibold') || s.includes('demibold') ? 600 : s.includes('extrabold') || s.includes('ultrabold') ? 800
      : s.includes('black') || s.includes('heavy') ? 900 : s.includes('bold') ? 700 : 400
  return { weight, italic: s.includes('italic') || s.includes('oblique') }
}

const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
const cache = new Map<string, number>()

/** Width of text in em, measured with the real font (as the preview draws it) */
export const measure: Measure = (text, font, style) => {
  const key = font + '|' + style + '|' + text
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  let em = text.length * 0.55
  if (ctx) {
    const f = cssFace(style)
    ctx.font = `${f.italic ? 'italic ' : ''}${f.weight} 100px '${font}', 'Nirmala UI', sans-serif`
    em = ctx.measureText(text).width / 100
  }
  if (cache.size > 20000) cache.clear()
  cache.set(key, em)
  return em
}

const heights = new Map<string, number>()

/** The font's ascent + descent in em: Text+ fits a line of Size to it (core/look.ts textPx) */
export const fontHeight: FontHeight = (font, style) => {
  const key = font + '|' + style
  const hit = heights.get(key)
  if (hit !== undefined) return hit
  let h = roughFontHeight(font, style)
  if (ctx) {
    const f = cssFace(style)
    ctx.font = `${f.italic ? 'italic ' : ''}${f.weight} 100px '${font}', 'Nirmala UI', sans-serif`
    const m = ctx.measureText('Hg')
    if (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent > 0) h = (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent) / 100
  }
  // A font still loading reports the fallback's height: only keep a loaded one's
  if (typeof document === 'undefined' || document.fonts.check(`100px '${font}'`)) heights.set(key, h)
  return h
}

/**
 * Does this font draw the text itself? `measure` falls back to Nirmala UI for letters a
 * font lacks, so a font without them comes out exactly as wide as Nirmala UI does.
 */
export const hasGlyphs: HasGlyphs = (text, font, style) =>
  font === FALLBACK_FONT || measure(text, font, style) !== measure(text, FALLBACK_FONT, style)
