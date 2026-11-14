// Files shared with the Resolve script when Resolve gives it no file access.
//
// Resolve 21.1+ runs menu scripts in a sandbox: no io, loadfile, dofile, os.remove. There
// the script reads what it needs from inbox.lua (fusion:RunScript runs it, and it hands the
// files over with fusion:SetData), and writes each file as <file>.csv: a metadata export of
// the mc_mailbox.png clip in its MotionCaption bin, the text hex-encoded between MCX and XMC
// in the clip's Comments. Older Resolve versions still read and write the plain files.
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** The text of a mailbox metadata export (UTF-16 with a BOM, or UTF-8), or null when it holds none */
export function decodeMailbox(bytes: Buffer): string | null {
  const text = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.toString('utf16le') : bytes.toString('utf8')
  const m = /MCX([0-9a-f]*)XMC/.exec(text)
  return m ? Buffer.from(m[1] ?? '', 'hex').toString('utf8') : null
}

/** A file the Resolve script wrote: the plain file, or its metadata-export .csv, whichever is newer */
export async function readBridge(path: string): Promise<string> {
  const [plain, csv] = await Promise.all([stat(path).catch(() => null), stat(path + '.csv').catch(() => null)])
  if (csv && (!plain || csv.mtimeMs >= plain.mtimeMs)) {
    const text = decodeMailbox(await readFile(path + '.csv'))
    if (text !== null) return text
    if (!plain) throw new Error('no MotionCaption data in ' + path + '.csv')
  }
  return readFile(path, 'utf8')
}

/** A Lua string literal for any bytes: printable ASCII as is, the rest as \ddd */
export function luaString(bytes: Buffer): string {
  let s = '"'
  for (const b of bytes) {
    if (b === 0x22 || b === 0x5c) s += '\\' + String.fromCharCode(b)
    else if (b >= 0x20 && b < 0x7f) s += String.fromCharCode(b)
    else s += '\\' + String(b).padStart(3, '0')
  }
  return s + '"'
}

/** inbox.lua's text: hands each file to the script under its lower-case name */
export function inboxLua(files: ReadonlyMap<string, string>): string {
  const entries = [...files].map(([name, text]) => `  [${luaString(Buffer.from(name))}] = ${luaString(Buffer.from(text, 'utf8'))},`)
  return `-- Written by MotionCaption Studio for its Resolve script (Resolve 21.1+ sandbox)\nfusion:SetData("MotionCaption.Inbox", {\n${entries.join('\n')}\n})\n`
}

/** Writes <dir>\inbox.lua with the files the Resolve script reads: the job, the last result, and what each send made */
export async function writeInbox(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  const names = new Set(['job.lua', 'result.json', 'last_send.lua', 'refresh.txt'])
  for (const f of await readdir(dir)) {
    const m = /^(sent_[0-9a-f]+\.lua)(\.csv)?$/i.exec(f)
    if (m?.[1]) names.add(m[1].toLowerCase())
  }
  const files = new Map<string, string>()
  for (const name of names) {
    const text = await readBridge(join(dir, name)).catch(() => null)
    if (text !== null) files.set(name, text)
  }
  await writeFile(join(dir, 'inbox.lua'), inboxLua(files), 'utf8')
}
