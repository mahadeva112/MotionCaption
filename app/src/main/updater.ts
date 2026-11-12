// Updates from the GitHub releases (electron-updater). The app asks before it downloads
// (unless "Update automatically" is on, which the page decides) and installs only when the
// person presses "Restart and install".
import { app, ipcMain, type WebContents } from 'electron'
import { autoUpdater } from 'electron-updater'
import { notesOf } from './notes.ts'

export interface UpdateState {
  state: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'
  /** The version running now */
  current: string
  /** The new version, once one is found */
  version?: string
  /** What's new, as plain lines (from the release notes on GitHub) */
  notes?: string[]
  percent?: number
  transferred?: number
  total?: number
  error?: string
}

export function setupUpdates(): void {
  let st: UpdateState = { state: 'idle', current: app.getVersion() }
  const pages = new Set<WebContents>()
  const set = (next: Partial<UpdateState>) => {
    st = { ...st, ...next }
    for (const wc of pages) if (!wc.isDestroyed()) wc.send('update:changed', st)
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.on('checking-for-update', () => set({ state: 'checking', error: undefined }))
  autoUpdater.on('update-available', (i) => set({ state: 'available', version: i.version, notes: notesOf(i.releaseNotes) }))
  autoUpdater.on('update-not-available', () => set({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: p.percent, transferred: p.transferred, total: p.total }))
  autoUpdater.on('update-downloaded', (i) => set({ state: 'ready', version: i.version, percent: 100 }))
  autoUpdater.on('error', (e) => set({ state: 'error', error: String(e?.message ?? e).split('\n')[0] }))

  ipcMain.handle('update:state', (e) => { pages.add(e.sender); return st })
  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) { set({ state: 'none' }); return st }
    if (st.state === 'downloading' || st.state === 'ready') return st
    await autoUpdater.checkForUpdates().catch(() => {})
    return st
  })
  ipcMain.handle('update:download', async () => {
    if (st.state !== 'available' && st.state !== 'error') return st
    set({ state: 'downloading', percent: 0, error: undefined })
    await autoUpdater.downloadUpdate().catch(() => {})
    return st
  })
  // Installs quietly into the same folder and opens the new version
  ipcMain.handle('update:install', () => { if (st.state === 'ready') autoUpdater.quitAndInstall(true, true) })
}
