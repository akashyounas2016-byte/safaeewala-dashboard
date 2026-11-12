import { supabase } from '@/lib/supabase'

export interface FieldChange { field: string; from: string; to: string }

export interface AuditEntry {
  id: string
  created_at: string
  user_name: string | null
  action: string
  entity: string
  entity_id: string
  entity_name: string | null
  details: string | null
  /** R-OPS-06: the screen the change was made on (migration 2026-11-12_audit_log_details.sql) */
  screen?: string | null
  /** R-OPS-06: every changed field, before → after */
  changes?: FieldChange[] | null
}

/** Who changed one record and when (UX-40) — newest first; empty when the audit table is missing */
export async function fetchRecordHistory(entityId: string, limit = 25): Promise<AuditEntry[]> {
  try {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit)
    return error ? [] : ((data ?? []) as AuditEntry[])
  } catch {
    return []
  }
}

const AUDITED_JOB_FIELDS = ['date', 'staff_name', 'start_time', 'end_time', 'duty_hours', 'ot_hours', 'address', 'area', 'charges', 'received', 'payment_mode', 'material', 'service', 'remarks'] as const

/** "charges 200 → 250 · received 0 → 250" for the fields a patch really changes */
export function describeJobChange(before: Record<string, unknown>, patch: Record<string, unknown>): string {
  return changesText(diffRecord(before, patch, AUDITED_JOB_FIELDS))
}

// ── R-OPS-06: full detail of every change ──

/** Fields never written to the log: ids, timestamps, files and photos (large, private) */
const SKIPPED = /^(id|created_at|updated_at|documents|photo|avatar|file_data)$|_file$|_url$|password|secret|token/i
const show = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.length === 0 ? '' : v.every(x => typeof x !== 'object') ? v.join(', ') : `${v.length} item${v.length === 1 ? '' : 's'}`
  try { return JSON.stringify(v) } catch { return String(v) }
}
const short = (s: string) => (s.length > 80 ? `${s.slice(0, 77)}…` : s)
const isFileValue = (s: string) => s.startsWith('data:') || s.startsWith('storage:') || s.length > 2000

/** Each field the patch really changes, before → after (values shortened; files and ids left out) */
export function diffRecord(before: Record<string, unknown> | undefined, patch: Record<string, unknown>, fields?: readonly string[]): FieldChange[] {
  const keys = fields ? fields.filter(k => k in patch) : Object.keys(patch)
  return keys
    .filter(k => !SKIPPED.test(k))
    .map(k => ({ field: k, a: show(before?.[k]), b: show(patch[k]) }))
    .filter(({ a, b }) => a !== b && !isFileValue(a) && !isFileValue(b))
    .map(({ field, a, b }) => ({ field, from: short(a), to: short(b) }))
}

export const changesText = (changes: FieldChange[]) =>
  changes.map(c => `${c.field.replace(/_/g, ' ')} ${c.from || '—'} → ${c.to || '—'}`).join(' · ')

/** Older entries keep the changes only as text — read them back into fields */
export function changesOf(entry: Pick<AuditEntry, 'changes' | 'details' | 'action'>): FieldChange[] {
  if (Array.isArray(entry.changes) && entry.changes.length) return entry.changes
  if (entry.action !== 'updated' && entry.action !== 'status_changed') return []
  const known = AUDITED_JOB_FIELDS.map(f => f.replace(/_/g, ' ')).sort((a, b) => b.length - a.length)
  const clean = (v: string) => (v.trim() === '—' ? '' : v.trim())
  return String(entry.details || '').replace(/\s\[[^\]]+\]$/, '').split(' · ').map(part => {
    const at = part.indexOf(' → ')
    if (at < 0) return null
    const left = part.slice(0, at).trim()
    const to = clean(part.slice(at + 3))
    if (entry.action === 'status_changed') return { field: 'status', from: clean(left), to }
    const field = known.find(k => left === k || left.startsWith(`${k} `))
    return field ? { field: field.replace(/ /g, '_'), from: clean(left.slice(field.length)), to } : null
  }).filter((c): c is FieldChange => Boolean(c))
}

const SCREENS: [RegExp, string][] = [
  [/^\/daily-job-sheet\/spreadsheet/, 'Excel Job Sheet'], [/^\/daily-job-sheet/, 'Daily Job Sheet'],
  [/^\/bookings/, 'Bookings'], [/^\/clients\/[^/]+/, 'Client profile'], [/^\/clients/, 'Clients'],
  [/^\/monthly-clients/, 'Monthly Clients'], [/^\/employees\/[^/]+/, 'Employee profile'], [/^\/employees/, 'Employees'],
  [/^\/agencies/, 'Agencies'], [/^\/invoices/, 'Invoices'], [/^\/monthly-invoices/, 'Monthly Invoices'],
  [/^\/payments/, 'Payments'], [/^\/expenses/, 'Expenses'], [/^\/inventory/, 'Inventory'], [/^\/attendance/, 'Attendance'],
  [/^\/my-duties/, 'My Duties'], [/^\/drivers/, 'Drivers'], [/^\/settings/, 'Settings'], [/^\/fluent-forms/, 'Leads'],
  [/^\/$/, 'Dashboard'],
]
/** "Excel Job Sheet" for /daily-job-sheet/spreadsheet — where a change was made */
export function screenOfPath(pathname: string): string {
  return SCREENS.find(([re]) => re.test(pathname))?.[1] || pathname || ''
}

export interface AuditWrite {
  action: string
  entity: string
  entity_id: string
  entity_name: string
  details?: string | null
  changes?: FieldChange[] | null
  screen?: string | null
}

// Entries are sent in batches (an import adds hundreds of rows at once) and never block or break the app.
let queue: AuditWrite[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let hasDetailColumns = true // false until migration 2026-11-12_audit_log_details.sql has run

export function logAudit(entry: AuditWrite): void {
  try {
    queue.push({ ...entry, screen: entry.screen ?? (typeof window !== 'undefined' ? screenOfPath(window.location.pathname) : '') })
    if (!timer) timer = setTimeout(() => { void flushAudit() }, 1200)
  } catch { /* logging must never break a save */ }
}

export async function flushAudit(): Promise<void> {
  timer = null
  const batch = queue.splice(0)
  if (batch.length === 0) return
  try {
    const { data } = await supabase.auth.getSession()
    const user = data.session?.user?.email ?? 'System'
    const rows = batch.map(e => ({ ...e, user_name: user, details: e.details ?? null, changes: e.changes?.length ? e.changes : null }))
    if (hasDetailColumns) {
      const { error } = await supabase.from('audit_log').insert(rows)
      if (!error) return
      if (!/screen|changes/i.test(error.message || '')) return
      hasDetailColumns = false // the table has the old columns only: keep the detail in the text
    }
    await supabase.from('audit_log').insert(rows.map(({ screen, changes, ...r }) => ({
      ...r,
      details: [r.details, changes?.length && !r.details ? changesText(changes) : '', screen ? `[${screen}]` : ''].filter(Boolean).join(' '),
    })))
  } catch { /* table missing or offline — the change itself is saved */ }
}
