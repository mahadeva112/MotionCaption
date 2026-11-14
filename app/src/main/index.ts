import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, Tray } from 'electron'
import { createReadStream, watch } from 'node:fs'
import { execFile } from 'node:child_process'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { closeStage, renderCues, type RenderRequest } from './render.ts'
import { setupUpdates } from './updater.ts'
import { readBridge, writeInbox as writeInboxIn } from './bridgeFiles.ts'

// Where Resolve looks for Workspace → Scripts entries, and where the bridge reads jobs.
const APPDATA = process.env['APPDATA'] ?? app.getPath('appData')
const RESOLVE_DIR = join(APPDATA, 'Blackmagic Design', 'DaVinci Resolve')
const SCRIPTS_DIR = join(RESOLVE_DIR, 'Support', 'Fusion', 'Scripts', 'Utility')
const SCRIPT = join(SCRIPTS_DIR, 'MotionCaption.lua')
const MC_DIR = join(APPDATA, 'MotionCaption')
const JOB = join(MC_DIR, 'job.lua')
const RESULT = join(MC_DIR, 'result.json')
const PROGRESS = join(MC_DIR, 'progress.json')
const TEMPLATES = join(MC_DIR, 'templates')
/** The open timeline's tracks and subtitles, written by the Resolve script on every click */
const TIMELINE = join(MC_DIR, 'timeline.json')
/** Written every half second by the Link window in Resolve while it is open */
const LINK = join(MC_DIR, 'link.json')
/** The app asking the Link window for a new timeline read */
const REFRESH = join(MC_DIR, 'refresh.txt')
/** Captions the app drew as PNG frames, one folder each (main/render.ts) */
const RENDERS = join(MC_DIR, 'renders')
/** Timeline videos Resolve rendered for the preview, and which is the latest for each timeline */
const PREVIEWS = join(MC_DIR, 'preview')
const PREVIEW_INDEX = join(PREVIEWS, 'latest.json')
/** The still the Resolve script writes its files through in Resolve 21.1+ (main/bridgeFiles.ts) */
const MAILBOX = join(MC_DIR, 'mc_mailbox.png')
const writeInbox = () => writeInboxIn(MC_DIR)

// The preview plays timeline videos from mcvideo://file/<name>, only from PREVIEWS. Seeking
// needs byte ranges, so the handler answers them itself.
protocol.registerSchemesAsPrivileged([{ scheme: 'mcvideo', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }])

async function serveVideo(req: Request): Promise<Response> {
  const name = decodeURIComponent(new URL(req.url).pathname.replace(/^\/+/, ''))
  if (!/^[\w.-]+\.mp4$/.test(name)) return new Response(null, { status: 404 })
  const path = join(PREVIEWS, name)
  let size: number
  try { size = (await stat(path)).size } catch { return new Response(null, { status: 404 }) }
  const head = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' }
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '')
  if (!m || (!m[1] && !m[2])) {
    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { headers: { ...head, 'Content-Length': String(size) } })
  }
  // "bytes=500-" from 500 on, "bytes=-500" the last 500
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  return new Response(Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream, {
    status: 206, headers: { ...head, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
  })
}

type PreviewIndex = Record<string, { file: string; at: string }>
const readIndex = async (): Promise<PreviewIndex> => {
  try { return JSON.parse(await readFile(PREVIEW_INDEX, 'utf8')) as PreviewIndex } catch { return {} }
}
const videoOf = (e: { file: string; at: string }) => ({ url: 'mcvideo://file/' + encodeURIComponent(basename(e.file)), at: e.at })

const resource = (name: string) =>
  app.isPackaged ? join(process.resourcesPath, name) : join(__dirname, '..', '..', 'resources', name)

const exists = (p: string) => stat(p).then(() => true, () => false)

async function sameFile(a: string, b: string): Promise<boolean> {
  try {
    const [x, y] = await Promise.all([readFile(a), readFile(b)])
    return x.equals(y)
  } catch {
    return false
  }
}

// The top-bar logo, for the title bar, taskbar and tray (build/icon.ico, made by scripts/make_icon.py)
const ICON = app.isPackaged ? join(process.resourcesPath, 'icon.ico') : join(__dirname, '..', '..', 'build', 'icon.ico')

