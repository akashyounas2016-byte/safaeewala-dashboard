import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { pullCloudState } from '@/lib/cloudState'

// Screens read payments / attendance from localStorage on mount, so bring the cloud copy in
// first (max ~2.5 s; on failure the app starts with what this browser already has) — AUD-02
void pullCloudState().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
