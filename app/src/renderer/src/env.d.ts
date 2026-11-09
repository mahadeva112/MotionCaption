/// <reference types="vite/client" />
import type { Api } from '../../preload'

declare global {
  interface Window {
    mc: Api
    /** Development only: a file for the browser mock's "Add subtitles" to open */
    mcDevSrt?: { name: string; bytes: Uint8Array }
  }
}
