/**
 * App error reporting (TA-22, TA-24, R-OPS-07): crashes, unhandled errors and changes the database refused
 * are sent to our own server (POST /api/logs/errors → /data/logs/errors.jsonl on the VPS) and listed,
 * grouped, in Settings → Data health. Each report carries what is needed to find the cause and its effect on
 * the data: kind, screen, person, app version, connection and how many changes are still waiting to be saved.
 * Never throws; at most 20 reports a minute; the same message within a minute is sent once.
 */
export type ErrorKind = 'crash' | 'error' | 'sync' | 'server'

export interface AppErrorReport {
  at: string
  message: string
  stack?: string
  where?: string
  url: string
  userAgent: string
  /** R-OPS-07 context (older reports have none of these) */
  kind?: ErrorKind
  user?: string
  version?: string
  online?: boolean
  pendingWrites?: number
  table?: string
  op?: string
  rowId?: string
}

declare const __APP_VERSION__: string | undefined
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : 'local'

const recent = new Map<string, number>()
let sentThisMinute = 0
let minuteStart = 0

/** The signed-in person (Supabase keeps the session in localStorage) */
function currentUser(): string {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || ''
      if (/^sb-.*-auth-token$/.test(k)) return String(JSON.parse(localStorage.getItem(k) || '{}')?.user?.email || '')
    }
  } catch { /* storage blocked */ }
  return ''
}
function pendingWrites(): number {
  try { const l = JSON.parse(localStorage.getItem('safaeewala_sync_outbox') || '[]'); return Array.isArray(l) ? l.length : 0 } catch { return 0 }
}
/** crash = a screen fell over; sync = the database refused a change; error = anything else */
export function kindOf(where?: string): ErrorKind {
  if (!where) return 'error'
  if (where === 'sync') return 'sync'
  if (where.startsWith('screen')) return 'crash'
  return 'error'
}

export function reportError(error: unknown, where?: string, extra: Partial<Pick<AppErrorReport, 'table' | 'op' | 'rowId'>> = {}): void {
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
      kind: kindOf(where),
      user: currentUser(),
      version: APP_VERSION,
      online: navigator.onLine,
      pendingWrites: pendingWrites(),
      ...extra,
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

// ── R-OPS-07: grouping and effect on the data ──

export interface ErrorGroup {
  key: string
  kind: ErrorKind
  message: string
  count: number
  first: string
  last: string
  screens: string[]
  users: string[]
  versions: string[]
  tables: string[]
  latest: AppErrorReport
  impact: string
}

/** Same error, different ids / numbers → one group */
const shape = (m: string) => m
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
  .replace(/\b\d+(\.\d+)?\b/g, '<n>')
  .trim()

export function kindOfReport(r: AppErrorReport): ErrorKind {
  if (r.kind) return r.kind
  if (r.where === 'sync' || /not saved to Supabase|has no column/i.test(r.message)) return 'sync'
  return kindOf(r.where)
}

/** What the error means for the data — in plain words */
export function impactOf(kind: ErrorKind, r: AppErrorReport): string {
  if (kind === 'sync') {
    if (/has no column/i.test(r.message)) return 'One field of a change was not saved (the database has no column for it); the rest was saved.'
    if (/outbox full|gave up|given up/i.test(r.message)) return 'A change was NOT saved to the database. A copy is kept on that device (Data health → unsynced) — check and enter it again.'
    return 'A change was not saved to the database yet. It waits on that device and is retried automatically.'
  }
  if (kind === 'crash') return 'A screen crashed and showed an error. Nothing was saved from that screen at that moment; saved data is not affected.'
  if (kind === 'server') return 'The server (VPS) failed on a request: leads, webhooks, backups or sign-in checks may have been affected.'
  return 'Something failed in the background. Usually no effect on saved data.'
}

export function groupErrors(reports: AppErrorReport[]): ErrorGroup[] {
  const map = new Map<string, ErrorGroup>()
  reports.forEach(r => {
    const kind = kindOfReport(r)
    const key = `${kind}|${shape(r.message)}`
    const g = map.get(key)
    const add = (list: string[], v?: string) => { if (v && !list.includes(v)) list.push(v) }
    if (!g) {
      const fresh: ErrorGroup = { key, kind, message: r.message, count: 1, first: r.at, last: r.at, screens: [], users: [], versions: [], tables: [], latest: r, impact: impactOf(kind, r) }
      add(fresh.screens, r.url); add(fresh.users, r.user); add(fresh.versions, r.version); add(fresh.tables, r.table)
      map.set(key, fresh)
      return
    }
    g.count++
    if (r.at < g.first) g.first = r.at
    if (r.at > g.last) { g.last = r.at; g.latest = r; g.message = r.message }
    add(g.screens, r.url); add(g.users, r.user); add(g.versions, r.version); add(g.tables, r.table)
  })
  const rank: Record<ErrorKind, number> = { sync: 0, server: 1, crash: 2, error: 3 }
  return Array.from(map.values()).sort((a, b) => rank[a.kind] - rank[b.kind] || b.last.localeCompare(a.last))
}
