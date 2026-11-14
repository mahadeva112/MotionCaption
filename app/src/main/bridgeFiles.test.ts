import { mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeMailbox, inboxLua, luaString, readBridge, writeInbox } from './bridgeFiles.ts'

const hex = (s: string) => Buffer.from(s, 'utf8').toString('hex')
/** What Resolve's ExportMetadata writes: UTF-16LE with a BOM, a header row and the clip's row */
const csv = (s: string) => Buffer.concat([Buffer.from([0xff, 0xfe]),
  Buffer.from(`File Name,Comments,Start TC\r\nmc_mailbox.png,MCX${hex(s)}XMC,00:00:00:00\r\n`, 'utf16le')])

describe('mailbox', () => {
  it('decodes a metadata export, Hindi included', () => {
    expect(decodeMailbox(csv('{"a":"नमस्ते, \\"x\\"\n"}'))).toBe('{"a":"नमस्ते, \\"x\\"\n"}')
    expect(decodeMailbox(Buffer.from('File Name\r\nx\r\n'))).toBeNull()
  })

  it('reads whichever of the plain file and its .csv is newer', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mc-'))
    const p = join(dir, 'result.json')
    await writeFile(p, 'plain')
    await writeFile(p + '.csv', csv('from csv'))
    await utimes(p, new Date(1000), new Date(1000))
    expect(await readBridge(p)).toBe('from csv')
    await utimes(p + '.csv', new Date(500), new Date(500))
    expect(await readBridge(p)).toBe('plain')
  })
})

describe('inbox', () => {
  it('writes Lua strings that hold any bytes', () => {
    expect(luaString(Buffer.from('a"b\\c\n'))).toBe('"a\\"b\\\\c\\010"')
    expect(luaString(Buffer.from('क'))).toBe('"\\224\\164\\149"')
  })

  it('hands over the job, the result and every send record', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mc-'))
    await writeFile(join(dir, 'job.lua'), 'return { id = "j1" }')
    await writeFile(join(dir, 'result.json.csv'), csv('{"jobId":"j0"}'))
    await writeFile(join(dir, 'sent_0000abcd.lua.csv'), csv('return {}'))
    await writeFile(join(dir, 'other.txt'), 'no')
    await writeInbox(dir)
    const lua = await readFile(join(dir, 'inbox.lua'), 'utf8')
    expect(lua).toBe(inboxLua(new Map([['job.lua', 'return { id = "j1" }'], ['result.json', '{"jobId":"j0"}'], ['sent_0000abcd.lua', 'return {}']])))
    expect(lua).toContain('fusion:SetData("MotionCaption.Inbox"')
    expect(lua).not.toContain('other')
  })
})
