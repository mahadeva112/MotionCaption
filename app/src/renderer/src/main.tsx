import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { installDevApi } from './devApi'
import { RenderStage } from './render'
import './app.css'

// The same page draws captions for Resolve in a hidden window (#render)
const drawing = location.hash === '#render'
if (!drawing) installDevApi()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {drawing ? <RenderStage /> : <App />}
  </StrictMode>,
)
