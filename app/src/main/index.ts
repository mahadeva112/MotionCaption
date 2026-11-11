import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import { watch } from 'node:fs'
import { execFile } from 'node:child_process'
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { closeStage, renderCues, type RenderRequest } from './render.ts'

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

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0e0f13',
    title: 'MotionCaption Studio',
    // The top-bar logo, for the title bar and taskbar (build/icon.ico, made by scripts/make_icon.py)
    icon: app.isPackaged ? join(process.resourcesPath, 'icon.ico') : join(__dirname, '..', '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  win.setMenuBarVisibility(false)

  // Tell the page when the Resolve script writes a new timeline.json. The folder is
  // watched, not the file, because the script replaces the file each time.
  mkdir(MC_DIR, { recursive: true }).then(() => {
    let t: NodeJS.Timeout | undefined
    const w = watch(MC_DIR, (_ev, name) => {
      if (name !== 'timeline.json') return
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
  win.on('closed', () => closeStage())
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
    return JSON.parse(await readFile(TIMELINE, 'utf8'))
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
  return true
})

/**
 * Runs Workspace → Scripts → MotionCaption in Resolve through its menu (Windows UI
 * Automation), so a Send needs no click there. Resolves to OK, NO_RESOLVE, NO_MENU …
 * or ERROR …, as printed by run-in-resolve.ps1.
 */
ipcMain.handle('resolve:run', () => new Promise<string>((done) => {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resource('run-in-resolve.ps1')],
    { windowsHide: true, timeout: 20000 },
    (err, out) => done(String(out || '').trim().split(/\r?\n/).pop() || (err ? 'ERROR ' + err.message : 'ERROR no answer')))
}))

ipcMain.handle('resolve:status', async () => ({
  resolveFound: await exists(RESOLVE_DIR),
  scriptInstalled: await exists(SCRIPT),
  scriptCurrent: (await sameFile(resource('MotionCaption.lua'), SCRIPT)) && (await templatesCurrent()),
}))

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
  await mkdir(TEMPLATES, { recursive: true })
  for (const f of await templateFiles()) await copyFile(join(resource('templates'), f), join(TEMPLATES, f))
}

ipcMain.handle('resolve:install', async () => {
  await install()
  return true
})

ipcMain.handle('job:send', async (_e, lua: string) => {
  if (!(await sameFile(resource('MotionCaption.lua'), SCRIPT)) || !(await templatesCurrent())) await install()
  await writeFile(JOB, lua, 'utf8')
  return JOB
})

/** The bridge's report for this job, or null while Resolve has not run it yet */
ipcMain.handle('job:result', async (_e, jobId: string) => {
  try {
    const r = JSON.parse(await readFile(RESULT, 'utf8')) as { jobId?: string }
    return r.jobId === jobId ? r : null
  } catch {
    return null
  }
})

/** How far the Resolve script has got with this job, or null before it starts */
ipcMain.handle('job:progress', async (_e, jobId: string) => {
  try {
    const p = JSON.parse(await readFile(PROGRESS, 'utf8')) as { jobId?: string }
    return p.jobId === jobId ? p : null
  } catch {
    return null
  }
})

// Clicking MotionCaption in Resolve opens the app when there is nothing to place. If it
// is already open, bring that window forward instead of starting a second copy.
// Same id as the installer's Start menu shortcut, so the taskbar groups the window
// under that shortcut and shows its icon, not Electron's
app.setAppUserModelId('com.motioncaption.studio')
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
})

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
  createWindow()
  // Tell the Resolve script where this app is (the install folder can change on update).
  // Resolve's Lua opens files by the Windows ANSI code page, so a path with other letters
  // is left to the installer, which writes it in that code page.
  if (app.isPackaged && /^[\x20-\x7e]+$/.test(app.getPath('exe'))) {
    mkdir(MC_DIR, { recursive: true })
      .then(() => writeFile(join(MC_DIR, 'app.txt'), app.getPath('exe'), 'utf8'))
      .catch(() => {})
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