/**
 * Resolve 21.1+ cannot start programs from its scripts, so the app waits in the tray to be
 * called: it starts with Windows (--background, no window), closing the window only hides it,
 * and a click on MotionCaption in Resolve brings it forward (open.txt.csv, see watchOpen).
 * Quit from the tray menu ends it.
 */
let mainWin: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
const BACKGROUND = '--background'
/** Written once the app has turned "Start with Windows" on by itself, so turning it off sticks */
const AUTOSTART_SET = join(MC_DIR, 'autostart.txt')

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0e0f13',
    title: 'MotionCaption Studio',
    icon: ICON,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  mainWin = win
  win.setMenuBarVisibility(false)
  win.on('close', (e) => {
    if (quitting || !tray) return
    e.preventDefault()
    win.hide()
  })

  // Tell the page when the Resolve script writes a new timeline.json. The folder is
  // watched, not the file, because the script replaces the file each time.
  mkdir(MC_DIR, { recursive: true }).then(() => {
    let t: NodeJS.Timeout | undefined
    const w = watch(MC_DIR, (_ev, name) => {
      if (name !== 'timeline.json' && name !== 'timeline.json.csv') return
      clearTimeout(t)
      t = setTimeout(() => { if (!win.isDestroyed()) win.webContents.send('timeline:changed') }, 150)
    })
    win.on('closed', () => w.close())
  }).catch(() => {})

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  win.on('closed', () => {
    if (mainWin === win) mainWin = null
    closeStage()
  })
  return win
}

/** Brings the window forward, making it first when the app started in the background */
function showMain(): void {
  const fresh = !(mainWin && !mainWin.isDestroyed())
  const win = fresh ? createWindow() : mainWin!
  // Windows keeps an app in the background from taking the foreground; on top for a moment gets it there
  const forward = () => {
    if (win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.setAlwaysOnTop(true)
    win.focus()
    win.moveTop()
    setTimeout(() => { if (!win.isDestroyed()) win.setAlwaysOnTop(false) }, 400)
  }
  // A new window shows itself and then the page takes a moment: forward again once it is drawn
  if (fresh) win.once('ready-to-show', forward)
  forward()
}

const loginItem = () => ({ path: process.execPath, args: [BACKGROUND] })
const autoStartOn = () => app.getLoginItemSettings(loginItem()).openAtLogin
function setAutoStart(on: boolean): void {
  app.setLoginItemSettings({ ...loginItem(), openAtLogin: on })
}

function setupTray(): void {
  tray = new Tray(ICON)
  tray.setToolTip('MotionCaption Studio')
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open MotionCaption Studio', click: showMain },
    {
      label: 'Start with Windows', type: 'checkbox', checked: app.isPackaged && autoStartOn(), enabled: app.isPackaged,
      click: (item) => { setAutoStart(item.checked); tray?.setContextMenu(menu()) },
    },
    { type: 'separator' },
    { label: 'Quit MotionCaption Studio', click: () => { quitting = true; app.quit() } },
  ])
  tray.setContextMenu(menu())
  tray.on('click', showMain)
}

/** The Resolve script asks for the app by writing open.txt (open.txt.csv in Resolve 21.1+) */
function watchOpen(): void {
  mkdir(MC_DIR, { recursive: true }).then(() => {
    let t: NodeJS.Timeout | undefined
    watch(MC_DIR, (_ev, name) => {
      if (name !== 'open.txt.csv' && name !== 'open.txt') return
      clearTimeout(t)
      t = setTimeout(showMain, 100)
    })
  }).catch(() => {})
}

/** The app's page, for the hidden window that draws captions */
const PAGE = { dev: process.env['ELECTRON_RENDERER_URL'], file: join(__dirname, '../renderer/index.html') }

/** One drawing at a time: a second Send waits for the first */
let drawing: Promise<unknown> = Promise.resolve()

/** Draws the captions as PNG frames for Resolve; tells the page how far it has got */
ipcMain.handle('render:cues', (e, req: RenderRequest) => {
  const run = drawing.then(() => renderCues(RENDERS, PAGE, req, (done, total, note) => {
    if (!e.sender.isDestroyed()) e.sender.send('render:progress', { done, total, note })
  }))
  drawing = run.catch(() => {})
  return run
})

