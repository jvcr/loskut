import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import EditorPage from './EditorPage'
import { PreferencesProvider } from './i18n'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <EditorPage />
    </PreferencesProvider>
  </StrictMode>,
)
