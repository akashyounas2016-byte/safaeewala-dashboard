/**
 * App error reporting (TA-22, TA-24): crashes and unhandled errors are sent to our own server
 * (POST /api/logs/errors → /data/logs/errors.jsonl on the VPS) and listed in Settings → Data health.
 * Never throws; at most 20 reports a minute; the same message within a minute is sent once.
 */
export interface AppErrorReport {
  at: string
  message: string
  stack?: string
  where?: string
  url: string
  userAgent: string
}

const recent = new Map<string, number>()
let sentThisMinute = 0
let minuteStart = 0

export function reportError(error: unknown, where?: string): void {
  try {
    const now = Date.now()
    if (now - minuteStart > 60_000) { minuteStart = now; sentThisMinute = 0 }
    const message = error instanceof Error ? error.message : String(error)
    const key = `${where || ''}|${message}`
    if ((recent.get(key) || 0) > now - 60_000 || sentThisMinute >= 20) return
    recent.set(key, now)
    sentThisMinute++
    const report: AppErrorReport = {
      at: new Date().toISOString(),
      message: message.slice(0, 500),
      stack: error instanceof Error ? error.stack?.slice(0, 2000) : undefined,
      where,
      url: window.location.pathname,
      userAgent: navigator.userAgent.slice(0, 200),
    }
    void fetch('/api/logs/errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) })
      .catch(() => { /* offline — the console still has it */ })
  } catch { /* reporting must never break the app */ }
}

/** Catch errors that no component handled */
export function installErrorReporting(): void {
  window.addEventListener('error', e => reportError(e.error || e.message, 'window'))
  window.addEventListener('unhandledrejection', e => reportError(e.reason, 'promise'))
}

/** Latest reports for Settings → Data health */
export async function fetchErrorReports(): Promise<AppErrorReport[]> {
  try {
    const r = await fetch('/api/logs/errors')
    return r.ok ? ((await r.json()) as AppErrorReport[]) : []
  } catch {
    return []
  }
}