// The SRT is only ever read. Edits live in the app, never in the original file.
ipcMain.handle('srt:open', async () => {
  const pick = await dialog.showOpenDialog({
    title: 'Add subtitles',
    properties: ['openFile'],
    filters: [{ name: 'Subtitles', extensions: ['srt'] }],
  })
  const path = pick.filePaths[0]
  if (pick.canceled || !path) return null
  const bytes = await readFile(path)
  return { path, name: basename(path), bytes: new Uint8Array(bytes) }
})

/** The timeline the Resolve script last read, or null before the first click */
ipcMain.handle('timeline:get', async () => {
  try {
    return JSON.parse(await readBridge(TIMELINE))
  } catch {
    return null
  }
})

/** Whether the Link window in Resolve is open, so a Send goes straight in */
ipcMain.handle('link:status', async () => {
  try {
    const l = JSON.parse(await readFile(LINK, 'utf8')) as { at?: number; timeline?: string }
    const alive = typeof l.at === 'number' && Date.now() / 1000 - l.at <= 3
    return { alive, timeline: alive ? l.timeline ?? null : null }
  } catch {
    return { alive: false, timeline: null }
  }
})

ipcMain.handle('timeline:refresh', async () => {
  await mkdir(MC_DIR, { recursive: true })
  await writeFile(REFRESH, new Date().toISOString(), 'utf8')
  await writeInbox().catch(() => {})
  return true
})

/**
 * Runs Workspace → Scripts → MotionCaption in Resolve through its menu (Windows UI
 * Automation), so a Send needs no click there. Resolves to OK, NO_RESOLVE, NO_MENU …
 * or ERROR …, as printed by run-in-resolve.ps1.
 */
ipcMain.handle('resolve:run', async () => {
  await writeInbox().catch(() => {})
  return runInResolve()
})

const runInResolve = () => new Promise<string>((done) => {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resource('run-in-resolve.ps1')],
    { windowsHide: true, timeout: 20000 },
    (err, out) => done(String(out || '').trim().split(/\r?\n/).pop() || (err ? 'ERROR ' + err.message : 'ERROR no answer')))
})

ipcMain.handle('resolve:status', async () => ({
  resolveFound: await exists(RESOLVE_DIR),
  scriptInstalled: await exists(SCRIPT),
  scriptCurrent: await installCurrent(),
}))

async function installCurrent(): Promise<boolean> {
  return (await sameFile(resource('MotionCaption.lua'), SCRIPT)) && (await sameFile(resource('mc_mailbox.png'), MAILBOX)) && (await templatesCurrent())
}

/**
 * One Text+ template per frame rate (scripts/make_templates.py). Resolve converts a
 * caption's length from the template's rate to the timeline's, rounding down, so the
 * bridge places captions from the template whose rate matches the timeline.
 */
async function templateFiles(): Promise<string[]> {
  return (await readdir(resource('templates'))).filter((f) => f.endsWith('.drb'))
}

async function templatesCurrent(): Promise<boolean> {
  const files = await templateFiles()
  const same = await Promise.all(files.map((f) => sameFile(join(resource('templates'), f), join(TEMPLATES, f))))
  return same.every(Boolean)
}

/** Puts the bridge in Resolve's Scripts menu and the Text+ templates where the bridge finds them */
async function install(): Promise<void> {
  await mkdir(SCRIPTS_DIR, { recursive: true })
  await copyFile(resource('MotionCaption.lua'), SCRIPT)
  await mkdir(MC_DIR, { recursive: true })
  await copyFile(resource('mc_mailbox.png'), MAILBOX)
  await mkdir(TEMPLATES, { recursive: true })
  for (const f of await templateFiles()) await copyFile(join(resource('templates'), f), join(TEMPLATES, f))
}

ipcMain.handle('resolve:install', async () => {
  await install()
  return true
})

ipcMain.handle('job:send', async (_e, lua: string) => {
  if (!(await installCurrent())) await install()
  await writeFile(JOB, lua, 'utf8')
  await writeInbox()
  return JOB
})

/** The bridge's report for this job, or null while Resolve has not run it yet */
ipcMain.handle('job:result', async (_e, jobId: string) => {
  try {
    const r = JSON.parse(await readBridge(RESULT)) as { jobId?: string }
    if (r.jobId !== jobId) return null
    // The job is done: the next inbox says so, so a click in Resolve does not place it again
    await writeInbox().catch(() => {})
    return r
  } catch {
    return null
  }
})

