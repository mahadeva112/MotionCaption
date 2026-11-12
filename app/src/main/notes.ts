// Release notes for the update dialog (main/updater.ts)

/** Release notes come as HTML (GitHub renders the Markdown): keep the text, one line each */
export function notesOf(raw: string | { note: string | null }[] | null | undefined): string[] {
  const html = Array.isArray(raw) ? raw.map((n) => n.note ?? '').join('\n') : (raw ?? '')
  return html
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>|<\/(p|h\d|li|ul|ol|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .split('\n')
    .map((l) => l.replace(/^[-*]\s+/, '• ').trim())
    .filter(Boolean)
}
