import { describe, expect, it } from 'vitest'
import { notesOf } from './notes.ts'

describe('update notes', () => {
  it('turns GitHub release HTML into plain lines', () => {
    const html = '<h2>What&#39;s new</h2>\n<ul>\n<li>Custom colour &amp; hex field</li>\n<li><strong>Rounded</strong> drop-downs</li>\n</ul><p>Install over the old one.</p>'
    expect(notesOf(html)).toEqual(["What's new", '• Custom colour & hex field', '• Rounded drop-downs', 'Install over the old one.'])
  })
  it('reads Markdown bullets and per-version notes', () => {
    expect(notesOf([{ note: '- one\n* two' }, { note: null }])).toEqual(['• one', '• two'])
    expect(notesOf(null)).toEqual([])
  })
})
