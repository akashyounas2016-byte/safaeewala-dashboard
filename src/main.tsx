import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installApiAuth } from '@/lib/apiAuth'
// R-APP-02: inside the Android app the page must not run under the status bar / navigation bar — without
// viewport-fit=cover the app's WebView keeps clear of them (Capacitor SystemBars, insetsHandling "css")
if ((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) {
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1.0')
  document.documentElement.classList.add('in-app')
}
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
