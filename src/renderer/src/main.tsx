import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { MenubarPopup } from './components/MenubarPopup'
import { PipPlayer } from './components/PipPlayer'
import './styles.css'

const view = new URLSearchParams(location.search).get('view')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {view === 'menubar' ? <MenubarPopup /> : view === 'pip' ? <PipPlayer /> : <App />}
  </StrictMode>
)
