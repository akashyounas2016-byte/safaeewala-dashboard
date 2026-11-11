import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installApiAuth } from '@/lib/apiAuth'
import { installErrorReporting } from '@/lib/errorReport'
import { installDateYearLimit } from '@/lib/dateInputs'

// Calls to our own /api send the signed-in user's token (SEC-04)
installApiAuth()
// Unhandled errors are reported to the server and listed in Settings → Data health (TA-24)
installErrorReporting()
// UX-143: no 6-digit years in date boxes
installDateYearLimit()

// The cloud copy of payments / attendance etc. is pulled after sign-in (App.tsx → AuthGate),
// because the database only answers signed-in users (SEC-03, AUD-02)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
