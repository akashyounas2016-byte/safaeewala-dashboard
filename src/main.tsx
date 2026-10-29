import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installApiAuth } from '@/lib/apiAuth'

// Calls to our own /api send the signed-in user's token (SEC-04)
installApiAuth()

// The cloud copy of payments / attendance etc. is pulled after sign-in (App.tsx → AuthGate),
// because the database only answers signed-in users (SEC-03, AUD-02)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