/** How far the Resolve script has got with this job, or null before it starts */
ipcMain.handle('job:progress', async (_e, jobId: string) => {
  try {
    const p = JSON.parse(await readBridge(PROGRESS)) as { jobId?: string }
    return p.jobId === jobId ? p : null
  } catch {
    return null
  }
})

/** Where the bridge renders timeline videos (with the backslash Resolve's TargetDir wants) */
ipcMain.handle('preview:dir', async () => {
  await mkdir(PREVIEWS, { recursive: true })
  return PREVIEWS + '\\'
})

/** The latest timeline video for this timeline (project/timeline), or null */
ipcMain.handle('preview:get', async (_e, key: string) => {
  const e = (await readIndex())[key]
  return e && (await exists(e.file)) ? videoOf(e) : null
})

/** Keeps a new timeline video as this timeline's latest, and removes the videos no timeline uses any more */
ipcMain.handle('preview:keep', async (_e, key: string, file: string) => {
  if (dirname(file).toLowerCase() !== PREVIEWS.toLowerCase() || !(await exists(file))) return null
  const index = await readIndex()
  index[key] = { file, at: new Date().toISOString() }
  await writeFile(PREVIEW_INDEX, JSON.stringify(index, null, 1), 'utf8')
  const used = new Set(Object.values(index).map((e) => basename(e.file).toLowerCase()))
  for (const f of await readdir(PREVIEWS)) {
    if (f.toLowerCase().endsWith('.mp4') && !used.has(f.toLowerCase())) await rm(join(PREVIEWS, f), { force: true }).catch(() => {})
  }
  return videoOf(index[key])
})

// Clicking MotionCaption in Resolve opens the app when there is nothing to place. If it
// is already open, bring that window forward instead of starting a second copy.
// Same id as the installer's Start menu shortcut, so the taskbar groups the window
// under that shortcut and shows its icon, not Electron's
app.setAppUserModelId('com.motioncaption.studio')
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', (_e, argv) => {
  // Windows starting the app at login while it already runs changes nothing
  if (!argv.includes(BACKGROUND)) showMain()
})
app.on('before-quit', () => { quitting = true })

app.whenReady().then(() => {
  // Test hook: MC_RENDER_TEST=<request.json> draws its captions, writes <request.json>.out.json, and quits
  const test = process.env['MC_RENDER_TEST']
  if (test) {
    const t0 = Date.now()
    readFile(test, 'utf8')
      .then((s) => renderCues(join(MC_DIR, 'renders-test'), PAGE, JSON.parse(s) as RenderRequest, () => {}))
      .then((r) => writeFile(test + '.out.json', JSON.stringify({ ok: true, ms: Date.now() - t0, renders: r }, null, 1)))
      .catch((err) => writeFile(test + '.out.json', JSON.stringify({ ok: false, error: String(err && err.stack || err) })))
      .finally(() => { closeStage(); app.quit() })
    return
  }
  // The font list comes from the system (Local Font Access), for the Look tab
  const fonts = (p: string) => p === 'local-fonts' || p === 'fonts'
  session.defaultSession.setPermissionCheckHandler((_wc, p) => fonts(p as string))
  session.defaultSession.setPermissionRequestHandler((_wc, p, cb) => cb(fonts(p as string)))
  protocol.handle('mcvideo', serveVideo)
  setupUpdates()
  setupTray()
  watchOpen()
  // Started by Windows at login: wait in the tray until Resolve or the tray asks for the window
  if (!process.argv.includes(BACKGROUND)) createWindow()
  writeInbox().catch(() => {})
  // Start with Windows is on from the first run; after that it is whatever the tray menu says
  if (app.isPackaged) {
    exists(AUTOSTART_SET).then(async (done) => {
      if (done) return
      setAutoStart(true)
      await mkdir(MC_DIR, { recursive: true })
      await writeFile(AUTOSTART_SET, new Date().toISOString(), 'utf8')
    }).catch(() => {})
  }
  // Tell the Resolve script where this app is (the install folder can change on update).
  // Resolve's Lua opens files by the Windows ANSI code page, so a path with other letters
  // is left to the installer, which writes it in that code page.
  if (app.isPackaged && /^[\x20-\x7e]+$/.test(app.getPath('exe'))) {
    mkdir(MC_DIR, { recursive: true })
      .then(() => writeFile(join(MC_DIR, 'app.txt'), app.getPath('exe'), 'utf8'))
      .catch(() => {})
  }
  app.on('activate', showMain)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
