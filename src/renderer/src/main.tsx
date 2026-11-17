import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyThemeMode, savedThemeMode } from './lib/themeMode'
import './styles/theme.css'
import './styles/app.css'

document.documentElement.dataset.platform = window.api.platform
applyThemeMode(savedThemeMode())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
